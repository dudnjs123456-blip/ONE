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
  life: { fatigue: number; hunger: number; /** 도시에서 남은 체력 (없으면 가득) */ hp?: number };
  /** 일자리 id → 근무 기록 */
  jobs?: Record<string, { shifts: number; earned: number }>;
  /** 도시의 날짜(며칠째)와 시각(분) — 다시 켜도 이어진다 */
  time?: { day: number; minutes: number };
  /** 장비 (가방 + 낀 장비 8칸) */
  gear?: import('../data/equipment').GearState;
  /** 마지막으로 저장한 시각 (ms). 기기 두 대의 기록이 다르면 최신 쪽을 쓴다 */
  savedAt?: number;
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
    if (raw) return { ...newProfile(), ...JSON.parse(raw) };
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
