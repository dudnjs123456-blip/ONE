'use client';

import type { CityWorld } from '@/game/city/cityWorld';
import { PC_ROOM_FEE } from '@/game/city/cityWorld';

export type PcGame = 'cpu' | 'training' | 'boss' | 'field';

const GAMES: { id: PcGame; icon: string; label: string; desc: string }[] = [
  { id: 'cpu', icon: '🥊', label: 'IRON FIST · VS CPU', desc: '컴퓨터와 3판 2선승 · 랭크 올리기' },
  { id: 'training', icon: '🎯', label: 'IRON FIST · 연습 모드', desc: '허수아비·콤보 시연·연습 과제' },
  { id: 'boss', icon: '👹', label: '보스 레이드', desc: '강력한 보스와 1:1' },
  { id: 'field', icon: '⚔️', label: '필드 사냥', desc: '자동사냥으로 레벨업' },
];

/** PC방 (E): 이용료를 내고 격투·RPG 모드를 한다. 끝나면 서울 PC방 앞으로 돌아온다 */
export default function PcRoomPanel({ world, onPlay, onClose }: { world: CityWorld; onPlay: (g: PcGame) => void; onClose: () => void }) {
  const gold = world.profile.gold;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-3" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-cyan-300/30 bg-[#0b1230]/95 p-4 text-white shadow-[0_0_30px_rgba(34,211,238,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="text-lg font-black text-cyan-300">🖥️ PC방</div>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
            나가기
          </button>
        </div>
        <div className="mb-3 text-xs text-white/55">
          한 판 {PC_ROOM_FEE} G · 💰 {gold.toLocaleString()} G · 끝나면 다시 여기로 돌아와요
        </div>
        <div className="space-y-1.5">
          {GAMES.map((g) => (
            <button
              key={g.id}
              disabled={gold < PC_ROOM_FEE}
              onClick={() => {
                if (world.spendGold(PC_ROOM_FEE)) onPlay(g.id);
              }}
              className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-left hover:bg-cyan-500/20 disabled:opacity-40"
            >
              <span className="text-2xl">{g.icon}</span>
              <span className="flex-1">
                <span className="block text-sm font-bold">{g.label}</span>
                <span className="block text-[11px] text-white/55">{g.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
