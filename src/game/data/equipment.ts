import type { PlayerProfile } from '../core/profile';
import { statsForLevel } from './progression';

/**
 * 장비: 8칸 (무기·머리·상의·하의·신발·장갑·목걸이·반지).
 * 지금은 기본 장비 8개로 칸만 채워 두고, 효과는 체력(+HP)과 공격력(+%) 두 가지.
 */
export type EquipSlot = 'weapon' | 'head' | 'top' | 'bottom' | 'shoes' | 'gloves' | 'necklace' | 'ring';

export const EQUIP_SLOTS: { id: EquipSlot; label: string; icon: string }[] = [
  { id: 'weapon', label: '무기', icon: '🗡️' },
  { id: 'head', label: '머리', icon: '🧢' },
  { id: 'top', label: '상의', icon: '👕' },
  { id: 'bottom', label: '하의', icon: '👖' },
  { id: 'shoes', label: '신발', icon: '👟' },
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
  desc: string;
}

export const EQUIPS: Record<string, EquipDef> = Object.fromEntries(
  (
    [
      { id: 'woodBat', name: '나무 야구배트', icon: '🏏', slot: 'weapon', rarity: 'common', power: 0.08, desc: '동네 야구장에서 주웠다.' },
      { id: 'cap', name: '검정 볼캡', icon: '🧢', slot: 'head', rarity: 'common', hp: 8, desc: '푹 눌러 쓰면 아무도 못 알아본다.' },
      { id: 'hoodie', name: '회색 후드티', icon: '🧥', slot: 'top', rarity: 'common', hp: 15, desc: '편하고 따뜻하다.' },
      { id: 'jeans', name: '청바지', icon: '👖', slot: 'bottom', rarity: 'common', hp: 10, desc: '질긴 데님.' },
      { id: 'sneakers', name: '흰 운동화', icon: '👟', slot: 'shoes', rarity: 'common', hp: 5, power: 0.02, desc: '발이 가볍다.' },
      { id: 'workGloves', name: '목장갑', icon: '🧤', slot: 'gloves', rarity: 'common', power: 0.04, desc: '주먹이 덜 아프다.' },
      { id: 'silverChain', name: '은 목걸이', icon: '📿', slot: 'necklace', rarity: 'rare', hp: 10, power: 0.03, desc: '은은하게 빛난다.' },
      { id: 'luckyRing', name: '행운의 반지', icon: '💍', slot: 'ring', rarity: 'rare', power: 0.05, desc: '끼면 왠지 일이 잘 풀린다.' },
    ] satisfies EquipDef[]
  ).map((e) => [e.id, e]),
);

/** 처음 받는 기본 장비 8개 (칸마다 하나) */
export const STARTER_GEAR = ['woodBat', 'cap', 'hoodie', 'jeans', 'sneakers', 'workGloves', 'silverChain', 'luckyRing'];

export interface GearState {
  /** 가방에 있는 장비 id (같은 것 여러 개 가능) */
  owned: string[];
  equipped: Partial<Record<EquipSlot, string>>;
}

/** 장비 데이터가 없으면 기본 장비를 가방에 넣어 준다 */
export function ensureGear(p: PlayerProfile): GearState {
  return (p.gear ??= { owned: [...STARTER_GEAR], equipped: {} });
}

/** 낀 장비의 효과 합계 */
export function gearBonus(p: PlayerProfile) {
  let hp = 0;
  let power = 0;
  for (const id of Object.values(p.gear?.equipped ?? {})) {
    const e = id ? EQUIPS[id] : undefined;
    hp += e?.hp ?? 0;
    power += e?.power ?? 0;
  }
  return { hp, power };
}

/** 레벨 + 장비를 합친 최종 능력치 (도시·필드·보스 공통) */
export function playerStats(p: PlayerProfile) {
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
