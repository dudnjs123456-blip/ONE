'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { COSMETIC_BY_ID, COSMETIC_SLOTS, ensureWardrobe, takeOffCosmetic, wearCosmetic, type CosmeticDef, type CosmeticSlot } from '@/game/data/fashion';
import { saveProfile } from '@/game/core/profile';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function chip(c: CosmeticDef) {
  const a = hex(c.color);
  const b = hex(c.color2 ?? c.color);
  return c.pattern === 'stripe'
    ? `repeating-linear-gradient(0deg, ${a} 0 5px, ${b} 5px 8px)`
    : c.pattern === 'check'
      ? `repeating-linear-gradient(90deg, ${b}88 0 4px, transparent 4px 8px), repeating-linear-gradient(0deg, ${b}88 0 4px, ${a} 4px 8px)`
      : c.pattern === 'dot'
        ? `radial-gradient(${b} 1.5px, ${a} 2px) 0 0 / 7px 7px`
        : a;
}

/**
 * 장비창 오른쪽: 코디 6칸 (모자·안경·상의·하의·신발·가방) + 내 옷장.
 * 장비(능력치)와 따로 입는다. 비운 칸은 기본 옷 그대로.
 */
export default function OutfitSection({ world }: { world: CityWorld }) {
  const pr = world.profile;
  const wd = ensureWardrobe(pr);
  const [, redraw] = useState(0);
  const [filter, setFilter] = useState<CosmeticSlot | null>(null);
  const changed = () => {
    saveProfile(pr);
    redraw((n) => n + 1);
  };
  const closet = wd.owned.map((id) => COSMETIC_BY_ID[id]).filter((c): c is CosmeticDef => !!c && (!filter || c.slot === filter));

  return (
    <div className="w-full shrink-0 lg:w-[360px]">
      <div className="mb-2 text-sm font-bold text-pink-300">
        👗 코디 <span className="font-normal text-white/50">— 겉모습만 (능력치 없음)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {COSMETIC_SLOTS.map((s) => {
          const c = wd.worn[s.id] ? COSMETIC_BY_ID[wd.worn[s.id]!] : undefined;
          return (
            <button
              key={s.id}
              onClick={() => setFilter(filter === s.id ? null : s.id)}
              className={`flex h-14 items-center gap-2 rounded-lg border bg-white/5 px-2 text-left ${filter === s.id ? 'ring-2 ring-pink-300' : ''} ${c ? 'border-pink-300/50' : 'border-dashed border-white/15'}`}
            >
              {c ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 text-lg" style={{ background: chip(c) }}>
                  {c.icon}
                </span>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center text-lg opacity-30">{s.icon}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-white/50">{s.label}</span>
                <span className="block truncate text-xs font-bold">{c ? c.name : '기본 옷'}</span>
              </span>
              {c && (
                <span
                  role="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    takeOffCosmetic(pr, s.id);
                    changed();
                  }}
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-red-500/60"
                >
                  벗기
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mb-1 mt-4 flex items-center justify-between text-sm">
        <span className="font-bold">
          🚪 내 옷장 {filter ? `— ${COSMETIC_SLOTS.find((s) => s.id === filter)!.label}` : ''} ({closet.length})
        </span>
        {filter && (
          <button onClick={() => setFilter(null)} className="text-xs text-white/60 hover:text-white">
            전체 보기
          </button>
        )}
      </div>
      {closet.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">
          옷장이 비었어요 — 상가 1층 옷가게(펫샵 옆)에서 사 오세요 ✨
        </div>
      ) : (
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
          {closet.map((c) => {
            const on = wd.worn[c.slot] === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  if (on) takeOffCosmetic(pr, c.slot);
                  else wearCosmetic(pr, c.id);
                  changed();
                }}
                className={`flex items-center gap-2 rounded-lg border bg-white/5 p-2 text-left hover:bg-white/10 ${on ? 'border-pink-300' : 'border-white/15'}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/20 text-base" style={{ background: chip(c) }}>
                  {c.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{c.name}</span>
                  <span className="block text-[10px] text-white/50">{on ? '입는 중 (누르면 벗기)' : COSMETIC_SLOTS.find((s) => s.id === c.slot)!.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-[11px] text-white/40">옷장의 옷을 누르면 입어요. 친구 화면에도 같은 옷으로 보여요.</div>
    </div>
  );
}
