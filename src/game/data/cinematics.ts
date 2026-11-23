/**
 * 2D 컷신(애니메이션 영상) 목록. 파일은 public/cinematics/ 에 둔다.
 *
 * 컷신은 캐릭터 그림(원본 일러스트)으로 만들기 때문에 몸(body)마다 따로 있다:
 * 내 몸에 맞는 컷신이 없으면 재생하지 않고 그냥 지나간다 (다른 캐릭터 얼굴이 내 이야기에 나오지 않게).
 */
export type CinematicShot =
  /** 영상 한 컷 (소리 없음) */
  | { video: string; poster?: string; /** 이 초까지만 틀고 넘긴다 (영상 끝이 어색할 때) */ until?: number }
  /** 그림 한 장을 천천히 당겨 보여 준다 (ms 동안) */
  | { image: string; ms: number };

export interface Cinematic {
  /** 몸 id → 컷 목록. '*' 는 몸과 상관없이 (캐릭터가 나오지 않는 컷신) */
  byBody: Record<string, CinematicShot[]>;
}

export const CINEMATICS = {
  /** 프롤로그: 안개 숲에서 그림자를 만난 직후, 도망치기 시작하는 장면 */
  prologueChase: {
    byBody: {
      smallSilverGirl: [
        // 안개 속 그림자의 붉은 눈 → 뒤돌아보며 물러선다 (5초)
        // (1.7초 뒤엔 고개를 돌리며 옆얼굴이 일그러져 잘라 낸다)
        { video: '/cinematics/prologue-chase/meet.mp4', poster: '/cinematics/prologue-chase/still-1.jpg', until: 1.7 },
        // 겁에 질린 얼굴 클로즈업 (몬스터는 안 보이게): 숨을 몰아쉬며 떨고 두리번거린다
        { video: '/cinematics/prologue-chase/panic.mp4' },
        // 숲길을 달려 도망, 바로 뒤로 덮쳐 오는 검은 손톱 (5초) → 그대로 추격 조작으로
        { video: '/cinematics/prologue-chase/run.mp4' },
      ],
    },
  },
} satisfies Record<string, Cinematic>;

export type CinematicId = keyof typeof CINEMATICS;

/** 이 몸으로 볼 컷 목록 (없으면 null = 컷신 없이 넘어간다) */
export function cinematicShots(id: CinematicId, body: string | undefined): CinematicShot[] | null {
  const c: Cinematic = CINEMATICS[id];
  return (body && c.byBody[body]) || c.byBody['*'] || null;
}
