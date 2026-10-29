import { FIGHTER_RADIUS, PLAYER_TEMPO } from '../core/constants';
import { mulberry32 } from '../core/controllers';
import { Fighter, type FighterState } from '../core/fighter';
import { NEUTRAL_INPUT, dirFrom } from '../core/input';
import { saveProfile, type FridgeFood, type PlayerProfile } from '../core/profile';
import type { Buttons } from '../core/types';
import { applyHit, detectHit, type CombatEvent } from '../core/combat';
import { ITEMS, ITEM_IDS } from '../data/items';
import { SHOPS, type ShopDef } from '../data/shops';
import { LIFE_WARNING, LifeTracker } from '../core/life';
import { CityNav } from './cityNav';
import { buildCityMap, CITY_CONST, type CityMap, type Poi } from './cityMap';
import { MOVES, totalFrames, type MoveDef } from '../data/moves';
import { ensureGear, playerStats } from '../data/equipment';
import { JOB_BY_ID } from '../data/jobs';
import { GuardShift, LOBBY_PATH, type ShiftEnd } from './guardJob';
import { unitPlace, villaFloor } from './villa';

export type CityLocation = 'city' | 'home' | 'lobby' | 'corridor';

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
  /** 아래 방향키를 누르고 있나 (싸울 때는 숙이기) */
  down?: boolean;
  jump?: boolean;
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
    { id: 'sofa', kind: 'home', label: '소파', x: 3.4, z: 2.4, radius: 1.0 },
    { id: 'calendar', kind: 'home', label: '달력 (근무 기록 보기)', x: -3.3, z: -3.0, radius: 0.9 },
    { id: 'window', kind: 'home', label: '창문 (열기 / 닫기)', x: 1.05, z: -3.0, radius: 0.75 },
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
};

/**
 * 행복빌라 1층 로비 (로비 전용 좌표). 남쪽 유리문 = 현관, 북쪽 = 엘리베이터·계단.
 * 서쪽에 경비 데스크: 의자에 앉아 동쪽(현관 ↔ 엘리베이터 동선)을 바라본다.
 */
export const LOBBY = {
  room: { x0: -5, x1: 5, z0: -4, z1: 4 } as Rect,
  spawn: { x: 0.5, z: 2.8 },
  /** 경비 의자 (앉으면 동쪽을 본다) */
  chair: { x: -4.25, z: 0, yaw: Math.PI / 2 },
  /** 선임 경비 박 반장이 서 있는 곳 (데스크 북쪽, 벽 앞) */
  senior: { x: -4.2, z: -3.0 },
  /** 계단 (북동쪽, 남쪽 끝에서 북쪽으로 9칸 올라간다). 걸어 올라가면 2층 복도 */
  stairs: { x0: 3.6, x1: 4.95, z0: -3.95, z1: -1.0, rise: 1.62 },
  furniture: [
    { id: 'desk', rect: { x0: -3.6, x1: -2.85, z0: -1.4, z1: 1.4 } },
    // 계단 서쪽 난간 (계단은 남쪽 아래 칸에서만 올라탄다)
    { id: 'stairRail', rect: { x0: 3.45, x1: 3.6, z0: -3.95, z1: -1.35 } },
    { id: 'mailbox', rect: { x0: 4.55, x1: 4.95, z0: 0.6, z1: 3.0 } },
    { id: 'plant', rect: { x0: -4.9, x1: -4.3, z0: 3.3, z1: 3.9 } },
    { id: 'senior', rect: { x0: -4.5, x1: -3.9, z0: -3.3, z1: -2.7 } },
  ] as { id: string; rect: Rect }[],
  pois: [
    { id: 'senior', kind: 'job', label: '박 반장과 대화하기', x: -4.2, z: -2.2, radius: 1.0 },
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

/** 잠자기 단계별 길이 (프레임) */
const SLEEP_LIE = 90;
const SLEEP_FRAMES = 420; // 밤이 흘러가는 연출 7초
const SLEEP_WAKE = 75;
const WAKE_MINUTES = 7 * 60;
/** 이만큼 피곤해야 잘 수 있다 */
export const SLEEPY = 50;
/** 배고픔·피로도가 100인 채로 이만큼 지나면 알아서 먹고 잔다 (실제 30초) */
const CARE_GRACE = 30 * 60;
/** 자동으로 장 볼 때 여분으로 사 오는 개수, 냉장고 최대 칸 */
const CARE_SPARES = 2;
const FRIDGE_MAX = 10;
const FRIDGE_POS = { x: -3.8, z: 0 };

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
  /** 마지막으로 받은 위치 (화면에선 여기로 부드럽게 따라간다) */
  target: { x: number; z: number; y: number; fx: number; fz: number } | null;
  /** 내가 방금 때렸다: 이 프레임까지는 받은 상태로 덮어쓰지 않는다 (맞는 모습이 튀지 않게) */
  hitLock: number;
  /** 내가 마지막으로 때린 프레임 */
  myHitAt: number;
  /** 친구 레벨 (머리 위 이름표) */
  level: number;
}

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
}

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
const MINUTES_PER_FRAME = 1 / 60; // 실제 1초 = 게임 1분

/**
 * 서울 라이프: 도시를 걷고, 집에 들어가고, 주변에서 일이 벌어지는 일상 모드.
 * 전투 엔진의 Fighter 를 그대로 써서 같은 캐릭터 애니메이션을 공유한다.
 *
 * 행인을 때리면: 체력바가 뜨고, 쓰러뜨리면 지갑의 돈(가끔 소지품)을 줍는다.
 * 본 사람들이 신고하면 경찰이 출동하고, 현장에 남아 있다 잡히면 집 앞에서 다시 시작.
 */
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
  toast: { text: string; until: number } | null = null;
  /** 장소가 바뀐 프레임 (렌더러가 카메라·장면을 바꾼다) */
  locationChangedAt = 0;
  /**
   * 빌라 현관을 드나드는 중: 문 앞에 서서 문을 열고 → 걸어 들어가며 화면이 어두워지고 →
   * 반대편에서 밝아지며 몇 걸음 걷고 → 등 뒤로 문이 닫힌다.
   * kind: enter(밖 → 로비) / exit(로비 → 밖), stage 0 = 장소 바뀌기 전, 1 = 바뀐 뒤
   */
  doorway: { kind: 'enter' | 'exit'; stage: 0 | 1; at: number } | null = null;
  /** 내 집 창문이 열려 있나 (집 안 창가에서 E) */
  homeWindowOpen = false;
  police: Police = { phase: 'none', dispatchAt: 0, scene: { x: 0, z: 0 }, car: null, officers: [], lostFrames: 0, chaseFrames: 0 };
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
  /** 카지노 입구에서 E → 화면이 카지노 창을 연다 */
  casinoRequest = false;
  /** 엘리베이터 안: 층 고르는 창이 열려 있다 (플레이어는 멈춘다) */
  elevatorOpen = false;
  /** 자동 행동 (배고픔·피로가 한계인데 방치하면): 남은 단계와 들고 있는 음식 */
  care: { why: 'eat' | 'sleep'; steps: CareStep[]; carry: FridgeFood[]; started: boolean } | null = null;
  private hungerFullFrames = 0;
  private fatigueFullFrames = 0;
  /** 복도에 있을 때 몇 층인지 */
  floor = 2;
  /** 경비 의자에 앉는 중/앉음/일어나는 중 */
  seat: { phase: 'sit' | 'seated' | 'stand'; at: number } | null = null;
  /** 소수점 체력 회복 누적 */
  private hpAcc = 0;
  private sofaAt = -99999;
  /** 대화 중인 가게 (간판 글자). 열려 있으면 플레이어는 움직이지 않는다 */
  dialog: { shop: string } | null = null;
  /** 대화형 NPC 와 이야기하는 중 (열려 있으면 플레이어는 움직이지 않는다) */
  npcChat: { npc: string } | null = null;
  /** 로비에 상주하는 선임 경비 박 반장 */
  readonly senior: Fighter;
  /** 멀티플레이: 내 계정 id (오프라인이면 null) */
  netId: string | null = null;
  /** 내 아이디 (머리 위 이름표, 오프라인이면 null) */
  netName: string | null = null;
  /** 같은 마을에 접속한 친구들 */
  readonly remotes = new Map<string, RemotePlayer>();
  /** 친구에게 보낼 타격 (네트워크가 가져간다) */
  outbox: NetHit[] = [];
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
  /** 잠자는 중 (침대로 걸어감 → 눕기 → 밤이 흐름 → 일어나기). 그동안 조작 불가 */
  sleep: { phase: SleepPhase; at: number; wp: number; total: number; done: number; f0: number; h0: number; hp0: number } | null = null;
  /** 지도 클릭 자동 이동 */
  autopilot: { path: { x: number; z: number }[]; i: number; label: string } | null = null;

  private events: CombatEvent[] = [];
  private speech: Speech[] = [];
  private cityReturn = { x: 0, z: 0 };
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
    // 체력은 레벨에 따라 오르고, 도시에서 남은 체력은 프로필에 이어진다
    // 길거리에선 철권식 자동 가드가 없다: 피하거나 먼저 때려야 한다
    ensureGear(profile);
    this.player = new Fighter(0, 'ME', { ...playerStats(profile), tempo: PLAYER_TEMPO, canBlock: false });
    this.senior = new Fighter(899, 'npc', { canBlock: false });
    this.senior.reset(LOBBY.senior.x, LOBBY.senior.z, 1, 0);
    this.player.reset(this.map.home.x, this.map.home.z + 1, 0, 1);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, Math.round(profile.life.hp ?? this.player.maxHp)));
    // 날짜·시각도 이어서
    if (profile.time) {
      this.day = profile.time.day;
      this.minutes = profile.time.minutes;
    }
    this.spawnCars();
    for (let k = 0; k < 26; k++) this.npcs.push(this.makeNpc());
  }

  get clock(): string {
    const h = Math.floor(this.minutes / 60) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    this.minutes += this.sleep?.phase === 'sleep' ? this.sleepMinutes() : this.job ? this.job.minutesPerFrame : MINUTES_PER_FRAME;
    if (this.minutes >= 1440) {
      this.minutes -= 1440;
      this.day++;
    }

    // 잡혔으면 잠깐 멈췄다가 집 앞에서 다시 시작
    if (this.caughtAt !== null) {
      if (this.frame - this.caughtAt >= CAUGHT_FRAMES) this.restart();
      this.stepCars();
      return;
    }

    const p = this.player;
    // 행인에게 맞아 쓰러졌다: 잠시 뒤 집에서 깨어난다
    if (this.downedAt !== null) {
      p.snapshot();
      p.freeMove = null;
      p.feed(NEUTRAL_INPUT);
      p.tick({ opponent: p, awayX: 0, awayZ: -1 });
      if (this.location === 'city') {
        this.stepCars();
        this.stepNpcs();
      }
      if (this.frame - this.downedAt >= KO_FRAMES) this.wakeAfterKO();
      return;
    }
    p.snapshot();
    const sleeping = this.sleep !== null;
    const inp: CityInput = this.dialog || this.npcChat || this.elevatorOpen || sleeping ? { move: null, run: false, interact: false } : { ...this.input.read(this) };
    if (!sleeping && this.downedAt === null) this.stepCare(inp);
    if (sleeping) this.stepSleep(inp);
    else this.followAutopilot(inp);
    if (this.doorway) this.stepDoorway(inp);
    if (!sleeping) {
      this.stepAutoPatrol(inp);
      this.stepAutoDesk(inp);
    }
    if (this.seat) this.stepSeat(inp);
    // 자는 동안의 피로·배고픔은 sleepMinutes 가 밤 시간에 맞춰 바꾼다
    const { slow, canRun } = sleeping ? { slow: 1, canRun: true } : this.tickLife(inp.run && !!inp.move);
    // 피곤하거나 배고프면 느려지고, 한계(100)면 달릴 수 없다
    p.runSpeed = (inp.run && canRun ? RUN : WALK) * slow;
    // 공격 버튼이 눌려 있으면 이동 대신 기술 입력 (필드와 같은 규칙):
    // 방향키는 캐릭터가 보는 방향 기준 앞/뒤, Shift 는 '아래'
    const buttons = inp.buttons ?? NEUTRAL_INPUT.buttons;
    const attacking = buttons.some(Boolean);
    // 싸우는 중엔 아래 방향키'만' 누르면 숙이기 (상단 공격을 피한다).
    // ↓ 와 ← / → 를 같이 누르면 평소처럼 대각선 이동, 싸우지 않을 땐 ↓ 도 그냥 걷기
    const sideways = !!inp.move && Math.abs(inp.move.x) > 1e-6;
    this.downOnlyFrames = inp.down && !sideways ? this.downOnlyFrames + 1 : 0;
    const duck = this.downOnlyFrames >= 4 && this.inCombat;
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
    if (!frozen) this.hitRemotes();

    this.regenHp(inp);
    this.nearby = sleeping || this.doorway ? null : this.findNearby();
    if (inp.interact && !sleeping && this.job?.tryInteract()) {
      // 출입 확인 처리됨
    } else if (inp.interact && this.nearby) this.interact(this.nearby);
    if (this.toast && this.frame > this.toast.until) this.toast = null;

    if (this.location === 'city') {
      this.stepCars();
      if (!frozen) {
        this.stepNpcs();
        this.hitNpcs();
      }
    }
    if (!frozen) this.stepPolice();
    if (this.job) {
      const end = this.job.step(frozen);
      if (end) this.endJob(end);
    }
    if (this.location === 'lobby') this.stepSenior();
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

  /** HUD 안내: 근무 중 출입 확인이 먼저, 아니면 근처 장소 */
  get promptLabel(): string | null {
    return this.job?.prompt ?? this.nearby?.label ?? null;
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
    if (this.job) this.endJob('down');
    this.autopilot = null;
    this.dialog = null;
    for (const n of this.npcs) {
      if (n.fight > 0) {
        n.fight = 0;
        n.flee = 0;
        this.speech.push({ x: n.fighter.x, z: n.fighter.z, text: GLOAT[Math.floor(this.rng() * GLOAT.length)], color: '#ffb3b3' });
      }
    }
    const pvp = this.lastPvp && this.frame - this.lastPvp.frame < PVP_MEMORY ? this.lastPvp.name : null;
    this.say(pvp ? `💫 ${pvp}에게 당했다… 집에서 다시 시작해요` : '💫 정신을 잃었다…', 3.5);
  }

  /** 집 침대 옆에서 깨어난다: 체력 일부만, 지갑에서 돈이 좀 빠져 있다 */
  private wakeAfterKO() {
    this.downedAt = null;
    this.clearPolice();
    // 친구에게 쓰러졌으면 돈은 잃지 않는다
    const pvp = this.lastPvp !== null && this.frame - this.lastPvp.frame < PVP_MEMORY + KO_FRAMES;
    this.lastPvp = null;
    const lost = pvp ? 0 : Math.floor(this.profile.gold * 0.1);
    this.profile.gold -= lost;
    this.moveTo('home', HOME.bed.path[1].x, HOME.bed.path[1].z, 0, 1);
    this.player.hp = Math.round(this.player.maxHp * 0.35);
    this.npcs = this.npcs.map(() => this.makeNpc());
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
  private autoAim() {
    const p = this.player;
    if (p.moveSerial === this.aimSerial) return;
    this.aimSerial = p.moveSerial;
    if (p.state !== 'attack') return;
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
    if (!best) return;
    const dx = best.x - p.x;
    const dz = best.z - p.z;
    const len = Math.hypot(dx, dz);
    p.fx = dx / len;
    p.fz = dz / len;
  }

  /** 플레이어 공격이 행인·경찰에게 맞는지 */
  private hitNpcs() {
    const p = this.player;
    let stop = 0;
    const targets: { f: Fighter; npc: Npc | null }[] = [
      ...this.npcs.map((n) => ({ f: n.fighter, npc: n })),
      ...this.police.officers.map((f) => ({ f, npc: null })),
    ];
    for (const { f, npc } of targets) {
      // 서로 겹치지 않게 (때리려고 붙어도 밀려난다)
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = FIGHTER_RADIUS * 1.6;
      if (d < min && d > 1e-6 && f.state !== 'ko') {
        f.x += (dx / d) * (min - d);
        f.z += (dz / d) * (min - d);
      }
      const h = detectHit(p, f);
      if (!h) continue;
      const out = applyHit(h);
      this.events.push(out.event);
      stop = Math.max(stop, Math.min(out.hitstop, 5));
      if (!npc) {
        this.speech.push({ x: f.x, z: f.z, text: '공무집행방해야!', color: '#8fc7ff' });
        continue;
      }
      npc.hpShowUntil = Math.max(npc.hpShowUntil, this.frame + 240);
      npc.pause = 0;
      this.lastCombatFrame = this.frame;
      if (f.hp <= 0 && npc.koFrames < 0) this.knockOut(npc);
      else if (npc.koFrames < 0 && npc.brave) {
        // 반격: 도망 대신 덤빈다 (처음 맞았을 때만 한마디)
        if (npc.fight <= 0) this.speech.push({ x: f.x, z: f.z, text: ANGRY[Math.floor(this.rng() * ANGRY.length)], color: '#ff9d7a' });
        npc.fight = NPC_FIGHT_FRAMES;
        npc.flee = 0;
      } else if (npc.koFrames < 0) {
        npc.flee = NPC_FLEE_FRAMES;
        this.speech.push({ x: f.x, z: f.z, text: OUCH[Math.floor(this.rng() * OUCH.length)] });
        // 맞은 사람도 도망가면서 신고할 수 있다
        if (npc.reportAt < 0 && this.rng() < 0.5) npc.reportAt = this.frame + 150 + Math.floor(this.rng() * 150);
      }
      this.witness(f.x, f.z, npc);
    }
    if (stop) this.hitstop = stop;
  }

  /** 체력을 다 깎았다: 쓰러지고, 지갑의 돈(가끔 소지품)을 줍는다 */
  private knockOut(n: Npc) {
    n.koFrames = 0;
    n.flee = 0;
    n.reportAt = -1;
    const f = n.fighter;
    const pr = this.profile;
    pr.gold += n.wallet;
    let msg = `${n.name}의 지갑에서 ${n.wallet}G 를 주웠다`;
    this.speech.push({ x: f.x, z: f.z, text: `+${n.wallet} G`, color: '#ffd54a' });
    if (this.rng() < 0.35) {
      const item = ITEMS[ITEM_IDS[Math.floor(this.rng() * ITEM_IDS.length)]];
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
        if (t >= SLEEP_LIE) next('sleep');
        return;
      case 'sleep':
        if (t >= SLEEP_FRAMES) {
          const life = this.profile.life;
          life.fatigue = 0;
          life.hunger = Math.min(100, s.h0 + 15);
          saveProfile(this.profile);
          next('wake');
        }
        return;
      case 'wake':
        if (t >= SLEEP_WAKE) {
          this.sleep = null;
          this.placePlayer(HOME.bed.path[1].x, HOME.bed.path[1].z, 0, 1);
          this.say(`☀️ 푹 잤다! 피로가 풀렸다. ${this.day}일째 아침 ${this.clock}`, 3.5);
        }
        return;
    }
  }

  /** 자는 동안 이번 프레임에 흐를 시간(분). 천천히 시작해 한밤에 빨리, 아침에 다시 천천히 */
  private sleepMinutes(): number {
    const s = this.sleep!;
    const u = Math.min(1, (this.frame - s.at) / SLEEP_FRAMES);
    const e = u * u * (3 - 2 * u);
    const target = s.total * e;
    const d = target - s.done;
    s.done = target;
    const life = this.profile.life;
    life.fatigue = s.f0 * (1 - e);
    life.hunger = Math.min(100, s.h0 + 15 * e);
    // 자는 동안 체력도 가득 찬다
    const p = this.player;
    p.hp = Math.round(s.hp0 + (p.maxHp - s.hp0) * e);
    return d;
  }

  /** 렌더러·HUD 용 잠자기 연출 값. rest: 0 = 서 있음 → 1 = 누움, blanket: 이불 덮임, dark: 불 꺼짐, night: 밤 진행도 */
  get sleepView(): { phase: SleepPhase; rest: number; blanket: number; dark: number; night: number } | null {
    const s = this.sleep;
    if (!s) return null;
    const t = this.frame - s.at;
    switch (s.phase) {
      case 'walk':
        return { phase: 'walk', rest: 0, blanket: 0, dark: 0, night: 0 };
      case 'lie':
        return { phase: 'lie', rest: Math.min(1, t / SLEEP_LIE), blanket: 0, dark: Math.max(0, (t - SLEEP_LIE + 20) / 20), night: 0 };
      case 'sleep':
        return { phase: 'sleep', rest: 1, blanket: Math.min(1, t / 40), dark: 1, night: Math.min(1, t / SLEEP_FRAMES) };
      case 'wake':
        return { phase: 'wake', rest: Math.max(0, 1 - Math.max(0, t - 15) / (SLEEP_WAKE - 15)), blanket: Math.max(0, 1 - t / 15), dark: Math.max(0, 1 - t / 25), night: 1 };
    }
  }

  // ───────────────────────── 지도 자동 이동 ─────────────────────────

  /** 지도에서 누른 곳으로 걸어간다 (건물을 피해 길찾기). @returns 안내 문구 */
  navigateTo(x: number, z: number, label = '선택한 곳'): string {
    if (this.location !== 'city') return '집 밖으로 나가야 이동할 수 있어요';
    this.nav ??= new CityNav(this.map);
    const path = this.nav.findPath(this.player.x, this.player.z, x, z);
    if (!path || !path.length) return '거기로는 갈 수 없어요';
    this.autopilot = { path, i: 0, label };
    this.dialog = null;
    this.say(`🧭 ${label}(으)로 이동 중… (방향키를 누르면 취소)`, 2.5);
    return '';
  }

  /** 자동 이동: 방향키·공격키를 누르면 취소, 아니면 다음 웨이포인트로 이동 입력을 만든다 */
  private followAutopilot(inp: CityInput) {
    const ap = this.autopilot;
    if (!ap) return;
    const manual = !!inp.move || (inp.buttons ?? []).some(Boolean) || this.location !== 'city' || this.caughtAt !== null;
    if (manual) {
      this.autopilot = null;
      return;
    }
    const p = this.player;
    let wp = ap.path[ap.i];
    while (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.7) wp = ap.path[++ap.i];
    if (!wp) {
      this.autopilot = null;
      this.say(`📍 ${ap.label} 도착`, 2.5);
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

  /** 로비의 박 반장: 가까이 오면 플레이어를 보고, 아니면 현관 쪽을 본다. 강도가 들면 대화를 끊는다 */
  private stepSenior() {
    const s = this.senior;
    s.snapshot();
    const dx = this.player.x - s.x;
    const dz = this.player.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.5 && d > 1e-6) {
      s.fx = dx / d;
      s.fz = dz / d;
    } else {
      s.fx = 1;
      s.fz = 0;
    }
    if (this.npcChat && this.job?.robber) {
      this.npcChat = null;
      this.pushSpeech({ x: s.x, z: s.z, text: '강도다! 얼른 가 보게!', color: '#ff9d7a' });
    }
  }

  closeNpcChat() {
    this.npcChat = null;
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
  buyFood(itemId: string): { ok: boolean; message: string } {
    const s = this.shop;
    const item = s?.menu.find((m) => m.id === itemId);
    if (!s || !item) return { ok: false, message: '그런 메뉴는 없어요.' };
    const pr = this.profile;
    if (pr.gold < item.price) return { ok: false, message: `아이고… ${item.price - pr.gold}G 가 모자라네요.` };
    if (item.hunger > 0 && pr.life.hunger < 5 && !item.fatigue) return { ok: false, message: '배불러서 더는 못 먹겠다…' };
    pr.gold -= item.price;
    pr.life.hunger = Math.max(0, pr.life.hunger - item.hunger);
    pr.life.fatigue = Math.max(0, pr.life.fatigue - (item.fatigue ?? 0));
    saveProfile(pr);
    const effect = [item.hunger ? `배고픔 -${item.hunger}` : '', item.fatigue ? `피로도 -${item.fatigue}` : ''].filter(Boolean).join(', ');
    const thanks = s.thanks[Math.floor(this.rng() * s.thanks.length)];
    return { ok: true, message: `${item.icon} ${item.name} 냠냠 (${effect}) — "${thanks}"` };
  }

  /** 근처에서 본 사람들 중 일부가 잠시 뒤 신고한다 */
  private witness(x: number, z: number, victim: Npc) {
    this.lastCrimeFrame = this.frame;
    for (const n of this.npcs) {
      if (n === victim || n.koFrames >= 0 || n.reportAt >= 0 || n.flee > 0 || n.fight > 0) continue;
      const d = Math.hypot(n.fighter.x - x, n.fighter.z - z);
      if (d > WITNESS_RANGE) continue;
      if (n.brave && d < JOIN_RANGE && this.rng() < JOIN_CHANCE) {
        n.fight = NPC_FIGHT_FRAMES;
        n.pause = 0;
        n.hpShowUntil = this.frame + NPC_FIGHT_FRAMES;
        this.speech.push({ x: n.fighter.x, z: n.fighter.z, text: JOIN[Math.floor(this.rng() * JOIN.length)], color: '#ff9d7a' });
        continue;
      }
      if (this.rng() < 0.45) {
        n.reportAt = this.frame + 120 + Math.floor(this.rng() * 180);
        n.pause = n.reportAt - this.frame + 60; // 멈춰서 전화한다
        this.speech.push({ x: n.fighter.x, z: n.fighter.z, text: CALL[Math.floor(this.rng() * CALL.length)], color: '#c8e6ff' });
      }
    }
    this.police.scene = { x, z };
  }

  // ───────────────────────── 경찰 ─────────────────────────

  private report(n: Npc) {
    const pol = this.police;
    this.speech.push({ x: n.fighter.x, z: n.fighter.z, text: '경찰에 신고했어요!', color: '#c8e6ff' });
    if (pol.phase === 'none' || pol.phase === 'leaving') {
      this.clearPolice();
      pol.phase = 'dispatched';
      pol.dispatchAt = this.frame + DISPATCH_DELAY;
      this.say('📞 누군가 112에 신고했다!', 3);
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

  private stepPolice() {
    const pol = this.police;
    const p = this.player;
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
        const near = this.location === 'city' && Math.hypot(p.x - pol.scene.x, p.z - pol.scene.z) < POLICE_SEARCH_RADIUS;
        if (!near) {
          pol.phase = 'leaving';
          this.say('🚓 경찰이 왔지만 범인을 찾지 못했다', 3);
          break;
        }
        for (let k = 0; k < 2; k++) {
          const o = new Fighter(900 + k, 'police', { runSpeed: OFFICER_SPEED, maxHp: 99999, canBlock: false });
          o.reset(c.x + (k ? 1.2 : -1.2), c.z + 2.5, 0, 1);
          pol.officers.push(o);
        }
        pol.phase = 'chasing';
        this.say('🚨 경찰이 도착했다! 도망쳐!', 2.5);
        break;
      }
      case 'chasing': {
        pol.chaseFrames++;
        let nearest = Infinity;
        for (const o of pol.officers) {
          o.snapshot();
          const dx = p.x - o.x;
          const dz = p.z - o.z;
          const d = Math.hypot(dx, dz);
          nearest = Math.min(nearest, d);
          o.freeMove = this.location === 'city' && d > 0.5 ? { x: dx, z: dz } : null;
          o.feed(NEUTRAL_INPUT);
          o.tick({ opponent: o, awayX: 0, awayZ: -1 });
          this.collideFighter(o, 'city');
          if (this.location === 'city' && d < CATCH_RANGE && o.isActionable) {
            this.caughtAt = this.frame;
            this.say('🚔 경찰에게 잡혔습니다', 3);
            return;
          }
        }
        // 집에 숨거나, 충분히 멀어지거나, 1분이 지나면 포기
        pol.lostFrames = this.location === 'home' || nearest > LOSE_DISTANCE ? pol.lostFrames + 1 : 0;
        if (pol.lostFrames > 180 || pol.chaseFrames > 3600) {
          pol.phase = 'leaving';
          pol.officers = [];
          this.say('경찰을 따돌렸다!', 3);
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

  /** 경찰에게 잡힌 뒤: 집 앞에서 다시 시작 (행인·경찰 초기화) */
  private restart() {
    this.caughtAt = null;
    this.clearPolice();
    this.location = 'city';
    this.locationChangedAt = this.frame;
    this.placePlayer(this.map.home.x, this.map.home.z + 1, 0, 1);
    this.npcs = this.npcs.map(() => this.makeNpc());
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
      if (p.x > st.x0 && p.z < st.z1 - 1.4) this.goFloor(2, 'up');
    } else if (this.location === 'corridor' && p.x < CORRIDOR.stairs.trigger) {
      if (p.z > 0) this.goFloor(this.floor - 1, 'down');
      else if (this.floor < this.villaFloors) this.goFloor(this.floor + 1, 'up');
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
        .filter((p) => p.kind === 'shop' && SHOPS[p.label])
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
    if (this.seat && this.seat.phase !== 'stand') this.seat = { phase: 'stand', at: this.frame };
  }

  /** 앉기 연출: 0 = 서 있음, 1 = 완전히 앉음 */
  get seatAmount(): number {
    const s = this.seat;
    if (!s) return 0;
    const u = Math.min(1, (this.frame - s.at) / SIT_FRAMES);
    return s.phase === 'sit' ? u : s.phase === 'seated' ? 1 : 1 - u;
  }

  /** 앉아 있는 동안: 움직이면 일어나고, 일어나는 동안은 멈춰 있다 */
  private stepSeat(inp: CityInput) {
    const s = this.seat!;
    const t = this.frame - s.at;
    const wantsUp = !!inp.move || (inp.buttons ?? []).some(Boolean) || !!inp.jump;
    if (s.phase === 'sit' && t >= SIT_FRAMES) s.phase = 'seated';
    if ((s.phase === 'seated' || s.phase === 'sit') && wantsUp) this.standUp();
    if (this.seat?.phase === 'stand' && this.frame - this.seat.at >= SIT_FRAMES) this.seat = null;
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
        this.homeWindowOpen = !this.homeWindowOpen;
        this.say(this.homeWindowOpen ? '창문을 열었다 — 바깥바람이 시원하다' : '창문을 닫았다');
        return;
      case 'elevator':
        this.autopilot = null;
        this.elevatorOpen = true;
        return;
      case 'myDoor':
        this.moveTo('home', HOME.spawn.x + 0.8, HOME.spawn.z, 1, 0);
        this.say('집에 왔다');
        return;
      case 'senior':
        this.autopilot = null;
        this.npcChat = { npc: 'senior' };
        return;
      case 'desk':
        if (this.job) {
          if (!this.seat) this.sitAtDesk();
        } else this.jobPanelRequest = true;
        return;
      case 'exit': {
        // 현관문을 열고 나가면 그 집이 있는 층 복도, 문 바로 앞
        const owner = this.homeOwner ? this.remotes.get(this.homeOwner) : null;
        const { floor, door } = unitPlace(owner?.unit ?? this.homeUnit);
        this.floor = Math.max(2, Math.min(this.villaFloors, floor));
        this.moveTo('corridor', CORRIDOR.doors[door], -0.45, 0, 1);
        this.say(`${this.floor}층 복도`);
        return;
      }
      case 'bed': {
        // 피로가 어느 정도 쌓여야 잠이 온다 (피로도 100 = 실제 5시간)
        if (this.profile.life.fatigue < SLEEPY) {
          this.say(`😐 아직 졸리지 않다 (피로도 ${SLEEPY} 이상부터 잘 수 있어요 · 지금 ${Math.round(this.profile.life.fatigue)})`, 3);
          return;
        }
        // 다음 날 아침 7시까지 잔다: 침대 옆으로 가서 눕고, 밤이 빠르게 흘러간다
        const m = this.minutes;
        const total = m < WAKE_MINUTES ? WAKE_MINUTES - m : 1440 - m + WAKE_MINUTES;
        const life = this.profile.life;
        this.autopilot = null;
        this.sleep = { phase: 'walk', at: this.frame, wp: 0, total, done: 0, f0: life.fatigue, h0: life.hunger, hp0: this.player.hp };
        this.toast = null;
        return;
      }
      case 'calendar':
        this.calendarRequest = true;
        return;
      case 'sofa': {
        // 잠깐 쉬면 체력이 조금 찬다
        const p = this.player;
        const gain = this.frame - this.sofaAt < 600 ? 0 : Math.min(p.maxHp - p.hp, Math.round(p.maxHp * 0.15));
        if (gain > 0) this.sofaAt = this.frame;
        p.hp += gain;
        this.say(gain > 0 ? `🛋️ 소파에 앉아 잠깐 쉬었다 (체력 +${gain})` : '🛋️ 소파에 앉아 잠깐 쉬었다');
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
      this.moveTo('home', HOME.spawn.x + 0.8, HOME.spawn.z, 1, 0, r.id);
      this.say(`🏠 ${r.name}의 집 (${r.unit}호)에 놀러 왔다`);
      return;
    }
    if (poi.id.startsWith('door')) {
      const u = villaFloor(this.floor).units[Number(poi.id.slice(4))];
      const note = u ? u.notes[Math.floor(this.frame / 7) % u.notes.length] : '조용하다';
      this.say(`🚪 ${poi.label} — ${note}`, 3);
      return;
    }
    if (poi.id === 'casino') {
      this.casinoRequest = true;
      return;
    }
    // 음식점: 주인과 대화창을 연다
    if (poi.kind === 'shop' && SHOPS[poi.label]) {
      this.dialog = { shop: poi.label };
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

  // ───────────────────────── 빌라 현관 드나들기 ─────────────────────────

  /** 빌라 바깥 현관 문 앞 (건물 정면 벽에서 이만큼 앞) */
  private villaDoorZ(off: number) {
    const b = this.map.home.building;
    return b.z + b.d / 2 + off;
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

  /** @param owner 집에 들어갈 때 그 집 주인 (null = 내 집) */
  private moveTo(loc: CityLocation, x: number, z: number, fx: number, fz: number, owner: string | null = null) {
    this.doorway = null;
    this.location = loc;
    this.homeOwner = loc === 'home' ? owner : null;
    this.locationChangedAt = this.frame;
    this.placePlayer(x, z, fx, fz);
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
    const pois = this.location === 'home' ? (this.homeOwner ? HOME.pois.filter((q) => q.id === 'exit' || q.id === 'sofa') : HOME.pois) : this.location === 'lobby' ? LOBBY.pois : this.location === 'corridor' ? this.corridorPois() : this.map.pois;
    let best: Poi | null = null;
    let bestD = Infinity;
    for (const poi of pois) {
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      if (d < poi.radius && d < bestD) {
        best = poi;
        bestD = d;
      }
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
    return '서울 · 한강공원 일대';
  }

  /** 친구가 들어왔거나 정보(이름·호수)가 바뀌었다 */
  upsertRemote(id: string, name: string, unit: string) {
    let r = this.remotes.get(id);
    if (!r) {
      const f = new Fighter(this.remoteIndex++, name, { canBlock: false });
      f.reset(this.map.home.x, this.map.home.z + 1, 0, 1);
      r = { id, name, unit, fighter: f, room: '', target: null, hitLock: 0, myHitAt: -99999, level: 1 };
      this.remotes.set(id, r);
      this.say(`👋 ${name} 님이 접속했어요`, 3);
    }
    r.name = name;
    r.unit = unit;
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
    return { r: this.roomKey, x: q(p.x), z: q(p.z), y: q(p.y), fx: q(p.fx), fz: q(p.fz), s: p.state, f: p.frame, m: p.move?.id ?? null, hp: Math.round(p.hp), mh: p.maxHp, lv: this.profile.level };
  }

  /** 친구의 최신 모습을 받았다 */
  applyRemoteState(id: string, s: NetState) {
    const r = this.remotes.get(id);
    if (!r) return;
    const f = r.fighter;
    const wasUp = f.hp > 0;
    const moved = r.room !== s.r || !r.target;
    r.room = s.r;
    r.level = s.lv ?? r.level;
    r.target = { x: s.x, z: s.z, y: s.y, fx: s.fx, fz: s.fz };
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

  /** 친구 모습을 받은 위치로 부드럽게 옮기고, 받는 사이에도 동작이 이어지게 프레임을 진행한다 */
  private stepRemotes() {
    for (const r of this.remotes.values()) {
      const f = r.fighter;
      const t = r.target;
      f.snapshot();
      f.frame++;
      if (!t) continue;
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

  /** 친구에게 맞았다: 혼자 할 때와 같은 계산으로 내 체력에서 뺀다 */
  receiveRemoteHit(from: string, h: NetHit) {
    const r = this.remotes.get(from);
    const mv = MOVES[h.m];
    const p = this.player;
    if (!r || !mv || r.room !== this.roomKey) return;
    if (this.sleep || this.downedAt !== null || this.caughtAt !== null || p.hp <= 0 || p.isInvulnerable()) return;
    // 맞으면 의자에서 일어나고, 대화·자동 이동은 끊긴다
    this.seat = null;
    this.dialog = null;
    this.npcChat = null;
    this.autopilot = null;
    const att = r.fighter;
    att.x = h.x;
    att.z = h.z;
    att.fx = h.fx;
    att.fz = h.fz;
    att.power = h.power;
    att.frame = totalFrames(mv) + 1 - h.remaining;
    att.moveHits.length = 0;
    const out = applyHit({ att, def: p, mv, blocked: false, counter: h.counter });
    this.events.push(out.event);
    this.hitstop = Math.max(this.hitstop, Math.min(out.hitstop, 5));
    this.lastCombatFrame = this.frame;
    this.lastPvp = { name: r.name, frame: this.frame };
  }

  // ───────────────────────── 충돌 ─────────────────────────

  /** 건물(집 안이면 가구)과 벽에 막히게 */
  /** 실내(로비 등)의 다른 사람도 가구·벽에 막히게 */
  collideIndoor(f: Fighter, where: CityLocation) {
    this.collideFighter(f, where);
  }

  private collideFighter(p: Fighter, where: CityLocation = this.location) {
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
        : this.map.buildings.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
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
    const b = where === 'home' ? HOME.room : where === 'lobby' ? LOBBY.room : where === 'corridor' ? CORRIDOR.room : this.map.bounds;
    const onBridge = where === 'city' && Math.abs(p.x - this.map.bridgeX) < 5;
    p.x = Math.max(b.x0 + r, Math.min(b.x1 - r, p.x));
    p.z = Math.max(b.z0 + r, Math.min((onBridge ? 260 : b.z1) - r, p.z));
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

  private stepCars() {
    for (const c of this.cars) {
      c.x += c.dx * c.speed;
      c.z += c.dz * c.speed;
      const s = c.dx !== 0 ? c.x : c.z;
      const dir = c.dx !== 0 ? c.dx : c.dz;
      if (dir > 0 && s > c.to) {
        if (c.dx) c.x = c.from;
        else c.z = c.from;
      } else if (dir < 0 && s < c.from) {
        if (c.dx) c.x = c.to;
        else c.z = c.to;
      }
    }
  }

  /** 행인 한 명: 블록 둘레 인도를 따라 걷는다. 플레이어 근처(15m)에는 새로 나타나지 않는다 */
  makeNpc(): Npc {
    const { SIDEWALK } = CITY_CONST;
    const outfit = [0x2b3a55, 0x6b4f3a, 0x8a2c2c, 0x3f6b4a, 0x5a5a5a, 0xc7a14a, 0x2f2f2f, 0x7a5c99];
    const blocks = this.map.blocks;
    let x = 0;
    let z = 0;
    let path: { x: number; z: number }[] = [];
    let next = 0;
    const trail = this.map.trails[0];
    if (trail && this.rng() < 0.22) {
      path = this.rng() < 0.5 ? [...trail.path] : [...trail.path].reverse();
      const start = Math.floor(this.rng() * path.length);
      x = path[start].x;
      z = path[start].z;
      next = (start + 1) % path.length;
    }
    for (let tries = 0; tries < 20 && path.length === 0; tries++) {
      const b = blocks[Math.floor(this.rng() * blocks.length)];
      const m = SIDEWALK / 2;
      path = [
        { x: b.x0 + m, z: b.z0 + m },
        { x: b.x1 - m, z: b.z0 + m },
        { x: b.x1 - m, z: b.z1 - m },
        { x: b.x0 + m, z: b.z1 - m },
      ];
      if (this.rng() < 0.5) path = path.reverse();
      const start = Math.floor(this.rng() * 4);
      const a = path[start];
      const c = path[(start + 1) % 4];
      const u = this.rng();
      x = a.x + (c.x - a.x) * u;
      z = a.z + (c.z - a.z) * u;
      next = (start + 1) % 4;
      if (Math.hypot(x - this.player.x, z - this.player.z) > 15) break;
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
    };
  }

  /** 덤비는 행인: 플레이어에게 다가가 기술을 쓴다. 멀어지거나 집에 들어가면 그만둔다 */
  private stepFighterNpc(n: Npc) {
    const f = n.fighter;
    const p = this.player;
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    const d = Math.hypot(dx, dz);
    n.fight--;
    n.hpShowUntil = Math.max(n.hpShowUntil, this.frame + 30);
    if (this.location !== 'city' || d > 18 || this.downedAt !== null || n.fight <= 0) {
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
        // 플레이어를 보고 기술 하나
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
    // 플레이어에게 맞았나
    if (this.location === 'city' && p.hp > 0 && !this.sleep) {
      const h = detectHit(f, p);
      if (h) {
        const out = applyHit(h);
        this.events.push(out.event);
        this.hitstop = Math.max(this.hitstop, Math.min(out.hitstop, 4));
        this.lastCombatFrame = this.frame;
        this.autopilot = null;
      }
    }
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
        // 플레이어 반대쪽으로 뛰어서 도망
        n.flee--;
        f.runSpeed = NPC_FLEE_SPEED;
        move = { x: f.x - this.player.x || 1, z: f.z - this.player.z };
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
