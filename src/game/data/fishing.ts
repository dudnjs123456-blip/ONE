import type { PlayerProfile } from '../core/profile';

/**
 * 한강 낚시: 물고기 · 낚싯대 · 미끼 데이터와 확률 계산.
 * 화면(도감 · 확률표)과 실제 낚시(city/fishing.ts)가 같은 함수를 써서, 보이는 확률이 곧 실제 확률이다.
 *
 * 입질 확률 = 기본 가중치 × 미끼 궁합 × 시간대 × 행운(낚싯대 + 미끼) → 전체 합으로 나눈 비율
 * 힘겨루기 = (내 공격력 × 낚싯대 힘) ÷ 물고기 힘 이 클수록 한 번 감을 때 많이 끌려온다
 */

export const FISHING_SHOP_NAME = '한강 낚시마트';

export type FishTier = 'junk' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';

export const TIERS: FishTier[] = ['junk', 'common', 'uncommon', 'rare', 'epic', 'legend'];

export const TIER_INFO: Record<FishTier, { label: string; color: string; stars: number; exp: number; luck: number; hook: number }> = {
  junk: { label: '잡동사니', color: '#9ca3af', stars: 0, exp: 1, luck: -0.5, hook: 1.1 },
  common: { label: '흔함', color: '#e5e7eb', stars: 1, exp: 3, luck: 0, hook: 1.0 },
  uncommon: { label: '보통', color: '#4ade80', stars: 2, exp: 8, luck: 0.5, hook: 0.9 },
  rare: { label: '희귀', color: '#60a5fa', stars: 3, exp: 20, luck: 1, hook: 0.8 },
  epic: { label: '매우 희귀', color: '#c084fc', stars: 4, exp: 60, luck: 1.6, hook: 0.7 },
  legend: { label: '전설', color: '#fbbf24', stars: 5, exp: 250, luck: 2.2, hook: 0.6 },
};

export type BaitId = 'worm' | 'paste' | 'shrimp' | 'lure' | 'golden';

export interface BaitDef {
  id: BaitId;
  name: string;
  icon: string;
  /** 한 번에 사는 묶음 가격 · 개수 */
  price: number;
  pack: number;
  /** 입질까지 기다리는 시간 배율 (작을수록 빨리 문다) */
  speed: number;
  /** 행운 (희귀한 물고기가 더 잘 문다) */
  luck: number;
  /** 루어: 물고기가 물어도 없어지지 않는다 (줄이 끊어지면 잃는다) */
  reusable?: boolean;
  desc: string;
}

export const BAITS: BaitDef[] = [
  { id: 'worm', name: '지렁이', icon: '🐛', price: 30, pack: 10, speed: 1, luck: 0, desc: '뭐든 무는 만능 미끼. 피라미·붕어부터 밤의 메기·장어까지.' },
  { id: 'paste', name: '떡밥', icon: '🥣', price: 40, pack: 10, speed: 0.8, luck: 0, desc: '냄새로 고기를 모은다 (입질이 빠르다). 붕어·잉어·초어가 좋아한다.' },
  { id: 'shrimp', name: '민물새우', icon: '🦐', price: 80, pack: 10, speed: 1.15, luck: 0.1, desc: '큰 고기가 노리는 미끼. 메기·장어·강준치·철갑상어.' },
  { id: 'lure', name: '스피너 루어', icon: '🌀', price: 300, pack: 1, speed: 1.2, luck: 0.05, reusable: true, desc: '한 번 사면 계속 쓴다 (줄이 끊어지면 잃는다). 배스·쏘가리·끄리 같은 사냥꾼만 문다.' },
  { id: 'golden', name: '황금 떡밥', icon: '✨', price: 400, pack: 5, speed: 0.9, luck: 0.6, desc: '비싸지만 희귀·전설급이 확 잘 문다.' },
];
export const BAIT_BY_ID = Object.fromEntries(BAITS.map((b) => [b.id, b])) as Record<BaitId, BaitDef>;

export interface RodDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  /** 감는 힘 배율 (내 공격력에 곱한다) */
  power: number;
  /** 줄 강도: 클수록 한 번 감을 때 장력이 덜 오른다 */
  line: number;
  /** 행운 (희귀한 물고기 · 큰 개체) */
  luck: number;
  /** 던지는 거리 (m, 보기용) */
  cast: number;
  /** 낚싯대 색 */
  color: number;
  desc: string;
}

export const RODS: RodDef[] = [
  { id: 'bamboo', name: '대나무 낚싯대', icon: '🎋', price: 200, power: 1, line: 1, luck: 0, cast: 7, color: 0xc8a25a, desc: '할아버지가 쓰던 그 낚싯대. 피라미·붕어엔 충분하다.' },
  { id: 'carbon', name: '카본 민물대', icon: '🎣', price: 1200, power: 1.35, line: 1.3, luck: 0.15, cast: 9, color: 0x2b2d33, desc: '가볍고 질기다. 잉어·메기에 도전할 수 있다.' },
  { id: 'surf', name: '원투 릴낚싯대', icon: '🎣', price: 3500, power: 1.8, line: 1.75, luck: 0.35, cast: 13, color: 0x1f5fbf, desc: '멀리 던져 깊은 물의 큰 고기를 노린다.' },
  { id: 'pro', name: '프로 마스터 릴', icon: '🎣', price: 9000, power: 2.4, line: 2.4, luck: 0.6, cast: 15, color: 0xb3261e, desc: '대회용. 철갑상어와도 겨룰 수 있다.' },
  { id: 'legend', name: '강태공의 대', icon: '🏆', price: 25000, power: 3.2, line: 3.2, luck: 1, cast: 17, color: 0xd4a017, desc: '세월을 낚던 전설의 낚싯대. 1m 넘는 대두어도 끌어올릴 수 있다.' },
];
export const ROD_BY_ID = Object.fromEntries(RODS.map((r) => [r.id, r])) as Record<string, RodDef>;

/** 물고기 모양 (모델용) */
export type FishShape = 'slim' | 'deep' | 'carp' | 'cat' | 'eel' | 'puffer' | 'sturgeon' | 'boot' | 'can';

export interface FishDef {
  id: string;
  name: string;
  icon: string;
  tier: FishTier;
  /** 무게 범위 (kg) */
  kg: [number, number];
  /** 힘 (평균 크기 기준). 클수록 힘겨루기가 어렵다 */
  power: number;
  /** 기본 가중치 (클수록 자주 문다) */
  weight: number;
  /** 미끼 궁합 (없으면 0.4). 루어는 사냥꾼만 문다 */
  bait: Partial<Record<BaitId, number>>;
  /** 시간대 배율 */
  night?: number;
  day?: number;
  /** 평균 크기일 때 파는 값 (G) */
  price: number;
  /** 천연기념물: 사진만 찍고 바로 놓아준다 (도감·경험치만) */
  protect?: boolean;
  shape: FishShape;
  color: number;
  color2: number;
  desc: string;
  /** 도감에서 아직 못 잡았을 때 보이는 힌트 */
  hint: string;
}

const f = (x: FishDef) => x;

export const FISH: FishDef[] = [
  // 잡동사니
  f({ id: 'boot', name: '낡은 장화', icon: '👢', tier: 'junk', kg: [0.6, 1.2], power: 0.35, weight: 6, bait: { worm: 1, paste: 1, shrimp: 1, lure: 0.8, golden: 1 }, price: 1, shape: 'boot', color: 0x3b3a36, color2: 0x23221f, desc: '누가 한강에 장화를 버렸을까… 물이 가득 찼다.', hint: '물고기가 아닌 무언가' }),
  f({ id: 'can', name: '빈 깡통', icon: '🥫', tier: 'junk', kg: [0.05, 0.2], power: 0.2, weight: 5, bait: { worm: 1, paste: 1, shrimp: 1, lure: 0.8, golden: 1 }, price: 1, shape: 'can', color: 0xb8bcc2, color2: 0xc0392b, desc: '분리수거는 제대로 하자.', hint: '물고기가 아닌 무언가' }),
  // 흔함
  f({ id: 'pirami', name: '피라미', icon: '🐟', tier: 'common', kg: [0.01, 0.06], power: 0.3, weight: 26, bait: { worm: 1.4, paste: 1, shrimp: 0.6, lure: 0.3, golden: 1 }, price: 4, shape: 'slim', color: 0xc9d4dc, color2: 0x7aa0c4, desc: '한강 어디에나 있는 날쌘 은빛 물고기. 수컷은 혼인색이 화려하다.', hint: '가장 흔한 은빛 꼬마' }),
  f({ id: 'bluegill', name: '블루길', icon: '🐟', tier: 'common', kg: [0.05, 0.35], power: 0.45, weight: 20, bait: { worm: 1.3, paste: 0.8, shrimp: 1, lure: 0.6, golden: 1 }, price: 6, shape: 'deep', color: 0x6f8c5a, color2: 0x2f4f8f, desc: '아가미 끝이 파란 외래종. 생태계 교란종이라 잡을수록 좋다.', hint: '아가미에 파란 점' }),
  f({ id: 'crucian', name: '붕어', icon: '🐟', tier: 'common', kg: [0.15, 1.2], power: 0.6, weight: 22, bait: { worm: 1.2, paste: 1.6, shrimp: 0.5, lure: 0.1, golden: 1.2 }, price: 12, shape: 'deep', color: 0x9a8a55, color2: 0x6b5a2e, desc: '낚시의 시작이자 끝. 손바닥만 하면 "손맛 봤다", 30cm 넘으면 "월척".', hint: '떡밥을 좋아하는 낚시꾼의 친구' }),
  // 보통
  f({ id: 'nuchi', name: '누치', icon: '🐟', tier: 'uncommon', kg: [0.5, 2.5], power: 1, weight: 10, bait: { worm: 1, paste: 1.4, shrimp: 0.8, lure: 0.2, golden: 1.2 }, price: 30, shape: 'slim', color: 0xb9b2a0, color2: 0x7d7562, desc: '바닥을 훑고 다니는 큰 잉어과 물고기. 의외로 힘이 세다.', hint: '바닥을 훑는 길쭉한 녀석' }),
  f({ id: 'kkeuri', name: '끄리', icon: '🐟', tier: 'uncommon', kg: [0.2, 1], power: 0.9, weight: 9, bait: { worm: 0.8, shrimp: 0.8, lure: 1.6, golden: 1 }, price: 25, shape: 'slim', color: 0xa7b7c8, color2: 0x50607a, desc: '입이 삐뚤어진 사냥꾼. 루어를 쫓아와 덥석 문다.', hint: '움직이는 미끼를 쫓는다' }),
  f({ id: 'bass', name: '배스', icon: '🐟', tier: 'uncommon', kg: [0.3, 3], power: 1.3, weight: 9, bait: { worm: 0.6, shrimp: 1, lure: 2.2, golden: 1 }, price: 45, shape: 'deep', color: 0x667c3e, color2: 0x2c3a1c, desc: '입이 큰 외래 포식자. 루어 낚시꾼들의 단골 손님.', hint: '루어에 환장하는 큰 입' }),
  f({ id: 'carp', name: '잉어', icon: '🐟', tier: 'uncommon', kg: [1, 8], power: 1.5, weight: 8, bait: { worm: 0.7, paste: 1.8, shrimp: 0.5, golden: 1.3 }, price: 60, shape: 'carp', color: 0xb08a3e, color2: 0x6d5222, desc: '수염 달린 한강의 터줏대감. 크면 팔이 빠질 듯 당긴다.', hint: '수염 달린 황금빛 덩치' }),
  f({ id: 'bagrid', name: '동자개', icon: '🐟', tier: 'uncommon', kg: [0.1, 0.6], power: 1, weight: 7, bait: { worm: 1.6, paste: 0.5, shrimp: 1.4, lure: 0.2, golden: 1.1 }, night: 2, price: 40, shape: 'cat', color: 0xb8952e, color2: 0x3b2f12, desc: '"빠가빠가" 소리를 내서 빠가사리라고도 부르는 노란 메기과 물고기. 지느러미 가시를 조심!', hint: '잡으면 빠가빠가 우는 녀석' }),
  f({ id: 'mullet', name: '숭어', icon: '🐟', tier: 'uncommon', kg: [0.5, 3], power: 1.4, weight: 5, bait: { worm: 0.9, paste: 1.3, shrimp: 0.8, lure: 0.3, golden: 1.1 }, price: 50, shape: 'slim', color: 0xaab4bd, color2: 0x46525e, desc: '바다와 강을 오가는 물고기. 한강 하류에서 수면 위로 펄쩍펄쩍 뛰어오른다.', hint: '바다에서 올라와 펄쩍 뛰는 녀석' }),
  // 희귀
  f({ id: 'catfish', name: '메기', icon: '🐟', tier: 'rare', kg: [1, 10], power: 1.9, weight: 3.5, bait: { worm: 1.2, paste: 0.4, shrimp: 1.8, lure: 0.6, golden: 1.4 }, night: 2.5, price: 120, shape: 'cat', color: 0x4a4a3c, color2: 0x2a2a20, desc: '밤이 되면 바닥에서 올라와 먹이를 찾는다. 긴 수염이 트레이드마크.', hint: '밤에 새우를 노리는 수염' }),
  f({ id: 'junchi', name: '강준치', icon: '🐟', tier: 'rare', kg: [1, 5], power: 1.7, weight: 3.5, bait: { worm: 0.6, shrimp: 1.4, lure: 1.6, golden: 1.3 }, price: 100, shape: 'slim', color: 0xdfe6ea, color2: 0x8fa3b0, desc: '1m 가까이 크는 은빛 칼. 수면 근처를 빠르게 휘젓는다.', hint: '은빛 칼처럼 긴 몸' }),
  f({ id: 'mandarin', name: '쏘가리', icon: '🐟', tier: 'rare', kg: [0.3, 2.5], power: 1.9, weight: 2.2, bait: { worm: 0.5, shrimp: 1.2, lure: 2.6, golden: 1.3 }, day: 1.3, price: 200, shape: 'deep', color: 0x9a8a4a, color2: 0x3b3320, desc: '얼룩무늬 민물의 제왕. 바위틈에 숨어 있다가 루어를 덮친다.', hint: '얼룩무늬 바위틈의 제왕' }),
  f({ id: 'eel', name: '뱀장어', icon: '🐍', tier: 'rare', kg: [0.3, 2], power: 2.2, weight: 2, bait: { worm: 1.6, shrimp: 1.6, golden: 1.3 }, night: 3, day: 0.3, price: 250, shape: 'eel', color: 0x3d4a33, color2: 0xc9c08a, desc: '바다에서 강을 거슬러 올라온 장어. 밤에만 움직이고, 몸을 비틀며 버틴다.', hint: '밤에만 나오는 긴 몸' }),
  f({ id: 'snakehead', name: '가물치', icon: '🐟', tier: 'rare', kg: [1, 6], power: 2.1, weight: 2.2, bait: { worm: 0.8, shrimp: 0.8, lure: 2.4, golden: 1.3 }, day: 1.2, price: 180, shape: 'slim', color: 0x4d4a35, color2: 0x1f1d14, desc: '뱀 같은 얼룩무늬의 수면 사냥꾼. 공기 호흡을 해서 물 밖에서도 한참 버티는 끈질긴 녀석.', hint: '뱀 무늬의 끈질긴 사냥꾼' }),
  // 매우 희귀
  f({ id: 'grasscarp', name: '초어', icon: '🐟', tier: 'epic', kg: [5, 30], power: 3, weight: 0.6, bait: { worm: 0.5, paste: 2.2, golden: 1.6 }, price: 600, shape: 'carp', color: 0x8a8f6a, color2: 0x4d5238, desc: '1m가 넘게 자라는 풀 먹는 거대 잉어. 걸리면 한참을 끌고 다닌다.', hint: '떡밥에 오는 1m짜리 거인' }),
  f({ id: 'puffer', name: '황복', icon: '🐡', tier: 'epic', kg: [0.5, 2], power: 2.4, weight: 0.5, bait: { worm: 1, shrimp: 1.8, golden: 1.6 }, price: 900, shape: 'puffer', color: 0xd9b84a, color2: 0x4a4636, desc: '봄이면 바다에서 한강으로 올라오는 귀한 복어. 화나면 배를 부풀린다.', hint: '배를 부풀리는 노란 손님' }),
  f({ id: 'goldmandarin', name: '황쏘가리', icon: '🌟', tier: 'epic', kg: [0.5, 2.5], power: 2.6, weight: 0.25, bait: { shrimp: 1, lure: 3, golden: 1.6 }, day: 1.3, price: 0, protect: true, shape: 'deep', color: 0xf2c230, color2: 0xd98a1a, desc: '천연기념물! 사진만 찍고 바로 놓아준다 (도감과 경험치만 얻는다).', hint: '황금빛 천연기념물' }),
  // 전설
  f({ id: 'sturgeon', name: '철갑상어', icon: '🦈', tier: 'legend', kg: [20, 80], power: 5, weight: 0.12, bait: { worm: 0.6, paste: 0.6, shrimp: 2, golden: 2 }, price: 5000, shape: 'sturgeon', color: 0x5f6670, color2: 0xd8d4c8, desc: '공룡 시대부터 살아온 갑옷 물고기. 한강에서 봤다는 소문이 있었다.', hint: '갑옷을 입은 고대의 물고기' }),
  f({ id: 'bighead', name: '대두어', icon: '🐟', tier: 'legend', kg: [15, 45], power: 6.2, weight: 0.04, bait: { worm: 0.3, paste: 2.2, shrimp: 0.3, golden: 2.5 }, price: 12000, shape: 'carp', color: 0x8d9296, color2: 0x4e5559, desc: '머리가 몸의 3분의 1이나 되는 거대 잉어과 물고기 (Bighead carp). 1m 넘게 자라고, 한강에서도 40kg 넘는 개체가 잡힌 적이 있다.', hint: '머리가 엄청 큰 거대 잉어' }),
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((x) => [x.id, x])) as Record<string, FishDef>;

// ───────────── 시간대 ─────────────

export type TimeBand = 'dawn' | 'day' | 'dusk' | 'night';

export const TIME_LABEL: Record<TimeBand, string> = { dawn: '🌅 새벽 물때', day: '☀️ 낮', dusk: '🌇 해질녘 물때', night: '🌙 밤' };

/** 게임 시각(분) → 시간대. 새벽 5~7시 · 해질녘 17~19시는 '물때'라 입질이 빠르다 */
export function timeBand(minutes: number): TimeBand {
  const h = (minutes / 60) % 24;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

/** 물고기의 시간대 배율 (물때는 밤·낮 반반) */
export function timeMult(fish: FishDef, band: TimeBand): number {
  const n = fish.night ?? 1;
  const d = fish.day ?? 1;
  return band === 'night' ? n : band === 'day' ? d : (n + d) / 2;
}

// ───────────── 확률 ─────────────

export interface FishSetup {
  rod: RodDef;
  bait: BaitDef;
  band: TimeBand;
  /** 비 세기 0~1 (비 오는 날은 입질이 최대 25% 빨라진다) */
  rain?: number;
}

/** 행운 합계 (낚싯대 + 미끼) */
export const setupLuck = (s: FishSetup) => s.rod.luck + s.bait.luck;

/** 이 조합에서 한 종류의 가중치 */
export function fishWeight(fish: FishDef, s: FishSetup): number {
  const bait = fish.bait[s.bait.id] ?? (s.bait.id === 'lure' ? 0.02 : 0.4);
  const luck = Math.max(0.2, 1 + setupLuck(s) * TIER_INFO[fish.tier].luck);
  return fish.weight * bait * timeMult(fish, s.band) * luck;
}

export interface BiteOdds {
  fish: FishDef;
  /** 입질 중 이 물고기일 확률 (0~1) */
  p: number;
}

/** 입질이 왔을 때 무엇일지 확률표 (합 = 1) */
export function biteTable(s: FishSetup): BiteOdds[] {
  const ws = FISH.map((fish) => ({ fish, w: fishWeight(fish, s) }));
  const sum = ws.reduce((a, b) => a + b.w, 0);
  return ws.map(({ fish, w }) => ({ fish, p: w / sum }));
}

/** 입질까지 평균 기다리는 시간 (초): 최소 2.5초 + 평균 9초 × 미끼 · 물때 */
export function biteWait(s: FishSetup): { min: number; mean: number } {
  const tide = s.band === 'dawn' || s.band === 'dusk' ? 0.75 : s.band === 'night' ? 0.9 : 1;
  const rain = 1 - (s.rain ?? 0) * 0.25;
  return { min: 2.5, mean: 9 * s.bait.speed * tide * rain };
}

/** 크기 뽑기: 대부분 작은 쪽, 행운이 높을수록 큰 개체가 잘 나온다 */
export function rollKg(fish: FishDef, luck: number, rnd: () => number): number {
  const u = Math.pow(rnd(), 1.8 / (1 + luck * 0.6));
  const kg = fish.kg[0] + (fish.kg[1] - fish.kg[0]) * u;
  return Math.round(kg * (kg < 1 ? 1000 : 100)) / (kg < 1 ? 1000 : 100);
}

export const midKg = (fish: FishDef) => (fish.kg[0] + fish.kg[1]) / 2;

/** 이 개체의 힘 (큰 개체일수록 세다) */
export function fishStrength(fish: FishDef, kg: number): number {
  return fish.power * Math.max(0.6, Math.min(1.6, Math.sqrt(kg / midKg(fish))));
}

/** 파는 값 (G): 큰 개체일수록 비싸다 */
export function sellPrice(fish: FishDef, kg: number): number {
  if (fish.protect || fish.price <= 0) return 0;
  return Math.max(1, Math.round(fish.price * Math.pow(kg / midKg(fish), 0.8)));
}

/** 크기 표시 (1kg 미만은 g) */
export function fmtKg(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)}g` : `${kg.toFixed(kg < 10 ? 2 : 1)}kg`;
}

// ───────────── 힘겨루기 규칙 (city/fishing.ts 와 도감 '쉬움/어려움' 이 같이 쓴다) ─────────────

export const FIGHT = {
  /** 처음 끌어온 거리 (%) */
  start: 25,
  /** 한 번 감을 때 끌려오는 거리 = gain × 힘비 (%) */
  gain: 2,
  /** 한 번 감을 때 오르는 장력 = tap × √물고기힘 ÷ 줄강도 */
  tap: 5.5,
  /** 장력이 저절로 풀리는 속도 (/초): 최대 체력이 높을수록 빨리 풀린다 */
  relax: 32,
  /** 물고기가 버티는 힘 (%/초) = pullBase + pullK × 물고기힘^0.8 (지칠수록 tired 배까지 약해진다) */
  pullBase: 3,
  pullK: 3.2,
  tired: 0.7,
  /** 바늘털이: shakeAfter 초가 지나면 초마다 shake × (지난 초) 확률로 바늘이 빠진다 */
  shakeAfter: 25,
  shake: 0.004,
  /** 차고 나갈 때: 당기는 힘 × surge, 감으면 장력 × surgeTap */
  surge: 2.2,
  surgeTap: 2.4,
  /** 차고 나가는 동안 저절로 오르는 장력 (/초) */
  surgeTension: 22,
  /** 사람이 연타할 수 있는 한계 (/초) */
  maxTaps: 7.5,
};

export interface Angler {
  /** 최종 공격력 (레벨 + 장비) */
  power: number;
  maxHp: number;
}

export function anglerOf(stats: { power: number; maxHp: number }): Angler {
  return { power: stats.power, maxHp: stats.maxHp };
}

/** 체력 보너스 (장력이 풀리는 속도 배율) */
export const relaxOf = (a: Angler) => FIGHT.relax * (1 + 0.4 * Math.max(0, Math.min(1.5, (a.maxHp - 170) / 400)));

/** 힘비 = (내 공격력 × 낚싯대 힘) ÷ 물고기 힘 */
export const powerRatio = (a: Angler, rod: RodDef, str: number) => (a.power * rod.power) / str;

export const gainPerTap = (ratio: number) => Math.max(0.2, Math.min(10, FIGHT.gain * ratio));
export const tensionPerTap = (rod: RodDef, str: number) => (FIGHT.tap * Math.sqrt(str)) / rod.line;
export const pullOf = (str: number) => FIGHT.pullBase + FIGHT.pullK * Math.pow(str, 0.8);

/** 차고 나가는 시간 (초, u = 0~1 난수) · 다음 차고 나가기까지 */
export const surgeLen = (str: number, u: number) => Math.min(2, (0.5 + u * 0.7) * (0.8 + 0.1 * str));
export const surgeGap = (str: number, u: number) => (2.5 + u * 2.5) / Math.sqrt(0.6 + 0.2 * str);

export type Difficulty = 'easy' | 'normal' | 'hard' | 'very' | 'impossible';
export const DIFF_LABEL: Record<Difficulty, { text: string; color: string }> = {
  easy: { text: '쉬움', color: '#4ade80' },
  normal: { text: '보통', color: '#a3e635' },
  hard: { text: '어려움', color: '#fbbf24' },
  very: { text: '매우 어려움', color: '#f97316' },
  impossible: { text: '지금은 무리', color: '#f87171' },
};

/**
 * 평균 크기 개체를 끌어올릴 수 있을지 어림: 장력을 넘기지 않고 감을 수 있는 속도 vs 물고기가 버티는 힘.
 * margin > 1 이면 감는 쪽이 이긴다 (지친 물고기는 70%까지 약해지므로 0.75 근처도 버티면 된다)
 */
export function landOdds(a: Angler, rod: RodDef, fish: FishDef, kg = midKg(fish)): { margin: number; diff: Difficulty; seconds: number } {
  const str = fishStrength(fish, kg);
  const taps = Math.min(FIGHT.maxTaps, relaxOf(a) / tensionPerTap(rod, str));
  // 차고 나가는 동안(frac)은 감지 못하고, 물고기는 surge 배로 당긴다. 지쳐 가는 평균 힘은 85% 정도
  const len = surgeLen(str, 0.5);
  const frac = len / (len + surgeGap(str, 0.5));
  const reel = taps * gainPerTap(powerRatio(a, rod, str)) * (1 - frac);
  const pull = pullOf(str) * 0.85 * (1 + frac * (FIGHT.surge - 1));
  const margin = reel / pull;
  const diff: Difficulty = margin >= 2.2 ? 'easy' : margin >= 1.5 ? 'normal' : margin >= 1.1 ? 'hard' : margin >= 0.8 ? 'very' : 'impossible';
  const net = reel - pull;
  const seconds = net > 0 ? (100 - FIGHT.start) / net : Infinity;
  return { margin, diff, seconds };
}

// ───────────── 저장 ─────────────

export interface FishCatch {
  id: string;
  kg: number;
  day: number;
}

export interface FishingState {
  /** 가진 낚싯대 */
  rods: string[];
  /** 쓰는 낚싯대 */
  rod: string | null;
  /** 미끼 개수 (루어는 가진 개수) */
  bait: Partial<Record<BaitId, number>>;
  /** 끼울 미끼 */
  use: BaitId | null;
  /** 살림망 (아직 안 판 물고기) */
  basket: FishCatch[];
  /** 도감: 잡은 횟수 · 최대 크기 · 처음 잡은 날 */
  dex: Record<string, { n: number; best: number; first: number }>;
  stats: { casts: number; bites: number; catches: number; missed: number; escaped: number; snapped: number; earned: number };
}

export const BASKET_MAX = 30;

export function ensureFishing(p: PlayerProfile): FishingState {
  const s = (p.fishing ??= { rods: [], rod: null, bait: {}, use: null, basket: [], dex: {}, stats: { casts: 0, bites: 0, catches: 0, missed: 0, escaped: 0, snapped: 0, earned: 0 } });
  s.stats ??= { casts: 0, bites: 0, catches: 0, missed: 0, escaped: 0, snapped: 0, earned: 0 };
  s.basket ??= [];
  s.dex ??= {};
  s.bait ??= {};
  s.rods ??= [];
  return s;
}

/** 지금 장비 (낚싯대 · 미끼). 없으면 null */
export function currentSetup(s: FishingState, minutes: number): FishSetup | null {
  const rod = s.rod ? ROD_BY_ID[s.rod] : undefined;
  const bait = s.use ? BAIT_BY_ID[s.use] : undefined;
  if (!rod || !bait) return null;
  return { rod, bait, band: timeBand(minutes) };
}
