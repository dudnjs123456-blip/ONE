/**
 * 동네 시계: 접속한 모든 사람이 같은 날짜·같은 시각을 본다 (날씨도 날짜·시각으로 정해지니 같이 맞는다).
 * - 기준은 서버 시각. 각자 컴퓨터 시계가 어긋나도 /api/time 으로 차이를 재서 맞춘다
 * - 게임 시각 = 지금 한국 시각 그대로 (게임 1일째 = 2026년 11월 1일, 달력 날짜도 실제 날짜)
 * - 누구도 혼자 시간을 빨리 감을 수 없다 (잠자기·근무도 시계를 건드리지 않는다)
 */

/** 게임 1일째 0시 = 2026-11-01 0시 (한국 시각) */
export const CLOCK_EPOCH = Date.UTC(2026, 10, 1) - 9 * 3_600_000;
/** 게임 1분 = 실제 1분 */
export const MS_PER_GAME_MINUTE = 60_000;

/** 서버 시각 - 내 컴퓨터 시각 (ms) */
let offset = 0;
let synced = false;

/** 지금 서버 시각 (ms) */
export function sharedNow(): number {
  return Date.now() + offset;
}

/** 서버 시각 ms → 게임 날짜·시각 */
export function gameTimeAt(ms: number): { day: number; minutes: number } {
  const total = Math.max(0, (ms - CLOCK_EPOCH) / MS_PER_GAME_MINUTE);
  const day = Math.floor(total / 1440) + 1;
  return { day, minutes: total - (day - 1) * 1440 };
}

/** 지금 동네 날짜·시각 */
export function sharedGameTime() {
  return gameTimeAt(sharedNow());
}

/** 서버와 시계를 맞춘다 (여러 번 재서 가장 빨리 돌아온 값을 쓴다) */
export async function syncWorldClock(tries = 4): Promise<boolean> {
  let best: { rtt: number; off: number } | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const t0 = Date.now();
      const r = await fetch('/api/time', { cache: 'no-store' });
      const t1 = Date.now();
      const { now } = (await r.json()) as { now: number };
      if (typeof now !== 'number') continue;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, off: now + rtt / 2 - t1 };
    } catch {
      // 다음 시도
    }
  }
  if (!best) return false;
  offset = best.off;
  synced = true;
  return true;
}

export function worldClockSynced() {
  return synced;
}

/** 시험용: 서버와의 차이를 직접 정한다 */
export function setClockOffset(ms: number) {
  offset = ms;
}
