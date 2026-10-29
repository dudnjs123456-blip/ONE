import type { PlayerProfile } from '@/game/core/profile';
import { BOSSES, type BossDef } from '@/game/data/bosses';
import { MOVES } from '@/game/data/moves';

const LEVEL_LABEL = { high: '상단', mid: '중단', low: '하단' } as const;

export default function BossSelect({
  profile,
  onSelect,
  onBack,
}: {
  profile: PlayerProfile;
  onSelect: (boss: BossDef) => void;
  onBack: () => void;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1a0709] via-[#0f0507] to-black px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            ← 메인 메뉴
          </button>
          <div className="text-sm text-white/70">
            현재 <span className="font-bold text-amber-300">Lv.{profile.level}</span> · {profile.gold.toLocaleString()} G
          </div>
        </div>

        <h1 className="mt-6 text-center text-5xl font-black italic text-red-400">BOSS RAID</h1>
        <p className="mt-2 text-center text-sm text-white/50">
          수동 조작 1:1 · 필드에서 올린 레벨이 그대로 적용됩니다
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {BOSSES.map((b) => {
            const under = profile.level < b.recommendedLevel;
            const clears = profile.bossClears[b.id] ?? 0;
            const patterns = [...new Set([...b.moves, ...b.enrageMoves].map((m) => m.id))].map((id) => MOVES[id]);
            return (
              <div key={b.id} className="flex flex-col rounded-xl border border-red-300/15 bg-white/[0.04] p-5">
                <div className="text-xs text-white/50">{b.title}</div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: `#${b.color.toString(16).padStart(6, '0')}` }} />
                  <span className="text-2xl font-black">{b.name}</span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">권장 레벨</span>
                    <span className={under ? 'font-bold text-red-400' : 'text-emerald-300'}>Lv.{b.recommendedLevel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">체력 · 제한시간</span>
                    <span>
                      {b.maxHp} · {b.timeLimit}초
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">보상</span>
                    <span>
                      {b.reward.exp} EXP · {b.reward.gold} G
                    </span>
                  </div>
                  {clears === 0 ? (
                    <div className="text-right text-xs text-amber-300">
                      최초 클리어 +{b.firstClearBonus.exp} EXP · +{b.firstClearBonus.gold} G
                    </div>
                  ) : (
                    <div className="text-right text-xs text-white/50">클리어 {clears}회</div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {patterns.map((m) => (
                    <span
                      key={m.id}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${m.armor ? 'bg-red-500/25 text-red-200' : 'bg-white/10 text-white/70'}`}
                    >
                      {m.name.replace(/ \(.*\)/, '')} {LEVEL_LABEL[m.level]}
                      {m.armor && ' · 아머'}
                    </span>
                  ))}
                </div>

                <p className="mt-3 flex-1 text-xs leading-5 text-white/60">💡 {b.tip}</p>

                <button
                  onClick={() => onSelect(b)}
                  className={`mt-4 rounded-lg py-2.5 font-bold transition ${
                    under ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-400'
                  }`}
                >
                  {under ? '도전 (레벨 부족)' : '도전'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
