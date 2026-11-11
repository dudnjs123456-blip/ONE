/**
 * 놀이공원 시험: 롤러코스터 트랙·물리, 운행표(공유 시각), 놀이기구 동작
 *   npx tsx scripts/park-sim.ts
 */
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';
import { newProfile } from '../src/game/core/profile';
import { COASTER_TRACK, COASTER_LEN, COASTER_RUN, coasterAt, trackAt, RIDES, RIDE_IDS, rideClock, dropAt, DROP, vikingAt, PARK, parkSolids, wheelCabinAtBottom, GYRO, GYRO_RUN, gyroAt, gyroPose, SKY, SKY_RUN, skyAt, skyPose, RIDE_NODE, parkPathTo } from '../src/game/city/themePark';

let fails = 0;
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) fails++;
}

const T = COASTER_TRACK;
const maxY = Math.max(...T.map((p) => p.y));
console.log(`트랙 ${COASTER_LEN.toFixed(0)}m, 점 ${T.length}, 최고 ${maxY.toFixed(1)}m, 운행 ${COASTER_RUN.duration.toFixed(1)}초`);
check('coaster: lift hill is ~16 floors high', maxY > 45 && maxY < 55);
// 트랙이 끊기지 않는다 (이웃 점 간격)
let gap = 0;
for (let i = 0; i < T.length; i++) {
  const a = T[i], b = T[(i + 1) % T.length];
  gap = Math.max(gap, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
}
check('coaster: track is continuous (closed loop)', gap < 1.2, `(max step ${gap.toFixed(2)}m)`);
// 가장 가파른 곳
let steep = 0;
for (const p of T) steep = Math.max(steep, Math.asin(Math.max(-1, Math.min(1, -p.ty))));
check('coaster: first drop is near-vertical (>= 70°)', (steep * 180) / Math.PI >= 70, `(${((steep * 180) / Math.PI).toFixed(0)}°)`);
// 뒤집히는 곳(루프)
const inverted = T.some((p) => p.uy < -0.7);
check('coaster: has an inversion (loop)', inverted);
// 속도
const vmax = Math.max(...COASTER_RUN.v);
check('coaster: top speed 90~120 km/h', vmax * 3.6 > 90 && vmax * 3.6 < 125, `(${(vmax * 3.6).toFixed(0)} km/h)`);
// 루프 꼭대기 속도가 충분 (떨어지지 않게)
let loopTopV = Infinity;
for (let i = 0; i < COASTER_RUN.s.length; i += 1) {
  const p = trackAt(COASTER_RUN.s[i]);
  if (p.uy < -0.7) loopTopV = Math.min(loopTopV, COASTER_RUN.v[i]);
}
check('coaster: enough speed at loop top', loopTopV > 9, `(${loopTopV.toFixed(1)} m/s)`);
check('coaster: run finishes back at the station', coasterAt(COASTER_RUN.duration + 1).s >= COASTER_LEN + 7.99 && COASTER_RUN.duration < 140, `(${COASTER_RUN.duration.toFixed(0)}s)`);
// 역 도착 속도
const vEnd = COASTER_RUN.v[COASTER_RUN.v.length - 1];
check('coaster: slow at station arrival', vEnd < 3.2, `(${vEnd.toFixed(1)} m/s)`);
// 트랙끼리 너무 가까운 곳 (자기 자신과 부딪힘) — 진행 거리 30m 이상 떨어진 점끼리
let minD = Infinity, where = '';
for (let i = 0; i < T.length; i += 2)
  for (let j = i + 60; j < T.length; j += 2) {
    if (T.length - j + i < 60) continue;
    const d = Math.hypot(T[i].x - T[j].x, T[i].y - T[j].y, T[i].z - T[j].z);
    if (d < minD) { minD = d; where = `${i}(${T[i].x.toFixed(0)},${T[i].y.toFixed(0)},${T[i].z.toFixed(0)}) ~ ${j}`; }
  }
check('coaster: track never runs into itself', minD > 3.2, `(closest ${minD.toFixed(1)}m at ${where})`);
// 공원 안
const b = PARK.bounds;
check('coaster: inside the park', T.every((p) => p.x > b.x0 + 1 && p.x < b.x1 - 1 && p.z > b.z0 + 1 && p.z < b.z1 - 1));
const xs = T.map((p) => p.x), zs = T.map((p) => p.z);
console.log(`  x ${Math.min(...xs).toFixed(0)}~${Math.max(...xs).toFixed(0)}, z ${Math.min(...zs).toFixed(0)}~${Math.max(...zs).toFixed(0)}`);

// 운행표: 같은 시각이면 누구나 같은 값
const now = Date.UTC(2026, 10, 8, 3, 0, 7);
for (const id of RIDE_IDS) {
  const a = rideClock(id, now), c = rideClock(id, now);
  check(`clock ${id}: same time → same phase`, JSON.stringify(a) === JSON.stringify(c));
}
// 한 주기 안에 탑승 → 운행 → (쉬기)
{
  const id = 'coaster';
  const P = RIDES[id].period * 1000;
  const base = Math.floor(now / P) * P;
  check('clock: boarding at cycle start', rideClock(id, base + 1000).phase === 'boarding');
  check('clock: running after boarding', rideClock(id, base + (RIDES[id].board + 5) * 1000).phase === 'running');
}
// 자이로드롭: 올라갔다 자유낙하
{
  const top = dropAt(31, 5);
  const fall = dropAt(30 + 6.2 + 1.5, 5);
  check('drop: reaches the top', top.y > DROP.top - 5, `(${top.y.toFixed(1)}m)`);
  let maxV = 0;
  for (let t = 0; t < 50; t += 0.05) maxV = Math.max(maxV, dropAt(t, 5).v);
  check('drop: free fall over 90 km/h', maxV * 3.6 > 90, `(${(maxV * 3.6).toFixed(0)} km/h)`);
  check('drop: ends at the bottom', dropAt(60, 5).y < 1.5);
  void fall;
}
// 바이킹: 75° 가까이
{
  let amp = 0;
  for (let t = 0; t < 60; t += 0.02) amp = Math.max(amp, Math.abs(vikingAt(t)));
  check('viking: swings up to ~75°', amp > 1.2 && amp < 1.4, `(${((amp * 180) / Math.PI).toFixed(0)}°)`);
  check('viking: stops at the end', Math.abs(vikingAt(58)) < 0.05);
}
// 토네이도(자이로 스윙): 120° 가까이 올라가고, 끝나면 멈춘다
{
  let amp = 0;
  for (let t = 0; t < GYRO_RUN; t += 0.02) amp = Math.max(amp, Math.abs(gyroAt(t).th));
  check('gyro: swings up to ~120°', amp > 1.9 && amp < 2.2, `(${((amp * 180) / Math.PI).toFixed(0)}°)`);
  check('gyro: stops at the end', Math.abs(gyroAt(GYRO_RUN).th) < 0.01);
  let low = Infinity;
  for (let t = 0; t < GYRO_RUN; t += 0.05) for (let s = 0; s < GYRO.seats; s++) low = Math.min(low, gyroPose(s, t).y);
  check('gyro: seats never go under the ground', low > 0.5, `(lowest ${low.toFixed(1)}m)`);
}
// 스카이 스윙: 꼭대기까지 올라가 그네가 바깥으로 날고, 끝나면 내려온다
{
  const top = skyAt(20);
  check('sky: rises to the top', top.y > SKY.top - 0.5, `(${top.y.toFixed(1)}m)`);
  check('sky: swings fly outward (30~65°)', top.tilt > 0.5 && top.tilt < 1.15, `(${((top.tilt * 180) / Math.PI).toFixed(0)}°)`);
  const end = skyAt(SKY_RUN);
  check('sky: comes back down and stops', end.y < SKY.base + 0.5 && end.w < 0.01);
  let low = Infinity;
  for (let t = 0; t < SKY_RUN; t += 0.05) for (let s = 0; s < SKY.seats; s++) low = Math.min(low, skyPose(s, t).y);
  check('sky: seats never go under the ground', low > 0.3, `(lowest ${low.toFixed(1)}m)`);
}
// 길: 역에서 모든 놀이기구 입구까지 길이 이어져 있다
for (const id of RIDE_IDS) {
  const path = parkPathTo(PARK.spawn.x, PARK.spawn.z, RIDE_NODE[id]);
  const end = path[path.length - 1];
  check(`path: station → ${id} gate`, !!end && Math.hypot(end.x - RIDES[id].gate.x, end.z - RIDES[id].gate.z) < 0.01);
}
// 대관람차: 맨 아래 칸이 있다
check('wheel: some cabin is at the bottom', wheelCabinAtBottom(now).off < Math.PI / 16 + 1e-6);
// 놀이기구 입구는 막힌 곳 밖
for (const id of RIDE_IDS) {
  const g = RIDES[id].gate;
  check(`gate ${id} is walkable`, !parkSolids().some((r) => g.x > r.x0 - 0.5 && g.x < r.x1 + 0.5 && g.z > r.z0 - 0.5 && g.z < r.z1 + 0.5));
}

// ───── 동네 ↔ 놀이공원 · 줄 서기 · 탑승 · 운행 끝나면 내리기 · 친구와 같은 열차 ─────
{
  type W = { goToPark(): void; leavePark(): void; joinRide(id: string): void; moveTo(l: string, x: number, z: number, fx: number, fz: number): void; placePlayer(x: number, z: number, fx: number, fz: number): void };
  const idle: CityInput = { move: null, run: false, interact: false };
  const A = new CityWorld({ read: () => idle }, newProfile(), 1);
  const B = new CityWorld({ read: () => idle }, newProfile(), 2);
  A.npcs = [];
  B.npcs = [];
  A.netId = 'a';
  B.netId = 'b';
  A.upsertRemote('b', '친구B', '201');
  B.upsertRemote('a', '친구A', '302');
  const P = RIDES.coaster.period * 1000;
  let now = Math.floor(Date.UTC(2026, 10, 8, 3) / P) * P + 30_000; // 운행 중 (탑승 시간 아님)
  A.parkClock = B.parkClock = () => now;
  const a = A as unknown as W;
  const b = B as unknown as W;
  a.goToPark();
  b.goToPark();
  check('subway: arrives at the park', A.location === 'park' && A.roomKey === 'park');
  // 운행 중이면 줄을 선다
  const g = RIDES.coaster.gate;
  a.placePlayer(g.x, g.z, 0, -1);
  b.placePlayer(g.x + 0.5, g.z, 0, -1);
  a.joinRide('coaster');
  b.joinRide('coaster');
  check('queue: waits while the train is running', A.ride === null && A.rideQueue === 'coaster');
  // 다음 탑승 시간 → 자동 탑승. 친구 자리와 겹치지 않게
  now = Math.ceil(now / P) * P + 2000;
  for (let i = 0; i < 3; i++) {
    A.step();
    B.applyRemoteState('a', A.netState());
    B.step();
    A.applyRemoteState('b', B.netState());
  }
  check('board: queue turns into a seat at boarding time', A.ride?.id === 'coaster' && B.ride?.id === 'coaster');
  check('board: friends get different seats (front row first)', !!A.ride && !!B.ride && A.ride.seat !== B.ride.seat && Math.min(A.ride.seat, B.ride.seat) === 0, `(${A.ride?.seat}, ${B.ride?.seat})`);
  check('share: friend sees my seat', B.remotes.get('a')?.ride?.seat === A.ride?.seat && A.netState().rd === `coaster:${A.ride?.seat}`);
  check('ride: forced first-person prompt shows countdown', (A.promptLabel ?? '').includes('출발까지'));
  // 걷기 입력은 무시 (좌석에 고정)
  const x0 = A.player.x;
  for (let i = 0; i < 30; i++) A.step();
  check('ride: cannot walk while seated', Math.abs(A.player.x - x0) < 1e-6);
  // 운행 → 끝나면 내린다
  now += (RIDES.coaster.board + 10) * 1000;
  A.step();
  check('ride: still riding mid-run', A.ride?.id === 'coaster' && (A.promptLabel ?? '').includes('운행 중'));
  now += (COASTER_RUN.duration + 2) * 1000;
  A.step();
  check('ride: gets off at the exit when the run ends', A.ride === null && Math.hypot(A.player.x - RIDES.coaster.exit.x, A.player.z - RIDES.coaster.exit.z) < 0.5);
  // 대관람차: 칸이 아래 있을 때 타고, 한 바퀴 뒤 내린다
  a.placePlayer(RIDES.wheel.gate.x, RIDES.wheel.gate.z, 0, -1);
  for (let k = 0; k < 400 && !A.ride; k++) {
    if (!A.rideQueue) a.joinRide('wheel');
    now += 500;
    A.step();
  }
  check('wheel: boards a cabin', A.ride?.id === 'wheel');
  now += 120_000;
  A.step();
  check('wheel: still riding halfway', A.ride?.id === 'wheel');
  now += 121_000;
  A.step();
  check('wheel: gets off after one turn', A.ride === null);
  // 가이드 '가기': 길을 따라 토네이도 입구까지 걸어가 도착한다
  a.placePlayer(PARK.spawn.x, PARK.spawn.z, 0, -1);
  const msg = A.parkNavigate('gyro');
  for (let k = 0; k < 3000 && A.autopilot; k++) A.step();
  check('guide: walks along the paths to the gyro gate', msg === '' && !A.autopilot && Math.hypot(A.player.x - RIDES.gyro.gate.x, A.player.z - RIDES.gyro.gate.z) < 1.5, `(${A.player.x.toFixed(1)}, ${A.player.z.toFixed(1)})`);
  // 토네이도 · 스카이 스윙도 탑승하고, 운행이 끝나면 내린다
  for (const id of ['gyro', 'sky'] as const) {
    a.placePlayer(RIDES[id].gate.x, RIDES[id].gate.z, 0, -1);
    for (let k = 0; k < 400 && !A.ride; k++) {
      if (!A.rideQueue) a.joinRide(id);
      now += 500;
      A.step();
    }
    check(`${id}: boards a seat`, A.ride?.id === id);
    for (let k = 0; k < 400 && A.ride; k++) {
      now += 500;
      A.step();
    }
    check(`${id}: gets off at the exit`, A.ride === null && Math.hypot(A.player.x - RIDES[id].exit.x, A.player.z - RIDES[id].exit.z) < 0.5);
  }
  // 지도에서 집을 누르면: 지하철로 동네에 돌아와 집으로 걸어간다
  const home = A.map.pois.find((q) => q.kind === 'home')!;
  const err = A.navigateTo(home.x, home.z, '내 집');
  check('map: tapping home inside the park rides back and walks home', err === '' && A.location === 'city' && !!A.autopilot, `(${err})`);
  a.goToPark();
  // 역으로 돌아가기
  a.leavePark();
  check('subway: back to town', A.location === 'city');
  // 저장했다가 다시 들어오면 역 앞
  a.goToPark();
  const snap = A.placeSnapshot();
  const C = new CityWorld({ read: () => idle }, newProfile(), 3);
  C.restorePlace(snap);
  check('restore: reload inside the park puts you at the station', C.location === 'park' && Math.hypot(C.player.x - PARK.spawn.x, C.player.z - PARK.spawn.z) < 0.5);
}

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
