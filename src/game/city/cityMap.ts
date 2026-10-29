import { mulberry32 } from '../core/controllers';

/**
 * 서울 도심 한 구역 (가상). 좌표: x = 동쪽, z = 남쪽, 1 = 1m.
 * 북쪽엔 남산·N서울타워, 동쪽 멀리 초고층 타워, 남쪽엔 강변북로·한강공원·한강과 다리.
 * 같은 seed 면 항상 같은 도시가 만들어진다.
 */

export type BuildingKind = 'apartment' | 'office' | 'shop' | 'villa' | 'home';

export interface Sign {
  text: string;
  /** 간판 바탕색 / 글자색 */
  bg: string;
  fg: string;
}

export interface Building {
  id: number;
  kind: BuildingKind;
  /** 중심 */
  x: number;
  z: number;
  /** 동서 폭, 남북 깊이, 높이 */
  w: number;
  d: number;
  h: number;
  color: number;
  /** 건물 이름 (아파트 동 번호, 빌라 이름) */
  label?: string;
  /** 1층 가게 간판 (남쪽 면 = 도로 쪽) */
  sign?: Sign;
}

export type PoiKind = 'home' | 'shop' | 'subway' | 'bus' | 'park' | 'job' | 'casino';

export interface Poi {
  id: string;
  kind: PoiKind;
  label: string;
  x: number;
  z: number;
  radius: number;
}

export interface Road {
  /** 'x' = 동서로 뻗은 도로, 'z' = 남북으로 뻗은 도로 */
  axis: 'x' | 'z';
  /** 도로 중심선 위치 (axis 'x' 면 z 값) */
  at: number;
  from: number;
  to: number;
  width: number;
  name: string;
}

export interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: BuildingKind | 'park' | 'trail';
}

/** 아파트 단지 산책 공원: 둘레 산책로 + 연못 + 운동기구 + 꽃밭 + 파고라 */
export interface TrailPark {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 산책로 고리 (모서리가 둥근 사각형, 시계 방향) */
  path: { x: number; z: number }[];
  pond: { x: number; z: number; r: number };
  gym: { x: number; z: number; rot: number }[];
  flowers: { x: number; z: number; color: number }[];
  pergola: { x: number; z: number };
}

export interface Tree {
  x: number;
  z: number;
  s: number;
}

export interface CityMap {
  /** 걸어다닐 수 있는 범위 */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  roads: Road[];
  blocks: Block[];
  buildings: Building[];
  pois: Poi[];
  trees: Tree[];
  lights: { x: number; z: number }[];
  benches: { x: number; z: number; rot: number }[];
  trails: TrailPark[];
  /** 강변 공원 (남쪽 끝), 한강 시작 z */
  parkZ: [number, number];
  riverZ: number;
  /** 다리 (남북 도로를 따라 한강을 건넌다) */
  bridgeX: number;
  /** 플레이어 집 현관 (시작 위치) */
  home: { x: number; z: number; building: Building };
}

const ROAD_W = 10;
const SIDEWALK = 3;
const XS = [-70, -20, 30, 80]; // 남북 도로
const ZS = [-45, 0]; // 동서 도로
const EXPRESSWAY_Z = 48;
const X_RANGE: [number, number] = [-110, 110];
const Z_RANGE: [number, number] = [-80, 41];

const SHOPS: Sign[] = [
  { text: '편의점 24', bg: '#1e9e5a', fg: '#ffffff' },
  { text: '카페 모먼트', bg: '#4a3426', fg: '#f7e6c4' },
  { text: '황금치킨', bg: '#f2b705', fg: '#3a1d00' },
  { text: '분식천국', bg: '#e8483b', fg: '#ffffff' },
  { text: 'PC방', bg: '#1b2a6b', fg: '#7fe1ff' },
  { text: '코인노래방', bg: '#a020a0', fg: '#ffe9ff' },
  { text: '약국', bg: '#ffffff', fg: '#1a8a3a' },
  { text: '헤어살롱', bg: '#202020', fg: '#ffd1e0' },
  { text: '꽃집', bg: '#ffe0ea', fg: '#c2185b' },
  { text: '베이커리', bg: '#f5deb3', fg: '#7b3f00' },
  { text: '세탁소', bg: '#e3f2fd', fg: '#0d47a1' },
  { text: '고깃집', bg: '#7a1f1f', fg: '#ffd27f' },
  { text: '마라탕', bg: '#c62828', fg: '#fff59d' },
  { text: '떡볶이', bg: '#ff7043', fg: '#ffffff' },
  { text: '부동산', bg: '#2e7d32', fg: '#ffffff' },
  { text: '안경원', bg: '#37474f', fg: '#e0f7fa' },
];

/** 블록 종류: [z 줄][x 칸] — 가운데 아래(2,2)가 내 집이 있는 빌라촌 */
const LAYOUT: Block['kind'][][] = [
  ['apartment', 'office', 'office', 'apartment', 'apartment'],
  ['apartment', 'shop', 'park', 'shop', 'trail'],
  ['villa', 'shop', 'home', 'shop', 'apartment'],
];

function intervals(lines: number[], range: [number, number]) {
  const edges = [range[0], ...lines.flatMap((c) => [c - ROAD_W / 2, c + ROAD_W / 2]), range[1]];
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length; i += 2) out.push([edges[i], edges[i + 1]]);
  return out;
}

export function buildCityMap(seed = 2025): CityMap {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const range = (a: number, b: number) => a + rng() * (b - a);

  const roads: Road[] = [
    ...XS.map((x, i) => ({ axis: 'z' as const, at: x, from: Z_RANGE[0] - 40, to: EXPRESSWAY_Z, width: ROAD_W, name: `${i + 1}길` })),
    ...ZS.map((z, i) => ({ axis: 'x' as const, at: z, from: X_RANGE[0] - 40, to: X_RANGE[1] + 40, width: ROAD_W, name: i ? '중앙로' : '남산로' })),
    { axis: 'x', at: EXPRESSWAY_Z, from: X_RANGE[0] - 200, to: X_RANGE[1] + 200, width: 14, name: '강변북로' },
  ];

  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const pois: Poi[] = [];
  let nextId = 1;
  let shopIdx = 0;
  let aptNo = 101;
  let home: CityMap['home'] | null = null;

  const add = (b: Omit<Building, 'id'>) => {
    const bb = { id: nextId++, ...b };
    buildings.push(bb);
    return bb;
  };

  intervals(ZS, Z_RANGE).forEach(([z0, z1], row) => {
    intervals(XS, X_RANGE).forEach(([x0, x1], col) => {
      const kind = LAYOUT[row][col];
      blocks.push({ x0, x1, z0, z1, kind });
      // 인도를 뺀 건물 부지
      const ix0 = x0 + SIDEWALK + 1;
      const ix1 = x1 - SIDEWALK - 1;
      const iz0 = z0 + SIDEWALK + 1;
      const iz1 = z1 - SIDEWALK - 1;
      const W = ix1 - ix0;
      const D = iz1 - iz0;

      switch (kind) {
        case 'apartment': {
          // 판상형 아파트 동 (남향), 블록 깊이에 맞춰 1~2동
          const slabD = 10;
          const count = D > 26 ? 2 : 1;
          for (let k = 0; k < count; k++) {
            const z = count === 1 ? (iz0 + iz1) / 2 : iz0 + slabD / 2 + 1 + k * (D - slabD - 2);
            add({
              kind: 'apartment', x: (ix0 + ix1) / 2, z, w: Math.min(W - 2, 30), d: slabD,
              h: Math.round(range(14, 20)) * 3, color: pick([0xf2efe6, 0xe9e4d8, 0xf5f1ea]),
              label: `${aptNo++}동`,
            });
          }
          break;
        }
        case 'office': {
          const n = W > 34 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const w = Math.min(16, W / n - 3);
            // 남산로 쪽 오피스 하나는 카지노 (1층 입구에 네온 간판)
            const casino = row === 0 && col === 2 && k === 0;
            const b = add({
              kind: 'office', x: ix0 + (W / n) * (k + 0.5), z: (iz0 + iz1) / 2, w, d: Math.min(16, D - 4),
              h: Math.round(range(14, 26)) * 3.5, color: casino ? 0x3b2b4f : pick([0x8fb3c9, 0x6f8fa8, 0xa7c2d4, 0x7d9bb0]),
              label: casino ? '한강 그랜드 카지노' : undefined,
            });
            if (casino) pois.push({ id: 'casino', kind: 'casino', label: '한강 그랜드 카지노', x: b.x, z: b.z + b.d / 2 + 1.4, radius: 2.2 });
          }
          break;
        }
        case 'shop': {
          // 남·북 양쪽 도로를 따라 상가 건물이 줄지어 선다
          for (const side of [1, -1] as const) {
            let x = ix0;
            while (x < ix1 - 6) {
              const w = Math.min(range(8, 12), ix1 - x);
              const d = Math.min(12, D / 2 - 1);
              const sign = SHOPS[shopIdx++ % SHOPS.length];
              const b = add({
                kind: 'shop', x: x + w / 2, z: side > 0 ? iz1 - d / 2 : iz0 + d / 2, w: w - 0.6, d,
                h: Math.round(range(3, 7)) * 3.2, color: pick([0xd9c7b0, 0xc9b8a6, 0xe0d5c5, 0xbfa58a, 0xd0d0d0]),
                sign,
              });
              // 남쪽(+z) 면 가게만 상호작용 지점 (북쪽은 장식)
              if (side > 0) pois.push({ id: `shop-${b.id}`, kind: 'shop', label: sign.text, x: b.x, z: b.z + d / 2 + 1.2, radius: 1.8 });
              x += w;
            }
          }
          break;
        }
        case 'villa':
        case 'home': {
          // 4~5층 빌라 2열 x 3줄
          const cols = 3;
          const cw = W / cols;
          const rows = 2;
          const rd = D / rows;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const isHome = kind === 'home' && r === rows - 1 && c === 1;
              const b = add({
                kind: isHome ? 'home' : 'villa', x: ix0 + cw * (c + 0.5), z: iz0 + rd * (r + 0.5),
                w: cw - 3, d: rd - 4, h: Math.round(range(4, 5)) * 3,
                color: isHome ? 0xd99a6c : pick([0xb5654a, 0xc8b49a, 0xe6d3b8, 0x9e7b61, 0xd4c4ae]),
                label: isHome ? '행복빌라' : undefined,
              });
              if (isHome) {
                home = { x: b.x, z: b.z + b.d / 2 + 1.0, building: b };
                // 빌라 현관 (유리문 바로 앞): 여기로만 들어간다 → 1층 로비 → 계단·엘리베이터 → 내 층 복도 → 내 집
                pois.push({ id: 'lobby', kind: 'home', label: '행복빌라 현관 (들어가기)', x: home.x, z: home.z, radius: 1.1 });
              }
            }
          }
          break;
        }
        case 'trail':
          pois.push({ id: 'trail', kind: 'park', label: '한강뷰 단지 산책로 공원', x: (x0 + x1) / 2, z: z1 - SIDEWALK - 2, radius: 3 });
          break;
        case 'park':
          pois.push({ id: 'park-center', kind: 'park', label: '근린공원', x: (x0 + x1) / 2, z: (z0 + z1) / 2, radius: 4 });
          break;
      }
    });
  });

  // 지하철역 출입구 · 버스정류장
  pois.push({ id: 'subway', kind: 'subway', label: '지하철 2호선 한강공원역', x: XS[2] + ROAD_W / 2 + 2.5, z: ZS[1] + ROAD_W / 2 + 3, radius: 2.2 });
  pois.push({ id: 'bus-1', kind: 'bus', label: '버스정류장 (중앙로)', x: -45, z: ZS[1] + ROAD_W / 2 + 1.5, radius: 2 });
  pois.push({ id: 'bus-2', kind: 'bus', label: '버스정류장 (남산로)', x: 55, z: ZS[0] - ROAD_W / 2 - 1.5, radius: 2 });

  // 가로수·가로등: 인도 위, 교차로는 피해서
  const trees: Tree[] = [];
  const lights: { x: number; z: number }[] = [];
  const nearCross = (x: number, z: number) =>
    XS.some((cx) => Math.abs(x - cx) < ROAD_W) && ZS.some((cz) => Math.abs(z - cz) < ROAD_W);
  for (const r of roads.filter((r) => r.width === ROAD_W)) {
    for (let s = r.from + 4; s < r.to; s += 9) {
      for (const side of [-1, 1]) {
        const off = r.width / 2 + 1.2;
        const x = r.axis === 'z' ? r.at + side * off : s;
        const z = r.axis === 'z' ? s : r.at + side * off;
        if (x < X_RANGE[0] || x > X_RANGE[1] || z < Z_RANGE[0] || z > Z_RANGE[1] || nearCross(x, z)) continue;
        if (Math.round(s / 9) % 3 === 0) lights.push({ x, z });
        else trees.push({ x, z, s: range(0.85, 1.15) });
      }
    }
  }

  // 공원 블록: 나무·벤치
  const benches: CityMap['benches'] = [];
  for (const b of blocks.filter((b) => b.kind === 'park')) {
    for (let k = 0; k < 18; k++) {
      const x = range(b.x0 + 5, b.x1 - 5);
      const z = range(b.z0 + 5, b.z1 - 5);
      if (Math.hypot(x - (b.x0 + b.x1) / 2, z - (b.z0 + b.z1) / 2) < 7) continue; // 가운데 분수 자리
      trees.push({ x, z, s: range(0.9, 1.4) });
    }
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      benches.push({ x: cx + Math.cos(a) * 9, z: cz + Math.sin(a) * 9, rot: -a + Math.PI / 2 });
    }
  }

  // 아파트 단지 산책 공원
  const trails: TrailPark[] = [];
  for (const b of blocks.filter((b) => b.kind === 'trail')) {
    const inset = SIDEWALK + 4;
    const tx0 = b.x0 + inset;
    const tx1 = b.x1 - inset;
    const tz0 = b.z0 + inset;
    const tz1 = b.z1 - inset;
    const r = 5; // 모서리 둥글기
    const path: { x: number; z: number }[] = [];
    const corner = (cx: number, cz: number, a0: number) => {
      for (let k = 0; k <= 4; k++) {
        const a = a0 + (k / 4) * (Math.PI / 2);
        path.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
      }
    };
    corner(tx1 - r, tz0 + r, -Math.PI / 2); // 북동
    corner(tx1 - r, tz1 - r, 0); // 남동
    corner(tx0 + r, tz1 - r, Math.PI / 2); // 남서
    corner(tx0 + r, tz0 + r, Math.PI); // 북서
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const flowerColors = [0xff7aa2, 0xffd34d, 0xff5a5a, 0xb07cff, 0xffffff];
    trails.push({
      x0: b.x0,
      x1: b.x1,
      z0: b.z0,
      z1: b.z1,
      path,
      // 산책로 안쪽은 폭이 좁아서(약 8m) 북→남으로 한 줄로: 파고라 · 연못 · 꽃밭 · 운동기구
      pergola: { x: cx, z: cz - 8 },
      pond: { x: cx, z: cz - 2.5, r: 2.8 },
      flowers: Array.from({ length: 14 }, (_, k) => ({
        x: cx - 3.3 + (k % 7) * 1.1,
        z: cz + 2.5 + Math.floor(k / 7) * 1.1,
        color: flowerColors[k % flowerColors.length],
      })),
      gym: [
        { x: cx - 3, z: cz + 6.5, rot: 0 },
        { x: cx, z: cz + 6.5, rot: 0 },
        { x: cx + 3, z: cz + 6.5, rot: 0 },
      ],
    });
    // 산책로 바깥쪽 둘레에 나무를 촘촘히, 산책로 옆엔 벤치·가로등
    for (let k = 0; k < path.length; k++) {
      const a = path[k];
      const c = path[(k + 1) % path.length];
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const nx = -(c.z - a.z) / len; // 바깥쪽 법선 (시계 방향 고리)
      const nz = (c.x - a.x) / len;
      for (let u = 0; u < len; u += 4.5) {
        const px = a.x + ((c.x - a.x) * u) / len;
        const pz = a.z + ((c.z - a.z) * u) / len;
        trees.push({ x: px - nx * 3.2, z: pz - nz * 3.2, s: range(0.9, 1.3) });
      }
      if (k % 5 === 2) {
        benches.push({ x: a.x + nx * 1.8, z: a.z + nz * 1.8, rot: Math.atan2(c.x - a.x, c.z - a.z) });
        lights.push({ x: a.x - nx * 1.6, z: a.z - nz * 1.6 });
      }
    }
  }

  // 한강공원: 강변 따라 나무·벤치
  const parkZ: [number, number] = [EXPRESSWAY_Z + 8, 70];
  for (let x = X_RANGE[0]; x < X_RANGE[1]; x += 7) {
    if (Math.abs(x - XS[2]) < 10) continue; // 다리 자리
    trees.push({ x: x + range(-2, 2), z: range(parkZ[0] + 1, parkZ[0] + 4), s: range(0.9, 1.3) });
    if (Math.round(x / 7) % 4 === 0) benches.push({ x, z: parkZ[1] - 3, rot: 0 });
  }

  if (!home) throw new Error('home building missing');
  return {
    bounds: { x0: X_RANGE[0] + 1, x1: X_RANGE[1] - 1, z0: Z_RANGE[0] + 1, z1: parkZ[1] - 1.5 },
    roads,
    blocks,
    buildings,
    pois,
    trees,
    lights,
    benches,
    parkZ,
    riverZ: parkZ[1],
    bridgeX: XS[2],
    trails,
    home,
  };
}

export const CITY_CONST = { ROAD_W, SIDEWALK, XS, ZS, EXPRESSWAY_Z, X_RANGE, Z_RANGE };
