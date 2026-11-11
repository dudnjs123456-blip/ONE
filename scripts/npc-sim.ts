// 박 반장 대화 헤드리스 검증: npx tsx scripts/npc-sim.ts
import { CityWorld, LOBBY, type CityInput } from '../src/game/city/cityWorld';
import { applyReply, ask, buildContext, greeting } from '../src/game/city/npcChat';
import { MOOD_LINES } from '../src/game/data/moodLines';
import { PLAYER_PORTRAITS } from '../src/game/data/portraits';
import { MOOD_FACE } from '../src/game/render/moodFace';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

let cmd: CityInput = { move: null, run: false, interact: false };
const w = new CityWorld({ read: () => cmd });
// 로비로 들어가서 박 반장 앞에 선다
const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
w.player.reset(lobby.x, lobby.z, 0, -1);
cmd = { move: null, run: false, interact: true };
w.step();
cmd = { move: null, run: false, interact: false };
for (let i = 0; i < 200 && w.doorway; i++) w.step();
check('enter lobby', w.location === 'lobby');
check('박 반장 sits in his office', w.seniorAI.seated && w.seniorAI.where === 1 && w.senior.x < LOBBY.office.x1);
const spot = w.seniorAI.poi()!;
// 데스크를 돌아 반장실 문으로 들어가 반장님 책상 앞에 선다
const o = LOBBY.office;
for (const t of [{ x: -2.0, z: -2.7 }, { x: o.x1 + 0.5, z: o.doorZ }, { x: o.x1 - 0.6, z: o.doorZ }, { x: -6.0, z: -1.7 }, spot]) {
  for (let i = 0; i < 400; i++) {
    const dx = t.x - w.player.x;
    const dz = t.z - w.player.z;
    if (Math.hypot(dx, dz) < 0.2) break;
    cmd = { move: { x: dx, z: dz }, run: false, interact: false };
    w.step();
  }
}
cmd = { move: null, run: false, interact: false };
w.step();
check('can walk up to 박 반장', Math.hypot(spot.x - w.player.x, spot.z - w.player.z) < spot.radius, `(${w.player.x.toFixed(2)}, ${w.player.z.toFixed(2)}) nearby=${w.nearby?.id}`);
check('박 반장 turns to face player (south)', w.senior.fz > 0.5 && Math.hypot(w.senior.fx, w.senior.fz) > 0.9, `(fx=${w.senior.fx.toFixed(2)} fz=${w.senior.fz.toFixed(2)})`);
cmd = { move: null, run: false, interact: true };
w.step();
check('E opens chat', w.npcChat?.npc === 'senior');
const x0 = w.player.x;
cmd = { move: { x: 1, z: 0 }, run: false, interact: false };
for (let i = 0; i < 30; i++) w.step();
check('player frozen while chatting', Math.abs(w.player.x - x0) < 1e-6);
check('player cannot walk through 박 반장', Math.hypot(w.player.x - w.senior.x, w.player.z - w.senior.z) > 0.4);
console.log('  greeting:', greeting(w, 'senior'));
const ctx = buildContext(w, 'senior');
check('context has time and bond', !!ctx.clock && ctx.affinity === 30 && ctx.canGift);

void (async () => {
// 오프라인 (서버 없음 → fetch 실패) 대사 + 반영
w.profile.life.fatigue = 80;
const r = await ask(w, 'senior', [{ role: 'user', content: '강도는 어떻게 상대해요?' }]);
console.log('  reply:', r.reply);
check('offline reply about fighting', !!r.offline && /잽|강도|도망/.test(r.reply));
const note = applyReply(w, 'senior', r);
check('tired → coffee once a day', !!note && w.profile.life.fatigue === 70, note ?? '');
const again = applyReply(w, 'senior', { ...r, gift: true });
check('no second coffee same day', again === null && w.profile.life.fatigue === 70);
applyReply(w, 'senior', { reply: 'x', emotion: '기쁨', affinity: 3, memory: '후배가 인사를 잘함', gift: false });
const bond = w.profile.npcs!.senior;
check('affinity & memory saved', bond.affinity === 33 && bond.memories.at(-1)?.text === '후배가 인사를 잘함' && bond.talks === 3);
w.closeNpcChat();
cmd = { move: { x: 1, z: 0 }, run: false, interact: false };
for (let i = 0; i < 30; i++) w.step();
check('can move after closing chat', Math.abs(w.player.x - x0) > 0.1);

// 순찰: 반장실에서 일어나 엘리베이터로 2층 ~ 꼭대기 층 복도를 돌고 돌아와 다시 앉는다
cmd = { move: null, run: false, interact: false };
w.seniorAI.startPatrol();
const visited = new Set<number>();
let maxFrames = 0;
for (let i = 0; i < 60 * 240 && w.seniorAI.patrolling; i++) {
  w.step();
  if (w.seniorAI.where >= 2) visited.add(w.seniorAI.where);
  maxFrames = i;
}
const all = Array.from({ length: w.villaFloors - 1 }, (_, k) => k + 2);
check('patrol visits every floor', all.every((f) => visited.has(f)), `visited=${[...visited].join(',')} (${(maxFrames / 60).toFixed(0)}s)`);
check('back to the office chair, seated', !w.seniorAI.patrolling && w.seniorAI.seated && Math.hypot(w.senior.x - o.chair.x, w.senior.z - o.chair.z) < 0.05);
// 순찰 중 대화 지점은 반장님을 따라다닌다
w.seniorAI.startPatrol();
for (let i = 0; i < 60 * 12; i++) w.step();
const pp = w.seniorAI.poi();
check('while patrolling the talk spot follows him', !pp || (pp.label.includes('순찰') && Math.hypot(pp.x - w.senior.x, pp.z - w.senior.z) < 1e-6), w.seniorAI.status);
})();

// 숫자 키 1~9 대사: 키마다 다른 기분 · 그 기분의 상반신 그림과 3D 표정이 다 있다
{
  const moods = MOOD_LINES.map((l) => l.mood);
  check('mood lines: 9 keys, 9 different moods', moods.length === 9 && new Set(moods).size === 9, `(${moods.join(',')})`);
  check('mood lines: every mood has a portrait', moods.every((m) => !!PLAYER_PORTRAITS.smallSilverGirl[m]));
  check('mood lines: every mood has a 3D face', moods.every((m) => !!MOOD_FACE[m]));
}
