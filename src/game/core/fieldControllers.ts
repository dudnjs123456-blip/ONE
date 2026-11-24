import { mulberry32 } from './controllers';
import { FIELD_HALF } from './field';
import { VILLAGE_GATE_OUT } from '../data/village';
import type { FieldCommand, FieldWorld, PlayerController } from './field';
import { DIM_ATTACK_KEYS, Keyboard, NEUTRAL_INPUT, P1_KEYS, dirFrom, makeInput, mergeRaw, padHeld, readGamepad, type KeyMap, type RelInput } from './input';
import { bindCodes } from './keybinds';
import type { Button, Buttons, Dir } from './types';

const P = (dir: Dir, button: Button) => makeInput(dir, button);
const H = (dir: Dir, frames: number): RelInput[] => Array.from({ length: frames }, () => makeInput(dir));

/**
 * 자동사냥이 쓰는 콤보 루틴. 철권 입력 그대로 (방향은 캐릭터 기준).
 * 대기 프레임은 히트스톱까지 감안해서 선입력 버퍼(8F) 안에 들어오게 잡았다.
 */
const ROUTINES: { weight: number; seq: RelInput[] }[] = [
  { weight: 3, seq: [P(5, 1), ...H(5, 6), P(5, 2), ...H(5, 22)] }, // 원투
  { weight: 2, seq: [P(3, 2), ...H(5, 40), P(5, 1), ...H(5, 6), P(5, 2), ...H(5, 22)] }, // 어퍼 → 공중 원투
  { weight: 2, seq: [P(5, 3), ...H(5, 28)] }, // 미들킥
  { weight: 1, seq: [P(2, 4), ...H(2, 4), ...H(5, 22)] }, // 로우킥
  { weight: 1, seq: [P(6, 2), ...H(5, 30)] }, // 보디블로
  { weight: 1, seq: [P(5, 4), ...H(5, 24)] }, // 하이킥
];
const TOTAL_WEIGHT = ROUTINES.reduce((s, r) => s + r.weight, 0);

/** 근접 사거리 (몸 중심 간 거리) */
const ENGAGE_RANGE = 1.05;

/** 자동사냥: 타겟에게 달려가서 콤보 루틴을 쓰고, 상대 공격엔 가끔 반응 가드 */
export class AutoHuntController implements PlayerController {
  private queue: RelInput[] = [];
  private rng = mulberry32(99);
  private guardedSerial = -1;

  read(w: FieldWorld): FieldCommand {
    const p = w.player;
    const t = w.target?.fighter;

    // 반응 가드 (상단·중단은 서서, 하단은 앉아서)
    const tm = t?.state === 'attack' ? t.move : null;
    if (t && tm && t.moveSerial !== this.guardedSerial && t.frame < tm.startup && p.isActionable) {
      this.guardedSerial = t.moveSerial;
      if (this.rng() < 0.3) this.queue = H(tm.level === 'low' ? 1 : 4, tm.startup - t.frame + tm.active + 2);
    }

    if (this.queue.length) return { move: null, input: this.queue.shift()! };
    if (!t || !p.isActionable) return { move: null, input: NEUTRAL_INPUT };

    // 마을 안이면 먼저 북문으로 나간다 (담장을 따라 미끄러져 문으로 들어선다)
    if (p.z > FIELD_HALF - 0.3 && t.z < FIELD_HALF) return { move: { x: VILLAGE_GATE_OUT.x - p.x, z: VILLAGE_GATE_OUT.z - p.z }, run: true, input: NEUTRAL_INPUT };
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    if (Math.hypot(dx, dz) > ENGAGE_RANGE) return { move: { x: dx, z: dz }, run: true, input: NEUTRAL_INPUT };
    if (t.isInvulnerable()) return { move: null, input: NEUTRAL_INPUT }; // 다운 중엔 기다린다

    if (t.isAirborne()) {
      this.queue = [P(5, 1), ...H(5, 6), P(5, 2), ...H(5, 10)];
    } else {
      let r = this.rng() * TOTAL_WEIGHT;
      const routine = ROUTINES.find((x) => (r -= x.weight) < 0) ?? ROUTINES[0];
      this.queue = [...routine.seq];
    }
    return { move: null, input: this.queue.shift()! };
  }
}

/**
 * 수동 조작. 방향키 = 화면 기준 달리기, 버튼 = 기술.
 * 버튼을 누를 때 이동키 방향을 캐릭터 기준 앞/뒤로, Shift 를 '아래' 로 해석한다.
 * (예: Shift + 타겟 쪽 + W = df+2 어퍼)
 */
/**
 * 차원(반대편 세계) 조작: 방향키 걷기 · Shift 달리기 · Space 점프 · Ctrl 기본 공격.
 * Ctrl 을 누를 때마다 왼팔·오른팔·왼다리·오른다리 중 하나가 무작위로 나간다 (누르고 있는 동안은 같은 것).
 * 숙이기는 없다 (서울과 다른 몸 쓰기). 근 기술(Q W E R · A S D)과 상호작용(F)은 화면(FieldView)이 받는다.
 * 패드는 예전처럼 버튼 1~4 를 따로 쓴다.
 */
export class DimensionKeyboardController implements PlayerController {
  private held = -1;
  constructor(
    private kb: Keyboard,
    private padIndex?: number,
    private rnd: () => number = Math.random,
  ) {}

  read(w: FieldWorld): FieldCommand {
    const map: KeyMap = { up: P1_KEYS.up, down: P1_KEYS.down, left: P1_KEYS.left, right: P1_KEYS.right, buttons: [DIM_ATTACK_KEYS[0], DIM_ATTACK_KEYS[1], '', ''], jump: P1_KEYS.jump };
    const key = this.kb.read(map);
    const attack = key.buttons[0] || key.buttons[1];
    if (!attack) this.held = -1;
    else if (this.held < 0) this.held = Math.floor(this.rnd() * 4);
    const buttons: Buttons = [false, false, false, false];
    if (this.held >= 0) buttons[this.held] = true;
    const raw = this.padIndex === undefined ? { ...key, buttons } : mergeRaw({ ...key, buttons }, readGamepad(this.padIndex));
    const runKey = bindCodes('run').some((k) => this.kb.has(k));
    const mx = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const mz = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
    const anyButton = raw.buttons.some(Boolean);
    const p = w.player;
    let h: -1 | 0 | 1 = 0;
    if (mx || mz) {
      const d = (mx * p.fx + mz * p.fz) / Math.hypot(mx, mz);
      h = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    }
    const move = !anyButton && (mx || mz) ? { x: mx, z: mz } : null;
    return { move, run: runKey, input: { dir: dirFrom(h, 0), buttons: raw.buttons, jump: raw.jump } };
  }
}

export class FieldKeyboardController implements PlayerController {
  constructor(
    private kb: Keyboard,
    private map: KeyMap = P1_KEYS,
    /** 같이 읽을 게임패드 순번 (LB = 앉기). 없으면 키보드만 */
    private padIndex?: number,
  ) {}

  read(w: FieldWorld): FieldCommand {
    const raw = this.padIndex === undefined ? this.kb.read(this.map) : mergeRaw(this.kb.read(this.map), readGamepad(this.padIndex));
    const runKey = bindCodes('run').some((k) => this.kb.has(k));
    const duckKey = bindCodes('crouch').some((k) => this.kb.has(k)) || (this.padIndex !== undefined && padHeld(4, this.padIndex));
    const mx = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const mz = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
    const anyButton = raw.buttons.some(Boolean);
    // 서울과 같은 규칙: 방향키 = 걷기, Shift + 방향키 = 달리기, Shift + 기술 버튼 = '아래' 기술 (Shift+앞+W = 어퍼),
    // C(숙이기 키) = 숙이기. Shift 만 누르고 있으면 아무 일도 없다
    const crouch = duckKey || (runKey && anyButton);
    const p = w.player;

    let h: -1 | 0 | 1 = 0;
    if (mx || mz) {
      const d = (mx * p.fx + mz * p.fz) / Math.hypot(mx, mz);
      h = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    }
    const move = !crouch && !anyButton && (mx || mz) ? { x: mx, z: mz } : null;
    return { move, run: runKey, input: { dir: dirFrom(h, crouch ? -1 : 0), buttons: raw.buttons, jump: raw.jump } };
  }
}
