/**
 * 애완동물: 펫샵에서 분양받아 집에서 키우고, 한 마리는 산책 친구로 데리고 다닌다.
 * 수치는 모두 0~100. hunger 는 높을수록 배고프다(사람 생활 수치와 같은 방향), joy·clean 은 높을수록 좋다.
 */

export type PetBody = 'dog' | 'cat' | 'rabbit' | 'hamster' | 'hedgehog' | 'bird' | 'turtle';

export interface PetSpecies {
  id: string;
  name: string;
  icon: string;
  body: PetBody;
  price: number;
  /** 몸 크기 배율 (1 = 소형견) */
  size: number;
  /** 몸 · 배/주둥이 · 귀/무늬 색 */
  colors: [number, number, number];
  /** 털색 변형 (입고될 때 개체마다 하나) — 없으면 colors 하나뿐 */
  coats?: { name: string; colors: [number, number, number] }[];
  /** 꼬리·귀 모양 변형 */
  variant?: 'fluffy' | 'shortLeg' | 'curlTail' | 'longEar' | 'tabby';
  /** 걷는 속도 배율 */
  speed: number;
  desc: string;
  /** 산책에 데리고 다닐 수 있나 (거북이처럼 느린 친구는 집에서만) */
  walks: boolean;
}

export const PET_SPECIES: PetSpecies[] = [
  { id: 'maltese', name: '말티즈', icon: '🐶', body: 'dog', price: 600, size: 0.72, colors: [0xffffff, 0xffffff, 0xfbf7f0], variant: 'fluffy', speed: 1, desc: '새하얀 긴 털, 까만 단추 눈. 머리엔 리본. 사람을 정말 좋아한다.', walks: true },
  { id: 'pomeranian', name: '포메라니안', icon: '🐕', body: 'dog', price: 750, size: 0.7, colors: [0xfdfbf6, 0xffffff, 0xf4ece0], coats: [{ name: '화이트', colors: [0xfdfbf6, 0xffffff, 0xf4ece0] }, { name: '크림', colors: [0xf6e2bf, 0xfdf3e1, 0xecd2a6] }, { name: '오렌지', colors: [0xe89a4a, 0xf8d9b0, 0xd9823a] }], variant: 'fluffy', speed: 1.05, desc: '동글동글 솜뭉치. 여우 같은 얼굴에 꼬리가 등 위로 폭신.', walks: true },
  { id: 'shiba', name: '시바견', icon: '🐕', body: 'dog', price: 900, size: 1, colors: [0xd98b45, 0xfbf1e2, 0xc77a38], variant: 'curlTail', speed: 1.1, desc: '말린 꼬리에 시크한 표정. 고집이 세다.', walks: true },
  { id: 'corgi', name: '웰시코기', icon: '🐕', body: 'dog', price: 1000, size: 1, colors: [0xe08f3e, 0xffffff, 0xd27c2e], variant: 'shortLeg', speed: 1, desc: '짧은 다리, 빵빵한 엉덩이. 동네 인기 스타.', walks: true },
  { id: 'golden', name: '골든 리트리버', icon: '🦮', body: 'dog', price: 1400, size: 1.55, colors: [0xe2b064, 0xf2d39a, 0xd49d4e], speed: 1.2, desc: '덩치는 크지만 순둥이. 공놀이를 제일 좋아한다.', walks: true },
  { id: 'koshort', name: '코리안 숏헤어', icon: '🐈', body: 'cat', price: 500, size: 0.95, colors: [0x9a9289, 0xf1ece5, 0x5d5650], coats: [{ name: '고등어', colors: [0x9a9289, 0xf1ece5, 0x5d5650] }, { name: '턱시도', colors: [0x2a2a2e, 0xffffff, 0x1c1c20] }, { name: '삼색', colors: [0xf3efe8, 0xffffff, 0xd98a3a] }], variant: 'tabby', speed: 1, desc: '고등어 무늬 동네 고양이. 무심한 척 다정하다.', walks: true },
  { id: 'cheese', name: '치즈냥이', icon: '🐱', body: 'cat', price: 550, size: 1, colors: [0xf0a24c, 0xfbe6c8, 0xd9822f], variant: 'tabby', speed: 1, desc: '노란 털 치즈 고양이. 먹는 걸 너무 좋아한다.', walks: true },
  { id: 'russianblue', name: '러시안 블루', icon: '🐈‍⬛', body: 'cat', price: 1100, size: 0.95, colors: [0x7f8a96, 0x8e98a3, 0x6c7681], speed: 1.05, desc: '은빛 회색 털에 초록 눈. 조용하고 우아하다.', walks: true },
  { id: 'rabbit', name: '토끼', icon: '🐰', body: 'rabbit', price: 400, size: 1, colors: [0xfbfaf7, 0xffffff, 0xf3c9cf], coats: [{ name: '흰둥이', colors: [0xfbfaf7, 0xffffff, 0xf3c9cf] }, { name: '갈색', colors: [0xa9825f, 0xeadccb, 0x8c6a4c] }, { name: '회색', colors: [0x9a9a9e, 0xe6e6e6, 0x7d7d82] }], variant: 'longEar', speed: 0.9, desc: '깡총깡총. 당근을 주면 코를 씰룩인다.', walks: true },
  { id: 'hamster', name: '햄스터', icon: '🐹', body: 'hamster', price: 150, size: 1, colors: [0xe7b57c, 0xfff6ea, 0xd99c5c], coats: [{ name: '골든', colors: [0xe7b57c, 0xfff6ea, 0xd99c5c] }, { name: '펄', colors: [0xf4f1ec, 0xffffff, 0xd8d2ca] }, { name: '정글리안', colors: [0x8d8a86, 0xf3f0ea, 0x55524f] }], speed: 0.75, desc: '볼주머니 가득 해바라기씨. 손바닥만 하다.', walks: false },
  { id: 'hedgehog', name: '고슴도치', icon: '🦔', body: 'hedgehog', price: 450, size: 1, colors: [0x6e5a4a, 0xf1e1cc, 0x3e3129], speed: 0.7, desc: '가시는 따끔, 배는 말랑. 밤에 더 활발하다.', walks: false },
  { id: 'parrot', name: '사랑앵무', icon: '🦜', body: 'bird', price: 350, size: 1, colors: [0x5cc46a, 0xf5e15a, 0x2f7fd6], speed: 1.2, desc: '어깨 위에 앉아 따라다닌다. 이름을 부르면 짹!', walks: true },
  { id: 'turtle', name: '거북이', icon: '🐢', body: 'turtle', price: 250, size: 1, colors: [0x6c8a3e, 0xc9b67a, 0x4c6a2a], speed: 0.35, desc: '느긋느긋. 100년을 산다는 소문이 있다.', walks: false },
];

export const PET_BY_ID: Record<string, PetSpecies> = Object.fromEntries(PET_SPECIES.map((s) => [s.id, s]));

/** 펫 용품 (인벤토리 아이템으로 들고 다닌다) */
export interface PetGood {
  id: string;
  name: string;
  icon: string;
  price: number;
  desc: string;
  /** 쓰면 바뀌는 수치 (hunger 는 줄어드는 양) */
  hunger?: number;
  joy?: number;
  clean?: number;
}

export const PET_GOODS: PetGood[] = [
  { id: 'pet-food', name: '사료 한 봉', icon: '🥣', price: 20, hunger: 45, joy: 3, desc: '영양 만점 기본 사료. 배고픔 -45' },
  { id: 'pet-treat', name: '수제 간식', icon: '🦴', price: 30, hunger: 15, joy: 18, desc: '꼬리가 저절로 흔들리는 맛. 배고픔 -15 · 기분 +18' },
  { id: 'pet-toy', name: '삑삑이 장난감', icon: '🧸', price: 40, joy: 35, desc: '같이 놀아주면 기분 +35 (한 번 쓰면 닳는다)' },
  { id: 'pet-shampoo', name: '펫 샴푸', icon: '🧴', price: 25, clean: 70, joy: -5, desc: '목욕시키면 청결 +70 (목욕은 좀 싫어한다)' },
];

export const PET_GOOD_BY_ID: Record<string, PetGood> = Object.fromEntries(PET_GOODS.map((g) => [g.id, g]));

/** 내가 키우는 펫 하나 (프로필에 저장) */
export interface OwnedPet {
  /** 고유 번호 */
  id: string;
  species: string;
  name: string;
  hunger: number;
  joy: number;
  clean: number;
  /** 털색 (species.coats 번호) */
  coat?: number;
  /** 함께한 날 수 계산용 (ms) */
  adoptedAt: number;
  /** 마지막으로 수치를 갱신한 시각 (ms) — 게임을 끈 동안에도 조금씩 배고파진다 */
  updatedAt: number;
}

export interface PetState {
  list: OwnedPet[];
  /** 산책 친구로 데리고 다니는 펫 id (없으면 null) */
  walking: string | null;
}

/** 실제 시간 기준 변화 속도 (1시간당) */
const HUNGER_PER_HOUR = 100 / 10; // 10시간이면 100
const CLEAN_PER_HOUR = 100 / 30;
const JOY_PER_HOUR = 100 / 14;
/** 게임을 끈 동안엔 절반 속도로, 최대 12시간까지만 */
const OFFLINE_CAP_H = 12;

/** 시간이 흐른 만큼 수치를 바꾼다. hours = 실제 시간 */
export function agePet(p: OwnedPet, hours: number) {
  if (hours <= 0) return;
  p.hunger = Math.min(100, p.hunger + HUNGER_PER_HOUR * hours);
  p.clean = Math.max(0, p.clean - CLEAN_PER_HOUR * hours);
  // 배고프거나 더러우면 기분이 더 빨리 나빠진다
  const mood = 1 + (p.hunger > 70 ? 1 : 0) + (p.clean < 25 ? 0.5 : 0);
  p.joy = Math.max(0, p.joy - JOY_PER_HOUR * mood * hours);
}

/** 게임을 다시 켰을 때: 꺼져 있던 시간만큼 (절반 속도, 최대 12시간) */
export function catchUpPets(state: PetState | undefined, now: number) {
  if (!state) return;
  for (const p of state.list) {
    const h = Math.min(OFFLINE_CAP_H, Math.max(0, (now - p.updatedAt) / 3600000));
    agePet(p, h * 0.5);
    p.updatedAt = now;
  }
}

export function newPet(speciesId: string, name: string, now: number, coat = 0): OwnedPet {
  return { id: `${speciesId}-${now.toString(36)}`, species: speciesId, name, coat, hunger: 20, joy: 70, clean: 90, adoptedAt: now, updatedAt: now };
}

/** 털색 반영한 색 · 털색 이름 */
export function coatOf(sp: PetSpecies, coat = 0): { name: string | null; colors: [number, number, number] } {
  const c = sp.coats?.[coat];
  return c ? { name: c.name, colors: c.colors } : { name: null, colors: sp.colors };
}

/** 지금 기분 한 줄 */
export function petMood(p: OwnedPet): { face: string; text: string } {
  if (p.hunger > 80) return { face: '😫', text: '배가 너무 고파요' };
  if (p.clean < 20) return { face: '😣', text: '꼬질꼬질해요' };
  if (p.joy < 25) return { face: '😢', text: '심심하고 외로워요' };
  if (p.hunger > 55) return { face: '🥺', text: '밥 시간이 다가와요' };
  if (p.joy > 75) return { face: '🥰', text: '아주 행복해요' };
  return { face: '🙂', text: '기분 좋아요' };
}

/** 키울 수 있는 최대 마리 수 (원룸이라…) */
export const MAX_PETS = 4;
export const PET_SHOP_NAME = '멍냥 펫샵';
