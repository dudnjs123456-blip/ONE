'use client';

import { useEffect, useRef, useState } from 'react';
import { BossBattle, type BossHudState } from '@/game/core/boss';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { KeyboardController } from '@/game/core/controllers';
import { Keyboard, P1_KEYS } from '@/game/core/input';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import type { BossDef } from '@/game/data/bosses';
import { PLAYER_LOOK } from '@/game/render/looks';
import { GameRenderer } from '@/game/render/renderer';
import BossHud from './BossHud';
import { attachZoomControls } from './zoomControls';

/** 보스 레이드 (수동 조작) */
export default function BossView({
  boss,
  profile,
  onRetry,
  onExit,
}: {
  boss: BossDef;
  profile: PlayerProfile;
  onRetry: () => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<BossHudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [hitboxes, setHitboxes] = useState(false);
  const pausedRef = useRef(paused);
  const hitboxRef = useRef(hitboxes);
  pausedRef.current = paused;
  hitboxRef.current = hitboxes;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const kb = new Keyboard();
    kb.attach(window);

    const battle = new BossBattle(boss, profile, new KeyboardController(kb, P1_KEYS), Date.now() & 0xffff);
    const renderer = new GameRenderer(canvas, {
      looks: [PLAYER_LOOK, { kind: 'basic', color: boss.color }],
      scales: [1, boss.scale],
      theme: 'boss',
      damageNumbers: true,
    });
    const detachZoom = attachZoomControls(renderer, 0.35, 1.8);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !battle.result) setPaused((p) => !p);
      if (e.code === 'Backquote') setHitboxes((h) => !h);
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let saved = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 5) {
        if (!pausedRef.current) battle.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;
      if (battle.result && !saved) {
        saved = true;
        saveProfile(profile);
      }

      renderer.sync(battle, hitboxRef.current, makeClock(battle.frame, acc / FRAME_MS, battle.hitstop > 0, dt));
      const h = battle.hud();
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
    };
  }, [boss, profile]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <BossHud hud={hud} onRetry={onRetry} onExit={onExit} />}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">일시정지</div>
            <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <button onClick={() => setHitboxes((h) => !h)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              판정 표시 {hitboxes ? 'ON' : 'OFF'}
            </button>
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              포기하고 나가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
