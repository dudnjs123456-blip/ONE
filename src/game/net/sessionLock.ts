import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Account } from './auth';

/**
 * 한 아이디는 한 창에서만 접속: 서버(실시간 presence)에 '지금 이 아이디로 접속한 창' 을 올려 두고,
 * 이미 다른 창이 있으면 새 창은 들어가지 못한다. '여기서 접속하기' 를 고르면 먼저 있던 창을 끊는다.
 * 새로고침은 같은 창(탭마다 하나인 id, sessionStorage)으로 보고 막지 않는다.
 */

type Meta = { tab: string; since: number };
export type LockResult = 'ok' | 'busy';

const TAB_KEY = 'ironfist:tab';
/** 서버 응답을 기다리는 최대 시간 (서버가 안 되면 그냥 들여보낸다) */
const WAIT_MS = 3500;

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 이 탭의 id. 새로고침해도 같고, 탭을 복제하면 아래에서 새로 만든다 */
function readTabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return newId();
  }
}

/** 탭 복제(sessionStorage 까지 복사됨)로 같은 id 가 둘이면 새로 만든다 */
async function uniqueTabId(): Promise<string> {
  let id = readTabId();
  if (typeof BroadcastChannel === 'undefined') return id;
  const bc = new BroadcastChannel('ironfist:tabs');
  const clash = await new Promise<boolean>((res) => {
    const t = setTimeout(() => res(false), 150);
    bc.onmessage = (e) => {
      if (e.data?.type === 'here' && e.data.id === id) {
        clearTimeout(t);
        res(true);
      }
    };
    bc.postMessage({ type: 'who', id });
  });
  if (clash) {
    id = newId();
    try {
      sessionStorage.setItem(TAB_KEY, id);
    } catch {
      /* 저장 못 하면 이번만 쓰는 id */
    }
  }
  // 이후 다른 탭이 같은 id 를 물으면 '나 여기 있어' 라고 답한다
  bc.onmessage = (e) => {
    if (e.data?.type === 'who' && e.data.id === id) bc.postMessage({ type: 'here', id });
  };
  return id;
}

class SessionLock {
  private ch: RealtimeChannel | null = null;
  private tab = '';
  private since = 0;
  private tracked = false;
  /** 내가 끊어 달라고 한 창들 (나가는 중이라 아직 남아 있어도 무시) */
  private kickedTabs = new Set<string>();
  /** 다른 창이 '여기서 접속하기' 로 나를 끊었을 때 (저장을 마칠 때까지 기다린 뒤 자리를 비운다) */
  onKicked: (() => Promise<void> | void) | null = null;

  /** 같은 아이디로 접속한 다른 창 */
  private others(): Meta[] {
    if (!this.ch) return [];
    const st = this.ch.presenceState<Meta>();
    return Object.entries(st)
      .filter(([k]) => k !== this.tab && !this.kickedTabs.has(k))
      .flatMap(([, v]) => v);
  }

  /**
   * 접속 자리 잡기. 다른 창이 이미 있으면 'busy' (takeOver 로 빼앗을 수 있다).
   * 서버가 없거나 응답이 없으면 'ok' (게임은 막지 않는다)
   */
  async claim(acc: Account): Promise<LockResult> {
    const sb = getSupabase();
    if (!sb) return 'ok';
    await this.release();
    this.tab = await uniqueTabId();
    const ch = sb.channel(`session:${acc.userId}`, { config: { presence: { key: this.tab }, broadcast: { self: false } } });
    this.ch = ch;
    let synced = false;
    const ready = new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), WAIT_MS);
      ch.on('presence', { event: 'sync' }, () => {
        if (!synced) {
          synced = true;
          clearTimeout(t);
          res(true);
        }
        this.checkDuplicate();
      });
    });
    ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload?.tab !== this.tab && this.tracked) this.kicked();
    });
    ch.subscribe();
    const ok = await ready;
    if (!ok) return 'ok'; // 서버가 느리거나 안 되면 들여보낸다
    if (this.others().length) return 'busy';
    await this.track();
    return 'ok';
  }

  /** 먼저 접속해 있던 창을 끊고 여기서 접속한다 */
  async takeOver(): Promise<void> {
    const ch = this.ch;
    if (!ch) return;
    const old = this.others().map((o) => o.tab);
    await ch.send({ type: 'broadcast', event: 'kick', payload: { tab: this.tab } });
    // 먼저 있던 창이 기록을 저장하고 나갈 때까지 잠깐 기다린다
    const end = Date.now() + 5000;
    while (this.others().length && Date.now() < end) await new Promise((r) => setTimeout(r, 150));
    for (const t of old) this.kickedTabs.add(t);
    await this.track();
  }

  private async track() {
    this.since = Date.now();
    this.tracked = true;
    await this.ch?.track({ tab: this.tab, since: this.since } satisfies Meta);
  }

  /** 동시에 들어와서 둘 다 자리를 잡았으면 늦게 들어온 쪽이 물러난다 */
  private checkDuplicate() {
    if (!this.tracked) return;
    const earlier = this.others().some((o) => o.since < this.since || (o.since === this.since && o.tab < this.tab));
    if (earlier) this.kicked();
  }

  private kicked() {
    this.tracked = false;
    const ch = this.ch;
    void Promise.resolve(this.onKicked?.())
      .catch(() => {})
      .then(() => ch?.untrack());
  }

  /** 로그아웃·창 닫기: 자리를 비운다 */
  async release() {
    const ch = this.ch;
    this.ch = null;
    this.tracked = false;
    this.kickedTabs.clear();
    if (!ch) return;
    try {
      await ch.untrack();
    } catch {
      /* 이미 끊겼으면 그만 */
    }
    void getSupabase()?.removeChannel(ch);
  }
}

export const sessionLock = new SessionLock();
