/**
 * 캐릭터별 몸 치수(미터)와 반응 속도. 타격 판정(팔·다리 끝이 실제로 닿는가)과 자동 회피에 쓴다.
 * 팔·다리 길이는 public/models/*.vrm 의 뼈 위치를 재서 넣은 값이다 (어깨→팔꿈치→손목, 고관절→무릎→발목).
 */
export interface BodySpec {
  /** 어깨 → 팔꿈치 */
  upperArm: number;
  /** 팔꿈치 → 주먹 끝 (손 포함) */
  lowerArm: number;
  /** 고관절 → 무릎 */
  thigh: number;
  /** 무릎 → 발 끝 (발 포함) */
  shin: number;
  /** 골반 중심 → 고관절 (좌우) */
  hipX: number;
  /** 골반 중심 → 어깨 (좌우) */
  shX: number;
  /** 골반 중심 → 어깨 (높이) */
  shY: number;
  /** 키 (머리 꼭대기) */
  height: number;
  /** 몸통 굵기: 맞는 쪽 몸을 세운 원기둥의 반지름 (어깨 폭 + 위팔 굵기 정도) */
  radius: number;
  /** 상대의 공격 시작을 보고 몸이 반응하기까지 걸리는 프레임 (60fps). 작을수록 빠르다 */
  reaction: number;
}

const HAND = 0.08;
const FOOT = 0.09;

/** VRM 실측값 → BodySpec */
function vrm(m: {
  upperArm: number; lowerArm: number; thigh: number; shin: number; hipX: number; hipsY: number;
  shoulderY: number; shoulderX: number; headY: number;
}, radius: number, reaction: number): BodySpec {
  return {
    upperArm: m.upperArm,
    lowerArm: m.lowerArm + HAND,
    thigh: m.thigh,
    shin: m.shin + FOOT,
    hipX: m.hipX,
    shX: m.shoulderX,
    shY: m.shoulderY - m.hipsY,
    height: m.headY + 0.13,
    radius,
    reaction,
  };
}

export const BODY_SPECS = {
  female: vrm({ upperArm: 0.22, lowerArm: 0.215, thigh: 0.353, shin: 0.415, hipX: 0.077, hipsY: 0.908, shoulderY: 1.274, shoulderX: 0.109, headY: 1.386 }, 0.19, 15),
  male: vrm({ upperArm: 0.22, lowerArm: 0.249, thigh: 0.454, shin: 0.517, hipX: 0.085, hipsY: 1.134, shoulderY: 1.531, shoulderX: 0.148, headY: 1.672 }, 0.23, 14),
  pink: vrm({ upperArm: 0.254, lowerArm: 0.227, thigh: 0.365, shin: 0.409, hipX: 0.069, hipsY: 0.897, shoulderY: 1.249, shoulderX: 0.08, headY: 1.353 }, 0.17, 16),
  silver: vrm({ upperArm: 0.268, lowerArm: 0.239, thigh: 0.385, shin: 0.432, hipX: 0.073, hipsY: 0.96, shoulderY: 1.332, shoulderX: 0.085, headY: 1.442 }, 0.17, 13),
  silverboy: vrm({ upperArm: 0.231, lowerArm: 0.262, thigh: 0.386, shin: 0.462, hipX: 0.089, hipsY: 1.038, shoulderY: 1.485, shoulderX: 0.157, headY: 1.632 }, 0.24, 13),
  smallSilverGirl: vrm({ upperArm: 0.235, lowerArm: 0.226, thigh: 0.369, shin: 0.431, hipX: 0.077, hipsY: 0.949, shoulderY: 1.315, shoulderX: 0.106, headY: 1.427 }, 0.19, 11),
  /** 도시 행인·경비 등 일반 성인 NPC */
  npc: { upperArm: 0.27, lowerArm: 0.33, thigh: 0.42, shin: 0.54, hipX: 0.09, shX: 0.16, shY: 0.42, height: 1.72, radius: 0.24, reaction: 18 },
  /** 경찰: 훈련받아 반응이 빠르다 */
  police: { upperArm: 0.28, lowerArm: 0.34, thigh: 0.44, shin: 0.55, hipX: 0.09, shX: 0.17, shY: 0.44, height: 1.78, radius: 0.25, reaction: 14 },
} satisfies Record<string, BodySpec>;

export type BodySpecId = keyof typeof BODY_SPECS;

/** 외형 id(프로필 body) → 몸 치수. 모르는 값은 기본 외형(여자) */
export function bodySpecFor(body?: string): BodySpec {
  return (BODY_SPECS as Record<string, BodySpec>)[body ?? 'female'] ?? BODY_SPECS.female;
}
