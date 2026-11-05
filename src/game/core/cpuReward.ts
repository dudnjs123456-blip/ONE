import type { CpuLevel } from './controllers';
import type { PlayerProfile } from './profile';

/** VS CPU 승리 보상 골드 (난이도별) */
export const CPU_REWARD: Record<CpuLevel, number> = { easy: 10, normal: 30, hard: 80 };
/** 그 난이도에서 처음 이기면 몇 배 */
export const FIRST_WIN_MULT = 3;

/**
 * VS CPU 승리 보상을 프로필에 더한다 (저장은 부른 쪽에서).
 * @param firstWin 이 난이도 첫 승리인가
 * @returns 받은 골드
 */
export function grantCpuReward(profile: PlayerProfile, level: CpuLevel, firstWin: boolean): number {
  const gold = CPU_REWARD[level] * (firstWin ? FIRST_WIN_MULT : 1);
  profile.gold += gold;
  return gold;
}
