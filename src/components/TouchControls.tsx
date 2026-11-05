'use client';

import { useEffect, useRef, useState } from 'react';
import type { Keyboard, KeyMap } from '@/game/core/input';

/** 터치 화면인가 (손가락이 주 입력) */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(mq.matches || navigator.maxTouchPoints > 0);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return touch;
}

type Dirs = { up: boolean; down: boolean; left: boolean; right: boolean };
const NONE: Dirs = { up: false, down: false, left: false, right: false };

/** 손가락 위치 → 8방향 (가운데 근처는 중립) */
function dirsFrom(dx: number, dy: number, radius: number): Dirs {
  if (Math.hypot(dx, dy) < radius * 0.25) return NONE;
  const a = Math.atan2(-dy, dx); // 위가 +
  const s = Math.PI / 8;
  return {
    right: Math.abs(a) < 3 * s,
    left: Math.abs(a) > 5 * s,
    up: a > s && a < 7 * s,
    down: a < -s && a > -7 * s,
  };
}

/**
 * 격투 모드 화면 조작: 왼쪽 방향 패드, 오른쪽 1~4 버튼 + 점프.
 * 키보드 입력과 같은 길로 들어가서 커맨드(대시·횡이동 등)도 똑같이 된다.
 */
export default function TouchControls({ kb, map }: { kb: Keyboard; map: KeyMap }) {
  const padRef = useRef<HTMLDivElement>(null);
  const padPointer = useRef<number | null>(null);
  const [dirs, setDirs] = useState<Dirs>(NONE);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const applyDirs = (d: Dirs) => {
    kb.setVirtual(map.up, d.up);
    kb.setVirtual(map.down, d.down);
    kb.setVirtual(map.left, d.left);
    kb.setVirtual(map.right, d.right);
    setDirs(d);
  };

  const movePad = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    applyDirs(dirsFrom(dx, dy, radius));
    const len = Math.hypot(dx, dy);
    const max = radius * 0.6;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
  };

  const releasePad = () => {
    padPointer.current = null;
    applyDirs(NONE);
    setKnob({ x: 0, y: 0 });
  };

  // 화면을 떠날 때 눌린 채로 남지 않게
  useEffect(
    () => () => {
      for (const c of [map.up, map.down, map.left, map.right, ...map.buttons, ...(map.jump ?? [])]) kb.setVirtual(c, false);
    },
    [kb, map],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex select-none items-end justify-between px-4 pb-4 [touch-action:none]">
      {/* 방향 패드 */}
      <div
        ref={padRef}
        className="pointer-events-auto relative h-36 w-36 rounded-full border-2 border-white/25 bg-white/10 [touch-action:none]"
        onPointerDown={(e) => {
          if (padPointer.current !== null) return;
          padPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          movePad(e);
        }}
        onPointerMove={(e) => e.pointerId === padPointer.current && movePad(e)}
        onPointerUp={(e) => e.pointerId === padPointer.current && releasePad()}
        onPointerCancel={(e) => e.pointerId === padPointer.current && releasePad()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {(['up', 'down', 'left', 'right'] as const).map((d) => (
          <span
            key={d}
            className={`absolute text-lg ${dirs[d] ? 'text-amber-300' : 'text-white/40'} ${
              d === 'up' ? 'left-1/2 top-1 -translate-x-1/2' : d === 'down' ? 'bottom-1 left-1/2 -translate-x-1/2' : d === 'left' ? 'left-2 top-1/2 -translate-y-1/2' : 'right-2 top-1/2 -translate-y-1/2'
            }`}
          >
            {d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'left' ? '◀' : '▶'}
          </span>
        ))}
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/30"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* 버튼: 철권 패드 배치 (좌상 1, 우상 2, 좌하 3, 우하 4) + 점프 */}
      <div className="pointer-events-auto grid grid-cols-3 grid-rows-2 items-center gap-2 [touch-action:none]">
        <PadButton kb={kb} code={map.buttons[0]} label="1" sub="왼손" />
        <PadButton kb={kb} code={map.buttons[1]} label="2" sub="오른손" />
        <div className="row-span-2">{map.jump?.[0] && <PadButton kb={kb} code={map.jump[0]} label="점프" small />}</div>
        <PadButton kb={kb} code={map.buttons[2]} label="3" sub="왼발" />
        <PadButton kb={kb} code={map.buttons[3]} label="4" sub="오른발" />
      </div>
    </div>
  );
}

function PadButton({ kb, code, label, sub, small }: { kb: Keyboard; code: string; label: string; sub?: string; small?: boolean }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    kb.setVirtual(code, v);
    setDown(v);
  };
  return (
    <button
      className={`flex flex-col items-center justify-center rounded-full border-2 font-black [touch-action:none] ${
        small ? 'h-14 w-14 text-xs' : 'h-16 w-16 text-xl'
      } ${down ? 'border-amber-300 bg-amber-400/60 text-black' : 'border-white/30 bg-white/10 text-white'}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
      {sub && <span className="text-[9px] font-normal opacity-70">{sub}</span>}
    </button>
  );
}
