'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import type { PlayerProfile } from '@/game/core/profile';
import { CityWorld, SOFA_ACTS, sleptLabel, type CityInput } from '@/game/city/cityWorld';
import { P1_KEYS } from '@/game/core/input';
import { bindCodes, bindLabel, type BindAction } from '@/game/core/keybinds';
import CityTouchControls from './CityTouchControls';
import { useIsTouch } from './TouchControls';
import KeySettings from './KeySettings';
import type { Buttons } from '@/game/core/types';
import { makeClock } from '@/game/render/clock';
import { CityRenderer } from '@/game/render/cityRenderer';
import { loadProgress } from '@/game/render/loadTracker';
import InventoryPanel from './InventoryPanel';
import { LifeBars } from './LifeBar';
import CityMapOverlay from './CityMapOverlay';
import ParkMapOverlay from './ParkMapOverlay';
import ParkGuide from './ParkGuide';
import RideStaffTalk from './RideStaffTalk';
import { drawParkBase, drawParkPlayer } from './parkMapDraw';
import JobPanel from './JobPanel';
import CalendarPanel from './CalendarPanel';
import GearPanel from './GearPanel';
import WardrobeView from './WardrobeView';
import CasinoPanel from './CasinoPanel';
import KaraokePanel from './KaraokePanel';
import KaraokeDeskPanel from './KaraokeDeskPanel';
import { KARAOKE_ACTS } from '@/game/city/karaoke';
import BusPanel from './BusPanel';
import ChatBox from './ChatBox';
import VoicePanel from './VoicePanel';
import PcRoomPanel, { type PcGame } from './PcRoomPanel';
import PetPanel from './PetPanel';
import FishingPanel, { type FishTab } from './FishingPanel';
import FishingShopPanel, { type FishShopTab } from './FishingShopPanel';
import FishingHud from './FishingHud';
import ClothesShopPanel from './ClothesShopPanel';
import type { ClothesCorner } from '@/game/city/store';
import type { CosmeticSlot } from '@/game/data/fashion';
import { shortDay } from '@/game/city/calendar';
import { WEATHER_LABEL, type WeatherKind } from '@/game/city/weather';
import { sharedNow, syncWorldClock } from '@/game/city/worldClock';
import ShopDialog from './ShopDialog';
import NpcChatPanel from './NpcChatPanel';
import TvPanel, { TvRemote, TvScreen, placeTvBox, tvCommand } from './TvPanel';
import { tvPlay as tvPlayShared, tvPos, tvReset, tvState, type TvVideo } from '@/game/city/tvState';
import { PerfProbe } from '@/game/render/perfProbe';
import { TownLink } from '@/game/net/town';
import { VoiceLink } from '@/game/net/voice';
import type { Account } from '@/game/net/auth';
import { attachZoomControls } from './zoomControls';
import { GraphicsSettings, SoftwareGpuNotice } from './GraphicsSettings';

interface CityHud {
  location: 'city' | 'home' | 'lobby' | 'corridor' | 'store' | 'park';
  floor: number;
  clock: string;
  day: number;
  daylight: number;
  weather: WeatherKind;
  prompt: string | null;
  toast: string | null;
  police: string | null;
  caught: boolean;
  gold: number;
  hp: number;
  maxHp: number;
  downed: boolean;
  /** 덤비는 행인 수 */
  attackers: number;
  fatigue: number;
  hungerRate: number;
  care: string | null;
  hunger: number;
  /** 대화 중인 가게 간판 (없으면 null) */
  dialog: string | null;
  /** 이야기 중인 대화형 NPC id (없으면 null) */
  npcChat: string | null;
  /** 엘리베이터 층 고르기 (열려 있으면 꼭대기 층 수, 지금 층, 내 집 층) */
  elevator: { top: number; here: number; mine: number } | null;
  /** 창밖 내다보는 중 */
  lookOut: boolean;
  /** 소파에 있으면 지금 동작 */
  sofa: string | null;
  /** 코인노래방 내 방 안: 지금 노래 동작 · 남은 곡 */
  karaoke: { act: string | null; songs: number; room: number } | null;
  /** 1인칭 (마우스로 보는 중이면 mouse) */
  fp: { mouse: boolean } | null;
  /** 지금 장소 이름 (내 집 호수·친구 집 포함) */
  place: string;
  /** 마을 접속 상태 (로그인 안 했으면 null) */
  online: { status: string; friends: string[]; ping: number | null } | null;
  /** 근무 현황 (근무 중이 아니면 null) */
  job: { name: string; left: string; checked: number; pay: number; alert: string | null; auto: boolean; fighting: boolean; autoPatrol: boolean; hunt: boolean } | null;
  payslip: string | null;
  jobPanelRequest: boolean;
  /** 잠자는 단계, 12시간 중 잔 비율, 잔 시간(ms) */
  sleep: 'walk' | 'lie' | 'sleep' | 'wake' | null;
  night: number;
  slept: number;
}

// 키는 키 설정(keybinds)을 따른다 — 기본: 방향키 이동, Q W A S 공격, 스페이스 점프, Shift 달리기, E 상호작용
const has = (action: BindAction, code: string) => bindCodes(action).includes(code);
/** 이동 키 → 방향 */
function moveOf(code: string): [number, number] | null {
  if (has('up', code)) return [0, -1];
  if (has('down', code)) return [0, 1];
  if (has('left', code)) return [-1, 0];
  if (has('right', code)) return [1, 0];
  return null;
}

/** 글자 입력칸에 치는 중인가 */
function typingIn(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/** 키보드 → 도시 입력. 카메라가 북쪽을 보고 있으므로 화면 위 = -z */
class CityKeyboard {
  private down = new Set<string>();
  /** 터치 조이스틱이 보낸 키 (진짜 키보드가 아님): 터치에선 조이스틱 아래로 숙인다 */
  private synthetic = new Set<string>();
  private pressed = false;
  /** 점프 키(Space)를 새로 눌렀다 (낚시 연타: 짧게 톡 쳐도 놓치지 않게) */
  private tapped = false;
  private skillTap: CityInput['skill'];
  /** 대각선에서 키 하나를 먼저 뗐을 때 잠깐 대각선을 유지 (멈출 때 방향이 꺾이지 않게) */
  private lastDiag: { x: number; z: number } | null = null;
  private diagGrace = 0;
  private onDown = (e: KeyboardEvent) => {
    // 이름 입력칸 등에 글자를 칠 땐 게임 키로 쓰지 않는다
    if (typingIn(e)) return;
    if (!e.repeat && (e.code === 'KeyR' || e.code === 'KeyX' || e.code === 'KeyY')) {
      this.skillTap = e.code === 'KeyR' ? 'flyingKick' : e.code === 'KeyX' ? 'tornadoKick' : 'backTurnKick';
      e.preventDefault();
    }
    if (moveOf(e.code) || has('interact', e.code) || has('jump', e.code)) e.preventDefault();
    if (has('interact', e.code) && !e.repeat) this.pressed = true;
    if (has('jump', e.code) && !e.repeat) this.tapped = true;
    this.down.add(e.code);
    if (e.isTrusted) this.synthetic.delete(e.code);
    else this.synthetic.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    // 점프 키를 뗄 때 브라우저 기본 동작(스페이스 = 눌린 버튼 다시 클릭, Alt = 메뉴)을 막는다
    if (has('jump', e.code)) e.preventDefault();
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
    this.skillTap = undefined;
  };

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
  read(): CityInput {
    let x = 0;
    let z = 0;
    for (const k of this.down) {
      const m = moveOf(k);
      if (m) {
        x += m[0];
        z += m[1];
      }
    }
    const interact = this.pressed;
    const jumpTap = this.tapped;
    const skill = this.skillTap;
    this.tapped = false;
    this.pressed = false;
    this.skillTap = undefined;
    // 대각선 → 한 방향: 두 키를 정확히 동시에 떼기는 어렵다. 6프레임 동안은 대각선으로 본다
    if (x && z) {
      this.lastDiag = { x, z };
      this.diagGrace = 6;
    } else if ((x || z) && this.lastDiag && this.diagGrace > 0 && (x === 0 || x === this.lastDiag.x) && (z === 0 || z === this.lastDiag.z)) {
      this.diagGrace--;
      x = this.lastDiag.x;
      z = this.lastDiag.z;
    } else {
      this.diagGrace = 0;
      if (!x && !z) this.lastDiag = null;
    }
    return {
      move: x || z ? { x, z } : null,
      run: bindCodes('run').some((k) => this.down.has(k)),
      crouch: bindCodes('run').some((k) => this.down.has(k)),
      buttons: P1_KEYS.buttons.map((k) => this.down.has(k)) as Buttons,
      jump: bindCodes('jump').some((k) => this.down.has(k)),
      // 키보드는 숙이기 키(C)로, 터치는 조이스틱 아래로 숙인다 (키보드 ↓ 는 그냥 걷기)
      duck: bindCodes('crouch').some((k) => this.down.has(k)),
      down: bindCodes('down').some((k) => this.down.has(k) && this.synthetic.has(k)),
      interact,
      jumpTap,
      skill,
    };
  }
}

/** 서울 라이프: 도시 + 내 집 (일상 모드) */
export default function CityView({ profile, account, onExit, onPlay }: { profile: PlayerProfile; account: Account | null; onExit: () => void; /** PC방에서 고른 게임 하러 가기 (끝나면 서울로 돌아온다) */ onPlay?: (g: PcGame) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<CityWorld | null>(null);
  const perfRef = useRef<HTMLDivElement>(null);
  const touch = useIsTouch();
  const [hud, setHud] = useState<CityHud | null>(null);
  const [skillBody, setSkillBody] = useState(profile.body === 'smallSilverGirl');
  const [menu, setMenu] = useState(false);
  const [inventory, setInventory] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const [jobs, setJobs] = useState(false);
  const [calendar, setCalendar] = useState(false);
  /** 거실 TV: 틀고 있는 영상 · 리모컨(검색) 창 · 재생 상태 */
  const [tv, setTv] = useState<TvVideo | null>(null);
  /** 음성 대화·전화 (로그인했을 때만) */
  const [voice, setVoice] = useState<VoiceLink | null>(null);
  const [tvPanel, setTvPanel] = useState(false);
  const [tvPlay, setTvPlay] = useState<{ playing: boolean; error: number | null }>({ playing: false, error: null });
  const tvBoxRef = useRef<HTMLDivElement>(null);
  const tvFrameRef = useRef<HTMLIFrameElement>(null);
  const tvPanelRef = useRef(tvPanel);
  tvPanelRef.current = tvPanel;
  const [gear, setGear] = useState(false);
  const [casino, setCasino] = useState(false);
  const [karaoke, setKaraoke] = useState(false);
  const [karaokeDesk, setKaraokeDesk] = useState(false);
  const karaokeDeskRef = useRef(karaokeDesk);
  karaokeDeskRef.current = karaokeDesk;
  const [bus, setBus] = useState(false);
  const [pcRoom, setPcRoom] = useState(false);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const [pets, setPets] = useState<null | 'shop' | 'care'>(null);
  const [adoptPick, setAdoptPick] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  /** 로딩 화면 (모델 받기 → 그래픽 준비). 끝나면 null */
  const [loading, setLoading] = useState<{ stage: 'models' | 'shaders'; done: number; total: number } | null>({ stage: 'models', done: 0, total: 0 });
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const bigMapRef = useRef(bigMap);
  bigMapRef.current = bigMap;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const calRef = useRef(calendar);
  calRef.current = calendar;
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const casinoRef = useRef(casino);
  casinoRef.current = casino;
  const karaokeRef = useRef(karaoke);
  karaokeRef.current = karaoke;
  const busRef = useRef(bus);
  busRef.current = bus;
  const pcRoomRef = useRef(pcRoom);
  pcRoomRef.current = pcRoom;
  const petsRef = useRef(pets);
  petsRef.current = pets;
  // 낚시 도감 (F) · 낚시마트 계산대
  const [fishDex, setFishDex] = useState<FishTab | null>(null);
  const fishDexRef = useRef(fishDex);
  fishDexRef.current = fishDex;
  const [fishShop, setFishShop] = useState<FishShopTab | null>(null);
  const fishShopRef = useRef(fishShop);
  fishShopRef.current = fishShop;
  const [clothes, setClothes] = useState<ClothesCorner | 'all' | null>(null);
  const clothesRef = useRef(clothes);
  clothesRef.current = clothes;
  // 코디 창 (O · 탈의실): 캐릭터를 돌려 보며 옷 입기
  const [wardrobe, setWardrobe] = useState<{ shop: boolean; slot?: CosmeticSlot; tryIds?: string[] } | null>(null);
  const wardrobeRef = useRef(wardrobe);
  wardrobeRef.current = wardrobe;

  useEffect(() => {
    const timer = window.setInterval(() => setSkillBody(profile.body === 'smallSilverGirl'), 250);
    return () => window.clearInterval(timer);
  }, [profile]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const kb = new CityKeyboard();
    kb.attach();
    const world = new CityWorld({
      read: () => {
        const input = kb.read();
        return menuRef.current || bigMapRef.current || jobsRef.current || calRef.current || gearRef.current || casinoRef.current || karaokeRef.current || karaokeDeskRef.current || busRef.current || pcRoomRef.current || petsRef.current || wardrobeRef.current || fishDexRef.current || fishShopRef.current
          ? { move: null, run: false, interact: false }
          : input;
      },
    }, profile);
    // 개발 중 화면 점검용 (배포판에는 없다)
    if (process.env.NODE_ENV === 'development') (window as unknown as { __city?: CityWorld }).__city = world;
    worldRef.current = world;
    // 날짜·시각·날씨는 모두가 같이 쓰는 동네 시계를 따른다 (서버 시각에 맞춘 뒤, 1분마다 다시 맞춘다)
    world.attachSharedClock(sharedNow);
    void syncWorldClock();
    const clockTimer = window.setInterval(() => void syncWorldClock(2), 60_000);
    // 새로고침해도 마지막에 있던 곳에서 이어서 (이 브라우저에 계정별로 기억)
    const placeKey = `ironfist:place:${account?.userId ?? 'guest'}`;
    try {
      world.restorePlace(JSON.parse(localStorage.getItem(placeKey) ?? 'null'));
    } catch {
      /* 저장된 값이 깨졌으면 평소처럼 집 앞에서 */
    }
    // 자다가 창을 닫았으면 침대에서 계속 잔다
    world.resumeSleep();
    const savePlace = () => {
      const s = world.placeSnapshot();
      if (!s) return;
      try {
        localStorage.setItem(placeKey, JSON.stringify(s));
      } catch {
        /* 저장 공간을 못 쓰면 그냥 넘어간다 */
      }
    };
    const placeTimer = window.setInterval(savePlace, 2000);
    window.addEventListener('pagehide', savePlace);
    const renderer = new CityRenderer(canvas, world);
    if (process.env.NODE_ENV === 'development') (window as unknown as { __cr?: CityRenderer }).__cr = renderer;
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);
    const detachZoom = attachZoomControls(renderer, 0.15, 2.4);
    const probe = new PerfProbe();
    // 로그인했으면 마을에 접속해서 친구들과 같이 논다
    const link = account ? new TownLink(world, account) : null;
    link?.start();
    // 음성 대화·전화: 근처 이웃과 자동 연결, 전화는 거리와 상관없이
    const voiceLink = account ? new VoiceLink(world, account) : null;
    voiceLink?.start();
    setVoice(voiceLink);
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e)) return;
      // NPC 와 대화 중엔 글자를 입력하므로 게임 단축키를 막는다 (Esc 로만 닫기)
      if (world.npcChat) {
        if (e.code === 'Escape') world.closeNpcChat();
        return;
      }
      // 엘리베이터: 숫자 키로 층 고르기, Esc 로 내리지 않고 닫기
      if (world.elevatorOpen) {
        const n = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (n) world.rideElevator(Number(n[2]));
        else if (e.code === 'Escape') world.closeElevator();
        return;
      }
      // 창밖 내다보기: Esc 돌아오기, C 창문 닫고 돌아오기 (E 는 게임 입력으로 처리)
      if (world.lookingOut) {
        if (e.code === 'Escape') world.stopLookOut();
        else if (e.code === 'KeyC' && !e.repeat) world.stopLookOut(true);
        return;
      }
      // 소파: 숫자 키 1~6 으로 동작 바꾸기
      if (world.inMyBooth() && !e.repeat) {
        const n = /^(Digit|Numpad)([1-6])$/.exec(e.code);
        if (n) {
          world.karaokeAct(KARAOKE_ACTS[Number(n[2]) - 1].id);
          return;
        }
      }
      if (world.seat?.spot === 'sofa' && world.seatBooth === null && !e.repeat) {
        const n = /^(Digit|Numpad)([1-6])$/.exec(e.code);
        if (n) {
          world.sofaAction(SOFA_ACTS[Number(n[2]) - 1].id);
          return;
        }
      }
      if (e.code === 'KeyM' && !e.repeat && !world.dialog) setBigMap((v) => !v);
      if (e.code === 'Escape') {
        // 대화·지도부터 닫는다
        if (world.dialog) world.closeDialog();
        else if (wardrobeRef.current) setWardrobe(null);
        else if (bigMapRef.current) setBigMap(false);
        else if (jobsRef.current) setJobs(false);
        else if (calRef.current) setCalendar(false);
        else if (tvPanelRef.current) setTvPanel(false);
        else if (gearRef.current) setGear(false);
        else if (casinoRef.current) setCasino(false);
        else if (karaokeRef.current) setKaraoke(false);
        else if (karaokeDeskRef.current) setKaraokeDesk(false);
        else if (busRef.current) setBus(false);
        else if (pcRoomRef.current) setPcRoom(false);
        else if (petsRef.current) setPets(null);
        else if (clothesRef.current) setClothes(null);
        else if (fishDexRef.current) setFishDex(null);
        else if (fishShopRef.current) setFishShop(null);
        else setMenu((m) => !m);
      }
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
      if (e.code === 'KeyJ' && !e.repeat && !world.dialog) setJobs((v) => !v);
      if (e.code === 'KeyG' && !e.repeat && world.job) world.job.toggleAuto();
      if (e.code === 'KeyP' && !e.repeat && world.job) world.job.toggleAutoPatrol();
      if (e.code === 'KeyT' && !e.repeat && !world.dialog) setGear((v) => !v);
      if (e.code === 'KeyO' && !e.repeat && !world.dialog) setWardrobe((v) => (v ? null : { shop: false }));
      if (e.code === 'KeyK' && !e.repeat && !world.dialog) setPets((v) => (v ? null : 'care'));
      // F: 낚시 도감 · 확률표 · 낚시 방법
      if (e.code === 'KeyF' && !e.repeat && !world.dialog) {
        setFishShop(null);
        setFishDex((v) => (v ? null : 'dex'));
      }
      // V: 음성 대화 마이크 켜기/끄기
      if (e.code === 'KeyV' && !e.repeat) void voiceLink?.toggleMic();
      // B: 1인칭 ↔ 3인칭 (V 는 음성 대화로 옮겼다)
      if (e.code === 'KeyB' && !e.repeat) {
        world.toggleFirstPerson();
        if (!world.firstPerson && document.pointerLockElement) document.exitPointerLock();
      }
      // F3: 성능 표시기 (FPS·그리기 횟수·메모리)
      if (e.code === 'F3') {
        e.preventDefault();
        if (!e.repeat) perfOn = !perfOn;
        probe.setPinging(perfOn);
        if (perfRef.current) perfRef.current.style.display = perfOn ? 'block' : 'none';
      }
    };
    window.addEventListener('keydown', onKey);
    // 1인칭: 화면을 누르면 마우스를 잡아 둘러보기 (Esc 로 풀린다)
    const onCanvasDown = () => {
      if (world.firstPerson && !document.pointerLockElement) void canvas.requestPointerLock?.();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) world.fpLook(e.movementX, e.movementY);
    };
    const onLockChange = () => {
      world.fpMouse = document.pointerLockElement === canvas;
    };
    canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    /** TV 상태 버전: 바뀌면 (내가 틀었든 친구가 틀었든) 화면을 따라 바꾼다 */
    let tvRev = tvState.rev;
    let tvShownId: string | null = null;
    let lastKey = '';
    let lastHud = -Infinity;
    let perfOn = false;
    let lastPerf = 0;
    // 로딩 화면: 모델을 다 받고 그래픽(셰이더·텍스처)을 미리 준비한 뒤 시작한다. 그동안 게임 시간은 멈춰 있다
    let ready = false;
    let stage: 'models' | 'shaders' = 'models';
    let lastLoadUi = 0;
    let cancelled = false;
    // 서버에서 받으면 느린 인터넷에선 20초를 넘길 수 있다 — 덜 받은 채 시작하면 모델이 하나씩 뜰 때마다 멈칫하므로
    // 끝까지 기다리고, 받기가 아예 멈춘 경우에만 90초 뒤 그냥 시작한다
    void Promise.race([renderer.warmUp((st) => (stage = st)), new Promise((r) => setTimeout(r, 90000))]).then(() => {
      if (cancelled) return;
      ready = true;
      setLoading(null);
    });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!ready) {
        last = now;
        if (now - lastLoadUi > 120) {
          lastLoadUi = now;
          setLoading({ stage, ...loadProgress() });
        }
        return;
      }
      // 그리기 상한: 초당 60번 (144Hz 모니터에서 두 배 넘게 그리며 CPU 를 먹지 않게).
      // 다른 창을 보고 있을 땐(포커스 없음) 초당 20번. 게임 시간은 쌓인 만큼 그대로 계산하므로 느려지지 않는다
      const cap = document.hasFocus() ? 1000 / 60 : 1000 / 20;
      if (now - last < cap * 0.8) return;
      const interval = now - last;
      const dt = Math.min(interval, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= FRAME_MS && steps < 5) {
        world.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;
      const t1 = performance.now();
      // 집을 나가면 TV 도 끈다
      if ((tvState.now || tvState.changeAt) && world.location !== 'home') {
        tvReset();
        tvRev = tvState.rev;
        tvShownId = null;
        setTv(null);
        setTvPanel(false);
      }
      if (tvRev !== tvState.rev) {
        tvRev = tvState.rev;
        const v = tvState.now;
        if ((v?.id ?? null) !== tvShownId) {
          // 다른 영상: 새로 띄운다 (시작 위치는 TvScreen 이 주소에 넣는다)
          tvShownId = v?.id ?? null;
          setTv(v);
          setTvPlay({ playing: false, error: null });
        } else if (v) {
          // 같은 영상: 위치와 멈춤만 맞춘다
          tvCommand(tvFrameRef.current, 'seekTo', [tvPos(), true]);
          tvCommand(tvFrameRef.current, tvState.pausedAt !== null ? 'pauseVideo' : 'playVideo');
        }
      }
      renderer.sync(world, makeClock(world.frame, acc / FRAME_MS, world.hitstop > 0, dt));
      placeTvBox(tvBoxRef.current, renderer.tvCorners());
      const t2 = performance.now();
      link?.tick(now);
      const st = renderer.stats();
      probe.frame({ interval, logic: t1 - t0, draw: t2 - t1, steps, location: world.location, stats: st }, now);

      if (perfOn && now - lastPerf > 500 && perfRef.current) {
        lastPerf = now;
        const s = st;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        perfRef.current.textContent =
          `FPS ${s.fps.toFixed(0)}  화질 ${s.quality}/8\n` +
          `그리기 ${s.calls}회  삼각형 ${(s.tris / 1000).toFixed(0)}k\n` +
          `지오메트리 ${s.geometries}  텍스처 ${s.textures}  셰이더 ${s.programs}` +
          (mem ? `\nJS 메모리 ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : '') +
          `\n${probe.text(now)}`;
      }

      // 화면 위 글자(HUD)는 0.08초마다만 새로 만든다 (매 프레임 비교하던 것을 줄여서 가볍게)
      const hudDue = now - lastHud >= 80 || world.jobPanelRequest || world.calendarRequest || world.tvRequest || world.casinoRequest || world.karaokeRequest || world.karaokeDeskRequest || world.busRequest || world.pcRoomRequest || world.petShopRequest || !!world.petAdoptRequest || !!world.clothesShopRequest || world.wardrobeRequest || !!world.fishingShopRequest || !!world.fishDexRequest;
      const h: CityHud | null = !hudDue ? null : {
        location: world.location,
        floor: world.floor,
        clock: world.clock,
        day: world.day,
        daylight: Math.round(world.daylight * 10) / 10,
        weather: world.weather.kind,
        prompt: world.promptLabel,
        job: world.job
          ? {
              name: `${world.job.job.icon} ${world.job.job.name}`,
              left: fmtFrames(world.job.remainingFrames),
              checked: world.job.checked,
              pay: world.job.earnedBase + world.job.bonus,
              alert: world.job.alert,
              auto: world.job.autoCheck,
              fighting: !!world.job.robber,
              autoPatrol: world.job.autoPatrol,
              hunt: !!world.job.hunt,
            }
          : null,
        payslip: world.payslip && world.frame < world.payslip.until ? world.payslip.text : null,
        jobPanelRequest: world.jobPanelRequest,
        toast: world.toast?.text ?? null,
        police: world.policeStatus,
        caught: world.caughtAt !== null,
        gold: profile.gold,
        hp: world.player.hp,
        maxHp: world.player.maxHp,
        downed: world.downedAt !== null,
        attackers: world.npcs.filter((n) => n.fight > 0).length,
        fatigue: Math.round(profile.life.fatigue),
        hunger: Math.round(profile.life.hunger),
        hungerRate: Math.round(world.hungerRate * 10) / 10,
        care: world.careLabel,
        dialog: world.dialog?.shop ?? null,
        npcChat: world.npcChat?.npc ?? null,
        elevator: world.elevatorOpen
          ? { top: world.villaFloors, here: world.location === 'lobby' ? 1 : world.floor, mine: Number(world.homeUnit.slice(0, -2)) || 0 }
          : null,
        lookOut: world.lookingOut,
        sofa: world.seat?.spot === 'sofa' && world.seat.phase !== 'stand' && world.seatBooth === null ? world.sofa.id : null,
        karaoke: world.inMyBooth() && world.karaokeRental ? { act: world.seat?.spot === 'sofa' && world.seat.phase !== 'stand' && world.seatBooth !== null ? world.sofa.id : null, songs: world.karaokeRental.songs, room: world.karaokeRental.room } : null,
        fp: world.firstPerson ? { mouse: world.fpMouse } : null,
        place: world.placeLabel,
        online: link ? { status: link.status, friends: link.friends, ping: link.ping === null ? null : Math.round(link.ping) } : null,
        sleep: world.sleepView?.phase ?? null,
        night: Math.round((world.sleepView?.night ?? 0) * 100) / 100,
        slept: Math.floor((world.sleepView?.slept ?? 0) / 60_000) * 60_000,
      };
      if (world.jobPanelRequest) {
        world.jobPanelRequest = false;
        setJobs(true);
      }
      if (world.tvRequest) {
        world.tvRequest = false;
        setTvPanel(true);
      }
      if (world.calendarRequest) {
        world.calendarRequest = false;
        setCalendar(true);
      }
      if (world.casinoRequest) {
        world.casinoRequest = false;
        setCasino(true);
      }
      if (world.karaokeRequest) {
        world.karaokeRequest = false;
        setKaraoke(true);
      }
      if (world.karaokeDeskRequest) {
        world.karaokeDeskRequest = false;
        setKaraokeDesk(true);
      }
      if (world.busRequest) {
        world.busRequest = false;
        setBus(true);
      }
      if (world.pcRoomRequest) {
        world.pcRoomRequest = false;
        if (onPlayRef.current) setPcRoom(true);
        else world.say('🖥️ PC방 — 지금은 이용할 수 없어요');
      }
      // 옷가게 창은 띄운 채로 걸어 다닐 수 있다 (입어본 옷을 입고 둘러보기). 가게를 벗어나면 닫는다
      if (clothesRef.current && world.location !== 'store') setClothes(null);
      if (world.clothesShopRequest) {
        setClothes(world.clothesShopRequest);
        world.clothesShopRequest = null;
      }
      if (world.wardrobeRequest) {
        world.wardrobeRequest = false;
        setClothes(null);
        // 옷가게 탈의실이면 안 산 옷도 입어 보고 살 수 있게
        setWardrobe({ shop: world.store?.kind === 'clothes' });
      }
      if (world.fishingShopRequest) {
        setFishShop(world.fishingShopRequest);
        world.fishingShopRequest = null;
      }
      if (world.fishDexRequest) {
        setFishDex(world.fishDexRequest);
        world.fishDexRequest = null;
      }
      if (fishShopRef.current && world.location !== 'store') setFishShop(null);
      if (world.petShopRequest) {
        world.petShopRequest = false;
        setAdoptPick(null);
        setPets('shop');
      }
      // 놀이터의 아이에게 다가가 E: 그 아이 분양 창
      if (world.petAdoptRequest) {
        setAdoptPick(world.petAdoptRequest.id);
        world.petAdoptRequest = null;
        setPets('shop');
      }
      if (h) {
        lastHud = now;
        const key = JSON.stringify(h);
        if (key !== lastKey) {
          lastKey = key;
          setHud(h);
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      kb.detach();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('mousedown', onCanvasDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement) document.exitPointerLock();
      detachZoom();
      link?.stop();
      voiceLink?.stop();
      setVoice(null);
      probe.dispose();
      renderer.dispose();
      savePlace();
      window.clearInterval(placeTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener('pagehide', savePlace);
      worldRef.current = null;
    };
  }, [profile, account]);

  const night = hud ? hud.daylight < 0.5 : false;

  return (
    <div className="relative isolate h-screen w-screen overflow-hidden bg-black text-white">
      <TvScreen video={tv} boxRef={tvBoxRef} frameRef={tvFrameRef} onState={(s) => setTvPlay((p) => ({ playing: s.playing ?? p.playing, error: s.error ?? p.error }))} />
      <canvas ref={canvasRef} className="block h-full w-full" />
      {loading && <LoadingScreen {...loading} />}
      {/* 폰·태블릿: 화면 조작 버튼 (뒤에 그려지는 창들이 이 위를 덮는다) */}
      {touch && !loading && <CityTouchControls skills={skillBody} />}
      {!touch && skillBody && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-lg border border-white/15 bg-black/55 px-3 py-2 text-xs text-white/85">
          <span className="font-bold text-amber-300">R</span> 날라차기 <span className="mx-1 text-white/40">·</span>{' '}
          <span className="font-bold text-amber-300">X</span> 회오리 차기
          <span className="mx-1 text-white/40">·</span>{' '}
          <span className="font-bold text-amber-300">Y</span> 뒤돌려차기
        </div>
      )}
      {!loading && worldRef.current && <ChatBox world={worldRef.current} touch={touch} />}
      {!loading && <VoicePanel voice={voice} touch={touch} />}
      <div
        ref={perfRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute bottom-2 right-2 z-50 whitespace-pre rounded bg-black/70 px-2 py-1 font-mono text-[11px] leading-tight text-lime-300"
      />

      {hud && !wardrobe && (
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* 위치 · 시간 · 돈 */}
          <div className="absolute left-4 top-4 rounded-lg border border-white/15 bg-black/45 px-4 py-3 backdrop-blur-sm">
            <div className="text-xs text-white/60">{hud.place}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums">{hud.clock}</span>
              <span className="text-sm" title={WEATHER_LABEL[hud.weather].name}>
                {hud.weather === 'clear' ? (night ? '🌙' : '☀️') : WEATHER_LABEL[hud.weather].icon}
                <span className="ml-1 text-xs text-white/70">{hud.weather === 'clear' && night ? '맑은 밤' : WEATHER_LABEL[hud.weather].name}</span>
              </span>
              <span className="text-xs text-white/60">{shortDay(hud.day)}</span>
            </div>
            <div className="mt-1 text-sm">
              <span className="text-amber-300">Lv.{profile.level}</span>
              <span className="ml-3 text-amber-200">{hud.gold.toLocaleString()} G</span>
            </div>
            <HpBar hp={hud.hp} maxHp={hud.maxHp} />
            <LifeBars fatigue={hud.fatigue} hunger={hud.hunger} hungerRate={hud.hungerRate} />
            {hud.online && <OnlineBadge online={hud.online} />}
          </div>

          <Minimap worldRef={worldRef} />
          {worldRef.current && <ParkGuide world={worldRef.current} touch={touch} onMap={() => setBigMap(true)} />}
          {worldRef.current && <RideStaffTalk world={worldRef.current} />}

          {/* 상호작용 안내 */}
          {hud.prompt && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/50 bg-black/60 px-5 py-2 text-sm">
              <kbd className="mr-2 rounded bg-amber-300 px-1.5 py-0.5 text-xs font-black text-black">E</kbd>
              {hud.prompt}
            </div>
          )}
          {hud.police && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 animate-pulse rounded-lg border border-red-400/60 bg-gradient-to-r from-red-900/80 to-blue-900/80 px-5 py-2 text-sm font-bold">
              {hud.police}
            </div>
          )}
          {hud.attackers > 0 && !hud.police && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-orange-400/60 bg-orange-900/70 px-5 py-2 text-sm font-bold">
              😠 행인 {hud.attackers}명이 덤비고 있다! 맞서 싸우거나 {bindLabel('run')} 로 도망치자
            </div>
          )}
          {hud.downed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="text-5xl font-black text-orange-300">💫 쓰러졌습니다</div>
              <div className="mt-3 text-white/80">잠시 후 집에서 깨어납니다…</div>
            </div>
          )}
          {hud.caught && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="text-5xl font-black text-red-400">🚔 경찰에게 잡혔습니다</div>
              <div className="mt-3 text-white/80">잠시 후 집 앞에서 다시 시작합니다…</div>
            </div>
          )}
          <SleepOverlay hud={hud} />
          {hud.care && (
            <div className="absolute bottom-40 left-1/2 -translate-x-1/2 rounded-full border border-emerald-300/50 bg-emerald-900/70 px-5 py-2 text-sm font-bold">
              🤖 {hud.care}
            </div>
          )}
          {hud.job && (
            <div className="absolute left-4 top-[230px] w-64 rounded-lg border border-sky-400/40 bg-black/60 p-3 text-sm">
              <div className="flex justify-between font-bold">
                <span>{hud.job.name} 근무 중</span>
                <span className="tabular-nums text-sky-300">{hud.job.left}</span>
              </div>
              <div className="mt-1 text-xs text-white/70">
                확인 {hud.job.checked}명 · 번 돈 <span className="text-amber-200">{hud.job.pay}G</span>
              </div>
              <button
                onClick={() => worldRef.current?.job?.toggleAuto()}
                className={`pointer-events-auto mt-2 w-full rounded px-2 py-1 text-xs font-bold ${
                  hud.job.auto ? (hud.job.fighting ? 'bg-red-500/80 text-white' : 'bg-emerald-500/80 text-black') : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {hud.job.auto ? (hud.job.fighting ? '🤖 자동 체크 일시정지 — 전투 중!' : '🤖 자동 체크 ON') : '🤖 자동 체크 OFF'} <span className="opacity-70">(G)</span>
              </button>
              <button
                onClick={() => worldRef.current?.job?.toggleAutoPatrol()}
                className={`pointer-events-auto mt-1 w-full rounded px-2 py-1 text-xs font-bold ${
                  hud.job.autoPatrol ? (hud.job.hunt ? 'animate-pulse bg-red-500/80 text-white' : 'bg-sky-500/80 text-black') : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {hud.job.autoPatrol ? (hud.job.hunt ? '🔦 자동 순찰 멈춤 — 강도 수색!' : '🔦 자동 순찰 ON') : '🔦 자동 순찰 OFF'} <span className="opacity-70">(P)</span>
              </button>
              {hud.job.alert && <div className={`mt-1.5 animate-pulse text-xs font-bold ${hud.job.hunt ? 'text-red-300' : 'text-orange-300'}`}>{hud.job.alert}</div>}
            </div>
          )}
          {hud.job?.hunt && (
            <div className="pointer-events-none absolute inset-0 animate-pulse border-[6px] border-red-500/60" />
          )}
          {hud.payslip && (
            <div className="absolute left-1/2 top-40 -translate-x-1/2 rounded-lg border border-amber-300/50 bg-black/80 px-5 py-3 text-sm font-bold">
              {hud.payslip}
            </div>
          )}
          {hud.fp && !hud.lookOut && (
            <>
              {/* 조준점 */}
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
              <div className="absolute bottom-16 right-4 rounded-lg bg-black/55 px-3 py-1.5 text-xs text-white/85">
                👀 1인칭 · ↑↓ 걷기 · {hud.fp.mouse ? '←→ 옆걸음 · 마우스 둘러보기 (Esc 풀기)' : '←→ 돌기 · 화면 클릭 = 마우스로 보기'} · B 되돌리기
              </div>
            </>
          )}
          {hud.toast && (
            <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-lg bg-black/70 px-5 py-2.5 text-base font-bold shadow-lg">
              {hud.toast}
            </div>
          )}

          <div className={`absolute bottom-4 left-4 rounded bg-black/45 px-3 py-2 text-xs leading-5 text-white/80 ${touch ? 'hidden' : ''}`}>
            <div>
              방향키 걷기 (두 번 톡 = 대시, 대시 중 {bindLabel('b2')}/{bindLabel('b4')} = 대시기) · {bindLabel('run')} 달리기 · {bindLabel('jump')} 점프 · {bindLabel('interact')} 상호작용
            </div>
            <div>
              {bindLabel('b1')} 왼팔 · {bindLabel('b2')} 오른팔 · {bindLabel('b3')} 왼다리 · {bindLabel('b4')} 오른다리 ({bindLabel('run')} = 아래) · Esc 메뉴에서 키 설정
            </div>
            <div>싸울 때 C 숙이기 (상단 공격 피하기)</div>
            <div>M 전체 지도 (누르면 자동 이동) · J 일자리 · T 장비 · O 코디 · I 인벤토리 · K 내 펫 · F 낚시 도감 · B 1인칭 · V 음성 대화 · 휠 / Ctrl+휠 줌 (Ctrl+0 원래대로) · Esc 메뉴</div>
          </div>
        </div>
      )}

      {bigMap && worldRef.current &&
        (worldRef.current.location === 'park' ? (
          <ParkMapOverlay world={worldRef.current} onClose={() => setBigMap(false)} />
        ) : (
          <CityMapOverlay world={worldRef.current} onClose={() => setBigMap(false)} />
        ))}
      {hud && worldRef.current && <FishingHud world={worldRef.current} />}
      {fishShop && worldRef.current && (
        <FishingShopPanel
          world={worldRef.current}
          start={fishShop}
          onClose={() => setFishShop(null)}
          onGuide={() => {
            setFishShop(null);
            setFishDex('odds');
          }}
        />
      )}
      {fishDex && worldRef.current && <FishingPanel key={fishDex} world={worldRef.current} start={fishDex} onClose={() => setFishDex(null)} />}
      {pets && worldRef.current && <PetPanel key={`${pets}:${adoptPick ?? ''}`} world={worldRef.current} mode={pets} pick={adoptPick} onClose={() => setPets(null)} />}
      {casino && worldRef.current && <CasinoPanel world={worldRef.current} onClose={() => setCasino(false)} />}
      {karaoke && worldRef.current && <KaraokePanel world={worldRef.current} onClose={() => setKaraoke(false)} />}
      {karaokeDesk && worldRef.current && <KaraokeDeskPanel world={worldRef.current} onClose={() => setKaraokeDesk(false)} />}
      {/* 코인노래방 내 방 안: 노래 동작 버튼 (숫자 키 1~6) */}
      {hud?.karaoke && !karaoke && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-fuchsia-400/40 bg-[#14061f]/85 px-3 py-2 text-sm text-white shadow-xl">
          <span className="mr-1 text-xs font-bold text-fuchsia-200">
            🎤 {hud.karaoke.room}번방 · 남은 {hud.karaoke.songs}곡
          </span>
          {KARAOKE_ACTS.map((a, i) => (
            <button
              key={a.id}
              onClick={() => worldRef.current?.karaokeAct(a.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${hud.karaoke?.act === a.id ? 'bg-fuchsia-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <span className="mr-1 opacity-60">{i + 1}</span>
              {a.icon} {a.label}
            </button>
          ))}
          <button onClick={() => setKaraoke(true)} className="rounded-xl bg-fuchsia-600 px-3 py-1.5 text-xs font-bold hover:bg-fuchsia-500">
            🎵 노래 고르기
          </button>
          {hud.karaoke.act && (
            <button onClick={() => worldRef.current?.standUp()} className="rounded-xl px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              그만하기 (E)
            </button>
          )}
        </div>
      )}
      {bus && worldRef.current && <BusPanel world={worldRef.current} onClose={() => setBus(false)} />}
      {pcRoom && worldRef.current && onPlay && <PcRoomPanel world={worldRef.current} onPlay={onPlay} onClose={() => setPcRoom(false)} />}
      {gear && worldRef.current && (
        <GearPanel
          world={worldRef.current}
          onClose={() => setGear(false)}
          onWardrobe={() => {
            setGear(false);
            setWardrobe({ shop: false });
          }}
        />
      )}
      {wardrobe && worldRef.current && (
        <WardrobeView world={worldRef.current} shop={wardrobe.shop} startSlot={wardrobe.slot ?? null} startTry={wardrobe.tryIds} onClose={() => setWardrobe(null)} />
      )}
      {clothes && worldRef.current && (
        <ClothesShopPanel
          key={clothes}
          world={worldRef.current}
          start={clothes}
          onClose={() => setClothes(null)}
          onWardrobe={() => {
            setClothes(null);
            setWardrobe({ shop: true });
          }}
        />
      )}
      {tv && hud?.location === 'home' && (
        <TvRemote
          video={tv}
          playing={tvPlay.playing}
          error={tvPlay.error}
          frameRef={tvFrameRef}
          onSearch={() => setTvPanel(true)}
          onOff={() => {
            tvPlayShared(null);
          }}
        />
      )}
      {tvPanel && (
        <TvPanel
          now={tv}
          onPlay={(v) => {
            tvPlayShared(v);
          }}
          onClose={() => setTvPanel(false)}
        />
      )}
      {calendar && worldRef.current && <CalendarPanel profile={profile} today={worldRef.current.day} onClose={() => setCalendar(false)} />}
      {jobs && worldRef.current && <JobPanel world={worldRef.current} onClose={() => setJobs(false)} />}
      {inventory && <InventoryPanel profile={profile} onClose={() => setInventory(false)} />}
      {hud?.npcChat && worldRef.current && (
        <NpcChatPanel key={hud.npcChat} world={worldRef.current} npcId={hud.npcChat} onClose={() => worldRef.current?.closeNpcChat()} />
      )}
      {hud?.lookOut && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-500/50 bg-zinc-900/80 px-5 py-2 text-sm text-zinc-100 shadow-xl">
          <span>🪟 창밖을 보는 중 · 방향키로 둘러보기</span>
          <button onClick={() => worldRef.current?.stopLookOut()} className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600">
            돌아오기 (E / Esc)
          </button>
          <button onClick={() => worldRef.current?.stopLookOut(true)} className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600">
            창문 닫기 (C)
          </button>
        </div>
      )}
      {hud?.sofa && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-zinc-500/50 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 shadow-xl">
          {SOFA_ACTS.map((a, i) => (
            <button
              key={a.id}
              onClick={() => worldRef.current?.sofaAction(a.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${hud.sofa === a.id ? 'bg-amber-500 text-black' : 'bg-zinc-700/80 hover:bg-zinc-600'}`}
            >
              <span className="mr-1 opacity-60">{i + 1}</span>
              {a.icon} {a.label}
            </button>
          ))}
          <button onClick={() => setTvPanel(true)} className="rounded-xl bg-rose-600/80 px-3 py-1.5 text-xs font-bold hover:bg-rose-500">
            📺 TV
          </button>
          <button onClick={() => worldRef.current?.standUp()} className="rounded-xl px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700">
            일어나기 (E)
          </button>
        </div>
      )}
      {hud?.elevator && worldRef.current && <ElevatorPanel {...hud.elevator} onPick={(f) => worldRef.current?.rideElevator(f)} onClose={() => worldRef.current?.closeElevator()} />}
      {hud?.dialog && worldRef.current && (
        <ShopDialog key={hud.dialog} world={worldRef.current} onClose={() => worldRef.current?.closeDialog()} />
      )}

      {keys && <KeySettings onClose={() => setKeys(false)} />}
      <SoftwareGpuNotice />
      {menu && !keys && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6">
            <div className="mb-2 text-center text-xl font-bold">메뉴</div>
            <button onClick={() => setMenu(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <button onClick={() => setKeys(true)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              ⌨️ 키 설정
            </button>
            <GraphicsSettings />
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 오른쪽 위 미니맵: 도로·건물·한강을 한 번 그려두고, 플레이어 위치만 매 프레임 갱신 */
function Minimap({ worldRef }: { worldRef: React.RefObject<CityWorld | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    // 도시 범위 → 미니맵 좌표
    const X0 = -115;
    const X1 = 115;
    const Z0 = -85;
    const Z1 = 80;
    const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
    const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H;
    let base: ImageData | null = null;
    let parkBase: HTMLCanvasElement | null = null;
    let raf = 0;

    const drawBase = (w: CityWorld) => {
      const m = w.map;
      g.fillStyle = '#5d6b55';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#7fae63';
      g.fillRect(0, sz(m.parkZ[0]), W, sz(m.parkZ[1]) - sz(m.parkZ[0]));
      g.fillStyle = '#2f6f9f';
      g.fillRect(0, sz(m.riverZ), W, H);
      g.fillStyle = '#3a3d42';
      for (const r of m.roads) {
        if (r.axis === 'x') g.fillRect(0, sz(r.at - r.width / 2), W, Math.max(2, (r.width / (Z1 - Z0)) * H));
        else g.fillRect(sx(r.at - r.width / 2), 0, Math.max(2, (r.width / (X1 - X0)) * W), sz(r.to));
      }
      g.fillRect(sx(m.bridgeX - 4), sz(m.riverZ), Math.max(2, (8 / (X1 - X0)) * W), H);
      for (const b of m.buildings) {
        g.fillStyle = b.kind === 'home' ? '#ffb84d' : b.kind === 'shop' ? '#d0b48c' : '#c8c8c8';
        g.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), (b.w / (X1 - X0)) * W, (b.d / (Z1 - Z0)) * H);
      }
      for (const t of m.trails) {
        g.strokeStyle = '#c0624a';
        g.lineWidth = 2;
        g.beginPath();
        t.path.forEach((pt, i) => (i ? g.lineTo(sx(pt.x), sz(pt.z)) : g.moveTo(sx(pt.x), sz(pt.z))));
        g.closePath();
        g.stroke();
        g.fillStyle = '#4f9ccf';
        g.beginPath();
        g.arc(sx(t.pond.x), sz(t.pond.z), 2.5, 0, Math.PI * 2);
        g.fill();
      }
      for (const p of m.pois) {
        if (p.kind === 'subway' || p.kind === 'bus') {
          g.fillStyle = p.kind === 'subway' ? '#2e9e4f' : '#2f6fd8';
          g.fillRect(sx(p.x) - 2, sz(p.z) - 2, 4, 4);
        }
      }
      base = g.getImageData(0, 0, W, H);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = worldRef.current;
      if (!w) return;
      if (!base) drawBase(w);
      // 놀이공원: 공원 지도 (길 · 놀이기구) 위에 내 위치와 가는 길
      if (w.location === 'park') {
        if (!parkBase) {
          parkBase = document.createElement('canvas');
          parkBase.width = W;
          parkBase.height = H;
          drawParkBase(parkBase.getContext('2d')!, W, H, false);
        }
        g.drawImage(parkBase, 0, 0);
        const ap = w.autopilot;
        drawParkPlayer(g, W, H, w.player, ap ? ap.path : null, ap?.i ?? 0);
        return;
      }
      g.putImageData(base!, 0, 0);
      if (w.location !== 'city') {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffd27a';
        g.font = 'bold 13px sans-serif';
        g.textAlign = 'center';
        // 가게 안이면 가게 이름 (예전엔 '행복빌라 N층'으로 잘못 나왔다)
        g.fillText(w.location === 'home' ? '집 안' : w.location === 'store' ? `${w.store?.sign ?? '가게'} 안` : w.location === 'lobby' ? '행복빌라 1층' : `행복빌라 ${w.floor}층`, W / 2, H / 2 + 4);
        return;
      }
      const p = w.player;
      g.fillStyle = '#ff4d4d';
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(sx(p.x), sz(p.z), 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(sx(p.x), sz(p.z));
      g.lineTo(sx(p.x + p.fx * 6), sz(p.z + p.fz * 6));
      g.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  return (
    <div className="absolute right-4 top-4 overflow-hidden rounded-lg border border-white/20 bg-black/40">
      <canvas ref={ref} width={210} height={150} className="block" />
      <div className="px-2 py-0.5 text-[10px] text-white/60">● 나 &nbsp; ■ 내 집 &nbsp; ■ 지하철 &nbsp; ■ 버스</div>
    </div>
  );
}

/** 잠자는 동안: 위아래 검은 띠 + 지금 시각 + 잔 시간 (아무 키나 누르면 깬다, 12시간이면 저절로) */
function SleepOverlay({ hud }: { hud: CityHud }) {
  const on = hud.sleep === 'sleep';
  const show = hud.sleep === 'lie' || hud.sleep === 'sleep' || hud.sleep === 'wake';
  if (!show) return null;
  return (
    <div className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${on ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-x-0 top-0 h-[11%] bg-black/90" />
      <div className="absolute inset-x-0 bottom-0 h-[11%] bg-black/90" />
      <div className="absolute left-1/2 top-[14%] -translate-x-1/2 text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <div className="text-7xl font-black tabular-nums tracking-wider">{hud.clock}</div>
        <div className="mt-1 text-base text-white/80">
          {shortDay(hud.day)} · 쿨쿨 자는 중 · {sleptLabel(hud.slept)}째
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-lg">
          <span>🌙</span>
          <div className="h-2 w-72 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-pink-300 to-amber-300" style={{ width: `${hud.night * 100}%` }} />
          </div>
          <span>☀️</span>
        </div>
        <div className="mt-2 text-sm text-white/70">아무 키나 누르면 일어나요 · 12시간을 자면 저절로 깨요</div>
      </div>
      <div className="absolute left-[56%] top-[40%] animate-bounce text-4xl font-black text-sky-200/90">
        Z<span className="text-2xl">z</span><span className="text-xl">z</span>
      </div>
    </div>
  );
}

/** 플레이어 체력: 레벨이 오를수록 최대치가 늘고, 쉬거나 자면 다시 찬다 */
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const r = Math.max(0, hp) / maxHp;
  const color = r > 0.5 ? 'from-emerald-600 to-emerald-400' : r > 0.25 ? 'from-amber-600 to-amber-400' : 'from-red-700 to-red-500';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-white/70">
        <span className="font-bold text-white/90">HP</span>
        <span className="tabular-nums">
          {Math.max(0, hp)} / {maxHp}
        </span>
      </div>
      <div className="mt-0.5 h-3 w-48 overflow-hidden rounded-sm bg-black/60">
        <div className={`h-full bg-gradient-to-r ${color} transition-[width] duration-200 ${r <= 0.25 ? 'animate-pulse' : ''}`} style={{ width: `${r * 100}%` }} />
      </div>
    </div>
  );
}

function fmtFrames(frames: number) {
  const sec = Math.ceil(frames / 60);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** 처음 들어올 때 로딩 화면: 받은 개수와 준비 단계 */
function LoadingScreen({ stage, done, total }: { stage: 'models' | 'shaders'; done: number; total: number }) {
  // 모델 받기 90% + 그래픽 준비 10%
  const pct = stage === 'shaders' ? 95 : total ? Math.round((done / total) * 90) : 0;
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-zinc-950 via-[#0b0d17] to-black">
      <div className="text-3xl font-black tracking-widest text-white">서울 · 내 집</div>
      <div className="mt-2 text-sm text-white/50">{stage === 'models' ? `건물·사람·가구 불러오는 중… (${done}/${total})` : '그래픽 준비 중… (처음 한 번만 조금 걸려요)'}</div>
      <div className="mt-5 h-2 w-72 max-w-[80vw] overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-amber-300 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 마을 접속 상태: 접속한 친구 수·이름과 친구까지의 핑 */
function OnlineBadge({ online }: { online: NonNullable<CityHud['online']> }) {
  const { status, friends, ping } = online;
  const dot = status === 'online' ? '🟢' : status === 'connecting' ? '🟡' : '🔴';
  const label = status === 'online' ? (friends.length ? `친구 ${friends.length}명 접속` : '마을 접속 (혼자)') : status === 'connecting' ? '마을 접속 중…' : '마을 연결 끊김';
  const pingColor = ping === null ? '' : ping < 80 ? 'text-lime-300' : ping < 160 ? 'text-amber-300' : 'text-red-400';
  return (
    <div className="mt-2 border-t border-white/10 pt-1.5 text-xs">
      <div>
        {dot} {label}
        {ping !== null && <span className={`ml-2 font-bold tabular-nums ${pingColor}`}>핑 {ping}ms</span>}
      </div>
      {friends.length > 0 && <div className="mt-0.5 max-w-[220px] truncate text-white/60">{friends.join(', ')}</div>}
    </div>
  );
}

/** 엘리베이터 버튼판: 누르면 그 층으로 */
function ElevatorPanel({ top, here, mine, onPick, onClose }: { top: number; here: number; mine: number; onPick: (f: number) => void; onClose: () => void }) {
  const floors = Array.from({ length: top }, (_, i) => top - i);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-56 rounded-xl border border-zinc-500/50 bg-zinc-800/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-center text-sm font-bold text-zinc-100">🛗 행복빌라 엘리베이터</div>
        <div className="mb-3 text-center text-xs text-zinc-400">지금 {here === 1 ? '1층 로비' : `${here}층`} · 숫자 키로도 고를 수 있어요</div>
        <div className="grid grid-cols-2 gap-2">
          {floors.map((f) => (
            <button
              key={f}
              disabled={f === here}
              onClick={() => onPick(f)}
              className={`rounded-full border py-2 text-sm font-bold transition ${
                f === here
                  ? 'cursor-default border-amber-400 bg-amber-400/20 text-amber-300'
                  : 'border-zinc-500 bg-zinc-700 text-zinc-100 hover:border-amber-300 hover:bg-zinc-600'
              }`}
            >
              {f === 1 ? '1 로비' : f}
              {f === mine && <span className="ml-1 text-xs">🏠</span>}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full rounded bg-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600">
          닫기 (Esc)
        </button>
      </div>
    </div>
  );
}
