'use client';

import { useEffect, useRef, useState } from 'react';
import { COIN_NAME, INN_MENU } from '@/game/data/inn';
import CoinIcon from './CoinIcon';

/**
 * 달빛 여관 식당 메뉴 (요리사 보리와 이야기한 뒤). 차원 돈(은화)으로만 산다 — 서울 돈 G 는 못 쓴다.
 * 숫자 키 1~4 로도 고른다 (FieldView 가 넘겨준다)
 */
export default function InnMenuPanel({
  coin,
  hunger,
  fatigue,
  onBuy,
  onClose,
  touch,
}: {
  coin: number;
  hunger: number;
  fatigue: number;
  onBuy: (id: string) => { ok: boolean; message: string };
  onClose: () => void;
  touch: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const buy = (id: string) => {
    const r = onBuy(id);
    setMsg({ ok: r.ok, text: r.message });
  };
  const keys = useRef({ buy, onClose });
  keys.current = { buy, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (k >= 0 && INN_MENU[k]) keys.current.buy(INN_MENU[k].id);
      if (e.code === 'Escape') keys.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-3" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-amber-200/30 bg-[#24170f]/95 p-4 text-amber-50 shadow-[0_0_40px_rgba(217,180,92,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="text-lg font-black">🍲 달빛 여관 식당</div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-amber-100/70 hover:bg-white/10 hover:text-white">
            닫기{!touch && ' (Esc)'}
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
          <span className="text-amber-100/70">
            배고픔 <b className="text-orange-300">{hunger}</b> · 피로도 <b className="text-violet-300">{fatigue}</b>
          </span>
          <span className="font-black tabular-nums text-slate-100"><CoinIcon /> {coin.toLocaleString()} {COIN_NAME}</span>
        </div>
        <ul className="space-y-1.5">
          {INN_MENU.map((m, i) => {
            const poor = coin < m.price;
            return (
              <li key={m.id}>
                <button
                  onClick={() => buy(m.id)}
                  disabled={poor}
                  className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-amber-300/15 disabled:opacity-45 disabled:hover:bg-white/5"
                >
                  <span className="text-2xl">{m.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">
                      {m.name}
                      {!touch && <span className="ml-1 text-xs font-normal text-amber-100/45">({i + 1})</span>}
                    </span>
                    <span className="block truncate text-xs text-amber-100/60">
                      {m.desc} · 배고픔 -{m.hunger}
                      {m.fatigue > 0 && ` · 피로도 -${m.fatigue}`}
                      {m.hp && ' · HP 가득'}
                    </span>
                  </span>
                  <span className="shrink-0 font-black tabular-nums text-slate-100">
                    {m.price} {COIN_NAME}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {msg && <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-lime-400/10 text-lime-200' : 'bg-red-400/10 text-red-200'}`}>{msg.text}</div>}
        <div className="mt-3 text-[11px] leading-4 text-amber-100/45">은화는 차원에서 몬스터를 잡아 버는 돈이에요. 서울 돈(G)은 여기서 쓸 수 없어요.</div>
      </div>
    </div>
  );
}
