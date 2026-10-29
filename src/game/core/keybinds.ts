import { P1_KEYS } from './input';

/**
 * 키 설정 (1P): 이동·공격·점프·달리기·상호작용 키를 바꿀 수 있다.
 * 이 컴퓨터(브라우저)에만 저장된다. 바꾸면 P1_KEYS 에 바로 반영돼 모든 모드(도시·필드·보스·대전)에 적용된다.
 */
export type BindAction = 'up' | 'down' | 'left' | 'right' | 'b1' | 'b2' | 'b3' | 'b4' | 'jump' | 'run' | 'interact';

export const BIND_ACTIONS: { id: BindAction; label: string }[] = [
  { id: 'up', label: '위 이동' },
  { id: 'down', label: '아래 이동 (싸울 때 숙이기)' },
  { id: 'left', label: '왼쪽 이동' },
  { id: 'right', label: '오른쪽 이동' },
  { id: 'b1', label: '1 왼팔' },
  { id: 'b2', label: '2 오른팔' },
  { id: 'b3', label: '3 왼다리' },
  { id: 'b4', label: '4 오른다리' },
  { id: 'jump', label: '점프' },
  { id: 'run', label: '달리기 · 기술 아래 입력' },
  { id: 'interact', label: '상호작용 (말 걸기·문 열기)' },
];

const DEFAULT_BINDS: Record<BindAction, string[]> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  b1: ['KeyQ'],
  b2: ['KeyW'],
  b3: ['KeyA'],
  b4: ['KeyS'],
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter'],
};

/** 다른 기능 단축키라 바꿀 수 없는 키 (지도 M, 가방 I, 일자리 J, 자동근무 G·P, 장비 T, 메뉴 Esc, 판정 표시 `) */
const RESERVED = new Set(['Escape', 'KeyM', 'KeyI', 'KeyJ', 'KeyG', 'KeyP', 'KeyT', 'Backquote', 'Tab', 'MetaLeft', 'MetaRight']);

const STORAGE_KEY = 'ironfist.keybinds';
let binds: Record<BindAction, string[]> = clone(DEFAULT_BINDS);

function clone(b: Record<BindAction, string[]>) {
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])) as Record<BindAction, string[]>;
}

function apply() {
  P1_KEYS.up = binds.up[0];
  P1_KEYS.down = binds.down[0];
  P1_KEYS.left = binds.left[0];
  P1_KEYS.right = binds.right[0];
  P1_KEYS.buttons = [binds.b1[0], binds.b2[0], binds.b3[0], binds.b4[0]];
  P1_KEYS.jump = [...binds.jump];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
  } catch {
    // 저장이 막힌 브라우저: 이번 접속 동안만 쓴다
  }
}

// 불러오기 (브라우저에서만)
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<BindAction, string[]>>;
      for (const { id } of BIND_ACTIONS) {
        const v = saved[id];
        if (Array.isArray(v) && v.length && v.every((c) => typeof c === 'string')) binds[id] = [...v];
      }
    }
  } catch {
    // 깨진 설정은 기본값으로
  }
  apply();
}

/** 이 동작에 지정된 키 코드들 */
export function bindCodes(action: BindAction): string[] {
  return binds[action];
}

/**
 * 키를 바꾼다. 다른 동작이 쓰던 키면 서로 맞바꾼다.
 * @returns 바꿀 수 없는 키면 그 이유
 */
export function setBind(action: BindAction, code: string): string | null {
  if (RESERVED.has(code) || /^F\d+$/.test(code)) return `${keyName(code)} 키는 다른 기능에 쓰여서 지정할 수 없어요`;
  const old = binds[action];
  for (const { id } of BIND_ACTIONS) {
    if (id !== action && binds[id].includes(code)) {
      const rest = binds[id].filter((c) => c !== code);
      // 맞바꾸기: 상대 동작에 키가 하나도 안 남으면 내 예전 키를 준다
      binds[id] = rest.length ? rest : [old[0]];
    }
  }
  binds[action] = [code];
  apply();
  save();
  return null;
}

export function resetBinds() {
  binds = clone(DEFAULT_BINDS);
  apply();
  save();
}

/** 화면에 보일 키 이름 */
export function keyName(code: string): string {
  const named: Record<string, string> = {
    Space: '스페이스',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'Shift',
    ShiftRight: '오른쪽 Shift',
    ControlLeft: 'Ctrl',
    ControlRight: '오른쪽 Ctrl',
    AltLeft: 'Alt',
    AltRight: '오른쪽 Alt',
    Enter: 'Enter',
    Backspace: 'Backspace',
    CapsLock: 'CapsLock',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return code;
}

/** 이 동작의 키 이름 (안내 문구용, 여러 개면 첫 번째) */
export function bindLabel(action: BindAction): string {
  return keyName(binds[action][0]);
}
