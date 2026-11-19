import { FIGHTER_RADIUS, FPS, PLAYER_TEMPO } from './constants';
import { applyHit, autoDodge, detectHit, type CombatEvent, type PendingHit } from './combat';
import { bodySpecFor } from '../data/bodies';
import { mulberry32 } from './controllers';
import { Fighter, type FighterState } from './fighter';
import { NEUTRAL_INPUT, makeInput, type RelInput } from './input';
import { gainExp, type PlayerProfile } from './profile';
import { LIFE_WARNING, LifeTracker } from './life';
import { FIELD_SPAWNS, MONSTERS, MONSTER_RESPAWN_FRAMES, type MonsterType } from '../data/monsters';
import { DIR_OF_KEY, MOVES, totalFrames } from '../data/moves';
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
/** 이만큼(프레임) 소식이 없는 사람은 같이 있는 걸로 치지 않는다 (창을 내려 둔 사람 등) */
const HUNTER_FRESH = 180;
/** 내가 때린 뒤 받은 모습으로 덮어쓰지 않는 프레임 */
const HIT_LOCK = 12;
/** 다른 사람 캐릭터 번호 (몬스터 번호와 겹치지 않게) */
const HUNTER_INDEX = 100000;

/** 플레이어/몬스터 컨트롤러가 매 프레임 내는 명령 */
export interface FieldCommand {
  /** 월드 기준 이동 방향. null 이면 제자리 (철권식 입력만) */
  move: { x: number; z: number } | null;
  input: RelInput;
}

export interface PlayerController {
  read(world: FieldWorld): FieldCommand;
}

interface NetPose {
  x: number;
  z: number;
  y: number;
  fx: number;
  fz: number;
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
  /** 때린 사람 id (처치하면 모두 보상을 받는다) */
  hitters: Set<string>;
  /** (계산 담당이 아닐 때) 받은 위치. 이 자리로 부드럽게 따라간다 */
  net: NetPose | null;
  /** 내가 방금 때려서, 받은 모습으로 덮어쓰지 않는 프레임 (맞는 동작이 끊기지 않게) */
  hitLock: number;
}

/** 같은 차원에 접속한 다른 사람. 그 사람 컴퓨터가 움직임을 정하고, 나는 받은 모습을 따라 그린다 */
export interface Hunter {
  id: string;
  name: string;
  fighter: Fighter;
  level: number;
  outfit: string[];
  body?: string;
  /** 차원에 들어온 시각 — 가장 먼저 들어온 사람이 몬스터를 계산한다 */
  joinedAt: number;
  target: NetPose | null;
  seenAt: number;
  hitLock: number;
}

/** 내 모습 (같은 차원 사람들에게 보낸다) */
export interface DimState extends NetPose {
  s: FighterState;
  f: number;
  m: string | null;
  hp: number;
  mh: number;
  lv: number;
}

/** 몬스터 한 마리 (계산 담당이 보낸다). d = 쓰러진 뒤 지난 프레임 (살아 있으면 -1) */
export interface DimMonster extends NetPose {
  i: number;
  t: string;
  sp: number;
  s: FighterState;
  f: number;
  m: string | null;
  hp: number;
  mh: number;
  d: number;
  a: 0 | 1;
}

/**
 * 타격. 내가 몬스터를 때리면 계산 담당에게 (to = 담당 id), 몬스터가 사람을 때리면 계산 담당이 맞은 사람에게 (to = 그 사람).
 * 받는 쪽이 혼자 할 때와 같은 계산(applyHit)으로 체력을 깎는다.
 */
export interface DimHit {
  to: string;
  mid: number;
  m: string;
  counter: boolean;
  remaining: number;
  power: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
}

/** 몬스터 처치 (계산 담당이 알린다). who 에 든 사람은 모두 경험치·골드를 받는다 */
export interface DimKill {
  mid: number;
  t: string;
  who: string[];
  x: number;
  z: number;
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
  /** 같은 차원에 있는 다른 사람들 */
  others: { name: string; level: number }[];
  /** 이번 사냥(필드에 들어온 뒤) 성과 */
  session: { seconds: number; kills: number; exp: number; gold: number; deaths: number };
}

const idle = (): FieldCommand => ({ move: null, input: NEUTRAL_INPUT });
const q = (v: number) => Math.round(v * 100) / 100;

/** 몬스터 AI: 배회 → (선공 or 피격 시) 가장 가까운 사람 추적 → 근접하면 기술 사용 → 너무 멀어지면 귀환 */
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
    const p = w.nearestHunter(f.x, f.z);
    const dist = p ? Math.hypot(p.x - f.x, p.z - f.z) : Infinity;
    const home = Math.hypot(m.homeX - f.x, m.homeZ - f.z);

    if (!m.aggro && !m.returning && p && this.type.aggroRange > 0 && dist < this.type.aggroRange) {
      m.aggro = true;
    }
    if (m.aggro && (!p || home > LEASH)) {
      m.aggro = false;
      m.returning = true;
      this.queue = [];
    }
    if (m.returning) {
      if (home < 0.6) {
        m.returning = false;
        f.hp = f.maxHp;
        m.hitters.clear();
      } else {
        return { move: { x: m.homeX - f.x, z: m.homeZ - f.z }, input: NEUTRAL_INPUT };
      }
    }

    if (this.queue.length) return { move: null, input: this.queue.shift()! };

    if (m.aggro && p) {
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
 * RPG 필드 — 서울 집 컴퓨터로 접속하는 "다른 차원". 철권 엔진의 Fighter / 히트 판정을 그대로 쓰고,
 * 1:1 대신 플레이어 + 몬스터 다수를 돌린다. Match 와 마찬가지로 순수 로직.
 *
 * 같은 차원에 들어온 사람들은 모두 같은 몬스터를 본다:
 * 가장 먼저 들어온 사람(계산 담당)이 몬스터를 움직이고 장면을 보낸다. 나머지는 받은 장면을 따라 그리고,
 * 자기가 때린 타격은 계산 담당에게 보낸다. 접속하지 않았으면(netId 없음) 혼자 계산한다.
 */
export class FieldWorld {
  frame = 0;
  /** 이번 사냥 성과 (필드에 들어온 뒤부터) */
  private session = { kills: 0, exp: 0, gold: 0, deaths: 0 };
  hitstop = 0;
  readonly player: Fighter;
  auto = true;
  monsters: Monster[] = [];
  target: Monster | null = null;
  playerDeadFrames = 0;
  log: { id: number; text: string }[] = [];

  // ── 같이 사냥 (접속했을 때만) ──
  /** 내 계정 id. 없으면 혼자 */
  netId: string | null = null;
  /** 이 차원에 들어온 시각 (계산 담당 순서) */
  joinedAt = Date.now();
  /** 누가 있는지 처음 확인했나. 확인 전엔 몬스터를 만들지 않는다 (먼저 온 사람의 몬스터를 받아야 하므로) */
  netReady = true;
  readonly hunters = new Map<string, Hunter>();
  /** 보낼 것: 내가 몬스터를 때림(→ 계산 담당) · 몬스터가 사람을 때림(→ 그 사람) · 처치 알림 */
  readonly hitOut: DimHit[] = [];
  readonly strikeOut: DimHit[] = [];
  readonly killOut: DimKill[] = [];

  private lastHurtFrame = -Infinity;
  private life = new LifeTracker();
  /** 스폰 지점별 다음 스폰 프레임. -1 이면 이미 몬스터가 있음 */
  private spawnTimers: number[];
  private nextId = 1;
  private logId = 0;
  private rng: () => number;
  private combatEvents: CombatEvent[] = [];
  private texts: FloatText[] = [];
  private wasHost = false;
  /** 다른 사람이 보낸 몬스터 장면을 받은 적이 있나 */
  private gotScene = false;
  private hunterIndex = HUNTER_INDEX;

  constructor(
    private manual: PlayerController,
    private autoCtl: PlayerController,
    readonly profile: PlayerProfile,
    seed = 7,
    /** 같은 차원에 접속해서 들어간다 (누가 있는지 확인될 때까지 몬스터를 만들지 않는다) */
    online = false,
  ) {
    this.rng = mulberry32(seed);
    this.player = new Fighter(0, 'PLAYER', { ...playerStats(profile), tempo: PLAYER_TEMPO, body: bodySpecFor(profile.body), autoDodge: true, manual: true });
    this.player.reset(0, 0, 0, -1);
    this.spawnTimers = FIELD_SPAWNS.map(() => 0);
    if (online) this.netReady = false;
    else {
      this.wasHost = true;
      this.updateSpawns();
    }
    this.addLog('차원에 접속했습니다. 자동사냥 ON');
  }

  get level() {
    return this.profile.level;
  }

  /** 나를 가리키는 id (접속 안 했으면 'me') */
  get myId(): string {
    return this.netId ?? 'me';
  }

  /** 몬스터를 계산하는 사람: 소식이 끊기지 않은 사람 중 가장 먼저 들어온 사람 (같으면 id 가 작은 쪽) */
  get hostId(): string {
    let best = { id: this.myId, at: this.joinedAt };
    if (!this.netId) return best.id;
    for (const h of this.hunters.values()) {
      if (!this.fresh(h)) continue;
      if (h.joinedAt < best.at || (h.joinedAt === best.at && h.id < best.id)) best = { id: h.id, at: h.joinedAt };
    }
    return best.id;
  }

  get isHost(): boolean {
    return this.netReady && this.hostId === this.myId;
  }

  /** 같이 있는 사람이 있나 (없으면 아무것도 보내지 않는다) */
  get hasCompany(): boolean {
    for (const h of this.hunters.values()) if (this.fresh(h)) return true;
    return false;
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

  /** 살아 있는 사람 중 (x, z) 에서 가장 가까운 사람 (나 포함) */
  nearestHunter(x: number, z: number): Fighter | null {
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const f of this.aliveHunters()) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  step() {
    this.frame++;
    const host = this.isHost;
    if (host && !this.wasHost) this.takeOver();
    this.wasHost = host;

    const p = this.player;
    p.snapshot();
    for (const m of this.monsters) m.fighter.snapshot();
    this.stepHunters();
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
    if (host) {
      for (const m of this.monsters) {
        const cmd = m.fighter.hp > 0 ? m.brain.think(m, this) : idle();
        m.fighter.freeMove = cmd.move;
        m.fighter.feed(cmd.input);
      }
    } else {
      // 계산 담당이 보낸 몬스터 모습을 따라간다
      for (const m of this.monsters) {
        m.fighter.frame++;
        if (m.net) follow(m.fighter, m.net);
      }
    }

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    // 쿼터뷰 고정 카메라: 화면 안쪽 = -z
    const ctx = { awayX: 0, awayZ: -1 };
    p.tick({ opponent: this.target?.fighter ?? p, ...ctx });
    if (host) for (const m of this.monsters) m.fighter.tick({ opponent: this.nearestHunter(m.fighter.x, m.fighter.z) ?? p, ...ctx });

    this.separate(host);
    this.faceTargets(host);
    this.resolveHits(host);
    this.updateDeaths(host);
    if (host) this.updateSpawns();
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
      others: [...this.hunters.values()].filter((h) => this.fresh(h)).map((h) => ({ name: h.name, level: h.level })),
      session: { seconds: Math.floor(this.frame / FPS), ...this.session },
    };
  }

  // ───────────────────────── 같이 사냥 (주고받기) ─────────────────────────

  /** 같은 차원에 누가 들어왔다 (접속 정보) */
  upsertHunter(id: string, name: string, joinedAt: number, outfit: string[] = [], body?: string) {
    let h = this.hunters.get(id);
    if (!h) {
      const f = new Fighter(this.hunterIndex++, name, { canBlock: false, body: bodySpecFor(body) });
      f.reset(0, 0, 0, -1);
      h = { id, name, fighter: f, level: 1, outfit, body, joinedAt, target: null, seenAt: this.frame, hitLock: 0 };
      this.hunters.set(id, h);
      this.addLog(`👋 ${name} 님이 차원에 들어왔어요`);
    }
    h.name = name;
    h.joinedAt = joinedAt;
    h.outfit = outfit;
    h.body = body;
    h.fighter.body = bodySpecFor(body);
  }

  removeHunter(id: string) {
    const h = this.hunters.get(id);
    if (!h) return;
    this.hunters.delete(id);
    for (const m of this.monsters) m.hitters.delete(id);
    this.addLog(`${h.name} 님이 차원에서 나갔어요`);
  }

  /** 보낼 내 모습 */
  netState(): DimState {
    const p = this.player;
    return { x: q(p.x), z: q(p.z), y: q(p.y), fx: q(p.fx), fz: q(p.fz), s: p.state, f: p.frame, m: p.move?.id ?? null, hp: Math.round(p.hp), mh: p.maxHp, lv: this.profile.level };
  }

  applyHunterState(id: string, s: DimState) {
    const h = this.hunters.get(id);
    if (!h || !s || typeof s.x !== 'number') return;
    const f = h.fighter;
    const first = !h.target;
    h.seenAt = this.frame;
    h.level = s.lv ?? h.level;
    h.target = { x: s.x, z: s.z, y: s.y, fx: s.fx, fz: s.fz };
    if (first) placeAt(f, h.target);
    if (this.frame < h.hitLock) return;
    syncPose(f, s);
    f.maxHp = s.mh;
    f.hp = s.hp;
  }

  /** (계산 담당) 보낼 몬스터 장면 */
  netMonsters(): DimMonster[] {
    return this.monsters.map((m) => {
      const f = m.fighter;
      return {
        i: m.id, t: m.type.id, sp: m.spawnIndex, x: q(f.x), z: q(f.z), y: q(f.y), fx: q(f.fx), fz: q(f.fz),
        s: f.state, f: f.frame, m: f.move?.id ?? null, hp: Math.round(f.hp), mh: f.maxHp, d: m.rewarded ? m.deadFrames : -1, a: m.aggro ? 1 : 0,
      };
    });
  }

  /** 계산 담당이 보낸 몬스터 장면을 그대로 따른다 */
  applyMonsters(list: DimMonster[]) {
    if (!Array.isArray(list)) return;
    this.gotScene = true;
    const seen = new Set<number>();
    for (const d of list.slice(0, 64)) {
      const type = MONSTERS[d?.t];
      const def = FIELD_SPAWNS[d?.sp];
      if (!type || !def || typeof d.i !== 'number') continue;
      seen.add(d.i);
      let m = this.monsters.find((x) => x.id === d.i);
      if (m && m.type !== type) {
        this.monsters = this.monsters.filter((x) => x !== m);
        m = undefined;
      }
      if (!m) {
        m = this.makeMonster(d.i, type, d.sp);
        placeAt(m.fighter, d);
        this.monsters.push(m);
      }
      m.net = { x: d.x, z: d.z, y: d.y, fx: d.fx, fz: d.fz };
      m.aggro = d.a === 1;
      if (d.d >= 0) {
        m.rewarded = true;
        m.deadFrames = Math.max(m.deadFrames, d.d);
      }
      if (this.frame >= m.hitLock || d.hp <= 0) {
        syncPose(m.fighter, d);
        m.fighter.maxHp = d.mh;
        m.fighter.hp = d.hp;
      }
      this.nextId = Math.max(this.nextId, d.i + 1);
    }
    const gone = this.monsters.filter((m) => !seen.has(m.id));
    if (gone.length) {
      this.monsters = this.monsters.filter((m) => seen.has(m.id));
      if (this.target && gone.includes(this.target)) this.target = null;
    }
    for (let i = 0; i < this.spawnTimers.length; i++) this.spawnTimers[i] = this.monsters.some((m) => m.spawnIndex === i) ? -1 : this.frame + MONSTER_RESPAWN_FRAMES;
  }

  /** (계산 담당) 같이 있는 사람이 몬스터를 때렸다 */
  receiveHunterHit(from: string, h: DimHit) {
    const hu = this.hunters.get(from);
    const mv = MOVES[h?.m];
    const m = this.monsters.find((x) => x.id === h?.mid);
    if (!hu || !mv || !m || m.fighter.hp <= 0 || !this.isHost) return;
    const att = poseAttacker(hu.fighter, h, mv);
    const out = applyHit({ att, def: m.fighter, mv, blocked: false, counter: !!h.counter });
    this.combatEvents.push(out.event);
    m.aggro = true;
    m.returning = false;
    m.hitters.add(from);
  }

  /** 계산 담당이 알려 준, 몬스터가 나를 때린 타격 */
  receiveStrike(h: DimHit) {
    const mv = MOVES[h?.m];
    const p = this.player;
    if (!mv || p.hp <= 0 || p.isInvulnerable()) return;
    const m = this.monsters.find((x) => x.id === h.mid);
    const att = poseAttacker(m?.fighter ?? new Fighter(h.mid, 'monster', { canBlock: false }), h, mv);
    const stance = p.isAirborne() ? null : p.blockStance();
    const blocked = !mv.unblockable && ((stance === 'stand' && mv.level !== 'low') || (stance === 'crouch' && mv.level === 'low'));
    const out = applyHit({ att, def: p, mv, blocked, counter: !blocked && !!h.counter });
    this.combatEvents.push(out.event);
    this.hitstop = Math.max(this.hitstop, Math.min(out.hitstop, FIELD_HITSTOP_MAX));
    this.lastHurtFrame = this.frame;
  }

  /** 계산 담당이 알린 처치: 내가 때렸던 몬스터면 보상을 받는다 */
  receiveKill(k: DimKill) {
    const type = MONSTERS[k?.t];
    if (!type || !Array.isArray(k.who) || !k.who.includes(this.myId)) return;
    this.grantKill(type, k.x, k.z);
  }

  // ───────────────────────── 내부 ─────────────────────────

  private fresh(h: Hunter) {
    return this.frame - h.seenAt < HUNTER_FRESH;
  }

  private aliveHunters(): Fighter[] {
    const out: Fighter[] = [];
    if (this.player.hp > 0) out.push(this.player);
    for (const h of this.hunters.values()) if (this.fresh(h) && h.target && h.fighter.hp > 0) out.push(h.fighter);
    return out;
  }

  private stepHunters() {
    for (const h of this.hunters.values()) {
      const f = h.fighter;
      f.snapshot();
      f.frame++;
      if (h.target) follow(f, h.target);
    }
  }

  /** 계산 담당이 되었다: 받은 장면에서 이어서 계산한다 */
  private takeOver() {
    for (const m of this.monsters) {
      m.net = null;
      if (m.fighter.hp <= 0) m.rewarded = true;
    }
    const wait = this.gotScene ? MONSTER_RESPAWN_FRAMES : 0;
    for (let i = 0; i < this.spawnTimers.length; i++) this.spawnTimers[i] = this.monsters.some((m) => m.spawnIndex === i) ? -1 : this.frame + wait;
  }

  private addLog(text: string) {
    this.log.push({ id: ++this.logId, text });
    if (this.log.length > 20) this.log.shift();
  }

  private distTo(f: Fighter) {
    return Math.hypot(f.x - this.player.x, f.z - this.player.z);
  }

  /**
   * 자동: 가까운 몬스터 (나를 공격 중인 몬스터 우선). 레벨에 맞는 사냥감을 고른다 —
   * 나보다 너무 약하면 경험치가 적으니 덜 노리고, 2 레벨 넘게 강하면 위험하니 피한다.
   * 수동: 8m 이내만
   */
  private updateTarget() {
    if (this.target && (this.target.fighter.hp <= 0 || !this.monsters.includes(this.target))) this.target = null;

    let best: Monster | null = null;
    let bestScore = Infinity;
    for (const m of this.monsters) {
      if (m.fighter.hp <= 0) continue;
      const d = this.distTo(m.fighter);
      if (!this.auto && d > 8) continue;
      let score = d - (m.aggro ? 3 : 0);
      if (this.auto && !m.aggro) {
        const gap = this.level - m.type.level;
        if (gap > 3) score += (gap - 3) * 3;
        if (gap < -2) score += 100;
      }
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

  /**
   * 서로 겹치지 않게 민다. 내가 움직임을 정하는 것(나 · 계산 담당이면 몬스터)만 밀리고,
   * 남이 정하는 것(다른 사람 · 받은 몬스터)은 그 자리에 둔다.
   */
  private separate(host: boolean) {
    const all: { f: Fighter; local: boolean }[] = [];
    if (this.player.state !== 'ko') all.push({ f: this.player, local: true });
    for (const m of this.monsters) if (m.fighter.state !== 'ko') all.push({ f: m.fighter, local: host });
    for (const h of this.hunters.values()) if (h.target && this.fresh(h) && h.fighter.state !== 'ko') all.push({ f: h.fighter, local: false });
    const min = FIGHTER_RADIUS * 2;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i];
        const B = all[j];
        if (!A.local && !B.local) continue;
        const a = A.f;
        const b = B.f;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-6) {
          const push = A.local && B.local ? (min - d) / 2 : min - d;
          if (A.local) {
            a.x -= (dx / d) * push;
            a.z -= (dz / d) * push;
          }
          if (B.local) {
            b.x += (dx / d) * push;
            b.z += (dz / d) * push;
          }
        }
      }
    }
    const lim = FIELD_HALF - FIGHTER_RADIUS;
    for (const { f, local } of all) {
      if (!local) continue;
      f.x = Math.max(-lim, Math.min(lim, f.x));
      f.z = Math.max(-lim, Math.min(lim, f.z));
    }
  }

  private faceTargets(host: boolean) {
    const p = this.player;
    const t = this.target?.fighter;
    if (t && this.distTo(t) < FACE_RANGE) p.faceToward(t);
    if (!host) return;
    for (const m of this.monsters) {
      if (!m.aggro) continue;
      const h = this.nearestHunter(m.fighter.x, m.fighter.z);
      if (h && Math.hypot(h.x - m.fighter.x, h.z - m.fighter.z) < FACE_RANGE) m.fighter.faceToward(h);
    }
  }

  private resolveHits(host: boolean) {
    const p = this.player;
    const hits: PendingHit[] = [];
    for (const m of this.monsters) {
      autoDodge(p, m.fighter);
      const h1 = detectHit(p, m.fighter);
      if (h1) hits.push(h1);
      // 몬스터의 공격은 계산 담당만 판정한다 (맞은 사람에게 알린다)
      if (!host) continue;
      const h2 = detectHit(m.fighter, p);
      if (h2) hits.push(h2);
      for (const hu of this.hunters.values()) {
        if (!this.fresh(hu) || !hu.target || hu.fighter.hp <= 0) continue;
        const hr = detectHit(m.fighter, hu.fighter);
        if (!hr) continue;
        const remaining = totalFrames(hr.mv) - m.fighter.frame + 1;
        const out = applyHit(hr);
        this.combatEvents.push(out.event);
        hu.hitLock = this.frame + HIT_LOCK;
        this.strikeOut.push(this.packHit(hu.id, m.id, m.fighter, hr, remaining));
      }
    }

    let stop = 0;
    for (const h of hits) {
      const remaining = totalFrames(h.mv) - h.att.frame + 1;
      const out = applyHit(h);
      this.combatEvents.push(out.event);
      stop = Math.max(stop, Math.min(out.hitstop, FIELD_HITSTOP_MAX));
      if (h.def === p) {
        this.lastHurtFrame = this.frame;
      } else {
        const m = this.monsters.find((m) => m.fighter === h.def)!;
        m.aggro = true;
        m.returning = false;
        m.hitters.add(this.myId);
        if (!host) {
          m.hitLock = this.frame + HIT_LOCK;
          this.hitOut.push(this.packHit(this.hostId, m.id, p, h, remaining));
        }
      }
    }
    if (stop) this.hitstop = Math.max(this.hitstop, stop);
  }

  private packHit(to: string, mid: number, att: Fighter, h: PendingHit, remaining: number): DimHit {
    return { to, mid, m: h.mv.id, counter: h.counter, remaining, power: att.power, x: q(att.x), z: q(att.z), fx: q(att.fx), fz: q(att.fz) };
  }

  private updateDeaths(host: boolean) {
    for (const m of this.monsters) {
      const f = m.fighter;
      if (host && f.hp <= 0 && !m.rewarded) {
        m.rewarded = true;
        const who = [...m.hitters];
        if (who.includes(this.myId) || !this.netId) this.grantKill(m.type, f.x, f.z);
        if (this.netId && who.some((id) => id !== this.myId)) this.killOut.push({ mid: m.id, t: m.type.id, who, x: q(f.x), z: q(f.z) });
      }
      if (m.rewarded && f.state === 'ko') m.deadFrames++;
    }

    if (host) {
      const gone = this.monsters.filter((m) => m.deadFrames > CORPSE_FRAMES);
      for (const m of gone) this.spawnTimers[m.spawnIndex] = this.frame + MONSTER_RESPAWN_FRAMES;
      if (gone.length) this.monsters = this.monsters.filter((m) => !gone.includes(m));
    }

    const p = this.player;
    if (p.hp <= 0 && p.state === 'ko') {
      if (++this.playerDeadFrames >= PLAYER_RESPAWN_FRAMES) {
        this.playerDeadFrames = 0;
        this.session.deaths++;
        p.reset(0, 0, 0, -1);
        this.target = null;
        this.addLog('접속 지점에서 다시 깨어났습니다');
      }
    }
  }

  private grantKill(type: MonsterType, x: number, z: number) {
    this.profile.kills++;
    this.profile.gold += type.gold;
    this.session.kills++;
    this.session.exp += type.exp;
    this.session.gold += type.gold;
    this.texts.push({ x, y: 2.2, z, text: `+${type.exp} EXP`, kind: 'exp' });
    this.texts.push({ x, y: 1.8, z, text: `+${type.gold} G`, kind: 'gold' });
    this.addLog(`${type.name} 처치 (+${type.exp} EXP, +${type.gold} G)`);
    this.onExp(type.exp);
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

  private makeMonster(id: number, type: MonsterType, spawnIndex: number): Monster {
    const def = FIELD_SPAWNS[spawnIndex];
    const f = new Fighter(id, type.name, {
      maxHp: type.maxHp,
      power: type.power,
      canBlock: false,
      runSpeed: type.runSpeed,
      size: type.scale,
    });
    return {
      id,
      type,
      fighter: f,
      spawnIndex,
      homeX: def.x,
      homeZ: def.z,
      aggro: false,
      returning: false,
      rewarded: false,
      deadFrames: 0,
      brain: new MonsterBrain(this.rng, type),
      hitters: new Set(),
      net: null,
      hitLock: 0,
    };
  }

  private updateSpawns() {
    if (!this.netReady) return;
    FIELD_SPAWNS.forEach((def, i) => {
      const at = this.spawnTimers[i];
      if (at < 0 || this.frame < at) return;
      // 사람 바로 옆에는 스폰하지 않는다
      if (this.aliveHunters().some((f) => Math.hypot(def.x - f.x, def.z - f.z) < 3)) {
        this.spawnTimers[i] = this.frame + 60;
        return;
      }
      const m = this.makeMonster(this.nextId++, MONSTERS[def.type], i);
      const a = this.rng() * Math.PI * 2;
      m.fighter.reset(def.x, def.z, Math.cos(a), Math.sin(a));
      this.monsters.push(m);
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

/** 받은 위치로 부드럽게 따라간다 (멀면 바로 그 자리에) */
function follow(f: Fighter, t: NetPose) {
  const d = Math.hypot(t.x - f.x, t.z - f.z);
  const k = d > 4 ? 1 : 0.3;
  f.x += (t.x - f.x) * k;
  f.z += (t.z - f.z) * k;
  f.y += (t.y - f.y) * 0.5;
  const fx = f.fx + (t.fx - f.fx) * 0.4;
  const fz = f.fz + (t.fz - f.fz) * 0.4;
  const len = Math.hypot(fx, fz) || 1;
  f.fx = fx / len;
  f.fz = fz / len;
}

function placeAt(f: Fighter, t: NetPose) {
  f.x = t.x;
  f.z = t.z;
  f.y = t.y;
  const len = Math.hypot(t.fx, t.fz) || 1;
  f.fx = t.fx / len;
  f.fz = t.fz / len;
  f.snapshot();
}

/** 받은 동작(상태·기술·프레임)으로 맞춘다 */
function syncPose(f: Fighter, s: { s: FighterState; m: string | null; f: number }) {
  if (f.state !== s.s || (f.move?.id ?? null) !== s.m) {
    f.state = s.s;
    f.move = s.m ? (MOVES[s.m] ?? null) : null;
    f.frame = s.f;
  } else if (Math.abs(f.frame - s.f) > 6) f.frame = s.f;
}

/** 받은 타격의 공격자를 때린 순간의 모습으로 놓는다 (경직·밀림 계산이 혼자 할 때와 같게) */
function poseAttacker(att: Fighter, h: DimHit, mv: (typeof MOVES)[string]): Fighter {
  att.x = h.x;
  att.z = h.z;
  att.fx = h.fx;
  att.fz = h.fz;
  att.power = h.power;
  att.frame = totalFrames(mv) + 1 - h.remaining;
  att.moveHits.length = 0;
  return att;
}
