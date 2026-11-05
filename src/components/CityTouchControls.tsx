'use client';

import { useEffect, useRef, useState } from 'react';
import { bindCodes, type BindAction } from '@/game/core/keybinds';

/**
 * 서울 생활 모드 터치 조작.
 * 서울 화면은 창(window)의 키 이벤트를 듣고 있어서, 버튼이 같은 키 이벤트를 보내는 식으로 붙인다
 * (키 설정을 바꿔도 지금 설정된 키로 보낸다).
 */
function send(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
}
const codeOf = (a: BindAction) => bindCodes(a)[0];
const tapKey = (code: string) => {
  send('keydown', code);
  // 한 프레임 이상 눌린 걸로 남게 살짝 뒤에 뗀다
  window.setTimeout(() => send('keyup', code), 60);
};

type Dirs = Record<'up' | 'down' | 'left' | 'right', boolean>;
const NONE: Dirs = { up: false, down: false, left: false, right: false };

export default function CityTouchControls() {
  const padRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const held = useRef<Dirs>(NONE);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [run, setRun] = useState(false);

  const setDirs = (d: Dirs) => {
    for (const k of ['up', 'down', 'left', 'right'] as const) {
      if (d[k] !== held.current[k]) send(d[k] ? 'keydown' : 'keyup', codeOf(k));
    }
    held.current = d;
  };

  const move = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = e.clientX - (r.left + rad);
    let dy = e.clientY - (r.top + rad);
    const len = Math.hypot(dx, dy);
    if (len < rad * 0.25) setDirs(NONE);
    else {
      const a = Math.atan2(-dy, dx);
      const s = Math.PI / 8;
      setDirs({ right: Math.abs(a) < 3 * s, left: Math.abs(a) > 5 * s, up: a > s && a < 7 * s, down: a < -s && a > -7 * s });
    }
    const max = rad * 0.6;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
  };
  const release = () => {
    pointer.current = null;
    setDirs(NONE);
    setKnob({ x: 0, y: 0 });
  };

  const toggleRun = () => {
    const next = !run;
    send(next ? 'keydown' : 'keyup', codeOf('run'));
    setRun(next);
  };

  // 화면을 떠날 때 눌린 키가 남지 않게
  useEffect(
    () => () => {
      for (const k of ['up', 'down', 'left', 'right', 'run'] as const) send('keyup', codeOf(k));
    },
    [],
  );

  const small = 'rounded-full border-2 border-white/30 bg-black/40 font-bold text-white active:bg-amber-400/60 active:text-black [touch-action:none]';

  return (
    <>
      {/* 위쪽 바로가기 */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-2 text-xs">
        <button className={`${small} h-11 w-11`} onClick={() => tapKey('Escape')}>
          메뉴
        </button>
        <button className={`${small} h-11 w-11`} onClick={() => tapKey('KeyM')}>
          지도
        </button>
        <button className={`${small} h-11 w-11`} onClick={() => tapKey('KeyI')}>
          가방
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-4 pb-4">
        <div
          ref={padRef}
          className="pointer-events-auto relative h-32 w-32 rounded-full border-2 border-white/25 bg-white/10 [touch-action:none]"
          onPointerDown={(e) => {
            if (pointer.current !== null) return;
            pointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            move(e);
          }}
          onPointerMove={(e) => e.pointerId === pointer.current && move(e)}
          onPointerUp={(e) => e.pointerId === pointer.current && release()}
          onPointerCancel={(e) => e.pointerId === pointer.current && release()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/30"
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
          />
        </div>

        <div className="pointer-events-auto flex items-end gap-2">
          <button className={`${small} h-12 w-12 text-[11px] ${run ? '!bg-amber-400/70 !text-black' : ''}`} onClick={toggleRun}>
            달리기
          </button>
          <button className={`${small} h-12 w-12 text-[11px]`} onPointerDown={() => send('keydown', codeOf('jump'))} onPointerUp={() => send('keyup', codeOf('jump'))} onPointerCancel={() => send('keyup', codeOf('jump'))}>
            점프
          </button>
          <button className={`${small} h-16 w-16 text-base`} onClick={() => tapKey(codeOf('interact'))}>
            E
            <span className="block text-[9px] font-normal opacity-70">상호작용</span>
          </button>
        </div>
      </div>
    </>
  );
}
