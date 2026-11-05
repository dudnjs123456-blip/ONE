'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import type { ClothesCorner } from '@/game/city/store';
import { EQUIPS, EQUIP_SLOTS, SHOP_GEAR, ensureGear, equipItem, type EquipDef, type Rarity } from '@/game/data/equipment';
import { saveProfile } from '@/game/core/profile';
import { CLOTHES_SHOP_NAME, COSMETIC_SLOTS, isNewToday, shopCosmetics, ensureWardrobe, wearCosmetic, type CosmeticDef, type CosmeticSlot } from '@/game/data/fashion';

type Tab = 'gear' | 'style';
type GearCat = 'weapon' | 'gearAcc' | 'armor';
type StyleCat = 'hat' | 'top' | 'bottom' | 'shoes';

const GEAR_CATS: { id: GearCat; label: string; slots: EquipDef['slot'][] }[] = [
  { id: 'weapon', label: '🗡️ 무기', slots: ['weapon'] },
  { id: 'gearAcc', label: '🥊 장갑·액세서리', slots: ['gloves', 'necklace', 'ring'] },
  { id: 'armor', label: '🛡️ 방어구', slots: ['head', 'top', 'bottom', 'shoes'] },
];
const STYLE_CATS: { id: StyleCat; label: string; slots: CosmeticSlot[] }[] = [
  { id: 'hat', label: '🧢 모자·안경', slots: ['hat', 'glasses'] },
  { id: 'top', label: '👕 상의', slots: ['top'] },
  { id: 'bottom', label: '👖 하의', slots: ['bottom'] },
  { id: 'shoes', label: '👟 신발·가방', slots: ['shoes', 'bag'] },
];

const RARITY: Record<Rarity, { label: string; cls: string }> = {
  common: { label: '일반', cls: 'border-white/20' },
  rare: { label: '희귀', cls: 'border-sky-400/70' },
  epic: { label: '영웅', cls: 'border-fuchsia-400/80' },
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 옷 색·무늬 견본 */
function Swatch({ c }: { c: CosmeticDef }) {
  const a = hex(c.color);
  const b = hex(c.color2 ?? c.color);
  const bg =
    c.pattern === 'stripe'
      ? `repeating-linear-gradient(0deg, ${a} 0 6px, ${b} 6px 10px)`
      : c.pattern === 'check'
        ? `repeating-linear-gradient(90deg, ${b}88 0 5px, transparent 5px 10px), repeating-linear-gradient(0deg, ${b}88 0 5px, ${a} 5px 10px)`
        : c.pattern === 'dot'
          ? `radial-gradient(${b} 2px, ${a} 2.5px) 0 0 / 9px 9px`
          : a;
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20" style={{ background: bg }}>
      <span className="text-xl drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{c.icon}</span>
    </span>
  );
}

const corners: Record<ClothesCorner, { tab: Tab; cat: GearCat | StyleCat }> = {
  weapon: { tab: 'gear', cat: 'weapon' },
  gearAcc: { tab: 'gear', cat: 'gearAcc' },
  armor: { tab: 'gear', cat: 'armor' },
  hat: { tab: 'style', cat: 'hat' },
  top: { tab: 'style', cat: 'top' },
  bottom: { tab: 'style', cat: 'bottom' },
  shoes: { tab: 'style', cat: 'shoes' },
};

/**
 * 옷가게 (진열대·계산대에서 E): 왼쪽 탭 = 전투 장비 (공격력·체력, 가방으로), 오른쪽 탭 = 코디 (겉모습만).
 * 코디는 '입어보기'로 캐릭터에 바로 입혀 본다. 입은 채로 가게를 둘러보고, 계산대에서 입은 옷을 한 번에 계산한다.
 * 창은 화면 오른쪽에 붙어 있어서 입어 본 모습이 뒤로 보인다.
 */
export default function ClothesShopPanel({
  world,
  start,
  onClose,
  onWardrobe,
}: {
  world: CityWorld;
  start: ClothesCorner | 'all';
  onClose: () => void;
  onWardrobe: () => void;
}) {
  const pr = world.profile;
  const first = start === 'all' ? { tab: 'gear' as Tab, cat: 'weapon' as GearCat | StyleCat } : corners[start];
  const [tab, setTab] = useState<Tab>(first.tab);
  const [gearCat, setGearCat] = useState<GearCat>(first.tab === 'gear' ? (first.cat as GearCat) : 'weapon');
  const [styleCat, setStyleCat] = useState<StyleCat>(first.tab === 'style' ? (first.cat as StyleCat) : 'top');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, redraw] = useState(0);
  /** 입어보는 중인 칸 → 옷 id (게임에 남아서, 입은 채 가게 안을 돌아다닌다) */
  const trying = world.trial;
  const setTrying = (f: (t: Partial<Record<CosmeticSlot, string>>) => Partial<Record<CosmeticSlot, string>>) => {
    world.trial = f(world.trial);
    redraw((n) => n + 1);
  };
  const wd = ensureWardrobe(pr);
  const gear = ensureGear(pr);

  const say = (r: { ok: boolean; message: string }) => {
    setMsg({ ok: r.ok, text: r.message });
    redraw((n) => n + 1);
  };

  const GearRow = ({ e }: { e: EquipDef }) => {
    const cur = gear.equipped[e.slot] ? EQUIPS[gear.equipped[e.slot]!] : undefined;
    const dp = Math.round(((e.power ?? 0) - (cur?.power ?? 0)) * 100);
    const dh = (e.hp ?? 0) - (cur?.hp ?? 0);
    const inBag = gear.owned.filter((x) => x === e.id).length;
    const worn = gear.equipped[e.slot] === e.id;
    const afford = pr.gold >= (e.price ?? 0);
    return (
      <div className={`flex items-center gap-3 rounded-lg border bg-white/5 p-2 ${RARITY[e.rarity].cls}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/30 text-2xl">{e.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {e.name} <span className="text-[10px] font-normal text-white/50">{EQUIP_SLOTS.find((s) => s.id === e.slot)!.label} · {RARITY[e.rarity].label}</span>
          </div>
          <div className="text-[11px] text-emerald-300">
            {[e.power ? `⚔️ 공격력 +${Math.round(e.power * 100)}%` : '', e.hp ? `❤️ HP +${e.hp}` : ''].filter(Boolean).join(' · ')}
          </div>
          <div className="text-[10px] text-white/50">
            {worn ? '지금 끼고 있어요' : `지금 장비보다 ${[dp ? `공격력 ${dp > 0 ? '+' : ''}${dp}%` : '', dh ? `HP ${dh > 0 ? '+' : ''}${dh}` : ''].filter(Boolean).join(' · ') || '차이 없음'}`}
            {inBag ? ` · 가방에 ${inBag}개` : ''}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-bold text-amber-300">{e.price!.toLocaleString()}G</span>
          <div className="flex gap-1">
            {inBag > 0 && !worn && (
              <button
                onClick={() => {
                  equipItem(pr, e.id);
                  world.refreshStats();
                  say({ ok: true, message: `${e.icon} ${e.name}을(를) 꼈다!` });
                }}
                className="rounded bg-sky-600 px-2 py-1 text-[11px] font-bold hover:bg-sky-500"
              >
                끼기
              </button>
            )}
            <button
              disabled={!afford}
              onClick={() => say(world.buyGear(e.id))}
              className="rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
            >
              사기
            </button>
          </div>
        </div>
      </div>
    );
  };

  const StyleRow = ({ c }: { c: CosmeticDef }) => {
    const owned = wd.owned.includes(c.id);
    const wearing = wd.worn[c.slot] === c.id;
    const isTrying = trying[c.slot] === c.id;
    const afford = pr.gold >= c.price;
    return (
      <div className={`flex items-center gap-3 rounded-lg border bg-white/5 p-2 ${isTrying ? 'border-amber-300' : 'border-white/15'}`}>
        <Swatch c={c} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {isNewToday(c.id) ? <span className="mr-1 rounded bg-rose-500 px-1 text-[9px] text-white">NEW</span> : /^n\d{8}-/.test(c.id) ? <span className="mr-1 rounded bg-white/15 px-1 text-[9px] text-white/70">신상</span> : null}
            {c.name} <span className="text-[10px] font-normal text-white/50">{COSMETIC_SLOTS.find((s) => s.id === c.slot)!.label}</span>
          </div>
          <div className="truncate text-[11px] text-white/55">{c.desc}</div>
          <div className="text-[10px] text-pink-300">{wearing ? '입고 있어요' : owned ? '가지고 있어요' : '겉모습만 바뀌어요 (능력치 없음)'}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-bold text-amber-300">{owned ? '보유' : `${c.price.toLocaleString()}G`}</span>
          <div className="flex gap-1">
            {!owned && (
              <button
                onClick={() =>
                  setTrying((t) => {
                    const n = { ...t };
                    if (n[c.slot] === c.id) delete n[c.slot];
                    else n[c.slot] = c.id;
                    return n;
                  })
                }
                className={`rounded px-2 py-1 text-[11px] font-bold ${isTrying ? 'bg-amber-300 text-black' : 'bg-white/15 hover:bg-white/25'}`}
              >
                {isTrying ? '벗기' : '입어보기'}
              </button>
            )}
            {owned ? (
              <button
                disabled={wearing}
                onClick={() => {
                  wearCosmetic(pr, c.id);
                  world.refreshStats();
                  setTrying((t) => {
                    const n = { ...t };
                    delete n[c.slot];
                    return n;
                  });
                  say({ ok: true, message: `${c.icon} ${c.name}을(를) 입었다!` });
                }}
                className="rounded bg-pink-500 px-2 py-1 text-[11px] font-bold hover:bg-pink-400 disabled:bg-white/10 disabled:text-white/40"
              >
                {wearing ? '입는 중' : '입기'}
              </button>
            ) : (
              <button
                disabled={!afford}
                onClick={() => {
                  const r = world.buyCosmetic(c.id);
                  // 입어보던 옷을 사면 그대로 입는다
                  if (r.ok && isTrying) {
                    wearCosmetic(pr, c.id);
                    world.refreshStats();
                    setTrying((t) => {
                      const n = { ...t };
                      delete n[c.slot];
                      return n;
                    });
                  }
                  say(r.ok && isTrying ? { ok: true, message: `${r.message} 바로 입었어요 ✨` } : r);
                }}
                className="rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
              >
                사기
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const gearList = SHOP_GEAR.filter((e) => GEAR_CATS.find((c) => c.id === gearCat)!.slots.includes(e.slot));
  const styleList = shopCosmetics().filter((c) => STYLE_CATS.find((s) => s.id === styleCat)!.slots.includes(c.slot));

  // 계산대: 입어본 (안 산) 옷을 한 번에 계산
  const unpaid = world.unpaidTrial();
  const unpaidTotal = unpaid.reduce((s, c) => s + c.price, 0);
  const checkout = () => {
    if (pr.gold < unpaidTotal) {
      say({ ok: false, message: `${(unpaidTotal - pr.gold).toLocaleString()}G 가 모자라요 — 몇 벌 빼고 계산해 보세요` });
      return;
    }
    let n = 0;
    for (const c of unpaid) {
      if (world.buyCosmetic(c.id).ok) {
        wearCosmetic(pr, c.id);
        n++;
      }
    }
    world.trial = {};
    saveProfile(pr);
    say({ ok: true, message: `🧾 ${n}벌 계산 완료! 입은 그대로 나가셔도 돼요 ✨` });
  };
  const atCounter = start === 'all';

  return (
    <div className="pointer-events-auto absolute right-3 top-1/2 z-30 flex max-h-[88vh] w-[460px] max-w-[calc(100%-1.5rem)] -translate-y-1/2 flex-col rounded-xl border border-white/20 bg-zinc-900/95 p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-lg font-bold">✨ {CLOTHES_SHOP_NAME}</div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-amber-300">{pr.gold.toLocaleString()} G</span>
          <button onClick={onClose} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
            닫기 (Esc)
          </button>
        </div>
      </div>
      {unpaid.length > 0 &&
        (atCounter ? (
          <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>🧾 입고 있는 옷 계산</span>
              <span className="text-amber-300">{unpaid.length}벌</span>
            </div>
            <div className="flex flex-col gap-1">
              {unpaid.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-black/30">{c.icon}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-amber-300">{c.price.toLocaleString()}G</span>
                  <button
                    onClick={() =>
                      setTrying((t) => {
                        const n = { ...t };
                        delete n[c.slot];
                        return n;
                      })
                    }
                    className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-red-500/60"
                  >
                    빼기
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={checkout}
              className={`mt-2 w-full rounded-lg py-2 text-sm font-bold ${pr.gold >= unpaidTotal ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-white/10 text-white/50'}`}
            >
              💳 전부 계산하기 · {unpaidTotal.toLocaleString()}G
            </button>
          </div>
        ) : (
          <div className="mb-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
            👀 입어보는 중 {unpaid.length}벌 ({unpaidTotal.toLocaleString()}G) — 입은 채로 둘러보고 <b>계산대</b>에서 한 번에 계산해요
          </div>
        ))}
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm font-bold">
        {(
          [
            ['gear', '⚔️ 전투 장비'],
            ['style', '👗 코디'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-md py-1.5 ${tab === id ? (id === 'gear' ? 'bg-amber-500 text-black' : 'bg-pink-500') : 'text-white/60 hover:bg-white/10'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {tab === 'gear'
          ? GEAR_CATS.map((c) => (
              <button key={c.id} onClick={() => setGearCat(c.id)} className={`rounded-full px-2.5 py-1 text-xs ${gearCat === c.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>
                {c.label}
              </button>
            ))
          : STYLE_CATS.map((c) => (
              <button key={c.id} onClick={() => setStyleCat(c.id)} className={`rounded-full px-2.5 py-1 text-xs ${styleCat === c.id ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>
                {c.label}
              </button>
            ))}
      </div>
      <div className="text-[11px] text-white/50">
        {tab === 'gear' ? '전투 장비: 공격력·체력이 올라요. 사면 가방으로 → 장비창(T) 왼쪽 칸에 껴요.' : '코디: 겉모습만 바뀌어요. 장비와 따로 입어요 → 장비창(T) 오른쪽 코디 칸.'}
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {tab === 'gear' ? gearList.map((e) => <GearRow key={e.id} e={e} />) : styleList.map((c) => <StyleRow key={c.id} c={c} />)}
      </div>
      {msg && <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>{msg.text}</div>}
      <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
        <span>{unpaid.length ? '입은 채로 걸어 다녀 보세요 · 계산 전엔 문밖으로 못 나가요' : '입어보기 → 바로 입혀져요 · 창을 띄운 채로 걸어 다닐 수 있어요'}</span>
        <button onClick={onWardrobe} className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20">
          🚪 탈의실
        </button>
      </div>
    </div>
  );
}
