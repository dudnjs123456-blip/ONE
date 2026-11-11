import { FIGHTER_RADIUS, PLAYER_TEMPO } from '../core/constants';
import { mulberry32 } from '../core/controllers';
import { Fighter, type FighterState } from '../core/fighter';
import { NEUTRAL_INPUT, dirFrom } from '../core/input';
import { gainExp, saveProfile, type FridgeFood, type PlayerProfile } from '../core/profile';
import type { Buttons } from '../core/types';
import { applyHit, detectHit, type CombatEvent } from '../core/combat';
import { ITEMS, ITEM_IDS } from '../data/items';
import { SHOPS, type ShopDef } from '../data/shops';
import { CHAT_GAP_MS, CHAT_KEEP, EMOTES, EMOTE_GAP_MS, cleanChat, type ChatLine } from './chat';
import { LIFE_WARNING, LifeTracker } from '../core/life';
import { CityNav } from './cityNav';
import { buildCityMap, CITY_CONST, type CityMap, type Poi } from './cityMap';
import { SONG_PACKS, SONG_PRICE, isSeatedAct, type KaraokeAct } from './karaoke';

/** 코인노래방 사장님 한마디 (카운터에서 E) */
const KARAOKE_TALK = [
  `한 곡에 ${SONG_PRICE}G, 5곡이면 220G예요~ 빈방 골라 드릴게요!`,
  '어서 오세요~ 몇 곡 부르실래요? 많이 사면 더 싸요!',
  '탬버린 흔들면 점수가 좀 더 잘 나온대요~ 🔔',
  '30초 넘게 부르면 점수 나와요! 100점 나오면 사진 찍어 가세요~',
];
import { MOVES, totalFrames, type MoveDef } from '../data/moves';
import { EQUIPS, ensureGear, playerStats } from '../data/equipment';
import { COSMETIC_BY_ID, ensureWardrobe, wornList, type CosmeticDef, type CosmeticSlot } from '../data/fashion';
import { JOB_BY_ID, ROBBER_TIERS } from '../data/jobs';
import { GuardShift, LOBBY_PATH, type LobbyPerson, type NetJobScene, type ShiftEnd } from './guardJob';
import { unitPlace, villaFloor } from './villa';
import { SeniorAI, type NetSenior } from './senior';
import { roadSolids, stopLines, vehicleLight, type Light, type Rect as RoadRect } from './traffic';
import { PetCare } from './pets';
import { KARAOKE_BOOTHS, PenSim, SHOP_BUILDING_FLOORS, STAIR, STAIR_TOP, boothDoorRect, petGoodsStock, petStock, stairFloorOf, stairSign, storeLayout, type ClothesCorner, type KaraokeBooth, type StockPet, type StoreLayout } from './store';
import { PET_BY_ID, PET_GOOD_BY_ID, PET_SHOP_NAME, coatOf } from '../data/pets';
import { FishingSession, type FishPhase, type FishResult, type FishScene } from './fishing';
import { BAITS, BAIT_BY_ID, BASKET_MAX, FISHING_SHOP_NAME, FISH_BY_ID, ROD_BY_ID, TIER_INFO, TIME_LABEL, anglerOf, currentSetup, ensureFishing, fmtKg, sellPrice, type Angler, type BaitId, type FishSetup, type FishingState } from '../data/fishing';
import { weatherAt, type WeatherState } from './weather';
import { CLOCK_EPOCH, MS_PER_GAME_MINUTE, gameTimeAt, sharedNow } from './worldClock';
import { PARK, RIDES, RIDE_IDS, RIDE_NODE, WHEEL, WHEEL_RIDE_MS, parkPathTo, parkPois, parkSolids, rideClock, wheelCabinAtBottom, type RideId } from './themePark';

export type CityLocation = 'city' | 'home' | 'lobby' | 'corridor' | 'store' | 'park';

/** 마지막으로 있던 곳 (새로고침 후 이어서 시작) */
export interface PlaceSnapshot {
  loc: CityLocation;
  x: number;
  z: number;
  fx: number;
  fz: number;
  floor: number;
  /** 가게 안이면 그 가게 간판 */
  sign?: string;
  /** 가게에서 나가면 설 자리 */
  back?: { x: number; z: number };
  friendHome?: boolean;
}

/** 문 하나 지나가기 (passDoor) */
export interface DoorPass {
  /** 처음에 열리는 문 / 들어선 쪽에서 닫히는 문 */
  open: string;
  close: string;
  /** 문 쪽을 보는 방향 · 문턱까지 걸어갈 곳 · 들어선 뒤 걸어 나올 곳 */
  face: { x: number; z: number };
  to: { x: number; z: number };
  out: { x: number; z: number };
  /** 장소를 옮긴다 (화면이 깜깜할 때) */
  arrive: () => void;
}

export interface CityInput {
  /** 월드 기준 이동 방향 (카메라 기준으로 이미 변환됨) */
  move: { x: number; z: number } | null;
  run: boolean;
  /** 이번 프레임에 상호작용 키를 눌렀나 */
  interact: boolean;
  /** 공격 버튼 1~4 (Q W A S). 누르면 그 자리에서 기술이 나간다 */
  buttons?: Buttons;
  /** 기술 입력 때 '아래' (Shift) */
  crouch?: boolean;
  /** 터치 조이스틱을 아래로만 밀고 있나 (터치에서 싸울 때 숙이기) */
  down?: boolean;
  /** 숙이기 키(C)를 누르고 있나 (싸울 때 숙이기) */
  duck?: boolean;
  jump?: boolean;
  /** 이번 프레임에 점프 키(Space)를 새로 눌렀나 (낚시 연타) */
  jumpTap?: boolean;
  /** 작은은발소녀 전용 스킬 입력 */
  skill?: 'flyingKick' | 'tornadoKick' | 'backTurnKick';
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 원룸 오피스텔 내부 (집 전용 좌표, 방 중심이 원점). 가구는 부딪힘 판정 상자 */
export const HOME = {
  room: { x0: -5, x1: 5, z0: -4, z1: 4 } as Rect,
  /** 들어왔을 때 서는 곳 (서쪽 현관 안쪽) */
  spawn: { x: -4.2, z: 2.5 },
  furniture: [
    { id: 'bed', rect: { x0: 2.3, x1: 4.95, z0: -3.95, z1: -0.9 } },
    { id: 'desk', rect: { x0: -2.2, x1: 0.4, z0: -3.95, z1: -3.2 } },
    { id: 'kitchen', rect: { x0: -4.95, x1: -4.2, z0: -3.95, z1: -0.6 } },
    { id: 'fridge', rect: { x0: -4.95, x1: -4.15, z0: -0.5, z1: 0.4 } },
    { id: 'tv', rect: { x0: 2.4, x1: 4.6, z0: 0.0, z1: 0.45 } },
    { id: 'sofa', rect: { x0: 1.9, x1: 4.9, z0: 2.8, z1: 3.95 } },
    { id: 'table', rect: { x0: 2.8, x1: 4.0, z0: 1.4, z1: 2.1 } },
    { id: 'shoes', rect: { x0: -3.6, x1: -2.2, z0: 3.55, z1: 3.95 } },
  ] as { id: string; rect: Rect }[],
  pois: [
    { id: 'exit', kind: 'home', label: '현관 (밖으로 나가기)', x: -4.3, z: 2.5, radius: 1.0 },
    { id: 'bed', kind: 'home', label: '침대', x: 3.6, z: -0.5, radius: 1.1 },
    { id: 'pc', kind: 'home', label: '컴퓨터', x: -0.9, z: -2.8, radius: 1.0 },
    { id: 'fridge', kind: 'home', label: '냉장고', x: -3.8, z: 0.0, radius: 1.0 },
    { id: 'sofa', kind: 'home', label: '소파 (눕기)', x: 3.4, z: 2.4, radius: 1.0 },
    { id: 'tv', kind: 'home', label: 'TV (유튜브 보기)', x: 3.5, z: 0.95, radius: 0.8 },
    { id: 'calendar', kind: 'home', label: '달력 (근무 기록 보기)', x: -3.3, z: -3.0, radius: 0.9 },
    { id: 'window', kind: 'home', label: '창문 (열고 밖 보기)', x: 1.05, z: -3.0, radius: 0.75 },
  ] as Poi[],
  /** 북쪽 벽 달력 (주방과 책상 사이) */
  calendar: { x: -3.3, y: 1.6, z: -3.91 },
  /** 잠자기 동선: 침대 옆으로 걸어가서(path) → 걸터앉고(sit) → 눕는다(lie). sit·lie 는 렌더러 자세 기준점 */
  bed: {
    path: [
      { x: 1.95, z: -0.5 },
      { x: 1.95, z: -2.6 },
    ],
    sit: { x: 2.4, z: -2.6, yaw: -Math.PI / 2 },
    lie: { x: 3.45, y: 0.8, z: -1.75, yaw: 0 },
  },
  /** 소파: TV 쪽(북쪽)을 보고 앉는 골반 위치(sit), 서쪽 팔걸이에 머리를 괴고 옆으로 누운 골반 위치(lie) */
  sofa: {
    sit: { x: 3.4, z: 3.44, yaw: Math.PI },
    lie: { x: 3.05, y: 0.6, z: 3.27, yaw: Math.PI },
  },
};

/** 소파에서 할 수 있는 동작 (숫자 키 1~6) */
export type SofaAct = 'sit' | 'relax' | 'lounge' | 'phone' | 'stretch' | 'cheer' | 'doze' | KaraokeAct;
export const SOFA_ACTS: { id: SofaAct; icon: string; label: string }[] = [
  { id: 'relax', icon: '🛋️', label: '기대앉기' },
  { id: 'lounge', icon: '😌', label: '옆으로 눕기' },
  { id: 'phone', icon: '📱', label: '휴대폰' },
  { id: 'stretch', icon: '🙆', label: '기지개' },
  { id: 'cheer', icon: '👏', label: 'TV 응원' },
  { id: 'doze', icon: '😴', label: '꾸벅꾸벅' },
];
/** 소파 동작끼리 넘어가는 프레임 */
const SOFA_BLEND = 36;
/** 기지개는 한 번 하고 기대앉기로 돌아간다 */
const SOFA_STRETCH = 180;

/**
 * 행복빌라 1층 로비 (로비 전용 좌표). 남쪽 유리문 = 현관, 북쪽 = 엘리베이터·계단.
 * 서쪽에 경비 데스크: 의자에 앉아 동쪽(현관 ↔ 엘리베이터 동선)을 바라본다.
 * 서쪽 벽 북쪽 끝의 문으로 들어가면 박 반장의 반장실 (로비 서쪽에 붙은 작은 방).
 */
const OFFICE = { x0: -8.4, x1: -5, z0: -4, z1: -0.6, doorZ0: -3.35, doorZ1: -2.25 };
export const LOBBY = {
  /** 걸어 다닐 수 있는 전체 범위 (로비 + 반장실) */
  room: { x0: OFFICE.x0, x1: 5, z0: -4, z1: 4 } as Rect,
  /** 로비 홀 */
  hall: { x0: -5, x1: 5, z0: -4, z1: 4 } as Rect,
  /** 반장실: 책상(북쪽) 뒤 의자에 앉아 남쪽을 본다. 동쪽 벽(로비 서쪽 벽)에 문 */
  office: {
    ...OFFICE,
    doorZ: (OFFICE.doorZ0 + OFFICE.doorZ1) / 2,
    chair: { x: -6.8, z: -3.2 },
    desk: { x0: -7.6, x1: -6.0, z0: -2.85, z1: -2.2 } as Rect,
  },
  spawn: { x: 0.5, z: 2.8 },
  /** 경비 의자 (앉으면 동쪽을 본다) */
  chair: { x: -4.25, z: 0, yaw: Math.PI / 2 },
  /** 계단 (북동쪽, 남쪽 끝에서 북쪽으로 9칸 올라간다). 걸어 올라가면 2층 복도 */
  stairs: { x0: 3.6, x1: 4.95, z0: -3.95, z1: -1.0, rise: 1.62 },
  furniture: [
    { id: 'desk', rect: { x0: -3.6, x1: -2.85, z0: -1.4, z1: 1.4 } },
    // 계단 서쪽 난간 (계단은 남쪽 아래 칸에서만 올라탄다)
    { id: 'stairRail', rect: { x0: 3.45, x1: 3.6, z0: -3.95, z1: -1.35 } },
    { id: 'mailbox', rect: { x0: 4.55, x1: 4.95, z0: 0.6, z1: 3.0 } },
    { id: 'plant', rect: { x0: -4.9, x1: -4.3, z0: 3.3, z1: 3.9 } },
    // 반장실: 책상, 서류함, 커피 탁자 / 로비와 사이 벽 (문 자리만 비운다) / 반장실 남쪽 바깥은 못 간다
    { id: 'officeDesk', rect: { x0: -7.6, x1: -6.0, z0: -2.85, z1: -2.2 } },
    { id: 'officeCabinet', rect: { x0: -8.4, x1: -7.85, z0: -2.0, z1: -0.6 } },
    { id: 'officeCoffee', rect: { x0: -5.75, x1: -5.05, z0: -1.35, z1: -0.6 } },
    { id: 'officeWallN', rect: { x0: -5.08, x1: -4.92, z0: -4, z1: OFFICE.doorZ0 } },
    { id: 'officeWallS', rect: { x0: -5.08, x1: -4.92, z0: OFFICE.doorZ1, z1: 4 } },
    { id: 'officeOutside', rect: { x0: OFFICE.x0, x1: -5.08, z0: OFFICE.z1, z1: 4 } },
  ] as { id: string; rect: Rect }[],
  pois: [
    { id: 'lobbyExit', kind: 'home', label: '현관 (밖으로 나가기)', x: 0.5, z: 3.5, radius: 0.9 },
    { id: 'desk', kind: 'job', label: '경비 데스크', x: -4.25, z: 0, radius: 1.2 },
    { id: 'elevator', kind: 'home', label: '엘리베이터 (층 고르기)', x: 2.0, z: -3.2, radius: 0.9 },
  ] as Poi[],
};
/**
 * 행복빌라 2층 이상 복도 (복도 전용 좌표, 모든 층이 같은 구조). 동서로 긴 복도.
 * 서쪽 끝: 계단실(북쪽 반 ↑ 올라가는 계단, 남쪽 반 ↓ 내려가는 계단), 그 옆 북쪽 벽에 엘리베이터,
 * 북쪽 벽: N01~N03호 현관과 그 사이 소화기·분전함, 동쪽 끝: 창문.
 */
export const CORRIDOR = {
  room: { x0: -8.4, x1: 6, z0: -1.5, z1: 1.5 } as Rect,
  /** 계단실: x0~x1 이 계단, 그 사이를 이만큼 걸어 들어가면(trigger 보다 서쪽) 위·아래층으로 */
  stairs: { x0: -8.4, x1: -6.6, rise: 1.3, trigger: -7.3 },
  /** 엘리베이터·계단으로 올라왔을 때 서는 곳 */
  spawn: { x: -4.2, z: 0 },
  doors: [-1.5, 1.5, 4.5],
  furniture: [] as { id: string; rect: Rect }[],
  /** 순찰 점검 지점 (층마다 같은 자리) */
  checkpoints: [
    { id: 'extinguisher', label: '소화기 점검', icon: '🧯', x: 0, z: -0.9 },
    { id: 'panel', label: '분전함 점검', icon: '⚡', x: 3.0, z: -0.9 },
    { id: 'window', label: '복도 창문 잠금 확인', icon: '🪟', x: 5.4, z: 0 },
  ],
};
/** 의자에 앉고 일어나는 데 걸리는 프레임 */
const SIT_FRAMES = 30;
/** 소파에 눕고 일어나는 데 걸리는 프레임 */
const SOFA_FRAMES = 45;

/** 잠자기 단계별 길이 (프레임) */
const SLEEP_LIE = 90;
const SLEEP_WAKE = 75;
/** 이만큼 자면 저절로 깬다 (실제 시간) */
export const SLEEP_MAX_MS = 12 * 3_600_000;
/** 자는 동안: 2시간이면 피로 100 이 풀리고, 30분이면 체력이 다 차고, 배고픔은 12시간에 100 오른다 */
const SLEEP_FATIGUE_PER_MS = 100 / (2 * 3_600_000);
const SLEEP_HP_PER_MS = 1 / (30 * 60_000);
const SLEEP_HUNGER_PER_MS = 100 / (12 * 3_600_000);
/** 잔 시간 글자: '7시간 20분' */
export function sleptLabel(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
/** 누운 뒤 이만큼(프레임)은 키를 눌러도 안 깬다 (눕자마자 깨지 않게) */
const SLEEP_SETTLE = 60;
/** 이만큼 피곤해야 잘 수 있다 */
export const SLEEPY = 50;
/** 배고픔·피로도가 100인 채로 이만큼 지나면 알아서 먹고 잔다 (실제 30초) */
const CARE_GRACE = 30 * 60;
/** 자동으로 장 볼 때 여분으로 사 오는 개수, 냉장고 최대 칸 */
const CARE_SPARES = 2;
const FRIDGE_MAX = 10;
const FRIDGE_POS = { x: -3.8, z: 0 };
/** 엄마가 서 있는 곳 (집 주방 싱크대 앞) */
export const MOM_SPOT = { x: -3.55, z: -1.9 };

/** 자동 행동 한 단계 */
type CareStep =
  | { kind: 'leave' }
  | { kind: 'goto'; x: number; z: number; label: string; tried?: boolean }
  | { kind: 'enterHome' }
  | { kind: 'walk'; x: number; z: number }
  | { kind: 'buy'; shop: string }
  | { kind: 'eatFridge' }
  | { kind: 'store' }
  | { kind: 'sleep' };

export type SleepPhase = 'walk' | 'lie' | 'sleep' | 'wake';

export interface Car {
  x: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  kind: 'car' | 'taxi' | 'bus';
  color: number;
  /** 도로를 벗어나면 되돌아갈 구간 */
  from: number;
  to: number;
  /** 지금 속도 (신호·앞차·사람 앞에서 줄어든다). speed = 평소 속도 */
  v: number;
  /** 이 차로의 정지선들 (진행 방향 좌표) */
  stops: number[];
}

export interface Npc {
  fighter: Fighter;
  name: string;
  path: { x: number; z: number }[];
  next: number;
  speed: number;
  color: number;
  /** 지갑에 든 돈 (쓰러뜨리면 줍는다) */
  wallet: number;
  /** 잠깐 멈춰서는 프레임 (폰 보기 등) */
  pause: number;
  /** 맞고 도망가는 남은 프레임 */
  flee: number;
  /** 이 프레임까지 머리 위에 체력바 표시 */
  hpShowUntil: number;
  /** 쓰러진 뒤 지난 프레임 (-1 = 멀쩡함) */
  koFrames: number;
  /** 이 프레임에 경찰에 신고한다 (-1 = 신고 안 함) */
  reportAt: number;
  /** 맞으면 도망 대신 덤비는 사람 */
  brave: boolean;
  /** 플레이어에게 덤비는 남은 프레임 (0 = 평소) */
  fight: number;
  /** 다음 공격까지 남은 프레임 */
  atkCd: number;
  /** 도망치거나 덤비는 상대 (사람 id) */
  foe: string;
  /** 걷는 길: -1 = 산책로, -2 = 산책로 거꾸로, 그 밖엔 블록 번호 × 2 + (거꾸로면 1) */
  route: number;
  /** 동네를 계산하는 친구가 보낸 위치 (따라 그리는 쪽만) */
  target?: { x: number; z: number; y: number; fx: number; fz: number };
  /** 내가 방금 때렸다: 이 프레임까지는 받은 장면으로 모습을 덮어쓰지 않는다 (맞는 동작이 끊기지 않게) */
  lockUntil?: number;
}

/** 머리 위에 잠깐 뜨는 글자 (말풍선, 주운 돈 등) */
export interface Speech {
  x: number;
  z: number;
  text: string;
  color?: string;
}

/** 같은 마을에 접속한 친구. 네트워크로 받은 모습을 그대로 따라 그린다 */
export interface RemotePlayer {
  id: string;
  name: string;
  /** 사는 집 호수 (예: '402') */
  unit: string;
  fighter: Fighter;
  /** 지금 있는 곳 (roomKey). 같은 곳에 있어야 보이고 때릴 수 있다 */
  room: string;
  /** 입은 코디 */
  outfit?: string[];
  /** 고른 몸 (남자·여자, 없으면 여자) */
  body?: string;
  /** 마지막으로 받은 위치 (화면에선 여기로 부드럽게 따라간다) */
  target: { x: number; z: number; y: number; fx: number; fz: number } | null;
  /** 내가 방금 때렸다: 이 프레임까지는 받은 상태로 덮어쓰지 않는다 (맞는 모습이 튀지 않게) */
  hitLock: number;
  /** 내가 마지막으로 때린 프레임 */
  myHitAt: number;
  /** 친구 레벨 (머리 위 이름표) */
  level: number;
  /** 친구가 하고 있는 일자리 id (근무 중이 아니면 null) */
  job: string | null;
  /** 친구가 근무를 시작한 실제 시각 */
  jobAt: number;
  /** 친구가 타고 있는 놀이기구 좌석 (놀이공원) */
  ride?: { id: RideId; seat: number } | null;
  /** 친구가 앉거나 누운 곳 (경비 데스크·소파). 소파 동작이 바뀐 프레임도 기억해 자세를 이어 그린다 */
  seat: { spot: 'desk' | 'sofa'; amt: number; act: SofaAct; prev: SofaAct; at: number; pt: number } | null;
  /** 친구가 근무하며 보내 주는 로비·복도 사람들 (친구 화면과 같은 장면) */
  scene: { people: Map<number, ObservedPerson>; at: number } | null;
  /** 침대에 누운 정도·이불 (자는 중이 아니면 null) */
  sleep: { rest: number; blanket: number } | null;
  /** 친구의 낚시 (낚싯대·찌·물고기) */
  fish: NetFish | null;
  /** 친구가 코인노래방에서 빌린 방 (노래방 안에 있을 때만) */
  booth: number | null;
  /** 친구 곁에 보이는 펫 */
  pets: NetPet[];
  /** 마지막으로 소식(모습·동네 장면)이 온 프레임. 오래 끊기면 동네 계산을 맡지 않는다 */
  seenAt: number;
}

/** 네트워크로 보내는 낚시 장면 */
export interface NetFish {
  p: FishPhase;
  t: number;
  n: number;
  su: number;
  te: number;
  tf: 0 | 1;
  sw: number;
  lo: number;
  /** 걸린 물고기 id */
  fi: string | null;
  kg: number;
  x: number;
  z: number;
  rod: string;
}

/** 네트워크로 보내는 펫 하나 */
export interface NetPet {
  i: string;
  sp: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mv: number;
  j: number;
}

/** 로비·복도에 그리는 사람 (내 근무의 사람이든, 친구 근무에서 받은 사람이든) */
export type ShownPerson = Pick<LobbyPerson, 'f' | 'slot' | 'where' | 'kind' | 'title' | 'tier' | 'koFrames' | 'reaction' | 'showUntil'>;
/** 친구 근무에서 받은 사람: 받은 위치로 부드럽게 따라간다 */
export type ObservedPerson = ShownPerson & { target: { x: number; z: number; y: number; fx: number; fz: number } };

/** 네트워크로 보내는 내 모습 (위치·방향·동작·체력) */
export interface NetState {
  r: string;
  x: number;
  z: number;
  y: number;
  fx: number;
  fz: number;
  s: FighterState;
  f: number;
  m: string | null;
  hp: number;
  mh: number;
  /** 레벨 */
  lv: number;
  /** 하고 있는 일자리 id (근무 중일 때만) */
  jb?: string | null;
  /** 근무를 시작한 실제 시각 */
  ja?: number;
  /** 앉은 곳: 'd' = 경비 데스크, 그 밖엔 소파 동작 id. 서 있으면 없음 */
  se?: string | null;
  /** 앉은 정도 0~1 */
  sa?: number;
  /** 침대에 누운 정도 · 이불 덮은 정도 (자는 중일 때만) */
  sl?: number;
  sb?: number;
  /** 낚시 중이면 낚시 장면 */
  fs?: NetFish | null;
  /** 곁에 보이는 펫 */
  pt?: NetPet[];
  /** 코인노래방에서 빌린 방 번호 (노래방 안에 있을 때만). 앉기·노래 자세도 이 방 자리에서 */
  kb?: number;
  /** 타고 있는 놀이기구 '놀이기구:좌석' (놀이공원에서 탈 때만) */
  rd?: string;
}

/** 내가 친구를 때렸다. 맞은 쪽이 혼자 할 때와 같은 계산(applyHit)으로 자기 체력에서 뺀다 */
export interface NetHit {
  to: string;
  m: string;
  counter: boolean;
  /** 공격자가 다시 움직일 수 있을 때까지 남은 프레임 (경직 계산용) */
  remaining: number;
  power: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** 행인을 때렸다 (그 행인 번호). 동네를 계산하는 친구에게 보낸다 */
  t?: number;
  /** 행인이 때렸다 (그 행인 번호). 동네를 계산하는 친구가 맞은 사람에게 보낸다 */
  n?: number;
}

/** 동네 장면 속 행인 한 명 (nm 부터는 처음과 가끔만 보낸다) */
export interface NetNpc {
  i: number;
  x: number;
  z: number;
  y: number;
  fx: number;
  fz: number;
  s: FighterState;
  f: number;
  m: string | null;
  hp: number;
  ko: number;
  fl: number;
  pa: number;
  fi: number;
  fo: string;
  /** 체력바를 보여 줄 남은 프레임 */
  hs: number;
  nx: number;
  /** 신고까지 남은 프레임 (-1 = 안 함) */
  ra: number;
  ac: number;
  nm?: string;
  co?: number;
  rt?: number;
  sp?: number;
  mh?: number;
  w?: number;
  br?: 0 | 1;
}

export interface NetPolice {
  ph: PolicePhase;
  /** 출동까지 남은 프레임 */
  da: number;
  sc: [number, number];
  /** 경찰차 x, z, dx, dz, stopX, stopZ */
  car: number[] | null;
  o: { x: number; z: number; fx: number; fz: number; s: FighterState; f: number }[];
  lf: number;
  cf: number;
  wa: string;
}

/** 한 사람에게만 가는 소식: 안내 글, 주운 돈·물건, 경찰에게 잡힘 */
export interface TownNote {
  to: string;
  tx?: string;
  s?: number;
  nm?: string;
  g?: number;
  it?: string;
  caught?: 1;
}

/** 동네 장면: 동네를 계산하는 사람(호스트)이 같은 곳의 친구들에게 보낸다 → 모두가 같은 행인·차·경찰·반장님을 본다 */
export interface NetTown {
  n: NetNpc[];
  /** 차 위치·속도 (x, z, v 를 차 순서대로) */
  c?: number[];
  po: NetPolice;
  se: NetSenior;
  sp: (Speech & { r: string })[];
  ev: { r: string; e: CombatEvent; by: string }[];
  no: TownNote[];
}

/** 친구가 계산하는 행인을 때린 뒤 맞는 모습을 그대로 두는 시간 (호스트 처리가 돌아올 때까지) */
const HIT_LOCK_FRAMES = 18;

/** 이만큼(프레임) 소식이 없는 친구는 동네 계산을 맡지 않는다 */
const TOWN_FRESH = 120;

/** 친구에게 쓰러진 뒤 이 시간 안이면 '친구에게 당했다'로 친다 (프레임) */
const PVP_MEMORY = 300;

export type PolicePhase = 'none' | 'dispatched' | 'arriving' | 'chasing' | 'leaving';

export interface Police {
  phase: PolicePhase;
  /** 경찰차가 출발하는 프레임 */
  dispatchAt: number;
  /** 신고된 사건 현장 */
  scene: { x: number; z: number };
  car: { x: number; z: number; dx: number; dz: number; stopX: number; stopZ: number } | null;
  officers: Fighter[];
  /** 범인과 멀어진 채 지난 프레임 (따돌림 판정) */
  lostFrames: number;
  chaseFrames: number;
  /** 쫓는 범인 (사람 id) */
  wanted: string;
}

const OUCH = ['아야!', '뭐야?!', '왜 때려요!', '살려줘요!', '경찰 부를 거예요!', '미쳤어?!', '아악!'];
const CALL = ['여보세요, 112죠?', '신고해야겠다…', '저기요! 경찰 불러요!', '찍었어요!'];
const NAMES = ['김민수', '이지은', '박서준', '최유나', '정하늘', '강도윤', '윤서연', '장민호', '임수빈', '한지우', '오세린', '서태윤'];
const NPC_FLEE_FRAMES = 300;
/** 반격: 덤비는 시간, 쫓아가는 속도, 함께 덤비는 거리·확률, 사람마다의 기술 */
const NPC_FIGHT_FRAMES = 720;
const NPC_FIGHT_SPEED = 0.07;
const JOIN_RANGE = 9;
const JOIN_CHANCE = 0.4;
const NPC_MOVES: MoveDef[] = [MOVES.jab, MOVES.oneTwo, MOVES.straight, MOVES.lowKick, MOVES.midKick];
const ANGRY = ['이게 뭐하는 짓이야!', '너 오늘 임자 만났다', '가만 안 둬!', '덤벼!', '참는 데도 한계가 있지!'];
const JOIN = ['같이 혼내주자!', '저 사람 잡아요!', '어디서 행패야!', '내가 도와줄게요!'];
const GLOAT = ['흥, 꼴 좋다', '다신 그러지 마!', '정신 차려요!'];
/** 체력 회복 (초당): 가만히 쉬면 조금, 공원·집에선 더, 싸운 직후엔 안 찬다 */
/** 공격을 시작할 때 이 거리 안의 사람 쪽으로 몸을 돌린다 (m) */
const AIM_RANGE = 3.5;
const HP_REGEN_IDLE = 0.3 / 60; // 최대 체력의 % / 프레임
const HP_REGEN_REST = 1 / 60;
const HP_REGEN_COMBAT_COOLDOWN = 300;
const KO_FRAMES = 210;
const NPC_FLEE_SPEED = 0.085;
const KO_DESPAWN_FRAMES = 480;
const WITNESS_RANGE = 20;

const DISPATCH_DELAY = 360; // 신고 후 6초 뒤 출동
const POLICE_CAR_SPEED = 0.35;
const POLICE_SEARCH_RADIUS = 35; // 도착했을 때 이 안에 있으면 추격
const OFFICER_SPEED = 0.078; // 걷기(0.045)보다 빠르고 달리기(0.1)보다 느림
const CATCH_RANGE = 0.85;
const LOSE_DISTANCE = 40;
const CAUGHT_FRAMES = 180;


/** 현관: 문 열고 걸어가다 장소가 바뀌는 프레임, 바뀐 뒤 걸어 나오는 프레임 */
const DOOR_SWITCH = 46;
const DOOR_AFTER = 50;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const WALK = 0.045; // 2.7 m/s
const RUN = 0.1; // 6 m/s
const MINUTES_PER_FRAME = 1 / 3600; // 게임 시각 = 실제 시각 (1초 = 1초)

/**
 * 서울 라이프: 도시를 걷고, 집에 들어가고, 주변에서 일이 벌어지는 일상 모드.
 * 전투 엔진의 Fighter 를 그대로 써서 같은 캐릭터 애니메이션을 공유한다.
 *
 * 행인을 때리면: 체력바가 뜨고, 쓰러뜨리면 지갑의 돈(가끔 소지품)을 줍는다.
 * 본 사람들이 신고하면 경찰이 출동하고, 현장에 남아 있다 잡히면 집 앞에서 다시 시작.
 */
/** PC방 한 판 이용료 (골드) */
export const PC_ROOM_FEE = 20;
/** 분수 동전 (골드) */
export const COIN_TOSS = 10;
/** 버스 교통비 (골드) */
export const BUS_FARE = 15;

export class CityWorld {
  readonly map: CityMap;
  readonly player: Fighter;
  location: CityLocation = 'city';
  /** 하루 중 분 (0~1440) */
  minutes = 17 * 60 + 30;
  day = 1;
  frame = 0;
  /** 타격 순간 잠깐 멈춤 (플레이어·행인만, 차는 계속 달린다) */
  hitstop = 0;
  cars: Car[] = [];
  npcs: Npc[] = [];
  nearby: Poi | null = null;
  /** 놀이공원: 타고 있는 놀이기구 (at = 탄 실제 시각, cycle = 탄 운행 회차) */
  ride: { id: RideId; seat: number; at: number; cycle: number } | null = null;
  /** 놀이공원: 줄 서 있는 놀이기구 (다음 탑승 시간이 되면 자동으로 탄다) */
  rideQueue: RideId | null = null;
  /** 탑승 중 고개 돌리기 (방향키) */
  rideLookYaw = 0;
  rideLookPitch = 0;
  private rideSaidAt = -999;
  /** 놀이기구 시계 (모두 같은 시각). 시험에서는 바꿔 끼운다 */
  parkClock: () => number = sharedNow;
  toast: { text: string; until: number } | null = null;
  /** 장소가 바뀐 프레임 (렌더러가 카메라·장면을 바꾼다) */
  locationChangedAt = 0;
  /**
   * 빌라 현관을 드나드는 중: 문 앞에 서서 문을 열고 → 걸어 들어가며 화면이 어두워지고 →
   * 반대편에서 밝아지며 몇 걸음 걷고 → 등 뒤로 문이 닫힌다.
   * kind: enter(밖 → 로비) / exit(로비 → 밖), stage 0 = 장소 바뀌기 전, 1 = 바뀐 뒤
   */
  doorway: { kind: 'enter' | 'exit' | 'pass'; stage: 0 | 1; at: number; pass?: DoorPass } | null = null;
  /** 지금 들어와 있는 가게의 바깥 문 id (나갈 때 그 문이 열렸다 닫힌다) */
  private storeDoor = '';
  /** 내 집 창문이 열려 있나 (집 안 창가에서 E) */
  homeWindowOpen = false;
  police: Police = { phase: 'none', dispatchAt: 0, scene: { x: 0, z: 0 }, car: null, officers: [], lostFrames: 0, chaseFrames: 0, wanted: '' };
  private townWasHost = true;
  /** 받은 동네 장면을 그리는 중이었다 (내가 계산을 맡게 되면 거기서 이어서) */
  private townAdopt = false;
  /** 동네 장면과 함께 보낼 말풍선·타격·개인 소식 */
  private townOut = { sp: [] as (Speech & { r: string })[], ev: [] as { r: string; e: CombatEvent; by: string }[], no: [] as TownNote[] };
  /** 이름·옷 색·걷는 길을 이미 보낸 행인 */
  private sentNpcIds = new Set<number>();
  private officerTargets: ({ x: number; z: number; y: number; fx: number; fz: number } | undefined)[] = [];
  /** 경찰에게 잡힌 프레임 (null = 안 잡힘) */
  caughtAt: number | null = null;
  /** 행인에게 맞아 쓰러진 프레임 (null = 멀쩡함) */
  downedAt: number | null = null;
  /** 마지막으로 때리거나 맞은 프레임 (이후 잠시 체력이 차지 않는다) */
  lastCombatFrame = -99999;
  /** 일하는 중 (아파트 경비) */
  job: GuardShift | null = null;
  /** 경비실에서 E → 화면이 일자리 창을 연다 */
  jobPanelRequest = false;
  /** 집 달력에서 E → 화면이 달력 창을 연다 */
  calendarRequest = false;
  /** TV 앞에서 E → 화면이 유튜브 창을 연다 */
  tvRequest = false;
  /** 카지노 입구에서 E → 화면이 카지노 창을 연다 */
  casinoRequest = false;
  /** 코인노래방 방의 노래방 기계 앞에서 E → 노래 고르기 창 열기 */
  karaokeRequest = false;
  /** 지금 노래 부르는 코인노래방 방 번호 (창 제목에 쓴다) */
  karaokeRoom: number | null = null;
  /** 코인노래방 카운터에서 E → 빈방 · 곡 고르기 창 */
  karaokeDeskRequest = false;
  /** 코인노래방에서 빌린 방: 방 번호 · 남은 곡 · 산 곡 수 · 낸 돈 (노래방을 나가면 남은 곡 값은 돌려받는다) */
  karaokeRental: { room: number; songs: number; bought: number; paid: number } | null = null;
  /** 앉기·노래 자세를 할 자리 (노래방 방). null 이면 집 소파 */
  seatBooth: number | null = null;
  /** 버스정류장에서 E → 행선지 고르기 창 */
  busRequest = false;
  /** PC방에서 E → 게임 고르기 창 */
  pcRoomRequest = false;
  /** 펫샵 창을 열어 달라 (UI 가 읽고 끈다) */
  petShopRequest = false;
  /** 펫샵 놀이터에서 고른 아이 (UI 가 분양 창을 연다) */
  petAdoptRequest: StockPet | null = null;
  /** 옷가게: 열어 달라는 진열 구역 ('all' = 계산대에서 전체) / 탈의실 */
  clothesShopRequest: ClothesCorner | 'all' | null = null;
  wardrobeRequest = false;
  /** 옷가게에서 입어보는 중인 (아직 안 산) 코디 옷: 칸마다 하나. 저장 안 하고, 입은 채 가게 안을 돌아다닐 수 있다 */
  trial: Partial<Record<CosmeticSlot, string>> = {};
  /**
   * 코디 창: 게임 속 내 캐릭터를 빙 둘러보는 카메라 (null = 평소 카메라).
   * yaw 0 = 캐릭터 정면, y = 보는 높이, shift = 화면 오른쪽 창에 가리지 않게 캐릭터를 왼쪽으로 미는 비율
   */
  mirror: { yaw: number; pitch: number; dist: number; y: number; shift: number } | null = null;
  /** 입어보는 옷 중 아직 계산 안 한 것 (이게 있으면 가게 문밖으로 못 나간다) */
  unpaidTrial(): CosmeticDef[] {
    const owned = ensureWardrobe(this.profile).owned;
    return Object.values(this.trial)
      .map((id) => COSMETIC_BY_ID[id!])
      .filter((c): c is CosmeticDef => !!c && !owned.includes(c.id));
  }
  /** 코디 창에서 마우스를 올려 둔 옷 (잠깐 입혀 보기) */
  peek: string | null = null;
  /** 입어보는 옷을 걸친 모습 (null = 산 옷 그대로) */
  get outfitPreview(): string[] | null {
    const peek = this.peek ? COSMETIC_BY_ID[this.peek] : undefined;
    if (!peek && !this.unpaidTrial().length) return null;
    const worn = { ...ensureWardrobe(this.profile).worn, ...this.trial };
    if (peek) worn[peek.slot] = peek.id;
    return wornList({ owned: [], worn });
  }
  /** 지금 들어와 있는 가게 */
  store: StoreLayout | null = null;
  /** 펫샵 놀이터 아이들 */
  pen: PenSim | null = null;
  /** 가게 주인 (계산대 뒤) */
  readonly keeper: Fighter;
  /** 집에 있는 엄마 (대화형 NPC) */
  readonly mom: Fighter;
  /** 내 애완동물 */
  readonly pets: PetCare;
  /** 엘리베이터 안: 층 고르는 창이 열려 있다 (플레이어는 멈춘다) */
  elevatorOpen = false;
  /** 열린 창문으로 밖을 내다보는 중 (방향키로 둘러본다, E·Esc 로 돌아온다) */
  lookingOut = false;
  /** 내다보는 방향: 좌우(라디안, +왼쪽) · 위아래(+위) */
  lookYaw = 0;
  lookPitch = -0.18;
  /** 1인칭 시점 (V): 보는 방향(yaw = 북쪽 기준이 아니라 +z 기준 각도, pitch = 위아래)과 마우스로 보는 중인지 */
  firstPerson = false;
  fpYaw = 0;
  fpPitch = 0;
  fpMouse = false;
  /** 자동 행동 (배고픔·피로가 한계인데 방치하면): 남은 단계와 들고 있는 음식 */
  care: { why: 'eat' | 'sleep'; steps: CareStep[]; carry: FridgeFood[]; started: boolean } | null = null;
  private hungerFullFrames = 0;
  private fatigueFullFrames = 0;
  /** 복도에 있을 때 몇 층인지 */
  floor = 2;
  /** 경비 의자에 앉는 중/앉음/일어나는 중 */
  seat: { phase: 'sit' | 'seated' | 'stand'; at: number; spot?: 'sofa' } | null = null;
  /** 소파 동작: 지금 동작(id)과 시작 프레임(at), 넘어오기 전 동작(prev)과 그 동작이 돌던 프레임(pt) */
  sofa: { id: SofaAct; at: number; prev: SofaAct; pt: number } = { id: 'sit', at: 0, prev: 'sit', pt: 0 };
  /** 소수점 체력 회복 누적 */
  private hpAcc = 0;
  private sofaAt = -99999;
  /** 대화 중인 가게 (간판 글자). 열려 있으면 플레이어는 움직이지 않는다 */
  dialog: { shop: string } | null = null;
  /** 대화형 NPC 와 이야기하는 중 (열려 있으면 플레이어는 움직이지 않는다) */
  npcChat: { npc: string } | null = null;
  /** 1층 반장실에서 일하고 수시로 층마다 순찰을 도는 선임 경비 박 반장 */
  readonly senior: Fighter;
  readonly seniorAI: SeniorAI;
  /** 멀티플레이: 내 계정 id (오프라인이면 null) */
  netId: string | null = null;
  /** 내 아이디 (머리 위 이름표, 오프라인이면 null) */
  netName: string | null = null;
  /** 같은 마을에 접속한 친구들 */
  readonly remotes = new Map<string, RemotePlayer>();
  /** 친구에게 보낼 타격 (네트워크가 가져간다) */
  outbox: NetHit[] = [];
  /** 동네 채팅 기록 (최근 것이 끝) */
  chatLog: ChatLine[] = [];
  /** 채팅이 바뀔 때마다 1 씩 (화면 갱신용) */
  chatVersion = 0;
  /** 보낼 채팅 (마을 연결이 가져가서 보낸다) */
  chatOut: string[] = [];
  /** 머리 위 말풍선으로 띄울 것 (화면이 가져간다). who = 'me' 또는 친구 id */
  chatBubbles: { who: string; name: string; text: string; emote?: boolean }[] = [];
  /** 보낼 감정 표현 (마을 연결이 가져가서 보낸다) */
  emoteOut: string[] = [];
  private lastEmoteAt = -Infinity;
  private lastChatAt = -Infinity;
  /** 지금 들어가 있는 집의 주인 (null = 내 집) */
  homeOwner: string | null = null;
  /** 마지막으로 나를 때린 친구 */
  private lastPvp: { name: string; frame: number } | null = null;
  private remoteIndex = 700;
  /** 마지막으로 사람을 때린 프레임 (가게 주인이 소문을 듣는다) */
  lastCrimeFrame = -99999;
  private warned = { park: false };
  private lifeTracker = new LifeTracker();

  /** 지금 배고픔이 오르는 배율 (활동량이 많을수록 빠르다) */
  get hungerRate() {
    return this.lifeTracker.hungerRate;
  }
  private nav: CityNav | null = null;
  /** 걸어서 못 들어가는 차도 (횡단보도만 뚫려 있다) */
  private roadRects: RoadRect[] = [];
  /** 잠자는 중 (침대로 걸어감 → 눕기 → 밤이 흐름 → 일어나기). 그동안 조작 불가 */
  /** 잠: since = 잠든 실제 시각(ms), last = 회복을 마지막으로 계산한 시각(ms), auto = 12시간이 넘어 저절로 깸 */
  sleep: { phase: SleepPhase; at: number; wp: number; since: number; last: number; auto?: boolean } | null = null;
  /** 지도 클릭 자동 이동 */
  autopilot: { path: { x: number; z: number }[]; i: number; label: string } | null = null;

  private events: CombatEvent[] = [];
  private speech: Speech[] = [];
  /** 가게에서 나올 때 설 자리 (f = -1 이면 북쪽을 보는 가게) */
  private cityReturn: { x: number; z: number; f?: -1 } = { x: 0, z: 0 };
  private rng: () => number;
  private nextNpcId = 100;

  constructor(
    private input: { read(world: CityWorld): CityInput },
    /** 돈·아이템을 주우면 여기에 쌓인다 (없으면 테스트용 임시 프로필) */
    readonly profile: PlayerProfile = {
      level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 20, hunger: 30 },
    },
    seed = 7,
  ) {
    this.rng = mulberry32(seed);
    this.map = buildCityMap();
    this.roadRects = roadSolids(this.map);
    // 체력은 레벨에 따라 오르고, 도시에서 남은 체력은 프로필에 이어진다
    // 길거리에선 철권식 자동 가드가 없다: 피하거나 먼저 때려야 한다
    ensureGear(profile);
    this.player = new Fighter(0, 'ME', { ...playerStats(profile), tempo: PLAYER_TEMPO, canBlock: false });
    this.senior = new Fighter(899, 'npc', { canBlock: false });
    this.seniorAI = new SeniorAI(this, this.senior);
    this.player.reset(this.map.home.x, this.map.home.z + 1, 0, 1);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, Math.round(profile.life.hp ?? this.player.maxHp)));
    // 날짜·시각도 이어서
    if (profile.time) {
      this.day = profile.time.day;
      this.minutes = profile.time.minutes;
    }
    this.spawnCars();
    for (let k = 0; k < 26; k++) this.npcs.push(this.makeNpc());
    this.pets = new PetCare(profile, (t, s) => this.say(t, s), (s) => this.pushSpeech(s));
    this.keeper = new Fighter(898, 'npc', { canBlock: false });
    this.mom = new Fighter(897, 'npc', { canBlock: false });
    this.mom.reset(MOM_SPOT.x, MOM_SPOT.z, 1, 0);
  }

  /**
   * 동네 시계 (서버 시각 ms 를 돌려준다). 있으면 날짜·시각은 모두 이걸로 정해진다:
   * 모든 사람이 같은 시각·같은 날씨를 보고, 잠자기·근무로 혼자 시간을 빨리 감지 않는다.
   * 없으면 (헤드리스 시험) 프레임마다 혼자 흐르는 시계.
   */
  private sharedClock: (() => number) | null = null;

  attachSharedClock(now: () => number) {
    this.sharedClock = now;
    this.syncClock();
    this.moveOldWorkLog();
  }

  /**
   * 예전(각자 흐르던 시계) 근무 기록 날짜는 실제 날짜와 맞지 않는다.
   * 미래 날짜에 있는 기록은 순서는 그대로 두고, 가장 최근 기록이 오늘에 오도록 한 번만 당긴다.
   */
  private moveOldWorkLog() {
    const pr = this.profile;
    if (pr.clockV === 2) return;
    pr.clockV = 2;
    const log = pr.workLog;
    const days = log ? Object.keys(log).map(Number).filter(Number.isFinite) : [];
    const last = days.length ? Math.max(...days) : 0;
    if (log && last > this.day) {
      const shift = this.day - last;
      const moved: NonNullable<typeof log> = {};
      for (const d of days) {
        const k = String(Math.max(1, d + shift));
        moved[k] = [...(moved[k] ?? []), ...log[String(d)]];
      }
      pr.workLog = moved;
    }
    saveProfile(pr);
  }

  get clockShared() {
    return this.sharedClock !== null;
  }

  private syncClock() {
    if (!this.sharedClock) return;
    const t = gameTimeAt(this.sharedClock());
    this.day = t.day;
    this.minutes = t.minutes;
  }

  get clock(): string {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 지금 날씨 (날짜·시각으로 정해진다) */
  get weather(): WeatherState {
    return weatherAt(this.day, this.minutes);
  }

  /** 0 = 한밤, 1 = 한낮 (일출 6시 ~ 일몰 19시, 1시간에 걸쳐 밝아지고 어두워짐) */
  get daylight(): number {
    const h = this.minutes / 60;
    if (h < 5.5 || h > 19.5) return 0;
    if (h < 7) return (h - 5.5) / 1.5;
    if (h > 18) return 1 - (h - 18) / 1.5;
    return 1;
  }

  /** HUD 용 경찰 상황 한 줄 */
  get policeStatus(): string | null {
    const p = this.police;
    // 경찰이 쫓는 사람에게만 (다른 사람은 경찰차·경찰만 본다)
    if (p.wanted !== this.myId) return null;
    switch (p.phase) {
      case 'dispatched':
        return `🚨 신고 접수 — 경찰 출동까지 ${Math.ceil((p.dispatchAt - this.frame) / 60)}초 (현장을 벗어나면 피할 수 있다)`;
      case 'arriving':
        return '🚨 경찰차가 현장에 도착하고 있다!';
      case 'chasing':
        return '🚨 경찰 추격 중! Shift 로 달려서 따돌리자';
      default:
        return null;
    }
  }

  step() {
    this.frame++;
    this.stepRemotes();
    // 시계는 누구도 빨리 감지 않는다 (잠자기·근무 중에도 실제 시각대로)
    if (this.sharedClock) this.syncClock();
    else {
      this.minutes += MINUTES_PER_FRAME;
      if (this.minutes >= 1440) {
        this.minutes -= 1440;
        this.day++;
      }
    }

    // 잡혔으면 잠깐 멈췄다가 집 앞에서 다시 시작
    if (this.caughtAt !== null) {
      this.input.read(this);
      if (this.frame - this.caughtAt >= CAUGHT_FRAMES) this.restart();
      this.stepTown(false, false);
      return;
    }

    const p = this.player;
    // 행인에게 맞아 쓰러졌다: 잠시 뒤 집에서 깨어난다
    if (this.downedAt !== null) {
      this.input.read(this);
      p.snapshot();
      p.freeMove = null;
      p.feed(NEUTRAL_INPUT);
      p.tick({ opponent: p, awayX: 0, awayZ: -1 });
      this.stepTown(false, false);
      if (this.frame - this.downedAt >= KO_FRAMES) this.wakeAfterKO();
      return;
    }
    p.snapshot();
    const sleeping = this.sleep !== null;
    // 내다보는 동안의 키 입력(돌아오기 E 포함)은 이 프레임에 다 쓴다
    const looking = this.lookingOut;
    if (looking) this.stepLookOut();
    const rawInput = this.input.read(this);
    const blocked = this.dialog || this.npcChat || this.elevatorOpen || looking || sleeping;
    const inp: CityInput = blocked ? { move: null, run: false, interact: false } : { ...rawInput };
    if (this.firstPerson && !looking && !sleeping && !this.ride) this.fpInput(inp);
    if (this.fishing) this.stepFishing(inp);
    if (!sleeping && this.downedAt === null) this.stepCare(inp);
    if (sleeping) this.stepSleep(inp);
    else this.followAutopilot(inp);
    if (this.doorway) this.stepDoorway(inp);
    if (!sleeping) {
      this.stepAutoPatrol(inp);
      this.stepAutoDesk(inp);
    }
    if (this.seat) this.stepSeat(inp);
    if (this.ride || this.rideQueue) this.stepRide(inp);
    // 자는 동안의 피로·배고픔·체력은 sleepRecover 가 실제 잔 시간만큼 바꾼다
    const { slow, canRun } = sleeping ? { slow: 1, canRun: true } : this.tickLife(inp.run && !!inp.move);
    // 피곤하거나 배고프면 느려지고, 한계(100)면 달릴 수 없다
    p.runSpeed = (inp.run && canRun ? RUN : WALK) * slow;
    // 공격 버튼이 눌려 있으면 이동 대신 기술 입력 (필드와 같은 규칙):
    // 방향키는 캐릭터가 보는 방향 기준 앞/뒤, Shift 는 '아래'
    const buttons = inp.buttons ?? NEUTRAL_INPUT.buttons;
    const requestedSkill =
      inp.skill === 'flyingKick'
        ? MOVES.smallSilverFlyingKick
        : inp.skill === 'tornadoKick'
          ? MOVES.smallSilverTornadoKick
          : inp.skill === 'backTurnKick'
            ? MOVES.smallSilverBackTurnKick
            : null;
    const canUseSkill =
      requestedSkill &&
      this.profile.body === 'smallSilverGirl' &&
      p.isActionable &&
      !this.seat &&
      !this.ride &&
      !this.rideQueue &&
      !this.fishing &&
      !this.doorway &&
      this.downedAt === null &&
      this.caughtAt === null;
    if (requestedSkill && canUseSkill) {
      p.queueMove(requestedSkill);
      this.say(`✨ ${requestedSkill.name}!`, 1.2);
    } else if (inp.skill && this.profile.body !== 'smallSilverGirl') {
      this.say('작은은발소녀 전용 스킬이에요', 1.5);
    }
    const skillAttack = !!(requestedSkill && canUseSkill);
    const attacking = buttons.some(Boolean) || skillAttack;
    // 싸우는 중엔 숙이기 키(C)를 누르면 숙이기 (상단 공격을 피한다). 키보드 ↓ 는 언제나 그냥 걷기.
    // 터치는 조이스틱을 아래로'만' 밀면 숙이기 (대각선은 평소처럼 이동)
    const sideways = !!inp.move && Math.abs(inp.move.x) > 1e-6;
    this.downOnlyFrames = inp.down && !sideways ? this.downOnlyFrames + 1 : 0;
    const duck = this.inCombat && (!!inp.duck || this.downOnlyFrames >= 4);
    let h: -1 | 0 | 1 = 0;
    if (inp.move && !duck) {
      const d = (inp.move.x * p.fx + inp.move.z * p.fz) / Math.hypot(inp.move.x, inp.move.z);
      h = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    }
    p.freeMove = attacking || duck ? null : inp.move;
    p.feed({ dir: attacking ? dirFrom(h, inp.crouch || duck ? -1 : 0) : duck ? dirFrom(0, -1) : 5, buttons, jump: inp.jump });
    const frozen = this.hitstop > 0;
    if (frozen) this.hitstop--;
    else {
      p.tick({ opponent: p, awayX: 0, awayZ: -1 });
      this.autoAim();
    }
    this.collideFighter(p);
    this.stepStairs();
    this.pets.step({
      frame: this.frame,
      location: this.location,
      homeOwner: this.homeOwner,
      px: p.x,
      pz: p.z,
      fx: p.fx,
      fz: p.fz,
      homeRoom: HOME.room,
      collide: (x, z) => this.collidePoint(x, z),
      blockedAtHome: (x, z) => HOME.furniture.some((f) => x > f.rect.x0 - 0.3 && x < f.rect.x1 + 0.3 && z > f.rect.z0 - 0.3 && z < f.rect.z1 + 0.3),
    });
    if (this.location === 'store') this.stepStore();
    if (this.location === 'home') this.stepMom();
    if (!frozen) this.hitRemotes();

    this.regenHp(inp);
    this.nearby = sleeping || this.doorway || this.lookingOut || this.fishing || this.ride || this.seat?.spot === 'sofa' ? null : this.findNearby();
    if (inp.interact && !sleeping && this.job?.tryInteract()) {
      // 출입 확인 처리됨
    } else if (inp.interact && this.nearby) this.interact(this.nearby);
    if (this.toast && this.frame > this.toast.until) this.toast = null;

    // 행인·차·경찰·반장님: 모두가 같은 장면을 보도록 한 사람이 계산한다
    this.stepTown(frozen, true);
    if (this.job) {
      const end = this.job.step(frozen);
      if (end) this.endJob(end);
    }
    if (p.hp <= 0 && this.downedAt === null) this.knockedDown();
    this.profile.life.hp = p.hp;
    const t = (this.profile.time ??= { day: this.day, minutes: this.minutes });
    t.day = this.day;
    t.minutes = this.minutes;
  }

  // ───────────────────────── 일자리 ─────────────────────────

  /** 근무 시작: 경비실 앞에 있어야 한다. @returns 안 되면 이유 */
  startJob(id: string): string {
    const job = JOB_BY_ID[id];
    if (!job) return '없는 일자리예요';
    if (this.job) return '이미 근무 중이에요';
    const busy = this.jobTakenBy(id);
    if (busy) return `${busy.name} 님이 지금 ${job.name} 근무 중이에요. 끝나면 할 수 있어요`;
    if (this.profile.level < job.minLevel) return `레벨 ${job.minLevel} 이상부터 할 수 있어요`;
    if (this.profile.life.fatigue >= 95) return '너무 피곤해서 일할 수 없어요. 먼저 자고 오세요';
    const c = LOBBY.chair;
    if (this.location !== 'lobby' || Math.hypot(c.x - this.player.x, c.z - this.player.z) > 2.2) return `${job.place}에 가야 근무를 시작할 수 있어요`;
    this.job = new GuardShift(this);
    this.autopilot = null;
    this.sitAtDesk();
    this.say(`${job.icon} 근무 시작! 데스크 앞에 멈춘 사람을 E 로 확인하자 (${job.shiftMinutes}분, 방향키로 일어서기)`, 4);
    return '';
  }

  /** 조기 퇴근 (일한 만큼 받는다) */
  quitJob() {
    if (this.job) this.endJob('quit');
  }

  /** 이 일자리를 지금 하고 있는 친구 (한 자리엔 한 명만 근무한다) */
  jobTakenBy(id: string): RemotePlayer | null {
    for (const r of this.remotes.values()) if (r.job === id) return r;
    return null;
  }

  /** 친구가 거의 동시에 먼저 근무를 시작했다: 내 근무는 없던 일로 (급여·기록 없음) */
  private yieldJob(to: RemotePlayer) {
    if (!this.job) return;
    this.job = null;
    this.standUp();
    this.say(`👮 ${to.name} 님이 먼저 근무를 시작해서 자리를 양보했어요`, 4);
  }

  /** 마지막 근무 정산 문구 (HUD 가 잠깐 보여준다) */
  payslip: { text: string; until: number } | null = null;

  private endJob(reason: ShiftEnd) {
    const job = this.job;
    if (!job) return;
    this.job = null;
    this.standUp();
    const text = job.finish(reason);
    this.payslip = { text, until: this.frame + 8 * 60 };
    this.say(text, 6);
  }

  // ───────────────────────── 놀이공원 ─────────────────────────

  /** 지하철을 타고 놀이공원으로 (역 앞에서 내린다) */
  private goToPark() {
    this.parkReturn = { x: this.player.x, z: this.player.z };
    this.moveTo('park', PARK.spawn.x, PARK.spawn.z, 0, -1);
    this.say('🎡 한강랜드에 도착! 놀이기구 앞에서 E 를 누르면 줄을 서요', 4);
  }

  /**
   * 놀이공원 안에서 놀이기구(또는 역) 입구까지 길을 따라 걸어간다 (지도 · 가이드에서 누르면).
   * @returns 안내 문구 (비어 있으면 출발)
   */
  parkNavigate(target: RideId | 'station'): string {
    if (this.location !== 'park') return '놀이공원 안에서만 쓸 수 있어요';
    if (this.ride) return '놀이기구에서 내린 뒤에 이동할 수 있어요';
    this.rideQueue = null;
    const node = target === 'station' ? 'station' : RIDE_NODE[target];
    const path = parkPathTo(this.player.x, this.player.z, node);
    if (!path.length) return '거기로는 갈 수 없어요';
    const label = target === 'station' ? '🚇 한강공원역' : `${RIDES[target].icon} ${RIDES[target].name.split(' (')[0]}`;
    this.autopilot = { path, i: 0, label };
    this.parkTarget = target;
    this.say(`🧭 ${label}(으)로 가는 중… (방향키를 누르면 취소)`, 2.5);
    return '';
  }

  /** 놀이공원 안내 중인 목적지 (가이드 패널 · 화살표) */
  parkTarget: RideId | 'station' | null = null;

  /** 가이드 패널: 놀이기구마다 지금 상태 · 기다릴 시간 · 거리 */
  parkGuide(): { id: RideId; icon: string; name: string; state: 'board' | 'run' | 'wait'; text: string; wait: number; dist: number }[] {
    const now = this.parkClock();
    const p = this.player;
    return RIDE_IDS.map((id) => {
      const R = RIDES[id];
      const ck = rideClock(id, now);
      const wait = this.waitSeconds(id, now);
      const dist = Math.round(Math.hypot(p.x - R.gate.x, p.z - R.gate.z));
      const state: 'board' | 'run' | 'wait' = id === 'wheel' ? (this.canBoard(id, now) ? 'board' : 'wait') : ck.phase === 'boarding' ? 'board' : ck.phase === 'running' ? 'run' : 'wait';
      const text = id === 'wheel' ? (state === 'board' ? '지금 탑승 가능' : `다음 칸 ${wait}초`) : state === 'board' ? `탑승 중 · 출발 ${Math.ceil(ck.left)}초` : state === 'run' ? `운행 중 · 다음 탑승 ${wait}초` : `곧 탑승 · ${wait}초`;
      return { id, icon: R.icon, name: R.name, state, text, wait, dist };
    });
  }

  /** 놀이공원 역에서 다시 동네(한강공원역)로 */
  private leavePark() {
    const st = this.map.pois.find((q) => q.kind === 'subway');
    const back = this.parkReturn ?? (st ? { x: st.x, z: st.z + 1.5 } : { x: this.map.home.x, z: this.map.home.z + 1 });
    this.moveTo('city', back.x, back.z, 0, 1);
    this.say('🚇 동네로 돌아왔어요', 2.5);
  }

  private parkReturn: { x: number; z: number } | null = null;

  /** 지금 이 놀이기구에 탈 수 있나 (탑승 시간 · 대관람차는 칸이 맨 아래 근처일 때) */
  private canBoard(id: RideId, now: number) {
    if (id === 'wheel') return wheelCabinAtBottom(now).off < 0.2;
    const ck = rideClock(id, now);
    return ck.phase === 'boarding' && ck.left > 1.5;
  }

  /** 비어 있는 좌석 (친구가 앉은 자리는 피한다). 무서운 자리부터: 맨 앞 칸 · 바이킹 양 끝 */
  private freeSeat(id: RideId, now: number): number | null {
    const taken = new Set<number>();
    for (const r of this.remotes.values()) if (r.room === this.roomKey && r.ride?.id === id) taken.add(r.ride.seat);
    if (id === 'wheel') {
      const { cabin } = wheelCabinAtBottom(now);
      for (let j = 0; j < 4; j++) if (!taken.has(cabin * 4 + j)) return cabin * 4 + j;
      return null;
    }
    const n = RIDES[id].seats;
    const order = id === 'viking' ? [0, 1, 2, 9, 10, 11, 3, 4, 5, 6, 7, 8] : Array.from({ length: n }, (_, i) => i);
    for (const k of order) if (!taken.has(k)) return k;
    return null;
  }

  private joinRide(id: RideId) {
    if (this.ride) return;
    const now = this.parkClock();
    if (this.canBoard(id, now)) {
      this.board(id, now);
      return;
    }
    this.rideQueue = id;
    this.say(`${RIDES[id].icon} 줄을 섰어요 — 다음 탑승까지 약 ${this.waitSeconds(id, now)}초 (멀리 가면 줄에서 빠져요)`, 3.5);
  }

  /** 다음 탑승까지 남은 초 */
  private waitSeconds(id: RideId, now: number) {
    if (id === 'wheel') {
      const step = (2 * Math.PI) / WHEEL.cabins;
      const speed = (2 * Math.PI) / WHEEL.period;
      return Math.max(1, Math.ceil(Math.max(0, step - wheelCabinAtBottom(now).off - 0.2) / speed));
    }
    const ck = rideClock(id, now);
    return Math.max(1, Math.ceil(ck.phase === 'boarding' ? RIDES[id].period - RIDES[id].board + ck.left : ck.nextBoard));
  }

  private board(id: RideId, now: number) {
    const seat = this.freeSeat(id, now);
    if (seat === null) {
      this.say(`${RIDES[id].icon} 자리가 꽉 찼어요. 다음 운행을 기다려요`, 3);
      this.rideQueue = id;
      return;
    }
    this.rideQueue = null;
    this.ride = { id, seat, at: now, cycle: rideClock(id, now).cycle };
    this.rideLookYaw = 0;
    this.rideLookPitch = 0;
    const where = id === 'coaster' ? ` (${Math.floor(seat / 4) + 1}번째 칸${seat < 2 ? ' 맨 앞줄!' : ''})` : '';
    this.say(id === 'wheel' ? '🎡 대관람차 탑승! 한 바퀴 도는 동안 경치를 즐겨요 (방향키로 둘러보기)' : `${RIDES[id].icon} 탑승${where} — 안전바를 내립니다. E: 출발 전에 내리기`, 4);
  }

  /** 내린다 (운행이 끝났거나 출발 전에 내렸다) */
  private unboard(done: boolean) {
    const r = this.ride;
    if (!r) return;
    this.ride = null;
    const ex = RIDES[r.id].exit;
    this.placePlayer(ex.x, ex.z, 0, 1);
    if (done) {
      const msg: Record<RideId, string> = {
        coaster: '🎢 다리가 후들거린다… 한 번 더?',
        drop: '🗼 심장이 아직도 쿵쾅거린다',
        viking: '🏴‍☠️ 속이 울렁울렁…',
        wheel: '🎡 한강이 한눈에 보였다',
        gyro: '🌀 하늘과 땅이 몇 번 뒤집혔는지 모르겠다…',
        sky: '🪂 한강 위를 날아다닌 것 같았다',
      };
      this.say(msg[r.id], 3.5);
    }
  }

  /** 줄 서기 · 탑승 중 (매 프레임) */
  private stepRide(inp: CityInput) {
    const now = this.parkClock();
    if (this.location !== 'park') {
      this.ride = null;
      this.rideQueue = null;
      return;
    }
    if (this.rideQueue && !this.ride) {
      const q = this.rideQueue;
      const g = RIDES[q].gate;
      if (Math.hypot(this.player.x - g.x, this.player.z - g.z) > 6) {
        this.rideQueue = null;
        this.say('줄에서 빠졌어요', 2);
      } else if (this.canBoard(q, now)) this.board(q, now);
      return;
    }
    const r = this.ride!;
    const ck = rideClock(r.id, now);
    // 고개 돌리기: 방향키 (손을 떼면 천천히 앞으로)
    const mv = inp.move;
    if (mv) {
      this.rideLookYaw = Math.max(-1.9, Math.min(1.9, this.rideLookYaw - mv.x * 0.035));
      this.rideLookPitch = Math.max(-1.0, Math.min(0.9, this.rideLookPitch - mv.z * 0.025));
    } else {
      this.rideLookYaw *= 0.97;
      this.rideLookPitch *= 0.97;
    }
    // 좌석은 그 자리에 고정: 걷기·공격·점프 입력은 쓰지 않는다
    const leave = inp.interact;
    inp.move = null;
    inp.run = false;
    inp.interact = false;
    inp.jump = false;
    inp.buttons = undefined;
    inp.down = false;
    inp.duck = false;
    inp.crouch = false;
    if (r.id === 'wheel') {
      if (now - r.at >= WHEEL_RIDE_MS - 500) this.unboard(true);
      return;
    }
    if (ck.cycle !== r.cycle || ck.phase === 'idle') {
      this.unboard(true);
      return;
    }
    if (ck.phase === 'boarding') {
      if (leave) {
        this.unboard(false);
        this.say('내렸어요', 1.5);
        return;
      }
      // 친구와 같은 자리에 동시에 앉았으면 id 가 큰 쪽이 다른 자리로
      const me = this.netId ?? '';
      for (const o of this.remotes.values()) {
        if (o.room === this.roomKey && o.ride?.id === r.id && o.ride.seat === r.seat && o.id < me) {
          const s2 = this.freeSeat(r.id, now);
          if (s2 !== null) r.seat = s2;
        }
      }
      const left = Math.ceil(ck.left);
      if (this.frame - this.rideSaidAt > 60 && left <= 5) {
        this.rideSaidAt = this.frame;
        this.say(left <= 1 ? '🔔 출발합니다!' : `⏱️ 출발 ${left}초 전`, 1);
      }
    }
  }

  /** 탑승 · 줄 서기 안내 문구 */
  private ridePrompt(): string | null {
    if (this.location !== 'park') return null;
    const now = this.parkClock();
    if (this.ride) {
      const R = RIDES[this.ride.id];
      if (this.ride.id === 'wheel') return `${R.icon} 대관람차 — 방향키로 둘러보기 (내릴 때까지 ${Math.max(0, Math.ceil((WHEEL_RIDE_MS - (now - this.ride.at)) / 1000))}초)`;
      const ck = rideClock(this.ride.id, now);
      return ck.phase === 'boarding' ? `${R.icon} 출발까지 ${Math.ceil(ck.left)}초 · E: 내리기 · 방향키: 고개 돌리기` : `${R.icon} 운행 중! 방향키: 고개 돌리기`;
    }
    if (this.rideQueue) return `${RIDES[this.rideQueue].icon} 줄 서는 중 — 탑승까지 약 ${this.waitSeconds(this.rideQueue, now)}초`;
    return null;
  }

  /** HUD 안내: 근무 중 출입 확인이 먼저, 아니면 근처 장소 */
  get promptLabel(): string | null {
    return this.job?.prompt ?? this.ridePrompt() ?? this.nearby?.label ?? null;
  }

  // ───────────────────────── 체력 ─────────────────────────

  /** 쉬면 체력이 조금씩 찬다. 싸운 직후엔 안 차고, 공원·집에선 더 빨리 */
  private regenHp(inp: CityInput) {
    const p = this.player;
    if (p.hp <= 0 || p.hp >= p.maxHp || this.sleep) return;
    if (this.frame - this.lastCombatFrame < HP_REGEN_COMBAT_COOLDOWN) return;
    const resting = this.location === 'home' || (this.inTrailPark() && !this.job);
    const still = !inp.move && p.state === 'idle';
    const rate = resting ? HP_REGEN_REST * (still ? 1.5 : 1) : still ? HP_REGEN_IDLE : 0;
    this.hpAcc += rate * p.maxHp / 100;
    if (this.hpAcc >= 1) {
      const n = Math.floor(this.hpAcc);
      this.hpAcc -= n;
      p.hp = Math.min(p.maxHp, p.hp + n);
    }
  }

  /** 체력이 0: 덤비던 사람들은 물러나고, 잠시 뒤 집에서 깨어난다 */
  private knockedDown() {
    this.downedAt = this.frame;
    this.stopFishing(true);
    if (this.job) this.endJob('down');
    this.autopilot = null;
    this.dialog = null;
    // 나에게 덤비던 사람들은 물러난다 (동네를 계산하는 쪽에서. 아니면 내가 쓰러진 걸 보고 알아서 물러난다)
    if (this.isTownHost) {
      for (const n of this.npcs) {
        if (n.fight > 0 && n.foe === this.myId) {
          n.fight = 0;
          n.flee = 0;
          this.townSay({ x: n.fighter.x, z: n.fighter.z, text: GLOAT[Math.floor(this.rng() * GLOAT.length)], color: '#ffb3b3' });
        }
      }
    }
    const pvp = this.lastPvp && this.frame - this.lastPvp.frame < PVP_MEMORY ? this.lastPvp.name : null;
    this.say(pvp ? `💫 ${pvp}에게 당했다… 집에서 다시 시작해요` : '💫 정신을 잃었다…', 3.5);
  }

  /** 집 침대 옆에서 깨어난다: 체력 일부만, 지갑에서 돈이 좀 빠져 있다 */
  private wakeAfterKO() {
    this.downedAt = null;
    if (this.isTownHost && this.police.wanted === this.myId) this.clearPolice();
    // 친구에게 쓰러졌으면 돈은 잃지 않는다
    const pvp = this.lastPvp !== null && this.frame - this.lastPvp.frame < PVP_MEMORY + KO_FRAMES;
    this.lastPvp = null;
    const lost = pvp ? 0 : Math.floor(this.profile.gold * 0.1);
    this.profile.gold -= lost;
    this.moveTo('home', HOME.bed.path[1].x, HOME.bed.path[1].z, 0, 1);
    this.player.hp = Math.round(this.player.maxHp * 0.35);
    // 혼자면 행인도 새로 (친구와 같이 보는 거리는 그대로)
    if (this.isTownHost && !this.othersInCity()) this.npcs = this.npcs.map(() => this.makeNpc());
    saveProfile(this.profile);
    this.say(`🛏️ 집에서 눈을 떴다… (체력 35%${lost ? `, 지갑에서 ${lost}G 가 사라졌다` : ''})`, 4);
  }

  /** 렌더러용: 쌓인 히트 이펙트 이벤트를 가져간다 */
  drainEvents(): CombatEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** 렌더러용: 쌓인 말풍선을 가져간다 */
  drainSpeech(): Speech[] {
    const s = this.speech;
    this.speech = [];
    return s;
  }

  // ───────────────────────── 행인 때리기 · 돈 줍기 ─────────────────────────

  /**
   * 새 기술을 시작한 순간, 가까운 사람(행인·경찰·로비의 강도·주민)이 있으면 그쪽을 보고 친다.
   * 허공을 향해 눌러도 근처 사람에게 향한다. 앞쪽에 있는 사람을 조금 더 우선한다.
   */
  private aimSerial = 0;
  private aimTarget: Fighter | null = null;

  /**
   * 공격을 시작하면 가까운 상대 쪽으로 몸을 돌리고, 기술이 나가기 직전(발동 프레임)까지 그 상대를 계속 바라본다.
   * 상대가 조금 움직여도 헛치지 않고 확실하게 맞는다
   */
  private autoAim() {
    const p = this.player;
    if (p.moveSerial !== this.aimSerial) {
      this.aimSerial = p.moveSerial;
      this.aimTarget = p.state === 'attack' ? this.pickAim() : null;
    }
    const t = this.aimTarget;
    const m = p.move;
    if (!t || p.state !== 'attack' || !m || p.frame > m.startup || t.hp <= 0 || t.state === 'ko') return;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4 || len > AIM_RANGE) return;
    p.fx = dx / len;
    p.fz = dz / len;
  }

  /** 공격할 상대 고르기: 정면에 가까운 쪽을 더 쳐 준다 */
  private pickAim(): Fighter | null {
    const p = this.player;
    const cands: Fighter[] = [];
    if (this.location === 'city') {
      for (const n of this.npcs) if (n.koFrames < 0) cands.push(n.fighter);
      cands.push(...this.police.officers);
    } else if (this.job && (this.location === 'lobby' || this.location === 'corridor')) {
      const place = this.job.guardPlace;
      for (const q of this.job.people) if (q.koFrames < 0 && q.where === place) cands.push(q.f);
    }
    // 같은 곳에 있는 친구
    for (const r of this.remotes.values()) if (r.room === this.roomKey && r.fighter.hp > 0) cands.push(r.fighter);
    let best: Fighter | null = null;
    let bestScore = Infinity;
    for (const f of cands) {
      if (f.state === 'ko' || f.hp <= 0) continue;
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > AIM_RANGE || d < 1e-4) continue;
      // 정면이면 거리 그대로, 등 뒤면 두 배 멀게 친다
      const front = (dx * p.fx + dz * p.fz) / d;
      const score = d * (1.5 - 0.5 * front);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  /**
   * 내 공격이 행인·경찰에게 맞는지.
   * 동네를 계산하는 사람(호스트)이면 바로 처리하고, 아니면 맞는 모습만 먼저 보여 주고 호스트에게 알린다 (호스트가 같은 계산으로 처리)
   */
  private hitNpcs() {
    const p = this.player;
    const host = this.isTownHost;
    const me = this.myId;
    let stop = 0;
    const targets: { f: Fighter; npc: Npc | null }[] = [
      ...this.npcs.map((n) => ({ f: n.fighter, npc: n })),
      ...this.police.officers.map((f) => ({ f, npc: null })),
    ];
    for (const { f, npc } of targets) {
      // 서로 겹치지 않게 (남이 계산하는 사람이면 내가 밀려난다)
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = FIGHTER_RADIUS * 1.6;
      if (d < min && d > 1e-6 && f.state !== 'ko') {
        // 서로 반씩 밀려난다 (남이 계산하는 사람이면 내가 다 비켜 준다)
        const k = host ? (min - d) / 2 : min - d;
        if (host) {
          f.x += (dx / d) * k;
          f.z += (dz / d) * k;
        }
        p.x -= (dx / d) * k;
        p.z -= (dz / d) * k;
      }
      const h = detectHit(p, f);
      if (!h) continue;
      const remaining = totalFrames(h.mv) - p.frame + 1;
      const out = applyHit(h);
      this.events.push(out.event);
      if (host) this.shareEvent(out.event, me);
      stop = Math.max(stop, Math.min(out.hitstop, 5));
      if (!npc) {
        this.townSay({ x: f.x, z: f.z, text: '공무집행방해야!', color: '#8fc7ff' });
        continue;
      }
      this.lastCombatFrame = this.frame;
      npc.hpShowUntil = Math.max(npc.hpShowUntil, this.frame + 240);
      if (host) this.npcStruck(npc, me);
      else {
        npc.lockUntil = this.frame + HIT_LOCK_FRAMES;
        const q = (v: number) => Math.round(v * 100) / 100;
        this.outbox.push({ to: this.townHostId, t: f.index, m: h.mv.id, counter: h.counter, remaining, power: p.power, x: q(p.x), z: q(p.z), fx: q(p.fx), fz: q(p.fz) });
      }
    }
    if (stop) this.hitstop = stop;
  }

  /** (호스트) 행인이 맞았다: 쓰러지거나, 덤비거나, 도망치며 신고한다. by = 때린 사람 */
  private npcStruck(npc: Npc, by: string) {
    const f = npc.fighter;
    npc.hpShowUntil = Math.max(npc.hpShowUntil, this.frame + 240);
    npc.pause = 0;
    if (f.hp <= 0 && npc.koFrames < 0) this.knockOut(npc, by);
    else if (npc.koFrames < 0 && npc.brave) {
      // 반격: 도망 대신 덤빈다 (처음 맞았을 때만 한마디)
      if (npc.fight <= 0) this.townSay({ x: f.x, z: f.z, text: ANGRY[Math.floor(this.rng() * ANGRY.length)], color: '#ff9d7a' });
      npc.fight = NPC_FIGHT_FRAMES;
      npc.flee = 0;
      npc.foe = by;
    } else if (npc.koFrames < 0) {
      npc.flee = NPC_FLEE_FRAMES;
      npc.foe = by;
      this.townSay({ x: f.x, z: f.z, text: OUCH[Math.floor(this.rng() * OUCH.length)] });
      // 맞은 사람도 도망가면서 신고할 수 있다
      if (npc.reportAt < 0 && this.rng() < 0.5) npc.reportAt = this.frame + 150 + Math.floor(this.rng() * 150);
    }
    this.witness(f.x, f.z, npc, by);
  }

  /** 체력을 다 깎았다: 쓰러지고, 때린 사람이 지갑의 돈(가끔 소지품)을 줍는다 */
  private knockOut(n: Npc, by: string) {
    n.koFrames = 0;
    n.flee = 0;
    n.reportAt = -1;
    const f = n.fighter;
    this.townSay({ x: f.x, z: f.z, text: `+${n.wallet} G`, color: '#ffd54a' });
    const item = this.rng() < 0.35 ? ITEM_IDS[Math.floor(this.rng() * ITEM_IDS.length)] : undefined;
    if (by === this.myId) this.gainLoot(n.name, n.wallet, item);
    else this.note({ to: by, nm: n.name, g: n.wallet, it: item });
  }

  /** 쓰러뜨린 행인의 지갑을 줍는다 */
  private gainLoot(name: string, gold: number, itemId?: string) {
    const pr = this.profile;
    pr.gold += gold;
    let msg = `${name}의 지갑에서 ${gold}G 를 주웠다`;
    const item = itemId && (ITEM_IDS as readonly string[]).includes(itemId) ? ITEMS[itemId as (typeof ITEM_IDS)[number]] : undefined;
    if (item) {
      pr.inventory[item.id] = (pr.inventory[item.id] ?? 0) + 1;
      msg += ` · ${item.icon} ${item.name} 획득`;
    }
    this.say(msg, 3);
    saveProfile(pr);
  }

  // ───────────────────────── 생활 수치 · 식당 ─────────────────────────

  /** 시간이 흐르면 피곤해지고 배고파진다 (달리면 더 빨리) */
  private tickLife(running: boolean) {
    // 산책: 공원 안을 걸으면 피로가 조금씩 풀린다 (달리면 효과 없음)
    // 근무 중엔 공원 안 초소에 서 있어도 쉬는 게 아니다
    const resting = this.inTrailPark() && !this.job;
    if (resting && !running && !this.warned.park) {
      this.warned.park = true;
      this.say('🌳 산책하니 기분이 상쾌하다 (피로도가 서서히 줄어든다)', 3);
    }
    if (!resting) this.warned.park = false;
    const r = this.lifeTracker.tick(this.profile.life, { running, resting, attackSerial: this.player.moveSerial, working: !!this.job });
    if (r.warn) this.say(LIFE_WARNING[r.warn], 3);
    if (this.frame % 600 === 0) saveProfile(this.profile); // 10초마다 저장
    return r;
  }

  // ───────────────────────── 잠자기 ─────────────────────────

  /** 잠자기 단계 진행. 걸어가는 동안은 이동 입력을 만들어 준다 */
  private stepSleep(inp: CityInput) {
    const s = this.sleep!;
    const p = this.player;
    const t = this.frame - s.at;
    const next = (phase: SleepPhase) => {
      s.phase = phase;
      s.at = this.frame;
    };
    switch (s.phase) {
      case 'walk': {
        const path = HOME.bed.path;
        const wp = path[s.wp];
        if (Math.hypot(wp.x - p.x, wp.z - p.z) > 0.2 && t < 240) {
          inp.move = { x: wp.x - p.x, z: wp.z - p.z };
        } else if (s.wp < path.length - 1 && t < 240) {
          s.wp++;
        } else {
          // 침대 옆에 서서 침대 반대쪽을 보고 걸터앉을 준비
          this.placePlayer(path[path.length - 1].x, path[path.length - 1].z, -1, 0);
          next('lie');
        }
        return;
      }
      case 'lie':
        if (t >= SLEEP_LIE) {
          next('sleep');
          s.since = s.last = this.nowMs();
          this.profile.life.sleepAt = s.since;
          saveProfile(this.profile);
        }
        return;
      case 'sleep': {
        this.sleepRecover();
        // 직접 깨우기 전까지 계속 잔다: 아무 키(이동·E·공격·점프)나 누르면 일어난다. 12시간이 넘으면 저절로
        const raw = t >= SLEEP_SETTLE ? this.input.read(this) : null;
        const acted = !!raw && (!!raw.move || raw.interact || !!raw.jump || !!raw.buttons?.some(Boolean));
        const long = this.nowMs() - s.since >= SLEEP_MAX_MS;
        if (acted || long) {
          s.auto = long;
          next('wake');
          delete this.profile.life.sleepAt;
          saveProfile(this.profile);
        } else if (this.frame % 600 === 0) saveProfile(this.profile);
        return;
      }
      case 'wake':
        if (t >= SLEEP_WAKE) {
          this.sleep = null;
          this.placePlayer(HOME.bed.path[1].x, HOME.bed.path[1].z, 0, 1);
          const slept = sleptLabel(Math.min(s.last, this.nowMs()) - s.since);
          this.say(`☀️ ${s.auto ? '12시간을 자고 저절로 깼다' : '잘 잤다!'} (${slept} 잠) · 피로도 ${Math.round(this.profile.life.fatigue)} · ${this.clock}`, 4);
        }
        return;
    }
  }

  /** 지금 실제 시각 (ms). 동네 시계가 없으면(헤드리스 시험) 게임 시각에서 거꾸로 계산 */
  nowMs(): number {
    return this.sharedClock ? this.sharedClock() : CLOCK_EPOCH + ((this.day - 1) * 1440 + this.minutes) * MS_PER_GAME_MINUTE;
  }

  /** 잔 시간만큼 회복 (12시간까지만 친다). 창을 닫았다 와도 그동안 잔 만큼 한 번에 */
  private sleepRecover() {
    const s = this.sleep!;
    const now = Math.min(this.nowMs(), s.since + SLEEP_MAX_MS);
    const dt = now - s.last;
    if (dt <= 0) return;
    s.last = now;
    const life = this.profile.life;
    life.fatigue = Math.max(0, life.fatigue - dt * SLEEP_FATIGUE_PER_MS);
    life.hunger = Math.min(100, life.hunger + dt * SLEEP_HUNGER_PER_MS);
    const p = this.player;
    p.hp = Math.min(p.maxHp, Math.round(p.hp + p.maxHp * dt * SLEEP_HP_PER_MS));
  }

  /** 새로 들어왔을 때: 자다가 나갔으면 침대에서 계속 잔다 (12시간이 넘었으면 일어나는 중으로) */
  resumeSleep() {
    const at = this.profile.life.sleepAt;
    if (typeof at !== 'number' || !Number.isFinite(at)) return;
    const path = HOME.bed.path;
    const end = path[path.length - 1];
    this.homeOwner = null;
    this.moveTo('home', end.x, end.z, -1, 0);
    this.sleep = { phase: 'sleep', at: this.frame - 60, wp: path.length - 1, since: at, last: at };
    this.sleepRecover();
    if (this.nowMs() - at >= SLEEP_MAX_MS) {
      this.sleep.auto = true;
      this.sleep.phase = 'wake';
      this.sleep.at = this.frame;
      delete this.profile.life.sleepAt;
      saveProfile(this.profile);
    }
  }

  /** 렌더러·HUD 용 잠자기 연출 값. rest: 0 = 서 있음 → 1 = 누움, blanket: 이불 덮임, dark: 불 꺼짐, night: 밤 진행도 */
  get sleepView(): { phase: SleepPhase; rest: number; blanket: number; dark: number; night: number; slept: number } | null {
    const s = this.sleep;
    if (!s) return null;
    const t = this.frame - s.at;
    switch (s.phase) {
      case 'walk':
        return { phase: 'walk', rest: 0, blanket: 0, dark: 0, night: 0, slept: 0 };
      case 'lie':
        return { phase: 'lie', rest: Math.min(1, t / SLEEP_LIE), blanket: 0, dark: Math.max(0, (t - SLEEP_LIE + 20) / 20), night: 0, slept: 0 };
      case 'sleep':
        return { phase: 'sleep', rest: 1, blanket: Math.min(1, t / 40), dark: 1, night: Math.min(1, (this.nowMs() - s.since) / SLEEP_MAX_MS), slept: this.nowMs() - s.since };
      case 'wake':
        return { phase: 'wake', rest: Math.max(0, 1 - Math.max(0, t - 15) / (SLEEP_WAKE - 15)), blanket: Math.max(0, 1 - t / 15), dark: Math.max(0, 1 - t / 25), night: 1, slept: s.last - s.since };
    }
  }

  // ───────────────────────── 지도 자동 이동 ─────────────────────────

  /** 지도에서 누른 곳으로 걸어간다 (건물을 피해 길찾기). @returns 안내 문구 */
  navigateTo(x: number, z: number, label = '선택한 곳'): string {
    // 놀이공원: 지하철을 타고 동네로 돌아온 뒤 그곳으로 걸어간다 (놀이공원 안 이동은 parkNavigate)
    if (this.location === 'park') {
      if (this.ride) return '놀이기구에서 내린 뒤에 이동할 수 있어요';
      this.rideQueue = null;
      this.leavePark();
    }
    if (this.location !== 'city') return '집 밖으로 나가야 이동할 수 있어요';
    this.nav ??= new CityNav(this.map);
    const path = this.nav.findPath(this.player.x, this.player.z, x, z);
    if (!path || !path.length) return '거기로는 갈 수 없어요';
    const deck = this.map.fishDecks.find((d) => Math.abs(x - d.x) < d.w / 2 && z > d.z0 && z < d.z1);
    if (deck) path.push({ x: deck.x, z: deck.z0 + 0.5 }, { x: deck.x, z: Math.min(z, deck.z1 - 0.7) });
    this.autopilot = { path, i: 0, label };
    this.dialog = null;
    this.say(`🧭 ${label}(으)로 이동 중… (방향키를 누르면 취소)`, 2.5);
    return '';
  }

  /** 자동 이동: 방향키·공격키를 누르면 취소, 아니면 다음 웨이포인트로 이동 입력을 만든다 */
  private followAutopilot(inp: CityInput) {
    const ap = this.autopilot;
    if (!ap) return;
    const manual = !!inp.move || (inp.buttons ?? []).some(Boolean) || (this.location !== 'city' && this.location !== 'park') || this.caughtAt !== null || !!this.ride;
    if (manual) {
      this.autopilot = null;
      this.parkTarget = null;
      return;
    }
    const p = this.player;
    let wp = ap.path[ap.i];
    while (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.7) wp = ap.path[++ap.i];
    if (!wp) {
      this.autopilot = null;
      this.parkTarget = null;
      this.say(this.location === 'park' ? `📍 ${ap.label} 도착 — 입구에서 E 를 누르면 줄을 서요` : `📍 ${ap.label} 도착`, 2.5);
      return;
    }
    inp.move = { x: wp.x - p.x, z: wp.z - p.z };
  }

  /** 플레이어가 아파트 단지 산책 공원 안에 있나 */
  inTrailPark(): boolean {
    if (this.location !== 'city') return false;
    const p = this.player;
    return this.map.trails.some((t) => p.x > t.x0 + 3 && p.x < t.x1 - 3 && p.z > t.z0 + 3 && p.z < t.z1 - 3);
  }

  get shop(): ShopDef | null {
    return this.dialog ? SHOPS[this.dialog.shop] ?? null : null;
  }

  closeDialog() {
    this.dialog = null;
  }

  // ───────────────────────── 박 반장 (대화형 NPC) ─────────────────────────

  /** 박 반장: 반장실 근무·순찰 (senior.ts). 같은 곳에 있으면 플레이어가 뚫고 못 지나가고, 강도가 들면 대화를 끊는다 */
  private stepSenior() {
    const s = this.senior;
    this.seniorAI.step();
    this.seniorAI.pushPlayer(this.player);
    if (this.npcChat?.npc === 'senior' && this.job?.robber) {
      this.npcChat = null;
      if (this.seniorAI.visibleTo()) this.pushSpeech({ x: s.x, z: s.z, text: '강도다! 얼른 가 보게!', color: '#ff9d7a' });
    }
  }

  closeNpcChat() {
    this.npcChat = null;
  }

  /** 엄마: 주방 앞에 서서 나를 바라본다. 부딪히면 밀어낸다 */
  private stepMom() {
    const m = this.mom;
    m.snapshot();
    m.freeMove = null;
    const dx = this.player.x - m.x;
    const dz = this.player.z - m.z;
    const d = Math.hypot(dx, dz);
    // 가까이 오면 나를 보고, 멀면 싱크대(서쪽) 쪽을 보며 일한다
    if (d < 3.2 && d > 0.1) {
      m.fx = dx / d;
      m.fz = dz / d;
    } else {
      m.fx = -1;
      m.fz = 0;
    }
    m.feed(NEUTRAL_INPUT);
    m.tick({ opponent: m, awayX: 0, awayZ: -1 });
    m.x = MOM_SPOT.x;
    m.z = MOM_SPOT.z;
    const r = FIGHTER_RADIUS * 1.6;
    const p = this.player;
    if (d < r) {
      if (d < 1e-6) p.x += r;
      else {
        p.x = m.x + (dx / d) * r;
        p.z = m.z + (dz / d) * r;
      }
    }
  }

  /** 가게 주인이 들려주는 동네 이야기. 방금 근처에서 사람을 때렸다면 그 소문이 먼저 돈다 */
  gossip(): string {
    const s = this.shop;
    if (!s) return '';
    if (this.frame - this.lastCrimeFrame < 60 * 120) {
      return this.police.phase === 'none'
        ? '방금 저 앞에서 누가 사람을 막 때렸대요… 무섭죠? 조심하세요.'
        : '밖에 경찰차 온 거 봤어요? 폭행 사건 때문이래요!';
    }
    return s.gossip[Math.floor(this.rng() * s.gossip.length)];
  }

  greeting(): string {
    const s = this.shop;
    return s ? s.greetings[Math.floor(this.rng() * s.greetings.length)] : '';
  }

  /** 지금 가진 골드로 음식을 산다 */
  buyFood(itemId: string, sign = this.dialog?.shop): { ok: boolean; message: string } {
    const s = sign ? (SHOPS[sign] ?? null) : null;
    const item = s?.menu.find((m) => m.id === itemId);
    if (!s || !item) return { ok: false, message: '그런 메뉴는 없어요.' };
    const pr = this.profile;
    if (pr.gold < item.price) return { ok: false, message: `아이고… ${item.price - pr.gold}G 가 모자라네요.` };
    if (item.hunger > 0 && pr.life.hunger < 5 && !item.fatigue) return { ok: false, message: '배불러서 더는 못 먹겠다…' };
    // 안경원 안경처럼 옷장에 들어가는 코디 아이템
    if (item.cosmetic) {
      const r = this.buyCosmetic(item.cosmetic);
      return r.ok ? { ok: true, message: `${r.message} — 옷장에 넣었어요 · 코디(O)에서 써 보세요` } : r;
    }
    // 꽃집 꽃처럼 가방에 넣는 물건
    if (item.keep) {
      if (pr.gold < item.price) return { ok: false, message: `${item.price - pr.gold}G 가 모자라요.` };
      pr.gold -= item.price;
      pr.inventory[item.keep] = (pr.inventory[item.keep] ?? 0) + 1;
      saveProfile(pr);
      return { ok: true, message: `${item.icon} ${item.name} — 가방에 넣었어요 (${pr.inventory[item.keep]}개) · "${s.thanks[Math.floor(this.rng() * s.thanks.length)]}"` };
    }
    if (item.hp && !item.fatigue && this.player.hp >= this.player.maxHp) return { ok: false, message: '지금은 다친 데가 없어요.' };
    pr.gold -= item.price;
    pr.life.hunger = Math.max(0, pr.life.hunger - item.hunger);
    pr.life.fatigue = Math.max(0, pr.life.fatigue - (item.fatigue ?? 0));
    let healed = 0;
    if (item.hp) {
      const before = this.player.hp;
      this.player.hp = Math.min(this.player.maxHp, before + item.hp);
      healed = this.player.hp - before;
      pr.life.hp = this.player.hp;
    }
    saveProfile(pr);
    const effect = [item.hunger ? `배고픔 -${item.hunger}` : '', item.fatigue ? `피로도 -${item.fatigue}` : '', healed ? `체력 +${healed}` : ''].filter(Boolean).join(', ');
    const thanks = s.thanks[Math.floor(this.rng() * s.thanks.length)];
    // 약은 "냠냠" 이 아니다
    const verb = item.hp || (!item.hunger && item.fatigue) ? '사용' : '냠냠';
    return { ok: true, message: `${item.icon} ${item.name} ${verb} (${effect || '효과 없음'}) — "${thanks}"` };
  }

  /** 근처에서 본 사람들 중 일부가 잠시 뒤 신고한다. by = 때린 사람 (경찰이 그 사람을 쫓는다) */
  private witness(x: number, z: number, victim: Npc, by: string) {
    this.lastCrimeFrame = this.frame;
    for (const n of this.npcs) {
      if (n === victim || n.koFrames >= 0 || n.reportAt >= 0 || n.flee > 0 || n.fight > 0) continue;
      const d = Math.hypot(n.fighter.x - x, n.fighter.z - z);
      if (d > WITNESS_RANGE) continue;
      if (n.brave && d < JOIN_RANGE && this.rng() < JOIN_CHANCE) {
        n.fight = NPC_FIGHT_FRAMES;
        n.foe = by;
        n.pause = 0;
        n.hpShowUntil = this.frame + NPC_FIGHT_FRAMES;
        this.townSay({ x: n.fighter.x, z: n.fighter.z, text: JOIN[Math.floor(this.rng() * JOIN.length)], color: '#ff9d7a' });
        continue;
      }
      if (this.rng() < 0.45) {
        n.reportAt = this.frame + 120 + Math.floor(this.rng() * 180);
        n.pause = n.reportAt - this.frame + 60; // 멈춰서 전화한다
        this.townSay({ x: n.fighter.x, z: n.fighter.z, text: CALL[Math.floor(this.rng() * CALL.length)], color: '#c8e6ff' });
      }
    }
    this.police.scene = { x, z };
    this.police.wanted = by;
  }

  // ───────────────────────── 경찰 ─────────────────────────

  private report(n: Npc) {
    const pol = this.police;
    this.townSay({ x: n.fighter.x, z: n.fighter.z, text: '경찰에 신고했어요!', color: '#c8e6ff' });
    if (pol.phase === 'none' || pol.phase === 'leaving') {
      this.clearPolice();
      pol.phase = 'dispatched';
      pol.dispatchAt = this.frame + DISPATCH_DELAY;
      this.tell(pol.wanted, '📞 누군가 112에 신고했다!', 3);
    }
  }

  private clearPolice() {
    const pol = this.police;
    pol.phase = 'none';
    pol.car = null;
    pol.officers = [];
    pol.lostFrames = 0;
    pol.chaseFrames = 0;
  }

  /** 사건 현장에서 가장 가까운 도로 위 정차 지점 + 45m 뒤 출발점 */
  private policeRoute() {
    const s = this.police.scene;
    let best: { stopX: number; stopZ: number; dx: number; dz: number } | null = null;
    let bestD = Infinity;
    for (const r of this.map.roads) {
      if (r.width > 12) continue; // 강변북로 제외
      const along = r.axis === 'x' ? s.x : s.z;
      const t = Math.max(r.from + 50, Math.min(r.to - 5, along));
      const stopX = r.axis === 'x' ? t : r.at + 2.5;
      const stopZ = r.axis === 'x' ? r.at + 2.5 : t;
      const d = Math.hypot(stopX - s.x, stopZ - s.z);
      if (d < bestD) {
        bestD = d;
        best = { stopX, stopZ, dx: r.axis === 'x' ? 1 : 0, dz: r.axis === 'z' ? 1 : 0 };
      }
    }
    return best!;
  }

  /** (호스트) 경찰: 신고 → 출동 → 범인(나든 친구든)이 현장 근처면 추격 → 잡거나 놓친다 */
  private stepPolice() {
    const pol = this.police;
    // 쫓는 사람 (거리에 없으면 null: 집에 숨었거나 나갔다)
    const p = this.folkFighter(pol.wanted);
    switch (pol.phase) {
      case 'none':
        break;
      case 'dispatched':
        if (this.frame >= pol.dispatchAt) {
          const r = this.policeRoute();
          pol.car = { x: r.stopX - r.dx * 45, z: r.stopZ - r.dz * 45, dx: r.dx, dz: r.dz, stopX: r.stopX, stopZ: r.stopZ };
          pol.phase = 'arriving';
        }
        break;
      case 'arriving': {
        const c = pol.car!;
        const remain = Math.hypot(c.stopX - c.x, c.stopZ - c.z);
        const step = Math.min(POLICE_CAR_SPEED, remain);
        c.x += c.dx * step;
        c.z += c.dz * step;
        if (remain > 0.01) break;
        // 도착: 범인이 아직 현장 근처면 추격, 아니면 철수
        const near = !!p && Math.hypot(p.x - pol.scene.x, p.z - pol.scene.z) < POLICE_SEARCH_RADIUS;
        if (!near) {
          pol.phase = 'leaving';
          this.tell(pol.wanted, '🚓 경찰이 왔지만 범인을 찾지 못했다', 3);
          break;
        }
        for (let k = 0; k < 2; k++) {
          const o = new Fighter(900 + k, 'police', { runSpeed: OFFICER_SPEED, maxHp: 99999, canBlock: false });
          o.reset(c.x + (k ? 1.2 : -1.2), c.z + 2.5, 0, 1);
          pol.officers.push(o);
        }
        pol.phase = 'chasing';
        this.tell(pol.wanted, '🚨 경찰이 도착했다! 도망쳐!', 2.5);
        break;
      }
      case 'chasing': {
        // 내가 잡혀서 끌려가는 중: 경찰은 그대로 서 있는다
        if (pol.wanted === this.myId && this.caughtAt !== null) break;
        pol.chaseFrames++;
        let nearest = Infinity;
        for (const o of pol.officers) {
          o.snapshot();
          const dx = p ? p.x - o.x : 0;
          const dz = p ? p.z - o.z : 0;
          const d = p ? Math.hypot(dx, dz) : Infinity;
          nearest = Math.min(nearest, d);
          o.freeMove = p && d > 0.5 ? { x: dx, z: dz } : null;
          o.feed(NEUTRAL_INPUT);
          o.tick({ opponent: o, awayX: 0, awayZ: -1 });
          this.collideFighter(o, 'city');
          if (p && d < CATCH_RANGE && o.isActionable) {
            this.policeCatch(pol.wanted);
            return;
          }
        }
        // 집에 숨거나, 충분히 멀어지거나, 1분이 지나면 포기
        pol.lostFrames = !p || nearest > LOSE_DISTANCE ? pol.lostFrames + 1 : 0;
        if (pol.lostFrames > 180 || pol.chaseFrames > 3600) {
          pol.phase = 'leaving';
          pol.officers = [];
          this.tell(pol.wanted, '경찰을 따돌렸다!', 3);
        }
        break;
      }
      case 'leaving': {
        const c = pol.car;
        if (c) {
          c.x += c.dx * POLICE_CAR_SPEED;
          c.z += c.dz * POLICE_CAR_SPEED;
          if (Math.hypot(c.x - c.stopX, c.z - c.stopZ) > 60) this.clearPolice();
        } else this.clearPolice();
        break;
      }
    }
  }

  /** 경찰이 범인을 잡았다. 친구면 그 친구에게 알리고 경찰은 돌아간다 */
  private policeCatch(id: string) {
    if (id === this.myId) {
      this.caughtAt = this.frame;
      this.say('🚔 경찰에게 잡혔습니다', 3);
      return;
    }
    this.note({ to: id, caught: 1 });
    this.police.phase = 'leaving';
    this.police.officers = [];
  }

  /** 경찰에게 잡힌 뒤: 집 앞에서 다시 시작 (행인·경찰 초기화) */
  private restart() {
    this.caughtAt = null;
    if (this.isTownHost) this.clearPolice();
    this.location = 'city';
    this.locationChangedAt = this.frame;
    this.placePlayer(this.map.home.x, this.map.home.z + 1, 0, 1);
    // 혼자면 행인도 새로 (친구와 같이 보는 거리는 그대로)
    if (this.isTownHost && !this.othersInCity()) this.npcs = this.npcs.map(() => this.makeNpc());
    this.hitstop = 0;
    this.say('집 앞에서 다시 시작합니다', 3);
  }

  // ───────────────────────── 상호작용 ─────────────────────────

  /** 일자리 등에서 쓰는 난수 (재현 가능) */
  random() {
    return this.rng();
  }

  pushSpeech(s: Speech) {
    this.speech.push(s);
  }

  pushEvent(e: CombatEvent) {
    this.events.push(e);
  }

  /** 싸우는 중인가: 방금 치고받았거나, 덤비는 사람·강도·경찰이 가까이 있다 */
  get inCombat(): boolean {
    if (this.frame - this.lastCombatFrame < 180) return true;
    const p = this.player;
    const near = (f: Fighter) => Math.hypot(f.x - p.x, f.z - p.z) < 6;
    if (this.location === 'lobby') return !!this.job?.robber;
    if (this.location !== 'city') return false;
    return this.npcs.some((n) => n.fight > 0 && near(n.fighter)) || this.police.officers.some(near);
  }

  /** 장비를 바꾼 뒤: 최대 체력·공격력을 다시 계산 */
  refreshStats() {
    const st = playerStats(this.profile);
    const p = this.player;
    p.maxHp = st.maxHp;
    p.power = st.power;
    p.hp = Math.min(p.hp, p.maxHp);
    saveProfile(this.profile);
  }

  /** 카지노: 베팅 (돈이 모자라면 false) */
  casinoBet(amount: number): boolean {
    const pr = this.profile;
    if (amount <= 0 || pr.gold < amount) return false;
    pr.gold -= amount;
    pr.casino ??= { played: 0, won: 0, lost: 0, best: 0 };
    pr.casino.played++;
    pr.casino.lost += amount;
    saveProfile(pr);
    return true;
  }

  /**
   * 채팅 보내기: 다듬고(길이·욕설) 기록·말풍선에 올린 뒤 마을로 보낸다.
   * @returns 못 보낸 이유 (보냈으면 null)
   */
  postChat(raw: string, now = Date.now()): string | null {
    const text = cleanChat(raw);
    if (!text) return '보낼 말을 입력해 주세요';
    if (now - this.lastChatAt < CHAT_GAP_MS) return '조금 천천히 보내 주세요';
    this.lastChatAt = now;
    this.addChat({ from: 'me', name: this.netName || '나', text, at: now, me: true });
    this.chatBubbles.push({ who: 'me', name: this.netName || '나', text });
    this.chatOut.push(text);
    return null;
  }

  /** 감정 표현 (👋 등): 내 머리 위에 띄우고 마을로 보낸다. @returns 보냈나 */
  postEmote(e: string, now = Date.now()): boolean {
    if (!(EMOTES as readonly string[]).includes(e) || now - this.lastEmoteAt < EMOTE_GAP_MS) return false;
    this.lastEmoteAt = now;
    this.chatBubbles.push({ who: 'me', name: this.netName || '나', text: e, emote: true });
    this.emoteOut.push(e);
    return true;
  }

  /** 친구의 감정 표현 (목록에 있는 이모지만) */
  receiveEmote(id: string, e: string) {
    if ((EMOTES as readonly string[]).includes(e)) this.chatBubbles.push({ who: id, name: '', text: e, emote: true });
  }

  /** 친구가 보낸 채팅 (마을 연결이 부른다). 같은 곳에 있으면 그 친구 머리 위에도 띄운다 */
  receiveChat(id: string, name: string, raw: string, now = Date.now()) {
    const text = cleanChat(String(raw ?? ''));
    if (!text) return;
    const nm = String(name || '이웃').slice(0, 16);
    this.addChat({ from: id, name: nm, text, at: now, me: false });
    this.chatBubbles.push({ who: id, name: nm, text });
  }

  private addChat(l: ChatLine) {
    this.chatLog.push(l);
    if (this.chatLog.length > CHAT_KEEP) this.chatLog.splice(0, this.chatLog.length - CHAT_KEEP);
    this.chatVersion++;
  }

  /** 골드 쓰기 (모자라면 false) */
  spendGold(amount: number): boolean {
    const pr = this.profile;
    if (amount < 0 || pr.gold < amount) return false;
    pr.gold -= amount;
    saveProfile(pr);
    return true;
  }

  /** 분수에 동전 던지기 (10G): 소원 한마디. 가끔 반짝 (작은 행운 — 골드 조금 돌려받기) */
  tossCoin() {
    const pr = this.profile;
    if (pr.gold < COIN_TOSS) {
      this.say('🪙 던질 동전이 없어요');
      return;
    }
    pr.gold -= COIN_TOSS;
    const wishes = ['오늘 하루도 무사히…', '다음 경기는 꼭 이기게 해 주세요', '로또 1등!', '좋은 이웃을 만나게 해 주세요', '보스를 한 번에 잡게…', '내일은 맑았으면', '건강하게 해 주세요'];
    const wish = wishes[Math.floor(this.rng() * wishes.length)];
    if (this.rng() < 0.1) {
      pr.gold += COIN_TOSS * 5;
      this.say(`🪙 퐁당! "${wish}" — ✨ 물속에서 동전이 반짝! +${COIN_TOSS * 5} G`, 4);
    } else this.say(`🪙 퐁당! "${wish}"`, 3);
    saveProfile(pr);
  }

  /** 버스 행선지: 동네 주요 장소 (정류장 앞에 내린다 — 실제로 서 있는 자리라 바로 E 로 들어갈 수 있다) */
  busDestinations(): { id: string; label: string; icon: string; x: number; z: number }[] {
    const find = (id: string) => this.map.pois.find((p) => p.id === id);
    const out: { id: string; label: string; icon: string; x: number; z: number }[] = [];
    const add = (id: string, label: string, icon: string, dz = 0) => {
      const p = find(id);
      if (p) out.push({ id, label, icon, x: p.x, z: p.z + dz });
    };
    add('lobby', '행복빌라 (내 집 앞)', '🏠', 1.4);
    add('petshop', '상가 거리 (펫샵·옷가게·낚시마트)', '🛍️');
    const karaoke = this.map.pois.find((p) => p.kind === 'shop' && p.label === '코인노래방');
    if (karaoke) out.push({ id: karaoke.id, label: '코인노래방', icon: '🎤', x: karaoke.x, z: karaoke.z });
    add('casino', '한강 그랜드 카지노', '🎰', 1);
    add('park-center', '근린공원', '🌳');
    add('trail', '한강뷰 단지 산책로', '🚶');
    add('fish-0', '한강공원 낚시 데크', '🎣');
    add('subway', '지하철 2호선 한강공원역', '🚇');
    return out;
  }

  /** 버스 타기: 교통비를 내고 행선지로 (돈이 모자라면 false) */
  busTravel(id: string): boolean {
    const d = this.busDestinations().find((x) => x.id === id);
    if (!d || this.location !== 'city' || this.job) return false;
    const pr = this.profile;
    if (pr.gold < BUS_FARE) {
      this.say(`💸 교통비가 모자라요 (${BUS_FARE} G)`);
      return false;
    }
    pr.gold -= BUS_FARE;
    saveProfile(pr);
    this.stopFishing(true);
    this.moveTo('city', d.x, d.z, 0, 1);
    this.say(`🚌 ${d.icon} ${d.label} 도착 (교통비 -${BUS_FARE} G)`, 3);
    return true;
  }

  /** 코인노래방: 곡 값 내기 (돈이 모자라면 false) / 음수면 돌려받기 */
  karaokePay(amount: number): boolean {
    // 방을 빌릴 때 산 곡에서 한 곡씩 쓴다 (음수 = 못 튼 곡 돌려받기)
    const r = this.karaokeRental;
    if (!r) return false;
    if (amount > 0) {
      if (r.songs <= 0) return false;
      r.songs--;
      return true;
    }
    if (amount < 0) r.songs = Math.min(r.bought, r.songs + 1);
    return true;
  }

  // ───────────────────────── 코인노래방: 방 빌리기 · 노래 동작 ─────────────────────────

  /** 이 방을 쓰고 있는 친구 이름 (같은 노래방 안에 있는 친구만). 비었으면 null */
  boothTakenBy(no: number): string | null {
    if (this.location !== 'store' || this.store?.kind !== 'karaoke') return null;
    for (const r of this.remotes.values()) if (r.room === this.roomKey && r.booth === no) return r.name;
    return null;
  }

  /** 카운터: 방 상태 (빈방 · 사용 중 · 내 방) */
  boothStates(): { no: number; state: 'free' | 'taken' | 'mine'; by: string | null }[] {
    return KARAOKE_BOOTHS.map((b) => {
      if (this.karaokeRental?.room === b.no) return { no: b.no, state: 'mine' as const, by: null };
      const by = this.boothTakenBy(b.no);
      return { no: b.no, state: by ? ('taken' as const) : ('free' as const), by };
    });
  }

  /** 카운터에서 방 빌리기 (곡 묶음 하나). 이미 빌렸으면 곡만 더 산다 */
  rentKaraoke(room: number, packIndex: number): { ok: boolean; message: string } {
    const pack = SONG_PACKS[packIndex];
    if (!pack) return { ok: false, message: '곡 수를 골라 주세요' };
    const mine = this.karaokeRental;
    if (mine && mine.room !== room) return { ok: false, message: `이미 ${mine.room}번방을 쓰고 있어요` };
    if (!mine) {
      if (!KARAOKE_BOOTHS.some((b) => b.no === room)) return { ok: false, message: '없는 방이에요' };
      const by = this.boothTakenBy(room);
      if (by) return { ok: false, message: `${room}번방은 ${by} 님이 쓰고 있어요` };
    }
    const pr = this.profile;
    if (pr.gold < pack.price) return { ok: false, message: `${(pack.price - pr.gold).toLocaleString()}G 가 모자라요` };
    pr.gold -= pack.price;
    saveProfile(pr);
    if (mine) {
      mine.songs += pack.songs;
      mine.bought += pack.songs;
      mine.paid += pack.price;
    } else this.karaokeRental = { room, songs: pack.songs, bought: pack.songs, paid: pack.price };
    const L = this.store;
    const text = mine ? `${pack.songs}곡 더 넣어 드렸어요~ 신나게 부르세요!` : `${room}번방 쓰세요~ ${pack.songs}곡 넣어 드렸어요! 🎤`;
    if (L?.kind === 'karaoke') this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text });
    return { ok: true, message: mine ? `🎫 ${pack.songs}곡 추가 (남은 곡 ${mine.songs})` : `🎫 ${room}번방 · ${pack.songs}곡 (${pack.price}G) — ${room}번방 문이 열렸어요` };
  }

  /** 노래방을 나간다: 빌린 방을 돌려주고, 안 부른 곡 값은 돌려받는다 */
  private endKaraokeRental() {
    const r = this.karaokeRental;
    if (!r) return;
    this.karaokeRental = null;
    this.karaokeRoom = null;
    if (this.seatBooth !== null) {
      this.seat = null;
      this.seatBooth = null;
    }
    const back = r.bought > 0 ? Math.floor((r.paid * r.songs) / r.bought) : 0;
    if (back > 0) {
      this.profile.gold += back;
      saveProfile(this.profile);
      this.say(`🎫 안 부른 ${r.songs}곡 값 ${back}G 를 돌려받았다`, 3);
    }
  }

  /** 내가 빌린 방 */
  private myBooth(): KaraokeBooth | null {
    const r = this.karaokeRental;
    return r && this.location === 'store' && this.store?.kind === 'karaoke' ? (KARAOKE_BOOTHS.find((b) => b.no === r.room) ?? null) : null;
  }

  /** 지금 내가 빌린 방 안에 서 있다 */
  inMyBooth(): boolean {
    const b = this.myBooth();
    if (!b) return false;
    const p = this.player;
    return p.x > b.rect.x0 && p.x < b.rect.x1 && p.z > b.rect.z0 && p.z < b.rect.z1;
  }

  /** 잠긴 방 문 (내 방이 아닌 방은 못 들어간다) */
  private lockedBoothRects(): Rect[] {
    const mine = this.karaokeRental?.room;
    return KARAOKE_BOOTHS.filter((b) => b.no !== mine).map(boothDoorRect);
  }

  /** 렌더러용: 이 방 문이 열려 있다 (내가 빌린 방만) */
  boothOpen(no: number): boolean {
    return this.karaokeRental?.room === no && this.location === 'store' && this.store?.kind === 'karaoke';
  }

  /**
   * 노래방 동작: 내 방 안에서만. 앉는 동작은 소파 자리로, 서는 동작은 화면 앞으로 가서 한다.
   * 움직이거나 E 를 누르면 그만둔다 (집 소파와 같은 방식).
   */
  karaokeAct(act: KaraokeAct): boolean {
    const b = this.myBooth();
    if (!b || !this.inMyBooth()) {
      this.say('🎤 내가 빌린 방 안에서만 할 수 있어요');
      return false;
    }
    const seated = isSeatedAct(act);
    const spot = seated ? b.sit : b.stand;
    const already = this.seat?.spot === 'sofa' && this.seat.phase !== 'stand' && this.seatBooth === b.no;
    this.autopilot = null;
    this.seatBooth = b.no;
    // 몸(위치)은 그 자리로 옮기고, 그림은 지금 자세에서 새 자세로 부드럽게 넘어간다
    this.placePlayer(spot.x, seated ? b.sit.z + 0.45 : spot.z, Math.sin(spot.yaw), Math.cos(spot.yaw));
    if (already) this.sofaAction(act);
    else {
      this.seat = { phase: 'sit', at: this.frame, spot: 'sofa' };
      this.sofa = { id: act, at: this.frame, prev: act, pt: 0 };
    }
    return true;
  }

  /** 렌더러용: 노래방 방 자리 (앉은 자리 · 서서 부르는 자리) */
  boothSpots(no: number | null): { sit: KaraokeBooth['sit']; stand: KaraokeBooth['stand'] } | null {
    const b = no === null ? null : KARAOKE_BOOTHS.find((q) => q.no === no);
    return b ? { sit: b.sit, stand: b.stand } : null;
  }

  // ───────────────────────── 상가 계단실 ─────────────────────────

  /** 계단실 다른 층으로 (또는 그 층 가게에서 층계참으로) */
  private goStairFloor(f: number, x: number, z: number, fx: number, fz: number) {
    const L = storeLayout(stairSign(f));
    this.store = L;
    this.pen = null;
    this.keeper.reset(L.keeper.x, L.keeper.z, 0, 1);
    this.moveTo('store', x, z, fx, fz);
    const shop = SHOP_BUILDING_FLOORS[f];
    this.say(f <= 1 ? '🏢 1층 계단 — 2층 코인노래방 · 3층 임대' : `🏢 ${f}층${shop ? ` — ${shop}` : ' — 비어 있는 층'}`, 2);
  }

  /** 카지노: 상금 받기 */
  casinoPay(amount: number) {
    if (amount <= 0) return;
    const pr = this.profile;
    pr.gold += amount;
    pr.casino ??= { played: 0, won: 0, lost: 0, best: 0 };
    pr.casino.won += amount;
    pr.casino.best = Math.max(pr.casino.best, amount);
    saveProfile(pr);
  }

  /** 근무 중 주민을 때렸다 */
  fireFromJob() {
    if (this.job) this.endJob('fired');
  }

  // ───────────────────────── 자동 행동 (먹기·자기) ─────────────────────────

  /** 행복빌라 층수 (복도는 2층 ~ 꼭대기 층) */
  get villaFloors(): number {
    return Math.max(2, Math.round(this.map.home.building.h / 3));
  }

  /** 지금 층 복도의 장소들 (엘리베이터·계단·현관·점검 지점) */
  private corridorPois(): Poi[] {
    const f = this.floor;
    const info = villaFloor(f);
    const pois: Poi[] = [{ id: 'elevator', kind: 'home', label: '엘리베이터 (층 고르기)', x: -4.3, z: -1.0, radius: 0.8 }];
    CORRIDOR.doors.forEach((x, i) => {
      const unit = `${f}0${i + 1}`;
      const friend = [...this.remotes.values()].find((r) => r.unit === unit);
      if (unit === this.homeUnit) pois.push({ id: 'myDoor', kind: 'home', label: `${unit}호 (내 집 들어가기)`, x, z: -1.0, radius: 0.6 });
      else if (friend) pois.push({ id: `visit:${friend.id}`, kind: 'home', label: `${unit}호 ${friend.name}의 집 (놀러 가기)`, x, z: -1.0, radius: 0.6 });
      else pois.push({ id: `door${i}`, kind: 'home', label: `${unit}호 ${info.units[i].resident}`, x, z: -1.0, radius: 0.6 });
    });
    for (const c of CORRIDOR.checkpoints) {
      const need = this.job?.patrolNeeds(f, c.id);
      pois.push({ id: `cp:${c.id}`, kind: 'job', label: need ? `${c.icon} ${c.label} (순찰)` : `${c.icon} ${c.label}`, x: c.x, z: c.z, radius: 0.9 });
    }
    return pois;
  }

  /** 층 이동 (1 = 로비) */
  /** ↓ 만 누르고 있는 프레임 (싸울 때 숙이기 판정) */
  private downOnlyFrames = 0;
  /** 자동 순찰로 데스크를 비웠나 (다 돌면 데스크로 돌아와 앉는다) */
  autoPatrolAway = false;
  /** 자동 순찰 중 직접 조작한 마지막 프레임 (-1 = 안 함) */
  private autoPatrolHeldAt = -1;

  /**
   * 자동 순찰: 순찰 시간이면 엘리베이터로 층을 올라가며 점검 지점을 돌고, 계단으로 내려와 데스크에 앉는다.
   * 강도가 있으면(수색·로비 전투) 멈추고 플레이어가 직접 움직인다. 방향키를 누르면 자동 순찰이 꺼진다.
   */
  private stepAutoPatrol(inp: CityInput) {
    const job = this.job;
    if (!job?.autoPatrol || job.hunt || job.robber || this.downedAt !== null) return;
    if (!job.patrol && !this.autoPatrolAway) return;
    // 직접 조작하면 잠깐 멈추고, 손을 떼고 1.5초 지나면 이어서 한다 (끄려면 P)
    if (inp.move || (inp.buttons ?? []).some(Boolean) || inp.jump) {
      if (this.autoPatrolHeldAt < 0) this.say('🔦 직접 조작 중 — 손을 떼면 자동 순찰을 이어서 한다 (끄려면 P)', 2.5);
      this.autoPatrolHeldAt = this.frame;
      return;
    }
    if (this.autoPatrolHeldAt >= 0) {
      if (this.frame - this.autoPatrolHeldAt < 90) return;
      this.autoPatrolHeldAt = -1;
    }
    const p = this.player;
    const go = (x: number, z: number, then: () => void) => {
      if (Math.hypot(x - p.x, z - p.z) < 0.35) then();
      else inp.move = { x: x - p.x, z: z - p.z };
    };
    // 데스크 뒤(서쪽)와 나머지 로비 사이는 데스크 북쪽 끝을 돌아서 다닌다
    const DESK_CORNER = { x: -4.0, z: -2.0 };
    const behindDesk = p.x < -3.5;
    if (this.location === 'lobby') {
      if (job.patrol) {
        this.autoPatrolAway = true;
        if (behindDesk && p.z > DESK_CORNER.z + 0.45) go(DESK_CORNER.x, DESK_CORNER.z, () => {});
        else go(LOBBY_PATH.elevator.x, LOBBY_PATH.elevator.z, () => this.goFloor(2));
      } else {
        // 순찰 끝: 데스크로 돌아와 앉기
        this.walkToChair(inp, () => (this.autoPatrolAway = false));
      }
      return;
    }
    if (this.location !== 'corridor') return;
    const f = this.floor;
    const left = job.patrol?.get(f);
    // 내려가는 계단은 남쪽 반: 먼저 남쪽 줄로 옮긴 다음 서쪽으로 걸어 내려간다 (올라가는 계단을 밟지 않게)
    const stairs = () => {
      const st = CORRIDOR.stairs;
      if (p.z < 0.3) go(Math.max(p.x, st.x1 + 0.4), 0.75, () => {});
      else go(st.x0 + 0.6, 0.75, () => {});
    };
    if (left?.size) {
      // 이 층에서 가장 가까운 점검 지점부터
      const cps = CORRIDOR.checkpoints.filter((c) => left.has(c.id));
      const cp = cps.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) <= Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
      go(cp.x, cp.z, () => job.patrolCheck(f, cp.id));
    } else if (job.patrol && [...job.patrol].some(([fl, s]) => fl > f && s.size)) {
      go(-4.3, -1.0, () => this.goFloor(f + 1));
    } else stairs();
  }

  /** 로비 어디서든 데스크 북쪽 끝을 돌아 의자까지 걸어가 앉는다 */
  private walkToChair(inp: CityInput, onSit?: () => void) {
    const p = this.player;
    const go = (x: number, z: number, then: () => void) => {
      if (Math.hypot(x - p.x, z - p.z) < 0.35) then();
      else inp.move = { x: x - p.x, z: z - p.z };
    };
    const CORNER = { x: -4.0, z: -2.0 };
    const behindDesk = p.x < -3.5;
    const c = LOBBY.chair;
    // 계단 쪽(동쪽)에 있으면 먼저 계단 앞에서 빠져나온다 (계단으로 다시 올라가지 않게)
    if (p.x > LOBBY.stairs.x0 - 0.4) go(LOBBY.stairs.x0 - 0.8, Math.max(p.z, LOBBY.stairs.z1 + 0.4), () => {});
    else if (!behindDesk && p.z > CORNER.z + 0.45) go(p.x, CORNER.z, () => {});
    else if (!behindDesk) go(CORNER.x, CORNER.z, () => {});
    else
      go(c.x, c.z, () => {
        onSit?.();
        this.sitAtDesk();
      });
  }

  /** 자동 체크 중: 로비에서 서 있으면 (직접 조작이 없을 때) 알아서 데스크로 가서 앉는다 */
  private autoDeskHeldAt = -1;
  private stepAutoDesk(inp: CityInput) {
    const job = this.job;
    if (!job?.autoCheck || this.location !== 'lobby' || this.seat || job.robber || job.hunt || this.downedAt !== null) return;
    if (job.autoPatrol && (job.patrol || this.autoPatrolAway)) return; // 순찰이 먼저
    if (inp.move || (inp.buttons ?? []).some(Boolean) || inp.jump) {
      this.autoDeskHeldAt = this.frame;
      return;
    }
    if (this.autoDeskHeldAt >= 0 && this.frame - this.autoDeskHeldAt < 90) return;
    this.autoDeskHeldAt = -1;
    this.walkToChair(inp);
  }

  /** @param via 엘리베이터 / 계단으로 올라옴(up) / 계단으로 내려옴(down) */
  private goFloor(f: number, via: 'elevator' | 'up' | 'down' = 'elevator') {
    this.seat = null;
    this.elevatorOpen = false;
    if (f <= 1) {
      if (via === 'down') this.moveTo('lobby', (LOBBY.stairs.x0 + LOBBY.stairs.x1) / 2, LOBBY.stairs.z1 + 0.5, 0, 1);
      else this.moveTo('lobby', LOBBY_PATH.elevator.x, LOBBY_PATH.elevator.z + 0.6, 0, 1);
      this.say('1층 로비');
      return;
    }
    this.floor = Math.min(this.villaFloors, f);
    const landing = CORRIDOR.stairs.x1 + 0.4;
    // 올라왔으면 내려가는 계단 꼭대기, 내려왔으면 올라가는 계단 아래에 선다
    if (via === 'up') this.moveTo('corridor', landing, 0.75, 1, 0);
    else if (via === 'down') this.moveTo('corridor', landing, -0.75, 1, 0);
    else this.moveTo('corridor', CORRIDOR.spawn.x, CORRIDOR.spawn.z, 1, 0);
    const mine = unitPlace(this.homeUnit).floor === this.floor ? ` · 내 집 ${this.homeUnit}호가 있는 층` : '';
    this.say(`${this.floor}층 복도${mine}`);
  }

  /** 계단: 로비 계단을 올라가거나, 복도 계단실 안쪽까지 걸어 들어가면 위·아래층으로 */
  private stepStairs() {
    if (this.downedAt !== null || this.seat || this.frame - this.locationChangedAt < 15) return;
    const p = this.player;
    if (this.location === 'lobby') {
      const st = LOBBY.stairs;
      if (p.x > st.x0 && p.z < st.z0 + 0.55) this.goFloor(2, 'up');
    } else if (this.location === 'corridor' && p.x < CORRIDOR.stairs.trigger) {
      if (p.z > 0) this.goFloor(this.floor - 1, 'down');
      else if (this.floor < this.villaFloors) this.goFloor(this.floor + 1, 'up');
    } else if (this.location === 'store' && this.store?.kind === 'stairs' && p.z < STAIR.trigger) {
      const f = stairFloorOf(this.store.sign);
      // 동쪽 계단 = 올라가기, 서쪽 계단 = 내려가기. 올라가면 위층 내려가는 계단 꼭대기, 내려가면 아래층 올라가는 계단 아래에 선다
      if (p.x > 0 && f < STAIR_TOP) this.goStairFloor(f + 1, -1.0, STAIR.start + 0.45, 0, 1);
      else if (p.x < 0 && f > 1) this.goStairFloor(f - 1, 1.0, STAIR.start + 0.45, 0, 1);
    }
  }

  /** 계단 위에 서 있으면 그만큼 몸을 올리고(+) 내린다(-) — 그림에만 쓴다 */
  stairLift(x: number, z: number): number {
    if (this.location === 'city') {
      // 행복빌라 현관 앞 화강석 계단 두 칸
      if (Math.abs(x - this.map.home.x) > 1.9) return 0;
      const dz = z - this.villaDoorZ(0);
      return dz < 1.0 ? 0.16 : dz < 1.6 ? 0.08 : 0;
    }
    if (this.location === 'store' && this.store?.kind === 'stairs') {
      if (z >= STAIR.start) return 0;
      const f = stairFloorOf(this.store.sign);
      const k = Math.min(1, (STAIR.start - z) / (STAIR.start - STAIR.room.z0));
      if (x > STAIR.mid && f < STAIR_TOP) return k * STAIR.rise;
      if (x < -STAIR.mid && f > 1) return -k * STAIR.rise;
      return 0;
    }
    if (this.location === 'lobby') {
      const st = LOBBY.stairs;
      if (x > st.x0 && x < st.x1 && z < st.z1 && z > st.z0) return ((st.z1 - z) / (st.z1 - st.z0)) * st.rise;
    } else if (this.location === 'corridor') {
      const st = CORRIDOR.stairs;
      if (x < st.x1) {
        const k = Math.min(1, (st.x1 - x) / (st.x1 - st.x0));
        if (z > 0) return -k * st.rise;
        return this.floor < this.villaFloors ? k * st.rise : 0;
      }
    }
    return 0;
  }

  /** 지금 층(또는 1층 로비)의 층 데이터 */
  get floorInfo() {
    return villaFloor(this.floor);
  }

  /** 엘리베이터에서 층을 골랐다 (1 = 로비) */
  rideElevator(f: number) {
    const here = this.location === 'lobby' ? 1 : this.floor;
    this.elevatorOpen = false;
    if (f < 1 || f > this.villaFloors) return;
    if (f === here) {
      this.say(`이미 ${f}층이에요`);
      return;
    }
    this.goFloor(f, 'elevator');
  }

  closeElevator() {
    this.elevatorOpen = false;
  }

  /** 창밖 내다보기: 방향키로 둘러보고, E 를 누르면 방 안으로 돌아온다 */
  private stepLookOut() {
    if (this.location !== 'home' || !this.homeWindowOpen) {
      this.lookingOut = false;
      return;
    }
    const raw = this.input.read(this);
    if (raw.interact) {
      this.stopLookOut();
      return;
    }
    const m = raw.move;
    if (m) {
      this.lookYaw = Math.max(-1.0, Math.min(1.0, this.lookYaw - m.x * 0.025));
      this.lookPitch = Math.max(-0.75, Math.min(0.35, this.lookPitch - m.z * 0.018));
    }
  }

  /** @param close 창문도 닫고 돌아온다 */
  stopLookOut(close = false) {
    this.lookingOut = false;
    if (close) {
      this.homeWindowOpen = false;
      this.say('창문을 닫았다');
    }
  }

  /** 복도의 막힌 곳: 두 계단 사이 벽, 꼭대기 층은 올라가는 계단(옥상)이 막혀 있다 */
  private corridorSolids(): Rect[] {
    const st = CORRIDOR.stairs;
    const out: Rect[] = [{ x0: st.x0, x1: st.x1, z0: -0.08, z1: 0.08 }];
    if (this.floor >= this.villaFloors) out.push({ x0: st.x0, x1: st.x1, z0: -1.5, z1: -0.08 });
    return out;
  }

  /** HUD 용: 지금 하고 있는 자동 행동 */
  get careLabel(): string | null {
    const c = this.care;
    if (!c) return null;
    const s = c.steps[0];
    const what = c.why === 'eat' ? '🍚 배가 너무 고파서 알아서 밥 먹는 중' : '😴 너무 피곤해서 알아서 자러 가는 중';
    const now =
      !s ? '' : s.kind === 'goto' ? ` — ${s.label}(으)로 가는 중` : s.kind === 'store' || s.kind === 'eatFridge' ? ' — 냉장고' : s.kind === 'buy' ? ` — ${s.shop}` : '';
    return `${what}${now} (방향키를 누르면 취소)`;
  }

  /** 냉장고에서 제일 든든한 음식 하나를 꺼내 먹는다. @returns 안내 문구 (없으면 null) */
  eatFromFridge(): string | null {
    const f = this.profile.fridge ?? [];
    if (!f.length) return null;
    let best = 0;
    f.forEach((x, i) => {
      if (x.hunger > f[best].hunger) best = i;
    });
    const food = f.splice(best, 1)[0];
    const life = this.profile.life;
    life.hunger = Math.max(0, life.hunger - food.hunger);
    life.fatigue = Math.max(0, life.fatigue - food.fatigue);
    saveProfile(this.profile);
    return `🧊 냉장고에서 ${food.icon} ${food.name}을(를) 꺼내 먹었다 (배고픔 -${food.hunger}) · 남은 음식 ${f.length}개`;
  }

  /** 한계에 닿은 채 방치되면 자동 행동을 시작하고, 진행 중이면 한 단계씩 처리한다 */
  private stepCare(inp: CityInput) {
    const life = this.profile.life;
    const c = this.care;
    if (c) {
      // 플레이어가 직접 움직이면 취소 (다시 30초 기다린다)
      if (c.started && (inp.move || (inp.buttons ?? []).some(Boolean))) {
        this.care = null;
        this.autopilot = null;
        this.hungerFullFrames = this.fatigueFullFrames = 0;
        this.say('자동 행동을 취소했다', 2);
        return;
      }
      c.started = true;
      this.runCareStep(c, inp);
      return;
    }
    const busy = this.dialog !== null || this.caughtAt !== null || this.sleep !== null;
    this.hungerFullFrames = life.hunger >= 100 && !busy ? this.hungerFullFrames + 1 : 0;
    this.fatigueFullFrames = life.fatigue >= 100 && !busy ? this.fatigueFullFrames + 1 : 0;
    if (this.hungerFullFrames >= CARE_GRACE) this.startCare('eat');
    else if (this.fatigueFullFrames >= CARE_GRACE) this.startCare('sleep');
  }

  private startCare(why: 'eat' | 'sleep') {
    this.hungerFullFrames = this.fatigueFullFrames = 0;
    if (this.job) {
      this.endJob('quit');
      this.say(why === 'eat' ? '배가 너무 고파서 조기 퇴근…' : '너무 피곤해서 조기 퇴근…', 3);
    }
    this.seat = null;
    this.dialog = null;
    const home = this.map.home;
    const toHome: CareStep[] = [{ kind: 'goto', x: home.x, z: home.z, label: '행복빌라' }, { kind: 'enterHome' }];
    let steps: CareStep[];
    if (why === 'sleep') {
      steps = this.location === 'home' ? [{ kind: 'sleep' }] : [{ kind: 'leave' }, ...toHome, { kind: 'sleep' }];
    } else if (this.profile.fridge?.length) {
      // 냉장고에 음식이 있으면 집에 가서 꺼내 먹는다
      steps = [...(this.location === 'home' ? [] : [{ kind: 'leave' } as CareStep, ...toHome]), { kind: 'walk', ...FRIDGE_POS }, { kind: 'eatFridge' }];
    } else {
      // 가장 가까운 음식점에서 사 먹고, 여분을 사 와서 냉장고에 넣는다
      const from = this.location === 'city' ? this.player : home;
      const shop = this.map.pois
        // 먹을 걸 파는 가게만 (약국 제외)
        .filter((p) => p.kind === 'shop' && SHOPS[p.label]?.menu.some((m) => m.hunger >= 10))
        .reduce((a, b) => (Math.hypot(a.x - from.x, a.z - from.z) <= Math.hypot(b.x - from.x, b.z - from.z) ? a : b));
      steps = [
        { kind: 'leave' },
        { kind: 'goto', x: shop.x, z: shop.z, label: shop.label },
        { kind: 'buy', shop: shop.label },
        ...toHome,
        { kind: 'walk', ...FRIDGE_POS },
        { kind: 'store' },
      ];
    }
    this.care = { why, steps, carry: [], started: false };
    this.say(why === 'eat' ? '🍚 배가 너무 고프다… 알아서 밥을 먹으러 간다 (방향키를 누르면 취소)' : '😴 너무 피곤하다… 알아서 자러 간다 (방향키를 누르면 취소)', 4);
  }

  private runCareStep(c: NonNullable<CityWorld['care']>, inp: CityInput) {
    const s = c.steps[0];
    const next = () => c.steps.shift();
    if (!s) {
      this.care = null;
      return;
    }
    const p = this.player;
    switch (s.kind) {
      case 'leave':
        if (this.location === 'home') this.moveTo('city', this.map.home.x, this.map.home.z + 1, 0, 1);
        else if (this.location === 'lobby' || this.location === 'corridor') this.moveTo('city', this.map.home.x, this.map.home.z + 1.4, 0, 1);
        else if (this.location === 'park') this.leavePark();
        next();
        return;
      case 'goto': {
        if (Math.hypot(s.x - p.x, s.z - p.z) < 1.2) {
          this.autopilot = null;
          next();
        } else if (!this.autopilot) {
          // 길을 못 찾거나 도착했는데 조금 모자라면 그 자리로 옮긴다 (자동 행동이 멈추지 않게)
          if (s.tried || this.navigateTo(s.x, s.z, s.label)) {
            this.placePlayer(s.x, s.z, 0, 1);
            next();
          }
          s.tried = true;
        }
        return;
      }
      case 'enterHome':
        this.moveTo('home', HOME.spawn.x + 0.8, HOME.spawn.z, 1, 0);
        next();
        return;
      case 'walk': {
        const dx = s.x - p.x;
        const dz = s.z - p.z;
        if (Math.hypot(dx, dz) < 0.5) next();
        else inp.move = { x: dx, z: dz };
        return;
      }
      case 'buy': {
        this.careShopping(c, s.shop);
        next();
        return;
      }
      case 'eatFridge': {
        const msg = this.eatFromFridge();
        if (msg) this.say(msg, 4);
        next();
        return;
      }
      case 'store': {
        const f = (this.profile.fridge ??= []);
        const put = c.carry.splice(0, FRIDGE_MAX - f.length);
        f.push(...put);
        saveProfile(this.profile);
        this.say(put.length ? `🧊 ${put.map((x) => x.icon + x.name).join(', ')}을(를) 냉장고에 넣어뒀다 (냉장고 ${f.length}개)` : '냉장고에 넣을 음식이 없다', 4);
        next();
        return;
      }
      case 'sleep': {
        next();
        this.care = null;
        const bed = HOME.pois.find((x) => x.id === 'bed')!;
        this.interact(bed);
        return;
      }
    }
  }

  /** 음식점에서 하나는 바로 먹고, 여분은 들고 간다 (가진 돈 안에서 아무거나) */
  private careShopping(c: NonNullable<CityWorld['care']>, shopName: string) {
    const shop = SHOPS[shopName];
    const pr = this.profile;
    const foods = shop.menu.filter((m) => m.hunger >= 10);
    const pick = () => {
      const ok = foods.filter((m) => m.price <= pr.gold);
      return ok.length ? ok[Math.floor(this.rng() * ok.length)] : null;
    };
    const meal = pick();
    if (!meal) {
      this.say(`💸 ${shopName}에 왔지만 돈이 없다… (가장 싼 메뉴 ${Math.min(...foods.map((m) => m.price))}G)`, 4);
      // 살 게 없으면 집에 가서 넣을 것도 없다
      c.steps = c.steps.filter((x) => x.kind !== 'store' && x.kind !== 'walk');
      return;
    }
    pr.gold -= meal.price;
    pr.life.hunger = Math.max(0, pr.life.hunger - meal.hunger);
    pr.life.fatigue = Math.max(0, pr.life.fatigue - (meal.fatigue ?? 0));
    const bought: string[] = [];
    for (let k = 0; k < CARE_SPARES; k++) {
      const extra = pick();
      if (!extra) break;
      pr.gold -= extra.price;
      c.carry.push({ name: extra.name, icon: extra.icon, hunger: extra.hunger, fatigue: extra.fatigue ?? 0, from: shopName });
      bought.push(extra.icon + extra.name);
    }
    saveProfile(pr);
    this.pushSpeech({ x: this.player.x, z: this.player.z, text: shop.thanks[0], color: '#ffe08a' });
    this.say(`${meal.icon} ${shopName}에서 ${meal.name}을(를) 사 먹었다 (배고픔 -${meal.hunger})${bought.length ? ` · 여분: ${bought.join(', ')}` : ''}`, 4);
  }

  // ───────────────────────── 경비 의자 ─────────────────────────

  /** 경비 의자에 앉는다 */
  sitAtDesk() {
    const c = LOBBY.chair;
    this.placePlayer(c.x, c.z, Math.sin(c.yaw), Math.cos(c.yaw));
    this.seat = { phase: 'sit', at: this.frame };
  }

  /** 의자에서 일어난다 (맞거나 움직이면) */
  standUp() {
    if (this.seat && this.seat.phase !== 'stand') {
      if (this.seat.spot === 'sofa') this.sofaAction('sit', true);
      this.seat = { phase: 'stand', at: this.frame, spot: this.seat.spot };
    }
  }

  /** 소파 동작 바꾸기 (force = 일어날 때 바른 자세로) */
  sofaAction(id: SofaAct, force = false) {
    const s = this.seat;
    if (!force && (s?.spot !== 'sofa' || s.phase === 'stand')) return;
    const cur = this.sofa;
    if (cur.id === id && id !== 'stretch') return;
    // 시작 전(예약)이면 지금 보이는 건 prev
    const started = this.frame >= cur.at;
    const from = started ? cur.id : cur.prev;
    const pt = started ? this.frame - cur.at : cur.pt;
    this.sofa = { id, at: this.frame, prev: from, pt };
  }

  /** 렌더러용: 소파 동작 사이 넘어가는 정도 */
  get sofaView() {
    const s = this.sofa;
    const at = this.frame - s.at;
    return { act: s.id, prev: s.prev, k: Math.max(0, at / SOFA_BLEND), at: Math.max(0, at), pt: s.pt + Math.max(0, at) };
  }

  /** 집 소파에 눕는다 (움직이거나 E 를 누르면 일어난다) */
  lieOnSofa() {
    const s = HOME.sofa.sit;
    this.autopilot = null;
    this.placePlayer(this.player.x, this.player.z, Math.sin(s.yaw), Math.cos(s.yaw));
    this.seatBooth = null;
    this.seat = { phase: 'sit', at: this.frame, spot: 'sofa' };
    // 앉고 나서 옆으로 눕는다
    this.sofa = { id: 'lounge', at: this.frame + SOFA_FRAMES, prev: 'sit', pt: 0 };
  }

  private seatFrames() {
    return this.seat?.spot === 'sofa' ? SOFA_FRAMES : SIT_FRAMES;
  }

  /** 앉기 연출: 0 = 서 있음, 1 = 완전히 앉음 */
  get seatAmount(): number {
    const s = this.seat;
    if (!s) return 0;
    const u = Math.min(1, (this.frame - s.at) / this.seatFrames());
    return s.phase === 'sit' ? u : s.phase === 'seated' ? 1 : 1 - u;
  }

  /** 앉아 있는 동안: 움직이면 일어나고, 일어나는 동안은 멈춰 있다 */
  private stepSeat(inp: CityInput) {
    const s = this.seat!;
    const t = this.frame - s.at;
    const n = this.seatFrames();
    const sofa = s.spot === 'sofa';
    const wantsUp = !!inp.move || (inp.buttons ?? []).some(Boolean) || !!inp.jump || (sofa && !!inp.interact);
    if (s.phase === 'sit' && t >= n) s.phase = 'seated';
    if ((s.phase === 'seated' || s.phase === 'sit') && wantsUp) this.standUp();
    if (this.seat?.phase === 'stand' && this.frame - this.seat.at >= n) {
      this.seat = null;
      this.seatBooth = null;
    }
    // 소파에서는 E 가 '일어나기' (바로 다시 눕지 않게 막는다)
    if (sofa) inp.interact = false;
    if (sofa && this.sofa.id === 'stretch' && this.frame - this.sofa.at >= SOFA_STRETCH) this.sofaAction('relax');
    if (this.seat) {
      inp.move = null;
      inp.buttons = undefined;
      inp.jump = false;
    }
  }

  say(text: string, seconds = 2.5) {
    this.toast = { text, until: this.frame + seconds * 60 };
  }

  private interact(poi: Poi) {
    if (poi.id.startsWith('store:')) {
      this.interactStore(poi);
      return;
    }
    switch (poi.id) {
      case 'home':
        this.cityReturn = { x: this.player.x, z: this.player.z };
        this.moveTo('home', HOME.spawn.x + 0.8, HOME.spawn.z, 1, 0);
        this.say('집에 왔다');
        return;
      case 'lobby':
        // 문 앞에 서서 도어락을 누르고 문을 열고 들어간다 (stepDoorway)
        this.cityReturn = { x: this.player.x, z: this.player.z };
        this.autopilot = null;
        this.doorway = { kind: 'enter', stage: 0, at: this.frame };
        this.say('삐삐삐삑 — 띠리링 🔓', 1.2);
        return;
      case 'lobbyExit':
        this.seat = null;
        this.autopilot = null;
        this.doorway = { kind: 'exit', stage: 0, at: this.frame };
        return;
      case 'window':
        // 창문을 열면 바로 밖을 내다본다 (열려 있으면 그냥 내다보기)
        if (!this.homeWindowOpen) {
          this.homeWindowOpen = true;
          this.say('창문을 열었다 — 바깥바람이 시원하다');
        }
        this.autopilot = null;
        this.lookingOut = true;
        this.lookYaw = 0;
        this.lookPitch = -0.18;
        return;
      case 'elevator':
        this.autopilot = null;
        this.elevatorOpen = true;
        return;
      case 'myDoor': {
        // 도어락 누르고 문을 열고 들어간다
        const i = unitPlace(this.homeUnit).door;
        this.say('삐삐삐삑 — 띠리링 🔓', 1.2);
        this.passDoor({
          open: `unit:${i}`,
          face: { x: 0, z: -1 },
          to: { x: CORRIDOR.doors[i], z: CORRIDOR.room.z0 + 0.3 },
          arrive: () => {
            this.moveTo('home', HOME.room.x0 + 0.35, HOME.spawn.z, 1, 0);
            this.say('집에 왔다');
          },
          close: 'home',
          out: { x: HOME.spawn.x + 0.8, z: HOME.spawn.z },
        });
        return;
      }
      case 'senior':
        this.autopilot = null;
        this.npcChat = { npc: 'senior' };
        return;
      case 'mom':
        this.autopilot = null;
        this.npcChat = { npc: 'mom' };
        return;
      case 'desk':
        if (this.job) {
          if (!this.seat) this.sitAtDesk();
        } else {
          const t = this.jobTakenBy('aptGuard');
          if (t) this.say(`👮 ${t.name} 님이 근무 중이에요. 끝나면 할 수 있어요`, 3);
          else this.jobPanelRequest = true;
        }
        return;
      case 'exit': {
        // 현관문을 열고 나가면 그 집이 있는 층 복도, 문 바로 앞
        const owner = this.homeOwner ? this.remotes.get(this.homeOwner) : null;
        const { floor, door } = unitPlace(owner?.unit ?? this.homeUnit);
        this.passDoor({
          open: 'home',
          face: { x: -1, z: 0 },
          to: { x: HOME.room.x0 + 0.3, z: HOME.spawn.z },
          arrive: () => {
            this.floor = Math.max(2, Math.min(this.villaFloors, floor));
            this.moveTo('corridor', CORRIDOR.doors[door], CORRIDOR.room.z0 + 0.35, 0, 1);
            this.say(`${this.floor}층 복도`);
          },
          close: `unit:${door}`,
          out: { x: CORRIDOR.doors[door], z: -0.45 },
        });
        return;
      }
      case 'bed': {
        // 피로가 어느 정도 쌓여야 잠이 온다 (피로도 100 = 실제 5시간)
        if (this.profile.life.fatigue < SLEEPY) {
          this.say(`😐 아직 졸리지 않다 (피로도 ${SLEEPY} 이상부터 잘 수 있어요 · 지금 ${Math.round(this.profile.life.fatigue)})`, 3);
          return;
        }
        // 침대 옆으로 가서 눕고, 직접 깨우거나 12시간이 될 때까지 계속 잔다 (시간은 모두와 같이 흐른다)
        this.autopilot = null;
        this.sleep = { phase: 'walk', at: this.frame, wp: 0, since: this.nowMs(), last: this.nowMs() };
        this.toast = null;
        return;
      }
      case 'tv':
        this.tvRequest = true;
        return;
      case 'calendar':
        this.calendarRequest = true;
        return;
      case 'sofa': {
        // 소파엔 한 명만 눕는다
        const taker = this.sofaTakenBy();
        if (taker) {
          this.say(`🛋️ ${taker.name} 님이 소파에 누워 있어요`, 2.5);
          return;
        }
        // 잠깐 쉬면 체력이 조금 찬다
        const p = this.player;
        const gain = this.frame - this.sofaAt < 600 ? 0 : Math.min(p.maxHp - p.hp, Math.round(p.maxHp * 0.15));
        if (gain > 0) this.sofaAt = this.frame;
        p.hp += gain;
        this.lieOnSofa();
        this.say(gain > 0 ? `🛋️ 소파에서 쉬는 중 (체력 +${gain}) · 1~6 동작 바꾸기 · E 일어나기` : '🛋️ 소파에서 쉬는 중 · 1~6 동작 바꾸기 · E 일어나기', 3);
        return;
      }
    }
    // 복도 순찰 점검 지점
    if (poi.id.startsWith('cp:')) {
      const cp = CORRIDOR.checkpoints.find((c) => `cp:${c.id}` === poi.id)!;
      if (this.job?.patrolCheck(this.floor, cp.id)) return;
      this.say(`${cp.icon} ${this.floor}층 ${cp.label} — 이상 없음`);
      return;
    }
    if (poi.id.startsWith('visit:')) {
      const r = this.remotes.get(poi.id.slice(6));
      if (!r) return;
      const i = unitPlace(r.unit).door;
      this.passDoor({
        open: `unit:${i}`,
        face: { x: 0, z: -1 },
        to: { x: CORRIDOR.doors[i], z: CORRIDOR.room.z0 + 0.3 },
        arrive: () => {
          this.moveTo('home', HOME.room.x0 + 0.35, HOME.spawn.z, 1, 0, r.id);
          this.say(`🏠 ${r.name}의 집 (${r.unit}호)에 놀러 왔다`);
        },
        close: 'home',
        out: { x: HOME.spawn.x + 0.8, z: HOME.spawn.z },
      });
      return;
    }
    if (poi.id.startsWith('door')) {
      const u = villaFloor(this.floor).units[Number(poi.id.slice(4))];
      const note = u ? u.notes[Math.floor(this.frame / 7) % u.notes.length] : '조용하다';
      this.say(`🚪 ${poi.label} — ${note}`, 3);
      return;
    }
    if (poi.id.startsWith('fish-')) {
      this.startFishing(Number(poi.id.slice(5)));
      return;
    }
    if (poi.id === 'casino') {
      this.casinoRequest = true;
      return;
    }
    if (poi.id === 'park-center') {
      this.tossCoin();
      return;
    }
    if (poi.kind === 'subway') {
      if (this.job) {
        this.say('🚇 근무 중에는 지하철을 탈 수 없어요');
        return;
      }
      if (this.location === 'park') this.leavePark();
      else this.goToPark();
      return;
    }
    if (poi.id.startsWith('ride-')) {
      this.joinRide(poi.id.slice(5) as RideId);
      return;
    }
    if (poi.kind === 'bus') {
      if (this.job) {
        this.say('🚌 근무 중에는 버스를 탈 수 없어요');
        return;
      }
      this.busRequest = true;
      return;
    }
    if (poi.kind === 'shop' && poi.label === 'PC방') {
      this.pcRoomRequest = true;
      return;
    }
    // 펫샵 · 음식점: 문을 열고 가게 안으로 들어간다
    if (poi.id === 'petshop' || poi.id === 'clothesshop' || poi.id === 'fishingshop' || poi.id === 'karaoke' || (poi.kind === 'shop' && SHOPS[poi.label])) {
      // 펫샵 건물 계단 문은 1층 계단실로 들어간다 (걸어서 2층 노래방 · 3층으로)
      const sign = poi.id === 'karaoke' ? stairSign(1) : poi.label;
      const L = storeLayout(sign);
      // 가게 문은 건물 앞면 (POI 는 문에서 1.2m 앞). 북쪽을 보는 가게는 문이 POI 의 남쪽
      const s = poi.facing === -1 ? -1 : 1;
      const doorZ = poi.z - 1.2 * s;
      this.cityReturn = poi.facing === -1 ? { x: poi.x, z: poi.z, f: -1 } : { x: poi.x, z: poi.z };
      this.storeDoor = `shop:${poi.id}`;
      this.passDoor({
        open: this.storeDoor,
        face: { x: 0, z: -s },
        to: { x: poi.x, z: doorZ + 0.35 * s },
        arrive: () => this.enterStore(sign),
        close: 'storeIn',
        out: { x: L.spawn.x, z: L.spawn.z },
      });
      return;
    }
    // 아직 만들지 않은 곳
    const soon: Record<string, string> = {
      shop: `${poi.label} — 곧 들어갈 수 있어요`,
      subway: '지하철 — 다른 동네로 이동 (준비 중)',
      bus: '버스 — 노선 준비 중',
      park: '근린공원 — 이벤트 준비 중',
    };
    if (poi.id === 'pc') this.say('컴퓨터 — 오늘의 동네 소식 (준비 중)');
    else if (poi.id === 'fridge') this.say(this.eatFromFridge() ?? '냉장고가 텅 비었다… 편의점에 가볼까');
    else this.say(soon[poi.kind] ?? `${poi.label} (준비 중)`);
  }

  // ───────────────────────── 가게 안 (먹거리 · 펫샵) ─────────────────────────

  /** 가게 문을 열고 들어간다 */
  private enterStore(sign: string) {
    const L = storeLayout(sign);
    this.autopilot = null;
    this.dialog = null;
    this.store = L;
    this.keeper.reset(L.keeper.x, L.keeper.z, 0, 1);
    this.pen = L.spots.length ? new PenSim(L.spots, this.todayStock(), this.day * 31 + 7) : null;
    this.moveTo('store', 0, L.room.z1 - 0.35, 0, -1);
    const s = SHOPS[sign];
    const hi =
      L.kind === 'karaoke'
        ? ['어서 오세요~ 빈 방 아무 데나 들어가서 부르세요! 🎤', '어서 와요~ 한 곡 ' + SONG_PRICE + 'G, 방 안 기계에서 바로 결제돼요!', '오늘 4번방 마이크 새로 갈았어요~ 마음껏 부르세요!'][Math.floor(this.rng() * 3)]
        : L.kind === 'fishing'
        ? ['어서 와요~ 오늘 한강 물 좋아요! 🎣', '왔어요? 어제 누가 저기서 메기 대물을 걸었대요!', '미끼는 냉장고에, 낚싯대는 벽에! 잡은 고기는 계산대로 가져와요~'][Math.floor(this.rng() * 3)]
        : L.kind === 'clothes'
        ? ['어서 오세요~ 스타일 하우스예요! 편하게 둘러보세요 ✨', '신상 들어왔어요! 탈의실에서 입어보셔도 돼요~'][Math.floor(this.rng() * 2)]
        : L.kind === 'pet'
        ? this.pen?.animals.length
          ? '어서 오세요~ 오늘 들어온 아이들 구경하세요! 🐾'
          : '어서 오세요~ 오늘 아이들은 다 새 가족을 찾아갔어요. 내일 또 들어와요!'
        : s
          ? s.greetings[Math.floor(this.rng() * s.greetings.length)]
          : '어서 오세요!';
    if (L.kind === 'stairs') {
      this.say('🏢 1층 계단 — 2층 코인노래방 · 3층 임대', 2.5);
      return;
    }
    this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: hi });
    this.say(L.kind === 'karaoke' ? `🎤 2층 ${sign}에 들어왔다 — 카운터에서 방을 받으세요` : `🚪 ${sign}에 들어왔다`, 2.5);
  }

  /** 옷가게: 전투 장비 사기 (가방으로) */
  buyGear(id: string): { ok: boolean; message: string } {
    const e = EQUIPS[id];
    if (!e?.price) return { ok: false, message: '파는 물건이 아니에요' };
    const pr = this.profile;
    if (pr.gold < e.price) return { ok: false, message: `${(e.price - pr.gold).toLocaleString()}G 가 모자라요` };
    pr.gold -= e.price;
    ensureGear(pr).owned.push(id);
    saveProfile(pr);
    this.thankShopper();
    return { ok: true, message: `${e.icon} ${e.name}을(를) 샀다! 장비창(T)이나 탈의실에서 낄 수 있어요` };
  }

  /** 옷가게: 코디 옷 사기 (한 벌씩만) */
  buyCosmetic(id: string): { ok: boolean; message: string } {
    const c = COSMETIC_BY_ID[id];
    if (!c) return { ok: false, message: '파는 물건이 아니에요' };
    const pr = this.profile;
    const w = ensureWardrobe(pr);
    if (w.owned.includes(id)) return { ok: false, message: '이미 가진 옷이에요' };
    if (pr.gold < c.price) return { ok: false, message: `${(c.price - pr.gold).toLocaleString()}G 가 모자라요` };
    pr.gold -= c.price;
    w.owned.push(id);
    saveProfile(pr);
    this.thankShopper();
    return { ok: true, message: `${c.icon} ${c.name}을(를) 샀다!` };
  }

  private thankShopper() {
    const L = this.store;
    if (L?.kind === 'fishing') this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: ['감사합니다~ 대물 낚아요! 🎣', '어복 충만하길!', '좋은 선택이에요, 손맛 보실 거예요~'][Math.floor(this.rng() * 3)] });
    if (L?.kind === 'clothes') this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: ['감사합니다~ 잘 어울리세요!', '좋은 선택이에요 ✨', '또 놀러 오세요~'][Math.floor(this.rng() * 3)] });
  }

// ───────────────────────── 한강 낚시 ─────────────────────────

  /** 낚시 중 (한강 데크 끝에 서서). null = 안 하는 중 */
  fishing: FishingSession | null = null;
  /** 낚시하는 자리 (데크 끝) */
  fishSpot: { x: number; z: number; deck: number } | null = null;
  /** 낚시점 창을 열어 달라 (계산대 = 전체, 진열대 = 그 칸). UI 가 읽고 끈다 */
  fishingShopRequest: 'all' | 'rods' | 'bait' | 'sell' | null = null;
  /** 낚시 도감 창을 열어 달라 (수조 = 도감, 명예의 전당 = 기록) */
  fishDexRequest: 'dex' | 'records' | null = null;
  private fishRnd = mulberry32(4242);
  private fishTapQueued = false;

  /** 화면 버튼으로 Space 대신 누르기 (터치) */
  fishTap() {
    this.fishTapQueued = true;
  }

  get fishingState(): FishingState {
    return ensureFishing(this.profile);
  }

  /** 지금 낚싯대 · 미끼 · 시간대 (없으면 null) */
  get fishSetup(): FishSetup | null {
    const s = currentSetup(this.fishingState, this.minutes);
    // 비 오는 날은 물고기 입질이 잦다
    if (s) s.rain = Math.max(this.weather.rain, this.weather.storm);
    return s;
  }

  /** 낚시꾼으로서 내 힘 (레벨 + 장비 공격력 · 최대 체력) */
  get angler(): Angler {
    return anglerOf(playerStats(this.profile));
  }

  /** 데크 끝에 서서 낚시 시작 */
  private startFishing(deck: number) {
    const d = this.map.fishDecks[deck];
    const fs = this.fishingState;
    if (!d) return;
    if (!fs.rods.length) {
      this.say(`🎣 낚싯대가 없어요 — 행복빌라 옆 상가 「${FISHING_SHOP_NAME}」에서 사 오세요`, 4);
      return;
    }
    if (!fs.rod || !fs.rods.includes(fs.rod)) fs.rod = fs.rods[fs.rods.length - 1];
    if (!fs.use || (fs.bait[fs.use] ?? 0) <= 0) fs.use = BAITS.find((b) => (fs.bait[b.id] ?? 0) > 0)?.id ?? fs.use;
    this.autopilot = null;
    const x = Math.max(d.x - d.w / 2 + 0.6, Math.min(d.x + d.w / 2 - 0.6, this.player.x));
    this.fishSpot = { x, z: d.z1 - 0.55, deck };
    this.placePlayer(x, d.z1 - 0.55, 0, 1);
    this.fishRnd = mulberry32(this.frame * 7919 + this.day * 31 + 17);
    this.fishing = new FishingSession({
      setup: () => this.fishSetup,
      angler: () => this.angler,
      canCast: () => {
        const s = this.fishingState;
        if (!s.rod) return '🎣 낚싯대가 없어요';
        if (!s.use || (s.bait[s.use] ?? 0) <= 0) return `🐛 미끼가 없어요 — 「${FISHING_SHOP_NAME}」에서 사 오거나, F (낚시 도감) → 내 장비에서 다른 미끼를 고르세요`;
        return null;
      },
      onCast: () => {
        this.fishingState.stats.casts++;
      },
      onBaitTaken: () => {
        const s = this.fishingState;
        s.stats.bites++;
        const b = s.use ? BAIT_BY_ID[s.use] : null;
        if (b && !b.reusable) {
          s.bait[b.id] = Math.max(0, (s.bait[b.id] ?? 0) - 1);
          if (!s.bait[b.id]) {
            const next = BAITS.find((x) => (s.bait[x.id] ?? 0) > 0);
            if (next) s.use = next.id;
            this.say(next ? `${b.icon} ${b.name}을(를) 다 썼다 → ${next.icon} ${next.name}(으)로 바꿨다` : `${b.icon} ${b.name}을(를) 다 썼다… 미끼를 사러 가야겠다`, 3);
          }
        }
        saveProfile(this.profile);
      },
      onLureLost: () => {
        const s = this.fishingState;
        s.bait.lure = Math.max(0, (s.bait.lure ?? 0) - 1);
        if (!s.bait.lure) s.use = BAITS.find((x) => (s.bait[x.id] ?? 0) > 0)?.id ?? s.use;
      },
      onResult: (r) => this.fishResult(r),
      say: (t, sec) => this.say(t, sec),
      rnd: () => this.fishRnd(),
    });
    const st = this.fishSetup;
    this.say(st ? `🎣 ${st.rod.name} · ${st.bait.icon} ${st.bait.name} — Space 로 던지기 (${TIME_LABEL[st.band]})` : '🎣 낚싯대를 펼쳤다 — 미끼가 없어요!', 3);
  }

  /** 낚싯대를 거두고 일어선다 */
  stopFishing(quiet = false) {
    if (!this.fishing) return;
    this.fishing = null;
    this.fishSpot = null;
    saveProfile(this.profile);
    if (!quiet) this.say('🎣 낚싯대를 거뒀다', 1.5);
  }

  /** 결과 기록: 도감 · 살림망 · 경험치 · 통계 */
  private fishResult(r: FishResult): FishResult {
    const s = this.fishingState;
    const fish = r.fish;
    if (r.kind === 'missed') s.stats.missed++;
    else if (r.kind === 'escaped') s.stats.escaped++;
    else if (r.kind === 'snapped') s.stats.snapped++;
    if (r.kind !== 'caught') {
      saveProfile(this.profile);
      return r;
    }
    s.stats.catches++;
    const prev = s.dex[fish.id];
    const isNew = !prev;
    const record = !!prev && r.kg > prev.best;
    s.dex[fish.id] = { n: (prev?.n ?? 0) + 1, best: Math.max(prev?.best ?? 0, r.kg), first: prev?.first ?? this.day };
    const exp = TIER_INFO[fish.tier].exp * (isNew ? 2 : 1);
    const price = sellPrice(fish, r.kg);
    let released = false;
    if (fish.protect || s.basket.length >= BASKET_MAX) released = true;
    else s.basket.push({ id: fish.id, kg: r.kg, day: this.day });
    const ups = gainExp(this.profile, exp);
    if (ups) {
      this.refreshStats();
      this.player.hp = this.player.maxHp;
    }
    saveProfile(this.profile);
    const msg = fish.protect
      ? `📸 ${fish.icon} ${fish.name}! 천연기념물이라 사진만 찍고 놓아줬다 (+${exp} EXP)`
      : released
        ? `${fish.icon} ${fish.name} ${fmtKg(r.kg)} — 살림망이 가득 차서 놓아줬다 (낚시마트에서 팔아요)`
        : `${fish.icon} ${fish.name} ${fmtKg(r.kg)}${isNew ? ' ✨ 도감 등록!' : record ? ' 📏 최대 기록!' : ''} (+${exp} EXP)`;
    // 잡은 고기는 화면 카드로 보여 주니, 알림은 레벨 업 · 놓아줬을 때만
    if (ups) this.say(`${msg} · ⬆️ 레벨 업! Lv.${this.profile.level}`, 3.5);
    else if (released) this.say(msg, 3.5);
    return { ...r, isNew, record, price, exp, released };
  }

  /** 낚시 중 한 프레임: 키 입력을 가로채서 낚시에만 쓴다 (걷기 · 공격 · 점프 없음) */
  private stepFishing(inp: CityInput) {
    const f = this.fishing!;
    const spot = this.fishSpot;
    const tap = !!inp.jumpTap || this.fishTapQueued;
    this.fishTapQueued = false;
    const quit = (!!inp.move || inp.interact) && f.canQuit;
    inp.move = null;
    inp.run = false;
    inp.jump = false;
    inp.jumpTap = false;
    inp.buttons = undefined;
    inp.interact = false;
    if (this.location !== 'city' || !spot || this.downedAt !== null || this.caughtAt !== null) {
      this.stopFishing(true);
      return;
    }
    if (quit) {
      this.stopFishing();
      return;
    }
    // 물가 쪽을 보고 제자리
    const p = this.player;
    p.x = spot.x;
    p.z = spot.z;
    p.fx = 0;
    p.fz = 1;
    f.step(tap);
  }

  /** 낚시점: 낚싯대 사기 (사면 바로 그걸 쓴다) */
  buyRod(id: string): { ok: boolean; message: string } {
    const r = ROD_BY_ID[id];
    const s = this.fishingState;
    if (!r) return { ok: false, message: '없는 낚싯대예요' };
    if (s.rods.includes(id)) {
      s.rod = id;
      saveProfile(this.profile);
      return { ok: true, message: `${r.icon} ${r.name}(으)로 바꿨다` };
    }
    if (this.profile.gold < r.price) return { ok: false, message: `${(r.price - this.profile.gold).toLocaleString()}G 가 모자라요` };
    this.profile.gold -= r.price;
    s.rods.push(id);
    s.rod = id;
    saveProfile(this.profile);
    this.thankShopper();
    return { ok: true, message: `${r.icon} ${r.name}을(를) 샀다! 한강공원 낚시 데크에서 E` };
  }

  /** 쓸 낚싯대 · 미끼 고르기 */
  selectRod(id: string) {
    const s = this.fishingState;
    if (s.rods.includes(id)) s.rod = id;
    saveProfile(this.profile);
  }

  selectBait(id: BaitId) {
    const s = this.fishingState;
    if ((s.bait[id] ?? 0) > 0) s.use = id;
    saveProfile(this.profile);
  }

  /** 미끼 사기 (묶음 단위) */
  buyBait(id: BaitId, packs = 1): { ok: boolean; message: string } {
    const b = BAIT_BY_ID[id];
    const s = this.fishingState;
    if (!b) return { ok: false, message: '없는 미끼예요' };
    const cost = b.price * packs;
    if (this.profile.gold < cost) return { ok: false, message: `${(cost - this.profile.gold).toLocaleString()}G 가 모자라요` };
    this.profile.gold -= cost;
    s.bait[id] = (s.bait[id] ?? 0) + b.pack * packs;
    if (!s.use || (s.bait[s.use] ?? 0) <= 0) s.use = id;
    saveProfile(this.profile);
    this.thankShopper();
    return { ok: true, message: `${b.icon} ${b.name} ${b.pack * packs}개를 샀다 (가진 것 ${s.bait[id]}개)` };
  }

  /** 살림망의 물고기 팔기 (index 없으면 전부) */
  sellFish(index?: number): { ok: boolean; message: string } {
    const s = this.fishingState;
    if (this.location !== 'store' || this.store?.kind !== 'fishing') return { ok: false, message: '낚시마트 계산대에서 팔 수 있어요' };
    const list = index === undefined ? s.basket.map((_, i) => i) : [index];
    let gold = 0;
    let n = 0;
    for (const i of list.sort((a, b) => b - a)) {
      const c = s.basket[i];
      const fish = c ? FISH_BY_ID[c.id] : undefined;
      if (!c || !fish) continue;
      gold += sellPrice(fish, c.kg);
      n++;
      s.basket.splice(i, 1);
    }
    if (!n) return { ok: false, message: '팔 물고기가 없어요' };
    this.profile.gold += gold;
    s.stats.earned += gold;
    saveProfile(this.profile);
    const L = this.store;
    if (L) this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: gold >= 1000 ? '어이쿠, 이거 대물이네! 🐟' : '싱싱하네~ 잘 받을게요!' });
    return { ok: true, message: `🐟 ${n}마리를 ${gold.toLocaleString()}G 에 팔았다` };
  }

  /** 살림망의 물고기 놓아주기 */
  releaseFish(index: number) {
    const s = this.fishingState;
    s.basket.splice(index, 1);
    saveProfile(this.profile);
  }

  /** 낚시점 진열대 이름표 */
  private fishItemLabel(id: string): string {
    const s = this.fishingState;
    if (id.startsWith('rod:')) {
      const r = ROD_BY_ID[id.slice(4)];
      if (!r) return id;
      if (s.rods.includes(r.id)) return s.rod === r.id ? `${r.icon} ${r.name} — 쓰는 중` : `${r.icon} ${r.name} — 이걸로 바꾸기`;
      return `${r.icon} ${r.name} ${r.price.toLocaleString()}G — 사기 (힘 ×${r.power} · 행운 +${Math.round(r.luck * 100)}%)`;
    }
    if (id.startsWith('bait:')) {
      const b = BAIT_BY_ID[id.slice(5) as BaitId];
      if (!b) return id;
      return `${b.icon} ${b.name}${b.pack > 1 ? ` ${b.pack}개` : ''} ${b.price}G — 사기 (가진 것 ${s.bait[b.id] ?? 0}${b.reusable ? '' : '개'})`;
    }
    return id;
  }

  /** 오늘 펫샵 입고 (분양된 아이는 빠진다). 날이 바뀌면 새로 들어온다 */
  todayStock(): StockPet[] {
    const pr = this.profile;
    if (!pr.petShop || pr.petShop.day !== this.day) pr.petShop = { day: this.day, sold: [], goods: {} };
    return petStock(this.day, pr.petShop.sold);
  }

  /** 펫샵 진열대에 오늘 남은 용품 개수 */
  goodsLeft(id: string): number {
    this.todayStock();
    const total = petGoodsStock(this.day, storeLayout(PET_SHOP_NAME))[id] ?? 0;
    return Math.max(0, total - (this.profile.petShop!.goods?.[id] ?? 0));
  }

  /** 펫 용품 사기: 진열된 개수만큼만 */
  buyPetGood(id: string, n = 1): { ok: boolean; message: string } {
    const left = this.goodsLeft(id);
    const g = PET_GOOD_BY_ID[id];
    if (!g) return { ok: false, message: '없는 상품이에요' };
    if (left <= 0) return { ok: false, message: `${g.icon} ${g.name}은(는) 오늘 다 팔렸어요 — 내일 다시 들어와요` };
    if (left < n) return { ok: false, message: `진열대에 ${left}개밖에 없어요` };
    const r = this.pets.buyGood(id, n);
    if (r.ok) {
      const ps = this.profile.petShop!;
      ps.goods ??= {};
      ps.goods[id] = (ps.goods[id] ?? 0) + n;
      saveProfile(this.profile);
    }
    return r;
  }

  /** 가게 안에서 E 를 누를 수 있는 곳들 (진열대 이름·가격, 놀이터 아이들) */
  private storePois(): Poi[] {
    const L = this.store;
    if (!L) return [];
    const out: Poi[] = L.pois.map((q) => {
      if (L.kind === 'karaoke') {
        const no = Number(q.id.split(':')[2]) || 0;
        const rent = this.karaokeRental;
        if (q.id.startsWith('store:booth:')) {
          const by = this.boothTakenBy(no);
          return { ...q, label: rent?.room === no ? `🚪 ${no}번방 — 내 방` : by ? `🔒 ${no}번방 — 사용 중 (${by})` : `🔒 ${no}번방 — 빈방 (카운터에서 받기)` };
        }
        if (q.id.startsWith('store:sing:') && rent?.room === no) return { ...q, label: `🎤 노래방 기계 — 노래 고르기 (남은 ${rent.songs}곡)` };
        if (q.id === 'store:counter' && rent) return { ...q, label: `카운터 — ${rent.room}번방 · 남은 ${rent.songs}곡 (곡 더 사기)` };
        return q;
      }
      if (!q.id.startsWith('store:item:')) return q;
      const id = q.id.slice(11);
      if (L.kind === 'fishing') return { ...q, label: this.fishItemLabel(id) };
      if (L.kind === 'pet') {
        const g = PET_GOOD_BY_ID[id];
        const left = this.goodsLeft(id);
        return { ...q, label: g ? (left > 0 ? `${g.icon} ${g.name} ${g.price}G — 1개 사기 (진열 ${left}개 · 가진 것 ${this.profile.inventory[id] ?? 0})` : `${g.icon} ${g.name} — 오늘 품절`) : id };
      }
      const m = SHOPS[L.sign]?.menu.find((x) => x.id === id);
      return { ...q, label: m ? `${m.icon} ${m.name} ${m.price}G — 사 먹기` : id };
    });
    for (const a of this.pen?.animals ?? []) {
      const sp = PET_BY_ID[a.stock.species];
      if (!sp) continue;
      const coat = coatOf(sp, a.stock.coat).name;
      const spot = this.pen!.spotOf(a);
      out.push({ id: `store:pet:${a.stock.id}`, kind: 'shop', label: `${sp.icon} ${sp.name}${coat ? ` (${coat})` : ''} — 분양 ${sp.price.toLocaleString()}G`, x: spot.x, z: spot.z + 0.5, radius: 0.55 });
    }
    return out;
  }

  private interactStore(poi: Poi) {
    const L = this.store;
    if (!L) return;
    const id = poi.id;
    if (id === 'store:exit' && L.kind === 'karaoke') {
      // 노래방 문을 나서면 2층 층계참 (빌린 방은 돌려주고 안 부른 곡 값은 돌려받는다)
      this.endKaraokeRental();
      this.goStairFloor(2, STAIR.room.x1 - 0.75, STAIR.doorZ, -1, 0);
      return;
    }
    if (id === 'store:exit') {
      // 계산 안 한 옷을 입고는 못 나간다: 점원이 붙잡고 계산대로 안내한다
      const unpaid = this.unpaidTrial();
      if (L.kind === 'clothes' && unpaid.length) {
        this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: ['손님~! 그 옷 계산 안 하셨어요!', '잠깐만요~ 입어보신 옷은 계산하고 가셔야 해요!'][Math.floor(this.rng() * 2)] });
        this.say(`🚫 계산 안 한 옷: ${unpaid.map((c) => c.name).join(', ')} — 계산대에서 계산하거나 벗어야 나갈 수 있어요`, 3);
        return;
      }
      const back = { ...this.cityReturn };
      this.passDoor({
        open: 'storeIn',
        face: { x: 0, z: 1 },
        to: { x: 0, z: L.room.z1 - 0.2 },
        arrive: () => {
          this.pen = null;
          // 가게를 등지고 인도에 선다 (북쪽을 보는 가게면 북쪽으로)
          const s = back.f === -1 ? -1 : 1;
          this.moveTo('city', back.x, back.z - 0.85 * s, 0, s);
          this.say(L.kind === 'pet' ? '🐾 또 놀러 와요~' : L.kind === 'karaoke' ? '🎤 계단을 내려왔다 — 또 놀러 오세요~' : '또 오세요~', 1.5);
        },
        close: this.storeDoor,
        out: back,
      });
      return;
    }
    if (id.startsWith('store:rack:')) {
      this.clothesShopRequest = id.slice(11) as ClothesCorner;
      return;
    }
    if (id === 'store:fit') {
      this.wardrobeRequest = true;
      this.say('🚪 탈의실 커튼을 쳤다', 1.5);
      return;
    }
    if (L.kind === 'karaoke') {
      const no = Number(id.split(':')[2]) || 0;
      if (id === 'store:counter') {
        this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: this.karaokeRental ? `${this.karaokeRental.room}번방 쓰고 계시죠~ 곡 더 넣어 드릴까요?` : KARAOKE_TALK[Math.floor(this.rng() * KARAOKE_TALK.length)] });
        this.karaokeDeskRequest = true;
        return;
      }
      if (id.startsWith('store:booth:')) {
        const by = this.boothTakenBy(no);
        if (this.karaokeRental?.room === no) this.say(`🚪 ${no}번방 — 내 방이에요. 문이 열려 있어요`);
        else if (by) this.say(`🔒 ${no}번방 — ${by} 님이 쓰고 있어요`);
        else this.say(`🔒 ${no}번방 — 빈방이에요. 카운터에서 방을 받아야 들어갈 수 있어요`, 3);
        return;
      }
      if (this.karaokeRental?.room !== no) {
        this.say('🔒 카운터에서 방을 받아야 쓸 수 있어요');
        return;
      }
      if (id.startsWith('store:sing:')) {
        this.karaokeRoom = no;
        this.karaokeRequest = true;
      } else if (id.startsWith('store:sit:')) this.karaokeAct('kSit');
      return;
    }
    // 상가 계단실: 1층 출입문 · 층별 안내판 · 층계참 가게 문
    if (L.kind === 'stairs') {
      const f = stairFloorOf(L.sign);
      if (id === 'store:directory') {
        const rows = Object.entries(SHOP_BUILDING_FLOORS).map(([fl, shop]) => `${fl}층 ${shop ?? '임대 문의'}`);
        this.say(`📋 1층 멍냥 펫샵 · ${rows.join(' · ')}`, 4);
        return;
      }
      if (id === 'store:floordoor') {
        const shop = SHOP_BUILDING_FLOORS[f];
        if (shop) this.enterStore(shop);
        else this.say(`🔒 ${f}층은 아직 비어 있어요 — 새 가게가 곧 들어온대요`, 3);
        return;
      }
    }
    if (L.kind === 'fishing') {
      if (id === 'store:counter') this.fishingShopRequest = 'all';
      else if (id === 'store:tank') this.fishDexRequest = 'dex';
      else if (id === 'store:records') this.fishDexRequest = 'records';
      else if (id.startsWith('store:item:rod:')) {
        const r = this.buyRod(id.slice(15));
        this.say(r.message, 3);
      } else if (id.startsWith('store:item:bait:')) {
        const r = this.buyBait(id.slice(16) as BaitId, 1);
        this.say(r.message, 3);
      }
      if (id !== 'store:exit') return;
    }
    if (id === 'store:counter') {
      if (L.kind === 'clothes') this.clothesShopRequest = 'all';
      else if (L.kind === 'pet') this.petShopRequest = true;
      else this.dialog = { shop: L.sign };
      return;
    }
    if (id.startsWith('store:item:')) {
      const item = id.slice(11);
      const r = L.kind === 'pet' ? this.buyPetGood(item, 1) : this.buyFood(item, L.sign);
      this.say(r.message, 3);
      if (r.ok) this.pushSpeech({ x: L.keeper.x, z: L.keeper.z, text: L.kind === 'pet' ? '감사합니다~ 🐾' : '감사합니다!' });
      return;
    }
    if (id.startsWith('store:pet:')) {
      const a = this.pen?.animals.find((q) => q.stock.id === id.slice(10));
      if (a) this.petAdoptRequest = a.stock;
    }
  }

  /** 오늘 입고된 아이 분양 (놀이터에 있어야 한다 — 없으면 못 산다) */
  adoptStock(stockId: string, name: string): { ok: boolean; message: string } {
    const a = this.pen?.animals.find((q) => q.stock.id === stockId);
    if (!a) return { ok: false, message: '그 아이는 이미 새 가족을 찾아갔어요' };
    const r = this.pets.adopt(a.stock.species, name, a.stock.coat);
    if (r.ok) {
      this.todayStock();
      this.profile.petShop!.sold.push(stockId);
      this.pen!.remove(stockId);
      saveProfile(this.profile);
    }
    return r;
  }

  /** 가게 안: 주인은 계산대 뒤에서 손님을 보고, 펫샵 아이들은 놀이터를 돌아다닌다 */
  private stepStore() {
    const k = this.keeper;
    k.snapshot();
    k.freeMove = null;
    const dx = this.player.x - k.x;
    const dz = this.player.z - k.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      k.fx = dx / d;
      k.fz = dz / d;
    }
    k.feed(NEUTRAL_INPUT);
    k.tick({ opponent: k, awayX: 0, awayZ: -1 });
    if (this.store) {
      k.x = this.store.keeper.x;
      k.z = this.store.keeper.z;
    }
    this.pen?.step(this.player.x, this.player.z);
  }

  // ───────────────────────── 빌라 현관 드나들기 ─────────────────────────

  /** 빌라 바깥 현관 문 앞 (건물 정면 벽에서 이만큼 앞) */
  private villaDoorZ(off: number) {
    const b = this.map.home.building;
    return b.z + b.d / 2 + off;
  }

  /** 문 하나를 지나 다른 곳으로: 문 쪽을 보고 → 문이 열리면 걸어 들어가고 → (화면 암전) → 들어선 쪽 문이 등 뒤로 닫힌다 */
  private passDoor(p: DoorPass) {
    this.autopilot = null;
    this.doorway = { kind: 'pass', stage: 0, at: this.frame, pass: p };
    if (this.firstPerson) {
      this.fpYaw = Math.atan2(p.face.x, p.face.z);
      this.fpPitch = 0;
    }
  }

  /** 문 id 가 열린 정도 (0~1). 'villa' · 'lobby' · 'home' · 'unit:0~2' · 'storeIn' · 'shop:<poi id>' */
  doorOpen(id: string): number {
    const d = this.doorway;
    if (!d) return 0;
    if (d.kind !== 'pass' || !d.pass) return id === 'villa' ? this.villaDoorOpen : id === 'lobby' ? this.lobbyDoorOpen : 0;
    const t = this.frame - d.at;
    if (d.stage === 0 && d.pass.open === id) return clamp01(t / 18);
    if (d.stage === 1 && d.pass.close === id) return 1 - clamp01((t - 20) / 28);
    return 0;
  }

  private stepDoorway(inp: CityInput) {
    const d = this.doorway!;
    const t = this.frame - d.at;
    const p = this.player;
    inp.run = false;
    inp.interact = false;
    inp.buttons = undefined;
    inp.jump = false;
    inp.move = null;
    const walk = (x: number, z: number) => {
      if (Math.hypot(x - p.x, z - p.z) > 0.08) inp.move = { x: x - p.x, z: z - p.z };
    };
    if (d.kind === 'pass' && d.pass) {
      const ps = d.pass;
      if (d.stage === 0) {
        if (t < 16) {
          const n = Math.hypot(ps.face.x, ps.face.z) || 1;
          p.fx = ps.face.x / n;
          p.fz = ps.face.z / n;
        } else walk(ps.to.x, ps.to.z);
        if (t >= DOOR_SWITCH) {
          ps.arrive();
          this.doorway = { kind: 'pass', stage: 1, at: this.frame, pass: ps };
        }
        return;
      }
      walk(ps.out.x, ps.out.z);
      if (t >= DOOR_AFTER) this.doorway = null;
      return;
    }
    const hx = this.map.home.x;
    if (d.stage === 0) {
      if (d.kind === 'enter') {
        // 문 쪽을 보고 서서 문이 열리길 기다렸다가 (0~16) 문턱까지 걸어 들어간다
        if (t < 16) {
          p.fx = 0;
          p.fz = -1;
        } else walk(hx, this.villaDoorZ(0.25));
      } else {
        // 로비 유리문 쪽으로
        if (t < 10) {
          p.fx = 0;
          p.fz = 1;
        } else walk(0.5, LOBBY.room.z1 - 0.25);
      }
      if (t >= DOOR_SWITCH) {
        if (d.kind === 'enter') {
          this.moveTo('lobby', 0.5, LOBBY.room.z1 - 0.45, 0, -1);
          this.say('행복빌라 1층 로비');
        } else this.moveTo('city', hx, this.villaDoorZ(0.3), 0, 1);
        this.doorway = { kind: d.kind, stage: 1, at: this.frame };
      }
      return;
    }
    // 들어선 뒤: 몇 걸음 걸어 나오면 끝 (그동안 등 뒤 문이 닫힌다)
    if (d.kind === 'enter') walk(LOBBY.spawn.x, LOBBY.spawn.z - 0.6);
    else walk(hx, this.villaDoorZ(1.6));
    if (t >= DOOR_AFTER) this.doorway = null;
  }

  /** 빌라 바깥 현관 문이 열린 정도 (0~1) */
  get villaDoorOpen(): number {
    const d = this.doorway;
    if (!d) return 0;
    const t = this.frame - d.at;
    if (d.kind === 'enter' && d.stage === 0) return clamp01(t / 18);
    if (d.kind === 'exit' && d.stage === 1) return 1 - clamp01((t - 22) / 28);
    if (d.kind === 'exit' && d.stage === 0) return clamp01((t - (DOOR_SWITCH - 8)) / 8);
    return 0;
  }

  /** 로비 유리문이 열린 정도 (0~1) */
  get lobbyDoorOpen(): number {
    const d = this.doorway;
    if (!d) return 0;
    const t = this.frame - d.at;
    if (d.kind === 'exit' && d.stage === 0) return clamp01(t / 16);
    if (d.kind === 'enter' && d.stage === 1) return 1 - clamp01((t - 20) / 28);
    return 0;
  }

  /** 화면 어둡기 (0 = 보통, 1 = 깜깜): 장소가 바뀌는 순간을 가린다 */
  get screenFade(): number {
    const d = this.doorway;
    if (!d) return 0;
    const t = this.frame - d.at;
    if (d.stage === 0) return clamp01((t - (DOOR_SWITCH - 16)) / 14);
    return 1 - clamp01(t / 18);
  }

  /** 1인칭 켜기/끄기 (켜면 지금 보는 방향 그대로) */
  toggleFirstPerson() {
    this.firstPerson = !this.firstPerson;
    if (this.firstPerson) {
      this.fpYaw = Math.atan2(this.player.fx, this.player.fz);
      this.fpPitch = 0;
      this.say('👀 1인칭 시점 — ↑↓ 걷기 · ←→ 돌기 · 화면 클릭하면 마우스로 둘러보기 (V 되돌리기)', 3.5);
    } else {
      this.fpMouse = false;
      this.say('3인칭 시점', 1.2);
    }
  }

  /** 마우스로 둘러보기 (픽셀 이동량) */
  fpLook(dx: number, dy: number) {
    if (!this.firstPerson) return;
    this.fpYaw -= dx * 0.0024;
    this.fpPitch = Math.max(-1.25, Math.min(1.25, this.fpPitch - dy * 0.0024));
  }

  /**
   * 1인칭 조작: 방향키는 화면(지도) 기준 → 보는 방향 기준으로 바꾼다.
   * ↑↓ 앞뒤, ←→ 는 몸 돌리기 (마우스로 보는 중이면 옆걸음). 서 있으면 보는 쪽을 향한다 (공격도 그쪽으로)
   */
  private fpInput(inp: CityInput) {
    const p = this.player;
    const m = inp.move;
    if (m) {
      const fwd = -m.z;
      let side = 0;
      if (this.fpMouse) side = m.x;
      else this.fpYaw -= m.x * 0.045;
      const fx = Math.sin(this.fpYaw);
      const fz = Math.cos(this.fpYaw);
      // 오른쪽 = (-cos, sin)
      const x = fx * fwd - fz * side;
      const z = fz * fwd + fx * side;
      inp.move = Math.hypot(x, z) > 1e-6 ? { x, z } : null;
    }
    if (!inp.move) {
      p.fx = Math.sin(this.fpYaw);
      p.fz = Math.cos(this.fpYaw);
    }
  }

  /** @param owner 집에 들어갈 때 그 집 주인 (null = 내 집) */
  private moveTo(loc: CityLocation, x: number, z: number, fx: number, fz: number, owner: string | null = null) {
    this.doorway = null;
    // 가게를 벗어나면 입어보던 옷은 벗는다 (문 말고 다른 길로 나가도)
    if (loc !== 'store') this.trial = {};
    if (loc !== 'city') this.stopFishing(true);
    if (loc !== 'park') {
      this.ride = null;
      this.rideQueue = null;
    }
    this.lookingOut = false;
    this.location = loc;
    this.homeOwner = loc === 'home' ? owner : null;
    this.locationChangedAt = this.frame;
    this.placePlayer(x, z, fx, fz);
    // 1인칭이면 들어선 방향을 본다
    if (this.firstPerson && (fx || fz)) {
      this.fpYaw = Math.atan2(fx, fz);
      this.fpPitch = 0;
    }
  }

  /** 실내면 그 방 범위 (코디 카메라가 벽 밖으로 나가지 않게), 바깥이면 null */
  indoorBounds(): { x0: number; x1: number; z0: number; z1: number } | null {
    const w = this.location;
    return w === 'home' ? HOME.room : w === 'lobby' ? LOBBY.room : w === 'corridor' ? CORRIDOR.room : w === 'store' && this.store ? this.store.room : null;
  }

  /** 지금 있는 곳 (새로고침해도 여기서 다시 시작하려고 저장한다). 문을 지나는 중이면 null */
  placeSnapshot(): PlaceSnapshot | null {
    if (this.doorway) return null;
    const p = this.player;
    return {
      loc: this.location,
      x: p.x,
      z: p.z,
      fx: p.fx,
      fz: p.fz,
      floor: this.floor,
      sign: this.location === 'store' ? this.store?.sign : undefined,
      back: this.location === 'store' ? { ...this.cityReturn } : undefined,
      // 친구 집은 다시 들어갈 수 없을 수도 있어서 저장하지 않는다
      friendHome: this.location === 'home' && !!this.homeOwner,
    };
  }

  /** 저장해 둔 곳에서 다시 시작 (못 쓰는 값이면 아무것도 안 한다) */
  restorePlace(s: PlaceSnapshot | null | undefined) {
    if (!s || ![s.x, s.z].every(Number.isFinite)) return;
    const fx = Number.isFinite(s.fx) ? s.fx : 0;
    const fz = Number.isFinite(s.fz) ? s.fz : 1;
    if (s.loc === 'home' && s.friendHome) return; // 친구 집이었으면 빌라 앞에서
    if (s.loc === 'store') {
      if (!s.sign || !s.back) return;
      const L = storeLayout(s.sign);
      this.store = L;
      this.cityReturn = { ...s.back };
      // 나갈 때 열리는 바깥 유리문
      const door = L.kind === 'stairs' || L.kind === 'karaoke' ? this.map.pois.find((q) => q.id === 'karaoke') : this.map.pois.find((q) => q.label === s.sign);
      if (door) this.storeDoor = `shop:${door.id}`;
      this.keeper.reset(L.keeper.x, L.keeper.z, 0, 1);
      this.pen = L.spots.length ? new PenSim(L.spots, this.todayStock(), this.day * 31 + 7) : null;
    } else if (s.loc === 'corridor') {
      this.floor = Math.max(2, Math.min(this.villaFloors, s.floor || 2));
    } else if (s.loc === 'park') {
      // 놀이공원은 역 앞에서 다시 시작 (타던 놀이기구는 내린 상태로)
      this.moveTo('park', PARK.spawn.x, PARK.spawn.z, 0, -1);
      return;
    } else if (s.loc !== 'city' && s.loc !== 'home' && s.loc !== 'lobby') return;
    this.moveTo(s.loc, s.x, s.z, fx, fz);
  }

  /** 플레이어 위치만 옮긴다 (Fighter.reset 은 체력까지 채우므로 체력은 그대로 둔다) */
  private placePlayer(x: number, z: number, fx: number, fz: number) {
    const hp = this.player.hp;
    this.player.reset(x, z, fx, fz);
    this.player.hp = hp;
  }

  private findNearby(): Poi | null {
    const p = this.player;
    // 친구 집에선 침대·냉장고 등은 쓰지 않고 소파와 현관만
    const pois = this.location === 'home' ? (this.homeOwner ? HOME.pois.filter((q) => q.id === 'exit' || q.id === 'sofa') : HOME.pois) : this.location === 'lobby' ? LOBBY.pois : this.location === 'corridor' ? this.corridorPois() : this.location === 'store' ? this.storePois() : this.location === 'park' ? parkPois() : this.map.pois;
    let best: Poi | null = null;
    let bestD = Infinity;
    for (const poi of pois) {
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      if (d < poi.radius && d < bestD) {
        best = poi;
        bestD = d;
      }
    }
    // 내 집에선 엄마와 대화할 수 있다
    const sp =
      this.location === 'lobby' || this.location === 'corridor'
        ? this.seniorAI.poi()
        : this.location === 'home' && !this.homeOwner
          ? ({ id: 'mom', kind: 'home', label: '엄마와 대화하기', x: MOM_SPOT.x + 0.45, z: MOM_SPOT.z, radius: 1.1 } as Poi)
          : null;
    if (sp) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d < sp.radius && d < bestD) best = sp;
    }
    if (best?.id === 'window' && this.homeWindowOpen) return { ...best, label: '창문 (밖 내다보기)' };
    if (best?.id === 'sofa') {
      const t = this.sofaTakenBy();
      if (t) return { ...best, label: `소파 (${t.name} 님이 누워 있음)` };
    }
    if (best?.id === 'desk' && !this.job) {
      const t = this.jobTakenBy('aptGuard');
      if (t) return { ...best, label: `경비 데스크 (${t.name} 님 근무 중)` };
    }
    if (best?.id === 'lobby') return { ...best, label: `행복빌라 현관 (들어가기 · 내 집 ${this.homeUnit}호)` };
    return best;
  }

  // ───────────────────────── 멀티플레이 (친구) ─────────────────────────

  /** 내 집 호수 (처음 접속하면 비어 있는 집을 받는다) */
  get homeUnit(): string {
    return this.profile.home?.unit ?? '302';
  }

  /** 같은 곳에 있는지 가리는 열쇠: 도시·로비·층별 복도·누구의 집 */
  get roomKey(): string {
    if (this.location === 'home') return `h:${this.homeOwner ?? this.netId ?? 'me'}`;
    if (this.location === 'corridor') return `c${this.floor}`;
    if (this.location === 'store') return `s:${this.store?.sign ?? ''}`;
    return this.location;
  }

  /** 행복빌라의 모든 집 호수 (302호가 먼저, 나머지는 층·호 순서) */
  get allUnits(): string[] {
    const out: string[] = [];
    for (let f = 2; f <= this.villaFloors; f++) for (let i = 1; i <= CORRIDOR.doors.length; i++) out.push(`${f}0${i}`);
    return ['302', ...out.filter((u) => u !== '302')];
  }

  /** 지금 장소를 사람이 읽는 이름으로 */
  get placeLabel(): string {
    if (this.location === 'home') {
      const owner = this.homeOwner ? this.remotes.get(this.homeOwner) : null;
      return owner ? `${owner.name}의 집 · 행복빌라 ${owner.unit}호` : `행복빌라 ${this.homeUnit}호 (내 집)`;
    }
    if (this.location === 'lobby') return '행복빌라 1층 로비';
    if (this.location === 'corridor') return `행복빌라 ${this.floor}층 복도`;
    if (this.location === 'store' && this.store) return `${this.store.sign} (가게 안)`;
    return '서울 · 한강공원 일대';
  }

  /** 친구가 들어왔거나 정보(이름·호수)가 바뀌었다 */
  upsertRemote(id: string, name: string, unit: string, outfit: string[] = [], body?: string) {
    let r = this.remotes.get(id);
    if (!r) {
      const f = new Fighter(this.remoteIndex++, name, { canBlock: false });
      f.reset(this.map.home.x, this.map.home.z + 1, 0, 1);
      r = { id, name, unit, fighter: f, room: '', target: null, hitLock: 0, myHitAt: -99999, level: 1, job: null, jobAt: 0, seat: null, scene: null, sleep: null, fish: null, booth: null, pets: [], seenAt: -99999 };
      this.remotes.set(id, r);
      this.say(`👋 ${name} 님이 접속했어요`, 3);
    }
    r.name = name;
    r.unit = unit;
    r.outfit = outfit;
    r.body = body;
  }

  /** 친구가 나갔다. 그 친구 집에 놀러 가 있었다면 밖으로 나온다 */
  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    if (this.homeOwner === id) {
      this.moveTo('city', this.map.home.x, this.map.home.z + 1, 0, 1);
      this.say(`${r.name} 님이 나가서 집 밖으로 나왔어요`, 3);
    } else this.say(`${r.name} 님이 나갔어요`, 2.5);
  }

  /** 친구에게 보낼 내 모습 */
  netState(): NetState {
    const p = this.player;
    const q = (v: number) => Math.round(v * 100) / 100;
    const seat = this.seat;
    return {
      r: this.roomKey, x: q(p.x), z: q(p.z), y: q(p.y), fx: q(p.fx), fz: q(p.fz), s: p.state, f: p.frame, m: p.move?.id ?? null, hp: Math.round(p.hp), mh: p.maxHp, lv: this.profile.level,
      jb: this.job?.job.id ?? null,
      ja: this.job?.startedAt,
      se: seat ? (seat.spot === 'sofa' ? this.sofa.id : 'd') : null,
      sa: seat ? Math.round(this.seatAmount * 20) / 20 : 0,
      ...(this.myBooth() ? { kb: this.karaokeRental!.room } : {}),
      ...(this.ride ? { rd: `${this.ride.id}:${this.ride.seat}` } : {}),
      ...this.netExtras(),
    };
  }

  /** 자는 모습·낚시·펫 (친구 화면에서도 똑같이 보이게) */
  private netExtras(): Pick<NetState, 'sl' | 'sb' | 'fs' | 'pt'> {
    const q = (v: number) => Math.round(v * 100) / 100;
    const out: Pick<NetState, 'sl' | 'sb' | 'fs' | 'pt'> = {};
    const sv = this.location === 'home' ? this.sleepView : null;
    if (sv && sv.rest > 0) {
      out.sl = q(sv.rest);
      out.sb = q(sv.blanket);
    }
    const fsc = this.fishScene();
    if (fsc) {
      const l = fsc.f;
      out.fs = {
        p: l.phase, t: l.t, n: q(l.nibble), su: l.surge, te: Math.round(l.tension), tf: l.tapFlash ? 1 : 0, sw: q(l.swim), lo: q(l.lineOut),
        fi: l.fish?.id ?? null, kg: l.kg, x: q(fsc.spot.x), z: q(fsc.spot.z), rod: fsc.rod.id,
      };
    }
    if (this.pets.poses.length) {
      out.pt = this.pets.poses.slice(0, 6).map((p) => ({ i: p.pet.id, sp: p.pet.species, x: q(p.x), y: q(p.y), z: q(p.z), yaw: q(p.yaw), mv: q(p.moving), j: Math.round(p.pet.joy) }));
    }
    return out;
  }

  /** 내 낚시 장면 (낚시 중이 아니면 null) */
  fishScene(): FishScene | null {
    const f = this.fishing;
    const spot = this.fishSpot;
    if (!f || !spot || this.location !== 'city') return null;
    return {
      f: { phase: f.phase, t: f.t, nibble: f.nibble, surge: f.surge, tension: f.tension, tapFlash: f.view.tapFlash, swim: f.swim, lineOut: f.lineOut, fish: f.fish, kg: f.kg },
      spot,
      rod: this.fishSetup?.rod ?? ROD_BY_ID[this.fishingState.rod ?? 'bamboo'] ?? ROD_BY_ID.bamboo,
    };
  }

  /** 친구 낚시 장면 (같은 곳에 있을 때만) */
  remoteFishScene(r: RemotePlayer): FishScene | null {
    const n = r.fish;
    if (!n || r.room !== this.roomKey) return null;
    return {
      f: { phase: n.p, t: n.t, nibble: n.n, surge: n.su, tension: n.te, tapFlash: !!n.tf, swim: n.sw, lineOut: n.lo, fish: n.fi ? (FISH_BY_ID[n.fi] ?? null) : null, kg: n.kg },
      spot: { x: n.x, z: n.z },
      rod: ROD_BY_ID[n.rod] ?? ROD_BY_ID.bamboo,
    };
  }

  /** 소파에 누워 있는 친구 (같은 집에 있을 때만) */
  sofaTakenBy(): RemotePlayer | null {
    if (this.location !== 'home') return null;
    for (const r of this.remotes.values()) if (r.room === this.roomKey && r.seat?.spot === 'sofa') return r;
    return null;
  }

  /** 렌더러용: 친구가 앉은·누운 자세 (소파 동작 넘어가는 정도 포함) */
  remoteSeatView(r: RemotePlayer) {
    const s = r.seat;
    if (!s) return null;
    const at = Math.max(0, this.frame - s.at);
    return { spot: s.spot, amt: s.amt, sofa: { act: s.act, prev: s.prev, k: at / SOFA_BLEND, at, pt: s.pt + at } };
  }

  /** 로비·복도에 그릴 사람: 내가 근무 중이면 내 근무, 아니면 근무 중인 친구가 보내 준 장면 */
  get shownPeople(): readonly ShownPerson[] {
    if (this.job) return this.job.people;
    for (const r of this.remotes.values()) if (r.job && r.scene) return [...r.scene.people.values()];
    return [];
  }

  /** 근무 중인 친구가 보낸 로비·복도 장면 */
  applyRemoteJob(id: string, sc: NetJobScene) {
    const r = this.remotes.get(id);
    if (!r || !r.job) return;
    const scene = (r.scene ??= { people: new Map(), at: 0 });
    scene.at = this.frame;
    const seen = new Set<number>();
    for (const n of sc.p) {
      seen.add(n.i);
      let v = scene.people.get(n.i);
      const tier = n.tr ? ROBBER_TIERS.find((t) => t.id === n.tr) : undefined;
      if (!v) {
        const f = new Fighter(n.i, 'npc', { maxHp: n.mh, canBlock: false });
        f.reset(n.x, n.z, n.fx, n.fz);
        v = { f, slot: n.sl, where: n.w, kind: n.k === 'r' ? 'robber' : 'visitor', title: n.t, tier, koFrames: -1, showUntil: 0, target: { x: n.x, z: n.z, y: n.y, fx: n.fx, fz: n.fz } };
        scene.people.set(n.i, v);
      }
      const f = v.f;
      // 다른 층으로 옮겼으면 미끄러지지 않고 바로 그 자리에
      if (v.where !== n.w) {
        f.x = n.x;
        f.z = n.z;
        f.snapshot();
      }
      v.slot = n.sl;
      v.where = n.w;
      v.title = n.t;
      v.tier = tier;
      v.reaction = n.re;
      v.koFrames = n.ko ? Math.max(0, v.koFrames) : -1;
      v.showUntil = n.sh ? this.frame + 30 : 0;
      v.target = { x: n.x, z: n.z, y: n.y, fx: n.fx, fz: n.fz };
      if (f.state !== n.s || (f.move?.id ?? null) !== n.m) {
        f.state = n.s;
        f.move = n.m ? (MOVES[n.m] ?? null) : null;
        f.frame = n.f;
      } else if (Math.abs(f.frame - n.f) > 6) f.frame = n.f;
      f.maxHp = n.mh;
      f.hp = n.hp;
    }
    for (const i of [...scene.people.keys()]) if (!seen.has(i)) scene.people.delete(i);
    // 같은 곳에서 일어난 말풍선·타격 이펙트만 띄운다
    const here = this.location === 'lobby' ? 1 : this.location === 'corridor' ? this.floor : 0;
    if (!here) return;
    for (const s of sc.sp) if (s.w === here) this.pushSpeech({ x: s.x, z: s.z, text: s.text, color: s.color });
    for (const e of sc.ev) if (e.w === here) this.pushEvent(e.e);
  }

  /** 친구의 최신 모습을 받았다 */
  applyRemoteState(id: string, s: NetState) {
    const r = this.remotes.get(id);
    if (!r) return;
    const f = r.fighter;
    const wasUp = f.hp > 0;
    const moved = r.room !== s.r || !r.target;
    r.seenAt = this.frame;
    r.room = s.r;
    r.level = s.lv ?? r.level;
    r.target = { x: s.x, z: s.z, y: s.y, fx: s.fx, fz: s.fz };
    this.applyRemoteBusy(r, s);
    if (moved) {
      // 다른 곳으로 옮겼으면 미끄러지듯 따라가지 않고 바로 그 자리에
      f.x = s.x;
      f.z = s.z;
      f.y = s.y;
      f.fx = s.fx;
      f.fz = s.fz;
      f.snapshot();
    }
    if (this.frame < r.hitLock) return;
    if (f.state !== s.s || (f.move?.id ?? null) !== s.m) {
      f.state = s.s;
      f.move = s.m ? (MOVES[s.m] ?? null) : null;
      f.frame = s.f;
    } else if (Math.abs(f.frame - s.f) > 6) f.frame = s.f;
    f.maxHp = s.mh;
    f.hp = s.hp;
    if (wasUp && s.hp <= 0 && r.room === this.roomKey && this.frame - r.myHitAt < PVP_MEMORY) {
      this.say(`🏆 ${r.name}을(를) 쓰러뜨렸다!`, 3);
    }
  }

  /** 친구가 하는 일(근무)과 앉은 곳(데스크·소파). 한 자리엔 한 명만: 거의 동시에 차지했으면 늦은 쪽이 비킨다 */
  private applyRemoteBusy(r: RemotePlayer, s: NetState) {
    r.sleep = s.sl ? { rest: s.sl, blanket: s.sb ?? 0 } : null;
    r.fish = s.fs && typeof s.fs.p === 'string' ? { ...s.fs } : null;
    r.pets = Array.isArray(s.pt) ? s.pt.slice(0, 6) : [];
    const job = s.jb ?? null;
    if (job !== r.job) r.scene = null;
    r.job = job;
    r.jobAt = s.ja ?? 0;
    const me = this.netId ?? '';
    if (job && this.job?.job.id === job && (r.jobAt < this.job.startedAt || (r.jobAt === this.job.startedAt && r.id < me))) this.yieldJob(r);

    r.booth = typeof s.kb === 'number' ? s.kb : null;
    r.ride = parseRide(s.rd);
    const se = s.se ?? null;
    if (!se) r.seat = null;
    else {
      const spot = se === 'd' ? 'desk' : 'sofa';
      const act = (spot === 'sofa' ? se : 'sit') as SofaAct;
      const old = r.seat;
      if (!old || old.spot !== spot) r.seat = { spot, amt: s.sa ?? 1, act, prev: 'sit', at: this.frame, pt: 0 };
      else {
        old.amt = s.sa ?? 1;
        if (old.act !== act) {
          // 동작이 바뀌었다: 지금 보이던 동작에서 새 동작으로 넘어간다
          old.pt += this.frame - old.at;
          old.prev = old.act;
          old.act = act;
          old.at = this.frame;
        }
      }
      // 둘이 동시에 소파에 누웠으면 id 가 큰 쪽이 일어난다
      if (spot === 'sofa' && this.location === 'home' && r.room === this.roomKey && this.seat?.spot === 'sofa' && this.seat.phase !== 'stand' && r.id < me) {
        this.standUp();
        this.say(`🛋️ ${r.name} 님이 먼저 소파에 누웠어요`, 2.5);
      }
    }
  }

  /** 받은 위치로 부드럽게 따라간다 */
  private follow(f: Fighter, t: { x: number; z: number; y: number; fx: number; fz: number }) {
    const d = Math.hypot(t.x - f.x, t.z - f.z);
    const k = d > 4 ? 1 : 0.3;
    f.x += (t.x - f.x) * k;
    f.z += (t.z - f.z) * k;
    f.y += (t.y - f.y) * 0.5;
    const fx = f.fx + (t.fx - f.fx) * 0.4;
    const fz = f.fz + (t.fz - f.fz) * 0.4;
    const len = Math.hypot(fx, fz) || 1;
    f.fx = fx / len;
    f.fz = fz / len;
  }

  /** 친구 모습을 받은 위치로 부드럽게 옮기고, 받는 사이에도 동작이 이어지게 프레임을 진행한다 */
  private stepRemotes() {
    for (const r of this.remotes.values()) {
      const f = r.fighter;
      f.snapshot();
      f.frame++;
      if (r.target) this.follow(f, r.target);
      // 낚시 장면은 받는 사이에도 시간이 흐른다 (던지기 동작이 끊기지 않게)
      if (r.fish) r.fish.t++;
      // 친구 근무 장면: 3초 넘게 소식이 없으면 치운다
      const sc = r.scene;
      if (sc && this.frame - sc.at > 180) r.scene = null;
      else if (sc) {
        for (const v of sc.people.values()) {
          v.f.snapshot();
          v.f.frame++;
          if (v.koFrames >= 0) v.koFrames++;
          this.follow(v.f, v.target);
        }
      }
    }
  }

  /** 내 공격이 같은 곳의 친구에게 맞았나 (판정은 혼자 할 때와 같다). 맞았으면 친구에게 알린다 */
  private hitRemotes() {
    const p = this.player;
    const room = this.roomKey;
    let stop = 0;
    for (const r of this.remotes.values()) {
      if (r.room !== room) continue;
      const f = r.fighter;
      // 서로 겹치지 않게 (친구 모습은 친구 컴퓨터가 정하므로 나만 밀려난다)
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const d = Math.hypot(dx, dz);
      const min = FIGHTER_RADIUS * 1.6;
      if (d < min && d > 1e-6 && f.hp > 0 && p.state !== 'ko') {
        p.x += (dx / d) * (min - d);
        p.z += (dz / d) * (min - d);
      }
      if (f.hp <= 0) continue;
      const h = detectHit(p, f);
      if (!h) continue;
      const remaining = totalFrames(h.mv) - p.frame + 1;
      const out = applyHit(h);
      this.events.push(out.event);
      stop = Math.max(stop, Math.min(out.hitstop, 5));
      this.lastCombatFrame = this.frame;
      r.hitLock = this.frame + 12;
      r.myHitAt = this.frame;
      const q = (v: number) => Math.round(v * 100) / 100;
      this.outbox.push({ to: r.id, m: h.mv.id, counter: h.counter, remaining, power: p.power, x: q(p.x), z: q(p.z), fx: q(p.fx), fz: q(p.fz) });
    }
    if (stop) this.hitstop = Math.max(this.hitstop, stop);
  }

  /**
   * 맞았다: 혼자 할 때와 같은 계산으로 내 체력에서 뺀다.
   * - 친구에게 맞음 (같은 곳에 있을 때)
   * - 행인에게 맞음 (동네를 계산하는 친구가 알려 줌, 거리에 있을 때)
   * - (내가 동네를 계산 중이면) 친구가 행인을 때렸다는 소식
   */
  receiveRemoteHit(from: string, h: NetHit) {
    if (h.t !== undefined) {
      this.npcHitByRemote(from, h);
      return;
    }
    const r = this.remotes.get(from);
    const mv = MOVES[h.m];
    const p = this.player;
    const byNpc = h.n !== undefined;
    if (!r || !mv || (byNpc ? this.location !== 'city' : r.room !== this.roomKey)) return;
    if (this.sleep || this.downedAt !== null || this.caughtAt !== null || p.hp <= 0 || p.isInvulnerable()) return;
    // 맞으면 의자에서 일어나고, 대화·자동 이동은 끊긴다
    this.seat = null;
    this.dialog = null;
    this.npcChat = null;
    this.autopilot = null;
    const att = byNpc ? (this.npcs.find((n) => n.fighter.index === h.n)?.fighter ?? new Fighter(h.n!, 'npc', { canBlock: false })) : r.fighter;
    att.x = h.x;
    att.z = h.z;
    att.fx = h.fx;
    att.fz = h.fz;
    att.power = h.power;
    att.frame = totalFrames(mv) + 1 - h.remaining;
    att.moveHits.length = 0;
    const out = applyHit({ att, def: p, mv, blocked: false, counter: h.counter });
    this.events.push(out.event);
    this.hitstop = Math.max(this.hitstop, Math.min(out.hitstop, 4));
    this.lastCombatFrame = this.frame;
    if (!byNpc) this.lastPvp = { name: r.name, frame: this.frame };
  }

  /** (호스트) 친구가 행인을 때렸다: 같은 계산으로 행인 체력을 깎고, 반응(도망·반격·신고·경찰)도 똑같이 */
  private npcHitByRemote(from: string, h: NetHit) {
    const r = this.remotes.get(from);
    const mv = MOVES[h.m];
    const npc = this.npcs.find((n) => n.fighter.index === h.t);
    if (!r || !mv || !npc || npc.koFrames >= 0 || !this.isTownHost) return;
    const att = r.fighter;
    att.x = h.x;
    att.z = h.z;
    att.fx = h.fx;
    att.fz = h.fz;
    att.power = h.power;
    att.frame = totalFrames(mv) + 1 - h.remaining;
    att.moveHits.length = 0;
    const out = applyHit({ att, def: npc.fighter, mv, blocked: false, counter: h.counter });
    if (this.location === 'city') this.events.push(out.event);
    this.shareEvent(out.event, from);
    this.npcStruck(npc, from);
  }

  // ───────────────────────── 같이 보는 동네 (행인·차·신호·경찰·박 반장) ─────────────────────────

  /** 나를 가리키는 id (접속 안 했으면 'me') */
  get myId(): string {
    return this.netId ?? 'me';
  }

  private fresh(r: RemotePlayer) {
    return this.frame - r.seenAt < TOWN_FRESH;
  }

  /**
   * 동네(행인·차·경찰·박 반장)를 계산하는 사람: 지금 접속해 있는 사람 중 id 가 가장 작은 사람.
   * 나머지는 그 사람이 보낸 장면을 그대로 따라 그린다 → 모두가 같은 상황을 본다.
   * 창을 내려 두어 소식이 끊긴 사람은 빠지고, 다음 사람이 받은 장면에서 이어서 계산한다.
   */
  get townHostId(): string {
    let best = this.myId;
    if (!this.netId) return best;
    for (const r of this.remotes.values()) if (this.fresh(r) && r.id < best) best = r.id;
    return best;
  }

  get isTownHost(): boolean {
    return this.townHostId === this.myId;
  }

  /** 거리에 나와 있는 친구가 있나 */
  othersInCity(): boolean {
    for (const r of this.remotes.values()) if (r.room === 'city' && this.fresh(r)) return true;
    return false;
  }

  /** 동네 장면을 받아야 하는 친구가 있나 (거리·빌라 로비·복도) */
  townWatchers(): boolean {
    for (const r of this.remotes.values()) if (this.fresh(r) && (r.room === 'city' || r.room === 'lobby' || /^c\d/.test(r.room))) return true;
    return false;
  }

  /** 보낼 개인 소식이 남았나 */
  get townNotesPending(): boolean {
    return this.townOut.no.length > 0;
  }

  /** 거리에 있는 사람 (행인이 덤비고 경찰이 잡을 수 있는 사람). 없으면 null */
  private folkFighter(id: string): Fighter | null {
    if (id === this.myId) return this.location === 'city' && this.downedAt === null && this.caughtAt === null && !this.sleep ? this.player : null;
    const r = this.remotes.get(id);
    return r && r.room === 'city' && this.fresh(r) && r.fighter.hp > 0 ? r.fighter : null;
  }

  /** 차가 멈춰 줘야 하는 사람들 (나와 거리의 친구들) */
  private carFolk(): Fighter[] {
    const out: Fighter[] = [];
    if (this.location === 'city') out.push(this.player);
    for (const r of this.remotes.values()) if (r.room === 'city' && this.fresh(r)) out.push(r.fighter);
    return out;
  }

  /** 이번 프레임 동네 진행: 호스트는 계산하고, 나머지는 받은 장면을 따라간다 */
  private stepTown(frozen: boolean, canHit: boolean) {
    // 먼저 모두의 직전 위치를 찍어 둔다. 타격 경직으로 이번 프레임에 안 움직이는 사람도
    // 화면이 옛 위치와 지금 위치 사이를 오가며 떨리지 않고 그 자리에 딱 멈춘다 (필드 사냥과 같은 방식)
    for (const n of this.npcs) n.fighter.snapshot();
    for (const o of this.police.officers) o.snapshot();
    const host = this.isTownHost;
    if (host && (this.townAdopt || !this.townWasHost)) this.adoptTown();
    this.townWasHost = host;
    const city = this.location === 'city';
    const watching = city || this.lookingOut;
    const others = this.othersInCity();
    // 내 타격 경직으로 거리가 잠깐 멈추는 건 혼자일 때만
    const hold = frozen && !others;
    if (host) {
      if (watching || others) {
        this.stepCars();
        if (!hold) this.stepNpcs();
      }
      if (canHit && city && !frozen) this.hitNpcs();
      if (!hold) this.stepPolice();
      this.stepSenior();
    } else {
      if (watching) this.stepCarsMirror();
      this.stepTownMirror();
      if (canHit && city && !frozen) this.hitNpcs();
      this.seniorAI.pushPlayer(this.player);
    }
  }

  /** 내가 계산을 맡게 됐다: 지금까지 받아 그리던 장면에서 이어서 계산한다 */
  private adoptTown() {
    this.townAdopt = false;
    for (const n of this.npcs) {
      const t = n.target;
      if (t) {
        n.fighter.x = t.x;
        n.fighter.z = t.z;
        n.fighter.fx = t.fx;
        n.fighter.fz = t.fz;
      }
      n.target = undefined;
      if (!n.path.length) n.path = this.routePath(n.route) ?? [{ x: n.fighter.x, z: n.fighter.z }];
      n.next = Math.max(0, Math.min(n.path.length - 1, n.next));
      this.nextNpcId = Math.max(this.nextNpcId, n.fighter.index + 1);
    }
    this.police.officers.forEach((o, k) => {
      const t = this.officerTargets[k];
      if (t) {
        o.x = t.x;
        o.z = t.z;
      }
    });
    this.officerTargets = [];
    this.seniorAI.adopt();
  }

  /** 받은 장면을 따라 부드럽게 움직인다 (받는 사이에도 동작이 이어지게 프레임을 진행) */
  private stepTownMirror() {
    for (const n of this.npcs) {
      const f = n.fighter;
      f.snapshot();
      f.frame++;
      if (n.koFrames >= 0) n.koFrames++;
      if (n.target && !(n.lockUntil !== undefined && this.frame < n.lockUntil)) this.follow(f, n.target);
    }
    const pol = this.police;
    pol.officers.forEach((o, k) => {
      o.snapshot();
      o.frame++;
      const t = this.officerTargets[k];
      if (t) this.follow(o, t);
    });
    const c = pol.car;
    if (c && pol.phase === 'arriving') {
      const step = Math.min(POLICE_CAR_SPEED, Math.hypot(c.stopX - c.x, c.stopZ - c.z));
      c.x += c.dx * step;
      c.z += c.dz * step;
    } else if (c && pol.phase === 'leaving') {
      c.x += c.dx * POLICE_CAR_SPEED;
      c.z += c.dz * POLICE_CAR_SPEED;
    }
    this.seniorAI.stepMirror();
  }

  /** 모두에게 보이는 말풍선. r = 어디서 (거리 'city', 로비 'lobby', 복도 'c3' …) */
  townSay(s: Speech, r = 'city') {
    if (this.roomKey === r) this.speech.push(s);
    if (this.isTownHost && this.remotes.size) this.queue(this.townOut.sp, { ...s, r });
  }

  /** 타격 이펙트를 같은 곳의 친구에게도 (by 는 이미 자기 화면에 띄웠으니 빼고) */
  private shareEvent(e: CombatEvent, by: string, r = 'city') {
    if (this.isTownHost && this.remotes.size) this.queue(this.townOut.ev, { r, e, by });
  }

  /** 한 사람에게만 보이는 안내 */
  private tell(id: string, text: string, seconds: number) {
    if (id === this.myId) this.say(text, seconds);
    else if (id) this.note({ to: id, tx: text, s: seconds });
  }

  private note(n: TownNote) {
    if (this.remotes.has(n.to)) this.queue(this.townOut.no, n);
  }

  private queue<T>(arr: T[], v: T) {
    arr.push(v);
    if (arr.length > 40) arr.shift();
  }

  /** (호스트) 친구들에게 보낼 동네 장면. full = 이름·옷 색·걷는 길처럼 안 바뀌는 것까지, cars = 차 위치까지 */
  netTown(full: boolean, cars: boolean): NetTown {
    const q = (v: number) => Math.round(v * 100) / 100;
    const now = this.frame;
    if (this.sentNpcIds.size > 400) this.sentNpcIds.clear();
    const n = this.npcs.map((n): NetNpc => {
      const f = n.fighter;
      const o: NetNpc = {
        i: f.index, x: q(f.x), z: q(f.z), y: q(f.y), fx: q(f.fx), fz: q(f.fz), s: f.state, f: f.frame, m: f.move?.id ?? null, hp: Math.round(f.hp),
        ko: n.koFrames, fl: n.flee, pa: n.pause, fi: n.fight, fo: n.foe, hs: Math.max(0, n.hpShowUntil - now), nx: n.next,
        ra: n.reportAt < 0 ? -1 : Math.max(0, n.reportAt - now), ac: n.atkCd,
      };
      if (full || !this.sentNpcIds.has(f.index)) {
        this.sentNpcIds.add(f.index);
        Object.assign(o, { nm: n.name, co: n.color, rt: n.route, sp: Math.round(n.speed * 10000) / 10000, mh: f.maxHp, w: n.wallet, br: n.brave ? 1 : 0 });
      }
      return o;
    });
    const pol = this.police;
    const c = pol.car;
    const out: NetTown = {
      n,
      po: {
        ph: pol.phase, da: Math.max(0, pol.dispatchAt - now), sc: [q(pol.scene.x), q(pol.scene.z)],
        car: c ? [c.x, c.z, c.dx, c.dz, c.stopX, c.stopZ].map(q) : null,
        o: pol.officers.map((o) => ({ x: q(o.x), z: q(o.z), fx: q(o.fx), fz: q(o.fz), s: o.state, f: o.frame })),
        lf: pol.lostFrames, cf: pol.chaseFrames, wa: pol.wanted,
      },
      se: this.seniorAI.net(),
      sp: this.townOut.sp.splice(0),
      ev: this.townOut.ev.splice(0),
      no: this.townOut.no.splice(0),
    };
    if (cars) out.c = this.cars.flatMap((c) => [q(c.x), q(c.z), Math.round(c.v * 1000) / 1000]);
    return out;
  }

  /**
   * 호스트가 보낸 동네 장면. mirror = 그대로 따라 그린다 (내가 호스트면 false: 나에게 온 소식만 처리)
   */
  applyTown(from: string, t: NetTown, mirror: boolean) {
    const r = this.remotes.get(from);
    if (r) r.seenAt = this.frame;
    const me = this.myId;
    for (const no of t.no ?? []) if (no.to === me) this.applyNote(no);
    if (!mirror) return;
    this.townAdopt = true;
    // 행인
    const old = new Map(this.npcs.map((n) => [n.fighter.index, n]));
    const list: Npc[] = [];
    for (const m of t.n ?? []) {
      let n = old.get(m.i);
      if (!n) {
        if (m.nm === undefined) continue; // 이름·길을 아직 모른다: 다음 전체 장면에서
        const f = new Fighter(m.i, 'npc', { runSpeed: m.sp ?? 0.035, maxHp: m.mh ?? 60, canBlock: false, power: 1.1 });
        f.reset(m.x, m.z, m.fx, m.fz);
        n = { fighter: f, name: m.nm, path: [], next: 0, speed: m.sp ?? 0.035, color: m.co ?? 0x5a5a5a, wallet: m.w ?? 20, pause: 0, flee: 0, hpShowUntil: 0, koFrames: -1, reportAt: -1, brave: !!m.br, fight: 0, atkCd: 30, foe: '', route: m.rt ?? 0 };
      }
      if (m.nm !== undefined) {
        n.name = m.nm;
        n.color = m.co ?? n.color;
        n.wallet = m.w ?? n.wallet;
        n.brave = !!m.br;
        n.speed = m.sp ?? n.speed;
        n.fighter.maxHp = m.mh ?? n.fighter.maxHp;
        if (m.rt !== undefined && (m.rt !== n.route || !n.path.length)) {
          n.route = m.rt;
          n.path = this.routePath(m.rt) ?? [];
        }
      }
      const f = n.fighter;
      n.next = m.nx;
      n.koFrames = m.ko;
      n.flee = m.fl;
      n.pause = m.pa;
      n.fight = m.fi;
      n.foe = m.fo;
      n.atkCd = m.ac;
      n.reportAt = m.ra < 0 ? -1 : this.frame + m.ra;
      n.hpShowUntil = Math.max(n.hpShowUntil, m.hs > 0 ? this.frame + m.hs : 0);
      n.target = { x: m.x, z: m.z, y: m.y, fx: m.fx, fz: m.fz };
      list.push(n);
      // 방금 내가 때린 사람: 맞는 동작이 끝날 때까지는 받은 모습으로 덮어쓰지 않는다
      if (n.lockUntil !== undefined && this.frame < n.lockUntil) continue;
      if (f.state !== m.s || (f.move?.id ?? null) !== m.m) {
        f.state = m.s;
        f.move = m.m ? (MOVES[m.m] ?? null) : null;
        f.frame = m.f;
      } else if (Math.abs(f.frame - m.f) > 6) f.frame = m.f;
      f.hp = m.hp;
      if (Math.hypot(f.x - m.x, f.z - m.z) > 6) {
        f.x = m.x;
        f.z = m.z;
        f.snapshot();
      }
    }
    this.npcs = list;
    // 차: 차 순서(차로)는 모두 같다. 많이 어긋났으면 바로, 조금이면 부드럽게 맞춘다
    const c = t.c;
    if (Array.isArray(c)) {
      for (let i = 0; i < this.cars.length && i * 3 + 2 < c.length; i++) {
        const car = this.cars[i];
        const x = c[i * 3];
        const z = c[i * 3 + 1];
        car.x = x;
        car.z = z;
        car.v = c[i * 3 + 2];
      }
    }
    // 경찰
    const po = t.po;
    if (po) {
      const pol = this.police;
      pol.phase = po.ph;
      pol.dispatchAt = this.frame + po.da;
      pol.scene = { x: po.sc[0], z: po.sc[1] };
      if (po.car) {
        const [x, z, dx, dz, stopX, stopZ] = po.car;
        const pc = pol.car;
        if (pc && Math.hypot(pc.x - x, pc.z - z) < 8) Object.assign(pc, { x: pc.x + (x - pc.x) * 0.5, z: pc.z + (z - pc.z) * 0.5, dx, dz, stopX, stopZ });
        else pol.car = { x, z, dx, dz, stopX, stopZ };
      } else pol.car = null;
      while (pol.officers.length < po.o.length) {
        const k = pol.officers.length;
        const o = new Fighter(900 + k, 'police', { runSpeed: OFFICER_SPEED, maxHp: 99999, canBlock: false });
        o.reset(po.o[k].x, po.o[k].z, po.o[k].fx, po.o[k].fz);
        pol.officers.push(o);
      }
      pol.officers.length = po.o.length;
      this.officerTargets = po.o.map((o, k) => {
        const f = pol.officers[k];
        if (f.state !== o.s) {
          f.state = o.s;
          f.frame = o.f;
        }
        return { x: o.x, z: o.z, y: 0, fx: o.fx, fz: o.fz };
      });
      pol.lostFrames = po.lf;
      pol.chaseFrames = po.cf;
      pol.wanted = po.wa;
    }
    if (t.se) this.seniorAI.applyNet(t.se);
    // 같은 곳에서 일어난 말풍선·타격 이펙트
    for (const sp of t.sp ?? []) if (sp.r === this.roomKey) this.speech.push({ x: sp.x, z: sp.z, text: sp.text, color: sp.color });
    for (const e of t.ev ?? []) if (e.r === this.roomKey && e.by !== me) this.events.push(e.e);
  }

  /** 나에게 온 소식: 주운 돈·물건, 경찰에게 잡힘, 안내 */
  private applyNote(no: TownNote) {
    if (typeof no.g === 'number' && no.g > 0 && no.g < 1000) this.gainLoot(no.nm ?? '행인', Math.round(no.g), no.it);
    if (no.caught && this.caughtAt === null && this.location === 'city') {
      this.caughtAt = this.frame;
      this.say('🚔 경찰에게 잡혔습니다', 3);
    }
    if (no.tx) this.say(no.tx, no.s ?? 3);
  }

  // ───────────────────────── 충돌 ─────────────────────────

  /** 건물(집 안이면 가구)과 벽에 막히게 */
  /** 실내(로비 등)의 다른 사람도 가구·벽에 막히게 */
  collideIndoor(f: Fighter, where: CityLocation) {
    this.collideFighter(f, where);
  }

  /** 펫처럼 작은 것 하나를 지금 장소의 벽·가구·건물(·차도)에 막히게 */
  collidePoint(x: number, z: number): { x: number; z: number } {
    const f = { x, z } as unknown as Fighter;
    this.collideFighter(f, this.location, true);
    return { x: f.x, z: f.z };
  }

  private collideFighter(p: Fighter, where: CityLocation = this.location, roads = p === this.player) {
    const r = FIGHTER_RADIUS * 0.8;
    // 앉아 있는 동안 플레이어는 의자에 그대로
    if (p === this.player && this.seat) return;
    const solids =
      where === 'home'
        ? HOME.furniture.map((f) => f.rect)
        : where === 'lobby'
          ? LOBBY.furniture.map((f) => f.rect)
          : where === 'corridor'
            ? this.corridorSolids()
            : where === 'store'
              ? [...(this.store?.furniture ?? []).map((f) => f.rect), ...(this.store?.kind === 'karaoke' && p === this.player ? this.lockedBoothRects() : [])]
              : where === 'park'
                ? parkSolids()
        : this.map.buildings.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
    // 플레이어는 차도에 못 들어간다 (횡단보도로만 건넌다). 경찰·행인은 그대로
    if (where === 'city' && roads) solids.push(...this.roadRects);
    // 공원 분수·놀이기구도 뚫고 지나가지 못한다 (플레이어만 — 행인 길은 그대로)
    if (where === 'city' && roads) solids.push(...this.map.propRects);
    for (const s of solids) {
      // 원(사람) vs 상자: 가장 가까운 점에서 밀어낸다
      const cx = Math.max(s.x0, Math.min(p.x, s.x1));
      const cz = Math.max(s.z0, Math.min(p.z, s.z1));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-6) {
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // 상자 안에 들어가 버렸으면 가장 가까운 변으로
          const opts = [
            [s.x0 - r - p.x, 0],
            [s.x1 + r - p.x, 0],
            [0, s.z0 - r - p.z],
            [0, s.z1 + r - p.z],
          ];
          const [mx, mz] = opts.reduce((a, b) => (Math.hypot(...a) < Math.hypot(...b) ? a : b));
          p.x += mx;
          p.z += mz;
        }
      }
    }
    const b = where === 'home' ? HOME.room : where === 'lobby' ? LOBBY.room : where === 'corridor' ? CORRIDOR.room : where === 'store' && this.store ? this.store.room : where === 'park' ? PARK.bounds : this.map.bounds;
    const onBridge = where === 'city' && Math.abs(p.x - this.map.bridgeX) < 5;
    // 한강 낚시 데크: 강둑 너머 물 위로 나간 나무 데크 안에서만 (양옆 · 끝은 난간)
    const deck = where === 'city' && p.z > b.z1 - r ? this.map.fishDecks.find((d) => Math.abs(p.x - d.x) < d.w / 2 + 0.8) : undefined;
    if (deck) p.x = Math.max(deck.x - deck.w / 2 + r, Math.min(deck.x + deck.w / 2 - r, p.x));
    p.x = Math.max(b.x0 + r, Math.min(b.x1 - r, p.x));
    p.z = Math.max(b.z0 + r, Math.min((onBridge ? 260 : deck ? deck.z1 : b.z1) - r, p.z));
  }

  // ───────────────────────── 차·행인 ─────────────────────────

  private spawnCars() {
    const { XS, ZS, EXPRESSWAY_Z } = CITY_CONST;
    const colors = [0xffffff, 0x222222, 0x9aa3ab, 0x1f3b73, 0x7a0f14, 0xd8d8d8, 0x3c3c3c];
    const lane = (axis: 'x' | 'z', at: number, dir: 1 | -1, from: number, to: number, n: number, offset = 2.5) => {
      for (let k = 0; k < n; k++) {
        const r = this.rng();
        const kind: Car['kind'] = r < 0.18 ? 'taxi' : r < 0.26 ? 'bus' : 'car';
        const s = from + this.rng() * (to - from);
        // 우측통행: 진행 방향의 오른쪽 차로
        const side = axis === 'x' ? dir * offset : -dir * offset;
        this.cars.push({
          x: axis === 'x' ? s : at + side,
          z: axis === 'x' ? at + side : s,
          dx: axis === 'x' ? dir : 0,
          dz: axis === 'z' ? dir : 0,
          speed: kind === 'bus' ? 0.14 : 0.16 + this.rng() * 0.1,
          kind,
          color: kind === 'taxi' ? 0xf28c28 : kind === 'bus' ? (this.rng() < 0.5 ? 0x2f6fd8 : 0x2e9e4f) : colors[Math.floor(this.rng() * colors.length)],
          from,
          to,
          v: 0,
          stops: stopLines(axis, at, dir),
        });
      }
    };
    for (const x of XS) {
      // 다리가 있는 길은 한강 건너까지
      const to = x === this.map.bridgeX ? 250 : EXPRESSWAY_Z;
      lane('z', x, 1, -120, to, 3);
      lane('z', x, -1, -120, to, 3);
    }
    for (const z of ZS) {
      lane('x', z, 1, -150, 150, 4);
      lane('x', z, -1, -150, 150, 4);
    }
    lane('x', EXPRESSWAY_Z, 1, -300, 300, 9, 3.5);
    lane('x', EXPRESSWAY_Z, -1, -300, 300, 9, 3.5);
  }

  /** 신호등 시계 (초). 모든 교차로가 같은 주기이고, 실제 시각을 따라서 모두에게 같은 신호가 켜진다 */
  get signalSeconds() {
    return this.nowMs() / 1000;
  }

  /** 차: 빨간불·노란불이면 정지선 앞에 서고, 앞차와 간격을 두고, 차도(횡단보도) 위의 사람(나·친구) 앞에서 멈춘다 */
  private stepCars() {
    const sec = this.signalSeconds;
    const light: Record<'x' | 'z', Light> = { x: vehicleLight('x', sec), z: vehicleLight('z', sec) };
    const folk = this.carFolk();
    for (const c of this.cars) {
      const alongX = c.dx !== 0;
      const dir = alongX ? c.dx : c.dz;
      const s = alongX ? c.x : c.z;
      const lat = alongX ? c.z : c.x;
      let room = Infinity;
      const l = light[alongX ? 'x' : 'z'];
      if (l !== 'green') {
        for (const line of c.stops) {
          const d = (line - s) * dir;
          // 노란불인데 정지선에 너무 가까우면 그냥 지나간다
          if (d < 0 || (l === 'yellow' && d < 4)) continue;
          room = Math.min(room, d);
        }
      }
      for (const o of this.cars) {
        if (o === c || o.dx !== c.dx || o.dz !== c.dz) continue;
        if (Math.abs((alongX ? o.z : o.x) - lat) > 1) continue;
        const d = ((alongX ? o.x : o.z) - s) * dir;
        if (d > 0 && d < 30) room = Math.min(room, d - (o.kind === 'bus' || c.kind === 'bus' ? 9 : 6.5));
      }
      for (const p of folk) {
        if (Math.abs((alongX ? p.z : p.x) - lat) >= 1.8) continue;
        const d = ((alongX ? p.x : p.z) - s) * dir;
        if (d > 0 && d < 14) room = Math.min(room, d - 3.5);
      }
      // 남은 거리에 비례해 부드럽게 서고, 천천히 다시 출발
      c.v = Math.min(c.speed, c.v + 0.004, Math.max(0, room) * 0.05);
      c.x += c.dx * c.v;
      c.z += c.dz * c.v;
      const s2 = alongX ? c.x : c.z;
      if (dir > 0 && s2 > c.to) {
        if (alongX) c.x = c.from;
        else c.z = c.from;
      } else if (dir < 0 && s2 < c.from) {
        if (alongX) c.x = c.to;
        else c.z = c.to;
      }
    }
  }

  /** 받은 차: 받은 속도 그대로 달리다가, 다음 장면이 오면 그 자리로 (계산은 호스트가) */
  private stepCarsMirror() {
    for (const c of this.cars) {
      c.x += c.dx * c.v;
      c.z += c.dz * c.v;
      const s2 = c.dx !== 0 ? c.x : c.z;
      const dir = c.dx !== 0 ? c.dx : c.dz;
      if (dir > 0 && s2 > c.to) {
        if (c.dx !== 0) c.x = c.from;
        else c.z = c.from;
      } else if (dir < 0 && s2 < c.from) {
        if (c.dx !== 0) c.x = c.to;
        else c.z = c.to;
      }
    }
  }

  /** 걷는 길 번호 → 길 (산책로 또는 블록 둘레 인도) */
  private routePath(route: number): { x: number; z: number }[] | null {
    if (route < 0) {
      const trail = this.map.trails[0];
      if (!trail) return null;
      return route === -1 ? [...trail.path] : [...trail.path].reverse();
    }
    const b = this.map.blocks[route >> 1];
    if (!b) return null;
    const m = CITY_CONST.SIDEWALK / 2;
    const path = [
      { x: b.x0 + m, z: b.z0 + m },
      { x: b.x1 - m, z: b.z0 + m },
      { x: b.x1 - m, z: b.z1 - m },
      { x: b.x0 + m, z: b.z1 - m },
    ];
    return route & 1 ? path.reverse() : path;
  }

  /** 행인 한 명: 블록 둘레 인도를 따라 걷는다. 사람(나·친구) 근처(15m)에는 새로 나타나지 않는다 */
  makeNpc(): Npc {
    const outfit = [0x2b3a55, 0x6b4f3a, 0x8a2c2c, 0x3f6b4a, 0x5a5a5a, 0xc7a14a, 0x2f2f2f, 0x7a5c99];
    const blocks = this.map.blocks;
    let x = 0;
    let z = 0;
    let path: { x: number; z: number }[] = [];
    let next = 0;
    let route = 0;
    const trail = this.map.trails[0];
    if (trail && this.rng() < 0.22) {
      route = this.rng() < 0.5 ? -1 : -2;
      path = this.routePath(route)!;
      const start = Math.floor(this.rng() * path.length);
      x = path[start].x;
      z = path[start].z;
      next = (start + 1) % path.length;
    }
    const near = [this.player, ...this.carFolk()];
    for (let tries = 0; tries < 20 && !path.length; tries++) {
      route = Math.floor(this.rng() * blocks.length) * 2 + (this.rng() < 0.5 ? 1 : 0);
      const p = this.routePath(route)!;
      const start = Math.floor(this.rng() * 4);
      const a = p[start];
      const c = p[(start + 1) % 4];
      const u = this.rng();
      x = a.x + (c.x - a.x) * u;
      z = a.z + (c.z - a.z) * u;
      next = (start + 1) % 4;
      if (tries === 19 || near.every((q) => Math.hypot(x - q.x, z - q.z) > 15)) path = p;
    }
    const jogging = path.length > 4 && this.rng() < 0.4;
    const f = new Fighter(this.nextNpcId++, 'npc', {
      runSpeed: jogging ? 0.075 : 0.03 + this.rng() * 0.015,
      maxHp: 40 + Math.floor(this.rng() * 50),
      canBlock: false,
      power: 1.1,
    });
    // 넷 중 하나쯤은 맞으면 덤빈다 (조깅하는 사람은 더 자주)
    const brave = this.rng() < (jogging ? 0.45 : 0.25);
    f.reset(x, z, 1, 0);
    return {
      fighter: f,
      name: NAMES[Math.floor(this.rng() * NAMES.length)],
      path,
      next,
      speed: f.runSpeed,
      color: outfit[Math.floor(this.rng() * outfit.length)],
      wallet: 5 + Math.floor(this.rng() * 56),
      pause: 0,
      flee: 0,
      hpShowUntil: 0,
      koFrames: -1,
      reportAt: -1,
      brave,
      fight: 0,
      atkCd: 30,
      foe: '',
      route,
    };
  }

  /** 덤비는 행인: 때린 사람(나든 친구든)에게 다가가 기술을 쓴다. 멀어지거나 거리를 떠나면 그만둔다 */
  private stepFighterNpc(n: Npc) {
    const f = n.fighter;
    const t = this.folkFighter(n.foe);
    const dx = t ? t.x - f.x : 0;
    const dz = t ? t.z - f.z : 0;
    const d = t ? Math.hypot(dx, dz) : Infinity;
    n.fight--;
    n.hpShowUntil = Math.max(n.hpShowUntil, this.frame + 30);
    if (!t || d > 18 || n.fight <= 0) {
      n.fight = 0;
      f.runSpeed = n.speed;
    }
    let move: { x: number; z: number } | null = null;
    const busy = f.state === 'attack' || f.state === 'hitstun' || f.state === 'blockstun' || f.isInvulnerable() || f.state === 'launched';
    if (n.fight > 0 && !busy) {
      if (d > 1.15) {
        f.runSpeed = NPC_FIGHT_SPEED;
        move = { x: dx, z: dz };
      } else if (--n.atkCd <= 0) {
        // 상대를 보고 기술 하나
        f.fx = dx / (d || 1);
        f.fz = dz / (d || 1);
        f.queueMove(NPC_MOVES[Math.floor(this.rng() * NPC_MOVES.length)]);
        n.atkCd = 40 + Math.floor(this.rng() * 45);
      } else if (d > 1e-6) {
        f.fx = dx / d;
        f.fz = dz / d;
      }
    }
    f.freeMove = move;
    f.feed(NEUTRAL_INPUT);
    f.tick({ opponent: f, awayX: 0, awayZ: -1 });
    this.collideFighter(f, 'city');
    // 상대에게 맞았나
    if (!t || t.hp <= 0) return;
    const h = detectHit(f, t);
    if (!h) return;
    if (n.foe === this.myId) {
      const out = applyHit(h);
      this.events.push(out.event);
      this.shareEvent(out.event, this.myId);
      this.hitstop = Math.max(this.hitstop, Math.min(out.hitstop, 4));
      this.lastCombatFrame = this.frame;
      this.autopilot = null;
      return;
    }
    // 친구가 맞았다: 내 화면엔 맞는 모습만, 친구에게 알려서 친구가 자기 체력에서 뺀다
    const r = this.remotes.get(n.foe);
    if (!r) return;
    const remaining = totalFrames(h.mv) - f.frame + 1;
    const out = applyHit(h);
    if (this.location === 'city') this.events.push(out.event);
    this.shareEvent(out.event, r.id);
    r.hitLock = this.frame + 12;
    const q = (v: number) => Math.round(v * 100) / 100;
    this.outbox.push({ to: r.id, n: f.index, m: h.mv.id, counter: h.counter, remaining, power: f.power, x: q(f.x), z: q(f.z), fx: q(f.fx), fz: q(f.fz) });
  }

  private stepNpcs() {
    this.npcs.forEach((n, i) => {
      const f = n.fighter;
      f.snapshot();
      // 쓰러진 사람: 잠시 뒤 사라지고 다른 곳에 새 행인
      if (n.koFrames >= 0) {
        n.koFrames++;
        f.freeMove = null;
        f.feed(NEUTRAL_INPUT);
        f.tick({ opponent: f, awayX: 0, awayZ: -1 });
        if (n.koFrames > KO_DESPAWN_FRAMES) this.npcs[i] = this.makeNpc();
        return;
      }
      if (n.reportAt >= 0 && this.frame >= n.reportAt) {
        n.reportAt = -1;
        this.report(n);
      }
      let move: { x: number; z: number } | null = null;
      if (n.fight > 0) {
        this.stepFighterNpc(n);
        return;
      }
      if (n.flee > 0) {
        // 때린 사람 반대쪽으로 뛰어서 도망
        n.flee--;
        f.runSpeed = NPC_FLEE_SPEED;
        const foe = this.folkFighter(n.foe) ?? this.remotes.get(n.foe)?.fighter ?? this.player;
        move = { x: f.x - foe.x || 1, z: f.z - foe.z };
        if (n.flee === 0) f.runSpeed = n.speed;
      } else if (n.pause > 0) n.pause--;
      else {
        const t = n.path[n.next];
        const dx = t.x - f.x;
        const dz = t.z - f.z;
        if (Math.hypot(dx, dz) < 0.4) {
          n.next = (n.next + 1) % n.path.length;
          // 모퉁이에서 가끔 멈춰 선다 (신호 대기·휴대폰)
          if (n.path.length <= 4 && this.rng() < 0.3) n.pause = 60 + Math.floor(this.rng() * 180);
        } else move = { x: dx, z: dz };
      }
      f.freeMove = move;
      f.feed(NEUTRAL_INPUT);
      f.tick({ opponent: f, awayX: 0, awayZ: -1 });
      if (n.flee > 0) this.collideFighter(f, 'city'); // 도망칠 때 건물을 뚫지 않게
    });
  }
}

/** 친구가 보낸 '놀이기구:좌석' */
function parseRide(v: unknown): { id: RideId; seat: number } | null {
  if (typeof v !== 'string') return null;
  const [id, seat] = v.split(':');
  const n = Number(seat);
  if (!(id in RIDES) || !Number.isInteger(n) || n < 0 || n >= RIDES[id as RideId].seats) return null;
  return { id: id as RideId, seat: n };
}
