import type { FieldHudState } from '@/game/core/field';
import { LifeBars } from './LifeBar';
import CoinIcon from './CoinIcon';
import { bindLabel } from '@/game/core/keybinds';

function Bar({ value, max, color, height = 'h-3' }: { value: number; max: number; color: string; height?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-sm bg-black/60 ${height}`}>
      <div className={`absolute inset-y-0 left-0 transition-[width] duration-200 ${color}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

/** @param touch 터치 조작 화면: 로그를 위로 올리고 키 설명은 숨김 */
export default function FieldHud({
  hud,
  onToggleAuto,
  touch = false,
  portrait = false,
}: {
  hud: FieldHudState;
  onToggleAuto: () => void;
  touch?: boolean;
  /** 폰 세로 화면: 정보 칸을 위아래로 쌓는다 (옆으로 놓을 폭이 없음) */
  portrait?: boolean;
}) {
  const tall = touch && portrait;
  // 폰 세로: 이번 사냥 요약이 보이면 내 정보 칸이 길어지므로 타겟·로그를 그만큼 내린다
  const grown = tall && hud.session.kills > 0;
  const t = hud.target;
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {/* 내 정보 */}
      <div className={`absolute left-4 top-4 rounded-lg border border-white/15 bg-black/50 p-3 backdrop-blur-sm ${touch ? 'w-64' : 'w-72'}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-black">
            <span className="text-amber-300">Lv.{hud.level}</span> {hud.party.find((m) => m.active)?.name ?? '나'}
          </span>
          <span className="text-sm text-slate-100" title="차원 돈 (서울 돈 G 와 따로, 차원 안에서만 써요)"><CoinIcon /> {hud.coin.toLocaleString()} 은화</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="w-7 font-bold text-red-300">HP</span>
          <Bar value={hud.hp} max={hud.maxHp} color="bg-gradient-to-r from-red-600 to-red-400" />
          <span className="w-16 text-right tabular-nums">
            {hud.hp}/{hud.maxHp}
          </span>
        </div>
        {/* 태그 파티: 쉬고 있는 동료 체력 (Tab 으로 교대) */}
        {hud.party.length > 1 && (
          <div className="mt-1 space-y-0.5">
            {hud.party
              .filter((m) => !m.active)
              .map((m) => (
                <div key={m.id} className={`flex items-center gap-2 text-[11px] ${m.hp > 0 ? 'text-white/75' : 'text-white/35'}`}>
                  <span className="w-14 truncate">{m.hp > 0 ? '⇄' : '✖'} {m.name}</span>
                  <Bar value={m.hp} max={m.maxHp} color="bg-sky-400/80" height="h-1.5" />
                  <span className="w-16 text-right tabular-nums">{m.hp > 0 ? `${m.hp}/${m.maxHp}` : '쓰러짐'}</span>
                </div>
              ))}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="w-7 font-bold text-lime-300">EXP</span>
          <Bar value={hud.exp} max={hud.expNext} color="bg-lime-400" height="h-2" />
          <span className="w-16 text-right tabular-nums">{Math.floor((hud.exp / hud.expNext) * 100)}%</span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-white/60">
          <span>처치 {hud.kills}</span>
          {hud.inInn ? <span className="text-amber-200">🏠 달빛 여관 · 안전</span> : hud.inVillage ? <span className="text-amber-200">🏘️ 경계 마을 · 안전</span> : <span className="text-violet-200">⚔️ 사냥터</span>}
        </div>
        {hud.others.length > 0 && (
          <div className="mt-1 truncate text-[11px] text-cyan-200/90" title={hud.others.map((o) => `Lv.${o.level} ${o.name}`).join(', ')}>
            🌀 같은 차원 {hud.others.length}명 · {hud.others.map((o) => o.name).join(', ')}
          </div>
        )}
        {hud.session.kills > 0 && (
          <div className="mt-1 rounded bg-white/5 px-2 py-1 text-[11px] leading-4 text-white/75">
            <span className="text-white/50">이번 사냥 {Math.floor(hud.session.seconds / 60)}분</span> · 처치 {hud.session.kills}
            {hud.session.deaths > 0 && <span className="text-red-300"> · 사망 {hud.session.deaths}</span>}
            <br />
            <span className="text-lime-300">+{hud.session.exp.toLocaleString()} EXP</span> · <span className="text-slate-100">+{hud.session.coin.toLocaleString()} 은화</span>
            {hud.session.seconds >= 60 && (
              <span className="text-white/45"> (분당 {Math.round((hud.session.exp * 60) / hud.session.seconds)} EXP)</span>
            )}
          </div>
        )}
        <LifeBars fatigue={hud.fatigue} hunger={hud.hunger} dirt={hud.dirt} />
      </div>

      {/* 타겟 */}
      {t && (
        <div className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-red-400/30 bg-black/50 px-3 py-2 backdrop-blur-sm ${tall ? `!left-4 w-60 !translate-x-0 ${grown ? 'top-[15rem]' : 'top-[13.5rem]'}` : touch ? 'w-60' : 'w-80'}`}>
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
      <div className={`absolute w-72 space-y-0.5 text-xs ${tall ? (grown ? 'left-4 top-[20rem]' : 'left-4 top-[18.5rem]') : touch ? 'left-1/2 top-24 -translate-x-1/2' : 'bottom-28 left-4'}`}>
        {(touch ? hud.log.slice(-2) : hud.log).map((l) => (
          <div key={l.id} className="rounded bg-black/40 px-2 py-0.5 text-white/85">
            {l.text}
          </div>
        ))}
      </div>

      {/* AUTO 버튼 */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${tall ? 'bottom-48' : 'bottom-6'}`}>
        <button
          onClick={onToggleAuto}
          className={`pointer-events-auto flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 font-black transition ${
            hud.auto
              ? 'animate-pulse border-amber-300 bg-amber-500/90 text-black shadow-[0_0_30px_rgba(251,191,36,0.8)]'
              : 'border-white/40 bg-black/60 text-white/70 hover:bg-black/80'
          }`}
        >
          <span className="text-lg leading-none">AUTO</span>
          <span className="text-[10px] font-bold opacity-70">{hud.auto ? 'ON' : 'OFF'}{!touch && ' · Z'}</span>
        </button>
      </div>

      {!hud.auto && !touch && (
        <div className="absolute bottom-6 right-4 rounded bg-black/50 px-3 py-2 text-xs leading-5 text-white/80">
          <div>방향키 걷기 · {bindLabel('run')}+방향키 달리기 · {bindLabel('jump')} 점프 · 방향키 두 번 톡 = 대시</div>
          <div>Ctrl 공격 (주먹·발차기 중 하나) · Q W E R 주 근 기술 · A S D 부 근 기술 · F 말 걸기</div>
          <div>Z 자동사냥 · G 퀘스트 자동진행 · I 가방 · T 장비 · Ctrl+휠 줌{hud.party.length > 1 && ' · Tab 교대'}</div>
        </div>
      )}

      {hud.tagging && (
        <div className="absolute inset-x-0 top-1/3 text-center text-2xl font-black text-sky-200 drop-shadow">쓰러졌다 — 다음 캐릭터로 교대</div>
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
