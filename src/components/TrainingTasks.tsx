'use client';

import { useEffect, useState } from 'react';
import type { HudState } from '@/game/core/match';

/** 연습 모드 과제: 해내면 자동 체크 (이 브라우저에 기억) */
const TASKS: { id: string; label: string; hint: string; done: (h: HudState) => boolean }[] = [
  { id: 'jab', label: '잽 맞히기', hint: '1', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name === '잽' && h.lastHit.result !== 'block' },
  { id: 'launch', label: '띄우기', hint: '↘+2 (어퍼컷)', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name.startsWith('어퍼컷') && h.lastHit.result !== 'block' },
  { id: 'combo3', label: '3 HIT 콤보', hint: '띄운 뒤 1, 1·2 …', done: (h) => h.bestCombo[0].hits >= 3 },
  { id: 'counter', label: '카운터 히트', hint: '상대가 공격할 때 때리기 (허수아비: CPU)', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.result === 'counter' },
  { id: 'grab', label: '잡기', hint: '→ 누르고 1+3', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name.startsWith('잡아 던지기') && h.lastHit.result !== 'block' },
  { id: 'wall', label: '벽꽝', hint: '경기장 끝에서 →+2', done: (h) => h.wallSplats[1] > 0 },
];

const KEY = 'ironfist.trainingTasks';

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** @param compact 폰: 왼쪽 위에 접힌 채로 시작 (오른쪽은 터치 버튼 자리) */
export default function TrainingTasks({ hud, compact = false, portrait = false }: { hud: HudState; compact?: boolean; portrait?: boolean }) {
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState(!compact);
  useEffect(() => setDone(load()), []);

  useEffect(() => {
    const newly = TASKS.filter((t) => !done.includes(t.id) && t.done(hud)).map((t) => t.id);
    if (!newly.length) return;
    const next = [...done, ...newly];
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, [hud, done]);

  const count = TASKS.filter((t) => done.includes(t.id)).length;
  return (
    <div className={`absolute w-56 rounded-lg border border-white/15 bg-black/70 text-xs text-white ${compact ? `left-4 z-10 ${portrait ? 'top-40' : 'top-24'}` : 'right-4 top-24'}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 font-bold">
        <span>연습 과제 {count}/{TASKS.length}</span>
        <span className="text-white/50">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-2">
          {TASKS.map((t) => {
            const ok = done.includes(t.id);
            return (
              <li key={t.id} className={ok ? 'text-emerald-300' : 'text-white/85'}>
                {ok ? '✔' : '○'} {t.label}
                {!ok && <span className="ml-1 text-[10px] text-white/45">{t.hint}</span>}
              </li>
            );
          })}
          {count === TASKS.length && <li className="pt-1 text-amber-300">모두 해냈어요! VS CPU 에 도전해 보세요</li>}
        </ul>
      )}
    </div>
  );
}
