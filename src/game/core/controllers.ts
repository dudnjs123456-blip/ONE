import type { Fighter } from './fighter';
import { Keyboard, NEUTRAL_INPUT, toRelative, type KeyMap, type RelInput } from './input';
import type { Buttons, Dir } from './types';

export interface ControllerContext {
  self: Fighter;
  opponent: Fighter;
  /** 상대가 화면 오른쪽에 있으면 true (→ 가 앞) */
  forwardIsRight: boolean;
  frame: number;
}

/** 매 프레임 입력을 만들어내는 주체. 키보드, AI, (나중에) 네트워크/리플레이 */
export interface Controller {
  read(ctx: ControllerContext): RelInput;
}

export class KeyboardController implements Controller {
  constructor(
    private kb: Keyboard,
    private map: KeyMap,
  ) {}

  read(ctx: ControllerContext): RelInput {
    return toRelative(this.kb.read(this.map), ctx.forwardIsRight);
  }
}

/** 아무것도 하지 않는 연습용 허수아비 (서서 가드) */
export class DummyController implements Controller {
  read(): RelInput {
    return NEUTRAL_INPUT;
  }
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NO_BUTTONS: Buttons = [false, false, false, false];
const press = (dir: Dir, button?: 1 | 2 | 3 | 4): RelInput => ({
  dir,
  buttons: button ? (NO_BUTTONS.map((_, i) => i === button - 1) as Buttons) : NO_BUTTONS,
});

const CPU_ATTACKS: [Dir, 1 | 2 | 3 | 4][] = [
  [5, 1], [5, 2], [5, 3], [5, 4], [3, 1], [3, 2], [6, 2], [2, 4], [1, 3],
];

/** 아주 단순한 CPU. 거리 조절 / 랜덤 공격 / 반응 가드 / 공중 콤보 */
export class CpuController implements Controller {
  private queue: RelInput[] = [];
  private rng: () => number;
  private reactedTo = -1;

  constructor(
    seed = 1234,
    /** 0~1, 반응 가드 확률 */
    private skill = 0.45,
  ) {
    this.rng = mulberry32(seed);
  }

  read({ self, opponent }: ControllerContext): RelInput {
    const om = opponent.state === 'attack' ? opponent.move : null;
    if (om && opponent.moveSerial !== this.reactedTo && self.isActionable) {
      this.reactedTo = opponent.moveSerial;
      if (this.rng() < this.skill) {
        this.queue = [];
        this.hold(om.level === 'low' ? 1 : 4, om.startup + om.active + 4);
      }
    }

    if (this.queue.length) return this.queue.shift()!;

    if (!self.isActionable) {
      return press(self.state === 'blockstun' ? 4 : 5);
    }

    const dist = Math.hypot(opponent.x - self.x, opponent.z - self.z);
    const r = this.rng();

    if (opponent.state === 'launched' && dist < 1.5) {
      this.attack(this.rng() < 0.5 ? [5, 1] : [5, 3]);
    } else if (opponent.state === 'knockdown' || opponent.state === 'getup') {
      this.hold(4, 10);
    } else if (dist > 1.7) {
      if (r < 0.08) this.queue.push(press(6), press(5), press(6), ...Array(6).fill(press(6)));
      else this.hold(6, 8);
    } else if (r < 0.45) {
      this.attack(CPU_ATTACKS[Math.floor(this.rng() * CPU_ATTACKS.length)]);
    } else if (r < 0.6) {
      this.hold(4, 10 + Math.floor(this.rng() * 15));
    } else if (r < 0.7) {
      this.queue.push(press(8), press(5));
    } else if (r < 0.8) {
      this.hold(1, 15);
    } else {
      this.hold(5, 12);
    }
    return this.queue.shift() ?? NEUTRAL_INPUT;
  }

  private hold(dir: Dir, frames: number) {
    for (let i = 0; i < frames; i++) this.queue.push(press(dir));
  }

  private attack([dir, button]: [Dir, 1 | 2 | 3 | 4]) {
    this.queue.push(press(dir, button), press(dir));
    // 잽이면 가끔 원투로 잇는다
    if (button === 1 && dir === 5 && this.rng() < 0.5) {
      this.hold(5, 6);
      this.queue.push(press(5, 2));
    }
    this.hold(5, 10 + Math.floor(this.rng() * 20));
  }
}
