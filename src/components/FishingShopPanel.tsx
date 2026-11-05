'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { BAITS, BASKET_MAX, FISHING_SHOP_NAME, FISH_BY_ID, RODS, TIER_INFO, fmtKg, sellPrice } from '@/game/data/fishing';

export type FishShopTab = 'all' | 'rods' | 'bait' | 'sell';

/**
 * 낚시마트 계산대: 낚싯대 · 미끼 사기, 살림망의 물고기 팔기.
 */
export default function FishingShopPanel({ world, start = 'all', onClose, onGuide }: { world: CityWorld; start?: FishShopTab; onClose: () => void; onGuide: () => void }) {
  const fs = world.fishingState;
  const [tab, setTab] = useState<Exclude<FishShopTab, 'all'>>(start === 'all' ? (fs.basket.length ? 'sell' : fs.rods.length ? 'bait' : 'rods') : start);
  const [msg, setMsg] = useState(fs.basket.length ? '오, 많이 잡아 왔네요? 계산해 드릴게요~' : fs.rods.length ? '미끼 떨어졌어요? 오늘 지렁이 싱싱해요!' : '낚시 처음이에요? 대나무 낚싯대에 지렁이면 충분해요!');
  const [, redraw] = useState(0);
  const run = (r: { message: string }) => {
    setMsg(r.message);
    redraw((n) => n + 1);
  };
  const gold = world.profile.gold;
  const total = fs.basket.reduce((s, c) => s + sellPrice(FISH_BY_ID[c.id], c.kg), 0);
  const btn = 'rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40';
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-sky-300/30 bg-zinc-900/95 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-300/15 text-3xl">🧔</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-sky-200/80">{FISHING_SHOP_NAME} · 강태공 사장님</div>
            <div className="mt-0.5 truncate text-base">“{msg}”</div>
          </div>
          <div className="shrink-0 text-right text-sm text-amber-300">{gold.toLocaleString()} G</div>
          <button onClick={onClose} className="rounded px-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기">
            ✕ <span className="text-[10px]">(Esc)</span>
          </button>
        </div>
        <div className="flex gap-1 border-b border-white/10 px-4 pt-3">
          {(
            [
              ['rods', '🎣 낚싯대'],
              ['bait', '🐛 미끼'],
              ['sell', `🐟 물고기 팔기 (${fs.basket.length})`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === id ? 'bg-sky-400/20 text-sky-200' : 'text-white/60 hover:text-white'}`}>
              {label}
            </button>
          ))}
          <button onClick={onGuide} className="ml-auto rounded-t-lg px-3 py-2 text-xs text-white/60 hover:text-white">
            📖 도감 · 확률 (F)
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {tab === 'rods' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RODS.map((r) => {
                const own = fs.rods.includes(r.id);
                return (
                  <div key={r.id} className={`rounded-lg border p-3 ${fs.rod === r.id ? 'border-sky-300 bg-sky-400/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-bold">
                        {r.icon} {r.name}
                      </div>
                      <div className="text-amber-300">{r.price.toLocaleString()}G</div>
                    </div>
                    <div className="mt-1 text-xs text-white/60">{r.desc}</div>
                    <div className="mt-1 text-xs">
                      힘 <b>×{r.power}</b> · 줄 강도 <b>×{r.line}</b> · 행운 <b>+{Math.round(r.luck * 100)}%</b> · 던지기 {r.cast}m
                    </div>
                    <button
                      disabled={own ? fs.rod === r.id : gold < r.price}
                      onClick={() => run(world.buyRod(r.id))}
                      className={`${btn} mt-2 w-full ${own ? 'bg-white/10 hover:bg-white/20' : 'bg-sky-500 text-black hover:bg-sky-400'}`}
                    >
                      {own ? (fs.rod === r.id ? '쓰는 중' : '이걸로 바꾸기') : gold < r.price ? `${(r.price - gold).toLocaleString()}G 모자람` : '사기'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'bait' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BAITS.map((b) => {
                const n = fs.bait[b.id] ?? 0;
                return (
                  <div key={b.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold">
                        {b.icon} {b.name} <span className="text-xs font-normal text-white/50">{b.reusable ? (n ? `보유 ${n}` : '') : `가진 것 ${n}개`}</span>
                      </div>
                      <div className="text-amber-300">
                        {b.pack > 1 ? `${b.pack}개 ` : ''}
                        {b.price}G
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-white/60">{b.desc}</div>
                    <div className="mt-1 text-xs">
                      입질 속도 ×{(1 / b.speed).toFixed(2)} · 행운 +{Math.round(b.luck * 100)}%
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[1, 5].map((k) => (
                        <button key={k} disabled={gold < b.price * k} onClick={() => run(world.buyBait(b.id, k))} className={`${btn} flex-1 bg-sky-500 text-black hover:bg-sky-400`}>
                          {k > 1 ? `${k}묶음 ${(b.price * k).toLocaleString()}G` : '사기'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'sell' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-white/70">
                  살림망 {fs.basket.length}/{BASKET_MAX}마리 · 합계 <b className="text-amber-300">{total.toLocaleString()}G</b>
                </span>
                <button disabled={!fs.basket.length} onClick={() => run(world.sellFish())} className={`${btn} bg-amber-400 text-black hover:bg-amber-300`}>
                  전부 팔기
                </button>
              </div>
              {!fs.basket.length && <div className="py-6 text-center text-white/50">살림망이 비었어요. 한강 낚시 데크에서 잡아 오세요 🎣</div>}
              {fs.basket.map((c, i) => {
                const f = FISH_BY_ID[c.id];
                if (!f) return null;
                return (
                  <div key={`${i}-${c.id}-${c.kg}`} className="flex items-center gap-2 rounded bg-white/5 px-3 py-1.5" style={{ borderLeft: `3px solid ${TIER_INFO[f.tier].color}` }}>
                    <span className="text-xl">{f.icon}</span>
                    <span className="flex-1">
                      {f.name} <span className="text-white/50">{fmtKg(c.kg)}</span> <span className="text-[11px]" style={{ color: TIER_INFO[f.tier].color }}>{TIER_INFO[f.tier].label}</span>
                    </span>
                    <span className="tabular-nums text-amber-300">{sellPrice(f, c.kg).toLocaleString()}G</span>
                    <button onClick={() => run(world.sellFish(i))} className={`${btn} bg-white/10 hover:bg-white/20`}>
                      팔기
                    </button>
                    <button
                      onClick={() => {
                        world.releaseFish(i);
                        run({ message: `${f.icon} ${f.name}을(를) 한강으로 돌려보냈어요. 잘 가~` });
                      }}
                      className={`${btn} text-white/50 hover:bg-white/10`}
                    >
                      놓아주기
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
