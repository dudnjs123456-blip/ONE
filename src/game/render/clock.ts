/**
 * 한 번의 화면 그리기에 필요한 시간 정보.
 * 게임 로직은 60fps 고정 스텝이고, 화면은 모니터 주사율대로 그리므로
 * 그 사이를 보간해서 어느 주사율에서도 부드럽게 보이게 한다.
 */
export interface FrameClock {
  /** 연속 시간 (로직 프레임 단위, 소수 포함). 숨쉬기·걷기 사이클용 */
  t: number;
  /** 위치 보간 비율. 0 = 직전 로직 프레임, 1 = 현재 */
  alpha: number;
  /** 기술 진행 보간용 프레임 오프셋 (-1 ~ 0). 히트스톱 중엔 0 (멈춤) */
  sub: number;
  /** 직전 그리기 이후 흐른 실제 시간 (초) */
  dt: number;
}

/**
 * 로직이 스텝을 몇 번 돌았는지와 남은 누적 시간으로 시계를 만든다.
 * @param frozen 히트스톱 중이면 true (동작을 보간하지 않고 그 자리에 멈춤)
 */
export function makeClock(frame: number, alpha: number, frozen: boolean, dt: number): FrameClock {
  return { t: frame - 1 + alpha, alpha, sub: frozen ? 0 : alpha - 1, dt };
}

/** 60fps 기준 '프레임마다 k 만큼 다가가기' 를 실제 경과 시간 기준으로 바꾼 계수 */
export function smooth(k: number, dt: number): number {
  return 1 - Math.pow(1 - k, dt * 60);
}
