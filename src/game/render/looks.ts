import { HEROINE, type Appearance } from './mannequin';

/**
 * 플레이어 캐릭터 외형.
 * 모델: pixiv 의 VRM 샘플 (VRM1_Constraint_Twist_Sample, VRM Public License 1.0 —
 * 누구나 이용·상업 이용·수정·재배포 허용, 크레딧 불필요). 직접 만든 VRoid 모델로 바꾸려면 url 만 교체.
 */
export const PLAYER_LOOK: Appearance = { kind: 'vrm', url: '/models/heroine.vrm', fallback: HEROINE.crimson };

/** 대전 2P: 같은 모델에 푸른 색조 */
export const PLAYER2_LOOK: Appearance = {
  kind: 'vrm',
  url: '/models/heroine.vrm',
  fallback: HEROINE.azure,
  tint: 0x9db8ff,
};
