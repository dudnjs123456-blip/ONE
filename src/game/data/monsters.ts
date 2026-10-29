export interface MonsterType {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  /** 데미지 배율 */
  power: number;
  exp: number;
  gold: number;
  color: number;
  /** 모델 크기 배율 */
  scale: number;
  runSpeed: number;
  /** 사용하는 기술 id (data/moves.ts) */
  moves: string[];
  /** 공격 사이 평균 대기 프레임. 작을수록 공격적 */
  attackGap: number;
  /** 플레이어를 발견하는 거리 (m). 0 이면 맞기 전엔 선공하지 않음 */
  aggroRange: number;
}

export const MONSTERS: Record<string, MonsterType> = {
  goblin: {
    id: 'goblin', name: '고블린', level: 1, maxHp: 55, power: 0.45, exp: 12, gold: 4,
    color: 0x5fae4a, scale: 0.8, runSpeed: 0.05,
    moves: ['jab', 'lowKick'], attackGap: 80, aggroRange: 0,
  },
  bandit: {
    id: 'bandit', name: '산적', level: 3, maxHp: 110, power: 0.75, exp: 30, gold: 12,
    color: 0x9a7448, scale: 1.0, runSpeed: 0.06,
    moves: ['jab', 'straight', 'midKick', 'lowKick'], attackGap: 60, aggroRange: 5,
  },
  ogre: {
    id: 'ogre', name: '오우거', level: 6, maxHp: 280, power: 1.3, exp: 95, gold: 45,
    color: 0xa23b3b, scale: 1.35, runSpeed: 0.045,
    moves: ['bodyBlow', 'highKick', 'sweep'], attackGap: 85, aggroRange: 6,
  },
};

export interface SpawnDef {
  type: string;
  x: number;
  z: number;
}

/** 중앙(마을)에서 멀어질수록 강한 몬스터 */
export const FIELD_SPAWNS: SpawnDef[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    return { type: 'goblin', x: Math.cos(a) * 7, z: Math.sin(a) * 7 };
  }),
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + 1.1;
    return { type: 'bandit', x: Math.cos(a) * 13, z: Math.sin(a) * 13 };
  }),
  { type: 'ogre', x: 17, z: -15 },
  { type: 'ogre', x: -16, z: 16 },
];

export const MONSTER_RESPAWN_FRAMES = 60 * 6;
