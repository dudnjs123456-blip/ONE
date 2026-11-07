'use client';

import type { InputLogEntry } from '@/game/core/controllers';

/** 방향 숫자(상대 쪽이 6) → 화살표. 5(중립)는 점 */
const ARROW: Record<number, string> = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
const BTN_COLOR = ['', 'bg-sky-500', 'bg-amber-400', 'bg-emerald-500', 'bg-rose-500'];

/** 연습 모드 입력 기록: 최신이 위. 오른쪽 숫자는 그 입력을 유지한 프레임 수 (60 = 1초) */
export default function InputLogPanel({ log }: { log: InputLogEntry[] }) {
  // 아무것도 안 누른 줄은 숨긴다 (사이사이 끼면 읽기 어렵다)
  const rows = log.filter((e) => e.dir !== 5 || e.buttons.length > 0);
  if (!rows.length) return null;
  return (
    <div className="pointer-events-none absolute left-4 top-1/2 w-28 -translate-y-1/2 rounded-lg bg-black/55 px-2 py-1.5 font-mono text-xs text-white">
      <div className="mb-0.5 text-[10px] text-white/45">입력 기록</div>
      {rows.map((e, i) => (
        <div key={i} className={`flex h-[18px] items-center gap-1 ${i === 0 ? '' : 'opacity-70'}`}>
          <span className="w-4 text-center text-sm leading-none">{ARROW[e.dir]}</span>
          <span className="flex flex-1 gap-0.5">
            {e.buttons.map((b) => (
              <span key={b} className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-black ${BTN_COLOR[b]}`}>
                {b}
              </span>
            ))}
          </span>
          <span className="tabular-nums text-white/55">{e.frames}</span>
        </div>
      ))}
    </div>
  );
}
