'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { CUTIN_ART_BODIES, CUTIN_MS, SKILL_CUTIN } from '@/game/data/actionVoices';

/** 렌더러가 기술을 쓴 캐릭터만 실시간으로 찍어 담는 그림판 · 그 캐릭터를 찍을 수 있는지 */
export interface CutInLive {
  canvas: HTMLCanvasElement;
  can(who: string): boolean;
}

interface Shown {
  id: number;
  who: string;
  name: string;
  skill: string;
  img: string;
  fallback: string;
  /** 3D 캐릭터가 공격하는 모습을 실시간으로 띄운다 (못 찍으면 초상화) */
  live: boolean;
}

/**
 * 큰기술 컷인: 캐릭터 스킬을 쓰면 왼쪽에서 비스듬한 띠와 함께 그 캐릭터가 그 기술을 쓰는 공격 그림이
 * 화면 왼쪽 아래에 작게 휙 들어왔다 나간다 (그림이 없는 몸은 3D 캐릭터를 실시간으로 찍어서). 같은 곳의 친구가 쓰면 친구 이름을 달고 더 작게 뜬다.
 */
export default function SkillCutIn({ world, live }: { world: CityWorld | null; live?: RefObject<CutInLive | null> }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const liveBox = useRef<HTMLDivElement>(null);

  // 그림을 미리 받아 둔다 (처음 쓸 때 늦지 않게)
  useEffect(() => {
    const body = world?.profile.body;
    if (!body) return;
    for (const c of Object.values(SKILL_CUTIN)) new Image().src = `/portraits/${body}/${c.img}`;
  }, [world]);

  useEffect(() => {
    if (!world) return;
    let n = 0;
    const id = window.setInterval(() => {
      const c = world.cutIns.splice(0).pop();
      if (!c) return;
      const def = SKILL_CUTIN[c.kind];
      if (!def) return;
      const name = c.who === 'me' ? world.netName || '나' : (world.remotes.get(c.who)?.name ?? '이웃');
      // 공격 그림이 있으면 그림으로, 없으면 3D 캐릭터를 실시간으로 찍는다
      const canLive = !CUTIN_ART_BODIES.has(c.body) && !!live?.current?.can(c.who);
      setShown({ id: ++n, who: c.who, name, skill: def.name, img: `/portraits/${c.body}/${def.img}`, fallback: `/portraits/${c.body}/angry.png`, live: canLive });
    }, 40);
    return () => window.clearInterval(id);
  }, [world, live]);

  // 실시간 그림판을 띠 안에 붙였다가 컷인이 끝나면 뗀다
  useEffect(() => {
    const box = liveBox.current;
    const cv = live?.current?.canvas;
    if (!shown?.live || !box || !cv) return;
    cv.className = 'absolute inset-0 h-full w-full select-none object-cover drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]';
    box.appendChild(cv);
    return () => {
      if (cv.parentElement === box) box.removeChild(cv);
    };
  }, [shown, live]);

  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(null), CUTIN_MS);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const mine = shown.who === 'me';
  return (
    <div
      key={shown.id}
      className={`pointer-events-none absolute left-0 z-30 ${mine ? 'bottom-[12%] h-[24vh] max-h-[210px] w-[42vw] max-w-[320px]' : 'bottom-[12%] h-[17vh] max-h-[150px] w-[32vw] max-w-[230px]'}`}
      style={{ animation: `cutin-life ${CUTIN_MS}ms ease-out forwards` }}
    >
      <style>{`
        @keyframes cutin-life{0%{opacity:0;transform:translateX(-60%)}12%{opacity:1;transform:translateX(0)}80%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(-18%)}}
        @keyframes cutin-art{0%{transform:translateX(-30px) scale(1.12)}100%{transform:translateX(18px) scale(1.04)}}
        @keyframes cutin-lines{from{background-position:0 0}to{background-position:-400px 0}}
      `}</style>
      {/* 비스듬한 띠 + 속도선 */}
      <div
        className="absolute inset-y-[8%] left-0 right-0 overflow-hidden"
        style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)', background: 'linear-gradient(100deg, rgba(20,16,40,0.92) 0%, rgba(42,28,88,0.88) 55%, rgba(120,190,255,0.55) 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.0) 0 22px, rgba(220,235,255,0.55) 22px 24px, rgba(255,255,255,0) 24px 70px)',
            animation: 'cutin-lines 0.35s linear infinite',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-200 via-white to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-amber-300 via-amber-100 to-transparent" />
      </div>
      {/* 캐릭터 그림: 띠 밖으로 살짝 튀어나오게 */}
      <div className={`absolute inset-y-0 left-[2%] ${shown.live ? 'w-[58%] overflow-hidden' : 'w-[66%]'}`} style={shown.live ? { clipPath: 'polygon(0 0, 100% 0, 90% 100%, 0 100%)' } : undefined}>
        {shown.live ? (
          <div ref={liveBox} className="absolute inset-0" style={{ animation: `cutin-art ${CUTIN_MS}ms linear forwards` }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
          src={shown.img}
          alt=""
          draggable={false}
          onError={(e) => {
            if (e.currentTarget.src.endsWith(shown.fallback)) return;
            e.currentTarget.src = shown.fallback;
          }}
          className="absolute left-0 top-0 h-full w-full select-none object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ animation: `cutin-art ${CUTIN_MS}ms linear forwards` }}
        />
        )}
      </div>
      {/* 친구가 쓴 기술이면 누가 썼는지만 (기술 이름은 띄우지 않는다) */}
      {!mine && (
        <div className="absolute bottom-[14%] right-[6%] rounded bg-amber-400 px-2 py-0.5 text-[11px] font-black text-zinc-900">{shown.name}</div>
      )}
    </div>
  );
}
