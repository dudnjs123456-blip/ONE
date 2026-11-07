/**
 * 코인노래방: 유튜브에서 노래방 반주 영상을 찾아 고르고, 한 곡 끝나면 점수를 매긴다.
 * 화면(KaraokePanel)과 떨어진 순수 함수만 둔다 (테스트하기 쉽게).
 */

/** 한 곡 값 (골드). 코인노래방이라 곡마다 낸다 */
export const SONG_PRICE = 50;

/** 카운터에서 사는 곡 묶음 (많이 살수록 조금 싸다) */
export const SONG_PACKS = [
  { songs: 1, price: 50 },
  { songs: 3, price: 140 },
  { songs: 5, price: 220 },
  { songs: 10, price: 400 },
] as const;

/** 노래방 동작 (방 안에서만): 앉아서(소파) · 서서 (화면 앞) */
export type KaraokeAct = 'kSit' | 'kTamb' | 'cheer' | 'kStand' | 'kHype' | 'kDance';
export const KARAOKE_ACTS: { id: KaraokeAct; icon: string; label: string; seated: boolean }[] = [
  { id: 'kStand', icon: '🎤', label: '서서 부르기', seated: false },
  { id: 'kHype', icon: '🔥', label: '신나게 부르기', seated: false },
  { id: 'kDance', icon: '💃', label: '춤추며 부르기', seated: false },
  { id: 'kSit', icon: '🛋️', label: '앉아서 부르기', seated: true },
  { id: 'kTamb', icon: '🔔', label: '탬버린', seated: true },
  { id: 'cheer', icon: '👏', label: '박수 · 환호', seated: true },
];
export const isSeatedAct = (id: string) => KARAOKE_ACTS.find((a) => a.id === id)?.seated ?? true;
/** 마이크를 드는 동작 */
export const MIC_ACTS = new Set<string>(['kSit', 'kStand', 'kHype', 'kDance']);

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

/**
 * 다른 사이트(우리 게임)에서 재생을 막아 둔 것으로 알려진 채널 영상.
 * TJ 미디어 공식 영상과 KY ENTERTAINMENT 공식 영상은 거의 다 막혀 있다 (유튜브 오류 150).
 */
export function likelyBlocked(it: Pick<KaraokeItem, 'title' | 'channel'>): boolean {
  const t = `${it.title} ${it.channel}`;
  return /\[TJ\s*노래방|TJ\s*Karaoke|TJ\s*미디어|TJ\s*Media|KY\s*ENTERTAINMENT/i.test(t);
}

/** 미리 틀어 본 결과: ok = 틀 수 있음, blocked = 막힘. 없으면 아직 모름 */
export type Playable = 'ok' | 'blocked';

/** 틀 수 있는 정도: 확인됨(2) > 모름(1) > 막혔을 듯(0) > 막힘 확인(-1) */
function playRank(it: KaraokeItem, known: ReadonlyMap<string, Playable>): number {
  const k = known.get(it.id);
  if (k === 'ok') return 2;
  if (k === 'blocked') return -1;
  return likelyBlocked(it) ? 0 : 1;
}

/**
 * 반주 영상을 앞으로. 막힌 영상은 맨 뒤로 (같은 점수면 원래 검색 순서).
 * known 을 주면 미리 틀어 본 결과를 따르고, 없으면 채널 이름으로 짐작한다.
 */
export function rankKaraoke<T extends KaraokeItem>(items: T[], known: ReadonlyMap<string, Playable> = new Map()): T[] {
  return items
    .map((it, i) => ({ it, i, k: karaokeness(it), p: playRank(it, known) }))
    .sort((a, b) => (b.p >= 1 ? 1 : 0) - (a.p >= 1 ? 1 : 0) || (b.k >= 2 ? 1 : 0) - (a.k >= 2 ? 1 : 0) || b.p - a.p || b.k - a.k || a.i - b.i)
    .map((x) => x.it);
}

/** 고른 영상이 막혔을 때 대신 틀 반주: 같은 검색 결과에서 아직 막히지 않은 반주 중 첫 번째 */
export function fallbackSong<T extends KaraokeItem>(list: T[], failedId: string, known: ReadonlyMap<string, Playable>): T | null {
  return rankKaraoke(list, known).find((it) => it.id !== failedId && isAccompaniment(it) && playRank(it, known) >= 1) ?? null;
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
