import type { SupabaseClient } from '@supabase/supabase-js';
import { newProfile, onProfileSaved, type PlayerProfile } from '../core/profile';
import type { Account } from './auth';
import { getSupabase } from './supabase';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'saving' | 'error';

export interface SyncState {
  status: SyncStatus;
  userId: string | null;
  error: string | null;
  lastSaved: number | null;
}

const PUSH_DELAY_MS = 2000;

/** 서버 save(jsonb) 에 넣는 생활 데이터 (컬럼으로 따로 두는 레벨·골드·보스 기록 제외) */
const SAVE_KEYS = ['inventory', 'life', 'jobs', 'time', 'workLog', 'fridge', 'gear', 'casino', 'npcs', 'home'] as const;

/** 어느 쪽이 더 최근 기록인가: 저장 시각이 있으면 시각, 없으면 (level, exp) 진행도 */
function newer(a: PlayerProfile, b: PlayerProfile) {
  if (a.savedAt && b.savedAt && a.savedAt !== b.savedAt) return a.savedAt > b.savedAt;
  return a.level !== b.level ? a.level > b.level : a.exp >= b.exp;
}

/**
 * 두 프로필 합치기 (서버 a, 이 브라우저 b).
 * 최근에 저장한 쪽을 통째로 쓰되, 보스 기록·처치 수처럼 줄어들 수 없는 값은 더 좋은 쪽을 남긴다.
 */
export function mergeProfiles(a: PlayerProfile, b: PlayerProfile): PlayerProfile {
  const main = newer(a, b) ? a : b;
  const bossClears: Record<string, number> = { ...a.bossClears };
  for (const [id, n] of Object.entries(b.bossClears)) bossClears[id] = Math.max(bossClears[id] ?? 0, n);
  const bossBest: Record<string, number> = { ...a.bossBest };
  for (const [id, t] of Object.entries(b.bossBest)) bossBest[id] = Math.min(bossBest[id] ?? Infinity, t);
  return {
    ...main,
    // 생활 데이터가 비어 있는 쪽(예: 예전 서버 기록)이면 다른 쪽 것을 채운다
    ...Object.fromEntries(SAVE_KEYS.map((k) => [k, main[k] ?? (main === a ? b : a)[k]])),
    kills: Math.max(a.kills, b.kills),
    bossClears,
    bossBest,
    savedAt: Math.max(a.savedAt ?? 0, b.savedAt ?? 0) || undefined,
  } as PlayerProfile;
}

/** 프로필 → 서버 save(jsonb) */
export function toSave(p: PlayerProfile): Record<string, unknown> {
  return Object.fromEntries(SAVE_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
}

/**
 * 프로필 클라우드 저장 (Supabase).
 * - 익명 로그인으로 계정을 만들고, 나중에 구글·카카오 계정에 연결할 수 있다
 * - 처음 접속 시 서버에 기록이 없으면 이 브라우저의 기록을 그대로 올린다 (마이그레이션)
 * - 이후엔 saveProfile() 이 불릴 때마다 잠깐 모았다가 서버에 저장
 *
 * ※ 지금은 클라이언트가 직접 쓰는 단계라 조작이 가능하다. 게임 서버(검증)가 생기면 서버만 쓰게 바꾼다.
 */
export class CloudSave {
  state: SyncState = { status: 'offline', userId: null, error: null, lastSaved: null };
  private sb: SupabaseClient | null = getSupabase();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PlayerProfile | null = null;
  private lastPushed = '';
  private listeners = new Set<(s: SyncState) => void>();
  private unsubscribe: (() => void) | null = null;
  /** 로그인 아이디 (profiles.nickname 에 함께 저장) */
  private username = '';

  get enabled() {
    return !!this.sb;
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /**
   * 로그인한 계정의 기록을 서버에서 받아 온다 (서버가 기준).
   * @param cached 이 브라우저에 남아 있던 이 계정의 기록 (저장이 덜 올라갔을 수 있어 최신 쪽과 합친다)
   * @param legacy 로그인 기능 전 이 브라우저 기록 — 서버에 아직 기록이 없는 새 계정이면 이걸로 시작
   */
  async initAccount(acc: Account, cached: PlayerProfile | null, legacy: PlayerProfile | null): Promise<PlayerProfile> {
    const sb = this.sb;
    const fallback = cached ?? legacy ?? newProfile();
    if (!sb) return fallback;
    this.username = acc.username;
    this.set({ status: 'connecting', error: null, userId: acc.userId });
    try {
      const remote = await this.pull(acc.userId);
      // 서버에 행은 있지만 아직 게임 기록을 올린 적이 없으면 (가입만 한 계정) 새 계정처럼 이 브라우저 기록으로 시작
      const empty = !!remote && remote.savedAt === undefined && remote.level === 1 && remote.exp === 0;
      const profile = remote && !empty ? (cached ? mergeProfiles(remote, cached) : remote) : remote ? mergeProfiles(remote, fallback) : fallback;
      if (!remote || JSON.stringify(profile) !== JSON.stringify(remote)) await this.push(profile, true);
      else this.lastPushed = JSON.stringify(profile);
      this.unsubscribe?.();
      this.unsubscribe = onProfileSaved((p) => this.schedule(p));
      this.set({ status: 'synced', lastSaved: Date.now() });
      return profile;
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return fallback;
    }
  }

  /** 로그아웃: 남은 저장을 보내고 연결을 끊는다 */
  async reset() {
    await this.flush();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastPushed = '';
    this.username = '';
    this.set({ status: 'offline', userId: null, error: null, lastSaved: null });
  }

  /** 변경을 잠깐 모았다가 저장 */
  schedule(p: PlayerProfile) {
    if (!this.sb || !this.state.userId) return;
    this.pending = p;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS);
  }

  /** 대기 중인 저장을 바로 보낸다 (탭 닫기 직전 등) */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const p = this.pending;
    this.pending = null;
    if (p) await this.push(p);
  }

  dispose() {
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
  }

  // ───────────────────────── 내부 ─────────────────────────

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async pull(userId: string): Promise<PlayerProfile | null> {
    const sb = this.sb!;
    const { data: row, error } = await sb.from('profiles').select('level, exp, gold, kills, save, saved_at').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const { data: clears, error: e2 } = await sb.from('boss_clears').select('boss_id, clears, best_time').eq('user_id', userId);
    if (e2) throw e2;
    const bossClears: Record<string, number> = {};
    const bossBest: Record<string, number> = {};
    for (const c of clears ?? []) {
      bossClears[c.boss_id] = c.clears;
      if (c.best_time) bossBest[c.boss_id] = c.best_time;
    }
    const save = (row.save ?? {}) as Partial<PlayerProfile>;
    return {
      inventory: {},
      life: { fatigue: 20, hunger: 30 },
      ...save,
      level: row.level,
      exp: row.exp,
      gold: Number(row.gold),
      kills: row.kills,
      bossClears,
      bossBest,
      // 예전 기록(save 가 빈 것)은 시각 비교 대신 진행도로 비교하게 둔다
      savedAt: Object.keys(save).length ? new Date(row.saved_at).getTime() : undefined,
    };
  }

  private async push(p: PlayerProfile, rethrow = false) {
    const sb = this.sb;
    const userId = this.state.userId;
    if (!sb || !userId) return;
    const snapshot = JSON.stringify(p);
    if (snapshot === this.lastPushed) return;
    this.set({ status: 'saving' });
    try {
      const { error } = await sb
        .from('profiles')
        .upsert({
          id: userId,
          ...(this.username ? { nickname: this.username } : {}),
          level: p.level,
          exp: p.exp,
          gold: Math.max(0, Math.floor(p.gold)),
          kills: p.kills,
          save: toSave(p),
          saved_at: new Date(p.savedAt ?? Date.now()).toISOString(),
        });
      if (error) throw error;
      const rows = Object.entries(p.bossClears).map(([bossId, clears]) => ({
        user_id: userId,
        boss_id: bossId,
        clears,
        best_time: p.bossBest[bossId] ?? null,
        last_cleared_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error: e2 } = await sb.from('boss_clears').upsert(rows);
        if (e2) throw e2;
      }
      this.lastPushed = snapshot;
      this.set({ status: 'synced', error: null, lastSaved: Date.now() });
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      if (rethrow) throw e;
    }
  }
}

export const cloudSave = new CloudSave();
