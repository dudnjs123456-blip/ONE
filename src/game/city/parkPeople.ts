/**
 * 한강랜드 사람들: 놀이기구 직원 · 단골 손님(줄 서기 → 타기 → 내리기) · 산책하는 손님.
 * 모두 공유 시각(nowMs) 하나로만 정해진다 → 같은 시각이면 누구 화면에서나 같은 자리 (네트워크로 주고받을 필요 없음).
 */
import { PARK_NODES, PARK_PATHS, RIDES, RIDE_IDS, RIDE_NODE, parkRoute, parkSolids, runLength, type RideId } from './themePark';

export type ParkPersonState = 'walk' | 'queue' | 'ride' | 'watch' | 'staff';

export interface ParkPerson {
  /** 고정 번호 (모델 · 옷이 이걸로 정해진다) */
  id: number;
  x: number;
  z: number;
  /** 바라보는 방향 */
  fx: number;
  fz: number;
  state: ParkPersonState;
  ride?: RideId;
  seat?: number;
}

/** 0~1 해시 (같은 입력이면 어느 기기에서나 같은 값) */
function hash(a: number, b: number, c: number): number {
  let x = Math.imul(a + 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** 놀이기구 구역(못 들어가는 곳) 안인가 (여유 0.4m) */
const blocked = (x: number, z: number) => parkSolids().some((r) => x > r.x0 - 0.4 && x < r.x1 + 0.4 && z > r.z0 - 0.4 && z < r.z1 + 0.4);

const norm = (x: number, z: number) => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};

// ───────────────────────── 직원 · 줄 서는 자리 ─────────────────────────

/** 줄이 늘어서는 방향 (입구에서 이어진 길 쪽) */
function queueDir(id: RideId) {
  const node = RIDE_NODE[id];
  const path = PARK_PATHS.find(([a, b]) => a === node || b === node)!;
  const other = PARK_NODES[path[0] === node ? path[1] : path[0]];
  const g = RIDES[id].gate;
  return norm(other.x - g.x, other.z - g.z);
}

/** 줄 k 번째 자리 (0 = 맨 앞, 입구 바로 뒤) */
export function queueSpot(id: RideId, k: number): { x: number; z: number; fx: number; fz: number } {
  const d = queueDir(id);
  const g = RIDES[id].gate;
  return { x: g.x + d.x * (1.3 + k * 0.85), z: g.z + d.z * (1.3 + k * 0.85), fx: -d.x, fz: -d.z };
}

/** 놀이기구 직원이 서는 자리: 입구 옆 (줄을 바라본다) */
export function staffSpot(id: RideId): { x: number; z: number; fx: number; fz: number } {
  const d = queueDir(id);
  const g = RIDES[id].gate;
  // 줄 방향의 오른쪽으로 1.4m
  return { x: g.x - d.z * 1.4, z: g.z + d.x * 1.4, fx: d.x, fz: d.z };
}

/** 직원 이름 (놀이기구마다 한 명) */
export const STAFF_NAMES: Record<RideId, string> = {
  coaster: '김 직원',
  drop: '이 직원',
  viking: '박 직원',
  wheel: '최 직원',
  gyro: '정 직원',
  sky: '한 직원',
};

/** 구경하는 자리 (입구 옆, 놀이기구를 본다) */
function watchSpot(id: RideId, j: number) {
  const d = queueDir(id);
  const g = RIDES[id].gate;
  const at = (side: number) => ({
    x: g.x + d.z * side * (3 + (j >> 1) * 0.8) + d.x * (2 + j * 0.6),
    z: g.z - d.x * side * (3 + (j >> 1) * 0.8) + d.z * (2 + j * 0.6),
  });
  // 놀이기구 구역에 걸리면 줄 반대편에 선다
  let p = at(j % 2 ? 1 : -1);
  if (blocked(p.x, p.z)) p = at(j % 2 ? -1 : 1);
  if (blocked(p.x, p.z)) p = { x: g.x + d.x * (2.5 + j), z: g.z + d.z * (2.5 + j) };
  return { ...p, fx: -d.x, fz: -d.z };
}

// ───────────────────────── 단골 손님 (놀이기구마다) ─────────────────────────

/** 놀이기구마다 단골 손님 수 (대관람차는 구경만) */
export const REGULARS: Record<RideId, number> = { coaster: 4, drop: 3, viking: 3, wheel: 2, gyro: 3, sky: 3 };
/** 한 운행에 탈 확률 */
const JOIN_P = 0.75;
/** 탑승 시간 시작 뒤 첫 손님이 타는 시각, 그 뒤 한 명씩 간격 (초) */
const BOARD_FIRST = 2;
const BOARD_GAP = 1.1;
const WALK = 1.3;

const rideIndex = (id: RideId) => RIDE_IDS.indexOf(id);
const joins = (id: RideId, j: number, cycle: number) => id !== 'wheel' && hash(rideIndex(id), j, cycle) < JOIN_P;

/** 이번 운행에 타는 손님 순서: 지난 운행을 안 탄 사람(이미 줄에 서 있던 사람) 먼저, 방금 내려서 다시 서는 사람이 뒤 */
function riders(id: RideId, cycle: number): number[] {
  const n = REGULARS[id];
  const all = Array.from({ length: n }, (_, j) => j).filter((j) => joins(id, j, cycle));
  return [...all.filter((j) => !joins(id, j, cycle - 1)), ...all.filter((j) => joins(id, j, cycle - 1))];
}

/** 손님 j 가 앉는 자리: 뒤쪽 자리부터 (앞자리는 플레이어 몫) */
const seatOf = (id: RideId, q: number) => RIDES[id].seats - 1 - q;

function cycleOf(id: RideId, nowMs: number) {
  const R = RIDES[id];
  const sec = nowMs / 1000;
  const cycle = Math.floor(sec / R.period);
  return { cycle, at: sec - cycle * R.period, B: R.board, L: runLength(id), P: R.period };
}

/** 이 운행에 손님이 앉은 자리 (플레이어 자리 고를 때 피한다) */
export function visitorSeats(id: RideId, nowMs: number): Set<number> {
  if (id === 'wheel') return new Set();
  const { cycle } = cycleOf(id, nowMs);
  return new Set(riders(id, cycle).map((_, q) => seatOf(id, q)));
}

function regular(id: RideId, j: number, nowMs: number): ParkPerson {
  const pid = 100 + rideIndex(id) * 10 + j;
  const { cycle, at, B, L } = cycleOf(id, nowMs);
  const watch = (): ParkPerson => ({ id: pid, ...watchSpot(id, j), state: 'watch', ride: id });
  if (id === 'wheel') return watch();
  const now = riders(id, cycle);
  const q = now.indexOf(j);
  const queueAt = (k: number): ParkPerson => ({ id: pid, ...queueSpot(id, k), state: 'queue', ride: id });
  // 탑승 시간: 줄 선 순서대로 한 명씩 탄다
  if (at < B) {
    if (q < 0) return watch();
    const tb = BOARD_FIRST + q * BOARD_GAP;
    if (at < tb) {
      const boarded = Math.max(0, Math.min(q, Math.floor((at - BOARD_FIRST) / BOARD_GAP) + 1));
      return queueAt(q - boarded);
    }
    return { id: pid, x: RIDES[id].gate.x, z: RIDES[id].gate.z, fx: 0, fz: -1, state: 'ride', ride: id, seat: seatOf(id, q) };
  }
  // 운행 중: 탄 사람은 자리에, 다음 운행을 기다리는 사람은 줄에
  const next = riders(id, cycle + 1);
  const qn = next.indexOf(j);
  if (at < B + L && q >= 0) return { id: pid, x: RIDES[id].gate.x, z: RIDES[id].gate.z, fx: 0, fz: -1, state: 'ride', ride: id, seat: seatOf(id, q) };
  if (qn < 0) {
    // 다음엔 안 탄다: 방금 내렸으면 출구에서 구경 자리로 걸어간다
    if (q >= 0) return walkTo(pid, id, RIDES[id].exit, watchSpot(id, j), at - (B + L), watch);
    return watch();
  }
  // 다음 운행 줄: 이번에 안 탄 사람은 이미 서 있고, 방금 내린 사람은 출구에서 걸어와 뒤에 선다
  if (q < 0) return queueAt(qn);
  if (at < B + L) return queueAt(qn); // (운행 중엔 위에서 이미 ride)
  const spot = queueSpot(id, qn);
  return walkTo(pid, id, RIDES[id].exit, spot, at - (B + L), () => queueAt(qn));
}

/** 출구에서 목적지까지 곧장 걷는다 (도착하면 done) */
function walkTo(pid: number, id: RideId, from: { x: number; z: number }, to: { x: number; z: number }, t: number, done: () => ParkPerson): ParkPerson {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const u = len > 0 ? (t * WALK) / len : 1;
  if (u >= 1) return done();
  const d = norm(dx, dz);
  return { id: pid, x: from.x + dx * u, z: from.z + dz * u, fx: d.x, fz: d.z, state: 'walk', ride: id };
}

// ───────────────────────── 산책하는 손님 ─────────────────────────

/** 산책 코스 (교차점을 차례로 돈다) */
const STROLLS: string[][] = [
  ['plaza', 'cross', 'east', 'vikJ', 'dropJ', 'gyroJ', 'cross', 'plaza'],
  ['south', 'coasterW', 'west', 'cross', 'plaza', 'south'],
  ['cross', 'gyroJ', 'north', 'wheelJ', 'dropJ', 'vikJ', 'east', 'cross'],
  ['plaza', 'carousel', 'plaza', 'south', 'coasterW', 'west', 'cross', 'plaza'],
  ['north', 'top', 'north', 'gyroJ', 'dropJ', 'wheelJ', 'north'],
  ['east', 'far', 'east', 'cross', 'plaza', 'cross', 'east'],
];
const STROLL_SPEED = 1.1;

interface Line {
  pts: { x: number; z: number }[];
  acc: number[];
  len: number;
}
let lines: Line[] | null = null;
function strollLines(): Line[] {
  if (lines) return lines;
  lines = STROLLS.map((stops) => {
    const nodes: string[] = [stops[0]];
    for (let i = 1; i < stops.length; i++) nodes.push(...parkRoute(stops[i - 1], stops[i]).slice(1));
    const pts = nodes.map((n) => PARK_NODES[n]);
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts, acc, len: acc[acc.length - 1] };
  });
  return lines;
}

function stroller(k: number, nowMs: number): ParkPerson {
  const L = strollLines()[k % STROLLS.length];
  // 같은 코스를 두 사람이 반대쪽에서 걷는다
  let s = ((nowMs / 1000) * STROLL_SPEED + (k >= STROLLS.length ? L.len / 2 : 0) + k * 7) % L.len;
  if (s < 0) s += L.len;
  let i = 1;
  while (i < L.acc.length - 1 && L.acc[i] < s) i++;
  const a = L.pts[i - 1];
  const b = L.pts[i];
  const seg = L.acc[i] - L.acc[i - 1] || 1;
  const u = (s - L.acc[i - 1]) / seg;
  const d = norm(b.x - a.x, b.z - a.z);
  // 길 한가운데가 아니라 오른쪽으로 비켜 걷는다
  const off = 1.2 + (k % 3) * 0.5;
  const cx = a.x + (b.x - a.x) * u;
  const cz = a.z + (b.z - a.z) * u;
  // 오른쪽이 놀이기구 구역이면 왼쪽으로, 그것도 막히면 길 한가운데
  let x = cx - d.z * off;
  let z = cz + d.x * off;
  if (blocked(x, z)) [x, z] = [cx + d.z * off, cz - d.x * off];
  if (blocked(x, z)) [x, z] = [cx, cz];
  return { id: 200 + k, x, z, fx: d.x, fz: d.z, state: 'walk' };
}

/** 산책하는 손님 수 */
export const STROLLERS = 9;

// ───────────────────────── 모두 ─────────────────────────

/** 지금 놀이공원에 있는 사람 모두 (직원 + 단골 + 산책) */
export function parkPeople(nowMs: number): ParkPerson[] {
  const out: ParkPerson[] = [];
  for (const id of RIDE_IDS) {
    const s = staffSpot(id);
    out.push({ id: 300 + rideIndex(id), ...s, state: 'staff', ride: id });
    for (let j = 0; j < REGULARS[id]; j++) out.push(regular(id, j, nowMs));
  }
  for (let k = 0; k < STROLLERS; k++) out.push(stroller(k, nowMs));
  return out;
}

/** 지금 이 놀이기구 줄에 서 있는 손님 수 (탑승 시간엔 아직 못 탄 사람) */
export function queueAhead(id: RideId, nowMs: number): number {
  if (id === 'wheel') return 0;
  let n = 0;
  for (let j = 0; j < REGULARS[id]; j++) if (regular(id, j, nowMs).state === 'queue') n++;
  return n;
}
