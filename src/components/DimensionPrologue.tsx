'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import { FieldKeyboardController } from '@/game/core/fieldControllers';
import { Keyboard, P1_KEYS } from '@/game/core/input';
import type { PlayerProfile } from '@/game/core/profile';
import { CLIFF_Z, PATH, PrologueWorld, type ProloguePhase } from '@/game/story/prologue';
import { PrologueRenderer } from '@/game/render/prologueScene';
import { BEAST_NAME, PROLOGUE_SCRIPT, type ScriptLine } from '@/game/data/prologueScript';
import { storyPortrait } from '@/game/data/portraits';
import { startBgm, stopBgm } from '@/game/render/bgm';
import { playWhoosh, unlockAudioOnInput } from '@/game/render/sfx';
import { cinematicShots } from '@/game/data/cinematics';
import CinematicPlayer from './CinematicPlayer';
import StoryDialog, { type DialogChoice, type DialogLine } from './StoryDialog';
import TouchControls, { useIsTouch } from './TouchControls';

/** 게임 로딩 화면 → 하얗게 번지며 접속되는 연출 (ms) */
const SUCK_MS = 3400;
/** 떨어진 뒤 화면이 어두워지고 다음(마을)으로 넘어가기까지 (ms) */
const BLACKOUT_MS = 2400;

/** 가짜 게임 화면(HUD) 상태: 그림자가 다가오면 겹겹이 꺼진다 */
interface Hud {
  level: 0 | 1 | 2 | 3;
  glitch: boolean;
  hp: number;
  x: number;
  z: number;
}

interface Talk {
  phase: ProloguePhase;
  lines: ScriptLine[];
  idx: number;
}

/**
 * 차원 첫 접속 프롤로그 (한 번만): 게임 로딩 화면이 하얗게 번지고 → 빛기둥 속에서 안개 숲에 나타난다.
 * 화면엔 진짜 게임처럼 퀘스트·미니맵·체력 바(HUD)가 떠 있어 주인공은 게임이라고 믿는다 → 정체 모를 그림자가 오자
 * HUD 가 지지직거리며 하나씩 꺼지고 → 벼랑 끝에서 "어차피 게임인데" 뛰어내린다 (그 순간 HUD 가 완전히 사라진다). 끝나면 onDone (경계 마을에서 구조된 채 깨어난다).
 * 대사는 모두 말하는 사람 초상화와 함께 나온다.
 */
export default function DimensionPrologue({ profile, playerName, onDone, onExit }: { profile: PlayerProfile; playerName?: string | null; onDone: () => void; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const [suck, setSuck] = useState(true);
  const [phase, setPhase] = useState<ProloguePhase>('spawn');
  const [hud, setHud] = useState<Hud>({ level: 3, glitch: false, hp: 1, x: 0, z: 0 });
  const [talk, setTalk] = useState<Talk | null>(null);
  const [faces, setFaces] = useState<{ me: string | null; beast: string | null }>({ me: null, beast: null });
  const [black, setBlack] = useState(false);
  /** 그림자를 만난 대사가 끝나면 2D 컷신(도망치기 시작) → 끝나면 추격 */
  const [cine, setCine] = useState(false);
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const api = useRef<{ next: () => void; choose: (jump: boolean) => void; cineEnd: () => void } | null>(null);
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
      // 내 캐릭터 그림으로 만든 컷신이 있으면 먼저 틀고, 끝나면 추격을 시작한다
      if (t.phase === 'encounter' && cinematicShots('prologueChase', profile.body)) return setCine(true);
      world.finishTalk();
    };
    const cineEnd = () => {
      setCine(false);
      world.finishTalk();
    };
    const choose = (jump: boolean) => {
      setTalk(null);
      world.choose(jump);
      if (jump) playWhoosh(true);
    };
    api.current = { next, choose, cineEnd };

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
      if (world.frame % 6 === 0) {
        const p = world.player;
        const next: Hud = { level: world.hudLevel, glitch: world.hudGlitch, hp: Math.round((p.hp / p.maxHp) * 50) / 50, x: Math.round(p.x * 4) / 4, z: Math.round(p.z * 4) / 4 };
        setHud((h) => (h.level === next.level && h.glitch === next.glitch && h.hp === next.hp && h.x === next.x && h.z === next.z ? h : next));
      }
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
        return { who: 'me', name: '나', text: l.text, portrait: storyPortrait(profile.body, l.face, l.mood) ?? faces.me };
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

      {!suck && phase !== 'spawn' && <FakeHud hud={hud} name={playerName || '플레이어'} />}

      {/* 길잡이 */}
      {control && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
          {phase === 'chase' ? (
            <div className="animate-pulse rounded-full border border-rose-400/60 bg-rose-950/70 px-5 py-2 text-base font-black text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.5)]">
              도망쳐! {touch ? '달리기 버튼 + 방향' : 'Shift + 방향키 = 달리기'} · 북쪽(위)으로
            </div>
          ) : (
            <div className="rounded border border-cyan-300/50 bg-[#06142a]/80 px-4 py-1.5 font-mono text-sm text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.35)]">
              <span className="mr-2 rounded bg-cyan-400/80 px-1.5 text-[11px] font-black text-[#06142a]">TUTORIAL</span>
              {touch ? '방향 버튼으로 이동' : '방향키 이동 · Shift 달리기'} · 길을 따라 북쪽으로
            </div>
          )}
        </div>
      )}
      {touch && control && <TouchControls kb={kb} map={P1_KEYS} />}

      {cine && <CinematicPlayer id="prologueChase" body={profile.body} onEnd={() => api.current?.cineEnd()} />}

      {line && <StoryDialog line={line} idx={talk!.idx} total={talk!.lines.length} onNext={() => api.current?.next()} choices={choices} touch={touch} nextLabel="계속" />}

      <button onClick={onDone} className="absolute right-4 top-4 rounded bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:bg-black/70 hover:text-white">
        건너뛰기 ▸▸
      </button>
      <button onClick={onExit} className="absolute left-4 top-4 rounded bg-black/50 px-3 py-1.5 text-xs text-white/60 hover:bg-black/70 hover:text-white">
        🖥️ 로그아웃
      </button>

      {/* 평범한 게임 로딩 화면 → 다 차면 화면이 하얗게 번지며 그대로 숲으로 */}
      {suck && (
        <div className="prologue-load pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-[#05040e] font-mono">
          <div className="text-4xl font-black tracking-[0.4em] text-cyan-200 sm:text-6xl">DIMENSION</div>
          <div className="mt-8 h-1.5 w-[min(70vw,420px)] overflow-hidden rounded-full bg-white/10">
            <div className="prologue-load-bar h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
          </div>
          <div className="mt-3 text-xs text-white/50">월드에 접속하는 중…</div>
          <div className="mt-10 max-w-sm px-6 text-center text-xs leading-5 text-white/40">TIP · 이 세계에서 겪는 일은 모두 당신의 것이 됩니다.</div>
          <div className="prologue-white absolute inset-0 bg-[#f6f3ff]" />
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

/**
 * 가짜 게임 화면: 왼쪽 위 이름·체력 바, 오른쪽 위 미니맵, 그 아래 퀘스트 창.
 * 그림자가 나타나면 지지직 흔들리고, 쫓길수록 퀘스트 → 미니맵 순으로 꺼진다. 벼랑에서 떨어지는 순간 전부 사라진다.
 */
function FakeHud({ hud, name }: { hud: Hud; name: string }) {
  if (hud.level === 0) return null;
  const g = hud.glitch ? 'hud-glitch' : '';
  // 미니맵: 숲길 한 줄기 (남 → 북). 세로로 길게, 위쪽이 북쪽(벼랑)
  const W = 96;
  const H = 120;
  const zTop = CLIFF_Z - 2;
  const zBot = PATH[0].z + 2;
  const mx = (x: number) => W / 2 + x * 6;
  const my = (z: number) => ((z - zTop) / (zBot - zTop)) * H;
  return (
    <div className="pointer-events-none absolute inset-0 font-mono">
      {/* 이름 · 체력 */}
      <div className={`absolute left-4 top-14 w-56 rounded border border-cyan-300/40 bg-[#06142a]/75 px-3 py-2 shadow-[0_0_16px_rgba(103,232,249,0.3)] ${g}`}>
        <div className="flex items-baseline justify-between text-xs text-cyan-100">
          <span className="font-bold">{name}</span>
          <span className="text-cyan-300/70">Lv.1</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-sm bg-black/50">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-300" style={{ width: `${Math.max(0, hud.hp) * 100}%` }} />
        </div>
        <div className="mt-0.5 text-right text-[10px] text-cyan-200/60">HP {Math.round(hud.hp * 100)}%</div>
      </div>
      {/* 미니맵 */}
      {hud.level >= 2 && (
        <div className={`absolute right-4 top-14 rounded border border-cyan-300/40 bg-[#06142a]/75 p-1.5 shadow-[0_0_16px_rgba(103,232,249,0.3)] ${g}`}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <polyline points={PATH.map((p) => `${mx(p.x)},${my(p.z)}`).join(' ')} fill="none" stroke="rgba(165,243,252,0.35)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={mx(PATH[PATH.length - 1].x)} cy={my(CLIFF_Z)} r={4} fill="#fbbf24" />
            <circle cx={mx(hud.x)} cy={my(hud.z)} r={4} fill="#67e8f9" stroke="#fff" strokeWidth={1.5} />
          </svg>
          <div className="text-center text-[10px] text-cyan-200/70">안개 숲</div>
        </div>
      )}
      {/* 퀘스트 */}
      {hud.level >= 3 && (
        <div className={`absolute right-4 top-[13.5rem] w-48 rounded border border-amber-300/40 bg-[#1a1206]/70 px-3 py-2 text-xs text-amber-50 ${g}`}>
          <div className="text-[10px] font-black tracking-wider text-amber-300">QUEST</div>
          <div className="mt-0.5 font-bold">안개 숲을 벗어나라</div>
          <div className="mt-0.5 text-[11px] text-amber-100/60">· 북쪽 길 끝까지 이동</div>
        </div>
      )}
    </div>
  );
}
