/**
 * 2D 컷신(애니메이션 영상) 목록. 파일은 public/cinematics/ 에 둔다.
 *
 * 컷신은 캐릭터 그림(원본 일러스트)으로 만들기 때문에 몸(body)마다 따로 있다:
 * 내 몸에 맞는 컷신이 없으면 재생하지 않고 그냥 지나간다 (다른 캐릭터 얼굴이 내 이야기에 나오지 않게).
 */
export type CinematicShot =
  /** 영상 한 컷 (소리 없음) */
  | {
      video: string;
      poster?: string;
      /** 이 초까지만 틀고 넘긴다 (영상 끝이 어색할 때) */
      until?: number;
      /** 재생 속도 (슬로모션으로 만든 영상을 빠르게 틀 때 1.5 등) */
      rate?: number;
    }
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
        // 안개 속에서 붉은 눈의 그림자가 다가오고, 소녀는 입을 막고 떤다 (5초, 고개는 돌리지 않는다)
        { video: '/cinematics/prologue-chase/meet.mp4', poster: '/cinematics/prologue-chase/still-1.jpg' },
        // 겁에 질린 얼굴 클로즈업 (몬스터는 안 보이게): 숨을 몰아쉬며 떨고 두리번거린다
        { video: '/cinematics/prologue-chase/panic.mp4' },
        // 숲길을 달려 도망, 그림자는 멀리 뒤에서 쫓아온다 → 그대로 추격 조작으로
        // 슬로모션으로 만들어 얼굴이 번지지 않게 하고, 게임에선 빠르게 튼다
        { video: '/cinematics/prologue-chase/run.mp4', rate: 1.6 },
      ],
    },
  },
  /** 프롤로그: 막다른 벼랑에서 뛰어내린다 (벼랑에서 바로 고르거나, 맞서다 몰려서) → 암전 → 마을에서 깨어난다 */
  prologueJump: {
    byBody: {
      smallSilverGirl: [
        // 벼랑 끝: 까마득한 아래 마을 불빛, 뒤에서 다가오는 그림자 → 돌아보며 마음을 굳히고 한 걸음 물러선다
        { video: '/cinematics/prologue-jump/edge.mp4' },
        // 허공으로 몸을 던진다: 슬로모션으로 만들어 얼굴이 번지지 않게 하고, 조금 빠르게 튼다
        { video: '/cinematics/prologue-jump/fall.mp4', rate: 1.25 },
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
