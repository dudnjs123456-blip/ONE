'use client';

import { WEATHER_LABEL } from '@/game/city/weather';
import { useEffect, useMemo, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import {
  BAITS,
  BAIT_BY_ID,
  BASKET_MAX,
  DIFF_LABEL,
  FIGHT,
  FISH,
  FISHING_SHOP_NAME,
  RODS,
  ROD_BY_ID,
  TIERS,
  TIER_INFO,
  TIME_LABEL,
  biteTable,
  biteWait,
  fmtKg,
  gainPerTap,
  landOdds,
  midKg,
  powerRatio,
  relaxOf,
  sellPrice,
  tensionPerTap,
  timeBand,
  type BaitId,
  type FishDef,
  type TimeBand,
} from '@/game/data/fishing';

export type FishTab = 'dex' | 'odds' | 'gear' | 'guide' | 'records';

const TABS: [FishTab, string][] = [
  ['dex', '📖 도감'],
  ['odds', '🎲 확률표'],
  ['gear', '🎒 내 장비'],
  ['guide', '📘 낚시 방법'],
  ['records', '🏆 기록'],
];

const pct = (p: number) => (p >= 0.1 ? `${(p * 100).toFixed(1)}%` : p >= 0.01 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(3)}%`);
const stars = (n: number) => (n ? '★'.repeat(n) : '—');

/**
 * 낚시 도감 (F): 도감 · 확률표 · 내 장비 · 낚시 방법 · 기록.
 * 확률표는 실제 낚시가 쓰는 계산(data/fishing.ts)을 그대로 보여 준다.
 */
export default function FishingPanel({ world, start = 'dex', onClose }: { world: CityWorld; start?: FishTab; onClose: () => void }) {
  const [tab, setTab] = useState<FishTab>(start);
  const [, redraw] = useState(0);
  useEffect(() => {
    const t = setInterval(() => redraw((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const fs = world.fishingState;
  const caught = FISH.filter((f) => fs.dex[f.id]).length;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-sky-300/30 bg-zinc-900/95 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-300/15 text-3xl">🎣</div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">한강 낚시 도감</div>
            <div className="text-xs text-white/60">
              도감 {caught}/{FISH.length} · 살림망 {fs.basket.length}/{BASKET_MAX} · 지금 {TIME_LABEL[timeBand(world.minutes)]} ({world.clock}) · {WEATHER_LABEL[world.weather.kind].icon} {WEATHER_LABEL[world.weather.kind].name}{world.weather.rain > 0.3 ? " (입질 ↑)" : ""}
            </div>
          </div>
          <div className="shrink-0 text-right text-sm text-amber-300">{world.profile.gold.toLocaleString()} G</div>
          <button onClick={onClose} className="rounded px-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기">
            ✕ <span className="text-[10px]">(F / Esc)</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-white/10 px-4 pt-3">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-t-lg px-4 py-2 text-sm font-bold ${tab === id ? 'bg-sky-400/20 text-sky-200' : 'text-white/60 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {tab === 'dex' && <DexTab world={world} />}
          {tab === 'odds' && <OddsTab world={world} />}
          {tab === 'gear' && <GearTab world={world} onChange={() => redraw((n) => n + 1)} />}
          {tab === 'guide' && <GuideTab world={world} />}
          {tab === 'records' && <RecordsTab world={world} />}
        </div>
      </div>
    </div>
  );
}

function TierBadge({ fish }: { fish: FishDef }) {
  const t = TIER_INFO[fish.tier];
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: t.color, background: `${t.color}22` }}>
      {t.label} {stars(t.stars)}
    </span>
  );
}

/** 좋아하는 미끼 (궁합 1.2 이상) */
const likes = (f: FishDef) =>
  BAITS.filter((b) => (f.bait[b.id] ?? 0) >= 1.2)
    .map((b) => `${b.icon}${b.name}`)
    .join(' · ') || '가리지 않음';

function timeNote(f: FishDef) {
  if ((f.night ?? 1) >= 1.5) return '🌙 밤에 활발';
  if ((f.day ?? 1) >= 1.2) return '☀️ 낮에 활발';
  if ((f.day ?? 1) < 0.5) return '🌙 거의 밤에만';
  return '';
}

function DexTab({ world }: { world: CityWorld }) {
  const fs = world.fishingState;
  const [pick, setPick] = useState<string | null>(null);
  const sel = pick ? FISH.find((f) => f.id === pick) : null;
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {FISH.map((f) => {
          const d = fs.dex[f.id];
          const t = TIER_INFO[f.tier];
          return (
            <button
              key={f.id}
              onClick={() => setPick(f.id)}
              className={`flex flex-col items-center rounded-lg border p-2 text-center ${pick === f.id ? 'border-sky-300 bg-sky-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              style={{ boxShadow: d ? `inset 0 -3px 0 ${t.color}` : undefined }}
            >
              <div className={`text-3xl ${d ? '' : 'opacity-25 grayscale'}`}>{d ? f.icon : '❓'}</div>
              <div className="mt-1 truncate text-xs font-bold">{d ? f.name : '???'}</div>
              <div className="text-[10px]" style={{ color: t.color }}>
                {stars(t.stars) === '—' ? '잡동사니' : stars(t.stars)}
              </div>
              {d && <div className="text-[10px] text-white/50">×{d.n} · {fmtKg(d.best)}</div>}
            </button>
          );
        })}
      </div>
      <div className="w-full shrink-0 rounded-lg border border-white/10 bg-black/30 p-3 md:w-64">
        {!sel ? (
          <div className="text-white/60">물고기를 누르면 자세히 볼 수 있어요. 아직 못 잡은 물고기는 이름 대신 힌트만 보여요.</div>
        ) : (
          (() => {
            const d = fs.dex[sel.id];
            return (
              <div className="flex flex-col gap-1.5">
                <div className="text-center text-5xl">{d ? sel.icon : '❓'}</div>
                <div className="text-center text-base font-bold">{d ? sel.name : '???'}</div>
                <div className="text-center">
                  <TierBadge fish={sel} />
                </div>
                <div className="mt-1 text-xs text-white/80">{d ? sel.desc : `힌트: ${sel.hint}`}</div>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                  <span className="text-white/50">크기</span>
                  <span>
                    {fmtKg(sel.kg[0])} ~ {fmtKg(sel.kg[1])}
                  </span>
                  <span className="text-white/50">힘</span>
                  <span>{sel.power.toFixed(1)}</span>
                  <span className="text-white/50">미끼</span>
                  <span>{likes(sel)}</span>
                  {timeNote(sel) && (
                    <>
                      <span className="text-white/50">시간</span>
                      <span>{timeNote(sel)}</span>
                    </>
                  )}
                  <span className="text-white/50">값</span>
                  <span>{sel.protect ? '천연기념물 (못 판다)' : `평균 ${sellPrice(sel, midKg(sel)).toLocaleString()}G (클수록 비싸다)`}</span>
                  {d && (
                    <>
                      <span className="text-white/50">잡은 수</span>
                      <span>{d.n}마리</span>
                      <span className="text-white/50">최대</span>
                      <span>{fmtKg(d.best)}</span>
                      <span className="text-white/50">첫 기록</span>
                      <span>{d.first}일째</span>
                    </>
                  )}
                </div>
                <div className="mt-2 rounded bg-white/5 p-2 text-[11px] text-white/70">
                  지금 내 실력 (평균 크기): <Diff world={world} fish={sel} />
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

function Diff({ world, fish, rodId }: { world: CityWorld; fish: FishDef; rodId?: string }) {
  const rod = ROD_BY_ID[rodId ?? world.fishingState.rod ?? 'bamboo'] ?? RODS[0];
  const o = landOdds(world.angler, rod, fish);
  const d = DIFF_LABEL[o.diff];
  return (
    <span className="font-bold" style={{ color: d.color }}>
      {d.text}
      {Number.isFinite(o.seconds) && o.diff !== 'impossible' ? <span className="font-normal text-white/50"> (약 {Math.max(1, Math.round(o.seconds))}초)</span> : null}
    </span>
  );
}

function OddsTab({ world }: { world: CityWorld }) {
  const fs = world.fishingState;
  const [rodId, setRod] = useState(fs.rod ?? 'bamboo');
  const [baitId, setBait] = useState<BaitId>(fs.use ?? 'worm');
  const [band, setBand] = useState<TimeBand>(timeBand(world.minutes));
  const setup = { rod: ROD_BY_ID[rodId], bait: BAIT_BY_ID[baitId], band };
  const table = useMemo(() => biteTable(setup).sort((a, b) => b.p - a.p), [rodId, baitId, band]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = biteWait(setup);
  const tierSum = TIERS.map((t) => ({ t, p: table.filter((o) => o.fish.tier === t).reduce((a, b) => a + b.p, 0) }));
  const sel = 'rounded bg-white/10 px-2 py-1 text-xs';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          🎣
          <select className={sel} value={rodId} onChange={(e) => setRod(e.target.value)}>
            {RODS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {fs.rods.includes(r.id) ? ' (보유)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          미끼
          <select className={sel} value={baitId} onChange={(e) => setBait(e.target.value as BaitId)}>
            {BAITS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          시간
          <select className={sel} value={band} onChange={(e) => setBand(e.target.value as TimeBand)}>
            {(['dawn', 'day', 'dusk', 'night'] as TimeBand[]).map((b) => (
              <option key={b} value={b}>
                {TIME_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-white/60">
          입질까지 평균 <b className="text-white">{(w.min + w.mean).toFixed(1)}초</b> (최소 {w.min}초)
        </span>
      </div>
      {/* 등급별 합계 막대 */}
      <div>
        <div className="flex h-5 w-full overflow-hidden rounded">
          {tierSum.map(({ t, p }) => (
            <div key={t} style={{ width: `${Math.max(p * 100, p > 0 ? 0.6 : 0)}%`, background: TIER_INFO[t].color }} title={`${TIER_INFO[t].label} ${pct(p)}`} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
          {tierSum.map(({ t, p }) => (
            <span key={t} style={{ color: TIER_INFO[t].color }}>
              ■ {TIER_INFO[t].label} {pct(p)}
            </span>
          ))}
        </div>
      </div>
      <table className="w-full text-xs">
        <thead className="text-white/50">
          <tr className="text-left">
            <th className="py-1">물고기</th>
            <th>등급</th>
            <th className="text-right">입질 확률</th>
            <th className="text-right">대략</th>
            <th className="pl-3">크기</th>
            <th>내 실력으로</th>
          </tr>
        </thead>
        <tbody>
          {table.map(({ fish, p }) => {
            const d = fs.dex[fish.id];
            return (
              <tr key={fish.id} className="border-t border-white/5">
                <td className="py-1">
                  {d ? fish.icon : '❓'} {d ? fish.name : <span className="text-white/50">??? ({fish.hint})</span>}
                </td>
                <td>
                  <TierBadge fish={fish} />
                </td>
                <td className="text-right font-bold tabular-nums">{pct(p)}</td>
                <td className="text-right tabular-nums text-white/50">{p > 0 ? `${Math.max(1, Math.round(1 / p)).toLocaleString()}번에 1번` : '—'}</td>
                <td className="pl-3 text-white/70">
                  {fmtKg(fish.kg[0])}~{fmtKg(fish.kg[1])}
                </td>
                <td>
                  <Diff world={world} fish={fish} rodId={rodId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="rounded-lg bg-white/5 p-3 text-xs leading-5 text-white/70">
        <b className="text-white">확률 계산법</b> — 물고기마다 <b>기본 가중치 × 미끼 궁합 × 시간대 배율 × 행운</b>을 곱한 뒤, 전체 합으로 나눈 비율이 입질 확률이에요.
        <br />· 행운 = 낚싯대 행운 + 미끼 행운. 등급이 높을수록 행운의 효과가 커요 (보통 ×0.5 · 희귀 ×1 · 매우 희귀 ×1.6 · 전설 ×2.2, 잡동사니는 오히려 줄어요).
        <br />· 행운은 큰 개체가 나올 확률도 높여요. 크기는 대부분 작은 쪽으로 나오고, 큰 개체일수록 힘이 세고 비싸요.
        <br />· 미끼 궁합이 표에 없으면 0.4배, 루어는 사냥꾼이 아니면 거의 안 물어요 (0.02배).
        <br />· &lsquo;내 실력으로&rsquo;는 평균 크기 개체를 기준으로, 지금 레벨 · 장비 공격력 · 최대 체력과 고른 낚싯대로 끌어올릴 수 있을지 어림한 거예요.
      </div>
    </div>
  );
}

function GearTab({ world, onChange }: { world: CityWorld; onChange: () => void }) {
  const fs = world.fishingState;
  const a = world.angler;
  const rod = fs.rod ? ROD_BY_ID[fs.rod] : null;
  const basketValue = fs.basket.reduce((s, c) => s + sellPrice(FISH.find((f) => f.id === c.id)!, c.kg), 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="공격력 (레벨+장비)" value={`×${a.power.toFixed(2)}`} />
        <Stat label="최대 체력" value={`${a.maxHp}`} />
        <Stat label="한 번 감기 (힘 1 고기)" value={rod ? `+${gainPerTap(powerRatio(a, rod, 1)).toFixed(1)}%` : '—'} />
        <Stat label="장력 풀리는 속도" value={`${relaxOf(a).toFixed(0)}/초`} />
      </div>
      <div>
        <div className="mb-1 font-bold">🎣 낚싯대 {fs.rods.length ? '' : <span className="font-normal text-white/50">— 없음. 「{FISHING_SHOP_NAME}」에서 사 오세요</span>}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RODS.filter((r) => fs.rods.includes(r.id)).map((r) => (
            <button
              key={r.id}
              onClick={() => {
                world.selectRod(r.id);
                onChange();
              }}
              className={`rounded-lg border p-2 text-left ${fs.rod === r.id ? 'border-sky-300 bg-sky-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
            >
              <div className="font-bold">
                {r.icon} {r.name} {fs.rod === r.id && <span className="text-xs text-sky-300">· 쓰는 중</span>}
              </div>
              <div className="text-xs text-white/60">
                힘 ×{r.power} · 줄 강도 ×{r.line} · 행운 +{Math.round(r.luck * 100)}% · {r.cast}m
              </div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 font-bold">🐛 미끼 (누르면 그걸 끼운다)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BAITS.map((b) => {
            const n = fs.bait[b.id] ?? 0;
            return (
              <button
                key={b.id}
                disabled={!n}
                onClick={() => {
                  world.selectBait(b.id);
                  onChange();
                }}
                className={`rounded-lg border p-2 text-center disabled:opacity-35 ${fs.use === b.id && n ? 'border-sky-300 bg-sky-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="text-2xl">{b.icon}</div>
                <div className="text-xs font-bold">{b.name}</div>
                <div className="text-[11px] text-white/60">{b.reusable ? (n ? '보유' : '없음') : `${n}개`}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 font-bold">
          🧺 살림망 {fs.basket.length}/{BASKET_MAX} <span className="font-normal text-white/50">— 낚시마트 계산대에서 팔 수 있어요 (합계 {basketValue.toLocaleString()}G)</span>
        </div>
        {!fs.basket.length ? (
          <div className="text-white/50">비어 있어요</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {fs.basket.map((c, i) => {
              const f = FISH.find((x) => x.id === c.id)!;
              return (
                <span key={i} className="rounded bg-white/5 px-2 py-1 text-xs" style={{ borderLeft: `3px solid ${TIER_INFO[f.tier].color}` }}>
                  {f.icon} {f.name} {fmtKg(c.kg)} · {sellPrice(f, c.kg)}G
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function GuideTab({ world }: { world: CityWorld }) {
  const a = world.angler;
  const rod = ROD_BY_ID[world.fishingState.rod ?? 'bamboo'] ?? RODS[0];
  const H = ({ children }: { children: React.ReactNode }) => <div className="mb-1 mt-3 text-base font-bold text-sky-200 first:mt-0">{children}</div>;
  return (
    <div className="leading-6 text-white/85">
      <H>1. 준비</H>
      <ul className="list-disc pl-5">
        <li>
          행복빌라 옆 상가 줄 맨 끝 4층 건물 1층 <b>「{FISHING_SHOP_NAME}」</b>에서 낚싯대와 미끼를 사요. 벽의 낚싯대 · 냉장고의 미끼 앞에서 E 로 바로 살 수 있고, 계산대에선 전부 볼 수 있어요.
        </li>
        <li>
          한강공원 강가에 <b>나무 낚시 데크</b>가 여섯 곳 있어요 (지도 M 의 🎣). 데크 끝으로 걸어가서 <b>E</b>.
        </li>
      </ul>
      <H>2. 던지고 기다리기</H>
      <ul className="list-disc pl-5">
        <li>
          <b>Space</b> = 던지기. 찌가 물 위에 둥둥 뜨면 기다려요. 기다리는 시간은 최소 2.5초 + 평균 9초 × 미끼 배율 (떡밥 0.8 · 새우 1.15 · 루어 1.2), 물때(새벽 5~7시 · 해질녘 17~19시)엔 0.75배로 빨라요.
        </li>
        <li>
          찌가 <b>톡톡</b> 건드려지는 건 <b>예신</b>이에요. 이때 누르면 <b>헛챔질</b>이라 고기가 달아나요. 큰 고기일수록 예신을 여러 번 해요.
        </li>
        <li>
          찌가 <b>쑥!</b> 들어가고 ❗ 가 뜨면 바로 <b>Space = 챔질</b>. 흔한 고기는 1초, 희귀할수록 짧아서 전설급은 0.6초 안에 눌러야 해요. 놓치면 미끼만 뜯겨요.
        </li>
        <li>기다리는 중에 Space 를 누르면 그냥 감아 들여요 (미끼는 그대로). E 나 방향키로 그만둬요.</li>
      </ul>
      <H>3. 힘겨루기 (Space 연타)</H>
      <ul className="list-disc pl-5">
        <li>
          <b>거리</b> 막대를 100% 로 채우면 잡아요. 0% 가 되면 바늘이 빠져서 도망가요. 처음엔 {FIGHT.start}% 에서 시작해요.
        </li>
        <li>
          Space 를 한 번 누를 때마다 <b>{FIGHT.gain} × 힘비</b> % 만큼 끌려와요. <b>힘비 = (내 공격력 × 낚싯대 힘) ÷ 물고기 힘</b> — 레벨이 높고 장비 공격력이 셀수록, 좋은 낚싯대일수록 빨리 잡혀요.
        </li>
        <li>
          누를 때마다 <b>장력</b>이 {FIGHT.tap} × √물고기 힘 ÷ 줄 강도 만큼 올라요. <b>100 이 되면 줄이 끊어져요</b> (루어도 잃어요). 장력은 초당 {FIGHT.relax} 씩 저절로 풀리고, <b>최대 체력이 높을수록 더 빨리</b> 풀려요 (지금 {relaxOf(a).toFixed(0)}/초).
        </li>
        <li>
          물고기가 가끔 <b>차고 나가요</b> (화면이 빨개져요). 이때는 물고기가 {FIGHT.surge}배로 당기고, 장력이 저절로 오르고, 감으면 장력이 {FIGHT.surgeTap}배로 올라요 → <b>잠깐 손을 떼는 게</b> 요령이에요.
        </li>
        <li>물고기는 시간이 지나면 지쳐서 덜 당기고 덜 차고 나가요 (최대 {Math.round((1 - FIGHT.tired) * 100)}% 약해짐).</li>
        <li>
          <b>바늘털이</b>: {FIGHT.shakeAfter}초가 넘도록 못 끌어오면 고기가 몸을 털어 바늘이 빠질 수 있어요 (초마다 점점 높아져요). 너무 강한 고기는 장비부터 키워요.
        </li>
        <li>
          예) 지금 내 공격력 ×{a.power.toFixed(2)} + {rod.name}(힘 ×{rod.power}) 으로 힘 1 짜리 고기: 한 번에 +{gainPerTap(powerRatio(a, rod, 1)).toFixed(1)}%, 장력 +{tensionPerTap(rod, 1).toFixed(1)}.
        </li>
      </ul>
      <H>4. 잡은 뒤</H>
      <ul className="list-disc pl-5">
        <li>
          살림망(최대 {BASKET_MAX}마리)에 들어가요. 낚시마트 계산대에서 팔아요 — 값은 <b>평균 값 × (무게 ÷ 평균 무게)^0.8</b>, 큰 놈일수록 비싸요.
        </li>
        <li>
          경험치: 잡동사니 1 · 흔함 3 · 보통 8 · 희귀 20 · 매우 희귀 60 · 전설 250, <b>처음 잡은 종류는 2배</b>.
        </li>
        <li>황쏘가리는 천연기념물이라 사진만 찍고 놓아줘요 (도감 · 경험치만).</li>
      </ul>
      <H>5. 팁</H>
      <ul className="list-disc pl-5">
        <li>메기 · 동자개 · 뱀장어는 밤에, 쏘가리 · 가물치는 낮에 잘 물어요. 대두어 · 초어는 떡밥을 좋아해요.</li>
        <li>배스 · 쏘가리 · 끄리는 루어, 붕어 · 잉어 · 초어는 떡밥, 큰 고기는 새우.</li>
        <li>황금 떡밥 + 좋은 낚싯대 = 행운이 쌓여서 전설급 확률이 크게 올라요 (확률표 탭에서 직접 비교해 보세요).</li>
      </ul>
    </div>
  );
}

function RecordsTab({ world }: { world: CityWorld }) {
  const fs = world.fishingState;
  const st = fs.stats;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const best = FISH.filter((f) => fs.dex[f.id] && f.tier !== 'junk').sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier) || fs.dex[b.id].best - fs.dex[a.id].best);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="던진 횟수" value={`${st.casts}`} />
        <Stat label="입질" value={`${st.bites}`} />
        <Stat label="잡은 수" value={`${st.catches}`} />
        <Stat label="성공률 (입질 대비)" value={rate(st.catches, st.catches + st.missed + st.escaped + st.snapped)} />
        <Stat label="챔질 놓침" value={`${st.missed}`} />
        <Stat label="도망감" value={`${st.escaped}`} />
        <Stat label="줄 끊어짐" value={`${st.snapped}`} />
        <Stat label="판 돈" value={`${st.earned.toLocaleString()}G`} />
      </div>
      <div>
        <div className="mb-1 font-bold">🏆 종류별 최대 기록</div>
        {!best.length ? (
          <div className="text-white/50">아직 기록이 없어요. 한강으로 가 볼까요?</div>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {best.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
                <span>
                  {f.icon} {f.name} <TierBadge fish={f} />
                </span>
                <span className="tabular-nums">
                  {fmtKg(fs.dex[f.id].best)} <span className="text-white/40">×{fs.dex[f.id].n}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
