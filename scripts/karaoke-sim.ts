// 코인노래방: 검색어 · 반주 고르기 · 점수 · 지도 입구 확인 (npm run test:karaoke)
import { buildCityMap, KARAOKE_NAME } from '../src/game/city/cityMap';
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';
import { KARAOKE_BOOTHS, storeLayout } from '../src/game/city/store';
import { FIGHTER_RADIUS } from '../src/game/core/constants';
import { fallbackSong, isAccompaniment, karaokeQuery, likelyBlocked, rankKaraoke, rollScore, scoreComment, type Playable } from '../src/game/city/karaoke';
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

// ── 실제로 들어가서 2번방에서 노래 고르기 창 열기 ──
let cmd: CityInput = { move: null, run: false, interact: false };
const w = new CityWorld({ read: () => cmd });
const press = (c: Partial<CityInput> = {}, n = 1) => {
  for (let i = 0; i < n; i++) {
    cmd = { move: null, run: false, interact: false, ...c };
    w.step();
  }
  cmd = { move: null, run: false, interact: false };
};
const door = w.map.pois.find((p) => p.id === 'karaoke')!;
w.player.reset(door.x, door.z, 0, -1);
press();
check('계단 문 앞에서 노래방 안내가 뜬다', w.nearby?.id === 'karaoke', w.nearby?.label);
press({ interact: true });
for (let i = 0; i < 300 && (w.location !== 'store' || w.doorway); i++) press();
check('E → 계단을 올라 노래방 안으로', w.location === 'store' && w.store?.kind === 'karaoke', `${w.location} ${w.store?.sign}`);
const room2 = w.store!.pois.find((p) => p.id === 'store:sing:2')!;
w.player.reset(room2.x, room2.z, -1, 0);
press();
check('2번방 노래방 기계 앞', w.nearby?.id === 'store:sing:2', w.nearby?.label);
press({ interact: true });
check('E → 노래 고르기 창 (2번방)', w.karaokeRequest && w.karaokeRoom === 2);
w.karaokeRequest = false;
const exit = w.store!.pois.find((p) => p.id === 'store:exit')!;
w.player.reset(exit.x, exit.z, 0, 1);
press({ interact: true });
for (let i = 0; i < 300 && (w.location !== 'city' || w.doorway); i++) press();
check('출입문 → 계단을 내려와 펫샵 건물 앞 인도로', w.location === 'city' && Math.abs(w.player.x - door.x) < 0.5 && w.player.z > door.z - 1.5, `(${w.player.x.toFixed(2)}, ${w.player.z.toFixed(2)})`);

if (fail) process.exitCode = 1;
