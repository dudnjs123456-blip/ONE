import type { PlayerProfile } from '@/game/core/profile';
import { ITEMS } from '@/game/data/items';
import { PET_GOOD_BY_ID } from '@/game/data/pets';
import CoinIcon from './CoinIcon';

/** I 키로 여닫는 인벤토리: 골드와 주운 물건 */
export default function InventoryPanel({ profile, onClose, dimension = false }: { profile: PlayerProfile; onClose: () => void; /** 다른 차원: 은화를 크게, 서울 돈은 작게 (차원에선 못 쓴다) */ dimension?: boolean }) {
  const items = Object.entries(profile.inventory ?? {}).filter(([, n]) => n > 0);
  return (
    <div className="absolute right-4 top-48 w-80 rounded-xl border border-white/20 bg-zinc-900/90 p-4 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-lg font-bold">🎒 인벤토리</div>
        <button onClick={onClose} className="rounded px-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기">
          ✕ <span className="text-[10px]">(I)</span>
        </button>
      </div>
      {dimension ? (
        <div className="mb-3 rounded-lg bg-slate-300/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-200"><CoinIcon /> 은화 (차원 돈)</span>
            <span className="text-lg font-black tabular-nums text-slate-100">{(profile.dimension?.coin ?? 0).toLocaleString()} 은화</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-white/45">
            <span>서울 지갑 (차원에선 못 써요)</span>
            <span className="tabular-nums">{profile.gold.toLocaleString()} G</span>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-amber-400/10 px-3 py-2">
          <span className="text-sm text-amber-200">골드</span>
          <span className="text-lg font-black tabular-nums text-amber-300">{profile.gold.toLocaleString()} G</span>
        </div>
      )}
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-white/50">아직 가진 물건이 없다</div>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5">
          {items.map(([id, n]) => {
            const it = ITEMS[id] ?? PET_GOOD_BY_ID[id];
            if (!it) return null;
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                <span className="text-2xl">{it.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold">{it.name}</span>
                    <span className="text-sm tabular-nums text-white/70">×{n}</span>
                  </div>
                  <div className="truncate text-xs text-white/50">{it.desc}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
