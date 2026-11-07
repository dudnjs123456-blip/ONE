/**
 * 코인노래방: 유튜브에서 노래방 반주 영상을 찾아 고르고, 한 곡 끝나면 점수를 매긴다.
 * 화면(KaraokePanel)과 떨어진 순수 함수만 둔다 (테스트하기 쉽게).
 */

/** 한 곡 값 (골드). 코인노래방이라 곡마다 낸다 */
export const SONG_PRICE = 50;

/** 처음 들어갔을 때 보여 주는 추천 검색어 */
export const KARAOKE_CHIPS = ['아이유 좋은 날', '버즈 가시', '뉴진스 Ditto', '임재범 고해', '볼빨간사춘기 우주를 줄게', '박효신 야생화', '싸이 강남스타일', '김광석 서른 즈음에'];

export interface KaraokeItem {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  length: string;
}

/** 검색어에 '노래방' 을 붙여 반주 영상이 나오게 한다 (이미 붙어 있으면 그대로) */
export function karaokeQuery(q: string): string {
  const s = q.trim();
  if (!s) return '';
  return /노래방|karaoke|가라오케|반주|\bMR\b|inst/i.test(s) ? s : `${s} 노래방`;
}

/** 얼마나 '노래방 반주' 같은 영상인가 (클수록 반주). 2 이상이면 반주로 본다 */
export function karaokeness(it: Pick<KaraokeItem, 'title' | 'channel'>): number {
  const t = `${it.title} ${it.channel}`;
  let n = 0;
  if (/TJ\s*노래방|\[TJ|TJ\s*Karaoke|TJ\s*미디어|TJ\s*Media/i.test(t)) n += 3;
  if (/금영|KY\s*Karaoke|KY\s*노래방|\[KY|KY\s*ENTERTAINMENT/i.test(t)) n += 3;
  if (/노래방|karaoke|가라오케/i.test(t)) n += 2;
  if (/\bMR\b|inst|반주|instrumental|가사/i.test(t)) n += 1;
  if (/cover|커버|reaction|리액션|#shorts|직캠|fancam|무대|뮤직뱅크|인기가요|엠카/i.test(t)) n -= 2;
  // 누가 부른 영상 (노래방에서 찍은 라이브 · 쌩라이브 · 부르다가…) 은 반주가 아니다
  if (/라이브|live|부르다|부르는|불러|쌩|일반인|노래 실력|ㅋㅋ/i.test(t)) n -= 3;
  return n;
}

export const isAccompaniment = (it: Pick<KaraokeItem, 'title' | 'channel'>) => karaokeness(it) >= 2;

/** 반주 영상을 앞으로 (같은 점수면 원래 검색 순서) */
export function rankKaraoke<T extends Pick<KaraokeItem, 'title' | 'channel'>>(items: T[]): T[] {
  return items
    .map((it, i) => ({ it, i, k: karaokeness(it) }))
    .sort((a, b) => (b.k >= 2 ? 1 : 0) - (a.k >= 2 ? 1 : 0) || b.k - a.k || a.i - b.i)
    .map((x) => x.it);
}

/** 노래방 기계처럼 점수 매기기: 대부분 80~99, 가끔 100점. 탬버린·박수로 분위기를 띄우면 조금 오른다 */
export function rollScore(rand: () => number, hype = 0): number {
  if (rand() < 0.1 + Math.min(0.1, hype * 0.01)) return 100;
  const base = 72 + Math.floor(rand() * 20) + Math.floor(rand() * 9); // 72~99, 가운데(85 근처)가 많다
  return Math.min(99, base + Math.min(5, Math.floor(hype / 4)));
}

export function scoreComment(score: number): string {
  if (score >= 100) return '축하합니다! 가수왕 탄생!';
  if (score >= 95) return '와… 음원 내셔도 되겠어요';
  if (score >= 90) return '노래 실력이 대단하시네요!';
  if (score >= 80) return '분위기 최고! 한 곡 더?';
  return '다음 곡은 더 잘할 수 있어요';
}
