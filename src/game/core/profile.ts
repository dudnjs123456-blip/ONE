import { expToNext } from '../data/progression';

/** 필드·보스 레이드가 공유하는 플레이어 성장 정보 */
export interface PlayerProfile {
  level: number;
  exp: number;
  gold: number;
  kills: number;
  /** 보스 id → 클리어 횟수 */
  bossClears: Record<string, number>;
  /** 보스 id → 최단 클리어 시간 (초) */
  bossBest: Record<string, number>;
  /** 아이템 id → 개수 (data/items.ts) */
  inventory: Record<string, number>;
  /** 생활 수치 (0~100, 높을수록 피곤하고 배고프다) */
  life: { fatigue: number; hunger: number; /** 땀·먼지 (0~100, 샤워하면 0) */ dirt?: number; /** 도시에서 남은 체력 (없으면 가득) */ hp?: number; /** 자는 중이면 잠든 실제 시각 (ms). 창을 닫아도 계속 잔다 */ sleepAt?: number };
  /** 일자리 id → 근무 기록 */
  jobs?: Record<string, { shifts: number; earned: number }>;
  /** 도시의 날짜(며칠째)와 시각(분) — 다시 켜도 이어진다 */
  time?: { day: number; minutes: number };
  /** 2 = 실제 시각 시계로 옮긴 뒤 (예전 근무 기록 날짜를 한 번 맞췄다) */
  clockV?: number;
  /** 장비 (가방 + 낀 장비 8칸) */
  /** 코디 옷 (겉모습만, 옷가게) */
  wardrobe?: import('../data/fashion').Wardrobe;
  /** 캐릭터 몸 (코디 창에서 고른다, 없으면 여자) */
  body?: import('../render/looks').BodyType;
  /** 마지막으로 저장한 시각 (ms). 기기 두 대의 기록이 다르면 최신 쪽을 쓴다 */
  savedAt?: number;
  /** VS CPU 난이도별 전적과 연승 (계정에 저장 → 다른 기기에서도 이어진다) */
  cpu?: { record: Record<string, { w: number; l: number }>; streak: { cur: number; best: number } };
  /** 카지노 기록 */
  casino?: { played: number; won: number; lost: number; best: number };
  /** 집 냉장고에 넣어둔 음식 */
  fridge?: FridgeFood[];
  /** 며칠째 → 그날 시작한 근무 기록 (집 달력) */
  workLog?: Record<string, import('../city/calendar').WorkEntry[]>;
  /** 대화형 NPC id → 호감도·기억 */
  npcs?: Record<string, import('../data/npcs').NpcBond>;
  /** 행복빌라 내 집 호수와 받은 시각 (친구와 겹치면 늦게 받은 쪽이 다른 집으로 옮긴다) */
  home?: { unit: string; claimedAt: number };
  /** 다른 차원 (집 컴퓨터로 접속) 접속 횟수 */
  dimension?: {
    visits: number;
    /** 경계 마을에서 인사한 NPC id */
    met?: string[];
    /** 첫 접속 프롤로그(안개 숲 → 벼랑 → 마을에서 깨어남)를 봤다 */
    prologue?: boolean;
    /** 0장 「저편에서 온 사람」: 의문 수첩 · 단서 · 마루에게 고른 마음 (story/chapter0) */
    ch0?: import('../story/chapter0').Ch0State;
    /** 1장 「기운 수련」: 단계 · 내 근 · 첫 발현 기술 이름 (story/chapter1) */
    ch1?: import('../story/chapter1').Ch1State;
    /** 차원 돈 (은화). 몬스터를 잡아 벌고 차원 안에서만 쓴다 — 서울 돈(gold)과 따로 */
    coin?: number;
    /** 마스터 계정: 장면 고르기 전의 원래 이야기 진행 (되돌리기용, story/master) */
    masterBackup?: { prologue?: boolean; ch0?: import('../story/chapter0').Ch0State; ch1?: import('../story/chapter1').Ch1State; met?: string[] };
    /** 마스터 계정: 0장 처음을 골랐다 — 다음 접속 때 구조 장면부터 (한 번) */
    replayRescue?: boolean;
    /** 차원 장비 (무구 노점 · 몬스터 드롭). 서울로는 못 들고 나온다 */
    gear?: import('../data/equipment').GearState;
    /** 태그 동료 (Tab 으로 바꿔 싸운다, data/companions). 주인공은 늘 들어 있어서 적지 않는다 */
    party?: string[];
    /** 달빛 여관 첫 숙박(공짜)을 썼다 */
    innFree?: boolean;
    /** 여관 침대에서 자는 중: 침대 번호와 잠든 실제 시각 (ms). 창을 닫아도 계속 잔다 */
    sleep?: { bed: number; at: number };
  };
  /** 키우는 애완동물 (펫샵) */
  pets?: import('../data/pets').PetState;
  /** 펫샵: 그날(게임 날짜) 이미 분양된 아이들 */
  petShop?: { day: number; sold: string[]; /** 용품 id → 오늘 산 개수 */ goods?: Record<string, number> };
  /** 한강 낚시: 낚싯대 · 미끼 · 살림망 · 도감 */
  fishing?: import('../data/fishing').FishingState;
  /** 집안일: 싱크대 그릇 · 빨래 바구니 · 세탁기 · 건조대 */
  chores?: import('../city/chores').ChoreState;
  /** 생활 기록: 서울에서 한 일을 날짜별로 · AI 가 정리한 일기와 근 기울기 (core/lifeLog) */
  lifeLog?: import('./lifeLog').LifeLog;
  /** 모든 계정 일괄 변경을 어디까지 적용했나 (core/resets) */
  resetV?: number;
}

export interface FridgeFood {
  name: string;
  icon: string;
  hunger: number;
  fatigue: number;
  /** 산 가게 */
  from: string;
}

const BASE_KEY = 'iron-fist.profile.v1';
/** 지금 쓰는 브라우저 저장 칸 (로그인하면 계정별로 나뉜다) */
let storageKey = BASE_KEY;

/** 로그인한 계정의 저장 칸으로 바꾼다 (null = 로그인 전 / 오프라인) */
export function setProfileAccount(userId: string | null) {
  storageKey = userId ? `${BASE_KEY}:${userId}` : BASE_KEY;
}

/** 지금 칸에 저장된 프로필이 있으면 (없으면 null) */
export function loadStoredProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? { ...newProfile(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

/** 로그인 기능 전에 이 브라우저에서 하던 기록 (첫 로그인 때 계정으로 옮긴다) */
export function loadLegacyProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? { ...newProfile(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function newProfile(): PlayerProfile {
  return { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 20, hunger: 30 } };
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const p = { ...newProfile(), ...JSON.parse(raw) };
      // 예전 서울 장비(배트·후드티 등)는 없앤다 — 서울엔 장비가 없다 (장비는 차원에서만: profile.dimension.gear)
      delete (p as { gear?: unknown }).gear;
      return p;
    }
  } catch {
    // 저장소를 못 쓰는 환경 (시크릿 모드 등) → 새 프로필
  }
  return newProfile();
}

const saveListeners = new Set<(p: PlayerProfile) => void>();

/** 저장될 때마다 알림 (클라우드 동기화 등). @returns 해제 함수 */
export function onProfileSaved(fn: (p: PlayerProfile) => void): () => void {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}

export function saveProfile(p: PlayerProfile) {
  p.savedAt = Date.now();
  try {
    localStorage.setItem(storageKey, JSON.stringify(p));
  } catch {
    // 무시: 저장은 편의 기능
  }
  for (const fn of saveListeners) fn(p);
}

/** 경험치 획득. @returns 오른 레벨 수 */
export function gainExp(p: PlayerProfile, amount: number): number {
  p.exp += amount;
  let ups = 0;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    ups++;
  }
  return ups;
}
