// 모든 시간 단위는 "프레임"(1/60초), 거리 단위는 미터.

export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

// 스테이지 / 충돌
export const STAGE_RADIUS = 7;
export const FIGHTER_RADIUS = 0.32;
/** 공격 판정의 기본 좌우 폭. 여기에 기술별 tracking 이 더해진다. */
export const HIT_WIDTH = 0.35;

// 이동
export const WALK_FWD = 0.04;
export const WALK_BACK = 0.032;
/** 플레이어 캐릭터 템포: 기술 발생·후딜이 이 배율만큼 빨라지고, 이동도 빨라진다 */
export const PLAYER_TEMPO = 1.3;
/** 필드 자유 이동 속도 */
export const RUN_SPEED = 0.075;
/** 대시: 약 2.4m (플레이어 템포 1.3 기준) */
export const DASH_SPEED = 0.15;
export const DASH_FRAMES = 20;
/** 대시가 끝날 때 미끄러지며 멈추는 짧은 딜레이 */
export const DASH_RECOVERY = 5;
/** 자유 이동(도시·필드) 대시 쿨타임: 대시를 시작한 뒤 이만큼 지나야 다시 대시 (0.75초) */
export const DASH_COOLDOWN = 45;
/** 대시 시작 후 이 프레임부터 점프·연속 대시로 끊을 수 있다 (대시 공격은 언제든) */
export const DASH_CANCEL_FROM = 8;
export const BACKDASH_SPEED = 0.1;
export const BACKDASH_FRAMES = 22;
export const SIDESTEP_SPEED = 0.065;
export const SIDESTEP_FRAMES = 16;

// 공중 / 다운
export const GRAVITY = 0.011;
/** 점프 초속 (약 0.8m 높이, 0.4초 체공) */
export const JUMP_VEL = 0.133;
/** 앞/뒤 점프 이동 속도 */
export const JUMP_FWD = 0.05;
export const JUGGLE_POP = 0.1;
export const LAUNCH_DRIFT = 0.006;
export const KNOCKDOWN_FRAMES = 40;
export const GETUP_FRAMES = 20;

// 히트
export const COUNTER_HITSTUN_BONUS = 6;
export const COUNTER_DAMAGE = 1.2;
export const HITSTOP_HIT = 7;
export const HITSTOP_COUNTER = 11;
export const HITSTOP_BLOCK = 4;
export const HITSTOP_KO = 40;

// 입력
export const BUFFER_FRAMES = 8;
export const TAP_FRAMES = 7;
export const INPUT_HISTORY = 30;

// 라운드
export const MAX_HP = 170;
export const ROUND_TIME = 60;
export const ROUNDS_TO_WIN = 2;
export const INTRO_FRAMES = 110;
export const ROUND_END_FRAMES = 180;
