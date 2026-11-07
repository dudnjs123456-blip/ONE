// 같이 쓰는 자리·같이 보는 장면 헤드리스 검증: npx tsx scripts/share-sim.ts
// - 경비 근무는 한 명만, 근무 장면(주민·강도·말풍선)은 같은 로비에 있는 친구에게도 똑같이
// - 소파엔 한 명만 눕는다
// - TV 는 같은 집에 있으면 같은 영상·같은 위치
import { CityWorld, HOME, LOBBY, type CityInput } from '../src/game/city/cityWorld';
import type { PlayerProfile } from '../src/game/core/profile';
import { gameTimeAt } from '../src/game/city/worldClock';
import { tvApplyRemote, tvNet, tvPlay, tvPos, tvReset, tvSetPaused, tvState } from '../src/game/city/tvState';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
const idle: CityInput = { move: null, run: false, interact: false, buttons: N };
const newProfile = (): PlayerProfile => ({
  level: 1, exp: 0, gold: 100, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 20, hunger: 30 },
});

const pa = newProfile();
const pb = newProfile();
pa.home = { unit: '302', claimedAt: 1 };
pb.home = { unit: '201', claimedAt: 2 };
let ca: CityInput = idle;
const cb: CityInput = idle;
const A = new CityWorld({ read: () => ca }, pa, 1);
const B = new CityWorld({ read: () => cb }, pb, 2);
A.npcs = [];
B.npcs = [];
A.netId = 'a';
B.netId = 'b';
A.upsertRemote('b', '친구B', '201');
B.upsertRemote('a', '친구A', '302');

type Mover = { moveTo: (l: string, x: number, z: number, fx: number, fz: number) => void };
const move = (w: CityWorld, loc: string, x: number, z: number) => (w as unknown as Mover).moveTo(loc, x, z, 0, 1);

/** 네트워크 흉내: 모습 + 근무 장면 */
function stepBoth(n = 1) {
  for (let i = 0; i < n; i++) {
    A.step();
    B.step();
    B.applyRemoteState('a', A.netState());
    A.applyRemoteState('b', B.netState());
    if (A.job && i % 6 === 0) B.applyRemoteJob('a', A.job.netScene());
    if (B.job && i % 6 === 0) A.applyRemoteJob('b', B.job.netScene());
  }
}

// 1) 둘 다 로비 데스크 앞. A 가 근무를 시작하면 B 는 못 한다
const c = LOBBY.chair;
move(A, 'lobby', c.x + 0.6, c.z);
move(B, 'lobby', c.x + 0.9, c.z + 0.5);
stepBoth(3);
check('A starts job', A.startJob('aptGuard') === '' && !!A.job);
stepBoth(3);
const errB = B.startJob('aptGuard');
check('B blocked while A works', !B.job && errB.includes('친구A'), `(${errB})`);
check('desk label shows worker', B.jobTakenBy('aptGuard')?.name === '친구A');
check('A seated at desk shows on B', B.remotes.get('a')!.seat?.spot === 'desk');

// 2) A 의 근무 장면이 B 화면에도: 주민이 오면 B 도 같은 자리에 본다
A.job!.spawnVisitor();
A.job!.spawnRobber('thief', false);
stepBoth(90);
const aPeople = A.job!.people.filter((p) => p.where === 1);
const bPeople = B.shownPeople.filter((p) => p.where === 1);
check('B sees same people count', aPeople.length > 0 && aPeople.length === bPeople.length, `(A ${aPeople.length}, B ${bPeople.length})`);
const far = Math.max(...aPeople.map((p) => {
  const o = bPeople.find((q) => q.slot === p.slot);
  return o ? Math.hypot(o.f.x - p.f.x, o.f.z - p.f.z) : 99;
}));
check('B sees them at the same spots', far < 0.6, `(max gap ${far.toFixed(2)}m)`);
const ra = aPeople.find((p) => p.kind === 'robber');
const rb = bPeople.find((p) => p.kind === 'robber');
check('robber hp synced', !!ra && !!rb && ra.f.hp === rb.f.hp, `(${ra?.f.hp} / ${rb?.f.hp})`);
check('B sees the robber', bPeople.some((p) => p.kind === 'robber' && p.title === aPeople.find((q) => q.kind === 'robber')?.title));

// 3) A 가 퇴근하면 B 가 근무할 수 있고, 장면은 사라진다
A.quitJob();
stepBoth(3);
check('scene cleared after A quits', B.shownPeople.length === 0);
check('B can start after A quits', B.startJob('aptGuard') === '' && !!B.job);
B.quitJob();
stepBoth(3);

// 4) 거의 동시에 시작: 먼저 시작한 쪽만 남는다
A.startJob('aptGuard');
B.startJob('aptGuard');
// B 가 1ms 늦게 시작한 것으로
(B.job as unknown as { startedAt: number }).startedAt = A.job!.startedAt + 1;
stepBoth(2);
check('simultaneous start resolved', !!A.job && !B.job);
A.quitJob();
stepBoth(3);

// 5) 소파: B 집에 A 가 놀러 감. B 가 누우면 A 는 못 눕는다
move(B, 'home', HOME.sofa.sit.x, HOME.sofa.sit.z);
(A as unknown as { homeOwner: string | null }).homeOwner = 'b';
move(A, 'home', HOME.sofa.sit.x + 0.3, HOME.sofa.sit.z);
(A as unknown as { homeOwner: string | null }).homeOwner = 'b';
stepBoth(3);
check('same home room', A.roomKey === B.roomKey, `(${A.roomKey} / ${B.roomKey})`);
B.lieOnSofa();
stepBoth(60);
check('A sees B on sofa', A.remotes.get('b')!.seat?.spot === 'sofa' && A.sofaTakenBy()?.name === '친구B');
B.sofaAction('phone');
stepBoth(5);
check('A sees sofa action', A.remotes.get('b')!.seat?.act === 'phone');
// A 가 소파 E
const before = A.seat;
ca = { ...idle, interact: true };
A.player.reset(HOME.sofa.sit.x, HOME.sofa.sit.z, 0, 1);
stepBoth(1);
ca = idle;
stepBoth(2);
check('A cannot lie while B is on sofa', before === null && A.seat === null);
B.standUp();
stepBoth(80);
check('sofa free after B stands', !A.sofaTakenBy());

// 6) TV: 한 쪽에서 틀면 다른 쪽도 같은 영상·같은 위치. 늦게 바꾼 쪽을 따른다
tvReset();
tvPlay({ id: 'abcdefghijk', title: 't', channel: 'c', thumb: '' });
tvState.startAt = Date.now() - 42_000; // 42초째
const msg = tvNet('h:b');
// 친구 쪽 흉내: 상태를 비우고 받는다
tvReset();
tvApplyRemote(msg, 0.1);
check('TV video follows friend', tvState.now?.id === 'abcdefghijk');
check('TV position follows friend', Math.abs(tvPos() - 42.1) < 0.5, `(${tvPos().toFixed(1)}s)`);
const older = { ...msg, v: null, ch: msg.ch - 1000 };
tvApplyRemote(older, 0);
check('older TV change ignored', tvState.now?.id === 'abcdefghijk');
tvSetPaused(true);
const paused = tvNet('h:b');
tvReset();
tvApplyRemote(msg, 0);
tvApplyRemote(paused, 0.5);
check('TV pause follows friend', tvState.pausedAt !== null && Math.abs(tvPos() - paused.pos) < 0.01);
tvApplyRemote({ ...paused, v: null, paused: false, ch: paused.ch + 10 }, 0);
check('TV off follows friend', tvState.now === null);

// 7) 자는 모습: B 집에 놀러 간 A 는 B 가 침대에 누워 자는 걸 본다
(B as unknown as { sleep: unknown }).sleep = { phase: 'sleep', at: B.frame - 100, wp: 0, since: B.nowMs(), last: B.nowMs() };
const sn = B.netState();
A.applyRemoteState('b', sn);
check('A sees B sleeping in bed', !!A.remotes.get('b')!.sleep && A.remotes.get('b')!.sleep!.rest === 1, `(${JSON.stringify(A.remotes.get('b')!.sleep)})`);
(B as unknown as { sleep: unknown }).sleep = null;
A.applyRemoteState('b', B.netState());
check('sleep cleared when B wakes', A.remotes.get('b')!.sleep === null);

// 8) 낚시: B 가 데크에서 낚시하면 A 화면에도 같은 낚싯대·찌·단계
move(A, 'city', 0, 0);
move(B, 'city', 0, 0);
(A as unknown as { homeOwner: string | null }).homeOwner = null;
(B as unknown as { homeOwner: string | null }).homeOwner = null;
const fsB = B.fishingState;
fsB.rods = ['bamboo'];
fsB.rod = 'bamboo';
fsB.bait = { worm: 10 } as typeof fsB.bait;
fsB.use = 'worm' as typeof fsB.use;
const deck = B.map.fishDecks[0];
B.player.reset(deck.x, deck.z1 - 0.9, 0, 1);
A.player.reset(deck.x + 1.5, deck.z1 - 1.5, 0, 1);
(B as unknown as { startFishing: (d: number) => void }).startFishing(0);
stepBoth(3);
const mine = B.fishScene();
const seen = A.remoteFishScene(A.remotes.get('b')!);
check('A sees B fishing', !!mine && !!seen && seen.f.phase === mine.f.phase && seen.rod.id === mine.rod.id, `(${mine?.f.phase} / ${seen?.f.phase})`);
check('same fishing spot', !!mine && !!seen && Math.abs(seen.spot.x - mine.spot.x) < 0.02 && Math.abs(seen.spot.z - mine.spot.z) < 0.02);
// 던지기 (Space 한 번 = 낚시 세션의 step(tap))
(B.fishing as unknown as { cast: () => void }).cast();
stepBoth(30);
const seen2 = A.remoteFishScene(A.remotes.get('b')!);
check('fishing phase follows after cast', !!seen2 && seen2.f.phase === B.fishing!.phase && seen2.f.phase !== 'ready' && Math.abs(seen2.f.t - B.fishing!.t) <= 2, `(t ${seen2?.f.t} / ${B.fishing!.t})`);
B.fishing = null;
B.fishSpot = null;
stepBoth(2);
check('fishing gone when B stops', A.remoteFishScene(A.remotes.get('b')!) === null);

// 9) 펫: B 곁의 펫이 A 화면에도 같은 자리에
B.pets.poses = [{ pet: { id: 'p1', species: 'dog', joy: 80 } as never, x: 1, y: 0, z: 2, yaw: 0.5, moving: 1 }];
A.applyRemoteState('b', B.netState());
const pet = A.remotes.get('b')!.pets[0];
check('A sees B pet', !!pet && pet.sp === 'dog' && pet.x === 1 && pet.z === 2 && pet.mv === 1);

// 10) 동네 시계: 모두 같은 날짜·시각·날씨. 잠자기·근무로 혼자 시간을 빨리 감지 못한다
{
  let fake = Date.UTC(2026, 10, 5, 3, 0, 0); // 가짜 서버 시각
  const now = () => fake;
  const pc = newProfile();
  pc.time = { day: 3, minutes: 100 }; // 예전 개인 시각은 무시된다
  const pd = newProfile();
  pd.time = { day: 40, minutes: 900 };
  const C = new CityWorld({ read: () => idle }, pc, 3);
  const D = new CityWorld({ read: () => idle }, pd, 4);
  C.npcs = [];
  D.npcs = [];
  C.attachSharedClock(now);
  D.attachSharedClock(now);
  const g = gameTimeAt(fake);
  check('shared clock ignores old per-player time', C.day === g.day && D.day === g.day && C.minutes === D.minutes, `(${C.day}일째 ${C.clock} / ${D.day}일째 ${D.clock})`);
  // 많은 날을 돌려 보며 날씨가 항상 같은지
  let diff = 0;
  for (let i = 0; i < 400; i++) {
    fake += 37 * 60_000; // 37분씩 → 게임 37시간씩
    C.step();
    D.step();
    if (C.day !== D.day || C.clock !== D.clock || C.weather.kind !== D.weather.kind) diff++;
  }
  check('same day/clock/weather for everyone', diff === 0, `(어긋남 ${diff}회)`);
  // 잠: 시간을 빨리 감지 않는다
  const t0 = C.day * 1440 + C.minutes;
  pc.life.fatigue = 90;
  (C as unknown as { sleep: unknown }).sleep = { phase: 'sleep', at: C.frame, wp: 0, since: fake - 3_600_000, last: fake - 3_600_000 };
  for (let i = 0; i < 300; i++) {
    fake += 1000 / 60;
    C.step();
    D.step();
  }
  const t1 = C.day * 1440 + C.minutes;
  check('sleep does not fast-forward shared clock', Math.abs(t1 - t0 - 5 / 60) < 0.01 && C.clock === D.clock, `(${(t1 - t0).toFixed(2)}분)`);
  check('sleep still restores fatigue', pc.life.fatigue < 90);
  (C as unknown as { sleep: unknown }).sleep = null;
  // 근무: 시간을 빨리 감지 않는다
  const c2 = LOBBY.chair;
  move(C, 'lobby', c2.x + 0.6, c2.z);
  C.step();
  C.startJob('aptGuard');
  const j0 = C.day * 1440 + C.minutes;
  for (let i = 0; i < 600; i++) {
    fake += 1000 / 60;
    C.step();
    D.step();
  }
  const j1 = C.day * 1440 + C.minutes;
  check('job does not fast-forward shared clock', !!C.job && Math.abs(j1 - j0 - 10 / 60) < 0.01 && C.clock === D.clock, `(${(j1 - j0).toFixed(2)}분)`);
  C.quitJob();
}

// 11) 계속 자기: 창을 닫았다 와도 침대에서 이어 잔다. 12시간이 넘었으면 일어난다
{
  let fake = Date.UTC(2026, 10, 5, 13, 0, 0);
  const pe = newProfile();
  pe.life.fatigue = 90;
  pe.life.sleepAt = fake - 3 * 3_600_000; // 3시간 전에 잠들었다
  const E = new CityWorld({ read: () => idle }, pe, 5);
  E.npcs = [];
  E.attachSharedClock(() => fake);
  E.resumeSleep();
  check('resumes sleeping in bed after reload', E.location === 'home' && E.sleep?.phase === 'sleep', `(${E.location} ${E.sleep?.phase})`);
  check('offline sleep counted', pe.life.fatigue < 1, `(피로 ${pe.life.fatigue.toFixed(1)})`);
  for (let i = 0; i < 120; i++) {
    fake += 1000 / 60;
    E.step();
  }
  check('still asleep without input', E.sleep?.phase === 'sleep');
  const pf = newProfile();
  pf.life.sleepAt = fake - 13 * 3_600_000;
  const F = new CityWorld({ read: () => idle }, pf, 6);
  F.npcs = [];
  F.attachSharedClock(() => fake);
  F.resumeSleep();
  for (let i = 0; i < 200 && F.sleep; i++) {
    fake += 1000 / 60;
    F.step();
  }
  check('slept 12h+ offline → wakes up', F.sleep === null && pf.life.sleepAt === undefined && /12시간/.test(F.toast?.text ?? ''), `(${F.toast?.text})`);
}

// 12) 같이 보는 동네: id 가 작은 A 가 행인·차·경찰·박 반장을 계산하고, B 는 그대로 따라 본다
{
  let fake = Date.UTC(2026, 10, 5, 3, 0, 0);
  const now = () => fake;
  const Q = [true, false, false, false] as [boolean, boolean, boolean, boolean];
  let cmdB: CityInput = idle;
  const qa = newProfile();
  const qb = newProfile();
  qa.home = { unit: '302', claimedAt: 1 };
  qb.home = { unit: '201', claimedAt: 2 };
  qb.gold = 0;
  const TA = new CityWorld({ read: () => idle }, qa, 3);
  const TB = new CityWorld({ read: () => cmdB }, qb, 4);
  for (const w of [TA, TB]) w.attachSharedClock(now);
  TA.netId = 'a';
  TB.netId = 'b';
  TA.upsertRemote('b', '친구B', '201');
  TB.upsertRemote('a', '친구A', '302');
  let n = 0;
  let aOnline = true;
  /** 네트워크 흉내: 모습·타격은 매 프레임, 동네 장면은 8프레임마다 (초당 7.5번) */
  const town = (k = 1) => {
    for (let i = 0; i < k; i++) {
      fake += 1000 / 60;
      TA.step();
      TB.step();
      if (aOnline) TB.applyRemoteState('a', TA.netState());
      TA.applyRemoteState('b', TB.netState());
      for (const h of TA.outbox.splice(0)) if (h.to === 'b') TB.receiveRemoteHit('a', h);
      for (const h of TB.outbox.splice(0)) if (h.to === 'a' && aOnline) TA.receiveRemoteHit('b', h);
      if (aOnline && ++n % 8 === 1) TB.applyTown('a', JSON.parse(JSON.stringify(TA.netTown(n % 64 === 1, n % 16 === 1))), true);
    }
  };
  TA.player.reset(TA.map.home.x + 3, TA.map.home.z + 3, 0, 1);
  TB.player.reset(TA.map.home.x + 5, TA.map.home.z + 3, 0, 1);
  town(150);
  check('A computes the town, B follows', TA.isTownHost && !TB.isTownHost);
  const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const npcGap = Math.max(...TA.npcs.map((na) => {
    const nb = TB.npcs.find((x) => x.fighter.index === na.fighter.index);
    return nb ? gap(na.fighter, nb.fighter) : 99;
  }));
  check('same pedestrians for both', TA.npcs.length === TB.npcs.length && TB.npcs.every((x, i) => x.name === TA.npcs[i].name), `(${TA.npcs.length} / ${TB.npcs.length})`);
  check('pedestrians at the same spots', npcGap < 0.8, `(max gap ${npcGap.toFixed(2)}m)`);
  const carGap = Math.max(...TA.cars.map((c, i) => gap(c, TB.cars[i])));
  check('cars at the same spots', carGap < 1.5, `(max gap ${carGap.toFixed(2)}m)`);
  check('same traffic signal clock', TA.signalSeconds === TB.signalSeconds);
  check('senior guard in the same place', gap(TA.senior, TB.senior) < 0.5 && TA.seniorAI.patrolling === TB.seniorAI.patrolling);

  // B 가 행인을 때리면: A(계산하는 쪽)에서 체력이 깎이고, B 화면에도 같은 체력
  const target = TA.npcs[0];
  target.fighter.reset(TB.player.x + 0.85, TB.player.z, -1, 0);
  target.pause = 99999;
  target.brave = false;
  const hp0 = target.fighter.hp;
  TB.player.fx = 1;
  TB.player.fz = 0;
  town(9);
  cmdB = { ...idle, buttons: Q };
  town(1);
  cmdB = idle;
  town(40);
  const mirror = TB.npcs.find((x) => x.fighter.index === target.fighter.index)!;
  check('B hits a pedestrian → host applies it', target.fighter.hp < hp0, `(${hp0} → ${target.fighter.hp})`);
  check('B sees the same pedestrian HP', !!mirror && mirror.fighter.hp === target.fighter.hp, `(${mirror?.fighter.hp} / ${target.fighter.hp})`);
  check('pedestrian reacts to B (flees from B)', target.foe === 'b' && (target.flee > 0 || target.koFrames >= 0));
  // 쓰러뜨리면 B 가 지갑을 줍는다
  target.fighter.hp = 1;
  target.flee = 0;
  target.pause = 99999;
  target.fighter.reset(TB.player.x + 0.85, TB.player.z, -1, 0);
  target.fighter.hp = 1;
  const wallet = target.wallet;
  town(9);
  cmdB = { ...idle, buttons: Q };
  town(1);
  cmdB = idle;
  town(40);
  check('B knocks out pedestrian → B gets the wallet', target.koFrames >= 0 && qb.gold >= wallet && qa.gold === 100, `(B ${qb.gold}G, 지갑 ${wallet}G, A ${qa.gold}G)`);
  // 경찰은 B 를 쫓는다 (A 화면엔 경찰 안내가 없다)
  TA.police.phase = 'none';
  TA.police.wanted = 'b';
  (TA as unknown as { report: (n: unknown) => void }).report(TA.npcs[1]);
  town(20);
  check('police are after B (for both)', TA.police.wanted === 'b' && TB.police.wanted === 'b' && TB.police.phase === TA.police.phase && TA.police.phase !== 'none', `(${TA.police.phase} / ${TB.police.phase})`);
  check('only B gets the police alert', !!TB.policeStatus && TA.policeStatus === null, `(${TB.policeStatus})`);
  TA.police.phase = 'none';
  TA.police.wanted = '';
  // 덤비는 행인이 B 를 때리면 B 체력이 깎인다
  const brute = TA.npcs[2];
  brute.fighter.reset(TB.player.x - 0.9, TB.player.z, 1, 0);
  brute.koFrames = -1;
  brute.fight = 600;
  brute.foe = 'b';
  brute.atkCd = 1;
  const bhp = TB.player.hp;
  town(80);
  check('angry pedestrian hits B → B loses HP', TB.player.hp < bhp, `(${bhp} → ${TB.player.hp})`);
  brute.fight = 0;
  town(30);

  // A 가 나가면 (소식이 끊기면) B 가 이어서 계산한다: 행인이 순간이동하지 않는다
  const before = TB.npcs.map((x) => ({ i: x.fighter.index, x: x.fighter.x, z: x.fighter.z }));
  aOnline = false;
  town(130);
  check('B takes over when A is gone', TB.isTownHost);
  const jump = Math.max(...before.map((b) => {
    const x = TB.npcs.find((y) => y.fighter.index === b.i);
    return x ? Math.hypot(x.fighter.x - b.x, x.fighter.z - b.z) : 0;
  }));
  check('town continues smoothly after takeover', TB.npcs.length === before.length && jump < 15, `(가장 많이 움직인 행인 ${jump.toFixed(1)}m / 130프레임)`);
}

// 13) 서울에서 때릴 때: 타격 경직 동안 모두 그 자리에 딱 멈춰 보이고(떨림 없음), 걸어가는 행인도 확실히 맞는다
{
  const Q = [true, false, false, false] as [boolean, boolean, boolean, boolean];
  let cmd: CityInput = idle;
  const pw = newProfile();
  const W = new CityWorld({ read: () => cmd }, pw, 9);
  W.player.reset(W.map.home.x + 3, W.map.home.z + 3, 1, 0);
  // 앞에서 옆으로 걸어가는 행인 (방향을 살짝 비켜 서 있어도 맞아야 한다)
  const t = W.npcs[0];
  t.brave = false;
  t.fighter.reset(W.player.x + 1.0, W.player.z + 0.35, 0, 1);
  t.path = [{ x: W.player.x + 1.0, z: W.player.z + 30 }];
  t.next = 0;
  const hp0 = t.fighter.hp;
  let shaky = 0;
  let frozenFrames = 0;
  for (let i = 0; i < 60; i++) {
    cmd = i < 2 ? { ...idle, buttons: Q } : idle;
    // 이번 프레임이 경직 중인 프레임인가 (때린 그 프레임은 모두 평소처럼 움직인다)
    const frozenNow = W.hitstop > 0;
    W.step();
    if (frozenNow) {
      frozenFrames++;
      // 경직 중: 직전 위치 = 지금 위치 (화면 보간이 앞뒤로 오가지 않는다)
      for (const n of W.npcs) {
        const a = n.fighter.lerped(0);
        const b = n.fighter.lerped(1);
        if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-6) shaky++;
      }
    }
  }
  check('attack lands on a walking pedestrian', t.fighter.hp < hp0, `(${hp0} → ${t.fighter.hp})`);
  check('hit freeze happened', frozenFrames > 0, `(${frozenFrames}프레임)`);
  check('no jitter during hit freeze', shaky === 0, `(떨린 사람·프레임 ${shaky})`);
}
