'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { tvPos, tvSetPaused, tvState, videoIdOf, type TvVideo } from '@/game/city/tvState';

/** 플레이어 원래 크기 (TV 화면 비율 1.84:1). 화면에 맞춰 원근 변환으로 늘리고 줄인다 */
const BOX_W = 1280;
const BOX_H = 696;

/**
 * 투명하게 뚫린 TV 화면 자리에 유튜브 플레이어를 맞춘다.
 * 네 모서리(왼위·오위·오아래·왼아래, CSS 픽셀)로 가는 원근 변환(matrix3d)을 만든다. null 이면 숨긴다
 */
export function placeTvBox(el: HTMLElement | null, c: [number, number][] | null) {
  if (!el) return;
  if (!c) {
    if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
    return;
  }
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = c;
  // 단위 사각형 → 사변형 (Heckbert)
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) return;
  const g = (sx * dy2 - dx2 * sy) / det;
  const h = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, cc = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  const m = [a / BOX_W, d / BOX_W, 0, g / BOX_W, b / BOX_H, e / BOX_H, 0, h / BOX_H, 0, 0, 1, 0, cc, f, 0, 1];
  el.style.transform = `matrix3d(${m.map((v) => v.toFixed(8)).join(',')})`;
  if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
}

type Cmd = 'playVideo' | 'pauseVideo' | 'setVolume' | 'unMute' | 'mute' | 'seekTo';
export function tvCommand(frame: HTMLIFrameElement | null, func: Cmd, args: unknown[] = []) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

/** 캔버스 뒤에 깔리는 유튜브 플레이어. 캔버스의 TV 화면 자리가 투명해서 그 부분만 비친다 */
export function TvScreen({
  video,
  boxRef,
  frameRef,
  onState,
}: {
  video: TvVideo | null;
  boxRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  onState: (s: { playing?: boolean; error?: number }) => void;
}) {
  const stateRef = useRef(onState);
  stateRef.current = onState;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== frameRef.current?.contentWindow) return;
      let m: { event?: string; info?: unknown };
      try {
        m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (m.event === 'onError') stateRef.current({ error: Number(m.info) });
      else if (m.event === 'onStateChange') stateRef.current({ playing: m.info === 1 || m.info === 3 });
      else if (m.event === 'infoDelivery') {
        const st = (m.info as { playerState?: number } | null)?.playerState;
        if (st !== undefined) stateRef.current({ playing: st === 1 || st === 3 });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [frameRef]);

  // 주소는 영상이 바뀔 때만 만든다 (친구가 보던 위치부터 이어서 본다)
  const src = useMemo(() => {
    if (!video) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const start = Math.floor(tvPos());
    return `https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&controls=0&iv_load_policy=3${start > 1 ? `&start=${start}` : ''}&origin=${encodeURIComponent(origin)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);
  if (!video) return null;
  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute left-0 top-0 -z-10 bg-black"
      style={{ width: BOX_W, height: BOX_H, transformOrigin: '0 0', visibility: 'hidden' }}
    >
      <iframe
        key={video.id}
        ref={frameRef}
        src={src}
        title={video.title}
        allow="autoplay; encrypted-media; picture-in-picture"
        className="h-full w-full border-0"
        onLoad={() => {
          frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
          // 친구가 멈춰 둔 영상이면 멈춘 채로
          if (tvState.pausedAt !== null) setTimeout(() => tvCommand(frameRef.current, 'pauseVideo'), 800);
        }}
      />
    </div>
  );
}

interface Item extends TvVideo {
  length: string;
}

const CHIPS = ['노래 플레이리스트', '오늘 뉴스', '게임 방송', '먹방', '고양이 영상', '로파이 공부', 'ASMR', '예능 레전드'];
const RECENT_KEY = 'tv-recent';

function loadRecent(): TvVideo[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 12) : [];
  } catch {
    return [];
  }
}

/** TV 리모컨 창: 유튜브 검색 → 고르면 거실 TV 에서 재생 */
export default function TvPanel({ now, onPlay, onClose }: { now: TvVideo | null; onPlay: (v: TvVideo) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<TvVideo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const search = async (text: string) => {
    const s = text.trim();
    if (!s) return;
    // 유튜브 주소를 붙여 넣으면 바로 튼다
    const id = videoIdOf(s);
    if (id) {
      play({ id, title: '붙여 넣은 영상', channel: '', thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/yt-search?q=${encodeURIComponent(s)}`);
      const j = (await r.json()) as { items?: Item[] };
      if (my !== seq.current) return;
      setItems(j.items ?? []);
      if (!j.items?.length) setErr('검색 결과가 없어요. 다른 말로 찾아볼까요?');
    } catch {
      if (my === seq.current) setErr('검색에 실패했어요. 잠시 뒤 다시 해 주세요');
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const play = (v: TvVideo) => {
    const next = [v, ...recent.filter((r) => r.id !== v.id)].slice(0, 12);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    onPlay(v);
  };

  useEffect(() => {
    setRecent(loadRecent());
    inputRef.current?.focus();
    void search(CHIPS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = (v: TvVideo & { length?: string }) => (
    <button
      key={v.id}
      onClick={() => play(v)}
      className={`group flex w-full gap-2.5 rounded-xl p-1.5 text-left hover:bg-white/10 ${now?.id === v.id ? 'bg-rose-500/20 ring-1 ring-rose-400/60' : ''}`}
    >
      <div className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-lg bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        {v.length && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-bold">{v.length}</span>}
        {now?.id === v.id && <span className="absolute left-1 top-1 rounded bg-rose-500 px-1 text-[10px] font-bold">재생 중</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13px] font-bold leading-snug group-hover:text-rose-200">{v.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/50">{v.channel}</div>
      </div>
    </button>
  );

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 top-4 z-40 flex w-[380px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 text-white shadow-2xl backdrop-blur"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-lg">📺</span>
        <span className="font-black">
          <span className="text-rose-500">▶</span> 유튜브
        </span>
        <span className="text-xs text-white/40">거실 TV 로 보기</span>
        <button onClick={onClose} className="ml-auto rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>
      <form
        className="flex gap-2 px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색하거나 유튜브 주소 붙여 넣기"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-rose-400"
        />
        <button className="rounded-full bg-rose-600 px-4 text-sm font-bold hover:bg-rose-500">검색</button>
      </form>
      <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setQ(c);
              void search(c);
            }}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {recent.length > 0 && (
          <details className="mb-1 px-1.5">
            <summary className="cursor-pointer py-1 text-xs font-bold text-white/60">최근에 본 영상 {recent.length}</summary>
            <div className="mt-1">{recent.map(card)}</div>
          </details>
        )}
        {busy && <div className="py-10 text-center text-sm text-white/50">찾는 중…</div>}
        {!busy && err && <div className="py-10 text-center text-sm text-white/50">{err}</div>}
        {!busy && items?.map(card)}
      </div>
      <div className="border-t border-white/10 px-4 py-2 text-[11px] leading-relaxed text-white/40">
        일부 영상(특히 뮤직비디오)은 주인이 다른 사이트 재생을 막아 둬서 안 나올 수 있어요.
      </div>
    </div>
  );
}

/** TV 가 켜져 있을 때 위쪽에 뜨는 작은 리모컨 */
export function TvRemote({
  video,
  playing,
  error,
  frameRef,
  onSearch,
  onOff,
}: {
  video: TvVideo;
  playing: boolean;
  error: number | null;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  onSearch: () => void;
  onOff: () => void;
}) {
  const [vol, setVol] = useState(70);
  useEffect(() => {
    tvCommand(frameRef.current, 'setVolume', [vol]);
  }, [vol, frameRef, video.id]);
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-30 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-zinc-950/85 py-1.5 pl-3 pr-1.5 text-xs text-white shadow-xl">
      <span className={playing ? 'animate-pulse text-rose-400' : 'text-white/50'}>●</span>
      <span className="max-w-[260px] truncate font-bold">{error ? '재생할 수 없는 영상이에요 (다른 사이트 재생 막힘)' : video.title}</span>
      <button
        onClick={() => tvSetPaused(tvState.pausedAt === null)}
        className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20"
        title={tvState.pausedAt === null ? '일시정지' : '재생'}
      >
        {tvState.pausedAt === null ? '⏸' : '▶'}
      </button>
      <span>🔊</span>
      <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="w-20 accent-rose-500" />
      <button onClick={onSearch} className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20">
        🔍 다른 영상
      </button>
      <button onClick={onOff} className="rounded-full bg-rose-600 px-2.5 py-1 font-bold hover:bg-rose-500">
        끄기
      </button>
    </div>
  );
}

