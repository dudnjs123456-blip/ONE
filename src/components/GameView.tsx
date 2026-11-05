'use client';

import { useEffect, useRef, useState } from 'react';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import { CPU_REWARD, FIRST_WIN_MULT, grantCpuReward } from '@/game/core/cpuReward';
import { FRAME_MS } from '@/game/core/constants';
import { makeClock } from '@/game/render/clock';
import {
  CPU_LEVELS,
  CPU_STYLES,
  CpuController,
  DUMMY_MODES,
  KeyboardController,
  TrainingDummyController,
  type Controller,
  type CpuLevel,
  type CpuStyle,
  type DummyMode,
} from '@/game/core/controllers';
import { Keyboard, P1_KEYS, P2_KEYS, watchPad, watchPadButtons } from '@/game/core/input';
import { Match, type HudState, type MatchMode } from '@/game/core/match';
import { GameRenderer, VERSUS_THEMES } from '@/game/render/renderer';
import Hud from './Hud';
import TouchControls, { useIsTouch } from './TouchControls';
import RotateHint, { usePortrait } from './RotateHint';
import MoveListPanel from './MoveListPanel';
import TrainingTasks from './TrainingTasks';
import SoundToggle from './SoundToggle';
import VibrationToggle from './VibrationToggle';
import MusicToggle from './MusicToggle';
import { startBgm, stopBgm } from '@/game/render/bgm';
import { playCue, unlockAudioOnInput } from '@/game/render/sfx';
import { attachZoomControls } from './zoomControls';

const LEVEL_KEY = 'ironfist.cpuLevel';
const RECORD_KEY = 'ironfist.cpuRecord';
type CpuRecord = Record<CpuLevel, { w: number; l: number }>;
const EMPTY_RECORD: CpuRecord = { easy: { w: 0, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 0 } };
/** VS CPU 난이도별 전적 (이 브라우저에만 저장) */
function loadRecord(): CpuRecord {
  try {
    const v = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null');
    if (v && typeof v === 'object') return { ...EMPTY_RECORD, ...v };
  } catch {}
  return EMPTY_RECORD;
}
const STREAK_KEY = 'ironfist.cpuStreak';
type Streak = { cur: number; best: number };
/** VS CPU 연승 (난이도 상관없이 이어진다, 이 브라우저에만) */
function loadStreak(): Streak {
  try {
    const v = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null');
    if (v && typeof v.cur === 'number' && typeof v.best === 'number') return v;
  } catch {}
  return { cur: 0, best: 0 };
}
function addStreak(won: boolean): Streak {
  const s = loadStreak();
  const cur = won ? s.cur + 1 : 0;
  const next = { cur, best: Math.max(s.best, cur) };
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function addResult(level: CpuLevel, won: boolean): CpuRecord {
  const r = loadRecord();
  const cur = r[level] ?? { w: 0, l: 0 };
  const next = { ...r, [level]: { w: cur.w + (won ? 1 : 0), l: cur.l + (won ? 0 : 1) } };
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
function savedLevel(): CpuLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'easy' || v === 'normal' || v === 'hard') return v;
  } catch {}
  return 'normal';
}

function setup(mode: MatchMode, kb: Keyboard, level: CpuLevel, dummy: TrainingDummyController): { controllers: [Controller, Controller]; names: [string, string] } {
  // 키보드 + 게임패드 (1P = 첫 번째 패드, 2P = 두 번째 패드)
  const p1 = new KeyboardController(kb, P1_KEYS, 0);
  switch (mode) {
    case 'versus':
      return { controllers: [p1, new KeyboardController(kb, P2_KEYS, 1)], names: ['PLAYER 1', 'PLAYER 2'] };
    case 'cpu': {
      // 경기마다 CPU 성격이 무작위 (같은 난이도라도 싸우는 방식이 달라진다)
      const styles = Object.keys(CPU_STYLES) as CpuStyle[];
      const style = styles[Math.floor(Math.random() * styles.length)];
      return {
        controllers: [p1, new CpuController(Date.now() & 0xffff, 0, level, style)],
        names: ['PLAYER 1', `CPU (${CPU_LEVELS[level].label}·${CPU_STYLES[style].label})`],
      };
    }
    case 'training':
      return { controllers: [p1, dummy], names: ['PLAYER 1', 'DUMMY'] };
  }
}


export default function GameView({ mode, onExit, profile }: { mode: MatchMode; onExit: () => void; profile?: PlayerProfile }) {
  const [reward, setReward] = useState(0);
  const [streak, setStreak] = useState<Streak>({ cur: 0, best: 0 });
  useEffect(() => setStreak(loadStreak()), []);
  // 경기 중 프로필이 새로 바뀌어도(클라우드 동기화 등) 경기를 다시 시작하지 않도록 ref 로 최신 값만 읽는다
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matchRef = useRef<Match | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
  // 일시정지를 풀면 기술표도 닫는다 (다음 일시정지 때 갑자기 열려 있지 않게)
  useEffect(() => {
    if (!paused) setShowMoves(false);
  }, [paused]);
  const [hitboxes, setHitboxes] = useState(mode === 'training');
  /** VS CPU 는 난이도를 고른 뒤 시작한다 (null = 고르는 중) */
  const [level, setLevel] = useState<CpuLevel | null>(mode === 'cpu' ? null : 'normal');
  const [focusLevel, setFocusLevel] = useState<CpuLevel>('normal');
  const [record, setRecord] = useState<CpuRecord>(EMPTY_RECORD);
  useEffect(() => {
    setFocusLevel(savedLevel());
    setRecord(loadRecord());
  }, []);
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  // 연습 모드 허수아비 (행동은 경기 도중에도 바꿀 수 있다)
  const [dummy] = useState(() => new TrainingDummyController());
  const [dummyMode, setDummyMode] = useState<DummyMode>('stand');
  const [dummyOpen, setDummyOpen] = useState(false);
  const changeDummy = (m: DummyMode) => {
    dummy.mode = m;
    setDummyMode(m);
    setDummyOpen(false);
  };
  const pausedRef = useRef(paused);
  const hitboxRef = useRef(hitboxes);
  pausedRef.current = paused;
  hitboxRef.current = hitboxes;

  useEffect(() => {
    if (!level) return;
    const canvas = canvasRef.current!;
    kb.attach(window);
    const unlock = unlockAudioOnInput();
    startBgm('fight');

    const { controllers, names } = setup(mode, kb, level, dummy);
    const match = new Match(mode, controllers, names);
    matchRef.current = match;

    // 대전은 경기마다 무대 색을 바꾼다 (연습은 늘 기본 도장)
    // 시험용: 주소 뒤에 ?arena=snow 처럼 붙이면 그 무대로 고정
    const forced = new URLSearchParams(window.location.search).get('arena') as (typeof VERSUS_THEMES)[number] | null;
    const theme = forced && VERSUS_THEMES.includes(forced) ? forced : mode === 'training' ? 'dojo' : VERSUS_THEMES[Math.floor(Math.random() * VERSUS_THEMES.length)];
    const renderer = new GameRenderer(canvas, { theme });
    const detachZoom = attachZoomControls(renderer, 0.35, 1.8);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setPaused((p) => !p);
      if (e.code === 'Backquote') setHitboxes((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    // 패드 Start = 일시정지
    const unwatchPad = watchPadButtons({ start: () => setPaused((p) => !p) });

    // 고정 타임스텝: 화면 주사율과 무관하게 로직은 항상 60fps 로 진행
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let lastBanner: string | null = null;
    let rageOn = [false, false];
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
        if (h.banner !== lastBanner) {
          if (h.banner?.startsWith('ROUND')) playCue('round');
          else if (h.banner === 'FIGHT!') playCue('fight');
          else if (h.banner === 'K.O.') playCue('ko');
          else if (h.phase === 'matchEnd') {
            const lost = mode === 'cpu' && h.fighters[1].wins > h.fighters[0].wins;
            playCue(lost ? 'lose' : 'win');
            // 무승부(같은 승수)는 기록하지 않는다
            const firstWin = loadRecord()[level].w === 0;
            if (mode === 'cpu' && h.fighters[0].wins !== h.fighters[1].wins) {
              setRecord(addResult(level, !lost));
              setStreak(addStreak(!lost));
            }
            // 이기면 골드 (필드·보스처럼 프로필에 더하고 저장 → 로그인했으면 클라우드에도)
            const prof = profileRef.current;
            if (mode === 'cpu' && !lost && h.fighters[0].wins > h.fighters[1].wins && prof) {
              const gold = grantCpuReward(prof, level, firstWin);
              saveProfile(prof);
              setReward(gold);
            } else setReward(0);
          }
          lastBanner = h.banner;
        }
        // 레이지가 켜지는 순간 포효
        h.fighters.forEach((f, i) => {
          if (f.rage && !rageOn[i]) playCue('roar');
        });
        rageOn = h.fighters.map((f) => f.rage);
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
      matchRef.current = null;
    };
  }, [mode, level, kb, dummy]);

  const chooseLevel = (lv: CpuLevel) => {
    try {
      localStorage.setItem(LEVEL_KEY, lv);
    } catch {}
    setPaused(false);
    setHud(null);
    setLevel(lv);
  };

  // 난이도 고르는 화면: ←/→(또는 ↑/↓)로 고르고 Enter, Esc 는 메뉴로
  useEffect(() => {
    if (level) return;
    const order: CpuLevel[] = ['easy', 'normal', 'hard'];
    const onKey = (e: KeyboardEvent) => {
      const i = order.indexOf(focusLevel);
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') setFocusLevel(order[Math.max(0, i - 1)]);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') setFocusLevel(order[Math.min(order.length - 1, i + 1)]);
      else if (e.code === 'Enter' || e.code === 'Space') chooseLevel(focusLevel);
      else if (e.code === 'Escape') onExit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    // 패드: ←→ 고르기, A 결정, B 메인 메뉴 (화면이 뜬 직후 0.5초는 무시)
    const ready = () => performance.now() - pickerOpenedAt.current > 500;
    const unwatch = watchPad({
      14: () => setFocusLevel(order[Math.max(0, order.indexOf(focusLevel) - 1)]),
      15: () => setFocusLevel(order[Math.min(order.length - 1, order.indexOf(focusLevel) + 1)]),
      0: () => ready() && chooseLevel(focusLevel),
      1: () => ready() && onExit(),
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      unwatch();
    };
  }, [level, focusLevel, onExit]);

  // 난이도 화면이 뜬 시각 (방향을 움직일 때마다 다시 재지 않게)
  const pickerOpenedAt = useRef(0);
  useEffect(() => {
    if (!level) pickerOpenedAt.current = performance.now();
  }, [level]);

  // 일시정지 메뉴·경기 종료: 패드 A = 계속하기(종료 화면에선 다시 시작), B = 메인 메뉴
  const menuOpen = !!level && (paused || hud?.phase === 'matchEnd');
  useEffect(() => {
    if (!menuOpen) return;
    // 메뉴가 뜬 직후엔 무시 (경기 중 연타하던 A·B 가 바로 메뉴를 누르지 않게)
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 700;
    return watchPad({
      0: () => {
        if (!ready()) return;
        if (paused) setPaused(false);
        else matchRef.current?.restart();
      },
      1: () => ready() && onExit(),
    });
  }, [menuOpen, paused, onExit]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && level && <Hud hud={hud} raised={touch} />}

      {mode === 'training' && level && hud && !paused && <TrainingTasks hud={hud} compact={touch} portrait={portrait} />}

      {mode === 'training' && level && (
        <div className={`absolute left-1/2 -translate-x-1/2 text-xs ${touch ? 'top-28' : 'top-20'}`}>
          <button
            onClick={() => setDummyOpen((o) => !o)}
            className="rounded bg-black/60 px-3 py-1.5 text-white/85 hover:bg-black/80"
          >
            허수아비: <span className="font-bold text-amber-300">{DUMMY_MODES.find((d) => d.id === dummyMode)?.label}</span> ▾
          </button>
          {dummyOpen && (
            <div className="mt-1 w-64 rounded-lg border border-white/15 bg-zinc-900/95 p-1 text-white">
              {DUMMY_MODES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => changeDummy(d.id)}
                  className={`block w-full rounded px-3 py-2 text-left hover:bg-white/10 ${d.id === dummyMode ? 'bg-amber-500/20' : ''}`}
                >
                  <div className="font-bold">{d.label}</div>
                  <div className="text-[11px] text-white/60">{d.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {level && <RotateHint touch={touch} />}

      {touch && level && !paused && hud?.phase !== 'matchEnd' && <TouchControls kb={kb} map={P1_KEYS} />}

      {!level && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-xl rounded-lg border border-white/20 bg-zinc-900/95 p-6 text-white">
            <div className="mb-1 text-center text-xl font-bold">VS CPU 난이도</div>
            {streak.best > 0 && (
              <div className="mb-1 text-center text-xs text-amber-200/80">
                🔥 지금 {streak.cur}연승 · 최고 {streak.best}연승
              </div>
            )}
            <div className="mb-5 text-center text-xs text-white/60">{touch ? '눌러서 고르기' : '← → 로 고르고 Enter · Esc 는 메인 메뉴'}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(CPU_LEVELS) as CpuLevel[]).map((lv) => (
                <button
                  key={lv}
                  onClick={() => chooseLevel(lv)}
                  onMouseEnter={() => setFocusLevel(lv)}
                  className={`rounded-lg border p-4 text-left transition ${
                    focusLevel === lv ? 'border-amber-400 bg-amber-500/20' : 'border-white/15 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="text-lg font-bold">{CPU_LEVELS[lv].label}</div>
                  <div className="mt-1 text-xs text-white/70">{CPU_LEVELS[lv].desc}</div>
                  <div className="mt-2 text-[11px] text-white/50">
                    {record[lv].w + record[lv].l === 0 ? '아직 전적 없음' : `전적 ${record[lv].w}승 ${record[lv].l}패`}
                    {record[lv].w > 0 && <span className="ml-1 text-amber-300">★</span>}
                    {profile && (
                      <span className="ml-2 text-amber-200/80">
                        승리 +{CPU_REWARD[lv] * (record[lv].w === 0 ? FIRST_WIN_MULT : 1)}G{record[lv].w === 0 && ' (첫 승리 ×' + FIRST_WIN_MULT + ')'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button onClick={onExit} className="mt-5 w-full rounded bg-white/10 py-2 text-sm hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}

      <div className={`absolute flex gap-2 whitespace-nowrap text-xs ${touch ? 'left-1/2 top-20 -translate-x-1/2' : 'bottom-4 right-4'} ${level ? '' : 'hidden'}`}>
        <button
          onClick={() => setHitboxes((h) => !h)}
          className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20"
        >
          {touch ? '판정' : '판정 표시'} {hitboxes ? 'ON' : 'OFF'}{!touch && ' (`)'}
        </button>
        <SoundToggle compact={touch} />
          <MusicToggle compact={touch} />
        <button onClick={() => setPaused(true)} className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20">
          일시정지{!touch && ' (Esc)'}
        </button>
      </div>

      {level && (paused || hud?.phase === 'matchEnd') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
            <div className="mb-2 text-center text-xl font-bold">{paused ? '일시정지' : '경기 종료'}</div>
            {!paused && hud && mode !== 'training' && (
              <div className="-mt-2 mb-1 rounded bg-black/40 px-3 py-2 text-xs leading-5">
                {reward > 0 && (
                  <div className="mb-1 text-center font-bold text-amber-300">
                    승리 보상 +{reward} G{level && reward > CPU_REWARD[level] && ' (첫 승리 ×' + FIRST_WIN_MULT + ')'}
                  </div>
                )}
                {mode === 'cpu' && (
                  <div className="mb-1 text-center text-amber-200/90">
                    {streak.cur > 0 ? `🔥 ${streak.cur}연승` : '연승이 끊겼어요'} · 최고 {streak.best}연승
                  </div>
                )}
                <div className="mb-0.5 text-white/50">최대 콤보</div>
                {hud.fighters.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span className={i === 0 ? 'text-red-300' : 'text-blue-300'}>{f.name}</span>
                    <span className="tabular-nums">
                      {hud.bestCombo[i].hits >= 2 ? `${hud.bestCombo[i].hits}HIT · ${hud.bestCombo[i].damage}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {paused && (
              <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
                계속하기
              </button>
            )}
            <button onClick={() => setShowMoves(true)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              기술표 보기
            </button>
            <VibrationToggle />
            <button
              onClick={() => {
                matchRef.current?.restart();
                setPaused(false);
              }}
              className="rounded bg-white/10 py-2 hover:bg-white/20"
            >
              다시 시작
            </button>
            {mode === 'cpu' && (
              <button
                onClick={() => {
                  setFocusLevel(level);
                  setLevel(null);
                  setPaused(false);
                }}
                className="rounded bg-white/10 py-2 hover:bg-white/20"
              >
                난이도 바꾸기 (지금: {CPU_LEVELS[level].label} · {record[level].w}승 {record[level].l}패)
              </button>
            )}
            <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
              메인 메뉴
            </button>
          </div>
        </div>
      )}
      {showMoves && level && (paused || hud?.phase === 'matchEnd') && <MoveListPanel onClose={() => setShowMoves(false)} />}
    </div>
  );
}
