/**
 * 집안일 자세: 단계(choreFrame)마다 팔·상체·고개를 어떻게 두는지.
 * VRM 캐릭터와 절차적 모델이 같은 표를 쓴다. 각도는 mannequin Pose 와 같은 뜻
 * (sh: 어깨를 앞으로 드는 각도(음수 = 앞·위), el: 팔꿈치 굽힘(음수), ar: 팔 벌림(양수 = 바깥)).
 */
import { choreFrame, type ChoreKind } from '../city/chores';

export interface ArmPose {
  sh: number;
  el: number;
  ar: number;
  /** 위팔 비틀기 (팔꿈치가 굽는 쪽을 돌린다) */
  tw?: number;
}

export interface ChorePose {
  L: ArmPose;
  R: ArmPose;
  /** 상체 숙임 (양수 = 앞으로) */
  lean: number;
  /** 고개 숙임 (양수 = 아래, 음수 = 위를 본다) */
  head: number;
}

const arm = (sh: number, el: number, ar = 0, tw = 0): ArmPose => ({ sh, el, ar, tw });
const REST = arm(-0.15, -0.25, 0);

/**
 * @param t 동작을 시작한 지 프레임 (소수 가능)
 * @returns 이 순간의 자세 (자리로 걸어 들어가는 동안은 null = 평소 자세)
 */
export function chorePose(kind: ChoreKind, t: number): ChorePose | null {
  const f = choreFrame(kind, Math.max(0, Math.floor(t)));
  const s = Math.sin;
  const w = t * 0.35; // 문지르는 빠르기
  switch (f.step) {
    case 'walk':
      return null;
    case 'valve': // 오른손을 뻗어 손잡이를 돌린다
      return { L: REST, R: arm(-1.25, -0.35 + 0.15 * s(f.k * Math.PI), 0.15), lean: 0.05, head: 0.1 };
    case 'hair': // 두 손으로 머리를 감는다 (번갈아 문지른다)
      return { L: arm(-1.9 + 0.12 * s(w), -2.4, 0.4, -1.4), R: arm(-1.9 + 0.12 * s(w + Math.PI), -2.4, 0.4, 1.4), lean: 0.08, head: 0.2 };
    case 'body': // 팔과 몸통을 문지른다
      return { L: arm(-1.05 + 0.25 * s(w), -1.95, -0.45), R: arm(-1.2 + 0.25 * s(w + 1.6), -1.75, -0.5), lean: 0.12, head: 0.25 };
    case 'rinse': // 얼굴을 들고 물을 맞으며 머리를 쓸어 넘긴다
      return { L: arm(-2.3 + 0.2 * s(w * 0.5), -2.0, 0.25, -1.0), R: arm(-2.3 + 0.2 * s(w * 0.5 + 1), -2.0, 0.25, 1.0), lean: -0.1, head: -0.35 };
    case 'towel': // 수건으로 머리를 턴다
      return { L: arm(-1.95, -2.4 + 0.18 * s(w * 2.2), 0.4, -1.4), R: arm(-1.95, -2.4 + 0.18 * s(w * 2.2 + 1.5), 0.4, 1.4), lean: 0.15, head: 0.3 };
    case 'brush': // 오른손 칫솔을 좌우로, 왼손은 세면대를 짚는다
      return { L: arm(-0.75, -0.45, 0), R: arm(-1.2, -2.45, -0.2 + 0.12 * s(w * 3)), lean: 0.15, head: 0.05 };
    case 'spit': // 숙여서 입을 헹군다
      return { L: arm(-0.75, -0.4, 0), R: arm(-1.0, -1.6, -0.2), lean: 0.5, head: 0.35 };
    case 'pick': // 아래로 숙여 집어 든다
      return { L: arm(-0.95, -0.45, -0.1), R: arm(-0.95, -0.45, 0.05), lean: kind === 'hang' ? 0.65 : 0.35, head: 0.35 };
    case 'scrub': // 왼손에 그릇, 오른손 수세미로 둥글게
      return { L: arm(-0.95, -1.35, -0.2), R: arm(-1.0 + 0.16 * s(w * 1.5), -1.5 + 0.2 * Math.cos(w * 1.5), -0.35), lean: 0.25, head: 0.35 };
    case 'wash': // 수도꼭지 아래에서 헹군다
      return { L: arm(-0.8, -1.0, -0.25), R: arm(-0.85 + 0.08 * s(w), -1.0, -0.2), lean: 0.3, head: 0.35 };
    case 'place': // 옆으로 뻗어 올려놓는다
      return kind === 'hang'
        ? { L: arm(-2.2, -0.35, 0.05), R: arm(-2.2, -0.35, 0.05), lean: 0, head: -0.1 }
        : { L: REST, R: arm(-1.2, -0.45, 0.55 * f.k), lean: 0.15, head: 0.2 };
    case 'door': // 낮은 세탁기 문을 연다·닫는다
      return { L: arm(-0.3, -0.3, 0), R: arm(-0.75, -0.3, 0.05), lean: 0.45, head: 0.35 };
    case 'stuff': // 깊이 숙여 번갈아 넣는다·꺼낸다
      return { L: arm(-0.6 + 0.3 * s(w), -0.4, -0.05), R: arm(-0.6 + 0.3 * s(w + Math.PI), -0.4, 0.05), lean: 0.8, head: 0.3 };
    case 'press': // 버튼을 누른다
      return { L: REST, R: arm(-1.15, -0.55 + 0.15 * Math.max(0, s(t * 0.5)), 0), lean: 0.3, head: 0.3 };
    case 'hang': // 두 손을 들어 건조대에 넌다
      return { L: arm(-2.4 + 0.1 * s(w), -0.3, 0), R: arm(-2.4 + 0.1 * s(w + 1), -0.3, 0), lean: -0.05, head: -0.15 };
    case 'fold': // 가슴 앞에서 접는다 (두 손이 모였다 벌어진다)
      return { L: arm(-0.95, -1.25, -0.1 + 0.35 * Math.abs(s(f.k * Math.PI))), R: arm(-0.95, -1.25, -0.1 + 0.35 * Math.abs(s(f.k * Math.PI))), lean: 0.2, head: 0.35 };
  }
}
