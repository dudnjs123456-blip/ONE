'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { FieldKeyboardController } from '@/game/core/fieldControllers';
import { Keyboard, P1_KEYS } from '@/game/core/input';
import type { PlayerProfile } from '@/game/core/profile';
import { PrologueWorld, type ProloguePhase } from '@/game/story/prologue';
import { PrologueRenderer } from '@/game/render/prologueScene';
import { BEAST_NAME, PROLOGUE_SCRIPT, type ScriptLine } from '@/game/data/prologueScript';
import { playerPortrait } from '@/game/data/portraits';
import { startBgm, stopBgm } from '@/game/render/bgm';
import { playWhoosh, unlockAudioOnInput } from '@/game/render/sfx';
import StoryDialog, { type DialogChoice, type DialogLine } from './StoryDialog';
import TouchControls, { useIsTouch } from './TouchControls';

/** 모니터 속으로 빨려 들어가는 연출 (ms) */
const SUCK_MS = 2600;
/** 떨어진 뒤 화면이 어두워지고 다음(마을)으로 넘어가기까지 (ms) */
const BLACKOUT_MS = 2400;

interface Talk {
  phase: ProloguePhase;
  lines: ScriptLine[];
  idx: number;
}

/**
 * 차원 첫 접속 프롤로그 (한 번만): 게임을 켰더니 컴퓨터 속으로 → 안개 숲에 떨어짐 → 정체 모를 그림자에게 쫓김
 * → 벼랑 끝에서 뛰어내림. 끝나면 onDone (경계 마을에서 구조된 채 깨어난다).
 * 대사는 모두 말하는 사람 초상화와 함께 나온다.
 */
export default function DimensionPrologue({ profile, onDone, onExit }: { profile: PlayerProfile; onDone: () => void; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const [suck, setSuck] = useState(true);
  const [phase, setPhase] = useState<ProloguePhase>('fall');
  const [talk, setTalk] = useState<Talk | null>(null);
  const [faces, setFaces] = useState<{ me: string | null; beast: string | null }>({ me: null, beast: null });
  const [black, setBlack] = useState(false);
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const api = useRef<{ next: () => void; choose: (jump: boolean) => void } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('field');
    const world = new PrologueWorld(new FieldKeyboardController(kb, P1_KEYS, 0), profile);
    const renderer = new PrologueRenderer(canvas, world);
    if (process.env.NODE_ENV === 'development') Object.assign(window as object, { __prologue: world, __prologueR: renderer });
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    let started = false;
    const suckTimer = window.setTimeout(() => {
      started = true;
      setSuck(false);
      playWhoosh(true);
    }, SUCK_MS);
    let blackTimer = 0;
    let lastPhase: ProloguePhase | null = null;
    /** 대사를 띄운 뒤 얼굴을 아직 못 찍었으면 다시 찍어 본다 */
    let needFaces = false;

    const shoot = () => {
      const me = renderer.portrait('me', world);
      const beast = world.beastOut ? renderer.portrait('beast', world) : null;
      setFaces({ me, beast });
      needFaces = !me || (world.beastOut && !beast);
    };

    const next = () => {
      const t = talkRef.current;
      if (!t) return;
      if (t.idx + 1 < t.lines.length) return setTalk({ ...t, idx: t.idx + 1 });
      // 마지막 줄: 벼랑에선 선택지가 뜬다 (StoryDialog 가 버튼을 그린다). 그 밖엔 다음 단계로
      if (t.phase === 'cliff' || t.phase === 'cornered') return;
      setTalk(null);
      world.finishTalk();
    };
    const choose = (jump: boolean) => {
      setTalk(null);
      world.choose(jump);
      if (jump) playWhoosh(true);
    };
    api.current = { next, choose };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = talkRef.current;
      if (!t) return;
      const last = t.idx + 1 >= t.lines.length;
      if ((t.phase === 'cliff' || t.phase === 'cornered') && last) {
        if (e.code === 'Digit1') choose(true);
        if (e.code === 'Digit2' && t.phase === 'cliff') choose(false);
        return;
      }
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') next();
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 250) / 1000;
      last = now;
      if (started) {
        acc += dt * 1000;
        let steps = 0;
        while (acc >= FRAME_MS && steps < 5) {
          world.step();
          acc -= FRAME_MS;
          steps++;
        }
        if (steps === 5) acc = 0;
      }
      renderer.sync(world, makeClock(world.frame, acc / FRAME_MS, false, dt));
      if (world.phase !== lastPhase) {
        lastPhase = world.phase;
        setPhase(world.phase);
        const lines = (PROLOGUE_SCRIPT as Record<string, ScriptLine[] | undefined>)[world.phase];
        if (lines && world.talking) {
          setTalk({ phase: world.phase, lines, idx: 0 });
          shoot();
        }
        if (world.phase === 'done' && !blackTimer) {
          setBlack(true);
          blackTimer = window.setTimeout(() => doneRef.current(), BLACKOUT_MS);
        }
      } else if (needFaces && world.frame % 20 === 0) shoot();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(suckTimer);
      window.clearTimeout(blackTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      kb.detach(window);
      unlock();
      stopBgm();
      renderer.dispose();
    };
  }, [profile, kb]);

  const line: DialogLine | null = talk
    ? (() => {
        const l = talk.lines[talk.idx];
        if (l.who === 'beast') return { who: 'beast', name: BEAST_NAME, title: '정체 모를 그림자', text: l.text, portrait: faces.beast, tone: 'danger' as const };
        return { who: 'me', name: '나', text: l.text, portrait: playerPortrait(profile.body, l.mood) ?? faces.me };
      })()
    : null;
  const choices: DialogChoice[] | null =
    talk?.phase === 'cliff'
      ? [
          { label: '🪂 벼랑 아래로 뛰어내린다 (1)', onPick: () => api.current?.choose(true) },
          { label: '👊 맞서 싸운다 (2)', onPick: () => api.current?.choose(false) },
        ]
      : talk?.phase === 'cornered'
        ? [{ label: '🪂 뛰어내린다! (1)', onPick: () => api.current?.choose(true) }]
        : null;
  const control = !talk && (phase === 'explore' || phase === 'chase');

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* 길잡이 */}
      {control && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
          {phase === 'chase' ? (
            <div className="animate-pulse rounded-full border border-rose-400/60 bg-rose-950/70 px-5 py-2 text-base font-black text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.5)]">
              도망쳐! {touch ? '달리기 버튼 + 방향' : 'Shift + 방향키 = 달리기'} · 북쪽(위)으로
            </div>
          ) : (
            <div className="rounded-full bg-black/55 px-4 py-1.5 text-sm text-white/80">{touch ? '방향 버튼으로 이동' : '방향키 이동 · Shift 달리기'} · 길을 따라 위로</div>
          )}
        </div>
      )}
      {touch && control && <TouchControls kb={kb} map={P1_KEYS} />}

      {line && <StoryDialog line={line} idx={talk!.idx} total={talk!.lines.length} onNext={() => api.current?.next()} choices={choices} touch={touch} nextLabel="계속" />}

      <button onClick={onDone} className="absolute right-4 top-4 rounded bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:bg-black/70 hover:text-white">
        건너뛰기 ▸▸
      </button>
      <button onClick={onExit} className="absolute left-4 top-4 rounded bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:bg-black/70 hover:text-white">
        🖥️ 로그아웃
      </button>

      {/* 모니터 속으로 빨려 들어간다 */}
      {suck && (
        <div className="prologue-suck pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          <div className="prologue-monitor relative flex aspect-video w-[min(70vw,640px)] items-center justify-center overflow-hidden rounded-lg border-4 border-zinc-700 bg-[#0b0820]">
            <div className="text-center font-mono">
              <div className="text-3xl font-black tracking-[0.4em] text-cyan-200 sm:text-5xl">DIMENSION</div>
              <div className="mt-3 text-xs text-white/60 sm:text-sm">게임을 시작합니다…</div>
            </div>
            <div className="dim-warp absolute inset-0" />
          </div>
        </div>
      )}

      {/* 떨어지고 나서: 암전 */}
      {black && (
        <div className="prologue-black pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-lg tracking-[0.5em] text-white/50">……</div>
        </div>
      )}
    </div>
  );
}
