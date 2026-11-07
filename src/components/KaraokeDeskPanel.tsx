'use client';

import { useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { SONG_PACKS, SONG_PRICE } from '@/game/city/karaoke';
import { playCoin } from '@/game/render/sfx';

/**
 * 코인노래방 카운터: 사장님이 빈방을 확인해 주고, 몇 곡 부를지 고르면 그만큼 결제하고 방을 내준다.
 * 이미 방을 빌렸으면 그 방에 곡만 더 넣는다. 친구가 쓰는 방은 '사용 중'.
 */
export default function KaraokeDeskPanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const [, redraw] = useState(0);
  const rent = world.karaokeRental;
  const states = world.boothStates();
  const firstFree = states.find((s) => s.state === 'free')?.no ?? null;
  const [room, setRoom] = useState<number | null>(rent?.room ?? firstFree);
  const [pack, setPack] = useState(2);
  const [msg, setMsg] = useState<string | null>(null);
  const pickRoom = rent?.room ?? room;

  const pay = () => {
    if (pickRoom === null) return setMsg('빈방이 없어요 — 잠시 뒤 다시 와 주세요');
    const r = world.rentKaraoke(pickRoom, pack);
    setMsg(r.message);
    if (r.ok) {
      playCoin();
      redraw((n) => n + 1);
      window.setTimeout(onClose, 900);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-fuchsia-400/40 bg-[#14061f]/95 p-4 text-white shadow-[0_0_30px_rgba(217,70,239,0.35)]">
        <div className="mb-1 flex items-center gap-2">
          <div className="text-lg font-black text-fuchsia-300">🎤 코인노래방 카운터</div>
          <span className="ml-auto rounded-full bg-black/40 px-3 py-0.5 text-sm font-bold text-amber-200">💰 {world.profile.gold.toLocaleString()} G</span>
        </div>
        <div className="mb-3 text-xs text-white/60">{rent ? `사장님: "${rent.room}번방 쓰고 계시죠~ 남은 곡 ${rent.songs}곡이에요. 더 넣어 드릴까요?"` : '사장님: "어서 오세요~ 빈방 확인해 드릴게요. 몇 곡 부르실래요?"'}</div>

        <div className="mb-1 text-xs font-bold text-white/70">1. 방 고르기</div>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {states.map((s) => {
            const picked = pickRoom === s.no;
            const can = !rent && s.state === 'free';
            return (
              <button
                key={s.no}
                disabled={!can && !picked}
                onClick={() => can && setRoom(s.no)}
                className={`rounded-lg border px-1 py-2 text-center text-xs ${
                  picked ? 'border-fuchsia-300 bg-fuchsia-600/70 font-bold' : s.state === 'taken' ? 'border-white/10 bg-white/5 text-white/35' : 'border-white/15 bg-white/10 hover:bg-white/20'
                }`}
              >
                <div className="text-base font-black">{s.no}번방</div>
                <div className="truncate text-[10px]">{s.state === 'mine' ? '내 방' : s.state === 'taken' ? `사용 중 · ${s.by}` : '빈방'}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-1 text-xs font-bold text-white/70">2. 몇 곡 부를까요? (한 곡 {SONG_PRICE}G · 많이 사면 할인)</div>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {SONG_PACKS.map((p, i) => (
            <button
              key={p.songs}
              onClick={() => setPack(i)}
              className={`rounded-lg border px-1 py-2 text-center ${pack === i ? 'border-amber-300 bg-amber-500/80 font-bold text-black' : 'border-white/15 bg-white/10 hover:bg-white/20'}`}
            >
              <div className="text-sm font-black">{p.songs}곡</div>
              <div className="text-[11px]">{p.price}G</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={pay} disabled={pickRoom === null} className="flex-1 rounded-lg bg-fuchsia-600 py-2 text-sm font-black hover:bg-fuchsia-500 disabled:opacity-40">
            {rent ? `${SONG_PACKS[pack].songs}곡 추가 · ${SONG_PACKS[pack].price}G` : pickRoom === null ? '빈방이 없어요' : `${pickRoom}번방 · ${SONG_PACKS[pack].songs}곡 · ${SONG_PACKS[pack].price}G 결제`}
          </button>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            닫기
          </button>
        </div>
        {msg && <div className="mt-2 rounded bg-black/50 px-2 py-1 text-center text-xs text-amber-200">{msg}</div>}
        <div className="mt-2 text-[10px] text-white/40">노래방을 나가면 안 부른 곡 값은 돌려드려요. 방 안 노래방 기계에서 노래를 고르세요.</div>
      </div>
    </div>
  );
}
