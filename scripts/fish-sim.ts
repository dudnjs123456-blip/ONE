/**
 * 낚시 시뮬레이션 테스트: 확률표 · 힘겨루기 밸런스 (사람처럼 연타하는 봇으로 잡아 본다)
 *   npx tsx scripts/fish-sim.ts          (--table: 레벨·낚싯대별 잡히는 비율 표도 출력)
 */
import { mulberry32 } from '../src/game/core/controllers';
import { FishingSession, type FishResult } from '../src/game/city/fishing';
import { BAITS, BAIT_BY_ID, FISHING_SHOP_NAME, FISH, FISH_BY_ID, RODS, ROD_BY_ID, biteTable, fishStrength, landOdds, midKg, type Angler, type FishSetup } from '../src/game/data/fishing';
import { playerStats } from '../src/game/data/equipment';
import { newProfile } from '../src/game/core/profile';
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!c) fails++;
};

export const anglerAt = (level: number): Angler => {
  const p = newProfile();
  p.level = level;
  p.gear = { owned: [], equipped: { weapon: 'woodBat', head: 'cap', top: 'hoodie', bottom: 'jeans', shoes: 'sneakers', gloves: 'workGloves', necklace: 'silverChain', ring: 'luckyRing' } };
  return playerStats(p);
};

function session(setup: FishSetup, a: Angler, rnd: () => number, hooks: { result?: (r: FishResult) => void; taken?: () => void } = {}) {
  return new FishingSession({
    setup: () => setup,
    angler: () => a,
    canCast: () => null,
    onCast() {},
    onBaitTaken: () => hooks.taken?.(),
    onLureLost() {},
    onResult: (r) => {
      hooks.result?.(r);
      return r;
    },
    say() {},
    rnd,
  });
}

/** 걸린 상태로 만든다 (고기 · 크기 고정) */
function forceHook(s: FishingSession, fishId: string, kg: number) {
  s.fish = FISH_BY_ID[fishId];
  s.kg = kg;
  s.str = fishStrength(s.fish, kg);
  s.phase = 'bite';
  s.t = 0;
  s.biteWindow = 60;
  s.step(true);
}

/** 고정된 고기 하나와 힘겨루기: 사람처럼 초당 ~7번 연타, 장력이 높거나 차고 나가면 쉰다 */
function duel(a: Angler, rodId: string, fishId: string, seed: number, kg?: number): { r: FishResult['kind']; sec: number } {
  const rnd = mulberry32(seed);
  let res: FishResult | null = null;
  const s = session({ rod: ROD_BY_ID[rodId], bait: BAIT_BY_ID.worm, band: 'day' }, a, rnd, { result: (r) => (res = r) });
  forceHook(s, fishId, kg ?? midKg(FISH_BY_ID[fishId]));
  let f = 0;
  let nextTap = 0;
  while (s.phase === 'fight' && f < 60 * 120) {
    f++;
    let tap = false;
    if (f >= nextTap && s.tension < 72 && !s.surge) {
      tap = true;
      nextTap = f + 7 + Math.floor(rnd() * 3);
    }
    s.step(tap);
  }
  return { r: (res as FishResult | null)?.kind ?? 'escaped', sec: f / 60 };
}

const table = process.argv.includes('--table');
const setups: [string, number, string][] = [
  ['Lv1 대나무', 1, 'bamboo'],
  ['Lv5 카본', 5, 'carbon'],
  ['Lv10 원투', 10, 'surf'],
  ['Lv20 프로', 20, 'pro'],
  ['Lv30 강태공', 30, 'legend'],
];
const rate: Record<string, Record<string, number>> = {};
for (const [name, lv, rod] of setups) {
  const a = anglerAt(lv);
  rate[name] = {};
  const row: string[] = [];
  for (const fish of FISH) {
    let caught = 0;
    let secs = 0;
    const N = 40;
    for (let k = 0; k < N; k++) {
      const d = duel(a, rod, fish.id, k * 977 + 13);
      if (d.r === 'caught') {
        caught++;
        secs += d.sec;
      }
    }
    rate[name][fish.id] = caught / N;
    const est = landOdds(a, ROD_BY_ID[rod], fish);
    row.push(`${fish.name}:${Math.round((caught / N) * 100)}%${caught ? `/${(secs / caught).toFixed(0)}s` : ''}(${est.diff} ${est.margin.toFixed(2)})`);
  }
  if (table) console.log(`${name} (공격력 ${a.power.toFixed(2)}, HP ${a.maxHp})\n   ${row.join('  ')}`);
}

// ── 확률표 ──
let sumOk = true;
for (const b of BAITS)
  for (const band of ['dawn', 'day', 'dusk', 'night'] as const)
    for (const rod of RODS) {
      const sum = biteTable({ rod, bait: b, band }).reduce((x, y) => x + y.p, 0);
      if (Math.abs(sum - 1) > 1e-9) sumOk = false;
    }
ok(sumOk, '모든 낚싯대 · 미끼 · 시간대 확률표 합 = 100%');
const day = biteTable({ rod: RODS[0], bait: BAIT_BY_ID.worm, band: 'day' });
const P = (id: string, t = day) => t.find((o) => o.fish.id === id)!.p;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
ok(
  P('pirami') > P('carp') && P('carp') > P('catfish') && P('catfish') > P('grasscarp') && P('grasscarp') > P('sturgeon'),
  `클수록·희귀할수록 덜 문다 (피라미 ${pct(P('pirami'))} > 잉어 ${pct(P('carp'))} > 메기 ${pct(P('catfish'), 2)} > 초어 ${pct(P('grasscarp'), 2)} > 철갑상어 ${pct(P('sturgeon'), 3)})`,
);
const night = biteTable({ rod: RODS[0], bait: BAIT_BY_ID.worm, band: 'night' });
ok(P('eel', night) > P('eel') * 3, `장어는 밤에 훨씬 잘 문다 (낮 ${pct(P('eel'), 2)} → 밤 ${pct(P('eel', night), 2)})`);
const lure = biteTable({ rod: RODS[0], bait: BAIT_BY_ID.lure, band: 'day' });
ok(P('bass', lure) > P('bass') * 2 && P('crucian', lure) < P('crucian') / 5, `루어엔 배스가 잘 물고 붕어는 거의 안 문다 (배스 ${pct(P('bass'))} → ${pct(P('bass', lure))})`);
const lucky = biteTable({ rod: ROD_BY_ID.legend, bait: BAIT_BY_ID.golden, band: 'night' });
const legendP = (t: typeof day) => t.filter((o) => o.fish.tier === 'legend').reduce((x, y) => x + y.p, 0);
ok(legendP(lucky) > legendP(day) * 5, `좋은 대 + 황금 떡밥이면 전설급 확률이 크게 오른다 (${pct(legendP(day), 3)} → ${pct(legendP(lucky), 2)})`);
if (table) console.log(`   대나무+지렁이 낮: ${day.map((o) => `${o.fish.name} ${pct(o.p, 2)}`).join(', ')}`);

// ── 힘겨루기 밸런스 ──
const r = rate;
const R = (s: string, id: string) => Math.round(r[s][id] * 100);
ok(r['Lv1 대나무'].crucian >= 0.9, `Lv1 대나무로 붕어는 거의 다 잡는다 (${R('Lv1 대나무', 'crucian')}%)`);
ok(r['Lv1 대나무'].carp > 0.05 && r['Lv1 대나무'].carp < 0.9, `Lv1 대나무로 잉어는 어렵지만 가능 (${R('Lv1 대나무', 'carp')}%)`);
ok(r['Lv1 대나무'].sturgeon === 0 && r['Lv1 대나무'].bighead === 0, 'Lv1 대나무로 철갑상어 · 대두어는 못 잡는다');
ok(r['Lv5 카본'].catfish > r['Lv1 대나무'].catfish, `낚싯대 · 레벨이 오르면 메기가 잘 잡힌다 (${R('Lv1 대나무', 'catfish')}% → ${R('Lv5 카본', 'catfish')}%)`);
ok(r['Lv20 프로'].sturgeon >= 0.5, `Lv20 프로 마스터로 철갑상어를 잡을 수 있다 (${R('Lv20 프로', 'sturgeon')}%)`);
ok(r['Lv30 강태공'].bighead >= 0.5 && r['Lv10 원투'].bighead < 0.3, `대두어는 최고 장비에서만 (Lv10 원투 ${R('Lv10 원투', 'bighead')}% · Lv30 강태공 ${R('Lv30 강태공', 'bighead')}%)`);
{
  const t1 = duel(anglerAt(3), 'carbon', 'carp', 5).sec;
  const t2 = duel(anglerAt(15), 'carbon', 'carp', 5).sec;
  ok(t2 < t1 * 0.75, `전투 능력이 높을수록 빨리 잡는다 (잉어: Lv3 ${t1.toFixed(1)}초 → Lv15 ${t2.toFixed(1)}초)`);
}
{
  let res: FishResult | null = null;
  const s = session({ rod: ROD_BY_ID.carbon, bait: BAIT_BY_ID.worm, band: 'day' }, anglerAt(5), mulberry32(3), { result: (x) => (res = x) });
  s.step(true);
  for (let k = 0; k < 60 * 60 && s.phase !== 'bite'; k++) s.step(false);
  ok(s.phase === 'bite', '던지고 기다리면 입질이 온다');
  forceHook(s, 'catfish', 9);
  for (let k = 0; k < 60 * 20 && s.phase === 'fight'; k++) s.step(k % 4 === 0);
  ok((res as FishResult | null)?.kind === 'snapped', `쉬지 않고 연타만 하면 큰 고기에 줄이 끊어진다 (${(res as FishResult | null)?.kind})`);
}
{
  let taken = 0;
  let res: FishResult | null = null;
  const s = session({ rod: ROD_BY_ID.bamboo, bait: BAIT_BY_ID.worm, band: 'day' }, anglerAt(1), mulberry32(9), { result: (x) => (res = x), taken: () => taken++ });
  s.step(true);
  for (let k = 0; k < 60 * 60 && s.phase !== 'reel'; k++) s.step(false);
  ok((res as FishResult | null)?.kind === 'missed' && taken === 1, '입질 때 챔질을 안 하면 놓치고 미끼 하나를 잃는다');
}
// ── 실제 도시에서: 낚시점에서 사고 → 한강 데크로 걸어가서 → 낚고 → 팔기 ──
{
  let cmd: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => cmd });
  w.profile.gold = 5000;
  const step = (c: Partial<CityInput> = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      cmd = { move: null, run: false, interact: false, ...c };
      w.step();
    }
    cmd = { move: null, run: false, interact: false };
  };
  const shop = w.map.pois.find((q) => q.id === 'fishingshop');
  ok(!!shop && w.map.buildings.some((b) => b.tenant === 'fishing'), `상가에 「${FISHING_SHOP_NAME}」이 생겼다`);
  // 가게 문 앞에서 E → 들어가기
  w.player.reset(shop!.x, shop!.z, 0, -1);
  step({ interact: true });
  for (let i = 0; i < 300 && (w.location !== 'store' || w.doorway); i++) step();
  ok(w.location === 'store' && w.store?.kind === 'fishing', '낚시점 안으로 들어갔다');
  const rodPoi = w.store!.pois.find((q) => q.id === 'store:item:rod:bamboo')!;
  w.player.reset(rodPoi.x, rodPoi.z, 0, -1);
  step();
  ok(/대나무 낚싯대 200G — 사기/.test(w.promptLabel ?? ''), `진열대 앞에서 이름·가격이 보인다 (${w.promptLabel})`);
  step({ interact: true });
  ok(w.fishingState.rods.includes('bamboo') && w.profile.gold === 4800, `벽의 대나무 낚싯대를 E 로 샀다 (${w.profile.gold}G)`);
  const wormPoi = w.store!.pois.find((q) => q.id === 'store:item:bait:worm')!;
  w.player.reset(wormPoi.x, wormPoi.z, -1, 0);
  step();
  step({ interact: true });
  ok((w.fishingState.bait.worm ?? 0) === 10, `냉장고에서 지렁이 10개를 샀다 (${w.fishingState.bait.worm})`);
  ok(w.buyBait('shrimp', 2).ok && w.fishingState.bait.shrimp === 20, '계산대에서 새우 2묶음');
  ok(!w.buyRod('legend').ok, '돈이 모자라면 비싼 낚싯대는 못 산다');
  // 밖으로
  const exit = w.store!.pois.find((q) => q.id === 'store:exit')!;
  w.player.reset(exit.x, exit.z, 0, 1);
  step({ interact: true });
  for (let i = 0; i < 300 && (w.location !== 'city' || w.doorway); i++) step();
  ok(w.location === 'city', '가게 밖으로 나왔다');
  // 데크로 걸어가기: 강둑에서 남쪽(+z)으로 걷는다
  const d = w.map.fishDecks[2];
  w.player.reset(d.x, w.map.bounds.z1 - 2, 0, 1);
  step({ move: { x: 0, z: 1 } }, 400);
  ok(w.player.z > d.z1 - 1.2, `데크 위를 걸어서 끝까지 갔다 (z ${w.player.z.toFixed(1)} / 끝 ${d.z1})`);
  ok(w.promptLabel === '🎣 낚시 데크', `데크 끝에서 안내가 뜬다 (${w.promptLabel})`);
  // 데크 밖 강물 쪽으로는 못 간다
  w.player.reset(d.x + 10, w.map.bounds.z1 - 1, 0, 1);
  step({ move: { x: 0, z: 1 } }, 200);
  ok(w.player.z <= w.map.bounds.z1, `데크가 아닌 곳은 강둑에서 막힌다 (z ${w.player.z.toFixed(1)})`);
  w.player.reset(d.x, d.z1 - 0.6, 0, 1);
  step({ move: { x: 1, z: 0 } }, 200);
  ok(w.player.x < d.x + d.w / 2, `데크 옆 난간 밖으로는 못 나간다 (x ${(w.player.x - d.x).toFixed(2)})`);
  // 낚시 시작 → 던지기 → 입질 → 챔질 → 연타 → 잡기
  w.player.reset(d.x, d.z1 - 0.8, 0, 1);
  step();
  step({ interact: true });
  ok(!!w.fishing && w.fishing.phase === 'ready', '데크 끝에서 E = 낚시 시작');
  w.profile.level = 30; // 무엇이 물어도 끌어올릴 수 있게
  w.refreshStats();
  const dex0 = Object.keys(w.fishingState.dex).length;
  let caught = 0;
  let casts = 0;
  for (let round = 0; round < 6; round++) {
    step({ jumpTap: true });
    casts++;
    const ph = (): string | undefined => w.fishing?.phase;
    for (let i = 0; i < 60 * 45 && ph() !== 'bite'; i++) step();
    if (ph() !== 'bite') continue;
    step({ jumpTap: true });
    for (let i = 0; i < 60 * 60 && ph() === 'fight'; i++) step({ jumpTap: i % 8 === 0 && (w.fishing?.tension ?? 0) < 70 && !w.fishing?.surge });
    if (ph() === 'result') caught++;
    for (let i = 0; i < 60 * 5 && ph() !== 'ready'; i++) step();
  }
  const fs = w.fishingState;
  ok(caught >= 3, `${casts}번 던져서 ${caught}마리 잡았다 (${fs.basket.map((c) => `${FISH_BY_ID[c.id].name} ${c.kg}kg`).join(', ')})`);
  ok(Object.keys(fs.dex).length > dex0 && fs.stats.catches === caught, `도감에 기록된다 (${Object.keys(fs.dex).length}종)`);
  ok((fs.bait.worm ?? 0) < 10, `미끼를 썼다 (지렁이 ${fs.bait.worm}개 남음)`);
  // 움직이면 낚시 끝
  step({ move: { x: 0, z: -1 } });
  ok(!w.fishing, '방향키로 낚시를 그만둔다');
  // 가게에서 팔기
  const n = fs.basket.length;
  const g0 = w.profile.gold;
  ok(!w.sellFish().ok, '가게 밖에서는 못 판다');
  w.player.reset(shop!.x, shop!.z, 0, -1);
  step({ interact: true });
  for (let i = 0; i < 300 && (w.location !== 'store' || w.doorway); i++) step();
  const r = w.sellFish();
  ok(r.ok && fs.basket.length === 0 && w.profile.gold > g0, `계산대에서 ${n}마리를 팔았다 (${r.message})`);
}

console.log(fails ? `\n${fails} FAIL` : '\n0 FAIL');
process.exit(fails ? 1 : 0);
