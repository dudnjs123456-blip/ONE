import type { FieldHudState } from '@/game/core/field';
import { LifeBars } from './LifeBar';
import { bindLabel } from '@/game/core/keybinds';

function Bar({ value, max, color, height = 'h-3' }: { value: number; max: number; color: string; height?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-sm bg-black/60 ${height}`}>
      <div className={`absolute inset-y-0 left-0 transition-[width] duration-200 ${color}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

export default function FieldHud({ hud, onToggleAuto }: { hud: FieldHudState; onToggleAuto: () => void }) {
  const t = hud.target;
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {/* 내 정보 */}
      <div className="absolute left-4 top-4 w-72 rounded-lg border border-white/15 bg-black/50 p-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-black">
            <span className="text-amber-300">Lv.{hud.level}</span> PLAYER
          </span>
          <span className="text-sm text-amber-200">{hud.gold.toLocaleString()} G</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="w-7 font-bold text-red-300">HP</span>
          <Bar value={hud.hp} max={hud.maxHp} color="bg-gradient-to-r from-red-600 to-red-400" />
          <span className="w-16 text-right tabular-nums">
            {hud.hp}/{hud.maxHp}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="w-7 font-bold text-lime-300">EXP</span>
          <Bar value={hud.exp} max={hud.expNext} color="bg-lime-400" height="h-2" />
          <span className="w-16 text-right tabular-nums">{Math.floor((hud.exp / hud.expNext) * 100)}%</span>
        </div>
        <div className="mt-1 text-xs text-white/60">처치 {hud.kills}</div>
        <LifeBars fatigue={hud.fatigue} hunger={hud.hunger} />
      </div>

      {/* 타겟 */}
      {t && (
        <div className="absolute left-1/2 top-4 w-80 -translate-x-1/2 rounded-lg border border-red-400/30 bg-black/50 px-3 py-2 backdrop-blur-sm">
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span>
              <span className="text-red-300">Lv.{t.level}</span> {t.name}
            </span>
            <span className="tabular-nums text-white/70">
              {t.hp}/{t.maxHp}
            </span>
          </div>
          <Bar value={t.hp} max={t.maxHp} color="bg-red-500" />
        </div>
      )}

      {/* 로그 */}
      <div className="absolute bottom-28 left-4 w-80 space-y-0.5 text-xs">
        {hud.log.map((l) => (
          <div key={l.id} className="rounded bg-black/40 px-2 py-0.5 text-white/85">
            {l.text}
          </div>
        ))}
      </div>

      {/* AUTO 버튼 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={onToggleAuto}
          className={`pointer-events-auto flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 font-black transition ${
            hud.auto
              ? 'animate-pulse border-amber-300 bg-amber-500/90 text-black shadow-[0_0_30px_rgba(251,191,36,0.8)]'
              : 'border-white/40 bg-black/60 text-white/70 hover:bg-black/80'
          }`}
        >
          <span className="text-lg leading-none">AUTO</span>
          <span className="text-[10px] font-bold opacity-70">{hud.auto ? 'ON' : 'OFF'} · Z</span>
        </button>
      </div>

      {!hud.auto && (
        <div className="absolute bottom-6 right-4 rounded bg-black/50 px-3 py-2 text-xs leading-5 text-white/80">
          <div>방향키 이동 · {bindLabel('b1')} 왼팔 · {bindLabel('b2')} 오른팔 · {bindLabel('b3')} 왼다리 · {bindLabel('b4')} 오른다리</div>
          <div>{bindLabel('run')} = 아래 ({bindLabel('run')}+앞+{bindLabel('b2')} = 어퍼)</div>
          <div>방향키 두 번 톡 = 대시 (대시 중 {bindLabel('b2')}/{bindLabel('b4')} = 대시기) · {bindLabel('jump')} 점프 · Ctrl+휠 줌</div>
        </div>
      )}

      {hud.dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
          <div className="text-5xl font-black text-red-400">사망했습니다</div>
          <div className="mt-3 text-white/80">{hud.respawnIn}초 후 마을에서 부활합니다</div>
        </div>
      )}
    </div>
  );
}
