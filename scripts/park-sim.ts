/**
 * 놀이공원 시험: 롤러코스터 트랙·물리, 운행표(공유 시각), 놀이기구 동작
 *   npx tsx scripts/park-sim.ts
 */
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';
import { newProfile } from '../src/game/core/profile';
import { parkPeople, queueAhead, queueSpot, visitorSeats } from '../src/game/city/parkPeople';
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
  // 줄 선 손님들이 먼저 타고 (한 명에 약 1초) 그다음 우리 차례
  now = Math.ceil(now / P) * P + 7000;
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

// ───── 놀이공원 사람들: 직원 · 단골 손님 · 산책 (공유 시각으로만 정해진다) ─────
{
  const t0 = Date.UTC(2026, 10, 11, 5, 0, 0);
  const a = JSON.stringify(parkPeople(t0 + 12_345));
  const b = JSON.stringify(parkPeople(t0 + 12_345));
  check('people: same time → same people (everyone sees the same park)', a === b);
  const solids = parkSolids();
  const B = PARK.bounds;
  let outside = 0;
  let inSolid = 0;
  let walkers = 0;
  let riders = 0;
  let queued = 0;
  for (let t = 0; t < 600_000; t += 1_700) {
    for (const p of parkPeople(t0 + t)) {
      if (p.state === 'ride') {
        riders++;
        continue;
      }
      if (p.state === 'walk') walkers++;
      if (p.state === 'queue') queued++;
      if (p.x < B.x0 || p.x > B.x1 || p.z < B.z0 || p.z > B.z1) outside++;
      if (solids.some((r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)) inSolid++;
    }
  }
  check('people: nobody stands outside the park', outside === 0, `(${outside})`);
  check('people: nobody stands inside a ride', inSolid === 0, `(${inSolid})`);
  check('people: some walk, some queue, some ride', walkers > 0 && queued > 0 && riders > 0, `(walk ${walkers}, queue ${queued}, ride ${riders})`);
  const staff = parkPeople(t0).filter((p) => p.state === 'staff');
  check('people: one staff member at every ride gate', staff.length === RIDE_IDS.length && RIDE_IDS.every((id) => staff.some((p) => p.ride === id && Math.hypot(p.x - RIDES[id].gate.x, p.z - RIDES[id].gate.z) < 2)));
  // 손님은 뒷자리부터, 한 자리에 두 사람이 앉지 않는다
  let clash = 0;
  for (let t = 0; t < 600_000; t += 2_300) {
    const seen = new Set<string>();
    for (const p of parkPeople(t0 + t))
      if (p.state === 'ride') {
        const k = `${p.ride}:${p.seat}`;
        if (seen.has(k) || !visitorSeats(p.ride!, t0 + t).has(p.seat!)) clash++;
        seen.add(k);
      }
  }
  check('people: riders sit in their own (back) seats', clash === 0, `(${clash})`);
  // 운행 중엔 다음 운행을 기다리는 줄이 생길 때가 있다
  let lineWhileRunning = 0;
  for (let t = 0; t < 900_000; t += 1_000) {
    const now = t0 + t;
    if (rideClock('coaster', now).phase === 'running' && queueAhead('coaster', now) > 0) lineWhileRunning++;
  }
  check('people: a line forms while the coaster is running', lineWhileRunning > 0);
}

// ───── 직원 대화: 이용권 확인 → 바로 탑승 / 줄 서서 기다리기 ─────
{
  type S = { goToPark(): void; talkToStaff(id: string): void; placePlayer(x: number, z: number, fx: number, fz: number): void; freeSeat(id: string, now: number): number | null };
  const idle: CityInput = { move: null, run: false, interact: false };
  const W = new CityWorld({ read: () => idle }, newProfile(), 7);
  W.npcs = [];
  const w = W as unknown as S;
  let now = 0;
  W.parkClock = () => now;
  w.goToPark();
  const P = RIDES.viking.period * 1000;
  // 손님 줄이 없고 탑승 중인 운행을 찾는다 → "바로 탑승"
  const base = Math.floor(Date.UTC(2026, 10, 11, 6) / P) * P;
  let free = -1;
  let busy = -1;
  for (let c = 0; c < 200 && (free < 0 || busy < 0); c++) {
    const start = base + c * P;
    // 탑승 시간 막바지 (손님은 다 탔다)
    const late = start + (RIDES.viking.board - 4) * 1000;
    if (free < 0 && queueAhead('viking', late) === 0) free = late;
    // 운행 중인데 다음 운행 줄이 있다
    const mid = start + (RIDES.viking.board + 20) * 1000;
    if (busy < 0 && queueAhead('viking', mid) > 0) busy = mid;
  }
  check('staff: found a free moment and a busy moment to test', free > 0 && busy > 0);

  now = free;
  const g = RIDES.viking.gate;
  w.placePlayer(g.x, g.z, 0, -1);
  w.talkToStaff('viking');
  check('staff: E at the gate opens the staff talk', W.staffTalk?.ride === 'viking' && W.staffTalk.lines[0].who === 'staff');
  check('staff: cannot walk away while talking', (() => {
    const x0 = W.player.x;
    W.step();
    return Math.abs(W.player.x - x0) < 1e-6;
  })());
  W.staffTalkNext(); // 이용권 내밀기
  W.staffTalkNext(); // 직원 답
  check('staff: free → "바로 탑승하실게요"', (W.staffTalk?.lines[2]?.text ?? '').includes('바로 탑승하실게요'), `(${W.staffTalk?.lines[2]?.text})`);
  W.staffTalkNext(); // 닫기 → 탑승
  check('staff: closing the talk boards right away', W.ride?.id === 'viking' && !W.staffTalk);
  const mySeat = W.ride?.seat ?? -1;
  check('staff: my seat is not a visitor seat', !visitorSeats('viking', now).has(mySeat), `(seat ${mySeat})`);

  // 운행 중 + 줄 → "기다려 주세요", 줄 맨 뒤에 서고, 앞 손님이 다 탄 뒤에 탄다
  const V = new CityWorld({ read: () => idle }, newProfile(), 8);
  V.npcs = [];
  const v = V as unknown as S;
  now = busy;
  V.parkClock = () => now;
  v.goToPark();
  v.placePlayer(g.x, g.z, 0, -1);
  const ahead = queueAhead('viking', now);
  v.talkToStaff('viking');
  V.staffTalkNext();
  V.staffTalkNext();
  const said = V.staffTalk?.lines[2]?.text ?? '';
  check('staff: busy → tells me how many are ahead and to wait', said.includes(`앞에 ${ahead}분`) && said.includes('기다려'), `(${said})`);
  V.staffTalkNext();
  check('staff: then I join the end of the line', V.rideQueue === 'viking' && !V.ride);
  const end = queueSpot('viking', ahead);
  check('staff: standing behind the visitors', Math.hypot(V.player.x - end.x, V.player.z - end.z) < 0.2);
  let boardedWithLine = false;
  for (let k = 0; k < 400 && !V.ride; k++) {
    now += 250;
    V.step();
    if (V.ride && queueAhead('viking', now) > 0) boardedWithLine = true;
  }
  check('staff: I board only after the visitors ahead have boarded', !!V.ride && !boardedWithLine);
  // Esc: 그만두기
  const X = new CityWorld({ read: () => idle }, newProfile(), 9);
  X.npcs = [];
  X.parkClock = () => now;
  (X as unknown as S).goToPark();
  (X as unknown as S).talkToStaff('gyro');
  X.staffTalkCancel();
  check('staff: Esc ends the talk without queuing', !X.staffTalk && !X.rideQueue && !X.ride);
}

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
