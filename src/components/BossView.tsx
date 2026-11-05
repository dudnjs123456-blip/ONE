'use client';

import { useEffect, useRef, useState } from 'react';
import { BossBattle, type BossHudState } from '@/game/core/boss';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { KeyboardController } from '@/game/core/controllers';
import { Keyboard, P1_KEYS, watchPad, watchPadButtons } from '@/game/core/input';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import type { BossDef } from '@/game/data/bosses';
import { playerLook } from '@/game/render/looks';
import { wornList } from '@/game/data/fashion';
import { GameRenderer } from '@/game/render/renderer';
import BossHud from './BossHud';
import SoundToggle from './SoundToggle';
import VibrationToggle from './VibrationToggle';
import MusicToggle from './MusicToggle';
import { startBgm, stopBgm } from '@/game/render/bgm';
import TouchControls, { useIsTouch } from './TouchControls';
import RotateHint, { usePortrait } from './RotateHint';
import MoveListPanel from './MoveListPanel';
import { playCue, unlockAudioOnInput } from '@/game/render/sfx';
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
  const [showMoves, setShowMoves] = useState(false);
  // 일시정지를 풀면 기술표도 닫는다 (다음 일시정지 때 갑자기 열려 있지 않게)
  useEffect(() => {
    if (!paused) setShowMoves(false);
  }, [paused]);
  const [hitboxes, setHitboxes] = useState(false);
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  const pausedRef = useRef(paused);
  const hitboxRef = useRef(hitboxes);
  pausedRef.current = paused;
  hitboxRef.current = hitboxes;

  useEffect(() => {
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('boss');

    const battle = new BossBattle(boss, profile, new KeyboardController(kb, P1_KEYS, 0), Date.now() & 0xffff);
    const renderer = new GameRenderer(canvas, {
      looks: [playerLook(wornList(profile.wardrobe), profile.body), { kind: 'basic', color: boss.color }],
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
    // 패드 Start = 일시정지
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p) });

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let lastBanner: string | null = null;
    let wasEnraged = false;
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
        if (h.banner !== lastBanner) {
          if (h.phase === 'intro' && h.banner === boss.name) playCue('round');
          else if (h.banner === 'FIGHT!') playCue('fight');
          else if (h.banner === 'VICTORY') {
            playCue('ko');
            window.setTimeout(() => playCue('win'), 700);
          } else if (h.banner === 'DEFEAT' || h.banner === 'TIME OVER') playCue('lose');
          lastBanner = h.banner;
        }
        if (h.enraged && !wasEnraged) playCue('roar');
        wasEnraged = h.enraged;
        lastHudKey = key;
        setHud(h);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      unwatchPad();
      kb.detach(window);
      unlock();
      stopBgm();
      detachZoom();
      renderer.dispose();
    };
  }, [boss, profile, kb]);

  // 패드로 메뉴: 일시정지 A 계속·B 나가기, 결과 화면 A 다시 도전·B 보스 선택 (뜬 직후 0.7초는 무시 — 연타하던 버튼이 바로 누르지 않게)
  const hasResult = !!hud?.result;
  useEffect(() => {
    if (!paused && !hasResult) return;
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 700;
    return watchPad({
      0: () => ready() && (hasResult ? onRetry() : setPaused(false)),
      1: () => ready() && onExit(),
    });
  }, [paused, hasResult, onRetry, onExit]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && <BossHud hud={hud} onRetry={onRetry} onExit={onExit} touch={touch} portrait={portrait} />}

      {touch && !paused && hud && !hud.result && <TouchControls kb={kb} map={P1_KEYS} />}
      <RotateHint touch={touch} />

      {!hud?.result && (
        <div className="absolute right-4 top-24 flex gap-2 whitespace-nowrap text-xs">
          <SoundToggle compact={touch} />
          <MusicToggle compact={touch} />
          <button onClick={() => setPaused(true)} className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20">
            일시정지{!touch && ' (Esc)'}
          </button>
        </div>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">일시정지</div>
            <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
              계속하기
            </button>
            <button onClick={() => setShowMoves(true)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              기술표 보기
            </button>
            <VibrationToggle />
            <button onClick={() => setHitboxes((h) => !h)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              판정 표시 {hitboxes ? 'ON' : 'OFF'}
            </button>
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              포기하고 나가기
            </button>
          </div>
        </div>
      )}
      {paused && showMoves && <MoveListPanel onClose={() => setShowMoves(false)} />}
    </div>
  );
}
