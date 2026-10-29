import type { HudState } from '@/game/core/match';

function HealthBar({ hp, maxHp, side }: { hp: number; maxHp: number; side: 0 | 1 }) {
  const pct = `${(hp / maxHp) * 100}%`;
  const align = side === 0 ? 'right-0' : 'left-0';
  const low = hp / maxHp < 0.25;
  return (
    <div className="relative h-5 flex-1 overflow-hidden rounded-sm border border-white/30 bg-black/60">
      {/* 데미지 잔상: 늦게 줄어든다 */}
      <div
        className={`absolute top-0 h-full bg-white/70 transition-[width] delay-300 duration-700 ${align}`}
        style={{ width: pct }}
      />
      <div
        className={`absolute top-0 h-full ${align} ${low ? 'bg-red-500' : 'bg-gradient-to-b from-amber-300 to-amber-500'}`}
        style={{ width: pct }}
      />
    </div>
  );
}

function Wins({ wins, side }: { wins: number; side: 0 | 1 }) {
  return (
    <div className={`flex gap-1 ${side === 0 ? 'justify-end' : 'justify-start'}`}>
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rotate-45 border border-amber-300 ${i < wins ? 'bg-amber-300' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
}

export default function Hud({ hud }: { hud: HudState }) {
  const [p1, p2] = hud.fighters;
  const training = hud.mode === 'training';
  const lh = hud.lastHit;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-white">
      {/* 상단: 체력바 + 타이머 */}
      <div className="flex items-start gap-3 px-6 pt-4">
        <div className="flex flex-1 flex-col gap-1">
          <HealthBar hp={p1.hp} maxHp={p1.maxHp} side={0} />
          <div className="flex items-center justify-between text-sm font-bold tracking-wider">
            <span className="text-red-400">{p1.name}</span>
            {!training && <Wins wins={p1.wins} side={0} />}
          </div>
        </div>
        <div className="w-16 rounded border border-white/30 bg-black/60 py-0.5 text-center text-3xl font-black tabular-nums">
          {training ? '∞' : hud.timer}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <HealthBar hp={p2.hp} maxHp={p2.maxHp} side={1} />
          <div className="flex items-center justify-between text-sm font-bold tracking-wider">
            {!training && <Wins wins={p2.wins} side={1} />}
            <span className="text-blue-400">{p2.name}</span>
          </div>
        </div>
      </div>

      {/* 콤보 카운터 */}
      {hud.combo && (
        <div className={`absolute top-28 ${hud.combo.side === 0 ? 'left-8 text-left' : 'right-8 text-right'}`}>
          <div className="text-4xl font-black italic text-amber-300 drop-shadow">{hud.combo.hits} HITS</div>
          <div className="text-lg font-bold text-white/80">{hud.combo.damage} DAMAGE</div>
        </div>
      )}

      {/* 중앙 배너 */}
      {hud.banner && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-7xl font-black italic tracking-widest text-amber-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]">
            {hud.banner}
          </div>
        </div>
      )}

      {/* 프레임 데이터 (개발용) */}
      {lh && (
        <div className="absolute bottom-4 left-4 rounded bg-black/60 px-3 py-2 font-mono text-xs leading-5">
          <div>
            <span className={lh.attacker === 0 ? 'text-red-400' : 'text-blue-400'}>P{lh.attacker + 1}</span>{' '}
            {lh.name} <span className="text-white/50">[{lh.notation}]</span> i{lh.startup}
          </div>
          <div>
            {lh.result === 'block' ? '가드' : lh.result === 'counter' ? <span className="text-red-400">카운터</span> : '히트'}
            {' · '}
            {lh.advantage === null ? '띄움/다운' : `${lh.advantage >= 0 ? '+' : ''}${lh.advantage}F`}
            {lh.damage > 0 && ` · ${lh.damage} dmg`}
          </div>
        </div>
      )}
    </div>
  );
}
