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
import { RESCUE_SCRIPT, type ScriptLine } from '@/game/data/prologueScript';
import { VILLAGE_NPCS } from '@/game/data/village';
import { storyPortrait } from '@/game/data/portraits';
import { loadDimensionPlace, saveDimensionPlace } from '@/game/core/lastScreen';

/** 접속 연출 시간 (ms) */
const WARP_MS = 1600;

/**
 * 다른 차원: 서울 집 컴퓨터로 접속하는 사냥터. 로그인했으면 같은 차원에 들어온 사람들과 같은 몬스터를 본다.
 * 로그아웃하면 서울 집 컴퓨터 앞으로 돌아간다.
 */
/**
 * 차원 들어가기: 처음이면 프롤로그(게임을 켰더니 컴퓨터 속으로 → 안개 숲 → 그림자에게 쫓겨 벼랑에서 뛰어내림)를 먼저 보고,
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
  const talkApi = useRef<{ start: () => void; next: () => void; close: () => void; story: () => void } | null>(null);
  /** 이야기 장면 대사 (여러 사람이 번갈아 말한다) */
  const [story, setStory] = useState<{ lines: ScriptLine[]; idx: number } | null>(null);
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
      // 새로고침 전에 차원 안에 있던 자리 · 체력 그대로 (차원을 나왔다 다시 들어오면 기억이 지워져 포탈 앞)
      const at = loadDimensionPlace(account?.userId ?? null);
      if (at && at.hp > 0) {
        world.player.reset(at.x, at.z, at.fx, at.fz);
        world.player.hp = Math.min(at.hp, world.player.maxHp);
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
    const detachZoom = attachZoomControls(renderer, 0.2, 2.2);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      // 대화 중: E · Enter · Space 다음 줄, Esc 닫기 (게임 키는 대화창이 먹는다)
      const t = talkRef.current;
      const interact = bindCodes('interact').includes(e.code);
      if (storyRef.current) {
        if (!e.repeat && (interact || e.code === 'Enter' || e.code === 'Space')) nextStory();
        return;
      }
      if (t) {
        if (e.repeat) return;
        if (e.code === 'Escape') closeTalk();
        else if (interact || e.code === 'Enter' || e.code === 'Space') nextLine();
        return;
      }
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
    function nextStory() {
      const s = storyRef.current;
      if (!s) return;
      if (s.idx + 1 < s.lines.length) return setStory({ ...s, idx: s.idx + 1 });
      // 구해 준 사람과 인사한 것으로 친다 (여관 주인이면 차 한 잔으로 기운도 차린다)
      world.endTalk();
      saveProfile(profile);
      setStory(null);
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
    talkApi.current = { start: startTalk, next: nextLine, close: closeTalk, story: nextStory };

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
      {story && (() => {
        const l = story.lines[story.idx];
        const npc = VILLAGE_NPCS.find((n) => n.id === l.who);
        const line: DialogLine =
          l.who === 'me'
            ? { who: 'me', name: '나', text: l.text, portrait: storyPortrait(profile.body, l.face, l.mood) ?? faces.me ?? null }
            : { who: l.who, name: npc?.name ?? l.who, title: npc?.title, text: l.text, portrait: faces[l.who] ?? null };
        return <StoryDialog line={line} idx={story.idx} total={story.lines.length} onNext={() => talkApi.current?.story()} touch={touch} nextLabel="일어나기" />;
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
