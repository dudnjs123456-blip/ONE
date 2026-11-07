// 코인노래방: 검색어 · 반주 고르기 · 점수 · 지도 입구 확인 (npm run test:karaoke)
import { buildCityMap, KARAOKE_NAME } from '../src/game/city/cityMap';
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';
import { KARAOKE_BOOTHS, STAIR, stairSign, storeLayout } from '../src/game/city/store';
import { FIGHTER_RADIUS } from '../src/game/core/constants';
import { SONG_PACKS, SONG_PRICE, fallbackSong, isAccompaniment, karaokeQuery, likelyBlocked, rankKaraoke, rollScore, scoreComment, type Playable } from '../src/game/city/karaoke';
import { mulberry32 } from '../src/game/core/controllers';

let fail = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) fail++;
};

check('검색어에 노래방을 붙인다', karaokeQuery('아이유 좋은 날') === '아이유 좋은 날 노래방');
check('이미 노래방·MR 이면 그대로', karaokeQuery('가시 노래방') === '가시 노래방' && karaokeQuery('Ditto MR') === 'Ditto MR');
check('빈 검색어는 빈 문자열', karaokeQuery('   ') === '');

const item = (id: string, title: string, channel: string) => ({
  id,
  title,
  channel,
  thumb: '',
  length: '',
});
const raw = [
  item('a', '아이유 - 좋은 날 (Live) 리액션', '어떤 채널'),
  item('b', '아이유 (IU) - 좋은 날 공식 뮤직비디오', '1theK'),
  item('c', '[TJ노래방] 좋은날 - 아이유 / TJ Karaoke', 'TJ KARAOKE'),
  item('d', '[KY ENTERTAINMENT] 좋은 날 - 아이유 (KY.46400) / KY Karaoke', 'KY Karaoke'),
  item('e', '좋은 날 노래방 커버', '누군가'),
  item('f', '좋은 날 - 아이유 (IU) (여자키D/-2) 여기MR / KPOP / Karaoke', '여기MR'),
  item('g', '[코러스] 좋은 날 - 아이유 (KY.76754) / KY Karaoke', 'KY Karaoke'),
];
const ids = (l: { id: string }[]) => l.map((r) => r.id).join('');
const ranked = rankKaraoke(raw);
check('틀 수 있는 반주(MR·KY 코러스)가 맨 앞', ['f', 'g'].includes(ranked[0].id) && ['f', 'g'].includes(ranked[1].id), ids(ranked));
check('재생이 막힌 TJ·KY ENTERTAINMENT 공식 영상은 맨 뒤', ['c', 'd'].includes(ranked.at(-1)!.id) && ['c', 'd'].includes(ranked.at(-2)!.id), ids(ranked));
check('TJ 공식은 막혔을 듯, 개인 MR·KY 코러스는 아님', likelyBlocked(raw[2]) && likelyBlocked(raw[3]) && !likelyBlocked(raw[5]) && !likelyBlocked(raw[6]));
check('리액션·뮤비는 반주가 아님', !isAccompaniment(raw[0]) && !isAccompaniment(raw[1]));
check(
  '노래방 라이브(남이 부른 영상)는 반주가 아님',
  !isAccompaniment({
    title: '버즈 - 가시 [일반인 노래방 라이브]',
    channel: '데일리 싱어',
  }) &&
    !isAccompaniment({
      title: '노래방에서...버즈 가시 부르다 남자에게 차임',
      channel: '버블디아',
    }),
);
check('TJ 영상은 반주', isAccompaniment(raw[2]) && isAccompaniment(raw[3]));

// 미리 틀어 본 결과를 따른다
const known = new Map<string, Playable>([
  ['f', 'blocked'],
  ['c', 'ok'],
]);
const ranked2 = rankKaraoke(raw, known);
check('미리 틀어 보고 된다고 확인된 영상이 맨 앞', ranked2[0].id === 'c', ids(ranked2));
check('막힌 것으로 확인된 영상은 맨 끝', ranked2.at(-1)!.id === 'f', ids(ranked2));
check('막히면 같은 결과에서 다른 반주로 (된다고 확인된 것 먼저)', fallbackSong(raw, 'f', known)?.id === 'c', fallbackSong(raw, 'f', known)?.id);
check('확인 전이면 막혔을 듯한 공식 영상은 건너뛴다', fallbackSong(raw, 'f', new Map([['f', 'blocked']]))?.id === 'g', fallbackSong(raw, 'f', new Map([['f', 'blocked']]))?.id);
check('대신 틀 반주가 없으면 null', fallbackSong([raw[0], raw[1], raw[5]], 'f', known) === null);

const rng = mulberry32(7);
const scores = Array.from({ length: 2000 }, () => rollScore(rng));
const hundred = scores.filter((s) => s === 100).length / scores.length;
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
check(
  '점수는 72~100',
  scores.every((s) => s >= 72 && s <= 100),
);
check('100점은 가끔 (5~15%)', hundred > 0.05 && hundred < 0.15, (hundred * 100).toFixed(1) + '%');
check('평균은 80점대', avg > 80 && avg < 90, avg.toFixed(1));
const hyped = Array.from({ length: 2000 }, () => rollScore(rng, 20));
check('탬버린·박수로 점수가 조금 오른다', hyped.reduce((a, b) => a + b, 0) / hyped.length > avg, (hyped.reduce((a, b) => a + b, 0) / hyped.length).toFixed(1));
check('점수 한마디', scoreComment(100).includes('가수왕') && scoreComment(75).length > 0);

// ── 펫샵 건물 2층 코인노래방: 위치 ──
const m = buildCityMap();
const ks = m.pois.filter((p) => p.label === KARAOKE_NAME);
const k = ks[0];
const petB = m.buildings.find((b) => b.tenant === 'pet')!;
const petP = m.pois.find((p) => p.id === 'petshop')!;
check('코인노래방 입구는 동네에 하나뿐', ks.length === 1 && k.id === 'karaoke', `${ks.length}곳`);
check('입구는 펫샵 건물 1층 오른쪽 끝 (계단 문)', !!k && k.x > petB.x && k.x < petB.x + petB.w / 2 && Math.abs(k.z - (petB.z + petB.d / 2 + 1.2)) < 0.01, k ? `(${k.x.toFixed(2)}, ${k.z.toFixed(2)}) 건물 x ${petB.x.toFixed(2)}±${(petB.w / 2).toFixed(2)}` : '');
check('펫샵 건물 2층에 코인노래방이 들어왔다 (3층짜리)', petB.upstairs === 'karaoke' && petB.h > 4.2 + 3.4 + 1);
check('펫샵 문과 노래방 계단 문이 겹치지 않는다', Math.abs(k.x - petP.x) > k.radius + 0.3, `${Math.abs(k.x - petP.x).toFixed(2)} m`);

// ── 실내 배치 ──
const L = storeLayout(KARAOKE_NAME);
const sings = L.pois.filter((p) => p.id.startsWith('store:sing:'));
check('노래방 안: 방 넷, 방마다 노래방 기계', L.kind === 'karaoke' && KARAOKE_BOOTHS.length === 4 && sings.length === 4);
const R = FIGHTER_RADIUS * 0.8;
const blocked = (x: number, z: number) =>
  x < L.room.x0 + R || x > L.room.x1 - R || z < L.room.z0 + R || z > L.room.z1 - R || L.furniture.some((f) => x > f.rect.x0 - R && x < f.rect.x1 + R && z > f.rect.z0 - R && z < f.rect.z1 + R);
check('들어선 자리는 비어 있다', !blocked(L.spawn.x, L.spawn.z));
// 들어선 자리에서 걸어서 갈 수 있는 곳 (10 cm 격자)
const step = 0.1;
const key = (i: number, j: number) => `${i},${j}`;
const seen = new Set<string>();
const q: [number, number][] = [[Math.round(L.spawn.x / step), Math.round(L.spawn.z / step)]];
seen.add(key(...q[0]));
while (q.length) {
  const [i, j] = q.pop()!;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di;
    const nj = j + dj;
    if (seen.has(key(ni, nj)) || blocked(ni * step, nj * step)) continue;
    seen.add(key(ni, nj));
    q.push([ni, nj]);
  }
}
const reach = (p: { x: number; z: number; radius: number }) => {
  for (const s of seen) {
    const [i, j] = s.split(',').map(Number);
    if (Math.hypot(i * step - p.x, j * step - p.z) < p.radius - 0.05) return true;
  }
  return false;
};
check('입구에서 네 방 노래방 기계까지 모두 걸어갈 수 있다', sings.every(reach), sings.filter((p) => !reach(p)).map((p) => p.id).join(', '));
check('카운터와 출입문까지도 걸어갈 수 있다', ['store:counter', 'store:exit'].every((id) => reach(L.pois.find((p) => p.id === id)!)));

const sits = L.pois.filter((p) => p.id.startsWith('store:sit:'));
check('방 문이 열려 있으면 네 방 소파 옆까지 걸어갈 수 있다', sits.length === 4 && sits.every(reach), sits.filter((p) => !reach(p)).map((p) => p.id).join(', '));

// ── 실제로 걸어 보기: 계단 문 → 1층 계단실 → 계단으로 2층 → 노래방 → 방 빌리기 → 노래 · 동작 → 나와서 계단으로 내려가기 ──
let cmd: CityInput = { move: null, run: false, interact: false };
const w = new CityWorld({ read: () => cmd });
w.profile.gold = 1000;
const press = (c: Partial<CityInput> = {}, n = 1) => {
  for (let i = 0; i < n; i++) {
    cmd = { move: null, run: false, interact: false, ...c };
    w.step();
  }
  cmd = { move: null, run: false, interact: false };
};
/** 한 방향으로 걷다가 조건이 되면 멈춘다 (최대 프레임) */
const walk = (move: { x: number; z: number }, until: () => boolean, max = 600) => {
  for (let i = 0; i < max && !until(); i++) press({ move });
  return until();
};
const at = () => `${w.location}/${w.store?.sign ?? ''} (${w.player.x.toFixed(2)}, ${w.player.z.toFixed(2)})`;
const door = w.map.pois.find((p) => p.id === 'karaoke')!;
w.player.reset(door.x, door.z, 0, -1);
press();
check('계단 문 앞에서 안내가 뜬다', w.nearby?.id === 'karaoke', w.nearby?.label);
press({ interact: true });
for (let i = 0; i < 300 && (w.location !== 'store' || w.doorway); i++) press();
check('E → 펫샵 건물 1층 계단실로', w.store?.kind === 'stairs' && w.store.sign === stairSign(1), at());
// 1층: 내려가는 계단은 없다 (서쪽은 계단 밑 창고)
const f1 = w.store!;
check('1층엔 내려가는 계단이 없고, 2층엔 있다', f1.furniture.some((f) => f.id === 'closet') && !storeLayout(stairSign(2)).furniture.some((f) => f.id === 'closet'));
// 동쪽 계단으로 걸어 올라간다
w.player.reset(1.0, 1.2, 0, -1);
press();
let maxLift = 0;
const ok2 = walk({ x: 0, z: -1 }, () => {
  if (w.store?.sign === stairSign(1)) maxLift = Math.max(maxLift, w.stairLift(w.player.x, w.player.z));
  return w.store?.sign === stairSign(2);
});
check('동쪽 계단을 걸어 올라가면 2층', ok2, at());
check('계단을 오르는 동안 몸이 점점 올라간다', maxLift > 1.2, `최고 ${maxLift.toFixed(2)} m`);
check('2층에 올라오면 층계참 (내려가는 계단 꼭대기)', w.player.z > STAIR.start && w.player.x < 0, at());
press(undefined, 20);
check('올라오자마자 다시 내려가지 않는다', w.store?.sign === stairSign(2), at());
// 3층까지 올라가 보고 (비어 있는 층) 다시 2층으로
w.player.reset(1.0, 1.2, 0, -1);
walk({ x: 0, z: -1 }, () => w.store?.sign === stairSign(3));
check('3층까지 걸어 올라간다', w.store?.sign === stairSign(3), at());
check('3층(꼭대기)엔 올라가는 계단이 막혀 있다', w.store!.furniture.some((f) => f.id === 'roofGate'));
const vac = w.store!.pois.find((p) => p.id === 'store:floordoor')!;
check('3층 문은 임대 문의 (비어 있음)', /임대/.test(vac.label), vac.label);
w.player.reset(-1.0, 1.2, 0, -1);
walk({ x: 0, z: -1 }, () => w.store?.sign === stairSign(2));
check('서쪽 계단으로 걸어 내려가면 2층', w.store?.sign === stairSign(2), at());
// 2층 노래방 문
const fd = w.store!.pois.find((p) => p.id === 'store:floordoor')!;
w.player.reset(fd.x, fd.z, 1, 0);
press();
check('2층 층계참에 코인노래방 문', w.nearby?.id === 'store:floordoor' && w.nearby.label.includes(KARAOKE_NAME), w.nearby?.label);
press({ interact: true });
press();
check('E → 코인노래방 안으로', w.store?.kind === 'karaoke', at());

// 방을 빌리기 전: 방 문이 잠겨 있다
const b2 = KARAOKE_BOOTHS.find((b) => b.no === 2)!;
const corridorX = b2.doorX + -b2.side * 0.5;
w.player.reset(corridorX, b2.doorZ, b2.side, 0);
press();
check('복도에서 방 문 앞: 빈방 안내', /빈방/.test(w.nearby?.label ?? ''), w.nearby?.label);
walk({ x: b2.side, z: 0 }, () => false, 120);
const inside = () => w.player.x > b2.rect.x0 && w.player.x < b2.rect.x1 && w.player.z > b2.rect.z0 && w.player.z < b2.rect.z1;
check('방을 안 빌리면 문을 지나 들어갈 수 없다', !inside(), at());
// 카운터에서 방 빌리기: 2번방 5곡
const counter = w.store!.pois.find((p) => p.id === 'store:counter')!;
w.player.reset(counter.x, counter.z, 1, 0);
press();
press({ interact: true });
check('카운터에서 E → 빈방 확인 창', w.karaokeDeskRequest);
w.karaokeDeskRequest = false;
check('처음엔 네 방 모두 빈방', w.boothStates().every((s) => s.state === 'free'));
const pack5 = SONG_PACKS.findIndex((p) => p.songs === 5);
const r1 = w.rentKaraoke(2, pack5);
check('2번방 · 5곡 빌리기 (220G)', r1.ok && w.profile.gold === 780 && w.karaokeRental?.room === 2 && w.karaokeRental.songs === 5, `${r1.message} · ${w.profile.gold}G`);
check('다른 방을 또 빌릴 수는 없다', !w.rentKaraoke(3, 0).ok);
check('카운터 창에 2번방이 내 방으로', w.boothStates().find((s) => s.no === 2)?.state === 'mine');
// 이제 2번방 문으로 걸어 들어간다
w.player.reset(corridorX, b2.doorZ, b2.side, 0);
walk({ x: b2.side, z: 0 }, inside, 200);
check('빌린 2번방엔 걸어 들어간다', inside(), at());
// 다른 방(1번)은 여전히 잠김
const b1 = KARAOKE_BOOTHS.find((b) => b.no === 1)!;
w.player.reset(b1.doorX + -b1.side * 0.5, b1.doorZ, b1.side, 0);
walk({ x: b1.side, z: 0 }, () => false, 120);
check('남의 방(1번)은 여전히 못 들어간다', !(w.player.x > b1.rect.x0 && w.player.x < b1.rect.x1 && w.player.z > b1.rect.z0 && w.player.z < b1.rect.z1), at());
// 노래방 기계 → 노래 고르기, 한 곡 쓰기
const sing = w.store!.pois.find((p) => p.id === 'store:sing:2')!;
w.player.reset(sing.x, sing.z, b2.side, 0);
press();
check('기계 앞 안내에 남은 곡', /남은 5곡/.test(w.nearby?.label ?? ''), w.nearby?.label);
press({ interact: true });
check('E → 노래 고르기 창 (2번방)', w.karaokeRequest && w.karaokeRoom === 2);
w.karaokeRequest = false;
check('곡을 틀면 남은 곡이 하나 줄고 골드는 그대로', w.karaokePay(SONG_PRICE) && w.karaokeRental?.songs === 4 && w.profile.gold === 780);
check('못 튼 곡은 돌려받는다', w.karaokePay(-SONG_PRICE) && w.karaokeRental?.songs === 5);
// 동작: 신나게 부르기 (서서) → 앉아서 부르기 (소파)
check('방 안에서 신나게 부르기', w.karaokeAct('kHype') && w.seat?.spot === 'sofa' && w.sofa.id === 'kHype' && w.seatBooth === 2);
press(undefined, 60);
check('서서 부르는 자리는 화면 앞 (화면을 본다)', Math.abs(w.player.x - b2.stand.x) < 0.01 && Math.sign(w.player.fx) === b2.side, at());
const ns = w.netState();
check('친구에게도 방 번호 · 동작이 간다', ns.kb === 2 && ns.se === 'kHype', `kb ${ns.kb} se ${ns.se}`);
check('앉아서 부르기로 바꾸면 소파 자리로', w.karaokeAct('kSit') && w.sofa.id === 'kSit' && w.sofa.prev === 'kHype' && Math.abs(w.player.x - b2.sit.x) < 0.01);
press({ move: { x: 0, z: 1 } }, 2);
press(undefined, 60);
check('움직이면 일어난다', w.seat === null && w.seatBooth === null);
// 방 밖에선 동작을 못 한다
w.player.reset(0, 2.5, 0, -1);
check('방 밖에서는 노래 동작 불가', !w.karaokeAct('kStand'));
// 한 곡 쓰고 나가면 4곡 값 환불: 220 × 4/5 = 176
w.karaokePay(SONG_PRICE);
const exit = w.store!.pois.find((p) => p.id === 'store:exit')!;
w.player.reset(exit.x, exit.z, 0, 1);
press();
press({ interact: true });
press();
check('노래방을 나오면 2층 층계참 · 남은 곡 값 환불', w.store?.sign === stairSign(2) && w.karaokeRental === null && w.profile.gold === 780 + 176, `${at()} · ${w.profile.gold}G`);
// 걸어서 1층으로 내려가 거리로
w.player.reset(-1.0, 1.2, 0, -1);
walk({ x: 0, z: -1 }, () => w.store?.sign === stairSign(1));
check('서쪽 계단으로 걸어 내려가면 1층', w.store?.sign === stairSign(1), at());
const ex1 = w.store!.pois.find((p) => p.id === 'store:exit')!;
w.player.reset(ex1.x, ex1.z, 0, 1);
press({ interact: true });
for (let i = 0; i < 300 && (w.location !== 'city' || w.doorway); i++) press();
check('1층 출입문 → 펫샵 건물 앞 인도', w.location === 'city' && Math.abs(w.player.x - door.x) < 0.5, at());

// 친구가 쓰는 방은 '사용 중'
const w2 = new CityWorld({ read: () => ({ move: null, run: false, interact: false }) });
w2.profile.gold = 1000;
(w2 as unknown as { store: unknown }).store = storeLayout(KARAOKE_NAME);
(w2 as unknown as { location: string }).location = 'store';
w2.netId = 'b';
w2.upsertRemote('a', '친구', '201');
w2.applyRemoteState('a', { ...w.netState(), r: `s:${KARAOKE_NAME}`, kb: 3 });
const st3 = w2.boothStates().find((s) => s.no === 3)!;
check('친구가 빌린 방(3번)은 사용 중으로 보인다', st3.state === 'taken' && st3.by === '친구', JSON.stringify(st3));
check('친구 방은 빌릴 수 없다', !w2.rentKaraoke(3, 0).ok);

if (fail) process.exitCode = 1;
