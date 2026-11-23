'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { FieldWorld, type FieldHudState } from '@/game/core/field';
import { AutoHuntController, FieldKeyboardController } from '@/game/core/fieldControllers';
import { Keyboard, P1_KEYS, watchPad, watchPadButtons } from '@/game/core/input';
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
import { bindCodes } from '@/game/core/keybinds';
import VillageTalk, { type TalkState } from './VillageTalk';
import DimensionPrologue from './DimensionPrologue';
import StoryDialog, { type DialogLine } from './StoryDialog';
import QuestNotebook from './QuestNotebook';
import { RESCUE_SCRIPT, type ScriptLine } from '@/game/data/prologueScript';
import { VILLAGE_DUMMY, VILLAGE_NPCS } from '@/game/data/village';
import { MOVES } from '@/game/data/moves';
import { playHit } from '@/game/render/sfx';
import { sharedGameTime } from '@/game/city/worldClock';
import { finishScene, nextObjective, nextScene, NOTES, scene, sceneForNpc, sceneForSpot, sceneOnArrive, startCh0, wakeScene, type Ch0State, type NoteId, type Scene, type SceneId } from '@/game/story/chapter0';
import { storyPortrait } from '@/game/data/portraits';
import { loadDimensionPlace, saveDimensionPlace } from '@/game/core/lastScreen';

/** 접속 연출 시간 (ms) */
const WARP_MS = 1600;

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
  const [intro, setIntro] = useState(false);
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
  const [warp, setWarp] = useState(true);
  /** 경계 마을 NPC 와 대화 중 */
  const [talk, setTalk] = useState<TalkState | null>(null);
  const talkRef = useRef(talk);
  talkRef.current = talk;
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  const talkApi = useRef<{ start: () => void; next: () => void; close: () => void; story: () => void; pick: (v: string) => void; quest: () => void } | null>(null);
  /** 이야기 장면 대사 (여러 사람이 번갈아 말한다). scene 이 없으면 구조 장면(RESCUE), 있으면 0장 장면 */
  const [story, setStory] = useState<{ lines: ScriptLine[]; idx: number; scene?: SceneId; npc?: string; choices?: { label: string; value: string }[] } | null>(null);
  /** 0장 의문 수첩 (화면 표시용 사본) · 방금 채운 줄 (반짝) · 알림 */
  const [ch0, setCh0] = useState<Ch0State | null>(() => profile.dimension?.ch0 ?? null);
  const [flash, setFlash] = useState<NoteId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 퀘스트 자동진행 (G): 다음 할 일을 하는 사람에게 알아서 걸어가 말을 걸고, 대사도 저절로 넘긴다 */
  const [questAuto, setQuestAuto] = useState(false);
  const questAutoRef = useRef(questAuto);
  questAutoRef.current = questAuto;
  const storyRef = useRef(story);
  storyRef.current = story;
  /** 찍어 둔 얼굴 ('me' · NPC id → 그림) */
  const [faces, setFaces] = useState<Record<string, string>>({});
  const facesRef = useRef(faces);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('field');

    const world = new FieldWorld(new FieldKeyboardController(kb, P1_KEYS, 0), new AutoHuntController(), profile, Date.now() & 0xffff, !!account);
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
      } else {
        // 새로고침이 아니라 서울에서 다시 접속했을 때만 (기억해 둔 자리가 없다)
        const arrive = sceneOnArrive(dim.ch0 ?? null, dim.visits);
        if (arrive) storyTimer = window.setTimeout(() => playScene(arrive), WARP_MS + 600);
      }
    }
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

    const onKey = (e: KeyboardEvent) => {
      // 대화 중: E · Enter · Space 다음 줄, Esc 닫기 (게임 키는 대화창이 먹는다)
      const t = talkRef.current;
      const interact = bindCodes('interact').includes(e.code);
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
      // 서울과 같은 키: 상호작용(E) = 말 걸기, R · X · Y = 작은은발소녀 전용 기술
      if (interact && !e.repeat) startTalk();
      if (!e.repeat && (e.code === 'KeyR' || e.code === 'KeyX' || e.code === 'KeyY')) {
        e.preventDefault();
        world.useSkill(e.code === 'KeyR' ? 'flyingKick' : e.code === 'KeyX' ? 'tornadoKick' : 'backTurnKick');
      }
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'KeyZ' && !e.repeat) world.toggleAuto();
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    // 패드: Start = 일시정지, Back = 자동사냥
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p), select: () => world.toggleAuto() });

    function startTalk() {
      // 0장: 이 사람과 나눌 이야기가 있으면 그 장면, 살펴볼 곳 앞이면 혼잣말
      const ch = profile.dimension?.ch0 ?? null;
      const near = world.nearbyNpc();
      if (near) {
        const sc = sceneForNpc(near.def.id, ch);
        if (sc) return playScene(sc, near.def.id);
      } else {
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
    function toggleQuestAuto() {
      const on = !questAutoRef.current && !!nextObjective(profile.dimension?.ch0 ?? null);
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
      const obj = nextObjective(profile.dimension?.ch0 ?? null);
      if (!obj) {
        questAutoRef.current = false;
        setQuestAuto(false);
        return;
      }
      world.walkToNpc(obj.npc);
    }
    function playScene(sc: Scene, npc?: string) {
      if (npc) world.holdNpc(npc);
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
      const got = finishScene(ch, s.scene, choice);
      saveProfile(profile);
      setCh0({ ...ch, notes: { ...ch.notes }, clues: [...(ch.clues ?? [])] });
      if (got.length) {
        setFlash(got[0]);
        setToast(`📔 수첩에 적었다: ${got.map((g) => NOTES.find((n) => n.id === g)!.q).join(' · ')}`);
        window.setTimeout(() => setFlash(null), 2400);
        window.setTimeout(() => setToast(null), 3200);
      }
      const nx = nextScene(ch, s.scene);
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
      world.endTalk();
      saveProfile(profile);
      setTalk(null);
    }
    function nextLine() {
      const t = talkRef.current;
      if (!t) return;
      if (t.idx + 1 < t.lines.length) setTalk({ ...t, idx: t.idx + 1 });
      else closeTalk();
    }
    talkApi.current = { start: startTalk, next: nextLine, close: closeTalk, story: nextStory, pick: pickChoice, quest: toggleQuestAuto };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
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
      saveProfile(profile);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
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
    return watchPad({ 0: () => ready() && setPaused(false), 1: () => ready() && onExit() });
  }, [paused, onExit]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <FieldHud hud={hud} onToggleAuto={() => worldRef.current?.toggleAuto()} touch={touch} portrait={portrait} />}

      {/* 수동 조작일 때만 터치 버튼 (자동사냥 중엔 필요 없음) */}
      {touch && hud && !hud.auto && !hud.dead && !paused && !inventory && !talk && <TouchControls kb={kb} map={P1_KEYS} />}

      {/* NPC 가까이: 말 걸기 */}
      {hud?.npc && !talk && !story && !paused && (
        <button
          onClick={() => talkApi.current?.start()}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg hover:bg-black/85"
        >
          💬 {hud.npc.name} <span className="font-normal text-white/60">({hud.npc.title})</span>
          {!hud.npc.met && <span className="ml-1 text-amber-300">❗</span>} 대화하기{!touch && ' · E'}
        </button>
      )}
      {/* 0장: 살펴볼 곳 */}
      {hud?.spot && !hud.npc && ch0 && !talk && !story && !paused && (
        <button
          onClick={() => talkApi.current?.start()}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-sky-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-sky-100 shadow-lg hover:bg-black/85"
        >
          🔍 {hud.spot.name} 살펴보기{!hud.spot.seen && <span className="ml-1 text-sky-300">❗</span>}
          {!touch && ' · E'}
        </button>
      )}
      {ch0 && !paused && !inventory && (
        <QuestNotebook ch0={ch0} flash={flash} touch={touch} next={nextObjective(ch0)?.label ?? null} auto={questAuto} onAuto={() => talkApi.current?.quest()} />
      )}
      {toast && (
        <div className="note-toast pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-amber-200/50 bg-[#2a1f12]/90 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg">{toast}</div>
      )}
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
        <button onClick={() => setPaused(true)} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          메뉴{!touch && ' (Esc)'}
        </button>
        <button onClick={onExit} className="rounded bg-cyan-500/30 px-3 py-1.5 font-bold text-cyan-100 hover:bg-cyan-500/50">
          🖥️ 로그아웃
        </button>
      </div>

      <RotateHint touch={touch} />

      {inventory && <InventoryPanel profile={profile} onClose={() => setInventory(false)} />}

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
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              로그아웃 (서울 집으로)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
