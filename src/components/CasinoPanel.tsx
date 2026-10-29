'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import {
  CASINO_GAMES,
  CASINO_NAME,
  CHIPS,
  MIN_BET,
  SLOT_PAYS,
  SLOT_SYMBOLS,
  bjDeal,
  bjDouble,
  bjHit,
  bjStand,
  cardLabel,
  handValue,
  hlCashOut,
  hlGuess,
  hlOdds,
  hlStart,
  isRed,
  rollSicBo,
  rouletteColor,
  spinRoulette,
  spinSlots,
  type BlackjackState,
  type Card,
  type CasinoGame,
  type HighLowState,
  type RouletteBet,
  type SlotSymbol,
} from '@/game/city/casino';

/** 카지노 (입구에서 E): 게임 고르기 → 칩으로 베팅. 돈은 내 골드에서 바로 빠지고 들어온다 */
export default function CasinoPanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const [game, setGame] = useState<CasinoGame['id'] | null>(null);
  const [bet, setBet] = useState(MIN_BET);
  const [, redraw] = useState(0);
  const refresh = () => redraw((n) => n + 1);
  const pr = world.profile;
  const st = pr.casino;
  const rng = () => world.random();
  const place = (amount = bet) => {
    const ok = world.casinoBet(amount);
    refresh();
    return ok;
  };
  const pay = (amount: number) => {
    world.casinoPay(amount);
    refresh();
  };
  const cur = CASINO_GAMES.find((g) => g.id === game);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-[760px] max-w-full rounded-2xl border border-amber-300/40 bg-gradient-to-b from-[#2a0f3a] to-[#120818] p-5 shadow-[0_0_60px_rgba(255,80,220,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {game && (
              <button onClick={() => setGame(null)} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                ← 게임 목록
              </button>
            )}
            <div className="text-xl font-black text-amber-200">🎰 {cur ? `${cur.icon} ${cur.name}` : CASINO_NAME}</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-black/40 px-3 py-1 font-bold text-amber-200">💰 {pr.gold.toLocaleString()} G</span>
            <button onClick={onClose} className="text-xs text-white/50 hover:text-white">
              나가기 (Esc)
            </button>
          </div>
        </div>

        {!game ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {CASINO_GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGame(g.id)}
                  className="rounded-xl border border-white/15 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-white/10"
                >
                  <div className="text-4xl">{g.icon}</div>
                  <div className="mt-2 font-bold">{g.name}</div>
                  <div className="mt-1 text-xs text-white/60">{g.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-black/30 px-4 py-2 text-xs text-white/70">
              {st ? (
                <>
                  플레이 {st.played}판 · 건 돈 {st.lost.toLocaleString()}G · 받은 돈 {st.won.toLocaleString()}G · 손익{' '}
                  <b className={st.won - st.lost >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    {st.won - st.lost >= 0 ? '+' : ''}
                    {(st.won - st.lost).toLocaleString()}G
                  </b>{' '}
                  · 최고 당첨 {st.best.toLocaleString()}G
                </>
              ) : (
                '최소 베팅 10G. 카지노는 언제나 조금 유리합니다 — 적당히 즐기세요!'
              )}
            </div>
          </>
        ) : (
          <>
            <BetBar bet={bet} setBet={setBet} gold={pr.gold} />
            <div className="mt-3 min-h-[300px] rounded-xl border border-white/10 bg-[#0d3b26]/60 p-4">
              {game === 'slots' && <Slots bet={bet} place={place} pay={pay} rng={rng} />}
              {game === 'blackjack' && <Blackjack bet={bet} place={place} pay={pay} rng={rng} />}
              {game === 'roulette' && <Roulette bet={bet} place={place} pay={pay} rng={rng} />}
              {game === 'sicbo' && <SicBo bet={bet} place={place} pay={pay} rng={rng} />}
              {game === 'highlow' && <HighLow bet={bet} place={place} pay={pay} rng={rng} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface GameProps {
  bet: number;
  place: (amount?: number) => boolean;
  pay: (amount: number) => void;
  rng: () => number;
}

function BetBar({ bet, setBet, gold }: { bet: number; setBet: (n: number) => void; gold: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-white/70">베팅</span>
      {CHIPS.map((c) => (
        <button
          key={c}
          onClick={() => setBet(c)}
          disabled={gold < c}
          className={`h-10 w-14 rounded-full border-2 border-dashed font-black shadow disabled:opacity-30 ${
            bet === c ? 'border-white bg-amber-400 text-black' : 'border-white/40 bg-red-700/80 text-white hover:bg-red-600'
          }`}
        >
          {c}
        </button>
      ))}
      <button onClick={() => setBet(Math.max(MIN_BET, Math.floor(gold / 10) * 10))} disabled={gold < MIN_BET} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30">
        올인
      </button>
      <span className="ml-auto font-bold text-amber-200">현재 베팅 {bet}G</span>
    </div>
  );
}

function Result({ text, win }: { text: string; win: boolean | null }) {
  if (!text) return null;
  return <div className={`mt-3 text-center text-lg font-black ${win === null ? 'text-white/80' : win ? 'text-emerald-300' : 'text-red-300'}`}>{text}</div>;
}

// ───── 슬롯머신 ─────
function Slots({ bet, place, pay, rng }: GameProps) {
  const [reels, setReels] = useState<SlotSymbol[]>(['7️⃣', '7️⃣', '7️⃣']);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; win: boolean | null }>({ text: '', win: null });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const spin = () => {
    if (spinning || !place()) return setMsg({ text: '돈이 모자라요', win: false });
    const res = spinSlots(bet, rng);
    setSpinning(true);
    setMsg({ text: '', win: null });
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      // 릴이 하나씩 멈춘다
      setReels((r) => r.map((s, i) => (n > 8 + i * 5 ? res.reels[i] : SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)])));
      if (n > 20) {
        clearInterval(timer.current!);
        setReels(res.reels);
        setSpinning(false);
        pay(res.payout);
        setMsg({ text: res.payout ? `${res.text} +${res.payout}G` : res.text, win: res.payout > bet ? true : res.payout ? null : false });
      }
    }, 60);
  };
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-3 rounded-2xl border-4 border-amber-400 bg-black/60 p-4">
        {reels.map((s, i) => (
          <div key={i} className={`flex h-24 w-24 items-center justify-center rounded-lg bg-white text-6xl ${spinning ? 'blur-[1px]' : ''}`}>
            {s}
          </div>
        ))}
      </div>
      <button onClick={spin} disabled={spinning} className="mt-4 rounded-full bg-red-600 px-10 py-3 text-lg font-black shadow-lg hover:bg-red-500 disabled:opacity-50">
        {spinning ? '돌아가는 중…' : `SPIN (${bet}G)`}
      </button>
      <Result {...msg} />
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-white/60">
        {SLOT_SYMBOLS.map((s) => (
          <span key={s}>
            {s}
            {s}
            {s} ×{SLOT_PAYS[s]}
          </span>
        ))}
        <span>🍒🍒 ×1.8</span>
      </div>
    </div>
  );
}

// ───── 블랙잭 ─────
function CardView({ c, hidden }: { c: Card; hidden?: boolean }) {
  if (hidden) return <div className="flex h-20 w-14 items-center justify-center rounded-md border-2 border-white bg-gradient-to-br from-blue-800 to-indigo-900 text-xl">🂠</div>;
  return (
    <div className={`flex h-20 w-14 items-center justify-center rounded-md border border-black/20 bg-white text-lg font-black shadow ${isRed(c) ? 'text-red-600' : 'text-black'}`}>
      {cardLabel(c)}
    </div>
  );
}

function Blackjack({ bet, place, pay, rng }: GameProps) {
  const [g, setG] = useState<BlackjackState | null>(null);
  const [, redraw] = useState(0);
  const update = (s: BlackjackState) => {
    if (s.phase === 'done') pay(s.payout);
    setG(s);
    redraw((n) => n + 1);
  };
  const deal = () => {
    if (!place()) return;
    update(bjDeal(bet, rng));
  };
  const playing = g?.phase === 'player';
  return (
    <div className="flex flex-col items-center gap-3">
      {g ? (
        <>
          <div className="text-xs text-white/60">딜러 {playing ? '' : `(${handValue(g.dealer).total})`}</div>
          <div className="flex gap-2">
            {g.dealer.map((c, i) => (
              <CardView key={i} c={c} hidden={playing && i === 1} />
            ))}
          </div>
          <div className="flex gap-2">
            {g.player.map((c, i) => (
              <CardView key={i} c={c} />
            ))}
          </div>
          <div className="text-xs text-white/60">
            나 ({handValue(g.player).total}) · 베팅 {g.bet}G{g.doubled ? ' (더블)' : ''}
          </div>
        </>
      ) : (
        <div className="py-10 text-white/60">딜러보다 21에 가깝게! 21을 넘기면 집니다. 딜러는 17 이상까지 받아요.</div>
      )}
      {playing ? (
        <div className="flex gap-2">
          <button onClick={() => update({ ...bjHit(g!) })} className="rounded bg-emerald-600 px-5 py-2 font-bold hover:bg-emerald-500">
            히트 (한 장 더)
          </button>
          <button onClick={() => update({ ...bjStand(g!) })} className="rounded bg-sky-600 px-5 py-2 font-bold hover:bg-sky-500">
            스탠드
          </button>
          {g!.player.length === 2 && (
            <button
              onClick={() => {
                if (place(g!.bet)) update({ ...bjDouble(g!) });
              }}
              className="rounded bg-amber-600 px-5 py-2 font-bold hover:bg-amber-500"
            >
              더블 (+{g!.bet}G)
            </button>
          )}
        </div>
      ) : (
        <button onClick={deal} className="rounded-full bg-red-600 px-8 py-2.5 font-black hover:bg-red-500">
          {g ? '한 판 더' : '카드 받기'} ({bet}G)
        </button>
      )}
      {g?.phase === 'done' && <Result text={`${g.result}${g.payout ? ` +${g.payout}G` : ''}`} win={g.payout > g.bet ? true : g.payout === g.bet ? null : false} />}
    </div>
  );
}

// ───── 룰렛 ─────
function Roulette({ bet, place, pay, rng }: GameProps) {
  const [pick, setPick] = useState<RouletteBet>({ kind: 'red' });
  const [num, setNum] = useState(7);
  const [ball, setBall] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; win: boolean | null }>({ text: '', win: null });
  const opts: { b: RouletteBet; label: string; cls: string }[] = [
    { b: { kind: 'red' }, label: '빨강 ×2', cls: 'bg-red-600' },
    { b: { kind: 'black' }, label: '검정 ×2', cls: 'bg-zinc-900' },
    { b: { kind: 'odd' }, label: '홀 ×2', cls: 'bg-emerald-800' },
    { b: { kind: 'even' }, label: '짝 ×2', cls: 'bg-emerald-800' },
    { b: { kind: 'low' }, label: '1~18 ×2', cls: 'bg-emerald-800' },
    { b: { kind: 'high' }, label: '19~36 ×2', cls: 'bg-emerald-800' },
    { b: { kind: 'dozen', n: 1 }, label: '1~12 ×3', cls: 'bg-emerald-900' },
    { b: { kind: 'dozen', n: 2 }, label: '13~24 ×3', cls: 'bg-emerald-900' },
    { b: { kind: 'dozen', n: 3 }, label: '25~36 ×3', cls: 'bg-emerald-900' },
  ];
  const same = (a: RouletteBet, b: RouletteBet) => JSON.stringify(a) === JSON.stringify(b);
  const spin = () => {
    if (spinning || !place()) return;
    const res = spinRoulette(bet, pick, rng);
    setSpinning(true);
    setMsg({ text: '', win: null });
    let n = 0;
    const t = setInterval(() => {
      setBall(Math.floor(Math.random() * 37));
      if (++n > 18) {
        clearInterval(t);
        setBall(res.n);
        setSpinning(false);
        pay(res.payout);
        const col = rouletteColor(res.n);
        setMsg({ text: `${res.n} (${col === 'red' ? '빨강' : col === 'black' ? '검정' : '초록'}) ${res.payout ? `당첨! +${res.payout}G` : '— 꽝'}`, win: res.payout > 0 });
      }
    }, 70);
  };
  const col = ball === null ? null : rouletteColor(ball);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full border-8 border-amber-500 text-3xl font-black shadow-inner ${
          col === 'red' ? 'bg-red-600' : col === 'black' ? 'bg-zinc-900' : col === 'green' ? 'bg-emerald-600' : 'bg-black/40'
        } ${spinning ? 'animate-spin' : ''}`}
      >
        {ball ?? '?'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <button key={o.label} onClick={() => setPick(o.b)} className={`rounded px-3 py-1.5 text-sm font-bold ${o.cls} ${same(o.b, pick) ? 'ring-2 ring-amber-300' : 'opacity-80 hover:opacity-100'}`}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => setPick({ kind: 'number', n: num })} className={`rounded bg-amber-700 px-3 py-1.5 font-bold ${pick.kind === 'number' ? 'ring-2 ring-amber-300' : ''}`}>
          숫자 하나 ×36
        </button>
        <input
          type="number"
          min={0}
          max={36}
          value={num}
          onChange={(e) => {
            const v = Math.max(0, Math.min(36, Number(e.target.value) || 0));
            setNum(v);
            if (pick.kind === 'number') setPick({ kind: 'number', n: v });
          }}
          className="w-16 rounded bg-black/50 px-2 py-1 text-center"
        />
      </div>
      <button onClick={spin} disabled={spinning} className="rounded-full bg-red-600 px-8 py-2.5 font-black hover:bg-red-500 disabled:opacity-50">
        {spinning ? '굴러가는 중…' : `돌리기 (${bet}G)`}
      </button>
      <Result {...msg} />
    </div>
  );
}

// ───── 대소 ─────
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function SicBo({ bet, place, pay, rng }: GameProps) {
  const [dice, setDice] = useState([1, 2, 3]);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState<{ text: string; win: boolean | null }>({ text: '', win: null });
  const roll = (pick: 'big' | 'small') => {
    if (rolling || !place()) return;
    const res = rollSicBo(bet, pick, rng);
    setRolling(true);
    setMsg({ text: '', win: null });
    let n = 0;
    const t = setInterval(() => {
      setDice([0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)));
      if (++n > 12) {
        clearInterval(t);
        setDice(res.dice);
        setRolling(false);
        pay(res.payout);
        setMsg({ text: `${res.text} ${res.payout ? `— 당첨! +${res.payout}G` : '— 꽝'}`, win: res.payout > 0 });
      }
    }, 70);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3 text-7xl">
        {dice.map((d, i) => (
          <span key={i} className={rolling ? 'animate-bounce' : ''}>
            {DIE[d - 1]}
          </span>
        ))}
      </div>
      <div className="text-sm text-white/60">주사위 세 개의 합: 소 4~10 / 대 11~17 (세 개가 같으면 하우스 승)</div>
      <div className="flex gap-3">
        <button onClick={() => roll('small')} disabled={rolling} className="rounded-xl bg-sky-700 px-8 py-3 text-xl font-black hover:bg-sky-600 disabled:opacity-50">
          소 ×2
        </button>
        <button onClick={() => roll('big')} disabled={rolling} className="rounded-xl bg-red-700 px-8 py-3 text-xl font-black hover:bg-red-600 disabled:opacity-50">
          대 ×2
        </button>
      </div>
      <Result {...msg} />
    </div>
  );
}

// ───── 하이로우 ─────
function HighLow({ bet, place, pay, rng }: GameProps) {
  const [g, setG] = useState<HighLowState | null>(null);
  const [msg, setMsg] = useState<{ text: string; win: boolean | null }>({ text: '', win: null });
  const start = () => {
    if (!place()) return;
    setG(hlStart(bet, rng));
    setMsg({ text: '', win: null });
  };
  const guess = (gs: 'high' | 'low') => {
    if (!g) return;
    const s = hlGuess({ ...g }, gs);
    setG(s);
    if (s.phase === 'lost') setMsg({ text: `${cardLabel(s.current)} — 틀렸다… 베팅 ${s.bet}G 를 잃었다`, win: false });
    else setMsg({ text: `${cardLabel(s.current)} 맞혔다! 지금 그만두면 ×${s.multiplier}`, win: true });
  };
  const cash = () => {
    if (!g) return;
    const s = { ...g };
    const amount = hlCashOut(s);
    pay(amount);
    setG(s);
    setMsg({ text: `${amount}G 받고 그만뒀다 (${s.streak}연속)`, win: amount > s.bet });
  };
  const active = g?.phase === 'guess';
  return (
    <div className="flex flex-col items-center gap-3">
      {g ? (
        <>
          <div className="flex items-center gap-4">
            {g.last && (
              <div className="opacity-50">
                <CardView c={g.last} />
              </div>
            )}
            <div className="scale-125">
              <CardView c={g.current} />
            </div>
          </div>
          <div className="text-sm text-white/70">
            연속 {g.streak} · 배당 ×{g.multiplier} · 베팅 {g.bet}G
          </div>
        </>
      ) : (
        <div className="py-10 text-white/60">다음 카드가 지금 카드보다 높을지 낮을지 맞히세요. 같으면 집니다. 맞힐수록 배당이 쌓이고, 언제든 그만두고 받을 수 있어요.</div>
      )}
      {active ? (
        <div className="flex gap-2">
          <button onClick={() => guess('high')} disabled={hlOdds(g!.current, 'high') === 0} className="rounded bg-red-600 px-5 py-2 font-bold hover:bg-red-500 disabled:opacity-30">
            ▲ 높다 (×{hlOdds(g!.current, 'high')})
          </button>
          <button onClick={() => guess('low')} disabled={hlOdds(g!.current, 'low') === 0} className="rounded bg-sky-600 px-5 py-2 font-bold hover:bg-sky-500 disabled:opacity-30">
            ▼ 낮다 (×{hlOdds(g!.current, 'low')})
          </button>
          <button onClick={cash} disabled={g!.streak === 0} className="rounded bg-amber-500 px-5 py-2 font-bold text-black hover:bg-amber-400 disabled:opacity-30">
            💰 그만두고 받기 ({Math.floor(g!.bet * g!.multiplier)}G)
          </button>
        </div>
      ) : (
        <button onClick={start} className="rounded-full bg-red-600 px-8 py-2.5 font-black hover:bg-red-500">
          {g ? '새 판' : '시작'} ({bet}G)
        </button>
      )}
      <Result {...msg} />
    </div>
  );
}
