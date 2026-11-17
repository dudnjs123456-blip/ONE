// 집안일 (샤워·양치·설거지·빨래) 검증: npm run test:chores
import { CityWorld, HOME, type CityInput } from '../src/game/city/cityWorld';
import { CHORE_FRAMES, CHORE_SPOTS, DIRTY, DRY_MS, WASH_MS, choreFrame, packChores, unpackChores, type ChoreKind } from '../src/game/city/chores';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

let c: CityInput = { move: null, run: false, interact: false };
let now = Date.UTC(2026, 10, 17, 3, 0, 0);
const w = new CityWorld({ read: () => c });
w.attachSharedClock(() => now);
const W = w as unknown as {
  moveTo: (loc: string, x: number, z: number, fx: number, fz: number) => void;
  interact: (p: unknown) => void;
  findNearby: () => { id: string; label: string } | null;
};
W.moveTo('home', HOME.spawn.x, HOME.spawn.z, 1, 0);
const poi = (id: string) => HOME.pois.find((p) => p.id === id)!;
/** 자리 앞에 서서 E 를 누르고, 끝날 때까지 (또는 frames 만큼) 진행 */
function doChore(id: string, frames = 99999, stand?: { x: number; z: number }) {
  const p = poi(id);
  const s = stand ?? { x: p.x, z: p.z };
  w.player.reset(s.x, s.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  let n = 0;
  while (w.chore && n < frames) {
    w.step();
    n++;
  }
  return n;
}
const ch = () => w.chores;

// 1) 화장실 문이 열려 거실에서 걸어 들어갈 수 있다
{
  w.player.reset(-1.9, 1.6, 0, 1);
  c = { move: { x: 0, z: 1 }, run: false, interact: false };
  for (let i = 0; i < 120; i++) w.step();
  c = { move: null, run: false, interact: false };
  check('거실에서 화장실 문으로 걸어 들어간다', w.player.z > 2.6, `(z ${w.player.z.toFixed(2)})`);
  // 벽(문 옆)으로는 못 지나간다
  w.player.reset(-2.7, 1.6, 0, 1);
  c = { move: { x: 0, z: 1 }, run: false, interact: false };
  for (let i = 0; i < 120; i++) w.step();
  c = { move: null, run: false, interact: false };
  check('문 옆 벽은 막혀 있다', w.player.z < 2.3, `(z ${w.player.z.toFixed(2)})`);
  // 거실(벽 너머)에서는 샤워를 시작할 수 없다
  w.player.reset(-1.62, 2.05, 0, 1);
  const near = W.findNearby();
  check('벽 너머 거실에서는 샤워 자리가 잡히지 않는다', near?.id !== 'shower', `(${near?.id})`);
}

// 2) 샤워: 자리로 들어가 물을 틀고 → 머리 → 몸 → 헹굼 → 수건. 더러움 0, 벗은 옷은 빨래 바구니로
{
  w.profile.life.dirt = 90;
  check('오래 안 씻으면 냄새 (dirty)', w.dirty);
  const hamper0 = ch().hamper;
  let mid = -1;
  const p = poi('shower');
  w.player.reset(p.x, p.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  const steps = new Set<string>();
  let water = 0;
  for (let i = 0; i < 2000 && w.chore; i++) {
    w.step();
    const v = w.choreView;
    if (v) {
      const f = choreFrame(v.kind, v.t);
      steps.add(f.step);
      if (f.water) water++;
    }
    if (i === 500) mid = w.profile.life.dirt ?? 0;
  }
  const s = CHORE_SPOTS.shower;
  check('샤워 부스 안 자리로 들어가 샤워기를 본다', Math.hypot(w.player.x - s.x, w.player.z - s.z) < 0.05 && w.player.fx > 0.9);
  check('샤워 단계: 물 틀기 → 머리 → 몸 → 헹굼 → 수건', ['valve', 'hair', 'body', 'rinse', 'towel'].every((k) => steps.has(k)), `(${[...steps].join(',')})`);
  check('물은 샤워하는 동안만 나온다', water > 600 && water < CHORE_FRAMES.shower);
  check('씻는 동안 더러움이 조금씩 줄어든다', mid > 5 && mid < 85, `(중간 ${mid.toFixed(0)})`);
  check('샤워 끝: 더러움 0', (w.profile.life.dirt ?? 0) < 0.01 && !w.dirty);
  check('벗은 옷은 빨래 바구니로 (+1)', ch().hamper === Math.min(12, hamper0 + 1), `(${hamper0} → ${ch().hamper})`);
}

// 3) 그만두기: 방향키를 누르면 하다 만 만큼만
{
  w.profile.life.dirt = 60;
  const p = poi('shower');
  w.player.reset(p.x, p.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 300; i++) w.step();
  c = { move: { x: -1, z: 0 }, run: false, interact: false };
  w.step();
  c = { move: null, run: false, interact: false };
  const d = w.profile.life.dirt ?? 0;
  check('방향키로 샤워를 그만두면 씻은 만큼만 줄어든다', !w.chore && d > 0 && d < 60, `(${d.toFixed(0)})`);
}

// 4) 양치
{
  w.profile.life.dirt = 20;
  doChore('brush');
  check('양치: 끝나면 상쾌 (더러움 -5)', Math.abs((w.profile.life.dirt ?? 0) - 15) < 0.5, `(${(w.profile.life.dirt ?? 0).toFixed(1)})`);
}

// 5) 설거지: 냉장고에서 꺼내 먹으면 그릇이 쌓이고, 한 개씩 씻어 건조대로
{
  ch().dishes = 0;
  w.profile.fridge = [{ name: '김밥', icon: '🍙', hunger: 20, fatigue: 0, from: '편의점' }, { name: '라면', icon: '🍜', hunger: 30, fatigue: 0, from: '편의점' }];
  w.eatFromFridge();
  w.eatFromFridge();
  check('냉장고에서 꺼내 먹으면 그릇이 싱크대에 쌓인다', ch().dishes === 2);
  const label = (() => {
    w.player.reset(poi('dishes').x, poi('dishes').z, 0, 1);
    return W.findNearby()?.label ?? '';
  })();
  check('싱크대 이름에 그릇 수', label.includes('2개'), `(${label})`);
  const steps: string[] = [];
  const p = poi('dishes');
  w.player.reset(p.x, p.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  let afterOne = -1;
  for (let i = 0; i < 1000 && w.chore; i++) {
    w.step();
    const v = w.choreView;
    if (v) {
      const s = choreFrame(v.kind, v.t).step;
      if (steps[steps.length - 1] !== s) steps.push(s);
    }
    if (i === CHORE_FRAMES.dishes + 5) afterOne = ch().dishes;
  }
  check('그릇 하나씩: 집기 → 수세미 → 헹굼 → 건조대', steps.slice(0, 4).join(',') === 'pick,scrub,wash,place', `(${steps.slice(0, 5).join(',')})`);
  check('한 개 끝날 때마다 줄어든다', afterOne === 1);
  check('다 씻으면 싱크대가 비고 건조대에 2개', ch().dishes === 0 && ch().clean === 2);
  // 한 시간 지나면 건조대 그릇은 찬장으로
  now += 61 * 60 * 1000;
  for (let i = 0; i < 61; i++) w.step();
  check('한 시간 뒤 건조대 그릇은 정리된다', ch().clean === 0);
}

// 6) 빨래: 바구니 → 세탁기(실제 시간) → 꺼내기 → 널기 → 마르면 개기
{
  const C = ch();
  C.hamper = 5;
  C.washer = null;
  C.wet = 0;
  C.rack = null;
  doChore('washer');
  check('세탁기에 넣고 돌린다 (바구니 비고 세탁기 5벌)', C.hamper === 0 && ch().washer?.n === 5);
  w.player.reset(poi('washer').x, poi('washer').z, 0, 1);
  check('돌아가는 중엔 남은 시간이 보인다', /남음/.test(W.findNearby()?.label ?? ''), `(${W.findNearby()?.label})`);
  // 돌아가는 중에 누르면 꺼내지 않는다
  doChore('washer');
  check('다 돌기 전엔 꺼낼 수 없다', ch().washer?.n === 5 && C.wet === 0);
  // 창을 닫아도 실제 시간대로 돈다
  now += WASH_MS + 1000;
  w.player.reset(0, 0, 0, 1);
  let rang = false;
  for (let i = 0; i < 61; i++) {
    w.step();
    if (w.toast?.text.includes('세탁이 끝났')) rang = true;
  }
  check('실제 시간이 지나면 세탁이 끝나고 알린다', rang);
  doChore('washer');
  check('꺼내면 젖은 빨래 5벌', ch().washer === null && C.wet === 5);
  // 널다가 그만두면 넌 만큼만
  const p = poi('rack');
  w.player.reset(p.x, p.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < CHORE_FRAMES.hang * 2 + 10; i++) w.step();
  c = { move: { x: 0, z: -1 }, run: false, interact: false };
  w.step();
  c = { move: null, run: false, interact: false };
  check('널다가 그만두면 넌 만큼만 (2벌 널고 3벌 남음)', ch().rack?.n === 2 && C.wet === 3, `(건조대 ${ch().rack?.n}, 젖은 ${C.wet})`);
  doChore('rack');
  check('나머지도 다 널었다', ch().rack?.n === 5 && C.wet === 0);
  doChore('rack');
  check('마르기 전엔 갤 수 없다', ch().rack?.n === 5);
  now += DRY_MS + 1000;
  doChore('rack');
  check('다 마르면 개서 옷장에 넣는다', ch().rack === null);
}

// 7) 더러움: 시간이 지나면 쌓이고, 80 넘으면 경고 · 빨래가 밀리면 더 빨리
{
  w.profile.life.dirt = 0;
  ch().hamper = 0;
  for (let i = 0; i < 6000; i++) w.step();
  const slow = w.profile.life.dirt ?? 0;
  w.profile.life.dirt = 0;
  ch().hamper = 10;
  for (let i = 0; i < 6000; i++) w.step();
  const fast = w.profile.life.dirt ?? 0;
  check('시간이 지나면 더러움이 쌓인다', slow > 0.1, `(${slow.toFixed(2)})`);
  check('빨래가 밀려 입을 옷이 없으면 더 빨리 더러워진다', fast > slow * 1.3, `(${slow.toFixed(2)} → ${fast.toFixed(2)})`);
  w.profile.life.dirt = DIRTY - 0.001;
  let warned = false;
  for (let i = 0; i < 600 && !warned; i++) {
    w.step();
    if (w.toast?.text.includes('땀 냄새')) warned = true;
  }
  check('80 을 넘으면 샤워하라고 알린다', warned);
}

// 8) 친구에게: 내가 하는 동작과 집안 상태가 그대로 간다
{
  w.chores.dishes = 3;
  const p = poi('dishes');
  w.player.reset(p.x, p.z, 0, 1);
  c = { move: null, run: false, interact: true };
  w.step();
  c = { move: null, run: false, interact: false };
  for (let i = 0; i < 40; i++) w.step();
  const s = w.netState();
  check('보내는 상태에 집안일 동작', typeof s.ch === 'string' && s.ch.startsWith('dishes:'), `(${s.ch})`);
  check('보내는 상태에 집안 상태 (그릇 수)', unpackChores(s.hc)?.dishes === 3);
  // 친구 쪽에서 받기
  const friend = new CityWorld({ read: () => ({ move: null, run: false, interact: false }) });
  friend.upsertRemote('me', '나', '302');
  friend.applyRemoteState('me', s);
  const r = friend.remotes.get('me')!;
  check('친구 화면: 내 집안일 동작을 받는다', r.chore?.kind === 'dishes' && r.chore.t >= 40);
  check('친구 화면: 내 집안 상태를 받는다', r.homeChores?.dishes === 3);
  check('짧은 꼴로 보냈다가 그대로 푼다', JSON.stringify(unpackChores(packChores(w.chores))) === JSON.stringify({ ...w.chores, cleanAt: 0, hamperAt: 0 }));
  c = { move: { x: 1, z: 0 }, run: false, interact: false };
  w.step();
  c = { move: null, run: false, interact: false };
}

// 9) 동작 표: 모든 동작이 정해진 길이 안에서 단계가 이어진다
{
  let ok = true;
  for (const k of Object.keys(CHORE_FRAMES) as ChoreKind[]) {
    for (let t = 0; t < CHORE_FRAMES[k]; t += 5) {
      const f = choreFrame(k, t);
      if (!(f.k >= 0 && f.k <= 1)) ok = false;
    }
  }
  check('모든 동작 단계의 진행값이 0~1', ok);
}
