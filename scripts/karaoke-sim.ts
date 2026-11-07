// 코인노래방: 검색어 · 반주 고르기 · 점수 · 지도 입구 확인 (npm run test:karaoke)
import { buildCityMap } from '../src/game/city/cityMap';
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

const m = buildCityMap();
const k = m.pois.find((p) => p.kind === 'shop' && p.label === '코인노래방');
check('상가에 코인노래방 입구가 있다', !!k, k ? `(${k.x.toFixed(1)}, ${k.z.toFixed(1)})` : '');

if (fail) process.exitCode = 1;
