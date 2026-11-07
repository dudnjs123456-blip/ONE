import type { BossHudState } from '@/game/core/boss';
import { LifeBars } from './LifeBar';
import { bindLabel } from '@/game/core/keybinds';

export default function BossHud({
  hud,
  onRetry,
  onExit,
  onReplay,
  touch = false,
  portrait = false,
}: {
  hud: BossHudState;
  onRetry: () => void;
  onExit: () => void;
  /** 결과 창 "리플레이 보기" */
  onReplay?: () => void;
  /** 터치 조작 화면: 아래쪽은 버튼 자리라 패널을 위로, 키 설명은 숨김 */
  touch?: boolean;
  /** 폰 세로 화면: 위쪽 버튼 줄과 겹치지 않게 한 칸 더 내린다 */
  portrait?: boolean;
}) {
  const bossPct = (hud.bossHp / hud.bossMaxHp) * 100;
  const r = hud.result;
  const lh = hud.lastHit;

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {/* 보스 체력 */}
      <div className="absolute left-1/2 top-4 w-[min(720px,90vw)] -translate-x-1/2">
        <div className="mb-1 flex items-end justify-between">
          <div>
            <span className="text-xs text-white/60">{hud.bossTitle}</span>
            <div className="text-2xl font-black tracking-wide">
              {hud.bossName}
              {hud.enraged && <span className="ml-2 align-middle text-sm font-bold text-red-400">분노</span>}
            </div>
          </div>
          <div className="rounded border border-white/30 bg-black/60 px-3 text-2xl font-black tabular-nums">{hud.timer}</div>
        </div>
        <div className="relative h-6 overflow-hidden rounded-sm border border-red-300/40 bg-black/70">
          <div
            className="absolute inset-y-0 left-0 bg-white/60 transition-[width] delay-300 duration-700"
            style={{ width: `${bossPct}%` }}
          />
          <div
            className={`absolute inset-y-0 left-0 ${hud.enraged ? 'bg-gradient-to-b from-red-500 to-red-800' : 'bg-gradient-to-b from-orange-400 to-red-600'}`}
            style={{ width: `${bossPct}%` }}
          />
          {/* 분노 페이즈 경계 */}
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/50" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums drop-shadow">
            {hud.bossHp} / {hud.bossMaxHp}
          </div>
        </div>
      </div>

      {/* 플레이어 */}
      <div className={`absolute rounded-lg border border-white/15 bg-black/50 p-3 ${touch ? `left-4 w-60 ${portrait ? 'top-36' : 'top-28'}` : 'bottom-6 left-6 w-80'}`}>
        <div className="mb-1 flex justify-between text-sm font-bold">
          <span>
            <span className="text-amber-300">Lv.{hud.playerLevel}</span> PLAYER
          </span>
          <span className="tabular-nums text-white/70">
            {hud.playerHp}/{hud.playerMaxHp}
          </span>
        </div>
        <div className="h-4 overflow-hidden rounded-sm bg-black/70">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"
            style={{ width: `${(hud.playerHp / hud.playerMaxHp) * 100}%` }}
          />
        </div>
        <LifeBars fatigue={hud.fatigue} hunger={hud.hunger} />
        {lh && (
          <div className="mt-2 font-mono text-[11px] text-white/60">
            {lh.name} [{lh.notation}] {lh.result === 'block' ? '가드됨' : lh.result === 'counter' ? '카운터!' : '히트'}
            {lh.damage > 0 && ` · ${lh.damage}`}
          </div>
        )}
      </div>

      {hud.combo && (
        <div className={`absolute left-8 ${touch ? (portrait ? 'top-72' : 'top-60') : 'top-36'}`}>
          <div className="text-4xl font-black italic text-amber-300 drop-shadow">{hud.combo.hits} HITS</div>
          <div className="text-lg font-bold text-white/80">{hud.combo.damage} DAMAGE</div>
        </div>
      )}

      {!touch && (
      <div className="absolute bottom-6 right-6 rounded bg-black/50 px-3 py-2 text-xs leading-5 text-white/75">
        <div>방향키 이동 · {bindLabel('b1')} 왼팔 · {bindLabel('b2')} 오른팔 · {bindLabel('b3')} 왼다리 · {bindLabel('b4')} 오른다리</div>
        <div>뒤 = 가드 · 아래뒤 = 하단 가드 · 위/아래 톡 = 횡이동</div>
        <div>{bindLabel('jump')} 점프 · Ctrl+휠 줌</div>
        <div className="text-red-300">붉게 빛나는 공격 = 아머 (끊기지 않음)</div>
        <div className="text-amber-200">가드만 굳히면 하단·잡기가 와요 — 잡기는 앉아서 피하거나 잡히는 순간 {bindLabel('b1')}·{bindLabel('b2')}</div>
      </div>
      )}

      {hud.banner && !r && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`text-6xl font-black italic tracking-widest drop-shadow-[0_4px_0_rgba(0,0,0,0.8)] ${
              hud.phase === 'defeat' || hud.banner.includes('분노') ? 'text-red-400' : 'text-amber-300'
            }`}
          >
            {hud.banner}
          </div>
        </div>
      )}

      {r && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-y-auto bg-black/65 py-2">
          <div className="m-auto w-80 rounded-xl border border-white/20 bg-zinc-900/95 p-6 text-center">
            <div className={`text-4xl font-black italic ${r.win ? 'text-amber-300' : 'text-red-400'}`}>
              {r.win ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="mt-1 text-sm text-white/60">
              {hud.bossName} · {r.clearTime.toFixed(1)}초
            </div>
            {r.win ? (
              <div className="mt-5 space-y-1 text-left text-sm">
                {r.firstClear && <div className="mb-2 text-center font-bold text-amber-300">★ 최초 클리어 보너스 ★</div>}
                {r.newRecord && <div className="mb-2 text-center font-bold text-sky-300">🏆 최단 기록 갱신!</div>}
                {r.perfect && <div className="mb-2 text-center font-bold text-sky-300">✨ 퍼펙트! 골드 +50%</div>}
                <div className="flex justify-between"><span className="text-white/60">경험치</span><span className="text-lime-300">+{r.exp} EXP</span></div>
                <div className="flex justify-between"><span className="text-white/60">골드</span><span className="text-amber-300">+{r.gold} G</span></div>
                {r.levelUps > 0 && (
                  <div className="pt-2 text-center font-bold text-amber-200">레벨 업! → Lv.{r.newLevel}</div>
                )}
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/70">
                <div className="mb-1 font-bold text-red-300">보스 체력 {Math.ceil((hud.bossHp / hud.bossMaxHp) * 100)}% 남음</div>
                필드에서 레벨을 올리거나 패턴을 익혀 다시 도전하세요.
              </div>
            )}
            {/* 이번 보스전 통계 */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded bg-black/40 px-3 py-2 text-left text-xs tabular-nums">
              <span className="text-white/50">준 데미지</span>
              <span className="text-right">{hud.stats.dealt}</span>
              <span className="text-white/50">받은 데미지</span>
              <span className="text-right">{hud.stats.taken}</span>
              <span className="text-white/50">맞힌 횟수</span>
              <span className="text-right">
                {hud.stats.hits}
                {hud.stats.counters > 0 && <span className="text-amber-300"> (카운터 {hud.stats.counters})</span>}
              </span>
              <span className="text-white/50">막은 공격</span>
              <span className="text-right">{hud.stats.guards}</span>
              {hud.stats.bestCombo >= 2 && (
                <>
                  <span className="text-white/50">최대 콤보</span>
                  <span className="text-right">{hud.stats.bestCombo} HIT</span>
                </>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button onClick={onRetry} className="rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
                다시 도전
              </button>
              {onReplay && (
                <button onClick={onReplay} className="rounded bg-sky-600 py-2 font-bold hover:bg-sky-500">
                  ▶ 리플레이 보기
                </button>
              )}
              <button onClick={onExit} className="rounded bg-white/10 py-2 hover:bg-white/20">
                보스 선택으로
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
