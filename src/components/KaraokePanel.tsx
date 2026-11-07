'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { KARAOKE_ACTS, KARAOKE_CHIPS, SONG_PRICE, fallbackSong, isAccompaniment, karaokeQuery, likelyBlocked, rankKaraoke, rollScore, scoreComment, type KaraokeItem, type Playable } from '@/game/city/karaoke';
import { isMuted, playCoin, playLevelUp } from '@/game/render/sfx';
import { probeYouTube } from '@/game/render/ytProbe';

const RECENT_KEY = 'ironfist.karaoke.recent';
const BEST_KEY = 'ironfist.karaoke.best';
/** 미리 틀어 본 결과 (영상 id → 틀 수 있음/막힘). 오래된 것부터 지워 이만큼만 남긴다 */
const PLAYABLE_KEY = 'ironfist.karaoke.playable';
const PLAYABLE_MAX = 400;
/** 검색하면 위에서부터 이만큼 미리 틀어 본다 (동시에 3개씩) */
const PROBE_TOP = 10;
const PROBE_PARALLEL = 3;

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
  const [scoring, setScoring] = useState<{
    score: number;
    comment: string;
    best: boolean;
  } | null>(null);
  const [recent, setRecent] = useState<KaraokeItem[]>([]);
  const [best, setBest] = useState(0);
  const [, redraw] = useState(0);
  /** 미리 틀어 본 결과 */
  const [known, setKnown] = useState<ReadonlyMap<string, Playable>>(() => new Map());
  const knownRef = useRef(known);
  knownRef.current = known;
  /** 지금 틀어 보는 중인 영상 */
  const [probing, setProbing] = useState<ReadonlySet<string>>(() => new Set());
  const probeStops = useRef<(() => void)[]>([]);
  /** 곡을 고를 때 함께 있던 검색 결과 (막혔을 때 같은 노래의 다른 반주를 찾는다) */
  const altsRef = useRef(new Map<string, KaraokeItem[]>());
  const currentRef = useRef<KaraokeItem | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startedAt = useRef(0);
  const hype = useRef(0);
  const seq = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const ended = useRef(false);
  const scoreTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(scoreTimer.current), []);
  useEffect(() => () => probeStops.current.splice(0).forEach((stop) => stop()), []);

  /** 틀 수 있는지 알게 된 영상을 기억한다 (다음에 들어와도 그대로) */
  const remember = useCallback((id: string, r: Playable) => {
    setKnown((m) => {
      if (m.get(id) === r) return m;
      const next = new Map(m);
      next.delete(id);
      next.set(id, r);
      while (next.size > PLAYABLE_MAX) next.delete(next.keys().next().value as string);
      store(PLAYABLE_KEY, [...next]);
      return next;
    });
  }, []);

  /** 검색 결과 위쪽 영상들을 화면 밖에서 소리 없이 틀어 보고, 막힌 것을 표시한다 */
  const probeList = useCallback(
    (list: KaraokeItem[]) => {
      probeStops.current.splice(0).forEach((stop) => stop());
      const todo = list.filter((it) => !knownRef.current.has(it.id)).slice(0, PROBE_TOP);
      setProbing(new Set(todo.map((it) => it.id)));
      let alive = true;
      probeStops.current.push(() => (alive = false));
      const worker = async () => {
        while (alive && todo.length) {
          const it = todo.shift()!;
          const pr = probeYouTube(it.id);
          probeStops.current.push(pr.cancel);
          const r = await pr.done;
          if (!alive) return;
          if (r) remember(it.id, r);
          setProbing((cur) => {
            const n = new Set(cur);
            n.delete(it.id);
            return n;
          });
        }
      };
      for (let i = 0; i < PROBE_PARALLEL; i++) void worker();
    },
    [remember],
  );

  useEffect(() => {
    setRecent(load<KaraokeItem[]>(RECENT_KEY, []));
    setBest(load<number>(BEST_KEY, 0));
    const saved = load<[string, Playable][]>(PLAYABLE_KEY, []);
    if (Array.isArray(saved)) setKnown(new Map(saved.filter((e) => Array.isArray(e) && (e[1] === 'ok' || e[1] === 'blocked'))));
  }, []);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3000);
  };

  /** 곡 시작 (돈을 낸다). 못 내면 false */
  const start = useCallback(
    (it: KaraokeItem): boolean => {
      if (!world.karaokePay(SONG_PRICE)) {
        say('🎫 남은 곡이 없어요 — 카운터에서 곡을 더 사 주세요');
        return false;
      }
      playCoin();
      ended.current = false;
      hype.current = 0;
      startedAt.current = Date.now();
      setScoring(null);
      currentRef.current = it;
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
    if (!head || !start(head)) {
      currentRef.current = null;
      setCurrent(null);
    }
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
      if (st === 1 && currentRef.current) remember(currentRef.current.id, 'ok');
      if (m.event === 'onError' && !ended.current) {
        ended.current = true;
        world.karaokePay(-SONG_PRICE);
        const failed = currentRef.current;
        if (failed) remember(failed.id, 'blocked');
        // 영상 주인이 다른 사이트 재생을 막아 둔 영상: 같은 검색 결과에서 틀 수 있는 다른 반주로 바로 바꾼다
        const alts = failed ? (altsRef.current.get(failed.id) ?? []) : [];
        const now = new Map(knownRef.current);
        if (failed) now.set(failed.id, 'blocked');
        const alt = failed ? fallbackSong(alts, failed.id, now) : null;
        if (alt && start(alt)) {
          altsRef.current.set(alt.id, alts);
          say('🔁 이 영상은 유튜브에서 다른 사이트 재생을 막아 뒀어요 — 같은 노래의 다른 반주로 바꿔 틀게요');
          return;
        }
        say('🚫 이 영상은 노래방 화면에서 못 틀어요 — 골드는 돌려드렸어요. 다른 반주를 골라 주세요');
        next();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [finish, next, world, remember, start]);

  const search = async (text: string) => {
    const s = karaokeQuery(text);
    if (!s) return;
    const my = ++seq.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/yt-search?q=${encodeURIComponent(s)}`);
      const j = (await r.json()) as { items?: KaraokeItem[] };
      if (my !== seq.current) return;
      const list = rankKaraoke(j.items ?? [], knownRef.current);
      setItems(list);
      probeList(list);
      if (!list.length) say('검색 결과가 없어요 — 가수 이름이나 다른 제목으로 찾아보세요');
    } catch {
      if (my === seq.current) say('검색이 안 돼요 — 잠시 뒤 다시 해 주세요');
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  /** 예약: 부르는 곡이 없으면 바로 시작 */
  const reserve = (it: KaraokeItem, now = false) => {
    if (known.get(it.id) === 'blocked') return say('🚫 이 영상은 유튜브에서 다른 사이트 재생을 막아 뒀어요 — 다른 반주를 골라 주세요');
    altsRef.current.set(it.id, items ?? recent);
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
  const songsLeft = world.karaokeRental?.songs ?? 0;
  /** 노래 동작 (방 안 내 캐릭터가 한다). 신나는 동작은 분위기도 띄운다 */
  const act = (id: (typeof KARAOKE_ACTS)[number]['id']) => {
    if (!world.karaokeAct(id)) return;
    if (current && (id === 'kHype' || id === 'kDance' || id === 'kTamb' || id === 'cheer')) hype.current++;
    if (id === 'kTamb') shake('tambourine');
    if (id === 'cheer') shake('clap');
    redraw((n) => n + 1);
  };
  const list = items ?? recent;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 top-3 z-30 flex w-[440px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-fuchsia-400/40 bg-gradient-to-br from-[#1a0630]/95 via-[#12051f]/95 to-[#05121f]/95 text-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-fuchsia-400/30 px-3 py-2">
        <div className="text-lg font-black tracking-wide text-fuchsia-300 drop-shadow-[0_0_8px_#e879f9]">🎤 코인노래방{world.karaokeRoom ? ` · ${world.karaokeRoom}번방` : ''}</div>
        <span className="hidden text-xs text-white/50 sm:inline">최고 {best || '-'}점</span>
        <span className={`ml-auto rounded-full bg-black/40 px-3 py-1 text-sm font-bold ${songsLeft ? 'text-amber-200' : 'text-rose-300'}`}>🎫 남은 {songsLeft}곡</span>
        <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
          나가기
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {/* 노래방 화면 */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg border-2 border-fuchsia-500/50 bg-black shadow-[0_0_24px_rgba(217,70,239,0.35)]">
            {current ? (
              <iframe
                key={current.id + startedAt.current}
                ref={frameRef}
                src={`https://www.youtube.com/embed/${current.id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(origin)}`}
                title={current.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                className="h-full w-full border-0"
                onLoad={() =>
                  frameRef.current?.contentWindow?.postMessage(
                    JSON.stringify({
                      event: 'listening',
                      id: 1,
                      channel: 'widget',
                    }),
                    '*',
                  )
                }
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
          {/* 내 캐릭터 동작: 방 안에서만 (왼쪽 화면에 보인다) */}
          <div className="flex flex-wrap gap-1">
            {KARAOKE_ACTS.map((a, i) => (
              <button
                key={a.id}
                onClick={() => act(a.id)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold active:scale-95 ${world.seat?.phase !== 'stand' && world.seatBooth !== null && world.sofa.id === a.id ? 'bg-fuchsia-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                <span className="mr-0.5 opacity-50">{i + 1}</span>
                {a.icon} {a.label}
              </button>
            ))}
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
          <div className="text-[11px] text-white/45">{items ? `검색 결과 (노래방 반주 먼저)${probing.size ? ` · 틀 수 있는지 확인 중… ${probing.size}` : ''}` : recent.length ? '최근 부른 곡' : ''}</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {list.map((it) => {
              const k = known.get(it.id);
              const blocked = k === 'blocked';
              return (
                <div key={it.id} className={`flex items-center gap-2 rounded p-1 ${blocked ? 'bg-white/[0.02] opacity-45' : 'bg-white/5 hover:bg-white/10'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.thumb} alt="" className="h-10 w-[72px] shrink-0 rounded object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-xs leading-tight">{it.title}</div>
                    <div className="flex items-center gap-1 text-[10px] text-white/45">
                      {isAccompaniment(it) && <span className="rounded bg-emerald-500/80 px-1 font-bold text-black">반주</span>}
                      {blocked ? (
                        <span className="rounded bg-rose-600/80 px-1 font-bold text-white">재생 불가</span>
                      ) : k === 'ok' ? (
                        <span className="rounded bg-sky-500/80 px-1 font-bold text-black">✓ 재생 가능</span>
                      ) : probing.has(it.id) ? (
                        <span className="rounded bg-white/15 px-1">확인 중…</span>
                      ) : likelyBlocked(it) ? (
                        <span className="rounded bg-amber-500/70 px-1 text-black">막혔을 수도</span>
                      ) : null}
                      <span className="truncate">{it.channel}</span>
                      {it.length && <span>· {it.length}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button onClick={() => reserve(it)} disabled={blocked} className="rounded bg-fuchsia-600 px-2 py-0.5 text-[11px] font-bold hover:bg-fuchsia-500 disabled:bg-white/10 disabled:text-white/40">
                      {current ? '예약' : '부르기'}
                    </button>
                    {current && !blocked && (
                      <button onClick={() => reserve(it, true)} className="rounded bg-white/10 px-2 py-0.5 text-[10px] hover:bg-white/20">
                        바로
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {toast && <div className="rounded bg-black/70 px-2 py-1 text-center text-xs text-amber-200">{toast}</div>}
        </div>
      </div>
    </div>
  );
}
