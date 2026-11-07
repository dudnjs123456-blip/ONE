'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { KARAOKE_CHIPS, SONG_PRICE, isAccompaniment, karaokeQuery, rankKaraoke, rollScore, scoreComment, type KaraokeItem } from '@/game/city/karaoke';
import { isMuted, playCoin, playLevelUp } from '@/game/render/sfx';

const RECENT_KEY = 'ironfist.karaoke.recent';
const BEST_KEY = 'ironfist.karaoke.best';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

/** 탬버린 · 박수 소리 (음원 없이 잡음을 짧게 끊어 만든다) */
let ac: AudioContext | null = null;
function shake(kind: 'tambourine' | 'clap') {
  if (isMuted() || typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac ??= new AC();
  const c = ac;
  if (c.state === 'suspended') void c.resume();
  const buf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const hits = kind === 'tambourine' ? [0, 0.07, 0.13] : [0, 0.012, 0.026];
  for (const dt of hits) {
    const at = c.currentTime + dt;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = kind === 'tambourine' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'tambourine' ? 6500 : 1300;
    const g = c.createGain();
    const len = kind === 'tambourine' ? 0.12 : 0.06;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(kind === 'tambourine' ? 0.35 : 0.6, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    s.connect(f).connect(g).connect(c.destination);
    s.start(at, Math.random() * 0.1);
    s.stop(at + len + 0.02);
  }
}

/** 코인노래방 방: 노래 검색(유튜브 노래방 반주) → 예약 → 화면에서 반주가 나오고, 끝나면 점수 */
export default function KaraokePanel({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<KaraokeItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [queue, setQueue] = useState<KaraokeItem[]>([]);
  const [current, setCurrent] = useState<KaraokeItem | null>(null);
  const [scoring, setScoring] = useState<{ score: number; comment: string; best: boolean } | null>(null);
  const [recent, setRecent] = useState<KaraokeItem[]>([]);
  const [best, setBest] = useState(0);
  const [, redraw] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startedAt = useRef(0);
  const hype = useRef(0);
  const seq = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const ended = useRef(false);
  const scoreTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(scoreTimer.current), []);

  useEffect(() => {
    setRecent(load<KaraokeItem[]>(RECENT_KEY, []));
    setBest(load<number>(BEST_KEY, 0));
  }, []);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3000);
  };

  /** 곡 시작 (돈을 낸다). 못 내면 false */
  const start = useCallback(
    (it: KaraokeItem): boolean => {
      if (!world.karaokePay(SONG_PRICE)) {
        say(`💸 골드가 모자라요 (한 곡 ${SONG_PRICE} G)`);
        return false;
      }
      playCoin();
      ended.current = false;
      hype.current = 0;
      startedAt.current = Date.now();
      setScoring(null);
      setCurrent(it);
      setRecent((r) => {
        const next = [it, ...r.filter((x) => x.id !== it.id)].slice(0, 12);
        store(RECENT_KEY, next);
        return next;
      });
      redraw((n) => n + 1);
      return true;
    },
    [world],
  );

  /** 다음 예약곡으로 (없으면 화면을 비운다) */
  const next = useCallback(() => {
    const [head, ...rest] = queueRef.current;
    setQueue(rest);
    if (!head || !start(head)) setCurrent(null);
  }, [start]);

  /** 한 곡이 끝났다: 30초 넘게 불렀으면 점수, 아니면 바로 다음 곡 */
  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    if (Date.now() - startedAt.current < 30_000) {
      next();
      return;
    }
    const score = rollScore(Math.random, hype.current);
    const isBest = score > load<number>(BEST_KEY, 0);
    if (isBest) {
      store(BEST_KEY, score);
      setBest(score);
    }
    setScoring({ score, comment: scoreComment(score), best: isBest });
    if (score >= 90) playLevelUp();
    else playCoin();
    scoreTimer.current = window.setTimeout(next, 4500);
  }, [next]);

  // 유튜브 플레이어 소식: 끝남(0) → 점수, 오류 → 돈 돌려주고 다음 곡
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== frameRef.current?.contentWindow) return;
      let m: { event?: string; info?: unknown };
      try {
        m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const st = m.event === 'onStateChange' ? m.info : m.event === 'infoDelivery' ? (m.info as { playerState?: number } | null)?.playerState : undefined;
      if (st === 0) finish();
      if (m.event === 'onError' && !ended.current) {
        ended.current = true;
        world.karaokePay(-SONG_PRICE);
        say('🚫 이 영상은 노래방 화면에서 못 틀어요 — 골드는 돌려드렸어요. 다른 반주를 골라 주세요');
        next();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [finish, next, world]);

  const search = async (text: string) => {
    const s = karaokeQuery(text);
    if (!s) return;
    const my = ++seq.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/yt-search?q=${encodeURIComponent(s)}`);
      const j = (await r.json()) as { items?: KaraokeItem[] };
      if (my !== seq.current) return;
      const list = rankKaraoke(j.items ?? []);
      setItems(list);
      if (!list.length) say('검색 결과가 없어요 — 가수 이름이나 다른 제목으로 찾아보세요');
    } catch {
      if (my === seq.current) say('검색이 안 돼요 — 잠시 뒤 다시 해 주세요');
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  /** 예약: 부르는 곡이 없으면 바로 시작 */
  const reserve = (it: KaraokeItem, now = false) => {
    if (!current || now) {
      if (now && current) ended.current = true;
      window.clearTimeout(scoreTimer.current);
      start(it);
      return;
    }
    if (queue.some((x) => x.id === it.id)) return say('이미 예약한 곡이에요');
    setQueue((qq) => [...qq, it]);
    say(`📝 예약 ${queue.length + 1}번: ${it.title.slice(0, 30)}`);
  };

  const cheer = (kind: 'tambourine' | 'clap') => {
    shake(kind);
    if (current) hype.current++;
  };

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const gold = world.profile.gold;
  const list = items ?? recent;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gradient-to-br from-[#1a0630] via-[#12051f] to-[#05121f] text-white">
      <div className="flex items-center gap-2 border-b border-fuchsia-400/30 px-3 py-2">
        <div className="text-lg font-black tracking-wide text-fuchsia-300 drop-shadow-[0_0_8px_#e879f9]">🎤 코인노래방</div>
        <span className="hidden text-xs text-white/50 sm:inline">한 곡 {SONG_PRICE} G · 최고 {best || '-'}점</span>
        <span className="ml-auto rounded-full bg-black/40 px-3 py-1 text-sm font-bold text-amber-200">💰 {gold.toLocaleString()} G</span>
        <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
          나가기
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:flex-row">
        {/* 노래방 화면 */}
        <div className="flex shrink-0 flex-col gap-1.5 sm:w-[58%]">
          <div className="relative mx-auto aspect-video w-full max-h-[52vh] overflow-hidden rounded-lg border-2 border-fuchsia-500/50 bg-black shadow-[0_0_24px_rgba(217,70,239,0.35)] sm:max-h-[calc(100vh-110px)]">
            {current ? (
              <iframe
                key={current.id + startedAt.current}
                ref={frameRef}
                src={`https://www.youtube.com/embed/${current.id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(origin)}`}
                title={current.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                className="h-full w-full border-0"
                onLoad={() => frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_40%,#3b0764,#000_70%)] text-center">
                <div className="animate-pulse text-3xl font-black text-fuchsia-300 drop-shadow-[0_0_12px_#e879f9] sm:text-4xl">♪ SING!</div>
                <div className="px-4 text-xs text-white/70 sm:text-sm">노래 제목이나 가수를 검색해서 예약하세요</div>
                <div className="text-[11px] text-white/40">노래방 반주 영상을 유튜브에서 찾아 틀어 줘요</div>
              </div>
            )}
            {scoring && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-center">
                <div className="text-sm text-white/70">당신의 점수는</div>
                <div className={`text-6xl font-black drop-shadow-[0_0_16px_#facc15] sm:text-7xl ${scoring.score >= 100 ? 'animate-bounce text-yellow-300' : 'text-amber-300'}`}>{scoring.score}점</div>
                <div className="mt-1 text-base font-bold text-fuchsia-200">{scoring.comment}</div>
                {scoring.best && <div className="mt-1 text-xs font-bold text-emerald-300">🏆 내 최고 점수!</div>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => cheer('tambourine')} className="rounded-full bg-amber-500/90 px-3 py-1 text-sm font-bold text-black active:scale-95">
              🔔 탬버린
            </button>
            <button onClick={() => cheer('clap')} className="rounded-full bg-sky-500/90 px-3 py-1 text-sm font-bold text-black active:scale-95">
              👏 박수
            </button>
            {current && (
              <button
                onClick={() => {
                  ended.current = true;
                  window.clearTimeout(scoreTimer.current);
                  setScoring(null);
                  next();
                }}
                className="rounded-full bg-rose-600/90 px-3 py-1 text-sm font-bold active:scale-95"
              >
                ⏹ 취소
              </button>
            )}
            {current && <div className="min-w-0 flex-1 truncate text-xs text-white/60">♪ {current.title}</div>}
          </div>
        </div>

        {/* 검색 · 예약 */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="노래 제목 · 가수 (예: 아이유 좋은 날)"
              className="min-w-0 flex-1 rounded border border-fuchsia-400/40 bg-black/50 px-3 py-1.5 text-sm outline-none focus:border-fuchsia-300"
            />
            <button disabled={busy} className="rounded bg-fuchsia-600 px-3 py-1.5 text-sm font-bold hover:bg-fuchsia-500 disabled:opacity-50">
              {busy ? '찾는 중…' : '검색'}
            </button>
          </form>
          {!items && (
            <div className="flex flex-wrap gap-1">
              {KARAOKE_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setQ(c);
                    void search(c);
                  }}
                  className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {queue.length > 0 && (
            <div className="rounded bg-fuchsia-950/60 px-2 py-1 text-[11px]">
              <div className="font-bold text-fuchsia-200">📝 예약 {queue.length}곡</div>
              {queue.map((it, i) => (
                <div key={it.id} className="flex items-center gap-1">
                  <span className="text-white/50">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {i > 0 && (
                    <button onClick={() => setQueue((qq) => [it, ...qq.filter((x) => x.id !== it.id)])} className="text-amber-300 hover:underline">
                      우선
                    </button>
                  )}
                  <button onClick={() => setQueue((qq) => qq.filter((x) => x.id !== it.id))} className="text-rose-300 hover:underline">
                    빼기
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-white/45">{items ? '검색 결과 (노래방 반주 먼저)' : recent.length ? '최근 부른 곡' : ''}</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {list.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded bg-white/5 p-1 hover:bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt="" className="h-10 w-[72px] shrink-0 rounded object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-xs leading-tight">{it.title}</div>
                  <div className="flex items-center gap-1 text-[10px] text-white/45">
                    {isAccompaniment(it) && <span className="rounded bg-emerald-500/80 px-1 font-bold text-black">반주</span>}
                    <span className="truncate">{it.channel}</span>
                    {it.length && <span>· {it.length}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button onClick={() => reserve(it)} className="rounded bg-fuchsia-600 px-2 py-0.5 text-[11px] font-bold hover:bg-fuchsia-500">
                    {current ? '예약' : '부르기'}
                  </button>
                  {current && (
                    <button onClick={() => reserve(it, true)} className="rounded bg-white/10 px-2 py-0.5 text-[10px] hover:bg-white/20">
                      바로
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {toast && <div className="rounded bg-black/70 px-2 py-1 text-center text-xs text-amber-200">{toast}</div>}
        </div>
      </div>
    </div>
  );
}
