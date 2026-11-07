'use client';

import { useEffect, useRef, useState } from 'react';
import { saveProfile, type PlayerProfile } from '@/game/core/profile';
import { EMPTY_RECORD, addResult, loadRecord, loadStreak, rankOf, type CpuRecord, type Streak } from '@/game/core/cpuRecord';
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
  DemoController,
  InputLogController,
  RecordingController,
  TapeController,
  trimTape,
  type InputLogEntry,
} from '@/game/core/controllers';
import type { ComboDef } from '@/game/data/combos';
import { Keyboard, NEUTRAL_INPUT, P1_KEYS, P2_KEYS, watchPad, watchPadButtons, type RelInput } from '@/game/core/input';
import { Match, type HudState, type MatchMode } from '@/game/core/match';
import { GameRenderer, VERSUS_THEMES } from '@/game/render/renderer';
import Hud from './Hud';
import TouchControls, { useIsTouch } from './TouchControls';
import RotateHint, { usePortrait } from './RotateHint';
import MoveListPanel from './MoveListPanel';
import TrainingTasks from './TrainingTasks';
import InputLogPanel from './InputLogPanel';
import SoundToggle from './SoundToggle';
import VibrationToggle from './VibrationToggle';
import MusicToggle from './MusicToggle';
import { startBgm, stopBgm } from '@/game/render/bgm';
import { playCue, unlockAudioOnInput } from '@/game/render/sfx';
import { attachZoomControls } from './zoomControls';

const LEVEL_KEY = 'ironfist.cpuLevel';
/** 허수아비 녹화 길이 (5초) */
const RECORD_FRAMES = 300;
/** 무대 이름 (라운드 시작 때 보여줌) */
const THEME_LABEL: Record<string, string> = { dojo: '도장', dusk: '노을', snow: '눈밤' };

function savedLevel(): CpuLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'easy' || v === 'normal' || v === 'hard') return v;
  } catch {}
  return 'normal';
}

function setup(mode: MatchMode, kb: Keyboard, level: CpuLevel, dummy: TrainingDummyController): { controllers: [Controller, Controller]; names: [string, string]; styleLabel?: string; demo?: DemoController; log?: InputLogController; practice?: RecordingController } {
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
        styleLabel: CPU_STYLES[style].label,
      };
    }
    case 'training':
    {
      // 연습: 기술표의 콤보 "시연"을 재생할 수 있게 감싼다
      // 허수아비 녹화: 평소엔 꺼 두었다가 ● 녹화 때만 내 입력을 모은다
      const practice = new RecordingController(p1);
      practice.enabled = false;
      practice.limit = RECORD_FRAMES;
      const demo = new DemoController(practice);
      // 입력 기록 (화면 왼쪽에 방금 누른 방향·버튼과 프레임 수)
      const log = new InputLogController(demo);
      return { controllers: [log, dummy], names: ['PLAYER 1', 'DUMMY'], demo, log, practice };
    }
  }
}


export default function GameView({ mode, onExit, profile }: { mode: MatchMode; onExit: () => void; profile?: PlayerProfile }) {
  const [reward, setReward] = useState(0);
  const demoRef = useRef<DemoController | null>(null);
  const [demoing, setDemoing] = useState(false);
  const [inputLog, setInputLog] = useState<InputLogEntry[]>([]);
  const [replaying, setReplaying] = useState(false);
  /** 늘리면 새 경기를 만든다 (VS CPU "다음 경기": 새 CPU 성격 · 새 무대) */
  const [matchSeq, setMatchSeq] = useState(0);
  /** 이번 경기로 오른 랭크 (없으면 null) */
  const [rankUp, setRankUp] = useState<string | null>(null);
  /** 경기를 처음부터 (리플레이 녹화도 처음부터) */
  const restartMatch = () => {
    matchRef.current?.restart();
    recRef.current?.forEach((r) => r.reset());
  };
  const replayingRef = useRef(false);
  /** 리플레이 재생 속도 (0 = 멈춤) */
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replaySpeedRef = useRef(1);
  replaySpeedRef.current = replaySpeed;
  /** 멈춤 ↔ 마지막 속도 */
  const lastSpeedRef = useRef(1);
  const toggleReplayPause = () =>
    setReplaySpeed((v) => {
      if (v) lastSpeedRef.current = v;
      return v ? 0 : lastSpeedRef.current;
    });
  replayingRef.current = replaying;
  const recRef = useRef<RecordingController[] | null>(null);
  const replayRef = useRef<() => void>(() => {});
  const skipReplayRef = useRef<() => void>(() => {});
  const [showInputs, setShowInputs] = useState(() => {
    try {
      return localStorage.getItem('ironfist.inputLog') !== '0';
    } catch {
      return true;
    }
  });
  /** 추천 콤보 시연: 알맞은 거리에 세우고, 허수아비는 잠깐 가드 없이 다가오게 한 뒤 입력을 재생 */
  const playCombo = (c: ComboDef) => {
    const m = matchRef.current;
    const demo = demoRef.current;
    if (!m || !demo) return;
    const dash = c.steps[0].dir === 6 && c.steps[0].buttons.length === 0;
    const dist = dash ? 2.0 : 0.85;
    m.fighters[0].reset(-dist / 2, 0, 1, 0);
    m.fighters[1].reset(dist / 2, 0, -1, 0);
    const prev = dummy.mode;
    dummy.mode = 'open';
    const inputs: RelInput[] = [];
    for (const st of c.steps) {
      inputs.push({ dir: st.dir, buttons: [1, 2, 3, 4].map((b) => st.buttons.includes(b)) as RelInput['buttons'] });
      for (let i = 0; i < st.wait; i++) inputs.push(NEUTRAL_INPUT);
    }
    demo.play(inputs);
    setDemoing(true);
    window.setTimeout(() => {
      if (dummy.mode === 'open') dummy.mode = prev;
      // 시연 기록(마지막 공격·최대 콤보)이 과제로 세지지 않게 처음 상태로 되돌린 뒤 과제 확인을 다시 켠다
      restartMatch();
      // 화면 표시가 되돌린 상태로 한 번 갱신된 뒤에 켠다 (바로 켜면 직전 시연 기록이 잠깐 남아 있음)
      window.setTimeout(() => setDemoing(false), 300);
    }, (inputs.length / 60) * 1000 + 1200);
    setShowMoves(false);
    setPaused(false);
  };
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [streak, setStreak] = useState<Streak>({ cur: 0, best: 0 });
  useEffect(() => setStreak(loadStreak(profileRef.current)), []);
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
    setRecord(loadRecord(profileRef.current));
  }, []);
  // 키보드와 화면 터치 버튼이 같은 입력을 쓴다
  const [kb] = useState(() => new Keyboard());
  const touch = useIsTouch();
  const portrait = usePortrait();
  // 연습 모드 허수아비 (행동은 경기 도중에도 바꿀 수 있다)
  const [dummy] = useState(() => {
    // 처음엔 '가드 안 함' — 처음 온 사람도 바로 기술·콤보를 맞혀 볼 수 있게
    const d = new TrainingDummyController();
    d.mode = 'noguard';
    return d;
  });
  const [dummyMode, setDummyMode] = useState<DummyMode>('noguard');
  const [dummyOpen, setDummyOpen] = useState(false);
  /** 허수아비 녹화: 지금 녹화 중이면 남은 초 */
  const practiceRef = useRef<RecordingController | null>(null);
  const [recLeft, setRecLeft] = useState<number | null>(null);
  const recTimer = useRef(0);
  const beforeRec = useRef<DummyMode>('noguard');
  const stopRecording = () => {
    window.clearInterval(recTimer.current);
    setRecLeft(null);
    const rec = practiceRef.current;
    if (!rec) return;
    rec.enabled = false;
    const tape = trimTape(rec.tape);
    // 아무것도 안 눌렀으면 녹화 전 허수아비 모드로 되돌린다
    if (!tape.length) return changeDummy(beforeRec.current);
    dummy.setTape(tape);
    changeDummy('playback');
  };
  const startRecording = () => {
    const rec = practiceRef.current;
    if (!rec) return;
    rec.reset();
    rec.enabled = true;
    beforeRec.current = dummy.mode;
    changeDummy('stand'); // 녹화하는 동안 허수아비는 가만히
    const until = performance.now() + (RECORD_FRAMES / 60) * 1000;
    setRecLeft(Math.ceil(RECORD_FRAMES / 60));
    window.clearInterval(recTimer.current);
    recTimer.current = window.setInterval(() => {
      const left = (until - performance.now()) / 1000;
      if (left <= 0) stopRecording();
      else setRecLeft(Math.ceil(left));
    }, 100);
  };
  useEffect(() => () => window.clearInterval(recTimer.current), []);
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

    const { controllers, names, styleLabel, demo, log, practice } = setup(mode, kb, level, dummy);
    practiceRef.current = practice ?? null;
    demoRef.current = demo ?? null;
    let logSeen = -1;
    let logAt = 0;
    // 대전은 양쪽 입력을 녹화해 두었다가 경기 뒤 리플레이로 다시 보여 준다 (엔진이 결정론적이라 입력만으로 재현)
    const recs = mode === 'training' ? null : ([new RecordingController(controllers[0]), new RecordingController(controllers[1])] as const);
    recRef.current = recs ? [...recs] : null;
    const match = new Match(mode, recs ? [recs[0], recs[1]] : controllers, names);
    matchRef.current = match;
    /** 지금 화면에 돌리는 경기 (리플레이 중이면 재생용 경기) */
    let cur = match;
    let replayEndAt = 0;

    // 대전은 경기마다 무대 색을 바꾼다 (연습은 늘 기본 도장)
    // 시험용: 주소 뒤에 ?arena=snow 처럼 붙이면 그 무대로 고정
    const forced = new URLSearchParams(window.location.search).get('arena') as (typeof VERSUS_THEMES)[number] | null;
    const theme = forced && VERSUS_THEMES.includes(forced) ? forced : mode === 'training' ? 'dojo' : VERSUS_THEMES[Math.floor(Math.random() * VERSUS_THEMES.length)];
    const renderer = new GameRenderer(canvas, { theme });
    // 라운드 시작 문구 아래에 무대·CPU 성격을 알려준다
    setSubtitle(mode === 'training' ? null : `${THEME_LABEL[theme]} 무대${styleLabel ? ` · CPU ${styleLabel}` : ''}`);
    const detachZoom = attachZoomControls(renderer, 0.35, 1.8);
    const resize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // 리플레이 중 Esc = 건너뛰기
        if (replayingRef.current) skipReplayRef.current();
        else setPaused((p) => !p);
      }
      // 리플레이 중: Space 멈춤·재생, 1·2·3 = 0.5배·1배·2배
      if (replayingRef.current && !e.repeat) {
        if (e.code === 'Space') toggleReplayPause();
        const sp = { Digit1: 0.5, Digit2: 1, Digit3: 2 }[e.code];
        if (sp) setReplaySpeed(sp);
      }
      if (e.code === 'Backquote') setHitboxes((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    // 패드 Start = 일시정지
    const unwatchPad = watchPadButtons({ start: () => (replayingRef.current ? skipReplayRef.current() : setPaused((p) => !p)) });

    // 고정 타임스텝: 화면 주사율과 무관하게 로직은 항상 60fps 로 진행
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHudKey = '';
    let lastBanner: string | null = null;
    let rageOn = [false, false];
    const backToMatch = () => {
      cur = match;
      replayEndAt = 0;
      lastBanner = match.hud().banner; // 원래 경기의 경기 종료 처리를 다시 하지 않게
      lastHudKey = '';
      setReplaying(false);
    };
    replayRef.current = () => {
      if (!recs) return;
      cur = new Match(mode, [new TapeController(recs[0].tape), new TapeController(recs[1].tape)], names);
      replayEndAt = 0;
      lastBanner = null;
      setPaused(false);
      lastSpeedRef.current = 1;
      setReplaySpeed(1);
      setReplaying(true);
    };
    skipReplayRef.current = backToMatch;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // 리플레이는 속도 조절 (느리게 보면 애니메이션도 같이 느려진다)
      const dt = (Math.min(now - last, 250) / 1000) * (cur !== match ? replaySpeedRef.current : 1);
      acc += dt * 1000;
      last = now;
      let steps = 0;
      while (acc >= FRAME_MS && steps < 5) {
        if (!pausedRef.current) cur.step();
        acc -= FRAME_MS;
        steps++;
      }
      if (steps === 5) acc = 0;

      renderer.sync(cur, hitboxRef.current, makeClock(cur.frame, acc / FRAME_MS, cur.hitstop > 0, dt));
      const h = cur.hud();
      // 리플레이가 끝나면 잠깐 보여 준 뒤 결과 화면으로
      if (cur !== match && h.phase === 'matchEnd') {
        if (!replayEndAt) replayEndAt = now;
        else if (now - replayEndAt > 2500) backToMatch();
      }
      const key = JSON.stringify(h);
      if (key !== lastHudKey) {
        if (h.banner !== lastBanner) {
          if (h.banner?.startsWith('ROUND')) playCue('round');
          else if (h.banner === 'FIGHT!') playCue('fight');
          else if (h.banner === 'K.O.') playCue('ko');
          else if (h.banner?.includes('PERFECT')) playCue('win');
          else if (h.phase === 'matchEnd' && cur !== match) playCue('win');
          else if (h.phase === 'matchEnd') {
            const lost = mode === 'cpu' && h.fighters[1].wins > h.fighters[0].wins;
            playCue(lost ? 'lose' : 'win');
            // 무승부(같은 승수)는 기록하지 않는다
            const prof = profileRef.current;
            const firstWin = loadRecord(prof)[level].w === 0;
            const decided = mode === 'cpu' && h.fighters[0].wins !== h.fighters[1].wins;
            setRankUp(null);
            if (decided) {
              const before = rankOf(loadRecord(prof)).index;
              const res = addResult(level, !lost, prof);
              setRecord(res.record);
              setStreak(res.streak);
              const after = rankOf(res.record);
              setRankUp(after.index > before ? `${after.icon} ${after.name}` : null);
            }
            // 이기면 골드 (필드·보스처럼 프로필에 더하고 저장 → 로그인했으면 클라우드에도)
            if (mode === 'cpu' && !lost && h.fighters[0].wins > h.fighters[1].wins && prof) {
              setReward(grantCpuReward(prof, level, firstWin));
            } else setReward(0);
            // 전적·연승·골드를 한 번에 저장
            if (decided && prof) saveProfile(prof);
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
      // 입력 기록은 바뀌었을 때만, 1초에 20번까지 그린다
      if (log && log.version !== logSeen && now - logAt > 50) {
        logSeen = log.version;
        logAt = now;
        setInputLog(log.log.map((e) => ({ ...e })));
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
  }, [mode, level, kb, dummy, matchSeq]);

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
  const menuOpen = !!level && !replaying && (paused || hud?.phase === 'matchEnd');
  useEffect(() => {
    if (!menuOpen) return;
    // 메뉴가 뜬 직후엔 무시 (경기 중 연타하던 A·B 가 바로 메뉴를 누르지 않게)
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 700;
    return watchPad({
      0: () => {
        if (!ready()) return;
        if (paused) setPaused(false);
        else restartMatch();
      },
      1: () => ready() && onExit(),
    });
  }, [menuOpen, paused, onExit]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {hud && level && <Hud hud={hud} raised={touch} subtitle={subtitle} />}

      {mode === 'training' && level && !touch && showInputs && inputLog.length > 0 && <InputLogPanel log={inputLog} />}

      {mode === 'training' && level && hud && !paused && <TrainingTasks hud={hud} compact={touch} portrait={portrait} ignore={demoing} />}

      {mode === 'training' && level && (
        <div className={`absolute left-1/2 -translate-x-1/2 text-xs ${touch ? 'top-28' : 'top-20'}`}>
          <button
            onClick={() => setDummyOpen((o) => !o)}
            className="rounded bg-black/60 px-3 py-1.5 text-white/85 hover:bg-black/80"
          >
            허수아비: <span className="font-bold text-amber-300">{DUMMY_MODES.find((d) => d.id === dummyMode)?.label}</span> ▾
          </button>
          <button
            onClick={() => (recLeft !== null ? stopRecording() : startRecording())}
            className={`ml-1 rounded px-3 py-1.5 font-bold ${recLeft !== null ? 'animate-pulse bg-red-600 text-white' : 'bg-black/60 text-red-300 hover:bg-black/80'}`}
          >
            {recLeft !== null ? `■ 녹화 중 ${recLeft}초` : '● 녹화'}
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

      {touch && level && !paused && !replaying && hud?.phase !== 'matchEnd' && <TouchControls kb={kb} map={P1_KEYS} />}

      {!level && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-xl rounded-lg border border-white/20 bg-zinc-900/95 p-6 text-white">
            <div className="mb-1 text-center text-xl font-bold">VS CPU 난이도</div>
            {(() => {
              const rk = rankOf(record);
              return (
                <div className="mb-1 text-center text-sm">
                  <span className="font-bold text-amber-300">
                    {rk.icon} {rk.name}
                  </span>
                  <span className="text-xs text-white/55">
                    {' '}
                    · {rk.points}점{rk.next ? ` (다음 「${rk.next.name}」까지 ${rk.next.need}점)` : ' · 최고 랭크!'}
                  </span>
                  <span className="hidden text-xs text-white/40 sm:inline">
                    {' '}
                    · 이기면 쉬움 1·보통 2·어려움 3점
                  </span>
                </div>
              );
            })()}
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
        {mode === 'training' && !touch && (
          <button
            onClick={() =>
              setShowInputs((v) => {
                try {
                  localStorage.setItem('ironfist.inputLog', v ? '0' : '1');
                } catch {}
                return !v;
              })
            }
            className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20"
          >
            입력 기록 {showInputs ? 'ON' : 'OFF'}
          </button>
        )}
        <SoundToggle compact={touch} />
          <MusicToggle compact={touch} />
        {!replaying && (
          <button onClick={() => setPaused(true)} className="rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20">
            일시정지{!touch && ' (Esc)'}
          </button>
        )}
      </div>

      {replaying && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm font-black tracking-widest text-red-400">
            <span className="animate-pulse">●</span> REPLAY
          </div>
          <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 p-1 text-sm font-bold text-white">
            <button onClick={toggleReplayPause} className="rounded-full px-3 py-1.5 hover:bg-white/15" title={touch ? undefined : 'Space'}>
              {replaySpeed ? '⏸' : '▶'}
            </button>
            {[0.5, 1, 2].map((v, i) => (
              <button
                key={v}
                onClick={() => setReplaySpeed(v)}
                className={`rounded-full px-3 py-1.5 tabular-nums ${replaySpeed === v ? 'bg-sky-500 text-black' : 'hover:bg-white/15'}`}
                title={touch ? undefined : String(i + 1)}
              >
                {v}x
              </button>
            ))}
            <button onClick={() => skipReplayRef.current()} className="rounded-full px-3 py-1.5 hover:bg-white/15">
              ⏭ 건너뛰기{!touch && ' (Esc)'}
            </button>
          </div>
        </>
      )}

      {level && !replaying && (paused || hud?.phase === 'matchEnd') && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-black/60 py-2">
          <div className="m-auto flex w-64 flex-col gap-3 rounded-lg border border-white/20 bg-zinc-900/90 p-6 text-white">
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
                {rankUp && mode === 'cpu' && <div className="mb-1 animate-pulse text-center text-sm font-black text-amber-300">🎉 랭크 업! {rankUp}</div>}
                {hud.perfects[0] > 0 && <div className="mb-1 text-center font-bold text-sky-300">✨ 퍼펙트 {hud.perfects[0]}라운드</div>}
                {/* 경기 통계: 왼쪽 나 · 오른쪽 상대. 더 잘한 쪽은 밝게 */}
                <table className="w-full tabular-nums">
                  <thead>
                    <tr className="text-[11px]">
                      <th />
                      <th className="text-right font-bold text-red-300">{mode === 'versus' ? '1P' : '나'}</th>
                      <th className="text-right font-bold text-blue-300">{mode === 'versus' ? '2P' : '상대'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['준 데미지', (i: 0 | 1) => hud.stats[i].damage, (i: 0 | 1) => String(hud.stats[i].damage)],
                        ['맞힌 횟수', (i: 0 | 1) => hud.stats[i].hits, (i: 0 | 1) => String(hud.stats[i].hits)],
                        ['카운터', (i: 0 | 1) => hud.stats[i].counters, (i: 0 | 1) => String(hud.stats[i].counters)],
                        ['최대 콤보', (i: 0 | 1) => hud.bestCombo[i].hits * 1000 + hud.bestCombo[i].damage, (i: 0 | 1) => (hud.bestCombo[i].hits >= 2 ? `${hud.bestCombo[i].hits}HIT·${hud.bestCombo[i].damage}` : '—')],
                        ['막은 공격', (i: 0 | 1) => hud.stats[i].guards, (i: 0 | 1) => String(hud.stats[i].guards)],
                        ['벽꽝', (i: 0 | 1) => hud.wallSplats[1 - i], (i: 0 | 1) => String(hud.wallSplats[1 - i])],
                        ['잡기 풀기', (i: 0 | 1) => hud.stats[i].throwBreaks, (i: 0 | 1) => String(hud.stats[i].throwBreaks)],
                      ] as [string, (i: 0 | 1) => number, (i: 0 | 1) => string][]
                    ).map(([label, val, show]) => {
                      const a = val(0);
                      const b = val(1);
                      // 둘 다 0 인 줄은 숨긴다 (폰 화면에서 창이 너무 길어지지 않게)
                      if (!a && !b && label !== '준 데미지') return null;
                      return (
                        <tr key={label}>
                          <td className="whitespace-nowrap text-white/50">{label}</td>
                          <td className={`text-right ${a > b ? 'font-bold text-white' : 'text-white/60'}`}>{show(0)}</td>
                          <td className={`text-right ${b > a ? 'font-bold text-white' : 'text-white/60'}`}>{show(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {paused && (
              <button onClick={() => setPaused(false)} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
                계속하기
              </button>
            )}
            {!paused && mode === 'cpu' && (
              <button
                onClick={() => {
                  setPaused(false);
                  setHud(null);
                  setReward(0);
                  setMatchSeq((n) => n + 1);
                }}
                className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400"
              >
                다음 경기 ▶ <span className="text-xs font-normal">(새 상대·무대)</span>
              </button>
            )}
            {/* 연승 중이면 한 단계 위 난이도를 권한다 */}
            {!paused && mode === 'cpu' && streak.cur >= 3 && level !== 'hard' && (
              <button
                onClick={() => {
                  setReward(0);
                  chooseLevel(level === 'easy' ? 'normal' : 'hard');
                }}
                className="rounded border border-amber-400/70 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/20"
              >
                🔥 {streak.cur}연승! {CPU_LEVELS[level === 'easy' ? 'normal' : 'hard'].label} 난이도 도전
              </button>
            )}
            {!paused && mode !== 'training' && (
              <button onClick={() => replayRef.current()} className="rounded bg-sky-600 py-2 font-bold hover:bg-sky-500">
                ▶ 리플레이 보기
              </button>
            )}
            <button onClick={() => setShowMoves(true)} className="rounded bg-white/10 py-2 hover:bg-white/20">
              기술표 보기
            </button>
            <VibrationToggle />
            <button
              onClick={() => {
                restartMatch();
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
      {showMoves && level && (paused || hud?.phase === 'matchEnd') && <MoveListPanel onClose={() => setShowMoves(false)} onDemo={mode === 'training' ? playCombo : undefined} />}
    </div>
  );
}
