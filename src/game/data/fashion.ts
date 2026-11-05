import type { PlayerProfile } from '../core/profile';

/**
 * 옷가게 (상가 1층, 펫샵 옆): 싸울 때 쓰는 장비(data/equipment, 공격력·체력)와
 * 겉모습만 바꾸는 코디 옷을 판다. 코디는 능력치가 없고 장비와 따로 입는다 (장비창 오른쪽 칸).
 */
export const CLOTHES_SHOP_NAME = '스타일 하우스';

export type CosmeticSlot = 'hat' | 'glasses' | 'top' | 'bottom' | 'shoes' | 'bag';

export const COSMETIC_SLOTS: { id: CosmeticSlot; label: string; icon: string }[] = [
  { id: 'hat', label: '모자', icon: '🧢' },
  { id: 'glasses', label: '안경', icon: '🕶️' },
  { id: 'top', label: '상의', icon: '👕' },
  { id: 'bottom', label: '하의', icon: '👖' },
  { id: 'shoes', label: '신발', icon: '👟' },
  { id: 'bag', label: '가방', icon: '🎒' },
];

/** 옷 무늬 (상의·하의) */
export type Pattern = 'solid' | 'stripe' | 'check' | 'dot';
/** 소품 모양 */
export type AccStyle = 'cap' | 'beanie' | 'bucket' | 'sunglasses' | 'round' | 'backpack' | 'mini';

export interface CosmeticDef {
  id: string;
  name: string;
  icon: string;
  slot: CosmeticSlot;
  price: number;
  /** 주 색 */
  color: number;
  /** 무늬 색 (줄무늬·체크·물방울) */
  color2?: number;
  pattern?: Pattern;
  style?: AccStyle;
  desc: string;
}

const C = (d: CosmeticDef) => d;

export const COSMETICS: CosmeticDef[] = [
  // 모자
  C({ id: 'cap-black', name: '블랙 볼캡', icon: '🧢', slot: 'hat', price: 120, color: 0x22232a, style: 'cap', desc: '어디에나 어울리는 기본템.' }),
  C({ id: 'cap-red', name: '레드 볼캡', icon: '🧢', slot: 'hat', price: 120, color: 0xd8344a, style: 'cap', desc: '멀리서도 눈에 띈다.' }),
  C({ id: 'beanie-mint', name: '민트 비니', icon: '🧶', slot: 'hat', price: 150, color: 0x7fd6c2, style: 'beanie', desc: '포근한 니트 비니.' }),
  C({ id: 'beanie-gray', name: '그레이 비니', icon: '🧶', slot: 'hat', price: 150, color: 0x8e9196, style: 'beanie', desc: '꾸안꾸의 정석.' }),
  C({ id: 'bucket-beige', name: '베이지 버킷햇', icon: '👒', slot: 'hat', price: 180, color: 0xd9c3a0, style: 'bucket', desc: '한강 피크닉 필수템.' }),
  // 안경
  C({ id: 'sun-black', name: '블랙 선글라스', icon: '🕶️', slot: 'glasses', price: 200, color: 0x111114, style: 'sunglasses', desc: '눈부신 날엔 이거.' }),
  C({ id: 'round-gold', name: '골드 동그란 안경', icon: '👓', slot: 'glasses', price: 160, color: 0xc9a24a, style: 'round', desc: '지적인 분위기.' }),
  // 상의
  C({ id: 'tee-white', name: '화이트 티셔츠', icon: '👕', slot: 'top', price: 60, color: 0xffffff, desc: '깨끗한 기본 티.' }),
  C({ id: 'tee-black', name: '블랙 티셔츠', icon: '👕', slot: 'top', price: 80, color: 0x2a2b31, desc: '시크하게.' }),
  C({ id: 'tee-sky', name: '스카이 티셔츠', icon: '👕', slot: 'top', price: 80, color: 0x8ec5f2, desc: '맑은 하늘색.' }),
  C({ id: 'tee-pink', name: '핑크 티셔츠', icon: '👚', slot: 'top', price: 80, color: 0xf5a3c0, desc: '봄 느낌 물씬.' }),
  C({ id: 'tee-yellow', name: '옐로 티셔츠', icon: '👕', slot: 'top', price: 80, color: 0xf6d35b, desc: '기분까지 밝아진다.' }),
  C({ id: 'stripe-navy', name: '네이비 스트라이프 티', icon: '👕', slot: 'top', price: 140, color: 0xffffff, color2: 0x24365e, pattern: 'stripe', desc: '마린룩 줄무늬.' }),
  C({ id: 'check-red', name: '레드 체크 셔츠', icon: '👔', slot: 'top', price: 180, color: 0xc0392b, color2: 0x2a1a1a, pattern: 'check', desc: '빈티지 깅엄 체크.' }),
  C({ id: 'dot-white', name: '도트 블라우스', icon: '👚', slot: 'top', price: 160, color: 0xfff8ef, color2: 0x2a2b31, pattern: 'dot', desc: '귀여운 물방울 무늬.' }),
  // 하의
  C({ id: 'pants-denim', name: '연청 데님', icon: '👖', slot: 'bottom', price: 120, color: 0x6f95c8, desc: '데일리 청바지.' }),
  C({ id: 'pants-beige', name: '베이지 면바지', icon: '👖', slot: 'bottom', price: 110, color: 0xd8c29b, desc: '깔끔한 치노.' }),
  C({ id: 'pants-white', name: '화이트 팬츠', icon: '👖', slot: 'bottom', price: 120, color: 0xf2efe8, desc: '여름엔 화이트.' }),
  C({ id: 'pants-khaki', name: '카키 카고', icon: '👖', slot: 'bottom', price: 130, color: 0x7c7f4e, desc: '주머니가 많다.' }),
  C({ id: 'skirt-check', name: '체크 쇼츠', icon: '🩳', slot: 'bottom', price: 170, color: 0x8a2c3c, color2: 0x1d1a24, pattern: 'check', desc: '교복 느낌 타탄 체크.' }),
  // 신발
  C({ id: 'shoes-white', name: '화이트 스니커즈', icon: '👟', slot: 'shoes', price: 150, color: 0xf4f4f4, desc: '흰 운동화는 진리.' }),
  C({ id: 'shoes-red', name: '레드 하이탑', icon: '👟', slot: 'shoes', price: 180, color: 0xd8344a, desc: '농구화 감성.' }),
  C({ id: 'shoes-brown', name: '브라운 로퍼', icon: '👞', slot: 'shoes', price: 200, color: 0x7a4a2a, desc: '단정한 가죽 로퍼.' }),
  // 가방
  C({ id: 'bag-navy', name: '네이비 백팩', icon: '🎒', slot: 'bag', price: 220, color: 0x2b3a5e, style: 'backpack', desc: '책도 노트북도 쏙.' }),
  C({ id: 'bag-yellow', name: '옐로 백팩', icon: '🎒', slot: 'bag', price: 220, color: 0xf2c230, style: 'backpack', desc: '소풍 가는 날.' }),
  C({ id: 'bag-mini', name: '미니 가죽 백팩', icon: '👜', slot: 'bag', price: 260, color: 0x8a5a3a, style: 'mini', desc: '작고 귀여운 가죽 가방.' }),
];

/* ───────── 매일 들어오는 신상 ─────────
 * 날짜(한국 시간)로 정해지는 옷 8벌이 매일 새로 들어온다. 친구들도 같은 날엔 같은 신상을 본다.
 * id 에 날짜와 번호가 들어 있어서 (n20261102-3) 언제 산 옷이든 id 만으로 다시 만들 수 있다.
 */

/** 신상이 가게에 걸려 있는 날 수 (오늘 포함) */
export const NEW_ARRIVAL_DAYS = 3;
const DAILY_COUNT = 8;
const DAILY_SLOTS: CosmeticSlot[] = ['top', 'bottom', 'hat', 'shoes', 'top', 'bag', 'glasses', 'bottom'];

const COLORS: { name: string; hex: number }[] = [
  { name: '라벤더', hex: 0xb7a3e0 }, { name: '버터', hex: 0xf3dd8a }, { name: '세이지', hex: 0x9db59a },
  { name: '코랄', hex: 0xf28b74 }, { name: '버건디', hex: 0x7a2236 }, { name: '차콜', hex: 0x3a3c44 },
  { name: '아이보리', hex: 0xf4eedf }, { name: '올리브', hex: 0x6f7340 }, { name: '스카이', hex: 0x8fc7ef },
  { name: '로즈', hex: 0xe58fa8 }, { name: '테라코타', hex: 0xc4673f }, { name: '네이비', hex: 0x24365e },
  { name: '민트', hex: 0x8fdcc6 }, { name: '머스터드', hex: 0xd6a62c }, { name: '라일락', hex: 0xd2b3e8 },
  { name: '카멜', hex: 0xb98552 }, { name: '포레스트', hex: 0x2f5a43 }, { name: '체리', hex: 0xc8233c },
  { name: '그레이', hex: 0x9a9da4 }, { name: '블랙', hex: 0x1f2026 }, { name: '피치', hex: 0xf6b99a },
  { name: '코발트', hex: 0x2f56c8 }, { name: '크림', hex: 0xf7e8c8 }, { name: '모카', hex: 0x6e4b3a },
];
const PATTERN_NAMES: Record<Pattern, string> = { solid: '', stripe: '스트라이프', check: '체크', dot: '도트' };
const KIND: Record<CosmeticSlot, { names: string[]; icon: string; price: number; styles?: AccStyle[] }> = {
  top: { names: ['티셔츠', '맨투맨', '니트', '셔츠', '크롭 티', '오버핏 티'], icon: '👕', price: 90 },
  bottom: { names: ['와이드 팬츠', '조거 팬츠', '쇼츠', '슬랙스', '카고 팬츠'], icon: '👖', price: 120 },
  hat: { names: ['볼캡', '비니', '버킷햇'], icon: '🧢', price: 140, styles: ['cap', 'beanie', 'bucket'] },
  glasses: { names: ['선글라스', '동그란 안경'], icon: '🕶️', price: 170, styles: ['sunglasses', 'round'] },
  shoes: { names: ['스니커즈', '하이탑', '로퍼', '러닝화'], icon: '👟', price: 150 },
  bag: { names: ['백팩', '미니 백팩'], icon: '🎒', price: 210, styles: ['backpack', 'mini'] },
};
const DESCS = ['오늘 막 들어온 신상!', '이번 주 인기 예감.', '한정 수량이에요.', '요즘 제일 핫한 색.', '데일리로 딱.', '코디하기 쉬운 신상.', '사진 잘 받는 색감.', '친구랑 맞춰 입기 좋아요.'];

/** 날짜 키 (한국 시간 기준 YYYYMMDD) */
export function dayKey(d = new Date(), back = 0): string {
  const k = new Date(d.getTime() + 9 * 3600_000 - back * 86_400_000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
}

/** 날짜·번호로 항상 같은 값이 나오는 난수 */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** 그날 신상 한 벌 (id 형식: n20261102-3) */
function dailyItem(key: string, n: number): CosmeticDef | undefined {
  if (!/^\d{8}$/.test(key) || n < 0 || n >= DAILY_COUNT) return undefined;
  const r = rng(`${key}:${n}`);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const slot = DAILY_SLOTS[n];
  const kind = KIND[slot];
  const ki = Math.floor(r() * kind.names.length);
  const col = pick(COLORS);
  let col2 = pick(COLORS);
  if (col2.hex === col.hex) col2 = COLORS[(COLORS.indexOf(col) + 7) % COLORS.length];
  const patterned = slot === 'top' || slot === 'bottom';
  const pattern: Pattern = patterned ? pick<Pattern>(['solid', 'solid', 'stripe', 'check', 'dot']) : 'solid';
  const style = kind.styles ? kind.styles[ki % kind.styles.length] : undefined;
  const pname = PATTERN_NAMES[pattern];
  const price = Math.round((kind.price + (pattern !== 'solid' ? 50 : 0) + Math.floor(r() * 6) * 10) / 10) * 10;
  return {
    id: `n${key}-${n}`,
    name: `${col.name} ${pname ? pname + ' ' : ''}${kind.names[ki]}`,
    icon: slot === 'hat' && style === 'beanie' ? '🧶' : slot === 'glasses' && style === 'round' ? '👓' : slot === 'bag' && style === 'mini' ? '👜' : kind.icon,
    slot,
    price,
    color: col.hex,
    ...(pattern !== 'solid' ? { color2: col2.hex, pattern } : {}),
    ...(style ? { style } : {}),
    desc: `${Number(key.slice(4, 6))}월 ${Number(key.slice(6))}일 신상 · ${pick(DESCS)}`,
  };
}

/** 그날 들어온 신상 전부 */
export function dailyCosmetics(key: string): CosmeticDef[] {
  return Array.from({ length: DAILY_COUNT }, (_, n) => dailyItem(key, n)!).filter(Boolean);
}

/** 오늘 들어온 신상인가 */
export function isNewToday(id: string, now = new Date()) {
  return id.startsWith(`n${dayKey(now)}-`);
}

/** 지금 가게에 걸린 코디 옷: 최근 며칠 신상(새것부터) + 기본 옷 */
export function shopCosmetics(now = new Date()): CosmeticDef[] {
  const fresh: CosmeticDef[] = [];
  for (let b = 0; b < NEW_ARRIVAL_DAYS; b++) fresh.push(...dailyCosmetics(dayKey(now, b)));
  return [...fresh, ...COSMETICS];
}

const BASE_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
const dailyCache = new Map<string, CosmeticDef | undefined>();

/** 옷 id → 옷 (기본 옷 + 지난 신상까지 id 로 다시 만들어 찾는다) */
export const COSMETIC_BY_ID: Record<string, CosmeticDef> = new Proxy(BASE_BY_ID, {
  get(base, id) {
    if (typeof id !== 'string') return undefined;
    if (id in base) return base[id];
    if (!dailyCache.has(id)) {
      const m = /^n(\d{8})-(\d)$/.exec(id);
      dailyCache.set(id, m ? dailyItem(m[1], Number(m[2])) : undefined);
    }
    return dailyCache.get(id);
  },
  has(base, id) {
    return typeof id === 'string' && (id in base || /^n\d{8}-\d$/.test(id));
  },
});

export interface Wardrobe {
  /** 가진 코디 옷 id (한 벌씩) */
  owned: string[];
  /** 지금 입은 코디 (칸마다 하나, 없으면 기본 옷) */
  worn: Partial<Record<CosmeticSlot, string>>;
}

export function ensureWardrobe(p: PlayerProfile): Wardrobe {
  return (p.wardrobe ??= { owned: [], worn: {} });
}

/** 코디 입기 (가진 옷만). 같은 칸 옷은 벗겨진다 */
export function wearCosmetic(p: PlayerProfile, id: string): boolean {
  const w = ensureWardrobe(p);
  const c = COSMETIC_BY_ID[id];
  if (!c || !w.owned.includes(id)) return false;
  w.worn[c.slot] = id;
  return true;
}

export function takeOffCosmetic(p: PlayerProfile, slot: CosmeticSlot): boolean {
  const w = ensureWardrobe(p);
  if (!w.worn[slot]) return false;
  delete w.worn[slot];
  return true;
}

/** 입은 코디 id 목록 (친구에게 보내고, 모양이 바뀌었는지 비교할 때) */
export function wornList(w: Wardrobe | undefined): string[] {
  if (!w) return [];
  return COSMETIC_SLOTS.map((s) => w.worn[s.id]).filter((x): x is string => !!x && !!COSMETIC_BY_ID[x]);
}
