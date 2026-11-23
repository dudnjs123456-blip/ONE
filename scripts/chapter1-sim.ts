// 1장 「기운 수련」: 단계 순서 · 사건 · 근 감정(실제 생활 기록) · 고블린 의뢰 · 도하 등장 조건 · 초상화 규칙 (npm run test:chapter1)
import { FieldWorld } from '../src/game/core/field';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';
import { VILLAGE_NPCS } from '../src/game/data/village';
import { startCh0 } from '../src/game/story/chapter0';
import {
  QUEST_GOAL,
  ROOT_INFO,
  afterScene,
  ch1Objective,
  ch1Scene,
  ch1SceneForNpc,
  cleanSkillName,
  countQuestKill,
  finishCh1,
  readRoot,
  sceneOnLogout,
  startCh1,
  type Ch1SceneId,
} from '../src/game/story/chapter1';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const p = newProfile();
const s = startCh1();
check('chapter 1 starts with bawi training', s.step === 'start' && ch1SceneForNpc('bawi', s, p)?.id === 'intro');
check('nobody else has a chapter-1 scene yet', ['noa', 'maru', 'doha', 'kong', 'dallae'].every((n) => ch1SceneForNpc(n, s, p) === null));
check('training 1 is the guard minigame, then the "hurt" scene', afterScene('intro').effect === 'guard' && afterScene('intro').next === 'guarded');
finishCh1(s, 'intro');
finishCh1(s, 'guarded');
check('then you must go back to Seoul (logout)', s.step === 'toSeoul' && ch1Objective(s)?.kind === 'logout');
check('logging out plays the bruise scene first', sceneOnLogout(s) === 'bruise');
check('bruise scene: same spot as the wooden sword', ch1Scene('bruise', s, p).lines.some((l) => l.text.includes('멍')));
const a = finishCh1(s, 'bruise');
check('after the bruise scene, actually log out', a.effect === 'exit' && s.step === 'back' && sceneOnLogout(s) === null);
check('training 2 is the breath minigame, then the portal quake', ch1SceneForNpc('bawi', s, p)?.id === 'breath' && afterScene('breath').effect === 'breath' && afterScene('breath').next === 'quake');
check('quake scene: logout does not work', ch1Scene('quake', s, p).lines.some((l) => l.text.includes('로그아웃')));
finishCh1(s, 'breath');
finishCh1(s, 'quake');
check('then noa reads your root', s.step === 'noa' && ch1SceneForNpc('noa', s, p)?.id === 'read');

// 근 감정: 실제 생활 기록 중 가장 많이 한 쪽
check('no records → 력 (fighting games)', readRoot(newProfile()).root === '력');
const fisher = newProfile();
fisher.fishing = { rods: [], rod: null, bait: {}, use: null, basket: [], dex: { carp: { n: 9, best: 40, first: 1 }, bass: { n: 4, best: 30, first: 2 } } } as never;
const fr = readRoot(fisher);
check('a fisher gets 공, and noa names the real catch count', fr.root === '공' && fr.fact.includes('13'), fr.fact);
const worker = newProfile();
worker.jobs = { cafe: { shifts: 12, earned: 100 } };
check('a part-timer gets 형', readRoot(worker).root === '형');
const keeper = newProfile();
keeper.pets = { list: [{}, {}] as never, walking: null };
check('a pet keeper gets 생', readRoot(keeper).root === '생');
check('시 never comes from daily life', [newProfile(), fisher, worker, keeper].every((x) => readRoot(x).root !== '시'));
const rs = ch1Scene('read', s, fisher);
check('reading sets the root and says it', s.root === '공' && rs.lines.some((l) => l.text.includes('「공(空)」')));
finishCh1(s, 'read');
check('then meet doha', s.step === 'doha' && ch1SceneForNpc('doha', s, p)?.id === 'doha');
check('doha came by a different passage (last subway car)', ch1Scene('doha', s, p).lines.some((l) => l.text.includes('지하철')));
finishCh1(s, 'doha');

// 고블린 의뢰
check('goblin quest starts at 0/3', s.step === 'quest' && s.questKills === 0 && ch1Objective(s)?.label.includes(`0/${QUEST_GOAL}`));
check('other monsters do not count', countQuestKill(s, 'bandit') === false && s.questKills === 0);
check('goblins count, third one triggers', !countQuestKill(s, 'goblin') && !countQuestKill(s, 'goblin') && countQuestKill(s, 'goblin') && s.questKills === 3);
check('no more counting after 3', !countQuestKill(s, 'goblin') && s.questKills === 3);
check('kong scream → root burst → name it', afterScene('scream').effect === 'burst' && afterScene('scream').next === 'awaken' && afterScene('awaken').effect === 'name');
check('skill names are 1–12 chars', cleanSkillName('  한 걸음   너머 ') === '한 걸음 너머' && cleanSkillName('') === null && cleanSkillName('가'.repeat(13)) === null);
s.skillName = '한 걸음 너머';
check('noa repeats the name you chose', ch1Scene('named', s, p).lines[0].text.includes('「한 걸음 너머」'));
finishCh1(s, 'scream');
finishCh1(s, 'awaken');
finishCh1(s, 'named');
check('then the badge from maru', s.step === 'badge' && ch1SceneForNpc('maru', s, p)?.id === 'badge' && afterScene('badge').next === 'final');
finishCh1(s, 'badge');
finishCh1(s, 'final');
check('chapter 1 done: "this is not a game"', s.step === 'done' && ch1Objective(s) === null && ch1Scene('final', s, p).lines.some((l) => l.text.includes('게임이 아니야')));
check('every root has a suggested name', Object.values(ROOT_INFO).every((r) => r.suggest.length > 0));

// 대사: 말하는 사람은 모두 나 아니면 마을 사람 (초상화를 찍을 수 있는 사람만)
const ids: Ch1SceneId[] = ['intro', 'guarded', 'bruise', 'breath', 'quake', 'read', 'doha', 'scream', 'awaken', 'named', 'badge', 'final'];
const sp = new Set(ids.flatMap((id) => ch1Scene(id, s, p).lines.map((l) => l.who)));
check('every speaker is me or a villager (portrait rule)', [...sp].every((w) => w === 'me' || VILLAGE_NPCS.some((n) => n.id === w)), [...sp].join(','));
const all = ids.flatMap((id) => ch1Scene(id, s, p).lines.map((l) => l.text)).join(' ');
check('undecided world name is not written anywhere', !/(^|[^가-힣])(리엔|에델|아르세)/.test(all));

// 도하는 0장을 마친 사람에게만 보인다
const p0 = newProfile();
p0.dimension = { visits: 1, prologue: true, ch0: startCh0(1, true) };
const w0 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), p0);
check('doha hidden during chapter 0', !w0.npcs.some((n) => n.def.id === 'doha'));
p0.dimension.ch0!.done = true;
const w1 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), p0);
check('doha appears after chapter 0', w1.npcs.some((n) => n.def.id === 'doha'));
// 자동진행으로 도하 앞까지 걸어간다
w1.player.reset(-6.7, 31.3, 0, -1);
w1.walkToNpc('doha');
let fr2 = 0;
while (!w1.questArrived && fr2 < 60 * 20) {
  w1.step();
  fr2++;
}
check('auto walk reaches doha', w1.questArrived === 'doha' && w1.nearbyNpc()?.def.id === 'doha', `(${(fr2 / 60).toFixed(1)}s)`);
// 몬스터를 잡으면 onKill 이 불린다 · 근 폭발은 둘레 몬스터를 밀어낸다
const seen: string[] = [];
w1.onKill = (id) => seen.push(id);
(w1 as unknown as { grantKill: (t: { id: string; name: string; exp: number; gold: number }, x: number, z: number) => void }).grantKill({ id: 'goblin', name: '고블린', exp: 1, gold: 1 }, 0, 0);
check('kill hook reports the monster id', seen[0] === 'goblin');
const m = w1.monsters[0];
if (m) {
  w1.player.reset(m.fighter.x + 1, m.fighter.z, -1, 0);
  const d0 = Math.hypot(m.fighter.x - w1.player.x, m.fighter.z - w1.player.z);
  w1.rootBurst('력(力) 발현!');
  const d1 = Math.hypot(m.fighter.x - w1.player.x, m.fighter.z - w1.player.z);
  check('root burst pushes nearby monsters away', d1 > d0 + 2, `(${d0.toFixed(1)} → ${d1.toFixed(1)}m)`);
}
