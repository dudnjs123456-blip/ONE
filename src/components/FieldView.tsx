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
import VillageTalk, { type TalkState } from './VillageTalk';

/** 접속 연출 시간 (ms) */
const WARP_MS = 1600;

/**
 * 다른 차원: 서울 집 컴퓨터로 접속하는 사냥터. 로그인했으면 같은 차원에 들어온 사람들과 같은 몬스터를 본다.
 * 로그아웃하면 서울 집 컴퓨터 앞으로 돌아간다.
 */
export default function FieldView({ profile, account = null, onExit }: { profile: PlayerProfile; account?: Account | null; onExit: () => void }) {
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
  const talkApi = useRef<{ start: () => void; next: () => void; close: () => void } | null>(null);
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
    profile.dimension = { visits: (profile.dimension?.visits ?? 0) + 1 };
    saveProfile(profile);
    const warpTimer = window.setTimeout(() => setWarp(false), WARP_MS);

    const renderer = new FieldRenderer(canvas);
    const detachZoom = attachZoomControls(renderer, 0.2, 2.2);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      // 대화 중: E · Enter · Space 다음 줄, Esc 닫기 (게임 키는 대화창이 먹는다)
      const t = talkRef.current;
      if (t) {
        if (e.repeat) return;
        if (e.code === 'Escape') closeTalk();
        else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') nextLine();
        return;
      }
      if (e.code === 'KeyE' && !e.repeat) startTalk();
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'KeyZ' && !e.repeat) world.toggleAuto();
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    // 패드: Start = 일시정지, Back = 자동사냥
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p), select: () => world.toggleAuto() });

    function startTalk() {
      const r = world.talk();
      if (r) setTalk({ npc: r.npc, lines: r.lines, idx: 0, first: r.first });
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
    talkApi.current = { start: startTalk, next: nextLine, close: closeTalk };

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
      window.clearTimeout(warpTimer);
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
  }, [profile, kb, account]);

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
      {hud?.npc && !talk && !paused && (
        <button
          onClick={() => talkApi.current?.start()}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/50 bg-black/70 px-5 py-2 text-sm font-bold text-amber-100 shadow-lg hover:bg-black/85"
        >
          💬 {hud.npc.name} <span className="font-normal text-white/60">({hud.npc.title})</span>
          {!hud.npc.met && <span className="ml-1 text-amber-300">❗</span>} 대화하기{!touch && ' · E'}
        </button>
      )}
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
