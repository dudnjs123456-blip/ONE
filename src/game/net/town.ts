import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CityWorld, NetHit, NetState } from '../city/cityWorld';
import { saveProfile } from '../core/profile';
import type { Account } from './auth';
import { getSupabase } from './supabase';

/** 움직이는 동안 내 모습을 보내는 간격 (초당 15번) */
const SEND_MS = 66;
/** 가만히 있을 때도 이 간격으로는 보낸다 (늦게 들어온 친구가 바로 보이게) */
const IDLE_MS = 1000;
/** 친구와의 왕복 시간(핑)을 재는 간격 */
const PING_MS = 3000;

interface Meta {
  name: string;
  unit: string;
  claimedAt: number;
}

export type TownStatus = 'off' | 'connecting' | 'online' | 'error';

/**
 * 마을 접속: 같은 사이트에 들어온 사람들을 Supabase Realtime 채널 하나로 묶는다.
 * - 누가 접속해 있고 몇 호에 사는지: Presence
 * - 위치·동작·체력: Broadcast (혼자 있으면 보내지 않는다)
 * - 타격: 때린 쪽이 판정해서 맞은 사람에게 알리고, 맞은 쪽이 자기 체력에서 뺀다
 */
export class TownLink {
  status: TownStatus = 'off';
  /** 친구와 주고받는 왕복 시간 (내 컴퓨터 → Supabase → 친구 컴퓨터 → 다시 나). 혼자면 null */
  ping: number | null = null;
  private ch: RealtimeChannel | null = null;
  private others = new Map<string, Meta>();
  private lastSent = -Infinity;
  private lastKey = '';
  private lastPing = 0;
  private synced = false;
  private trackedUnit: string | null = null;
  private claimTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private world: CityWorld,
    private acc: Account,
  ) {}

  /** 접속한 친구 이름들 */
  get friends(): string[] {
    return [...this.others.values()].map((m) => m.name);
  }

  start() {
    const sb = getSupabase();
    if (!sb) return;
    const me = this.acc.userId;
    this.world.netId = me;
    this.world.netName = this.acc.username;
    this.status = 'connecting';
    const ch = sb.channel('town:main', { config: { presence: { key: me }, broadcast: { self: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => this.onPresence())
      .on('broadcast', { event: 'st' }, ({ payload }) => {
        const m = payload as { id: string; s: NetState };
        if (m.id !== me) this.world.applyRemoteState(m.id, m.s);
      })
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        const m = payload as { from: string; h: NetHit };
        if (m.h.to === me) this.world.receiveRemoteHit(m.from, m.h);
      })
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        const m = payload as { from: string; t: number };
        if (m.from !== me) void ch.send({ type: 'broadcast', event: 'pong', payload: { to: m.from, t: m.t } });
      })
      .on('broadcast', { event: 'pong' }, ({ payload }) => {
        const m = payload as { to: string; t: number };
        if (m.to !== me) return;
        // 이상한 값(음수·10초 이상)은 버린다
        const d = performance.now() - m.t;
        if (d >= 0 && d < 10000) this.ping = d;
      })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          this.status = 'online';
          // 이미 있는 사람 목록(첫 sync)을 받은 뒤 집을 정한다. 안 오면 잠시 뒤 그냥 정한다
          this.claimTimer = setTimeout(() => void this.claimHome(), 1500);
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') this.status = 'error';
        else if (st === 'CLOSED') this.status = 'off';
      });
  }

  /** 매 화면 프레임: 타격은 바로, 내 모습은 정해진 간격으로 보낸다 */
  tick(now: number) {
    const ch = this.ch;
    const w = this.world;
    if (!ch || this.status !== 'online') {
      w.outbox.length = 0;
      return;
    }
    for (const h of w.outbox.splice(0)) void ch.send({ type: 'broadcast', event: 'hit', payload: { from: this.acc.userId, h } });
    // 혼자면 아무것도 보내지 않는다 (메시지 사용량 절약)
    if (!this.others.size) {
      this.ping = null;
      return;
    }
    if (now - this.lastSent >= SEND_MS) {
      const s = w.netState();
      // 동작 프레임(f)은 매번 바뀌므로 빼고 비교한다
      const key = `${s.r}|${s.x}|${s.z}|${s.y}|${s.fx}|${s.fz}|${s.s}|${s.m}|${s.hp}|${s.mh}`;
      if (key !== this.lastKey || now - this.lastSent >= IDLE_MS) {
        this.lastKey = key;
        this.lastSent = now;
        void ch.send({ type: 'broadcast', event: 'st', payload: { id: this.acc.userId, s } });
      }
    }
    if (now - this.lastPing >= PING_MS) {
      this.lastPing = now;
      void ch.send({ type: 'broadcast', event: 'ping', payload: { from: this.acc.userId, t: now } });
    }
  }

  stop() {
    if (this.claimTimer) clearTimeout(this.claimTimer);
    const ch = this.ch;
    this.ch = null;
    if (ch) {
      void ch.untrack();
      void getSupabase()?.removeChannel(ch);
    }
    this.world.netId = null;
    this.world.netName = null;
    this.status = 'off';
  }

  // ───────────────────────── 내부 ─────────────────────────

  private onPresence() {
    const ch = this.ch;
    if (!ch) return;
    const state = ch.presenceState<Meta>();
    const seen = new Set<string>();
    for (const [id, metas] of Object.entries(state)) {
      if (id === this.acc.userId) continue;
      const m = metas[metas.length - 1];
      if (!m?.name) continue;
      seen.add(id);
      this.others.set(id, { name: m.name, unit: m.unit, claimedAt: m.claimedAt });
      this.world.upsertRemote(id, m.name, m.unit);
    }
    for (const id of [...this.others.keys()]) {
      if (seen.has(id)) continue;
      this.others.delete(id);
      this.world.removeRemote(id);
    }
    if (!this.synced) {
      this.synced = true;
      if (this.claimTimer) clearTimeout(this.claimTimer);
    }
    void this.claimHome();
  }

  /**
   * 내 집 정하기: 처음이면 접속한 친구들이 안 쓰는 집 중 첫 번째(302호부터).
   * 같은 집을 쓰는 친구가 있으면, 늦게 받은 쪽이 비어 있는 다른 집으로 옮긴다.
   */
  private async claimHome() {
    const ch = this.ch;
    if (!ch || this.status !== 'online') return;
    const pr = this.world.profile;
    const me = this.acc.userId;
    let home = pr.home;
    const clash =
      !!home &&
      [...this.others].some(([id, m]) => m.unit === home!.unit && (m.claimedAt < home!.claimedAt || (m.claimedAt === home!.claimedAt && id < me)));
    if (!home || clash) {
      const used = new Set([...this.others.values()].map((m) => m.unit));
      const units = this.world.allUnits;
      const unit = units.find((u) => !used.has(u)) ?? units[0];
      const old = home?.unit;
      home = { unit, claimedAt: Date.now() };
      pr.home = home;
      saveProfile(pr);
      if (old) this.world.say(`🏠 ${old}호에 먼저 살던 친구가 있어서 내 집이 ${unit}호로 바뀌었어요`, 5);
    }
    if (this.trackedUnit === home.unit) return;
    this.trackedUnit = home.unit;
    await ch.track({ name: this.acc.username, unit: home.unit, claimedAt: home.claimedAt });
  }
}
