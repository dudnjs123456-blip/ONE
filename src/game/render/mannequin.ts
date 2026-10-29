import * as THREE from 'three';
import { DASH_FRAMES, GETUP_FRAMES } from '../core/constants';
import type { Fighter } from '../core/fighter';
import { smooth, type FrameClock } from './clock';
import { totalFrames, type MoveAnim, type MoveDef } from '../data/moves';

/**
 * 관절 각도(라디안) 묶음. 팔/다리는 x축 회전: 음수 = 앞으로 든다, 무릎 양수 = 뒤로 굽힘.
 * 골반 높이는 다리 각도에서 자동 계산되어 발이 바닥에 붙는다.
 */
export interface Pose {
  lean: number;
  twist: number;
  tilt: number;
  roll: number;
  /** 0 = 서 있음, 1 = 바닥에 누움 */
  drop: number;
  shL: number;
  elL: number;
  shR: number;
  elR: number;
  hpL: number;
  knL: number;
  hpR: number;
  knR: number;
  /** 다리 벌림 (바깥쪽이 +). 횡이동 스텝·스탠스 폭 */
  abL: number;
  abR: number;
  /** 팔 벌림 (바깥쪽 +, 몸통에 붙이면 -). 팔꿈치를 모은 복서 가드·훅 */
  arL: number;
  arR: number;
  /** 골반 회전 (왼쪽 골반이 앞으로 = -). twist 는 어깨의 전체 회전 */
  hipYaw: number;
}

type PoseKey = keyof Pose;
export const KEYS = [
  'lean', 'twist', 'tilt', 'roll', 'drop', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'hpR', 'knR', 'abL', 'abR', 'arL', 'arR', 'hipYaw',
] as const satisfies readonly PoseKey[];

export const GUARD: Pose = {
  lean: 0.12, twist: -0.32, tilt: 0, roll: 0, drop: 0,
  shL: -0.95, elL: -1.55, shR: -0.5, elR: -2.2,
  hpL: -0.36, knL: 0.5, hpR: 0.18, knR: 0.46,
  abL: 0.13, abR: 0.15,
  arL: -0.02, arR: 0.0,
  hipYaw: -0.12,
};

const CROUCH: Pose = { ...GUARD, lean: 0.35, hpL: -1.2, knL: 1.9, hpR: -0.9, knR: 2.1, abL: 0.14, abR: 0.14 };

const HIGH_GUARD: Partial<Pose> = { shL: -0.8, elL: -2.25, arL: -0.32, shR: -0.62, elR: -2.35, arR: -0.32, lean: 0.18 };

/**
 * 기술별 자세. base 에서 pose(타격 순간)로 간다.
 * chamber 가 있으면 발차기 곡선: 무릎을 먼저 접어 올렸다가(챔버) 맞기 직전에 확 뻗는다.
 */
const EXTENDED: Record<
  MoveAnim,
  {
    base: Pose;
    pose: Partial<Pose>;
    chamber?: Partial<Pose>;
    /** 발생 중 준비 동작 비율 (기본 0.7) */
    windup?: number;
    /** 타격 순간 목표보다 더 뻗는 비율 (기본 0.18). 펀치는 작게 */
    overshoot?: number;
    /** 회수할 때 준비 자세(무릎 접기)를 다시 거친다 — 발차기용 */
    rechamber?: boolean;
  }
> = {
  // 잽: 준비 동작 없이 앞손을 곧게 찌르고, 앞무릎을 굽히며 어깨를 넣는다
  jabL: {
    base: GUARD,
    pose: { hipYaw: -0.32, shL: -1.55, elL: -0.04, arL: -0.05, twist: -0.62, lean: 0.2, hpL: -0.42, knL: 0.48, shR: -0.5, elR: -2.2, arR: -0.26 },
  },
  // 스트레이트: 허리를 젖혀 장전 → 뒷발로 밀며 허리를 돌려 오른손을 끝까지 뻗고, 왼손은 턱으로 당긴다
  straightR: {
    base: GUARD,
    windup: 0.45,
    overshoot: 0.06,
    chamber: { hipYaw: -0.3, twist: -0.48, lean: 0.06, shR: -0.35, elR: -2.3, arR: -0.2, knR: 0.42 },
    pose: {
      hipYaw: 0.42, shR: -1.58, elR: -0.03, arR: -0.05, twist: 0.82, lean: 0.34, roll: -0.05,
      hpR: 0.52, knR: 0.08, hpL: -0.5, knL: 0.6, shL: -0.3, elL: -2.05, arL: -0.32,
    },
  },
  // 중단 잽: 무릎을 굽혀 낮게 파고들며 왼손으로 몸통을 찌른다
  midPunchL: {
    base: GUARD,
    windup: 0.4,
    overshoot: 0.06,
    chamber: { lean: 0.22, knL: 0.6, knR: 0.55, shL: -0.6, elL: -2.0 },
    pose: {
      hipYaw: -0.3, shL: -1.32, elL: -0.06, arL: -0.08, twist: -0.55, lean: 0.4, hpL: -0.62, knL: 0.82, hpR: -0.1, knR: 0.7,
      shR: -0.45, elR: -2.2, arR: -0.26,
    },
  },
  // 어퍼컷: 몸을 낮추며 오른주먹을 허리까지 떨어뜨렸다가 → 다리를 펴며 아래에서 위로 폭발적으로 올려친다
  uppercutR: {
    base: GUARD,
    windup: 0.6,
    overshoot: 0.04,
    chamber: { hipYaw: -0.25, lean: 0.28, twist: -0.4, shR: 0.25, elR: -1.5, arR: -0.08, hpL: -0.62, knL: 0.85, hpR: -0.12, knR: 0.72 },
    pose: {
      hipYaw: 0.38, shR: -1.95, elR: -1.4, arR: -0.12, twist: 0.6, lean: -0.22,
      hpL: -0.22, knL: 0.12, hpR: 0.25, knR: 0.05, shL: -0.2, elL: -1.9, arL: -0.32,
    },
  },
  // 보디블로: 앞으로 파고들며 팔꿈치를 벌린 훅으로 옆구리를 친다
  bodyBlowR: {
    base: GUARD,
    windup: 0.55,
    overshoot: 0.08,
    chamber: { hipYaw: -0.3, twist: -0.42, lean: 0.22, shR: -0.3, elR: -1.6, arR: 0.25, hpL: -0.42, knL: 0.62 },
    pose: {
      hipYaw: 0.48, shR: -1.32, elR: -0.55, arR: 0.18, twist: 0.78, lean: 0.5,
      hpL: -0.78, knL: 0.78, hpR: 0.56, knR: 0.15, shL: -0.3, elL: -2.0, arL: -0.32,
    },
  },
  // 미들킥: 디딤발을 굽히며 왼무릎을 가슴 높이까지 크게 끌어올렸다가 → 골반을 밀어 넣고 상체를 확 젖히며
  // 발바닥으로 끝까지 찔러 찬다. 반대팔은 뒤로 크게 휘둘러 균형, 차고 나면 무릎을 다시 접어 거둔다
  midKickL: {
    base: GUARD,
    rechamber: true,
    windup: 0.62,
    overshoot: 0.22,
    chamber: { hipYaw: 0.12, hpL: -1.6, knL: 2.1, lean: 0.1, twist: 0.12, hpR: 0.05, knR: 0.55, shL: -0.95, elL: -1.85, shR: -0.7, elR: -2.05 },
    pose: {
      hipYaw: -0.42, hpL: -1.7, knL: 0.02, abL: -0.12, lean: -0.45, twist: -0.28, roll: -0.08,
      hpR: 0.1, knR: 0.2, shL: -0.2, elL: -1.15, shR: -1.15, elR: -1.5, arR: 0.3,
    },
  },
  // 하이킥: 오른무릎을 옆으로 접어 올렸다가 허리를 크게 돌리며 머리 높이로 휘둘러 차기 (돌려차기)
  // 디딤발로 돌며 골반을 완전히 넘기고(턴오버) 상체를 크게 젖힌다. 차는 쪽 팔은 뒤로 내던져 회전에 힘을 싣는다
  highKickR: {
    base: GUARD,
    rechamber: true,
    windup: 0.6,
    overshoot: 0.25,
    chamber: {
      hipYaw: 0.25, hpR: -1.55, knR: 2.15, abR: 0.22, twist: -0.28, lean: -0.05, roll: 0.12, hpL: -0.15, knL: 0.55,
      shL: -1.1, elL: -1.9, shR: -0.3, elR: -1.8,
    },
    pose: {
      hipYaw: 0.88, hpR: -2.05, knR: 0.04, abR: -0.12, lean: -0.62, twist: 0.38, roll: 0.36,
      shR: 0.45, elR: -0.5, arR: 0.4, shL: -1.35, elL: -1.9, hpL: -0.05, knL: 0.22,
    },
  },
  lowKickR: {
    base: CROUCH,
    rechamber: true,
    windup: 0.6,
    overshoot: 0.2,
    chamber: { hpR: -1.1, knR: 1.9, twist: -0.15, shL: -1.0, elL: -1.8 },
    pose: { hipYaw: 0.38, hpL: -1.15, knL: 1.85, hpR: -1.42, knR: 0.0, abR: -0.12, lean: 0.12, twist: 0.42, shR: 0.3, elR: -1.0, shL: -1.25, elL: -1.9 },
  },
  // 다리 후리기: 웅크린 채 왼다리를 바깥으로 크게 벌려 허리째 쓸어 돌린다
  sweepL: {
    base: CROUCH,
    rechamber: true,
    chamber: { hpL: -0.9, knL: 1.5, abL: 0.25, twist: -0.1 },
    pose: { hipYaw: -0.25, hpL: -1.3, knL: 0.04, abL: 0.18, hpR: -1.35, knR: 2.2, lean: 0.42, twist: 0.45, roll: -0.12, shL: -0.6, elL: -1.2, shR: -0.9, elR: -1.6 },
  },
  clawR: { base: GUARD, pose: { shR: -1.9, elR: -0.3, twist: 0.7, lean: 0.3, hpL: -0.5, knL: 0.6 } },
  smash: { base: GUARD, pose: { shL: -1.2, elL: -0.2, shR: -1.2, elR: -0.2, lean: 0.75, hpL: -0.9, knL: 1.0, hpR: 0.3, knR: 0.5 } },
  tailSweep: { base: CROUCH, pose: { hpR: -1.6, knR: 0.05, hpL: -1.3, knL: 2.2, lean: 0.55, twist: 1.2, roll: 0.2 } },
  // 대시 니킥: 무릎을 가슴까지 끌어올리며 상체를 앞으로 실어 올려친다
  // 점프 펀치: 공중에서 무릎을 접은 채 오른손을 앞아래로 내려찍는다
  jumpPunchR: {
    base: { ...GUARD, lean: 0.12, hpL: -1.1, knL: 1.6, hpR: -0.5, knR: 1.2, shL: -1.2, elL: -1.3, shR: -0.4, elR: -1.6 },
    windup: 0.5,
    overshoot: 0.06,
    chamber: { shR: -0.6, elR: -2.3, twist: -0.3 },
    pose: { hipYaw: 0.2, shR: -1.2, elR: -0.05, twist: 0.6, lean: 0.45, shL: -0.4, elL: -2.0 },
  },
  // 날아차기: 한 다리는 접고 다른 다리를 쭉 뻗어 상체를 젖히며 날아든다
  flyKick: {
    base: { ...GUARD, lean: 0.12, hpL: -1.1, knL: 1.6, hpR: -0.5, knR: 1.2, shL: -1.2, elL: -1.3, shR: -0.4, elR: -1.6 },
    windup: 0.6,
    overshoot: 0.08,
    chamber: { hpR: -1.3, knR: 2.0, hpL: -0.9, knL: 1.8, lean: -0.05 },
    pose: {
      hipYaw: 0.3, hpR: -1.55, knR: 0.0, abR: -0.08, hpL: -0.8, knL: 1.9, lean: -0.35, twist: 0.0,
      shL: -1.4, elL: -0.8, shR: 0.4, elR: -1.0,
    },
  },
  kneeR: {
    base: GUARD,
    windup: 0.55,
    overshoot: 0.1,
    chamber: { hipYaw: -0.15, hpR: -0.9, knR: 1.6, lean: 0.25, shL: -1.1, elL: -1.5, shR: -0.8, elR: -1.7 },
    pose: {
      hipYaw: 0.25, hpR: -1.9, knR: 2.3, abR: -0.1, hpL: 0.1, knL: 0.15, lean: 0.35, twist: 0.3,
      shL: -1.5, elL: -0.9, shR: -1.3, elR: -1.0,
    },
  },
  charge: { base: GUARD, pose: { shL: -0.9, elL: -1.4, shR: -0.9, elR: -1.4, lean: 0.6, hpL: -1.0, knL: 1.1, hpR: 0.6, knR: 0.6 } },
  // 슬라이딩: 엉덩이를 낮추고 뒤로 젖히며 앞다리를 쭉 뻗어 발목을 노린다. 뒷다리는 접고, 팔은 뒤로 짚는다
  slide: {
    base: CROUCH,
    windup: 0.35,
    overshoot: 0.04,
    pose: {
      drop: 0.55, tilt: -0.85, lean: -0.25, twist: 0.15, hipYaw: 0.2,
      hpR: -0.65, knR: 0.05, abR: -0.05, hpL: 0.25, knL: 1.7, abL: 0.2,
      shL: 0.7, elL: -0.3, shR: 0.55, elR: -0.4,
    },
  },
};

const THIGH = 0.46;
const SHIN = 0.46;
const TAU = Math.PI * 2;

function mix(a: Pose, b: Partial<Pose>, t: number): Pose {
  const out = { ...a };
  for (const k of KEYS) {
    const v = b[k];
    if (v !== undefined) out[k] = a[k] + (v - a[k]) * t;
  }
  return out;
}

/** 골반에서 발까지의 높이 (다리를 벌리면 그만큼 낮아짐) */
function legHeight(hip: number, knee: number, ab = 0) {
  return (THIGH * Math.cos(hip) + SHIN * Math.cos(hip + knee)) * Math.cos(ab);
}

/** 무릎을 굽히면서 발이 골반 아래에 머물도록 허벅지를 함께 숙인다 (몸이 자연스럽게 내려앉음) */
function bend(p: Pose, d: number): Pose {
  return { ...p, knL: p.knL + d, knR: p.knR + d, hpL: p.hpL - d / 2, hpR: p.hpR - d / 2 };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => Math.pow(clamp01(x), 3);
const easeInOut = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
const smoothstep = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const amount = (v: number, full: number) => Math.min(1, Math.abs(v) / full);

/** 키프레임(프레임, 덮어쓸 관절) 사이를 smoothstep 으로 부드럽게 잇는다 */
function keyframes(fr: number, base: Pose, keys: [number, Partial<Pose>][]): Pose {
  if (fr <= keys[0][0]) return mix(base, keys[0][1], 1);
  for (let i = 1; i < keys.length; i++) {
    const [f0, p0] = keys[i - 1];
    const [f1, p1] = keys[i];
    if (fr <= f1) return mix(mix(base, p0, 1), mix(base, p1, 1), smoothstep((fr - f0) / (f1 - f0)));
  }
  return mix(base, keys[keys.length - 1][1], 1);
}

/**
 * 화면 쪽에서 계산하는 이동 정보. 발 위상을 '시간' 이 아니라 '실제로 이동한 거리' 로 진행시켜
 * 걷는 속도와 발걸음이 맞고 (발이 미끄러지지 않음), 벽에 막히면 발도 멈춘다.
 */
export class Locomotion {
  /** 발 위상 (라디안) */
  phase = 0;
  /** 정면 방향 속도 (60fps 1프레임당 m, 평활화) */
  fwd = 0;
  /** 왼쪽 방향 속도 */
  lat = 0;
  /** 속도 변화 (60fps 1프레임당, 평활화). 출발 + / 정지 - */
  accel = 0;
  private last: { x: number; z: number } | null = null;

  update(p: { x: number; z: number; fx: number; fz: number }, dt: number, stride: number) {
    const steps = Math.max(1e-3, dt * 60);
    if (!this.last) {
      this.last = { x: p.x, z: p.z };
      return;
    }
    const dx = p.x - this.last.x;
    const dz = p.z - this.last.z;
    this.last.x = p.x;
    this.last.z = p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1) return; // 순간이동 (라운드 리셋·부활)
    const k = smooth(0.25, dt);
    const before = Math.hypot(this.fwd, this.lat);
    this.fwd += ((dx * p.fx + dz * p.fz) / steps - this.fwd) * k;
    this.lat += ((dx * p.fz - dz * p.fx) / steps - this.lat) * k;
    this.phase += (dist / stride) * TAU;
    const a = (Math.hypot(this.fwd, this.lat) - before) / steps;
    this.accel += (a - this.accel) * smooth(0.3, dt);
  }
}

/** 한 다리의 걸음 주기. 앞 절반 = 공중에서 앞으로 옮김(무릎 듦), 뒤 절반 = 땅을 딛고 뒤로 밀림 */
function gaitLeg(u: number, start: number, reach: number, lift: number, dir: 1 | -1) {
  const v = (((u - start) % 1) + 1) % 1;
  if (v < 0.5) {
    const s = v * 2;
    return { hip: dir * reach * Math.cos(Math.PI * s), knee: lift * Math.sin(Math.PI * s) };
  }
  const s = (v - 0.5) * 2;
  return { hip: -dir * reach * Math.cos(Math.PI * s), knee: 0 };
}

const cycle = (phase: number) => (((phase / TAU) % 1) + 1) % 1;

/** 대기: 철권식 리듬 바운스 + 느린 좌우 체중 이동 */
function stance(t: number): Pose {
  const beat = 0.5 + 0.5 * Math.sin(t * 0.13); // 약 0.8초 주기
  const sway = Math.sin(t * 0.045);
  const p = bend(GUARD, 0.08 + beat * 0.1);
  return {
    ...p,
    lean: GUARD.lean + 0.04 + beat * 0.04,
    twist: GUARD.twist + sway * 0.05,
    roll: sway * 0.025,
    shL: GUARD.shL + beat * 0.06,
    elL: GUARD.elL - beat * 0.08,
    shR: GUARD.shR + beat * 0.05,
    elR: GUARD.elR - beat * 0.06,
  };
}

/** 앞걷기: 앞발이 먼저 미끄러져 나가고 뒷발이 따라붙는 스텝 */
function walkForward(t: number, L: Locomotion): Pose {
  const u = cycle(L.phase);
  const front = gaitLeg(u, 0, 0.2, 0.45, 1);
  const rear = gaitLeg(u, 0.5, 0.18, 0.5, 1);
  const bob = Math.pow(Math.sin(u * TAU * 2), 2) * 0.05;
  const p = bend(GUARD, 0.12 + bob);
  const step: Pose = {
    ...p,
    lean: GUARD.lean + 0.08,
    hpL: p.hpL + front.hip,
    knL: p.knL + front.knee,
    hpR: p.hpR + rear.hip,
    knR: p.knR + rear.knee,
    shL: GUARD.shL - 0.05,
    shR: GUARD.shR - 0.05,
  };
  return mix(stance(t), step, amount(L.fwd, 0.035));
}

/** 뒷걷기: 뒷발이 먼저 빠지고 앞발이 끌려오는 스텝, 가드는 조금 높게 */
function walkBack(t: number, L: Locomotion): Pose {
  const u = cycle(L.phase);
  const rear = gaitLeg(u, 0, 0.2, 0.45, -1);
  const front = gaitLeg(u, 0.5, 0.15, 0.35, -1);
  const bob = Math.pow(Math.sin(u * TAU * 2), 2) * 0.04;
  const p = mix(bend(GUARD, 0.1 + bob), HIGH_GUARD, 0.4);
  const step: Pose = {
    ...p,
    lean: 0.0,
    hpL: p.hpL + front.hip,
    knL: p.knL + front.knee,
    hpR: p.hpR + rear.hip,
    knR: p.knR + rear.knee,
  };
  return mix(stance(t), step, amount(L.fwd, 0.03));
}

/** 달리기 (필드): 무릎을 높이 들고, 팔은 반대 다리와 엇갈려 흔든다 */
function run(t: number, L: Locomotion): Pose {
  const u = cycle(L.phase);
  const left = gaitLeg(u, 0, 0.7, 1.3, 1);
  const right = gaitLeg(u, 0.5, 0.7, 1.3, 1);
  const bounce = Math.pow(Math.sin(u * TAU), 2) * 0.08;
  const p: Pose = {
    ...GUARD,
    lean: 0.28,
    hipYaw: left.hip * 0.28,
    twist: -left.hip * 0.32,
    roll: 0,
    hpL: -0.12 + left.hip,
    knL: 0.3 + left.knee + bounce,
    hpR: -0.12 + right.hip,
    knR: 0.3 + right.knee + bounce,
    abL: 0.04,
    abR: 0.04,
    shL: -left.hip * 0.9 - 0.1,
    elL: -1.15 - 0.55 * Math.max(0, left.hip / 0.7),
    arL: -0.05,
    shR: -right.hip * 0.9 - 0.1,
    elR: -1.15 - 0.55 * Math.max(0, right.hip / 0.7),
    arR: -0.05,
  };
  const speed = Math.hypot(L.fwd, L.lat);
  return mix(stance(t), p, amount(speed, 0.05));
}

/** 앞대시: 뒷발로 차고 → 앞무릎을 끌어올려 뛰어들고 → 앞발 착지 후 뒷발 당겨오기 */
function dashPose(fr: number): Pose {
  // 키프레임은 16F 기준으로 짜고 실제 대시 길이에 맞춰 늘린다
  const k = DASH_FRAMES / 16;
  // 무릎을 깊게 굽혀 몸을 낮추고 상체를 앞으로 숙인 채 파고든다. 끝엔 낮은 자세로 미끄러지며 멈춤
  const low = bend(GUARD, 0.35);
  return keyframes(fr, low, [
    [0, {}],
    [1.5 * k, { lean: 0.55, hpL: -0.7, knL: 1.15, hpR: 0.3, knR: 0.5, shL: -0.8, elL: -1.6, shR: -0.4, elR: -1.9 }],
    [7 * k, { lean: 0.68, twist: -0.12, hpL: -1.15, knL: 1.5, hpR: 0.45, knR: 0.75, shL: -0.8, elL: -1.6, shR: -0.4, elR: -1.9 }],
    [11 * k, { lean: 0.55, hpL: -0.8, knL: 1.0, hpR: -0.35, knR: 1.45, shL: -0.85, elL: -1.6 }],
    [16 * k, { lean: 0.35, hpL: -0.75, knL: 1.0, hpR: 0.05, knR: 0.95 }],
    [16 * k + 6, {}],
  ]);
}

/** 백대시: 살짝 웅크렸다가 뒤로 튕겨 나가며 가드를 올리고, 앞발을 끌어와 정리 */
function backdashPose(fr: number): Pose {
  return keyframes(fr, bend(GUARD, 0.1), [
    [0, {}],
    [4, { lean: 0.2, hpL: -0.5, knL: 0.75, hpR: -0.1, knR: 0.75 }],
    [9, { lean: -0.15, hpL: -0.6, knL: 0.25, hpR: 0.6, knR: 0.35, ...HIGH_GUARD }],
    [15, { lean: 0.02, hpL: -0.2, knL: 0.85, hpR: 0.35, knR: 0.45 }],
    [22, {}],
  ]);
}

/**
 * 횡이동: 진행 방향 발이 옆으로 벌어지며 먼저 딛고, 반대 발이 교차하며 따라온다.
 * @param dir +1 = 캐릭터 기준 오른쪽으로 이동
 */
function sidestepPose(fr: number, dir: number): Pose {
  const lead = dir > 0 ? 'R' : 'L';
  const trail = dir > 0 ? 'L' : 'R';
  const leg = (side: 'L' | 'R', hp: number, kn: number, ab: number): Partial<Pose> =>
    side === 'L' ? { hpL: hp, knL: kn, abL: ab } : { hpR: hp, knR: kn, abR: ab };
  return keyframes(fr, bend(GUARD, 0.12), [
    [0, {}],
    [4, { roll: 0.08 * dir, ...leg(lead, -0.3, 0.6, 0.5), ...leg(trail, -0.1, 0.55, 0.06) }],
    [9, { roll: 0.16 * dir, twist: GUARD.twist + 0.15 * dir, ...leg(lead, -0.2, 0.3, 0.3), ...leg(trail, -0.55, 1.0, -0.22) }],
    [13, { roll: 0.06 * dir, ...leg(lead, -0.15, 0.45, 0.16), ...leg(trail, 0.0, 0.45, 0.12) }],
    [16, {}],
  ]);
}

/**
 * 타격 곡선 (발차기·펀치 공용). 판정 프레임은 그대로 두고 '보이는 속도감' 만 만든다.
 * 발생의 windup 비율 동안 준비 동작(무릎 접기·주먹 장전) → 남은 구간에 가속하며 확 뻗고(스냅)
 * → 지속 중 살짝 더 나갔다가(오버슈트) → 다시 무릎을 접으며 회수.
 */
function strikePose(
  fr: number,
  m: MoveDef,
  base: Pose,
  chamberP: Partial<Pose>,
  strikeP: Partial<Pose>,
  windup = 0.7,
  overshoot = 0.18,
  rechamber = false,
): Pose {
  const chamber = mix(base, chamberP, 1);
  const strike = mix(base, strikeP, 1);
  const s = m.startup;
  const activeEnd = s + m.active - 1;
  const chamberEnd = s * windup;
  if (fr < chamberEnd) return mix(base, chamber, easeOut(fr / chamberEnd));
  if (fr < s) return mix(chamber, strike, easeIn((fr - chamberEnd) / (s - chamberEnd)));
  if (fr <= activeEnd + 1) {
    // 챔버→타격 방향으로 18% 더 뻗었다가 지속 동안 제자리로
    const over = 1 + overshoot * (1 - (fr - s) / (m.active + 1));
    return mix(chamber, strike, over);
  }
  const r = (fr - activeEnd - 1) / Math.max(1, totalFrames(m) - activeEnd - 1);
  if (!rechamber) return mix(strike, base, easeInOut(r));
  if (r < 0.3) return mix(strike, chamber, easeOut(r / 0.3));
  return mix(chamber, base, easeInOut((r - 0.3) / 0.7));
}

function crouchPose(t: number): Pose {
  const beat = 0.5 + 0.5 * Math.sin(t * 0.11);
  return { ...CROUCH, knL: CROUCH.knL + beat * 0.08, knR: CROUCH.knR + beat * 0.08, lean: CROUCH.lean + beat * 0.03 };
}

/**
 * 상태 → 목표 포즈.
 * @param t 연속 시간 (사이클 애니메이션용)
 * @param sub 기술 진행을 프레임 사이로 보간하기 위한 오프셋 (FrameClock.sub)
 * @param loco 이동 거리 기반 발 위상·속도 (없으면 제자리)
 */
export function poseFor(f: Fighter, t: number, sub = 0, loco?: Locomotion): Pose {
  // 화면에 보일 '소수점 프레임'. 로직 프레임 사이를 매끄럽게 잇는다
  const fr = Math.max(0, f.frame + sub);
  const L = loco ?? new Locomotion();
  const moving = (p: Pose): Pose => ({ ...p, lean: p.lean + inertiaLean(L) });
  switch (f.state) {
    case 'idle':
      return moving(stance(t));
    case 'walkF':
      return moving(walkForward(t, L));
    case 'walkB':
      return moving(walkBack(t, L));
    case 'run':
      return moving(run(t, L));
    case 'dash':
      return dashPose(fr);
    case 'backdash':
      return backdashPose(fr);
    case 'sidestep':
      return sidestepPose(fr, f.sidestepDir);
    case 'crouch':
      return crouchPose(t);
    case 'jump': {
      // 올라갈 땐 무릎을 끌어올리고, 떨어질 땐 다리를 펴서 착지 준비
      const rising = f.vy > 0;
      return {
        ...GUARD,
        lean: 0.12,
        hpL: rising ? -1.1 : -0.5,
        knL: rising ? 1.6 : 0.6,
        hpR: rising ? -0.5 : -0.2,
        knR: rising ? 1.2 : 0.5,
        shL: -1.2,
        elL: -1.3,
        shR: -0.4,
        elR: -1.6,
      };
    }
    case 'blockstun':
      return mix(f.isCrouching() ? CROUCH : GUARD, HIGH_GUARD, 1);
    case 'hitstun':
      return { ...GUARD, lean: -0.45, twist: 0.2, shL: 0.1, elL: -0.5, shR: 0.2, elR: -0.6, hpL: 0.1, knL: 0.5 };
    case 'launched':
      return {
        ...GUARD, tilt: Math.max(-2.2, -0.6 - fr * 0.05), shL: -1.5, elL: -0.7, arL: 0.35, shR: -0.35, elR: -1.1, arR: 0.6,
        hpL: -0.6, knL: 0.8, hpR: -0.3, knR: 0.4,
      };
    case 'knockdown':
    case 'ko':
      return {
        ...GUARD, tilt: -Math.PI / 2, drop: 1, lean: 0, twist: 0,
        shL: -0.4, elL: -0.4, arL: 0.9, shR: -0.2, elR: -0.9, arR: 0.55,
        hpL: -0.1, knL: 0.2, hpR: -0.3, knR: 0.6,
      };
    case 'getup': {
      const k = Math.min(1, fr / GETUP_FRAMES);
      return mix({ ...CROUCH, tilt: -Math.PI / 2, drop: 1 }, { ...GUARD }, k);
    }
    case 'attack': {
      const m = f.move;
      if (!m) return GUARD;
      const activeEnd = m.startup + m.active - 1;
      let k: number;
      if (fr < m.startup) k = Math.pow(fr / m.startup, 1.6);
      else if (fr <= activeEnd) k = 1;
      else {
        // 후딜: 처음엔 빨리, 끝은 천천히 자세로 돌아온다 (ease-out)
        const r = Math.min(1, (fr - activeEnd) / (totalFrames(m) - activeEnd));
        k = Math.pow(1 - r, 2);
      }
      const ext = EXTENDED[m.anim];
      if (ext.chamber) return strikePose(fr, m, ext.base, ext.chamber, ext.pose, ext.windup, ext.overshoot, ext.rechamber);
      return mix(ext.base, ext.pose, Math.max(0, k));
    }
  }
}

// ───────────────────────── 사람다운 움직임: 관절 스프링 · 몸 회전 ─────────────────────────

/**
 * 관절 묶음별 스프링 [고유진동수 ω(rad/s), 감쇠비 ζ, 앞먹임 비율].
 * 다리는 단단하고 목표를 그대로 따라가(발 미끄러짐 방지), 골반 → 몸통 → 팔 순으로 점점 늦게·느슨하게 따라와
 * 골반이 먼저 돌고 어깨, 팔이 채찍처럼 뒤따르는 시차와 살짝 넘쳤다 돌아오는 여운을 만든다.
 */
const SPRING: Record<PoseKey, [number, number, number]> = {
  hpL: [45, 1, 1], knL: [45, 1, 1], hpR: [45, 1, 1], knR: [45, 1, 1], abL: [45, 1, 1], abR: [45, 1, 1],
  hipYaw: [28, 0.8, 0.6],
  lean: [19, 0.72, 0.4], twist: [19, 0.7, 0.4], roll: [19, 0.75, 0.4],
  shL: [16, 0.6, 0.2], elL: [15, 0.6, 0.2], shR: [16, 0.6, 0.2], elR: [15, 0.6, 0.2], arL: [16, 0.62, 0.2], arR: [16, 0.62, 0.2],
  tilt: [14, 1, 0.3], drop: [14, 1, 0.3],
};

/** 목표 포즈를 관절별 2차 스프링으로 따라가는 실제 표시 포즈 */
export class PoseSpring {
  readonly x: Pose = { ...GUARD };
  private v = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<PoseKey, number>;
  private prevTarget: Pose = { ...GUARD };

  /** @param boost 반응 속도 배율 (공격 중엔 크게 해서 타격이 뭉개지지 않게) */
  step(target: Pose, dt: number, boost: number): Pose {
    const d = Math.min(Math.max(dt, 1e-4), 0.1);
    const n = Math.max(1, Math.ceil(d * 120));
    const h = d / n;
    for (const k of KEYS) {
      const [w0, z, ff] = SPRING[k];
      const w = w0 * boost;
      // 목표의 속도를 앞먹임으로 넣어 주기 동작(걷기·달리기)은 지연 없이, 급변(상태 전환)은 부드럽게
      const tv = Math.max(-15, Math.min(15, (target[k] - this.prevTarget[k]) / d)) * ff;
      let x = this.x[k];
      let v = this.v[k];
      for (let i = 0; i < n; i++) {
        v += (w * w * (target[k] - x) + 2 * z * w * (tv - v)) * h;
        x += v * h;
      }
      this.x[k] = x;
      this.v[k] = v;
      this.prevTarget[k] = target[k];
    }
    return this.x;
  }
}

/**
 * 화면에 보이는 몸 방향. 로직의 방향은 순간적으로 바뀌지만, 몸은 회전 속도를 갖고 돌고
 * 달리면서 꺾을 땐 안쪽으로 기운다 (bank).
 */
export class Heading {
  private yaw = Number.NaN;
  private rate = 0;

  update(targetYaw: number, dt: number, fast: boolean, speed: number): { yaw: number; bank: number } {
    if (Number.isNaN(this.yaw)) this.yaw = targetYaw;
    let diff = targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // -π ~ π
    const stepYaw = diff * smooth(fast ? 0.45 : 0.18, dt);
    this.yaw += stepYaw;
    this.rate += (stepYaw / Math.max(dt, 1e-3) - this.rate) * smooth(0.25, dt);
    // 왼쪽으로 돌면(yaw 증가) 왼쪽(roll -)으로 기울어 원심력을 버틴다
    const bank = Math.max(-0.35, Math.min(0.35, -this.rate * speed * 0.6));
    return { yaw: this.yaw, bank };
  }
}

/** 공격 중엔 스프링을 빠르게 (기술 템포 반영) */
export function attackBoost(f: Fighter) {
  if (f.state === 'attack') return 1.6 * Math.sqrt(f.tempo);
  if (f.state === 'dash' || f.state === 'jump') return 1.5; // 대시·점프는 몸이 즉시 반응해야 딜레이가 안 느껴진다
  return 1;
}

/** 출발할 때 앞으로 쏠리고 멈출 때 뒤로 버티는 기울기 */
function inertiaLean(L: Locomotion) {
  return Math.max(-0.28, Math.min(0.3, L.accel * 14));
}

// ───────────────────────── 외형 ─────────────────────────

export interface HeroinePalette {
  outfit: number;
  trim: number;
  dark: number;
  boots: number;
  hair: number;
  skin: number;
  eyes: number;
}

/** 여성 무술가 캐릭터 색 조합. P1 = crimson, P2 = azure */
export const HEROINE: Record<'crimson' | 'azure', HeroinePalette> = {
  crimson: { outfit: 0xd8344a, trim: 0xf2c14e, dark: 0x1d1a24, boots: 0xf2eee8, hair: 0x4a2a1e, skin: 0xf5d0b8, eyes: 0x5a2e1e },
  azure: { outfit: 0x2f6fd8, trim: 0xe8eef8, dark: 0x161b2a, boots: 0x1d2333, hair: 0x17161f, skin: 0xf3cdb4, eyes: 0x1f2f5a },
};

/** basic = 박스 인형 (몬스터·보스), heroine = 여성 격투가 (플레이어) */
export type Appearance =
  | { kind: 'basic'; color: number }
  | { kind: 'heroine'; palette: HeroinePalette }
  /** VRM 3D 모델 파일. 불러오는 동안은 fallback 으로 그린다. tint 는 2P 컬러 구분용 색 곱 */
  | { kind: 'vrm'; url: string; fallback: HeroinePalette; tint?: number };

/** 렌더러가 다루는 캐릭터 표현 (절차적 Mannequin 또는 VRM) */
/** 침대에 눕기: t 0 = 서 있음 → 0.35 걸터앉음 → 1 누움. sit·lie 는 골반/발 기준 위치와 몸 방향 */
export interface RestPose {
  t: number;
  sit: { x: number; z: number; yaw: number };
  lie: { x: number; y: number; z: number; yaw: number };
  /** 앉은 골반 높이 (기본 침대 0.66) 와 허벅지 드는 각도 (기본 1.1) */
  seatY?: number;
  sitLeg?: number;
  /** 앉아서 휴대폰 보기 (1 = 보는 중) */
  phone?: number;
  /** 이쪽을 쳐다본다 (월드 좌표) */
  look?: { x: number; z: number } | null;
}

export interface CharacterView {
  readonly root: THREE.Group;
  /** 일상 모드: 전투 스탠스 대신 편한 대기·걷기 (도시) */
  casual?: boolean;
  /** 눕는 중이면 그 자세 (없으면 평소) */
  rest?: RestPose | null;
  update(f: Fighter, clock: FrameClock): void;
}

export const heroine = (palette: HeroinePalette): Appearance => ({ kind: 'heroine', palette });

type JointName = 'shL' | 'elL' | 'shR' | 'elR' | 'hpL' | 'knL' | 'hpR' | 'knR';

const std = (color: number, roughness = 0.6, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  [x, y, z]: [number, number, number] = [0, 0, 0],
  [sx, sy, sz]: [number, number, number] = [1, 1, 1],
  shadow = true,
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

/** 관절 원점에서 아래로 len 만큼 뻗은 원기둥 (팔·다리) */
function limb(parent: THREE.Object3D, rTop: number, rBot: number, len: number, mat: THREE.Material, yTop = 0) {
  return add(parent, new THREE.CylinderGeometry(rTop, rBot, len, 16), mat, [0, yTop - len / 2, 0]);
}

function ring(parent: THREE.Object3D, r: number, tube: number, mat: THREE.Material, y: number) {
  const m = add(parent, new THREE.TorusGeometry(r, tube, 8, 28), mat, [0, y, 0]);
  m.rotation.x = Math.PI / 2;
  return m;
}

const PONYTAIL_SEGMENTS = [0.05, 0.047, 0.042, 0.035, 0.026];
const PONYTAIL_BASE = 0.55;

/**
 * 절차적 캐릭터 모델. 관절 계층(골반·상체·어깨·팔꿈치·고관절·무릎)은 외형과 무관하게 같아서
 * 같은 포즈 데이터로 박스 인형과 여성 캐릭터를 모두 움직인다.
 * 나중에 GLTF + 스켈레탈 애니메이션으로 교체할 자리.
 */
/** 일상 대기 자세: 팔을 내리고 편하게 선다 (전투 스탠스 대신) */
const RELAXED: Partial<Pose> = { lean: 0.02, twist: 0, hipYaw: 0, shL: 0.05, elL: -0.25, shR: 0.05, elR: -0.25, arL: 0.1, arR: 0.1, hpL: 0, knL: 0.05, hpR: 0, knR: 0.05 };

export class Mannequin implements CharacterView {
  readonly root = new THREE.Group();
  /** 일상 모드: 가만히 있을 때 주먹을 올리지 않는다 (행인·주민) */
  casual = false;
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private joints: Record<JointName, THREE.Group>;
  private spring = new PoseSpring();
  private heading = new Heading();
  private loco = new Locomotion();
  private mainMat!: THREE.MeshStandardMaterial;

  // 여성 캐릭터 전용 연출
  private head: THREE.Group | null = null;
  private eyes: THREE.Object3D[] = [];
  private ponytail: THREE.Group[] = [];
  private hairAng = { x: PONYTAIL_BASE, z: 0, vx: 0, vz: 0 };
  private lastHead = new THREE.Vector3();
  private blinkSeed = Math.floor(Math.random() * 200);

  constructor(look: number | Appearance) {
    const raw: Appearance = typeof look === 'number' ? { kind: 'basic', color: look } : look;
    const app = raw.kind === 'vrm' ? ({ kind: 'heroine', palette: raw.fallback } as const) : raw;
    const dims =
      app.kind === 'heroine'
        ? { shX: 0.175, shY: 0.47, upper: 0.26, hipX: 0.085 }
        : { shX: 0.28, shY: 0.54, upper: 0.3, hipX: 0.11 };

    this.root.add(this.body);
    this.body.add(this.torso);

    const joint = (parent: THREE.Object3D, x: number, y: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      parent.add(g);
      return g;
    };
    // 캐릭터는 +Z 를 바라보고, 왼쪽이 +X
    const shL = joint(this.torso, dims.shX, dims.shY);
    const shR = joint(this.torso, -dims.shX, dims.shY);
    const hpL = joint(this.body, dims.hipX, -0.04);
    const hpR = joint(this.body, -dims.hipX, -0.04);
    this.joints = {
      shL,
      shR,
      hpL,
      hpR,
      elL: joint(shL, 0, -dims.upper),
      elR: joint(shR, 0, -dims.upper),
      knL: joint(hpL, 0, -THIGH),
      knR: joint(hpR, 0, -THIGH),
    };
    for (const s of [shL, this.joints.elL]) s.rotation.z = 0.08;
    for (const s of [shR, this.joints.elR]) s.rotation.z = -0.08;

    if (app.kind === 'heroine') this.buildHeroine(app.palette, dims.upper);
    else this.buildBasic(app.color);
  }

  update(f: Fighter, c: FrameClock) {
    const t = c.t;
    const lp = f.lerped(c.alpha);
    this.loco.update(lp, c.dt, f.state === 'run' ? 1.7 : 0.8);
    let target = poseFor(f, t, c.sub, this.loco);
    if (this.casual && f.state === 'idle') target = { ...target, ...RELAXED };
    const p = this.spring.step(target, c.dt, attackBoost(f));
    const speed = Math.hypot(this.loco.fwd, this.loco.lat);
    const { yaw, bank } = this.heading.update(Math.atan2(lp.fx, lp.fz), c.dt, f.state === 'attack', speed);

    // 아머 기술 예고: 발생 전까지 몸이 붉게 빛난다
    const glow = f.isArmored() ? 0.6 + 0.4 * Math.sin(t * 0.6) : 0;
    this.mainMat.emissive.setRGB(glow, glow * 0.25, 0);

    this.root.position.set(lp.x, lp.y, lp.z);
    this.root.rotation.y = yaw;

    const standY = Math.max(legHeight(p.hpL, p.knL, p.abL), legHeight(p.hpR, p.knR, p.abR)) + 0.06;
    this.body.position.y = standY * (1 - p.drop) + 0.14 * p.drop;
    this.body.rotation.set(p.tilt, p.hipYaw, p.roll + bank);
    this.torso.rotation.set(p.lean, p.twist - p.hipYaw, 0);

    const j = this.joints;
    j.shL.rotation.set(p.shL, 0, 0.08 + p.arL);
    j.elL.rotation.x = p.elL;
    j.shR.rotation.set(p.shR, 0, -(0.08 + p.arR));
    j.elR.rotation.x = p.elR;
    j.hpL.rotation.set(p.hpL, 0, p.abL);
    j.knL.rotation.x = p.knL;
    j.hpR.rotation.set(p.hpR, 0, -p.abR);
    j.knR.rotation.x = p.knR;

    if (this.head) this.animateHeroine(f, c, p);
  }

  // ───────────────────────── 내부 ─────────────────────────

  private animateHeroine(f: Fighter, c: FrameClock, p: Pose) {
    const t = c.t;
    const steps = Math.max(1e-3, c.dt * 60); // 60fps 기준 몇 프레임 분량이 흘렀나
    const head = this.head!;
    // 상체를 비틀어도 얼굴은 상대 쪽을 보도록 살짝 되돌린다
    head.rotation.y = -p.twist * 0.7;

    // 눈 깜빡임
    const blink = (t + this.blinkSeed) % 230 < 6 || f.state === 'hitstun';
    for (const e of this.eyes) e.scale.y = blink ? 0.12 : 1;

    // 포니테일: 머리의 이동 속도에 끌려가는 스프링
    this.root.updateMatrixWorld(true);
    const now = head.getWorldPosition(new THREE.Vector3());
    const vel = now.clone().sub(this.lastHead);
    this.lastHead.copy(now);
    if (vel.lengthSq() > 1) vel.set(0, 0, 0); // 순간이동(라운드 리셋) 무시
    vel.divideScalar(steps); // 60fps 1프레임당 이동량으로 환산
    const fwdVel = vel.x * f.fx + vel.z * f.fz;
    const latVel = vel.x * -f.fz + vel.z * f.fx;
    const h = this.hairAng;
    const clamp = THREE.MathUtils.clamp;
    // 몸이 숙이거나 뒤로 넘어가도 머리카락은 대체로 아래로 처지게 상체 각도를 상쇄
    const tx = clamp(PONYTAIL_BASE + fwdVel * 12 - vel.y * 6 - (p.lean + p.tilt) * 0.8, -0.4, 2.4);
    const tz = clamp(-latVel * 12 - p.roll, -0.8, 0.8);
    const damp = Math.pow(0.8, steps);
    h.vx = (h.vx + (tx - h.x) * 0.16 * steps) * damp;
    h.vz = (h.vz + (tz - h.z) * 0.16 * steps) * damp;
    h.x += h.vx * steps;
    h.z += h.vz * steps;
    const [base, ...rest] = this.ponytail;
    base.rotation.set(h.x, 0, h.z);
    rest.forEach((seg, i) => seg.rotation.set(h.vx * (2 + i) - 0.06, 0, h.vz * (2 + i)));
  }

  private buildBasic(color: number) {
    const main = std(color, 0.5, 0.1);
    this.mainMat = main;
    const dark = std(0x1c1f2b, 0.8);
    const skin = std(0xd9a983, 0.7);
    const box = (w: number, h: number, d: number, mat: THREE.Material, y: number, parent: THREE.Object3D) =>
      add(parent, new THREE.BoxGeometry(w, h, d), mat, [0, y, 0]);

    box(0.36, 0.16, 0.22, dark, 0, this.body);
    box(0.44, 0.5, 0.26, main, 0.33, this.torso);
    add(this.torso, sphere(0.13), skin, [0, 0.77, 0]);

    const j = this.joints;
    for (const [sh, el] of [[j.shL, j.elL], [j.shR, j.elR]] as const) {
      box(0.11, 0.3, 0.11, main, -0.15, sh);
      box(0.1, 0.26, 0.1, skin, -0.13, el);
      box(0.12, 0.12, 0.12, main, -0.3, el); // 글러브
    }
    for (const [hp, kn] of [[j.hpL, j.knL], [j.hpR, j.knR]] as const) {
      box(0.15, THIGH, 0.15, dark, -THIGH / 2, hp);
      box(0.13, SHIN, 0.13, dark, -SHIN / 2, kn);
      box(0.11, 0.06, 0.22, main, -SHIN - 0.01, kn).position.z = 0.05;
    }
  }

  private buildHeroine(c: HeroinePalette, upperArm: number) {
    const skin = std(c.skin, 0.55);
    const outfit = std(c.outfit, 0.45, 0.05);
    const trim = std(c.trim, 0.35, 0.4);
    const dark = std(c.dark, 0.7);
    const boots = std(c.boots, 0.5);
    const hair = std(c.hair, 0.45, 0.05);
    const eye = new THREE.MeshBasicMaterial({ color: c.eyes });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lip = std(0xd8606e, 0.4);
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8a9a, transparent: true, opacity: 0.35 });
    this.mainMat = outfit;

    // 골반: 짧은 반바지 + 허리띠
    add(this.body, sphere(0.15), dark, [0, -0.01, 0], [1.05, 0.75, 0.85]);
    ring(this.body, 0.135, 0.02, trim, 0.06);
    add(this.body, new THREE.BoxGeometry(0.05, 0.2, 0.012), trim, [0.07, -0.05, 0.125]); // 허리띠 끈

    // 상체: 드러난 허리 + 치파오풍 크롭탑
    const t = this.torso;
    limb(t, 0.105, 0.125, 0.17, skin, 0.23);
    add(t, sphere(0.15, 24, 18), outfit, [0, 0.33, 0], [1.0, 0.95, 0.72]);
    for (const x of [0.058, -0.058]) add(t, sphere(0.05), outfit, [x, 0.32, 0.06], [1, 0.95, 0.9]);
    ring(t, 0.125, 0.012, trim, 0.23); // 밑단
    ring(t, 0.058, 0.013, trim, 0.455); // 차이나 칼라
    add(t, new THREE.BoxGeometry(0.012, 0.16, 0.01), trim, [0.035, 0.37, 0.107]).rotation.z = -0.5; // 앞섶 장식
    for (const x of [0.165, -0.165]) add(t, sphere(0.044), skin, [x, 0.45, 0]); // 어깨
    limb(t, 0.035, 0.04, 0.09, skin, 0.53); // 목

    // 머리
    const head = new THREE.Group();
    head.position.y = 0.625;
    head.scale.setScalar(1.08); // 애니풍으로 머리를 살짝 크게
    t.add(head);
    this.head = head;
    // 위는 둥글고 턱으로 갈수록 좁아지는 달걀형 얼굴 (회전체)
    const faceProfile = [
      [0, -0.112], [0.03, -0.108], [0.058, -0.088], [0.08, -0.055], [0.096, -0.015],
      [0.103, 0.025], [0.1, 0.065], [0.082, 0.095], [0.05, 0.113], [0, 0.12],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    add(head, new THREE.LatheGeometry(faceProfile, 32), skin, [0, 0, 0], [1, 1, 0.97]);
    for (const s of [1, -1]) {
      // 눈: 흰자 → 홍채 → 동공 → 하이라이트 → 속눈썹 (얼굴 표면 바로 앞에 겹쳐 붙인다)
      const e = new THREE.Group();
      e.position.set(0.036 * s, -0.008, 0.088);
      e.rotation.y = 0.32 * s;
      head.add(e);
      add(e, sphere(0.021, 16, 12), white, [0, 0, 0], [1.05, 1.0, 0.35], false);
      add(e, sphere(0.015, 16, 12), eye, [0.002 * -s, -0.002, 0.004], [0.95, 1.2, 0.35], false);
      add(e, sphere(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: 0x120a0a }), [0.002 * -s, -0.002, 0.007], [1, 1.2, 0.4], false);
      add(e, sphere(0.0045, 8, 6), white, [0.005 * s, 0.006, 0.009], [1, 1, 0.5], false);
      add(e, new THREE.BoxGeometry(0.046, 0.006, 0.004), hair, [0, 0.021, 0.004], [1, 1, 1], false).rotation.z = -0.12 * s;
      this.eyes.push(e);
      add(head, new THREE.BoxGeometry(0.026, 0.0035, 0.004), hair, [0.04 * s, 0.038, 0.095], [1, 1, 1], false).rotation.z =
        -0.08 * s; // 눈썹
      add(head, sphere(0.016, 10, 8), blush, [0.058 * s, -0.04, 0.08], [1.3, 0.6, 0.3], false); // 볼터치
    }
    add(head, sphere(0.009, 10, 8), lip, [0, -0.068, 0.084], [1.3, 0.35, 0.3], false); // 입

    // 머리카락: 정수리 덮개(앞 가장자리 = 일자 앞머리) + 뒷머리 + 옆머리
    const cap = add(head, new THREE.SphereGeometry(0.124, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, [0, 0.01, -0.006]);
    cap.rotation.x = -0.55;
    add(head, sphere(0.112, 24, 18), hair, [0, 0, -0.05], [1.04, 1.02, 0.85]); // 뒷머리 (턱은 가리지 않게 뒤로)
    for (const s of [1, -1]) add(head, sphere(1, 12, 10), hair, [0.097 * s, -0.055, 0.035], [0.022, 0.085, 0.028]);

    // 포니테일 (리본 + 흔들리는 마디)
    const tie = new THREE.Group();
    tie.position.set(0, 0.07, -0.1);
    head.add(tie);
    add(tie, new THREE.TorusGeometry(0.026, 0.011, 8, 16), outfit);
    for (const s of [1, -1]) {
      add(tie, sphere(1, 10, 8), outfit, [0.035 * s, 0.01, -0.01], [0.035, 0.022, 0.012]).rotation.z = 0.5 * s;
    }
    let parent: THREE.Object3D = tie;
    PONYTAIL_SEGMENTS.forEach((r, i) => {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = -0.085;
      parent.add(seg);
      add(seg, sphere(r, 14, 10), hair, [0, -0.045, 0], [1, 1.5, 0.9]);
      this.ponytail.push(seg);
      parent = seg;
    });

    // 팔: 민소매, 손목 밴드, 손가락 없는 글러브
    const j = this.joints;
    for (const [sh, el] of [[j.shL, j.elL], [j.shR, j.elR]] as const) {
      limb(sh, 0.042, 0.035, upperArm, skin);
      add(el, sphere(0.035), skin);
      limb(el, 0.034, 0.029, 0.2, skin);
      limb(el, 0.037, 0.037, 0.05, outfit, -0.14);
      add(el, sphere(0.039, 14, 12), dark, [0, -0.23, 0.005], [0.9, 1.15, 1.0]);
    }

    // 다리: 허벅지, 무릎, 종아리, 부츠
    for (const [hp, kn] of [[j.hpL, j.knL], [j.hpR, j.knR]] as const) {
      limb(hp, 0.07, 0.05, THIGH, skin);
      limb(hp, 0.078, 0.073, 0.1, dark, 0.03);
      add(kn, sphere(0.05), skin);
      limb(kn, 0.048, 0.034, SHIN - 0.04, skin);
      limb(kn, 0.054, 0.045, 0.25, boots, -0.19);
      ring(kn, 0.054, 0.01, trim, -0.19);
      add(kn, sphere(1, 14, 10), boots, [0, -SHIN + 0.005, 0.045], [0.05, 0.035, 0.11]);
    }
  }
}
