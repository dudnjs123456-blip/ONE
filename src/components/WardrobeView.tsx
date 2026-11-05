'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { CLOTHES_SHOP_NAME, COSMETIC_BY_ID, isNewToday, shopCosmetics, COSMETIC_SLOTS, ensureWardrobe, takeOffCosmetic, wearCosmetic, type CosmeticDef, type CosmeticSlot } from '@/game/data/fashion';
import { saveProfile } from '@/game/core/profile';
import { BODY_TYPES } from '@/game/render/looks';
import { preloadVrm } from '@/game/render/vrmCharacter';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function chip(c: CosmeticDef) {
  const a = hex(c.color);
  const b = hex(c.color2 ?? c.color);
  return c.pattern === 'stripe'
    ? `repeating-linear-gradient(0deg, ${a} 0 5px, ${b} 5px 8px)`
    : c.pattern === 'check'
      ? `repeating-linear-gradient(90deg, ${b}88 0 4px, transparent 4px 8px), repeating-linear-gradient(0deg, ${b}88 0 4px, ${a} 4px 8px)`
      : c.pattern === 'dot'
        ? `radial-gradient(${b} 1.5px, ${a} 2px) 0 0 / 7px 7px`
        : a;
}

/** 카메라 위치 (보는 높이·거리) */
const VIEWS = {
  full: { label: '전신', y: 0.85, dist: 3.0 },
  upper: { label: '상체', y: 1.2, dist: 1.6 },
  face: { label: '얼굴', y: 1.45, dist: 0.85 },
} as const;
type ViewKey = keyof typeof VIEWS;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Worn = Partial<Record<CosmeticSlot, string>>;

/** 오른쪽 옷장 창 너비 (넓은 화면) */
const PANEL_W = 440;

/**
 * 코디 창 (O · 옷가게 탈의실): 게임 속 내 캐릭터를 카메라로 빙 둘러보면서 옷을 입고 벗는다.
 * 따로 그리지 않고 게임 화면 그대로라서 보이는 모습이 똑같다.
 * 옷 위에 마우스를 올리면 미리 입어 보고, 누르면 입는다 (바로 저장).
 * 가게 모드(shop): 아직 안 산 옷도 입어 보고 (저장 안 함), 마음에 들면 그 자리에서 산다.
 */
export default function WardrobeView({
  world,
  onClose,
  shop = false,
  startSlot = null,
  startTry = [],
}: {
  world: CityWorld;
  onClose: () => void;
  shop?: boolean;
  startSlot?: CosmeticSlot | null;
  startTry?: string[];
}) {
  const pr = world.profile;
  const wd = ensureWardrobe(pr);
  const [, redraw] = useState(0);
  const [filter, setFilter] = useState<CosmeticSlot | null>(startSlot);
  const [hover, setHover] = useState<CosmeticDef | null>(null);
  const [source, setSource] = useState<'shop' | 'closet'>(shop ? 'shop' : 'closet');
  // 입어보는 중인 (안 산) 옷: 칸마다 하나
  const [trying, setTrying] = useState<Worn>(() => {
    // 가게에서는 이미 입어보던 옷(게임에 남아 있는 것)부터 이어서
    const t: Worn = shop ? { ...world.trial } : {};
    for (const id of startTry) {
      const c = COSMETIC_BY_ID[id];
      if (c && !wd.owned.includes(id)) t[c.slot] = id;
    }
    return t;
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 입어본 옷은 창을 닫아도 입은 채로 (가게 안을 돌아다닐 수 있다. 계산 전엔 문밖으로 못 나간다)
  useEffect(() => {
    if (shop) world.trial = { ...trying };
  }, [shop, trying, world]);
  // 마우스를 올린 옷: 게임 속 캐릭터에 잠깐 입혀 본다
  useEffect(() => {
    world.peek = hover?.id ?? null;
  }, [hover, world]);
  const [view, setView] = useState<ViewKey>('full');
  const [spin, setSpin] = useState(false);
  const opened = useRef({ ...wd.worn });
  const padRef = useRef<HTMLDivElement>(null);
  const want = useRef({ yaw: 0.35, pitch: 0.08, dist: VIEWS.full.dist as number, y: VIEWS.full.y as number });

  const changed = () => {
    saveProfile(pr);
    redraw((n) => n + 1);
  };

  const look: Worn = { ...wd.worn, ...trying };

  // 카메라: 게임 화면의 카메라를 캐릭터 둘레로. 끌어서 돌리고 휠로 줌
  useEffect(() => {
    const pad = padRef.current!;
    const w = want.current;
    const shift = () => (window.innerWidth >= 1024 ? PANEL_W / 2 / window.innerWidth : 0);
    const push = () => (world.mirror = { ...w, shift: shift() });
    push();
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      pad.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      w.yaw -= (e.clientX - drag.x) * 0.01;
      w.pitch = clamp(w.pitch + (e.clientY - drag.y) * 0.006, -0.35, 0.9);
      drag = { x: e.clientX, y: e.clientY };
      push();
    };
    const up = () => (drag = null);
    // 휠: 줌 (도시 화면 줌으로 넘어가지 않게 막는다)
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      w.dist = clamp(w.dist * Math.exp(e.deltaY * 0.0012), 0.6, 4.5);
      // 가까이 갈수록 얼굴 쪽을 본다
      const t = (4.5 - w.dist) / 3.9;
      w.y = 0.85 + (1.45 - 0.85) * t * t;
      push();
    };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', push);
    return () => {
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      pad.removeEventListener('pointerup', up);
      pad.removeEventListener('pointercancel', up);
      pad.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', push);
      world.mirror = null;
      world.peek = null;
    };
  }, [world]);

  // 자동 회전
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      want.current.yaw += Math.min(0.05, (now - last) / 1000) * 0.6;
      last = now;
      if (world.mirror) world.mirror.yaw = want.current.yaw;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, world]);

  const setCam = (v: ViewKey) => {
    setView(v);
    want.current.dist = VIEWS[v].dist;
    want.current.y = VIEWS[v].y;
    if (world.mirror) Object.assign(world.mirror, { dist: want.current.dist, y: want.current.y });
  };
  const front = () => {
    const w = want.current;
    w.yaw = Math.round(w.yaw / (Math.PI * 2)) * Math.PI * 2;
    w.pitch = 0.08;
    if (world.mirror) Object.assign(world.mirror, { yaw: w.yaw, pitch: w.pitch });
  };

  const owned = new Set(wd.owned);
  // 가게 옷 = 오늘·최근 신상 + 기본 옷, 옷장 = 가진 옷 (지난 신상 포함)
  const stock = shopCosmetics();
  const pool = source === 'shop' ? stock : wd.owned.map((id) => COSMETIC_BY_ID[id]).filter((c): c is CosmeticDef => !!c);
  const list = pool.filter((c) => !filter || c.slot === filter);
  const countOf = (s: CosmeticSlot) => pool.filter((c) => c.slot === s).length;
  const tried = Object.values(trying)
    .map((id) => COSMETIC_BY_ID[id!])
    .filter((c): c is CosmeticDef => !!c && !owned.has(c.id));
  const triedTotal = tried.reduce((s, c) => s + c.price, 0);
  const dirty = Object.keys(trying).length > 0 || COSMETIC_SLOTS.some((s) => (opened.current[s.id] ?? '') !== (wd.worn[s.id] ?? ''));

  const untry = (slot: CosmeticSlot) =>
    setTrying((t) => {
      const n = { ...t };
      delete n[slot];
      return n;
    });

  const click = (c: CosmeticDef) => {
    setHover(null);
    if (owned.has(c.id)) {
      // 가진 옷: 입기 / 벗기 (바로 저장)
      untry(c.slot);
      if (wd.worn[c.slot] === c.id) takeOffCosmetic(pr, c.slot);
      else wearCosmetic(pr, c.id);
      changed();
    } else if (trying[c.slot] === c.id) untry(c.slot);
    else setTrying((t) => ({ ...t, [c.slot]: c.id }));
  };

  /** 사기: 산 옷은 바로 입는다 */
  const buy = (c: CosmeticDef) => {
    const r = world.buyCosmetic(c.id);
    if (r.ok) {
      wearCosmetic(pr, c.id);
      untry(c.slot);
      saveProfile(pr);
    }
    setMsg({ ok: r.ok, text: r.ok ? `${r.message} 바로 입었어요 ✨` : r.message });
    redraw((n) => n + 1);
  };

  const buyAll = () => {
    if (pr.gold < triedTotal) {
      setMsg({ ok: false, text: `${(triedTotal - pr.gold).toLocaleString()}G 가 모자라요` });
      return;
    }
    for (const c of tried) {
      if (world.buyCosmetic(c.id).ok) wearCosmetic(pr, c.id);
    }
    saveProfile(pr);
    setTrying({});
    setMsg({ ok: true, text: `${tried.length}벌 샀어요! 입은 그대로 나가요 ✨` });
    redraw((n) => n + 1);
  };

  const status = (c: CosmeticDef) => {
    if (owned.has(c.id)) return wd.worn[c.slot] === c.id ? { cls: 'text-pink-300', text: '✓ 입는 중 · 누르면 벗기' } : { cls: 'text-white/50', text: '보유 · 누르면 입기' };
    if (trying[c.slot] === c.id) return { cls: 'text-amber-300', text: '👀 입어보는 중 · 누르면 벗기' };
    return { cls: 'text-white/50', text: '누르면 입어보기' };
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col text-white lg:flex-row" onWheel={(e) => e.stopPropagation()}>
      {/* 왼쪽: 게임 화면 속 내 캐릭터 (끌어서 돌리기) */}
      <div className="relative min-h-[45vh] flex-1">
        <div ref={padRef} className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="pointer-events-none absolute left-5 top-4">
          <div className="text-2xl font-black tracking-tight">{shop ? '🪞 입어보기' : '👗 코디'}</div>
          <div className="text-xs text-white/60">끌어서 돌려 보기 · 휠로 확대</div>
        </div>
        {(hover || tried.length > 0) && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-pink-400/90 px-3 py-1 text-xs font-bold text-black shadow">
            {hover ? `미리 보기: ${hover.name}` : `입어보는 중 ${tried.length}벌 · 아직 안 샀어요`}
          </div>
        )}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
          {(Object.keys(VIEWS) as ViewKey[]).map((v) => (
            <button key={v} onClick={() => setCam(v)} className={`rounded-full px-3 py-1 text-xs font-bold ${view === v ? 'bg-pink-300 text-black' : 'text-white/80 hover:bg-white/10'}`}>
              {VIEWS[v].label}
            </button>
          ))}
          <span className="mx-1 w-px bg-white/20" />
          <button onClick={front} className="rounded-full px-3 py-1 text-xs font-bold text-white/80 hover:bg-white/10">
            정면
          </button>
          <button onClick={() => setSpin((s) => !s)} className={`rounded-full px-3 py-1 text-xs font-bold ${spin ? 'bg-pink-300 text-black' : 'text-white/80 hover:bg-white/10'}`}>
            🔄 회전
          </button>
        </div>
      </div>

      {/* 오른쪽: 입은 옷 + 옷 목록 */}
      <div className="flex max-h-[55vh] w-full flex-col border-t border-white/10 bg-zinc-950/85 p-4 backdrop-blur lg:max-h-none lg:w-[440px] lg:border-l lg:border-t-0">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold">
            {shop ? `✨ ${CLOTHES_SHOP_NAME}` : '🚪 내 옷장'} <span className="text-sm font-normal text-white/50">({wd.owned.length}벌 보유)</span>
          </div>
          <div className="flex items-center gap-2">
            {shop && <span className="text-sm font-bold text-amber-300">{pr.gold.toLocaleString()} G</span>}
            <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
              닫기 (Esc)
            </button>
          </div>
        </div>

        {shop && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm font-bold">
            {(
              [
                ['shop', `🛍️ 가게 옷 ${stock.length}`],
                ['closet', `🚪 내 옷장 ${wd.owned.length}`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setSource(id)} className={`rounded-md py-1.5 ${source === id ? 'bg-pink-400 text-black' : 'text-white/60 hover:bg-white/10'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="mb-1 text-xs text-white/50">캐릭터</div>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 text-sm font-bold">
          {BODY_TYPES.map((b) => {
            const on = (pr.body ?? BODY_TYPES[0].id) === b.id;
            return (
              <button
                key={b.id}
                onMouseEnter={() => preloadVrm(b.url)}
                onClick={() => {
                  if (on) return;
                  pr.body = b.id;
                  changed();
                }}
                className={`rounded-md py-1.5 ${on ? 'bg-pink-400 text-black' : 'text-white/60 hover:bg-white/10'}`}
              >
                {b.icon} {b.label}
              </button>
            );
          })}
        </div>

        <div className="mb-1 text-xs text-white/50">지금 입은 옷</div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {COSMETIC_SLOTS.map((s) => {
            const id = look[s.id];
            const c = id ? COSMETIC_BY_ID[id] : undefined;
            const isTry = !!trying[s.id] && !owned.has(trying[s.id]!);
            return (
              <button
                key={s.id}
                onClick={() => setFilter(filter === s.id ? null : s.id)}
                className={`flex items-center gap-1.5 rounded-lg border bg-white/5 p-1.5 text-left ${filter === s.id ? 'ring-2 ring-pink-300' : ''} ${isTry ? 'border-amber-300/70' : c ? 'border-pink-300/50' : 'border-dashed border-white/15'}`}
              >
                {c ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/20 text-sm" style={{ background: chip(c) }}>
                    {c.icon}
                  </span>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-sm opacity-30">{s.icon}</span>
                )}
                <span className="min-w-0">
                  <span className="block text-[9px] text-white/50">
                    {s.label}
                    {isTry && <span className="text-amber-300"> · 입어보기</span>}
                  </span>
                  <span className="block truncate text-[11px] font-bold">{c ? c.name : '기본'}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          <button onClick={() => setFilter(null)} className={`rounded-full px-2.5 py-1 text-xs ${!filter ? 'bg-pink-300 font-bold text-black' : 'bg-white/10 hover:bg-white/20'}`}>
            전체
          </button>
          {COSMETIC_SLOTS.map((s) => (
            <button key={s.id} onClick={() => setFilter(s.id)} className={`rounded-full px-2.5 py-1 text-xs ${filter === s.id ? 'bg-pink-300 font-bold text-black' : 'bg-white/10 hover:bg-white/20'}`}>
              {s.icon} {s.label} {countOf(s.id)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
              {wd.owned.length === 0 ? '옷장이 비었어요' : '이 종류 옷이 없어요'}
              <div className="mt-1 text-xs">상가 1층 옷가게 &lsquo;{CLOTHES_SHOP_NAME}&rsquo;(펫샵 옆)에서 입어 보고 사 오세요 ✨</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {list.map((c) => {
                const mine = owned.has(c.id);
                const on = look[c.slot] === c.id;
                const st = status(c);
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => click(c)}
                    onMouseEnter={() => setHover(on ? null : c)}
                    onMouseLeave={() => setHover((h) => (h === c ? null : h))}
                    className={`flex cursor-pointer flex-col rounded-xl border bg-white/5 p-2 text-left transition hover:-translate-y-0.5 hover:bg-white/10 ${on ? (mine ? 'border-pink-300 ring-1 ring-pink-300/60' : 'border-amber-300 ring-1 ring-amber-300/60') : 'border-white/15'}`}
                  >
                    <span className="relative mb-1.5 flex h-14 items-center justify-center rounded-lg border border-white/15 text-2xl" style={{ background: chip(c) }}>
                      <span className="drop-shadow">{c.icon}</span>
                      {source === 'shop' && <span className={`absolute right-1 top-1 rounded px-1 text-[9px] font-bold ${mine ? 'bg-pink-300 text-black' : 'bg-black/60 text-amber-300'}`}>{mine ? '보유' : `${c.price}G`}</span>}
                    </span>
                    <span className="truncate text-xs font-bold">{isNewToday(c.id) && <span className="mr-1 rounded bg-rose-500 px-1 text-[9px] text-white">NEW</span>}{c.name}</span>
                    <span className={`text-[10px] ${st.cls}`}>{st.text}</span>
                    {!mine && (
                      <button
                        disabled={pr.gold < c.price}
                        onClick={(e) => {
                          e.stopPropagation();
                          buy(c);
                        }}
                        className="mt-1.5 rounded-md bg-amber-500 py-1 text-[11px] font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                      >
                        {c.price.toLocaleString()}G 사기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {msg && <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>{msg.text}</div>}

        {tried.length > 0 && (
          <button onClick={buyAll} className="mt-2 rounded-lg bg-amber-500 py-2 text-sm font-bold text-black hover:bg-amber-400">
            입어본 옷 {tried.length}벌 모두 사기 · {triedTotal.toLocaleString()}G
          </button>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              for (const s of COSMETIC_SLOTS) takeOffCosmetic(pr, s.id);
              setTrying({});
              changed();
            }}
            className="flex-1 rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20"
          >
            모두 벗기
          </button>
          <button
            disabled={!dirty}
            onClick={() => {
              wd.worn = { ...opened.current };
              setTrying({});
              changed();
            }}
            className="flex-1 rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20 disabled:opacity-40"
          >
            되돌리기
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg bg-pink-400 py-2 text-sm font-bold text-black hover:bg-pink-300">
            {shop && tried.length ? '👀 입고 둘러보기' : '완료'}
          </button>
        </div>
        <div className="mt-2 text-center text-[11px] text-white/40">
          {shop ? tried.length
              ? '입어본 옷을 입은 채로 가게 안을 걸어 다닐 수 있어요 · 계산 안 하면 문밖으로 못 나가요'
              : '마우스를 올리면 미리 보기 · 누르면 입어보기' : '옷에 마우스를 올리면 미리 입어 봐요 · 입은 옷은 바로 저장되고 친구에게도 보여요'}
        </div>
      </div>
    </div>
  );
}
