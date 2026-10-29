import { FIGHTER_RADIUS, FPS, PLAYER_TEMPO } from './constants';
import { applyHit, detectHit, type CombatEvent, type PendingHit } from './combat';
import { mulberry32 } from './controllers';
import { Fighter } from './fighter';
import { NEUTRAL_INPUT, makeInput, type RelInput } from './input';
import { gainExp, type PlayerProfile } from './profile';
import { LIFE_WARNING, LifeTracker } from './life';
import { FIELD_SPAWNS, MONSTERS, MONSTER_RESPAWN_FRAMES, type MonsterType } from '../data/monsters';
import { DIR_OF_KEY, MOVES } from '../data/moves';
import { expToNext } from '../data/progression';
import { playerStats } from '../data/equipment';

/** 필드는 [-FIELD_HALF, FIELD_HALF] 정사각형 */
export const FIELD_HALF = 22;
/** 몬스터가 스폰 지점에서 이만큼 멀어지면 추적을 포기하고 돌아간다 */
const LEASH = 12;
/** 필드는 다수 전투라 히트스톱을 짧게 */
const FIELD_HITSTOP_MAX = 6;
const CORPSE_FRAMES = 90;
const PLAYER_RESPAWN_FRAMES = 180;
const REGEN_DELAY = 300;
/** 플레이어를 바라보는 거리 (이 안에서는 서로 정면을 유지) */
const FACE_RANGE = 3.5;

/** 플레이어/몬스터 컨트롤러가 매 프레임 내는 명령 */
export interface FieldCommand {
  /** 월드 기준 이동 방향. null 이면 제자리 (철권식 입력만) */
  move: { x: number; z: number } | null;
  input: RelInput;
}

export interface PlayerController {
  read(world: FieldWorld): FieldCommand;
}

export interface Monster {
  id: number;
  type: MonsterType;
  fighter: Fighter;
  spawnIndex: number;
  homeX: number;
  homeZ: number;
  aggro: boolean;
  returning: boolean;
  rewarded: boolean;
  deadFrames: number;
  brain: MonsterBrain;
}

export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  kind: 'exp' | 'gold' | 'level';
}

export interface FieldHudState {
  level: number;
  exp: number;
  expNext: number;
  gold: number;
  kills: number;
  fatigue: number;
  hunger: number;
  hp: number;
  maxHp: number;
  auto: boolean;
  dead: boolean;
  respawnIn: number;
  target: { name: string; level: number; hp: number; maxHp: number } | null;
  log: { id: number; text: string }[];
}

const idle = (): FieldCommand => ({ move: null, input: NEUTRAL_INPUT });

/** 몬스터 AI: 배회 → (선공 or 피격 시) 추적 → 근접하면 기술 사용 → 너무 멀어지면 귀환 */
export class MonsterBrain {
  private queue: RelInput[] = [];
  private cooldown: number;
  private wander: { x: number; z: number } | null = null;
  private wanderWait: number;

  constructor(
    private rng: () => number,
    private type: MonsterType,
  ) {
    this.cooldown = type.attackGap * rng();
    this.wanderWait = Math.floor(rng() * 120);
  }

  think(m: Monster, w: FieldWorld): FieldCommand {
    const f = m.fighter;
    const p = w.player;
    const playerAlive = p.hp > 0;
    const dist = Math.hypot(p.x - f.x, p.z - f.z);
    const home = Math.hypot(m.homeX - f.x, m.homeZ - f.z);

    if (!m.aggro && !m.returning && playerAlive && this.type.aggroRange > 0 && dist < this.type.aggroRange) {
      m.aggro = true;
    }
    if (m.aggro && (!playerAlive || home > LEASH)) {
      m.aggro = false;
      m.returning = true;
      this.queue = [];
    }
    if (m.returning) {
      if (home < 0.6) {
        m.returning = false;
        f.hp = f.maxHp;
      } else {
        return { move: { x: m.homeX - f.x, z: m.homeZ - f.z }, input: NEUTRAL_INPUT };
      }
    }

    if (this.queue.length) return { move: null, input: this.queue.shift()! };

    if (m.aggro) {
      if (dist > 1.1) return { move: { x: p.x - f.x, z: p.z - f.z }, input: NEUTRAL_INPUT };
      if (f.isActionable && --this.cooldown <= 0) {
        this.cooldown = this.type.attackGap * (0.6 + this.rng() * 0.8);
        const id = this.type.moves[Math.floor(this.rng() * this.type.moves.length)];
        const inp = MOVES[id].input!;
        this.queue.push(makeInput(DIR_OF_KEY[inp.dir], inp.button), makeInput(5));
      }
      return idle();
    }

    // 배회
    if (this.wanderWait > 0) {
      this.wanderWait--;
      return idle();
    }
    if (!this.wander) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * 3;
      this.wander = { x: m.homeX + Math.cos(a) * r, z: m.homeZ + Math.sin(a) * r };
    }
    const dx = this.wander.x - f.x;
    const dz = this.wander.z - f.z;
    if (Math.hypot(dx, dz) < 0.3) {
      this.wander = null;
      this.wanderWait = 120 + Math.floor(this.rng() * 200);
      return idle();
    }
    return { move: { x: dx, z: dz }, input: NEUTRAL_INPUT };
  }
}

/**
 * RPG 필드. 철권 엔진의 Fighter / 히트 판정을 그대로 쓰고,
 * 1:1 대신 플레이어 1명 + 몬스터 다수를 돌린다. Match 와 마찬가지로 순수 로직.
 */
export class FieldWorld {
  frame = 0;
  hitstop = 0;
  readonly player: Fighter;
  auto = true;
  monsters: Monster[] = [];
  target: Monster | null = null;
  playerDeadFrames = 0;
  log: { id: number; text: string }[] = [];

  private lastHurtFrame = -Infinity;
  private life = new LifeTracker();
  /** 스폰 지점별 다음 스폰 프레임. -1 이면 이미 몬스터가 있음 */
  private spawnTimers: number[];
  private nextId = 1;
  private logId = 0;
  private rng: () => number;
  private combatEvents: CombatEvent[] = [];
  private texts: FloatText[] = [];

  constructor(
    private manual: PlayerController,
    private autoCtl: PlayerController,
    readonly profile: PlayerProfile,
    seed = 7,
  ) {
    this.rng = mulberry32(seed);
    this.player = new Fighter(0, 'PLAYER', { ...playerStats(profile), tempo: PLAYER_TEMPO });
    this.player.reset(0, 0, 0, -1);
    this.spawnTimers = FIELD_SPAWNS.map(() => 0);
    this.updateSpawns();
    this.addLog('필드에 입장했습니다. 자동사냥 ON');
  }

  get level() {
    return this.profile.level;
  }

  toggleAuto() {
    this.auto = !this.auto;
    this.addLog(`자동사냥 ${this.auto ? 'ON' : 'OFF'}`);
  }

  drainCombatEvents(): CombatEvent[] {
    const e = this.combatEvents;
    this.combatEvents = [];
    return e;
  }

  drainTexts(): FloatText[] {
    const t = this.texts;
    this.texts = [];
    return t;
  }

  step() {
    this.frame++;
    const p = this.player;
    p.snapshot();
    for (const m of this.monsters) m.fighter.snapshot();
    this.updateTarget();

    if (p.hp > 0) {
      // 생활 수치: 사냥하는 동안에도 지치고 배고파진다 (기술을 쓸수록 더 피곤)
      const life = this.life.tick(this.profile.life, { running: p.state === 'run' || p.state === 'dash', attackSerial: p.moveSerial });
      p.moveScale = life.slow * (life.canRun ? 1 : 0.8);
      if (life.warn) this.addLog(LIFE_WARNING[life.warn]);
      const cmd = (this.auto ? this.autoCtl : this.manual).read(this);
      p.freeMove = cmd.move;
      p.feed(cmd.input);
    } else {
      p.freeMove = null;
      p.feed(NEUTRAL_INPUT);
    }
    for (const m of this.monsters) {
      const cmd = m.fighter.hp > 0 ? m.brain.think(m, this) : idle();
      m.fighter.freeMove = cmd.move;
      m.fighter.feed(cmd.input);
    }

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    // 쿼터뷰 고정 카메라: 화면 안쪽 = -z
    const ctx = { awayX: 0, awayZ: -1 };
    p.tick({ opponent: this.target?.fighter ?? p, ...ctx });
    for (const m of this.monsters) m.fighter.tick({ opponent: p, ...ctx });

    this.separate();
    this.faceTargets();
    this.resolveHits();
    this.updateDeaths();
    this.updateSpawns();
    this.regen();
  }

  hud(): FieldHudState {
    const p = this.player;
    const t = this.target;
    const pr = this.profile;
    return {
      level: pr.level,
      exp: pr.exp,
      expNext: expToNext(pr.level),
      gold: pr.gold,
      kills: pr.kills,
      fatigue: Math.round(pr.life.fatigue),
      hunger: Math.round(pr.life.hunger),
      hp: p.hp,
      maxHp: p.maxHp,
      auto: this.auto,
      dead: p.hp <= 0,
      respawnIn: Math.ceil((PLAYER_RESPAWN_FRAMES - this.playerDeadFrames) / FPS),
      target: t && { name: t.type.name, level: t.type.level, hp: t.fighter.hp, maxHp: t.fighter.maxHp },
      log: this.log.slice(-6),
    };
  }

  // ───────────────────────── 내부 ─────────────────────────

  private addLog(text: string) {
    this.log.push({ id: ++this.logId, text });
    if (this.log.length > 20) this.log.shift();
  }

  private distTo(f: Fighter) {
    return Math.hypot(f.x - this.player.x, f.z - this.player.z);
  }

  /** 자동: 가장 가까운 몬스터 (나를 공격 중인 몬스터 우선). 수동: 8m 이내만 */
  private updateTarget() {
    if (this.target && (this.target.fighter.hp <= 0 || !this.monsters.includes(this.target))) this.target = null;

    let best: Monster | null = null;
    let bestScore = Infinity;
    for (const m of this.monsters) {
      if (m.fighter.hp <= 0) continue;
      const d = this.distTo(m.fighter);
      if (!this.auto && d > 8) continue;
      const score = d - (m.aggro ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }

    if (!this.target) {
      this.target = best;
    } else if (best && best !== this.target) {
      const td = this.distTo(this.target.fighter);
      if ((td > 4 && bestScore < td - 2) || (!this.auto && td > 10)) this.target = best;
    }
  }

  private living(): Fighter[] {
    return [this.player, ...this.monsters.map((m) => m.fighter)].filter((f) => f.state !== 'ko');
  }

  private separate() {
    const all = this.living();
    const min = FIGHTER_RADIUS * 2;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-6) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
    const lim = FIELD_HALF - FIGHTER_RADIUS;
    for (const f of all) {
      f.x = Math.max(-lim, Math.min(lim, f.x));
      f.z = Math.max(-lim, Math.min(lim, f.z));
    }
  }

  private faceTargets() {
    const p = this.player;
    const t = this.target?.fighter;
    if (t && this.distTo(t) < FACE_RANGE) p.faceToward(t);
    for (const m of this.monsters) {
      if (m.aggro && this.distTo(m.fighter) < FACE_RANGE) m.fighter.faceToward(p);
    }
  }

  private resolveHits() {
    const p = this.player;
    const hits: PendingHit[] = [];
    for (const m of this.monsters) {
      const h1 = detectHit(p, m.fighter);
      if (h1) hits.push(h1);
      const h2 = detectHit(m.fighter, p);
      if (h2) hits.push(h2);
    }

    let stop = 0;
    for (const h of hits) {
      const out = applyHit(h);
      this.combatEvents.push(out.event);
      stop = Math.max(stop, Math.min(out.hitstop, FIELD_HITSTOP_MAX));
      if (h.def === p) {
        this.lastHurtFrame = this.frame;
      } else {
        const m = this.monsters.find((m) => m.fighter === h.def)!;
        m.aggro = true;
        m.returning = false;
      }
    }
    if (stop) this.hitstop = Math.max(this.hitstop, stop);
  }

  private updateDeaths() {
    for (const m of this.monsters) {
      const f = m.fighter;
      if (f.hp <= 0 && !m.rewarded) {
        m.rewarded = true;
        this.profile.kills++;
        this.profile.gold += m.type.gold;
        this.texts.push({ x: f.x, y: 2.2, z: f.z, text: `+${m.type.exp} EXP`, kind: 'exp' });
        this.texts.push({ x: f.x, y: 1.8, z: f.z, text: `+${m.type.gold} G`, kind: 'gold' });
        this.addLog(`${m.type.name} 처치 (+${m.type.exp} EXP, +${m.type.gold} G)`);
        this.onExp(m.type.exp);
      }
      if (m.rewarded && f.state === 'ko') m.deadFrames++;
    }

    const gone = this.monsters.filter((m) => m.deadFrames > CORPSE_FRAMES);
    for (const m of gone) this.spawnTimers[m.spawnIndex] = this.frame + MONSTER_RESPAWN_FRAMES;
    if (gone.length) this.monsters = this.monsters.filter((m) => !gone.includes(m));

    const p = this.player;
    if (p.hp <= 0 && p.state === 'ko') {
      if (++this.playerDeadFrames >= PLAYER_RESPAWN_FRAMES) {
        this.playerDeadFrames = 0;
        p.reset(0, 0, 0, -1);
        this.target = null;
        this.addLog('마을에서 부활했습니다');
      }
    }
  }

  private onExp(n: number) {
    if (gainExp(this.profile, n) === 0) return;
    const st = playerStats(this.profile);
    const p = this.player;
    p.maxHp = st.maxHp;
    p.power = st.power;
    p.hp = p.maxHp;
    this.texts.push({ x: p.x, y: 2.6, z: p.z, text: 'LEVEL UP!', kind: 'level' });
    this.addLog(`레벨 업! Lv.${this.profile.level} (HP ${st.maxHp}, 공격력 x${st.power.toFixed(2)})`);
  }

  private updateSpawns() {
    FIELD_SPAWNS.forEach((def, i) => {
      const at = this.spawnTimers[i];
      if (at < 0 || this.frame < at) return;
      // 플레이어 바로 옆에는 스폰하지 않는다
      if (Math.hypot(def.x - this.player.x, def.z - this.player.z) < 3) {
        this.spawnTimers[i] = this.frame + 60;
        return;
      }
      const type = MONSTERS[def.type];
      const f = new Fighter(this.nextId, type.name, {
        maxHp: type.maxHp,
        power: type.power,
        canBlock: false,
        runSpeed: type.runSpeed,
      });
      const a = this.rng() * Math.PI * 2;
      f.reset(def.x, def.z, Math.cos(a), Math.sin(a));
      this.monsters.push({
        id: this.nextId++,
        type,
        fighter: f,
        spawnIndex: i,
        homeX: def.x,
        homeZ: def.z,
        aggro: false,
        returning: false,
        rewarded: false,
        deadFrames: 0,
        brain: new MonsterBrain(this.rng, type),
      });
      this.spawnTimers[i] = -1;
    });
  }

  /** 한동안 맞지 않으면 HP 자연 회복 */
  private regen() {
    const p = this.player;
    if (p.hp <= 0 || this.frame - this.lastHurtFrame < REGEN_DELAY || this.frame % 30 !== 0) return;
    p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.03));
  }
}
