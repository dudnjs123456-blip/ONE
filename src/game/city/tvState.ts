/** 거실 TV 에서 틀고 있는 유튜브 영상 (화면·렌더러가 같이 본다). 게임 저장에는 넣지 않는다 */
export interface TvVideo {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

/** 같은 집에 있는 친구와 주고받는 TV 상태 */
export interface TvNet {
  /** 어느 집 TV 인가 (roomKey) */
  room: string;
  v: TvVideo | null;
  /** 지금 재생 위치 (초) */
  pos: number;
  paused: boolean;
  /** 마지막으로 바꾼 시각 (Date.now). 더 나중에 바꾼 쪽을 따른다 */
  ch: number;
}

/**
 * TV 상태: 같은 집에 있으면 모두 같은 영상을 같은 위치에서 본다.
 * 재생 위치는 '0초였던 시각(startAt)'으로 들고 있어서, 시간이 지나도 따로 셀 필요가 없다.
 */
export const tvState = {
  now: null as TvVideo | null,
  /** 영상 0초였던 시각 (Date.now 기준) */
  startAt: 0,
  /** 멈춰 있으면 멈춘 위치 (초), 재생 중이면 null */
  pausedAt: null as number | null,
  /** 마지막으로 바꾼 시각 (친구와 겹치면 늦게 바꾼 쪽을 따른다) */
  changeAt: 0,
  /** 바뀔 때마다 1씩 (화면이 보고 따라 바꾼다) */
  rev: 0,
  /** 내가 바꿔서 친구에게 알려야 한다 */
  dirty: false,
};

/** 지금 재생 위치 (초) */
export function tvPos(): number {
  return tvState.pausedAt ?? Math.max(0, (Date.now() - tvState.startAt) / 1000);
}

/** 내가 리모컨으로 영상을 틀거나 껐다 (친구에게도 알린다) */
export function tvPlay(v: TvVideo | null) {
  tvState.now = v;
  tvState.startAt = Date.now();
  tvState.pausedAt = null;
  tvState.changeAt = Date.now();
  tvState.dirty = true;
  tvState.rev++;
}

/** 내가 멈추거나 다시 틀었다 */
export function tvSetPaused(paused: boolean) {
  if (!tvState.now || paused === (tvState.pausedAt !== null)) return;
  const pos = tvPos();
  tvState.pausedAt = paused ? pos : null;
  if (!paused) tvState.startAt = Date.now() - pos * 1000;
  tvState.changeAt = Date.now();
  tvState.dirty = true;
  tvState.rev++;
}

/** 집을 나가서 TV 를 끈다 (친구에게 알리지 않는다: 남은 사람은 계속 본다) */
export function tvReset() {
  if (!tvState.now && !tvState.changeAt) return;
  tvState.now = null;
  tvState.pausedAt = null;
  tvState.changeAt = 0;
  tvState.dirty = false;
  tvState.rev++;
}

/** 친구에게 보낼 지금 TV 상태 */
export function tvNet(room: string): TvNet {
  return { room, v: tvState.now, pos: Math.round(tvPos() * 10) / 10, paused: tvState.pausedAt !== null, ch: tvState.changeAt };
}

/**
 * 친구가 보낸 TV 상태. 더 나중에 바꾼 것이면 따르고, 같은 것이면 위치만 맞춘다 (2초 넘게 어긋났을 때).
 * @param lag 보내고 받기까지 걸렸을 시간 (초)
 */
export function tvApplyRemote(m: TvNet, lag: number) {
  if (m.ch < tvState.changeAt) return;
  const pos = m.paused ? m.pos : m.pos + lag;
  const same = m.ch === tvState.changeAt && m.v?.id === tvState.now?.id && m.paused === (tvState.pausedAt !== null);
  if (same && Math.abs(pos - tvPos()) < 2) return;
  tvState.now = m.v;
  tvState.pausedAt = m.paused ? pos : null;
  tvState.startAt = Date.now() - pos * 1000;
  tvState.changeAt = m.ch;
  tvState.dirty = false;
  tvState.rev++;
}

/** 유튜브 주소(또는 영상 id)에서 영상 id 를 뽑는다. 아니면 null */
export function videoIdOf(text: string): string | null {
  const s = text.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
