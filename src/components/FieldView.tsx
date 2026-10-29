'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { FieldWorld, type FieldHudState } from '@/game/core/field';
import { AutoHuntController, FieldKeyboardController } from '@/game/core/fieldControllers';
import { Keyboard } from '@/game/core/input';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import { FieldRenderer } from '@/game/render/fieldRenderer';
import FieldHud from './FieldHud';
import InventoryPanel from './InventoryPanel';
import { attachZoomControls } from './zoomControls';

export default function FieldView({ profile, onExit }: { profile: PlayerProfile; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<FieldWorld | null>(null);
  const [hud, setHud] = useState<FieldHudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [inventory, setInventory] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const kb = new Keyboard();
    kb.attach(window);

    const world = new FieldWorld(new FieldKeyboardController(kb), new AutoHuntController(), profile, Date.now() & 0xffff);
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
      kb.detach(window);
      detachZoom();
      renderer.dispose();
      worldRef.current = null;
    };
  }, [profile]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <FieldHud hud={hud} onToggleAuto={() => worldRef.current?.toggleAuto()} />}

      <button
        onClick={() => setPaused(true)}
        className="absolute right-4 top-4 rounded bg-black/50 px-3 py-1.5 text-xs text-white/80 hover:bg-black/70"
      >
        메뉴 (Esc)
      </button>

      {inventory && <InventoryPanel profile={profile} onClose={() => setInventory(false)} />}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">일시정지</div>
            <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
