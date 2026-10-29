import { Fighter } from '../core/fighter';
import { saveProfile } from '../core/profile';
import { applyHit, detectHit } from '../core/combat';
import { NEUTRAL_INPUT } from '../core/input';
import { GUARD_GIFTS, JOB_BY_ID, ROBBER_TIERS, robberStats, type RobberTier } from '../data/jobs';
import { MOVES } from '../data/moves';
import { CORRIDOR, LOBBY, type CityWorld } from './cityWorld';
import type { WorkEntry } from './calendar';

/**
 * 아파트 경비 근무 (실제 20분 = 게임 8시간).
 * 행복빌라 1층 로비의 경비 데스크에 앉아, 현관 ↔ 엘리베이터를 오가는 사람을 확인(E)한다.
 * 대부분은 인사하고 지나가고, 가끔 먹을 걸 챙겨주고, 낮은 확률로 강도가 들어와 싸우게 된다.
 */
const JOB = JOB_BY_ID.aptGuard;
export const GUARD_SHIFT_FRAMES = JOB.shiftMinutes * 60 * 60;
/** 근무 중엔 시계가 느리게 간다: 실제 20분 = 게임 8시간 */
export const GUARD_MINUTES_PER_FRAME = (JOB.gameHours * 60) / GUARD_SHIFT_FRAMES;
/** 다음 사람이 오기까지 (프레임) */
const VISIT_GAP: [number, number] = [14 * 60, 30 * 60];
const ROBBER_CHANCE = 0.06;
const GIFT_CHANCE = 0.08;
const CHECK_PAY = 2;
const FINISH_BONUS = 30;
/** 데스크 앞에서 확인을 기다려 주는 시간 */
const WAIT_FRAMES = 8 * 60;
const CHECK_RANGE = 2.8;
/** 로비를 ABANDON_FRAMES 넘게 비우면 무단 이탈 */
const ABANDON_FRAMES = 20 * 60;
const MAX_PEOPLE = 6;
/** 순찰: 근무 시작 1분 뒤 첫 순찰, 이후 5분마다. 다음 순찰 전까지 모든 층을 돌면 수당 */
const PATROL_FIRST = 60 * 60;
const PATROL_EVERY = 5 * 60 * 60;
const PATROL_PAY = 20;
/** 자동 체크: 데스크 앞에 멈춘 뒤 이만큼 지나면 알아서 확인 */
const AUTO_CHECK_DELAY = 45;
/** 강도 수색: 경비가 데스크에 없을 때 들어온 강도는 아무 층에나 숨는다. 이 안에 찾아서 퇴치 */
const HUNT_FRAMES = 90 * 60;
const HUNT_FAIL_PENALTY = 30;
/** 빨리 퇴치하면 (남은 시간이 절반 이상) 추가 수당 */
const HUNT_FAST_BONUS = 15;
/** 강도와 마주친 주민: 이 확률로 같이 싸워 주고, 나머지는 도망친다 */
const HELP_CHANCE = 0.3;
const HELPER_MOVES = [MOVES.jab, MOVES.oneTwo, MOVES.lowKick];
const SCARED = ['꺄악! 강도다!', '사람 살려요!', '경비 아저씨 조심하세요!', '도망쳐!'];
const BRAVE = ['내가 도와줄게요!', '같이 잡아요!', '이 나쁜 놈!', '어디서 행패야!'];
const RELIEF = ['휴… 다행이다', '수고하셨어요!', '경비 아저씨 최고!', '이제 안심이네요'];
const GREET = ['안녕하세요~', '수고하십니다!', '오늘도 고생 많으세요', '다녀왔습니다~', '좋은 하루 보내세요', '추운데 고생이 많으시네요'];
const NAMES = ['김민수', '이지은', '박서준', '최유나', '정하늘', '강도윤', '윤서연', '장민호', '임수빈', '한지우', '오세린', '서태윤'];
const FLOORS = ['201호', '202호', '301호', '303호', '401호', '402호', '501호'];

/** 로비 동선 (LOBBY 좌표) */
export const LOBBY_PATH = {
  door: { x: 0.5, z: 3.3 },
  /** 데스크 앞: 여기서 멈춰 확인을 기다린다 */
  check: { x: -2.0, z: 0.3 },
  elevator: { x: 2.0, z: -3.2 },
  stairs: { x: 3.3, z: -0.6 },
};

type Phase = 'toCheck' | 'wait' | 'leave';
export type ShiftEnd = 'done' | 'quit' | 'down' | 'abandon' | 'fired';

/** 로비를 지나는 사람 (주민 또는 강도) */
export interface LobbyPerson {
  f: Fighter;
  /** 있는 곳: 1 = 로비, 2 이상 = 그 층 복도 */
  where: number;
  /** 숨어 있는 강도가 어슬렁거리는 다음 지점 */
  roam?: { x: number; z: number; until: number };
  /** 강도를 본 주민의 반응: 같이 싸우기 / 도망치기 */
  reaction?: 'help' | 'flee';
  /** 렌더러 모델 자리 (0 ~ MAX_PEOPLE-1) */
  slot: number;
  kind: 'visitor' | 'robber';
  title: string;
  phase: Phase;
  waitFrames: number;
  exit: { x: number; z: number };
  gift: boolean;
  tier?: RobberTier;
  atkCd: number;
  /** 쓰러진 뒤 지난 프레임 (-1 = 멀쩡) */
  koFrames: number;
  /** 머리 위 이름표를 이 프레임까지 보인다 */
  showUntil: number;
}

export class GuardShift {
  readonly job = JOB;
  readonly minutesPerFrame = GUARD_MINUTES_PER_FRAME;
  frames = 0;
  checked = 0;
  missed = 0;
  gifts = 0;
  robbersBeaten = 0;
  bonus = 0;
  awayFrames = 0;
  people: LobbyPerson[] = [];
  /** 지금 순찰: 층 → 남은 점검 지점 id (null = 순찰 시간 아님) */
  patrol: Map<number, Set<string>> | null = null;
  patrolsDone = 0;
  /** 자동 체크: 경비가 로비에 있으면 오는 사람을 알아서 확인한다 (강도가 들어오면 멈추고 전투) */
  autoCheck = false;
  /** 자동 순찰: 순찰 시간이 되면 알아서 층을 돌고 데스크로 돌아온다 (강도가 들면 멈추고 수색) */
  autoPatrol = false;
  /** 강도 수색 퀘스트 (경비가 데스크를 비운 사이 들어온 강도가 어느 층엔가 숨어 있다) */
  hunt: { robber: LobbyPerson; until: number; found: boolean } | null = null;
  huntsWon = 0;
  huntsFailed = 0;
  patrolsMissed = 0;
  private nextPatrolAt = PATROL_FIRST;
  private robberWas = false;
  /** 근무를 시작한 날·시각 (달력 기록용) */
  readonly startDay: number;
  readonly startMinutes: number;
  private nextVisitAt = 4 * 60;
  private nextId = 900;

  constructor(private world: CityWorld) {
    this.startDay = world.day;
    this.startMinutes = world.minutes;
  }

  /** 이 층의 이 지점을 지금 순찰에서 점검해야 하나 */
  patrolNeeds(floor: number, id: string) {
    return !!this.patrol?.get(floor)?.has(id);
  }

  /** 순찰 진행 상황 (층별 남은 개수) */
  get patrolLeft(): { floor: number; left: number }[] {
    return this.patrol ? [...this.patrol].map(([floor, s]) => ({ floor, left: s.size })) : [];
  }

  /** 순찰 시작: 2층 ~ 꼭대기 층 모든 점검 지점 */
  startPatrol() {
    const w = this.world;
    if (this.patrol) {
      // 지난 순찰을 다 못 돌았다
      this.patrolsMissed++;
      w.say('⚠️ 지난 순찰을 다 돌지 못했다…', 3);
    }
    this.patrol = new Map();
    for (let f = 2; f <= w.villaFloors; f++) this.patrol.set(f, new Set(CORRIDOR.checkpoints.map((c) => c.id)));
    w.say(`🔦 순찰 시간! 엘리베이터로 2~${w.villaFloors}층을 돌며 점검 지점에서 E (완료 시 +${PATROL_PAY}G)`, 4.5);
  }

  /** 점검 지점 E. @returns 이번 순찰에서 처리했으면 true */
  patrolCheck(floor: number, id: string): boolean {
    const w = this.world;
    const left = this.patrol?.get(floor);
    if (!left?.has(id)) return false;
    left.delete(id);
    const cp = CORRIDOR.checkpoints.find((c) => c.id === id)!;
    const remain = [...this.patrol!.values()].reduce((n, s) => n + s.size, 0);
    if (remain === 0) {
      this.patrol = null;
      this.patrolsDone++;
      this.bonus += PATROL_PAY;
      w.say(`✅ 순찰 완료! 모든 층 이상 없음 (+${PATROL_PAY}G) — 로비로 돌아가자`, 4);
    } else {
      w.say(`${cp.icon} ${floor}층 ${cp.label} 완료 · ${left.size ? `이 층 ${left.size}곳 남음` : '이 층 끝! 다른 층으로'} (전체 ${remain}곳)`, 3);
    }
    return true;
  }

  get robber(): LobbyPerson | null {
    return this.people.find((p) => p.kind === 'robber' && p.koFrames < 0) ?? null;
  }

  /** 이 곳에서 날뛰는 강도 */
  private robberAt(where: number): LobbyPerson | null {
    return this.people.find((p) => p.kind === 'robber' && p.koFrames < 0 && p.where === where) ?? null;
  }

  get remainingFrames() {
    return Math.max(0, GUARD_SHIFT_FRAMES - this.frames);
  }

  /** 지금까지 쌓인 기본급 (일한 시간만큼) */
  get earnedBase() {
    return Math.floor((JOB.basePay * Math.min(this.frames, GUARD_SHIFT_FRAMES)) / GUARD_SHIFT_FRAMES);
  }

  /** 확인을 기다리거나 다가오는 사람 중 가장 가까운 사람 */
  private checkable(): LobbyPerson | null {
    const w = this.world;
    if (w.location !== 'lobby') return null;
    const p = w.player;
    let best: LobbyPerson | null = null;
    let bestD = CHECK_RANGE;
    for (const v of this.people) {
      if (v.kind !== 'visitor' || (v.phase !== 'wait' && v.phase !== 'toCheck')) continue;
      const d = Math.hypot(v.f.x - p.x, v.f.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  get prompt(): string | null {
    const v = this.checkable();
    return v ? `출입 확인 — ${v.title}` : null;
  }

  /** HUD 한 줄 경고 */
  get alert(): string | null {
    const h = this.hunt;
    if (h && this.autoPatrol) {
      const sec = Math.max(0, Math.ceil((h.until - this.frames) / 60));
      return h.found
        ? `🚨 ${h.robber.title} 발견! 제압하면 자동 순찰을 이어서 한다 (남은 ${sec}초)`
        : `🚨 강도 수색 중 — 자동 순찰은 잠시 멈춤. 1~${this.world.villaFloors}층을 뒤져라 (남은 ${sec}초)`;
    }
    if (h) {
      const sec = Math.max(0, Math.ceil((h.until - this.frames) / 60));
      return h.found
        ? `🚨 ${h.robber.title} 발견! 제압하자 (남은 ${sec}초)`
        : `🚨 강도 수색 중! 어느 층인지 모른다 — 1~${this.world.villaFloors}층을 뒤져라 (남은 ${sec}초)`;
    }
    const r = this.robber;
    if (r?.tier) return `${r.tier.icon} ${r.tier.name} 침입! 일어나서 제압하자 (보상 ${r.tier.reward}G)`;
    if (this.awayFrames > 0) return `⚠️ 건물을 비웠다! ${Math.ceil((ABANDON_FRAMES - this.awayFrames) / 60)}초 안에 돌아가지 않으면 무단 이탈`;
    if (this.autoActive) {
      const waiting = this.people.filter((v) => v.kind === 'visitor' && v.phase === 'wait').length;
      if (!this.patrol) return waiting ? '🤖 자동 체크 중…' : null;
    }
    if (this.autoPatrol && !this.patrol && !this.world.autoPatrolAway) {
      const s = Math.ceil(this.nextPatrolIn / 60);
      return `🔦 자동 순찰 대기 — 다음 순찰까지 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    if (this.patrol) return `🔦 순찰 중 — ${this.patrolLeft.map((p) => `${p.floor}층 ${CORRIDOR.checkpoints.length - p.left}/${CORRIDOR.checkpoints.length}`).join(' · ')}`;
    const waiting = this.people.filter((v) => v.kind === 'visitor' && v.phase === 'wait').length;
    return waiting ? `🙋 데스크 앞에서 ${waiting}명이 확인을 기다린다 (E)` : null;
  }

  /** E: 기다리는 사람을 확인한다. @returns 처리했으면 true */
  tryInteract(): boolean {
    const v = this.checkable();
    if (!v) return false;
    this.checkVisitor(v);
    return true;
  }

  /** 자동 체크 켜기/끄기 */
  toggleAuto(): boolean {
    this.autoCheck = !this.autoCheck;
    this.world.say(this.autoCheck ? '🤖 자동 체크 ON — 데스크에 앉아 근무한다. 사람이 오면 알아서 확인 (강도가 오면 직접 싸우자)' : '자동 체크 OFF — 직접 E 로 확인', 3);
    return this.autoCheck;
  }

  /** 자동 체크가 지금 일하는 중인가 (로비에 있고 강도가 없을 때) */
  get autoActive() {
    return this.autoCheck && this.world.location === 'lobby' && !this.robber;
  }

  /** 자동 순찰 켜기/끄기 */
  toggleAutoPatrol(): boolean {
    const w = this.world;
    this.autoPatrol = !this.autoPatrol;
    if (!this.autoPatrol) {
      w.say('자동 순찰 OFF', 2.5);
      return false;
    }
    // 켜는 순간 순찰이 없으면 바로 한 바퀴 돈다 (다음 정기 순찰은 그만큼 뒤로)
    if (!this.patrol && !this.hunt && !this.robber) {
      this.startPatrol();
      this.nextPatrolAt = this.frames + PATROL_EVERY;
    }
    w.say(
      this.hunt || this.robber
        ? '🔦 자동 순찰 ON — 강도부터 처리하면 이어서 돈다'
        : '🔦 자동 순찰 ON — 지금 바로 순찰을 돈다 (방향키로 잠깐 직접 조작해도 손을 떼면 다시 이어서)',
      3.5,
    );
    return true;
  }

  /** 다음 정기 순찰까지 남은 프레임 */
  get nextPatrolIn() {
    return Math.max(0, this.nextPatrolAt - this.frames);
  }

  /** 경비가 지금 있는 곳 (1 = 로비, 2+ = 복도 층, 0 = 건물 밖·집) */
  get guardPlace(): number {
    const w = this.world;
    return w.location === 'lobby' ? 1 : w.location === 'corridor' ? w.floor : 0;
  }

  private checkVisitor(v: LobbyPerson) {
    const w = this.world;
    this.checked++;
    this.bonus += CHECK_PAY;
    v.phase = 'leave';
    if (v.gift) {
      const g = GUARD_GIFTS[Math.floor(w.random() * GUARD_GIFTS.length)];
      const life = w.profile.life;
      life.hunger = Math.max(0, life.hunger - g.hunger);
      life.fatigue = Math.max(0, life.fatigue - g.fatigue);
      this.gifts++;
      w.pushSpeech({ x: v.f.x, z: v.f.z, text: g.line, color: '#ffe08a' });
      const eff = [g.hunger ? `배고픔 -${g.hunger}` : '', g.fatigue ? `피로도 -${g.fatigue}` : ''].filter(Boolean).join(', ');
      w.say(`${g.icon} ${v.title}이(가) ${g.name}을(를) 주셨다 (${eff})`, 3.5);
    } else {
      w.pushSpeech({ x: v.f.x, z: v.f.z, text: GREET[Math.floor(w.random() * GREET.length)] });
    }
  }

  /** 근무 한 프레임. @returns 근무가 끝났으면 끝난 이유 */
  step(frozen: boolean): ShiftEnd | null {
    const w = this.world;
    this.frames++;

    // 로비를 비움 → 무단 이탈
    if (w.location !== 'lobby' && w.location !== 'corridor') {
      if (this.awayFrames === 0) w.say('⚠️ 근무 중에 건물을 비우면 안 된다! (20초 안에 돌아가자)', 3);
      this.awayFrames++;
      if (this.awayFrames >= ABANDON_FRAMES) return 'abandon';
    } else this.awayFrames = 0;

    // 순찰 시간
    if (this.frames >= this.nextPatrolAt) {
      this.startPatrol();
      this.nextPatrolAt = this.frames + PATROL_EVERY;
    }

    // 사람이 온다 (가끔은 강도 — 경비가 데스크에 없으면 아무 층에나 숨는다)
    if (this.frames >= this.nextVisitAt) {
      if (!this.robber && !this.hunt && w.random() < ROBBER_CHANCE) this.spawnRobber();
      else this.spawnVisitor();
      this.nextVisitAt = this.frames + VISIT_GAP[0] + Math.floor(w.random() * (VISIT_GAP[1] - VISIT_GAP[0]));
    }

    // 강도 수색: 시간이 다 되면 강도가 집을 털고 달아난다
    const hunt = this.hunt;
    if (hunt && this.frames >= hunt.until && hunt.robber.koFrames < 0) {
      const r = hunt.robber;
      const floor = r.where === 1 ? 2 : r.where;
      this.remove(r);
      this.hunt = null;
      this.huntsFailed++;
      const lost = Math.min(this.bonus, HUNT_FAIL_PENALTY);
      this.bonus -= lost;
      w.say(`💨 ${r.tier!.name}이(가) ${floor}0${1 + Math.floor(w.random() * 3)}호를 털고 달아났다… (수당 -${lost}G)`, 5);
    }

    if (!frozen) for (const v of [...this.people]) this.stepPerson(v);
    // 자동 체크: 데스크 앞에 멈춘 사람을 잠깐 뒤 알아서 확인
    if (this.autoActive) {
      for (const v of this.people) if (v.kind === 'visitor' && v.phase === 'wait' && v.waitFrames >= AUTO_CHECK_DELAY) this.checkVisitor(v);
    }
    // 강도를 처리하고 나면 자동 체크 재개 알림
    if (this.autoCheck && this.robberWas && !this.robber) w.say('🤖 강도 처리 완료 — 자동 체크 다시 시작', 3);
    this.robberWas = !!this.robber;
    if (this.guardPlace > 0 && !frozen) this.playerHits();
    if (!frozen) this.helperHits();

    if (this.frames >= GUARD_SHIFT_FRAMES) return 'done';
    return null;
  }

  /** 근무 끝: 급여 정산 + 달력 기록 */
  finish(reason: ShiftEnd): string {
    const w = this.world;
    const base = reason === 'done' ? JOB.basePay : reason === 'quit' ? this.earnedBase : reason === 'fired' ? 0 : Math.floor(this.earnedBase / 2);
    const bonus = reason === 'fired' ? 0 : this.bonus;
    const finish = reason === 'done' ? FINISH_BONUS : 0;
    const pay = base + bonus + finish;
    const pr = w.profile;
    pr.gold += pay;
    pr.jobs ??= {};
    const rec = (pr.jobs[JOB.id] ??= { shifts: 0, earned: 0 });
    if (reason === 'done') rec.shifts++;
    rec.earned += pay;
    const entry: WorkEntry = {
      job: JOB.id, name: JOB.name, icon: JOB.icon, pay, result: reason, checked: this.checked, robbers: this.robbersBeaten, patrols: this.patrolsDone,
      from: Math.round(this.startMinutes), to: Math.round(w.minutes),
    };
    pr.workLog ??= {};
    (pr.workLog[String(this.startDay)] ??= []).push(entry);
    saveProfile(pr);
    this.people = [];
    const head: Record<ShiftEnd, string> = {
      done: '🧾 근무 끝! 수고하셨습니다',
      quit: '🧾 조기 퇴근',
      down: '🧾 강도에게 당해 근무 중단 (기본급 절반)',
      abandon: '🧾 무단 이탈로 근무 종료 (기본급 절반)',
      fired: '🧾 주민 폭행으로 해고… 급여 없음',
    };
    const parts = [`기본급 ${base}G`, `수당 ${bonus}G`];
    if (finish) parts.push(`개근 ${finish}G`);
    return `${head[reason]} — ${parts.join(' + ')} = ${pay}G (확인 ${this.checked}명, 순찰 ${this.patrolsDone}회${this.robbersBeaten ? `, 강도 ${this.robbersBeaten}명 제압` : ''}${this.huntsFailed ? `, 강도 놓침 ${this.huntsFailed}` : ''})`;
  }

  // ───────── 사람 ─────────

  private freeSlot(): number {
    for (let s = 0; s < MAX_PEOPLE; s++) if (!this.people.some((p) => p.slot === s)) return s;
    return -1;
  }

  spawnVisitor() {
    const w = this.world;
    const slot = this.freeSlot();
    if (slot < 0) return;
    const L = LOBBY_PATH;
    // 밖에서 들어오는 사람 → 엘리베이터·계단, 위층에서 내려온 사람 → 현관
    const goingIn = w.random() < 0.55;
    const upstairs = w.random() < 0.7 ? L.elevator : L.stairs;
    const from = goingIn ? L.door : upstairs;
    const exit = goingIn ? upstairs : L.door;
    const f = new Fighter(this.nextId++, 'npc', { runSpeed: 0.032 + w.random() * 0.01, maxHp: 60, canBlock: false });
    f.reset(from.x, from.z, 0, 1);
    const name = NAMES[Math.floor(w.random() * NAMES.length)];
    this.people.push({
      f, slot, where: 1, kind: 'visitor', title: `${FLOORS[Math.floor(w.random() * FLOORS.length)]} ${name}`, phase: 'toCheck', waitFrames: 0, exit,
      gift: w.random() < GIFT_CHANCE, atkCd: 0, koFrames: -1, showUntil: 0,
    });
  }

  /** 강도: 가중치로 난이도를 뽑고, 플레이어 레벨만큼 조금 더 세진다 */
  /**
   * @param hidden 경비가 데스크에 없을 때: 아무 층에나 숨어 들고 알람이 울린다 (수색 퀘스트).
   *               기본은 경비가 로비에 없거나 자동 순찰로 자리를 비웠을 때.
   */
  spawnRobber(tierId?: string, hidden = this.guardPlace !== 1 || this.world.autoPatrolAway) {
    const w = this.world;
    const slot = this.freeSlot();
    if (slot < 0 || this.hunt) return;
    let tier = ROBBER_TIERS.find((t) => t.id === tierId);
    if (!tier) {
      let roll = w.random() * ROBBER_TIERS.reduce((s, t) => s + t.weight, 0);
      tier = ROBBER_TIERS.find((t) => (roll -= t.weight) < 0) ?? ROBBER_TIERS[0];
    }
    const st = robberStats(tier, w.profile.level);
    const f = new Fighter(this.nextId++, 'npc', { runSpeed: tier.speed, maxHp: st.maxHp, power: st.power, canBlock: false });
    // 숨는 강도: 1층 로비 ~ 꼭대기 층 중 아무 데나
    const where = hidden ? 1 + Math.floor(w.random() * w.villaFloors) : 1;
    if (where === 1) f.reset(hidden ? 3.6 : LOBBY_PATH.door.x, hidden ? 1.6 : LOBBY_PATH.door.z, 0, -1);
    else f.reset(-1 + w.random() * 5, 0, -1, 0);
    const person: LobbyPerson = {
      f, slot, where, kind: 'robber', title: `${tier.icon} ${tier.name}`, phase: 'toCheck', waitFrames: 0, exit: LOBBY_PATH.door,
      gift: false, tier, atkCd: 50, koFrames: -1, showUntil: Number.MAX_SAFE_INTEGER,
    };
    this.people.push(person);
    if (hidden) {
      // 알람: 어느 층으로 갔는지 모른다 → 찾아서 퇴치
      this.hunt = { robber: person, until: this.frames + HUNT_FRAMES, found: where === this.guardPlace };
      w.say(`🚨 비상! ${tier.name} 침입 — 어느 층으로 갔는지 모른다. ${HUNT_FRAMES / 60}초 안에 찾아서 퇴치하라!`, 5);
      return;
    }
    w.pushSpeech({ x: f.x, z: f.z, text: tier.line, color: '#ff7a7a' });
    w.say(tier.warning ?? `🚨 ${tier.name}이(가) 로비에 들어왔다!`, 4);
    // 자동 체크 중이었으면 멈추고 바로 일어나 싸울 준비
    if (this.autoCheck) {
      w.standUp();
      w.say(`🚨 ${tier.name} 침입! 자동 체크를 멈추고 전투 — 직접 제압하자`, 4);
    }
  }

  private remove(v: LobbyPerson) {
    this.people = this.people.filter((p) => p !== v);
  }

  private stepPerson(v: LobbyPerson) {
    const w = this.world;
    const f = v.f;
    f.snapshot();
    let move: { x: number; z: number } | null = null;

    if (v.koFrames >= 0) {
      // 쓰러진 강도: 잠시 뒤 경찰이 데려간다
      if (++v.koFrames > 240) {
        this.remove(v);
        return;
      }
    } else if (v.kind === 'robber') {
      move = this.robberAI(v);
      if (!this.people.includes(v)) return;
    } else if (this.robberAt(v.where) || v.reaction) {
      move = this.reactToRobber(v);
      if (!this.people.includes(v)) return;
    } else {
      const target = v.phase === 'toCheck' ? LOBBY_PATH.check : v.phase === 'leave' ? v.exit : null;
      if (v.phase === 'wait') {
        v.showUntil = w.frame + 2;
        // 경비가 오래 확인을 안 하면 그냥 지나간다
        if (++v.waitFrames > WAIT_FRAMES) {
          this.missed++;
          v.phase = 'leave';
          w.pushSpeech({ x: f.x, z: f.z, text: '경비 아저씨 어디 가셨지…?', color: '#c8c8c8' });
        }
        const dx = w.player.x - f.x;
        const dz = w.player.z - f.z;
        const d = Math.hypot(dx, dz) || 1;
        f.fx = dx / d;
        f.fz = dz / d;
      }
      if (target) {
        const dx = target.x - f.x;
        const dz = target.z - f.z;
        if (Math.hypot(dx, dz) < 0.3) {
          if (v.phase === 'toCheck') v.phase = 'wait';
          else {
            this.remove(v);
            return;
          }
        } else move = { x: dx, z: dz };
      }
    }
    f.freeMove = move;
    f.feed(NEUTRAL_INPUT);
    f.tick({ opponent: f, awayX: 0, awayZ: -1 });
    w.collideIndoor(f, v.where === 1 ? 'lobby' : 'corridor');
  }

  /**
   * 강도와 마주친 주민: 처음 본 순간 같이 싸울지 도망칠지 정한다.
   * 돕는 사람은 강도에게 다가가 때리고, 도망치는 사람은 뛰어서 나간다. 강도가 사라지면 원래 하던 일로.
   */
  private reactToRobber(v: LobbyPerson): { x: number; z: number } | null {
    const w = this.world;
    const f = v.f;
    const r = this.robberAt(v.where);
    if (!r) {
      // 상황 끝: 돕던 사람은 한마디 하고 갈 길 간다
      if (v.reaction === 'help') w.pushSpeech({ x: f.x, z: f.z, text: RELIEF[Math.floor(w.random() * RELIEF.length)], color: '#bfe9ff' });
      v.reaction = undefined;
      v.phase = 'leave';
      f.runSpeed = 0.035;
      return null;
    }
    if (!v.reaction) {
      v.reaction = w.random() < HELP_CHANCE ? 'help' : 'flee';
      v.showUntil = w.frame + 60 * 60;
      const lines = v.reaction === 'help' ? BRAVE : SCARED;
      w.pushSpeech({ x: f.x, z: f.z, text: lines[Math.floor(w.random() * lines.length)], color: v.reaction === 'help' ? '#9de6a0' : '#ffd0d0' });
      if (v.reaction === 'help') f.power = 0.6;
      // 도망: 들어오던 사람은 현관으로, 내려오던 사람은 위층으로
      if (v.reaction === 'flee') v.exit = Math.hypot(f.x - LOBBY_PATH.door.x, f.z - LOBBY_PATH.door.z) < Math.hypot(f.x - v.exit.x, f.z - v.exit.z) ? LOBBY_PATH.door : v.exit;
    }
    if (v.reaction === 'flee') {
      f.runSpeed = 0.085;
      const dx = v.exit.x - f.x;
      const dz = v.exit.z - f.z;
      if (Math.hypot(dx, dz) < 0.4) {
        this.remove(v);
        return null;
      }
      return { x: dx, z: dz };
    }
    // 돕기: 강도에게 붙어서 때린다
    const busy = f.state === 'attack' || f.state === 'hitstun' || f.state === 'blockstun' || f.isInvulnerable() || f.state === 'launched';
    if (busy) return null;
    const dx = r.f.x - f.x;
    const dz = r.f.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    f.fx = dx / d;
    f.fz = dz / d;
    if (d > 1.1) {
      f.runSpeed = 0.06;
      const wp = v.where === 1 ? aroundDesk(f.x, f.z, r.f.x, r.f.z) : { x: r.f.x, z: r.f.z };
      return { x: wp.x - f.x, z: wp.z - f.z };
    }
    if (--v.atkCd <= 0) {
      f.queueMove(HELPER_MOVES[Math.floor(w.random() * HELPER_MOVES.length)]);
      v.atkCd = 55 + Math.floor(w.random() * 45);
    }
    return null;
  }

  /** 돕는 주민의 공격이 강도에게, 강도의 공격이 돕는 주민에게 맞았나 */
  private helperHits() {
    const w = this.world;
    for (const h of this.people) {
      if (h.kind !== 'visitor' || h.reaction !== 'help' || h.koFrames >= 0) continue;
      const r = this.robberAt(h.where);
      if (!r) continue;
      const hit = detectHit(h.f, r.f);
      if (hit) {
        const out = applyHit(hit);
        w.pushEvent(out.event);
        if (r.f.hp <= 0) this.robberDown(r, h);
      }
      const back = detectHit(r.f, h.f);
      if (back) {
        const out = applyHit(back);
        w.pushEvent(out.event);
        if (h.f.hp <= 0) {
          h.koFrames = 0;
          w.pushSpeech({ x: h.f.x, z: h.f.z, text: '으윽…', color: '#ffd0d0' });
        }
      }
    }
  }

  /** 강도 쓰러짐 (경비 또는 도와준 주민) */
  private robberDown(v: LobbyPerson, helper?: LobbyPerson) {
    const w = this.world;
    v.koFrames = 0;
    this.robbersBeaten++;
    this.bonus += v.tier!.reward;
    const by = helper ? ` — ${helper.title}의 도움!` : '';
    if (this.hunt?.robber === v) {
      const fast = this.hunt.until - this.frames > HUNT_FRAMES / 2;
      if (fast) this.bonus += HUNT_FAST_BONUS;
      this.hunt = null;
      this.huntsWon++;
      w.say(`🚔 수색 성공! ${v.tier!.name} 제압 (보상 +${v.tier!.reward}G${fast ? `, 빠른 퇴치 +${HUNT_FAST_BONUS}G` : ''})${by}`, 4.5);
    } else w.say(`🚔 ${v.tier!.name} 제압! 경찰에 넘겼다 (보상 +${v.tier!.reward}G)${by}`, 4);
  }

  /** 강도: 경비에게 다가가 기술을 쓴다. 경비가 로비를 떠나면 달아난다 */
  private robberAI(v: LobbyPerson): { x: number; z: number } | null {
    const w = this.world;
    const f = v.f;
    const t = v.tier!;
    const p = w.player;
    if (w.downedAt !== null) {
      w.say(`💨 ${t.name}이(가) 달아났다…`, 3);
      if (this.hunt?.robber === v) this.hunt = null;
      this.remove(v);
      return null;
    }
    if (v.where !== this.guardPlace) {
      // 경비가 없는 층: 집 문 앞을 어슬렁거린다 (숨은 강도) / 로비 강도는 경비가 떠나면 달아난다
      if (!this.hunt || this.hunt.robber !== v) {
        w.say(`💨 ${t.name}이(가) 달아났다…`, 3);
        this.remove(v);
        return null;
      }
      if (!v.roam || this.frames > v.roam.until || Math.hypot(v.roam.x - f.x, v.roam.z - f.z) < 0.3) {
        v.roam = v.where === 1 ? { x: -1 + w.random() * 5, z: -2 + w.random() * 4, until: this.frames + 180 } : { x: -3 + w.random() * 8, z: -0.6, until: this.frames + 180 };
      }
      f.runSpeed = 0.03;
      return { x: v.roam.x - f.x, z: v.roam.z - f.z };
    }
    if (this.hunt?.robber === v && !this.hunt.found) {
      this.hunt.found = true;
      w.say(`🔦 찾았다! ${v.where === 1 ? '1층 로비' : `${v.where}층 복도`}에 ${t.name}이(가) 있다!`, 3);
      w.pushSpeech({ x: f.x, z: f.z, text: '들켰다…! 덤벼!', color: '#ff7a7a' });
    }
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    const d = Math.hypot(dx, dz);
    const busy = f.state === 'attack' || f.state === 'hitstun' || f.state === 'blockstun' || f.isInvulnerable() || f.state === 'launched';
    let move: { x: number; z: number } | null = null;
    if (!busy) {
      if (d > 1.15) {
        f.runSpeed = t.speed;
        const wp = v.where === 1 ? aroundDesk(f.x, f.z, p.x, p.z) : { x: p.x, z: p.z };
        move = { x: wp.x - f.x, z: wp.z - f.z };
      } else if (--v.atkCd <= 0) {
        f.fx = dx / (d || 1);
        f.fz = dz / (d || 1);
        f.queueMove(t.moves[Math.floor(w.random() * t.moves.length)]);
        v.atkCd = t.cooldown[0] + Math.floor(w.random() * (t.cooldown[1] - t.cooldown[0]));
      } else if (d > 1e-6) {
        f.fx = dx / d;
        f.fz = dz / d;
      }
    }
    // 강도의 공격이 경비에게 맞았나
    if (p.hp > 0) {
      const h = detectHit(f, p);
      if (h) {
        const out = applyHit(h);
        w.pushEvent(out.event);
        w.hitstop = Math.max(w.hitstop, Math.min(out.hitstop, 4));
        w.lastCombatFrame = w.frame;
        w.standUp();
      }
    }
    return move;
  }

  /** 경비의 공격: 강도는 제압, 주민을 때리면 해고 */
  private playerHits() {
    const w = this.world;
    const p = w.player;
    for (const v of [...this.people]) {
      if (v.koFrames >= 0 || v.where !== this.guardPlace) continue;
      const h = detectHit(p, v.f);
      if (!h) continue;
      const out = applyHit(h);
      w.pushEvent(out.event);
      w.hitstop = Math.max(w.hitstop, Math.min(out.hitstop, 5));
      w.lastCombatFrame = w.frame;
      v.showUntil = Math.max(v.showUntil, w.frame + 240);
      if (v.kind === 'visitor' && v.reaction === 'help') {
        // 같이 싸우던 주민을 실수로 친 건 봐준다
        w.pushSpeech({ x: v.f.x, z: v.f.z, text: '아야! 저 말고요!', color: '#ffd0d0' });
        continue;
      }
      if (v.kind === 'visitor') {
        w.pushSpeech({ x: v.f.x, z: v.f.z, text: '아니 경비가 사람을 때려요?!', color: '#ff9d7a' });
        w.fireFromJob();
        return;
      }
      if (v.f.hp <= 0) this.robberDown(v);
    }
  }
}

/** 데스크 반대편에 있는 상대에게 갈 땐 데스크 끝을 돌아서 간다 */
function aroundDesk(x: number, z: number, tx: number, tz: number) {
  const d = LOBBY.furniture.find((f) => f.id === 'desk')!.rect;
  const m = 0.55;
  const behind = (a: number) => a < d.x0 + 0.1;
  if (behind(x) === behind(tx)) return { x: tx, z: tz };
  // 남쪽·북쪽 끝 중 가까운 쪽 모퉁이로
  const endZ = Math.abs(z - (d.z1 + m)) + Math.abs(tz - (d.z1 + m)) < Math.abs(z - (d.z0 - m)) + Math.abs(tz - (d.z0 - m)) ? d.z1 + m : d.z0 - m;
  const inZ = z > d.z0 - 0.2 && z < d.z1 + 0.2;
  // 아직 데스크 옆(남북 범위 안)이면 끝으로, 끝을 지났으면 데스크 뒤쪽으로 꺾는다
  if (inZ) return { x: behind(x) ? d.x0 - m : d.x1 + m, z: endZ };
  return { x: behind(tx) ? d.x0 - m : d.x1 + m, z: endZ };
}
