/**
 * 집안일: 샤워 · 양치 · 설거지 · 빨래(세탁기 → 꺼내기 → 건조대에 널기 → 마르면 개기).
 *
 * - 시간은 모두 실제 시각(nowMs)으로 흐른다: 세탁기는 창을 닫아도 계속 돌고, 빨래도 그동안 마른다.
 * - 동작 하나(choreFrame)는 프레임 단위 단계로 나뉘고, 화면(자세·물줄기·그릇)과 로직(진행·결과)이 같은 표를 쓴다.
 * - 상태는 profile.chores 에 저장되고, 내 집에 있을 땐 친구에게도 보내 같은 집 모습을 본다.
 */

/** 저장되는 집안 상태 */
export interface ChoreState {
  /** 싱크대에 쌓인 더러운 그릇 */
  dishes: number;
  /** 건조대에 엎어 둔 씻은 그릇 (일정 시간 뒤 찬장에 정리된다) */
  clean: number;
  /** 씻은 그릇을 마지막으로 올린 실제 시각 */
  cleanAt: number;
  /** 빨래 바구니에 쌓인 입은 옷 */
  hamper: number;
  /** 빨래가 저절로 쌓이는 계산의 기준 실제 시각 */
  hamperAt: number;
  /** 세탁기: 넣은 벌 수와 돌리기 시작한 실제 시각 (비어 있으면 null) */
  washer: { n: number; at: number } | null;
  /** 세탁기에서 꺼낸 젖은 빨래 (세탁기 옆 바구니) */
  wet: number;
  /** 건조대에 넌 빨래와 다 넌 실제 시각 */
  rack: { n: number; at: number } | null;
}

export type ChoreKind = 'shower' | 'brush' | 'dishes' | 'load' | 'unload' | 'hang' | 'fold';

/** 진행 중인 동작 */
export interface ChoreAction {
  kind: ChoreKind;
  /** 시작한 프레임 */
  at: number;
  /** 처리할 개수 (그릇·옷). 샤워·양치·넣기·꺼내기는 한 번에 끝나는 동작이라 1 */
  n: number;
  /** 지금까지 끝낸 개수 */
  done: number;
}

const MIN = 60 * 1000;
/** 세탁기 한 번 돌리는 데 걸리는 실제 시간 */
export const WASH_MS = 12 * MIN;
/** 건조대에서 마르는 데 걸리는 실제 시간 */
export const DRY_MS = 40 * MIN;
/** 건조대의 씻은 그릇은 이만큼 지나면 찬장에 정리된다 */
export const CLEAN_DISH_MS = 60 * MIN;
/** 입은 옷이 저절로 한 벌 쌓이는 간격 (실제 시간) */
export const HAMPER_EVERY_MS = 3 * 60 * MIN;
export const MAX_DISHES = 8;
export const MAX_HAMPER = 12;
/** 세탁기 한 번에 넣는 최대 벌 수 */
export const WASH_LOAD = 8;
/** 빨래 바구니가 이만큼 차면 입을 옷이 없어 금방 꿉꿉해진다 */
export const HAMPER_FULL = 9;

export function newChores(now: number): ChoreState {
  return { dishes: 2, clean: 0, cleanAt: 0, hamper: 3, hamperAt: now, washer: null, wet: 0, rack: null };
}

/** 예전 저장(필드가 없던 때)도 받아 들인다 */
export function normalizeChores(c: Partial<ChoreState> | undefined, now: number): ChoreState {
  const base = newChores(now);
  if (!c) return base;
  const num = (v: unknown, d: number, max = 99) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : d);
  const stamp = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    dishes: num(c.dishes, base.dishes, MAX_DISHES),
    clean: num(c.clean, 0, 12),
    cleanAt: stamp(c.cleanAt, 0),
    hamper: num(c.hamper, base.hamper, MAX_HAMPER),
    hamperAt: stamp(c.hamperAt, now),
    washer: c.washer && typeof c.washer.at === 'number' ? { n: num(c.washer.n, 1, WASH_LOAD), at: c.washer.at } : null,
    wet: num(c.wet, 0, WASH_LOAD),
    rack: c.rack && typeof c.rack.at === 'number' ? { n: num(c.rack.n, 1, WASH_LOAD), at: c.rack.at } : null,
  };
}

/** 시간이 흐르며 생기는 변화 (입은 옷이 쌓이고, 다 마른 그릇은 정리된다). 바뀌었으면 true */
export function advanceChores(c: ChoreState, now: number): boolean {
  let changed = false;
  if (now - c.hamperAt >= HAMPER_EVERY_MS) {
    const k = Math.floor((now - c.hamperAt) / HAMPER_EVERY_MS);
    c.hamper = Math.min(MAX_HAMPER, c.hamper + k);
    c.hamperAt += k * HAMPER_EVERY_MS;
    changed = true;
  }
  if (c.clean > 0 && now - c.cleanAt >= CLEAN_DISH_MS) {
    c.clean = 0;
    changed = true;
  }
  return changed;
}

export type WasherPhase = 'empty' | 'running' | 'done';
export function washerPhase(c: ChoreState, now: number): WasherPhase {
  if (!c.washer) return 'empty';
  return now - c.washer.at >= WASH_MS ? 'done' : 'running';
}
/** 남은 세탁 시간 (ms) */
export function washLeft(c: ChoreState, now: number): number {
  return c.washer ? Math.max(0, c.washer.at + WASH_MS - now) : 0;
}
/** 세탁기 단계: 불림 → 세탁 → 헹굼 → 탈수 (드럼 도는 빠르기·소리가 달라진다) */
export function washStage(c: ChoreState, now: number): 'soak' | 'wash' | 'rinse' | 'spin' | null {
  if (!c.washer || washerPhase(c, now) !== 'running') return null;
  const u = (now - c.washer.at) / WASH_MS;
  return u < 0.12 ? 'soak' : u < 0.55 ? 'wash' : u < 0.78 ? 'rinse' : 'spin';
}

export type RackPhase = 'empty' | 'drying' | 'dry';
export function rackPhase(c: ChoreState, now: number): RackPhase {
  if (!c.rack) return 'empty';
  return now - c.rack.at >= DRY_MS ? 'dry' : 'drying';
}
/** 빨래가 마른 정도 0(흠뻑) ~ 1(바싹) */
export function dryness(c: ChoreState, now: number): number {
  return c.rack ? Math.min(1, Math.max(0, (now - c.rack.at) / DRY_MS)) : 0;
}

export function minutesLabel(ms: number): string {
  const m = Math.ceil(ms / MIN);
  return m >= 1 ? `${m}분` : '곧';
}

// ───────────────────────── 동작 하나의 단계 ─────────────────────────

/** 단계 이름: 화면 자세·소품이 이것을 보고 그린다 */
export type ChoreStep =
  | 'walk' // 자리로 들어간다
  | 'valve' // 물을 튼다 / 잠근다
  | 'hair' // 머리를 감는다
  | 'body' // 몸을 문지른다
  | 'rinse' // 헹군다 (샤워: 얼굴을 들고 물을 맞는다)
  | 'towel' // 수건으로 머리를 닦는다
  | 'brush' // 칫솔질
  | 'spit' // 입을 헹구고 뱉는다
  | 'pick' // 싱크대·바구니에서 집어 든다
  | 'scrub' // 수세미로 문지른다
  | 'wash' // 그릇을 물에 헹군다
  | 'place' // 건조대에 올린다 / 넌다
  | 'door' // 세탁기 문을 연다·닫는다
  | 'stuff' // 세탁기에 넣는다 / 꺼낸다
  | 'press' // 버튼을 누른다
  | 'hang' // 건조대에 넌다
  | 'fold'; // 갠다

/** 동작 길이 (프레임). 그릇·옷은 한 개당 */
export const CHORE_FRAMES: Record<ChoreKind, number> = {
  shower: 960,
  brush: 420,
  dishes: 150,
  load: 220,
  unload: 180,
  hang: 80,
  fold: 60,
};

/** 동작 전체 길이 (프레임) */
export function choreLength(a: Pick<ChoreAction, 'kind' | 'n'>): number {
  const per = CHORE_FRAMES[a.kind];
  return a.kind === 'dishes' || a.kind === 'hang' || a.kind === 'fold' ? per * Math.max(1, a.n) : per;
}

export interface ChoreFrame {
  step: ChoreStep;
  /** 이 단계 안에서의 진행 0~1 */
  k: number;
  /** 지금 처리 중인 그릇·옷 번호 (0부터) */
  item: number;
  /** 물이 나오는 중 (샤워기·수도꼭지) */
  water: boolean;
  /** 손에 든 것 */
  hold: 'dish' | 'towel' | 'brush' | 'cloth' | null;
}

const seq = (t: number, steps: [ChoreStep, number][]): { step: ChoreStep; k: number } => {
  let s = 0;
  for (const [step, len] of steps) {
    if (t < s + len) return { step, k: (t - s) / len };
    s += len;
  }
  const last = steps[steps.length - 1];
  return { step: last[0], k: 1 };
};

/** 동작을 시작한 지 t 프레임째의 단계 */
export function choreFrame(kind: ChoreKind, t: number): ChoreFrame {
  const per = CHORE_FRAMES[kind];
  const item = kind === 'dishes' || kind === 'hang' || kind === 'fold' ? Math.floor(t / per) : 0;
  const u = kind === 'dishes' || kind === 'hang' || kind === 'fold' ? t - item * per : t;
  switch (kind) {
    case 'shower': {
      const s = seq(u, [['walk', 40], ['valve', 40], ['hair', 330], ['body', 250], ['rinse', 140], ['valve', 40], ['towel', 120]]);
      return { ...s, item, water: u >= 60 && u < 820, hold: s.step === 'towel' ? 'towel' : null };
    }
    case 'brush': {
      const s = seq(u, [['walk', 25], ['brush', 300], ['spit', 95]]);
      return { ...s, item, water: s.step === 'spit', hold: s.step === 'walk' ? null : 'brush' };
    }
    case 'dishes': {
      const s = seq(u, [['pick', 25], ['scrub', 60], ['wash', 40], ['place', 25]]);
      return { ...s, item, water: s.step === 'wash', hold: 'dish' };
    }
    case 'load':
    case 'unload': {
      const s = seq(u, kind === 'load' ? [['door', 30], ['stuff', 120], ['door', 30], ['press', 40]] : [['door', 30], ['stuff', 120], ['door', 30]]);
      return { ...s, item, water: false, hold: s.step === 'stuff' ? 'cloth' : null };
    }
    case 'hang': {
      const s = seq(u, [['pick', 30], ['hang', 40], ['place', 10]]);
      return { ...s, item, water: false, hold: s.step === 'place' ? null : 'cloth' };
    }
    case 'fold': {
      const s = seq(u, [['pick', 15], ['fold', 45]]);
      return { ...s, item, water: false, hold: 'cloth' };
    }
  }
}

/** 동작을 하는 자리와 바라보는 방향 (집 좌표) */
export const CHORE_SPOTS: Record<ChoreKind, { x: number; z: number; fx: number; fz: number }> = {
  // 샤워 부스 안, 샤워기(동쪽)를 본다
  shower: { x: -1.38, z: 2.72, fx: 1, fz: 0 },
  // 화장실 세면대 앞 (세면대는 서쪽 벽)
  brush: { x: -2.2, z: 3.3, fx: -1, fz: 0 },
  // 부엌 싱크대 앞 (서쪽 벽)
  dishes: { x: -3.86, z: -1.03, fx: -1, fz: 0 },
  // 세탁기 앞 (서쪽 벽)
  load: { x: -3.9, z: 0.83, fx: -1, fz: 0 },
  unload: { x: -3.9, z: 0.83, fx: -1, fz: 0 },
  // 거실 남쪽 벽 빨래 건조대 앞 (건조대를 본다)
  hang: { x: 0.6, z: 2.7, fx: 0, fz: 1 },
  fold: { x: 0.6, z: 2.7, fx: 0, fz: 1 },
};

/** 동작을 마치며(또는 중간에 그만두며) 결과를 집 상태에 반영한다. @returns 끝낸 개수 */
export function applyChoreProgress(c: ChoreState, a: ChoreAction, t: number, now: number): number {
  const per = CHORE_FRAMES[a.kind];
  // 그릇·옷은 한 개씩 끝날 때마다 반영
  if (a.kind === 'dishes' || a.kind === 'hang' || a.kind === 'fold') {
    const finished = Math.min(a.n, Math.floor(t / per));
    const fresh = finished - a.done;
    if (fresh <= 0) return 0;
    a.done = finished;
    if (a.kind === 'dishes') {
      c.dishes = Math.max(0, c.dishes - fresh);
      c.clean = Math.min(12, c.clean + fresh);
      c.cleanAt = now;
    } else if (a.kind === 'hang') {
      c.wet = Math.max(0, c.wet - fresh);
      // 마지막 한 벌을 넌 시각부터 마른다 (더 널면 그만큼 늦게 마른다)
      c.rack = { n: (c.rack?.n ?? 0) + fresh, at: now };
    } else {
      const left = (c.rack?.n ?? 0) - fresh;
      c.rack = left > 0 ? { n: left, at: c.rack!.at } : null;
    }
    return fresh;
  }
  if (a.done || t < per) return 0;
  a.done = 1;
  if (a.kind === 'load') {
    const n = Math.min(WASH_LOAD, c.hamper);
    c.hamper -= n;
    c.washer = { n, at: now };
    return n;
  }
  if (a.kind === 'unload') {
    const n = c.washer?.n ?? 0;
    c.wet = Math.min(WASH_LOAD, c.wet + n);
    c.washer = null;
    return n;
  }
  return 1;
}

// ───────────────────────── 더러움 (땀·먼지) ─────────────────────────

/** 가만히 있어도 실제 10시간이면 100 */
export const DIRT_PER_FRAME = 100 / (10 * 60 * 60 * 60);
/** 이보다 더러우면 냄새가 나고 경고 */
export const DIRTY = 80;

/** 더러움이 쌓이는 배율: 활동량(0~1)이 높을수록, 입을 옷이 없을수록 빨리 */
export function dirtRate(activity: number, hamper: number): number {
  return (1 + 2 * activity) * (hamper >= HAMPER_FULL ? 1.5 : 1);
}

/** 샤워 중 단계에 따라 씻겨 나간 비율 (0 → 1) */
export function showerClean(t: number): number {
  const f = choreFrame('shower', t);
  if (t >= CHORE_FRAMES.shower) return 1;
  if (f.step === 'hair') return 0.4 * f.k;
  if (f.step === 'body') return 0.4 + 0.4 * f.k;
  if (f.step === 'rinse') return 0.8 + 0.2 * f.k;
  if (f.step === 'valve' && t > 400) return 1;
  if (f.step === 'towel') return 1;
  return 0;
}

// ───────────────────────── 네트워크 (친구에게 보내는 짧은 꼴) ─────────────────────────

export interface NetChores {
  d: number;
  c: number;
  h: number;
  w: [number, number] | null;
  e: number;
  r: [number, number] | null;
}

export function packChores(c: ChoreState): NetChores {
  return { d: c.dishes, c: c.clean, h: c.hamper, w: c.washer ? [c.washer.n, c.washer.at] : null, e: c.wet, r: c.rack ? [c.rack.n, c.rack.at] : null };
}

export function unpackChores(n: unknown): ChoreState | null {
  if (!n || typeof n !== 'object') return null;
  const o = n as Partial<NetChores>;
  const pair = (v: unknown) => (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' ? { n: v[0], at: v[1] } : null);
  return normalizeChores({ dishes: o.d, clean: o.c, cleanAt: 0, hamper: o.h, hamperAt: 0, washer: pair(o.w), wet: o.e, rack: pair(o.r) }, 0);
}

/** 친구에게 보내는 동작: '종류:시작한 지 프레임' */
export function packAction(a: ChoreAction | null, frame: number): string | undefined {
  return a ? `${a.kind}:${Math.max(0, frame - a.at)}:${a.n}` : undefined;
}

export function unpackAction(s: unknown): { kind: ChoreKind; t: number; n: number } | null {
  if (typeof s !== 'string') return null;
  const [k, t, n] = s.split(':');
  if (!(k in CHORE_FRAMES)) return null;
  const tt = Number(t);
  return isFinite(tt) ? { kind: k as ChoreKind, t: Math.max(0, tt), n: Math.max(1, Number(n) || 1) } : null;
}
