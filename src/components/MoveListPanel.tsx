'use client';

import { PLAYER_MOVE_LIST, playerStartup } from '@/game/data/moves';
import { punishableMoves } from '@/game/core/punishCheck';

const LEVEL: Record<string, [string, string]> = {
  high: ['상단', 'text-sky-300'],
  mid: ['중단', 'text-amber-300'],
  low: ['하단', 'text-rose-300'],
};

export { notationArrows } from '@/game/data/notation';
import { notationArrows } from '@/game/data/notation';

/** 경기 중 일시정지 메뉴에서 여는 기술표 */
export default function MoveListPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-white/20 bg-zinc-900/95 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-lg font-bold">기술표</div>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
            닫기
          </button>
        </div>
        <div className="px-4 pt-2 text-[11px] text-white/55">
          1 왼손 · 2 오른손 · 3 왼발 · 4 오른발 · 화살표는 상대 쪽이 → 기준. ⚠ = 막히면 반격당해요 (멀리 밀어내는 기술은 손해가 커도 안전). 잡기는 앉아서 피하거나, 잡히는 순간 1·2 를 눌러 풀어요.
        </div>
        <div className="overflow-y-auto px-4 pb-4">
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-[11px] text-white/45">
              <tr>
                <th className="py-1 pr-2 font-normal">커맨드</th>
                <th className="py-1 pr-2 font-normal">기술</th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">판정</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-normal">발생</th>
                <th className="whitespace-nowrap py-1 text-right font-normal">가드시</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const punishable = punishableMoves();
                return PLAYER_MOVE_LIST.map((m) => {
                const [lv, lvColor] = LEVEL[m.level] ?? [m.level, ''];
                // 손해 숫자가 아니라 실제로 막혀 봤을 때 반격당하는지 (멀리 밀어내면 손해가 커도 안전)
                const risky = punishable[m.id] === true;
                return (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-amber-300">{notationArrows(m.notation)}</td>
                    <td className="py-1.5 pr-2">{m.name}</td>
                    <td className={`whitespace-nowrap py-1.5 pr-2 text-xs ${lvColor}`}>{lv}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-xs text-white/60">{playerStartup(m)}F</td>
                    <td className={`whitespace-nowrap py-1.5 text-right font-mono text-xs ${risky ? 'text-red-400' : m.onBlock >= 0 ? 'text-emerald-300' : 'text-white/60'}`}>
                      {m.onBlock > 0 ? `+${m.onBlock}` : m.onBlock}
                      {risky && ' ⚠'}
                    </td>
                  </tr>
                );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
