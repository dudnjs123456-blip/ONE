import { CITY_CONST, type CityMap } from './cityMap';

/**
 * 도로 규칙: 횡단보도 · 신호등 · 걸어서 못 들어가는 차도.
 *  - 교차로마다 네 방향 횡단보도 (강변북로와 만나는 T 자 교차로는 세 방향)
 *  - 사람은 차도에 들어갈 수 없고, 횡단보도로만 건넌다 (길가엔 펜스)
 *  - 신호는 모든 교차로가 같은 주기: 동서 차 초록 → 노랑 → 모두 빨강 → 남북 차 초록 → …
 *    보행 신호는 '나란히 가는 차' 가 초록일 때 켜진다 (가로지르는 차는 빨강)
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 횡단보도 한 곳 */
export interface Crosswalk extends Rect {
  /** 가로지르는 도로의 방향 ('x' = 동서로 뻗은 길을 남북으로 건넌다) */
  road: 'x' | 'z';
}

export type Light = 'green' | 'yellow' | 'red';
export type Walk = 'walk' | 'flash' | 'stop';

/** 횡단보도 폭 · 교차로 가장자리에서 띄우는 거리 */
export const CROSS_W = 3;
const CROSS_GAP = 0.4;

/** 신호 주기 (초) */
const GREEN = 14;
const YELLOW = 3;
const ALL_RED = 1;
const HALF = GREEN + YELLOW + ALL_RED;
export const SIGNAL_CYCLE = HALF * 2;
/** 보행 신호가 깜박이기 시작하는 남은 초 */
const FLASH = 5;

export interface Junction {
  x: number;
  z: number;
  /** 남북 도로 반폭 · 동서 도로 반폭 */
  hv: number;
  hh: number;
  /** 남쪽으로도 길이 이어지나 (강변북로와의 T 자 교차로는 아니다) */
  south: boolean;
}

export function junctions(): Junction[] {
  const { XS, ZS, ROAD_W, EXPRESSWAY_Z } = CITY_CONST;
  const out: Junction[] = [];
  for (const x of XS) {
    for (const z of ZS) out.push({ x, z, hv: ROAD_W / 2, hh: ROAD_W / 2, south: true });
    out.push({ x, z: EXPRESSWAY_Z, hv: ROAD_W / 2, hh: 7, south: false });
  }
  return out;
}

export function crosswalks(): Crosswalk[] {
  const out: Crosswalk[] = [];
  const a = CROSS_GAP;
  const b = CROSS_GAP + CROSS_W;
  for (const j of junctions()) {
    // 남북 길 건너기 (북쪽 · 남쪽)
    out.push({ road: 'z', x0: j.x - j.hv, x1: j.x + j.hv, z0: j.z - j.hh - b, z1: j.z - j.hh - a });
    if (j.south) out.push({ road: 'z', x0: j.x - j.hv, x1: j.x + j.hv, z0: j.z + j.hh + a, z1: j.z + j.hh + b });
    // 동서 길 건너기 (서쪽 · 동쪽)
    out.push({ road: 'x', x0: j.x - j.hv - b, x1: j.x - j.hv - a, z0: j.z - j.hh, z1: j.z + j.hh });
    out.push({ road: 'x', x0: j.x + j.hv + a, x1: j.x + j.hv + b, z0: j.z - j.hh, z1: j.z + j.hh });
  }
  return out;
}

/** 구간 [from, to] 에서 cuts 를 빼고 남은 조각들 */
function subtract(from: number, to: number, cuts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let s = from;
  for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (c1 <= s || c0 >= to) continue;
    if (c0 > s) out.push([s, c0]);
    s = Math.max(s, c1);
  }
  if (s < to) out.push([s, to]);
  return out;
}

/** 사람이 걸어 들어갈 수 없는 차도 (횡단보도만 뚫려 있다) */
export function roadSolids(map: CityMap): Rect[] {
  const cw = crosswalks();
  const out: Rect[] = [];
  for (const r of map.roads) {
    const hw = r.width / 2;
    if (r.axis === 'z') {
      const cuts = cw.filter((c) => c.road === 'z' && Math.abs((c.x0 + c.x1) / 2 - r.at) < 0.5).map((c) => [c.z0, c.z1] as [number, number]);
      for (const [z0, z1] of subtract(r.from, r.to, cuts)) out.push({ x0: r.at - hw, x1: r.at + hw, z0, z1 });
    } else {
      const cuts = cw.filter((c) => c.road === 'x' && Math.abs((c.z0 + c.z1) / 2 - r.at) < 0.5).map((c) => [c.x0, c.x1] as [number, number]);
      for (const [x0, x1] of subtract(r.from, r.to, cuts)) out.push({ x0, x1, z0: r.at - hw, z1: r.at + hw });
    }
  }
  return out;
}

/** 길가 펜스 (차도 가장자리에서 인도 쪽으로 살짝). 교차로 모퉁이와 횡단보도 자리는 비운다 */
export function fences(map: CityMap): { x0: number; z0: number; x1: number; z1: number }[] {
  const { X_RANGE, Z_RANGE, EXPRESSWAY_Z } = CITY_CONST;
  const js = junctions();
  const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const reach = CROSS_GAP + CROSS_W + 0.6;
  for (const r of map.roads) {
    const off = r.width / 2 + 0.35;
    if (r.axis === 'z') {
      const cuts = js.filter((j) => j.x === r.at).map((j) => [j.z - j.hh - reach, j.z + j.hh + reach] as [number, number]);
      for (const [z0, z1] of subtract(Z_RANGE[0] + 2, Math.min(r.to, EXPRESSWAY_Z), cuts)) {
        if (z1 - z0 < 1.5) continue;
        for (const s of [-1, 1]) out.push({ x0: r.at + s * off, z0, x1: r.at + s * off, z1 });
      }
    } else {
      const cuts = js.filter((j) => j.z === r.at).map((j) => [j.x - j.hv - reach, j.x + j.hv + reach] as [number, number]);
      for (const [x0, x1] of subtract(X_RANGE[0] + 2, X_RANGE[1] - 2, cuts)) {
        if (x1 - x0 < 1.5) continue;
        for (const s of [-1, 1]) {
          const z = r.at + s * off;
          // 강변북로 남쪽은 이미 방음벽·공원이라 북쪽(인도 쪽)만
          if (r.at === EXPRESSWAY_Z && s > 0) continue;
          out.push({ x0, z0: z, x1, z1: z });
        }
      }
    }
  }
  return out;
}

/** 차 신호 (axis = 차가 달리는 방향) */
export function vehicleLight(axis: 'x' | 'z', seconds: number): Light {
  const t = ((seconds % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const local = axis === 'x' ? t : (t + HALF) % SIGNAL_CYCLE;
  return local < GREEN ? 'green' : local < GREEN + YELLOW ? 'yellow' : 'red';
}

/** 보행 신호 (road = 건너는 도로의 방향). 나란한 차가 초록인 동안 켜지고, 끝나기 전에 깜박인다 */
export function walkLight(road: 'x' | 'z', seconds: number): Walk {
  const along: 'x' | 'z' = road === 'x' ? 'z' : 'x';
  const t = ((seconds % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const local = along === 'x' ? t : (t + HALF) % SIGNAL_CYCLE;
  if (local >= GREEN) return 'stop';
  return local > GREEN - FLASH ? 'flash' : 'walk';
}

/**
 * 차가 서야 할 정지선 (진행 방향으로 이 값에 이르기 전에 선다).
 * 차로 하나 (axis, at = 도로 중심선) 의 교차로 앞 횡단보도들 — 진행 방향 기준 횡단보도 바로 앞.
 */
export function stopLines(axis: 'x' | 'z', at: number, dir: 1 | -1): number[] {
  const out: number[] = [];
  for (const j of junctions()) {
    if (axis === 'z' && j.x === at) {
      // 남쪽으로 가는 차(+z)는 교차로 북쪽 횡단보도 앞에서, 북쪽으로 가는 차는 남쪽 횡단보도 앞에서
      if (dir > 0) out.push(j.z - j.hh - CROSS_GAP - CROSS_W - 0.6);
      else if (j.south) out.push(j.z + j.hh + CROSS_GAP + CROSS_W + 0.6);
    } else if (axis === 'x' && j.z === at) {
      out.push(dir > 0 ? j.x - j.hv - CROSS_GAP - CROSS_W - 0.6 : j.x + j.hv + CROSS_GAP + CROSS_W + 0.6);
    }
  }
  return out;
}

export const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
