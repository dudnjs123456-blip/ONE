import { forwardIsRight, separateInRing, updateCameraAxis } from './arena';
import { applyHit, detectHit, type CombatEvent, type HitInfo, type PendingHit } from './combat';
import { FPS, INTRO_FRAMES, PLAYER_TEMPO } from './constants';
import { mulberry32, type Controller, type ControllerContext } from './controllers';
import { Fighter } from './fighter';
import { NEUTRAL_INPUT, makeInput, type RelInput } from './input';
import { gainExp, type PlayerProfile } from './profile';
import { LifeTracker } from './life';
import type { BossDef, WeightedMove } from '../data/bosses';
import { MOVES } from '../data/moves';
import { playerStats } from '../data/equipment';

export type BossPhase = 'intro' | 'fight' | 'victory' | 'defeat';

const ENRAGE_POWER = 1.25;
const ENRAGE_BANNER_FRAMES = 100;
const END_DELAY_FRAMES = 120;

export interface BossResult {
  win: boolean;
  exp: number;
  gold: number;
  firstClear: boolean;
  levelUps: number;
  newLevel: number;
  clearTime: number;
}

export interface BossHudState {
  phase: BossPhase;
  bossName: string;
  bossTitle: string;
  bossHp: number;
  bossMaxHp: number;
  enraged: boolean;
  playerLevel: number;
  playerHp: number;
  playerMaxHp: number;
  fatigue: number;
  hunger: number;
  timer: number;
  banner: string | null;
  combo: { hits: number; damage: number } | null;
  lastHit: HitInfo | null;
  /** 경기가 끝나고 연출이 지나면 결과 */
  result: BossResult | null;
}

/** 보스 AI: 거리 조절 + 가중치 랜덤 패턴. 기술은 커맨드 없이 queueMove 로 직접 발동. */
export class BossBrain implements Controller {
  private queue: RelInput[] = [];
  private cooldown: number;
  private rng: () => number;
  /** 고른 다음 패턴. 사거리에 들어갈 때까지 다가간 뒤 쓴다 */
  private planned: string | null = null;

  constructor(
    private def: BossDef,
    private isEnraged: () => boolean,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
    this.cooldown = 40;
  }

  read({ self, opponent }: ControllerContext): RelInput {
    if (this.queue.length) return this.queue.shift()!;
    if (!self.isActionable) return NEUTRAL_INPUT;

    const enraged = this.isEnraged();
    const dist = Math.hypot(opponent.x - self.x, opponent.z - self.z);

    // 보스는 공중 콤보·다운 추격을 하지 않는다: 띄운 뒤엔 물러나서 숨 돌릴 틈을 준다
    if (opponent.isAirborne() || opponent.isInvulnerable()) {
      this.planned = null;
      return makeInput(dist < 2.5 ? 4 : 5);
    }

    if (--this.cooldown > 0) {
      // 대기 중: 거리가 멀면 다가오고, 가까우면 가끔 물러서며 간을 본다
      if (dist > 2.2) return makeInput(6);
      if (dist < 1.0 && this.rng() < 0.04) this.hold(4, 12);
      return this.queue.shift() ?? NEUTRAL_INPUT;
    }

    const pool = enraged ? [...this.def.moves, ...this.def.enrageMoves] : this.def.moves;
    this.planned ??= this.pick(pool);
    const mv = MOVES[this.planned];
    // 돌진은 먼 거리에서도, 나머지는 사거리 안에 들어갈 때까지 걸어간다
    if (!mv.lunge && dist - 0.32 > mv.range * 0.9) return makeInput(6);

    this.planned = null;
    self.queueMove(mv);
    this.cooldown = Math.round(this.def.attackGap * (enraged ? 0.6 : 1) * (0.6 + this.rng() * 0.8));
    return NEUTRAL_INPUT;
  }

  private pick(pool: WeightedMove[]): string {
    const total = pool.reduce((s, m) => s + m.weight, 0);
    let r = this.rng() * total;
    return (pool.find((m) => (r -= m.weight) < 0) ?? pool[0]).id;
  }

  private hold(dir: 4 | 5 | 6, frames: number) {
    for (let i = 0; i < frames; i++) this.queue.push(makeInput(dir));
  }
}

/**
 * 보스 레이드: 수동 조작 1:1. 플레이어 능력치는 프로필 레벨에서,
 * 클리어 보상(경험치·골드)은 프로필에 바로 반영된다.
 */
export class BossBattle {
  readonly fighters: [Fighter, Fighter];
  phase: BossPhase = 'intro';
  phaseFrame = 0;
  frame = 0;
  hitstop = 0;
  camNx = 0;
  camNz = 1;
  enraged = false;
  timerFrames: number;
  lastHit: HitInfo | null = null;
  result: BossResult | null = null;

  private events: CombatEvent[] = [];
  private enrageBanner = 0;
  private comboShow: { hits: number; damage: number; frames: number } | null = null;
  private controllers: [Controller, Controller];
  private life = new LifeTracker();

  constructor(
    readonly boss: BossDef,
    private profile: PlayerProfile,
    playerController: Controller,
    seed = 1,
  ) {
    const player = new Fighter(0, 'PLAYER', { ...playerStats(profile), tempo: PLAYER_TEMPO });
    const b = new Fighter(1, boss.name, { maxHp: boss.maxHp, power: boss.power, canBlock: false });
    player.reset(-1.8, 0, 1, 0);
    b.reset(1.8, 0, -1, 0);
    this.fighters = [player, b];
    this.timerFrames = boss.timeLimit * FPS;
    this.controllers = [playerController, new BossBrain(boss, () => this.enraged, seed)];
  }

  get player() {
    return this.fighters[0];
  }

  get bossFighter() {
    return this.fighters[1];
  }

  drainEvents(): CombatEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step() {
    this.frame++;
    this.phaseFrame++;
    const [a, b] = this.fighters;
    a.snapshot();
    b.snapshot();
    updateCameraAxis(this, a, b);

    const fighting = this.phase === 'fight';
    if (fighting) {
      // 생활 수치: 싸우는 동안에도 지치고 배고파진다. 피곤·배고프면 몸이 무거워진다
      const p = this.player;
      const life = this.life.tick(this.profile.life, { running: p.state === 'dash', attackSerial: p.moveSerial });
      p.moveScale = life.slow * (life.canRun ? 1 : 0.8);
    }
    for (const i of [0, 1] as const) {
      const self = this.fighters[i];
      const opponent = this.fighters[1 - i];
      const input = fighting
        ? this.controllers[i].read({ self, opponent, forwardIsRight: forwardIsRight(this, self, opponent), frame: this.frame })
        : NEUTRAL_INPUT;
      self.feed(input);
    }

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    if (this.phase === 'intro' && this.phaseFrame >= INTRO_FRAMES) this.setPhase('fight');

    a.tick({ opponent: b, awayX: -this.camNx, awayZ: -this.camNz });
    b.tick({ opponent: a, awayX: -this.camNx, awayZ: -this.camNz });
    separateInRing(a, b);
    a.faceToward(b);
    b.faceToward(a);
    this.resolveHits();

    if (this.enrageBanner > 0) this.enrageBanner--;
    if (this.comboShow && --this.comboShow.frames <= 0) this.comboShow = null;
    this.checkEnrage();
    this.checkEnd();
  }

  hud(): BossHudState {
    const [p, b] = this.fighters;
    return {
      phase: this.phase,
      bossName: this.boss.name,
      bossTitle: this.boss.title,
      bossHp: b.hp,
      bossMaxHp: b.maxHp,
      enraged: this.enraged,
      playerLevel: this.profile.level,
      playerHp: p.hp,
      playerMaxHp: p.maxHp,
      fatigue: Math.round(this.profile.life.fatigue),
      hunger: Math.round(this.profile.life.hunger),
      timer: Math.ceil(this.timerFrames / FPS),
      banner: this.banner(),
      combo: this.comboShow && { hits: this.comboShow.hits, damage: this.comboShow.damage },
      lastHit: this.lastHit,
      result: this.phaseFrame > END_DELAY_FRAMES ? this.result : null,
    };
  }

  // ───────────────────────── 내부 ─────────────────────────

  private setPhase(p: BossPhase) {
    this.phase = p;
    this.phaseFrame = 0;
  }

  private resolveHits() {
    const [a, b] = this.fighters;
    const hits = [detectHit(a, b), detectHit(b, a)].filter((h): h is PendingHit => !!h);
    let stop = 0;
    for (const h of hits) {
      const out = applyHit(h);
      this.events.push(out.event);
      if (h.att === a) {
        this.lastHit = out.info;
        if (h.def.combo >= 2) this.comboShow = { hits: h.def.combo, damage: h.def.comboDamage, frames: 90 };
      }
      stop = Math.max(stop, out.hitstop);
    }
    if (stop) this.hitstop = stop;
  }

  private checkEnrage() {
    const b = this.bossFighter;
    if (this.enraged || b.hp <= 0 || b.hp > b.maxHp / 2) return;
    this.enraged = true;
    b.power *= ENRAGE_POWER;
    this.enrageBanner = ENRAGE_BANNER_FRAMES;
  }

  private checkEnd() {
    if (this.phase !== 'fight') return;
    const [p, b] = this.fighters;
    this.timerFrames = Math.max(0, this.timerFrames - 1);

    if (b.hp <= 0) {
      const first = !this.profile.bossClears[this.boss.id];
      const exp = this.boss.reward.exp + (first ? this.boss.firstClearBonus.exp : 0);
      const gold = this.boss.reward.gold + (first ? this.boss.firstClearBonus.gold : 0);
      this.profile.bossClears[this.boss.id] = (this.profile.bossClears[this.boss.id] ?? 0) + 1;
      const clearTime = Math.round((this.boss.timeLimit - this.timerFrames / FPS) * 100) / 100;
      const best = this.profile.bossBest[this.boss.id];
      if (best === undefined || clearTime < best) this.profile.bossBest[this.boss.id] = clearTime;
      this.profile.gold += gold;
      const levelUps = gainExp(this.profile, exp);
      this.result = {
        win: true, exp, gold, firstClear: first, levelUps, newLevel: this.profile.level,
        clearTime: this.boss.timeLimit - this.timerFrames / FPS,
      };
      this.setPhase('victory');
    } else if (p.hp <= 0 || this.timerFrames <= 0) {
      this.result = {
        win: false, exp: 0, gold: 0, firstClear: false, levelUps: 0, newLevel: this.profile.level,
        clearTime: this.boss.timeLimit - this.timerFrames / FPS,
      };
      this.setPhase('defeat');
    }
  }

  private banner(): string | null {
    switch (this.phase) {
      case 'intro':
        return this.phaseFrame < 65 ? this.boss.name : 'FIGHT!';
      case 'fight':
        return this.enrageBanner > 0 ? '보스가 분노했습니다!' : null;
      case 'victory':
        return 'VICTORY';
      case 'defeat':
        return this.timerFrames <= 0 ? 'TIME OVER' : 'DEFEAT';
    }
  }
}
