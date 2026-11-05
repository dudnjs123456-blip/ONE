// 같이 쓰는 자리·같이 보는 장면 헤드리스 검증: npx tsx scripts/share-sim.ts
// - 경비 근무는 한 명만, 근무 장면(주민·강도·말풍선)은 같은 로비에 있는 친구에게도 똑같이
// - 소파엔 한 명만 눕는다
// - TV 는 같은 집에 있으면 같은 영상·같은 위치
import { CityWorld, HOME, LOBBY, type CityInput } from '../src/game/city/cityWorld';
import type { PlayerProfile } from '../src/game/core/profile';
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
(B as unknown as { sleep: unknown }).sleep = { phase: 'sleep', at: B.frame - 100, wp: 0, total: 600, done: 0, f0: 50, h0: 30, hp0: 100 };
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
