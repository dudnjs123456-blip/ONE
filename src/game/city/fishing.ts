import {
  BAIT_BY_ID,
  FIGHT,
  TIER_INFO,
  biteTable,
  biteWait,
  fishStrength,
  gainPerTap,
  powerRatio,
  pullOf,
  relaxOf,
  rollKg,
  setupLuck,
  surgeGap,
  surgeLen,
  tensionPerTap,
  type Angler,
  type FishDef,
  type FishSetup,
  type RodDef,
} from '../data/fishing';

/**
 * 낚시 한 자리 (데크 끝에 서서): 스페이스 하나로 던지기 · 챔질 · 힘겨루기를 한다.
 *
 *  ready → (Space) cast → wait (찌가 둥둥, 가끔 톡톡 = 예신) → bite (찌가 쑥! 이때 Space = 챔질)
 *        → fight (Space 연타로 감기 · 장력 100 이면 줄이 끊어지고, 거리 0 이면 빠져 나간다) → result → ready
 *  wait 중에 Space = 회수 (미끼는 그대로), 예신 때 Space = 헛챔질 (고기가 놀라 달아난다), bite 를 놓치면 미끼만 뜯긴다
 *
 * 화면(렌더러 · HUD)은 이 객체의 값을 읽기만 한다. 60fps 고정 스텝.
 */

export type FishPhase = 'ready' | 'cast' | 'wait' | 'bite' | 'fight' | 'reel' | 'result';

export interface FishResult {
  kind: 'caught' | 'escaped' | 'snapped' | 'missed';
  fish: FishDef;
  kg: number;
  /** 처음 잡은 종류 */
  isNew?: boolean;
  /** 최대 크기 경신 */
  record?: boolean;
  price?: number;
  exp?: number;
  /** 살림망이 가득 차서 놓아줬다 */
  released?: boolean;
}

export interface FishingEnv {
  setup(): FishSetup | null;
  angler(): Angler;
  /** 미끼가 있나 (없으면 못 던진다) — 이유 문자열 */
  canCast(): string | null;
  onCast(): void;
  /** 고기가 미끼를 물고 갔다 (미끼 하나 쓴다) */
  onBaitTaken(): void;
  /** 루어를 잃었다 (줄이 끊어짐) */
  onLureLost(): void;
  onResult(r: FishResult): FishResult;
  say(text: string, sec?: number): void;
  rnd(): number;
}

const SEC = 60;

/** 낚시 장면을 그리는 데 필요한 것만 (내 낚시 · 친구 낚시 모두 이 모양으로 그린다) */
export interface FishLook {
  phase: FishPhase;
  t: number;
  nibble: number;
  surge: number;
  tension: number;
  tapFlash: boolean;
  swim: number;
  lineOut: number;
  fish: FishDef | null;
  kg: number;
}
export interface FishScene {
  f: FishLook;
  spot: { x: number; z: number };
  rod: RodDef;
}

export class FishingSession {
  phase: FishPhase = 'ready';
  /** 이 단계에 들어온 프레임 수 */
  t = 0;
  /** 기다리는 중: 입질까지 남은 프레임 */
  private waitLeft = 0;
  /** 예신 (찌가 톡톡): 남은 프레임 시점들 */
  private nibbles: number[] = [];
  /** 지금 톡톡 거리는 중 (0~1, 렌더러용) */
  nibble = 0;
  /** 입질 창 길이 (프레임) */
  biteWindow = 0;
  /** 걸린 (또는 올) 물고기 */
  fish: FishDef | null = null;
  kg = 0;
  str = 0;
  /** 힘겨루기: 끌어온 거리 0~100 · 장력 0~100 · 물고기 체력 1~0 */
  progress: number = FIGHT.start;
  tension = 0;
  stamina = 1;
  /** 차고 나가는 중 (남은 프레임) · 다음까지 */
  surge = 0;
  private nextSurge = 0;
  /** 물고기가 좌우로 도는 위치 (-1~1, 렌더러용) */
  swim = 0;
  private swimV = 0;
  /** 최근 감기 (HUD 깜빡임) */
  lastTap = -999;
  taps = 0;
  /** 마지막 결과 (result 단계 동안 HUD 카드) */
  result: FishResult | null = null;
  /** 이번에 던진 미끼 (회수할 때 표시용) */
  baitIcon = '';
  /** 힘겨루기 시간 (프레임) */
  fightFrames = 0;

  constructor(private env: FishingEnv) {}

  /** 지금 무엇을 하면 되는지 (HUD 안내) */
  get hint(): string {
    switch (this.phase) {
      case 'ready':
        return 'Space 던지기 · E / 방향키 그만하기 · F 낚시 도감';
      case 'cast':
        return '휙—';
      case 'wait':
        return this.nibble > 0 ? '찌가 톡톡… 아직이다! 참아요' : '찌를 지켜보는 중… 쑥 들어가면 Space! (지금 Space = 회수)';
      case 'bite':
        return '지금! Space 로 챔질!';
      case 'fight':
        return this.surge > 0 ? '물고기가 차고 나간다! 잠깐 멈춰요 (장력 주의)' : 'Space 연타로 감기! 장력이 빨개지면 쉬어요';
      case 'reel':
        return '줄을 감아 들이는 중…';
      case 'result':
        return 'Space 계속';
    }
  }

  private go(p: FishPhase) {
    this.phase = p;
    this.t = 0;
  }

  /** 한 프레임. tap = 이번 프레임에 Space 를 눌렀다 */
  step(tap: boolean) {
    this.t++;
    switch (this.phase) {
      case 'ready':
        if (tap) this.cast();
        break;
      case 'cast':
        if (this.t >= 0.9 * SEC) this.go('wait');
        break;
      case 'wait':
        this.stepWait(tap);
        break;
      case 'bite':
        if (tap) this.hook();
        else if (this.t >= this.biteWindow) {
          this.env.onBaitTaken();
          this.finish({ kind: 'missed', fish: this.fish!, kg: this.kg });
          this.env.say('🫥 늦었다… 미끼만 뜯기고 고기는 가 버렸다', 2.5);
          this.go('reel');
        }
        break;
      case 'fight':
        this.stepFight(tap);
        break;
      case 'reel':
        if (this.t >= 0.6 * SEC) this.go('ready');
        break;
      case 'result':
        if ((tap && this.t > 0.5 * SEC) || this.t >= 4 * SEC) {
          this.result = null;
          this.fish = null;
          this.go('ready');
        }
        break;
    }
  }

  private cast() {
    const why = this.env.canCast();
    if (why) {
      this.env.say(why, 2.5);
      return;
    }
    const s = this.env.setup()!;
    this.env.onCast();
    this.baitIcon = s.bait.icon;
    // 어떤 고기가 올지는 던질 때 정해진다 (확률표 그대로)
    const table = biteTable(s);
    let r = this.env.rnd();
    let pick = table[table.length - 1].fish;
    for (const o of table) {
      r -= o.p;
      if (r <= 0) {
        pick = o.fish;
        break;
      }
    }
    this.fish = pick;
    this.kg = rollKg(pick, setupLuck(s), () => this.env.rnd());
    this.str = fishStrength(pick, this.kg);
    const w = biteWait(s);
    // 기다리는 시간: 최소 + 지수분포 (가끔 오래 걸린다), 너무 길면 자른다
    const sec = Math.min(40, w.min - w.mean * Math.log(1 - this.env.rnd() * 0.98));
    this.waitLeft = Math.round(sec * SEC);
    // 예신 0~3번 (큰 고기일수록 조심스럽게 여러 번 건드린다)
    const n = Math.min(3, Math.floor(this.env.rnd() * (2 + TIER_INFO[pick.tier].stars * 0.4)));
    this.nibbles = [];
    for (let k = 0; k < n; k++) {
      const at = Math.round(0.6 * SEC + this.env.rnd() * Math.max(0, this.waitLeft - 1.2 * SEC));
      if (at < this.waitLeft - 0.5 * SEC) this.nibbles.push(at);
    }
    this.nibbles.sort((a, b) => b - a);
    this.nibble = 0;
    this.result = null;
    this.go('cast');
  }

  private stepWait(tap: boolean) {
    this.waitLeft--;
    // 예신: 남은 시간이 그 시점에 오면 0.45초 동안 톡톡
    if (this.nibbles.length && this.waitLeft <= this.nibbles[this.nibbles.length - 1]) {
      this.nibbles.pop();
      this.nibble = 1;
    }
    if (this.nibble > 0) this.nibble = Math.max(0, this.nibble - 1 / (0.45 * SEC));
    if (tap) {
      if (this.nibble > 0) this.env.say('💦 헛챔질! 고기가 놀라 달아났다 (찌가 쑥 들어갈 때 눌러요)', 2.5);
      else this.env.say(`${this.baitIcon} 낚싯줄을 감아 들였다 (미끼는 그대로)`, 1.8);
      this.fish = null;
      this.go('reel');
      return;
    }
    if (this.waitLeft <= 0) {
      const f = this.fish!;
      this.biteWindow = Math.round(SEC * TIER_INFO[f.tier].hook);
      this.go('bite');
    }
  }

  private hook() {
    const s = this.env.setup();
    if (!s || !this.fish) {
      this.go('reel');
      return;
    }
    this.env.onBaitTaken();
    this.progress = FIGHT.start;
    this.tension = 18;
    this.stamina = 1;
    this.surge = 0;
    this.nextSurge = Math.round((0.8 + this.env.rnd() * 1.5) * SEC);
    this.swim = 0;
    this.swimV = 0;
    this.taps = 0;
    this.fightFrames = 0;
    this.env.say(this.fish.tier === 'legend' ? '⚠️ 낚싯대가 활처럼 휜다…! 엄청난 놈이다!' : this.fish.tier === 'epic' || this.fish.tier === 'rare' ? '🎣 걸었다! 묵직하다…!' : '🎣 걸었다!', 2);
    this.go('fight');
  }

  private stepFight(tap: boolean) {
    const s = this.env.setup();
    const a = this.env.angler();
    if (!s || !this.fish) {
      this.go('reel');
      return;
    }
    const dt = 1 / SEC;
    this.fightFrames++;
    const rod = s.rod;
    const str = this.str;
    // 차고 나가기: 지친 고기는 덜 한다
    if (this.surge > 0) this.surge--;
    else if (--this.nextSurge <= 0 && this.stamina > 0.15) {
      this.surge = Math.round(surgeLen(str, this.env.rnd()) * SEC);
      this.nextSurge = Math.round(surgeGap(str, this.env.rnd()) * SEC) + this.surge;
      this.swimV += (this.env.rnd() < 0.5 ? -1 : 1) * 0.05;
    }
    const surging = this.surge > 0;
    // 바늘털이: 너무 오래 끌면 (25초 넘게) 고기가 몸을 털어 바늘이 빠질 수 있다 — 초마다 점점 높아진다
    const sec = this.fightFrames / SEC;
    if (sec > FIGHT.shakeAfter && this.fightFrames % SEC === 0 && this.env.rnd() < FIGHT.shake * (sec - FIGHT.shakeAfter)) {
      this.env.say('🌀 바늘털이! 너무 오래 끌었다… 고기가 몸을 털고 도망갔다', 3);
      this.finish({ kind: 'escaped', fish: this.fish, kg: this.kg });
      this.go('reel');
      return;
    }
    if (tap) {
      this.taps++;
      this.lastTap = this.fightFrames;
      this.progress += gainPerTap(powerRatio(a, rod, str));
      this.tension += tensionPerTap(rod, str) * (surging ? FIGHT.surgeTap : 1);
    }
    this.tension -= relaxOf(a) * dt;
    if (surging) this.tension += ((FIGHT.surgeTension * Math.sqrt(str)) / rod.line) * dt;
    this.tension = Math.max(0, this.tension);
    const tired = FIGHT.tired + (1 - FIGHT.tired) * this.stamina;
    this.progress -= pullOf(str) * tired * (surging ? FIGHT.surge : 1) * dt;
    this.stamina = Math.max(0, this.stamina - dt / (10 + 4 * Math.pow(str, 0.7)));
    // 좌우로 도는 물고기 (차고 나갈 때 크게)
    this.swimV += (-this.swim * 0.002 + (this.env.rnd() - 0.5) * 0.004) * (surging ? 3 : 1);
    this.swimV *= 0.97;
    this.swim = Math.max(-1, Math.min(1, this.swim + this.swimV));

    if (this.tension >= 100) {
      this.tension = 100;
      if (s.bait.reusable) this.env.onLureLost();
      this.env.say(`💥 팅! 줄이 끊어졌다…${s.bait.reusable ? ` (${s.bait.name}도 잃었다)` : ''}`, 3);
      this.finish({ kind: 'snapped', fish: this.fish, kg: this.kg });
      this.go('reel');
    } else if (this.progress <= 0) {
      this.progress = 0;
      this.env.say('🌊 바늘이 빠졌다… 고기가 도망갔다', 3);
      this.finish({ kind: 'escaped', fish: this.fish, kg: this.kg });
      this.go('reel');
    } else if (this.progress >= 100) {
      this.progress = 100;
      this.result = this.finish({ kind: 'caught', fish: this.fish, kg: this.kg });
      this.go('result');
    }
  }

  private finish(r: FishResult): FishResult {
    const out = this.env.onResult(r);
    if (r.kind !== 'caught') this.fish = null;
    return out;
  }

  /** 낚싯대를 거두고 끝낼 수 있나 (힘겨루기 · 결과 보는 중엔 못 끝낸다) */
  get canQuit() {
    return this.phase !== 'fight';
  }

  /** 렌더러용: 찌까지 거리 비율 (1 = 던진 거리, 0 = 발밑) */
  get lineOut(): number {
    switch (this.phase) {
      case 'cast':
        return Math.max(0, (this.t - 0.35 * SEC) / (0.55 * SEC));
      case 'wait':
      case 'bite':
        return 1;
      case 'fight':
        return Math.max(0.08, 1 - this.progress / 100);
      case 'reel':
        return Math.max(0, 1 - this.t / (0.6 * SEC));
      default:
        return 0;
    }
  }

  /** HUD 용 요약 */
  get view() {
    return {
      phase: this.phase,
      hint: this.hint,
      progress: this.progress,
      tension: this.tension,
      stamina: this.stamina,
      surge: this.surge > 0,
      tapFlash: this.fightFrames - this.lastTap < 5,
      biteLeft: this.phase === 'bite' ? 1 - this.t / Math.max(1, this.biteWindow) : 0,
      nibble: this.nibble,
      result: this.result,
      /** 힘겨루기 중 물고기 정체는 모른다: 힘만 느낌으로 */
      feel: this.phase === 'fight' ? feelOf(this.str) : null,
      bait: BAIT_BY_ID[(this.env.setup()?.bait.id ?? 'worm')].icon,
    };
  }
}

/** 손에 느껴지는 무게 */
export function feelOf(str: number): string {
  return str < 0.5 ? '가볍다' : str < 1 ? '제법 당긴다' : str < 1.8 ? '묵직하다!' : str < 3 ? '엄청 무겁다!!' : str < 5 ? '끌려갈 것 같다!!!' : '괴물이다…!!!!';
}
