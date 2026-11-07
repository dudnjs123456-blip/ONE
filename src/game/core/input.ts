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

/** 읽히지 않은 채 뗀 키를 이 시간 뒤엔 반드시 뗀다 (여러 프레임 넉넉히) */
const LATE_RELEASE_MS = 120;

export class Keyboard {
  private pressed = new Set<string>();

  // 실제 키도 터치 버튼과 같이: 화면이 잠깐 멈춰 게임이 읽기 전에 손을 뗀 아주 짧은 탭도 한 번은 읽힌다
  private onDown = (e: KeyboardEvent) => {
    if (!isGameKey(e.code)) {
      // 게임 키가 아닌 키(달리기 등 설정 키)는 예전처럼 바로
      this.pressed.add(e.code);
      return;
    }
    e.preventDefault();
    // 꾹 누르고 있을 때 반복 이벤트: 눌린 상태만 유지 (창 전환 뒤 다시 잡을 때)
    if (e.repeat) {
      this.pressed.add(e.code);
      return;
    }
    this.setVirtual(e.code, true);
  };
  private onUp = (e: KeyboardEvent) => {
    if (!isGameKey(e.code)) {
      this.pressed.delete(e.code);
      return;
    }
    e.preventDefault();
    this.setVirtual(e.code, false);
    // 게임이 read 로 읽지 않는 키(달리기 등 has 로만 보는 키)가 눌린 채 남지 않게 잠시 뒤엔 반드시 뗀다
    if (this.lateRelease.has(e.code)) {
      const code = e.code;
      setTimeout(() => {
        if (this.lateRelease.delete(code)) {
          this.unread.delete(code);
          this.pressed.delete(code);
        }
      }, LATE_RELEASE_MS);
    }
  };
  private onBlur = () => {
    this.pressed.clear();
    this.unread.clear();
    this.lateRelease.clear();
  };

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

  /** 눌렀지만 아직 게임이 한 번도 읽지 않은 키 (아주 짧은 탭도 놓치지 않게) */
  private unread = new Set<string>();
  /** 읽히기 전에 손을 뗀 키: 다음 read 뒤에 뗀다 */
  private lateRelease = new Set<string>();

  /** 화면 터치 버튼 등에서 키를 누른 것처럼 넣는다 */
  setVirtual(code: string, down: boolean) {
    if (down) {
      this.pressed.add(code);
      this.unread.add(code);
      this.lateRelease.delete(code);
    } else if (this.unread.has(code)) {
      this.lateRelease.add(code);
    } else {
      this.pressed.delete(code);
    }
  }

  has(code: string): boolean {
    return this.pressed.has(code);
  }

  read(map: KeyMap): RawInput {
    const p = this.pressed;
    const out: RawInput = {
      up: p.has(map.up),
      down: p.has(map.down),
      left: p.has(map.left),
      right: p.has(map.right),
      buttons: map.buttons.map((k) => p.has(k)) as Buttons,
      jump: (map.jump ?? []).some((k) => p.has(k)),
    };
    if (this.unread.size) {
      for (const k of [map.up, map.down, map.left, map.right, ...map.buttons, ...(map.jump ?? [])]) {
        this.unread.delete(k);
        if (this.lateRelease.delete(k)) p.delete(k);
      }
    }
    return out;
  }
}

// ───────────────────────── 게임패드 ─────────────────────────

/** 스틱이 이만큼 이상 기울면 방향 입력 */
const STICK_DEAD = 0.45;

/** 패드 버튼 번호 (브라우저 표준 배치) → 철권 패드 배치: 1 = 왼쪽(X/□), 2 = 위(Y/△), 3 = 아래(A/✕), 4 = 오른쪽(B/○) */
export const PAD_BUTTONS: [number, number, number, number] = [2, 3, 0, 1];
/** 점프: 오른쪽 숄더(RB/R1) */
const PAD_JUMP = 5;

type PadLike = { buttons: readonly { pressed: boolean }[]; axes: readonly number[] } | null;

/** 패드 상태 → 화면 기준 입력 (방향 패드 또는 왼쪽 스틱). 패드가 없으면 null */
export function padToRaw(pad: PadLike): RawInput | null {
  if (!pad) return null;
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  return {
    up: b(12) || ay < -STICK_DEAD,
    down: b(13) || ay > STICK_DEAD,
    left: b(14) || ax < -STICK_DEAD,
    right: b(15) || ax > STICK_DEAD,
    buttons: PAD_BUTTONS.map(b) as Buttons,
    jump: b(PAD_JUMP),
  };
}

/** index 번째로 연결된 패드 입력 (없으면 null) */
export function readGamepad(index: number): RawInput | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
  return padToRaw(pads[index] ?? null);
}

/** 키보드 입력과 패드 입력을 합친다 (둘 중 하나라도 누르면 눌림) */
export function mergeRaw(a: RawInput, b: RawInput | null): RawInput {
  if (!b) return a;
  return {
    up: a.up || b.up,
    down: a.down || b.down,
    left: a.left || b.left,
    right: a.right || b.right,
    buttons: a.buttons.map((v, i) => v || b.buttons[i]) as Buttons,
    jump: !!(a.jump || b.jump),
  };
}

/** 패드 버튼 번호(표준 배치) → 누른 순간 할 일. 메뉴 조작용 (A=0, B=1, Back=8, Start=9, 방향 12~15). @returns 정리 함수 */
export function watchPad(handlers: Partial<Record<number, () => void>>, index = 0): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.getGamepads) return () => {};
  const prev = new Map<number, boolean>();
  const timer = window.setInterval(() => {
    const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
    const pad = pads[index];
    for (const [k, fn] of Object.entries(handlers)) {
      const b = Number(k);
      const down = !!pad?.buttons[b]?.pressed;
      if (down && !prev.get(b)) fn?.();
      prev.set(b, down);
    }
  }, 50);
  return () => window.clearInterval(timer);
}

/** 패드의 메뉴 버튼(Start = 9, Back/Select = 8)을 누른 순간을 알려준다. @returns 정리 함수 */
export function watchPadButtons(handlers: { start?: () => void; select?: () => void }, index = 0): () => void {
  return watchPad({ 9: handlers.start, 8: handlers.select }, index);
}

/** 패드 LB(4) — 필드에서 앉기 */
export function padHeld(button: number, index = 0): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
  const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
  return !!pads[index]?.buttons[button]?.pressed;
}
