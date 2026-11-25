'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { FieldWorld, type FieldHudState } from '@/game/core/field';
import { AutoHuntController, DimensionKeyboardController } from '@/game/core/fieldControllers';
import { DIM_ATTACK_KEYS, Keyboard, P1_KEYS, watchPad, watchPadButtons, type KeyMap } from '@/game/core/input';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import { FieldRenderer } from '@/game/render/fieldRenderer';
import FieldHud from './FieldHud';
import TouchControls, { useIsTouch } from './TouchControls';
import RotateHint, { usePortrait } from './RotateHint';
import SoundToggle from './SoundToggle';
import VibrationToggle from './VibrationToggle';
import MusicToggle from './MusicToggle';
import { startBgm, stopBgm } from '@/game/render/bgm';
import { unlockAudioOnInput } from '@/game/render/sfx';
import InventoryPanel from './InventoryPanel';
import { attachZoomControls } from './zoomControls';
import { DimensionLink } from '@/game/net/dimension';
import type { Account } from '@/game/net/auth';
import VillageTalk, { type TalkState } from './VillageTalk';
import DimensionPrologue from './DimensionPrologue';
import StoryDialog, { type DialogLine } from './StoryDialog';
import QuestNotebook from './QuestNotebook';
import Chapter1Panel, { SkillNameModal } from './Chapter1Panel';
import TrainingGame from './TrainingGame';
import GearPanel from './GearPanel';
import { ROOT_INFO, ch1Objective, ch1Scene, ch1SceneForNpc, countQuestKill, finishCh1, resumeCh1Scene, sceneOnLogout, startCh1, type Ch1SceneId, type Ch1State } from '@/game/story/chapter1';
import { RESCUE_SCRIPT, type ScriptLine } from '@/game/data/prologueScript';
import { VILLAGE_DUMMY, VILLAGE_NPCS } from '@/game/data/village';
import { MOVES } from '@/game/data/moves';
import { playHit } from '@/game/render/sfx';
import { sharedGameTime } from '@/game/city/worldClock';
import { finishScene, nextObjective, nextScene, NOTES, scene, sceneForNpc, sceneForSpot, sceneOnArrive, startCh0, wakeScene, type Ch0State, type NoteId, type Scene, type SceneId } from '@/game/story/chapter0';
import { storyPortrait } from '@/game/data/portraits';
import { loadDimensionPlace, saveDimensionPlace } from '@/game/core/lastScreen';
import InnMenuPanel from './InnMenuPanel';

/** 접속 연출 시간 (ms) */
const WARP_MS = 1600;

/** 여관 앞 깨어나는 자리 (프롤로그 구조 · 1장 고블린 떼 뒤) */
const INN_WAKE = { x: -6.7, z: 31.3, fx: -1, fz: -0.25 };
/** 차원 상호작용 키 (서울의 E 자리를 근 기술이 쓴다) */
const INTERACT_CODE = 'KeyF';
/** 근 기술 칸: Q W E R = 주 근 (R = 궁극기), A S D = 부 근 (주 근을 다 배운 뒤 깨어난다) */
type SkillSlot = 'q' | 'w' | 'e' | 'r' | 'a' | 's' | 'd';
const SKILL_SLOTS: { id: SkillSlot; key: string; sub: boolean; locked: string }[] = [
  { id: 'q', key: 'Q', sub: false, locked: '주 근 첫 기술은 1장에서 근이 처음 깨어날 때 생겨요' },
  { id: 'w', key: 'W', sub: false, locked: '주 근 두 번째 기술 — 아직 배우지 않았어요' },
  { id: 'e', key: 'E', sub: false, locked: '주 근 세 번째 기술 — 아직 배우지 않았어요' },
  { id: 'r', key: 'R', sub: false, locked: '주 근 궁극기 — 아직 배우지 않았어요' },
  { id: 'a', key: 'A', sub: true, locked: '부 근 — 주 근 기술을 다 배운 뒤에 깨어나요' },
  { id: 's', key: 'S', sub: true, locked: '부 근 — 주 근 기술을 다 배운 뒤에 깨어나요' },
  { id: 'd', key: 'D', sub: true, locked: '부 근 — 주 근 기술을 다 배운 뒤에 깨어나요' },
];
const SKILL_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD'] as const;
/** 첫 발현 기술 재사용 대기 */
const SKILL_COOLDOWN_MS = 10_000;
/** 터치: 방향 패드 + 공격 한 버튼(Ctrl) + 점프 */
const DIM_TOUCH_KEYS: KeyMap = { ...P1_KEYS, buttons: [DIM_ATTACK_KEYS[0], DIM_ATTACK_KEYS[0], DIM_ATTACK_KEYS[0], DIM_ATTACK_KEYS[0]] };

/**
 * 다른 차원: 서울 집 컴퓨터로 접속하는 사냥터. 로그인했으면 같은 차원에 들어온 사람들과 같은 몬스터를 본다.
 * 로그아웃하면 서울 집 컴퓨터 앞으로 돌아간다.
 */
/**
 * 차원 들어가기: 처음이면 프롤로그(게임이라 믿고 안개 숲에 접속 → 그림자에게 쫓기며 게임 화면이 꺼짐 → 벼랑에서 뛰어내림)를 먼저 보고,
 * 벼랑 밑에서 구해진 채 경계 마을에서 깨어난다. 그다음부턴 바로 마을 포탈 앞.
 */
export default function FieldView(props: { profile: PlayerProfile; account?: Account | null; onExit: () => void }) {
  const { profile } = props;
  const [prologue, setPrologue] = useState(() => !profile.dimension?.prologue);
  // 마스터 계정이 0장 처음을 골랐으면 프롤로그 직후처럼 구조 장면부터 (story/master)
  const [intro, setIntro] = useState(() => !!profile.dimension?.replayRescue);
  if (prologue)
    return (
      <DimensionPrologue
        profile={profile}
        playerName={props.account?.username}
        onExit={props.onExit}
        onDone={() => {
          profile.dimension = { visits: profile.dimension?.visits ?? 0, ...profile.dimension, prologue: true };
          saveProfile(profile);
          setIntro(true);
          setPrologue(false);
        }}
      />
    );
  return <DimensionField {...props} intro={intro} />;
}

function DimensionField({ profile, account = null, onExit, intro = false }: { profile: PlayerProfile; account?: Account | null; onExit: () => void; intro?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<FieldWorld | null>(null);
  const [hud, setHud] = useState<FieldHudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [inventory, setInventory] = useState(false);
  /** 차원 장비창 (T) · 무구 노점 앞에서 E 면 노점 탭으로 */
  const [gearUi, setGearUi] = useState<{ shop: boolean } | null>(null);
  const gearUiRef = useRef(gearUi);
  gearUiRef.current = gearUi;
  const [warp, setWarp] = useState(true);
  /** 경계 마을 NPC 와 대화 중 */
  const [talk, setTalk] = useState<TalkState | null>(null);
  const talkRef = useRef(talk);
  talkRef.current = talk;
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  const talkApi = useRef<{
    start: () => void;
    next: () => void;
    close: () => void;
    story: () => void;
    pick: (v: string) => void;
    quest: () => void;
    exit: () => void;
    trained: (score: number) => void;
    named: (name: string) => void;
    skill: (slot: SkillSlot) => void;
  } | null>(null);
  /** 근 기술 칸 (Q W E R = 주 근 · A S D = 부 근). 주 근 첫 기술(Q)이 끝나는 시각 (재사용 대기) */
  const [skillReadyAt, setSkillReadyAt] = useState(0);
  const skillReadyRef = useRef(0);
  const [, tickSkill] = useState(0);
  // 재사용 대기 중이면 남은 초를 화면에 다시 그린다
  useEffect(() => {
    if (!skillReadyAt) return;
    const id = window.setInterval(() => {
      tickSkill((n) => n + 1);
      if (performance.now() >= skillReadyAt) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [skillReadyAt]);
  /** 이야기 장면 대사 (여러 사람이 번갈아 말한다). scene 이 없으면 구조 장면(RESCUE), 있으면 0장 장면 */
  const [story, setStory] = useState<{ lines: ScriptLine[]; idx: number; scene?: SceneId | `c1:${Ch1SceneId}`; npc?: string; choices?: { label: string; value: string }[] } | null>(null);
  /** 0장 의문 수첩 (화면 표시용 사본) · 방금 채운 줄 (반짝) · 알림 */
  const [ch0, setCh0] = useState<Ch0State | null>(() => profile.dimension?.ch0 ?? null);
  const [flash, setFlash] = useState<NoteId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 퀘스트 자동진행 (G): 다음 할 일을 하는 사람에게 알아서 걸어가 말을 걸고, 대사도 저절로 넘긴다 */
  const [questAuto, setQuestAuto] = useState(false);
  const questAutoRef = useRef(questAuto);
  questAutoRef.current = questAuto;
  /** 1장 진행 (화면 표시용 사본) · 수련 미니게임 · 기술 이름 짓기 · 포탈이 꺼진 사건 · 서울 내 방 장면 · 근 폭발 빛 */
  const [ch1, setCh1] = useState<Ch1State | null>(() => profile.dimension?.ch1 ?? null);
  const [training, setTraining] = useState<{ mode: 'guard' | 'breath'; next?: Ch1SceneId; npc?: string } | null>(null);
  const [naming, setNaming] = useState<{ next?: Ch1SceneId } | null>(null);
  const [portalDown, setPortalDown] = useState(false);
  const [seoulCut, setSeoulCut] = useState(false);
  const [burst, setBurst] = useState<{ color: string; key: number } | null>(null);
  const [shaking, setShaking] = useState(false);
  /** 미니게임 · 이름 짓기 창이 떠 있으면 게임 키를 받지 않는다 */
  const overlayRef = useRef(false);
  overlayRef.current = !!training || !!naming;
  const trainingRef = useRef(training);
  trainingRef.current = training;
  const namingRef = useRef(naming);
  namingRef.current = naming;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const portalDownRef = useRef(portalDown);
  portalDownRef.current = portalDown;
  const storyRef = useRef(story);
  storyRef.current = story;
  /** 찍어 둔 얼굴 ('me' · NPC id → 그림) */
  const [faces, setFaces] = useState<Record<string, string>>({});
  const facesRef = useRef(faces);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  /** 달빛 여관 식당 메뉴 (요리사와 이야기한 뒤) */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  /** 여관 문을 지날 때 잠깐 어두워진다 */
  const [doorFade, setDoorFade] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('field');

    const world = new FieldWorld(new DimensionKeyboardController(kb, 0), new AutoHuntController(), profile, Date.now() & 0xffff, !!account);
    worldRef.current = world;
    // 개발 중 화면 점검용 (배포판에는 없다)
    if (process.env.NODE_ENV === 'development') (window as unknown as { __field?: FieldWorld }).__field = world;
    // 로그인했으면 같은 차원에 접속 (서울 동네 접속은 서울 화면을 나오면서 끊겨, 서울에선 내가 사라진다)
    const link = account ? new DimensionLink(world, account) : null;
    link?.start();
    // 접속 횟수만 늘린다 (만난 NPC · 프롤로그 기록은 그대로)
    profile.dimension = { ...profile.dimension, visits: (profile.dimension?.visits ?? 0) + 1 };
    saveProfile(profile);
    const warpTimer = window.setTimeout(() => setWarp(false), intro ? 0 : WARP_MS);
    let storyTimer = 0;
    if (intro) {
      if (profile.dimension?.replayRescue) {
        delete profile.dimension.replayRescue;
        saveProfile(profile);
      }
      // 프롤로그에서 벼랑 아래로 떨어진 뒤: 여관 앞에서 달래가 지켜보는 가운데 깨어난다
      const dallae = world.npcs.find((n) => n.def.id === 'dallae');
      world.player.reset(-6.7, 31.3, -1, -0.25);
      if (dallae) {
        world.talking = dallae;
        dallae.fighter.faceToward(world.player);
      }
      storyTimer = window.setTimeout(() => setStory({ lines: RESCUE_SCRIPT, idx: 0 }), 1500);
    } else {
      // 예전부터 하던 사람도 0장 수첩은 받는다 (북문은 막지 않는다). 서울에 다녀왔으면 마중 장면
      const dim = profile.dimension;
      if (!dim.ch0 && dim.prologue) {
        dim.ch0 = startCh0(dim.visits, false);
        saveProfile(profile);
        setCh0({ ...dim.ch0 });
      }
      // 새로고침 전에 차원 안에 있던 자리 · 체력 그대로 (차원을 나왔다 다시 들어오면 기억이 지워져 포탈 앞)
      const at = loadDimensionPlace(account?.userId ?? null);
      if (at && at.hp > 0) {
        world.player.reset(at.x, at.z, at.fx, at.fz);
        world.player.hp = Math.min(at.hp, world.player.maxHp);
        // 여관 침대에서 자다가 창을 닫았으면 그 침대에서 계속 잔다 (그동안 흐른 실제 시간만큼 쉬었다)
        world.resumeSleep();
      } else if (world.resumeSleep()) {
        // 자는 채로 서울에 갔다 온 게 아니라 자리 기억만 지워진 경우: 그대로 이어 잔다
      } else {
        // 새로고침이 아니라 서울에서 다시 접속했을 때만 (기억해 둔 자리가 없다)
        const arrive = sceneOnArrive(dim.ch0 ?? null, dim.visits);
        if (arrive) storyTimer = window.setTimeout(() => playScene(arrive), WARP_MS + 600);
      }
    }
    {
      const dim = profile.dimension;
      if (dim?.ch0?.done && !dim.ch1) {
        dim.ch1 = startCh1();
        saveProfile(profile);
        setCh1({ ...dim.ch1 });
      }
      // 고블린 떼 ~ 이름 짓기 사이에 나갔으면: 들어오자마자 여관 침대에서 깨어나는 장면부터 (도하가 데려다 놓았다)
      const resume = resumeCh1Scene(dim?.ch1 ?? null);
      if (resume) {
        world.player.reset(INN_WAKE.x, INN_WAKE.z, INN_WAKE.fx, INN_WAKE.fz);
        storyTimer = window.setTimeout(() => playCh1(resume), WARP_MS + 600);
      }
    }
    world.onKill = (monsterId) => {
      const c1 = profile.dimension?.ch1 ?? null;
      if (!c1 || c1.step !== 'quest') return;
      const done = countQuestKill(c1, monsterId);
      saveProfile(profile);
      setCh1({ ...c1 });
      // 세 마리째: 자동사냥을 끄고, 숲에서 고블린 떼가 몰려온다
      if (done) {
        if (world.auto) world.toggleAuto();
        questAutoRef.current = false;
        setQuestAuto(false);
        world.storyShield = true;
        storyTimer = window.setTimeout(() => playCh1('swarm'), 900);
      }
    };
    const savePlace = () => {
      const p = world.player;
      // 쓰러져 있을 땐 저장하지 않는다 (다시 들어오면 마을에서 일어난 것과 같게)
      if (p.hp <= 0) return;
      saveDimensionPlace(account?.userId ?? null, { x: p.x, z: p.z, fx: p.fx, fz: p.fz, hp: p.hp });
    };
    const placeTimer = window.setInterval(savePlace, 2000);
    window.addEventListener('pagehide', savePlace);

    const renderer = new FieldRenderer(canvas);
    if (process.env.NODE_ENV === 'development') (window as unknown as { __fr?: FieldRenderer }).__fr = renderer;
    const detachZoom = attachZoomControls(renderer, 0.2, 2.2);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    // Ctrl(기본 공격)을 누른 채 기술 키를 눌러도 브라우저 단축키(Ctrl+R 새로고침 · Ctrl+S 저장 · Ctrl+D 즐겨찾기 등)가 안 뜨게.
    // Ctrl+W(탭 닫기)는 브라우저가 막지 못하게 해 두어서, 차원 안에선 나가기 전에 한 번 묻는다
    const onCtrlCombo = (e: KeyboardEvent) => {
      if (e.ctrlKey && ((SKILL_CODES as readonly string[]).includes(e.code) || e.code === INTERACT_CODE)) e.preventDefault();
      // Tab = 태그 교대 (브라우저가 버튼 사이로 포커스를 옮기지 않게)
      if (e.code === 'Tab') e.preventDefault();
    };
    window.addEventListener('keydown', onCtrlCombo, true);
    const askBeforeLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', askBeforeLeave);

    const onKey = (e: KeyboardEvent) => {
      // 식당 메뉴는 메뉴 창이 키를 받는다 (1장 미니게임 · 이름 짓기 창도)
      if (menuRef.current || overlayRef.current) return;
      // 장비창: T · Esc 로 닫고, 떠 있는 동안 게임 키는 받지 않는다
      if (gearUiRef.current) {
        if (e.code === 'Escape' || (e.code === 'KeyT' && !e.repeat)) setGearUi(null);
        return;
      }
      // 여관 침대에서 자는 중: 아무 키나 누르면 일어난다 (씻는 중엔 기다린다)
      if (world.sleep) {
        if (!e.repeat) world.wakeUp();
        return;
      }
      if (world.shower) return;
      // 대화 중: F · Enter · Space 다음 줄, Esc 닫기 (게임 키는 대화창이 먹는다)
      const t = talkRef.current;
      // 차원의 상호작용은 F (E 는 주 근 기술). 서울은 키 설정 그대로
      const interact = e.code === INTERACT_CODE;
      const st = storyRef.current;
      if (st) {
        if (e.repeat) return;
        if (st.choices && st.idx + 1 >= st.lines.length) {
          const k = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
          if (k >= 0 && st.choices[k]) pickChoice(st.choices[k].value);
          return;
        }
        if (interact || e.code === 'Enter' || e.code === 'Space') nextStory();
        return;
      }
      if (t) {
        if (e.repeat) return;
        if (e.code === 'Escape') closeTalk();
        else if (interact || e.code === 'Enter' || e.code === 'Space') nextLine();
        return;
      }
      if (e.code === 'KeyG' && !e.repeat) toggleQuestAuto();
      // 태그: Tab 으로 싸우는 캐릭터를 바꾼다 (동료가 있을 때)
      if (e.code === 'Tab' && !e.repeat) world.tag();
      // 차원 키: F = 말 걸기 · 살펴보기, Q W E R = 주 근 기술, A S D = 부 근 기술 (캐릭터 전용 무술 기술은 서울에서만)
      if (interact && !e.repeat) startTalk();
      const slot = SKILL_CODES.indexOf(e.code as (typeof SKILL_CODES)[number]);
      if (slot >= 0 && !e.repeat) {
        e.preventDefault();
        castSkill(SKILL_SLOTS[slot].id);
      }
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'KeyZ' && !e.repeat) world.toggleAuto();
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
      if (e.code === 'KeyT' && !e.repeat && !talkRef.current && !storyRef.current) setGearUi({ shop: world.nearbyShop() });
    };
    window.addEventListener('keydown', onKey);
    // 패드: Start = 일시정지, Back = 자동사냥
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p), select: () => world.toggleAuto() });

    function startTalk() {
      // 0장: 이 사람과 나눌 이야기가 있으면 그 장면, 살펴볼 곳 앞이면 혼잣말
      const ch = profile.dimension?.ch0 ?? null;
      const near = world.nearbyNpc();
      if (near) {
        const c1 = profile.dimension?.ch1 ?? null;
        const s1 = ch1SceneForNpc(near.def.id, c1, profile);
        if (s1) return playCh1(s1.id, near.def.id);
        const sc = sceneForNpc(near.def.id, ch);
        if (sc) return playScene(sc, near.def.id);
      } else {
        // 여관 안: 침대에 눕기 · 샤워하기
        if (world.useInnSpot()) return;
        // 무구 노점: 장비를 은화로 산다
        if (world.nearbyShop()) return setGearUi({ shop: true });
        const sp = world.nearbySpot();
        if (sp && ch) return playScene(sceneForSpot(sp.id));
      }
      const r = world.talk();
      if (r) setTalk({ npc: r.npc, lines: r.lines, idx: 0, first: r.first, portrait: face(r.npc.id) });
    }
    /** 대사창 초상화: 나 · 마을 사람 얼굴을 장면에서 찍어 둔다 (한 번 찍으면 다시 쓴다) */
    function face(who: string): string | null {
      const got = facesRef.current[who];
      if (got) return got;
      const f = who === 'me' ? world.player : world.npcs.find((n) => n.def.id === who)?.fighter;
      const shot = f ? renderer.portraitOf(f) : null;
      if (shot) {
        facesRef.current = { ...facesRef.current, [who]: shot };
        setFaces(facesRef.current);
      }
      return shot;
    }
    /** 지금 자동진행이 따라갈 일: 0장 필수 순서, 그다음 1장 */
    function currentGoal(): { kind: 'npc'; npc: string } | { kind: 'logout' | 'hunt' } | null {
      const o0 = nextObjective(profile.dimension?.ch0 ?? null);
      if (o0) return { kind: 'npc', npc: o0.npc };
      const o1 = ch1Objective(profile.dimension?.ch1 ?? null);
      return o1 ? (o1.kind === 'npc' ? { kind: 'npc', npc: o1.npc } : { kind: o1.kind }) : null;
    }
    function toggleQuestAuto() {
      const g = currentGoal();
      if (!questAutoRef.current && g?.kind === 'logout') {
        world.addLog('지금은 로그아웃해서 서울 집에 다녀올 차례예요');
        return;
      }
      const on = !questAutoRef.current && !!g;
      questAutoRef.current = on;
      setQuestAuto(on);
      if (!on) world.stopQuestWalk();
      world.addLog(on ? '퀘스트 자동 진행 ON (방향키를 누르면 멈춰요)' : '퀘스트 자동 진행 OFF');
    }
    /** 자동진행: 할 일이 없으면 다음 사람에게 걸어가고, 도착하면 말을 건다 */
    function stepQuestAuto() {
      if (world.questCancelled) {
        world.questCancelled = false;
        questAutoRef.current = false;
        setQuestAuto(false);
        return;
      }
      if (!questAutoRef.current || storyRef.current || talkRef.current || pausedRef.current) return;
      if (world.questArrived) {
        world.questArrived = null;
        startTalk();
        return;
      }
      if (world.questPath) return;
      const g = currentGoal();
      if (!g || g.kind === 'logout') {
        questAutoRef.current = false;
        setQuestAuto(false);
        return;
      }
      // 고블린 의뢰: 자동사냥을 켜 둔다
      if (g.kind !== 'npc') {
        if (!world.auto && !world.gateLocked) world.toggleAuto();
        return;
      }
      world.walkToNpc(g.npc);
    }
    function playCh1(id: Ch1SceneId, npc?: string) {
      const c1 = profile.dimension?.ch1;
      if (!c1) return;
      if (npc) world.holdNpc(npc);
      // 이야기 장면은 주인공 몫 (동료가 나와 있으면 주인공으로)
      world.forceMe();
      const sc = ch1Scene(id, c1, profile);
      if (id === 'quake') {
        // 땅이 울리고 포탈 빛이 꺼진다: 장면이 끝날 때까지 로그아웃이 안 된다
        setPortalDown(true);
        setShaking(true);
        renderer.setPortalDown(true);
        window.setTimeout(() => setShaking(false), 2600);
      }
      setStory({ lines: sc.lines, idx: 0, scene: `c1:${id}`, npc });
    }
    function endCh1(id: Ch1SceneId, npc?: string) {
      const c1 = profile.dimension?.ch1;
      if (!c1) return world.endTalk();
      const a = finishCh1(c1, id);
      if (a.coin) world.giveCoin(a.coin, '고블린 의뢰 보수');
      if (id === 'quake') {
        setPortalDown(false);
        renderer.setPortalDown(false);
      }
      saveProfile(profile);
      setCh1({ ...c1 });
      if (a.effect === 'guard' || a.effect === 'breath') return setTraining({ mode: a.effect, next: a.next, npc });
      if (a.effect === 'name') return setNaming({ next: a.next });
      if (a.effect === 'swarm') {
        // 고블린 떼에 물린다: 체력이 바닥 근처로 (이야기 동안은 쓰러지지 않는다)
        const p = world.player;
        world.storyShield = true;
        p.hp = Math.max(1, Math.round(p.maxHp * 0.15));
        [0, 260, 520].forEach((t) => window.setTimeout(() => playHit('hit', true, 0.9), t));
        setBurst({ color: '#b3202a', key: Date.now() });
        setShaking(true);
        window.setTimeout(() => setShaking(false), 900);
        storyTimer = window.setTimeout(() => a.next && playCh1(a.next), 1300);
        return;
      }
      if (a.effect === 'burst') {
        // 근이 처음 깨어난다. 아직 미숙해서 바로 둘레만 조금 밀어낸다
        const info = ROOT_INFO[c1.root ?? '력'];
        world.rootBurst(`${c1.root ?? '력'}(${info.hanja})`, 2.6);
        playHit('counter', true, 0.7);
        setBurst({ color: info.color, key: Date.now() });
        setShaking(true);
        window.setTimeout(() => setShaking(false), 600);
        storyTimer = window.setTimeout(() => a.next && playCh1(a.next), 1400);
        return;
      }
      if (a.effect === 'rescue') {
        // 도하의 흙벽(형 근): 땅이 솟고 고블린이 멀리 물러난다
        world.rootBurst('흙벽', 14);
        playHit('block', true, 1);
        setBurst({ color: ROOT_INFO['형'].color, key: Date.now() });
        setShaking(true);
        window.setTimeout(() => setShaking(false), 700);
        storyTimer = window.setTimeout(() => a.next && playCh1(a.next), 1200);
        return;
      }
      if (a.effect === 'inn') {
        // 암전 → 도하가 업어 데려간 여관 침대에서 깨어난다
        setDoorFade((v) => v + 1);
        window.setTimeout(() => {
          const p = world.player;
          p.reset(INN_WAKE.x, INN_WAKE.z, INN_WAKE.fx, INN_WAKE.fz);
          p.hp = Math.round(p.maxHp * 0.5);
          world.storyShield = false;
        }, 350);
        storyTimer = window.setTimeout(() => a.next && playCh1(a.next), 1500);
        return;
      }
      if (a.effect === 'exit') {
        // 서울 내 방: 몸이 진짜로 운동한 것처럼 피곤하다
        world.endTalk();
        profile.life.fatigue = Math.min(100, profile.life.fatigue + 15);
        saveProfile(profile);
        onExitRef.current();
        return;
      }
      if (a.next) return playCh1(a.next, npc);
      world.endTalk();
    }
    /** 로그아웃: 포탈이 꺼져 있으면 안 되고, 1장에서 서울에 다녀올 차례면 서울 내 방 장면부터 */
    function tryExit() {
      if (portalDownRef.current) {
        world.addLog('⚠ 연결이 끊겼어요… 로그아웃이 안 돼요');
        return;
      }
      const cut = sceneOnLogout(profile.dimension?.ch1 ?? null);
      if (cut && !storyRef.current) {
        setPaused(false);
        setSeoulCut(true);
        playCh1(cut);
        return;
      }
      onExitRef.current();
    }
    function trained(score: number) {
      const t = trainingRef.current;
      setTraining(null);
      const c1 = profile.dimension?.ch1;
      if (c1 && t) {
        if (t.mode === 'guard') c1.guard = score;
        else c1.breath = score;
        saveProfile(profile);
      }
      if (t?.next) playCh1(t.next, t.npc);
      else world.endTalk();
    }
    function named(name: string) {
      const n = namingRef.current;
      setNaming(null);
      const c1 = profile.dimension?.ch1;
      if (c1) {
        c1.skillName = name;
        saveProfile(profile);
        setCh1({ ...c1 });
        world.addLog(`첫 발현 「${name}」`);
      }
      if (n?.next) playCh1(n.next, 'noa');
    }
    function playScene(sc: Scene, npc?: string) {
      if (npc) world.holdNpc(npc);
      world.forceMe();
      setStory({ lines: sc.lines, idx: 0, scene: sc.id, npc, choices: sc.choices });
    }
    function nextStory() {
      const s = storyRef.current;
      if (!s) return;
      if (s.idx + 1 < s.lines.length) return setStory({ ...s, idx: s.idx + 1 });
      // 마지막 줄에 선택지가 있으면 고를 때까지 기다린다
      if (s.choices) return;
      endStory();
    }
    function pickChoice(value: string) {
      const s = storyRef.current;
      if (!s || s.idx + 1 < s.lines.length) return;
      endStory(value);
    }
    function endStory(choice?: string) {
      const s = storyRef.current;
      if (!s) return;
      storyRef.current = null;
      setStory(null);
      if (s.scene?.startsWith('c1:')) return endCh1(s.scene.slice(3) as Ch1SceneId, s.npc);
      if (!s.scene) {
        // 구조 장면 끝: 구해 준 사람과 인사한 것으로 친다 (여관 주인이면 차 한 잔으로 기운도 차린다) → 0장 시작
        world.endTalk();
        const dim = (profile.dimension ??= { visits: 1 });
        dim.ch0 ??= startCh0(dim.visits, true);
        saveProfile(profile);
        setCh0({ ...dim.ch0 });
        const t = sharedGameTime().minutes;
        const hhmm = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
        storyTimer = window.setTimeout(() => playScene(wakeScene(hhmm)), 500);
        return;
      }
      const ch = profile.dimension?.ch0;
      if (!ch) return world.endTalk();
      const got = finishScene(ch, s.scene as SceneId, choice);
      // 0장을 막 마쳤다: 1장 시작 (도하는 다음 접속부터 마을에 보인다)
      if (ch.done && !profile.dimension!.ch1) {
        profile.dimension!.ch1 = startCh1();
        setCh1({ ...profile.dimension!.ch1 });
      }
      saveProfile(profile);
      setCh0({ ...ch, notes: { ...ch.notes }, clues: [...(ch.clues ?? [])] });
      if (got.length) {
        setFlash(got[0]);
        setToast(`📔 수첩에 적었다: ${got.map((g) => NOTES.find((n) => n.id === g)!.q).join(' · ')}`);
        window.setTimeout(() => setFlash(null), 2400);
        window.setTimeout(() => setToast(null), 3200);
      }
      const nx = nextScene(ch, s.scene as SceneId);
      if (nx === 'bawiHit') {
        // 허수아비 앞에서 한 번 쳐 본다: 주먹은 들어가지만 거의 흔들리지 않는다
        const p = world.player;
        p.x = VILLAGE_DUMMY.x - 0.95;
        p.z = VILLAGE_DUMMY.z + 0.35;
        const dx = VILLAGE_DUMMY.x - p.x;
        const dz = VILLAGE_DUMMY.z - p.z;
        const d = Math.hypot(dx, dz);
        p.fx = dx / d;
        p.fz = dz / d;
        p.queueMove(MOVES.oneTwo);
        for (const [ms, txt] of [[260, '톡'], [560, '반만 닿음…']] as const)
          window.setTimeout(() => {
            playHit('block', false, 0.6);
            world.floatText(VILLAGE_DUMMY.x, 2.1, VILLAGE_DUMMY.z, txt);
          }, ms);
        storyTimer = window.setTimeout(() => playScene(scene('bawiHit'), s.npc), 1500);
        return;
      }
      if (nx) return playScene(scene(nx, ch), s.npc);
      world.endTalk();
    }
    function closeTalk() {
      const service = world.endTalk();
      saveProfile(profile);
      setTalk(null);
      // 요리사와 이야기를 마치면 식당 메뉴
      if (service === 'meal') setMenu(true);
    }
    function nextLine() {
      const t = talkRef.current;
      if (!t) return;
      if (t.idx + 1 < t.lines.length) setTalk({ ...t, idx: t.idx + 1 });
      else closeTalk();
    }
    /**
     * 근 기술 (Q W E R · A S D). 지금은 1장에서 이름 지은 첫 발현 기술(Q)만 쓸 수 있다:
     * 둘레 몬스터를 밀쳐 내는 근의 빛 (재사용 대기 10초). 나머지 칸은 이야기가 나아가면 열린다 (docs/world-rules.md 근 시스템)
     */
    function castSkill(slot: SkillSlot) {
      if (talkRef.current || storyRef.current || world.player.hp <= 0) return;
      // 태그 동료의 근 기술은 마을을 추가할 때 정한다 (지금은 주인공 기술만)
      if (!world.activeMember.isMe) {
        world.addLog(`${world.activeMember.name}: 아직 쓸 수 있는 근 기술이 없어요`);
        return;
      }
      const c1 = profile.dimension?.ch1;
      const learned = slot === 'q' && !!c1?.skillName;
      if (!learned) {
        world.addLog(SKILL_SLOTS.find((s) => s.id === slot)!.locked);
        return;
      }
      const now = performance.now();
      if (now < skillReadyRef.current) {
        world.addLog(`「${c1!.skillName}」 다시 쓰려면 ${Math.ceil((skillReadyRef.current - now) / 1000)}초`);
        return;
      }
      const root = c1!.root ?? '력';
      const info = ROOT_INFO[root];
      world.rootBurst(`「${c1!.skillName}」`);
      playHit('counter', true, 0.8);
      setBurst({ color: info.color, key: Date.now() });
      skillReadyRef.current = now + SKILL_COOLDOWN_MS;
      setSkillReadyAt(skillReadyRef.current);
    }
    talkApi.current = { start: startTalk, next: nextLine, close: closeTalk, story: nextStory, pick: pickChoice, quest: toggleQuestAuto, exit: tryExit, trained, named, skill: castSkill };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let lastWarp = world.warpSerial;
    // 성장 정보는 주기적으로 저장 (탭을 그냥 닫아도 대부분 남도록)
    const autosave = window.setInterval(() => saveProfile(profile), 5000);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 5) {
        if (!pausedRef.current) world.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;

      link?.tick(now);
      if (world.warpSerial !== lastWarp) {
        lastWarp = world.warpSerial;
        setDoorFade((v) => v + 1);
      }
      renderer.sync(world, makeClock(world.frame, acc / FRAME_MS, world.hitstop > 0, dt));
      // 대사 중인데 아직 얼굴을 못 찍었으면 (모델을 불러오는 중) 조금씩 다시 찍어 본다
      if (world.frame % 10 === 0) stepQuestAuto();
      if (world.frame % 15 === 0) {
        const s = storyRef.current;
        const t = talkRef.current;
        if (s) for (const who of new Set(s.lines.map((l) => l.who))) if (!facesRef.current[who]) face(who);
        if (t && !t.portrait) {
          const shot = face(t.npc.id);
          if (shot) setTalk({ ...t, portrait: shot });
        }
      }
      const h = world.hud();
      const key = JSON.stringify(h);
      if (key !== lastHudKey) {
        lastHudKey = key;
        setHud(h);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(autosave);
      window.clearInterval(placeTimer);
      window.removeEventListener('pagehide', savePlace);
      window.clearTimeout(warpTimer);
      window.clearTimeout(storyTimer);
      link?.stop();
      // 로그아웃(서울로 돌아감): 여관 침대에서 자던 중이면 일어나서 나간다 (창을 그냥 닫으면 계속 잔다)
      world.leaveBed();
      saveProfile(profile);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onCtrlCombo, true);
      window.removeEventListener('beforeunload', askBeforeLeave);
      unwatchPad();
      kb.detach(window);
      unlock();
      stopBgm();
      detachZoom();
      renderer.dispose();
      worldRef.current = null;
    };
  }, [profile, kb, account, intro]);

  // 퀘스트 자동진행 중엔 대사도 저절로 넘긴다: 글자가 다 찍히고 잠깐 읽을 틈을 준 뒤.
  // 선택지가 하나뿐이면 그것을 고르고, 여럿이면 (마루의 질문처럼) 직접 고를 때까지 기다린다
  useEffect(() => {
    if (!questAuto || !story) return;
    const l = story.lines[story.idx];
    const last = story.idx + 1 >= story.lines.length;
    if (last && story.choices && story.choices.length > 1) return;
    const id = window.setTimeout(
      () => {
        if (last && story.choices?.length === 1) talkApi.current?.pick(story.choices[0].value);
        else talkApi.current?.story();
      },
      l.text.length * 28 + 1500,
    );
    return () => window.clearTimeout(id);
  }, [questAuto, story]);

  // 패드로 일시정지 메뉴: A 계속, B 메인 메뉴 (뜬 직후 0.7초는 무시)
  useEffect(() => {
    if (!paused) return;
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 700;
    return watchPad({ 0: () => ready() && setPaused(false), 1: () => ready() && talkApi.current?.exit() });
  }, [paused]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className={`block h-full w-full ${shaking ? 'quake-shake' : ''}`} />
      {hud && <FieldHud hud={hud} onToggleAuto={() => worldRef.current?.toggleAuto()} touch={touch} portrait={portrait} />}

      {/* 수동 조작일 때만 터치 버튼 (자동사냥 중엔 필요 없음) */}
      {touch && hud && !hud.auto && !hud.dead && !paused && !inventory && !talk && !menu && !hud.sleep && hud.shower === null && <TouchControls kb={kb} map={DIM_TOUCH_KEYS} attackOnly />}
      {/* 근 기술 칸: Q W E R (주 근) · A S D (부 근). 배운 칸만 밝다. 누르면 쓴다 (터치도) */}
      {hud && !hud.dead && !paused && !inventory && !talk && !story && !gearUi && !hud.sleep && (
        <div className={`pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-end gap-1 ${touch ? 'top-14' : 'bottom-3'}`}>
          {hud.party.length > 1 && (
            <button
              title="싸우는 캐릭터 바꾸기 (Tab) — 쓰러지면 다음 캐릭터가 저절로 나와요"
              onClick={() => worldRef.current?.tag()}
              className="mr-2 flex h-11 flex-col items-center justify-center rounded-lg border border-sky-300/60 bg-black/60 px-2 text-[10px] leading-tight text-sky-100"
            >
              <span className="font-mono text-xs font-black">{touch ? '⇄' : 'Tab'}</span>
              <span>교대</span>
            </button>
          )}
          {SKILL_SLOTS.map((s) => {
            const learned = s.id === 'q' && !!ch1?.skillName && !!hud.party.find((m) => m.active)?.isMe;
            const left = learned ? Math.max(0, Math.ceil((skillReadyAt - performance.now()) / 1000)) : 0;
            const color = ch1?.root ? ROOT_INFO[ch1.root].color : '#ffffff';
            return (
              <button
                key={s.id}
                title={learned ? `${ch1!.skillName} (${ch1!.root}) — 둘레 몬스터를 밀쳐 낸다` : s.locked}
                onClick={() => talkApi.current?.skill(s.id)}
                className={`relative flex h-11 w-11 flex-col items-center justify-center rounded-lg border text-[10px] leading-tight ${s.sub && s.id === 'a' ? 'ml-2' : ''} ${
                  learned ? 'border-white/60 bg-black/60 text-white' : 'border-white/15 bg-black/40 text-white/35'
                }`}
                style={learned ? { boxShadow: `0 0 10px ${color}` } : undefined}
              >
                <span className="font-mono text-xs font-black">{s.key}</span>
                <span className="max-w-full truncate px-0.5">{learned ? ch1!.skillName : '🔒'}</span>
                {left > 0 && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70 text-sm font-black">{left}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* NPC 가까이: 말 걸기 */}
      {hud?.npc && !talk && !story && !paused && (
        <button
          onClick={() => talkApi.current?.start()}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg hover:bg-black/85"
        >
          💬 {hud.npc.name} <span className="font-normal text-white/60">({hud.npc.title})</span>
          {!hud.npc.met && <span className="ml-1 text-amber-300">❗</span>} 대화하기{!touch && ' · F'}
        </button>
      )}
      {/* 달빛 여관 문: 걸어 들어가도 되고 눌러도 된다 */}
      {hud?.innDoor && !hud.npc && !hud.innSpot && !talk && !story && !paused && !menu && (
        <button
          onClick={() => (hud.innDoor === 'in' ? worldRef.current?.enterInn() : worldRef.current?.leaveInn())}
          className="absolute bottom-44 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg hover:bg-black/85"
        >
          🚪 {hud.innDoor === 'in' ? '달빛 여관 들어가기' : '마을로 나가기'}
        </button>
      )}
      {/* 달빛 여관: 침대 · 샤워 칸 */}
      {hud?.innSpot && !hud.npc && !talk && !story && !paused && !menu && (
        <button
          onClick={() => talkApi.current?.start()}
          className={`absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border bg-black/70 px-5 py-2 text-sm font-bold shadow-lg hover:bg-black/85 ${hud.innSpot.busy ? 'border-white/20 text-white/50' : 'border-amber-200/50 text-amber-100'}`}
        >
          {hud.innSpot.kind === 'bed' ? '🛏️' : '🚿'} {hud.innSpot.busy ? (hud.innSpot.kind === 'bed' ? '다른 사람이 자는 중' : '누가 씻는 중') : hud.innSpot.label}
          {!touch && ' · F'}
        </button>
      )}
      {/* 자는 중: 화면이 어두워지고, 아무 키 · 화면을 누르면 일어난다 */}
      {hud?.sleep && (
        <div
          className={`absolute inset-0 z-20 flex items-end justify-center bg-[#05030f] pb-24 transition-opacity duration-[1500ms] ${hud.sleep.phase === 'sleep' ? 'opacity-80' : 'opacity-30'}`}
          onClick={() => worldRef.current?.wakeUp()}
        >
          {hud.sleep.phase === 'sleep' && (
            <div className="rounded-xl border border-violet-200/20 bg-black/60 px-6 py-3 text-center text-violet-100">
              <div className="text-2xl">😴 Zzz…</div>
              <div className="mt-1 text-sm text-white/75">
                {Math.floor(hud.sleep.sleptMs / 60_000)}분째 자는 중 · 피로도 {hud.fatigue} · HP {hud.hp}/{hud.maxHp}
              </div>
              <div className="mt-1 text-xs text-white/50">창을 닫아도 계속 자요 · {touch ? '화면을 누르면' : '아무 키나 누르면'} 일어나요</div>
            </div>
          )}
        </div>
      )}
      {/* 씻는 중 */}
      {hud && hud.shower !== null && (
        <div className="pointer-events-none absolute bottom-32 left-1/2 w-64 -translate-x-1/2 rounded-full border border-sky-200/40 bg-black/70 px-4 py-2 text-center text-sm font-bold text-sky-100">
          🚿 씻는 중… {Math.round(hud.shower * 100)}%
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-sky-300" style={{ width: `${hud.shower * 100}%` }} />
          </div>
        </div>
      )}
      {menu && hud && (
        <InnMenuPanel
          coin={hud.coin}
          hunger={hud.hunger}
          fatigue={hud.fatigue}
          touch={touch}
          onBuy={(id) => {
            const r = worldRef.current?.buyMeal(id) ?? { ok: false, message: '' };
            if (r.ok) saveProfile(profile);
            return r;
          }}
          onClose={() => setMenu(false)}
        />
      )}
      {/* 여관 문을 지날 때: 잠깐 어두워졌다 밝아진다 */}
      {doorFade > 0 && <div key={doorFade} className="door-fade pointer-events-none absolute inset-0 z-40 bg-black" />}
      {/* 무구 노점 */}
      {hud?.shop && !talk && !story && !paused && !gearUi && (
        <button
          onClick={() => setGearUi({ shop: true })}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg hover:bg-black/85"
        >
          ⚒️ 무구 노점 둘러보기{!touch && ' · F'}
        </button>
      )}
      {gearUi && worldRef.current && <GearPanel key={String(gearUi.shop)} world={worldRef.current} shop={gearUi.shop} onClose={() => setGearUi(null)} />}
      {/* 0장: 살펴볼 곳 */}
      {hud?.spot && !hud.npc && ch0 && !talk && !story && !paused && (
        <button
          onClick={() => talkApi.current?.start()}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-sky-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-sky-100 shadow-lg hover:bg-black/85"
        >
          🔍 {hud.spot.name} 살펴보기{!hud.spot.seen && <span className="ml-1 text-sky-300">❗</span>}
          {!touch && ' · F'}
        </button>
      )}
      {ch1 && !paused && !inventory && <Chapter1Panel ch1={ch1} auto={questAuto} onAuto={() => talkApi.current?.quest()} touch={touch} />}
      {ch0 && !ch1 && !paused && !inventory && (
        <QuestNotebook ch0={ch0} flash={flash} touch={touch} next={nextObjective(ch0)?.label ?? null} auto={questAuto} onAuto={() => talkApi.current?.quest()} />
      )}
      {toast && (
        <div className="note-toast pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-amber-200/50 bg-[#2a1f12]/90 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg">{toast}</div>
      )}
      {/* 1장 사건 A: 로그아웃 직후 서울 내 방 (대사창 뒤 어두운 방) */}
      {seoulCut && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-[#0c0b10] pt-24">
          <div className="text-center">
            <div className="font-mono text-xs tracking-[0.4em] text-white/40">LOGOUT</div>
            <div className="mt-2 text-2xl font-black text-white/80">서울 · 내 방</div>
          </div>
        </div>
      )}
      {/* 1장 사건 E: 근이 처음 터진다 */}
      {burst && <div key={burst.key} className="root-burst pointer-events-none absolute inset-0 z-30" style={{ background: `radial-gradient(circle at 50% 55%, #fff 0%, ${burst.color} 25%, transparent 70%)` }} />}
      {training && <TrainingGame mode={training.mode} onDone={(n) => talkApi.current?.trained(n)} onHit={(b) => !b && playHit('hit', true, 0.8)} touch={touch} />}
      {naming && <SkillNameModal root={ch1?.root ?? '력'} onSubmit={(n) => talkApi.current?.named(n)} />}
      {story && (() => {
        const l = story.lines[story.idx];
        const npc = VILLAGE_NPCS.find((n) => n.id === l.who);
        const line: DialogLine =
          l.who === 'me'
            ? { who: 'me', name: '나', text: l.text, portrait: storyPortrait(profile.body, l.face, l.mood) ?? faces.me ?? null }
            : { who: l.who, name: npc?.name ?? l.who, title: npc?.title, text: l.text, portrait: faces[l.who] ?? null };
        const choices = story.choices?.map((c, i) => ({ label: `${c.label} (${i + 1})`, onPick: () => talkApi.current?.pick(c.value) }));
        return <StoryDialog line={line} idx={story.idx} total={story.lines.length} onNext={() => talkApi.current?.story()} choices={choices} touch={touch} nextLabel={story.scene ? '계속' : '일어나기'} />;
      })()}
      {/* 벼랑에서 떨어진 뒤: 검은 화면이 걷히며 눈을 뜬다 */}
      {intro && <div className="wake-open pointer-events-none absolute inset-0 z-50 bg-black" />}
      {talk && <VillageTalk talk={talk} onNext={() => talkApi.current?.next()} onClose={() => talkApi.current?.close()} touch={touch} />}

      <div className={`absolute right-4 top-4 flex gap-2 whitespace-nowrap text-xs ${touch && portrait ? 'flex-col items-end' : ''}`}>
        <SoundToggle compact={touch} className="!bg-black/50 hover:!bg-black/70" />
        <MusicToggle compact={touch} className="!bg-black/50 hover:!bg-black/70" />
        <button onClick={() => setInventory((v) => !v)} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          가방{!touch && ' (I)'}
        </button>
        <button onClick={() => setGearUi((v) => (v ? null : { shop: !!worldRef.current?.nearbyShop() }))} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          장비{!touch && ' (T)'}
        </button>
        <button onClick={() => setPaused(true)} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          메뉴{!touch && ' (Esc)'}
        </button>
        <button
          onClick={() => talkApi.current?.exit()}
          className={`rounded px-3 py-1.5 font-bold ${portalDown ? 'animate-pulse cursor-not-allowed bg-rose-600/60 text-rose-100' : 'bg-cyan-500/30 text-cyan-100 hover:bg-cyan-500/50'}`}
        >
          {portalDown ? '⚠ 연결 끊김' : '🖥️ 로그아웃'}
        </button>
      </div>

      <RotateHint touch={touch} />

      {inventory && <InventoryPanel profile={profile} dimension onClose={() => setInventory(false)} />}

      {/* 접속 연출: 모니터 속으로 빨려 들어간다 */}
      {warp && (
        <div className="dim-warp pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center font-mono text-cyan-100">
            <div className="text-2xl font-black tracking-[0.3em]">CONNECTING</div>
            <div className="mt-2 text-sm text-white/70">차원 접속 중…</div>
          </div>
        </div>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">일시정지</div>
            <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <VibrationToggle />
            <button onClick={() => talkApi.current?.exit()} className="rounded bg-white/10 py-2 hover:bg-white/20">
              로그아웃 (서울 집으로)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
