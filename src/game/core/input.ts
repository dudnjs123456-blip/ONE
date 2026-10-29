import type { Button, Buttons, Dir } from './types';

/** 키보드에서 읽은 화면 기준 입력 */
export interface RawInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  buttons: Buttons;
  jump?: boolean;
}

/** 캐릭터 기준으로 변환된 한 프레임 입력. 엔진은 이것만 본다. */
export interface RelInput {
  dir: Dir;
  buttons: Buttons;
  /** 점프 키를 누르고 있나 (누른 순간에 뛴다) */
  jump?: boolean;
}

export const NEUTRAL_INPUT: RelInput = { dir: 5, buttons: [false, false, false, false] };

/** 한 프레임 입력 생성 헬퍼 (AI 스크립트용) */
export function makeInput(dir: Dir, button?: Button): RelInput {
  return { dir, buttons: [button === 1, button === 2, button === 3, button === 4] };
}

export function dirFrom(h: -1 | 0 | 1, v: -1 | 0 | 1): Dir {
  return (5 + h + v * 3) as Dir;
}

export const isDown = (d: Dir) => d <= 3;
export const isUp = (d: Dir) => d >= 7;
export const isForward = (d: Dir) => d % 3 === 0;
export const isBack = (d: Dir) => d % 3 === 1;

/** 화면 좌우를 캐릭터의 앞/뒤로 바꾼다. (상대가 화면 오른쪽이면 → 가 앞) */
export function toRelative(raw: RawInput, forwardIsRight: boolean): RelInput {
  const fwd = forwardIsRight ? raw.right : raw.left;
  const back = forwardIsRight ? raw.left : raw.right;
  const h = fwd && !back ? 1 : back && !fwd ? -1 : 0;
  const v = raw.up && !raw.down ? 1 : raw.down && !raw.up ? -1 : 0;
  return { dir: dirFrom(h, v), buttons: [...raw.buttons] as Buttons, jump: raw.jump };
}

export interface KeyMap {
  up: string;
  down: string;
  left: string;
  right: string;
  /** [1, 2, 3, 4] 순서 */
  buttons: [string, string, string, string];
  /** 점프 키 (여러 개 가능) */
  jump?: string[];
}

// P1: 방향키 이동, Q W = 1(왼팔) 2(오른팔), A S = 3(왼다리) 4(오른다리) — 철권 패드 배치와 같은 모양, 스페이스 점프.
// 키 설정(keybinds.ts)에서 바꾸면 이 값이 바뀐다
export const P1_KEYS: KeyMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  buttons: ['KeyQ', 'KeyW', 'KeyA', 'KeyS'],
  jump: ['Space'],
};

// P2 (2P 대전): 숫자패드 8 4 5 6 이동, 7 9 1 3 = 1 2 3 4 (철권 패드 배치: 좌상 1, 우상 2, 좌하 3, 우하 4)
export const P2_KEYS: KeyMap = {
  up: 'Numpad8',
  down: 'Numpad5',
  left: 'Numpad4',
  right: 'Numpad6',
  buttons: ['Numpad7', 'Numpad9', 'Numpad1', 'Numpad3'],
  jump: ['Numpad0'],
};

/** 게임 키 (브라우저 기본 동작 — 스크롤 등 — 을 막는다). 키 설정이 바뀔 수 있어 매번 확인 */
const isGameKey = (code: string) =>
  [P1_KEYS, P2_KEYS].some((m) => m.up === code || m.down === code || m.left === code || m.right === code || m.buttons.includes(code) || !!m.jump?.includes(code));

export class Keyboard {
  private pressed = new Set<string>();

  private onDown = (e: KeyboardEvent) => {
    if (isGameKey(e.code)) e.preventDefault();
    this.pressed.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    if (isGameKey(e.code)) e.preventDefault();
    this.pressed.delete(e.code);
  };
  private onBlur = () => this.pressed.clear();

  attach(target: Window) {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(target: Window) {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
    target.removeEventListener('blur', this.onBlur);
  }

  has(code: string): boolean {
    return this.pressed.has(code);
  }

  read(map: KeyMap): RawInput {
    const p = this.pressed;
    return {
      up: p.has(map.up),
      down: p.has(map.down),
      left: p.has(map.left),
      right: p.has(map.right),
      buttons: map.buttons.map((k) => p.has(k)) as Buttons,
      jump: (map.jump ?? []).some((k) => p.has(k)),
    };
  }
}
