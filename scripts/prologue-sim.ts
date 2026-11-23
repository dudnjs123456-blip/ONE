// 차원 첫 접속 프롤로그: 빛기둥 스폰 → "게임이다" → 숲길 → 그림자 → 도망 → 벼랑 → (맞서기) → 뛰어내림 (npm run test:prologue)
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

// 게임 캐릭터처럼 빛기둥 속에서 땅 위에 나타난다 (떨어지지 않는다). 게임 화면(HUD)은 다 켜져 있다
check('spawns standing on the ground in a light pillar', w.phase === 'spawn' && w.player.y === 0 && w.spawnT === 0);
check('full fake game HUD at the start', w.hudLevel === 3 && !w.hudGlitch);
run(400, () => w.phase === 'wake');
check('pillar fades → "this is a game" talk', w.phase === 'wake' && w.talking && w.spawnT === 1 && w.player.y === 0);
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
check('HUD starts glitching when the shadow appears', w.hudGlitch && w.hudLevel === 3);
w.finishTalk();
check('encounter talk → chase', w.phase === 'chase');

// 걸으면 따라잡혀 맞지만 쓰러지지 않는다
const hp0 = w.player.hp;
run(60 * 6);
check('chasing strips the HUD: quest, then minimap', w.hudLevel === 1);
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
check('the game HUD is completely gone after the jump', w.hudLevel === 0);
check('every phase was played', (['spawn', 'wake', 'explore', 'encounter', 'chase', 'cliff', 'fight', 'cornered', 'jump', 'done'] as ProloguePhase[]).every((p) => seen.has(p)), [...seen].join('→'));

// 대사: 말하는 사람이 모두 초상화를 가질 수 있는 사람 (나 · 그림자 · 마을 사람)
const speakers = new Set([...Object.values(PROLOGUE_SCRIPT).flat(), ...RESCUE_SCRIPT].map((l) => l.who));
check('every speaker is me, the shadow, or a villager (portrait rule)', [...speakers].every((s) => s === 'me' || s === 'beast' || VILLAGE_NPCS.some((n) => n.id === s)), [...speakers].join(','));
check('in the forest you still believe it is a game', PROLOGUE_SCRIPT.wake.some((l) => l.text.includes('그래픽')) && PROLOGUE_SCRIPT.cliff.some((l) => l.text.includes('어차피 게임')));
check('no "sucked into the monitor" any more', ![...Object.values(PROLOGUE_SCRIPT).flat(), ...RESCUE_SCRIPT].some((l) => l.text.includes('빨려')));
check('waking in the village: the pain breaks the belief (hurt face)', RESCUE_SCRIPT.some((l) => l.who === 'me' && l.face === 'hurt' && l.text.includes('아파')));
check('a villager rescues you below the cliff', RESCUE_SCRIPT[0].who !== 'me' && RESCUE_SCRIPT.some((l) => l.text.includes('벼랑')));
