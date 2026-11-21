// 필드 자동사냥 헤드리스 검증: npx tsx scripts/field-sim.ts [분]
import { FieldWorld, inVillage } from '../src/game/core/field';
import { VILLAGE_NPCS } from '../src/game/data/village';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';

const minutes = Number(process.argv[2] ?? 5);
const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile());
w.auto = true;
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
{
  // 이번 사냥 요약: 새 프로필이라 처치·골드가 그대로 같아야 한다
  const ss = w.hud().session;
  const ok = ss.kills === w.profile.kills && ss.gold === w.profile.gold && ss.exp > 0 && ss.seconds === Math.floor(w.frame / 60) && ss.deaths <= deaths;
  console.log(`${ok ? 'PASS' : 'FAIL'}  이번 사냥 요약 (처치 ${ss.kills}, +${ss.exp} EXP, +${ss.gold} G, ${ss.seconds}초, 사망 ${ss.deaths})`);
  if (!ok) process.exitCode = 1;
}

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
  w2.auto = true;
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

// 같은 차원 두 사람: 먼저 들어온 A 가 몬스터를 계산하고, B 는 받은 장면을 따른다.
// B 의 타격은 A 에게, 몬스터가 B 를 때린 건 B 에게, 같이 잡은 몬스터는 둘 다 보상을 받는다. A 가 나가면 B 가 이어서 계산한다.
{
  const mk = (id: string, at: number) => {
    const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile(), at, true);
    w.auto = true;
    w.netId = id;
    w.joinedAt = at;
    return w;
  };
  const A = mk('a', 100);
  const B = mk('b', 200);
  A.upsertHunter('b', 'B', 200);
  B.upsertHunter('a', 'A', 100);
  A.netReady = B.netReady = true;
  let strikes = 0, hits = 0, kills = 0, bKillMsgs = 0;
  for (let f = 0; f < 4 * 3600; f++) {
    A.step();
    B.step();
    A.applyHunterState('b', B.netState());
    B.applyHunterState('a', A.netState());
    if (f % 6 === 0) B.applyMonsters(A.netMonsters());
    for (const h of A.strikeOut.splice(0)) if (h.to === 'b') { strikes++; B.receiveStrike(h); }
    for (const h of B.hitOut.splice(0)) if (h.to === 'a') { hits++; A.receiveHunterHit('b', h); }
    for (const k of A.killOut.splice(0)) { kills++; if (k.who.includes('b')) bKillMsgs++; B.receiveKill(k); }
    B.killOut.length = 0;
    A.hitOut.length = 0;
  }
  B.applyMonsters(A.netMonsters());
  const sameIds = A.monsters.map((m) => m.id).sort().join(',') === B.monsters.map((m) => m.id).sort().join(',');
  const ok = A.isHost && !B.isHost && sameIds && hits > 0 && strikes > 0 && B.profile.kills > 0 && A.profile.kills > 0 && bKillMsgs > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  shared dimension (A 처치 ${A.profile.kills}, B 처치 ${B.profile.kills}, B→A 타격 ${hits}, 몬스터→B ${strikes}, 처치 알림 ${kills}, 같은 몬스터 ${sameIds})`);
  if (!ok) process.exitCode = 1;

  // A 가 나갔다: B 가 받은 장면에서 이어서 몬스터를 계산한다
  B.removeHunter('a');
  const before = B.profile.kills;
  for (let f = 0; f < 3 * 3600; f++) B.step();
  const ok2 = B.isHost && B.profile.kills > before && B.monsters.length > 0;
  console.log(`${ok2 ? 'PASS' : 'FAIL'}  host hand-over (B 가 이어서 계산, 처치 ${before} → ${B.profile.kills}, 몬스터 ${B.monsters.length})`);
  if (!ok2) process.exitCode = 1;
}

// 접속했는데 아직 누가 있는지 모르면 몬스터를 만들지 않는다 (먼저 온 사람 장면을 받아야 하므로)
{
  const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile(), 5, true);
  w.netId = 'z';
  for (let f = 0; f < 120; f++) w.step();
  const waited = w.monsters.length === 0;
  w.netReady = true;
  for (let f = 0; f < 5; f++) w.step();
  const ok = waited && w.monsters.length > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  wait for presence before spawning (기다리는 동안 ${waited ? '0' : '있음'}, 확인 후 ${w.monsters.length})`);
  if (!ok) process.exitCode = 1;
}

// 경계 마을: 포탈 앞에서 시작하고, 몬스터는 마을에 들어오지 못하며 마을 안 사람은 쫓지 않는다.
// NPC 에게 말을 걸면 처음엔 첫 인사, 대화를 마치면 만난 사람으로 남고, 여관 주인은 HP 를 채워 준다.
{
  const prof = newProfile();
  const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), prof);
  const startIn = inVillage(w.player.x, w.player.z) && !w.auto;
  let intrude = false;
  let hurt = false;
  for (let f = 0; f < 3 * 3600; f++) {
    w.step();
    if (w.monsters.some((m) => inVillage(m.fighter.x, m.fighter.z))) intrude = true;
    if (w.player.hp < w.player.maxHp) hurt = true;
  }
  const noa = VILLAGE_NPCS.find((n) => n.id === 'noa')!;
  w.player.x = noa.x;
  w.player.z = noa.z + 1.2;
  w.step();
  const near = w.hud().npc?.id === 'noa' && w.hud().npc?.met === false;
  const t1 = w.talk();
  w.endTalk();
  const t2 = w.talk();
  w.endTalk();
  const dallae = VILLAGE_NPCS.find((n) => n.id === 'dallae')!;
  w.player.x = dallae.x + 1.2;
  w.player.z = dallae.z;
  w.player.hp = 10;
  w.step();
  w.talk();
  w.endTalk();
  const ok =
    startIn && !intrude && !hurt && near &&
    t1?.first === true && t1.lines.length === noa.first.length &&
    t2?.first === false && t2.lines.length === 1 &&
    w.player.hp === w.player.maxHp && prof.dimension?.met?.includes('noa') === true && prof.dimension?.met?.includes('dallae') === true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  village (시작 ${startIn}, 몬스터 침입 ${intrude}, 마을에서 다침 ${hurt}, 노아 근처 ${near}, 첫 인사 ${t1?.lines.length}줄, 다시 ${t2?.lines.length}줄, 여관 HP ${w.player.hp}/${w.player.maxHp}, 만남 ${prof.dimension?.met})`);
  if (!ok) process.exitCode = 1;
}

// 쓰러지면 마을 포탈 앞에서 깨어난다
{
  const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile());
  w.player.x = 0;
  w.player.z = 0;
  w.player.hp = 0;
  w.player.state = 'ko';
  for (let f = 0; f < 400 && !(w.player.hp > 0); f++) w.step();
  const ok = w.player.hp > 0 && inVillage(w.player.x, w.player.z);
  console.log(`${ok ? 'PASS' : 'FAIL'}  respawn in village (${w.player.x.toFixed(1)}, ${w.player.z.toFixed(1)})`);
  if (!ok) process.exitCode = 1;
}
