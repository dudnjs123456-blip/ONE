/**
 * 잠자는 모습: 뒤척임(바로 눕기 ↔ 왼쪽·오른쪽으로 돌아눕기) · 숨결 · 자는 표정.
 *
 * 뒤척이는 때와 방향은 공유 시각(서버 시각)과 그 사람의 아이디로만 정한다.
 * 그래서 내 화면과 친구 화면에서 같은 순간에 같은 쪽으로 돌아눕는다 (절대 룰: 남이 보는 내 모습 = 내가 보는 내 모습).
 */

/** 한 자세로 자는 시간 (초). 자세는 이 간격마다 새로 고른다 (같은 자세가 또 나오면 그대로 잔다) */
export const SLEEP_SEGMENT = 36;
/** 돌아눕는 데 걸리는 시간 (초) */
export const SLEEP_TURN = 2.6;
/** 옆으로 돌아누운 각도 (라디안, 약 70°): 완전히 옆으로 세우면 두꺼운 이불을 뚫고 나와서 조금 덜 돈다 */
export const SIDE_ROLL = 1.22;

export type SleepPoseId = 'back' | 'left' | 'right';

export interface SleepMotion {
  /** 몸통 길이 방향 축으로 돈 각도 (+ = 왼쪽으로 돌아눕기) */
  roll: number;
  /** 옆으로 누운 정도 0~1 (무릎 굽히기·팔 모으기·이불 들림에 쓴다) */
  side: number;
  /** 바로 누워 배 위에 손을 올린 정도 0~1 */
  belly: number;
  /** 돌아눕는 중이면 0~1 (움찔하며 몸을 웅크린다) */
  turning: number;
  /** 잠꼬대 미소 0~1 */
  smile: number;
}

/** 아이디 문자열 → 32비트 해시 */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** (사람, 몇 번째 구간) → 0~1 난수 (같은 입력이면 어느 컴퓨터에서나 같은 값) */
function rand(seed: number, n: number, salt: number): number {
  let x = (seed ^ Math.imul(n, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** n 번째 구간의 자세: 바로 눕기 40% · 왼쪽 30% · 오른쪽 30% */
export function sleepPoseAt(seed: number, n: number): SleepPoseId {
  const r = rand(seed, n, 1);
  return r < 0.4 ? 'back' : r < 0.7 ? 'left' : 'right';
}

const ROLL: Record<SleepPoseId, number> = { back: 0, left: SIDE_ROLL, right: -SIDE_ROLL };

const ease = (u: number) => u * u * (3 - 2 * u);

/**
 * @param seedText 그 사람의 아이디 (로그인 아이디, 없으면 아무 고정 문자열)
 * @param nowMs 공유 시각 (worldClock.sharedNow)
 */
export function sleepMotion(seedText: string, nowMs: number): SleepMotion {
  const seed = hashSeed(seedText);
  // 사람마다 구간 시작을 어긋나게 해서 둘이 같이 자도 동시에 뒤척이지 않는다
  const s = nowMs / 1000 + (seed % 1000) / 1000 * SLEEP_SEGMENT;
  const n = Math.floor(s / SLEEP_SEGMENT);
  const at = s - n * SLEEP_SEGMENT;
  const cur = sleepPoseAt(seed, n);
  const prev = sleepPoseAt(seed, n - 1);
  // 왼쪽 → 오른쪽처럼 크게 돌 땐 그만큼 천천히
  const dur = SLEEP_TURN * Math.max(1, Math.abs(ROLL[cur] - ROLL[prev]) / SIDE_ROLL);
  const k = prev === cur ? 1 : ease(Math.min(1, at / dur));
  const roll = ROLL[prev] + (ROLL[cur] - ROLL[prev]) * k;
  const belly = (prev === 'back' ? 1 - k : 0) + (cur === 'back' ? k : 0);
  const turning = prev === cur || at >= dur ? 0 : Math.sin(Math.PI * (at / dur));
  // 다섯 구간에 한 번쯤 잠꼬대하듯 살짝 웃는다 (구간 중간쯤 4초)
  let smile = 0;
  if (rand(seed, n, 2) < 0.2) {
    const m = (at - SLEEP_SEGMENT * 0.45) / 2;
    smile = Math.abs(m) < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * m) : 0;
  }
  return { roll, side: Math.abs(roll) / SIDE_ROLL, belly, turning, smile };
}

/**
 * 잠든 숨결 0~1 (들이쉬기 짧게 · 내쉬기 길게, 한 번에 약 4.6초).
 * 숨은 보는 사람마다 조금 어긋나도 티가 안 나서 각자 시계로 돈다
 */
export function sleepBreath(sec: number): number {
  const p = (sec / 4.6) % 1;
  const shaped = p < 0.4 ? (p / 0.4) * 0.5 : 0.5 + ((p - 0.4) / 0.6) * 0.5;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * shaped);
}
