'use client';

import { useState } from 'react';
import type { PlayerProfile } from '@/game/core/profile';
import { RESULT_LABEL, WEEKDAYS, dateOfDay, dayOfDate, daysInMonth, formatDay } from '@/game/city/calendar';

const hhmm = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** 집 달력: 일한 날에 도장, 날짜를 누르면 그날 근무 내역 */
export default function CalendarPanel({ profile, today, onClose }: { profile: PlayerProfile; today: number; onClose: () => void }) {
  const t = dateOfDay(today);
  const [ym, setYm] = useState({ y: t.year, m: t.month });
  const [sel, setSel] = useState<number>(today);
  const log = profile.workLog ?? {};
  const first = dateOfDay(dayOfDate(ym.y, ym.m, 1)).dow;
  const n = daysInMonth(ym.y, ym.m);
  const days = Array.from({ length: n }, (_, i) => dayOfDate(ym.y, ym.m, i + 1));
  const monthEntries = days.flatMap((d) => log[String(d)] ?? []);
  const workedDays = days.filter((d) => log[String(d)]?.length).length;
  const earned = monthEntries.reduce((s, e) => s + e.pay, 0);
  const shift = (k: number) => setYm(({ y, m }) => ({ y: m + k < 0 ? y - 1 : m + k > 11 ? y + 1 : y, m: (m + k + 12) % 12 }));
  const entries = log[String(sel)] ?? [];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex w-[640px] max-w-full gap-4 rounded-xl border border-white/20 bg-zinc-900/95 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="w-[340px] shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => shift(-1)} className="rounded px-2 py-1 hover:bg-white/10">
              ◀
            </button>
            <div className="text-lg font-bold">
              📅 {ym.y}년 {ym.m + 1}월
            </div>
            <button onClick={() => shift(1)} className="rounded px-2 py-1 hover:bg-white/10">
              ▶
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`py-1 font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-sky-400' : 'text-white/60'}`}>
                {w}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <div key={`e${i}`} />
            ))}
            {days.map((d, i) => {
              const worked = log[String(d)]?.length;
              const dow = (first + i) % 7;
              return (
                <button
                  key={d}
                  onClick={() => setSel(d)}
                  className={`relative flex h-11 flex-col items-center justify-center rounded border text-sm ${
                    d === sel ? 'border-amber-300 bg-amber-300/15' : d === today ? 'border-amber-200/50 bg-white/10' : 'border-white/5 hover:bg-white/5'
                  } ${d > today ? 'opacity-40' : ''}`}
                >
                  <span className={dow === 0 ? 'text-red-300' : dow === 6 ? 'text-sky-300' : ''}>{i + 1}</span>
                  {worked ? <span className="text-[11px] leading-none">✅</span> : null}
                  {d === today && <span className="absolute right-0.5 top-0.5 text-[8px] text-amber-300">오늘</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded bg-white/5 px-3 py-2 text-xs text-white/80">
            이번 달 근무 <b className="text-amber-200">{workedDays}일</b> · 번 돈 <b className="text-amber-200">{earned}G</b>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-bold">{formatDay(sel)}</div>
            <button onClick={onClose} className="text-xs text-white/50 hover:text-white">
              닫기 (Esc)
            </button>
          </div>
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
              {sel > today ? '아직 오지 않은 날이에요' : '이날은 쉬었어요'}
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto">
              {entries.map((e, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>
                      {e.icon} {e.name}
                    </span>
                    <span className="text-amber-200">+{e.pay}G</span>
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    {hhmm(e.from)} ~ {hhmm(e.to)} · {RESULT_LABEL[e.result]}
                  </div>
                  <div className="text-xs text-white/60">
                    출입 확인 {e.checked}명{e.patrols ? ` · 순찰 ${e.patrols}회` : ''}{e.robbers ? ` · 강도 ${e.robbers}명 제압` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
