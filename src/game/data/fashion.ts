import type { PlayerProfile } from '../core/profile';

/**
 * 옷가게 (상가 1층, 펫샵 옆): 싸울 때 쓰는 장비(data/equipment, 공격력·체력)와
 * 겉모습만 바꾸는 코디 옷을 판다. 코디는 능력치가 없고 장비와 따로 입는다 (장비창 오른쪽 칸).
 */
export const CLOTHES_SHOP_NAME = '스타일 하우스';

export type CosmeticSlot = 'hat' | 'glasses' | 'top' | 'bottom' | 'shoes' | 'bag' | 'tail';

export const COSMETIC_SLOTS: { id: CosmeticSlot; label: string; icon: string }[] = [
  { id: 'hat', label: '모자', icon: '🧢' },
  { id: 'glasses', label: '안경', icon: '🕶️' },
  { id: 'top', label: '상의', icon: '👕' },
  { id: 'bottom', label: '하의', icon: '👖' },
  { id: 'shoes', label: '신발', icon: '👟' },
  { id: 'bag', label: '가방', icon: '🎒' },
  { id: 'tail', label: '꼬리', icon: '🐰' },
];

/** 옷 무늬 (상의·하의) */
export type Pattern = 'solid' | 'stripe' | 'check' | 'dot';
/** 소품 모양 */
export type AccStyle = 'cap' | 'beanie' | 'bucket' | 'sunglasses' | 'round' | 'backpack' | 'mini' | 'bunny' | 'bunnyTail' | 'bikini';

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
  /** 여자 캐릭터만 입을 수 있다 (비키니) */
  femaleOnly?: boolean;
  /**
   * 갈아입는 옷: 몸(캐릭터 id) → 옷 파일. 색만 칠하는 대신 옷 자체를 바꿔 입는다 (상의 칸, 하의 칸까지 차지).
   * 옷은 그 캐릭터의 기본 몸에 맞춰 만든 것이라 목록에 있는 몸만 입을 수 있다 (scripts/outfit-transplant.mjs --garment)
   */
  garment?: Partial<Record<string, string>>;
  /** 진짜 옷 모양 (정하지 않으면 이름·칸으로 정한다, cutOf) */
  cut?: GarmentCut;
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
  // 토끼 머리띠 (모자 칸) · 토끼 꼬리 (꼬리 칸): color2 = 귀 안쪽 색
  C({ id: 'bunny-white', name: '화이트 토끼 머리띠', icon: '🐰', slot: 'hat', price: 240, color: 0xfbf8f4, color2: 0xf6b3c8, style: 'bunny', desc: '쫑긋 선 토끼 귀. 놀이공원 필수템.' }),
  C({ id: 'bunny-black', name: '블랙 토끼 머리띠', icon: '🐰', slot: 'hat', price: 240, color: 0x232127, color2: 0xe58fa8, style: 'bunny', desc: '시크한 검은 토끼.' }),
  // 비키니 (상의 칸): 입으면 원래 상의·하의·원피스를 감추고 몸에 수영복을 그린다. 하의 칸 코디는 무시. 여자 캐릭터만
  C({ id: 'set-sporty-white', name: '화이트 스포티 셋업', icon: '🎽', slot: 'top', price: 650, color: 0xf2f2f4, garment: { smallSilverGirl: '/garments/a3/silver-set.vrm' }, desc: '민소매 집업 + 반바지. 가볍게 뛰기 좋은 옷. (작은은발소녀 전용)' }),
  C({ id: 'set-denim-dress', name: '데님 재킷 원피스', icon: '👗', slot: 'top', price: 900, color: 0x9ab8d8, garment: { smallSilverGirl: '/garments/a3/pinky-denim.vrm' }, desc: '크림색 롱 원피스에 짧은 청재킷. 치마가 걸을 때 살랑인다. (작은은발소녀 전용)' }),
  // 진짜 옷 (옷 파일이 있는 몸): 원피스는 상의 칸이지만 하의까지 덮는다
  C({ id: 'dress-cream', name: '크림 롱 원피스', icon: '👗', slot: 'top', price: 520, color: 0xf3ead8, cut: 'dress', desc: '허리가 잘록한 민소매 원피스. 걸을 때 치마가 살랑인다.' }),
  C({ id: 'dress-black', name: '블랙 롱 원피스', icon: '👗', slot: 'top', price: 560, color: 0x26252b, cut: 'dress', desc: '어디 가든 단정한 검은 원피스.' }),
  C({ id: 'sandal-white', name: '화이트 스트랩 샌들', icon: '👡', slot: 'shoes', price: 170, color: 0xf6f3ee, desc: '발목 끈이 달린 여름 샌들.' }),
  C({ id: 'bikini-white', name: '화이트 비키니', icon: '👙', slot: 'top', price: 380, color: 0xf7f6f2, style: 'bikini', femaleOnly: true, desc: '여름 한강 수영장 갈 때. (여자 캐릭터만)' }),
  C({ id: 'tail-white', name: '화이트 토끼 꼬리', icon: '🐇', slot: 'tail', price: 200, color: 0xfbf8f4, style: 'bunnyTail', desc: '엉덩이에 달린 몽실몽실 솜뭉치.' }),
  C({ id: 'tail-pink', name: '핑크 토끼 꼬리', icon: '🐇', slot: 'tail', price: 200, color: 0xf7c3d4, style: 'bunnyTail', desc: '머리띠랑 맞춰 달면 더 귀엽다.' }),
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
  tail: { names: ['토끼 꼬리'], icon: '🐇', price: 200, styles: ['bunnyTail'] },
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

/** 안경원에서만 파는 안경 (옷가게 진열엔 없다) */
export const OPTICAL_GLASSES: CosmeticDef[] = [
  C({ id: 'round-black', name: '블랙 뿔테 안경', icon: '👓', slot: 'glasses', price: 140, color: 0x1b1b1f, style: 'round', desc: '공부 잘하게 생긴 뿔테.' }),
  C({ id: 'round-silver', name: '실버 동그란 안경', icon: '👓', slot: 'glasses', price: 170, color: 0xc0c4c9, style: 'round', desc: '가볍고 깔끔한 메탈 테.' }),
  C({ id: 'sun-pink', name: '핑크 틴트 선글라스', icon: '🕶️', slot: 'glasses', price: 230, color: 0xe86a9a, style: 'sunglasses', desc: '한강 피크닉 감성.' }),
  C({ id: 'sun-blue', name: '블루 미러 선글라스', icon: '🕶️', slot: 'glasses', price: 260, color: 0x2f7fd6, style: 'sunglasses', desc: '햇빛을 그대로 튕겨 낸다.' }),
  C({ id: 'sun-gold', name: '골드 보잉 선글라스', icon: '🕶️', slot: 'glasses', price: 300, color: 0xb8963e, style: 'sunglasses', desc: '영화 주인공처럼.' }),
];

const BASE_BY_ID: Record<string, CosmeticDef> = Object.fromEntries([...COSMETICS, ...OPTICAL_GLASSES].map((c) => [c.id, c]));
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

/** 남자 캐릭터 몸 (render/looks 의 BODY_TYPES id 와 같다) */
export const MALE_BODIES: readonly string[] = ['male', 'silverboy'];

/** VRoid 에서 내보낼 때 옷에 가려진 몸을 지운 모델 (옷을 감추면 몸통이 비어 보인다) */
const NO_BODY_UNDER_CLOTHES: readonly string[] = ['pink'];

/** 이 캐릭터가 못 입는 이유 (입을 수 있으면 null). 비키니는 여자 캐릭터만, 옷 속 몸이 있는 모델만 */
export function wearBlock(p: PlayerProfile, c: CosmeticDef): string | null {
  if (c.garment && !c.garment[p.body ?? 'female']) return '아직 이 캐릭터에 맞는 옷이 없어요';
  // 원피스·샌들처럼 진짜 옷으로만 있는 코디는 옷 파일이 있는 몸만
  if (c.cut && GARMENT_KITS[p.body ?? 'female']?.[c.cut] === undefined) return '아직 이 캐릭터에 맞는 옷이 없어요';
  if (!c.femaleOnly) return null;
  const body = p.body ?? 'female';
  if (MALE_BODIES.includes(body)) return '여자 캐릭터만 입을 수 있어요';
  if (NO_BODY_UNDER_CLOTHES.includes(body)) return '이 캐릭터는 모델에 옷 속 몸이 없어서 입을 수 없어요';
  return null;
}

export function canWear(p: PlayerProfile, c: CosmeticDef): boolean {
  return !wearBlock(p, c);
}

/** 남자 캐릭터로 바꿨을 때 못 입는 옷은 벗긴다 */
export function dropUnwearable(p: PlayerProfile): boolean {
  const w = ensureWardrobe(p);
  let changed = false;
  for (const [slot, id] of Object.entries(w.worn) as [CosmeticSlot, string][]) {
    const c = COSMETIC_BY_ID[id];
    if (c && !canWear(p, c)) {
      delete w.worn[slot];
      changed = true;
    }
  }
  return changed;
}

/** 코디 입기 (가진 옷만). 같은 칸 옷은 벗겨진다 */
export function wearCosmetic(p: PlayerProfile, id: string): boolean {
  const w = ensureWardrobe(p);
  const c = COSMETIC_BY_ID[id];
  if (!c || !w.owned.includes(id) || !canWear(p, c)) return false;
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

/** 입은 코디 중 갈아입는 옷이 있으면 이 몸에 맞는 옷 파일 주소 (없으면 null) */
export function garmentFor(ids: readonly string[], body: string): string | null {
  for (const id of ids) {
    const url = COSMETIC_BY_ID[id]?.garment?.[body];
    if (url) return url;
  }
  return null;
}

/* ───────── 진짜 옷 (옷 파일을 입는다) ─────────
 * 옷 파일이 마련된 몸은 상의·하의·신발 코디를 색만 칠하지 않고 진짜 옷(티셔츠·반바지·운동화 …)을 입고,
 * 그 옷에 코디 색·무늬를 입힌다. 옷 파일은 그 몸에 맞춰 만든 것 (scripts/outfit-transplant.mjs --garment)
 */
export type GarmentCut = 'tee' | 'shorts' | 'half' | 'long' | 'dress';

/**
 * 몸 → 옷 모양별 옷 파일. 여기 없는 몸은 예전처럼 기본 옷에 색만 칠한다.
 * 신발은 넣지 않는다: 작은은발소녀는 발 모양이 하이힐이라 납작한 신발을 신기면 찌그러진다 → 원래 구두에 색을 입힌다
 */
export const GARMENT_KITS: Partial<Record<string, Partial<Record<GarmentCut, string>>>> = {
  smallSilverGirl: {
    tee: '/garments/a3/tee.vrm',
    shorts: '/garments/a3/shorts.vrm',
    half: '/garments/a3/half-pants.vrm',
    // 긴바지: 옷 파일 없이 허리부터 발목까지 몸에 바지 색을 칠한다 (몸에 붙는 스키니 바지)
    long: '',
    dress: '/garments/a3/dress.vrm',
  },
};

/** 코디가 입는 옷 모양 (진짜 옷이 아닌 것 = null: 비키니·갈아입는 옷 세트·소품) */
export function cutOf(c: CosmeticDef): GarmentCut | null {
  if (c.cut) return c.cut;
  if (c.garment || c.style === 'bikini') return null;
  if (c.slot === 'top') return 'tee';
  if (c.slot === 'bottom') return /쇼츠|반바지|스커트/.test(c.name) ? 'shorts' : /와이드/.test(c.name) ? 'half' : 'long';
  return null;
}

export interface GarmentPiece {
  slot: 'top' | 'bottom';
  /** 옷 파일 ('' = 파일 없이 몸에 칠하기만: 긴바지) */
  url: string;
  cut: GarmentCut | null;
  /** 이 옷에 입힐 코디 색·무늬 (null = 옷 파일 원래 색: 기본 흰 티 · 검은 반바지) */
  cosmetic: CosmeticDef | null;
  /** 다리를 바지 색으로 칠한다 (긴바지) */
  legs?: number;
}

/**
 * 이 몸이 입을 옷 목록. 빈 목록 = 기본 옷 그대로. 상의나 하의 하나만 입으면 나머지는 기본 흰 티·검은 반바지.
 * 갈아입는 옷 세트(garment)는 상의·하의를 통째로 차지한다. 비키니·신발은 여기 없다 (몸·구두에 칠한다)
 */
export function garmentPieces(ids: readonly string[], body: string): GarmentPiece[] {
  const worn = new Map<CosmeticSlot, CosmeticDef>();
  for (const id of ids) {
    const c = COSMETIC_BY_ID[id];
    if (c) worn.set(c.slot, c);
  }
  const kit = GARMENT_KITS[body];
  const out: GarmentPiece[] = [];
  const top = worn.get('top');
  const bottom = worn.get('bottom');
  const set = top?.garment?.[body];
  if (set) out.push({ slot: 'top', url: set, cut: null, cosmetic: null });
  if (!kit) return out;
  const piece = (slot: GarmentPiece['slot'], c: CosmeticDef | null, fallback: GarmentCut) => {
    const cut = (c && cutOf(c)) || fallback;
    const url = kit[cut];
    if (url !== undefined) out.push({ slot, url, cut, cosmetic: c, ...(cut === 'long' && c ? { legs: c.color } : {}) });
  };
  const swim = top?.style === 'bikini';
  if (!set && !swim && (top || bottom)) {
    const dress = top && cutOf(top) === 'dress';
    piece('top', top ?? null, 'tee');
    if (!dress) piece('bottom', bottom ?? null, 'shorts');
  }
  return out;
}
