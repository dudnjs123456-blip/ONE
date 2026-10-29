import {
  BACKDASH_FRAMES,
  BACKDASH_SPEED,
  BUFFER_FRAMES,
  COUNTER_DAMAGE,
  COUNTER_HITSTUN_BONUS,
  DASH_CANCEL_FROM,
  DASH_FRAMES,
  DASH_RECOVERY,
  DASH_COOLDOWN,
  DASH_SPEED,
  GETUP_FRAMES,
  GRAVITY,
  INPUT_HISTORY,
  JUMP_FWD,
  JUMP_VEL,
  JUGGLE_POP,
  KNOCKDOWN_FRAMES,
  LAUNCH_DRIFT,
  MAX_HP,
  RUN_SPEED,
  SIDESTEP_FRAMES,
  SIDESTEP_SPEED,
  TAP_FRAMES,
  WALK_BACK,
  WALK_FWD,
} from './constants';
import { NEUTRAL_INPUT, isBack, isDown, isForward, isUp, type RelInput } from './input';
import type { Button, Dir } from './types';
import { DASH_MOVES, JUMP_MOVES, MOVES, findMove, hasComboWith, totalFrames, type MoveDef } from '../data/moves';

export type FighterState =
  | 'idle'
  | 'walkF'
  | 'walkB'
  | 'run'
  | 'crouch'
  | 'dash'
  | 'backdash'
  | 'sidestep'
  | 'jump'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'launched'
  | 'knockdown'
  | 'getup'
  | 'ko';

const NEUTRAL_STATES = new Set<FighterState>(['idle', 'walkF', 'walkB', 'run', 'crouch']);

/** 이 상태에서는 매 프레임 상대를 바라본다 (철권식 자동 정면 유지). 공격 중엔 방향이 고정된다. */
const FACES_OPPONENT = new Set<FighterState>([
  'idle', 'walkF', 'walkB', 'crouch', 'dash', 'backdash', 'sidestep', 'hitstun', 'blockstun', 'getup',
]);

export interface TickContext {
  opponent: Fighter;
  /** 화면 안쪽(카메라 반대) 방향 단위 벡터. 윗방향 횡이동이 이쪽으로 간다. */
  awayX: number;
  awayZ: number;
}

export interface FighterOptions {
  maxHp?: number;
  /** 데미지 배율 (RPG 공격력) */
  power?: number;
  /** false 면 가드하지 않는다 (필드 몬스터) */
  canBlock?: boolean;
  runSpeed?: number;
  /** 동작 속도 배율. 1.3 이면 기술 발생/후딜과 이동이 1.3배 빠르다 (프레임 이득은 유지) */
  tempo?: number;
}

interface Buffered {
  button: Button;
  dir: Dir;
  age: number;
  /** 거의 동시에 같이 누른 두 번째 버튼 (동시 입력 기술) */
  pair?: Button;
}

/**
 * 동시 입력으로 인정하는 간격 (프레임). 단일 기술은 바로 나가고,
 * 이 안에 짝 버튼이 들어오면 동시 입력 기술로 바뀐다 (반응 속도는 그대로).
 */
const COMBO_WINDOW = 3;

export class Fighter {
  x = 0;
  z = 0;
  y = 0;
  vy = 0;
  /** 바라보는 방향 (단위 벡터, xz 평면) */
  fx = 1;
  fz = 0;
  maxHp: number;
  hp: number;
  power: number;
  canBlock: boolean;
  runSpeed: number;
  readonly tempo: number;
  private tempoMoves = new Map<string, MoveDef>();
  /** 필드 자유 이동 방향 (월드 기준). null 이면 1:1 대전식 이동 */
  freeMove: { x: number; z: number } | null = null;
  state: FighterState = 'idle';
  /** 현재 상태에 들어온 뒤 지난 프레임 수. 공격은 입력 프레임이 1. */
  frame = 0;
  move: MoveDef | null = null;
  /** 기술이 새로 나갈 때마다 증가 (AI 반응 등에 사용) */
  moveSerial = 0;
  /** 현재 기술에 이미 맞은 대상들 (한 기술이 같은 대상을 두 번 때리지 않게) */
  moveHits: Fighter[] = [];
  stun = 0;
  combo = 0;
  comboDamage = 0;
  juggleCount = 0;

  /** 직전 로직 프레임의 위치·방향 (화면 보간용, 로직에는 영향 없음) */
  private prev = { x: 0, y: 0, z: 0, fx: 1, fz: 0 };
  private slide = 0;
  private sidestepSign = 1;
  private input: RelInput = NEUTRAL_INPUT;
  private prevInput: RelInput = NEUTRAL_INPUT;
  private dirHistory: Dir[] = [];
  private buffered: Buffered | null = null;
  private queuedCancel: string | null = null;
  /** AI 가 입력 없이 직접 지정한 다음 기술 */
  private forcedMove: MoveDef | null = null;
  private downHeld = 0;
  private downTapped = false;
  private upPressed = false;
  private jumpPressed = false;
  /** 점프 중 앞/뒤 이동 (자유 이동 모드가 아닐 때) */
  private jumpFwd = 0;
  /** 이동 속도 배율 (생활 수치 페널티 등). 1 = 정상 */
  moveScale = 1;
  /** 대시에서 이어진 공격에 실린 전진 속도 (매 프레임 줄어든다) */
  private carry = 0;
  /** 이번 점프에서 공중 공격을 이미 썼나 (점프 한 번에 한 번) */
  private airAttackUsed = false;
  // 자유 이동 대시: 같은 방향을 짧게 두 번 누르면 그 방향으로 대시
  private feedCount = 0;
  /** 마지막으로 자유 이동 대시를 시작한 때 (쿨타임) */
  private lastFreeDashAt = -9999;

  /** 자유 이동 대시를 다시 쓸 수 있나 */
  get dashReady(): boolean {
    return this.feedCount - this.lastFreeDashAt >= DASH_COOLDOWN;
  }

  /** 대시 쿨타임 진행 (0 = 방금 씀, 1 = 준비됨) */
  get dashCharge(): number {
    return Math.min(1, (this.feedCount - this.lastFreeDashAt) / DASH_COOLDOWN);
  }
  /** 방금 버튼 하나로 나간 기술 (짝 버튼이 바로 오면 동시 입력 기술로 바꾼다) */
  private startedFrom: { button: Button; dir: Dir; at: number } | null = null;
  private comboUpgrade: MoveDef | null = null;
  private hadMove = false;
  private moveHeld = 0;
  private moveEndedAt = -999;
  private lastMoveDir: { x: number; z: number } | null = null;
  private dashDir: { x: number; z: number } | null = null;
  /** 대시 초반(끊을 수 없는 구간)에 누른 점프·재대시를 기억했다가 끊을 수 있게 되면 실행 */
  private queuedJump = false;
  private queuedDash: { x: number; z: number } | null = null;

  constructor(
    readonly index: number,
    readonly name: string,
    opts: FighterOptions = {},
  ) {
    this.maxHp = opts.maxHp ?? MAX_HP;
    this.hp = this.maxHp;
    this.power = opts.power ?? 1;
    this.canBlock = opts.canBlock ?? true;
    this.tempo = opts.tempo ?? 1;
    this.runSpeed = (opts.runSpeed ?? RUN_SPEED) * this.tempo;
  }

  reset(x: number, z: number, fx: number, fz: number) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.fx = fx;
    this.fz = fz;
    this.hp = this.maxHp;
    this.move = null;
    this.moveHits = [];
    this.freeMove = null;
    this.stun = 0;
    this.combo = 0;
    this.comboDamage = 0;
    this.juggleCount = 0;
    this.slide = 0;
    this.input = NEUTRAL_INPUT;
    this.prevInput = NEUTRAL_INPUT;
    this.dirHistory = [];
    this.buffered = null;
    this.queuedCancel = null;
    this.forcedMove = null;
    this.downHeld = 0;
    this.downTapped = false;
    this.upPressed = false;
    this.jumpPressed = false;
    this.enter('idle');
    this.snapshot();
  }

  /** 로직 한 스텝 직전에 호출: 지금 상태를 '직전 프레임' 으로 기록 */
  snapshot() {
    const p = this.prev;
    p.x = this.x;
    p.y = this.y;
    p.z = this.z;
    p.fx = this.fx;
    p.fz = this.fz;
  }

  /** 화면 표시용 보간 위치·방향. alpha 0 = 직전 프레임, 1 = 현재 프레임 */
  lerped(alpha: number) {
    const p = this.prev;
    const fx = p.fx + (this.fx - p.fx) * alpha;
    const fz = p.fz + (this.fz - p.fz) * alpha;
    const len = Math.hypot(fx, fz) || 1;
    return {
      x: p.x + (this.x - p.x) * alpha,
      y: p.y + (this.y - p.y) * alpha,
      z: p.z + (this.z - p.z) * alpha,
      fx: fx / len,
      fz: fz / len,
    };
  }

  // ───────────────────────── 상태 질의 ─────────────────────────

  get isActionable(): boolean {
    return NEUTRAL_STATES.has(this.state);
  }

  /** 횡이동 방향: +1 = 캐릭터 기준 오른쪽 (애니메이션용) */
  get sidestepDir(): number {
    return this.sidestepSign;
  }

  get currentInput(): RelInput {
    return this.input;
  }

  /** 공중에 떠 있나: 띄워졌거나, 점프해서 발이 땅에서 떨어졌거나 */
  isAirborne(): boolean {
    if (this.state === 'launched') return true;
    const jumping = this.state === 'jump' || (this.state === 'attack' && !!this.move?.aerial);
    return jumping && this.y > 0.05;
  }

  isInvulnerable(): boolean {
    return this.state === 'knockdown' || this.state === 'getup' || this.state === 'ko';
  }

  isCrouching(): boolean {
    if (this.state === 'crouch') return true;
    if (this.state === 'attack') return !!this.move?.crouching;
    if (this.state === 'blockstun') return isDown(this.input.dir);
    return false;
  }

  /** 발생~지속 프레임 중이면 카운터 히트를 당한다 */
  isCounterable(): boolean {
    return this.state === 'attack' && !!this.move && this.frame <= this.move.startup + this.move.active - 1;
  }

  isInActiveFrames(): boolean {
    const m = this.move;
    return this.state === 'attack' && !!m && this.frame >= m.startup && this.frame <= m.startup + m.active - 1;
  }

  /** 가드 자세. 서서 뒤/중립 = 상·중단 가드, 앉아서 아래/아래뒤 = 하단 가드 */
  blockStance(): 'stand' | 'crouch' | null {
    const d = this.input.dir;
    switch (this.state) {
      case 'idle':
      case 'walkB':
        return 'stand';
      case 'crouch':
        return d === 1 || d === 2 ? 'crouch' : null;
      case 'blockstun':
        return isDown(d) ? 'crouch' : 'stand';
      default:
        return null;
    }
  }

  // ───────────────────────── 프레임 처리 ─────────────────────────

  /** 입력만 기록한다. 히트스톱 중에도 호출되어 선입력이 쌓인다. */
  feed(input: RelInput) {
    const prev = this.prevInput;

    if (this.buffered && ++this.buffered.age > BUFFER_FRAMES) this.buffered = null;
    for (let i = 0; i < 4; i++) {
      if (input.buttons[i] && !prev.buttons[i]) {
        const b = (i + 1) as Button;
        const cur = this.buffered;
        const from = this.startedFrom;
        // 방금 나간 단일 기술의 짝 버튼이면 → 동시 입력 기술로 바꾼다
        if (from && this.state === 'attack' && from.button !== b && this.feedCount - from.at <= COMBO_WINDOW) {
          const combo = findMove(from.button, from.dir, b);
          if (combo?.input?.with) {
            this.comboUpgrade = combo;
            this.startedFrom = null;
            continue;
          }
        }
        // 같은 프레임(또는 아직 안 나간 입력)에 다른 버튼을 같이 누르면 동시 입력으로 묶는다
        if (cur && !cur.pair && cur.button !== b && cur.age <= COMBO_WINDOW) cur.pair = b;
        else this.buffered = { button: b, dir: input.dir, age: 0 };
      }
    }

    if (isDown(input.dir)) {
      this.downHeld++;
    } else {
      if (this.downHeld > 0 && this.downHeld <= TAP_FRAMES) this.downTapped = true;
      this.downHeld = 0;
    }
    if (isUp(input.dir) && !isUp(prev.dir)) this.upPressed = true;
    if (input.jump && !prev.jump) this.jumpPressed = true;
    this.detectFreeDash();

    this.dirHistory.push(input.dir);
    if (this.dirHistory.length > INPUT_HISTORY) this.dirHistory.shift();

    this.input = input;
    this.prevInput = input;
  }

  /** 한 프레임 진행: 상태 전이 → 이동 */
  tick(ctx: TickContext) {
    this.frame++;

    switch (this.state) {
      case 'idle':
      case 'walkF':
      case 'walkB':
      case 'run':
      case 'crouch':
        this.neutral(ctx);
        break;
      case 'dash':
        // 대시 시작 직후부터 바로 공격 가능 (대시 속도를 실은 채)
        if (this.tryAttack()) break;
        // 대시 초반 몇 프레임은 끊을 수 없다 (살짝 무게감). 그 사이 입력은 기억했다가 바로 이어준다
        if (this.jumpPressed) this.queuedJump = true;
        if (this.dashDir) this.queuedDash = this.dashDir;
        if (this.frame >= DASH_CANCEL_FROM) {
          if (this.queuedJump) {
            this.queuedJump = false;
            this.queuedDash = null;
            this.startJump();
            break;
          }
          if (this.queuedDash && this.dashReady) {
            this.fx = this.queuedDash.x;
            this.fz = this.queuedDash.z;
            this.queuedDash = null;
            this.lastFreeDashAt = this.feedCount;
            this.enter('dash');
            break;
          }
        }
        // 대전: 대시 후반에 뒤·아래를 누르면 바로 멈춘다
        const d = this.input.dir;
        if (this.frame >= DASH_FRAMES * 0.7 && this.frame < DASH_FRAMES && !this.freeMove && (isBack(d) || isDown(d))) {
          this.returnToNeutral(ctx);
          break;
        }
        // 대시 끝: 짧게 미끄러지며 멈춘 뒤 행동 (아주 약간의 딜레이)
        if (this.frame >= DASH_FRAMES + DASH_RECOVERY) this.returnToNeutral(ctx);
        break;
      case 'backdash':
        if (this.frame >= BACKDASH_FRAMES) this.returnToNeutral(ctx);
        break;
      case 'sidestep':
        if (this.frame > 5 && this.tryAttack()) break;
        if (this.frame >= SIDESTEP_FRAMES) this.returnToNeutral(ctx);
        break;
      case 'attack':
        if (this.comboUpgrade) {
          // 짝 버튼이 바로 들어왔다: 동시 입력 기술로 갈아탄다
          const mv = this.comboUpgrade;
          this.comboUpgrade = null;
          this.startMove(mv);
        }
        this.tickAttack(ctx);
        break;
      case 'hitstun':
      case 'blockstun':
        if (this.frame >= this.stun) this.returnToNeutral(ctx);
        break;
      case 'launched':
        this.y += this.vy;
        this.vy -= GRAVITY;
        if (this.y <= 0 && this.vy < 0) {
          this.y = 0;
          this.vy = 0;
          this.enter(this.hp <= 0 ? 'ko' : 'knockdown');
        }
        break;
      case 'jump':
        this.y += this.vy;
        this.vy -= GRAVITY;
        if (this.y <= 0 && this.vy < 0) {
          this.y = 0;
          this.vy = 0;
          this.returnToNeutral(ctx);
          break;
        }
        // 어느 정도 떠오른 뒤 공격키 → 공중 기술 (점프당 한 번)
        if (this.y > 0.15 && !this.airAttackUsed) this.tryAttack();
        break;
      case 'knockdown':
        if (this.frame >= KNOCKDOWN_FRAMES) this.enter('getup');
        break;
      case 'getup':
        if (this.frame >= GETUP_FRAMES) this.returnToNeutral(ctx);
        break;
      case 'ko':
        break;
    }

    this.applyMovement();
    this.downTapped = false;
    this.upPressed = false;
    this.jumpPressed = false;
    this.dashDir = null;
  }

  /** AI 용: 다음에 행동 가능한 프레임에 이 기술을 쓴다 (커맨드가 없는 보스 기술 등) */
  queueMove(mv: MoveDef) {
    this.forcedMove = mv;
  }

  /** 아머 기술의 발생~지속 중인가 */
  isArmored(): boolean {
    const m = this.move;
    return this.state === 'attack' && !!m?.armor && this.frame <= m.startup + m.active - 1;
  }

  faceToward(opp: Fighter) {
    if (!FACES_OPPONENT.has(this.state)) return;
    const dx = opp.x - this.x;
    const dz = opp.z - this.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    this.fx = dx / len;
    this.fz = dz / len;
  }

  // ───────────────────────── 피격 ─────────────────────────

  /** @param attackerRemaining 공격자가 행동 가능해지기까지 남은 프레임 */
  receiveBlock(mv: MoveDef, attackerRemaining: number) {
    this.move = null;
    this.combo = 0;
    this.comboDamage = 0;
    this.enter('blockstun');
    this.stun = Math.max(1, attackerRemaining + mv.onBlock);
    this.slide = (mv.pushback * 1.3) / 5;
  }

  /** @returns 실제로 들어간 데미지 */
  receiveHit(mv: MoveDef, counter: boolean, attackerRemaining: number, power = 1): number {
    const airborne = this.isAirborne();
    const scale = this.combo > 0 ? Math.max(0.3, 1 - 0.1 * this.combo) : 1;
    const dmg = Math.max(1, Math.round(mv.damage * power * (counter ? COUNTER_DAMAGE : 1) * scale));

    this.hp = Math.max(0, this.hp - dmg);

    // 아머: 데미지만 받고 기술은 계속
    if (this.isArmored() && this.hp > 0) return dmg;

    this.combo++;
    this.comboDamage += dmg;
    this.move = null;

    if (airborne || mv.launch || this.hp <= 0) {
      // 공중 콤보(저글): 맞을 때마다 조금씩 덜 뜬다
      const pop = Math.max(0.04, JUGGLE_POP - this.juggleCount * 0.012);
      this.vy = airborne ? Math.max(pop, (mv.launch ?? 0) * 0.6) : Math.max(mv.launch ?? 0, 0.13);
      this.y = Math.max(this.y, 0.01);
      this.juggleCount++;
      this.slide = mv.pushback / 5;
      this.enter('launched');
    } else {
      this.enter('hitstun');
      this.stun = Math.max(1, attackerRemaining + mv.onHit + (counter ? COUNTER_HITSTUN_BONUS : 0));
      this.slide = mv.pushback / 5;
    }
    return dmg;
  }

  // ───────────────────────── 내부 ─────────────────────────

  private enter(state: FighterState) {
    if (state !== 'dash') {
      this.queuedJump = false;
      this.queuedDash = null;
    }
    this.state = state;
    this.frame = 0;
    if (state !== 'attack') this.move = null;
  }

  private returnToNeutral(ctx: TickContext) {
    this.enter('idle');
    this.neutral(ctx);
  }

  private neutral(ctx: TickContext) {
    this.combo = 0;
    this.comboDamage = 0;
    this.juggleCount = 0;

    if (this.tryAttack()) return;
    if (this.jumpPressed) return this.startJump();
    if (this.dashDir && this.dashReady) {
      // 자유 이동 대시: 그 방향을 보고 튀어 나간다 (쿨타임이 끝났을 때만)
      this.fx = this.dashDir.x;
      this.fz = this.dashDir.z;
      this.lastFreeDashAt = this.feedCount;
      return this.enter('dash');
    }
    // 점프·대시보다 뒤에 둬야 달리면서도 뛰고 대시할 수 있다
    if (this.freeMove) {
      if (this.state !== 'run') this.enter('run');
      return;
    }
    if (this.doubleTap(6)) return this.enter('dash');
    if (this.doubleTap(4)) return this.enter('backdash');
    if (this.upPressed) return this.startSidestep(ctx, 1);
    if (this.downTapped && this.state === 'crouch') return this.startSidestep(ctx, -1);

    const d = this.input.dir;
    const next: FighterState = isDown(d) ? 'crouch' : isForward(d) ? 'walkF' : isBack(d) ? 'walkB' : 'idle';
    if (next !== this.state) this.enter(next);
  }

  private tickAttack(ctx: TickContext) {
    const mv = this.move!;
    if (mv.aerial) {
      // 공중 기술: 쓰는 동안에도 떨어지고, 착지하면 바로 끝 (착지 후 바로 행동 가능)
      this.y += this.vy;
      this.vy -= GRAVITY;
      if (this.y <= 0 && this.vy < 0) {
        this.y = 0;
        this.vy = 0;
        this.returnToNeutral(ctx);
        return;
      }
    }
    const buf = this.buffered;
    if (!this.queuedCancel && buf && mv.cancels) {
      const c = mv.cancels.find((c) => c.button === buf.button && this.frame <= c.until);
      if (c) {
        this.queuedCancel = c.into;
        this.buffered = null;
      }
    }
    if (mv.chain && this.frame >= mv.chain.at) {
      this.startMove(MOVES[mv.chain.into]);
      return;
    }
    if (this.queuedCancel) {
      const c = mv.cancels!.find((c) => c.into === this.queuedCancel)!;
      if (this.frame >= c.at) {
        this.startMove(MOVES[c.into]);
        return;
      }
    }
    if (this.frame > totalFrames(mv)) {
      // 공중에서 기술이 끝났으면 계속 떨어진다
      if (mv.aerial && this.y > 0) this.enter('jump');
      else this.returnToNeutral(ctx);
    }
  }

  private tryAttack(): boolean {
    if (this.forcedMove) {
      const mv = this.forcedMove;
      this.forcedMove = null;
      this.startMove(mv);
      return true;
    }
    const b = this.buffered;
    if (!b) return false;
    const fromDash = this.state === 'dash';
    const fromJump = this.state === 'jump';
    if (fromJump && this.airAttackUsed) return false;
    const specialId = fromJump ? JUMP_MOVES[b.button] : fromDash ? DASH_MOVES[b.button] : undefined;
    const mv = specialId ? MOVES[specialId] : findMove(b.button, b.dir, b.pair);
    if (!mv) return false;
    // 대시·점프 중이었다면 그 속도를 기술에 실어서 미끄러지듯(날아가듯) 들어간다
    const carry = fromDash
      ? DASH_SPEED * this.tempo * (1 - this.frame / (DASH_FRAMES + 4))
      : fromJump
        ? this.freeMove
          ? this.runSpeed
          : this.jumpFwd
        : 0;
    this.buffered = null;
    this.startMove(mv);
    this.carry = carry;
    // 단일 기술이면 짝 버튼이 곧 들어올 수 있다 (동시 입력으로 바꿀 수 있게 기억)
    this.startedFrom = !specialId && !b.pair && hasComboWith(b.button) ? { button: b.button, dir: b.dir, at: this.feedCount } : null;
    if (fromJump) this.airAttackUsed = true;
    return true;
  }

  /**
   * 템포를 적용한 기술 데이터. 발생·후딜·연결 타이밍을 줄이고, 가드/히트 이득은 그대로 둔다
   * (경직은 '공격자 남은 프레임 + 이득' 으로 계산되므로 이득이 자동으로 유지됨).
   */
  private withTempo(mv: MoveDef): MoveDef {
    if (this.tempo === 1 || mv.weighty) return mv;
    let t = this.tempoMoves.get(mv.id);
    if (!t) {
      const f = (n: number) => Math.max(1, Math.round(n / this.tempo));
      t = {
        ...mv,
        startup: f(mv.startup),
        recovery: f(mv.recovery),
        lunge: mv.lunge && mv.lunge * this.tempo,
        cancels: mv.cancels?.map((c) => ({ ...c, until: f(c.until), at: f(c.at) })),
        chain: mv.chain && { ...mv.chain, at: f(mv.chain.at) },
      };
      this.tempoMoves.set(mv.id, t);
    }
    return t;
  }

  private startMove(mv: MoveDef) {
    mv = this.withTempo(mv);
    this.carry = 0;
    this.state = 'attack';
    this.frame = 1;
    this.move = mv;
    this.moveSerial++;
    this.moveHits = [];
    this.queuedCancel = null;
  }

  /**
   * 자유 이동(도시·필드)에서 방향 두 번 톡 = 대시.
   * 첫 입력이 짧았고(18F = 0.3초 이하), 떼고 나서 15F(0.25초) 안에 같은 쪽(±45°)을 다시 누르면.
   * (freeMove 는 feed 전에 설정된다)
   */
  private detectFreeDash() {
    this.feedCount++;
    const m = this.freeMove;
    const len = m ? Math.hypot(m.x, m.z) : 0;
    if (m && len > 1e-4) {
      const dir = { x: m.x / len, z: m.z / len };
      if (!this.hadMove) {
        const last = this.lastMoveDir;
        const quick = this.feedCount - this.moveEndedAt <= 15 && this.moveHeld <= 18;
        if (last && quick && dir.x * last.x + dir.z * last.z > 0.6) this.dashDir = dir;
        this.moveHeld = 0;
      }
      this.moveHeld++;
      this.lastMoveDir = dir;
      this.hadMove = true;
    } else {
      if (this.hadMove) this.moveEndedAt = this.feedCount;
      this.hadMove = false;
    }
  }

  private startJump() {
    this.airAttackUsed = false;
    const d = this.input.dir;
    this.jumpFwd = isForward(d) ? JUMP_FWD * this.tempo : isBack(d) ? -JUMP_FWD * 0.8 * this.tempo : 0;
    this.vy = JUMP_VEL;
    this.enter('jump');
  }

  /** toward: 1 = 화면 안쪽, -1 = 화면 바깥쪽 */
  private startSidestep(ctx: TickContext, toward: 1 | -1) {
    const px = -this.fz;
    const pz = this.fx;
    const dot = px * ctx.awayX + pz * ctx.awayZ;
    this.sidestepSign = (dot >= 0 ? 1 : -1) * toward;
    this.enter('sidestep');
  }

  /** 방금 target 방향을 "두 번째로 톡" 입력했는가 (ex. 6,6 대시) */
  private doubleTap(target: Dir): boolean {
    const h = this.dirHistory;
    const n = h.length;
    if (n < 3 || h[n - 1] !== target || h[n - 2] === target) return false;
    let i = n - 2;
    while (i >= 0 && h[i] !== target) {
      if (n - 2 - i > 12) return false;
      i--;
    }
    if (i < 0) return false;
    let held = 0;
    while (i >= 0 && h[i] === target) {
      held++;
      i--;
    }
    return held <= 14;
  }

  private applyMovement() {
    let fwd = 0;
    let lat = 0;
    switch (this.state) {
      case 'walkF':
        fwd = WALK_FWD * this.tempo;
        break;
      case 'walkB':
        fwd = -WALK_BACK * this.tempo;
        break;
      case 'run': {
        const m = this.freeMove;
        const len = m ? Math.hypot(m.x, m.z) : 0;
        if (m && len > 1e-4) {
          this.fx = m.x / len;
          this.fz = m.z / len;
          fwd = this.runSpeed;
        }
        break;
      }
      case 'dash':
        if (this.frame < DASH_FRAMES) {
          fwd = DASH_SPEED * this.tempo * (1 - this.frame / (DASH_FRAMES + 4));
          // 자유 이동 모드: 대시 중 방향키로 진행 방향을 살짝 꺾는다 (대각선으로 휘어 들어가기)
          const m = this.freeMove;
          const len = m ? Math.hypot(m.x, m.z) : 0;
          if (m && len > 1e-4) {
            const nx = this.fx + (m.x / len - this.fx) * 0.18;
            const nz = this.fz + (m.z / len - this.fz) * 0.18;
            const nl = Math.hypot(nx, nz) || 1;
            this.fx = nx / nl;
            this.fz = nz / nl;
          }
        } else {
          // 미끄러지며 멈춤
          fwd = DASH_SPEED * this.tempo * 0.22 * (1 - (this.frame - DASH_FRAMES) / DASH_RECOVERY);
        }
        break;
      case 'backdash':
        fwd = -BACKDASH_SPEED * this.tempo * (1 - this.frame / (BACKDASH_FRAMES + 4));
        break;
      case 'sidestep':
        lat = SIDESTEP_SPEED * this.tempo * this.sidestepSign * (this.frame < SIDESTEP_FRAMES - 4 ? 1 : 0.4);
        break;
      case 'attack':
        if (this.move?.lunge && this.frame <= this.move.startup) fwd = this.move.lunge;
        fwd += this.carry;
        this.carry *= this.move?.aerial ? 0.985 : 0.9; // 공중에선 기세가 거의 안 줄어든다
        break;
      case 'jump': {
        // 자유 이동 모드(도시·필드)는 공중에서도 방향 조절, 대전은 뛴 방향으로 날아간다
        const m = this.freeMove;
        const len = m ? Math.hypot(m.x, m.z) : 0;
        if (m && len > 1e-4) {
          this.fx = m.x / len;
          this.fz = m.z / len;
          fwd = this.runSpeed;
        } else fwd = this.jumpFwd;
        break;
      }
      case 'launched':
        fwd = -LAUNCH_DRIFT;
        break;
    }
    // 스스로 움직이는 이동만 느려진다 (맞고 밀려나는 건 그대로)
    fwd *= this.moveScale;
    lat *= this.moveScale;
    if (this.state === 'hitstun' || this.state === 'blockstun' || this.state === 'launched') {
      fwd -= this.slide;
      this.slide *= 0.8;
    }
    const px = -this.fz;
    const pz = this.fx;
    this.x += this.fx * fwd + px * lat;
    this.z += this.fz * fwd + pz * lat;
  }
}
