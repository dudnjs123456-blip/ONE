'use client';

import { useEffect, useRef, useState } from 'react';
import { BossBattle, type BossHudState } from '@/game/core/boss';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { KeyboardController, RecordingController, TapeController } from '@/game/core/controllers';
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
  /** 리플레이 재생 중 */
  const [replaying, setReplaying] = useState(false);
  const replayingRef = useRef(false);
  replayingRef.current = replaying;
  const replayRef = useRef<() => void>(() => {});
  const skipReplayRef = useRef<() => void>(() => {});
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

    // 리플레이: 시작 때 프로필(레벨·피로 등)을 복사해 두고, 내 입력을 녹화한다. 엔진이 결정론적이라 같은 경기가 재현된다
    const seed = Date.now() & 0xffff;
    const snapshot = structuredClone(profile);
    const rec = new RecordingController(new KeyboardController(kb, P1_KEYS, 0));
    const battle = new BossBattle(boss, profile, rec, seed);
    /** 지금 화면에 돌리는 전투 (리플레이 중이면 재생용) */
    let cur = battle;
    let replayEndAt = 0;
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
      if (e.code === 'Escape' && replayingRef.current) skipReplayRef.current();
      else if (e.code === 'Escape' && !battle.result) setPaused((p) => !p);
      if (e.code === 'Backquote') setHitboxes((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    // 패드 Start = 일시정지
    const unwatchPad = watchPadButtons({ start: () => (replayingRef.current ? skipReplayRef.current() : setPaused((p) => !p)) });

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let lastBanner: string | null = null;
    let wasEnraged = false;
    let saved = false;
    const backToBattle = () => {
      cur = battle;
      replayEndAt = 0;
      lastBanner = battle.hud().banner;
      lastHudKey = '';
      setReplaying(false);
    };
    replayRef.current = () => {
      // 복사본 프로필로 돌리므로 리플레이의 보상은 진짜 프로필에 들어가지 않는다
      cur = new BossBattle(boss, structuredClone(snapshot), new TapeController(rec.tape), seed);
      replayEndAt = 0;
      lastBanner = null;
      setReplaying(true);
    };
    skipReplayRef.current = backToBattle;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 250) / 1000;
      acc += dt * 1000;
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 5) {
        if (!pausedRef.current) cur.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;
      if (battle.result && !saved) {
        saved = true;
        saveProfile(profile);
      }

      renderer.sync(cur, hitboxRef.current, makeClock(cur.frame, acc / FRAME_MS, cur.hitstop > 0, dt));
      let h = cur.hud();
      if (cur !== battle) {
        // 리플레이 중엔 결과 창을 띄우지 않고, 끝나면 잠깐 보여 준 뒤 원래 결과로
        if (cur.result) {
          if (!replayEndAt) replayEndAt = now;
          else if (now - replayEndAt > 2500) backToBattle();
        }
        h = { ...h, result: null };
      }
      const key = JSON.stringify(h);
      if (key !== lastHudKey) {
        if (h.banner !== lastBanner) {
          if (h.phase === 'intro' && h.banner === boss.name) playCue('round');
          else if (h.banner === 'FIGHT!') playCue('fight');
          else if (h.banner?.startsWith('VICTORY')) {
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
      {hud && <BossHud hud={hud} onRetry={onRetry} onExit={onExit} onReplay={() => replayRef.current()} touch={touch} portrait={portrait} />}

      {replaying && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm font-black tracking-widest text-red-400">
            <span className="animate-pulse">●</span> REPLAY
          </div>
          <button
            onClick={() => skipReplayRef.current()}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-5 py-2 text-sm font-bold text-white hover:bg-black/75"
          >
            ⏭ 건너뛰기{!touch && ' (Esc)'}
          </button>
        </>
      )}

      {touch && !paused && !replaying && hud && !hud.result && <TouchControls kb={kb} map={P1_KEYS} />}
      <RotateHint touch={touch} />

      {!hud?.result && !replaying && (
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
