'use client';

import type { CityWorld } from '@/game/city/cityWorld';
import { BUS_FARE } from '@/game/city/cityWorld';

/** 버스정류장 (E): 행선지를 고르면 교통비를 내고 바로 그곳 앞에 내린다 */
export default function BusPanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const dests = world.busDestinations();
  const p = world.player;
  const gold = world.profile.gold;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl border border-sky-300/30 bg-zinc-900/95 p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-lg font-black text-sky-300">🚌 동네 순환버스</div>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
            닫기
          </button>
        </div>
        <div className="mb-3 text-xs text-white/55">
          어디든 한 번에 {BUS_FARE} G · 💰 {gold.toLocaleString()} G
        </div>
        <div className="space-y-1.5">
          {dests.map((d) => {
            const near = Math.hypot(d.x - p.x, d.z - p.z) < 12;
            return (
              <button
                key={d.id}
                disabled={near || gold < BUS_FARE}
                onClick={() => {
                  if (world.busTravel(d.id)) onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-sky-500/20 disabled:opacity-40 disabled:hover:bg-white/5"
              >
                <span className="text-xl">{d.icon}</span>
                <span className="flex-1 text-sm font-bold">{d.label}</span>
                <span className="text-[11px] text-white/50">{near ? '여기예요' : `${Math.round(Math.hypot(d.x - p.x, d.z - p.z))}m`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
