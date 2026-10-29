import { FIGHTER_RADIUS, STAGE_RADIUS } from './constants';
import type { Fighter } from './fighter';

/** 1:1 원형 경기장 공용 로직 (대전 Match, 보스전 BossBattle) */

export interface CameraAxis {
  /** 두 캐릭터 중점에서 카메라 쪽을 향하는 단위 벡터 */
  camNx: number;
  camNz: number;
}

/** 카메라는 두 캐릭터를 잇는 축에 수직. 부호는 이전 프레임과 연속이 되게 유지한다. */
export function updateCameraAxis(cam: CameraAxis, a: Fighter, b: Fighter) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  let nx = -dz / len;
  let nz = dx / len;
  if (nx * cam.camNx + nz * cam.camNz < 0) {
    nx = -nx;
    nz = -nz;
  }
  cam.camNx = nx;
  cam.camNz = nz;
}

/** 상대가 화면 오른쪽에 있으면 true (→ 가 앞) */
export function forwardIsRight(cam: CameraAxis, self: Fighter, opp: Fighter): boolean {
  // 카메라가 -n 을 볼 때 화면 오른쪽 = (nz, -nx)
  return (opp.x - self.x) * cam.camNz + (opp.z - self.z) * -cam.camNx > 0;
}

/** 겹침 해소 + 원형 경기장 밖으로 못 나가게 */
export function separateInRing(a: Fighter, b: Fighter, radius = STAGE_RADIUS) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = FIGHTER_RADIUS * 2;
  if (d < min && d > 1e-6) {
    const push = (min - d) / 2;
    a.x -= (dx / d) * push;
    a.z -= (dz / d) * push;
    b.x += (dx / d) * push;
    b.z += (dz / d) * push;
  }
  for (const f of [a, b]) {
    const r = Math.hypot(f.x, f.z);
    const max = radius - FIGHTER_RADIUS;
    if (r > max) {
      f.x *= max / r;
      f.z *= max / r;
    }
  }
}
