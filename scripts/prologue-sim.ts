// 차원 첫 접속 프롤로그: 떨어짐 → 정신 차림 → 숲길 → 그림자 → 도망 → 벼랑 → (맞서기) → 뛰어내림 (npm run test:prologue)
import { PrologueWorld, CLIFF_Z, type ProloguePhase } from '../src/game/story/prologue';
import { newProfile } from '../src/game/core/profile';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import type { FieldCommand } from '../src/game/core/field';
import { PROLOGUE_SCRIPT, RESCUE_SCRIPT } from '../src/game/data/prologueScript';
import { VILLAGE_NPCS } from '../src/game/data/village';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

let cmd: FieldCommand = { move: null, input: NEUTRAL_INPUT };
const w = new PrologueWorld({ read: () => cmd }, newProfile());
const seen = new Set<ProloguePhase>();
const run = (n: number, until?: () => boolean) => {
  for (let i = 0; i < n && !(until?.() ?? false); i++) {
    w.step();
    seen.add(w.phase);
  }
};

// 하늘에서 떨어져 땅에 닿으면 정신 차리는 대사
check('starts falling from the sky', w.phase === 'fall' && w.player.y > 10);
run(30);
check('flails arms and legs while falling', w.player.freefall === 1 && w.player.y > 50);
run(400, () => w.phase !== 'fall');
check('crashes into the ground and lies there', w.phase === 'landed' && w.player.y === 0 && w.player.state === 'knockdown' && w.player.freefall === 0 && !!w.impact);
run(400, () => w.phase === 'wake');
check('gets up, then wakes up (talk)', w.phase === 'wake' && w.player.y === 0 && w.talking && w.player.state !== 'knockdown');
// 대사 중엔 움직이지 않는다
cmd = { move: { x: 0, z: -1 }, run: true, input: NEUTRAL_INPUT };
const z0 = w.player.z;
run(30);
check('no walking while talking', Math.abs(w.player.z - z0) < 0.01);
w.finishTalk();
check('talk done → explore', w.phase === 'explore');

// 숲길을 걸으면 등 뒤에서 그림자가 나타난다
cmd = { move: { x: 0, z: -1 }, run: false, input: NEUTRAL_INPUT };
run(60 * 20, () => w.phase === 'encounter');
check('shadow appears behind on the path', w.phase === 'encounter' && w.beastOut && w.beast.z > w.player.z, `(z ${w.player.z.toFixed(1)})`);
w.finishTalk();
check('encounter talk → chase', w.phase === 'chase');

// 걸으면 따라잡혀 맞지만 쓰러지지 않는다
const hp0 = w.player.hp;
run(60 * 6);
check('walking gets caught (takes hits) but never dies', w.player.hp < hp0 && w.player.hp > 0, `(HP ${w.player.hp}/${w.player.maxHp})`);

// 달리면(Shift) 벼랑 끝까지 도망친다
cmd = { move: { x: 0, z: -1 }, run: true, input: NEUTRAL_INPUT };
run(60 * 40, () => w.phase === 'cliff');
check('running reaches the cliff edge', w.phase === 'cliff' && w.player.z < CLIFF_Z + 3.5 && w.player.z >= CLIFF_Z + 0.4, `(z ${w.player.z.toFixed(1)})`);
check('cannot walk off the cliff by yourself', (() => { run(120); return w.player.z >= CLIFF_Z + 0.4; })());

// 맞서 싸운다 → 주먹이 안 통해 다시 몰린다
w.choose(false);
run(60 * 8, () => w.phase === 'cornered');
check('fighting back does nothing → cornered again', w.phase === 'cornered' && w.beast.hp === w.beast.maxHp);

// 뛰어내린다 → 끝
w.choose(true);
run(60 * 10, () => w.phase === 'done');
check('jumps off the cliff and falls into the dark', w.phase === 'done' && w.player.z < CLIFF_Z && w.player.y < -50);
check('every phase was played', (['fall', 'landed', 'wake', 'explore', 'encounter', 'chase', 'cliff', 'fight', 'cornered', 'jump', 'done'] as ProloguePhase[]).every((p) => seen.has(p)), [...seen].join('→'));

// 대사: 말하는 사람이 모두 초상화를 가질 수 있는 사람 (나 · 그림자 · 마을 사람)
const speakers = new Set([...Object.values(PROLOGUE_SCRIPT).flat(), ...RESCUE_SCRIPT].map((l) => l.who));
check('every speaker is me, the shadow, or a villager (portrait rule)', [...speakers].every((s) => s === 'me' || s === 'beast' || VILLAGE_NPCS.some((n) => n.id === s)), [...speakers].join(','));
check('the first waking lines use the new hurt face', PROLOGUE_SCRIPT.wake[0].face === 'hurt' && RESCUE_SCRIPT.some((l) => l.who === 'me' && l.face === 'hurt'));
check('a villager rescues you below the cliff', RESCUE_SCRIPT[0].who !== 'me' && RESCUE_SCRIPT.some((l) => l.text.includes('벼랑')));
