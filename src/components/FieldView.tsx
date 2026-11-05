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

export default function FieldView({ profile, onExit }: { profile: PlayerProfile; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<FieldWorld | null>(null);
  const [hud, setHud] = useState<FieldHudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [inventory, setInventory] = useState(false);
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('field');

    const world = new FieldWorld(new FieldKeyboardController(kb, P1_KEYS, 0), new AutoHuntController(), profile, Date.now() & 0xffff);
    worldRef.current = world;

    const renderer = new FieldRenderer(canvas);
    const detachZoom = attachZoomControls(renderer, 0.2, 2.2);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'KeyZ' && !e.repeat) world.toggleAuto();
      if (e.code === 'KeyI' && !e.repeat) setInventory((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    // 패드: Start = 일시정지, Back = 자동사냥
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p), select: () => world.toggleAuto() });

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
  }, [profile, kb]);

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
      {touch && hud && !hud.auto && !hud.dead && !paused && !inventory && <TouchControls kb={kb} map={P1_KEYS} />}

      <div className={`absolute right-4 top-4 flex gap-2 whitespace-nowrap text-xs ${touch && portrait ? 'flex-col items-end' : ''}`}>
        <SoundToggle compact={touch} className="!bg-black/50 hover:!bg-black/70" />
        <MusicToggle compact={touch} className="!bg-black/50 hover:!bg-black/70" />
        <button onClick={() => setInventory((v) => !v)} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          가방{!touch && ' (I)'}
        </button>
        <button onClick={() => setPaused(true)} className="rounded bg-black/50 px-3 py-1.5 text-white/80 hover:bg-black/70">
          메뉴{!touch && ' (Esc)'}
        </button>
      </div>

      <RotateHint touch={touch} />

      {inventory && <InventoryPanel profile={profile} onClose={() => setInventory(false)} />}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">일시정지</div>
            <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <VibrationToggle />
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
