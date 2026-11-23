// 달빛 여관(게스트하우스) · 은화 검증: npx tsx scripts/inn-sim.ts
import { FieldWorld, clampWalk, type FieldCommand } from '../src/game/core/field';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';
import { MONSTERS } from '../src/game/data/monsters';
import { VILLAGE_NPCS } from '../src/game/data/village';
import {
  INN, INN_BED_PRICE, INN_BEDS, INN_BOOTHS, INN_DOOR_OUT, INN_ENTRY, INN_FURNITURE, INN_HALL_Z, INN_MENU, INN_ROOM_DOORS, SHOWER_FRAMES, SLEEP_LIE_FRAMES, SLEEP_WAKE_FRAMES,
  bedStand, boothStand, inInn, innRoomAt,
} from '../src/game/data/inn';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) failed++;
};

/** 방향키를 흉내 내는 컨트롤러 (move 를 바꿔 가며 쓴다) */
function makeWorld() {
  const ctl = { move: null as FieldCommand['move'], buttons: false };
  const w = new FieldWorld({ read: () => ({ move: ctl.move, input: ctl.buttons ? { dir: 5, buttons: [true, false, false, false] } : NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile());
  let now = 1_000_000;
  w.nowMs = () => now;
  return { w, ctl, advance: (ms: number) => (now += ms) };
}
const steps = (w: FieldWorld, n: number) => {
  for (let i = 0; i < n; i++) w.step();
};

// 1) 몬스터를 잡으면 은화를 받는다 (서울 돈 G 는 그대로)
{
  const { w } = makeWorld();
  const gold0 = w.profile.gold;
  (w as unknown as { grantKill: (t: unknown, x: number, z: number) => void }).grantKill(MONSTERS.goblin, 0, 0);
  check('kill pays dimension coin, not Seoul gold', w.coin === MONSTERS.goblin.gold && w.profile.gold === gold0 && w.hud().coin === w.coin && w.hud().session.coin === w.coin, `(은화 ${w.coin}, G ${w.profile.gold})`);
}

// 2) 여관 문으로 걸어 들어가고, 남문으로 걸어 나온다
{
  const { w, ctl } = makeWorld();
  w.player.reset(INN_DOOR_OUT.x + 1.2, INN_DOOR_OUT.z, -1, 0);
  ctl.move = { x: -1, z: 0 };
  let inside = false;
  for (let i = 0; i < 200 && !inside; i++) {
    w.step();
    inside = inInn(w.player.x, w.player.z);
  }
  const warp1 = w.warpSerial;
  const atEntry = Math.hypot(w.player.x - INN_ENTRY.x, w.player.z - INN_ENTRY.z) < 0.5;
  const safe = w.hud().inVillage && w.hud().inInn;
  ctl.move = { x: 0, z: 1 };
  let out = false;
  for (let i = 0; i < 200 && !out; i++) {
    w.step();
    out = !inInn(w.player.x, w.player.z);
  }
  check('walk through inn door in and out', inside && atEntry && safe && out && w.warpSerial === warp1 + 1 && w.player.x > INN_DOOR_OUT.x, `(들어감 ${inside}, 문 앞 ${atEntry}, 안전 ${safe}, 나옴 ${out}, 바깥 x ${w.player.x.toFixed(2)})`);
}

// 3) 방은 벽으로 나뉜다: 욕실에서 식당으로 벽을 뚫고 갈 수 없고, 복도 문으로만 드나든다
{
  const f = { x: 96.5, z: 30 }; // 욕실·식당 칸막이 한가운데
  clampWalk(f);
  const wall = Math.abs(f.x - 96.5) > 0.3;
  const g = { x: 99.6, z: INN_HALL_Z }; // 식당 문 (열려 있다)
  clampWalk(g);
  const door = Math.abs(g.x - 99.6) < 0.01 && Math.abs(g.z - INN_HALL_Z) < 0.01;
  const h = { x: 95.8, z: INN_HALL_Z }; // 문 아닌 복도 벽
  clampWalk(h);
  const hallWall = Math.abs(h.z - INN_HALL_Z) > 0.3;
  const rooms = innRoomAt(93, 30) === 'bath' && innRoomAt(99.5, 30) === 'dining' && innRoomAt(105, 30) === 'dorm' && innRoomAt(100, 36) === 'hall';
  const standsFree = INN_BEDS.every((b) => {
    const s = bedStand(b);
    const p = { ...s };
    clampWalk(p);
    return Math.hypot(p.x - s.x, p.z - s.z) < 0.01;
  }) && INN_BOOTHS.every((b) => {
    const s = boothStand(b);
    const p = { ...s };
    clampWalk(p);
    return Math.hypot(p.x - s.x, p.z - s.z) < 0.01;
  });
  check('rooms are separated by walls (doors only)', wall && door && hallWall && rooms && standsFree && INN_ROOM_DOORS.length === 3, `(칸막이 ${wall}, 문 ${door}, 복도벽 ${hallWall}, 방 ${rooms}, 침대·샤워 앞 빈자리 ${standsFree}, 가구 ${INN_FURNITURE.length})`);
  check('guest house sleeps several people', INN_BEDS.length >= 6 && INN_BOOTHS.length >= 3, `(침대 ${INN_BEDS.length} · 샤워 ${INN_BOOTHS.length})`);
}

// 4) 자기: 첫날 밤 공짜 → 실제 시간만큼 피로 회복 → 아무 키로 일어남. 그다음엔 은화를 낸다
{
  const { w, ctl, advance } = makeWorld();
  const life = w.profile.life;
  life.fatigue = 90;
  life.hunger = 20;
  w.player.reset(bedStand(INN_BEDS[0]).x, bedStand(INN_BEDS[0]).z, 1, 0);
  w.step();
  const spot = w.hud().innSpot;
  const lay = w.useInnSpot();
  steps(w, SLEEP_LIE_FRAMES + 5);
  const asleep = w.sleep?.phase === 'sleep' && w.profile.dimension?.sleep?.bed === 0 && w.restAmount === 1;
  const net = w.netState();
  advance(60 * 60_000); // 실제 1시간
  steps(w, 70);
  const rested = life.fatigue < 45 && life.fatigue > 35 && life.hunger > 27;
  ctl.buttons = true;
  w.step();
  ctl.buttons = false;
  const waking = w.sleep?.phase === 'wake' && !w.profile.dimension?.sleep;
  steps(w, SLEEP_WAKE_FRAMES + 2);
  const up = w.sleep === null;
  check('first night free, sleep in real time, wake on key', !!spot && spot.kind === 'bed' && lay && asleep && net.b === 0 && net.r === 1 && rested && waking && up && w.coin === 0,
    `(눕기 ${lay}, 잠듦 ${asleep}, 피로 90→${life.fatigue.toFixed(1)}, 배고픔 20→${life.hunger.toFixed(1)}, 깸 ${waking}/${up})`);

  life.fatigue = 80;
  const poor = !w.lieDown(0) && w.log.some((l) => l.text.includes('모자라'));
  w.profile.dimension!.coin = 100;
  const paid = w.lieDown(0) && w.coin === 100 - INN_BED_PRICE;
  check('second night costs coin', poor && paid, `(돈 없을 때 막힘 ${poor}, 낸 뒤 ${w.coin})`);
}

// 5) 창을 닫았다 다시 켜도 그 침대에서 계속 잔다 (그사이 흐른 시간만큼 쉼) · 로그아웃하면 일어난다
{
  const { w, advance } = makeWorld();
  w.profile.life.fatigue = 95;
  w.lieDown(2);
  steps(w, SLEEP_LIE_FRAMES + 2);
  const saved = JSON.parse(JSON.stringify(w.profile));
  const w2 = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), saved);
  let now = 1_000_000 + 2 * 3_600_000;
  w2.nowMs = () => now;
  const resumed = w2.resumeSleep();
  const back = w2.sleep?.bed === 2 && w2.profile.life.fatigue < 5;
  now += 1000;
  w2.leaveBed();
  const left = !w2.sleep && !w2.profile.dimension?.sleep;
  advance(0);
  check('sleep continues after closing the window', resumed && back && left, `(이어 자기 ${resumed}, 2시간 뒤 피로 ${w2.profile.life.fatigue.toFixed(1)}, 로그아웃 ${left})`);
}

// 6) 남이 자는 침대 · 씻는 샤워 칸은 못 쓴다 (같은 차원 사람과 공유)
{
  const { w } = makeWorld();
  w.netId = 'me';
  w.upsertHunter('friend', '친구', 0);
  w.applyHunterState('friend', { ...w.netState(), x: 105, z: 31, b: 1, r: 1, w: 0 });
  w.profile.life.fatigue = 90;
  const bedBusy = !w.lieDown(1);
  const showerBusy = !w.startShower(0);
  const other = w.lieDown(3);
  check('beds and booths are shared with others', bedBusy && showerBusy && other, `(남의 침대 막힘 ${bedBusy}, 남의 샤워 막힘 ${showerBusy}, 빈 침대 ${other})`);
}

// 7) 씻기: 더러움 0 · 사냥하면 더러워진다
{
  const { w } = makeWorld();
  const st = boothStand(INN_BOOTHS[1]);
  w.player.reset(st.x, st.z, 0, -1);
  w.profile.life.dirt = 70;
  w.step();
  const spot = w.hud().innSpot;
  const ok1 = w.useInnSpot();
  const hidden = w.netState().w === 1 && w.hud().shower !== null;
  steps(w, SHOWER_FRAMES + 2);
  const clean = (w.profile.life.dirt ?? 0) < 0.01 && w.shower === null;
  w.player.reset(0, 0, 0, -1);
  steps(w, 600);
  const dirty = (w.profile.life.dirt ?? 0) > 0;
  check('shower washes off dirt (dirt builds while out)', spot?.kind === 'shower' && ok1 && hidden && clean && dirty, `(샤워 ${ok1}, 커튼 ${hidden}, 깨끗 ${clean}, 다시 더러워짐 ${dirty})`);
}

// 8) 식당: 보리와 이야기하면 메뉴 → 은화로 사 먹는다 (G 로는 못 산다)
{
  const { w } = makeWorld();
  const bori = VILLAGE_NPCS.find((n) => n.id === 'bori')!;
  w.player.reset(bori.x, bori.z + 1.6, 0, -1);
  clampWalk(w.player);
  w.step();
  const talk = w.talk();
  const service = w.endTalk();
  w.profile.gold = 99999;
  w.profile.life.hunger = 80;
  const noCoin = !w.buyMeal('stew').ok && w.profile.life.hunger === 80 && w.profile.gold === 99999;
  w.profile.dimension!.coin = 50;
  const stew = INN_MENU.find((m) => m.id === 'stew')!;
  const r = w.buyMeal('stew');
  const ate = r.ok && w.coin === 50 - stew.price && w.profile.life.hunger === 80 - stew.hunger;
  check('dining: cook opens menu, meals cost coin only', !!talk && inInn(bori.x, bori.z) && service === 'meal' && noCoin && ate, `(대화 ${!!talk}, 메뉴 ${service}, G 로 못 삼 ${noCoin}, 스튜 ${r.message} · 남은 은화 ${w.coin})`);
}

// 9) 여관 안에선 자동사냥을 못 켜고, 몬스터는 여관 안 사람을 쫓지 않는다
{
  const { w } = makeWorld();
  w.player.reset(INN_ENTRY.x, INN_ENTRY.z, 0, -1);
  w.toggleAuto();
  const noAuto = !w.auto;
  const target = w.nearestHunter(0, 0, true);
  check('inn is safe (no auto, monsters ignore)', noAuto && target === null && INN.x0 > 60, `(자동사냥 ${w.auto}, 쫓을 사람 ${target ? '있음' : '없음'})`);
}

process.exitCode = failed ? 1 : 0;
