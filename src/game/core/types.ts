/** 넘패드 표기 방향 (캐릭터 기준). 6 = 앞, 4 = 뒤, 8 = 위, 2 = 아래, 5 = 중립 */
export type Dir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 철권 버튼: 1 왼손(LP), 2 오른손(RP), 3 왼발(LK), 4 오른발(RK) */
export type Button = 1 | 2 | 3 | 4;

export type Buttons = [boolean, boolean, boolean, boolean];

export type HitLevel = 'high' | 'mid' | 'low';
