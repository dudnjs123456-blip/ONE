// 박 반장 대화 헤드리스 검증: npx tsx scripts/npc-sim.ts
import { CityWorld, LOBBY, type CityInput } from '../src/game/city/cityWorld';
import { applyReply, ask, buildContext, greeting } from '../src/game/city/npcChat';

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
const spot = LOBBY.pois.find((p) => p.id === 'senior')!;
for (let i = 0; i < 400; i++) {
  const dx = spot.x - w.player.x;
  const dz = spot.z - w.player.z;
  cmd = { move: Math.hypot(dx, dz) > 0.2 ? { x: dx, z: dz } : null, run: false, interact: false };
  w.step();
}
check('can walk up to 박 반장', Math.hypot(spot.x - w.player.x, spot.z - w.player.z) < spot.radius, `(${w.player.x.toFixed(2)}, ${w.player.z.toFixed(2)}) nearby=${w.nearby?.id}`);
check('박 반장 turns to face player (south)', w.senior.fz > 0.5 && Math.hypot(w.senior.fx, w.senior.fz) > 0.9, `(fx=${w.senior.fx.toFixed(2)} fz=${w.senior.fz.toFixed(2)})`);
cmd = { move: null, run: false, interact: true };
w.step();
check('E opens chat', w.npcChat?.npc === 'senior');
const x0 = w.player.x;
cmd = { move: { x: 1, z: 0 }, run: false, interact: false };
for (let i = 0; i < 30; i++) w.step();
check('player frozen while chatting', Math.abs(w.player.x - x0) < 1e-6);
check('player cannot walk through 박 반장', Math.hypot(w.player.x - LOBBY.senior.x, w.player.z - LOBBY.senior.z) > 0.4);
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
})();
