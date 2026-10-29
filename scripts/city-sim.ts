// 도시 로직 헤드리스 검증: npx tsx scripts/city-sim.ts
import { CityWorld, CORRIDOR, HOME, LOBBY, type CityInput } from '../src/game/city/cityWorld';
import { LifeTracker } from '../src/game/core/life';
import { MOVES } from '../src/game/data/moves';
import { bjDeal, bjHit, bjStand, handValue, hlOdds, isBlackjack, rollSicBo, rouletteMultiplier, spinRoulette, spinSlots } from '../src/game/city/casino';
import { EQUIP_SLOTS, STARTER_GEAR, equipItem, unequipSlot } from '../src/game/data/equipment';
import type { PlayerProfile } from '../src/game/core/profile';
import { ROBBER_TIERS } from '../src/game/data/jobs';
import { GUARD_SHIFT_FRAMES } from '../src/game/city/guardJob';
import { dateOfDay, dayOfDate, shortDay } from '../src/game/city/calendar';
import { CITY_CONST } from '../src/game/city/cityMap';
import { crosswalks, vehicleLight, walkLight } from '../src/game/city/traffic';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

/** 진짜 동선으로 집에 들어간다: 빌라 현관 E → 1층 로비 → 엘리베이터로 내 층 → 내 집 문 E */
function enterHome(w: CityWorld, set: (c: CityInput) => void) {
  const press = (x: number, z: number) => {
    w.seat = null;
    w.player.reset(x, z, 0, -1);
    set({ move: null, run: false, interact: true });
    w.step();
    set({ move: null, run: false, interact: false });
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    w.step();
  };
  const door = w.map.pois.find((q) => q.id === 'lobby')!;
  press(door.x, door.z);
  press(LOBBY.pois.find((q) => q.id === 'elevator')!.x, LOBBY.pois.find((q) => q.id === 'elevator')!.z);
  w.rideElevator(Number(w.homeUnit.slice(0, -2)));
  press(CORRIDOR.doors[Number(w.homeUnit.slice(-1)) - 1], -1.0);
}

/** 복도 계단실로 걸어 들어간다 (down = 남쪽 반 내려가는 계단, 아니면 북쪽 반 올라가는 계단) */
function walkStairs(w: CityWorld, set: (c: CityInput) => void, down: boolean, frames = 300) {
  w.seat = null;
  w.player.reset(CORRIDOR.stairs.x1 + 0.4, down ? 0.75 : -0.75, -1, 0);
  const f0 = w.floor;
  const loc0 = w.location;
  set({ move: { x: -1, z: 0 }, run: false, interact: false });
  for (let i = 0; i < frames && w.location === loc0 && w.floor === f0; i++) w.step();
  set({ move: null, run: false, interact: false });
}

let cmd: CityInput = { move: null, run: false, interact: false };
const w = new CityWorld({ read: () => cmd });
const m = w.map;
console.log(`buildings=${m.buildings.length} pois=${m.pois.length} trees=${m.trees.length} lights=${m.lights.length} cars=${w.cars.length} npcs=${w.npcs.length}`);

// 1) 시작 위치는 집 앞, 건물 안이 아니다
const inside = (x: number, z: number) => m.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
w.step();
check('spawn outside buildings', !inside(w.player.x, w.player.z), `(${w.player.x.toFixed(1)}, ${w.player.z.toFixed(1)})`);

// 2) 집 문 앞에서 E → 집 안, 다시 현관에서 E → 밖
for (let i = 0; i < 40; i++) {
  const dz = m.home.z - w.player.z;
  const dx = m.home.x - w.player.x;
  cmd = { move: Math.hypot(dx, dz) > 0.3 ? { x: dx, z: dz } : null, run: false, interact: false };
  w.step();
}
check('villa door prompt', w.nearby?.id === 'lobby', `(nearby=${w.nearby?.id})`);
cmd = { move: null, run: false, interact: true };
w.step();
cmd = { move: null, run: false, interact: false };
check('door opens before entering', w.doorway?.kind === 'enter' && w.location === 'city');
for (let i = 0; i < 30; i++) w.step();
check('villa door swings open while walking in', w.villaDoorOpen > 0.9 && w.location === 'city', `(${w.villaDoorOpen.toFixed(2)})`);
for (let i = 0; i < 200 && w.doorway?.stage === 0; i++) w.step();
check('screen black at the switch', w.screenFade > 0.9, `(${w.screenFade.toFixed(2)})`);
for (let i = 0; i < 200 && w.doorway; i++) w.step();
check('lobby door closes behind', w.lobbyDoorOpen === 0 && w.screenFade === 0);
check('villa door enters lobby (not straight home)', w.location === 'lobby', `(${w.location})`);
{
  const setC = (c: CityInput) => (cmd = c);
  // 로비 계단을 걸어 올라가면 2층 복도
  w.player.reset((LOBBY.stairs.x0 + LOBBY.stairs.x1) / 2, LOBBY.stairs.z1 + 0.5, 0, -1);
  cmd = { move: { x: 0, z: -1 }, run: false, interact: false };
  let maxLift = 0;
  for (let i = 0; i < 300 && w.location === 'lobby'; i++) {
    w.step();
    maxLift = Math.max(maxLift, w.stairLift(w.player.x, w.player.z));
  }
  check('lobby stairs: walk up to 2F corridor', w.location === 'corridor' && w.floor === 2, `(${w.location} ${w.floor}F, 올라간 높이 ${maxLift.toFixed(2)}m)`);
  check('body rises on lobby stairs', maxLift > 0.5);
  walkStairs(w, setC, false);
  check('corridor stairs: walk up to 3F', w.location === 'corridor' && w.floor === 3, `(${w.floor}F)`);
  check('3F door shows my home', w['corridorPois']().some((q: { id: string }) => q.id === 'myDoor'));
  check('other doors show residents', w['corridorPois']().some((q: { id: string; label: string }) => q.id === 'door0' && /호 .+/.test(q.label)));
  w.player.reset(CORRIDOR.doors[1], -1.0, 0, -1);
  cmd = { move: null, run: false, interact: true };
  w.step();
  check('my door enters home', w.location === 'home');
  cmd = { move: null, run: false, interact: false };
  w.step();
  const ex = HOME.pois.find((q) => q.id === 'exit')!;
  w.player.reset(ex.x, ex.z, -1, 0);
  cmd = { move: null, run: false, interact: true };
  w.step();
  check('exit home → my floor corridor, in front of my door', w.location === 'corridor' && w.floor === 3 && Math.abs(w.player.x - CORRIDOR.doors[1]) < 0.3, `(${w.location} ${w.floor}F x=${w.player.x.toFixed(1)})`);
  cmd = { move: null, run: false, interact: false };
  w.step();
  walkStairs(w, setC, true);
  check('corridor stairs: walk down to 2F', w.location === 'corridor' && w.floor === 2);
  walkStairs(w, setC, true);
  check('2F stairs down → lobby', w.location === 'lobby');
  // 꼭대기 층은 옥상 계단이 막혀 있다
  w['goFloor'](w.villaFloors);
  walkStairs(w, setC, false, 200);
  check('top floor: roof stairs blocked', w.location === 'corridor' && w.floor === w.villaFloors && w.player.x > CORRIDOR.stairs.x1 - 0.2, `(x=${w.player.x.toFixed(2)})`);
  // 엘리베이터: 층 고르기 → 1층
  w.player.reset(-4.3, -1.0, 0, -1);
  cmd = { move: null, run: false, interact: true };
  w.step();
  cmd = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  check('elevator opens floor picker', w.elevatorOpen);
  w.rideElevator(1);
  check('elevator to lobby', w.location === 'lobby' && !w.elevatorOpen);
  // 로비 현관 → 빌라 앞
  w.player.reset(0.5, 3.5, 0, 1);
  cmd = { move: null, run: false, interact: true };
  w.step();
  cmd = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  check('lobby exit → in front of villa', w.location === 'city' && Math.hypot(w.player.x - m.home.x, w.player.z - m.home.z) < 2);
  for (let i = 0; i < 20; i++) w.step();
}

// 3) 건물로 달려가도 뚫고 들어가지 않는다
const target = m.buildings.find((b) => b.kind === 'apartment')!;
for (let i = 0; i < 1500; i++) {
  cmd = { move: { x: target.x - w.player.x, z: target.z - w.player.z }, run: true, interact: false };
  w.step();
}
check('no walking through buildings', !inside(w.player.x, w.player.z), `(dist to center ${Math.hypot(target.x - w.player.x, target.z - w.player.z).toFixed(1)})`);

// 4) 행인·차가 움직이고, 시간이 흐른다
const npc0 = { x: w.npcs[0].fighter.x, z: w.npcs[0].fighter.z };
const cars0 = w.cars.map((c) => ({ x: c.x, z: c.z }));
const t0 = w.minutes;
for (let i = 0; i < 300; i++) w.step();
check('npcs walk', Math.hypot(w.npcs[0].fighter.x - npc0.x, w.npcs[0].fighter.z - npc0.z) > 0.5);
const moved = w.cars.filter((c, i) => Math.hypot(c.x - cars0[i].x, c.z - cars0[i].z) > 5).length;
check('cars drive (most of them, some wait at red lights)', moved > w.cars.length * 0.5, `(${moved}/${w.cars.length})`);

// 4-1) 도로: 차도엔 못 들어가고 횡단보도로만 건넌다. 신호에 맞춰 차가 선다
{
  const { XS, ZS, ROAD_W } = CITY_CONST;
  const t = new CityWorld({ read: () => tcmd });
  let tcmd: CityInput = { move: null, run: false, interact: false };
  // 블록 가운데쯤 인도에서 남쪽(중앙로)으로 걸어 내려가도 차도 앞에서 막힌다
  const midX = (XS[0] + XS[1]) / 2;
  t.player.reset(midX, ZS[1] - ROAD_W / 2 - 1.5, 0, 1);
  tcmd = { move: { x: 0, z: 1 }, run: true, interact: false };
  for (let i = 0; i < 240; i++) t.step();
  check('cannot jaywalk across a road mid-block', t.player.z < ZS[1] - ROAD_W / 2 + 0.05, `(z ${t.player.z.toFixed(2)})`);
  // 횡단보도 위에서는 건너편까지 간다
  const cw = crosswalks().find((c) => c.road === 'x' && Math.abs((c.z0 + c.z1) / 2 - ZS[1]) < 0.5)!;
  const cx = (cw.x0 + cw.x1) / 2;
  t.player.reset(cx, cw.z0 - 1.2, 0, 1);
  for (let i = 0; i < 400; i++) t.step();
  check('crosswalk lets you cross', t.player.z > cw.z1 + 0.5, `(z ${t.player.z.toFixed(2)} → needs > ${cw.z1.toFixed(1)})`);
  // 신호: 동서 초록이면 남북 빨강, 보행 신호는 나란한 차와 같이
  check('signals alternate', vehicleLight('x', 1) === 'green' && vehicleLight('z', 1) === 'red' && vehicleLight('z', 20) === 'green' && vehicleLight('x', 20) === 'red');
  check('walk light follows parallel traffic', walkLight('z', 1) !== 'stop' && walkLight('x', 1) === 'stop' && walkLight('x', 20) !== 'stop');
  // 빨간불 동안 정지선 앞에 선 차가 있다
  const red = new CityWorld({ read: () => ({ move: null, run: false, interact: false }) });
  red.player.reset(red.map.home.x, red.map.home.z, 0, 1);
  // 남북 빨간불이 한참 이어진 때 (주기 14초쯤)
  while (red.signalSeconds < 36 + 14) red.step();
  check('north-south is red then', vehicleLight('z', red.signalSeconds) === 'red');
  const waiting = red.cars.filter((c) => c.dz !== 0 && c.v < 0.01 && c.stops.some((l) => { const d = (l - c.z) * c.dz; return d >= 0 && d < 1.5; })).length;
  check('cars stop at the stop line on red', waiting > 0, `(${waiting} waiting)`);
  // 지도 자동 이동은 길 건너 목적지까지 횡단보도로 돌아간다
  const nav = new CityWorld({ read: () => ({ move: null, run: false, interact: false }) });
  nav.player.reset(midX, ZS[1] - ROAD_W / 2 - 1.5, 0, 1);
  nav.navigateTo(midX, ZS[1] + ROAD_W / 2 + 1.5, '건너편');
  const path = nav.autopilot?.path ?? [];
  const onRoad = (x: number, z: number) => Math.abs(z - ZS[1]) < ROAD_W / 2 && !crosswalks().some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  let bad = 0;
  for (let i = 0; i < 2000 && nav.autopilot; i++) {
    nav.step();
    if (onRoad(nav.player.x, nav.player.z)) bad++;
  }
  check('auto-walk crosses at a crosswalk', path.length > 1 && bad === 0 && nav.player.z > ZS[1] + ROAD_W / 2, `(${path.length} waypoints, off-crosswalk frames ${bad}, z ${nav.player.z.toFixed(1)})`);
}
check('clock advances', w.minutes > t0, `(${w.clock})`);

// 5) 같은 방향 두 번 톡 → 대시 (그 방향으로)
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w2 = new CityWorld({ read: () => c });
  const seq: (CityInput['move'])[] = [...Array(5).fill({ x: 1, z: 0 }), ...Array(4).fill(null), { x: 1, z: 0 }];
  let dashed = false;
  for (const mv of seq) {
    c = { move: mv, run: false, interact: false };
    w2.step();
    if (w2.player.state === 'dash') dashed = true;
  }
  check('double-tap dash', dashed && w2.player.fx > 0.9, `(state ${w2.player.state})`);
  // 길게 누르고 있다가 다시 누르는 건 대시가 아님
  const w3 = new CityWorld({ read: () => c });
  let falseDash = false;
  for (const mv of [...Array(30).fill({ x: 1, z: 0 }), ...Array(4).fill(null), { x: 1, z: 0 }]) {
    c = { move: mv, run: false, interact: false };
    w3.step();
    if (w3.player.state === 'dash') falseDash = true;
  }
  check('long press then tap is not dash', !falseDash);
}

// 6) 걸으면서 점프
{
  let c: CityInput = { move: { x: 1, z: 0 }, run: false, interact: false };
  const w4 = new CityWorld({ read: () => c });
  for (let i = 0; i < 10; i++) w4.step();
  c = { move: { x: 1, z: 0 }, run: false, interact: false, jump: true };
  let maxY = 0;
  const x0 = w4.player.x;
  for (let i = 0; i < 40; i++) { w4.step(); maxY = Math.max(maxY, w4.player.y); }
  check('jump while walking', maxY > 0.5 && w4.player.x > x0 + 0.5, `(max ${maxY.toFixed(2)}m)`);
}

// 7) 도시: 두 번 톡 대시 → 바로 S = 슬라이딩 킥 (하단)
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w5 = new CityWorld({ read: () => c });
  const S = [false, false, false, true] as [boolean, boolean, boolean, boolean];
  const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
  const seq: CityInput[] = [
    ...Array(4).fill({ move: { x: 1, z: 0 }, run: false, interact: false }),
    ...Array(3).fill({ move: null, run: false, interact: false }),
    { move: { x: 1, z: 0 }, run: false, interact: false },
    { move: { x: 1, z: 0 }, run: false, interact: false, buttons: S },
    ...Array(20).fill({ move: null, run: false, interact: false, buttons: N }),
  ];
  let used = '';
  for (const s of seq) { c = s; w5.step(); used ||= w5.player.move?.id ?? ''; }
  check('city dash → S = slide kick (low)', used === 'slideKick' && MOVES.slideKick.level === 'low', `(${used || 'none'})`);
}

// 8) 대시 거리 (같은 방향 두 번 톡 → 대시가 끝날 때까지)
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w6 = new CityWorld({ read: () => c });
  // 집 앞에서 서쪽(-x)으로는 인도라 막히지 않는다
  const L = { x: -1, z: 0 };
  for (const mv of [...Array(4).fill(L), ...Array(3).fill(null), L]) { c = { move: mv, run: false, interact: false }; w6.step(); }
  const x0 = w6.player.x;
  c = { move: null, run: false, interact: false };
  while (w6.player.state === 'dash') w6.step();
  const dist = x0 - w6.player.x;
  check('dash distance ~2.4m', dist > 2.0 && dist < 2.8, `(${dist.toFixed(2)}m)`);
}

// 9) 대시 도중 점프·연속 대시: 초반에 눌러도 기억했다가 8F 에 이어진다
{
  const L = { x: -1, z: 0 };
  const mk = () => {
    let c: CityInput = { move: null, run: false, interact: false };
    const w = new CityWorld({ read: () => c });
    let entries = 0;
    let prev = '';
    const step = (s: CityInput) => {
      c = s;
      w.step();
      if (w.player.state === 'dash' && (prev !== 'dash' || w.player.frame === 0)) entries++;
      prev = w.player.state;
    };
    return { w, step, entries: () => entries };
  };
  const tap = (n: number): CityInput[] => Array(n).fill({ move: L, run: false, interact: false });
  const gap = (n: number): CityInput[] => Array(n).fill({ move: null, run: false, interact: false });

  const a = mk();
  [...tap(3), ...gap(3), ...tap(1), ...gap(2)].forEach(a.step); // 대시 시작 직후
  let jumped = false;
  for (const s of [{ move: null, run: false, interact: false, jump: true }, ...gap(10)] as CityInput[]) {
    a.step(s);
    jumped ||= a.w.player.state === 'jump';
  }
  check('jump pressed early in dash fires at cancel point', jumped);

  const b = mk();
  [...tap(3), ...gap(3), ...tap(1), ...gap(1), ...tap(2), ...gap(2), ...tap(1), ...gap(12)].forEach(b.step);
  // 대시 쿨타임(0.75초) 때문에 대시 도중 바로 다시 대시는 안 나간다
  check('no chain dash during cooldown', b.entries() === 1, `(대시 ${b.entries()}번)`);

  // 손을 떼면: 대시 + 짧게 미끄러지며 멈춤 → 그 뒤에야 행동 가능
  const c2 = mk();
  [...tap(3), ...gap(3), ...tap(1)].forEach(c2.step);
  let dashFrames = 0;
  while (c2.w.player.state === 'dash' && dashFrames < 60) {
    c2.step({ move: null, run: false, interact: false });
    dashFrames++;
  }
  check('dash ends with short recovery', dashFrames >= 22 && dashFrames <= 28, `(${dashFrames}F)`);
}

// 9-2) 대각선 대시: 방향키 두 개를 같이 두 번 톡
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const D = { x: -1, z: -1 };
  for (const s of [...Array(3).fill(D), ...Array(3).fill(null), D] as (CityInput['move'])[]) {
    c = { move: s, run: false, interact: false };
    w.step();
  }
  const f = w.player;
  check('diagonal dash', f.state === 'dash' && f.fx < -0.6 && f.fz < -0.6, `(fx ${f.fx.toFixed(2)}, fz ${f.fz.toFixed(2)})`);
}

// 9-3) 행인 때리기: 다가가서 W → 맞고, 말풍선, 도망
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const npc = w.npcs[0];
  const W2 = [false, true, false, false] as [boolean, boolean, boolean, boolean];
  const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
  // 행인을 플레이어 바로 앞에 세워 둔다
  npc.pause = 600;
  w.player.reset(npc.fighter.x - 0.9, npc.fighter.z, 1, 0);
  for (let i = 0; i < 3; i++) { c = { move: { x: 1, z: 0 }, run: false, interact: false }; w.step(); }
  c = { move: null, run: false, interact: false, buttons: W2 };
  w.step();
  let hit = false;
  let said = '';
  for (let i = 0; i < 40; i++) {
    c = { move: null, run: false, interact: false, buttons: N };
    w.step();
    if (w.drainEvents().length) hit = true;
    said ||= w.drainSpeech()[0]?.text ?? '';
  }
  const fleeing = npc.flee > 0;
  check('punch hits pedestrian', hit, `(npc state ${npc.fighter.state})`);
  check('pedestrian shouts and flees', !!said && fleeing, `("${said}", flee=${npc.flee})`);
}

// 10) 도시: 점프 중 Q → 점프 펀치
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w9 = new CityWorld({ read: () => c });
  const Q = [true, false, false, false] as [boolean, boolean, boolean, boolean];
  const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
  let used = '';
  const seq: CityInput[] = [
    { move: null, run: false, interact: false, jump: true },
    ...Array(5).fill({ move: null, run: false, interact: false }),
    { move: null, run: false, interact: false, buttons: Q },
    ...Array(40).fill({ move: null, run: false, interact: false, buttons: N }),
  ];
  for (const s of seq) { c = s; w9.step(); used ||= w9.player.move?.id ?? ''; }
  check('city jump + Q = jump punch', used === 'jumpPunch' && w9.player.y === 0, `(${used || 'none'})`);
}

// ───── 11) 행인 체력·돈·신고·경찰 ─────
{
  const W2 = [false, true, false, false] as [boolean, boolean, boolean, boolean];
  const N4 = [false, false, false, false] as [boolean, boolean, boolean, boolean];
  const setup = () => {
    let c: CityInput = { move: null, run: false, interact: false };
    const w = new CityWorld({ read: () => c });
    const set = (v: CityInput) => (c = v);
    const npc = w.npcs[0];
    npc.pause = 99999;
    // 사건 현장: 건물이 없는 한강공원 잔디밭 (어느 방향으로 달려도 막히지 않는다)
    npc.fighter.reset(0, 60, -1, 0);
    w.player.reset(-0.9, 60, 1, 0);
    return { w, set, npc };
  };
  const punch = (w: CityWorld, set: (v: CityInput) => void) => {
    set({ move: null, run: false, interact: false, buttons: W2 });
    w.step();
    set({ move: null, run: false, interact: false, buttons: N4 });
    for (let i = 0; i < 30; i++) w.step();
  };

  // A) 체력을 다 깎으면 쓰러지고 지갑의 돈을 줍는다
  {
    const { w, set, npc } = setup();
    npc.fighter.hp = 1;
    const gold0 = w.profile.gold;
    punch(w, set);
    check('KO pedestrian → loot wallet', npc.koFrames >= 0 && w.profile.gold === gold0 + npc.wallet, `(+${w.profile.gold - gold0}G, wallet ${npc.wallet})`);
  }

  // B) 신고 → 출동 → 현장에 남아 있으면 추격 → 체포 → 집 앞에서 재시작
  {
    const { w, set, npc } = setup();
    punch(w, set);
    w.npcs[1].reportAt = w.frame + 1; // 목격자 한 명이 바로 신고하도록
    set({ move: null, run: false, interact: false });
    let dispatched = false, chased = false, caught = false;
    for (let i = 0; i < 60 * 40 && !caught; i++) {
      w.step();
      dispatched ||= w.police.phase === 'dispatched';
      chased ||= w.police.phase === 'chasing';
      caught = w.caughtAt !== null;
    }
    check('witness report dispatches police', dispatched);
    check('stay at scene → police chase', chased);
    check('police catch player', caught);
    for (let i = 0; i < 200; i++) w.step();
    const home = w.map.home;
    check('restart at home after arrest', w.caughtAt === null && w.police.phase === 'none' && Math.hypot(w.player.x - home.x, w.player.z - home.z) < 2);
    void npc;
  }

  // C) 출동 전에 현장을 벗어나면 경찰이 범인을 못 찾는다
  {
    const { w, set } = setup();
    punch(w, set);
    w.npcs[1].reportAt = w.frame + 1;
    let found = false;
    let leaving = false;
    for (let i = 0; i < 60 * 25; i++) {
      // 현장에서 멀리 (동쪽 끝 방향으로) 달린다
      set({ move: { x: 1, z: 0 }, run: true, interact: false });
      w.step();
      found ||= w.police.phase === 'chasing';
      leaving ||= w.police.phase === 'leaving';
    }
    check('leave scene → police cannot find', !found && leaving, `(phase ${w.police.phase})`);
  }
}

// D) 추격 중 Shift 로 달리면 경찰과 거리가 벌어진다 (따돌릴 수 있다)
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const npc = w.npcs[0];
  npc.pause = 99999;
  npc.fighter.reset(0, 60, -1, 0);
  w.player.reset(-0.9, 60, 1, 0);
  c = { move: null, run: false, interact: false, buttons: [false, true, false, false] };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 30; i++) w.step();
  w.npcs[1].reportAt = w.frame + 1;
  for (let i = 0; i < 60 * 20 && w.police.phase !== 'chasing'; i++) w.step();
  const dist = () => Math.min(...w.police.officers.map((o) => Math.hypot(o.x - w.player.x, o.z - w.player.z)));
  const d0 = dist();
  // 강변을 따라 동쪽으로 달린다 (남쪽은 한강이라 막힌다)
  const away = { x: 1, z: 0 };
  for (let i = 0; i < 300 && w.caughtAt === null; i++) {
    c = { move: away, run: true, interact: false };
    w.step();
  }
  check('sprint outruns police', w.caughtAt === null && dist() > d0 + 3, `(${d0.toFixed(1)}m → ${dist().toFixed(1)}m)`);
}

// ───── 12) 피로도·배고픔·식당 ─────
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const life = w.profile.life;
  const f0 = life.fatigue, h0 = life.hunger;
  for (let i = 0; i < 60 * 60 * 10; i++) w.step(); // 실제 10분: 피로 +3.3, 배고픔 +2.8
  check('fatigue & hunger rise over time', Math.abs(life.fatigue - f0 - 100 / 30) < 0.2 && Math.abs(life.hunger - h0 - 100 / 36) < 0.2, `(피로 ${f0}→${life.fatigue.toFixed(1)}, 배고픔 ${h0}→${life.hunger.toFixed(1)})`);

  // 식당: 간판이 있는 가게 앞에서 E → 대화창, 돈 없으면 못 사고, 있으면 배고픔이 준다
  const poi = w.map.pois.find((p) => p.kind === 'shop' && p.label === '분식천국')!;
  w.player.reset(poi.x, poi.z, 0, -1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  check('food shop opens dialog', w.dialog?.shop === '분식천국' && !!w.greeting());
  w.profile.gold = 2;
  const poor = w.buyFood('kimbap');
  check('cannot buy without enough gold', !poor.ok && w.profile.gold === 2, `("${poor.message}")`);
  w.profile.gold = 100;
  life.hunger = 60;
  const ok = w.buyFood('kimbap');
  check('buy food → gold down, hunger down', ok.ok && w.profile.gold === 80 && life.hunger === 35, `(gold ${w.profile.gold}, hunger ${life.hunger})`);
  const px = w.player.x;
  c = { move: { x: 1, z: 0 }, run: false, interact: false };
  for (let i = 0; i < 20; i++) w.step();
  check('player frozen while talking', Math.abs(w.player.x - px) < 0.01);
  w.closeDialog();

  // 침대에서 자면 피로 회복
  life.fatigue = 90;
  enterHome(w, (x) => (c = x));
  w.player.reset(3.6, -0.5, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step(); // 침대
  c = { move: { x: 1, z: 0 }, run: false, interact: false }; // 자는 동안 방향키는 무시된다
  const day0 = w.minutes < 7 * 60 ? w.day - 1 : w.day; // 새벽에 자면 같은 날 아침에 일어난다
  const phases = new Set<string>();
  let minutesBack = 0;
  let prevMin = w.minutes + w.day * 1440;
  let lieX = 0;
  for (let i = 0; i < 60 * 20 && w.sleep; i++) {
    w.step();
    phases.add(w.sleep?.phase ?? 'done');
    if (w.sleep?.phase === 'lie') lieX = w.player.x;
    const now = w.minutes + w.day * 1440;
    if (now < prevMin) minutesBack++;
    prevMin = now;
  }
  c = { move: null, run: false, interact: false };
  check('sleep walks to bed, lies down, wakes', ['walk', 'lie', 'sleep', 'wake'].every((ph) => phases.has(ph)) && w.sleep === null, `(${[...phases].join('→')})`);
  check('bedside reached before lying', Math.abs(lieX - 1.95) < 0.05, `(x=${lieX.toFixed(2)})`);
  check('night passes to 7am next day', w.day === day0 + 1 && w.minutes >= 7 * 60 && w.minutes < 7 * 60 + 5 && minutesBack === 0, `(${w.day}일째 ${w.clock})`);
  check('sleep restores fatigue', w.location === 'home' && life.fatigue < 1, `(피로 ${life.fatigue.toFixed(1)})`);
}

// ───── 13) 아파트 단지 산책 공원 ─────
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const t = w.map.trails[0];
  check('trail park exists between apartments', !!t && t.path.length > 8);
  // 산책로를 따라 걸으면 피로도가 줄어든다
  w.profile.life.fatigue = 60;
  w.player.reset(t.path[0].x, t.path[0].z, 0, 1);
  let i = 1;
  for (let f = 0; f < 60 * 30; f++) {
    const target = t.path[i % t.path.length];
    if (Math.hypot(target.x - w.player.x, target.z - w.player.z) < 0.6) i++;
    c = { move: { x: target.x - w.player.x, z: target.z - w.player.z }, run: false, interact: false };
    w.step();
  }
  check('walking in park lowers fatigue', w.profile.life.fatigue < 60, `(60 → ${w.profile.life.fatigue.toFixed(1)})`);
  check('residents walk the trail', w.npcs.some((n) => n.path.length > 4), `(${w.npcs.filter((n) => n.path.length > 4).length}명)`);
}

// ───── 14) M 지도: 누른 곳까지 자동 이동, 방향키로 취소 ─────
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.step();
  const shop = w.map.pois.find((p) => p.kind === 'shop')!;
  const err = w.navigateTo(shop.x, shop.z, shop.label);
  check('navigateTo finds a path', err === '' && !!w.autopilot, `(${shop.label}, ${w.autopilot?.path.length} 지점)`);
  let f = 0;
  for (; f < 60 * 120 && w.autopilot; f++) w.step();
  const d = Math.hypot(shop.x - w.player.x, shop.z - w.player.z);
  check('autopilot arrives at shop', !w.autopilot && d < 1.5, `(${(f / 60).toFixed(1)}초, 남은 거리 ${d.toFixed(2)})`);
  const far = w.map.pois.find((p) => p.kind === 'subway')!;
  w.navigateTo(far.x, far.z, far.label);
  for (let i = 0; i < 30; i++) w.step();
  c = { move: { x: 1, z: 0 }, run: false, interact: false };
  w.step();
  check('arrow key cancels autopilot', w.autopilot === null);
}

// ───── 15) 플레이어 체력 · 행인 반격 · 회복 ─────
{
  const prof: PlayerProfile = { level: 5, exp: 0, gold: 100, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c }, prof);
  const p = w.player;
  check('player max HP scales with level', p.maxHp === 290 && new CityWorld({ read: () => c }).player.maxHp === 170, `(Lv5 ${p.maxHp})`);

  // 용감한 행인을 바로 앞에 세우고 때린다 → 덤빈다
  w.step();
  const n = w.npcs[0];
  n.brave = true;
  for (const o of w.npcs.slice(1)) o.fighter.reset(o.fighter.x + 300, o.fighter.z, 1, 0); // 다른 사람은 멀리
  p.reset(0, 60, 1, 0);
  n.fighter.reset(0.9, 60, -1, 0);
  n.path = [{ x: 0.9, z: 60 }];
  n.next = 0;
  let hitIt = false;
  for (let i = 0; i < 40 && !hitIt; i++) {
    c = { move: null, run: false, interact: false, buttons: [i % 20 < 2, false, false, false] };
    w.step();
    hitIt = n.fighter.hp < n.fighter.maxHp;
  }
  c = { move: null, run: false, interact: false };
  check('brave passerby fights back', hitIt && n.fight > 0 && n.flee === 0, `(fight=${n.fight})`);
  const hp0 = p.hp;
  for (let i = 0; i < 300; i++) w.step();
  check('angry passerby damages player', p.hp < hp0, `(${hp0} → ${p.hp})`);

  // 혼자 서 있는 사람(겁 많은) 은 맞으면 도망
  const w2 = new CityWorld({ read: () => c2 });
  let c2: CityInput = { move: null, run: false, interact: false };
  w2.step();
  const m = w2.npcs[0];
  m.brave = false;
  w2.player.reset(0, 60, 1, 0);
  m.fighter.reset(0.9, 60, -1, 0);
  for (let i = 0; i < 40 && m.fighter.hp === m.fighter.maxHp; i++) {
    c2 = { move: null, run: false, interact: false, buttons: [i % 20 < 2, false, false, false] };
    w2.step();
  }
  check('timid passerby flees instead', m.flee > 0 && m.fight === 0);

  // 체력 0 → 쓰러짐 → 집에서 35% 로 깨어남
  n.fight = 600;
  p.hp = 1;
  let downed = false;
  for (let i = 0; i < 900 && w.location === 'city'; i++) {
    w.step();
    downed ||= w.downedAt !== null;
  }
  check('knocked out → wake at home', downed && w.location === 'home' && p.hp === Math.round(p.maxHp * 0.35) && prof.gold === 90, `(hp ${p.hp}, gold ${prof.gold})`);

  // 집에서 쉬면 체력이 찬다, 소파는 +15%
  const h1 = p.hp;
  for (let i = 0; i < 60 * 10; i++) w.step();
  check('resting at home regenerates HP', p.hp > h1, `(${h1} → ${p.hp})`);
  check('HP saved to profile', prof.life.hp === p.hp);
  // 침대에서 자면 가득
  p.reset(3.6, -0.5, 0, 1);
  p.hp = 50;
  prof.life.fatigue = 70;
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  for (let i = 0; i < 60 * 20 && w.sleep; i++) w.step();
  check('sleep fully restores HP', p.hp === p.maxHp, `(${p.hp}/${p.maxHp})`);
}

// ───── 16) 일자리: 아파트 경비 (행복빌라 1층 로비 데스크) ─────
{
  const mk = () => {
    const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
    const box = { c: { move: null, run: false, interact: false } as CityInput };
    const w = new CityWorld({ read: () => box.c }, prof);
    w.step();
    return { w, prof, box };
  };
  /** 도시 → 로비 입구 E → 데스크 E → 근무 시작 */
  const goToDesk = (w: CityWorld, box: { c: CityInput }) => {
    const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
    w.player.reset(lobby.x, lobby.z, 0, -1);
    box.c = { move: null, run: false, interact: true };
    w.step();
    box.c = { move: null, run: false, interact: false };
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
    w.step();
  };
  check('robber tiers weights sum 100, legend rarest', ROBBER_TIERS.reduce((s, t) => s + t.weight, 0) === 100 && ROBBER_TIERS.at(-1)!.weight <= 2);

  // 로비 출입·시작 조건·앉기
  {
    const { w, box } = mk();
    const far = w.startJob('aptGuard');
    goToDesk(w, box);
    const inLobby = w.location === 'lobby';
    const ok = w.startJob('aptGuard');
    for (let i = 0; i < 40; i++) w.step();
    check('lobby entered from 행복빌라, job starts at desk', far !== '' && inLobby && ok === '' && !!w.job, `(${far})`);
    check('player sits at the desk', w.seat?.phase === 'seated' && w.seatAmount === 1);
    // 방향키 → 일어선다
    box.c = { move: { x: 1, z: 0 }, run: false, interact: false };
    for (let i = 0; i < 40; i++) w.step();
    box.c = { move: null, run: false, interact: false };
    check('arrow keys stand up from the chair', w.seat === null);
    // 데스크에서 E → 다시 앉기
    w.player.reset(LOBBY.chair.x, LOBBY.chair.z + 0.3, 1, 0);
    box.c = { move: null, run: false, interact: true };
    w.step();
    box.c = { move: null, run: false, interact: false };
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    check('E at desk sits back down', w.seat !== null);
  }

  // 출입 확인 + 놓침 (앉은 채로)
  {
    const { w, box } = mk();
    goToDesk(w, box);
    w.startJob('aptGuard');
    const job = w.job!;
    job.spawnVisitor();
    let checked = false;
    for (let i = 0; i < 60 * 20 && !checked; i++) {
      box.c = { move: null, run: false, interact: !!job.prompt && i % 2 === 0 };
      w.step();
      checked = job.checked > 0;
    }
    box.c = { move: null, run: false, interact: false };
    check('check a resident from the desk with E (+2G)', checked && job.bonus === 2 && w.seat !== null);
    job.spawnVisitor();
    for (let i = 0; i < 60 * 25; i++) w.step();
    check('unchecked resident walks past (missed)', job.missed >= 1, `(missed ${job.missed})`);
    check('residents leave the lobby', job.people.length === 0, `(${job.people.length}명 남음)`);
  }

  // 강도: 레벨에 따라 세지고, 맞으면 일어서고, 제압하면 보상
  {
    const { w, prof, box } = mk();
    prof.level = 5;
    goToDesk(w, box);
    w.startJob('aptGuard');
    const job = w.job!;
    job.spawnRobber('legend');
    const r = job.robber!;
    check('legend robber spawns, scaled by level', !!r && r.f.maxHp === Math.round(450 * 1.48), `(hp ${r?.f.maxHp})`);
    const hp0 = w.player.hp;
    for (let i = 0; i < 60 * 8; i++) w.step();
    check('robber attacks the guard (guard stands up)', w.player.hp < hp0 && w.seat === null, `(${hp0} → ${w.player.hp})`);
    w.player.hp = w.player.maxHp;
    const f = r.f;
    f.hp = 1;
    for (let i = 0; i < 180 && job.robber; i++) {
      const dx = f.x - w.player.x, dz = f.z - w.player.z, d = Math.hypot(dx, dz) || 1;
      w.player.fx = dx / d; w.player.fz = dz / d;
      if (d > 1) w.player.reset(f.x - (dx / d) * 0.9, f.z - (dz / d) * 0.9, dx / d, dz / d);
      box.c = { move: null, run: false, interact: false, buttons: [i % 16 < 2, false, false, false] };
      w.step();
    }
    box.c = { move: null, run: false, interact: false };
    check('beating robber pays reward, no police', job.robber === null && job.robbersBeaten === 1 && job.bonus >= 200 && w.police.phase === 'none', `(bonus ${job.bonus})`);
  }

  // 로비 이탈 → 무단 이탈, 주민 폭행 → 해고
  {
    const { w, prof, box } = mk();
    goToDesk(w, box);
    w.startJob('aptGuard');
    for (let i = 0; i < 600; i++) w.step();
    w.seat = null;
    w.player.reset(0.5, 3.5, 0, 1);
    box.c = { move: null, run: false, interact: true };
    w.step();
    box.c = { move: null, run: false, interact: false };
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    const outside = w.location === 'city';
    for (let i = 0; i < 60 * 21 && w.job; i++) w.step();
    check('leaving lobby 20s abandons shift (half pay)', outside && !w.job && prof.gold > 0 && /무단 이탈/.test(w.payslip?.text ?? ''), `(${prof.gold}G)`);
  }
  {
    const { w, box } = mk();
    goToDesk(w, box);
    w.startJob('aptGuard');
    const job = w.job!;
    job.spawnVisitor();
    const v = job.people[0];
    for (let i = 0; i < 60 * 15 && v.phase !== 'wait'; i++) w.step();
    w.seat = null;
    w.player.reset(v.f.x - 0.9, v.f.z, 1, 0);
    for (let i = 0; i < 60 && w.job; i++) {
      const dx = v.f.x - w.player.x, dz = v.f.z - w.player.z, d = Math.hypot(dx, dz) || 1;
      w.player.fx = dx / d; w.player.fz = dz / d;
      box.c = { move: null, run: false, interact: false, buttons: [i % 16 < 2, false, false, false] };
      w.step();
    }
    check('hitting a resident gets you fired', !w.job && /해고/.test(w.payslip?.text ?? ''));
  }

  // 20분 완주: 데스크에 앉아 오는 사람마다 확인, 강도는 (테스트에선) 바로 제압 처리
  {
    const { w, prof, box } = mk();
    goToDesk(w, box);
    w.startJob('aptGuard');
    const job = w.job!;
    const startAbs = w.day * 1440 + w.minutes;
    const startDay = w.day;
    let frames = 0;
    for (; frames < GUARD_SHIFT_FRAMES + 10 && w.job; frames++) {
      const rb = job.robber;
      if (rb) { rb.f.hp = 0; rb.koFrames = 0; }
      w.player.hp = w.player.maxHp;
      box.c = { move: null, run: false, interact: !!job.prompt && frames % 2 === 0 };
      w.step();
    }
    check('full 20-min shift pays base + bonus', !w.job && prof.gold >= 150 + job.checked * 2 - 1 && prof.jobs?.aptGuard?.shifts === 1, `(확인 ${job.checked}명, 선물 ${job.gifts}, ${prof.gold}G, 피로 ${prof.life.fatigue.toFixed(0)})`);
    const passed = w.day * 1440 + w.minutes - startAbs;
    check('20 real minutes = 8 game hours', Math.abs(passed - 480) < 2, `(${passed.toFixed(1)}분)`);
    const entry = prof.workLog?.[String(startDay)]?.[0];
    check('work day logged for calendar', entry?.result === 'done' && entry.pay > 0 && entry.checked === job.checked, `(${startDay}일째 ${entry?.pay}G)`);
    const w2 = new CityWorld({ read: () => box.c }, prof);
    check('date and time persist via profile', w2.day === w.day && Math.abs(w2.minutes - w.minutes) < 0.01, `(${w2.day}일째 ${w2.clock})`);
    enterHome(w2, (x) => (box.c = x));
    box.c = { move: null, run: false, interact: true };
    w2.player.reset(-3.3, -3.0, 0, -1);
    w2.step();
    box.c = { move: null, run: false, interact: false };
    check('home calendar opens with E', w2.location === 'home' && w2.calendarRequest);
  }
}

// ───── 17) 달력 날짜 계산 ─────
{
  const d1 = dateOfDay(1);
  check('day 1 = 2026-11-01 (Sun)', d1.year === 2026 && d1.month === 10 && d1.date === 1 && d1.dow === 0, `(${shortDay(1)})`);
  check('calendar round trip across months', dayOfDate(2026, 11, 25) === 55 && shortDay(62) === '1월 1일 (금)', `(${shortDay(62)})`);
}

// ───── 18) 생활 수치 속도: 실제 5시간에 피로 100, 가만히 6시간에 배고픔 100, 활동할수록 배고픔 가속 ─────
{
  const idle = new LifeTracker();
  const busy = new LifeTracker();
  const a = { fatigue: 0, hunger: 0 };
  const b = { fatigue: 0, hunger: 0 };
  const HOUR = 60 * 60 * 60;
  for (let i = 0; i < HOUR; i++) {
    idle.tick(a);
    busy.tick(b, { running: true, attackSerial: Math.floor(i / 40) });
  }
  check('idle: 1h → fatigue 20, hunger ~16.7', Math.abs(a.fatigue - 20) < 0.1 && Math.abs(a.hunger - 100 / 6) < 0.1, `(피로 ${a.fatigue.toFixed(1)}, 배고픔 ${a.hunger.toFixed(1)})`);
  check('active: hunger climbs up to 4x faster', b.hunger > a.hunger * 3 && busy.hungerRate === 4, `(배고픔 ${b.hunger.toFixed(1)}, ×${busy.hungerRate})`);
  // 쉬면 활동량이 다시 빠진다
  for (let i = 0; i < 6 * 60 * 60; i++) busy.tick(b);
  check('activity decays after resting', busy.hungerRate === 1);
  // 아직 안 졸리면 못 잔다
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.profile.life.fatigue = 20;
  enterHome(w, (x) => (c = x));
  c = { move: null, run: false, interact: true };
  w.player.reset(3.6, -0.5, 0, 1);
  w.step();
  check('cannot sleep when not tired', w.location === 'home' && w.sleep === null && /졸리지/.test(w.toast?.text ?? ''));
}

// ───── 19) 자동 행동: 한계인데 방치하면 알아서 먹고(여분은 냉장고), 알아서 잔다 ─────
{
  const mkw = () => {
    const prof: PlayerProfile = { level: 1, exp: 0, gold: 500, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 100 } };
    const box = { c: { move: null, run: false, interact: false } as CityInput };
    const w = new CityWorld({ read: () => box.c }, prof);
    return { w, prof, box };
  };
  // 냉장고가 비었으면: 가까운 음식점 → 하나 먹고 여분 2개 → 집 냉장고
  {
    const { w, prof } = mkw();
    let started = -1;
    let ateAt = -1;
    for (let i = 0; i < 60 * 240 && (started < 0 || w.care); i++) {
      w.step();
      if (started < 0 && w.care) started = i;
      if (ateAt < 0 && prof.life.hunger < 90) ateAt = i;
    }
    check('auto-eat starts after 30s at 100 hunger', started >= 30 * 60 - 2 && started <= 30 * 60 + 2, `(${(started / 60).toFixed(1)}초)`);
    check('auto-eat buys a meal at a restaurant', ateAt > 0 && prof.gold < 500, `(배고픔 ${prof.life.hunger.toFixed(0)}, ${prof.gold}G)`);
    check('spare food stored in home fridge', w.care === null && w.location === 'home' && prof.fridge?.length === 2, `(${prof.fridge?.map((f) => f.icon + f.name).join(', ')})`);
  }
  // 냉장고에 음식이 있으면 집에 가서 꺼내 먹는다
  {
    const { w, prof } = mkw();
    prof.fridge = [{ name: '김밥', icon: '🍙', hunger: 25, fatigue: 0, from: '분식천국' }, { name: '도시락', icon: '🍱', hunger: 45, fatigue: 0, from: '편의점 24' }];
    for (let i = 0; i < 60 * 200 && (w.frame < 30 * 60 + 5 || w.care); i++) w.step();
    check('auto-eat uses fridge food first (best one)', prof.gold === 500 && prof.fridge.length === 1 && prof.fridge[0].name === '김밥' && prof.life.hunger < 60, `(배고픔 ${prof.life.hunger.toFixed(0)})`);
  }
  // 방향키 → 취소
  {
    const { w, box } = mkw();
    for (let i = 0; i < 30 * 60 + 30; i++) w.step();
    const was = !!w.care;
    box.c = { move: { x: 1, z: 0 }, run: false, interact: false };
    w.step();
    box.c = { move: null, run: false, interact: false };
    check('arrow key cancels auto action', was && w.care === null);
  }
  // 피로 100 → 집에 가서 자고 일어난다
  {
    const { w, prof } = mkw();
    prof.life.hunger = 20;
    prof.life.fatigue = 100;
    let slept = false;
    for (let i = 0; i < 60 * 300 && !(slept && !w.sleep); i++) {
      w.step();
      slept ||= w.sleep?.phase === 'sleep';
    }
    check('auto-sleep walks home, sleeps, wakes', slept && !w.sleep && w.location === 'home' && prof.life.fatigue < 1, `(피로 ${prof.life.fatigue.toFixed(0)}, ${w.clock})`);
  }
  // 돈이 없으면 사 먹지 못한다
  {
    const { w, prof } = mkw();
    prof.gold = 0;
    for (let i = 0; i < 60 * 200 && (w.frame < 30 * 60 + 5 || w.care); i++) w.step();
    check('no money → cannot buy, nothing stored', prof.gold === 0 && !(prof.fridge?.length) && w.care === null && w.location === 'home');
  }
}

// ───── 20) 경비 순찰: 엘리베이터로 층마다 돌며 점검 ─────
{
  const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  const box = { c: { move: null, run: false, interact: false } as CityInput };
  const w = new CityWorld({ read: () => box.c }, prof);
  w.step();
  const press = (x: number, z: number, loc?: string) => {
    w.seat = null;
    w.player.reset(x, z, 1, 0);
    box.c = { move: null, run: false, interact: true };
    w.step();
    box.c = { move: null, run: false, interact: false };
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    return loc ? w.location === loc : true;
  };
  const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
  press(lobby.x, lobby.z);
  w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w.startJob('aptGuard');
  const job = w.job!;
  for (let i = 0; i < 60 * 61 && !job.patrol; i++) w.step();
  check('patrol time comes 1 min into shift', !!job.patrol && job.patrolLeft.length === w.villaFloors - 1, `(${w.villaFloors}층 건물, ${job.patrolLeft.length}개 층)`);
  // 로비 엘리베이터 → 2층
  press(2.0, -3.2);
  w.rideElevator(2);
  check('lobby elevator goes to floor 2 corridor', w.location === 'corridor' && w.floor === 2);
  const before = job.bonus;
  for (let f = 2; f <= w.villaFloors; f++) {
    for (const cp of CORRIDOR.checkpoints) press(cp.x, cp.z);
    if (f < w.villaFloors) {
      press(-4.3, -1.0); // 엘리베이터
      w.rideElevator(f + 1);
    }
  }
  check('checking every floor completes patrol (+20G)', job.patrol === null && job.patrolsDone === 1 && job.bonus === before + 20, `(${job.bonus - before}G)`);
  check('corridor counts as on duty (no abandon)', job.awayFrames === 0 && !!w.job);
  // 계단으로 내려가기 → 3층에서 302호 = 내 집
  const setB = (x: CityInput) => (box.c = x);
  walkStairs(w, setB, true);
  check('stairs go down a floor', w.location === 'corridor' && w.floor === w.villaFloors - 1);
  while (w.floor > 3) walkStairs(w, setB, true);
  press(CORRIDOR.doors[1], -1.0);
  check('302호 door on 3F enters my home', w.location === 'home');
  // 순찰을 안 돌면 다음 순찰 때 놓친 것으로
  const w2 = new CityWorld({ read: () => box.c }, { ...prof, life: { fatigue: 10, hunger: 10 } });
  w2.step();
  w2.player.reset(lobby.x, lobby.z, 0, -1);
  box.c = { move: null, run: false, interact: true };
  w2.step();
  box.c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w2.doorway; i++) w2.step(); // 현관 문 여닫는 동안
  w2.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w2.startJob('aptGuard');
  for (let i = 0; i < 60 * 60 * 6 + 120; i++) w2.step();
  check('skipped patrol counts as missed', (w2.job?.patrolsMissed ?? 0) >= 1, `(missed ${w2.job?.patrolsMissed})`);
}

// ───── 21) 자동 체크: 오는 사람은 알아서 확인, 강도가 오면 멈추고 전투 ─────
{
  const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  const box = { c: { move: null, run: false, interact: false } as CityInput };
  const w = new CityWorld({ read: () => box.c }, prof);
  w.step();
  const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
  w.player.reset(lobby.x, lobby.z, 0, -1);
  box.c = { move: null, run: false, interact: true };
  w.step();
  box.c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w.startJob('aptGuard');
  const job = w.job!;
  job.toggleAuto();
  job.spawnVisitor();
  job.spawnVisitor();
  for (let i = 0; i < 60 * 20; i++) w.step();
  check('auto-check handles residents without pressing E', job.checked >= 2 && job.missed === 0 && job.bonus === job.checked * 2, `(확인 ${job.checked}명)`);
  // 강도 → 자동 체크 멈춤, 일어선다, 그동안 온 주민은 확인하지 않는다
  for (let i = 0; i < 40; i++) w.step();
  job.spawnRobber('thief');
  w.step();
  check('robber pauses auto-check and guard stands up', !job.autoActive && job.autoCheck && (w.seat === null || w.seat.phase === 'stand'));
  job.spawnVisitor();
  const c0 = job.checked;
  for (let i = 0; i < 60 * 6; i++) {
    w.player.hp = w.player.maxHp;
    w.step();
  }
  check('no auto-check while robber is inside', job.checked === c0, `(${c0} → ${job.checked})`);
  // 강도 제압 → 자동 체크 재개 (강도를 본 주민은 도망치거나 도왔으니, 새로 온 사람으로 확인)
  const r = job.robber!;
  r.f.hp = 0;
  r.koFrames = 0;
  for (let i = 0; i < 30; i++) w.step();
  job.spawnVisitor();
  for (let i = 0; i < 60 * 10; i++) w.step();
  check('auto-check resumes after robber is handled', job.autoActive && job.checked > c0, `(${c0} → ${job.checked})`);
}

// ───── 22) 숙이기 · 장비 · 자동 순찰 · 강도 수색 ─────
{
  const mk = (gold = 0) => {
    const prof: PlayerProfile = { level: 1, exp: 0, gold, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
    const box = { c: { move: null, run: false, interact: false } as CityInput };
    const w = new CityWorld({ read: () => box.c }, prof);
    w.step();
    return { w, prof, box };
  };
  const toDesk = (w: CityWorld, box: { c: CityInput }) => {
    const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
    w.player.reset(lobby.x, lobby.z, 0, -1);
    box.c = { move: null, run: false, interact: true };
    w.step();
    box.c = { move: null, run: false, interact: false };
    for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
    w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
    w.startJob('aptGuard');
  };

  // 숙이기: 싸울 때만 ↓ = 숙이기, 평소엔 걷기
  {
    const { w, box } = mk();
    const z0 = w.player.z;
    box.c = { move: { x: 0, z: 1 }, run: false, interact: false, down: true };
    for (let i = 0; i < 20; i++) w.step();
    check('down arrow walks when not fighting', w.player.z > z0 + 0.3 && w.player.state === 'run');
    w.lastCombatFrame = w.frame;
    for (let i = 0; i < 10; i++) w.step();
    check('down arrow ducks while fighting', w.player.state === 'crouch', `(${w.player.state})`);
    box.c = { move: null, run: false, interact: false };
  }

  // 장비: 기본 8개, 끼면 능력치, 벗으면 가방으로
  {
    const { w, prof } = mk();
    const hp0 = w.player.maxHp;
    const pw0 = w.player.power;
    check('8 equip slots with starter gear in bag', EQUIP_SLOTS.length === 8 && prof.gear?.owned.length === 8 && Object.keys(prof.gear.equipped).length === 0);
    equipItem(prof, 'hoodie');
    equipItem(prof, 'woodBat');
    w.refreshStats();
    check('equipping raises HP and power', w.player.maxHp === hp0 + 15 && Math.abs(w.player.power - pw0 * 1.08) < 1e-9, `(HP ${hp0}→${w.player.maxHp}, 공격력 ${pw0}→${w.player.power.toFixed(2)})`);
    unequipSlot(prof, 'top');
    w.refreshStats();
    check('unequip returns item to bag', !prof.gear!.equipped.top && prof.gear!.owned.includes('hoodie') && w.player.maxHp === hp0);
    for (const id of STARTER_GEAR) equipItem(prof, id);
    check('all 8 slots filled', Object.keys(prof.gear!.equipped).length === 8 && prof.gear!.owned.length === 0);
  }

  // 자동 순찰: 데스크 → 엘리베이터 → 층마다 점검 → 계단 → 데스크에 앉기
  {
    const { w, box } = mk();
    toDesk(w, box);
    const job = w.job!;
    job.toggleAutoPatrol();
    for (let i = 0; i < 60 * 30; i++) w.step(); // 착석 대기
    job.startPatrol();
    let maxFloor = 1;
    let done = false;
    for (let i = 0; i < 60 * 180 && !done; i++) {
      if (job.robber || job.hunt) { const r = job.robber ?? job.hunt!.robber; r.f.hp = 0; r.koFrames = 0; job.hunt = null; }
      w.step();
      if (w.location === 'corridor') maxFloor = Math.max(maxFloor, w.floor);
      done = !job.patrol && !w.autoPatrolAway && w.seat !== null;
    }
    if (!done) console.log(`  (자동 순찰 끝 상태: ${w.location} ${w.floor}F x=${w.player.x.toFixed(2)} z=${w.player.z.toFixed(2)} patrol=${!!job.patrol} away=${w.autoPatrolAway} seat=${!!w.seat})`);
    check('auto patrol visits every floor and returns to the desk', done && maxFloor === w.villaFloors && job.patrolsDone >= 1 && w.location === 'lobby', `(최고 ${maxFloor}층, 순찰 ${job.patrolsDone}회)`);
  }

  // 강도 수색: 데스크를 비운 사이 강도 → 알람, 아무 층에 숨음, 찾아서 퇴치
  {
    const { w, box } = mk();
    toDesk(w, box);
    const job = w.job!;
    w.seat = null;
    w.player.reset(2.0, -3.2, 0, -1);
    box.c = { move: null, run: false, interact: true };
    w.step(); // 엘리베이터
    w.rideElevator(2);
    box.c = { move: null, run: false, interact: false };
    job.spawnRobber('thief');
    const h = job.hunt!;
    check('robber while away → alarm + hidden on some floor', !!h && h.robber.where >= 1 && h.robber.where <= w.villaFloors && /수색|발견/.test(job.alert ?? ''), `(${h?.robber.where}층)`);
    // 그 층으로 가면 발견
    const target = h.robber.where;
    if (target === 1) w['goFloor'](1); else w['goFloor'](target);
    w.step();
    check('going to that floor finds the robber', job.hunt?.found === true);
    const r = h.robber;
    r.f.hp = 1;
    for (let i = 0; i < 240 && job.hunt; i++) {
      const dx = r.f.x - w.player.x, dz = r.f.z - w.player.z, d = Math.hypot(dx, dz) || 1;
      w.player.fx = dx / d; w.player.fz = dz / d;
      if (d > 1) w.player.reset(r.f.x - (dx / d) * 0.9, r.f.z - (dz / d) * 0.9, dx / d, dz / d);
      w.player.hp = w.player.maxHp;
      box.c = { move: null, run: false, interact: false, buttons: [i % 16 < 2, false, false, false] };
      w.step();
    }
    box.c = { move: null, run: false, interact: false };
    check('beating hidden robber completes the hunt (+fast bonus)', job.hunt === null && job.huntsWon === 1 && job.bonus >= 15 + 15, `(bonus ${job.bonus})`);
  }
  // 못 찾으면: 강도가 털고 달아남, 수당 감소
  {
    const { w, box } = mk();
    toDesk(w, box);
    const job = w.job!;
    job.bonus = 50;
    w.seat = null;
    w.player.reset(2.0, -3.2, 0, -1);
    box.c = { move: null, run: false, interact: true };
    w.step();
    w.rideElevator(2);
    box.c = { move: null, run: false, interact: false };
    job.spawnRobber('robber');
    const where = job.hunt!.robber.where;
    // 일부러 다른 층에서 기다린다
    const other = where === 2 ? 3 : 2;
    w['goFloor'](other);
    for (let i = 0; i < 60 * 92 && job.hunt; i++) {
      w.player.hp = w.player.maxHp;
      w.step();
    }
    check('hunt timeout: robber escapes, pay -30G', job.hunt === null && job.huntsFailed === 1 && job.bonus <= 50 - 30 + 2 * job.checked, `(bonus ${job.bonus})`);
  }
}

// ───── 23) 싸울 때 대각선 이동 · 강도를 본 주민의 반응 ─────
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.step();
  w.lastCombatFrame = w.frame;
  const x0 = w.player.x, z0 = w.player.z;
  c = { move: { x: 1, z: 1 }, run: false, interact: false, down: true };
  for (let i = 0; i < 20; i++) { w.lastCombatFrame = w.frame; w.step(); }
  check('down + right moves diagonally even while fighting', w.player.x > x0 + 0.2 && w.player.z > z0 + 0.2 && w.player.state !== 'crouch', `(${(w.player.x - x0).toFixed(2)}, ${(w.player.z - z0).toFixed(2)})`);
  c = { move: { x: 0, z: 1 }, run: false, interact: false, down: true };
  for (let i = 0; i < 10; i++) { w.lastCombatFrame = w.frame; w.step(); }
  check('down alone still ducks while fighting', w.player.state === 'crouch');
  c = { move: null, run: false, interact: false };
}
{
  const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  const box = { c: { move: null, run: false, interact: false } as CityInput };
  const w = new CityWorld({ read: () => box.c }, prof);
  w.step();
  const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
  w.player.reset(lobby.x, lobby.z, 0, -1);
  box.c = { move: null, run: false, interact: true };
  w.step();
  box.c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w.startJob('aptGuard');
  const job = w.job!;
  job.spawnRobber('armed');
  const robber = job.robber!;
  job.spawnVisitor();
  job.spawnVisitor();
  const [a, b] = job.people.filter((p) => p.kind === 'visitor').slice(-2);
  // 한 명은 돕고 한 명은 도망치게 고정 (처음 볼 때 정해지므로 첫 프레임 전에)
  a.reaction = 'help'; a.f.power = 0.6;
  b.reaction = 'flee'; b.exit = { x: 0.5, z: 3.3 };
  b.f.reset(-1, 0, 0, 1);
  const hp0 = robber.f.hp;
  let fled = false;
  for (let i = 0; i < 60 * 15; i++) {
    w.player.hp = w.player.maxHp;
    w.step();
    if (!job.people.includes(b)) fled = true;
  }
  check('scared resident runs out of the lobby', fled);
  check('brave resident fights the robber', robber.f.hp < hp0 || robber.koFrames >= 0, `(${hp0} → ${robber.f.hp})`);
  // 강도 제압 → 돕던 주민은 다시 갈 길
  robber.f.hp = 0; robber.koFrames = 0;
  for (let i = 0; i < 10; i++) w.step();
  check('helper goes back to normal after robber is down', !job.people.includes(a) || (a.reaction === undefined && a.phase === 'leave') || a.koFrames >= 0);
}

// ───── 24) 자동 순찰 손맛: 켜면 바로 출발, 직접 조작하면 잠깐 멈췄다가 이어서 ─────
{
  const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  const box = { c: { move: null, run: false, interact: false } as CityInput };
  const w = new CityWorld({ read: () => box.c }, prof);
  w.step();
  const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
  w.player.reset(lobby.x, lobby.z, 0, -1);
  box.c = { move: null, run: false, interact: true };
  w.step();
  box.c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w.startJob('aptGuard');
  const job = w.job!;
  for (let i = 0; i < 60; i++) w.step();
  job.toggleAutoPatrol();
  check('turning auto patrol on starts a round right away', !!job.patrol);
  for (let i = 0; i < 200; i++) w.step();
  // 잠깐 직접 움직였다가 손을 뗀다
  box.c = { move: { x: 1, z: 0 }, run: false, interact: false };
  for (let i = 0; i < 30; i++) w.step();
  box.c = { move: null, run: false, interact: false };
  check('manual input pauses (does not turn off) auto patrol', job.autoPatrol);
  let done = false;
  for (let i = 0; i < 60 * 180 && !done; i++) {
    const r = job.robber ?? job.hunt?.robber;
    if (r) { r.f.hp = 0; r.koFrames = 0; job.hunt = null; }
    w.player.hp = w.player.maxHp;
    w.step();
    done = !job.patrol && !w.autoPatrolAway && w.seat !== null;
  }
  if (!done) console.log(`  (끝 상태: ${w.location} ${w.floor}F x=${w.player.x.toFixed(2)} z=${w.player.z.toFixed(2)} patrol=${!!job.patrol} away=${w.autoPatrolAway} seat=${!!w.seat})`);
  check('auto patrol resumes after hands off and finishes', done && job.patrolsDone >= 1, `(순찰 ${job.patrolsDone}회)`);
  check('waiting shows time to next patrol', /다음 순찰까지/.test(job.alert ?? ''), `(${job.alert})`);
}

// ───── 25) 동시 입력 기술 · ↓ 먼저 누른 대각선 · 자동 체크면 알아서 앉기 ─────
{
  const B = (q: boolean, w: boolean, a: boolean, s: boolean) => [q, w, a, s] as [boolean, boolean, boolean, boolean];
  const tryCombo = (frames: [boolean, boolean, boolean, boolean][]) => {
    let c: CityInput = { move: null, run: false, interact: false };
    const w = new CityWorld({ read: () => c });
    w.step();
    for (const b of frames) { c = { move: null, run: false, interact: false, buttons: b }; w.step(); }
    c = { move: null, run: false, interact: false };
    for (let i = 0; i < 3; i++) w.step();
    return w.player.move?.id ?? w.player.state;
  };
  check('Q alone → jab', tryCombo([B(true, false, false, false)]) === 'jab');
  check('Q+W same frame → hammer', tryCombo([B(true, true, false, false)]) === 'hammer');
  check('Q then W 2 frames later → hammer', tryCombo([B(true, false, false, false), B(true, false, false, false), B(true, true, false, false)]) === 'hammer');
  check('A+S → drop kick, Q+A → tackle, W+S → flying knee', tryCombo([B(false, false, true, true)]) === 'dropKick' && tryCombo([B(true, false, true, false)]) === 'shoulderTackle' && tryCombo([B(false, true, false, true)]) === 'flyingKnee');
  {
    const late = tryCombo([B(true, false, false, false), ...Array(6).fill(B(true, false, false, false)), B(true, true, false, false)]);
    check('Q then W too late → not a combo (normal 1,2 string)', late !== 'hammer', `(${late})`);
  }
}
{
  // 싸우는 중 ↓ 먼저, 2프레임 뒤 → : 숙이지 않고 대각선
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.step();
  let crouched = false;
  c = { move: { x: 0, z: 1 }, run: false, interact: false, down: true };
  for (let i = 0; i < 2; i++) { w.lastCombatFrame = w.frame; w.step(); crouched ||= w.player.state === 'crouch'; }
  c = { move: { x: 1, z: 1 }, run: false, interact: false, down: true };
  for (let i = 0; i < 15; i++) { w.lastCombatFrame = w.frame; w.step(); crouched ||= w.player.state === 'crouch'; }
  check('down pressed just before right never ducks', !crouched && w.player.state === 'run');
}
{
  const prof: PlayerProfile = { level: 1, exp: 0, gold: 0, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 10, hunger: 10 } };
  const box = { c: { move: null, run: false, interact: false } as CityInput };
  const w = new CityWorld({ read: () => box.c }, prof);
  w.step();
  const lobby = w.map.pois.find((p) => p.id === 'lobby')!;
  w.player.reset(lobby.x, lobby.z, 0, -1);
  box.c = { move: null, run: false, interact: true };
  w.step();
  box.c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  w.player.reset(LOBBY.chair.x, LOBBY.chair.z, 1, 0);
  w.startJob('aptGuard');
  w.seat = null;
  w.player.reset(1.5, 2.0, 0, -1); // 로비 한가운데 서 있다
  w.job!.toggleAuto();
  let sat = false;
  for (let i = 0; i < 60 * 15 && !sat; i++) { w.step(); sat = (w.seat as CityWorld['seat'])?.phase === 'seated'; }
  check('auto-check walks back to the desk and sits', sat);
}

// ───── 26) 대시 쿨타임 · 카지노 ─────
{
  // 대시 직후 다시 두 번 톡 → 쿨타임 동안은 대시가 안 나간다
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.step();
  const R = { move: { x: 1, z: 0 }, run: false, interact: false } as CityInput;
  const N = { move: null, run: false, interact: false } as CityInput;
  const tap2 = () => { for (const s of [R, R, N, N, R]) { c = s; w.step(); } };
  tap2();
  const first = w.player.state === 'dash';
  for (let i = 0; i < 26; i++) { c = N; w.step(); } // 대시 끝
  tap2();
  const blocked = w.player.state !== 'dash';
  for (let i = 0; i < 40; i++) { c = N; w.step(); }
  tap2();
  check('dash cooldown: second dash blocked, ready after 0.75s', first && blocked && w.player.state === 'dash');
}
{
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const rtp = (f: () => number, n: number, bet = 10) => { let s = 0; for (let i = 0; i < n; i++) s += f(); return s / (n * bet); };
  const slots = rtp(() => spinSlots(10, rng).payout, 100000);
  const roul = rtp(() => spinRoulette(10, { kind: 'red' }, rng).payout, 100000);
  const sic = rtp(() => rollSicBo(10, 'big', rng).payout, 100000);
  check('casino house edge: every game pays back 85~99%', [slots, roul, sic].every((r) => r > 0.85 && r < 0.99), `(슬롯 ${slots.toFixed(3)}, 룰렛 ${roul.toFixed(3)}, 대소 ${sic.toFixed(3)})`);
  const C = (rank: number) => ({ rank, suit: '♠' as const });
  check('blackjack hand values (ace soft/hard)', handValue([C(1), C(13)]).total === 21 && handValue([C(1), C(1), C(9)]).total === 21 && handValue([C(10), C(9), C(5)]).total === 24);
  check('roulette payouts', rouletteMultiplier({ kind: 'number', n: 17 }, 17) === 36 && rouletteMultiplier({ kind: 'red' }, 0) === 0 && rouletteMultiplier({ kind: 'dozen', n: 3 }, 30) === 3 && rouletteMultiplier({ kind: 'even' }, 0) === 0);
  let triples = 0;
  for (let i = 0; i < 3000; i++) { const r = rollSicBo(10, 'big', rng); if (r.dice[0] === r.dice[1] && r.dice[1] === r.dice[2]) { triples++; if (r.payout) triples = -9999; } }
  check('sic bo: triples always lose', triples > 0);
  // 블랙잭 한 판: 정산 금액이 규칙대로
  let ok = true;
  for (let i = 0; i < 2000; i++) {
    const g = bjDeal(10, rng);
    while (g.phase === 'player') (handValue(g.player).total < 17 ? bjHit : bjStand)(g);
    const p = handValue(g.player).total, d = handValue(g.dealer).total;
    const exp = isBlackjack(g.player) && !isBlackjack(g.dealer) ? 25 : p > 21 ? 0 : isBlackjack(g.dealer) && !isBlackjack(g.player) ? 0 : d > 21 || p > d ? 20 : p === d ? 10 : 0;
    if (g.payout !== exp) { ok = false; break; }
  }
  check('blackjack settles by the rules', ok);
  // 하이로우: K 에서 '높다'는 못 고르고, 맞히면 배당이 쌓인다
  check('high-low odds', hlOdds({ rank: 13, suit: '♠' }, 'high') === 0 && hlOdds({ rank: 7, suit: '♠' }, 'high') > 2);
  // 도시: 카지노 입구 E → 창, 베팅·상금
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  w.step();
  const poi = w.map.pois.find((p) => p.id === 'casino')!;
  w.player.reset(poi.x, poi.z, 0, -1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 200 && w.doorway; i++) w.step(); // 현관 문 여닫는 동안
  w.profile.gold = 100;
  const betOk = w.casinoBet(50);
  const tooMuch = w.casinoBet(500);
  w.casinoPay(120);
  check('casino entrance opens, bets and payouts move gold', !!poi && w.casinoRequest && betOk && !tooMuch && w.profile.gold === 170 && w.profile.casino?.played === 1 && w.profile.casino.best === 120);
}

// 도시: 옆에 사람이 있으면 허공을 향해 차도 그쪽으로 돌아서 맞힌다 + 발차기는 빠른 템포 없이 묵직하게
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  const npc = w.npcs[0];
  npc.pause = 600;
  // 플레이어는 북쪽(-z)을 보고, 행인은 오른쪽(+x) 1.1m
  w.player.reset(npc.fighter.x - 1.1, npc.fighter.z, 0, -1);
  const A = [false, false, true, false] as [boolean, boolean, boolean, boolean];
  const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
  c = { move: null, run: false, interact: false, buttons: A };
  w.step();
  const turned = w.player.fx > 0.9;
  const startup = w.player.move?.startup ?? 0;
  let hit = false;
  for (let i = 0; i < 60; i++) {
    c = { move: null, run: false, interact: false, buttons: N };
    w.step();
    if (w.drainEvents().length) hit = true;
  }
  check('attack turns toward nearby pedestrian and hits', turned && hit, `(fx ${w.player.fx.toFixed(2)}, hit ${hit})`);
  check('kicks keep full (slower) timing for the player', startup === MOVES.midKick.startup, `(startup ${startup})`);
}

// 집 창문: E 열기 → E 밖 내다보기 (움직이지 않고 방향키로 둘러보기) → E 돌아오기 / C 닫기
{
  let c: CityInput = { move: null, run: false, interact: false };
  const w = new CityWorld({ read: () => c });
  enterHome(w, (x) => (c = x));
  const win = HOME.pois.find((q) => q.id === 'window')!;
  const press = () => {
    c = { move: null, run: false, interact: true };
    w.step();
    c = { move: null, run: false, interact: false };
    w.step();
  };
  w.player.reset(win.x, win.z, 0, -1);
  w.step();
  press();
  check('E opens the window and looks outside', w.location === 'home' && w.homeWindowOpen && w.lookingOut);
  const x0 = w.player.x;
  c = { move: { x: 1, z: 0 }, run: false, interact: false };
  for (let i = 0; i < 20; i++) w.step();
  c = { move: null, run: false, interact: false };
  check('arrow keys pan the view, body stays put', w.lookYaw < -0.2 && Math.abs(w.player.x - x0) < 0.01, `(yaw ${w.lookYaw.toFixed(2)})`);
  press();
  check('E: back inside, window stays open', !w.lookingOut && w.homeWindowOpen);
  check('open window offers look-out', w.nearby?.label.includes('내다보기') === true, `(${w.nearby?.label})`);
  press();
  check('E again: look out again', w.lookingOut);
  w.stopLookOut(true);
  check('close window from look-out', !w.lookingOut && !w.homeWindowOpen);
}
