'use client';

import { useEffect, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { BAIT_BY_ID, TIER_INFO, TIME_LABEL, fmtKg } from '@/game/data/fishing';

type View = NonNullable<CityWorld['fishing']>['view'];

/**
 * 낚시 중 화면 아래 안내: 찌 상태 · 챔질 ❗ · 힘겨루기 막대 (거리 · 장력 · 물고기 힘) · 잡은 물고기 카드.
 * 매 프레임 world.fishing 을 직접 읽어서 막대가 부드럽게 움직인다.
 */
export default function FishingHud({ world }: { world: CityWorld }) {
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setV(world.fishing ? world.fishing.view : null);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);
  if (!v) return null;
  const st = world.fishSetup;
  const fs = world.fishingState;
  const baitLeft = st ? (st.bait.reusable ? (fs.bait[st.bait.id] ? '보유' : '없음') : `${fs.bait[st.bait.id] ?? 0}개`) : '';
  const r = v.result;
  const tapBtn = (label: string, big = false) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        world.fishTap();
      }}
      className={`pointer-events-auto select-none rounded-xl bg-sky-500 font-black text-black shadow-lg active:scale-95 ${big ? 'px-8 py-3 text-xl' : 'px-4 py-1.5 text-sm'}`}
    >
      {label}
    </button>
  );
  return (
    <>
      {v.phase === 'fight' && v.surge && <div className="pointer-events-none absolute inset-0 animate-pulse border-[8px] border-red-500/50" />}
      {v.phase === 'bite' && (
        <div className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 text-center">
          <div className="animate-bounce text-7xl font-black text-red-400 drop-shadow-[0_0_12px_rgba(0,0,0,0.9)]">❗</div>
          <div className="mt-1 text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">지금! SPACE</div>
          <div className="mx-auto mt-2 h-2 w-40 overflow-hidden rounded bg-black/50">
            <div className="h-full bg-red-400" style={{ width: `${v.biteLeft * 100}%` }} />
          </div>
        </div>
      )}
      {r && r.kind === 'caught' && (
        <div className="pointer-events-none absolute left-1/2 top-[18%] w-72 -translate-x-1/2 rounded-2xl border-2 bg-zinc-900/90 p-4 text-center shadow-2xl" style={{ borderColor: TIER_INFO[r.fish.tier].color }}>
          <div className="text-xs font-bold" style={{ color: TIER_INFO[r.fish.tier].color }}>
            {TIER_INFO[r.fish.tier].label} {'★'.repeat(TIER_INFO[r.fish.tier].stars)}
          </div>
          <div className="my-1 text-6xl">{r.fish.icon}</div>
          <div className="text-xl font-black">{r.fish.name}</div>
          <div className="text-lg tabular-nums text-sky-200">{fmtKg(r.kg)}</div>
          <div className="mt-1 flex justify-center gap-2 text-xs">
            {r.isNew && <span className="rounded bg-emerald-500/30 px-1.5 py-0.5 font-bold text-emerald-200">✨ 도감 등록</span>}
            {r.record && <span className="rounded bg-amber-500/30 px-1.5 py-0.5 font-bold text-amber-200">📏 최대 기록</span>}
          </div>
          <div className="mt-2 text-xs text-white/70">
            +{r.exp} EXP{r.fish.protect ? ' · 📸 사진만 찍고 놓아줬다' : r.released ? ' · 살림망이 가득 차서 놓아줬다' : ` · 팔면 ${r.price?.toLocaleString()}G`}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-6 right-4 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-sky-300/30 bg-black/70 p-3 text-sm text-white shadow-xl">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>
            🎣 {st?.rod.name ?? '낚싯대 없음'} · {st ? `${BAIT_BY_ID[st.bait.id].icon} ${st.bait.name} ${baitLeft}` : '미끼 없음'}
          </span>
          <span>{st ? TIME_LABEL[st.band] : ''}</span>
        </div>
        {v.phase === 'fight' ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-bold">
              <span className={v.surge ? 'text-red-300' : 'text-sky-200'}>{v.surge ? '🌊 차고 나간다! 손 떼요!' : '💪 Space 연타!'}</span>
              <span className="text-xs text-white/70">손맛: {v.feel}</span>
            </div>
            <Bar label="거리" value={v.progress} color="#38bdf8" flash={v.tapFlash} />
            <Bar label="장력" value={v.tension} color={v.tension > 80 ? '#ef4444' : v.tension > 60 ? '#f59e0b' : '#a3e635'} shake={v.tension > 80} />
            <Bar label="고기 힘" value={v.stamina * 100} color="#a78bfa" thin />
            <div className="mt-1 flex justify-center">{tapBtn('감기 (Space)', true)}</div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`font-bold ${v.phase === 'bite' ? 'text-red-300' : v.nibble > 0 ? 'text-amber-200' : 'text-white'}`}>{v.hint}</span>
            {(v.phase === 'ready' || v.phase === 'bite' || v.phase === 'result') && tapBtn(v.phase === 'ready' ? '던지기' : v.phase === 'bite' ? '챔질!' : '계속')}
          </div>
        )}
        {v.phase !== 'fight' && (
          <div className="mt-1 flex justify-between text-[11px] text-white/45">
            <span>E · 방향키: 그만하기</span>
            <span>F: 도감 · 확률표</span>
          </div>
        )}
      </div>
    </>
  );
}

function Bar({ label, value, color, flash, shake, thin }: { label: string; value: number; color: string; flash?: boolean; shake?: boolean; thin?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-white/70">{label}</span>
      <div className={`relative flex-1 overflow-hidden rounded bg-white/10 ${thin ? 'h-1.5' : 'h-3.5'} ${shake ? 'animate-pulse' : ''}`}>
        <div className="h-full transition-[width] duration-75" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color, boxShadow: flash ? `0 0 10px ${color}` : undefined }} />
        {label === '장력' && <div className="absolute inset-y-0 left-[80%] w-px bg-red-400/80" />}
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70">{Math.round(value)}</span>
    </div>
  );
}
