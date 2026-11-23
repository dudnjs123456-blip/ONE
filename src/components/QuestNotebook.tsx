'use client';

import { useState } from 'react';
import { CLUES, NOTES, type Ch0State } from '@/game/story/chapter0';

/**
 * 0장 의문 수첩: 주인공이 이 세계에 대해 모르는 것 (???) → 마을 사람들과 이야기하며 한 줄씩 채운다.
 * 아래엔 혼자 알아챈 단서. 접어 둘 수 있다. 0장이 끝나면 다음 이야기 안내만 남는다.
 */
export default function QuestNotebook({ ch0, flash, touch }: { ch0: Ch0State; flash: string | null; touch: boolean }) {
  const [open, setOpen] = useState(true);
  const filled = NOTES.filter((n) => (ch0.notes[n.id] ?? 0) > 0).length;
  const clues = ch0.clues ?? [];
  return (
    <div className={`absolute right-4 ${touch ? 'top-28' : 'top-14'} w-72 select-none text-white`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-t-lg border border-amber-200/30 bg-[#2a1f12]/85 px-3 py-1.5 text-left text-sm font-bold text-amber-100"
      >
        <span>📔 의문 수첩 {ch0.done ? '· 0장 끝' : `${filled}/${NOTES.length}`}</span>
        <span className="text-xs text-amber-200/60">{open ? '접기 ▴' : '펼치기 ▾'}</span>
      </button>
      {open && (
        <div className="space-y-1.5 rounded-b-lg border border-t-0 border-amber-200/30 bg-[#1b140b]/80 px-3 py-2 text-xs leading-5">
          <div className="text-[11px] text-amber-200/60">0장 · 저편에서 온 사람</div>
          {NOTES.map((n) => {
            const lv = ch0.notes[n.id] ?? 0;
            const ans = lv >= 2 ? n.full : lv === 1 ? (n.half ?? n.full) : null;
            return (
              <div key={n.id} className={`rounded px-2 py-1 ${flash === n.id ? 'note-flash bg-amber-300/25' : 'bg-white/5'}`}>
                <div className={lv ? 'text-amber-50' : 'text-white/70'}>
                  {lv >= 2 || (lv === 1 && n.id === 'shadow') ? '✔' : lv === 1 ? '◐' : '?'} {n.q}
                </div>
                <div className={ans ? 'text-amber-100/75' : 'text-white/35'}>{ans ?? '???'}</div>
              </div>
            );
          })}
          <div className="pt-1 text-[11px] text-amber-200/60">
            마을에서 알아챈 것 {clues.length}/{CLUES.length}
            {clues.length > 0 && <span className="text-amber-100/70"> · {CLUES.filter((c) => clues.includes(c.id)).map((c) => c.label).join(' · ')}</span>}
          </div>
          {ch0.done ? (
            <div className="rounded bg-emerald-400/15 px-2 py-1 text-emerald-100">다음 이야기: 1장 「기운 수련」 (준비 중)</div>
          ) : (
            <div className="text-[11px] text-white/45">
              💡 마을 사람에게 말 걸기 · 🔍 표시된 곳 살펴보기 (E){(ch0.notes.body ?? 0) < 2 && ' · 서울에 한 번 다녀와 보기'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
