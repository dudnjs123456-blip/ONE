'use client';

import { useState } from 'react';
import type { FieldWorld } from '@/game/core/field';
import { COIN_NAME } from '@/game/data/inn';
import { EQUIPS, EQUIP_SLOTS, SHOP_GEAR, dimensionStats, ensureGear, equipItem, gearBonus, unequipSlot, type EquipDef, type EquipSlot, type Rarity } from '@/game/data/equipment';

const RARITY: Record<Rarity, { label: string; cls: string }> = {
  common: { label: '일반', cls: 'border-white/20' },
  rare: { label: '희귀', cls: 'border-sky-400/70' },
  epic: { label: '영웅', cls: 'border-fuchsia-400/80' },
};

const effect = (e: EquipDef) => [e.hp ? `HP +${e.hp}` : '', e.power ? `공격력 +${Math.round(e.power * 100)}%` : ''].filter(Boolean).join(' · ');

/**
 * 차원 장비창 (T): 8칸 + 가방. 무구 노점 앞에서 열면(shop) 노점 탭으로 열려 은화로 산다.
 * 장비는 반대편 세계에서만 효과가 있다 — 서울에선 몸(레벨)뿐 (docs/world-rules.md).
 */
export default function GearPanel({ world, shop = false, onClose }: { world: FieldWorld; shop?: boolean; onClose: () => void }) {
  const profile = world.profile;
  const g = ensureGear(profile);
  const [tab, setTab] = useState<'gear' | 'shop'>(shop ? 'shop' : 'gear');
  const [, redraw] = useState(0);
  const [filter, setFilter] = useState<EquipSlot | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = () => {
    world.refreshStats();
    redraw((n) => n + 1);
  };
  const bonus = gearBonus(profile);
  const st = dimensionStats(profile);
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

  const ShopRow = ({ e }: { e: EquipDef }) => {
    const cur = g.equipped[e.slot] ? EQUIPS[g.equipped[e.slot]!] : undefined;
    const dp = Math.round(((e.power ?? 0) - (cur?.power ?? 0)) * 100);
    const dh = (e.hp ?? 0) - (cur?.hp ?? 0);
    const inBag = g.owned.filter((x) => x === e.id).length;
    const afford = world.coin >= (e.price ?? 0);
    return (
      <div className={`flex items-center gap-3 rounded-lg border bg-white/5 p-2 ${RARITY[e.rarity].cls}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/30 text-2xl">{e.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {e.name} <span className="text-[10px] font-normal text-white/50">{EQUIP_SLOTS.find((s) => s.id === e.slot)!.label} · {RARITY[e.rarity].label}</span>
          </div>
          <div className="text-[11px] text-emerald-300">{effect(e)}</div>
          <div className="text-[10px] text-white/50">
            {g.equipped[e.slot] === e.id ? '지금 끼고 있어요' : `지금 장비보다 ${[dp ? `공격력 ${dp > 0 ? '+' : ''}${dp}%` : '', dh ? `HP ${dh > 0 ? '+' : ''}${dh}` : ''].filter(Boolean).join(' · ') || '차이 없음'}`}
            {inBag ? ` · 가방에 ${inBag}개` : ''}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-bold text-amber-200">
            {e.price!.toLocaleString()} {COIN_NAME}
          </span>
          <button
            disabled={!afford}
            onClick={() => {
              const r = world.buyGear(e.id);
              setMsg({ ok: r.ok, text: r.message });
              redraw((n) => n + 1);
            }}
            className="rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            사기
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[94vh] w-[720px] max-w-full overflow-y-auto rounded-xl border border-amber-200/30 bg-[#1b140b]/95 p-5 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xl font-bold">🛡️ 차원 장비</div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-200">
              {world.coin.toLocaleString()} {COIN_NAME}
            </span>
            <span className="text-xs text-white/50">T / Esc 닫기</span>
          </div>
        </div>
        {shop && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm font-bold">
            {(
              [
                ['gear', '🎒 내 장비'],
                ['shop', '⚒️ 무구 노점'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-md py-1.5 ${tab === id ? 'bg-amber-500 text-black' : 'text-white/60 hover:bg-white/10'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'shop' ? (
          <>
            <div className="mb-2 text-[11px] text-white/50">영웅 장비는 노점에서 안 팔아요. 산적·오우거·흑기사가 아주 가끔 떨어뜨려요.</div>
            <div className="flex flex-col gap-1.5">
              {SHOP_GEAR.map((e) => (
                <ShopRow key={e.id} e={e} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-stretch justify-center gap-3">
              <div className="flex flex-col gap-2">
                {EQUIP_SLOTS.slice(0, 4).map((s) => (
                  <Slot key={s.id} slot={s} />
                ))}
              </div>
              <div className="flex w-36 flex-col items-center justify-center rounded-lg bg-white/5 p-2 text-center">
                <div className="text-6xl">🧍</div>
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

            <div className="mb-1 mt-4 flex items-center justify-between text-sm">
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
              <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">가방에 장비가 없어요. 광장 동쪽 무구 노점에서 사거나, 몬스터가 떨어뜨린 걸 주워요.</div>
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
            <div className="mt-2 text-[11px] text-white/40">가방의 장비를 누르면 낍니다 (같은 칸에 있던 장비는 가방으로). 장비는 이 세계에서만 힘을 써요 — 서울로는 못 들고 나가요.</div>
          </>
        )}
        {msg && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>{msg.text}</div>}
      </div>
    </div>
  );
}
