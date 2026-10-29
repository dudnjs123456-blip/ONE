/** 레벨 → 다음 레벨까지 필요한 경험치 */
export function expToNext(level: number): number {
  return Math.round(40 * Math.pow(level, 1.6));
}

export function statsForLevel(level: number) {
  return {
    maxHp: 170 + (level - 1) * 30,
    power: 1 + (level - 1) * 0.15,
  };
}
