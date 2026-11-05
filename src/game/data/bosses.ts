export interface WeightedMove {
  id: string;
  weight: number;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  recommendedLevel: number;
  maxHp: number;
  power: number;
  scale: number;
  color: number;
  /** 평상시 패턴 */
  moves: WeightedMove[];
  /** HP 50% 이하 분노 페이즈에 추가되는 패턴 */
  enrageMoves: WeightedMove[];
  /** 공격 사이 평균 대기 프레임 (분노 시 60%) */
  attackGap: number;
  timeLimit: number;
  reward: { exp: number; gold: number };
  firstClearBonus: { exp: number; gold: number };
  tip: string;
}

export const BOSSES: BossDef[] = [
  {
    id: 'goblinKing',
    name: '고블린 킹',
    title: '숲의 약탈자',
    recommendedLevel: 3,
    maxHp: 420,
    power: 0.55,
    scale: 1.2,
    color: 0x4f9a3a,
    moves: [
      { id: 'bossClaw', weight: 3 },
      { id: 'bossCombo1', weight: 2 },
      { id: 'bossTail', weight: 1 },
    ],
    enrageMoves: [{ id: 'bossSmash', weight: 2 }],
    attackGap: 72,
    timeLimit: 90,
    reward: { exp: 120, gold: 80 },
    firstClearBonus: { exp: 150, gold: 150 },
    tip: '3연타는 앞의 두 대가 상단 — 앉아서 피하고 마지막 중단은 서서 막자.',
  },
  {
    id: 'ogreChief',
    name: '오우거 족장',
    title: '부서진 산의 주인',
    recommendedLevel: 6,
    maxHp: 800,
    power: 0.85,
    scale: 1.55,
    color: 0x8f2f2f,
    moves: [
      { id: 'bossClaw', weight: 2 },
      { id: 'bossSmash', weight: 2 },
      { id: 'bossTail', weight: 2 },
      { id: 'bossCharge', weight: 1 },
    ],
    enrageMoves: [{ id: 'bossCombo1', weight: 3 }],
    attackGap: 64,
    timeLimit: 100,
    reward: { exp: 300, gold: 200 },
    firstClearBonus: { exp: 400, gold: 400 },
    tip: '몸이 붉게 빛나는 기술은 아머 — 때려도 안 끊긴다. 횡이동으로 피하고 후딜에 반격.',
  },
  {
    id: 'demonLord',
    name: '철권의 마왕',
    title: '심연의 투신',
    recommendedLevel: 10,
    // 2026-11-04 조정: 1400 / 1.15 / 54 는 권장 레벨에서 어려움 봇 승률 0% → 약 33% 로
    maxHp: 1300,
    power: 1.0,
    scale: 1.4,
    color: 0x4a2f7a,
    moves: [
      { id: 'bossCombo1', weight: 3 },
      { id: 'bossClaw', weight: 2 },
      { id: 'bossTail', weight: 2 },
      { id: 'bossSmash', weight: 2 },
      { id: 'bossCharge', weight: 2 },
    ],
    enrageMoves: [
      { id: 'bossCombo1', weight: 2 },
      { id: 'bossCharge', weight: 2 },
    ],
    attackGap: 60,
    timeLimit: 120,
    reward: { exp: 700, gold: 500 },
    firstClearBonus: { exp: 1000, gold: 1000 },
    tip: '모든 패턴이 섞여 나온다. 하단 꼬리 쓸기는 앉아서 막고 -18F 를 띄우기로 응징.',
  },
  {
    // 엔드 콘텐츠: 필드 흑기사(Lv.9)를 잡으며 Lv.14 까지 키운 뒤 도전
    id: 'knightCaptain',
    name: '흑기사 단장',
    title: '무너진 성의 기사단장',
    recommendedLevel: 14,
    maxHp: 1800,
    power: 1.15,
    scale: 1.3,
    color: 0x4a6aa8,
    moves: [
      { id: 'bossCombo1', weight: 3 },
      { id: 'bossCharge', weight: 2 },
      { id: 'bossSmash', weight: 2 },
      { id: 'bossTail', weight: 2 },
      { id: 'bossClaw', weight: 1 },
    ],
    enrageMoves: [
      { id: 'bossCharge', weight: 2 },
      { id: 'bossSmash', weight: 2 },
    ],
    attackGap: 54,
    timeLimit: 140,
    reward: { exp: 1200, gold: 900 },
    firstClearBonus: { exp: 1500, gold: 1500 },
    tip: '돌진·대지 강타는 아머라 끊기지 않는다. 횡이동으로 흘리고, 막은 뒤 빈틈에 띄우기. 잡기는 보스에게도 들어간다.',
  },
];
