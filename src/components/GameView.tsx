'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { CpuController, DummyController, KeyboardController, type Controller } from '@/game/core/controllers';
import { Keyboard, P1_KEYS, P2_KEYS } from '@/game/core/input';
import { Match, type HudState, type MatchMode } from '@/game/core/match';
import { GameRenderer } from '@/game/render/renderer';
import Hud from './Hud';
import { attachZoomControls } from './zoomControls';

function setup(mode: MatchMode, kb: Keyboard): { controllers: [Controller, Controller]; names: [string, string] } {
  const p1 = new KeyboardController(kb, P1_KEYS);
  switch (mode) {
    case 'versus':
      return { controllers: [p1, new KeyboardController(kb, P2_KEYS)], names: ['PLAYER 1', 'PLAYER 2'] };
    case 'cpu':
      return { controllers: [p1, new CpuController(Date.now() & 0xffff)], names: ['PLAYER 1', 'CPU'] };
    case 'training':
      return { controllers: [p1, new DummyController()], names: ['PLAYER 1', 'DUMMY'] };
  }
}

export default function GameView({ mode, onExit }: { mode: MatchMode; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matchRef = useRef<Match | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [hitboxes, setHitboxes] = useState(mode === 'training');
  const pausedRef = useRef(paused);
  const hitboxRef = useRef(hitboxes);
  pausedRef.current = paused;
  hitboxRef.current = hitboxes;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const kb = new Keyboard();
    kb.attach(window);

    const { controllers, names } = setup(mode, kb);
    const match = new Match(mode, controllers, names);
    matchRef.current = match;

    const renderer = new GameRenderer(canvas);
    const detachZoom = attachZoomControls(renderer, 0.35, 1.8);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'Backquote') setHitboxes((h) => !h);
    };
    window.addEventListener('keydown', onKey);

    // 고정 타임스텝: 화면 주사율과 무관하게 로직은 항상 60fps 로 진행
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 5) {
        if (!pausedRef.current) match.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;

      renderer.sync(match, hitboxRef.current, makeClock(match.frame, acc / FRAME_MS, match.hitstop > 0, dt));
      const h = match.hud();
      const key = JSON.stringify(h);
      if (key !== lastHudKey) {
        lastHudKey = key;
        setHud(h);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      kb.detach(window);
      detachZoom();
      renderer.dispose();
      matchRef.current = null;
    };
  }, [mode]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <Hud hud={hud} />}

      <div className="absolute bottom-4 right-4 flex gap-2 text-xs">
        <button
          onClick={() => setHitboxes((h) => !h)}
          className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20"
        >
          판정 표시 {hitboxes ? 'ON' : 'OFF'} (`)
        </button>
        <button onClick={() => setPaused(true)} className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20">
          일시정지 (Esc)
        </button>
      </div>

      {(paused || hud?.phase === 'matchEnd') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">{paused ? '일시정지' : '경기 종료'}</div>
            {paused && (
              <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
                계속하기
              </button>
            )}
            <button
              onClick={() => {
                matchRef.current?.restart();
                setPaused(false);
              }}
              className="rounded bg-white/10 py-2 hover:bg-white/20"
            >
              다시 시작
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
