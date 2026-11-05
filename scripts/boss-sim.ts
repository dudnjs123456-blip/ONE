// 보스전 헤드리스 검증: npx tsx scripts/boss-sim.ts
import { BossBattle } from '../src/game/core/boss';
import { CpuController, DummyController } from '../src/game/core/controllers';
import { newProfile } from '../src/game/core/profile';
import { BOSSES } from '../src/game/data/bosses';
import { FIELD_SPAWNS, MONSTERS } from '../src/game/data/monsters';
import { MOVES } from '../src/game/data/moves';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

// 1) 보스가 실제로 기술을 쓰고, 연타가 자동으로 이어지는가
{
  const b = new BossBattle(BOSSES[0], newProfile(), new DummyController(), 3);
  const used = new Set<string>();
  for (let f = 0; f < 60 * 40; f++) { b.step(); if (b.bossFighter.move) used.add(b.bossFighter.move.id); }
  check('boss uses moves', used.size >= 3, `(${[...used].join(', ')})`);
  check('combo chains 1→2→3', used.has('bossCombo2') && used.has('bossCombo3'));
}

// 2) 아머: 대지 강타 발생 중 맞아도 기술이 안 끊긴다
{
  const b = new BossBattle(BOSSES[1], newProfile(), new DummyController(), 1);
  b.phase = 'fight';
  const boss = b.bossFighter, p = b.player;
  boss.x = 0.5; p.x = -0.5;
  boss.queueMove(MOVES.bossSmash);
  b.step();
  const hpBefore = boss.hp;
  boss.receiveHit(MOVES.jab, false, 10);
  check('armor keeps attack', boss.state === 'attack' && boss.move?.id === 'bossSmash' && boss.hp < hpBefore);
}

// 3) 분노 페이즈
{
  const b = new BossBattle(BOSSES[0], newProfile(), new DummyController(), 1);
  b.phase = 'fight';
  b.bossFighter.hp = Math.floor(b.bossFighter.maxHp / 2);
  const pw = b.bossFighter.power;
  b.step();
  check('enrage at 50%', b.enraged && b.bossFighter.power > pw);
}

// 4) 클리어 보상이 프로필(레벨)에 반영
{
  const prof = newProfile();
  const b = new BossBattle(BOSSES[0], prof, new DummyController(), 1);
  b.phase = 'fight';
  b.bossFighter.hp = 0;
  b.step();
  check('victory rewards', b.result?.win === true && prof.level > 1 && prof.gold === 230 && prof.bossClears.goblinKing === 1,
    `(Lv.${prof.level}, ${prof.gold}G)`);
  const b2 = new BossBattle(BOSSES[0], prof, new DummyController(), 1);
  b2.phase = 'fight'; b2.bossFighter.hp = 0; b2.step();
  check('repeat clear: no first bonus', b2.result?.firstClear === false && b2.result.gold === 80);
}

// 5) 권장 레벨 CPU 플레이어(어려움 봇: 가드·반격함)로 실제 전투
for (const boss of BOSSES) {
  let wins = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const prof = newProfile();
    prof.level = boss.recommendedLevel;
    const b = new BossBattle(boss, prof, new CpuController(seed, 0, 'hard'), seed);
    for (let f = 0; f < (boss.timeLimit + 5) * 60 && !b.result; f++) b.step();
    if (b.result?.win) wins++;
    if (seed <= 3) console.log(`      seed ${seed}: ${b.result?.win ? 'WIN' : 'LOSE'} boss ${b.bossFighter.hp}/${b.bossFighter.maxHp} player ${b.player.hp}/${b.player.maxHp} t=${b.result?.clearTime.toFixed(0)}s`);
  }
  console.log(`INFO  ${boss.name} (Lv.${boss.recommendedLevel}) — CPU 봇 승률 ${wins}/10`);
  // 권장 레벨보다 2 높으면 잘하는 봇은 꽤 이겨야 한다 (못 깨는 벽이 되면 안 됨)
  let over = 0;
  for (let seed = 11; seed <= 20; seed++) {
    const prof = newProfile();
    prof.level = boss.recommendedLevel + 2;
    const b = new BossBattle(boss, prof, new CpuController(seed, 0, 'hard'), seed);
    for (let f = 0; f < (boss.timeLimit + 5) * 60 && !b.result; f++) b.step();
    if (b.result?.win) over++;
  }
  check(`${boss.name}: 권장 Lv+2 면 깰 수 있다`, over >= 3, `(어려움 봇 ${over}/10)`);
}

// 생활 수치: 보스전 중에도 쌓이고, 배고프면 느려진다
{
  const prof = newProfile();
  prof.life.hunger = 95;
  const b = new BossBattle(BOSSES[0], prof, new DummyController(), 1);
  b.phase = 'fight';
  const f0 = prof.life.fatigue;
  for (let i = 0; i < 120; i++) b.step();
  check('boss life stats tick', prof.life.fatigue > f0 && b.player.moveScale < 1 && b.hud().hunger >= 95, `(피로 ${f0} → ${prof.life.fatigue.toFixed(2)}, moveScale ${b.player.moveScale})`);
}

// 데이터 정합성: 보스·몬스터가 쓰는 기술이 실제로 있고, 연결 기술도 있고, 보스는 권장 레벨 순서
{

  const bad: string[] = [];
  for (const b of BOSSES) for (const w of [...b.moves, ...b.enrageMoves]) if (!MOVES[w.id]) bad.push(`보스 ${b.id}: ${w.id}`);
  for (const m of Object.values(MONSTERS)) for (const id of m.moves) if (!MOVES[id]) bad.push(`몬스터 ${m.id}: ${id}`);
  for (const s of FIELD_SPAWNS) if (!MONSTERS[s.type]) bad.push(`스폰: ${s.type}`);
  for (const m of Object.values(MOVES)) {
    for (const c of m.cancels ?? []) if (!MOVES[c.into]) bad.push(`${m.id} → ${c.into}`);
    if (m.chain && !MOVES[m.chain.into]) bad.push(`${m.id} chain → ${m.chain.into}`);
  }
  if (new Set(BOSSES.map((b) => b.id)).size !== BOSSES.length) bad.push('보스 id 중복');
  for (let i = 1; i < BOSSES.length; i++) if (BOSSES[i].recommendedLevel <= BOSSES[i - 1].recommendedLevel) bad.push('보스 권장 레벨 순서');
  check('보스·몬스터 데이터 정합성', bad.length === 0, bad.join(', '));
}

// 최단 기록: 처음 깰 땐 신기록 표시 없음, 더 빨리 깨면 신기록, 더 느리면 아님
{
  const prof = newProfile();
  const clearAfter = (frames: number) => {
    const b = new BossBattle(BOSSES[0], prof, new DummyController(), 1);
    b.phase = 'fight';
    for (let i = 0; i < frames; i++) b.step();
    b.bossFighter.hp = 0;
    for (let i = 0; i < 5 && !b.result; i++) b.step();
    return b.result!;
  };
  const r1 = clearAfter(600), r2 = clearAfter(120), r3 = clearAfter(900);
  check('최단 기록: 첫 클리어는 비교 대상 없음', r1.win && !r1.newRecord);
  check('최단 기록: 더 빨리 깨면 신기록', r2.newRecord === true && prof.bossBest[BOSSES[0].id] === Math.round(r2.clearTime * 100) / 100, `(${r1.clearTime.toFixed(1)}s → ${r2.clearTime.toFixed(1)}s)`);
  check('최단 기록: 더 느리면 신기록 아님', !r3.newRecord);
}
