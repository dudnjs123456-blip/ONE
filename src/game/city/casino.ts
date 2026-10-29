/**
 * 카지노 게임 규칙 (화면과 분리된 순수 로직). 모든 게임은 rng(0~1) 를 받아 결과를 낸다.
 * 돈(골드)은 호출하는 쪽에서 뺀다: 베팅 → 결과의 payout(돌려받는 총액, 0 이면 잃음)을 더한다.
 */
export type Rng = () => number;

export const CASINO_NAME = '한강 그랜드 카지노';
export const MIN_BET = 10;
export const CHIPS = [10, 50, 100, 500];

export interface CasinoGame {
  id: 'slots' | 'blackjack' | 'roulette' | 'sicbo' | 'highlow';
  name: string;
  icon: string;
  desc: string;
}

export const CASINO_GAMES: CasinoGame[] = [
  { id: 'slots', name: '슬롯머신', icon: '🎰', desc: '같은 그림 세 개! 7️⃣ 세 개면 200배' },
  { id: 'blackjack', name: '블랙잭', icon: '🃏', desc: '21에 가깝게. 블랙잭은 2.5배' },
  { id: 'roulette', name: '룰렛', icon: '🎡', desc: '빨강/검정·홀/짝 2배, 숫자 하나 36배' },
  { id: 'sicbo', name: '대소 (주사위)', icon: '🎲', desc: '주사위 3개 합 — 대(11~17) 소(4~10) 2배' },
  { id: 'highlow', name: '하이로우', icon: '🂠', desc: '다음 카드가 높을까 낮을까? 연속으로 맞히면 배당이 쌓인다' },
];

// ───────────────────────── 슬롯머신 ─────────────────────────

export const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
/** 릴 한 칸에 나올 가중치 (합 100) */
const SLOT_WEIGHTS: Record<SlotSymbol, number> = { '🍒': 30, '🍋': 25, '🔔': 18, '⭐': 13, '💎': 9, '7️⃣': 5 };
/** 같은 그림 세 개 배당 (베팅액의 몇 배를 돌려받나) */
export const SLOT_PAYS: Record<SlotSymbol, number> = { '🍒': 6, '🍋': 10, '🔔': 18, '⭐': 35, '💎': 70, '7️⃣': 200 };
/** 🍒 두 개면 본전 + 조금 (전체 환급률 약 92%) */
const CHERRY_PAIR = 1.8;

function pickSymbol(rng: Rng): SlotSymbol {
  let r = rng() * 100;
  for (const s of SLOT_SYMBOLS) {
    r -= SLOT_WEIGHTS[s];
    if (r < 0) return s;
  }
  return '🍒';
}

export function spinSlots(bet: number, rng: Rng): { reels: SlotSymbol[]; payout: number; text: string } {
  const reels = [pickSymbol(rng), pickSymbol(rng), pickSymbol(rng)];
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    const m = SLOT_PAYS[reels[0]];
    return { reels, payout: bet * m, text: `${reels[0]} 잭팟! ${m}배` };
  }
  if (reels.filter((r) => r === '🍒').length === 2) return { reels, payout: Math.floor(bet * CHERRY_PAIR), text: `🍒 두 개! ${CHERRY_PAIR}배` };
  return { reels, payout: 0, text: '꽝…' };
}

// ───────────────────────── 카드 ─────────────────────────

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export interface Card {
  /** 1 = A, 11 = J, 12 = Q, 13 = K */
  rank: number;
  suit: (typeof SUITS)[number];
}

export function cardLabel(c: Card) {
  const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${r}${c.suit}`;
}

export function isRed(c: Card) {
  return c.suit === '♥' || c.suit === '♦';
}

/** 섞인 덱 (decks 벌) */
export function newShoe(rng: Rng, decks = 2): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ───────────────────────── 블랙잭 ─────────────────────────

/** 손패 점수: A 는 11 로 세다가 21 을 넘으면 1 로 */
export function handValue(hand: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (hand: Card[]) => hand.length === 2 && handValue(hand).total === 21;

export type BjPhase = 'player' | 'done';

export interface BlackjackState {
  bet: number;
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  phase: BjPhase;
  doubled: boolean;
  /** 끝났을 때 돌려받는 총액과 설명 */
  payout: number;
  result: string;
}

const draw = (s: BlackjackState) => {
  if (s.shoe.length < 10) throw new Error('shoe empty');
  return s.shoe.pop()!;
};

/** 새 판: 두 장씩. 누가 블랙잭이면 바로 끝 */
export function bjDeal(bet: number, rng: Rng): BlackjackState {
  const s: BlackjackState = { bet, shoe: newShoe(rng), player: [], dealer: [], phase: 'player', doubled: false, payout: 0, result: '' };
  s.player.push(draw(s));
  s.dealer.push(draw(s));
  s.player.push(draw(s));
  s.dealer.push(draw(s));
  const pb = isBlackjack(s.player);
  const db = isBlackjack(s.dealer);
  if (pb || db) settle(s, pb && db ? 'push' : pb ? 'blackjack' : 'lose', pb && db ? '둘 다 블랙잭 — 무승부' : pb ? '블랙잭! 2.5배' : '딜러 블랙잭…');
  return s;
}

export function bjHit(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player') return s;
  s.player.push(draw(s));
  if (handValue(s.player).total > 21) settle(s, 'lose', `버스트 (${handValue(s.player).total})…`);
  else if (handValue(s.player).total === 21) bjStand(s);
  return s;
}

/** 더블다운: 베팅을 두 배로 하고 한 장만 더 받는다 (돈은 호출하는 쪽에서 한 번 더 뺀다) */
export function bjDouble(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player' || s.player.length !== 2) return s;
  s.bet *= 2;
  s.doubled = true;
  s.player.push(draw(s));
  if (handValue(s.player).total > 21) return settle(s, 'lose', `버스트 (${handValue(s.player).total})…`);
  return bjStand(s);
}

/** 멈춤: 딜러는 17 이상이 될 때까지 받는다 */
export function bjStand(s: BlackjackState): BlackjackState {
  if (s.phase !== 'player') return s;
  while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  const p = handValue(s.player).total;
  const d = handValue(s.dealer).total;
  if (d > 21) return settle(s, 'win', `딜러 버스트 (${d})! 2배`);
  if (p > d) return settle(s, 'win', `${p} 대 ${d} 승리! 2배`);
  if (p === d) return settle(s, 'push', `${p} 대 ${d} 무승부`);
  return settle(s, 'lose', `${p} 대 ${d} 패배…`);
}

function settle(s: BlackjackState, how: 'blackjack' | 'win' | 'push' | 'lose', text: string): BlackjackState {
  s.phase = 'done';
  s.payout = how === 'blackjack' ? Math.floor(s.bet * 2.5) : how === 'win' ? s.bet * 2 : how === 'push' ? s.bet : 0;
  s.result = text;
  return s;
}

// ───────────────────────── 룰렛 (유럽식 0~36) ─────────────────────────

export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBet =
  | { kind: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' }
  | { kind: 'dozen'; n: 1 | 2 | 3 }
  | { kind: 'number'; n: number };

export function rouletteColor(n: number): 'green' | 'red' | 'black' {
  return n === 0 ? 'green' : ROULETTE_RED.has(n) ? 'red' : 'black';
}

/** 맞으면 돌려받는 배수 (베팅 포함), 틀리면 0 */
export function rouletteMultiplier(b: RouletteBet, n: number): number {
  if (b.kind === 'number') return b.n === n ? 36 : 0;
  if (n === 0) return 0;
  switch (b.kind) {
    case 'red':
      return ROULETTE_RED.has(n) ? 2 : 0;
    case 'black':
      return ROULETTE_RED.has(n) ? 0 : 2;
    case 'odd':
      return n % 2 === 1 ? 2 : 0;
    case 'even':
      return n % 2 === 0 ? 2 : 0;
    case 'low':
      return n <= 18 ? 2 : 0;
    case 'high':
      return n >= 19 ? 2 : 0;
    case 'dozen':
      return Math.ceil(n / 12) === b.n ? 3 : 0;
  }
}

export function spinRoulette(bet: number, b: RouletteBet, rng: Rng): { n: number; payout: number } {
  const n = Math.floor(rng() * 37);
  return { n, payout: bet * rouletteMultiplier(b, n) };
}

// ───────────────────────── 대소 (주사위 3개) ─────────────────────────

/** 대: 합 11~17, 소: 합 4~10. 세 개가 같은 숫자(트리플)면 둘 다 진다. 맞으면 2배 */
export function rollSicBo(bet: number, pick: 'big' | 'small', rng: Rng): { dice: number[]; sum: number; payout: number; text: string } {
  const dice = [0, 0, 0].map(() => 1 + Math.floor(rng() * 6));
  const sum = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  const big = sum >= 11;
  const win = !triple && (pick === 'big' ? big : !big);
  const text = triple ? `트리플 ${dice[0]}! 하우스 승` : `합 ${sum} — ${big ? '대' : '소'}`;
  return { dice, sum, payout: win ? bet * 2 : 0, text };
}

// ───────────────────────── 하이로우 ─────────────────────────

/** 다음 카드가 지금보다 높을지 낮을지. 같으면 진다. 맞힐 때마다 배당이 곱해지고, 언제든 그만두고 받을 수 있다 */
export interface HighLowState {
  bet: number;
  shoe: Card[];
  current: Card;
  /** 지금 그만두면 받는 배수 */
  multiplier: number;
  streak: number;
  phase: 'guess' | 'lost' | 'cashed';
  last?: Card;
}

export function hlStart(bet: number, rng: Rng): HighLowState {
  const shoe = newShoe(rng, 1);
  return { bet, shoe, current: shoe.pop()!, multiplier: 1, streak: 0, phase: 'guess' };
}

/** 이번 추측이 맞을 확률에 맞춘 배당 (하우스 몫 5%) */
export function hlOdds(cur: Card, guess: 'high' | 'low'): number {
  const better = guess === 'high' ? 13 - cur.rank : cur.rank - 1;
  if (better <= 0) return 0;
  return Math.max(1.05, Math.floor((0.95 * 13) / better * 100) / 100);
}

export function hlGuess(s: HighLowState, guess: 'high' | 'low'): HighLowState {
  if (s.phase !== 'guess' || s.shoe.length === 0) return s;
  const odds = hlOdds(s.current, guess);
  const next = s.shoe.pop()!;
  const ok = odds > 0 && (guess === 'high' ? next.rank > s.current.rank : next.rank < s.current.rank);
  s.last = s.current;
  s.current = next;
  if (!ok) {
    s.phase = 'lost';
    return s;
  }
  s.multiplier = Math.round(s.multiplier * odds * 100) / 100;
  s.streak++;
  return s;
}

/** 그만두고 받기: 돌려받는 총액 */
export function hlCashOut(s: HighLowState): number {
  if (s.phase !== 'guess' || s.streak === 0) return s.phase === 'guess' ? s.bet : 0;
  s.phase = 'cashed';
  return Math.floor(s.bet * s.multiplier);
}
