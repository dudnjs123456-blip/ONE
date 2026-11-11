'use client';

import { useEffect, useState } from 'react';
import { MOOD_LINES, MOOD_LINE_MS } from '@/game/data/moodLines';
import { PLAYER_PORTRAITS, playerPortrait } from '@/game/data/portraits';
import { isMuted } from '@/game/render/sfx';

/** 한 글자씩 찍히는 속도 (ms) */
const TYPE_MS = 32;

/**
 * 숫자 키 대사: 오른쪽 아래에 그 기분의 내 상반신 그림이 서고, 바로 옆에 대사 상자가 뜬다.
 * pop.at 이 바뀔 때마다 처음부터 다시 찍고, MOOD_LINE_MS 뒤에 사라진다.
 */
export default function MoodLinePop({ body, name, pop }: { body: string | undefined; name: string; pop: { n: number; at: number } | null }) {
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(false);
  const line = pop ? MOOD_LINES[pop.n - 1] : null;

  // 표정 그림을 미리 받아 둔다 (처음 누를 때 그림이 늦게 뜨지 않게)
  useEffect(() => {
    const p = body ? PLAYER_PORTRAITS[body] : undefined;
    for (const src of Object.values(p ?? {})) new Image().src = src;
  }, [body]);

  useEffect(() => {
    if (!pop) return;
    setTyped(0);
    setShown(true);
    const id = window.setTimeout(() => setShown(false), MOOD_LINE_MS);
    return () => window.clearTimeout(id);
  }, [pop]);

  useEffect(() => {
    if (!line || typed >= line.text.length) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => window.clearTimeout(id);
  }, [line, typed]);

  if (!line || !shown) return null;
  const portrait = playerPortrait(body, line.mood);
  return (
    <div className="pointer-events-none absolute bottom-24 right-2 z-30 flex items-end gap-1 sm:right-6">
      <style>{'@keyframes mood-pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'}</style>
      {/* 대사 상자: 그림 왼쪽, 꼬리가 그림 쪽을 가리킨다 */}
      <div className="relative mb-16 max-w-[52vw] rounded-2xl border-2 border-amber-400/80 bg-[#14101d]/92 px-4 pb-3 pt-5 text-white shadow-2xl sm:max-w-xs" style={{ animation: 'mood-pop 0.25s ease-out' }}>
        <div className="absolute -top-3.5 left-3 rounded-lg bg-amber-400 px-2.5 py-0.5 text-xs font-black text-zinc-900 shadow">{name}</div>
        <p className="min-h-[1.5rem] text-[15px] font-semibold leading-snug">
          {line.text.slice(0, typed)}
          {typed < line.text.length && <span className="animate-pulse">▍</span>}
        </p>
        {isMuted() && <p className="mt-1 text-[11px] text-white/50">🔇 소리가 꺼져 있어요 (Esc 메뉴에서 켜기)</p>}
        <span className="absolute -right-2 bottom-5 h-4 w-4 rotate-45 border-r-2 border-t-2 border-amber-400/80 bg-[#14101d]" />
      </div>
      {portrait && (
        <div
          className="relative aspect-[3/5] w-[30vw] max-w-[220px] overflow-hidden"
          style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={portrait + pop?.at}
            src={portrait}
            alt=""
            draggable={false}
            className="absolute left-0 top-0 w-full select-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
            style={{ animation: 'mood-pop 0.3s ease-out' }}
          />
        </div>
      )}
    </div>
  );
}
