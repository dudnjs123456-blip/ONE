import type { Dir } from '../core/types';

/** 콤보 한 단계: 방향+버튼을 누르고, 다음 입력까지 기다리는 프레임 */
export interface ComboStep {
  dir: Dir;
  buttons: number[];
  wait: number;
}

export interface ComboDef {
  name: string;
  /** 기술표에 보여줄 표기 (화살표로 바뀜) */
  notation: string;
  /** 최소 몇 HIT 이 나와야 하는가 (검사용) */
  hits: number;
  tip: string;
  steps: ComboStep[];
}

const s = (dir: Dir, buttons: number[], wait: number): ComboStep => ({ dir, buttons, wait });

/**
 * 추천 콤보. scripts/training-sim.ts 가 실제 엔진으로 끝까지 이어지는지 확인한다
 * (입력 타이밍은 대전 템포 기준).
 */
export const COMBOS: ComboDef[] = [
  {
    name: '기본 원투',
    notation: '1, 2',
    hits: 2,
    tip: '잽이 맞으면 바로 2 — 가장 빠른 2연타',
    steps: [s(5, [1], 6), s(5, [2], 30)],
  },
  {
    name: '어퍼 띄우기 콤보',
    notation: 'df+2 → 1,2',
    hits: 3,
    tip: '띄운 뒤 상대가 떨어지는 걸 보고 원투 (조금 기다렸다 친다)',
    steps: [s(3, [2], 40), s(5, [1], 6), s(5, [2], 30)],
  },
  {
    name: '날아 무릎 콤보',
    notation: '2+4 → 1,2',
    hits: 3,
    tip: '2·4 를 같이 눌러 띄우고 원투',
    steps: [s(5, [2, 4], 42), s(5, [1], 6), s(5, [2], 30)],
  },
  {
    name: '대시 니킥 콤보',
    notation: 'f,f+3 → 1,2',
    hits: 3,
    tip: '앞으로 두 번 → 3 으로 파고들며 띄우고 원투',
    steps: [s(6, [], 1), s(5, [], 1), s(6, [], 1), s(6, [3], 36), s(5, [1], 6), s(5, [2], 30)],
  },
  {
    name: '어퍼 4연타 콤보',
    notation: 'df+2 → 1 → f+2 → f+2',
    hits: 4,
    tip: '띄우고 잽으로 받친 뒤 → 2 를 두 번 (연습 과제 "4 HIT 콤보")',
    steps: [s(3, [2], 28), s(5, [1], 21), s(6, [2], 22), s(6, [2], 6), s(5, [4], 30)],
  },
];
