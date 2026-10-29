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
