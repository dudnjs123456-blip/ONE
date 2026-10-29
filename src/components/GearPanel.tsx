'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { EQUIPS, EQUIP_SLOTS, ensureGear, equipItem, gearBonus, playerStats, unequipSlot, type EquipDef, type EquipSlot, type Rarity } from '@/game/data/equipment';

const RARITY: Record<Rarity, { label: string; cls: string }> = {
  common: { label: '일반', cls: 'border-white/20' },
  rare: { label: '희귀', cls: 'border-sky-400/70' },
  epic: { label: '영웅', cls: 'border-fuchsia-400/80' },
};

const effect = (e: EquipDef) => [e.hp ? `HP +${e.hp}` : '', e.power ? `공격력 +${Math.round(e.power * 100)}%` : ''].filter(Boolean).join(' · ');

/** 장비창 (T): 8칸 + 가방. 가방 장비를 누르면 끼고, 칸을 누르면 그 칸 장비만 보거나 벗는다 */
export default function GearPanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const profile = world.profile;
  const g = ensureGear(profile);
  const [, redraw] = useState(0);
  const [filter, setFilter] = useState<EquipSlot | null>(null);
  const changed = () => {
    world.refreshStats();
    redraw((n) => n + 1);
  };
  const bonus = gearBonus(profile);
  const st = playerStats(profile);
  const bag = g.owned.map((id, i) => ({ e: EQUIPS[id], i })).filter((x) => x.e && (!filter || x.e.slot === filter));

  const Slot = ({ slot }: { slot: (typeof EQUIP_SLOTS)[number] }) => {
    const id = g.equipped[slot.id];
    const e = id ? EQUIPS[id] : undefined;
    return (
      <button
        onClick={() => setFilter(filter === slot.id ? null : slot.id)}
        className={`flex h-16 w-40 items-center gap-2 rounded-lg border bg-white/5 px-2 text-left ${filter === slot.id ? 'ring-2 ring-amber-300' : ''} ${e ? RARITY[e.rarity].cls : 'border-dashed border-white/15'}`}
      >
        <span className="text-2xl">{e ? e.icon : <span className="opacity-30">{slot.icon}</span>}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] text-white/50">{slot.label}</span>
          <span className="block truncate text-xs font-bold">{e ? e.name : '비어 있음'}</span>
          {e && <span className="block truncate text-[10px] text-emerald-300">{effect(e)}</span>}
        </span>
        {e && (
          <span
            role="button"
            onClick={(ev) => {
              ev.stopPropagation();
              unequipSlot(profile, slot.id);
              changed();
            }}
            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-red-500/60"
          >
            벗기
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-[640px] max-w-full rounded-xl border border-white/20 bg-zinc-900/95 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-bold">🛡️ 장비</div>
          <div className="text-xs text-white/50">T / Esc 닫기</div>
        </div>

        <div className="flex items-stretch justify-center gap-3">
          <div className="flex flex-col gap-2">
            {EQUIP_SLOTS.slice(0, 4).map((s) => (
              <Slot key={s.id} slot={s} />
            ))}
          </div>
          <div className="flex w-36 flex-col items-center justify-center rounded-lg bg-white/5 p-2 text-center">
            <div className="text-6xl">🧍‍♀️</div>
            <div className="mt-2 text-xs text-white/60">Lv.{profile.level}</div>
            <div className="mt-1 text-sm font-bold">HP {st.maxHp}</div>
            <div className="text-sm font-bold">공격력 ×{st.power.toFixed(2)}</div>
            <div className="mt-1 text-[11px] text-emerald-300">
              장비 HP +{bonus.hp}
              <br />
              장비 공격력 +{Math.round(bonus.power * 100)}%
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {EQUIP_SLOTS.slice(4).map((s) => (
              <Slot key={s.id} slot={s} />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-1 flex items-center justify-between text-sm">
          <span className="font-bold">
            🎒 가방 {filter ? `— ${EQUIP_SLOTS.find((s) => s.id === filter)!.label}` : ''} ({bag.length})
          </span>
          {filter && (
            <button onClick={() => setFilter(null)} className="text-xs text-white/60 hover:text-white">
              전체 보기
            </button>
          )}
        </div>
        {bag.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">가방에 장비가 없어요</div>
        ) : (
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
            {bag.map(({ e, i }) => (
              <button
                key={`${e.id}-${i}`}
                onClick={() => {
                  equipItem(profile, e.id);
                  changed();
                }}
                className={`flex items-center gap-2 rounded-lg border bg-white/5 p-2 text-left hover:bg-white/10 ${RARITY[e.rarity].cls}`}
              >
                <span className="text-2xl">{e.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">
                    {e.name} <span className="font-normal text-white/50">· {EQUIP_SLOTS.find((s) => s.id === e.slot)!.label} · {RARITY[e.rarity].label}</span>
                  </span>
                  <span className="block truncate text-[10px] text-emerald-300">{effect(e)}</span>
                  <span className="block truncate text-[10px] text-white/50">{e.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 text-[11px] text-white/40">가방의 장비를 누르면 낍니다 (같은 칸에 있던 장비는 가방으로). 칸을 누르면 그 칸 장비만 보여요.</div>
      </div>
    </div>
  );
}
