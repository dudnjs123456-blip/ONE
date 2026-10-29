import { mulberry32 } from './controllers';
import type { FieldCommand, FieldWorld, PlayerController } from './field';
import { Keyboard, NEUTRAL_INPUT, P1_KEYS, dirFrom, makeInput, type KeyMap, type RelInput } from './input';
import { bindCodes } from './keybinds';
import type { Button, Dir } from './types';

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

    const dx = t.x - p.x;
    const dz = t.z - p.z;
    if (Math.hypot(dx, dz) > ENGAGE_RANGE) return { move: { x: dx, z: dz }, input: NEUTRAL_INPUT };
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
export class FieldKeyboardController implements PlayerController {
  constructor(
    private kb: Keyboard,
    private map: KeyMap = P1_KEYS,
  ) {}

  read(w: FieldWorld): FieldCommand {
    const raw = this.kb.read(this.map);
    const crouch = bindCodes('run').some((k) => this.kb.has(k));
    const mx = (raw.right ? 1 : 0) - (raw.left ? 1 : 0);
    const mz = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
    const p = w.player;

    let h: -1 | 0 | 1 = 0;
    if (mx || mz) {
      const d = (mx * p.fx + mz * p.fz) / Math.hypot(mx, mz);
      h = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    }
    const anyButton = raw.buttons.some(Boolean);
    const move = !crouch && !anyButton && (mx || mz) ? { x: mx, z: mz } : null;
    return { move, input: { dir: dirFrom(h, crouch ? -1 : 0), buttons: raw.buttons, jump: raw.jump } };
  }
}
