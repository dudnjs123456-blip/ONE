import * as THREE from 'three';
import type { Building, CityMap, Sign } from '../city/cityMap';
import { CITY_CONST } from '../city/cityMap';
import { CORRIDOR, HOME, LOBBY, type CityLocation, type CityWorld } from '../city/cityWorld';
import { buildLobbyScene } from './lobbyScene';
import { glassMaterial, initGlassEnv } from './glassKit';
import { UnitWindow, coverPlate } from './unitWindows';
import { LookFx, SkyDome, toonify } from './lookFx';
import { PersonView, ROBBER_SKIN } from './personView';
import { makeKitBuilding } from './cityKit';
import { allLoaded } from './loadTracker';
import { buildSofa } from './sofaModel';
import { furnishHome, sleepDuvet } from './homeFurniture';
import { apartmentSigns, buildVillaEntrance, decorateFacade, swingDoors, type DoorControl } from './signage';
import { instanceProp } from './propsKit';
import { CarKit, type CarView } from './carKit';
import { TreeKit } from './treeKit';
import { ChatBubbles } from './chatBubbles';
import { RoomPortal } from './roomPortal';
import { unitPlace, villaFloor } from '../city/villa';
import { buildCorridorScene, type CorridorView } from './corridorScene';
import { WEEKDAYS, dateOfDay, dayOfDate, daysInMonth } from '../city/calendar';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, Nameplate, SparkSystem } from './effects';
import { bodyUrl, playerLook } from './looks';
import { wornList } from '../data/fashion';
import { HEROINE, type CharacterView } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { GroundKit, type GroundKind } from './groundKit';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';
import { FacadeKit, villaSet, type FacadeSet } from './facadeKit';
import { buildVacantShop } from './vacantShop';
import { TrafficProps } from './trafficProps';
import { animatePet, buildPet, disposePet, type PetModel } from './petKit';
import { PET_BY_ID } from '../data/pets';
import { buildStoreScene, type StoreScene } from './storeScene';
import { FishingView, buildFishDecks } from './fishingView';
import { WeatherFx } from './weatherFx';
import { weatherAt, type WeatherState } from '../city/weather';
import { tvState } from '../city/tvState';
import { ThemeParkScene } from './themeParkScene';
import { RideAudio } from './rideAudio';
import { seatPose, type SeatPose } from '../city/themePark';

// ───────────────────────── 텍스처 (캔버스로 그림) ─────────────────────────

/** 메시를 (x, y, z) 에 두고 돌려준다 (three 의 position 은 읽기 전용이라 직접 대입 불가) */
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

type WindowStyle = 'apartment' | 'office' | 'small';

/** 창문 무늬: 낮엔 유리(map), 밤엔 불 켜진 창(emissiveMap). 한 칸 = 한 층·한 세대 */
function windowTextures(style: WindowStyle, seed: number) {
  const W = 128;
  const H = 128;
  const day = canvas(W, H);
  const night = canvas(W, H);
  const cols = style === 'office' ? 4 : 2;
  const rows = style === 'office' ? 4 : 2;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  day.g.fillStyle = '#ffffff';
  day.g.fillRect(0, 0, W, H);
  night.g.fillStyle = '#000000';
  night.g.fillRect(0, 0, W, H);
  const cw = W / cols;
  const ch = H / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const pad = style === 'office' ? 2 : 7;
      const wx = x * cw + pad;
      const wy = y * ch + (style === 'apartment' ? 10 : pad);
      const ww = cw - pad * 2;
      const wh = style === 'apartment' ? ch * 0.55 : ch - pad * 2;
      day.g.fillStyle = style === 'office' ? '#6f8fa8' : '#55697d';
      day.g.fillRect(wx, wy, ww, wh);
      day.g.fillStyle = 'rgba(255,255,255,0.25)';
      day.g.fillRect(wx, wy, ww * 0.35, wh);
      if (style === 'apartment') {
        // 발코니 난간
        day.g.fillStyle = '#c9c4b8';
        day.g.fillRect(x * cw, wy + wh, cw, 6);
      }
      if (rnd() < 0.55) {
        night.g.fillStyle = rnd() < 0.7 ? '#ffd27a' : '#cfe8ff';
        night.g.fillRect(wx, wy, ww, wh);
      }
    }
  }
  return { day: day.c, night: night.c };
}

function signTexture(sign: Sign, w = 256, h = 64) {
  const { c, g } = canvas(w, h);
  g.fillStyle = sign.bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 0, w, h * 0.08);
  g.fillStyle = sign.fg;
  g.font = `800 ${Math.floor(h * 0.58)}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sign.text, w / 2, h / 2 + 2, w - 16);
  return tex(c);
}

/** 집 창밖 풍경: 시간대에 따라 하늘색·불 켜진 창을 다시 그린다 */
function drawSkyline(g: CanvasRenderingContext2D, daylight: number) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const sky = g.createLinearGradient(0, 0, 0, H);
  const top = new THREE.Color(0x0b1026).lerp(new THREE.Color(0x7fb6e6), daylight);
  const bottom = new THREE.Color(0x3a2a4a).lerp(new THREE.Color(0xd8ecff), daylight);
  sky.addColorStop(0, `#${top.getHexString()}`);
  sky.addColorStop(1, `#${bottom.getHexString()}`);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // 남산타워 실루엣
  g.fillStyle = daylight > 0.5 ? '#6b7f8f' : '#141826';
  g.beginPath();
  g.ellipse(W * 0.72, H * 0.78, W * 0.22, H * 0.18, 0, Math.PI, 0);
  g.fill();
  g.fillRect(W * 0.715, H * 0.38, 6, H * 0.25);
  g.fillRect(W * 0.7, H * 0.44, 22, 10);
  // 빌딩들
  let x = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (x < W) {
    const bw = 20 + rnd() * 40;
    const bh = H * (0.25 + rnd() * 0.45);
    g.fillStyle = daylight > 0.5 ? `hsl(210, 12%, ${55 + rnd() * 15}%)` : `hsl(230, 25%, ${8 + rnd() * 6}%)`;
    g.fillRect(x, H - bh, bw, bh);
    for (let wy = H - bh + 6; wy < H - 6; wy += 9) {
      for (let wx = x + 4; wx < x + bw - 6; wx += 8) {
        if (rnd() < (daylight > 0.5 ? 0.0 : 0.45)) {
          g.fillStyle = '#ffd98a';
          g.fillRect(wx, wy, 4, 5);
        }
      }
    }
    x += bw + 2;
  }
}

// ───────────────────────── 렌더러 ─────────────────────────

const CAM_CITY = new THREE.Vector3(0, 8.5, 10.5);
const CAM_HOME = new THREE.Vector3(0, 6.2, 7.4);
/** 낚시할 때: 뒤(북쪽)에서 어깨 너머로 강을 본다 (보는 곳은 플레이어보다 3.2m 앞) */
const FISH_CAM = new THREE.Vector3(-3.2, 4.0, -5.6);
const SKY_DAY = new THREE.Color(0x9cc9ec);

interface BuildingView {
  b: Building;
  group: THREE.Group;
  mats: (THREE.MeshStandardMaterial | THREE.MeshToonMaterial)[];
  fade: number;
}

/** 서울 라이프 렌더러: 도시 장면과 집 내부 장면 두 개를 갖고, 플레이어 위치에 따라 바꿔 그린다 */
export class CityRenderer {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  private city = new THREE.Scene();
  private home = new THREE.Scene();
  private lobby = new THREE.Scene();
  private corridor = new THREE.Scene();
  /** 가게 안 (들어간 가게가 바뀌면 storeRoot 를 새로 만든다) */
  private store = new THREE.Scene();
  private storeRoot: THREE.Group | null = null;
  private storeScn: StoreScene | null = null;
  /** 1인칭일 때만 보이는 실내 위쪽 벽·천장 (3인칭에선 카메라 쪽 벽이 낮아야 안이 보인다) */
  private fpOnly: THREE.Object3D[] = [];
  private storeFp: THREE.Object3D[] = [];
  private storeSign: string | null = null;
  private keeperView: PersonView | null = null;
  /** 펫샵 놀이터 아이들 (입고 id → 모델) */
  private penViews = new Map<string, { model: PetModel; phase: number }>();
  private storeSparks!: SparkSystem;
  private storeTexts!: FloatingTexts;
  private corridorView!: CorridorView;
  private corridorSparks!: SparkSystem;
  private corridorTexts!: FloatingTexts;
  /** 로비를 지나는 사람들 (경비 근무) */
  private lobbyViews: PersonView[] = [];
  private lobbyPlates: Nameplate[] = [];
  /** 로비에 상주하는 선임 경비 박 반장 */
  private seniorView!: PersonView;
  private seniorPlate!: Nameplate;
  private lobbySparks!: SparkSystem;
  /** 집 안 타격 이펙트 (친구와 싸울 때) */
  private homeSparks!: SparkSystem;
  private homeTexts!: FloatingTexts;
  /** 접속한 친구들의 캐릭터와 이름표 */
  /** 내 머리 위 레벨·아이디·체력바 */
  private myPlate = new Nameplate(false);
  private remoteViews = new Map<string, { view: CharacterView & { dispose?(): void; setOutfit?(ids: string[]): void }; plate: Nameplate; lift: THREE.Group; outfit?: string; url: string; fish?: FishingView }>();
  /** 친구 곁의 펫 (친구 id:펫 id) */
  private remotePetViews = new Map<string, { model: ReturnType<typeof buildPet>; species: string; phase: number }>();
  /** 내 코디 (바뀌면 다시 입힌다) */
  private outfitKey = '';
  private lobbyTexts!: FloatingTexts;
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a5a50, 1);
  private player: CharacterView & { dispose?(): void; setOutfit?(ids: string[]): void };
  /** 지금 내 캐릭터 모델 파일 (코디 창에서 남자·여자를 바꾸면 달라진다) */
  private playerUrl: string;
  /** 바꾼 몸을 불러오는 중: 다 불러오면 그때 갈아 끼운다 (바꾸는 동안 캐릭터가 사라지지 않게) */
  private nextPlayer: { view: CharacterView & { dispose?(): void; setOutfit?(ids: string[]): void; loaded?: boolean }; url: string } | null = null;
  /** 내 캐릭터를 감싸는 그룹: 계단 위에서 높이만 바꾼다 */
  private playerLift = new THREE.Group();
  private npcViews: PersonView[] = [];
  /** 행인 머리 위 이름 + 체력바 (맞았을 때만 잠깐) */
  private npcPlates: Nameplate[] = [];
  private policeCar!: THREE.Group;
  private sirens: THREE.MeshStandardMaterial[] = [];
  private officerViews: PersonView[] = [];
  private cars: THREE.Group[] = [];
  /** 진짜 차 모델 (불러와지면). 바퀴를 굴린다 */
  private carViews: (CarView | null)[] = [];
  /** 실사 자동차 (도장·유리·크롬 재질, 바퀴) */
  private carKit!: CarKit;
  /** 행복빌라 현관 양문 · 로비 안쪽 양문 */
  private villaDoor: DoorControl | null = null;
  private lobbyDoor!: DoorControl;
  /** 집 현관문 · 가게 안쪽 유리문 · 거리의 가게 문 (POI id → 문) · 반장실 문 */
  private homeDoor: THREE.Group | null = null;
  private storeDoor: DoorControl | null = null;
  private shopDoors = new Map<string, DoorControl>();
  private officeDoor: THREE.Group | null = null;
  private officeOpen = 0;
  /** 행복빌라 내 집 창: 바깥에서 실제 방이 보인다 (포털) */
  private portal: RoomPortal | null = null;
  /** 행복빌라 다른 집들의 베란다 창 (호수 → 창). 내 집 자리 창은 포털이 대신한다 */
  private unitWins = new Map<string, UnitWindow>();
  /** 창 너머 방의 밤 정도 (모든 집 창이 같이 쓴다) */
  private unitNight = { value: 0 };
  /** 창밖 내다보기 카메라 (내 집 창문 바로 앞, 바깥을 본다) */
  private lookCam = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  private _lookDir = new THREE.Vector3();
  private portalAt: { view: BuildingView; floorBase: (f: number) => number; floors: number; unit: string; ops: { x: number; y: number }[] } | null = null;
  /** 집 안 창문 미닫이 */
  private homeSash!: { setOpen(t: number): void };
  /** 창문 열린 정도 (부드럽게 따라간다) */
  private windowAmt = 0;
  private drawSize = new THREE.Vector2();
  /** 실사풍 가로수 (바람에 흔들린다) */
  private treeKit = new TreeKit();
  private chatBubbles = new ChatBubbles();
  /** 공원 분수·그네 등 매 프레임 움직이는 것 */
  private parkAnims: ((t: number) => void)[] = [];
  /** 횡단보도·펜스·신호등 */
  private traffic: TrafficProps | null = null;
  /** 내 애완동물 모델 (펫 id → 모델) */
  private petViews = new Map<string, { model: PetModel; species: string; phase: number }>();
  private buildings: BuildingView[] = [];
  private windowMats: (THREE.MeshStandardMaterial | THREE.MeshToonMaterial)[] = [];
  /** 도시 키트 건물 재질 (밤에 은은하게) */
  private kitMats: THREE.MeshToonMaterial[] = [];
  /** 나무 등 소품 재질 (밤에 자기 색으로 은은하게) */
  private propNightMats: THREE.MeshToonMaterial[] = [];
  /** 건물 정면(도로 쪽) 판단용 블록 목록 */
  private blockList: CityMap['blocks'] = [];
  /** 화면 분위기 (블룸·색감·톤 매핑) 와 그라데이션 하늘 */
  private fx!: LookFx;
  private sky = new SkyDome();
  /** 한강 놀이공원 장면 (처음 갈 때 만든다) */
  private park: ThemeParkScene | null = null;
  private rideAudio = new RideAudio();
  private _seat: SeatPose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, speed: 0 };
  private _seatM = new THREE.Matrix4();
  private parkScene() {
    return (this.park ??= new ThemeParkScene());
  }
  /** 비 · 눈 · 번개 */
  private weatherFx!: WeatherFx;
  private weather: WeatherState = weatherAt(1, 0);
  private _rainAt = new THREE.Vector3();
  private fxNight = 0;
  private fxDusk = 0;
  private nightGlow: THREE.Material[] = [];
  private lampGlow!: THREE.InstancedMesh;
  private homeLights: THREE.PointLight[] = [];
  private homeWindow!: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; light: THREE.DirectionalLight };
  private homeWindowHour = -1;
  /** 자는 동안 덮는 이불 */
  private duvet!: THREE.Mesh;
  private bedLamp!: THREE.MeshBasicMaterial;
  private sleepDark = 0;
  /** 집 벽 달력 (근무한 날에 빨간 동그라미) */
  private wallCal!: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string };

  private sparks!: SparkSystem;
  private texts!: FloatingTexts;
  /** 실사 바닥 재질 (아스팔트·보도블록·잔디·흙길) */
  private groundKit!: GroundKit;
  /** 실사 건물 재질 (빌라) */
  private facadeKit!: FacadeKit;
  private camPos = new THREE.Vector3();
  private camInit = false;
  /** 한강 낚시: 낚싯대 · 줄 · 찌 · 물고기 */
  private fishingView: FishingView | null = null;
  /** 낚시 카메라로 넘어간 정도 (0~1) */
  private fishCam = 0;
  private _hand = new THREE.Vector3();
  /** 코디 창 카메라 (부드럽게 따라가는 값). 코디 창이 닫혀 있으면 null */
  private mirrorSm: { yaw: number; pitch: number; dist: number; y: number; shift: number } | null = null;
  private shownLocation: CityLocation = 'city';
  /** 마우스 휠 줌 (작을수록 가까이) */
  zoom = 1.6;

  constructor(canvasEl: HTMLCanvasElement, world: CityWorld) {
    // alpha: 거실 TV 화면 자리만 투명하게 뚫어서 뒤에 깔린 유튜브 플레이어가 비치게 한다
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    // 고해상도 화면도 1.25배까지만 (후처리·계단 방지까지 하면 그 이상은 무겁다). 느리면 자동으로 단계를 낮춘다
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    // 그림자 지도는 두 프레임에 한 번만 다시 그린다 (해·사람이 1/60초 늦게 따라와도 눈에 안 띈다)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 그리기 횟수 통계를 한 화면(그림자 + 후처리 여러 단계) 전체로 모은다. 매 프레임 직접 초기화
    this.renderer.info.autoReset = false;
    // 유리창에 비칠 방 모습 (한 번만 만든다)
    initGlassEnv(this.renderer);

    this.groundKit = new GroundKit(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.facadeKit = new FacadeKit(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.carKit = new CarKit(this.renderer);
    this.city.fog = new THREE.Fog(SKY_DAY, 120, 650);
    this.city.background = SKY_DAY.clone();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.far = 260;
    this.city.add(this.hemi, this.sun, this.sun.target);

    this.buildCity(world);
    this.buildHome();
    this.sparks = new SparkSystem(this.city);
    this.texts = new FloatingTexts(this.city);

    this.playerUrl = bodyUrl(world.profile.body);
    this.player = createCharacter(playerLook([], world.profile.body));
    this.player.casual = true;
    this.playerLift.add(this.player.root);
    this.city.add(this.playerLift);
    this.city.add(this.myPlate.sprite);

    for (const n of world.npcs) this.addNpcView(n.fighter.index);
    this.buildPolice();
    this.lobbyDoor = buildLobbyScene(this.lobby).door;
    {
      // 반장실 문 (로비 서쪽 벽): 북쪽 끝 경첩, 반장실 쪽(-x)으로 열린다
      const o = LOBBY.office;
      const leaf = new THREE.Group();
      leaf.position.set(LOBBY.hall.x0, 0, o.doorZ1);
      leaf.rotation.y = Math.PI / 2;
      const wood = new THREE.Mesh(new THREE.BoxGeometry(o.doorZ1 - o.doorZ0 - 0.04, 2.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x7a5a3f, roughness: 0.6 }));
      wood.position.set((o.doorZ1 - o.doorZ0) / 2, 1.05, 0);
      wood.castShadow = true;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }));
      knob.position.set(o.doorZ1 - o.doorZ0 - 0.15, 1.0, 0.05);
      leaf.add(wood, knob);
      this.lobby.add(leaf);
      this.officeDoor = leaf;
    }
    this.corridorView = buildCorridorScene(this.corridor);
    // 1인칭용 남쪽 위쪽 벽 + 천장
    this.fpOnly.push(...fpShell(this.home, HOME.room, 0.5, 2.7, 0xf1ebe1));
    this.fpOnly.push(...fpShell(this.lobby, LOBBY.hall, 1.0, 2.9, 0xece6da, [[-0.45, 1.45, 2.32]], LOBBY.room));
    this.fpOnly.push(...fpShell(this.corridor, CORRIDOR.room, 0.9, 2.6, 0xe9e4da));
    this.corridorSparks = new SparkSystem(this.corridor);
    this.corridorTexts = new FloatingTexts(this.corridor);
    this.lobbySparks = new SparkSystem(this.lobby);
    this.homeSparks = new SparkSystem(this.home);
    this.homeTexts = new FloatingTexts(this.home);
    this.storeSparks = new SparkSystem(this.store);
    this.storeTexts = new FloatingTexts(this.store);
    this.store.background = new THREE.Color(0x14161c);
    this.lobbyTexts = new FloatingTexts(this.lobby);
    const lobbyColors = [0x2b3a55, 0x8a2c2c, 0x3f6b4a, 0xc7a14a, 0x7a5c99, 0x5a5a5a];
    for (const c of lobbyColors) {
      const m = new PersonView(lobbyColors.indexOf(c) * 2 + 1);
      m.root.visible = false;
      this.lobbyViews.push(m);
      this.lobby.add(m.root);
      const plate = new Nameplate(true);
      plate.sprite.visible = false;
      this.lobbyPlates.push(plate);
      this.lobby.add(plate.sprite);
    }
    // 박 반장: 남자 모델에 경비 제복 색
    this.seniorView = new PersonView(0, { tint: 0x5b6b4a });
    this.lobby.add(this.seniorView.root);
    this.seniorPlate = new Nameplate(false);
    this.lobby.add(this.seniorPlate.sprite);

    // 화풍: 애니메이션 툰 (주인공 VRM 에 맞춘다) — 모든 장면의 재질을 툰으로, 하늘은 그라데이션
    const swapped = new Map<THREE.Material, THREE.Material>();
    for (const s of [this.city, this.home, this.lobby, this.corridor]) toonify(s, swapped);
    const remap = <T extends THREE.Material>(m: T) => (swapped.get(m) as T | undefined) ?? m;
    for (const v of this.buildings) v.mats = v.mats.map(remap);
    this.windowMats = this.windowMats.map(remap);
    this.city.add(this.sky.mesh);
    // 비·눈은 툰 재질로 바꾸지 않는다 (위에서 바꾼 뒤에 붙인다)
    this.weatherFx = new WeatherFx(this.city);
    this.fx = new LookFx(this.renderer);
    // 지난번에 이 컴퓨터에서 쓰던 화질로 시작한다 (매번 최고 화질에서 한 단계씩 내려가며 버벅이지 않게)
    const saved = loadQuality();
    if (saved > 0) this.setQuality(saved);
  }

  resize(width: number, height: number) {
    this.size = { w: width, h: height };
    this.renderer.setSize(width, height, false);
    this.fx.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /**
   * 자동 화질: 프레임이 계속 느리면 한 단계씩 낮춘다.
   * 해상도(1배 밑으로)는 내리지 않는다 — 건물·글자가 뭉개져 깨져 보이기 때문.
   * 대신 계단 방지 → 해상도 1배 → 블룸 → 그림자 해상도 순으로 덜어낸다.
   */
  private quality = 0;
  private shadowTick = 0;
  private slowFrames = 0;
  private frameEma = 1 / 60;
  private size = { w: 1, h: 1 };

  private fastFrames = 0;
  /** 한 번 올렸다가 다시 느려진 단계. 그 위로는 다시 올리지 않는다 (오르락내리락 반복 방지) */
  private qualityCeiling = 0;
  private raisedTo = -1;
  /** 성능 표시용: 직전 프레임의 그리기 횟수·삼각형 수 */
  private lastCalls = 0;
  /** 거실 TV 화면 (모델 televisionModern 의 화면 안쪽 면, 집 좌표) */
  private static TV = { x: 3.5, y: 1.155, z: 0.272, w: 1.56, h: 0.85 };
  private tvPunch = new THREE.Scene();
  private tvDepth = new THREE.MeshBasicMaterial({ colorWrite: false });
  private tvCam: THREE.Camera | null = null;
  private tvClear = new THREE.Color();
  private _tvV = new THREE.Vector3();
  private lastTris = 0;

  private autoQuality(dt: number) {
    if (dt <= 0 || dt > 0.25) return;
    this.frameEma += (dt - this.frameEma) * 0.05;
    // 평균 40fps 아래가 2초쯤 이어지면 한 단계 낮춘다
    this.slowFrames = this.frameEma > 1 / 40 ? this.slowFrames + 1 : 0;
    // 잠깐 렉(로딩 등)으로 내려간 화질은, 평균 57fps 이상이 10초 이어지면 한 단계씩 되돌린다
    this.fastFrames = this.frameEma < 1 / 57 ? this.fastFrames + 1 : 0;
    if (this.slowFrames > 120 && this.quality < 5) {
      this.slowFrames = 0;
      // 방금 올린 단계에서 다시 느려졌다면 그 단계는 이 컴퓨터에 무겁다
      if (this.raisedTo === this.quality) this.qualityCeiling = this.quality + 1;
      this.raisedTo = -1;
      this.setQuality(this.quality + 1);
    } else if (this.fastFrames > 600 && this.quality > this.qualityCeiling) {
      this.fastFrames = 0;
      this.setQuality(this.quality - 1);
      this.raisedTo = this.quality;
    }
  }

  /** 화질 단계: 0 = 최고 … 5 = 가장 가벼움 (계단 방지 → 해상도 1배 → 계단 방지 끔 → 블룸 끔 → 그림자 해상도) */
  private setQuality(q: number) {
    this.quality = q;
    saveQuality(q);
    this.fx.setQuality(q <= 0 ? 0 : q <= 2 ? 1 : q === 3 ? 2 : 3);
    const ratio = q >= 2 ? 1 : Math.min(window.devicePixelRatio, 1.25);
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.resize(this.size.w, this.size.h);
    }
    const shadow = q >= 5 ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** 성능 표시기용 숫자 */
  /**
   * 로딩 화면 동안 미리 준비: 모델을 전부 받고 → 모든 장면(거리·집·로비·복도)의 셰이더를 미리 만들고
   * → 텍스처를 그래픽 카드에 올리고 → 한 번씩 그려 둔다.
   * 게임이 시작된 뒤 처음 보이는 건물·가구·사람에서 멈칫하지 않게 하고, 그 멈칫 때문에 자동 화질이 괜히 내려가지 않게.
   */
  async warmUp(onStage?: (stage: 'models' | 'shaders') => void) {
    onStage?.('models');
    await allLoaded();
    onStage?.('shaders');
    // 받은 모델에도 툰 재질 등 마무리가 끝나도록 한 틈 쉰다
    await new Promise((r) => setTimeout(r, 0));
    const scenes = [this.city, this.home, this.lobby, this.corridor];
    for (const sc of scenes) {
      await this.renderer.compileAsync(sc, this.camera);
      sc.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        if (!mats) return;
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture && v.image) this.renderer.initTexture(v);
        }
      });
    }
    // 그림자·후처리까지 한 번씩 실제로 그려 둔다 (첫 장면 전환 때 멈칫 방지)
    for (const sc of scenes) {
      this.renderer.shadowMap.needsUpdate = true;
      this.fx.render(sc, this.camera, 0, 0, sc !== this.city);
    }
    // 창 너머 방 (잘라 내기 켠 집 장면) 도 한 번
    if (this.portal) {
      this.portal.place();
      this.camera.updateMatrixWorld();
      this.renderer.getDrawingBufferSize(this.drawSize);
      this.portal.render(this.renderer, this.camera, this.home, this.drawSize, true, true);
    }
    // 로딩 중 느렸던 프레임은 화질 판단에서 뺀다
    this.frameEma = 1 / 60;
    this.slowFrames = 0;
    this.shadowTick = 0;
    this.camInit = false;
  }

  /**
   * 후처리 뒤 마무리: 화면 전체를 불투명하게 하고, TV 를 켰으면 TV 화면 중 앞에 가린 것이 없는 곳만 투명하게 뚫는다.
   * (집 장면을 깊이만 한 번 더 그린 뒤 화면 판을 깊이 비교해서 그리므로 사람·가구가 TV 앞을 지나가면 그대로 가린다)
   */
  private drawTvHole(on: boolean, cam: THREE.Camera) {
    const r = this.renderer;
    const gl = r.getContext();
    r.setRenderTarget(null);
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(this.tvClear);
    r.setClearColor(0x000000, 1);
    gl.colorMask(false, false, false, true);
    r.clear(true, false, false);
    gl.colorMask(true, true, true, true);
    r.setClearColor(this.tvClear, prevAlpha);
    this.tvCam = on ? cam : null;
    if (!on) return;
    if (this.tvPunch.children.length === 0) {
      const T = CityRenderer.TV;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(T.w, T.h),
        new THREE.ShaderMaterial({
          vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
          blending: THREE.NoBlending,
          toneMapped: false,
        }),
      );
      m.position.set(T.x, T.y, T.z);
      this.tvPunch.add(m);
    }
    const auto = r.autoClear;
    const shadows = r.shadowMap.enabled;
    r.autoClear = false;
    r.shadowMap.enabled = false;
    r.clearDepth();
    // 배경색이 있으면 three 가 화면을 지우므로 잠깐 뗀다
    const bg = this.home.background;
    this.home.background = null;
    this.home.overrideMaterial = this.tvDepth;
    r.render(this.home, cam);
    this.home.overrideMaterial = null;
    this.home.background = bg;
    r.render(this.tvPunch, cam);
    r.autoClear = auto;
    r.shadowMap.enabled = shadows;
  }

  /** TV 화면 네 모서리의 화면 좌표 (CSS 픽셀, 왼위·오위·오아래·왼아래). TV 가 꺼져 있거나 카메라 뒤면 null */
  tvCorners(): [number, number][] | null {
    const cam = this.tvCam;
    if (!cam) return null;
    const T = CityRenderer.TV;
    const el = this.renderer.domElement;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const out: [number, number][] = [];
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const v = this._tvV.set(T.x + (sx * T.w) / 2, T.y + (sy * T.h) / 2, T.z).applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -0.05) return null;
      v.applyMatrix4(cam.projectionMatrix);
      out.push([((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]);
    }
    return out;
  }

  stats() {
    const info = this.renderer.info;
    return {
      fps: 1 / Math.max(1e-3, this.frameEma),
      calls: this.lastCalls,
      tris: this.lastTris,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      quality: this.quality,
    };
  }

  sync(world: CityWorld, clock: FrameClock) {
    this.autoQuality(clock.dt);
    const loc = world.location;
    // 창밖을 내다보는 동안엔 집 대신 바깥 도시를 그린다
    const look = loc === 'home' && world.lookingOut && !!this.portal;
    const view: CityLocation = look ? 'city' : loc;
    let eye = { x: world.player.x, z: world.player.z };
    if (look) {
      this.placePortal(world);
      const w = this.portal!.group.localToWorld(new THREE.Vector3(0, 0, 0.35));
      eye = { x: w.x, z: w.z };
    }
    if (loc !== this.shownLocation) {
      this.sceneOf(loc).add(this.playerLift);
      this.sceneOf(loc).add(this.myPlate.sprite);
      // 로비·복도 사람 모델은 지금 보고 있는 실내 장면으로 옮긴다
      if (loc === 'lobby' || loc === 'corridor') {
        const sc = this.sceneOf(loc);
        for (const v of this.lobbyViews) sc.add(v.root);
        for (const p of this.lobbyPlates) sc.add(p.sprite);
      }
      // 놀이공원도 바깥이라 도시의 해·하늘빛·하늘을 같이 쓴다 (한 번에 한 장면에만 붙일 수 있어 옮긴다)
      const outdoor = loc === 'park' ? this.parkScene().scene : this.city;
      if (this.hemi.parent !== outdoor) outdoor.add(this.hemi, this.sun, this.sun.target, this.sky.mesh);
      this.shownLocation = loc;
      this.camInit = false;
      // 장소가 바뀐 첫 프레임엔 그림자도 바로 새로
      this.shadowTick = 0;
    }
    this.syncBody(world);
    const sv = world.sleepView;
    const seat = world.seatAmount;
    this.player.rest =
      sv && sv.rest > 0
        ? { t: sv.rest, sit: HOME.bed.sit, lie: HOME.bed.lie }
        : seat > 0 && world.seat?.spot === 'sofa' && world.boothSpots(world.seatBooth)
          ? { t: seat, ...world.boothSpots(world.seatBooth)!, lie: HOME.sofa.lie, seatY: 0.47, sofa: world.sofaView }
        : seat > 0 && world.seat?.spot === 'sofa'
          ? { t: seat, sit: HOME.sofa.sit, lie: HOME.sofa.lie, seatY: 0.52, sofa: world.sofaView }
          : seat > 0
          ? { t: 0.35 * seat, sit: LOBBY.chair, lie: HOME.bed.lie, seatY: 0.52, sitLeg: 1.45, ...this.deskAttention(world) }
          : null;
    {
      const holder = this.player as CharacterView & { hold?: { pitch: number } | null };
      if ('hold' in holder) holder.hold = world.fishing && world.location === 'city' ? { pitch: this.fishingView?.armPitch ?? 0.5 } : null;
    }
    this.player.update(world.player, clock);
    if (world.fishing || this.fishingView?.group.visible) {
      this.fishingView ??= new FishingView(this.city);
      const h = this.player as CharacterView & { handWorld?(out: THREE.Vector3): boolean };
      this.fishingView.update(world.fishScene(), clock, h.handWorld?.(this._hand) ? this._hand : null);
    }
    // 1인칭: 내 몸은 감추고 눈높이 카메라로 (창밖 보기·잠자기 중엔 그쪽 카메라)
    const riding = loc === 'park' && !!world.ride;
    const fp = riding || (world.firstPerson && !look && !world.mirror && !(sv && sv.rest > 0) && world.seat?.spot !== 'sofa');
    this.playerLift.visible = !fp;
    // 채팅 말풍선: 지금 장면에 붙이고, 말한 사람 머리 위를 따라간다 (같은 곳에 있는 친구만)
    const nowMs = performance.now();
    for (const c of world.chatBubbles.splice(0)) if (c.emote) this.chatBubbles.addEmote(c.who, c.text, nowMs);
      else this.chatBubbles.add(c.who, c.name, c.text, nowMs);
    const chatScene = this.sceneOf(view);
    if (this.chatBubbles.layer.parent !== chatScene) chatScene.add(this.chatBubbles.layer);
    this.chatBubbles.update(nowMs, (who) => {
      if (who === 'me') return fp || look ? null : world.player;
      const r = world.remotes.get(who);
      return r && r.room === world.roomKey ? r.fighter : null;
    });
    const worn = world.outfitPreview ?? wornList(world.profile.wardrobe);
    if (worn.join(',') !== this.outfitKey) {
      this.outfitKey = worn.join(',');
      this.player.setOutfit?.(worn);
    }
    for (const m of this.fpOnly) m.visible = fp;
    for (const m of this.storeFp) m.visible = fp;
    {
      // 자는 동안·의자에 앉아 있는 동안은 감춘다
      const p = world.player;
      const lp = p.lerped(clock.alpha);
      const down = world.downedAt !== null;
      this.myPlate.sprite.visible = !(sv && sv.rest > 0) && seat <= 0 && !fp && !world.mirror && !world.fishing;
      this.myPlate.draw(`Lv.${world.profile.level} ${world.netName ?? '나'}${down ? ' (기절)' : ''}`, Math.max(0, p.hp), p.maxHp);
      const lift = world.stairLift(lp.x, lp.z);
      this.playerLift.position.y = lift;
      this.myPlate.sprite.position.set(lp.x, lift + lp.y + (down ? 0.9 : 2.1), lp.z);
    }
    {
      // 이불: 내가 자거나, 같은 집(친구 집)에서 친구가 자고 있으면
      let rb = 0;
      for (const r of world.remotes.values()) if (r.room === world.roomKey && r.sleep) rb = Math.max(rb, r.sleep.blanket);
      this.syncSleep(sv, clock.dt, rb);
    }

    if (view === 'city') {
      // 행인 수·사람이 바뀌었으면 (친구 컴퓨터가 계산한 동네) 모델도 맞춘다
      while (this.npcViews.length < world.npcs.length) this.addNpcView(world.npcs[this.npcViews.length].fighter.index);
      for (let i = world.npcs.length; i < this.npcViews.length; i++) {
        this.npcViews[i].root.visible = false;
        this.npcPlates[i].sprite.visible = false;
      }
      world.npcs.forEach((n, i) => {
        if (this.npcViews[i].variant !== n.fighter.index) this.setNpcView(i, n.fighter.index);
        // 멀리 있는 행인은 자세 계산을 줄이고, 아주 멀면 아예 감춘다 (어차피 화면 밖)
        const view = this.npcViews[i];
        const d = Math.hypot(n.fighter.x - eye.x, n.fighter.z - eye.z);
        view.root.visible = d < 70;
        view.setDistance(d);
        if (view.root.visible) view.update(n.fighter, clock, d > 25);
        // 맞은 직후·쓰러진 동안만 이름과 체력바
        const plate = this.npcPlates[i];
        plate.sprite.visible = world.frame < n.hpShowUntil || n.koFrames >= 0;
        if (plate.sprite.visible) {
          const lp = n.fighter.lerped(clock.alpha);
          plate.draw(n.koFrames >= 0 ? `${n.name} (기절)` : n.fight > 0 ? `😠 ${n.name}` : n.name, Math.max(0, n.fighter.hp), n.fighter.maxHp);
          plate.sprite.position.set(lp.x, lp.y + (n.koFrames >= 0 ? 0.9 : 2.1), lp.z);
        }
      });
      this.syncPolice(world, clock);
      world.cars.forEach((c, i) => {
        const g = this.cars[i];
        g.position.set(c.x, 0, c.z);
        g.rotation.y = Math.atan2(c.dx, c.dz);
        // 바퀴: 지나온 거리 / 반지름 만큼 돈다 (가까운 차만)
        const v = this.carViews[i];
        if (v && Math.abs(c.x - eye.x) + Math.abs(c.z - eye.z) < 60) {
          const a = (c.dx * c.x + c.dz * c.z) / v.wheelRadius;
          for (const w of v.wheels) w.rotation.x = a;
        }
      });
      this.weather = world.weather;
      this.updateDayNight(world.daylight, world.minutes);
      for (const e of world.drainEvents()) {
        this.sparks.spawn(e);
        if (e.damage > 0) this.texts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, e.kind === 'counter' ? '#ffb020' : '#ffffff');
      }
      for (const s of world.drainSpeech()) this.texts.spawn(s.text, s.x, 2.4, s.z, s.color ?? '#ffe08a', 1.1);
    }
    this.syncSenior(world, clock, loc);
    if (loc === 'lobby') {
      this.syncPeople(world, clock, 1, this.lobbySparks, this.lobbyTexts);
    } else if (loc === 'corridor') {
      {
        // 이 층에 우리 집·친구 집이 있으면 문 명패에 표시
        const f = world.floor;
        const owners = [0, 1, 2].map((i) => {
          const unit = `${f}0${i + 1}`;
          if (unit === world.homeUnit) return `${world.netName ?? '나'} (내 집)`;
          const r = [...world.remotes.values()].find((q) => q.unit === unit);
          return r ? `${r.name}의 집` : null;
        });
        this.corridorView.setFloor({ floor: f, top: world.villaFloors, info: world.floorInfo, owners });
      }
      const left = world.job?.patrol?.get(world.floor) ?? new Set<string>();
      this.corridorView.setPending(left, clock.t);
      this.syncPeople(world, clock, world.floor, this.corridorSparks, this.corridorTexts);
    } else if (loc === 'store') {
      this.syncStore(world, clock);
    } else if (loc === 'home' && view !== 'city') {
      this.updateHomeLight(world.daylight, world.minutes);
      this.updateWallCalendar(world);
      for (const e of world.drainEvents()) {
        this.homeSparks.spawn(e);
        if (e.damage > 0) this.homeTexts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, e.kind === 'counter' ? '#ffb020' : '#ffffff');
      }
      for (const s of world.drainSpeech()) this.homeTexts.spawn(s.text, s.x, 2.4, s.z, s.color ?? '#ffe08a', 1.1);
    }
    this.syncRemotes(world, clock);
    this.syncPets(world, clock, loc);

    this.sparks.update(clock.dt);
    this.texts.update(clock.dt);
    this.lobbySparks.update(clock.dt);
    this.homeSparks.update(clock.dt);
    this.homeTexts.update(clock.dt);
    this.lobbyTexts.update(clock.dt);
    this.corridorSparks.update(clock.dt);
    this.corridorTexts.update(clock.dt);
    this.storeSparks.update(clock.dt);
    this.storeTexts.update(clock.dt);
    this.updateCamera(world, clock);
    this.updateMirrorCam(world, clock, look);
    if (view === 'park') {
      const ps = this.parkScene();
      ps.scene.background = this.city.background;
      ps.scene.fog = this.city.fog;
      ps.update(world.parkClock(), this.fxNight);
    }
    const ridePose = riding ? seatPose(world.ride!.id, world.ride!.seat, world.parkClock(), this._seat) : null;
    this.rideAudio.update(riding ? world.ride!.id : null, ridePose, performance.now() / 1000);
    if (look) this.updateLookCam(world);
    else if (ridePose) this.updateRideCam(world, ridePose, clock);
    else if (fp) this.updateFpCam(world, clock);
    const cam = look || fp ? this.lookCam : this.camera;
    if (loc === 'city') this.fadeOccluders(world, clock.dt, fp);
    if (view === 'city') {
      this.treeKit.update(clock.t);
      for (const a of this.parkAnims) a(clock.t);
      this.traffic?.update(world.signalSeconds);
    }
    this.sky.follow(cam);
    if (view === 'city') {
      // 비·눈 상자는 카메라와 플레이어 사이에 둔다 (위에서 내려다봐도 발밑까지 내린다)
      const pp = world.player.lerped(clock.alpha);
      this._rainAt.set((cam.position.x + pp.x) / 2, 0, (cam.position.z + pp.z) / 2);
      this.weatherFx.update(this.weather, this._rainAt, clock.dt, this.fxNight);
    }
    this.renderer.shadowMap.needsUpdate = this.shadowTick++ % 2 === 0;
    this.syncPortal(world, clock.dt);
    // 현관 문 · 장소가 바뀔 때 화면 암전
    this.villaDoor?.setOpen(world.villaDoorOpen);
    this.lobbyDoor.setOpen(world.lobbyDoorOpen);
    this.syncDoors(world, clock.dt);
    this.fx.fade = world.screenFade;
    this.renderer.info.reset();
    const outside = view === 'city' || view === 'park';
    this.fx.render(this.sceneOf(view), cam, outside ? this.fxNight : 0, outside ? this.fxDusk : 0, !outside);
    this.drawTvHole(view === 'home' && !!tvState.now, cam);
    this.lastCalls = this.renderer.info.render.calls;
    this.lastTris = this.renderer.info.render.triangles;
  }

  /** 애완동물: 지금 장소에 보이는 아이들만 그 장면에 붙여서 움직인다 */
  private syncPets(world: CityWorld, clock: FrameClock, loc: CityLocation) {
    const scene = this.sceneOf(loc);
    const seen = new Set<string>();
    for (const ps of world.pets.poses) {
      let v = this.petViews.get(ps.pet.id);
      if (v && v.species !== ps.pet.species) {
        disposePet(v.model);
        v = undefined;
      }
      if (!v) {
        const sp = PET_BY_ID[ps.pet.species];
        if (!sp) continue;
        v = { model: buildPet(sp), species: sp.id, phase: Math.random() * 6 };
        this.petViews.set(ps.pet.id, v);
      }
      const root = v.model.root;
      if (root.parent !== scene) scene.add(root);
      root.visible = true;
      root.position.set(ps.x, ps.y + world.stairLift(ps.x, ps.z), ps.z);
      root.rotation.y = ps.yaw;
      animatePet(v.model, clock.t, ps.moving, v.phase, ps.pet.joy / 100);
      seen.add(ps.pet.id);
    }
    for (const [id, v] of this.petViews) {
      if (seen.has(id)) continue;
      // 입양 보낸 아이는 치우고, 집에 두고 나온 아이는 감춘다
      if (!world.pets.list.some((p) => p.id === id)) {
        disposePet(v.model);
        this.petViews.delete(id);
      } else v.model.root.visible = false;
    }
  }

  /** 데스크에 앉아 있을 때: 다가오는 사람이 있으면 그쪽을 보고, 없으면 휴대폰을 본다 */
  private deskAttention(world: CityWorld): { phone: number; look: { x: number; z: number } | null } {
    const job = world.job;
    if (!job || job.robber) return { phone: 0, look: null };
    const p = world.player;
    let look: { x: number; z: number } | null = null;
    let best = 5;
    for (const v of job.people) {
      if (v.where !== 1 || v.kind !== 'visitor' || v.koFrames >= 0 || v.reaction) continue;
      if (v.phase !== 'toCheck' && v.phase !== 'wait') continue;
      const d = Math.hypot(v.f.x - p.x, v.f.z - p.z);
      if (d < best) {
        best = d;
        look = { x: v.f.x, z: v.f.z };
      }
    }
    return { phone: look ? 0 : 1, look };
  }

  /** 코디 창에서 몸(남자·여자)을 바꿨으면 새 모델을 불러와서, 다 불러온 뒤 갈아 끼운다 */
  private syncBody(world: CityWorld) {
    const want = bodyUrl(world.profile.body);
    if (this.nextPlayer && this.nextPlayer.url !== want) {
      this.nextPlayer.view.dispose?.();
      this.nextPlayer = null;
    }
    if (want === this.playerUrl) return;
    if (!this.nextPlayer) {
      const view = createCharacter(playerLook([], world.profile.body));
      view.casual = true;
      this.nextPlayer = { view, url: want };
    }
    if (!this.nextPlayer.view.loaded) return;
    this.playerLift.remove(this.player.root);
    this.player.dispose?.();
    this.player = this.nextPlayer.view;
    this.playerUrl = want;
    this.nextPlayer = null;
    this.playerLift.add(this.player.root);
    this.outfitKey = ''; // 새 몸에 코디를 다시 입힌다
  }

  /** 친구 캐릭터: 같은 곳에 있는 친구만 보인다. 나간 친구는 치운다 */
  private syncRemotes(world: CityWorld, clock: FrameClock) {
    const room = world.roomKey;
    const sc = this.sceneOf(world.location);
    for (const r of world.remotes.values()) {
      let v = this.remoteViews.get(r.id);
      const url = bodyUrl(r.body);
      // 친구가 몸(캐릭터)을 바꿨으면 새로 만든다. 색조는 입히지 않는다 (흰 머리·옷이 물들어 이상해 보여서, 구별은 이름표로)
      if (v && v.url !== url) {
        v.lift.remove(v.view.root);
        v.view.dispose?.();
        const view = createCharacter({ kind: 'vrm', url, fallback: HEROINE.azure });
        view.casual = true;
        v.lift.add(view.root);
        Object.assign(v, { view, url, outfit: undefined });
      }
      if (!v) {
        const view = createCharacter({ kind: 'vrm', url, fallback: HEROINE.azure });
        view.casual = true;
        const lift = new THREE.Group();
        lift.add(view.root);
        v = { view, plate: new Nameplate(false), lift, url };
        this.remoteViews.set(r.id, v);
      }
      if (v.lift.parent !== sc) sc.add(v.lift);
      if (v.plate.sprite.parent !== sc) sc.add(v.plate.sprite);
      const show = r.room === room;
      v.view.root.visible = show;
      v.plate.sprite.visible = show;
      const fishScene = show ? world.remoteFishScene(r) : null;
      if (!show) {
        if (v.fish?.group.visible) v.fish.update(null, clock, null);
        continue;
      }
      const ok = (r.outfit ?? []).join(',');
      if (v.outfit !== ok) {
        v.outfit = ok;
        v.view.setOutfit?.(r.outfit ?? []);
      }
      const f = r.fighter;
      // 친구가 경비 데스크에 앉아 있거나 소파에 누워 있으면 그 자세로
      const sv = world.remoteSeatView(r);
      v.view.rest = r.sleep
        ? { t: r.sleep.rest, sit: HOME.bed.sit, lie: HOME.bed.lie }
        : !sv
        ? null
        : sv.spot === 'sofa' && world.store?.kind === 'karaoke' && world.boothSpots(r.booth)
          ? { t: sv.amt, ...world.boothSpots(r.booth)!, lie: HOME.sofa.lie, seatY: 0.47, sofa: sv.sofa }
        : sv.spot === 'sofa'
          ? { t: sv.amt, sit: HOME.sofa.sit, lie: HOME.sofa.lie, seatY: 0.52, sofa: sv.sofa }
          : { t: 0.35 * sv.amt, sit: LOBBY.chair, lie: HOME.bed.lie, seatY: 0.52, sitLeg: 1.45, phone: 1, look: null };
      // 낚시: 낚싯대를 든 자세 + 낚싯대·줄·찌·물고기 (내 낚시와 같은 그림)
      const holder = v.view as CharacterView & { hold?: { pitch: number } | null; handWorld?(out: THREE.Vector3): boolean };
      if ('hold' in holder) holder.hold = fishScene ? { pitch: v.fish?.armPitch ?? 0.5 } : null;
      const rd = world.location === 'park' ? r.ride : null;
      if (rd) v.view.rest = { t: 0.35, sit: { x: 0, z: 0, yaw: 0 }, lie: HOME.bed.lie, seatY: 0.45, sitLeg: 1.45 };
      v.view.update(f, clock);
      if (fishScene || v.fish?.group.visible) {
        v.fish ??= new FishingView(this.city);
        v.fish.update(fishScene, clock, holder.handWorld?.(this._hand) ? this._hand : null);
      }
      const lp = f.lerped(clock.alpha);
      if (rd) {
        // 좌석 자세 그대로 (기울기·뒤집힘 포함)
        const pose = seatPose(rd.id, rd.seat, world.parkClock(), this._seat);
        this.parkScene().seatMatrix(pose, this._seatM).decompose(v.lift.position, v.lift.quaternion, v.lift.scale);
        v.plate.sprite.visible = false;
        continue;
      }
      v.lift.position.set(0, world.stairLift(lp.x, lp.z), 0);
      v.lift.quaternion.identity();
      // 자는 동안은 이름표를 감춘다 (내 이름표와 같이)
      if (r.sleep && r.sleep.rest > 0) v.plate.sprite.visible = false;
      const down = f.hp <= 0;
      v.plate.draw(`Lv.${r.level} ${r.name}${down ? ' (기절)' : ''}`, Math.max(0, f.hp), f.maxHp);
      v.plate.sprite.position.set(lp.x, v.lift.position.y + lp.y + (down ? 0.9 : 2.1), lp.z);
    }
    for (const [id, v] of this.remoteViews) {
      if (world.remotes.has(id)) continue;
      v.lift.removeFromParent();
      v.view.dispose?.();
      v.plate.sprite.removeFromParent();
      v.plate.dispose();
      v.fish?.dispose();
      this.remoteViews.delete(id);
    }
    this.syncRemotePets(world, clock);
  }

  /** 친구 곁의 펫: 친구 화면에 보이는 그대로 (같은 곳에 있을 때만) */
  private syncRemotePets(world: CityWorld, clock: FrameClock) {
    const room = world.roomKey;
    const sc = this.sceneOf(world.location);
    const seen = new Set<string>();
    for (const r of world.remotes.values()) {
      if (r.room !== room) continue;
      for (const p of r.pets) {
        const key = `${r.id}:${p.i}`;
        let v = this.remotePetViews.get(key);
        if (v && v.species !== p.sp) {
          disposePet(v.model);
          this.remotePetViews.delete(key);
          v = undefined;
        }
        if (!v) {
          const sp = PET_BY_ID[p.sp];
          if (!sp) continue;
          v = { model: buildPet(sp), species: sp.id, phase: Math.random() * 6 };
          this.remotePetViews.set(key, v);
        }
        const root = v.model.root;
        if (root.parent !== sc) sc.add(root);
        root.visible = true;
        root.position.set(p.x, p.y + world.stairLift(p.x, p.z), p.z);
        root.rotation.y = p.yaw;
        animatePet(v.model, clock.t, p.mv, v.phase, p.j / 100);
        seen.add(key);
      }
    }
    for (const [key, v] of this.remotePetViews) {
      if (seen.has(key)) continue;
      disposePet(v.model);
      this.remotePetViews.delete(key);
    }
  }

  /** 박 반장: 나와 같은 곳(로비·이 층 복도)에 있을 때만 그 장면에 그린다 */
  private syncSenior(world: CityWorld, clock: FrameClock, loc: CityLocation) {
    const ai = world.seniorAI;
    const show = (loc === 'lobby' || loc === 'corridor') && ai.visibleTo();
    this.seniorView.root.visible = show;
    this.seniorPlate.sprite.visible = show;
    if (!show) return;
    const sc = this.sceneOf(loc);
    if (this.seniorView.root.parent !== sc) {
      sc.add(this.seniorView.root);
      sc.add(this.seniorPlate.sprite);
    }
    this.seniorView.sit = ai.sit;
    // 책상 일 (커피 · 컴퓨터 · 휴대폰) + 들어온 나를 쳐다보기
    this.seniorView.desk = ai.seated ? { kind: ai.activity, t: ai.activityTime, glance: ai.glance, lookX: world.player.x, lookZ: world.player.z } : null;
    this.seniorView.update(world.senior, clock);
    const sp = world.senior.lerped(clock.alpha);
    const label = world.npcChat?.npc === 'senior' ? '💬 박 반장' : ai.patrolling ? '🔦 박 반장 (순찰 중)' : '👴 박 반장';
    this.seniorPlate.draw(label, 1, 1);
    this.seniorPlate.sprite.position.set(sp.x, sp.y + (ai.sit > 0.5 ? 1.7 : 2.05), sp.z);
  }

  private sceneOf(loc: CityLocation) {
    return loc === 'home' ? this.home : loc === 'lobby' ? this.lobby : loc === 'corridor' ? this.corridor : loc === 'store' ? this.store : loc === 'park' ? this.parkScene().scene : this.city;
  }

  /** 거리의 가게 문: 먹거리 가게 · 펫샵 앞면에 유리 양문 (들어갈 때·나올 때 열린다) */
  private buildShopDoors(m: CityMap) {
    const frame = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.3, metalness: 0.7 });
    const handle = new THREE.MeshStandardMaterial({ color: 0xd3d6db, roughness: 0.2, metalness: 1 });
    const glass = glassMaterial();
    for (const poi of m.pois) {
      if (poi.kind !== 'shop') continue;
      // 펫샵·옷가게는 기둥 안쪽으로 들어간 유리면에 문이 있다
      const inset = poi.id === 'petshop' || poi.id === 'clothesshop' || poi.id === 'fishingshop' || poi.id === 'karaoke';
      // 2층 가게가 있는 펫샵 건물은 1층 점포 칸이 좁아 문도 좁다 (오른쪽 끝은 노래방 계단 문)
      const narrow = poi.id === 'karaoke' || (poi.id === 'petshop' && m.pois.some((q) => q.id === 'karaoke'));
      // 북쪽을 보는 가게는 문이 POI 의 남쪽에 있고 문짝도 북쪽을 본다 (문 묶음을 180° 돌린다)
      const north = poi.facing === -1;
      const z = north ? poi.z + 1.2 - 0.08 : poi.z - 1.2 + (inset ? -0.35 : 0.08);
      const w = poi.id === 'karaoke' ? 0.8 : narrow ? 0.9 : inset ? 1.36 : 1.5;
      const g = new THREE.Group();
      g.position.set(poi.x, 0, z);
      if (north) g.rotation.y = Math.PI;
      this.city.add(g);
      if (!inset) {
        const fr = (bw: number, bh: number, x: number, y: number) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), frame);
          b.position.set(x, y, -0.02);
          g.add(b);
        };
        fr(0.08, 2.3, -w / 2 - 0.04, 1.15);
        fr(0.08, 2.3, w / 2 + 0.04, 1.15);
        fr(w + 0.16, 0.1, 0, 2.3);
        const dark = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.25), new THREE.MeshBasicMaterial({ color: 0x1a1612 }));
        dark.position.set(0, 1.125, -0.04);
        g.add(dark);
      }
      this.shopDoors.set(poi.id, swingDoors(g, 0, 0, w, 2.25, frame, glass, handle));
    }
  }

  /** 문들: 지나갈 때 열렸다 닫힌다. 반장실 문은 누가 가까이 오면 저절로 */
  private syncDoors(world: CityWorld, dt: number) {
    const ease = (t: number) => t * t * (3 - 2 * t);
    if (this.homeDoor) this.homeDoor.rotation.y = Math.PI / 2 - 1.4 * ease(world.doorOpen('home'));
    for (let i = 0; i < 3; i++) this.corridorView.setDoor(i, world.doorOpen(`unit:${i}`));
    this.storeDoor?.setOpen(world.doorOpen('storeIn'));
    for (const [id, d] of this.shopDoors) d.setOpen(world.doorOpen(`shop:${id}`));
    if (this.officeDoor) {
      const o = LOBBY.office;
      const near = (x: number, z: number) => Math.hypot(x - LOBBY.hall.x0, z - o.doorZ) < 1.4;
      const want = world.location === 'lobby' && (near(world.player.x, world.player.z) || (world.seniorAI.visibleTo() && near(world.senior.x, world.senior.z))) ? 1 : 0;
      this.officeOpen += (want - this.officeOpen) * Math.min(1, dt * 6);
      this.officeDoor.rotation.y = Math.PI / 2 + 1.45 * ease(this.officeOpen);
    }
  }

  /** 가게 안: 처음 들어간 가게면 장면을 새로 짓고, 주인·놀이터 아이들을 움직인다 */
  private syncStore(world: CityWorld, clock: FrameClock) {
    const L = world.store;
    if (!L) return;
    // 펫샵은 날마다 아이들이 바뀌니 날짜도 같이 본다
    const key = L.kind === 'pet' ? `${L.sign}|${world.day}` : L.sign;
    if (this.storeSign !== key) {
      if (this.storeRoot) disposeObject(this.storeRoot);
      this.storeRoot?.removeFromParent();
      for (const v of this.penViews.values()) disposePet(v.model);
      this.penViews.clear();
      this.storeScn = buildStoreScene(L, world.pen?.animals.map((a) => a.stock) ?? []);
      this.storeRoot = this.storeScn.group;
      this.storeFp = fpShell(this.storeRoot, L.room, 1.0, 3.0, L.theme.wall, [[-0.78, 0.78, 2.34]]);
      this.storeDoor = this.storeScn.door;
      this.store.add(this.storeRoot);
      this.storeSign = key;
      if (!this.keeperView) {
        this.keeperView = new PersonView(5, { tint: 0xf0f0f0 });
        this.store.add(this.keeperView.root);
      }
    }
    if (this.keeperView) this.keeperView.root.visible = L.kind !== 'stairs';
    this.keeperView?.update(world.keeper, clock);
    for (const [no, d] of this.storeScn?.booths ?? []) d.setOpen(world.boothOpen(no) ? 1 : 0);
    this.storeScn?.tick?.(clock.t, L.kind === 'fishing' ? world.fishingState.dex : undefined);
    // 펫샵: 진열대엔 남은 개수만큼, 분양된 아이의 이름표는 치운다
    if (this.storeScn && L.kind === 'pet') {
      for (const [id, list] of this.storeScn.goods) {
        const left = world.goodsLeft(id);
        list.forEach((o, i) => (o.visible = i < left));
      }
      for (const [id, card] of this.storeScn.cards) card.visible = !!world.pen?.animals.some((a) => a.stock.id === id);
    }
    // 놀이터 아이들 (분양된 아이는 치운다)
    const seen = new Set<string>();
    for (const a of world.pen?.animals ?? []) {
      let v = this.penViews.get(a.stock.id);
      if (!v) {
        const sp = PET_BY_ID[a.stock.species];
        if (!sp) continue;
        v = { model: buildPet(sp, a.stock.coat), phase: Math.random() * 6 };
        // 분양 아이들은 아직 아기 (부스에 맞게 작게)
        v.model.root.scale.setScalar(Math.min(0.8, 0.85 / sp.size) * sp.size);
        this.store.add(v.model.root);
        this.penViews.set(a.stock.id, v);
      }
      v.model.root.position.set(a.x, a.y + 0.015, a.z);
      v.model.root.rotation.y = a.yaw;
      animatePet(v.model, clock.t, a.moving, v.phase, 0.8);
      seen.add(a.stock.id);
    }
    for (const [id, v] of this.penViews) {
      if (seen.has(id)) continue;
      disposePet(v.model);
      this.penViews.delete(id);
    }
    for (const e of world.drainEvents()) {
      this.storeSparks.spawn(e);
      if (e.damage > 0) this.storeTexts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, e.kind === 'counter' ? '#ffb020' : '#ffffff');
    }
    for (const s of world.drainSpeech()) this.storeTexts.spawn(s.text, s.x, 2.4, s.z, s.color ?? '#ffe08a', 1.1);
  }

  /** 로비: 지나가는 주민·강도 모델과 이름표, 타격 이펙트 */
  private syncPeople(world: CityWorld, clock: FrameClock, place: number, sparks: SparkSystem, texts: FloatingTexts) {
    const people = world.shownPeople.filter((p) => p.where === place);
    this.lobbyViews.forEach((v, i) => {
      const person = people.find((p) => p.slot === i);
      v.root.visible = !!person;
      const plate = this.lobbyPlates[i];
      plate.sprite.visible = false;
      if (!person) return;
      // 주민은 편한 자세, 강도는 전투 자세
      v.setSkin(person.kind === 'robber' ? ROBBER_SKIN : null);
      const scale = person.tier?.scale ?? 0.95;
      v.root.scale.setScalar(scale);
      v.update(person.f, clock);
      if (world.frame < person.showUntil || person.koFrames >= 0) {
        const lp = person.f.lerped(clock.alpha);
        const label =
          person.koFrames >= 0
            ? `${person.title} (${person.kind === 'robber' ? '제압' : '부상'})`
            : person.reaction === 'help'
              ? `💪 ${person.title}`
              : person.reaction === 'flee'
                ? `😱 ${person.title}`
                : person.kind === 'visitor'
                  ? `✋ ${person.title}`
                  : person.title;
        plate.draw(label, Math.max(0, person.f.hp), person.f.maxHp);
        plate.sprite.position.set(lp.x, lp.y + (person.koFrames >= 0 ? 0.9 : 2.1 * scale), lp.z);
        plate.sprite.visible = true;
      }
    });
    for (const e of world.drainEvents()) {
      sparks.spawn(e);
      if (e.damage > 0) texts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, e.kind === 'counter' ? '#ffb020' : '#ffffff');
    }
    for (const s of world.drainSpeech()) texts.spawn(s.text, s.x, 2.4, s.z, s.color ?? '#ffe08a', 1.1);
  }

  dispose() {
    this.chatBubbles.dispose();
    this.fx.dispose();
    this.weatherFx.dispose();
    this.groundKit.dispose();
    this.facadeKit.dispose();
    this.carKit.dispose();
    this.treeKit.dispose();
    this.traffic?.dispose();
    for (const v of this.petViews.values()) disposePet(v.model);
    this.petViews.clear();
    this.portal?.dispose();
    this.fishingView?.dispose();
    this.player.dispose?.();
    this.nextPlayer?.view.dispose?.();
    this.sparks.dispose();
    this.texts.dispose();
    this.lobbySparks.dispose();
    this.homeSparks.dispose();
    this.myPlate.dispose();
    this.homeTexts.dispose();
    for (const v of this.remoteViews.values()) {
      v.view.dispose?.();
      v.plate.dispose();
      v.fish?.dispose();
    }
    for (const v of this.remotePetViews.values()) disposePet(v.model);
    this.remotePetViews.clear();
    this.corridorSparks.dispose();
    this.storeSparks.dispose();
    this.storeTexts.dispose();
    for (const v of this.penViews.values()) disposePet(v.model);
    this.corridorTexts.dispose();
    this.lobbyTexts.dispose();
    for (const p of [...this.npcPlates, ...this.lobbyPlates, this.seniorPlate]) p.dispose();
    for (const s of [this.city, this.home, this.lobby, this.corridor, this.store]) disposeObject(s);
    // 그림자 지도도 GPU 그림이다
    this.sun.shadow.map?.dispose();
    checkLeaks(this.renderer, '도시');
    this.renderer.dispose();
    this.untrack();
  }

  private untrack = trackRenderer('도시');

  // ───────────────────────── 카메라 · 낮밤 ─────────────────────────

  /**
   * 코디 창: 게임 속 내 캐릭터를 그대로 빙 둘러본다 (따로 그리지 않아서 보이는 모습이 똑같다).
   * 화면 오른쪽은 옷장 창이 가리므로 시야를 옆으로 밀어 캐릭터를 왼쪽 가운데에 둔다.
   */
  private updateMirrorCam(world: CityWorld, clock: FrameClock, look: boolean) {
    const m = world.mirror;
    if (!m || look) {
      if (this.mirrorSm) {
        this.mirrorSm = null;
        this.camera.clearViewOffset();
      }
      return;
    }
    const s = (this.mirrorSm ??= { ...m });
    const k = smooth(0.15, clock.dt);
    s.yaw += (m.yaw - s.yaw) * k;
    s.pitch += (m.pitch - s.pitch) * k;
    s.dist += (m.dist - s.dist) * k;
    s.y += (m.y - s.y) * k;
    s.shift += (m.shift - s.shift) * k;
    const p = world.player.lerped(clock.alpha);
    const ty = world.stairLift(p.x, p.z) + s.y;
    const a = Math.atan2(p.fx, p.fz) + s.yaw;
    const cp = Math.cos(s.pitch);
    let cx = p.x + Math.sin(a) * cp * s.dist;
    let cz = p.z + Math.cos(a) * cp * s.dist;
    // 실내: 벽 밖으로 나가면 벽에 가려서 안쪽에 붙잡는다
    const b = world.indoorBounds();
    if (b) {
      cx = Math.max(b.x0 + 0.15, Math.min(b.x1 - 0.15, cx));
      cz = Math.max(b.z0 + 0.15, Math.min(b.z1 - 0.15, cz));
    }
    this.camera.position.set(cx, ty + Math.sin(s.pitch) * s.dist, cz);
    this.camera.lookAt(p.x, ty, p.z);
    this.camera.near = 0.05;
    const size = this.renderer.getSize(this._mirrorSize);
    this.camera.setViewOffset(size.x, size.y, size.x * s.shift, 0, size.x, size.y);
  }
  private _mirrorSize = new THREE.Vector2();

  private updateCamera(world: CityWorld, clock: FrameClock) {
    const p = world.player.lerped(clock.alpha);
    // 실내(집·로비)는 같은 카메라 (놀이공원은 바깥)
    const home = world.location !== 'city' && world.location !== 'park';
    const off = (home ? CAM_HOME : CAM_CITY).clone().multiplyScalar(home ? Math.min(1.3, Math.max(0.45, this.zoom)) : this.zoom);
    // 집 안에선 방 가운데 쪽으로 붙잡아 방 전체가 보이게
    // 로비는 데스크(서쪽 끝)에 앉아 있는 시간이 길어서 플레이어를 더 따라간다
    const follow = world.location === 'lobby' ? 0.75 : world.location === 'corridor' ? 0.6 : 0.45;
    // 확대할수록 플레이어를 더 따라간다 (가까이 보면 방 가운데가 아니라 내 캐릭터 중심)
    const closeK = Math.min(1, Math.max(0, (1 - this.zoom) / 0.45));
    let fx = home ? p.x * (follow + (1 - follow) * closeK) : p.x;
    let fz = home ? p.z * (0.35 + 0.65 * closeK) : p.z;
    const rest = world.location === 'home' ? (world.sleepView?.rest ?? 0) : 0;
    if (rest > 0) {
      // 침대를 비스듬히 내려다보도록 다가간다
      const k = rest * rest * (3 - 2 * rest);
      fx += (HOME.bed.lie.x - 0.4 - fx) * k;
      fz += (HOME.bed.lie.z - 0.6 - fz) * k;
      // 옆 위에서 내려다보는 각도로 (발치의 TV 가 가리지 않게)
      off.lerp(new THREE.Vector3(-3.0, 4.4, 2.4), k);
    }
    this.fishCam += ((world.fishing && !home ? 1 : 0) - this.fishCam) * smooth(0.05, clock.dt);
    const fk = this.fishCam * this.fishCam * (3 - 2 * this.fishCam);
    if (fk > 0.001) {
      off.lerp(FISH_CAM, fk);
      fz += 2.6 * fk;
    }
    const want = new THREE.Vector3(fx, 0, fz).add(off);
    if (!this.camInit) {
      this.camPos.copy(want);
      this.camInit = true;
    }
    this.camPos.lerp(want, smooth(0.1, clock.dt));
    this.camera.position.copy(this.camPos);
    const close = Math.max(0, 1 - this.zoom);
    this.camera.lookAt(this.camPos.x - off.x, (home ? 0.6 : 1.1) + close * 0.4, this.camPos.z - off.z);
    // 타격이 들어가 멈춘 순간(히트스톱) 화면을 살짝 흔들어 묵직한 손맛을
    if (world.hitstop > 0) {
      const a = 0.025 * Math.min(5, world.hitstop);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    // 깊이 정밀도는 near 에 비례한다: 카메라가 멀 땐 near 를 키워 먼 벽·바닥이 깜박이며 깨지는 현상(z-fighting)을 막는다
    const near = home ? 0.1 : Math.min(0.6, Math.max(0.1, off.length() * 0.03));
    if (Math.abs(near - this.camera.near) > 0.01) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    if (!home) this.placeSun(p.x, p.z);
  }

  /**
   * 해(그림자 카메라)를 플레이어 쪽에 둔다. 그림자 지도의 한 칸(텍셀) 단위로만 움직여서
   * 캐릭터가 걸을 때 건물 그림자 경계가 일렁이지 않게 한다 (그림자 안정화).
   */
  private placeSun(x: number, z: number) {
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    // 빛 방향 기준 좌우(right)·위아래(up) 축에서 텍셀 격자에 맞춘다
    const dir = this._sunN.copy(this.sunDir).normalize();
    const right = this._sunR.crossVectors(this._worldUp, dir).normalize();
    const up = this._sunU.crossVectors(dir, right).normalize();
    const p = this._sunP.set(x, 0, z);
    const lx = p.dot(right);
    const ly = p.dot(up);
    p.addScaledVector(right, Math.round(lx / texel) * texel - lx).addScaledVector(up, Math.round(ly / texel) * texel - ly);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).add(this.sunDir);
  }

  private sunDir = new THREE.Vector3(60, 90, 40);
  private _sunN = new THREE.Vector3();
  private _sunR = new THREE.Vector3();
  private _sunU = new THREE.Vector3();
  private _sunP = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);
  /** 해 각도는 1도 단위로만 바꾼다 (매 프레임 조금씩 돌면 그림자가 기어 다닌다) */
  private sunAngle = Number.NaN;

  private updateDayNight(daylight: number, minutes: number) {
    const h = minutes / 60;
    // 해 위치: 6시 동쪽 → 12시 머리 위 → 19시 서쪽
    const a = ((h - 6) / 13) * Math.PI;
    const step = Math.PI / 180;
    const qa = Math.round(a / step) * step;
    if (qa !== this.sunAngle) {
      this.sunAngle = qa;
      this.sunDir.set(Math.cos(qa) * -80, Math.max(12, Math.sin(qa) * 110), 50);
    }
    const dusk = Math.max(0, 1 - Math.abs(h - 18.5) / 1.5) + Math.max(0, 1 - Math.abs(h - 6.3) / 1.2) * 0.6;
    // 그라데이션 하늘, 안개는 지평선 색에 맞춘다
    const w = this.weather;
    const flash = this.weatherFx?.flash ?? 0;
    const horizon = this.sky.update(daylight, Math.min(1, dusk), this.sunDir.clone().normalize(), w.cloud, flash);
    (this.city.background as THREE.Color).copy(horizon);
    const fog = this.city.fog as THREE.Fog;
    fog.color.copy(horizon);
    // 비·눈·안개: 멀리가 뿌옇게 (맑은 날 120~650m → 짙은 안개 날 8~110m)
    const haze = Math.min(1, w.fog + w.rain * 0.25 + w.snow * 0.3);
    fog.near = 120 - haze * 112;
    fog.far = 650 - haze * 540;
    this.fxNight = 1 - daylight;
    this.fxDusk = Math.min(1, dusk) * (1 - w.cloud * 0.7);
    // 밤엔 해 대신 푸른 달빛 + 은은한 하늘빛 (길이 새까맣지 않게)
    const moon = 1 - daylight;
    // 구름이 끼면 햇빛(그림자)이 약해지고 하늘빛이 그만큼 고르게 퍼진다
    const shade = 1 - w.cloud * 0.75;
    this.sun.intensity = (0.45 * moon + daylight * 2.2) * shade;
    this.sun.color.set(0xffffff).lerp(new THREE.Color(0xffa060), this.fxDusk).lerp(new THREE.Color(0x9fb4ff), moon);
    // 밤에도 나무·건물이 새까만 덩어리로 보이지 않게 하늘빛을 넉넉히
    this.hemi.intensity = 0.95 + daylight * 0.25 - w.cloud * daylight * 0.1 + flash * 2.2;
    this.hemi.color.set(0xdff1ff).lerp(new THREE.Color(0x6f7fb8), moon).lerp(new THREE.Color(0xc9ced6), w.cloud * daylight * 0.6);
    const night = 1 - daylight;
    // 툰 재질은 발광이 그대로 더해져서 예전보다 낮게
    for (const m of this.windowMats) m.emissiveIntensity = night * 0.55;
    this.unitNight.value = night;
    for (const m of this.kitMats) m.emissiveIntensity = night * 0.16;
    for (const m of this.propNightMats) m.emissiveIntensity = night * 0.12;
    this.carKit.setNight(night);
    this.treeKit.setNight(night);
    for (const m of this.nightGlow) (m as THREE.MeshBasicMaterial).opacity = night;
    this.lampGlow.visible = night > 0.05;
  }

  private updateHomeLight(daylight: number, minutes: number) {
    const hour = Math.floor(minutes / 30);
    if (hour !== this.homeWindowHour) {
      this.homeWindowHour = hour;
      drawSkyline(this.homeWindow.g, daylight);
      this.homeWindow.tex.needsUpdate = true;
    }
    this.homeWindow.light.intensity = 0.2 + daylight * 1.6;
    // 밤엔 실내등이 더 따뜻하고 밝게 느껴지도록
    // 잘 때는 불을 끈다 (협탁 스탠드만 은은하게)
    const lightsOn = 1 - this.sleepDark * 0.9;
    for (const l of this.homeLights) l.intensity = (6 + (1 - daylight) * 8) * lightsOn;
  }

  /** 집 벽 달력: 이번 달, 오늘 표시, 근무한 날 빨간 동그라미 */
  private updateWallCalendar(world: CityWorld) {
    const log = world.profile.workLog ?? {};
    const key = `${world.day}|${Object.values(log).reduce((n, a) => n + a.length, 0)}`;
    const cal = this.wallCal;
    if (cal.key === key) return;
    cal.key = key;
    const g = cal.g;
    const today = dateOfDay(world.day);
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, 256, 300);
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, 256, 54);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 30px sans-serif';
    g.fillText(`${today.month + 1}월`, 128, 28);
    g.font = 'bold 14px sans-serif';
    WEEKDAYS.forEach((w, i) => {
      g.fillStyle = i === 0 ? '#c62828' : i === 6 ? '#1565c0' : '#555';
      g.fillText(w, 18 + i * 36.6, 70);
    });
    const first = dateOfDay(dayOfDate(today.year, today.month, 1)).dow;
    const n = daysInMonth(today.year, today.month);
    g.font = 'bold 17px sans-serif';
    for (let d = 1; d <= n; d++) {
      const cell = first + d - 1;
      const x = 18 + (cell % 7) * 36.6;
      const y = 98 + Math.floor(cell / 7) * 38;
      const gameDay = dayOfDate(today.year, today.month, d);
      if (d === today.date) {
        g.fillStyle = '#ffe082';
        g.fillRect(x - 16, y - 16, 32, 32);
      }
      g.fillStyle = cell % 7 === 0 ? '#c62828' : cell % 7 === 6 ? '#1565c0' : '#222';
      g.fillText(String(d), x, y);
      if (log[String(gameDay)]?.length) {
        g.strokeStyle = '#e53935';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, 14, 0, Math.PI * 2);
        g.stroke();
      }
    }
    cal.tex.needsUpdate = true;
  }

  /** 잠자기 연출: 이불을 발끝부터 덮고, 불이 꺼진다 */
  private syncSleep(sv: CityWorld['sleepView'], dt: number, friendBlanket = 0) {
    this.sleepDark += ((sv?.dark ?? 0) - this.sleepDark) * smooth(0.15, dt);
    const b = Math.max(sv?.blanket ?? 0, friendBlanket);
    this.duvet.visible = b > 0.01;
    // 발끝(z 큰 쪽)에서 가슴까지 당겨 덮는다
    const D = 1.8;
    this.duvet.scale.z = Math.max(0.01, b);
    this.duvet.position.z = -0.95 - (D * b) / 2;
    this.bedLamp.color.setRGB(1, 0.88 * (0.55 + 0.45 * (1 - this.sleepDark * 0.5)), 0.66);
  }

  /** 카메라와 플레이어 사이를 가리는 건물은 반투명하게 */
  private fadeOccluders(world: CityWorld, dt: number, off = false) {
    const p = world.player;
    const cam = this.camera.position;
    for (const v of this.buildings) {
      const b = v.b;
      // 카메라→플레이어 선분이 건물 상자(높이 포함)를 지나는지 대략 판정
      let hit = false;
      for (let k = 1; k < 10 && !hit && !off; k++) {
        const u = k / 10;
        const x = cam.x + (p.x - cam.x) * u;
        const y = cam.y + (1 - cam.y) * u;
        const z = cam.z + (p.z - cam.z) * u;
        hit = Math.abs(x - b.x) < b.w / 2 + 0.5 && Math.abs(z - b.z) < b.d / 2 + 0.5 && y < b.h;
      }
      const target = hit ? 0.2 : 1;
      v.fade += (target - v.fade) * smooth(0.2, dt);
      const transparent = v.fade < 0.98;
      for (const m of v.mats) {
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = v.fade;
        // 반투명이어도 깊이는 쓴다: 맨 앞 면만 흐릿하게 보이고 건물 안쪽이 겹겹이 비치지 않는다
        m.depthWrite = true;
      }
    }
  }

  // ───────────────────────── 아파트 단지 산책 공원 ─────────────────────────

  private buildTrailPark(t: CityMap['trails'][number]) {
    const s = this.city;
    const std = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

    // 산책로 (우레탄 트랙) — 고리를 짧은 판으로 이어 붙인다
    const track = std(0xc0624a, 0.95);
    for (let k = 0; k < t.path.length; k++) {
      const a = t.path[k];
      const b = t.path[(k + 1) % t.path.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len + 0.6), track);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
      seg.position.set((a.x + b.x) / 2, 0.07, (a.z + b.z) / 2);
      seg.receiveShadow = true;
      s.add(seg);
    }

    // 연못 + 돌 테두리
    const { pond } = t;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(pond.r + 0.5, pond.r + 0.7, 0.35, 40), std(0x9a958c));
    rim.position.set(pond.x, 0.17, pond.z);
    rim.receiveShadow = true;
    s.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 40), std(0x4f9ccf, 0.15, 0.2));
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, 0.36, pond.z);
    s.add(water);
    for (let k = 0; k < 3; k++) {
      // 연잎
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), std(0x3f8a3a));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(pond.x + Math.cos(k * 2.1) * 2, 0.37, pond.z + Math.sin(k * 2.1) * 2);
      s.add(pad);
    }

    // 야외 운동기구 (철봉 · 윗몸일으키기 · 허리 돌리기)
    const metal = std(0x3a7bd5, 0.4, 0.6);
    const yellow = std(0xf2c230, 0.5, 0.3);
    t.gym.forEach((g, i) => {
      const grp = new THREE.Group();
      grp.position.set(g.x, 0, g.z);
      grp.rotation.y = g.rot;
      if (i === 0) {
        for (const x of [-0.9, 0.9]) grp.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), metal), x, 1.1, 0));
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), yellow);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 2.1;
        grp.add(bar);
      } else if (i === 1) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.6), yellow);
        bench.position.y = 0.45;
        bench.rotation.x = 0.25;
        grp.add(bench);
        grp.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), metal), 0, 0.25, 0.6));
        grp.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), metal), 0, 0.12, -0.6));
      } else {
        grp.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), metal), 0, 0.7, 0));
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), yellow);
        disc.position.y = 0.2;
        grp.add(disc);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), yellow);
        handle.position.y = 1.35;
        grp.add(handle);
      }
      grp.traverse((o) => (o.castShadow = true));
      s.add(grp);
    });

    // 꽃밭
    const fx = t.flowers.map((f) => f.x);
    const fz = t.flowers.map((f) => f.z);
    const [bx0, bx1, bz0, bz1] = [Math.min(...fx) - 0.6, Math.max(...fx) + 0.6, Math.min(...fz) - 0.6, Math.max(...fz) + 0.6];
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 0.25, bz1 - bz0), std(0x6b4a2b, 1));
    bed.position.set((bx0 + bx1) / 2, 0.12, (bz0 + bz1) / 2);
    s.add(bed);
    const flowerGeo = new THREE.IcosahedronGeometry(0.22, 0);
    for (const f of t.flowers) {
      const m = new THREE.Mesh(flowerGeo, std(f.color, 0.6));
      m.position.set(f.x, 0.42, f.z);
      s.add(m);
    }

    // 파고라 (그늘 쉼터) + 벤치
    const wood = std(0x8a5a35);
    const pg = new THREE.Group();
    pg.position.set(t.pergola.x, 0, t.pergola.z);
    for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
      pg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), wood), px, 1.3, pz));
    }
    for (let k = -4; k <= 4; k++) {
      pg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), wood), k * 0.42, 2.65, 0));
    }
    pg.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.5), wood), 0, 0.45, 0));
    pg.traverse((o) => (o.castShadow = true));
    s.add(pg);

    // 입구 안내판
    const entry = { x: (t.x0 + t.x1) / 2, z: t.z1 - 4.5 };
    this.addSignPlane(s, { text: '🌳 단지 산책로', bg: '#2f6b3a', fg: '#ffffff' }, entry.x, 2.0, entry.z, 2.6, 0.7);
    s.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), wood), entry.x, 0.85, entry.z - 0.05));
  }

  // ───────────────────────── 경찰 ─────────────────────────

  private buildPolice() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.4), new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.35 }));
    body.position.y = 0.7;
    body.castShadow = true;
    g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 4.0), new THREE.MeshStandardMaterial({ color: 0x1e4fa8 }));
    stripe.position.y = 0.65;
    g.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.3), new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.2, metalness: 0.5 }));
    cabin.position.set(0, 1.35, -0.2);
    g.add(cabin);
    // 경광등 (빨강·파랑 번갈아 깜빡임)
    const sirenBoxes: THREE.Mesh[] = [];
    for (const [x, color] of [[-0.4, 0xff2020], [0.4, 0x2060ff]] as const) {
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 });
      this.sirens.push(mat);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.35), mat);
      light.position.set(x, 1.75, -0.2);
      g.add(light);
      sirenBoxes.push(light);
    }
    this.addSignPlane(g, { text: 'POLICE 경찰', bg: '#1e4fa8', fg: '#ffffff' }, 0.97, 0.75, 0, 2.2, 0.35, Math.PI / 2);
    // 진짜 경찰차 모델로 (경광등은 그대로 얹는다)
    void this.carKit.car('cars/police.glb', 4.6).then((v) => {
      for (const o of [body, stripe, cabin]) g.remove(o);
      g.add(v.group);
      // 모델에 경광등이 있으면 그것을 깜빡인다
      if (v.sirens.length >= 2) {
        for (const o of sirenBoxes) g.remove(o);
        this.sirens = v.sirens;
      }
    });
    g.visible = false;
    this.policeCar = g;
    this.city.add(g);
    for (let k = 0; k < 2; k++) {
      // 경찰: 남자 모델에 남색 제복 색을 덧칠
      const m = new PersonView(0, { tint: 0x7d93d8 });
      m.root.visible = false;
      this.officerViews.push(m);
      this.city.add(m.root);
    }
  }

  private syncPolice(world: CityWorld, clock: FrameClock) {
    const pol = world.police;
    const car = pol.car;
    this.policeCar.visible = !!car;
    if (car) {
      this.policeCar.position.set(car.x, 0, car.z);
      this.policeCar.rotation.y = Math.atan2(car.dx, car.dz);
      const on = Math.floor(world.frame / 8) % 2 === 0;
      this.sirens[0].emissive.set(on ? 0xff2020 : 0x220000);
      this.sirens[1].emissive.set(on ? 0x000a22 : 0x2060ff);
    }
    this.officerViews.forEach((v, i) => {
      const o = pol.officers[i];
      v.root.visible = !!o;
      if (o) {
        v.setDistance(Math.hypot(o.x - world.player.x, o.z - world.player.z));
        v.update(o, clock);
      }
    });
  }

  // ───────────────────────── 도시 만들기 ─────────────────────────

  private buildCity(world: CityWorld) {
    const s = this.city;
    const m = world.map;
    const { EXPRESSWAY_Z } = CITY_CONST;

    // 실사 바닥 (Firefly 그림): 아스팔트·보도블록·잔디·흙길
    const gk = this.groundKit;
    const ground = (kind: GroundKind, w: number, d: number, x: number, z: number, y: number, tint?: number) => {
      const mesh = gk.plane(kind, w, d, x, z, y, tint);
      s.add(mesh);
      return mesh;
    };

    // 바닥: 도시(잔디) · 블록 둘레(보도블록) · 블록 안쪽 (공원·아파트는 잔디, 나머지는 광장 보도블록)
    // 한강(강둑 남쪽)은 비워 둔다: 덮으면 1.2m 아래 강물이 가려진다
    ground('grass', 1600, 800 + m.riverZ, 0, (m.riverZ - 800) / 2, -0.02, 0xb8bcae);
    for (const b of m.blocks) {
      ground('sidewalk', b.x1 - b.x0, b.z1 - b.z0, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0.02);
      const green = b.kind === 'park' || b.kind === 'apartment' || b.kind === 'trail';
      ground(green ? 'grass' : 'sidewalk', b.x1 - b.x0 - 6, b.z1 - b.z0 - 6, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0.045, green ? 0xffffff : 0xd9d6d0);
    }

    // 도로 + 차선
    const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 2.2);
    // 차선은 빛을 받는 페인트 (밤에 혼자 빛나서 번지지 않게)
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 });
    const dashes: THREE.Matrix4[] = [];
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.8 });
    for (const r of m.roads) {
      const len = r.to - r.from;
      const mid = (r.from + r.to) / 2;
      const along = r.axis === 'x';
      ground('asphalt', along ? len : r.width, along ? r.width : len, along ? mid : r.at, along ? r.at : mid, 0.04, 0x8c8f94);
      // 중앙선 (노란 두 줄)
      for (const o of [-0.15, 0.15]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.12, 0.02, along ? 0.12 : len), yellow);
        line.position.set(along ? mid : r.at + o, 0.06, along ? r.at + o : mid);
        s.add(line);
      }
      // 차선 점선
      const laneOffsets = r.width > 12 ? [-3.5, 3.5] : [];
      for (const lo of laneOffsets) {
        for (let k = r.from; k < r.to; k += 6) {
          const mtx = new THREE.Matrix4().makeRotationY(along ? Math.PI / 2 : 0);
          mtx.setPosition(along ? k : r.at + lo, 0.06, along ? r.at + lo : k);
          dashes.push(mtx);
        }
      }
    }
    // 횡단보도 · 정지선 · 길가 펜스 · 신호등 (사람은 횡단보도로만 건넌다)
    this.traffic = new TrafficProps(m);
    this.buildShopDoors(m);
    s.add(this.traffic.group);
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = false) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mt, i) => im.setMatrixAt(i, mt));
      im.castShadow = shadow;
      im.receiveShadow = true;
      s.add(im);
      return im;
    };
    inst(dashGeo, dashMat, dashes);

    // 한강공원 · 한강 · 건너편 · 다리
    ground('grass', 1600, m.parkZ[1] - m.parkZ[0], 0, (m.parkZ[0] + m.parkZ[1]) / 2, 0.01);
    ground('path', 1600, 2.5, 0, m.parkZ[0] + 7, 0.03); // 산책로
    ground('asphalt', 1600, 1.6, 0, m.parkZ[0] + 9.5, 0.03, 0x7fa6e6); // 자전거길 (파란 아스팔트)
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 300),
      new THREE.MeshStandardMaterial({ color: 0x2f6f9f, roughness: 0.25, metalness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.2, m.riverZ + 150);
    s.add(water);
    ground('grass', 1600, 400, 0, m.riverZ + 300 + 200, -0.02, 0xb8bcae);
    const farMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 });
    for (let x = -600; x < 600; x += 26) {
      const h = 30 + ((x * 7919) % 40 + 40) % 40;
      const b = new THREE.Mesh(new THREE.BoxGeometry(18, h, 12), farMat);
      b.position.set(x, h / 2, m.riverZ + 315);
      s.add(b);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 300), new THREE.MeshStandardMaterial({ color: 0x8a8c90 }));
    deck.position.set(m.bridgeX, -0.45, m.riverZ + 140);
    deck.receiveShadow = true;
    s.add(deck);
    ground('asphalt', 10, 300, m.bridgeX, m.riverZ + 140, 0.06, 0x8c8f94);
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x9a9da2 });
    for (let z = m.riverZ + 20; z < m.riverZ + 290; z += 40) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 3), pierMat);
      pier.position.set(m.bridgeX, -5, z);
      s.add(pier);
      // 다리 아치 조명
      const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 0.25, 6, 24, Math.PI), pierMat);
      arch.position.set(m.bridgeX - 8.5, -0.5, z);
      arch.rotation.y = Math.PI / 2;
      s.add(arch);
    }
    // 한강 강둑 석축 · 낚시 데크
    buildFishDecks(s, m);
    // 강변북로 방음벽
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1600, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x9fb7a8 }));
    wall.position.set(0, 0.6, EXPRESSWAY_Z + 7.3);
    s.add(wall);

    this.buildLandmarks();
    for (const t of m.trails) this.buildTrailPark(t);

    // 건물
    this.blockList = m.blocks;
    for (const b of m.buildings) this.buildings.push(this.buildBuilding(b));
    this.buildCasinoFront(m);

    // 가로수: 플라타너스 · 은행나무 · 느티나무 (코드로 만든 실사풍 나무, 바람에 흔들린다)
    this.treeKit.plant(s, m.trees);

    // 가로등 (밤엔 전구가 켜지고 바닥이 밝아진다)
    // 가로등 머리는 가까운 도로 쪽으로 뻗는다 (모델의 팔은 -z 방향)
    const { XS: RX, ZS: RZ, EXPRESSWAY_Z: EXZ } = CITY_CONST;
    const lampYaw = m.lights.map((l) => {
      const dx = RX.reduce((a, x) => (Math.abs(l.x - x) < Math.abs(l.x - a) ? x : a), RX[0]);
      const dz = [...RZ, EXZ].reduce((a, z) => (Math.abs(l.z - z) < Math.abs(l.z - a) ? z : a), RZ[0]);
      if (Math.abs(l.x - dx) < Math.abs(l.z - dz)) return dx > l.x ? -Math.PI / 2 : Math.PI / 2;
      return dz > l.z ? Math.PI : 0;
    });
    const ARM = 1.7;
    const tip = (i: number) => new THREE.Vector3(-Math.sin(lampYaw[i]) * ARM, 0, -Math.cos(lampYaw[i]) * ARM);
    const poleMats = m.lights.map((l) => new THREE.Matrix4().makeTranslation(l.x, 2.5, l.z));
    const oldPole = inst(new THREE.CylinderGeometry(0.07, 0.09, 5, 6), new THREE.MeshStandardMaterial({ color: 0x4a4f55 }), poleMats, true);
    // 모델의 팔은 실제로 +z 쪽이라 반 바퀴 더 돌린다 (머리가 도로 위로)
    void instanceProp(s, 'street/light-square.glb', m.lights.map((l, i) => new THREE.Matrix4().makeRotationY(lampYaw[i] + Math.PI).setPosition(l.x, 0, l.z)), 5.4).then(() => oldPole.removeFromParent());
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true });
    this.nightGlow.push(bulbMat);
    inst(new THREE.BoxGeometry(0.5, 0.08, 0.3), bulbMat, m.lights.map((l, i) => new THREE.Matrix4().makeRotationY(lampYaw[i]).setPosition(l.x + tip(i).x, 5.05, l.z + tip(i).z)));
    // 가로등 아래 바닥 빛: 가운데가 밝고 가장자리로 갈수록 사라지는 둥근 빛
    const glowCv = document.createElement('canvas');
    glowCv.width = glowCv.height = 128;
    const gg = glowCv.getContext('2d')!;
    const grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCv);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, map: glowTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lampGlow = inst(
      new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
      glowMat,
      m.lights.map((l, i) => new THREE.Matrix4().makeTranslation(l.x + tip(i).x, 0.08, l.z + tip(i).z)),
    );

    // 벤치
    const benchMats = m.benches.map((b) => new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, 0.25, b.z));
    const oldBench = inst(new THREE.BoxGeometry(1.8, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a5a35 }), benchMats, true);
    void instanceProp(s, 'nature/bench.glb', m.benches.map((b) => new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, 0, b.z)), 0.9).then(() => oldBench.removeFromParent());

    // 근린공원: 분수(물줄기·물결이 움직인다) + 놀이터(미끄럼틀·그네·시소)
    for (const pk of m.parks) this.buildPark(s, pk);

    // 지하철 입구 · 버스정류장
    for (const poi of m.pois) {
      if (poi.kind === 'subway') {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0x2e9e4f }));
        canopy.position.set(poi.x, 2.6, poi.z);
        canopy.castShadow = true;
        s.add(canopy);
        for (const dx of [-1.4, 1.4]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x555555 }));
          post.position.set(poi.x + dx, 1.3, poi.z + 1.9);
          s.add(post);
        }
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshBasicMaterial({ color: 0x15161a }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(poi.x, 0.07, poi.z);
        s.add(hole);
        this.addSignPlane(s, { text: '2 한강공원역', bg: '#2e9e4f', fg: '#ffffff' }, poi.x, 3.1, poi.z + 2, 3, 0.75);
      }
      if (poi.kind === 'bus') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 1.4), new THREE.MeshStandardMaterial({ color: 0x2f4f7f }));
        roof.position.set(poi.x, 2.5, poi.z);
        s.add(roof);
        const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0xa8d0f0, transparent: true, opacity: 0.45 }));
        back.position.set(poi.x, 1.25, poi.z + (poi.z > 0 ? 0.65 : -0.65));
        s.add(back);
        this.addSignPlane(s, { text: '버스', bg: '#2f6fd8', fg: '#ffffff' }, poi.x - 1.6, 2.9, poi.z, 0.9, 0.5);
      }
    }

    // 내 집 현관 표시 (바닥에서 빛나는 고리)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.85 }),
    );
    ring.position.set(m.home.x, 0.09, m.home.z);
    s.add(ring);

    // 차: 자리만 먼저 잡고, 모델이 불러와지면 끼운다 (버스는 바로 만든다)
    const ROUTES = ['472 강남역', '6211 신촌', '360 여의도', '740 덕은동', '6016 한강공원'];
    const models = ['cars/sedan.glb', 'cars/suv.glb', 'cars/hatchback-sports.glb', 'cars/van.glb'];
    world.cars.forEach((c, i) => {
      const g = new THREE.Group();
      s.add(g);
      this.cars.push(g);
      this.carViews.push(null);
      if (c.kind === 'bus') {
        const v = this.carKit.bus(c.color, ROUTES[i % ROUTES.length]);
        g.add(v.group);
        this.carViews[i] = v;
        return;
      }
      const path = c.kind === 'taxi' ? 'cars/taxi.glb' : models[i % models.length];
      void this.carKit.car(path, c.kind === 'taxi' ? 4.5 : path.includes('van') ? 4.8 : 4.4, c.kind === 'taxi' ? undefined : c.color).then((v) => {
        g.add(v.group);
        this.carViews[i] = v;
      });
    });
  }

  /** 행인 모델: Kenney 사람 모델 중 하나 (번호로 골고루) */
  private makeNpcView(index: number) {
    const m = new PersonView(index);
    m.root.scale.setScalar(0.92 + (index % 5) * 0.03);
    this.city.add(m.root);
    return m;
  }

  private addNpcView(index: number) {
    this.npcViews.push(this.makeNpcView(index));
    const plate = new Nameplate(true);
    plate.sprite.visible = false;
    this.npcPlates.push(plate);
    this.city.add(plate.sprite);
  }

  /** 그 자리의 행인이 다른 사람으로 바뀌었다 */
  private setNpcView(i: number, index: number) {
    this.city.remove(this.npcViews[i].root);
    this.npcViews[i] = this.makeNpcView(index);
  }

  private buildLandmarks() {
    const s = this.city;
    // 남산 + N서울타워 (북쪽)
    const hill = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f7a45, roughness: 1 }));
    hill.scale.set(1.4, 0.55, 1);
    hill.position.set(-60, -2, -330);
    s.add(hill);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.5, 60, 16), towerMat);
    shaft.position.set(-60, 48 + 30, -330);
    s.add(shaft);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 9, 24), towerMat);
    pod.position.set(-60, 112, -330);
    s.add(pod);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 34, 8), new THREE.MeshStandardMaterial({ color: 0xd04040 }));
    antenna.position.set(-60, 133, -330);
    s.add(antenna);
    const towerLight = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true });
    this.nightGlow.push(towerLight);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.6, 6, 32), towerLight);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-60, 110, -330);
    s.add(ring);

    // 초고층 타워 (동쪽 멀리, 끝으로 갈수록 가늘어진다)
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, roughness: 0.15, metalness: 0.6 });
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(3, 14, 230, 4, 1), glass);
    sky.rotation.y = Math.PI / 4;
    sky.position.set(320, 115, -260);
    s.add(sky);
    const skyLight = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    this.nightGlow.push(skyLight);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), skyLight);
    tip.position.set(320, 231, -260);
    s.add(tip);

    // 북쪽 산 능선
    const ridge = new THREE.MeshStandardMaterial({ color: 0x5b7356, roughness: 1 });
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(80 + (k % 3) * 25, 90 + (k % 4) * 30, 6), ridge);
      m.position.set(-520 + k * 130, 30, -560 - (k % 2) * 60);
      s.add(m);
    }
  }

  private addSignPlane(parent: THREE.Object3D, sign: Sign, x: number, y: number, z: number, w: number, h: number, rotY = 0) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(sign, 512, Math.round(512 * (h / w))) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
    return mesh;
  }

  /** 근린공원 분수 + 놀이터 */
  private buildPark(s: THREE.Object3D, pk: CityMap['parks'][number]) {
    const { fountain: f, playground: g } = pk;
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b4a52, roughness: 0.9 });
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
      return mesh;
    };
    // ── 분수: 둥근 담 + 물 + 가운데 2단 받침 ──
    add(new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r + 0.25, 0.6, 40, 1, true), stone), f.x, 0.3, f.z);
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(f.r + 0.05, 0.2, 8, 56), stone), f.x, 0.6, f.z);
    rim.rotation.x = -Math.PI / 2;
    const floor = add(new THREE.Mesh(new THREE.CircleGeometry(f.r, 40), dark), f.x, 0.04, f.z);
    floor.rotation.x = -Math.PI / 2;
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x4aa6d9, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
    const water = add(new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.05, 40), waterMat), f.x, 0.42, f.z);
    water.rotation.x = -Math.PI / 2;
    water.castShadow = false;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.1, 16), stone), f.x, 0.55, f.z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.5, 0.35, 24), stone), f.x, 1.2, f.z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 12), stone), f.x, 1.6, f.z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.25, 0.22, 20), stone), f.x, 1.95, f.z);
    // 물줄기: 가운데 위로 솟는 줄기 + 받침 둘레에서 바깥으로 떨어지는 줄기 8개
    const jetMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.6, depthWrite: false });
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 1.8, 10, 1, true), jetMat);
    main.position.set(f.x, 2.95, f.z);
    s.add(main);
    const arcs: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const d = Math.sin(a);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(f.x + c * 1.3, 1.3, f.z + d * 1.3),
        new THREE.Vector3(f.x + c * 2.4, 2.0, f.z + d * 2.4),
        new THREE.Vector3(f.x + c * 3.2, 0.45, f.z + d * 3.2),
      );
      const arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.05, 6), jetMat);
      s.add(arc);
      arcs.push(arc);
    }
    // 물결: 가운데에서 퍼지는 고리 셋
    const ripples = [0, 1, 2].map((k) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.position.set(f.x, 0.44, f.z);
      r.userData.phase = k / 3;
      s.add(r);
      return r;
    });
    this.parkAnims.push((t) => {
      main.scale.y = 1 + Math.sin(t * 7) * 0.06;
      jetMat.opacity = 0.5 + Math.sin(t * 11) * 0.08;
      arcs.forEach((arc, i) => arc.scale.setScalar(1 + Math.sin(t * 5 + i) * 0.015));
      for (const r of ripples) {
        const p = (t * 0.35 + (r.userData.phase as number)) % 1;
        r.scale.setScalar(1 + p * 2.9);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - p);
      }
    });

    // ── 놀이터: 모래밭 + 테두리 ──
    const gw = g.x1 - g.x0;
    const gd = g.z1 - g.z0;
    const gx = (g.x0 + g.x1) / 2;
    const gz = (g.z0 + g.z1) / 2;
    const sand = add(new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshStandardMaterial({ color: 0xd8c38e, roughness: 1 })), gx, 0.03, gz);
    sand.rotation.x = -Math.PI / 2;
    sand.castShadow = false;
    const curb = new THREE.MeshStandardMaterial({ color: 0x6d8f3a, roughness: 0.8 });
    add(new THREE.Mesh(new THREE.BoxGeometry(gw + 0.3, 0.18, 0.15), curb), gx, 0.09, g.z0);
    add(new THREE.Mesh(new THREE.BoxGeometry(gw + 0.3, 0.18, 0.15), curb), gx, 0.09, g.z1);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, gd), curb), g.x0, 0.09, gz);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, gd), curb), g.x1, 0.09, gz);
    const red = new THREE.MeshStandardMaterial({ color: 0xe0453a, roughness: 0.5 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f7fd6, roughness: 0.5 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.35, metalness: 0.7 });
    // 미끄럼틀 (서쪽): 기둥 4개 + 발판 + 지붕 + 계단 + 미끄럼판
    const sx = g.x0 + 1.7;
    const sz = g.z0 + 1.8;
    for (const [dx, dz] of [
      [-0.8, -0.7],
      [0.8, -0.7],
      [-0.8, 0.7],
      [0.8, 0.7],
    ])
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), blue), sx + dx, 1.3, sz + dz);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.6), yellow), sx, 1.4, sz);
    const roof = add(new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.7, 4), red), sx, 2.95, sz);
    roof.rotation.y = Math.PI / 4;
    for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.18), steel), sx, 0.25 + i * 0.27, sz - 0.9 - i * 0.12);
    const slide = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 2.9), red), sx, 0.75, sz + 2.0);
    slide.rotation.x = 0.52;
    // 그네 (동쪽): A자 기둥 2쌍 + 위 막대 + 줄 매단 의자 2개 (흔들린다)
    const wx = g.x1 - 2.5;
    const wz = g.z0 + 1.6;
    for (const dx of [-1.6, 1.6])
      for (const tilt of [-0.28, 0.28]) {
        const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), steel), wx + dx, 1.2, wz + Math.sin(tilt) * 1.2);
        leg.rotation.x = tilt;
      }
    const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), steel), wx, 2.4, wz);
    bar.rotation.z = Math.PI / 2;
    const swings = [-0.75, 0.75].map((dx, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(wx + dx, 2.4, wz);
      s.add(pivot);
      for (const ox of [-0.22, 0.22]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 4), steel);
        rope.position.set(ox, -0.95, 0);
        pivot.add(rope);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.25), i ? yellow : blue);
      seat.position.y = -1.9;
      seat.castShadow = true;
      pivot.add(seat);
      return pivot;
    });
    // 시소 (남쪽 가운데): 받침 + 판 (천천히 오르내린다)
    const tx = gx;
    const tz = g.z1 - 1.6;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.45, 10), steel), tx, 0.22, tz);
    const plank = new THREE.Group();
    plank.position.set(tx, 0.48, tz);
    s.add(plank);
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.32), yellow);
    board.castShadow = true;
    plank.add(board);
    for (const dx of [-1.35, 1.35]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.3), red);
      h.position.set(dx, 0.18, 0);
      plank.add(h);
    }
    this.parkAnims.push((t) => {
      swings[0].rotation.x = Math.sin(t * 1.9) * 0.35;
      swings[1].rotation.x = Math.sin(t * 1.6 + 1.2) * 0.25;
      plank.rotation.z = Math.sin(t * 0.9) * 0.22;
    });
  }

  /** 카지노 입구: 네온 간판 + 레드 카펫 + 입구 조명 */
  private buildCasinoFront(m: CityWorld['map']) {
    const poi = m.pois.find((p) => p.id === 'casino');
    const b = m.buildings.find((x) => x.label === '한강 그랜드 카지노');
    if (!poi || !b) return;
    const front = b.z + b.d / 2;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 160;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#1a0b2a';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#ffd54a';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 144);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 24;
    g.fillStyle = '#ffe680';
    g.font = 'bold 76px sans-serif';
    g.fillText('🎰 CASINO', 256, 70);
    g.shadowBlur = 0;
    g.fillStyle = '#ffb3f0';
    g.font = 'bold 26px sans-serif';
    g.fillText('한강 그랜드 카지노', 256, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(b.x, 5.2, front + 0.08);
    this.city.add(sign);
    // 레드 카펫 + 입구 양옆 금색 기둥 조명
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.2), new THREE.MeshStandardMaterial({ color: 0x9e1b2f, roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(b.x, 0.065, front + 1.6);
    carpet.receiveShadow = true;
    this.city.add(carpet);
    for (const dx of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.6, 12), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 }));
      post.position.set(b.x + dx, 1.3, front + 0.4);
      post.castShadow = true;
      this.city.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
      bulb.position.set(b.x + dx, 2.75, front + 0.4);
      this.city.add(bulb);
    }
    // 유리 회전문 느낌의 입구
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0x6a4a10, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.5 }));
    door.position.set(b.x, 1.3, front + 0.06);
    this.city.add(door);
  }

  /** 실사 빌라 (Firefly 그림을 입힌 상자). 옥상 이름 글자·행복빌라 현관 장식은 그대로 붙인다 */
  private buildFacadeBuilding(b: Building, set: FacadeSet): BuildingView {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    // 행복빌라는 한 층 세 집 (01·02·03호) → 정면 그림도 베란다 문 셋
    // 1층: 행복빌라는 석재 현관 층, 다른 빌라는 필로티 주차장 (위층 방 그림이 현관과 겹치지 않게)
    const fb = this.facadeKit.build(b, set, b.id, b.kind === 'home' ? 3 : undefined, b.kind === 'home' ? 'lobby' : 'piloti');
    g.add(fb.group);
    this.windowMats.push(...fb.glow);
    const mats = [...fb.mats];
    const glow = decorateFacade(g, b, this.facing(b));
    this.windowMats.push(...glow);
    mats.push(...glow);
    if (b.kind === 'home') this.addEntrance(g, b);
    this.city.add(g);
    const view: BuildingView = { b, group: g, mats, fade: 1 };
    if (b.kind === 'home') {
      // 내 집 창: 방 창문(북쪽 벽, 폭 4.2 · 높이 1.4)과 같은 크기. 자리는 내 호수가 정해지면 (syncPortal)
      // 그림 속 베란다 문 크기 그대로 (방 베란다 문보다 크면 방 문 크기까지만)
      const ops = fb.openings.length >= 3 ? fb.openings.slice(0, 3) : [0, 1, 2].map((i) => ({ x: (i - 1) * (b.w / 3), w: b.w / 3 - 0.4, y0: 0.26, y1: 2.74 }));
      const unitW = Math.min(HOME_WIN.x1 - HOME_WIN.x0, ...ops.map((o) => o.w));
      // 창 높이·위치는 방 창문 그대로 (바닥에서 0.95m ~ 2.35m)
      const unitH = HOME_WIN.y1 - HOME_WIN.y0;
      const sill = HOME_WIN.y0;
      const winY = (HOME_WIN.y0 + HOME_WIN.y1) / 2;
      const portal = new RoomPortal({ width: unitW, height: unitH, roomCenter: new THREE.Vector3((HOME_WIN.x0 + HOME_WIN.x1) / 2, (HOME_WIN.y0 + HOME_WIN.y1) / 2, HOME.room.z0), clipZ: HOME.room.z0 + 0.09 }, this.carKit.envMap);
      g.add(portal.group);
      mats.push(...(portal.mats as THREE.MeshStandardMaterial[]));
      // 내 집 자리 사진 속 문도 벽으로 덮는다 (포털과 같이 움직인다)
      coverPlate(portal.group, ops[0].w + 0.14, ops[0].y1 - ops[0].y0 + 0.14, (ops[0].y0 + ops[0].y1) / 2 - winY);
      this.portal = portal;
      this.portalAt = { view, floorBase: fb.floorBase, floors: fb.floors, unit: '', ops: ops.map((o) => ({ x: o.x, y: winY })) };
      // 다른 집들 창: 내 집 창과 같은 크기·같은 자리 규칙 (층마다 왼쪽부터 01·02·03호)
      const head = 3 - sill - unitH;
      for (let f = 2; f <= fb.floors; f++) {
        const info = villaFloor(f);
        for (let door = 0; door < 3; door++) {
          const unit = `${f}0${door + 1}`;
          const win = new UnitWindow(unitW, unitH, sill, head, { empty: info.units[door]?.resident === '빈집', seed: f * 31 + door * 7 }, this.unitNight);
          win.group.position.set(ops[door].x, fb.floorBase(f) + winY, b.d / 2 + 0.01);
          coverPlate(win.group, ops[door].w + 0.14, ops[door].y1 - ops[door].y0 + 0.14, (ops[door].y0 + ops[door].y1) / 2 - winY);
          g.add(win.group);
          this.unitWins.set(unit, win);
        }
      }
    }
    return view;
  }

  /** 창밖 내다보기 카메라: 창문 바로 앞에서 바깥(창의 정면)을 본다. 방향키로 좌우·위아래 */
  /** 놀이기구 1인칭: 좌석 눈높이에서, 놀이기구와 함께 기울고 뒤집힌다 */
  private updateRideCam(world: CityWorld, pose: SeatPose, clock: FrameClock) {
    this.lookCam.aspect = this.camera.aspect;
    this.lookCam.far = this.camera.far;
    this.parkScene().riderCamera(pose, world.rideLookYaw, world.rideLookPitch, this.lookCam, performance.now() / 1000, clock.dt, world.ride!.id);
    this.placeSun(pose.x, pose.z);
  }

  /** 1인칭 카메라: 눈높이, 보는 방향 = fpYaw·fpPitch */
  private updateFpCam(world: CityWorld, clock: FrameClock) {
    const p = world.player.lerped(clock.alpha);
    const fx = Math.sin(world.fpYaw);
    const fz = Math.cos(world.fpYaw);
    const seat = world.seatAmount;
    const down = world.downedAt !== null ? 1.1 : 0;
    this.lookCam.position.set(p.x + fx * 0.12, world.stairLift(p.x, p.z) + p.y + 1.58 - seat * 0.45 - down, p.z + fz * 0.12);
    const cp = Math.cos(world.fpPitch);
    const d = this._lookDir.set(fx * cp, Math.sin(world.fpPitch), fz * cp);
    this.lookCam.lookAt(this.lookCam.position.clone().add(d));
    this.lookCam.fov = 72;
    this.lookCam.aspect = this.camera.aspect;
    this.lookCam.far = this.camera.far;
    this.lookCam.near = 0.08;
    this.lookCam.updateProjectionMatrix();
    this.lookCam.updateMatrixWorld();
    if (world.location === 'city') this.placeSun(p.x + fx * 15, p.z + fz * 15);
  }

  private updateLookCam(world: CityWorld) {
    this.lookCam.fov = 62;
    const g = this.portal!.group;
    g.updateWorldMatrix(true, false);
    this.lookCam.position.copy(g.localToWorld(new THREE.Vector3(0, -0.05, 0.35)));
    const cp = Math.cos(world.lookPitch);
    const d = this._lookDir.set(Math.sin(world.lookYaw) * cp, Math.sin(world.lookPitch), Math.cos(world.lookYaw) * cp);
    d.transformDirection(g.matrixWorld);
    this.lookCam.lookAt(this.lookCam.position.clone().add(d));
    this.lookCam.aspect = this.camera.aspect;
    this.lookCam.far = this.camera.far;
    this.lookCam.near = 0.2;
    this.lookCam.updateProjectionMatrix();
    this.lookCam.updateMatrixWorld();
    this.placeSun(this.lookCam.position.x + d.x * 20, this.lookCam.position.z + d.z * 20);
  }

  /** 내 집 창(포털)을 내 호수 자리에 놓는다 */
  private placePortal(world: CityWorld) {
    const p = this.portal;
    const at = this.portalAt;
    if (!p || !at) return;
    if (at.unit !== world.homeUnit) {
      for (const [u, w] of this.unitWins) w.group.userData.mine = u === world.homeUnit;
      // 내 호수 → 층과 몇 번째 집 (왼쪽부터). 창이 건물 밖으로 나가지 않게
      at.unit = world.homeUnit;
      const { floor, door } = unitPlace(world.homeUnit);
      const b = at.view.b;
      const f = Math.max(2, Math.min(at.floors, floor));
      const o = at.ops[Math.max(0, Math.min(2, door))];
      p.group.position.set(o.x, at.floorBase(f) + o.y, b.d / 2 + 0.01);
      p.place();
    }
  }

  /** 내 집 창: 창문 여닫기를 따라가고, 창이 보이면 방을 비춘다 */
  private syncPortal(world: CityWorld, dt: number) {
    this.windowAmt += ((world.homeWindowOpen ? 1 : 0) - this.windowAmt) * smooth(0.1, dt);
    this.homeSash.setOpen(this.windowAmt);
    const p = this.portal;
    const at = this.portalAt;
    if (!p || !at) return;
    p.setOpen(this.windowAmt);
    if (world.location !== 'city') {
      // 내다보는 동안엔 내 창은 등 뒤라 그리지 않는다
      p.group.visible = false;
      return;
    }
    this.placePortal(world);
    // 건물이 캐릭터를 가려 반투명해지면 창도 감춘다
    p.group.visible = at.view.fade > 0.6;
    for (const w of this.unitWins.values()) w.group.visible = p.group.visible && !w.group.userData.mine;
    this.updateHomeLight(world.daylight, world.minutes);
    this.camera.updateMatrixWorld();
    this.renderer.getDrawingBufferSize(this.drawSize);
    p.render(this.renderer, this.camera, this.home, this.drawSize, this.quality <= 3);
  }

  /** 행복빌라 현관: 문은 들어갈 때·나올 때 열리고, 간판 후광·바닥 빛은 밤에 켜진다 */
  private addEntrance(g: THREE.Group, b: Building) {
    const e = buildVillaEntrance(g, b);
    this.villaDoor = e.door;
    this.nightGlow.push(...e.glow);
  }

  private buildBuilding(b: Building): BuildingView {
    const set = b.kind === 'villa' || b.kind === 'home' ? villaSet(b.id, b.kind === 'home') : null;
    if (set) return this.buildFacadeBuilding(b, set);
    if (b.vacant) return this.buildVacantShop(b);
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const style: 'apartment' | 'office' | 'small' = b.kind === 'apartment' ? 'apartment' : b.kind === 'office' ? 'office' : 'small';
    const floorH = b.kind === 'office' ? 3.5 : 3;
    const unitW = style === 'office' ? 8 : 6;
    const wt = windowTextures(style, b.id * 97 + 13);
    const repeatX = Math.max(1, Math.round(b.w / unitW));
    const repeatY = Math.max(1, Math.round(b.h / (floorH * 2)));
    const map = tex(wt.day, [repeatX, repeatY]);
    const emissiveMap = tex(wt.night, [repeatX, repeatY]);
    const body = new THREE.MeshStandardMaterial({
      color: b.color,
      map,
      emissive: 0xffffff,
      emissiveMap,
      emissiveIntensity: 0,
      roughness: b.kind === 'office' ? 0.3 : 0.85,
      metalness: b.kind === 'office' ? 0.4 : 0,
    });
    this.windowMats.push(body);
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color).multiplyScalar(0.8) });
    // 상자 옆면에만 창문, 지붕·바닥은 단색
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [body, body, roofMat, roofMat, body, body]);
    mesh.position.y = b.h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    const mats = [body, roofMat];

    // 옥상 구조물
    let roofBox: THREE.Mesh | null = null;
    if (b.kind !== 'shop') {
      roofBox = new THREE.Mesh(new THREE.BoxGeometry(Math.min(6, b.w * 0.3), 2.5, Math.min(4, b.d * 0.4)), roofMat);
      roofBox.position.set(b.w * 0.2, b.h + 1.25, 0);
      roofBox.castShadow = true;
      g.add(roofBox);
    }

    // 간판·차양·진열창: 도로 쪽 정면에 (블록 북쪽 줄 상가는 북쪽 도로를 본다)
    const face = this.facing(b);
    const glow = decorateFacade(g, b, face);
    this.windowMats.push(...glow);
    mats.push(...glow);

    // 아파트 동 번호 (동쪽 벽 꼭대기)
    if (b.kind === 'apartment' && b.label) {
      apartmentSigns(g, b, b.label);
    }

    // 내 집(행복빌라): 화강석 명판 + 주소판 + 유리 양문 + 도어락 + 캐노피 + 벽등
    if (b.kind === 'home') this.addEntrance(g, b);

    this.city.add(g);
    const view: BuildingView = { b, group: g, mats, fade: 1 };
    // 진짜 건물 모델(도시 키트)이 불러와지면 상자 몸체를 바꿔 낀다. 간판·차양·동 번호는 그대로
    void makeKitBuilding(b, face).then(({ model, mats: kitMats }) => {
      g.remove(mesh);
      if (roofBox) g.remove(roofBox);
      // 임시 상자 건물은 이제 안 쓴다: 창문 그림·재질까지 GPU 에서 지우고 밤 조명 목록에서도 뺀다
      const boxMats = new Set<THREE.Material>(Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
      this.windowMats = this.windowMats.filter((m) => !boxMats.has(m));
      disposeObject(mesh);
      if (roofBox) roofBox.geometry.dispose();
      g.add(model);
      // 앞의 두 개(상자 몸체·지붕 재질) 대신 모델 재질로. 가게 유리 등은 그대로
      view.mats = [...kitMats, ...view.mats.slice(2)];
      this.kitMats.push(...kitMats);
    });
    return view;
  }

  /** 행복빌라 옆 새 상가 (전층 공실): 코드로 지은 통유리 건물. 밤엔 계단 입구 등만 켜진다 */
  private buildVacantShop(b: Building): BuildingView {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const s = buildVacantShop(b, this.carKit.envMap);
    g.add(s.group);
    this.windowMats.push(...s.glow);
    this.city.add(g);
    return { b, group: g, mats: s.mats, fade: 1 };
  }

  /** 건물이 어느 쪽 도로를 보나: 블록 북쪽 절반에 있는 상가는 북쪽(-z) 도로 */
  private facing(b: Building): 1 | -1 {
    if (b.kind !== 'shop') return 1;
    const blk = this.blockList.find((k) => b.x >= k.x0 && b.x <= k.x1 && b.z >= k.z0 && b.z <= k.z1);
    return blk && b.z < (blk.z0 + blk.z1) / 2 ? -1 : 1;
  }

  // ───────────────────────── 집 (원룸 오피스텔) ─────────────────────────

  private buildHome() {
    const s = this.home;
    s.background = new THREE.Color(0x14161c);
    s.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3028, 0.55));
    const { x0, x1, z0, z1 } = HOME.room;
    const W = x1 - x0;
    const D = z1 - z0;
    const H = 2.7;

    const std = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // 바닥 (원목) · 러그
    const floorTex = (() => {
      const { c, g } = canvas(256, 256);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#b98a5c' : '#c49565';
        g.fillRect(0, i * 32, 256, 32);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, i * 32, 256, 1);
        g.fillRect(((i * 97) % 200) + 20, i * 32, 1, 32);
      }
      return tex(c, [W / 2.5, D / 2.5]);
    })();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // 벽: 북·서·동. 남쪽(카메라 쪽)은 허리 높이만 남겨 안이 들여다보이게
    const wall = std(0xf1ebe1, 0.95);
    const winX0 = HOME_WIN.x0;
    const winX1 = HOME_WIN.x1;
    box(winX0 - x0, H, 0.15, wall, (x0 + winX0) / 2, H / 2, z0); // 북쪽 왼편
    box(x1 - winX1, H, 0.15, wall, (winX1 + x1) / 2, H / 2, z0); // 북쪽 오른편
    const winY0 = HOME_WIN.y0;
    const winY1 = HOME_WIN.y1;
    const winH = winY1 - winY0;
    box(winX1 - winX0, winY0, 0.15, wall, (winX0 + winX1) / 2, winY0 / 2, z0); // 창 아래
    box(winX1 - winX0, H - winY1, 0.15, wall, (winX0 + winX1) / 2, (H + winY1) / 2, z0); // 창 위
    box(0.15, H, 2 - z0, wall, x0, H / 2, (z0 + 2) / 2); // 서쪽 (현관 위쪽)
    box(0.15, H, z1 - 3, wall, x0, H / 2, (3 + z1) / 2); // 서쪽 (현관 아래쪽)
    box(0.15, 0.6, 1, wall, x0, H - 0.3, 2.5); // 현관 위
    box(0.15, H, D, wall, x1, H / 2, 0); // 동쪽
    box(W, 0.5, 0.15, wall, 0, 0.25, z1); // 남쪽 허리벽
    // 걸레받이
    box(W, 0.08, 0.02, std(0x8a6a4a), 0, 0.04, z0 + 0.08);

    // 창문 + 창밖 풍경 (시간대에 따라 다시 그림)
    const { c: winC, g: winG } = canvas(512, 256);
    drawSkyline(winG, 0.3);
    const winTex = tex(winC);
    // 풍경판은 벽 높이를 넘지 않게 (위에서 내려다보는 카메라에 벽 너머로 삐져나오지 않게)
    const view = new THREE.Mesh(new THREE.PlaneGeometry(winX1 - winX0 + 1.2, winY1 + 0.5), new THREE.MeshBasicMaterial({ map: winTex }));
    view.position.set((winX0 + winX1) / 2, (winY1 + 0.05 - 0.45) / 2, z0 - 0.1);
    s.add(view);
    const frame = std(0x2b2b2b, 0.4, 0.5);
    box(winX1 - winX0, 0.06, 0.08, frame, (winX0 + winX1) / 2, winY0 + 0.03, z0);
    box(winX1 - winX0, 0.06, 0.08, frame, (winX0 + winX1) / 2, winY1 - 0.03, z0);
    // 미닫이 유리 두 짝: 열면 오른쪽 짝이 왼쪽 짝 앞으로 미끄러진다 (바깥 창과 같이 움직인다)
    {
      const glassIn = glassMaterial();
      const sw = (winX1 - winX0) / 2 + 0.04;
      const sh = winH - 0.06;
      const sashIn = (x: number, z: number) => {
        const g = new THREE.Group();
        g.position.set(x, winY0 + 0.03 + sh / 2, z);
        box(sw, 0.05, 0.035, frame, 0, sh / 2 - 0.025, 0, g);
        box(sw, 0.05, 0.035, frame, 0, -sh / 2 + 0.025, 0, g);
        box(0.05, sh, 0.035, frame, -sw / 2 + 0.025, 0, 0, g);
        box(0.05, sh, 0.035, frame, sw / 2 - 0.025, 0, 0, g);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.1, sh - 0.1), glassIn);
        pane.userData.keepMaterial = true;
        g.add(pane);
        s.add(g);
        return g;
      };
      sashIn(winX0 + sw / 2, z0 + 0.03);
      const moving = sashIn(winX1 - sw / 2, z0 + 0.065);
      const closedX = winX1 - sw / 2;
      const openX = winX0 + sw / 2 + 0.12;
      this.homeSash = { setOpen: (t) => (moving.position.x = closedX + (openX - closedX) * t) };
    }
    for (const x of [winX0, winX1]) box(0.06, winH, 0.08, frame, x, winY0 + winH / 2, z0);
    const winLight = new THREE.DirectionalLight(0xdbe9ff, 1);
    winLight.position.set((winX0 + winX1) / 2, 2.2, z0 - 2);
    winLight.target.position.set(0, 0, 1);
    winLight.castShadow = true;
    // 비스듬히 들어오는 빛이라 그림자 줄무늬가 생기지 않게
    winLight.shadow.normalBias = 0.03;
    s.add(winLight, winLight.target);
    this.homeWindow = { g: winG, tex: winTex, light: winLight };

    // 현관문
    {
      // 남쪽 끝 경첩에 매달려 방 안쪽(+x)으로 열린다
      const leaf = new THREE.Group();
      leaf.position.set(x0 + 0.06, 0, 2.5 + 0.475);
      leaf.rotation.y = Math.PI / 2;
      s.add(leaf);
      box(0.95, 2.1, 0.08, std(0x5a3b28, 0.6), 0.475, 1.05, 0, leaf);
      box(0.05, 0.05, 0.1, std(0xd4af37, 0.3, 0.8), 0.82, 1.0, 0.06, leaf);
      this.homeDoor = leaf;
    }
    const exitRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.7 }));
    exitRing.position.set(-4.3, 0.02, 2.5);
    s.add(exitRing);

    // 가구 (직접 만든 모델 — 침대·책상·주방·냉장고·TV·테이블·신발장·화분·러그·커튼·액자)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
    this.bedLamp = lampMat;
    furnishHome(s, { lampMat, win: { x0: winX0, x1: winX1, z: z0 }, H, eastX: x1 - 0.075 });
    // 소파는 TV 쪽(북쪽 = -z)을 본다. 직접 만든 모델이라 앉고 눕는 자세와 쿠션이 딱 맞는다
    const sofa = buildSofa();
    sofa.position.set(3.4, 0, 3.4);
    s.add(sofa);
    // 북쪽 벽 달력
    {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 300;
      const g = cv.getContext('2d')!;
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      const c = HOME.calendar;
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.73), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
      page.position.set(c.x, c.y, c.z);
      s.add(page);
      box(0.05, 0.05, 0.04, std(0x444444), c.x, c.y + 0.4, c.z + 0.03); // 못
      this.wallCal = { g, tex: t, key: '' };
    }
    // 자는 동안 덮는 두툼한 이불 (평소엔 숨김)
    this.duvet = sleepDuvet();
    this.duvet.position.set(3.55, 0.86, -1.85);
    this.duvet.visible = false;
    s.add(this.duvet);

    // 천장 조명 (실내는 작아서 점광원 2개)
    for (const [lx, lz] of [[-1.5, -1], [2.5, 1]]) {
      const l = new THREE.PointLight(0xffffff, 8, 9, 1.6);
      l.position.set(lx, H - 0.2, lz);
      l.castShadow = false;
      s.add(l);
      this.homeLights.push(l);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      disc.position.set(lx, H - 0.03, lz);
      s.add(disc);
    }
  }
}

/** 집 북쪽 벽 창문 (방 좌표): 바깥 빌라 창과 같은 구멍 */
const HOME_WIN = { x0: -2.6, x1: 1.6, y0: 0.95, y1: 2.35 };

const QUALITY_KEY = 'iron-fist.cityQuality';

/** 이 브라우저에서 마지막으로 맞춰진 화질 단계 (없으면 0 = 최고) */
function loadQuality(): number {
  try {
    const q = Number(localStorage.getItem(QUALITY_KEY));
    return Number.isInteger(q) && q >= 0 && q <= 5 ? q : 0;
  } catch {
    return 0;
  }
}

function saveQuality(q: number) {
  try {
    localStorage.setItem(QUALITY_KEY, String(q));
  } catch {
    // 저장소를 못 쓰면 다음에도 최고 화질부터 시작할 뿐
  }
}

/**
 * 1인칭용 실내 껍데기: 남쪽(3인칭 카메라 쪽) 벽 위쪽과 천장. 처음엔 감춰 두고 1인칭일 때만 보인다.
 * @param low 원래 남쪽 벽 높이 · H 천장 높이 · gaps 문 자리 [x0, x1, 문 위 높이]
 * @param ceil 천장을 덮을 범위 (없으면 r)
 */
function fpShell(parent: THREE.Object3D, r: { x0: number; x1: number; z0: number; z1: number }, low: number, H: number, color: number, gaps: [number, number, number][] = [], ceil = r): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const add = (w: number, y0: number, x: number) => {
    if (w <= 0.01 || H - y0 <= 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H - y0, 0.14), mat);
    m.position.set(x, (y0 + H) / 2, r.z1 + 0.01);
    m.visible = false;
    m.userData.keepMaterial = true;
    parent.add(m);
    out.push(m);
  };
  let x = r.x0;
  for (const [g0, g1, top] of [...gaps].sort((a, b) => a[0] - b[0])) {
    add(g0 - x, low, (x + g0) / 2);
    add(g1 - g0, top, (g0 + g1) / 2);
    x = g1;
  }
  add(r.x1 - x, low, (x + r.x1) / 2);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(ceil.x1 - ceil.x0, ceil.z1 - ceil.z0), new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 1 }));
  c.rotation.x = Math.PI / 2;
  c.position.set((ceil.x0 + ceil.x1) / 2, H + 0.005, (ceil.z0 + ceil.z1) / 2);
  c.visible = false;
  c.userData.keepMaterial = true;
  parent.add(c);
  out.push(c);
  return out;
}
