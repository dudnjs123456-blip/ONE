'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';

/**
 * 음식점 주인과의 대화창. 선택지로 대화하고, 메뉴에서 지금 가진 골드로 음식을 산다.
 * 결과(골드·배고픔)는 CityWorld 가 프로필에 반영한다.
 */
export default function ShopDialog({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const shop = world.shop!;
  const [line, setLine] = useState(() => world.greeting());
  const [page, setPage] = useState<'talk' | 'menu'>('talk');
  const [, rerender] = useState(0);
  const pr = world.profile;

  const buy = (id: string) => {
    const r = world.buyFood(id);
    setLine(r.message);
    rerender((n) => n + 1);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-200/30 bg-zinc-900/95 text-white shadow-2xl backdrop-blur">
        {/* 주인 + 대사 */}
        <div className="flex gap-4 border-b border-white/10 p-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-amber-200/10 text-4xl">{shop.face}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-amber-200/80">
              {shop.sign} · <span className="font-bold text-amber-200">{shop.keeper}</span>
            </div>
            <div className="mt-1 text-lg leading-snug">“{line}”</div>
          </div>
          <div className="shrink-0 text-right text-sm">
            <div className="text-amber-300">{pr.gold.toLocaleString()} G</div>
            <div className="mt-1 text-xs text-white/60">배고픔 {Math.round(pr.life.hunger)}</div>
            <div className="text-xs text-white/60">피로도 {Math.round(pr.life.fatigue)}</div>
          </div>
        </div>

        {page === 'talk' ? (
          <div className="grid grid-cols-2 gap-2 p-4 text-sm">
            <Choice onClick={() => setPage('menu')}>🍽️ 메뉴 보여주세요</Choice>
            <Choice onClick={() => setLine(shop.recommend)}>👍 추천 메뉴는요?</Choice>
            <Choice onClick={() => setLine(world.gossip())}>💬 요즘 동네 어때요?</Choice>
            <Choice
              onClick={() => {
                world.closeDialog();
                onClose();
              }}
            >
              👋 그냥 갈게요
            </Choice>
          </div>
        ) : (
          <div className="p-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {shop.menu.map((m) => {
                const afford = pr.gold >= m.price;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => buy(m.id)}
                      disabled={!afford}
                      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-amber-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="text-2xl">{m.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between font-bold">
                          <span>{m.name}</span>
                          <span className="text-amber-300">{m.price}G</span>
                        </span>
                        <span className="block text-xs text-white/55">
                          {m.desc} · 배고픔 -{m.hunger}
                          {m.fatigue ? ` · 피로도 -${m.fatigue}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button onClick={() => setPage('talk')} className="mt-3 text-sm text-white/60 hover:text-white">
              ← 대화로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Choice({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-left transition hover:border-amber-300 hover:bg-white/10">
      {children}
    </button>
  );
}
