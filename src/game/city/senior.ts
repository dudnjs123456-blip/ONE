import { FIGHTER_RADIUS } from '../core/constants';
import { mulberry32 } from '../core/controllers';
import type { Fighter, FighterState } from '../core/fighter';
import { NEUTRAL_INPUT } from '../core/input';
import type { Poi } from './cityMap';
import { CORRIDOR, LOBBY, type CityWorld } from './cityWorld';

/**
 * 선임 경비 박 반장: 평소엔 1층 반장실 책상에 앉아 일을 보다가,
 * 수시로 일어나 엘리베이터로 2층부터 꼭대기 층까지 복도를 한 층씩 순찰하고 돌아와 다시 앉는다.
 */

/** 있는 곳: 1 = 로비(반장실 포함), 2 이상 = 그 층 복도, 0 = 엘리베이터 안 (안 보인다) */
type Where = number;

type Step =
  | { kind: 'walk'; x: number; z: number }
  | { kind: 'wait'; frames: number; say?: string[] }
  | { kind: 'ride'; to: Where; x: number; z: number; frames: number }
  | { kind: 'sit' }
  | { kind: 'stand' }
  | { kind: 'floor'; floor: number }
  | { kind: 'done' };

const SIT_FRAMES = 30;
/** 처음 순찰은 조금 있다가, 그다음부턴 이 간격(프레임) 사이에서 무작위 */
const FIRST_PATROL = 60 * 75;
const PATROL_GAP: [number, number] = [60 * 120, 60 * 240];

const LINES = {
  leave: ['순찰 한 바퀴 돌고 오겠네', '어디, 층마다 한번 둘러볼까', '자리 좀 지키고 있게, 순찰 다녀옴세'],
  extinguisher: ['소화기 압력 정상이고…', '소화기 이상 없고', '소화기, 됐고'],
  panel: ['분전함도 괜찮고', '분전함 문 잘 닫혀 있네', '전기 쪽도 이상 없고'],
  window: ['창문 잠금 확인!', '창문도 잘 잠겼네', '복도 창문 이상 무'],
  greet: ['자네도 수고하네!', '오, 여기서 보네그려', '별일 없지?', '순찰 중일세, 허허'],
  back: ['휴, 다 돌았다', '이상 없음! 이제 좀 앉아야겠네', '아이고 허리야… 다 돌았네'],
  /** 반장실에 들어오면 고개를 들어 한 번 본다 */
  hello: ['왔나?', '어, 자네 왔구먼', '응, 들어오게', '어 그래'],
};

/** 동네를 계산하는 친구가 보내는 반장님 모습 (모두가 같은 반장님을 본다) */
export interface NetSenior {
  w: number;
  si: number;
  pf: number;
  a: SeniorActivity;
  at: number;
  g: number;
  pt: 0 | 1;
  x: number;
  z: number;
  fx: number;
  fz: number;
  s: FighterState;
  f: number;
}

/** 책상에 앉아 하는 일 (번갈아 가며) */
export type SeniorActivity = 'coffee' | 'typing' | 'phone';
const ACTIVITIES: SeniorActivity[] = ['coffee', 'typing', 'phone'];
/** 한 가지 일을 하는 시간 (프레임) */
const ACTIVITY_GAP: [number, number] = [60 * 20, 60 * 45];
/** 쳐다보는 시간 */
const GLANCE_FRAMES = 150;

export class SeniorAI {
  where: Where = 1;
  /** 앉은 정도 (0 = 서 있음, 1 = 앉음). 렌더러가 자세를 바꾸는 데 쓴다 */
  sit = 1;
  /** 순찰 중인 층 (순찰 중이 아니면 0) */
  patrolFloor = 0;
  private plan: Step[] = [];
  private stepAt = 0;
  private nextPatrolAt = FIRST_PATROL;
  private greeted = new Set<number>();
  private readonly rng = mulberry32(4242);
  private frame = 0;
  /** 앉아서 하는 일 · 그 일을 한 시간(초, 쳐다보는 동안은 멈춘다) */
  activity: SeniorActivity = 'typing';
  activityTime = 0;
  private nextActivityAt = ACTIVITY_GAP[0];
  /** 플레이어를 쳐다보는 정도 (0~1) */
  glance = 0;
  private glanceUntil = -1;
  private playerInOffice = false;
  /** 친구가 계산한 모습을 따라 그리는 중 (순찰 중인가 · 따라갈 위치) */
  private remote: { pt: boolean; x: number; z: number; fx: number; fz: number } | null = null;

  constructor(
    private readonly w: CityWorld,
    readonly f: Fighter,
  ) {
    this.seat();
  }

  get patrolling() {
    return this.remote ? this.remote.pt : this.plan.length > 0;
  }

  get seated() {
    return this.sit >= 1 && !this.patrolling;
  }

  /** 지금 어디서 뭘 하는지 (대화 맥락·HUD 용) */
  get status(): string {
    if (!this.patrolling) return '1층 반장실 책상에 앉아 일을 보는 중';
    if (this.where === 0) return '엘리베이터로 층을 옮기는 중';
    if (this.where === 1) return '순찰하러 로비를 지나는 중';
    return `${this.where}층 복도를 순찰하는 중`;
  }

  /** 앉은 자리로 바로 옮긴다 */
  private seat() {
    const c = LOBBY.office.chair;
    this.f.reset(c.x, c.z, 0, 1);
    this.where = 1;
    this.sit = 1;
  }

  /** 지금 플레이어가 있는 곳 번호 (1 = 로비, 2 이상 = 복도, 0 = 그 밖) */
  private playerPlace(): Where {
    const w = this.w;
    return w.location === 'lobby' ? 1 : w.location === 'corridor' ? w.floor : -1;
  }

  /** 플레이어와 같은 곳에 있어 보이나 */
  visibleTo(): boolean {
    return this.where > 0 && this.where === this.playerPlace();
  }

  /** 한마디: 같은 곳(로비·그 층 복도)에 있는 모두에게 보인다 */
  private say(lines: string[], color = '#ffe08a') {
    if (this.where <= 0) return;
    const text = lines[Math.floor(this.rng() * lines.length)];
    this.w.townSay({ x: this.f.x, z: this.f.z, text, color }, this.where === 1 ? 'lobby' : `c${this.where}`);
  }

  /** 친구들에게 보낼 지금 모습 */
  net(): NetSenior {
    const q = (v: number) => Math.round(v * 100) / 100;
    const f = this.f;
    return {
      w: this.where, si: q(this.sit), pf: this.patrolFloor, a: this.activity, at: q(this.activityTime), g: q(this.glance), pt: this.patrolling ? 1 : 0,
      x: q(f.x), z: q(f.z), fx: q(f.fx), fz: q(f.fz), s: f.state, f: f.frame,
    };
  }

  /** 친구가 계산한 모습을 받았다 */
  applyNet(n: NetSenior) {
    const f = this.f;
    const moved = n.w !== this.where || Math.hypot(f.x - n.x, f.z - n.z) > 4;
    this.where = n.w;
    this.sit = n.si;
    this.patrolFloor = n.pf;
    if (n.a !== this.activity || Math.abs(n.at - this.activityTime) > 0.5) this.activityTime = n.at;
    this.activity = n.a;
    this.glance = n.g;
    this.remote = { pt: !!n.pt, x: n.x, z: n.z, fx: n.fx, fz: n.fz };
    if (f.state !== n.s) {
      f.state = n.s;
      f.frame = n.f;
    }
    if (moved) {
      f.x = n.x;
      f.z = n.z;
      f.snapshot();
    }
  }

  /** 받은 모습을 부드럽게 따라간다 */
  stepMirror() {
    const f = this.f;
    const t = this.remote;
    f.snapshot();
    f.frame++;
    if (!t) return;
    if (this.seated && this.glance < 0.3) this.activityTime += 1 / 60;
    f.x += (t.x - f.x) * 0.3;
    f.z += (t.z - f.z) * 0.3;
    const fx = f.fx + (t.fx - f.fx) * 0.4;
    const fz = f.fz + (t.fz - f.fz) * 0.4;
    const len = Math.hypot(fx, fz) || 1;
    f.fx = fx / len;
    f.fz = fz / len;
  }

  /** 내가 계산을 맡게 됐다: 순찰 중이었으면 자리로 돌아가 앉은 채로 이어 간다 */
  adopt() {
    const r = this.remote;
    if (!r) return;
    this.remote = null;
    if (r.pt) {
      this.plan = [];
      this.patrolFloor = 0;
      this.seat();
    }
  }

  /** 대화하기 지점: 앉아 있으면 책상 앞, 순찰 중이면 반장님 곁 */
  poi(): Poi | null {
    if (!this.visibleTo()) return null;
    const f = this.f;
    if (!this.patrolling) {
      const c = LOBBY.office.chair;
      return { id: 'senior', kind: 'job', label: '박 반장과 대화하기 (반장실)', x: c.x, z: c.z + 1.45, radius: 0.9 };
    }
    return { id: 'senior', kind: 'job', label: '박 반장과 대화하기 (순찰 중)', x: f.x, z: f.z, radius: 1.3 };
  }

  /** 순찰 일정: 반장실 → 엘리베이터 → 2층 ~ 꼭대기 층 복도 점검 → 다시 반장실 */
  startPatrol() {
    if (this.patrolling) return;
    const o = LOBBY.office;
    const top = this.w.villaFloors;
    const cp = (id: string) => CORRIDOR.checkpoints.find((c) => c.id === id)!;
    const ex = cp('extinguisher');
    const pn = cp('panel');
    const wn = cp('window');
    const lift = { x: -4.3, z: -0.75 };
    const plan: Step[] = [
      { kind: 'wait', frames: 40, say: LINES.leave },
      { kind: 'stand' },
      { kind: 'walk', x: o.chair.x + 0.9, z: o.chair.z - 0.05 },
      { kind: 'walk', x: o.x1 - 0.55, z: o.doorZ },
      { kind: 'walk', x: o.x1 + 0.6, z: o.doorZ },
      { kind: 'walk', x: 1.9, z: -2.55 },
    ];
    for (let fl = 2; fl <= top; fl++) {
      plan.push(
        { kind: 'ride', to: fl, x: lift.x, z: lift.z, frames: fl === 2 ? 150 : 100 },
        { kind: 'floor', floor: fl },
        { kind: 'walk', x: ex.x, z: ex.z + 0.45 },
        { kind: 'wait', frames: 80, say: LINES.extinguisher },
        { kind: 'walk', x: pn.x, z: pn.z + 0.45 },
        { kind: 'wait', frames: 80, say: LINES.panel },
        { kind: 'walk', x: wn.x - 0.3, z: wn.z },
        { kind: 'wait', frames: 80, say: LINES.window },
        { kind: 'walk', x: lift.x, z: lift.z },
      );
    }
    plan.push(
      { kind: 'ride', to: 1, x: 1.9, z: -2.55, frames: 150 },
      { kind: 'floor', floor: 0 },
      { kind: 'walk', x: o.x1 + 0.6, z: o.doorZ },
      { kind: 'walk', x: o.x1 - 0.55, z: o.doorZ },
      { kind: 'walk', x: o.chair.x + 0.9, z: o.chair.z - 0.05 },
      { kind: 'walk', x: o.chair.x, z: o.chair.z },
      { kind: 'sit' },
      { kind: 'wait', frames: 30, say: LINES.back },
      { kind: 'done' },
    );
    this.plan = plan;
    this.stepAt = this.frame;
    this.greeted.clear();
    const pl = this.playerPlace();
    if (pl >= 1) this.w.say('👴 박 반장님이 층마다 순찰을 나섰다', 3);
  }

  step() {
    const w = this.w;
    const f = this.f;
    this.frame++;
    f.snapshot();
    const chatting = w.npcChat?.npc === 'senior';
    // 때가 되면 순찰을 나선다 (대화 중·강도 소동 중엔 미룬다)
    if (!this.patrolling && this.frame >= this.nextPatrolAt) {
      if (chatting || w.job?.robber) this.nextPatrolAt = this.frame + 60 * 20;
      else {
        this.startPatrol();
        this.nextPatrolAt = this.frame + PATROL_GAP[0] + Math.floor(this.rng() * (PATROL_GAP[1] - PATROL_GAP[0]));
      }
    }

    let move: { x: number; z: number } | null = null;
    const s = this.plan[0];
    if (chatting) {
      // 이야기하는 동안은 멈춰서 후배를 본다 (앉아 있으면 그대로)
      if (!this.seated) this.face(w.player.x - f.x, w.player.z - f.z);
      this.stepAt++;
    } else if (s) {
      const t = this.frame - this.stepAt;
      switch (s.kind) {
        case 'wait':
          if (t === 0 && s.say) this.say(s.say);
          if (t >= s.frames) this.next();
          break;
        case 'stand':
          this.sit = Math.max(0, 1 - t / SIT_FRAMES);
          if (t >= SIT_FRAMES) this.next();
          break;
        case 'sit': {
          const c = LOBBY.office.chair;
          f.x += (c.x - f.x) * 0.2;
          f.z += (c.z - f.z) * 0.2;
          this.face(0, 1);
          this.sit = Math.min(1, t / SIT_FRAMES);
          if (t >= SIT_FRAMES) this.next();
          break;
        }
        case 'walk': {
          const dx = s.x - f.x;
          const dz = s.z - f.z;
          if (Math.hypot(dx, dz) < 0.25) this.next();
          else move = { x: dx, z: dz };
          break;
        }
        case 'ride':
          // 엘리베이터에 타면 안 보이다가, 도착한 층 엘리베이터 앞에 나타난다
          if (t === 0) this.where = 0;
          if (t >= s.frames) {
            this.where = s.to;
            f.reset(s.x, s.z, 0, 1);
            this.next();
          }
          break;
        case 'floor':
          this.patrolFloor = s.floor;
          this.next();
          break;
        case 'done':
          this.plan = [];
          this.patrolFloor = 0;
          this.seat();
          break;
      }
    } else {
      // 책상에 앉아 일 보는 중: 정면(남쪽, 반장실 문 쪽)을 본다
      this.face(0, 1);
    }
    this.stepDesk(chatting);

    // 순찰 중 같은 층에서 후배를 마주치면 한마디
    if (this.patrolling && this.where >= 2 && this.visibleTo() && !this.greeted.has(this.where)) {
      if (Math.hypot(w.player.x - f.x, w.player.z - f.z) < 2.6) {
        this.greeted.add(this.where);
        this.say(LINES.greet, '#bfe9ff');
      }
    }

    if (this.sit > 0 || this.where === 0) {
      f.freeMove = null;
      return;
    }
    f.freeMove = move;
    f.feed(NEUTRAL_INPUT);
    f.tick({ opponent: f, awayX: 0, awayZ: -1 });
    if (move) {
      const d = Math.hypot(move.x, move.z) || 1;
      this.face(move.x / d, move.z / d);
    }
    w.collideIndoor(f, this.where === 1 ? 'lobby' : 'corridor');
  }

  /**
   * 책상 일: 커피 마시기 · 컴퓨터 작업 · 휴대폰 보기를 번갈아 한다.
   * 플레이어가 반장실에 들어오면 고개를 들어 한 번 보고(가끔 한마디), 다시 하던 일로 돌아간다. 대화 중엔 계속 본다
   */
  private stepDesk(chatting: boolean) {
    const w = this.w;
    const o = LOBBY.office;
    const p = w.player;
    const inOffice = w.location === 'lobby' && p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1;
    const seated = this.seated;
    if (inOffice && !this.playerInOffice && seated && this.visibleTo()) {
      this.glanceUntil = this.frame + GLANCE_FRAMES;
      if (this.rng() < 0.6) this.say(LINES.hello);
    }
    this.playerInOffice = inOffice;
    const looking = seated && (chatting || this.frame < this.glanceUntil);
    this.glance += ((looking ? 1 : 0) - this.glance) * 0.08;
    if (!seated) {
      this.glance = 0;
      return;
    }
    // 쳐다보는 동안은 하던 일을 멈춘다
    if (this.glance < 0.3) this.activityTime += 1 / 60;
    if (this.frame >= this.nextActivityAt && !looking) {
      const others = ACTIVITIES.filter((a) => a !== this.activity);
      this.activity = others[Math.floor(this.rng() * others.length)];
      this.activityTime = 0;
      this.nextActivityAt = this.frame + ACTIVITY_GAP[0] + Math.floor(this.rng() * (ACTIVITY_GAP[1] - ACTIVITY_GAP[0]));
    }
  }

  private face(x: number, z: number) {
    const d = Math.hypot(x, z);
    if (d < 1e-6) return;
    this.f.fx = x / d;
    this.f.fz = z / d;
  }

  private next() {
    this.plan.shift();
    this.stepAt = this.frame + 1;
  }

  /** 플레이어가 반장님을 뚫고 지나가지 못하게 밀어낸다 */
  pushPlayer(p: Fighter) {
    if (!this.visibleTo()) return;
    const f = this.f;
    const r = FIGHTER_RADIUS * 1.6;
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    const d = Math.hypot(dx, dz);
    if (d >= r) return;
    if (d < 1e-6) {
      p.z += r;
      return;
    }
    p.x = f.x + (dx / d) * r;
    p.z = f.z + (dz / d) * r;
  }
}
