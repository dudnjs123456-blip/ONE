// 멀티플레이 헤드리스 검증 (두 게임을 코드 안에서 이어 붙인다): npx tsx scripts/mp-sim.ts
import { CityWorld, CORRIDOR, HOME, type CityInput } from '../src/game/city/cityWorld';
import type { PlayerProfile } from '../src/game/core/profile';
import { MOVES } from '../src/game/data/moves';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const N = [false, false, false, false] as [boolean, boolean, boolean, boolean];
const Q = [true, false, false, false] as [boolean, boolean, boolean, boolean];
const idle: CityInput = { move: null, run: false, interact: false, buttons: N };

const newProfile = (gold: number): PlayerProfile => ({
  level: 1, exp: 0, gold, kills: 0, bossClears: {}, bossBest: {}, inventory: {}, life: { fatigue: 20, hunger: 30 },
});

let ca: CityInput = idle;
let cb: CityInput = idle;
const pa = newProfile(500);
const pb = newProfile(300);
pa.home = { unit: '302', claimedAt: 1 };
pb.home = { unit: '201', claimedAt: 2 };
const A = new CityWorld({ read: () => ca }, pa, 1);
const B = new CityWorld({ read: () => cb }, pb, 2);
// 행인·경찰이 끼어들지 않게 비운다
A.npcs = [];
B.npcs = [];
A.netId = 'a';
B.netId = 'b';
A.upsertRemote('b', '친구B', '201');
B.upsertRemote('a', '친구A', '302');

/** 네트워크 흉내: 서로의 모습과 타격을 넘겨 준다 */
function relay() {
  B.applyRemoteState('a', A.netState());
  A.applyRemoteState('b', B.netState());
  for (const h of A.outbox.splice(0)) if (h.to === 'b') B.receiveRemoteHit('a', h);
  for (const h of B.outbox.splice(0)) if (h.to === 'a') A.receiveRemoteHit('b', h);
}
function stepBoth(n = 1) {
  for (let i = 0; i < n; i++) {
    A.step();
    B.step();
    relay();
  }
}

// 1) 같은 도시에 있으면 서로 보이고 위치가 따라온다
const sx = A.map.home.x + 6;
const sz = A.map.home.z + 4;
A.player.reset(sx, sz, 1, 0);
B.player.reset(sx + 0.9, sz, -1, 0);
stepBoth(20);
const ghostB = A.remotes.get('b')!;
check('friend in same room', ghostB.room === A.roomKey && ghostB.room === 'city', `(${ghostB.room})`);
check('friend level shown', ghostB.level === pb.level, `(Lv.${ghostB.level})`);
check('friend position follows', Math.hypot(ghostB.fighter.x - B.player.x, ghostB.fighter.z - B.player.z) < 0.2);

// 2) 잽: 때린 쪽이 판정하고, 맞은 쪽 체력이 혼자 할 때와 같은 계산으로 준다
const hpBefore = B.player.hp;
ca = { ...idle, buttons: Q };
stepBoth(1);
ca = idle;
let hitEvents = 0;
for (let i = 0; i < 40; i++) {
  stepBoth(1);
  hitEvents += A.drainEvents().length;
  B.drainEvents();
}
const dealt = hpBefore - B.player.hp;
check('jab hits friend', dealt > 0 && hitEvents > 0, `(dealt ${dealt}, sparks ${hitEvents})`);
{
  const expect = Math.max(1, Math.round(MOVES.jab.damage * A.player.power));
  check('damage uses same formula', dealt === expect, `(dealt ${dealt}, expected ${expect})`);
}

// 3) 다른 곳(집)에 있으면 안 보이고 맞지 않는다
B.player.hp = B.player.maxHp;
cb = { move: null, run: false, interact: false };
// B 를 자기 집으로
(B as unknown as { moveTo: (l: string, x: number, z: number, fx: number, fz: number) => void }).moveTo('home', HOME.spawn.x + 0.8, HOME.spawn.z, 1, 0);
stepBoth(5);
check('friend at home is in another room', A.remotes.get('b')!.room !== A.roomKey, `(${A.remotes.get('b')!.room} vs ${A.roomKey})`);
check('my home and friend home are different rooms', B.roomKey === 'h:b' && A.remotes.get('b')!.room === 'h:b');
const hpHome = B.player.hp;
A.player.reset(HOME.spawn.x + 0.8 - 0.9, HOME.spawn.z, 1, 0);
ca = { ...idle, buttons: Q };
stepBoth(1);
ca = idle;
stepBoth(40);
check('no hits across rooms', B.player.hp === hpHome);

// 4) 복도에서 친구 집 문 → 놀러 가기, 같은 집이면 같은 방
(A as unknown as { goFloor: (f: number) => void }).goFloor(2);
stepBoth(2);
const pois = (A as unknown as { corridorPois: () => { id: string; label: string; x: number; z: number }[] }).corridorPois();
const visit = pois.find((q) => q.id === 'visit:b');
check('friend door on 2F', !!visit, `(${visit?.label})`);
check('my door not on 2F', !pois.some((q) => q.id === 'myDoor'));
A.player.reset(visit!.x, visit!.z, 0, -1);
ca = { move: null, run: false, interact: true };
stepBoth(1);
ca = idle;
stepBoth(3);
check('visited friend home', A.location === 'home' && A.homeOwner === 'b' && A.roomKey === B.roomKey, `(${A.roomKey})`);
check('friend home label', A.placeLabel.includes('친구B'), `(${A.placeLabel})`);

// 5) 쓰러뜨리면: 맞은 쪽은 자기 집에서 깨어나고 돈은 그대로
B.player.reset(0.9, 0, -1, 0);
A.player.reset(0, 0, 1, 0);
B.player.hp = 3;
const goldB = pb.gold;
stepBoth(3);
ca = { ...idle, buttons: Q };
stepBoth(1);
ca = idle;
stepBoth(30);
check('friend knocked down', B.downedAt !== null, `(hp ${B.player.hp})`);
stepBoth(260);
check('wakes up at own home', B.location === 'home' && B.homeOwner === null && B.downedAt === null);
check('no gold lost to friend', pb.gold === goldB, `(${goldB} → ${pb.gold})`);

// 6) 친구가 나가면 사라지고, 그 친구 집에 있던 나는 밖으로
A.removeRemote('b');
check('left friend removed', !A.remotes.has('b') && A.location === 'city');

// 7) 집 호수 목록
check('units start at 302', A.allUnits[0] === '302' && A.allUnits.length >= CORRIDOR.doors.length, `(${A.allUnits.join(',')})`);
