import { FIGHTER_RADIUS, FPS, PLAYER_TEMPO } from './constants';
import { applyHit, autoDodge, detectHit, type CombatEvent, type PendingHit } from './combat';
import { bodySpecFor } from '../data/bodies';
import { mulberry32 } from './controllers';
import { Fighter, type FighterState } from './fighter';
import { NEUTRAL_INPUT, makeInput, type RelInput } from './input';
import { gainExp, saveProfile, type PlayerProfile } from './profile';
import { LIFE_WARNING, LifeTracker } from './life';
import { FIELD_SPAWNS, MONSTERS, MONSTER_RESPAWN_FRAMES, type MonsterType } from '../data/monsters';
import { DIR_OF_KEY, MOVES, totalFrames } from '../data/moves';
import { expToNext } from '../data/progression';
import { EQUIPS, dimensionStats, ensureGear, rollDrop } from '../data/equipment';
import { ARMS_STALL, SPOT_RANGE, TALK_RANGE, VILLAGE, VILLAGE_HOUSES, VILLAGE_NPCS, VILLAGE_SPAWN, VILLAGE_SPOTS, type VillageNpcDef } from '../data/village';
import { gateLocked } from '../story/chapter0';
import { DIRT_PER_FRAME, DIRTY, dirtRate } from '../city/chores';
import {
  COIN_NAME, INN, INN_BED_PRICE, INN_BEDS, INN_BOOTHS, INN_DOOR_OUT, INN_ENTRY, INN_EXIT, INN_FURNITURE, INN_LEAVE, INN_MENU, INN_SLEEPY, INN_SPOT_RANGE, INN_WALLS,
  SHOWER_FRAMES, SLEEP_FATIGUE_PER_MS, SLEEP_HP_PER_MS, SLEEP_HUNGER_PER_MS, SLEEP_LIE_FRAMES, SLEEP_MAX_MS, SLEEP_SETTLE_FRAMES, SLEEP_WAKE_FRAMES,
  bedStand, boothStand, inInn, type InnBlock,
} from '../data/inn';

/** 필드는 [-FIELD_HALF, FIELD_HALF] 정사각형 */
export const FIELD_HALF = 22;

/** 걸어 다닐 수 있는 곳: 사냥터 · 경계 마을 · 둘을 잇는 북문 (사각형 세 개) */
const WALK_RECTS = (() => {
  const r = FIGHTER_RADIUS;
  const h = FIELD_HALF - r;
  return [
    { x0: -h, x1: h, z0: -h, z1: h },
    { x0: VILLAGE.x0 + r, x1: VILLAGE.x1 - r, z0: VILLAGE.z0 + r, z1: VILLAGE.z1 - r },
    { x0: -VILLAGE.gate + r, x1: VILLAGE.gate - r, z0: FIELD_HALF - 1, z1: VILLAGE.z0 + 1 },
    // 달빛 여관 안 (마을에서 멀리 떨어진 곳, 문으로만 오간다)
    { x0: INN.x0 + r, x1: INN.x1 - r, z0: INN.z0 + r, z1: INN.z1 - r },
  ];
})();

/** 마을 담장 안(북문 포함)에 있나. 몬스터는 여기 있는 사람을 쫓지 않는다 */
export function inVillage(x: number, z: number): boolean {
  return z > FIELD_HALF && x > VILLAGE.x0 && x < VILLAGE.x1 && z < VILLAGE.z1;
}

/** 마을 담장 안 · 여관 안: 몬스터가 쫓지 않고, 편한 자세로 걷는다 */
export function inSafe(x: number, z: number): boolean {
  return inVillage(x, z) || inInn(x, z);
}

/** 걸을 수 있는 곳 밖으로 나가면 가장 가까운 걸을 수 있는 자리로 (벽을 따라 미끄러진다) */
export function clampWalk(f: { x: number; z: number }, monster = false) {
  let bx = f.x;
  let bz = f.z;
  let bd = Infinity;
  for (const rc of monster ? WALK_RECTS.slice(0, 1) : WALK_RECTS) {
    const x = Math.max(rc.x0, Math.min(rc.x1, f.x));
    const z = Math.max(rc.z0, Math.min(rc.z1, f.z));
    const d = (x - f.x) ** 2 + (z - f.z) ** 2;
    if (d === 0) {
      bd = 0;
      bx = f.x;
      bz = f.z;
      break;
    }
    if (d < bd) {
      bd = d;
      bx = x;
      bz = z;
    }
  }
  f.x = bx;
  f.z = bz;
  if (!monster) {
    pushOutOfHouses(f);
    if (inInn(f.x, f.z)) for (const b of INN_BLOCKS) pushOut(f, b);
  }
}

const INN_BLOCKS: InnBlock[] = [...INN_WALLS, ...INN_FURNITURE];

/** 사각형 안으로 들어가지 않게 가장 가까운 변 바깥으로 민다 */
function pushOut(f: { x: number; z: number }, b: InnBlock) {
  const r = FIGHTER_RADIUS;
  const x0 = b.x0 - r;
  const x1 = b.x1 + r;
  const z0 = b.z0 - r;
  const z1 = b.z1 + r;
  if (f.x <= x0 || f.x >= x1 || f.z <= z0 || f.z >= z1) return;
  const d = [f.x - x0, x1 - f.x, f.z - z0, z1 - f.z];
  const k = d.indexOf(Math.min(...d));
  if (k === 0) f.x = x0;
  else if (k === 1) f.x = x1;
  else if (k === 2) f.z = z0;
  else f.z = z1;
}

/** 선분 a→b 가 상자(가운데 cx, cz · 반폭 hw, hd)를 지나가나 (자동진행 길 찾기) */
function segHitsBox(a: { x: number; z: number }, b: { x: number; z: number }, cx: number, cz: number, hw: number, hd: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, q] of [
    [-dx, a.x - (cx - hw)],
    [dx, cx + hw - a.x],
    [-dz, a.z - (cz - hd)],
    [dz, cz + hd - a.z],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** 마을 건물 안으로 들어가지 않게 가장 가까운 벽 바깥으로 민다 */
function pushOutOfHouses(f: { x: number; z: number }) {
  const r = FIGHTER_RADIUS;
  for (const h of VILLAGE_HOUSES) {
    const hw = h.w / 2 + r;
    const hd = h.d / 2 + r;
    const dx = f.x - h.x;
    const dz = f.z - h.z;
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
    if (hw - Math.abs(dx) < hd - Math.abs(dz)) f.x = h.x + Math.sign(dx || 1) * hw;
    else f.z = h.z + Math.sign(dz || 1) * hd;
  }
}

/** 마을 NPC (서 있기만 한다, 모두에게 같은 자리) */
export interface VillageNpc {
  def: VillageNpcDef;
  fighter: Fighter;
}
/** 몬스터가 스폰 지점에서 이만큼 멀어지면 추적을 포기하고 돌아간다 */
const LEASH = 12;
/** 필드는 다수 전투라 히트스톱을 짧게 */
const FIELD_HITSTOP_MAX = 6;
const CORPSE_FRAMES = 90;
const PLAYER_RESPAWN_FRAMES = 180;
const REGEN_DELAY = 300;
/** 걷기·달리기 속도 (서울과 같다: 방향키 걷기, Shift 달리기) */
const WALK_SPEED = 0.045;
const DASH_RUN_SPEED = 0.1;
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
  /** 달리기 (Shift). 마을 안에선 안 누르면 걷는다 */
  run?: boolean;
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
  /** 여관 침대에서 자는 중이면 침대 번호와 눕는 정도 (0~1) */
  bed: number | null;
  rest: number;
  /** 샤워 칸에서 씻는 중이면 칸 번호 */
  booth: number | null;
}

/** 내 모습 (같은 차원 사람들에게 보낸다) */
export interface DimState extends NetPose {
  s: FighterState;
  f: number;
  m: string | null;
  hp: number;
  mh: number;
  lv: number;
  /** 여관: 자는 침대 · 눕는 정도(0~1, 0.05 단위) · 씻는 샤워 칸 */
  b?: number;
  r?: number;
  w?: number;
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
  /** 차원 돈 (은화) */
  coin: number;
  kills: number;
  fatigue: number;
  hunger: number;
  dirt: number;
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
  session: { seconds: number; kills: number; exp: number; coin: number; deaths: number };
  /** 경계 마을 안에 있나 (여관 안 포함) */
  inVillage: boolean;
  /** 달빛 여관 안에 있나 */
  inInn: boolean;
  /** 여관 문 가까이: 'in' 들어가기 · 'out' 나가기 */
  innDoor: 'in' | 'out' | null;
  /** 여관: 가까이 있는 침대 · 샤워 칸 (E) */
  innSpot: { kind: 'bed' | 'shower'; index: number; label: string; busy: boolean } | null;
  /** 자는 중: 단계 · 잔 시간(ms) */
  sleep: { phase: 'lie' | 'sleep' | 'wake'; sleptMs: number } | null;
  /** 씻는 중: 0~1 */
  shower: number | null;
  /** 말을 걸 수 있는 가까운 NPC */
  npc: { id: string; name: string; title: string; met: boolean } | null;
  /** 0장: 가까이 있는 살펴볼 곳 (NPC 가 더 가까우면 null) */
  spot: { id: 'board' | 'well' | 'book'; name: string; seen: boolean } | null;
  /** 무구 노점 앞 (장비를 은화로 산다) */
  shop: boolean;
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
    // 마을(담장 안)에 들어간 사람은 쫓지 않는다
    const p = w.nearestHunter(f.x, f.z, true);
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
  private session = { kills: 0, exp: 0, coin: 0, deaths: 0 };
  hitstop = 0;
  readonly player: Fighter;
  auto = false;
  monsters: Monster[] = [];
  target: Monster | null = null;
  /** 경계 마을 사람들 */
  readonly npcs: VillageNpc[];
  /** 대화 중 (내 캐릭터는 멈춰 선다) */
  talking: VillageNpc | null = null;
  playerDeadFrames = 0;
  private gateWarned = -999;
  /** 퀘스트 자동진행: 걸어갈 길 (마지막이 목적지). 방향키를 누르면 멈춘다 */
  questPath: { x: number; z: number }[] | null = null;
  /** 자동진행으로 목적지에 막 도착했다 (화면이 말을 걸고 지운다) */
  questArrived: string | null = null;
  private questFor: string | null = null;
  private questStuck = 0;
  private questLastDist = Infinity;
  /** 방향키로 자동진행을 멈췄다 (화면이 자동진행 모드를 끄고 지운다) */
  questCancelled = false;
  /** 여관 침대에서 자는 중. since·last 는 실제 시각 (ms) */
  sleep: { bed: number; phase: 'lie' | 'sleep' | 'wake'; t: number; since: number; last: number } | null = null;
  /** 샤워 칸에서 씻는 중 */
  shower: { booth: number; t: number; dirt0: number } | null = null;
  /** 여관 문을 지날 때마다 늘어난다 (화면을 잠깐 어둡게 · 카메라를 바로 옮긴다) */
  warpSerial = 0;
  /** 실제 시각 (시험에서 바꾼다) */
  nowMs: () => number = () => Date.now();
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
    this.player = new Fighter(0, 'PLAYER', { ...dimensionStats(profile), tempo: PLAYER_TEMPO, body: bodySpecFor(profile.body), autoDodge: true, manual: true });
    // 접속하면 경계 마을 포탈 앞에서 시작한다 (자동사냥은 꺼 둔 채로, 켜면 북문을 나가 사냥)
    this.player.reset(VILLAGE_SPAWN.x, VILLAGE_SPAWN.z, 0, -1);
    // 1장에 처음 나오는 인물은 0장을 마친 사람에게만 보인다
    const ch0Done = !!profile.dimension?.ch0?.done;
    this.npcs = VILLAGE_NPCS.filter((def) => def.after !== 'ch0' || ch0Done).map((def, i) => {
      const f = new Fighter(HUNTER_INDEX - 1 - i, def.name, { maxHp: 1, power: 0, canBlock: false });
      f.reset(def.x, def.z, def.fx, def.fz);
      return { def, fighter: f };
    });
    this.spawnTimers = FIELD_SPAWNS.map(() => 0);
    if (online) this.netReady = false;
    else {
      this.wasHost = true;
      this.updateSpawns();
    }
    this.addLog(`차원에 접속했습니다. 여기는 ${VILLAGE.name}`);
    this.addLog('북문을 나서면 사냥터 · 자동사냥은 Z');
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

  /** 0장이 끝나기 전 새 사람은 북문을 못 나간다 (바위가 막는다) */
  get gateLocked(): boolean {
    return gateLocked(this.profile.dimension?.ch0 ?? null);
  }

  toggleAuto() {
    if (!this.auto && (this.sleep || this.shower || inInn(this.player.x, this.player.z))) {
      this.addLog('여관 안에서는 자동사냥을 켤 수 없어요 (밖으로 나가서 켜 주세요)');
      return;
    }
    if (!this.auto && this.gateLocked) {
      this.addLog('바위: "문 밖은 아직 안 돼. 마을 사람들부터 만나고 와."');
      return;
    }
    this.auto = !this.auto;
    this.addLog(`자동사냥 ${this.auto ? 'ON' : 'OFF'}`);
  }

  // ───────────────────────── 경계 마을 ─────────────────────────

  /** 말을 걸 수 있는 가장 가까운 NPC */
  nearbyNpc(): VillageNpc | null {
    const p = this.player;
    if (p.hp <= 0) return null;
    let best: VillageNpc | null = null;
    let bd = TALK_RANGE;
    for (const n of this.npcs) {
      const d = Math.hypot(n.fighter.x - p.x, n.fighter.z - p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** 0장: 살펴볼 수 있는 가장 가까운 곳 (말 걸 NPC 가 있으면 그쪽이 먼저) */
  nearbySpot(): (typeof VILLAGE_SPOTS)[number] | null {
    const p = this.player;
    if (p.hp <= 0 || this.nearbyNpc()) return null;
    let best: (typeof VILLAGE_SPOTS)[number] | null = null;
    let bd = SPOT_RANGE;
    for (const s of VILLAGE_SPOTS) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** 무구 노점 앞인가 (말 걸 NPC 가 있으면 그쪽이 먼저) */
  nearbyShop(): boolean {
    const p = this.player;
    return p.hp > 0 && !this.nearbyNpc() && Math.hypot(ARMS_STALL.x - p.x, ARMS_STALL.z - p.z) < SPOT_RANGE;
  }

  /** 장비를 바꿨다: 체력·공격력을 다시 계산한다 (몸 + 차원 장비) */
  refreshStats() {
    const st = dimensionStats(this.profile);
    const p = this.player;
    p.maxHp = st.maxHp;
    p.power = st.power;
    p.hp = Math.min(p.hp, p.maxHp);
    saveProfile(this.profile);
  }

  /** 이야기 보수로 은화를 받는다 */
  giveCoin(n: number, why: string) {
    this.addCoin(n);
    const p = this.player;
    this.texts.push({ x: p.x, y: 2.2, z: p.z, text: `+${n} ${COIN_NAME}`, kind: 'gold' });
    this.addLog(`${why} (+${n} ${COIN_NAME})`);
    saveProfile(this.profile);
  }

  /** 무구 노점: 장비를 은화로 사서 가방에 */
  buyGear(id: string): { ok: boolean; message: string } {
    const e = EQUIPS[id];
    if (!e?.price) return { ok: false, message: '노점에서 파는 물건이 아니에요' };
    if (this.coin < e.price) return { ok: false, message: `${COIN_NAME}가 모자라요 (${e.price} ${COIN_NAME} · 가진 돈 ${this.coin})` };
    this.addCoin(-e.price);
    ensureGear(this.profile).owned.push(id);
    saveProfile(this.profile);
    this.addLog(`${e.icon} ${e.name} 구입 (-${e.price} ${COIN_NAME})`);
    return { ok: true, message: `${e.icon} ${e.name}을(를) 샀다! 내 장비 탭에서 껴요` };
  }

  /** 0장 장면 동안 NPC 를 붙잡아 둔다 (talk() 처럼 서로 마주 보고, 끝나면 endTalk) */
  holdNpc(id: string): boolean {
    const n = this.npcs.find((v) => v.def.id === id);
    if (!n) return false;
    this.talking = n;
    if (this.auto) this.toggleAuto();
    this.player.faceToward(n.fighter);
    n.fighter.faceToward(this.player);
    return true;
  }

  /**
   * 퀘스트 자동진행: 그 NPC 앞까지 걸어간다. 가는 길에 건물이 있으면 마을 광장 한가운데를 거쳐 간다.
   * 도착하면 questArrived = npc id. 못 찾으면 false
   */
  walkToNpc(id: string): boolean {
    const n = this.npcs.find((v) => v.def.id === id);
    if (!n || this.player.hp <= 0 || this.sleep || this.shower) return false;
    if (this.auto) this.toggleAuto();
    const d = n.def;
    // 여관 안에서 마을 사람에게 가려면 먼저 마을로 나간다 (여관 안 사람이면 그대로)
    if (inInn(this.player.x, this.player.z) && !inInn(d.x, d.z)) this.leaveInn();
    // NPC 가 바라보는 쪽 앞에 선다 (북문 쪽을 보는 사람은 마을 안쪽에서)
    let stand = { x: d.x + d.fx * 1.25, z: d.z + d.fz * 1.25 };
    if (stand.z < VILLAGE.z0 + 1.2) stand = { x: d.x, z: d.z + 1.3 };
    const p = this.player;
    const hub = { x: 0, z: 31.5 };
    const blocked = (a: { x: number; z: number }, b: { x: number; z: number }) => VILLAGE_HOUSES.some((h) => segHitsBox(a, b, h.x, h.z, h.w / 2 + 0.6, h.d / 2 + 0.6));
    this.questPath = blocked(p, stand) && !blocked(hub, stand) ? [hub, stand] : [stand];
    this.questFor = id;
    this.questArrived = null;
    this.questStuck = 0;
    return true;
  }

  /** 자동진행 멈춤 */
  stopQuestWalk() {
    this.questPath = null;
    this.questFor = null;
  }

  /** 떠오르는 글자 (장면 연출용) */
  floatText(x: number, y: number, z: number, text: string) {
    this.texts.push({ x, y, z, text, kind: 'exp' });
  }

  hasMet(id: string): boolean {
    return !!this.profile.dimension?.met?.includes(id);
  }

  /**
   * 가까운 NPC 에게 말을 건다. 대사 목록을 돌려준다 (처음 만나면 첫 인사, 아니면 평소 대사 한 줄).
   * 자동사냥 중이면 끈다 (말하는 동안 멈춰 선다)
   */
  talk(): { npc: VillageNpcDef; lines: string[]; first: boolean } | null {
    const n = this.nearbyNpc();
    if (!n) return null;
    const first = !this.hasMet(n.def.id);
    this.talking = n;
    if (this.auto) this.toggleAuto();
    const p = this.player;
    p.faceToward(n.fighter);
    n.fighter.faceToward(p);
    const lines = first ? n.def.first : [n.def.again[Math.floor(this.rng() * n.def.again.length)]];
    return { npc: n.def, lines, first };
  }

  /**
   * 작은은발소녀 전용 기술 (서울과 같은 R · X · Y). 쓸 수 있으면 true, 다른 캐릭터면 안내만
   */
  useSkill(skill: 'flyingKick' | 'tornadoKick' | 'backTurnKick'): boolean {
    const p = this.player;
    if (this.profile.body !== 'smallSilverGirl') {
      this.addLog('작은은발소녀 전용 스킬이에요');
      return false;
    }
    if (p.hp <= 0 || this.talking || !p.isActionable) return false;
    const id = skill === 'flyingKick' ? 'smallSilverFlyingKick' : skill === 'tornadoKick' ? 'smallSilverTornadoKick' : 'smallSilverBackTurnKick';
    const t = this.target?.fighter;
    if (t && this.distTo(t) < FACE_RANGE * 1.5) p.faceToward(t);
    p.queueMove(MOVES[id]);
    return true;
  }

  /** 대화를 마쳤다: 처음 만난 사람으로 기록하고, 여관이면 쉬어 간다. 해 주는 일(식당이면 'meal')을 돌려준다 */
  endTalk(): VillageNpcDef['service'] | null {
    const n = this.talking;
    this.talking = null;
    if (!n) return null;
    const d = (this.profile.dimension ??= { visits: 0 });
    d.met ??= [];
    if (!d.met.includes(n.def.id)) d.met.push(n.def.id);
    if (n.def.service === 'rest') {
      const p = this.player;
      p.hp = p.maxHp;
      this.texts.push({ x: p.x, y: 2.4, z: p.z, text: 'HP 회복', kind: 'exp' });
      this.addLog(`${n.def.name}의 차를 마시고 기운을 차렸습니다 (HP 가득)`);
    }
    n.fighter.reset(n.def.x, n.def.z, n.def.fx, n.def.fz);
    return n.def.service ?? null;
  }

  // ───────────────────────── 은화 · 달빛 여관 ─────────────────────────

  /** 차원 돈 (은화). 서울 돈(profile.gold)과 따로 센다 */
  get coin(): number {
    return this.profile.dimension?.coin ?? 0;
  }

  private addCoin(n: number) {
    const d = (this.profile.dimension ??= { visits: 0 });
    d.coin = Math.max(0, (d.coin ?? 0) + n);
  }

  /** 다른 사람이 자는 침대 · 씻는 샤워 칸 */
  private takenBeds(): Set<number> {
    const out = new Set<number>();
    for (const h of this.hunters.values()) if (this.fresh(h) && h.bed !== null) out.add(h.bed);
    return out;
  }
  private takenBooths(): Set<number> {
    const out = new Set<number>();
    for (const h of this.hunters.values()) if (this.fresh(h) && h.booth !== null) out.add(h.booth);
    return out;
  }

  /** 여관 안 가장 가까운 침대 · 샤워 칸 (E 로 쓴다) */
  nearbyInnSpot(): { kind: 'bed' | 'shower'; index: number } | null {
    const p = this.player;
    if (p.hp <= 0 || this.sleep || this.shower || !inInn(p.x, p.z)) return null;
    let best: { kind: 'bed' | 'shower'; index: number } | null = null;
    let bd = INN_SPOT_RANGE;
    const near = (x: number, z: number, kind: 'bed' | 'shower', index: number) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) {
        bd = d;
        best = { kind, index };
      }
    };
    INN_BEDS.forEach((b, i) => {
      const st = bedStand(b);
      near(st.x, st.z, 'bed', i);
    });
    INN_BOOTHS.forEach((b, i) => {
      const st = boothStand(b);
      near(st.x, st.z, 'shower', i);
    });
    return best;
  }

  /** E: 가까운 침대에 눕거나 샤워 칸에 들어간다 */
  useInnSpot(): boolean {
    const s = this.nearbyInnSpot();
    if (!s) return false;
    return s.kind === 'bed' ? this.lieDown(s.index) : this.startShower(s.index);
  }

  /** 침대에 눕는다 (숙박비 은화, 첫날 밤은 공짜). 실제 시간으로 자고, 창을 닫아도 계속 잔다 */
  lieDown(bed: number): boolean {
    const b = INN_BEDS[bed];
    const life = this.profile.life;
    if (!b || this.sleep || this.shower) return false;
    if (this.takenBeds().has(bed)) {
      this.addLog('다른 사람이 자고 있는 침대예요');
      return false;
    }
    if (life.fatigue < INN_SLEEPY) {
      this.addLog(`😐 아직 졸리지 않다 (피로도 ${INN_SLEEPY} 이상부터 잘 수 있어요 · 지금 ${Math.round(life.fatigue)})`);
      return false;
    }
    const d = (this.profile.dimension ??= { visits: 0 });
    if (!d.innFree) {
      d.innFree = true;
      this.addLog('🛏️ 첫날 밤은 달래가 공짜로 재워 줬다');
    } else if (this.coin < INN_BED_PRICE) {
      this.addLog(`💰 ${COIN_NAME}가 모자라요 (숙박 ${INN_BED_PRICE} ${COIN_NAME} · 가진 돈 ${this.coin})`);
      return false;
    } else {
      this.addCoin(-INN_BED_PRICE);
      this.texts.push({ x: this.player.x, y: 2.2, z: this.player.z, text: `-${INN_BED_PRICE} ${COIN_NAME}`, kind: 'gold' });
      this.addLog(`🛏️ 숙박비 ${INN_BED_PRICE} ${COIN_NAME}를 내고 침대에 누웠다`);
    }
    this.auto = false;
    const st = bedStand(b);
    this.player.reset(st.x, st.z, 1, 0);
    const now = this.nowMs();
    this.sleep = { bed, phase: 'lie', t: 0, since: now, last: now };
    return true;
  }

  /** 새로고침·다시 접속: 잠든 채로 이어서 잔다 (그동안 흐른 실제 시간만큼 쉰 것으로 친다) */
  resumeSleep(): boolean {
    const s = this.profile.dimension?.sleep;
    const b = s && INN_BEDS[s.bed];
    if (!s || !b) return false;
    const st = bedStand(b);
    this.player.reset(st.x, st.z, 1, 0);
    this.sleep = { bed: s.bed, phase: 'sleep', t: SLEEP_SETTLE_FRAMES, since: s.at, last: s.at };
    this.applySleepTime();
    return true;
  }

  /** 깨운다 (아무 키 · 화면 누르기). 다 누운 뒤에만 */
  wakeUp() {
    const s = this.sleep;
    if (!s || s.phase !== 'sleep' || s.t < SLEEP_SETTLE_FRAMES) return;
    this.startWake();
  }

  /** 곧바로 침대에서 나온다 (로그아웃할 때) */
  leaveBed() {
    if (!this.sleep) return;
    this.applySleepTime();
    this.sleep = null;
    if (this.profile.dimension) delete this.profile.dimension.sleep;
  }

  /** 눕는 정도 0~1 (렌더러 자세) */
  get restAmount(): number {
    const s = this.sleep;
    if (!s) return 0;
    if (s.phase === 'lie') return Math.min(1, s.t / SLEEP_LIE_FRAMES);
    if (s.phase === 'sleep') return 1;
    return Math.max(0, 1 - s.t / SLEEP_WAKE_FRAMES);
  }

  private startWake() {
    const s = this.sleep!;
    this.applySleepTime();
    const slept = s.last - s.since;
    s.phase = 'wake';
    s.t = 0;
    if (this.profile.dimension) delete this.profile.dimension.sleep;
    const m = Math.floor(slept / 60_000);
    const span = m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
    this.addLog(`☀️ 잘 잤다! (${span} 잠) · 피로도 ${Math.round(this.profile.life.fatigue)}`);
  }

  /** 잠든 뒤 흐른 실제 시간만큼 쉰다 (서울 집 침대와 같은 속도) */
  private applySleepTime() {
    const s = this.sleep;
    if (!s) return;
    const now = Math.min(this.nowMs(), s.since + SLEEP_MAX_MS);
    const dt = Math.max(0, now - s.last);
    s.last = Math.max(s.last, now);
    if (dt <= 0) return;
    const life = this.profile.life;
    life.fatigue = Math.max(0, life.fatigue - dt * SLEEP_FATIGUE_PER_MS);
    life.hunger = Math.min(100, life.hunger + dt * SLEEP_HUNGER_PER_MS);
    const p = this.player;
    p.hp = Math.min(p.maxHp, Math.round(p.hp + p.maxHp * dt * SLEEP_HP_PER_MS));
  }

  private stepSleep() {
    const s = this.sleep!;
    s.t++;
    if (s.phase === 'lie') {
      if (s.t >= SLEEP_LIE_FRAMES) {
        s.phase = 'sleep';
        s.t = 0;
        // 다 누웠다: 이때부터 창을 닫아도 계속 잔다
        const d = (this.profile.dimension ??= { visits: 0 });
        d.sleep = { bed: s.bed, at: s.since };
        this.addLog('😴 잠이 들었다… (아무 키나 누르면 일어나요)');
      }
      return;
    }
    if (s.phase === 'sleep') {
      this.applySleepTime();
      if (s.t >= SLEEP_SETTLE_FRAMES) {
        const cmd = this.manual.read(this);
        if (cmd.move || cmd.input.buttons.some(Boolean)) return this.startWake();
      }
      if (this.nowMs() - s.since >= SLEEP_MAX_MS) {
        this.addLog('12시간을 자고 저절로 깼다');
        this.startWake();
      }
      return;
    }
    if (s.t >= SLEEP_WAKE_FRAMES) this.sleep = null;
  }

  /** 샤워 칸에 들어간다 (커튼을 치고 씻는다, 공짜) */
  startShower(booth: number): boolean {
    const b = INN_BOOTHS[booth];
    if (!b || this.sleep || this.shower) return false;
    if (this.takenBooths().has(booth)) {
      this.addLog('누가 씻고 있어요. 다른 칸을 써 주세요');
      return false;
    }
    this.auto = false;
    const st = boothStand(b);
    this.player.reset(st.x, st.z, 0, -1);
    this.shower = { booth, t: 0, dirt0: this.profile.life.dirt ?? 0 };
    this.addLog('🚿 커튼을 치고 씻는 중…');
    return true;
  }

  private stepShower() {
    const s = this.shower!;
    s.t++;
    const life = this.profile.life;
    life.dirt = s.dirt0 * Math.max(0, 1 - s.t / SHOWER_FRAMES);
    if (s.t < SHOWER_FRAMES) return;
    life.dirt = 0;
    // 따뜻한 물: 피로가 조금 풀린다
    life.fatigue = Math.max(0, life.fatigue - 3);
    this.shower = null;
    this.texts.push({ x: this.player.x, y: 2.3, z: this.player.z, text: '개운하다!', kind: 'exp' });
    this.addLog('🧼 깨끗이 씻었다 (더러움 0 · 피로도 -3)');
  }

  /** 식당에서 사 먹는다 (은화) */
  buyMeal(id: string): { ok: boolean; message: string } {
    const meal = INN_MENU.find((m) => m.id === id);
    if (!meal) return { ok: false, message: '없는 메뉴예요' };
    const life = this.profile.life;
    if (meal.hunger > meal.fatigue && life.hunger < 5) return { ok: false, message: '배불러서 더는 못 먹겠다…' };
    if (this.coin < meal.price) return { ok: false, message: `${COIN_NAME}가 모자라요 (${meal.price} ${COIN_NAME} · 가진 돈 ${this.coin})` };
    this.addCoin(-meal.price);
    life.hunger = Math.max(0, life.hunger - meal.hunger);
    life.fatigue = Math.max(0, life.fatigue - meal.fatigue);
    const p = this.player;
    if (meal.hp) p.hp = p.maxHp;
    this.texts.push({ x: p.x, y: 2.3, z: p.z, text: `${meal.icon} 냠냠`, kind: 'exp' });
    const fx = [meal.hunger ? `배고픔 -${meal.hunger}` : '', meal.fatigue ? `피로도 -${meal.fatigue}` : '', meal.hp ? 'HP 가득' : ''].filter(Boolean).join(' · ');
    const message = `${meal.icon} ${meal.name} 먹었다 (${fx})`;
    this.addLog(message);
    return { ok: true, message };
  }

  /** 여관 문: 마을 쪽 문으로 걸어 들어가면 여관 안 · 안쪽 남문으로 걸어 나오면 마을 */
  private passInnDoor() {
    const p = this.player;
    const mv = p.freeMove;
    if (!mv || p.hp <= 0) return;
    const len = Math.hypot(mv.x, mv.z) || 1;
    const r = FIGHTER_RADIUS;
    if (inInn(p.x, p.z)) {
      if (mv.z / len > 0.5 && p.z >= INN.z1 - r - 0.03 && Math.abs(p.x - INN_EXIT.x) < INN_EXIT.halfWidth) this.leaveInn();
      return;
    }
    if (mv.x / len < -0.5 && p.x <= INN_DOOR_OUT.x + r + 0.03 && p.x > INN_DOOR_OUT.x - 0.2 && Math.abs(p.z - INN_DOOR_OUT.z) < INN_DOOR_OUT.halfWidth) this.enterInn();
  }

  /** 여관 문 가까이 있나: 'in' = 마을 쪽 문 앞 (들어가기) · 'out' = 여관 안 남문 앞 (나가기) */
  innDoorNear(): 'in' | 'out' | null {
    const p = this.player;
    if (p.hp <= 0 || this.sleep || this.shower || this.talking) return null;
    if (inInn(p.x, p.z)) return Math.abs(p.x - INN_EXIT.x) < 1.2 && p.z > INN.z1 - 1.3 ? 'out' : null;
    return Math.hypot(p.x - INN_DOOR_OUT.x, p.z - INN_DOOR_OUT.z) < 1.6 ? 'in' : null;
  }

  /** 여관에 들어간다 (문으로 걸어 들어가거나 버튼) */
  enterInn() {
    const p = this.player;
    if (p.hp <= 0 || inInn(p.x, p.z)) return;
    this.auto = false;
    p.reset(INN_ENTRY.x, INN_ENTRY.z, 0, -1);
    this.warpSerial++;
    this.addLog(`🏠 ${INN.name}에 들어왔습니다 · 씻는 곳(왼쪽) · 먹는 곳(가운데) · 자는 곳(오른쪽)`);
  }

  /** 여관에서 마을로 나간다 */
  leaveInn() {
    const p = this.player;
    if (p.hp <= 0 || !inInn(p.x, p.z) || this.sleep || this.shower) return;
    p.reset(INN_LEAVE.x, INN_LEAVE.z, 1, 0);
    this.warpSerial++;
    this.addLog(`${VILLAGE.name}로 나왔습니다`);
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

  /** 살아 있는 사람 중 (x, z) 에서 가장 가까운 사람 (나 포함). outside = 마을 안 사람은 빼고 */
  nearestHunter(x: number, z: number, outside = false): Fighter | null {
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const f of this.aliveHunters()) {
      if (outside && inSafe(f.x, f.z)) continue;
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
    for (const n of this.npcs) n.fighter.snapshot();
    if (this.talking && (p.hp <= 0 || Math.hypot(this.talking.fighter.x - p.x, this.talking.fighter.z - p.z) > TALK_RANGE + 1.5)) this.talking = null;
    this.stepHunters();
    this.updateTarget();

    if (p.hp > 0 && (this.sleep || this.shower)) {
      // 여관 침대에서 자는 중 · 샤워 칸에서 씻는 중: 제자리에 멈춰 있다 (생활 수치는 잠·샤워가 정한다)
      if (this.sleep) this.stepSleep();
      else this.stepShower();
      p.freeMove = null;
      p.feed(NEUTRAL_INPUT);
    } else if (p.hp > 0) {
      // 생활 수치: 사냥하는 동안에도 지치고 배고파진다 (기술을 쓸수록 더 피곤)
      const life = this.life.tick(this.profile.life, { running: p.state === 'run' || p.state === 'dash', attackSerial: p.moveSerial });
      p.moveScale = life.slow * (life.canRun ? 1 : 0.8);
      if (life.warn) this.addLog(LIFE_WARNING[life.warn]);
      // 땀·먼지: 서울과 같은 속도 (뛰고 싸울수록 빨리). 여관 샤워 칸에서 씻는다
      const pl = this.profile.life;
      const dirt0 = pl.dirt ?? 0;
      pl.dirt = Math.min(100, dirt0 + DIRT_PER_FRAME * dirtRate(this.life.activity, 0));
      if (dirt0 <= DIRTY && pl.dirt > DIRTY) this.addLog('💦 땀 냄새가 난다… 여관에서 씻고 싶다');
      let cmd = this.talking ? idle() : (this.auto ? this.autoCtl : this.manual).read(this);
      if (this.questPath && !this.talking) {
        if (cmd.move || this.auto) {
          // 직접 움직이면 자동진행을 멈춘다
          this.stopQuestWalk();
          this.questCancelled = true;
          this.addLog('자동 진행을 멈췄어요 (G 로 다시)');
        } else {
          const tgt = this.questPath[0];
          const dx = tgt.x - p.x;
          const dz = tgt.z - p.z;
          const dist = Math.hypot(dx, dz);
          const last = this.questPath.length === 1;
          // 건물 모서리 같은 데 걸려 한참 못 가면 다음 지점으로 넘긴다
          this.questStuck = dist < this.questLastDist - 0.01 ? 0 : this.questStuck + 1;
          this.questLastDist = dist;
          if (dist < (last ? 0.35 : 0.8) || this.questStuck > 90) {
            this.questPath.shift();
            this.questStuck = 0;
            this.questLastDist = Infinity;
            if (!this.questPath.length) {
              this.questArrived = this.questFor;
              this.stopQuestWalk();
            }
          } else cmd = { move: { x: dx, z: dz }, run: dist > 2.5, input: NEUTRAL_INPUT };
        }
      }
      // 서울과 같이: 방향키 = 걷기, Shift = 달리기 (자동사냥은 늘 달린다)
      p.runSpeed = cmd.run ? DASH_RUN_SPEED : WALK_SPEED;
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
      coin: this.coin,
      kills: pr.kills,
      fatigue: Math.round(pr.life.fatigue),
      hunger: Math.round(pr.life.hunger),
      dirt: Math.round(pr.life.dirt ?? 0),
      hp: p.hp,
      maxHp: p.maxHp,
      auto: this.auto,
      dead: p.hp <= 0,
      respawnIn: Math.ceil((PLAYER_RESPAWN_FRAMES - this.playerDeadFrames) / FPS),
      target: t && { name: t.type.name, level: t.type.level, hp: t.fighter.hp, maxHp: t.fighter.maxHp },
      log: this.log.slice(-6),
      others: [...this.hunters.values()].filter((h) => this.fresh(h)).map((h) => ({ name: h.name, level: h.level })),
      session: { seconds: Math.floor(this.frame / FPS), ...this.session },
      inVillage: inSafe(p.x, p.z),
      inInn: inInn(p.x, p.z),
      innDoor: this.innDoorNear(),
      innSpot: (() => {
        const s = this.nearbyInnSpot();
        if (!s) return null;
        if (s.kind === 'bed') {
          const free = !this.profile.dimension?.innFree;
          return { kind: s.kind, index: s.index, label: `침대에 눕기 (${free ? '첫날 밤 공짜' : `숙박 ${INN_BED_PRICE} ${COIN_NAME}`})`, busy: this.takenBeds().has(s.index) };
        }
        return { kind: s.kind, index: s.index, label: '샤워하기', busy: this.takenBooths().has(s.index) };
      })(),
      sleep: this.sleep && { phase: this.sleep.phase, sleptMs: Math.max(0, this.sleep.last - this.sleep.since) },
      shower: this.shower && Math.min(1, this.shower.t / SHOWER_FRAMES),
      npc: (() => {
        const n = this.nearbyNpc();
        return n && { id: n.def.id, name: n.def.name, title: n.def.title, met: this.hasMet(n.def.id) };
      })(),
      spot: (() => {
        const s = this.nearbySpot();
        return s && { id: s.id, name: s.name, seen: !!this.profile.dimension?.ch0?.clues?.includes(s.id) };
      })(),
      shop: this.nearbyShop(),
    };
  }

  // ───────────────────────── 같이 사냥 (주고받기) ─────────────────────────

  /** 같은 차원에 누가 들어왔다 (접속 정보) */
  upsertHunter(id: string, name: string, joinedAt: number, outfit: string[] = [], body?: string) {
    let h = this.hunters.get(id);
    if (!h) {
      const f = new Fighter(this.hunterIndex++, name, { canBlock: false, body: bodySpecFor(body) });
      f.reset(0, 0, 0, -1);
      h = { id, name, fighter: f, level: 1, outfit, body, joinedAt, target: null, seenAt: this.frame, hitLock: 0, bed: null, rest: 0, booth: null };
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
    const out: DimState = { x: q(p.x), z: q(p.z), y: q(p.y), fx: q(p.fx), fz: q(p.fz), s: p.state, f: p.frame, m: p.move?.id ?? null, hp: Math.round(p.hp), mh: p.maxHp, lv: this.profile.level };
    if (this.sleep) {
      out.b = this.sleep.bed;
      out.r = Math.round(this.restAmount * 20) / 20;
    }
    if (this.shower) out.w = this.shower.booth;
    return out;
  }

  applyHunterState(id: string, s: DimState) {
    const h = this.hunters.get(id);
    if (!h || !s || typeof s.x !== 'number') return;
    const f = h.fighter;
    const first = !h.target;
    h.seenAt = this.frame;
    h.level = s.lv ?? h.level;
    h.bed = typeof s.b === 'number' && s.b >= 0 && s.b < INN_BEDS.length ? s.b : null;
    h.rest = h.bed !== null ? Math.min(1, Math.max(0, Number(s.r) || 0)) : 0;
    h.booth = typeof s.w === 'number' && s.w >= 0 && s.w < INN_BOOTHS.length ? s.w : null;
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

  addLog(text: string) {
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
    for (const { f, local } of all) if (local) clampWalk(f, f !== this.player);
    this.passInnDoor();
    // 0장이 끝나기 전엔 북문 앞에서 멈춘다
    if (this.gateLocked && this.player.z < VILLAGE.z0 + 0.7) {
      this.player.z = VILLAGE.z0 + 0.7;
      if (this.frame - this.gateWarned > 240) {
        this.gateWarned = this.frame;
        this.addLog('바위: "어딜. 문 밖은 아직 안 돼."');
      }
    }
    // NPC 와 겹치지 않게 (NPC 는 움직이지 않는다)
    if (this.player.state !== 'ko') {
      for (const n of this.npcs) {
        const dx = this.player.x - n.fighter.x;
        const dz = this.player.z - n.fighter.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-6) {
          this.player.x = n.fighter.x + (dx / d) * min;
          this.player.z = n.fighter.z + (dz / d) * min;
        }
      }
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
    // 이야기 장면(1장 고블린 떼 등) 동안은 쓰러지지 않는다: 바닥 직전에서 버틴다
    if (this.storyShield && p.hp <= 0) {
      p.reset(p.x, p.z, p.fx, p.fz);
      p.hp = 1;
      this.playerDeadFrames = 0;
    }
    if (p.hp <= 0 && p.state === 'ko') {
      if (++this.playerDeadFrames >= PLAYER_RESPAWN_FRAMES) {
        this.playerDeadFrames = 0;
        this.session.deaths++;
        p.reset(VILLAGE_SPAWN.x, VILLAGE_SPAWN.z, 0, -1);
        this.target = null;
        this.addLog(`${VILLAGE.name} 포탈 앞에서 다시 깨어났습니다`);
      }
    }
  }

  /** 몬스터를 잡을 때마다 (이야기 의뢰 세기용, 화면이 단다) */
  onKill: ((monsterId: string) => void) | null = null;
  /** 이야기 장면 중: 체력이 0 이 되어도 쓰러지지 않고 1 에서 버틴다 (빈사 연출) */
  storyShield = false;

  /**
   * 근이 처음 터진다 (1장 첫 발현): 둘레 몬스터를 크게 밀쳐 내고 빛 글자. 몬스터 계산을 맡은 사람만 실제로 민다
   * (같은 차원 사람들끼리 몬스터 자리가 어긋나지 않게)
   */
  rootBurst(text: string, radius = 6) {
    const p = this.player;
    this.texts.push({ x: p.x, y: 2.8, z: p.z, text, kind: 'exp' });
    if (!this.isHost) return;
    for (const m of this.monsters) {
      const f = m.fighter;
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || f.hp <= 0) continue;
      const k = (radius - d + 2) / Math.max(0.3, d);
      f.x += dx * k;
      f.z += dz * k;
      clampWalk(f, true);
    }
  }

  private grantKill(type: MonsterType, x: number, z: number) {
    this.onKill?.(type.id);
    // 차원에서 번 돈은 은화 (서울 돈 G 와 따로)
    this.profile.kills++;
    this.addCoin(type.gold);
    this.session.kills++;
    this.session.exp += type.exp;
    this.session.coin += type.gold;
    this.texts.push({ x, y: 2.2, z, text: `+${type.exp} EXP`, kind: 'exp' });
    this.texts.push({ x, y: 1.8, z, text: `+${type.gold} ${COIN_NAME}`, kind: 'gold' });
    this.addLog(`${type.name} 처치 (+${type.exp} EXP, +${type.gold} ${COIN_NAME})`);
    // 가끔 장비를 떨어뜨린다 (내 가방에만 — 같은 차원 사람들 몬스터 계산과 어긋나지 않게 공유 난수는 쓰지 않는다)
    const drop = rollDrop(type.id, Math.random);
    if (drop) {
      const e = EQUIPS[drop];
      ensureGear(this.profile).owned.push(drop);
      this.texts.push({ x, y: 2.6, z, text: `${e.icon} ${e.name}`, kind: 'level' });
      this.addLog(`${type.name}이(가) ${e.icon} ${e.name}을(를) 떨어뜨렸다! (장비창 T)`);
    }
    this.onExp(type.exp);
  }

  private onExp(n: number) {
    if (gainExp(this.profile, n) === 0) return;
    const st = dimensionStats(this.profile);
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
