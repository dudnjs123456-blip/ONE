import type { Button, Dir, HitLevel } from '../core/types';

export type DirKey = 'n' | 'f' | 'b' | 'd' | 'df' | 'db' | 'u' | 'uf' | 'ub';

export type MoveAnim =
  | 'jabL'
  | 'straightR'
  | 'midPunchL'
  | 'uppercutR'
  | 'bodyBlowR'
  | 'midKickL'
  | 'highKickR'
  | 'lowKickR'
  | 'sweepL'
  | 'clawR'
  | 'smash'
  | 'tailSweep'
  | 'charge'
  | 'kneeR'
  | 'jumpPunchR'
  | 'flyKick'
  | 'slide';

/** 콤보 연결(스트링): 기술 도중 `until` 프레임까지 button 을 누르면 `at` 프레임에 `into` 로 이어진다. */
export interface CancelDef {
  button: Button;
  until: number;
  at: number;
  into: string;
}

/**
 * 기술 데이터. 프레임은 철권 표기를 따른다.
 * - startup: 발생 프레임 (i10 = 10프레임째에 판정 발생)
 * - onBlock / onHit: 가드 / 히트 시 공격자 기준 프레임 이득
 */
export interface MoveDef {
  id: string;
  name: string;
  notation: string;
  /** null 이면 스트링 후속타처럼 직접 입력으로는 나가지 않는 기술 */
  input: { dir: DirKey; button: Button; /** 같이 눌러야 하는 두 번째 버튼 (동시 입력 기술) */ with?: Button } | null;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  level: HitLevel;
  /** 몸 중심에서 앞으로 닿는 거리 (m) */
  range: number;
  /** 좌우 추가 판정 폭. 클수록 횡이동을 잘 잡는다 (호밍) */
  tracking: number;
  onBlock: number;
  onHit: number;
  /** 밀려나는 총 거리 (m) */
  pushback: number;
  /** 히트 시 띄우는 수직 속도. 있으면 띄우기/다운 기술 */
  launch?: number;
  /** 앉은 자세로 나가는 기술 (상단 회피) */
  crouching?: boolean;
  /** 발생 전까지 프레임당 전진 거리 */
  lunge?: number;
  cancels?: CancelDef[];
  /** 입력 없이 자동으로 이어지는 다음 타 (보스 연타). at 프레임에 into 로 전환 */
  chain?: { into: string; at: number };
  /** 아머: 발생 전·지속 중에 맞아도 데미지만 받고 기술이 끊기지 않는다 */
  armor?: boolean;
  /** 묵직한 기술 (발차기): 플레이어의 빠른 템포를 적용하지 않아 끝까지 크게 휘두른다 */
  weighty?: boolean;
  /** 공중 기술: 쓰는 동안에도 떨어지고, 착지하면 바로 끝난다 */
  aerial?: boolean;
  anim: MoveAnim;
}

type MoveSpec = Omit<MoveDef, 'id'>;

function defineMoves<T extends Record<string, MoveSpec>>(specs: T): Record<keyof T & string, MoveDef> {
  return Object.fromEntries(
    Object.entries(specs).map(([id, spec]) => [id, { id, ...spec }]),
  ) as Record<keyof T & string, MoveDef>;
}

export const MOVES: Record<string, MoveDef> = defineMoves({
  jab: {
    name: '잽', notation: '1', input: { dir: 'n', button: 1 },
    startup: 10, active: 2, recovery: 14, damage: 5, level: 'high',
    range: 0.95, tracking: 0.05, onBlock: 1, onHit: 8, pushback: 0.15, anim: 'jabL',
    cancels: [{ button: 2, until: 24, at: 13, into: 'oneTwo' }],
  },
  oneTwo: {
    name: '원투', notation: '1,2', input: null,
    startup: 8, active: 2, recovery: 16, damage: 10, level: 'high',
    range: 1.0, tracking: 0.05, onBlock: -3, onHit: 6, pushback: 0.35, anim: 'straightR',
  },
  straight: {
    name: '라이트 스트레이트', notation: '2', input: { dir: 'n', button: 2 },
    startup: 12, active: 2, recovery: 18, damage: 12, level: 'high',
    range: 1.0, tracking: 0.05, onBlock: -3, onHit: 6, pushback: 0.35, anim: 'straightR',
  },
  midKick: {
    name: '미들 킥', notation: '3', input: { dir: 'n', button: 3 },
    startup: 18, active: 4, recovery: 26, damage: 17, level: 'mid', lunge: 0.02, weighty: true,
    range: 1.25, tracking: 0.15, onBlock: -7, onHit: 4, pushback: 0.55, anim: 'midKickL',
  },
  highKick: {
    name: '하이 킥', notation: '4', input: { dir: 'n', button: 4 },
    startup: 17, active: 4, recovery: 27, damage: 20, level: 'high', lunge: 0.015, weighty: true,
    range: 1.3, tracking: 0.4, onBlock: -9, onHit: 8, pushback: 0.6, anim: 'highKickR',
  },
  dfJab: {
    name: '중단 잽', notation: 'df+1', input: { dir: 'df', button: 1 },
    startup: 13, active: 2, recovery: 18, damage: 11, level: 'mid',
    range: 0.95, tracking: 0.05, onBlock: -1, onHit: 6, pushback: 0.25, anim: 'midPunchL',
  },
  uppercut: {
    name: '어퍼컷 (띄우기)', notation: 'df+2', input: { dir: 'df', button: 2 },
    startup: 15, active: 3, recovery: 20, damage: 15, level: 'mid',
    range: 0.85, tracking: 0.05, onBlock: -13, onHit: 0, pushback: 0.1, launch: 0.22, anim: 'uppercutR',
  },
  bodyBlow: {
    name: '보디 블로', notation: 'f+2', input: { dir: 'f', button: 2 },
    startup: 16, active: 3, recovery: 22, damage: 18, level: 'mid', lunge: 0.04,
    range: 1.0, tracking: 0.1, onBlock: -9, onHit: 3, pushback: 0.6, anim: 'bodyBlowR',
  },
  lowKick: {
    name: '로우 킥', notation: 'd+4', input: { dir: 'd', button: 4 },
    startup: 15, active: 3, recovery: 22, damage: 9, level: 'low', crouching: true, weighty: true,
    range: 1.05, tracking: 0.1, onBlock: -13, onHit: -2, pushback: 0.2, anim: 'lowKickR',
  },
  sweep: {
    name: '다리 후리기 (다운)', notation: 'db+3', input: { dir: 'db', button: 3 },
    startup: 20, active: 4, recovery: 30, damage: 18, level: 'low', crouching: true,
    range: 1.3, tracking: 0.5, onBlock: -20, onHit: 0, pushback: 0.2, launch: 0.07, anim: 'sweepL',
  },

  // ───── 대시 중에만 나가는 기술 (input: null, Fighter.tryAttack 이 대시 상태에서 고른다) ─────
  dashStraight: {
    name: '대시 스트레이트', notation: 'f,f+2', input: null,
    startup: 11, active: 4, recovery: 22, damage: 22, level: 'mid', lunge: 0.09,
    range: 1.4, tracking: 0.15, onBlock: -8, onHit: 0, pushback: 0.9, launch: 0.08, anim: 'straightR',
  },
  // ───── 점프 중에만 나가는 기술 ─────
  jumpPunch: {
    name: '점프 펀치', notation: '점프 중 1/2', input: null, aerial: true,
    startup: 6, active: 6, recovery: 10, damage: 14, level: 'mid',
    range: 1.1, tracking: 0.2, onBlock: -4, onHit: 6, pushback: 0.5, anim: 'jumpPunchR',
  },
  jumpKick: {
    name: '날아차기 (다운)', notation: '점프 중 3/4', input: null, aerial: true,
    startup: 8, active: 8, recovery: 14, damage: 20, level: 'mid',
    range: 1.4, tracking: 0.25, onBlock: -6, onHit: 0, pushback: 1.0, launch: 0.08, anim: 'flyKick',
  },
  dashKnee: {
    name: '대시 니킥 (띄우기)', notation: 'f,f+4', input: null,
    startup: 12, active: 4, recovery: 24, damage: 20, level: 'mid', lunge: 0.09,
    range: 1.15, tracking: 0.15, onBlock: -14, onHit: 0, pushback: 0.15, launch: 0.17, anim: 'kneeR',
  },

  slideKick: {
    name: '슬라이딩 킥 (다운)', notation: 'f,f+3/4', input: null, crouching: true,
    startup: 9, active: 9, recovery: 22, damage: 16, level: 'low', lunge: 0.05,
    range: 1.35, tracking: 0.15, onBlock: -16, onHit: 2, pushback: 0.4, launch: 0.08, anim: 'slide',
  },

  // ───── 동시 입력 (두 버튼을 같이) ─────
  hammer: {
    name: '양손 내려찍기 (다운)', notation: '1+2', input: { dir: 'n', button: 1, with: 2 },
    startup: 17, active: 3, recovery: 26, damage: 20, level: 'mid',
    range: 1.15, tracking: 0.12, onBlock: -12, onHit: 4, pushback: 0.2, launch: 0.1, anim: 'smash',
  },
  dropKick: {
    name: '드롭킥', notation: '3+4', input: { dir: 'n', button: 3, with: 4 },
    startup: 18, active: 4, recovery: 32, damage: 24, level: 'mid', lunge: 0.07,
    range: 1.4, tracking: 0.1, onBlock: -18, onHit: 6, pushback: 0.9, launch: 0.12, anim: 'flyKick',
  },
  shoulderTackle: {
    name: '어깨 태클', notation: '1+3', input: { dir: 'n', button: 1, with: 3 },
    startup: 15, active: 4, recovery: 22, damage: 16, level: 'mid', lunge: 0.1,
    range: 1.1, tracking: 0.2, onBlock: -8, onHit: 8, pushback: 1.1, anim: 'charge',
  },
  flyingKnee: {
    name: '날아 무릎 (띄우기)', notation: '2+4', input: { dir: 'n', button: 2, with: 4 },
    startup: 16, active: 4, recovery: 26, damage: 18, level: 'mid', lunge: 0.08,
    range: 1.15, tracking: 0.12, onBlock: -15, onHit: 0, pushback: 0.15, launch: 0.16, anim: 'kneeR',
  },

  // ───── 보스 전용 (input: null → 플레이어는 못 씀, AI 가 직접 발동) ─────
  bossClaw: {
    name: '할퀴기', notation: 'BOSS', input: null,
    startup: 14, active: 3, recovery: 20, damage: 22, level: 'mid',
    range: 1.4, tracking: 0.5, onBlock: -6, onHit: 4, pushback: 0.5, anim: 'clawR',
  },
  bossCombo1: {
    name: '3연타 (상단)', notation: 'BOSS', input: null,
    startup: 12, active: 2, recovery: 18, damage: 14, level: 'high',
    range: 1.3, tracking: 0.2, onBlock: -2, onHit: 6, pushback: 0.2, anim: 'jabL',
    chain: { into: 'bossCombo2', at: 18 },
  },
  bossCombo2: {
    name: '3연타 (상단)', notation: 'BOSS', input: null,
    startup: 8, active: 2, recovery: 18, damage: 14, level: 'high',
    range: 1.3, tracking: 0.2, onBlock: -2, onHit: 6, pushback: 0.2, anim: 'straightR',
    chain: { into: 'bossCombo3', at: 16 },
  },
  bossCombo3: {
    name: '3연타 (중단 띄우기)', notation: 'BOSS', input: null,
    startup: 16, active: 3, recovery: 26, damage: 26, level: 'mid',
    range: 1.3, tracking: 0.2, onBlock: -15, onHit: 0, pushback: 0.2, launch: 0.17, anim: 'uppercutR',
  },
  bossSmash: {
    name: '대지 강타', notation: 'BOSS', input: null,
    startup: 28, active: 4, recovery: 30, damage: 45, level: 'mid', armor: true,
    range: 1.7, tracking: 0.3, onBlock: -18, onHit: 0, pushback: 0.6, launch: 0.17, anim: 'smash',
  },
  bossTail: {
    name: '꼬리 쓸기', notation: 'BOSS', input: null,
    startup: 18, active: 4, recovery: 28, damage: 25, level: 'low', crouching: true,
    range: 1.8, tracking: 0.9, onBlock: -18, onHit: 0, pushback: 0.3, launch: 0.07, anim: 'tailSweep',
  },
  bossCharge: {
    name: '돌진', notation: 'BOSS', input: null,
    startup: 24, active: 4, recovery: 26, damage: 32, level: 'mid', armor: true, lunge: 0.11,
    range: 1.2, tracking: 0.15, onBlock: -12, onHit: 2, pushback: 1.2, anim: 'charge',
  },
});

export const MOVE_LIST: MoveDef[] = Object.values(MOVES);
/** 대시 중에 누르면 나가는 전용 기술 (없는 버튼은 일반 기술이 대시 속도를 실은 채 나간다) */
/** 대시 중 공격: 펀치 = 대시 스트레이트, 발차기 = 슬라이딩으로 미끄러지며 하단 */
export const DASH_MOVES: Partial<Record<Button, string>> = { 1: 'dashStraight', 2: 'dashStraight', 3: 'slideKick', 4: 'slideKick' };

/** 점프 중에 누르면 나가는 공중 기술 (손 = 점프 펀치, 발 = 날아차기) */
export const JUMP_MOVES: Record<Button, string> = { 1: 'jumpPunch', 2: 'jumpPunch', 3: 'jumpKick', 4: 'jumpKick' };

/** 기술표에 보여줄 플레이어 기술 */
export const PLAYER_MOVE_LIST: MoveDef[] = MOVE_LIST.filter((m) => m.notation !== 'BOSS');

export function totalFrames(m: MoveDef): number {
  return m.startup + m.active - 1 + m.recovery;
}

export const DIR_OF_KEY: Record<DirKey, Dir> = { db: 1, d: 2, df: 3, b: 4, n: 5, f: 6, ub: 7, u: 8, uf: 9 };

const DIR_KEYS: Record<Dir, DirKey> = { 1: 'db', 2: 'd', 3: 'df', 4: 'b', 5: 'n', 6: 'f', 7: 'ub', 8: 'u', 9: 'uf' };

/** 방향+버튼으로 기술을 찾는다. 정확한 방향 → (아래 계열이면) d → 중립 순으로 대체. */
export function findMove(button: Button, dir: Dir, pair?: Button): MoveDef | null {
  const tries: DirKey[] = [DIR_KEYS[dir]];
  if (dir === 1 || dir === 3) tries.push('d');
  tries.push('n');
  // 두 버튼을 같이 눌렀으면 동시 입력 기술부터 (순서 상관없이)
  if (pair) {
    const same = (m: MoveDef) => {
      const i = m.input;
      return !!i?.with && ((i.button === button && i.with === pair) || (i.button === pair && i.with === button));
    };
    for (const key of tries) {
      const mv = MOVE_LIST.find((m) => m.input?.dir === key && same(m));
      if (mv) return mv;
    }
  }
  for (const key of tries) {
    const mv = MOVE_LIST.find((m) => m.input?.dir === key && m.input.button === button && !m.input.with);
    if (mv) return mv;
  }
  return null;
}

/** 이 버튼이 동시 입력 기술에 쓰이나 (쓰이면 짝 버튼을 아주 잠깐 기다린다) */
export function hasComboWith(button: Button): boolean {
  return MOVE_LIST.some((m) => m.input?.with && (m.input.button === button || m.input.with === button));
}
