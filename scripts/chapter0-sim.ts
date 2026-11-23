// 0장 「저편에서 온 사람」: 의문 수첩 채우기 순서 · 북문 막기 · 서울 다녀오기 · 초상화 규칙 (npm run test:chapter0)
import { FieldWorld } from '../src/game/core/field';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';
import { VILLAGE, VILLAGE_NPCS, VILLAGE_SPOTS } from '../src/game/data/village';
import {
  CLUES,
  NOTES,
  finishScene,
  gateLocked,
  nextObjective,
  nextScene,
  notesComplete,
  scene,
  sceneForNpc,
  sceneForSpot,
  sceneOnArrive,
  startCh0,
  wakeScene,
  type SceneId,
} from '../src/game/story/chapter0';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

// 프롤로그에서 바로 이어진 새 사람
const s = startCh0(1, true);
check('starts knowing only half of "is this my real body?"', s.notes.body === 1 && !notesComplete(s) && !s.done);
check('fresh player cannot leave by the north gate yet', gateLocked(s));
check('old players are never locked at the gate', !gateLocked(startCh0(5, false)));

// 순서: 노아 · 바위는 마루 다음
check('noa sends you to the chief first', sceneForNpc('noa', s)?.id === 'noaEarly');
check('bawi blocks you before chief and noa', sceneForNpc('bawi', s)?.id === 'bawiEarly');
check('nothing new from dallae (she already rescued you)', sceneForNpc('dallae', s) === null);

// 살펴보기 · 콩이는 아무 때나
for (const sp of VILLAGE_SPOTS) finishScene(s, sceneForSpot(sp.id).id);
finishScene(s, sceneForNpc('kong', s)!.id);
check('all four village clues found', CLUES.every((c) => s.clues?.includes(c.id)));
check('kong has nothing more to tell after', sceneForNpc('kong', s) === null);

// 마루: 마음을 고르면 대답 + 수첩 두 줄
const m = sceneForNpc('maru', s)!;
check('chief scene ends with three choices', m.id === 'maru' && m.choices?.length === 3);
finishScene(s, 'maru', 'wonder');
check('chosen feeling is recorded', s.choice === 'wonder');
const after = nextScene(s, 'maru');
check('chief answers your choice, then explains', after === 'maruAfter' && scene('maruAfter', s).lines[0].who === 'maru');
const got = finishScene(s, 'maruAfter');
check('"where am I" and "can I go home" filled', got.includes('where') && got.includes('home') && s.notes.where === 2);

// 노아 → 바위 → 허수아비 → 마무리
check('noa now tells about the shadow', sceneForNpc('noa', s)?.id === 'noa');
finishScene(s, 'noa');
check('shadow note is only half known', s.notes.shadow === 1);
check('bawi now asks you to hit the dummy', sceneForNpc('bawi', s)?.id === 'bawi' && !!scene('bawi').choices);
check('hitting the dummy comes right after', nextScene(s, 'bawi') === 'bawiHit');
finishScene(s, 'bawiHit');
check('fist note filled → notebook complete', s.notes.fist === 2 && notesComplete(s));
check('closing scene plays when complete', nextScene(s, 'bawiHit') === 'end');
check('gate still locked until the closing scene ends', gateLocked(s));
finishScene(s, 'end');
check('chapter 0 done, gate opens, no more chapter scenes', s.done === true && !gateLocked(s) && VILLAGE_NPCS.every((n) => sceneForNpc(n.id, s) === null));
check('no closing scene twice', nextScene(s, 'end') === null);

// 서울 다녀오기 (선택): 접속 횟수가 늘면 달래가 마중
const r = startCh0(2, true);
check('no welcome-back on the same visit', sceneOnArrive(r, 2) === null);
const back = sceneOnArrive(r, 3);
check('after a trip to Seoul, dallae welcomes you back', back?.id === 'return' && back.lines.some((l) => l.who === 'dallae'));
finishScene(r, 'return');
check('body note fully known after the trip', r.notes.body === 2 && sceneOnArrive(r, 4) === null);

// 깨어난 직후: 실제 시각이 대사에 들어간다
check('wake monologue shows the real clock time', wakeScene('14:32').lines.some((l) => l.text.includes('14:32')));

// 대사: 말하는 사람은 모두 나 아니면 마을 사람 (초상화를 찍을 수 있는 사람만)
const ids: SceneId[] = ['return', 'kong', 'maru', 'maruAfter', 'noaEarly', 'noa', 'bawiEarly', 'bawi', 'bawiHit', 'end', 'board', 'well', 'book'];
const speakers = new Set(ids.flatMap((id) => scene(id, s).lines.map((l) => l.who)));
check('every speaker is me or a villager (portrait rule)', [...speakers].every((w) => w === 'me' || VILLAGE_NPCS.some((n) => n.id === w)), [...speakers].join(','));
check('every notebook question has an answer text', NOTES.every((n) => (n.half ?? n.full).length > 0));
// 아직 정하지 않은 설정은 못 박지 않는다 (세계 이름 후보가 대사에 없다)
const all = ids.flatMap((id) => scene(id, s).lines.map((l) => l.text)).join(' ');
check('undecided world name is not written anywhere', !/리엔|에델|아르세/.test(all));

// 필드: 새 사람은 북문 앞에서 멈추고, 자동사냥도 안 켜진다
const p = newProfile();
p.dimension = { visits: 1, prologue: true, ch0: startCh0(1, true) };
let cmd = { move: { x: 0, z: -1 } as { x: number; z: number } | null, run: true, input: NEUTRAL_INPUT };
const w = new FieldWorld({ read: () => cmd }, new AutoHuntController(), p);
w.player.reset(0, 27, 0, -1);
for (let i = 0; i < 60 * 6; i++) w.step();
check('walking north stops at the gate', w.player.z >= VILLAGE.z0 + 0.6, `(z ${w.player.z.toFixed(2)})`);
w.toggleAuto();
check('auto-hunt refuses to start', !w.auto && w.log.some((l) => l.text.includes('바위')));
p.dimension.ch0!.done = true;
for (let i = 0; i < 60 * 6; i++) w.step();
check('after chapter 0, the gate is open', w.player.z < VILLAGE.z0 - 1, `(z ${w.player.z.toFixed(2)})`);
cmd = { move: null, run: false, input: NEUTRAL_INPUT };

// 살펴볼 곳 앞에 서면 HUD 에 뜬다
const w2 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), p);
const board = VILLAGE_SPOTS.find((v) => v.id === 'board')!;
w2.player.reset(board.x - 1.2, board.z, 1, 0);
w2.step();
check('notice board shows "inspect" when close', w2.hud().spot?.id === 'board');

// 퀘스트 자동진행: 다음 할 일 순서 · 어디서 출발해도 그 사람 앞까지 걸어가 도착한다
{
  const q = startCh0(1, true);
  check('auto quest: first goes to chief maru', nextObjective(q)?.npc === 'maru');
  finishScene(q, 'maru', 'survive');
  finishScene(q, 'maruAfter');
  check('auto quest: then noa', nextObjective(q)?.npc === 'noa');
  finishScene(q, 'noa');
  check('auto quest: then bawi', nextObjective(q)?.npc === 'bawi');
  finishScene(q, 'bawiHit');
  finishScene(q, 'end');
  check('auto quest: nothing left after chapter 0', nextObjective(q) === null);

  const pq = newProfile();
  pq.dimension = { visits: 1, prologue: true, ch0: startCh0(1, true) };
  const wq = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), pq);
  // 깨어나는 여관 앞, 우물 뒤, 포탈 앞, 동쪽 집 옆에서 출발
  const starts = [
    { x: -6.7, z: 31.3 },
    { x: -5.2, z: 28.6 },
    { x: 0, z: 34.2 },
    { x: 8.4, z: 34.5 },
  ];
  for (const npc of ['maru', 'noa', 'bawi'] as const) {
    for (const st of starts) {
      wq.player.reset(st.x, st.z, 0, -1);
      wq.walkToNpc(npc);
      let f = 0;
      while (!wq.questArrived && f < 60 * 25) {
        wq.step();
        f++;
      }
      const near = wq.nearbyNpc()?.def.id;
      check(`auto walk ${npc} from (${st.x},${st.z}) arrives in talk range`, wq.questArrived === npc && near === npc, `(${(f / 60).toFixed(1)}s)`);
      wq.questArrived = null;
    }
  }
  // 방향키를 누르면 멈춘다
  let mv: { x: number; z: number } | null = null;
  const wm = new FieldWorld({ read: () => ({ move: mv, input: NEUTRAL_INPUT }) }, new AutoHuntController(), pq);
  wm.player.reset(-6.7, 31.3, 0, -1);
  wm.walkToNpc('maru');
  for (let i = 0; i < 30; i++) wm.step();
  mv = { x: 0, z: 1 };
  wm.step();
  check('pressing a direction key cancels auto walk', wm.questPath === null && wm.questCancelled && !wm.questArrived);
}
