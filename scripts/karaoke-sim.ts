// 코인노래방: 검색어 · 반주 고르기 · 점수 · 지도 입구 확인 (npm run test:karaoke)
import { buildCityMap } from '../src/game/city/cityMap';
import { isAccompaniment, karaokeQuery, rankKaraoke, rollScore, scoreComment } from '../src/game/city/karaoke';
import { mulberry32 } from '../src/game/core/controllers';

let fail = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) fail++;
};

check('검색어에 노래방을 붙인다', karaokeQuery('아이유 좋은 날') === '아이유 좋은 날 노래방');
check('이미 노래방·MR 이면 그대로', karaokeQuery('가시 노래방') === '가시 노래방' && karaokeQuery('Ditto MR') === 'Ditto MR');
check('빈 검색어는 빈 문자열', karaokeQuery('   ') === '');

const raw = [
  { title: '아이유 - 좋은 날 (Live) 리액션', channel: '어떤 채널' },
  { title: '아이유 (IU) - 좋은 날 공식 뮤직비디오', channel: '1theK' },
  { title: '[TJ노래방] 좋은날 - 아이유 / TJ Karaoke', channel: 'TJ KARAOKE' },
  { title: '[KY ENTERTAINMENT] 좋은 날 - 아이유 (KY.46400) / KY Karaoke', channel: 'KY Karaoke' },
  { title: '좋은 날 노래방 커버', channel: '누군가' },
];
const ranked = rankKaraoke(raw);
check('TJ·금영 반주가 맨 앞', /TJ|KY/.test(ranked[0].title) && /TJ|KY/.test(ranked[1].title), ranked.map((r) => r.title.slice(0, 12)).join(' | '));
check('리액션·뮤비는 반주가 아님', !isAccompaniment(raw[0]) && !isAccompaniment(raw[1]));
check('노래방 라이브(남이 부른 영상)는 반주가 아님', !isAccompaniment({ title: '버즈 - 가시 [일반인 노래방 라이브]', channel: '데일리 싱어' }) && !isAccompaniment({ title: '노래방에서...버즈 가시 부르다 남자에게 차임', channel: '버블디아' }));
check('TJ 영상은 반주', isAccompaniment(raw[2]) && isAccompaniment(raw[3]));

const rng = mulberry32(7);
const scores = Array.from({ length: 2000 }, () => rollScore(rng));
const hundred = scores.filter((s) => s === 100).length / scores.length;
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
check('점수는 72~100', scores.every((s) => s >= 72 && s <= 100));
check('100점은 가끔 (5~15%)', hundred > 0.05 && hundred < 0.15, (hundred * 100).toFixed(1) + '%');
check('평균은 80점대', avg > 80 && avg < 90, avg.toFixed(1));
const hyped = Array.from({ length: 2000 }, () => rollScore(rng, 20));
check('탬버린·박수로 점수가 조금 오른다', hyped.reduce((a, b) => a + b, 0) / hyped.length > avg, (hyped.reduce((a, b) => a + b, 0) / hyped.length).toFixed(1));
check('점수 한마디', scoreComment(100).includes('가수왕') && scoreComment(75).length > 0);

const m = buildCityMap();
const k = m.pois.find((p) => p.kind === 'shop' && p.label === '코인노래방');
check('상가에 코인노래방 입구가 있다', !!k, k ? `(${k.x.toFixed(1)}, ${k.z.toFixed(1)})` : '');

if (fail) process.exitCode = 1;
