'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 1장 수련 미니게임 (화면 가운데 원).
 *  guard  : 버티기 — 바깥 고리가 안쪽 원으로 줄어든다. 겹칠 때 Space · E · 클릭 = 막기. 다섯 번, 마지막 한 번은 바위가 일부러 세게 친다(못 막는다).
 *  breath : 숨 고르기 — 원이 커질 때 누르고 있고(들이쉬기), 작아질 때 뗀다(내쉬기). 네 번.
 * 끝나면 onDone(맞춘 수).
 */
export default function TrainingGame({ mode, onDone, onHit, touch }: { mode: 'guard' | 'breath'; onDone: (score: number) => void; onHit?: (blocked: boolean) => void; touch: boolean }) {
  return mode === 'guard' ? <Guard onDone={onDone} onHit={onHit} touch={touch} /> : <Breath onDone={onDone} touch={touch} />;
}

const GUARD_ROUNDS = 5;
/** 고리가 줄어드는 시간 (ms) · 막기로 치는 틈 (안쪽 원에 닿기 전후) */
const SHRINK_MS = 1250;
const WINDOW = 0.16;

function Guard({ onDone, onHit, touch }: { onDone: (n: number) => void; onHit?: (blocked: boolean) => void; touch: boolean }) {
  const [round, setRound] = useState(0);
  const [t, setT] = useState(0);
  const [result, setResult] = useState<'block' | 'hit' | null>(null);
  const st = useRef({ start: performance.now() + 700, pressed: false, score: 0, round: 0, done: false });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = st.current;
      if (s.done) return;
      const u = (performance.now() - s.start) / SHRINK_MS;
      setT(Math.max(0, u));
      // 다 줄어들었는데 못 눌렀으면 맞는다 (마지막 판은 눌러도 맞는다)
      if (u > 1 + WINDOW && !s.pressed) resolve(false);
    };
    raf = requestAnimationFrame(tick);
    const resolve = (blocked: boolean) => {
      const s = st.current;
      if (s.pressed) return;
      s.pressed = true;
      if (blocked) s.score++;
      setResult(blocked ? 'block' : 'hit');
      onHit?.(blocked);
      window.setTimeout(() => {
        s.round++;
        if (s.round >= GUARD_ROUNDS) {
          s.done = true;
          onDone(s.score);
          return;
        }
        setRound(s.round);
        setResult(null);
        s.pressed = false;
        s.start = performance.now() + 450 + Math.random() * 450;
      }, 750);
    };
    const press = () => {
      const s = st.current;
      if (s.pressed || s.done) return;
      const u = (performance.now() - s.start) / SHRINK_MS;
      if (u < 0) return;
      const last = s.round === GUARD_ROUNDS - 1;
      resolve(!last && Math.abs(u - 1) <= WINDOW);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        press();
      }
    };
    window.addEventListener('keydown', onKey, true);
    (st.current as unknown as { press: () => void }).press = press;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onDone, onHit]);

  const ring = 1 + Math.max(0, 1 - t) * 2.2;
  return (
    <Frame
      title={`버티기 ${Math.min(round + 1, GUARD_ROUNDS)}/${GUARD_ROUNDS}`}
      hint={touch ? '고리가 원에 닿는 순간 화면을 눌러 막기' : '고리가 원에 닿는 순간 Space · E · 클릭으로 막기'}
      onPress={() => (st.current as unknown as { press?: () => void }).press?.()}
    >
      <div className="absolute inset-0 m-auto h-24 w-24 rounded-full border-4 border-amber-200/80 bg-amber-200/10" />
      {!result && t > 0 && <div className="absolute inset-0 m-auto h-24 w-24 rounded-full border-4 border-rose-400" style={{ transform: `scale(${ring})` }} />}
      {result && (
        <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black ${result === 'block' ? 'text-emerald-300' : 'text-rose-400'}`}>
          {result === 'block' ? '막았다!' : '퍽!'}
        </div>
      )}
      {!result && t === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">목검을 든다…</div>}
    </Frame>
  );
}

const BREATHS = 4;
/** 한 번 들이쉬고(커짐) 내쉬는(작아짐) 시간 (ms) */
const IN_MS = 1800;
const OUT_MS = 1800;

function Breath({ onDone, touch }: { onDone: (n: number) => void; touch: boolean }) {
  const [phase, setPhase] = useState<{ n: number; inhale: boolean; u: number }>({ n: 0, inhale: true, u: 0 });
  const [good, setGood] = useState<boolean | null>(null);
  const st = useRef({ start: performance.now() + 800, holding: false, ok: 0, total: 0, score: 0, n: 0, done: false });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = st.current;
      if (s.done) return;
      const e = performance.now() - s.start;
      if (e < 0) return;
      const cyc = IN_MS + OUT_MS;
      const n = Math.floor(e / cyc);
      if (n !== s.n) {
        // 한 숨 끝: 맞춘 비율이 70% 넘으면 좋은 숨
        const okBreath = s.total > 0 && s.ok / s.total >= 0.7;
        if (okBreath) s.score++;
        setGood(okBreath);
        window.setTimeout(() => setGood(null), 600);
        s.ok = 0;
        s.total = 0;
        s.n = n;
        if (n >= BREATHS) {
          s.done = true;
          window.setTimeout(() => onDone(s.score), 500);
          return;
        }
      }
      const inCycle = e % cyc;
      const inhale = inCycle < IN_MS;
      s.total++;
      if (s.holding === inhale) s.ok++;
      setPhase({ n, inhale, u: inhale ? inCycle / IN_MS : 1 - (inCycle - IN_MS) / OUT_MS });
    };
    raf = requestAnimationFrame(tick);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        st.current.holding = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') st.current.holding = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [onDone]);

  const size = 0.55 + phase.u * 0.9;
  return (
    <Frame
      title={`숨 고르기 ${Math.min(phase.n + 1, BREATHS)}/${BREATHS}`}
      hint={touch ? '원이 커질 땐 누르고 있기 · 작아질 땐 떼기' : '원이 커질 땐 Space 누르고 있기 · 작아질 땐 떼기'}
      onDown={() => (st.current.holding = true)}
      onUp={() => (st.current.holding = false)}
    >
      <div className="absolute inset-0 m-auto h-28 w-28 rounded-full bg-sky-300/25 shadow-[0_0_40px_rgba(125,211,252,0.6)] transition-transform duration-75" style={{ transform: `scale(${size})` }} />
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-sky-50">{phase.inhale ? '들이쉬고…' : '내쉬고…'}</div>
      {good !== null && <div className={`absolute inset-x-0 bottom-2 text-center text-sm font-black ${good ? 'text-emerald-300' : 'text-rose-300'}`}>{good ? '좋은 숨!' : '흐트러졌다'}</div>}
    </Frame>
  );
}

function Frame({ title, hint, children, onPress, onDown, onUp }: { title: string; hint: string; children: React.ReactNode; onPress?: () => void; onDown?: () => void; onUp?: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35">
      <div className="w-72 select-none rounded-xl border border-amber-200/40 bg-[#1b140b]/90 p-4 text-center text-white shadow-2xl">
        <div className="text-sm font-black text-amber-200">🥋 {title}</div>
        <div
          className="relative mx-auto my-3 h-48 w-48 cursor-pointer touch-none"
          onPointerDown={(e) => {
            e.preventDefault();
            onPress?.();
            onDown?.();
          }}
          onPointerUp={() => onUp?.()}
          onPointerLeave={() => onUp?.()}
        >
          {children}
        </div>
        <div className="text-xs text-white/60">{hint}</div>
      </div>
    </div>
  );
}
