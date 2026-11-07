'use client';

import { useEffect, useState } from 'react';
import type { HudState } from '@/game/core/match';

type Task = { id: string; label: string; hint: string; done: (h: HudState) => boolean };

/** 연습 모드 과제: 해내면 자동 체크 (이 브라우저에 기억). 기초를 다 하면 중급이 열린다 */
const BASIC: Task[] = [
  { id: 'jab', label: '잽 맞히기', hint: '1', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name === '잽' && h.lastHit.result !== 'block' },
  { id: 'launch', label: '띄우기', hint: '↘+2 (어퍼컷 · 서서 가드 허수아비는 막아요)', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name.startsWith('어퍼컷') && h.lastHit.result !== 'block' },
  { id: 'combo3', label: '3 HIT 콤보', hint: '↘+2 → 1,2 (허수아비: 가드 안 함)', done: (h) => h.bestCombo[0].hits >= 3 },
  { id: 'counter', label: '카운터 히트', hint: '상대가 공격할 때 때리기 (허수아비: CPU)', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.result === 'counter' },
  { id: 'grab', label: '잡기', hint: '→ 누르고 1+3', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name.startsWith('잡아 던지기') && h.lastHit.result !== 'block' },
  { id: 'wall', label: '벽꽝', hint: '경기장 끝에서 →+2', done: (h) => h.wallSplats[1] > 0 },
];

const ADVANCED: Task[] = [
  { id: 'low', label: '하단 맞히기', hint: '↓+4 (서서 막는 허수아비는 하단을 못 막아요)', done: (h) => h.lastHit?.attacker === 0 && h.lastHit.name.startsWith('로우') && h.lastHit.result !== 'block' },
  { id: 'combo4', label: '4 HIT 콤보', hint: '↘+2 → 1 → →+2 → →+2 (허수아비: 가드 안 함)', done: (h) => h.bestCombo[0].hits >= 4 },
  { id: 'dmg40', label: '한 콤보로 40 데미지', hint: '띄운 뒤 떨어지는 상대에 계속 이어 치기', done: (h) => h.bestCombo[0].damage >= 40 },
  { id: 'counter3', label: '카운터 3번', hint: '허수아비: CPU · 상대 공격에 끼워 넣기', done: (h) => h.stats[0].counters >= 3 },
  { id: 'guard10', label: '공격 10번 막기', hint: '허수아비: CPU 또는 ● 녹화 재생 · 뒤로 = 가드', done: (h) => h.stats[0].guards >= 10 },
  { id: 'break', label: '잡기 풀기', hint: '허수아비: CPU 가 잡을 때 1·2', done: (h) => h.stats[0].throwBreaks > 0 },
];

const TIERS = [
  { name: '기초', tasks: BASIC },
  { name: '중급', tasks: ADVANCED },
];
const TASKS = [...BASIC, ...ADVANCED];

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
/** @param ignore 콤보 시연 중엔 과제를 세지 않는다 (보기만 해도 완료되면 안 되니) */
export default function TrainingTasks({ hud, compact = false, portrait = false, ignore = false }: { hud: HudState; compact?: boolean; portrait?: boolean; ignore?: boolean }) {
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState(!compact);
  useEffect(() => setDone(load()), []);

  useEffect(() => {
    if (ignore) return;
    const newly = TASKS.filter((t) => !done.includes(t.id) && t.done(hud)).map((t) => t.id);
    if (!newly.length) return;
    const next = [...done, ...newly];
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, [hud, done, ignore]);

  // 지금 단계: 아직 다 못 한 첫 단계 (다 했으면 마지막 단계)
  const tier = TIERS.find((t) => t.tasks.some((x) => !done.includes(x.id))) ?? TIERS[TIERS.length - 1];
  const list = tier.tasks;
  const count = list.filter((t) => done.includes(t.id)).length;
  const allDone = TASKS.every((t) => done.includes(t.id));
  return (
    <div className={`absolute w-56 rounded-lg border border-white/15 bg-black/70 text-xs text-white ${compact ? `left-4 z-10 ${portrait ? 'top-40' : 'top-24'}` : 'right-4 top-24'}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 font-bold">
        <span>
          연습 과제 <span className="text-amber-300">{tier.name}</span> {count}/{list.length}
        </span>
        <span className="text-white/50">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-2">
          {tier !== TIERS[0] && count === 0 && <li className="text-[11px] text-amber-300">기초 완료! 중급 과제가 열렸어요</li>}
          {list.map((t) => {
            const ok = done.includes(t.id);
            return (
              <li key={t.id} className={ok ? 'text-emerald-300' : 'text-white/85'}>
                {ok ? '✔' : '○'} {t.label}
                {!ok && <span className="ml-1 text-[10px] text-white/45">{t.hint}</span>}
              </li>
            );
          })}
          {allDone && <li className="pt-1 text-amber-300">모두 해냈어요! VS CPU 어려움에 도전해 보세요</li>}
        </ul>
      )}
    </div>
  );
}
