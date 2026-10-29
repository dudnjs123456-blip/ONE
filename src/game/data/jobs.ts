import { MOVES, type MoveDef } from './moves';

/**
 * 일자리: 상·중·하 등급. 지금은 '하' 등급의 아파트 경비만 있다.
 */
export type JobTier = 'high' | 'mid' | 'low';

export const JOB_TIERS: { id: JobTier; label: string; title: string; desc: string }[] = [
  { id: 'high', label: '상', title: '전문직', desc: '경력과 레벨이 필요한 고소득 일자리' },
  { id: 'mid', label: '중', title: '기술·서비스직', desc: '조금 익숙해지면 할 수 있는 일자리' },
  { id: 'low', label: '하', title: '단순 노무', desc: '누구나 바로 시작할 수 있는 일자리' },
];

export interface JobDef {
  id: string;
  tier: JobTier;
  name: string;
  icon: string;
  /** 출근하는 곳 (지도 장소 id 와 이름) */
  poiId: string;
  place: string;
  /** 한 번 근무 길이 (실제 분) */
  shiftMinutes: number;
  /** 그동안 흐르는 게임 시간 (시간) */
  gameHours: number;
  /** 끝까지 근무하면 받는 기본급 (일찍 퇴근하면 일한 만큼) */
  basePay: number;
  minLevel: number;
  desc: string;
  duties: string[];
}

export const JOBS: JobDef[] = [
  {
    id: 'aptGuard',
    tier: 'low',
    name: '아파트 경비',
    icon: '👮',
    poiId: 'lobby',
    place: '행복빌라 1층 경비 데스크',
    shiftMinutes: 20,
    gameHours: 8,
    basePay: 120,
    minLevel: 1,
    desc: '행복빌라 1층 로비의 경비 데스크에 앉아, 현관과 엘리베이터를 오가는 사람들을 확인한다. 가끔 강도가 들어오면 막아낸다.',
    duties: [
      '🙋 출입 확인 — 데스크 앞에 멈춘 사람을 E 로 확인 (1명당 +2G)',
      '🍊 가끔 주민이 먹을 걸 챙겨준다',
      '🔦 자동 순찰(P) — 순찰 시간에 알아서 층을 돌고 데스크로 복귀',
      '🚨 데스크를 비운 사이 강도가 들면 알람! 어느 층에 숨었는지 몰라 90초 안에 찾아 퇴치 (놓치면 수당 -30G)',
      '🤖 자동 체크(G) — 로비에 있으면 오는 사람을 알아서 확인, 강도가 들어오면 멈추고 전투',
      '🔦 순찰 — 5분마다 엘리베이터로 2층~꼭대기 층 복도를 돌며 점검 지점에서 E (모두 돌면 +20G)',
      '🚨 낮은 확률로 강도 출현 — 싸워서 제압하면 보상 (난이도는 그때그때 다름)',
      '⏱️ 20분 근무(게임 속 8시간)를 마치면 기본급 120G + 개근 수당 30G',
      '⚠️ 로비를 20초 넘게 비우면 무단 이탈, 주민을 때리면 해고',
    ],
  },
];

export const JOB_BY_ID: Record<string, JobDef> = Object.fromEntries(JOBS.map((j) => [j.id, j]));

/**
 * 강도 난이도: 나올 때마다 가중치로 하나를 뽑는다. 대부분 약하지만 아주 가끔 엄청 센 강도가 나온다.
 * 체력·공격력은 플레이어 레벨에 따라 조금씩 오른다 (robberStats).
 */
export interface RobberTier {
  id: string;
  name: string;
  icon: string;
  /** 출현 가중치 (합 100) */
  weight: number;
  hp: number;
  power: number;
  /** 쫓아오는 속도 */
  speed: number;
  /** 공격 사이 간격 (프레임 범위) */
  cooldown: [number, number];
  moves: MoveDef[];
  reward: number;
  /** 몸집 */
  scale: number;
  line: string;
  /** 나타날 때 화면 경고 */
  warning?: string;
}

export const ROBBER_TIERS: RobberTier[] = [
  {
    id: 'thief', name: '좀도둑', icon: '🧦', weight: 55, hp: 60, power: 0.8, speed: 0.065, cooldown: [70, 110],
    moves: [MOVES.jab, MOVES.lowKick], reward: 15, scale: 0.95, line: '헤헤… 지갑 좀 빌려줄래?',
  },
  {
    id: 'robber', name: '강도', icon: '🔪', weight: 32, hp: 130, power: 1.1, speed: 0.07, cooldown: [50, 85],
    moves: [MOVES.jab, MOVES.oneTwo, MOVES.straight, MOVES.midKick], reward: 35, scale: 1, line: '돈 내놔! 다치기 싫으면!',
  },
  {
    id: 'armed', name: '무장 강도', icon: '🪓', weight: 11, hp: 230, power: 1.5, speed: 0.076, cooldown: [38, 65],
    moves: [MOVES.oneTwo, MOVES.straight, MOVES.midKick, MOVES.highKick, MOVES.uppercut], reward: 70, scale: 1.08,
    line: '다 비켜! 이 단지는 오늘 내가 턴다', warning: '🚨 무장 강도가 나타났다! 조심하자',
  },
  {
    id: 'legend', name: '전설의 강도', icon: '💀', weight: 2, hp: 450, power: 2, speed: 0.085, cooldown: [26, 45],
    moves: [MOVES.straight, MOVES.highKick, MOVES.uppercut, MOVES.sweep, MOVES.bodyBlow], reward: 200, scale: 1.25,
    line: '…이 동네는 원래 내 구역이다', warning: '⚠️ 엄청난 기운이 느껴진다… 전설의 강도다! 무리라면 도망치자',
  },
];

/** 레벨이 오를수록 강도도 조금씩 세진다 (그래도 레벨이 높으면 상대적으로 쉬워진다) */
export function robberStats(t: RobberTier, level: number) {
  return {
    maxHp: Math.round(t.hp * (1 + 0.12 * (level - 1))),
    power: t.power * (1 + 0.06 * (level - 1)),
  };
}

/** 주민이 챙겨주는 먹을 것 */
export const GUARD_GIFTS: { name: string; icon: string; hunger: number; fatigue: number; line: string }[] = [
  { name: '귤 한 봉지', icon: '🍊', hunger: 12, fatigue: 0, line: '추운데 고생 많으세요, 이거 드세요' },
  { name: '박카스', icon: '🧃', hunger: 2, fatigue: 12, line: '피곤하시죠? 한 병 드세요' },
  { name: '떡', icon: '🍡', hunger: 18, fatigue: 0, line: '이사 떡이에요~ 맛있게 드세요' },
  { name: '따뜻한 커피', icon: '☕', hunger: 2, fatigue: 10, line: '커피 한 잔 하세요!' },
  { name: '김밥 한 줄', icon: '🍙', hunger: 28, fatigue: 0, line: '식사는 하셨어요? 이거라도…' },
];
