/**
 * 생활 수치 (피로도·배고픔): 도시·필드 사냥·보스 레이드가 같은 규칙을 쓴다.
 * 0~100, 높을수록 피곤하고 배고프다. 프로필(profile.life)에 저장된다.
 *
 * 기본 속도는 실제 시간 기준:
 *   피로도  — 실제 5시간이면 100 (5시간마다 한 번 자야 한다)
 *   배고픔  — 가만히 있으면 실제 6시간이면 100
 * 움직일수록(달리기·싸움·일) '활동량'이 쌓이고, 활동량이 높을수록 배고픔이 점점 빨리 오른다 (최대 4배).
 */
const FPS = 60;
const HOUR = 60 * 60 * FPS;

/** 실제 5시간에 피로도 100 */
export const FATIGUE_PER_FRAME = 100 / (5 * HOUR);
/** 실제 6시간에 배고픔 100 (아무것도 안 할 때) */
export const HUNGER_PER_FRAME = 100 / (6 * HOUR);
/** 공원 산책 등 쉬는 중: 30초에 피로도 1 회복 */
export const REST_RECOVER_PER_FRAME = 1 / (30 * FPS);
/** 기술 하나 쓸 때마다 추가 피로 */
export const ATTACK_FATIGUE = 0.15;
/** 배고픔 배율: 1 + ACTIVITY_HUNGER × 활동량(0~1) → 최대 4배 */
export const ACTIVITY_HUNGER = 3;
/** 활동량이 쌓이고 빠지는 속도 */
const ACTIVITY_RUN_PER_FRAME = 1 / (60 * FPS); // 1분 내내 달리면 +1
const ACTIVITY_PER_ATTACK = 0.03; // 기술 하나에 +0.03 (30번이면 +0.9)
const ACTIVITY_DECAY_PER_FRAME = 1 / (5 * 60 * FPS); // 쉬면 5분에 걸쳐 0으로
/** 일하는 중엔 활동량이 이 아래로 내려가지 않는다 */
export const WORK_ACTIVITY = 0.35;
export const TIRED = 80;
export const STARVING = 85;

export interface LifeStats {
  fatigue: number;
  hunger: number;
}

export interface LifeTick {
  /** 이동 속도 배율 (피곤·배고프면 느려짐) */
  slow: number;
  /** 한계(100)에 도달하면 달릴 수 없다 */
  canRun: boolean;
  /** 이번 프레임에 처음 경고 구간에 들어갔으면 그 종류 */
  warn: 'tired' | 'hungry' | null;
}

/** 한 모드(도시·필드·보스)에서 생활 수치를 매 프레임 갱신한다 */
export class LifeTracker {
  /** 최근 활동량 0~1 */
  activity = 0;
  private warned = { tired: false, hungry: false };
  private lastSerial = -1;

  /** 지금 배고픔이 오르는 배율 */
  get hungerRate() {
    return 1 + ACTIVITY_HUNGER * this.activity;
  }

  /**
   * @param running 달리는 중: 더 빨리 지치고 활동량이 쌓인다
   * @param resting 산책 등 쉬는 중: 피로가 줄어든다
   * @param attackSerial Fighter.moveSerial: 바뀌면 기술을 하나 쓴 것 (피로·활동량 추가)
   * @param working 일하는 중: 활동량이 일정 이상 유지된다
   */
  tick(life: LifeStats, opts: { running?: boolean; resting?: boolean; attackSerial?: number; working?: boolean } = {}): LifeTick {
    // 활동량: 달리면·싸우면 쌓이고, 쉬면 천천히 빠진다
    if (opts.running) this.activity += ACTIVITY_RUN_PER_FRAME;
    else this.activity -= ACTIVITY_DECAY_PER_FRAME;
    if (opts.attackSerial !== undefined) {
      if (this.lastSerial >= 0 && opts.attackSerial !== this.lastSerial) {
        life.fatigue = Math.min(100, life.fatigue + ATTACK_FATIGUE);
        this.activity += ACTIVITY_PER_ATTACK;
      }
      this.lastSerial = opts.attackSerial;
    }
    this.activity = Math.min(1, Math.max(opts.working ? WORK_ACTIVITY : 0, this.activity));

    if (opts.resting && !opts.running) life.fatigue = Math.max(0, life.fatigue - REST_RECOVER_PER_FRAME);
    else life.fatigue = Math.min(100, life.fatigue + FATIGUE_PER_FRAME * (opts.running ? 2 : 1));
    life.hunger = Math.min(100, life.hunger + HUNGER_PER_FRAME * this.hungerRate);

    let warn: LifeTick['warn'] = null;
    if (life.fatigue > TIRED && !this.warned.tired) warn = 'tired';
    else if (life.hunger > STARVING && !this.warned.hungry) warn = 'hungry';
    if (warn) this.warned[warn] = true;
    if (life.fatigue <= TIRED) this.warned.tired = false;
    if (life.hunger <= STARVING) this.warned.hungry = false;

    return {
      slow: (life.fatigue > TIRED ? 0.8 : 1) * (life.hunger > STARVING ? 0.85 : 1),
      canRun: life.fatigue < 100 && life.hunger < 100,
      warn,
    };
  }
}

export const LIFE_WARNING: Record<'tired' | 'hungry', string> = {
  tired: '😪 너무 피곤하다… 집에 가서 자야겠다',
  hungry: '🍽️ 배가 너무 고프다… 뭐라도 먹어야겠다',
};
