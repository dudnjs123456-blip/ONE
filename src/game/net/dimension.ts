import type { RealtimeChannel } from '@supabase/supabase-js';
import type { DimHit, DimKill, DimMonster, DimState, FieldWorld } from '../core/field';
import type { Account } from './auth';
import { getSupabase } from './supabase';
import { wornList } from '../data/fashion';

/** 움직이는 동안 내 모습을 보내는 간격 (초당 15번) */
const SEND_MS = 66;
/** 가만히 있어도 이 간격으로는 보낸다 */
const IDLE_MS = 1000;
/** 몬스터를 계산하는 사람이 장면을 보내는 간격 (초당 10번) */
const MON_MS = 100;
/** 접속 직후 누가 있는지 기다리는 시간. 안 오면 혼자인 걸로 치고 몬스터를 만든다 */
const READY_MS = 2000;

interface Meta {
  name: string;
  joinedAt: number;
  outfit?: string[];
  body?: string;
}

export type DimStatus = 'off' | 'connecting' | 'online' | 'error';

/**
 * 다른 차원 접속: 차원에 들어온 사람들을 Supabase Realtime 채널 하나로 묶는다.
 * 서울(town:main)과는 다른 채널이라, 차원에 들어간 사람은 서울에서 사라진다.
 * - 누가 있는지 · 언제 들어왔는지: Presence (가장 먼저 들어온 사람이 몬스터를 계산)
 * - 내 모습: 'st', 몬스터 장면: 'mon' (계산 담당만)
 * - 타격: 'hit' (몬스터를 때림 → 계산 담당), 'strike' (몬스터가 때림 → 맞은 사람), 처치: 'kill'
 */
export class DimensionLink {
  status: DimStatus = 'off';
  private ch: RealtimeChannel | null = null;
  private lastSent = -Infinity;
  private lastKey = '';
  private lastMon = 0;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private world: FieldWorld,
    private acc: Account,
  ) {}

  start() {
    const sb = getSupabase();
    if (!sb) {
      this.world.netReady = true;
      return;
    }
    const me = this.acc.userId;
    const w = this.world;
    w.netId = me;
    w.netReady = false;
    this.status = 'connecting';
    const ch = sb.channel('dimension:main', { config: { presence: { key: me }, broadcast: { self: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => this.onPresence())
      .on('broadcast', { event: 'st' }, ({ payload }) => {
        const m = payload as { id: string; s: DimState };
        if (m?.id && m.id !== me) w.applyHunterState(m.id, m.s);
      })
      .on('broadcast', { event: 'mon' }, ({ payload }) => {
        const m = payload as { id: string; ms: DimMonster[] };
        if (!m?.id || m.id === me) return;
        // 내가 계산을 맡고 있으면 무시 (창을 내려 둔 사이엔 받은 장면을 따라 둔다)
        const hidden = typeof document !== 'undefined' && document.hidden;
        if (hidden || !w.isHost) w.applyMonsters(m.ms);
      })
      .on('broadcast', { event: 'hit' }, ({ payload }) => {
        const m = payload as { from: string; h: DimHit };
        if (m?.h?.to === me) w.receiveHunterHit(m.from, m.h);
      })
      .on('broadcast', { event: 'strike' }, ({ payload }) => {
        const m = payload as { from: string; h: DimHit };
        if (m?.h?.to === me) w.receiveStrike(m.h);
      })
      .on('broadcast', { event: 'kill' }, ({ payload }) => {
        const m = payload as { from: string; k: DimKill };
        if (m?.from !== me && m?.k) w.receiveKill(m.k);
      })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          this.status = 'online';
          const pr = w.profile;
          void ch.track({ name: this.acc.username, joinedAt: w.joinedAt, outfit: wornList(pr.wardrobe), body: pr.body } satisfies Meta);
          this.readyTimer = setTimeout(() => (w.netReady = true), READY_MS);
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
          this.status = 'error';
          // 접속이 안 되면 혼자 사냥한다
          w.netReady = true;
        } else if (st === 'CLOSED') this.status = 'off';
      });
  }

  /** 매 화면 프레임: 타격·처치는 바로, 내 모습·몬스터 장면은 정해진 간격으로 */
  tick(now: number) {
    const ch = this.ch;
    const w = this.world;
    if (!ch || this.status !== 'online' || !w.hasCompany) {
      w.hitOut.length = 0;
      w.strikeOut.length = 0;
      w.killOut.length = 0;
      return;
    }
    const me = this.acc.userId;
    for (const h of w.hitOut.splice(0)) void ch.send({ type: 'broadcast', event: 'hit', payload: { from: me, h } });
    for (const h of w.strikeOut.splice(0)) void ch.send({ type: 'broadcast', event: 'strike', payload: { from: me, h } });
    for (const k of w.killOut.splice(0)) void ch.send({ type: 'broadcast', event: 'kill', payload: { from: me, k } });

    if (now - this.lastSent >= SEND_MS) {
      const s = w.netState();
      const key = `${s.x}|${s.z}|${s.y}|${s.fx}|${s.fz}|${s.s}|${s.m}|${s.hp}|${s.mh}|${s.lv}|${s.b ?? ''}|${s.r ?? ''}|${s.w ?? ''}`;
      if (key !== this.lastKey || now - this.lastSent >= IDLE_MS) {
        this.lastKey = key;
        this.lastSent = now;
        void ch.send({ type: 'broadcast', event: 'st', payload: { id: me, s } });
      }
    }
    if (w.isHost && now - this.lastMon >= MON_MS) {
      this.lastMon = now;
      void ch.send({ type: 'broadcast', event: 'mon', payload: { id: me, ms: w.netMonsters() } });
    }
  }

  stop() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    const ch = this.ch;
    this.ch = null;
    if (ch) {
      void ch.untrack();
      void getSupabase()?.removeChannel(ch);
    }
    this.world.netId = null;
    this.status = 'off';
  }

  private onPresence() {
    const ch = this.ch;
    if (!ch) return;
    const w = this.world;
    const state = ch.presenceState<Meta>();
    const seen = new Set<string>();
    for (const [id, metas] of Object.entries(state)) {
      if (id === this.acc.userId) continue;
      const m = metas[metas.length - 1];
      if (!m?.name) continue;
      seen.add(id);
      const outfit = Array.isArray(m.outfit) ? m.outfit.filter((x) => typeof x === 'string').slice(0, 8) : [];
      w.upsertHunter(id, m.name, typeof m.joinedAt === 'number' ? m.joinedAt : Date.now(), outfit, typeof m.body === 'string' ? m.body : undefined);
    }
    for (const id of [...w.hunters.keys()]) if (!seen.has(id)) w.removeHunter(id);
    // 누가 있는지 확인했다. 먼저 온 사람이 있으면 그 사람 장면을 받고, 없으면 내가 몬스터를 만든다
    if (!w.netReady) {
      if (this.readyTimer) clearTimeout(this.readyTimer);
      w.netReady = true;
    }
  }
}
