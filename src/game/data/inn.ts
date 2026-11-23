/**
 * 경계 마을 "달빛 여관" 1층 안 (게스트하우스). 마을의 여관 문(동쪽)으로 걸어 들어가면 여기로 옮겨진다.
 * 여러 사람이 같이 지내는 곳이라 같은 차원 사람들이 모두 같은 방을 본다 (좌표는 필드와 같은 월드 좌표, 마을에서 멀리 떨어진 곳).
 *
 *   북(-z)
 *   ┌──────────┬────────────┬────────────┐
 *   │ 씻는 곳  │  먹는 곳   │  자는 곳   │
 *   │ 샤워 3칸 │ 주방·식탁  │  침대 6개  │
 *   ├──문──────┴────문──────┴───문───────┤
 *   │          복도 · 로비 (안내 데스크)  │
 *   └────────────────문──────────────────┘ 남(+z) → 마을로
 */

/** 여관 안 (바깥벽 안쪽) */
export const INN = { name: '달빛 여관', x0: 91, x1: 109, z0: 26, z1: 38 } as const;
/** 방 칸막이 (복도 쪽 벽 z) */
export const INN_HALL_Z = 33.5;
/** 방 (안내 글자·조명 위치) */
export const INN_ROOMS = [
  { id: 'bath', name: '씻는 곳', x0: 91, x1: 96.5 },
  { id: 'dining', name: '먹는 곳', x0: 96.5, x1: 102.5 },
  { id: 'dorm', name: '자는 곳', x0: 102.5, x1: 109 },
] as const;
/** 복도에서 방으로 들어가는 문 (x 범위) */
export const INN_ROOM_DOORS: { room: (typeof INN_ROOMS)[number]['id']; x0: number; x1: number }[] = [
  { room: 'bath', x0: 93.2, x1: 94.8 },
  { room: 'dining', x0: 98.6, x1: 100.6 },
  { room: 'dorm', x0: 104.2, x1: 105.8 },
];

/** 여관 안 남쪽 문 (마을로 나가는 문) */
export const INN_EXIT = { x: 100, halfWidth: 0.6 } as const;
/** 들어오면 서는 자리 (남쪽 문 앞, 안쪽을 본다) */
export const INN_ENTRY = { x: 100, z: 37.1 } as const;
/** 마을에서 여관 문 (여관 건물 동쪽 벽 가운데) 과 나왔을 때 서는 자리 */
export const INN_DOOR_OUT = { x: -8.8, z: 30.6, halfWidth: 0.55 } as const;
export const INN_LEAVE = { x: -7.9, z: 30.6 } as const;

/** 막힌 곳 (벽·가구). x0~x1, z0~z1 사각형 */
export interface InnBlock {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const WALL = 0.1;
export const INN_WALLS: InnBlock[] = (() => {
  const out: InnBlock[] = [];
  // 방 사이 칸막이 (복도까지)
  for (const x of [96.5, 102.5]) out.push({ x0: x - WALL, x1: x + WALL, z0: INN.z0, z1: INN_HALL_Z });
  // 복도 쪽 벽: 문 자리만 비운다
  let x: number = INN.x0;
  for (const d of INN_ROOM_DOORS) {
    out.push({ x0: x, x1: d.x0, z0: INN_HALL_Z - WALL, z1: INN_HALL_Z + WALL });
    x = d.x1;
  }
  out.push({ x0: x, x1: INN.x1, z0: INN_HALL_Z - WALL, z1: INN_HALL_Z + WALL });
  return out;
})();

/** 침대 하나 (머리 = 북쪽). 서울 집 침대와 같은 높이·눕는 자세 */
export interface InnBed {
  /** 가운데 x · 머리판 z */
  x: number;
  head: number;
}
export const BED_W = 1.1;
export const BED_L = 2.2;
export const INN_BEDS: InnBed[] = [104, 105.95, 107.9].flatMap((x) => [
  { x, head: 26.0 },
  { x, head: 29.6 },
]);
/** 침대 옆에 서는 자리 (서쪽, E 로 눕는다) */
export const bedStand = (b: InnBed) => ({ x: b.x - BED_W / 2 - 0.37, z: b.head + 1.1 });
/** 걸터앉는 골반 · 누운 자리 (렌더러 RestPose 기준, 서울 집 침대와 같은 비율) */
export const bedPose = (b: InnBed) => ({
  sit: { x: b.x - 0.5, z: b.head + 1.09, yaw: -Math.PI / 2 },
  lie: { x: b.x, y: 0.8, z: b.head + 1.95, yaw: 0 },
});

/** 샤워 칸 (북쪽 벽에 붙은 세 칸). 커튼이 남쪽 */
export const BOOTH_W = 1.25;
export const BOOTH_D = 1.3;
export const INN_BOOTHS = [0, 1, 2].map((i) => ({ x: 91.25 + BOOTH_W / 2 + i * 1.4, z: INN.z0 + BOOTH_D / 2 }));
/** 샤워 칸 앞 (E 로 들어간다) */
export const boothStand = (b: { x: number; z: number }) => ({ x: b.x, z: b.z + BOOTH_D / 2 + 0.45 });

/** 가구 (부딪힌다): 샤워 칸 · 세면대 · 나무 욕조 · 주방 카운터 · 식탁 · 침대 · 안내 데스크 · 벤치 */
export const INN_FURNITURE: InnBlock[] = [
  ...INN_BOOTHS.map((b) => ({ x0: b.x - BOOTH_W / 2 - 0.05, x1: b.x + BOOTH_W / 2 + 0.05, z0: INN.z0, z1: INN.z0 + BOOTH_D + 0.05 })),
  { x0: 91, x1: 91.62, z0: 29, z1: 31.4 }, // 세면대
  { x0: 94.55, x1: 95.95, z0: 30.75, z1: 32.15 }, // 나무 욕조
  { x0: 97.4, x1: 101.6, z0: 27.3, z1: 27.95 }, // 주방 카운터
  { x0: 97.35, x1: 99.05, z0: 29.25, z1: 30.95 }, // 식탁 1 (+ 의자)
  { x0: 100.05, x1: 101.75, z0: 29.25, z1: 30.95 }, // 식탁 2
  ...INN_BEDS.map((b) => ({ x0: b.x - BED_W / 2, x1: b.x + BED_W / 2, z0: b.head, z1: b.head + BED_L })),
  { x0: 95.4, x1: 97.7, z0: 35.9, z1: 36.55 }, // 안내 데스크
  { x0: 106.4, x1: 108.6, z0: 37.25, z1: 37.75 }, // 로비 벤치
];

/** 여관 안 E 로 쓰는 곳까지 거리 */
export const INN_SPOT_RANGE = 0.85;

/** 하룻밤 숙박비 (은화). 처음 한 번은 달래가 공짜로 재워 준다 */
export const INN_BED_PRICE = 30;
/** 샤워 시간 (프레임) */
export const SHOWER_FRAMES = 6 * 60;
/** 눕기 · 일어나기 (프레임) · 누운 뒤 깨우지 않는 시간 */
export const SLEEP_LIE_FRAMES = 200;
export const SLEEP_WAKE_FRAMES = 150;
export const SLEEP_SETTLE_FRAMES = 60;
/** 이 피로도부터 잘 수 있다 */
export const INN_SLEEPY = 30;
/** 서울 집 침대와 같은 속도: 실제 2시간에 피로 100 회복 · 12시간에 배고픔 100 · 30분에 HP 가득 · 최대 12시간 */
export const SLEEP_MAX_MS = 12 * 3_600_000;
export const SLEEP_FATIGUE_PER_MS = 100 / (2 * 3_600_000);
export const SLEEP_HUNGER_PER_MS = 100 / (12 * 3_600_000);
export const SLEEP_HP_PER_MS = 1 / (30 * 60_000);

/** 식당 메뉴 (은화로만 판다) */
export interface InnMeal {
  id: string;
  name: string;
  icon: string;
  price: number;
  hunger: number;
  fatigue: number;
  /** HP 도 가득 */
  hp?: boolean;
  desc: string;
}
export const INN_MENU: InnMeal[] = [
  { id: 'tea', name: '허브차', icon: '🍵', price: 5, hunger: 3, fatigue: 6, desc: '따뜻한 차 한 잔. 피로가 조금 풀린다' },
  { id: 'soup', name: '빵과 수프', icon: '🥣', price: 10, hunger: 30, fatigue: 0, desc: '갓 구운 빵에 감자 수프' },
  { id: 'stew', name: '사냥꾼 스튜', icon: '🍲', price: 22, hunger: 55, fatigue: 5, desc: '고기를 듬뿍 넣고 오래 끓였다' },
  { id: 'set', name: '달빛 정식', icon: '🍱', price: 40, hunger: 85, fatigue: 10, hp: true, desc: '여관 대표 메뉴. 먹고 나면 기운이 가득' },
];

/** 차원 돈 이름 */
export const COIN_NAME = '은화';

/** 여관 안에 있나 */
export function inInn(x: number, z: number): boolean {
  return x > INN.x0 - 0.5 && x < INN.x1 + 0.5 && z > INN.z0 - 0.5 && z < INN.z1 + 0.5;
}

/** 지금 있는 방 (복도면 'hall') */
export function innRoomAt(x: number, z: number): (typeof INN_ROOMS)[number]['id'] | 'hall' {
  if (z > INN_HALL_Z) return 'hall';
  return INN_ROOMS.find((r) => x >= r.x0 && x < r.x1)?.id ?? 'hall';
}
