// 필드 자동사냥 헤드리스 검증: npx tsx scripts/field-sim.ts [분]
import { FieldWorld } from '../src/game/core/field';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';

const minutes = Number(process.argv[2] ?? 5);
const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile());
let deaths = 0;
let wasDead = false;
for (let f = 0; f < minutes * 60 * 60; f++) {
  w.step();
  const dead = w.player.hp <= 0;
  if (dead && !wasDead) deaths++;
  wasDead = dead;
  if (f % (60 * 60) === 0 && f > 0) console.log(`${f / 3600}분: Lv.${w.level} kills=${w.profile.kills} gold=${w.profile.gold} hp=${w.player.hp}/${w.player.maxHp} deaths=${deaths}`);
}
console.log(`결과 ${minutes}분: Lv.${w.level} EXP ${w.profile.exp} kills=${w.profile.kills} gold=${w.profile.gold} deaths=${deaths}`);
console.log('최근 로그:', w.log.slice(-5).map((l) => l.text).join(' / '));
if (w.profile.kills === 0) process.exitCode = 1;

// 생활 수치: 사냥 중에도 피로·배고픔이 쌓이고, 지치면 느려진다
{
  const before = { f: w.profile.life.fatigue, h: w.profile.life.hunger };
  w.profile.life.fatigue = 90;
  for (let i = 0; i < 60; i++) w.step();
  const ok = w.profile.life.hunger > before.h && w.player.moveScale < 1 && w.hud().fatigue >= 90;
  console.log(`${ok ? 'PASS' : 'FAIL'}  field life stats tick (hunger ${before.h.toFixed(1)} → ${w.profile.life.hunger.toFixed(1)}, moveScale ${w.player.moveScale})`);
  if (!ok) process.exitCode = 1;
}

// 자동사냥 사냥감 고르기: 레벨이 높으면 흑기사(Lv.9)도 잡으러 가고, 죽지 않는다
{
  const prof = newProfile();
  prof.level = 9;
  const w2 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), prof);
  const seen = new Set<number>();
  let knights = 0, goblins = 0, died = false;
  for (let f = 0; f < 8 * 3600; f++) {
    w2.step();
    for (const l of w2.log) if (!seen.has(l.id)) { seen.add(l.id); if (l.text.startsWith('흑기사 처치')) knights++; if (l.text.startsWith('고블린 처치')) goblins++; }
    if (w2.player.hp <= 0) died = true;
  }
  const ok = knights >= 3 && !died;
  console.log(`${ok ? 'PASS' : 'FAIL'}  auto-hunt picks level-appropriate prey (Lv.9 8분: 흑기사 ${knights}, 고블린 ${goblins}, 사망 ${died ? '있음' : '없음'})`);
  if (!ok) process.exitCode = 1;
}

// 보스 권장 레벨에 닿으면 필드 기록에 도전 안내가 뜬다 (Lv.3 → 고블린 킹)
{
  const prof = newProfile();
  const w3 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), prof);
  let notice = '';
  const seen = new Set<number>();
  for (let f = 0; f < 6 * 3600 && !notice; f++) {
    w3.step();
    for (const l of w3.log) if (!seen.has(l.id)) { seen.add(l.id); if (l.text.includes('고블린 킹')) notice = l.text; }
  }
  const ok = !!notice && w3.level >= 3;
  console.log(`${ok ? 'PASS' : 'FAIL'}  boss-ready notice at Lv.3 (${notice || '없음'})`);
  if (!ok) process.exitCode = 1;
}
