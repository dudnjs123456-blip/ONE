import { HEROINE, type Appearance } from './mannequin';

/**
 * 플레이어 캐릭터 외형 (코디 창에서 남자·여자를 고른다, 프로필 body 에 저장).
 * - 여자: pixiv 의 VRM 샘플 (VRM1_Constraint_Twist_Sample, VRM Public License 1.0 —
 *   누구나 이용·상업 이용·수정·재배포 허용, 크레딧 불필요)
 * - 남자: VRoid 프로젝트 샘플 '桜田 史利矢' (VRoid Hub 라이선스: 이용·수정·재배포·상업 이용 모두 허용, 크레딧 불필요)
 * - 핑크·은발·은발 소년: 사용자가 VRoid Studio 로 직접 꾸민 캐릭터 (VRoid 샘플 기반, 텍스처는 shrink-vrm 으로 1024 로 줄임)
 * 직접 만든 모델로 바꾸려면 url 만 교체. 새 외형은 BODY_TYPES 에 한 줄 추가.
 */
export const BODY_TYPES = [
  { id: 'female', label: '여자', icon: '👩', url: '/models/heroine.vrm' },
  { id: 'male', label: '남자', icon: '👨', url: '/models/hero.vrm' },
  { id: 'pink', label: '핑크', icon: '🎀', url: '/models/pinky.vrm' },
  { id: 'silver', label: '은발', icon: '🤍', url: '/models/silver.vrm' },
  { id: 'silverboy', label: '은발 소년', icon: '🧑', url: '/models/silverboy.vrm' },
] as const;

export type BodyType = (typeof BODY_TYPES)[number]['id'];

/** 기본은 여자 캐릭터 (모르는 값도 여자로) */
export function bodyUrl(body?: string): string {
  return (BODY_TYPES.find((b) => b.id === body) ?? BODY_TYPES[0]).url;
}

export const PLAYER_LOOK: Appearance = { kind: 'vrm', url: bodyUrl(), fallback: HEROINE.crimson };

/** 대전 2P: 같은 모델에 푸른 색조 */
export const PLAYER2_LOOK: Appearance = {
  kind: 'vrm',
  url: bodyUrl(),
  fallback: HEROINE.azure,
  tint: 0x9db8ff,
};

/** 주인공 + 고른 몸 + 입은 코디 (필드·보스에서도 같은 모습) */
export function playerLook(outfit: string[], body?: string): Appearance {
  return { kind: 'vrm', url: bodyUrl(body), fallback: HEROINE.crimson, outfit };
}
