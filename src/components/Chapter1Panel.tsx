'use client';

import { useState } from 'react';
import { ROOT_INFO, ch1Objective, cleanSkillName, type Ch1State, type RootId } from '@/game/story/chapter1';

/**
 * 1장 진행 창 (0장 수첩 자리): 지금 할 일 + 퀘스트 자동진행 버튼, 알아낸 내 근 · 첫 발현 기술 이름.
 */
export default function Chapter1Panel({ ch1, auto, onAuto, touch }: { ch1: Ch1State; auto: boolean; onAuto: () => void; touch: boolean }) {
  const [open, setOpen] = useState(true);
  const obj = ch1Objective(ch1);
  const info = ch1.root ? ROOT_INFO[ch1.root] : null;
  return (
    <div className={`absolute right-4 ${touch ? 'top-28' : 'top-14'} w-72 select-none text-white`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-t-lg border border-amber-200/30 bg-[#2a1f12]/85 px-3 py-1.5 text-left text-sm font-bold text-amber-100"
      >
        <span>🥋 1장 · 기운 수련{ch1.step === 'done' ? ' · 끝' : ''}</span>
        <span className="text-xs text-amber-200/60">{open ? '접기 ▴' : '펼치기 ▾'}</span>
      </button>
      {obj && (
        <div className={`flex items-center gap-2 border-x border-amber-200/30 bg-[#2a1f12]/85 px-3 py-1.5 text-xs ${open ? '' : 'rounded-b-lg border-b'}`}>
          <div className="min-w-0 flex-1 text-amber-50">
            <span className="text-amber-300">▶ 다음:</span> {obj.label}
          </div>
          {obj.kind !== 'logout' && (
            <button
              onClick={onAuto}
              className={`shrink-0 rounded px-2 py-1 font-bold ${auto ? 'animate-pulse bg-emerald-500/80 text-white' : 'bg-amber-400/80 text-[#2a1f12] hover:bg-amber-300'}`}
            >
              {auto ? '자동 진행 중' : '자동 진행'}
              {!touch && ' (G)'}
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="space-y-1.5 rounded-b-lg border border-t-0 border-amber-200/30 bg-[#1b140b]/80 px-3 py-2 text-xs leading-5">
          <div className="rounded bg-white/5 px-2 py-1">
            <div className="text-amber-50">내 근</div>
            {info ? (
              <div style={{ color: info.color }} className="font-bold">
                {ch1.root}({info.hanja}) <span className="font-normal text-amber-100/70">· {info.desc}</span>
              </div>
            ) : (
              <div className="text-white/35">??? (노아가 읽어 줄 것이다)</div>
            )}
          </div>
          <div className="rounded bg-white/5 px-2 py-1">
            <div className="text-amber-50">첫 발현</div>
            <div className={ch1.skillName ? 'font-bold text-amber-100' : 'text-white/35'}>{ch1.skillName ? `「${ch1.skillName}」` : '??? (아직 잠들어 있다)'}</div>
          </div>
          {ch1.step === 'done' ? (
            <div className="rounded bg-emerald-400/15 px-2 py-1 text-emerald-100">다음 이야기: 2장 (준비 중)</div>
          ) : obj?.kind === 'logout' ? (
            <div className="text-[11px] text-white/45">💡 오른쪽 위 🖥️ 로그아웃으로 서울 집에 다녀오기</div>
          ) : obj?.kind === 'hunt' ? (
            <div className="text-[11px] text-white/45">💡 자동 진행을 누르면 자동사냥(Z)이 켜져요</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 첫 발현 기술 이름 짓기 (1~12자). 근마다 추천 이름이 들어 있다 */
export function SkillNameModal({ root, onSubmit }: { root: RootId; onSubmit: (name: string) => void }) {
  const info = ROOT_INFO[root];
  const [v, setV] = useState(info.suggest);
  const name = cleanSkillName(v);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-80 rounded-xl border border-amber-200/40 bg-[#1b140b]/95 p-5 text-center text-white shadow-2xl">
        <div className="text-sm text-amber-200/70">첫 발현 · {root}({info.hanja})</div>
        <div className="mt-1 text-lg font-black" style={{ color: info.color }}>
          이 힘에 이름을 붙여 주세요
        </div>
        <input
          autoFocus
          value={v}
          maxLength={12}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            if (e.key === 'Enter' && name) onSubmit(name);
          }}
          className="mt-4 w-full rounded border border-amber-200/40 bg-black/50 px-3 py-2 text-center text-base font-bold text-white outline-none focus:border-amber-300"
        />
        <div className="mt-1 text-[11px] text-white/45">1~12자 · 나중에 이 이름으로 부르게 돼요</div>
        <button
          onClick={() => name && onSubmit(name)}
          disabled={!name}
          className="mt-4 w-full rounded-lg bg-amber-400/90 py-2 font-black text-[#2a1f12] hover:bg-amber-300 disabled:opacity-40"
        >
          이 이름으로 부르기
        </button>
      </div>
    </div>
  );
}
