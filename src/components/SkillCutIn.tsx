'use client';

import { useEffect, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { SKILL_CUTIN } from '@/game/data/actionVoices';

/** 컷인이 떠 있는 시간 (ms) */
const CUTIN_MS = 1500;

interface Shown {
  id: number;
  who: string;
  name: string;
  skill: string;
  img: string;
  fallback: string;
}

/**
 * 큰기술 컷인: 캐릭터 스킬을 쓰면 왼쪽에서 비스듬한 띠와 함께 공격하는 그림이 휙 들어왔다 나간다.
 * 같은 곳의 친구가 쓰면 친구 이름을 달고 작게 뜬다.
 */
export default function SkillCutIn({ world }: { world: CityWorld | null }) {
  const [shown, setShown] = useState<Shown | null>(null);

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
      setShown({ id: ++n, who: c.who, name, skill: def.name, img: `/portraits/${c.body}/${def.img}`, fallback: `/portraits/${c.body}/angry.png` });
    }, 40);
    return () => window.clearInterval(id);
  }, [world]);

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
      className={`pointer-events-none absolute left-0 z-30 ${mine ? 'top-[18%] h-[46vh] max-h-[420px] w-[78vw] max-w-[620px]' : 'top-[22%] h-[30vh] max-h-[260px] w-[60vw] max-w-[400px]'}`}
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
      <div className="absolute inset-y-0 left-[2%] w-[58%] overflow-hidden" style={{ clipPath: 'polygon(0 0, 100% 0, 90% 100%, 0 100%)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown.img}
          alt=""
          draggable={false}
          onError={(e) => {
            if (e.currentTarget.src.endsWith(shown.fallback)) return;
            e.currentTarget.src = shown.fallback;
          }}
          className="absolute left-0 top-0 h-full w-full select-none object-cover object-top drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ animation: `cutin-art ${CUTIN_MS}ms linear forwards` }}
        />
      </div>
      {/* 친구가 쓴 기술이면 누가 썼는지만 (기술 이름은 띄우지 않는다) */}
      {!mine && (
        <div className="absolute bottom-[14%] right-[6%] rounded bg-amber-400 px-2 py-0.5 text-[11px] font-black text-zinc-900">{shown.name}</div>
      )}
    </div>
  );
}
