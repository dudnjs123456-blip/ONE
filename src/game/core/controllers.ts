import type { Fighter } from './fighter';
import { Keyboard, NEUTRAL_INPUT, mergeRaw, readGamepad, toRelative, type KeyMap, type RelInput } from './input';
import type { Buttons, Dir } from './types';
import { MOVES, PUNISH_FRAMES, findMove, playerStartup, totalFrames } from '../data/moves';

/** 반격 기술들의 실제(템포 보정) 발생 프레임 */
const PUNISH = { jab: PUNISH_FRAMES, dfJab: playerStartup(MOVES.dfJab), uppercut: playerStartup(MOVES.uppercut) };
import { FIGHTER_RADIUS, STAGE_RADIUS } from './constants';

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
    /** 같이 읽을 게임패드 순번 (0 = 첫 번째 연결된 패드). 없으면 키보드만 */
    private padIndex?: number,
  ) {}

  read(ctx: ControllerContext): RelInput {
    const raw = this.padIndex === undefined ? this.kb.read(this.map) : mergeRaw(this.kb.read(this.map), readGamepad(this.padIndex));
    return toRelative(raw, ctx.forwardIsRight);
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

/** 띄운 상대가 이 높이(m)보다 낮으면 곧 떨어지니 공중 콤보를 넣지 않는다 */
const JUGGLE_MIN_HEIGHT = 0.35;

const CPU_ATTACKS: [Dir, 1 | 2 | 3 | 4][] = [
  [5, 1], [5, 2], [5, 3], [5, 4], [3, 1], [3, 2], [6, 2], [2, 4], [1, 3],
];

export type CpuLevel = 'easy' | 'normal' | 'hard';

export interface CpuTuning {
  /** 상대 기술에 반응해 가드할 확률 */
  guard: number;
  /** 가드한 뒤 상대 빈틈(후딜)에 반격할 확률 */
  punish: number;
  /** 헛친 기술의 빈틈을 노릴 확률 */
  whiffPunish: number;
  /** 큰 빈틈에 띄우기(어퍼)로 반격하나 */
  launchPunish: boolean;
  /** 사거리 안에서 공격을 고를 확률 (나머지는 견제·이동) */
  aggression: number;
  /** 느리고 직선적인 기술을 보면 막는 대신 횡보로 피할 확률 */
  dodge: number;
}

export const CPU_LEVELS: Record<CpuLevel, CpuTuning & { label: string; desc: string }> = {
  easy: { label: '쉬움', desc: '가드를 잘 안 하고 반격도 없어요', guard: 0.15, punish: 0, whiffPunish: 0, launchPunish: false, aggression: 0.3, dodge: 0 },
  normal: { label: '보통', desc: '가끔 막고, 가끔 빈틈을 노려요', guard: 0.45, punish: 0.35, whiffPunish: 0.2, launchPunish: false, aggression: 0.45, dodge: 0.1 },
  hard: { label: '어려움', desc: '잘 막고, 큰 빈틈엔 띄우기로 반격해요', guard: 0.75, punish: 0.9, whiffPunish: 0.6, launchPunish: true, aggression: 0.5, dodge: 0.3 },
};

export type CpuStyle = 'balanced' | 'aggressive' | 'defensive';

export const CPU_STYLES: Record<CpuStyle, { label: string; adjust: (t: CpuTuning) => CpuTuning }> = {
  balanced: { label: '균형형', adjust: (t) => t },
  // 공격형: 더 자주 들어오고 덜 막는다
  aggressive: {
    label: '공격형',
    adjust: (t) => ({ ...t, aggression: Math.min(0.75, t.aggression + 0.2), guard: t.guard * 0.75, dodge: t.dodge * 0.5 }),
  },
  // 수비형: 덜 들어오고, 더 잘 막고, 반격·피하기를 더 한다
  defensive: {
    label: '수비형',
    adjust: (t) => ({
      ...t,
      aggression: Math.max(0.2, t.aggression - 0.15),
      guard: Math.min(0.92, t.guard + 0.15),
      punish: Math.min(1, t.punish + 0.1),
      dodge: Math.min(0.5, t.dodge + 0.1),
    }),
  },
};

/** CPU. 거리 조절 / 랜덤 공격 / 반응 가드 / 빈틈 반격 / 공중 콤보 */
export class CpuController implements Controller {
  private queue: RelInput[] = [];
  private rng: () => number;
  private reactedTo = -1;
  private punishChecked = -1;
  private tuning: CpuTuning;

  constructor(
    seed = 1234,
    /** 0~1, 반응 가드 확률 (level 없이 부를 때만 쓰임 — 보스 시뮬 등 예전 호출 유지) */
    skill = 0.45,
    level?: CpuLevel,
    /** 성격 (같은 난이도 안에서 싸우는 방식) */
    style: CpuStyle = 'balanced',
  ) {
    this.rng = mulberry32(seed);
    const base = level ? CPU_LEVELS[level] : { ...CPU_LEVELS.normal, guard: skill, punish: 0, whiffPunish: 0, dodge: 0 };
    this.tuning = CPU_STYLES[style].adjust(base);
  }

  read({ self, opponent }: ControllerContext): RelInput {
    const t = this.tuning;
    const om = opponent.state === 'attack' ? opponent.move : null;
    const dist = Math.hypot(opponent.x - self.x, opponent.z - self.z);

    if (om && opponent.moveSerial !== this.reactedTo && self.isActionable) {
      this.reactedTo = opponent.moveSerial;
      const linear = om.tracking < 0.12 && om.startup >= 9 && !om.unblockable;
      if (linear && this.rng() < t.dodge) {
        // 직선기는 옆으로 걸어 피한다 (헛친 빈틈은 아래 반격 로직이 노린다)
        const dir: Dir = this.rng() < 0.5 ? 8 : 2;
        this.queue = [press(dir), press(5), press(dir)];
        this.hold(dir, om.startup + om.active + 2);
      } else if (this.rng() < t.guard) {
        this.queue = [];
        // 잡기는 막을 수 없으니 앉아서 피한다
        this.hold(om.level === 'low' ? 1 : om.unblockable ? 2 : 4, om.startup + om.active + 4);
      }
    }

    // 상대 기술의 후딜(빈틈)에 반격: 막은 직후, 또는 상대가 허공을 쳤을 때
    if (om && self.isActionable && opponent.frame > om.startup + om.active && opponent.moveSerial !== this.punishChecked) {
      this.punishChecked = opponent.moveSerial;
      const blocked = opponent.moveHits.includes(self);
      const remaining = totalFrames(om) - opponent.frame;
      if (dist < 1.15 && remaining >= PUNISH.jab && this.rng() < (blocked ? t.punish : t.whiffPunish)) {
        this.queue = [];
        if (t.launchPunish && remaining >= PUNISH.uppercut && dist < 0.85) this.queue.push(press(3, 2), press(3));
        else if (remaining >= PUNISH.dfJab && dist < 1.0) this.queue.push(press(3, 1), press(5));
        // 앉은 자세로 끝나는 하단 기술엔 상단 잽이 빗나가므로 반격하지 않는다 (중단 잽이 안 닿는 거리)
        else if (!om.crouching && om.level !== 'low') this.queue.push(press(5, 1), ...Array<RelInput>(5).fill(press(5)), press(5, 2));
        this.hold(5, 8);
      }
    }

    if (this.queue.length) return this.queue.shift()!;

    if (!self.isActionable) {
      return press(self.state === 'blockstun' ? 4 : 5);
    }

    const r = this.rng();
    const a = t.aggression;

    // 벽 활용 (보통·어려움): 상대가 벽에 붙어 굳었으면 띄우기, 벽 가까이 있으면 밀어내기로 벽꽝 노리기
    const oppAtWall = Math.hypot(opponent.x, opponent.z) > STAGE_RADIUS - 1.1;
    if (t.punish > 0 && oppAtWall && opponent.state === 'hitstun' && dist < 1.0) {
      this.queue.push(press(3, 2), press(3));
      this.hold(5, 10);
    } else if (opponent.state === 'launched' && dist < 1.8) {
      // 공중 콤보: 다시 움직일 수 있게 되면 곧바로 원투 (멀면 다가가고, 바닥 직전이면 포기)
      if (opponent.y < JUGGLE_MIN_HEIGHT || dist > 1.1) this.hold(dist > 1.0 ? 6 : 5, 1);
      else {
        this.queue.push(press(5, 1), ...Array<RelInput>(5).fill(press(5)), press(5, 2));
        this.hold(5, 14);
      }
    } else if (t.punish > 0 && oppAtWall && dist < 1.1 && r < a && this.rng() < 0.4) {
      this.attack([6, 2]);
    } else if (opponent.state === 'knockdown' || opponent.state === 'getup') {
      this.hold(4, 10);
    } else if (dist > 1.7) {
      if (r < 0.08) this.queue.push(press(6), press(5), press(6), ...Array<RelInput>(6).fill(press(6)));
      else this.hold(6, 8);
    } else if (r < a && dist < 0.75 && this.rng() < 0.18) {
      // 붙어 있으면 가끔 잡기 (가드만 하는 상대 뚫기)
      this.queue.push({ dir: 6, buttons: [true, false, true, false] }, press(5));
      this.hold(5, 20);
    } else if (r < a) {
      // 지금 거리에서 실제로 닿는 기술만 고른다 (닿는 게 없으면 다가간다)
      const inReach = CPU_ATTACKS.filter(([dir, button]) => {
        const mv = findMove(button, dir);
        return !!mv && dist <= mv.range + FIGHTER_RADIUS + (mv.lunge ?? 0) * mv.startup;
      });
      if (inReach.length) this.attack(inReach[Math.floor(this.rng() * inReach.length)]);
      else this.hold(6, 6);
    } else if (r < a + 0.15) {
      this.hold(4, 10 + Math.floor(this.rng() * 15));
    } else if (r < a + 0.25) {
      this.queue.push(press(this.rng() < 0.5 ? 8 : 2), press(5));
    } else if (r < a + 0.35) {
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

/** open: 가드 없이 다가오기 (콤보 시연용, 메뉴엔 없음) */
export type DummyMode = 'noguard' | 'stand' | 'crouch' | 'random' | 'punish' | 'cpu' | 'open' | 'playback';

export const DUMMY_MODES: { id: DummyMode; label: string; desc: string }[] = [
  { id: 'noguard', label: '가드 안 함', desc: '가만히 서서 다 맞음 (콤보·기술 연습)' },
  { id: 'stand', label: '서서 가드', desc: '상·중단은 막고 하단은 맞음' },
  { id: 'crouch', label: '앉아 가드', desc: '하단은 막고 상단은 헛침, 중단은 맞음' },
  { id: 'random', label: '랜덤 가드', desc: '공격마다 서거나 앉아서 막음 (중단·하단 섞기 연습)' },
  { id: 'punish', label: '가드 후 반격', desc: `막은 뒤 빈틈이 있으면 잽(${PUNISH_FRAMES}F)·하단엔 중단 잽으로 반격 (기술이 안전한지 확인)` },
  { id: 'cpu', label: 'CPU', desc: '보통 난이도 CPU 처럼 움직임' },
  { id: 'playback', label: '녹화 재생', desc: '● 녹화로 저장한 내 동작을 허수아비가 나를 향해 반복 (막기·반격 연습)' },
];

/** 녹화 앞뒤의 아무것도 안 누른 프레임을 잘라낸다 */
export function trimTape(tape: RelInput[]): RelInput[] {
  const idle = (i: RelInput) => i.dir === 5 && !i.buttons.some(Boolean) && !i.jump;
  let a = 0;
  let b = tape.length;
  while (a < b && idle(tape[a])) a++;
  while (b > a && idle(tape[b - 1])) b--;
  return tape.slice(a, b);
}

/** 연습 모드 허수아비: 행동을 바꿀 수 있다 */
export class TrainingDummyController implements Controller {
  mode: DummyMode = 'stand';
  private cpu = new CpuController(4321, 0, 'normal');
  private rng = mulberry32(777);
  private serial = -1;
  private crouchNow = false;
  private punishChecked = -1;
  private queue: RelInput[] = [];
  /** 녹화 재생: 이 입력들을 처음부터 끝까지, 잠깐 쉬었다가 다시 */
  private tape: RelInput[] = [];
  private at = 0;
  private gap = 0;

  setTape(t: RelInput[]) {
    this.tape = t;
    this.at = 0;
    this.gap = 30;
  }
  get hasTape() {
    return this.tape.length > 0;
  }

  read(ctx: ControllerContext): RelInput {
    const { self, opponent } = ctx;
    // '가드 안 함' 일 때만 막지 못하게 (다른 모드로 바꾸면 다시 막는다)
    self.canBlock = this.mode !== 'noguard';
    switch (this.mode) {
      case 'noguard':
        return NEUTRAL_INPUT;
      case 'playback': {
        if (!this.tape.length) return NEUTRAL_INPUT;
        if (this.gap > 0) {
          this.gap--;
          return NEUTRAL_INPUT;
        }
        const i = this.tape[this.at++];
        if (this.at >= this.tape.length) {
          this.at = 0;
          this.gap = 45; // 한 번 끝나면 0.75초 쉬고 다시
        }
        return i;
      }
      case 'stand':
        return NEUTRAL_INPUT;
      case 'open':
        return press(6);
      case 'crouch':
        return press(2);
      case 'cpu':
        return this.cpu.read(ctx);
      case 'random': {
        // 상대가 새 기술을 낼 때마다 서기/앉기를 새로 정한다
        if (opponent.state === 'attack' && opponent.moveSerial !== this.serial) {
          this.serial = opponent.moveSerial;
          this.crouchNow = this.rng() < 0.5;
        }
        return this.crouchNow ? press(1) : NEUTRAL_INPUT;
      }
      case 'punish': {
        const om = opponent.state === 'attack' ? opponent.move : null;
        if (om && self.isActionable && opponent.moveSerial !== this.punishChecked && opponent.moveHits.includes(self) && opponent.frame > om.startup + om.active) {
          this.punishChecked = opponent.moveSerial;
          const left = totalFrames(om) - opponent.frame;
          // 앉은 자세로 끝나는 기술(하단)은 상단 잽이 머리 위로 빗나가므로 중단 잽으로 반격
          if (om.crouching || om.level === 'low') {
            if (left >= PUNISH.dfJab) this.queue = [press(3, 1), ...Array<RelInput>(6).fill(press(5))];
          } else if (left >= PUNISH.jab) this.queue = [press(5, 1), ...Array<RelInput>(5).fill(press(5)), press(5, 2)];
        }
        if (this.queue.length) return this.queue.shift()!;
        // 하단 공격은 앉아서 막는다 (하단 기술도 안전한지 확인할 수 있게)
        return om && om.level === 'low' && !opponent.moveHits.includes(self) ? press(1) : NEUTRAL_INPUT;
      }
    }
  }
}

/** 평소엔 안쪽 컨트롤러를 따르다가, 시연 입력이 들어오면 그것부터 재생한다 (연습 모드 콤보 시연) */
export class DemoController implements Controller {
  private queue: RelInput[] = [];
  constructor(private inner: Controller) {}
  get playing() {
    return this.queue.length > 0;
  }
  play(inputs: RelInput[]) {
    this.queue = [...inputs];
  }
  read(ctx: ControllerContext): RelInput {
    return this.queue.shift() ?? this.inner.read(ctx);
  }
}

/** 입력 기록 한 줄: 같은 입력이 이어진 프레임 수 */
export interface InputLogEntry {
  dir: Dir;
  /** 누르고 있는 버튼 (예: [1, 2]) */
  buttons: number[];
  frames: number;
}

/** 안쪽 컨트롤러의 입력을 그대로 넘기면서 최근 입력을 기록한다 (연습 모드 입력 표시) */
export class InputLogController implements Controller {
  /** 최신이 앞 */
  log: InputLogEntry[] = [];
  /** 기록이 바뀔 때마다 1 씩 (화면 갱신 판단용) */
  version = 0;
  constructor(
    private inner: Controller,
    private max = 24,
  ) {}
  read(ctx: ControllerContext): RelInput {
    const i = this.inner.read(ctx);
    const buttons = i.buttons.flatMap((b, k) => (b ? [k + 1] : []));
    const top = this.log[0];
    if (top && top.dir === i.dir && top.buttons.join() === buttons.join()) {
      top.frames = Math.min(top.frames + 1, 999);
    } else {
      this.log.unshift({ dir: i.dir, buttons, frames: 1 });
      if (this.log.length > this.max) this.log.length = this.max;
    }
    this.version++;
    return i;
  }
  clear() {
    this.log = [];
    this.version++;
  }
}

/** 안쪽 컨트롤러의 입력을 프레임마다 녹화한다 (리플레이용). 엔진이 결정론적이라 입력만 있으면 경기를 그대로 재현할 수 있다 */
export class RecordingController implements Controller {
  tape: RelInput[] = [];
  /** false 면 녹화하지 않고 그대로 넘기기만 한다 */
  enabled = true;
  /** 녹화 최대 길이 (프레임, 0 = 제한 없음) */
  limit = 0;
  constructor(private inner: Controller) {}
  read(ctx: ControllerContext): RelInput {
    const i = this.inner.read(ctx);
    if (!this.enabled || (this.limit && this.tape.length >= this.limit)) return i;
    this.tape.push({ dir: i.dir, buttons: [...i.buttons] as Buttons, ...(i.jump ? { jump: true } : {}) });
    return i;
  }
  reset() {
    this.tape = [];
  }
}

/** 녹화한 입력을 그대로 다시 넣는다 (다 쓰면 중립) */
export class TapeController implements Controller {
  private at = 0;
  constructor(private tape: readonly RelInput[]) {}
  read(): RelInput {
    return this.tape[this.at++] ?? { dir: 5, buttons: [false, false, false, false] };
  }
}
