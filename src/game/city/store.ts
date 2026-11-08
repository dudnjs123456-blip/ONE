import { mulberry32 } from '../core/controllers';
import { PET_BY_ID, PET_GOODS, PET_SHOP_NAME, PET_SPECIES } from '../data/pets';
import { SHOPS } from '../data/shops';
import { CLOTHES_SHOP_NAME } from '../data/fashion';
import { FISHING_SHOP_NAME, RODS } from '../data/fishing';
import { KARAOKE_NAME, type Poi } from './cityMap';

/**
 * 가게 안 (먹거리 가게 · 펫샵): 문을 열고 들어가서 걸어 다니며 진열대의 물건을 직접 보고 산다.
 * 원점 = 가게 가운데 바닥, 남쪽(+z) 벽에 출입문, 북쪽(-z)에 계산대와 주인.
 *  - 먹거리: 메뉴 하나마다 진열대(편의점은 선반, 카페·빵집은 쇼케이스, 식당은 음식이 놓인 식탁)
 *  - 펫샵: 북쪽 벽 유리 분양 부스(강아지·고양이·토끼) + 소동물장(햄스터·고슴도치·거북이·새),
 *    곤돌라 진열대 · 벽 선반에 용품이 실제 개수만큼 진열돼 있고, 진열된 만큼만 살 수 있다.
 *    입고(아이들·용품 수량)는 날마다 무작위, 같은 날엔 다시 들어와도 같다
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type StoreKind = 'pet' | 'mart' | 'cafe' | 'diner' | 'clothes' | 'fishing' | 'karaoke' | 'stairs';

/** 옷가게 진열 구역: 전투 장비 셋 + 코디 넷 */
export type ClothesCorner = 'weapon' | 'gearAcc' | 'armor' | 'hat' | 'top' | 'bottom' | 'shoes';

/** 진열대 하나: 메뉴(또는 펫 용품) 하나 */
export interface Display {
  item: string;
  x: number;
  z: number;
  /** 물건이 놓인 높이 */
  y: number;
  /** 진열대가 바라보는 방향 (손님 쪽, z 기준. 서쪽 벽 선반은 0 → +x 쪽) */
  face: 1 | -1 | 0;
  /** 펫 용품: 물건 하나하나 놓인 자리 (진열된 개수만큼 보인다) */
  slots?: { x: number; y: number; z: number }[];
}

/** 펫샵 분양 자리: 유리 부스(큰 아이) · 소동물장(작은 아이) */
export interface PetSpot {
  kind: 'booth' | 'cage';
  /** 앞면 가운데 */
  x: number;
  z: number;
  /** 바닥 높이 */
  y: number;
  /** 아이가 돌아다니는 안쪽 */
  inner: Rect;
}

export interface StoreLayout {
  sign: string;
  kind: StoreKind;
  room: Rect;
  spawn: { x: number; z: number };
  /** 주인이 서는 곳 (계산대 뒤) */
  keeper: { x: number; z: number };
  furniture: { id: string; rect: Rect }[];
  displays: Display[];
  pois: Poi[];
  /** 펫샵 분양 자리 */
  spots: PetSpot[];
  /** 벽·바닥 색 */
  theme: { wall: number; floor: number; accent: number };
}

export const STORE_ROOM: Rect = { x0: -4, x1: 4, z0: -3, z1: 3 };
const PET_ROOM: Rect = { x0: -5, x1: 5, z0: -3.5, z1: 3.5 };

export function storeKindOf(sign: string): StoreKind {
  if (sign === PET_SHOP_NAME) return 'pet';
  if (sign === CLOTHES_SHOP_NAME) return 'clothes';
  if (sign === FISHING_SHOP_NAME) return 'fishing';
  if (sign === KARAOKE_NAME) return 'karaoke';
  if (sign.startsWith(STAIR_PREFIX)) return 'stairs';
  if (sign === '편의점 24' || sign === '약국' || sign === '꽃집' || sign === '안경원') return 'mart';
  if (sign === '카페 모먼트' || sign === '베이커리') return 'cafe';
  return 'diner';
}

const THEMES: Record<StoreKind, StoreLayout['theme']> = {
  pet: { wall: 0xf7f7f4, floor: 0xe6e3dc, accent: 0x2fae93 },
  clothes: { wall: 0xf4f1ec, floor: 0xc9b9a3, accent: 0x2b2b30 },
  fishing: { wall: 0xe9eef0, floor: 0x7f8b84, accent: 0x1f5f8b },
  mart: { wall: 0xf2f4f6, floor: 0xd9dde2, accent: 0x2f6fd6 },
  cafe: { wall: 0xefe4d6, floor: 0x9c7350, accent: 0x5a3b28 },
  diner: { wall: 0xf3e8d2, floor: 0xb89a74, accent: 0xc0392b },
  karaoke: { wall: 0x2a1838, floor: 0x3a3340, accent: 0xc026d3 },
  stairs: { wall: 0xe4e1da, floor: 0xb9b6ae, accent: 0x6b6f76 },
};

const buildCache = new Map<string, StoreLayout>();

export function storeLayout(sign: string): StoreLayout {
  const hit = buildCache.get(sign);
  if (hit) return hit;
  const kind = storeKindOf(sign);
  const layout = kind === 'pet' ? petLayout(sign) : kind === 'clothes' ? clothesLayout(sign) : kind === 'fishing' ? fishingLayout(sign) : kind === 'karaoke' ? karaokeLayout(sign) : kind === 'stairs' ? stairsLayout(sign) : foodLayout(sign, kind);
  buildCache.set(sign, layout);
  return layout;
}

function foodLayout(sign: string, kind: StoreKind): StoreLayout {
  const room = STORE_ROOM;
  const furniture: StoreLayout['furniture'] = [];
  const displays: Display[] = [];
  const pois: Poi[] = [];
  furniture.push({ id: 'counter', rect: { x0: 0.9, x1: 3.4, z0: -2.35, z1: -1.75 } });
  furniture.push({ id: 'backbar', rect: { x0: 0.6, x1: 3.95, z0: -3, z1: -2.75 } });
  const keeper = { x: 2.15, z: -2.5 };
  pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (밖으로 나가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
  pois.push({ id: 'store:counter', kind: 'shop', label: '계산대 — 사장님과 이야기', x: 2.15, z: -1.25, radius: 0.85 });
  const items = (SHOPS[sign]?.menu ?? []).map((m) => m.id);
  if (kind === 'mart') {
    furniture.push({ id: 'shelfA', rect: { x0: -3.4, x1: -0.6, z0: -1.0, z1: -0.5 } });
    furniture.push({ id: 'shelfB', rect: { x0: -3.4, x1: -0.6, z0: 0.9, z1: 1.4 } });
    furniture.push({ id: 'fridge', rect: { x0: -4, x1: -3.55, z0: -2.9, z1: 0.0 } });
    // 통로 양쪽 선반에 엇갈리게 (마주 보는 물건끼리 겹치지 않게)
    const spots = [
      [-3.0, -0.5, 1],
      [-2.5, 0.9, -1],
      [-2.0, -0.5, 1],
      [-1.5, 0.9, -1],
      [-1.0, -0.5, 1],
      [-2.0, 1.4, 1],
    ] as const;
    items.forEach((id, i) => {
      const s = spots[i % spots.length];
      displays.push({ item: id, x: s[0], z: s[1], y: 1.45, face: s[2] });
    });
  } else {
    const cafe = kind === 'cafe';
    const cols = Math.min(3, items.length);
    items.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = -3.0 + c * 1.35;
      const z = cafe ? -0.6 + r * 1.9 : -1.2 + r * 2.0;
      furniture.push({ id: `stand${i}`, rect: { x0: x - 0.45, x1: x + 0.45, z0: z - 0.35, z1: z + 0.35 } });
      displays.push({ item: id, x, z, y: cafe ? 1.3 : 0.78, face: 1 });
    });
  }
  for (const d of displays) {
    pois.push({ id: `store:item:${d.item}`, kind: 'shop', label: d.item, x: d.x, z: d.z + d.face * (kind === 'mart' ? 0.45 : 0.7), radius: kind === 'mart' ? 0.4 : 0.55 });
  }
  return { sign, kind, room, spawn: { x: 0, z: room.z1 - 1.0 }, keeper, furniture, displays, pois, spots: [], theme: THEMES[kind] };
}

/** 펫샵 배치 (10 × 7 m) */
function petLayout(sign: string): StoreLayout {
  const room = PET_ROOM;
  const furniture: StoreLayout['furniture'] = [];
  const displays: Display[] = [];
  const pois: Poi[] = [];
  const spots: PetSpot[] = [];
  // 북쪽 벽: 유리 분양 부스 4칸 (바닥 0.62m, 깊이 0.75m)
  const boothW = 1.08;
  const bx0 = -4.85;
  furniture.push({ id: 'booths', rect: { x0: bx0 - 0.1, x1: bx0 + boothW * 4 + 0.05, z0: room.z0, z1: room.z0 + 0.82 } });
  for (let i = 0; i < 4; i++) {
    const cx = bx0 + boothW * (i + 0.5);
    spots.push({ kind: 'booth', x: cx, z: room.z0 + 0.8, y: 0.62, inner: { x0: cx - boothW / 2 + 0.16, x1: cx + boothW / 2 - 0.16, z0: room.z0 + 0.2, z1: room.z0 + 0.66 } });
  }
  // 북쪽 가운데: 소동물장 (낮은 장 위에 수조·새장 넷)
  const cab = { x0: -0.35, x1: 2.25, z0: room.z0, z1: room.z0 + 0.6 };
  furniture.push({ id: 'smallCab', rect: cab });
  for (let i = 0; i < 4; i++) {
    const cx = cab.x0 + 0.33 + i * 0.645;
    spots.push({ kind: 'cage', x: cx, z: cab.z1, y: 0.82, inner: { x0: cx - 0.16, x1: cx + 0.16, z0: cab.z0 + 0.18, z1: cab.z1 - 0.12 } });
  }
  // 북동쪽: 계산대 + 뒤 선반, 주인
  furniture.push({ id: 'counter', rect: { x0: 2.7, x1: 4.6, z0: -2.45, z1: -1.85 } });
  furniture.push({ id: 'backbar', rect: { x0: 2.45, x1: 5, z0: room.z0, z1: room.z0 + 0.3 } });
  const keeper = { x: 3.65, z: -2.95 };
  // 동쪽 남부: 유리벽 미용실
  furniture.push({ id: 'grooming', rect: { x0: 3.15, x1: 5, z0: 0.3, z1: 2.9 } });
  // 가운데 곤돌라 두 줄 + 서쪽 벽 사료 선반
  const gA = { x0: -3.7, x1: -0.7, z0: -0.75, z1: -0.15 };
  const gB = { x0: -3.7, x1: -0.7, z0: 1.15, z1: 1.75 };
  const wall = { x0: room.x0, x1: room.x0 + 0.5, z0: -1.6, z1: 2.7 };
  furniture.push({ id: 'gondolaA', rect: gA }, { id: 'gondolaB', rect: gB }, { id: 'foodWall', rect: wall });

  /** 진열 자리: 선반 앞면을 따라 cols × rows */
  const shelfSlots = (x0: number, x1: number, z: number, ys: number[], cols: number) => {
    const out: { x: number; y: number; z: number }[] = [];
    for (const y of ys) for (let c = 0; c < cols; c++) out.push({ x: x0 + ((c + 0.5) * (x1 - x0)) / cols, y, z });
    return out;
  };
  const byId = Object.fromEntries(PET_GOODS.map((g) => [g.id, g]));
  // 사료: 서쪽 벽 큰 포대 (두 단 × 4줄, z 방향으로 늘어선다)
  if (byId['pet-food']) {
    const slots: { x: number; y: number; z: number }[] = [];
    for (const y of [0.42, 1.12]) for (let k = 0; k < 4; k++) slots.push({ x: wall.x1 - 0.18, y, z: wall.z0 + 0.6 + k * 0.85 });
    displays.push({ item: 'pet-food', x: wall.x1, z: (wall.z0 + wall.z1) / 2, y: 1.6, face: 0, slots });
  }
  // 간식: 곤돌라 A 북쪽 면 / 장난감: 곤돌라 A 남쪽 면 / 샴푸: 곤돌라 B 북쪽 면
  const faceSlots = (r: Rect, side: 1 | -1) => shelfSlots(r.x0 + 0.1, r.x1 - 0.1, side > 0 ? r.z1 - 0.08 : r.z0 + 0.08, [0.55, 0.98], 5);
  if (byId['pet-treat']) displays.push({ item: 'pet-treat', x: (gA.x0 + gA.x1) / 2, z: gA.z0, y: 1.25, face: -1, slots: faceSlots(gA, -1) });
  if (byId['pet-toy']) displays.push({ item: 'pet-toy', x: (gA.x0 + gA.x1) / 2, z: gA.z1, y: 1.25, face: 1, slots: faceSlots(gA, 1) });
  if (byId['pet-shampoo']) displays.push({ item: 'pet-shampoo', x: (gB.x0 + gB.x1) / 2, z: gB.z0, y: 1.25, face: -1, slots: faceSlots(gB, -1) });

  pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (밖으로 나가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
  pois.push({ id: 'store:counter', kind: 'shop', label: '계산대 — 사장님과 이야기 · 용품 · 내 아이들', x: 3.65, z: -1.35, radius: 0.85 });
  for (const d of displays) {
    const p = d.face === 0 ? { x: d.x + 0.55, z: d.z } : { x: d.x, z: d.z + d.face * 0.55 };
    pois.push({ id: `store:item:${d.item}`, kind: 'shop', label: d.item, x: p.x, z: p.z, radius: d.face === 0 ? 1.2 : 0.9 });
  }
  return { sign, kind: 'pet', room, spawn: { x: 0, z: room.z1 - 1.0 }, keeper, furniture, displays, pois, spots, theme: THEMES.pet };
}

/** 옷가게 진열 구역 이름 (E 를 누르면 그 구역 물건 목록이 열린다) */
export const CORNER_LABEL: Record<ClothesCorner, string> = {
  weapon: '⚔️ 무기 벽',
  gearAcc: '🥊 장갑 · 액세서리 진열장',
  armor: '🛡️ 방어구 코너',
  hat: '🧢 모자 · 안경 · 머리띠 선반',
  top: '👕 상의 행거',
  bottom: '👖 하의 테이블',
  shoes: '👟 신발 · 가방 · 꼬리 벽',
};

/**
 * 옷가게 배치 (10 × 7 m): 서쪽 = 전투 장비 (무기 벽 · 방어구 · 유리 진열장), 가운데·동쪽 = 코디
 * (모자 선반 · 상의 행거 · 하의 테이블 · 신발 벽), 북동쪽 계산대, 남동쪽 탈의실 (코디·장비 갈아입기)
 */
function clothesLayout(sign: string): StoreLayout {
  const room = PET_ROOM;
  const furniture: StoreLayout['furniture'] = [];
  const displays: Display[] = [];
  const pois: Poi[] = [];
  furniture.push({ id: 'counter', rect: { x0: 2.7, x1: 4.6, z0: -2.45, z1: -1.85 } });
  furniture.push({ id: 'backbar', rect: { x0: 2.45, x1: 5, z0: room.z0, z1: room.z0 + 0.3 } });
  const keeper = { x: 3.65, z: -2.95 };
  const corner = (id: ClothesCorner, rect: Rect, face: 1 | -1 | 0, poi: { x: number; z: number; r: number }) => {
    furniture.push({ id: `c:${id}`, rect });
    displays.push({ item: id, x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, y: 1.6, face });
    pois.push({ id: `store:rack:${id}`, kind: 'shop', label: `${CORNER_LABEL[id]} — 둘러보기`, x: poi.x, z: poi.z, radius: poi.r });
  };
  corner('weapon', { x0: room.x0, x1: room.x0 + 0.35, z0: -2.8, z1: 0.4 }, 0, { x: -4.1, z: -1.2, r: 1.1 });
  corner('armor', { x0: -4.3, x1: -1.3, z0: room.z0, z1: room.z0 + 0.5 }, 1, { x: -2.8, z: -2.45, r: 0.9 });
  corner('gearAcc', { x0: -3.6, x1: -1.8, z0: -1.0, z1: -0.4 }, 1, { x: -2.7, z: 0.1, r: 0.8 });
  corner('hat', { x0: -0.9, x1: 2.2, z0: room.z0, z1: room.z0 + 0.4 }, 1, { x: 0.65, z: -2.55, r: 0.9 });
  corner('top', { x0: -0.5, x1: 1.9, z0: -1.5, z1: -1.0 }, 1, { x: 0.7, z: -0.5, r: 0.7 });
  corner('bottom', { x0: -0.4, x1: 1.6, z0: 1.0, z1: 1.7 }, -1, { x: 0.6, z: 0.55, r: 0.7 });
  corner('shoes', { x0: room.x1 - 0.4, x1: room.x1, z0: -0.8, z1: 1.8 }, 0, { x: 4.05, z: 0.5, r: 1.0 });
  // 탈의실 (커튼) + 창가 마네킹 둘
  furniture.push({ id: 'fitting', rect: { x0: 3.3, x1: room.x1, z0: 2.2, z1: room.z1 } });
  furniture.push({ id: 'manA', rect: { x0: -3.85, x1: -3.35, z0: 2.35, z1: 2.85 } });
  furniture.push({ id: 'manB', rect: { x0: -2.65, x1: -2.15, z0: 2.35, z1: 2.85 } });
  pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (밖으로 나가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
  pois.push({ id: 'store:counter', kind: 'shop', label: '계산대 — 전체 상품 보기', x: 3.65, z: -1.35, radius: 0.85 });
  pois.push({ id: 'store:fit', kind: 'shop', label: '🚪 탈의실 — 코디 · 장비 갈아입기', x: 2.75, z: 2.85, radius: 0.7 });
  return { sign, kind: 'clothes', room, spawn: { x: 0, z: room.z1 - 1.0 }, keeper, furniture, displays, pois, spots: [], theme: THEMES.clothes };
}

/**
 * 낚시점 배치 (10 × 7 m): 북쪽 벽 낚싯대 진열대 (다섯 자루), 서쪽 벽 미끼 냉장고 (지렁이 · 떡밥 · 새우 · 황금 떡밥),
 * 가운데 소품 곤돌라 (루어 걸이), 동쪽 가운데 큰 수조 (한강 물고기 구경 = 도감), 동쪽 벽 명예의 전당 (내 기록),
 * 북동쪽 계산대 (사장님: 낚싯대 · 미끼 · 물고기 팔기)
 */
function fishingLayout(sign: string): StoreLayout {
  const room = PET_ROOM;
  const furniture: StoreLayout['furniture'] = [];
  const displays: Display[] = [];
  const pois: Poi[] = [];
  furniture.push({ id: 'counter', rect: { x0: 2.7, x1: 4.6, z0: -2.45, z1: -1.85 } });
  furniture.push({ id: 'backbar', rect: { x0: 2.45, x1: 5, z0: room.z0, z1: room.z0 + 0.3 } });
  const keeper = { x: 3.65, z: -2.95 };
  // 낚싯대 진열대: 북쪽 벽에 세워 둔 다섯 자루
  furniture.push({ id: 'rodRack', rect: { x0: -4.7, x1: 0.9, z0: room.z0, z1: room.z0 + 0.45 } });
  FISH_RODS.forEach((r, i) => {
    const x = -4.15 + i * 1.12;
    displays.push({ item: `rod:${r}`, x, z: room.z0 + 0.25, y: 1.5, face: 1 });
    pois.push({ id: `store:item:rod:${r}`, kind: 'shop', label: r, x, z: room.z0 + 1.0, radius: 0.55 });
  });
  // 미끼 냉장고: 서쪽 벽 (유리문, 칸마다 미끼 하나)
  const fridge = { x0: room.x0, x1: room.x0 + 0.65, z0: -1.9, z1: 1.5 };
  furniture.push({ id: 'baitFridge', rect: fridge });
  ['worm', 'paste', 'shrimp', 'golden'].forEach((b, i) => {
    const z = fridge.z0 + 0.45 + i * 0.83;
    displays.push({ item: `bait:${b}`, x: fridge.x1, z, y: 1.15, face: 0 });
    pois.push({ id: `store:item:bait:${b}`, kind: 'shop', label: b, x: fridge.x1 + 0.55, z, radius: 0.45 });
  });
  // 소품 곤돌라: 북쪽 면에 루어 걸이 · 남쪽 면에 찌 · 봉돌 상자 (장식)
  const gondola = { x0: -2.8, x1: -0.6, z0: -0.35, z1: 0.25 };
  furniture.push({ id: 'tackle', rect: gondola });
  displays.push({ item: 'bait:lure', x: (gondola.x0 + gondola.x1) / 2, z: gondola.z0, y: 1.25, face: -1 });
  pois.push({ id: 'store:item:bait:lure', kind: 'shop', label: 'lure', x: (gondola.x0 + gondola.x1) / 2, z: gondola.z0 - 0.55, radius: 0.7 });
  // 큰 수조 (한강 물고기들이 헤엄친다)
  const tank = { x0: 0.7, x1: 3.1, z0: 0.35, z1: 1.25 };
  furniture.push({ id: 'tank', rect: tank });
  pois.push({ id: 'store:tank', kind: 'shop', label: '🐟 한강 물고기 수조 — 낚시 도감 보기', x: (tank.x0 + tank.x1) / 2, z: tank.z1 + 0.55, radius: 0.8 });
  // 명예의 전당 (동쪽 벽): 내가 잡은 가장 큰 고기들
  furniture.push({ id: 'trophy', rect: { x0: room.x1 - 0.25, x1: room.x1, z0: -0.3, z1: 2.6 } });
  pois.push({ id: 'store:records', kind: 'shop', label: '🏆 명예의 전당 — 내 낚시 기록', x: room.x1 - 0.85, z: 1.15, radius: 0.8 });
  pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (밖으로 나가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
  pois.push({ id: 'store:counter', kind: 'shop', label: '계산대 — 사장님 (낚싯대 · 미끼 · 물고기 팔기)', x: 3.65, z: -1.35, radius: 0.85 });
  return { sign, kind: 'fishing', room, spawn: { x: 0, z: room.z1 - 1.0 }, keeper, furniture, displays, pois, spots: [], theme: THEMES.fishing };
}

const FISH_RODS = RODS.map((r) => r.id);

// ───────────── 펫샵 입고 ─────────────

/** 오늘 펫샵에 들어온 아이 하나 (spot = 분양 자리 번호) */
export interface StockPet {
  id: string;
  species: string;
  coat: number;
  spot: number;
}

const SMALL = new Set(['hamster', 'hedgehog', 'bird', 'turtle']);

/** 그날 입고 (게임 날짜로 정해진다). 큰 아이는 유리 부스, 작은 아이는 소동물장. sold = 오늘 이미 분양된 아이 id */
export function petStock(day: number, sold: string[] = []): StockPet[] {
  const rng = mulberry32(day * 7919 + 1301);
  const n = 5 + Math.floor(rng() * 4); // 5~8 마리 (자리가 모자라면 덜 들어온다)
  const out: StockPet[] = [];
  let booth = 0;
  let cage = 4;
  for (let k = 0; k < n; k++) {
    const sp = PET_SPECIES[Math.floor(rng() * PET_SPECIES.length)];
    const coat = sp.coats ? Math.floor(rng() * sp.coats.length) : 0;
    const small = SMALL.has(sp.body);
    if (small ? cage >= 8 : booth >= 4) continue;
    out.push({ id: `d${day}-${k}`, species: sp.id, coat, spot: small ? cage++ : booth++ });
  }
  return out.filter((s) => !sold.includes(s.id) && PET_BY_ID[s.species]);
}

/** 그날 진열된 용품 개수 (진열대 자리 수 이하) */
export function petGoodsStock(day: number, layout: StoreLayout): Record<string, number> {
  const rng = mulberry32(day * 104729 + 77);
  const out: Record<string, number> = {};
  for (const d of layout.displays) {
    const max = d.slots?.length ?? 0;
    out[d.item] = Math.max(2, Math.round(max * (0.55 + rng() * 0.45)));
  }
  return out;
}

/** 분양 자리 안에서 노는 아이 */
export interface PenAnimal {
  stock: StockPet;
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: number;
  tx: number;
  tz: number;
  wait: number;
}

/** 펫샵 아이들 움직임: 각자 자기 부스·장 안에서만 */
export class PenSim {
  animals: PenAnimal[] = [];
  private rnd: () => number;

  constructor(
    private spots: PetSpot[],
    stock: StockPet[],
    seed: number,
  ) {
    this.rnd = mulberry32(seed);
    for (const s of stock) {
      const sp = spots[s.spot];
      if (!sp) continue;
      const p = this.pick(sp.inner);
      this.animals.push({ stock: s, x: p.x, y: sp.y, z: p.z, yaw: this.rnd() * 6.28, moving: 0, tx: p.x, tz: p.z, wait: this.rnd() * 200 });
    }
  }

  spotOf(a: PenAnimal) {
    return this.spots[a.stock.spot];
  }

  private pick(r: Rect) {
    return { x: r.x0 + this.rnd() * (r.x1 - r.x0), z: r.z0 + this.rnd() * (r.z1 - r.z0) };
  }

  remove(id: string) {
    this.animals = this.animals.filter((a) => a.stock.id !== id);
  }

  step(px: number, pz: number) {
    for (const a of this.animals) {
      const sp = PET_BY_ID[a.stock.species];
      const spot = this.spots[a.stock.spot];
      if (!spot) continue;
      const r = spot.inner;
      const speed = 0.01 * (sp?.speed ?? 1);
      const near = Math.hypot(px - spot.x, pz - spot.z);
      // 손님이 부스 앞에 오면 유리 쪽으로 다가온다
      if (near < 1.3 && a.wait > 30 && this.rnd() < 0.015) {
        a.tx = Math.max(r.x0, Math.min(r.x1, px));
        a.tz = r.z1;
        a.wait = 0;
      }
      if (a.wait > 0) {
        a.wait--;
        a.moving = Math.max(0, a.moving - 0.1);
        if (near < 2.5) {
          const want = Math.atan2(px - a.x, pz - a.z);
          a.yaw += Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw)) * 0.05;
        }
        continue;
      }
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.03) {
        a.wait = 90 + this.rnd() * 300;
        const s = this.pick(r);
        a.tx = s.x;
        a.tz = s.z;
        continue;
      }
      const k = Math.min(d, speed) / d;
      a.x = Math.max(r.x0, Math.min(r.x1, a.x + dx * k));
      a.z = Math.max(r.z0, Math.min(r.z1, a.z + dz * k));
      const want = Math.atan2(dx, dz);
      a.yaw += Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw)) * 0.2;
      a.moving = Math.min(1, a.moving + 0.15);
    }
  }
}

/** 코인노래방 방 하나: 방 번호 · 방 안쪽 · 화면이 붙은 바깥 벽 쪽 (-1 = 서쪽, 1 = 동쪽) · 문 가운데 z */
export interface KaraokeBooth {
  no: number;
  rect: Rect;
  side: -1 | 1;
  doorZ: number;
  /** 문 (복도 쪽 벽) x */
  doorX: number;
  /** 소파에 앉은 골반 자리 (남쪽 = 방 가운데를 본다) */
  sit: { x: number; z: number; yaw: number };
  /** 서서 부르는 자리: 테이블과 화면 사이, 화면을 본다 */
  stand: { x: number; z: number; yaw: number };
}

/** 코인노래방 크기 (10 × 8 m): 복도 폭 · 방과 로비 사이 벽 z · 방 문 폭 */
export const KARAOKE_ROOM: Rect = { x0: -5, x1: 5, z0: -4, z1: 4 };
export const KARAOKE_HALL = 0.85;
export const KARAOKE_LOBBY_Z = 0.5;
export const KARAOKE_DOOR_W = 0.95;
const WALL_T = 0.06;

/** 방 넷: 복도 서쪽에 1·2번, 동쪽에 3·4번 (북쪽부터) */
export const KARAOKE_BOOTHS: KaraokeBooth[] = (() => {
  const { x0, x1, z0 } = KARAOKE_ROOM;
  const mid = (z0 + KARAOKE_LOBBY_Z) / 2;
  const out: KaraokeBooth[] = [];
  for (const side of [-1, 1] as const) {
    const [bx0, bx1] = side < 0 ? [x0, -KARAOKE_HALL] : [KARAOKE_HALL, x1];
    for (const [rz0, rz1] of [[z0, mid], [mid, KARAOKE_LOBBY_Z]]) {
      const outX = side < 0 ? bx0 : bx1;
      const hallX = side < 0 ? bx1 : bx0;
      const inward = -side;
      const sofaMid = (outX + inward * 0.8 + hallX - inward * 0.75) / 2;
      out.push({
        no: out.length + 1,
        side,
        rect: { x0: bx0, x1: bx1, z0: rz0, z1: rz1 },
        doorZ: (rz0 + rz1) / 2,
        doorX: hallX,
        sit: { x: sofaMid, z: rz0 + 0.42, yaw: 0 },
        stand: { x: outX + inward * 1.05, z: (rz0 + rz1) / 2 + 0.3, yaw: side < 0 ? -Math.PI / 2 : Math.PI / 2 },
      });
    }
  }
  return out;
})();

/**
 * 코인노래방 (펫샵 건물 2층, 10 × 8 m). 계단을 올라와 남쪽 문으로 들어선다.
 *  - 남쪽 로비: 동쪽 카운터 (사장님) · 서쪽 대기 소파
 *  - 가운데 복도 (북쪽으로) 양옆에 방 넷: 바깥 벽에 큰 화면과 노래방 기계, 긴 벽에 소파, 가운데 테이블
 *  - 방에 들어가 노래방 기계 앞에서 E → 노래 고르기 (한 곡씩 결제)
 */
function karaokeLayout(sign: string): StoreLayout {
  const room = KARAOKE_ROOM;
  const furniture: StoreLayout['furniture'] = [];
  const pois: Poi[] = [];
  const wall = (id: string, r: Rect) => furniture.push({ id: `wall:${id}`, rect: r });
  // 방과 로비 사이 벽 (복도 입구만 비운다)
  wall('lobbyW', { x0: room.x0, x1: -KARAOKE_HALL, z0: KARAOKE_LOBBY_Z - WALL_T, z1: KARAOKE_LOBBY_Z + WALL_T });
  wall('lobbyE', { x0: KARAOKE_HALL, x1: room.x1, z0: KARAOKE_LOBBY_Z - WALL_T, z1: KARAOKE_LOBBY_Z + WALL_T });
  for (const b of KARAOKE_BOOTHS) {
    const { rect: r, side } = b;
    const hallX = side < 0 ? r.x1 : r.x0;
    // 복도 쪽 벽 (문 자리만 비운다)
    wall(`hall${b.no}a`, { x0: hallX - WALL_T, x1: hallX + WALL_T, z0: r.z0, z1: b.doorZ - KARAOKE_DOOR_W / 2 });
    wall(`hall${b.no}b`, { x0: hallX - WALL_T, x1: hallX + WALL_T, z0: b.doorZ + KARAOKE_DOOR_W / 2, z1: r.z1 });
    // 북쪽 방과 남쪽 방 사이 벽
    if (r.z1 < KARAOKE_LOBBY_Z - 0.01) wall(`split${b.no}`, { x0: r.x0, x1: r.x1, z0: r.z1 - WALL_T, z1: r.z1 + WALL_T });
    // 바깥 벽: 화면 + 노래방 기계 / 긴 벽: 소파 / 가운데: 테이블
    const outX = side < 0 ? r.x0 : r.x1;
    const inward = -side;
    const cz = (r.z0 + r.z1) / 2;
    const xs = (a: number, c: number) => (a < c ? { x0: a, x1: c } : { x0: c, x1: a });
    furniture.push({ id: `machine:${b.no}`, rect: { ...xs(outX, outX + inward * 0.45), z0: cz - 0.35, z1: cz + 0.35 } });
    furniture.push({ id: `sofa:${b.no}`, rect: { ...xs(outX + inward * 0.8, hallX - inward * 0.75), z0: r.z0 + WALL_T, z1: r.z0 + 0.66 } });
    furniture.push({ id: `table:${b.no}`, rect: { ...xs(outX + inward * 1.4, outX + inward * 2.8), z0: r.z0 + 0.95, z1: r.z0 + 1.45 } });
    pois.push({ id: `store:sing:${b.no}`, kind: 'shop', label: `🎤 ${b.no}번방 노래방 기계 — 노래 부르기`, x: outX + inward * 0.95, z: cz + 0.25, radius: 0.75 });
    // 소파 옆 (테이블 끝과 소파 끝 사이 빈 곳) — 앉기
    pois.push({ id: `store:sit:${b.no}`, kind: 'shop', label: `🛋️ ${b.no}번방 소파에 앉기`, x: hallX - inward * 1.05, z: r.z0 + 0.95, radius: 0.6 });
    // 복도에서 본 방 문
    pois.push({ id: `store:booth:${b.no}`, kind: 'shop', label: `🚪 ${b.no}번방`, x: hallX + inward * 0.4, z: b.doorZ, radius: 0.55 });
  }
  // 로비: 카운터 (동쪽) · 대기 소파 (서쪽)
  furniture.push({ id: 'counter', rect: { x0: 3.0, x1: 3.6, z0: 1.15, z1: 2.95 } });
  furniture.push({ id: 'backbar', rect: { x0: room.x1 - 0.3, x1: room.x1, z0: 0.9, z1: 3.2 } });
  const keeper = { x: 4.2, z: 2.05 };
  furniture.push({ id: 'waitSofa', rect: { x0: room.x0, x1: room.x0 + 0.65, z0: 1.3, z1: 3.3 } });
  pois.push({ id: 'store:counter', kind: 'shop', label: '카운터 — 사장님께 빈방 확인 · 곡 사기', x: 2.4, z: 2.05, radius: 0.85 });
  pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (계단으로 내려가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
  return { sign, kind: 'karaoke', room, spawn: { x: 0, z: room.z1 - 1.0 }, keeper, furniture, displays: [], pois, spots: [], theme: THEMES.karaoke };
}

/** 방 문 자리 (잠겨 있으면 이 칸을 막는다) */
export function boothDoorRect(b: KaraokeBooth): Rect {
  return { x0: b.doorX - 0.08, x1: b.doorX + 0.08, z0: b.doorZ - KARAOKE_DOOR_W / 2, z1: b.doorZ + KARAOKE_DOOR_W / 2 };
}

// ───────────────────────── 상가 계단실 (펫샵 건물) ─────────────────────────

/** 계단실 층 이름 앞부분: '상가 계단 2층' */
export const STAIR_PREFIX = '상가 계단 ';
/**
 * 펫샵 건물 층별 가게 (번호 = 층). 1층은 거리에서 들어오는 계단 입구, 비어 있으면 null.
 * 새 가게가 들어오면 여기에 이름만 넣으면 그 층 층계참에 문이 생긴다.
 */
export const SHOP_BUILDING_FLOORS: Record<number, string | null> = { 2: KARAOKE_NAME, 3: null };
export const STAIR_TOP = 3;
export const stairSign = (floor: number) => `${STAIR_PREFIX}${floor}층`;
export const stairFloorOf = (sign: string) => Number(sign.slice(STAIR_PREFIX.length).replace('층', '')) || 1;

/**
 * 계단실 한 층 (4 × 6 m, 모든 층 같은 구조). 남쪽 = 층계참 (1층은 거리로 나가는 유리문),
 * 북쪽 = 꺾어 올라가는 계단: 동쪽 칸은 위층으로 올라가는 계단, 서쪽 칸은 아래층으로 내려가는 계단.
 * 계단 끝(trigger 보다 북쪽)까지 걸어가면 위·아래층으로. 층계참 동쪽 벽에 그 층 가게 문.
 */
export const STAIR = {
  room: { x0: -2, x1: 2, z0: -3, z1: 3 } as Rect,
  /** 계단이 시작되는 z (층계참 북쪽 끝) */
  start: 0.4,
  /** 이보다 북쪽까지 올라가면 다음 층 */
  trigger: -2.45,
  /** 계단 한 층 높이 (그림) */
  rise: 1.7,
  /** 두 계단 사이 벽 반폭 */
  mid: 0.08,
  /** 가게 문 (동쪽 벽) z */
  doorZ: 1.7,
};

function stairsLayout(sign: string): StoreLayout {
  const f = stairFloorOf(sign);
  const room = STAIR.room;
  const furniture: StoreLayout['furniture'] = [{ id: 'wall:mid', rect: { x0: -STAIR.mid, x1: STAIR.mid, z0: room.z0, z1: STAIR.start } }];
  // 1층엔 내려가는 계단이 없다 (계단 밑 창고), 꼭대기 층엔 올라가는 계단이 없다 (옥상 문 잠김)
  if (f <= 1) furniture.push({ id: 'closet', rect: { x0: room.x0, x1: -STAIR.mid, z0: room.z0, z1: STAIR.start } });
  if (f >= STAIR_TOP) furniture.push({ id: 'roofGate', rect: { x0: STAIR.mid, x1: room.x1, z0: room.z0, z1: STAIR.start - 0.3 } });
  const pois: Poi[] = [];
  if (f <= 1) {
    pois.push({ id: 'store:exit', kind: 'home', label: '출입문 (거리로 나가기)', x: 0, z: room.z1 - 0.45, radius: 0.9 });
    pois.push({ id: 'store:directory', kind: 'shop', label: '📋 층별 안내판', x: room.x0 + 0.55, z: 1.7, radius: 0.7 });
  } else {
    const shop = SHOP_BUILDING_FLOORS[f];
    pois.push({
      id: 'store:floordoor',
      kind: 'shop',
      label: shop ? `🚪 ${f}층 ${shop} 들어가기` : `🚪 ${f}층 — 임대 문의 (아직 비어 있어요)`,
      x: room.x1 - 0.55,
      z: STAIR.doorZ,
      radius: 0.75,
    });
  }
  // 주인 없음: 화면 밖에 세워 둔다
  return { sign, kind: 'stairs', room, spawn: { x: 0, z: room.z1 - 0.7 }, keeper: { x: 0, z: 50 }, furniture, displays: [], pois, spots: [], theme: THEMES.stairs };
}
