import type { PlayerProfile } from '../core/profile';
import { statsForLevel } from './progression';

/**
 * 장비 — 반대편 세계(차원)에서만 쓴다. 서울에는 장비라는 개념이 없다 (docs/world-rules.md).
 * - 차원 무구 노점에서 은화로 사거나, 몬스터가 가끔 떨어뜨린다. 영웅 장비는 떨어뜨리기만 한다.
 * - 서울로 들고 나오지 못한다: 서울 능력치는 몸(레벨)뿐 → bodyStats. 차원 능력치는 몸 + 장비 → dimensionStats.
 * 8칸 (무기·머리·상의·하의·신발·장갑·목걸이·반지), 효과는 체력(+HP)과 공격력(+%) 두 가지.
 */
export type EquipSlot = 'weapon' | 'head' | 'top' | 'bottom' | 'shoes' | 'gloves' | 'necklace' | 'ring';

export const EQUIP_SLOTS: { id: EquipSlot; label: string; icon: string }[] = [
  { id: 'weapon', label: '무기', icon: '🗡️' },
  { id: 'head', label: '머리', icon: '⛑️' },
  { id: 'top', label: '상의', icon: '🦺' },
  { id: 'bottom', label: '하의', icon: '👖' },
  { id: 'shoes', label: '신발', icon: '🥾' },
  { id: 'gloves', label: '장갑', icon: '🧤' },
  { id: 'necklace', label: '목걸이', icon: '📿' },
  { id: 'ring', label: '반지', icon: '💍' },
];

export type Rarity = 'common' | 'rare' | 'epic';

export interface EquipDef {
  id: string;
  name: string;
  icon: string;
  slot: EquipSlot;
  rarity: Rarity;
  /** 최대 체력 + */
  hp?: number;
  /** 공격력 + (0.05 = +5%) */
  power?: number;
  /** 무구 노점 가격 (은화). 없으면 노점에서 안 판다 (몬스터만 떨어뜨린다) */
  price?: number;
  desc: string;
}

export const EQUIPS: Record<string, EquipDef> = Object.fromEntries(
  (
    [
      // 일반: 무구 노점 (고블린도 가끔 떨어뜨린다)
      { id: 'oakClub', name: '참나무 몽둥이', icon: '🪵', slot: 'weapon', rarity: 'common', power: 0.06, price: 40, desc: '마을 장작더미에서 제일 곧은 것.' },
      { id: 'leatherWraps', name: '가죽 손싸개', icon: '🧤', slot: 'gloves', rarity: 'common', power: 0.05, price: 35, desc: '주먹 마디를 감싼다.' },
      { id: 'leatherHood', name: '가죽 두건', icon: '🪖', slot: 'head', rarity: 'common', hp: 10, price: 30, desc: '안개 숲 바람을 막아 준다.' },
      { id: 'quiltedVest', name: '누빔 조끼', icon: '🦺', slot: 'top', rarity: 'common', hp: 18, price: 50, desc: '솜을 두껍게 누볐다.' },
      { id: 'clothTrousers', name: '튼튼한 천 바지', icon: '👖', slot: 'bottom', rarity: 'common', hp: 10, price: 35, desc: '무릎을 덧댔다.' },
      { id: 'leatherBoots', name: '가죽 장화', icon: '🥾', slot: 'shoes', rarity: 'common', hp: 6, power: 0.02, price: 40, desc: '진흙길에도 미끄러지지 않는다.' },
      // 희귀: 무구 노점 (산적·오우거·흑기사가 떨어뜨린다)
      { id: 'ironShortsword', name: '쇠 단검', icon: '🗡️', slot: 'weapon', rarity: 'rare', power: 0.14, price: 220, desc: '마을 대장간에서 두드린 첫 칼.' },
      { id: 'mailGloves', name: '쇠미늘 장갑', icon: '🧤', slot: 'gloves', rarity: 'rare', power: 0.1, price: 180, desc: '작은 쇠고리를 엮었다.' },
      { id: 'ironHelm', name: '쇠 투구', icon: '⛑️', slot: 'head', rarity: 'rare', hp: 22, price: 200, desc: '북문 경비대가 쓰던 것.' },
      { id: 'chainShirt', name: '사슬 갑옷', icon: '🦺', slot: 'top', rarity: 'rare', hp: 35, price: 260, desc: '무겁지만 든든하다.' },
      { id: 'leatherGreaves', name: '가죽 각반', icon: '👖', slot: 'bottom', rarity: 'rare', hp: 20, power: 0.03, price: 150, desc: '정강이를 지켜 준다.' },
      { id: 'scoutBoots', name: '정찰병 장화', icon: '🥾', slot: 'shoes', rarity: 'rare', hp: 10, power: 0.06, price: 170, desc: '발소리가 나지 않는다.' },
      { id: 'moonPendant', name: '달빛 목걸이', icon: '📿', slot: 'necklace', rarity: 'rare', hp: 12, power: 0.04, price: 240, desc: '밤이면 희미하게 빛난다.' },
      { id: 'copperRing', name: '구리 반지', icon: '💍', slot: 'ring', rarity: 'rare', power: 0.05, price: 160, desc: '손가락이 따뜻해진다.' },
      // 영웅: 떨어뜨리기만 한다
      { id: 'banditCloak', name: '산적 두목의 망토', icon: '🧥', slot: 'top', rarity: 'epic', hp: 45, power: 0.06, desc: '산적들이 보면 길을 비킨다.' },
      { id: 'ogreKnuckle', name: '오우거 뼈 너클', icon: '🦴', slot: 'gloves', rarity: 'epic', power: 0.2, desc: '오우거 손가락뼈를 깎아 만들었다.' },
      { id: 'blackLongsword', name: '흑기사의 장검', icon: '⚔️', slot: 'weapon', rarity: 'epic', power: 0.3, desc: '검은 칼날에 빛이 맺히지 않는다.' },
      { id: 'fireflyRing', name: '반딧불 반지', icon: '💍', slot: 'ring', rarity: 'epic', power: 0.12, desc: '반딧불이 하나가 갇혀 있다.' },
      { id: 'wardenAmulet', name: '북문 수호 목걸이', icon: '📿', slot: 'necklace', rarity: 'epic', hp: 20, power: 0.08, desc: '오래전 북문 기사가 걸던 것.' },
    ] satisfies EquipDef[]
  ).map((e) => [e.id, e]),
);

/** 무구 노점에서 파는 장비 (가격 순) */
export const SHOP_GEAR: EquipDef[] = Object.values(EQUIPS)
  .filter((e) => e.price)
  .sort((a, b) => a.price! - b.price!);

const COMMONS = Object.values(EQUIPS).filter((e) => e.rarity === 'common').map((e) => e.id);
const RARES = Object.values(EQUIPS).filter((e) => e.rarity === 'rare').map((e) => e.id);

/** 몬스터가 떨어뜨리는 것: [확률, 고를 장비들] 을 앞에서부터 굴려 처음 걸린 것 하나 */
const DROPS: Record<string, [number, string[]][]> = {
  goblin: [[0.04, COMMONS]],
  bandit: [
    [0.01, ['banditCloak']],
    [0.05, RARES],
    [0.06, COMMONS],
  ],
  ogre: [
    [0.02, ['ogreKnuckle']],
    [0.01, ['fireflyRing', 'wardenAmulet']],
    [0.1, RARES],
  ],
  darkKnight: [
    [0.03, ['blackLongsword']],
    [0.02, ['fireflyRing', 'wardenAmulet']],
    [0.12, RARES],
  ],
};

/** 몬스터를 잡았을 때 떨어뜨린 장비 id (없으면 null). rng 는 0~1 */
export function rollDrop(monsterId: string, rng: () => number): string | null {
  for (const [chance, pool] of DROPS[monsterId] ?? []) {
    if (rng() < chance) return pool[Math.floor(rng() * pool.length)] ?? null;
  }
  return null;
}

export interface GearState {
  /** 가방에 있는 장비 id (같은 것 여러 개 가능) */
  owned: string[];
  equipped: Partial<Record<EquipSlot, string>>;
}

/** 차원 장비 (없으면 빈 가방). 처음 받는 기본 장비는 없다 — 노점에서 사거나 몬스터에게서 얻는다 */
export function ensureGear(p: PlayerProfile): GearState {
  const d = (p.dimension ??= { visits: 0 });
  return (d.gear ??= { owned: [], equipped: {} });
}

/** 낀 장비의 효과 합계 */
export function gearBonus(p: PlayerProfile) {
  let hp = 0;
  let power = 0;
  for (const id of Object.values(p.dimension?.gear?.equipped ?? {})) {
    const e = id ? EQUIPS[id] : undefined;
    hp += e?.hp ?? 0;
    power += e?.power ?? 0;
  }
  return { hp, power };
}

/**
 * 몸 능력치 (레벨만): 서울에서 쓴다. 차원에서 단련한 몸(레벨)은 서울에도 그대로 이어지지만,
 * 장비와 근 기술은 그 땅의 것이라 서울에선 없다.
 */
export function bodyStats(p: PlayerProfile) {
  const base = statsForLevel(p.level);
  return { maxHp: base.maxHp, power: base.power };
}

/** 서울 능력치 (= 몸 능력치). 서울 코드(도시·낚시)가 쓰는 이름 */
export const playerStats = bodyStats;

/** 차원 능력치: 몸(레벨) + 차원 장비 */
export function dimensionStats(p: PlayerProfile) {
  const base = statsForLevel(p.level);
  const b = gearBonus(p);
  return { maxHp: base.maxHp + b.hp, power: base.power * (1 + b.power) };
}

/** 가방의 장비를 낀다 (같은 칸에 있던 건 가방으로). @returns 성공 */
export function equipItem(p: PlayerProfile, id: string): boolean {
  const g = ensureGear(p);
  const e = EQUIPS[id];
  const i = g.owned.indexOf(id);
  if (!e || i < 0) return false;
  g.owned.splice(i, 1);
  const prev = g.equipped[e.slot];
  if (prev) g.owned.push(prev);
  g.equipped[e.slot] = id;
  return true;
}

/** 칸의 장비를 벗어 가방으로 */
export function unequipSlot(p: PlayerProfile, slot: EquipSlot): boolean {
  const g = ensureGear(p);
  const id = g.equipped[slot];
  if (!id) return false;
  delete g.equipped[slot];
  g.owned.push(id);
  return true;
}

/** 예전 저장의 서울 장비(배트·후드티 등)는 없앤다 — 서울엔 장비가 없다 */
export function dropSeoulGear(p: PlayerProfile & { gear?: unknown }) {
  if ('gear' in p) delete p.gear;
}
