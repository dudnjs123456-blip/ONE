'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import type { Poi } from '@/game/city/cityMap';
import { SHOPS } from '@/game/data/shops';

// 도시 범위 (미니맵과 같은 영역)
const X0 = -115;
const X1 = 115;
const Z0 = -85;
const Z1 = 80;
const W = 920;
const H = Math.round((W * (Z1 - Z0)) / (X1 - X0));
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H;

const ICON: Record<Poi['kind'], string> = { home: '🏠', shop: '🏪', subway: '🚇', bus: '🚌', park: '🌳', job: '💼', casino: '🎰' };

function iconOf(p: Poi) {
  if (p.kind === 'shop' && SHOPS[p.label]) return SHOPS[p.label].menu[0]?.icon ?? '🍽️';
  return ICON[p.kind];
}

function groupOf(p: Poi) {
  if (p.kind === 'home') return '내 집';
  if (p.kind === 'shop') return SHOPS[p.label] ? '음식점' : '가게';
  if (p.kind === 'park') return '공원';
  if (p.kind === 'job') return '일자리';
  if (p.kind === 'casino') return '오락';
  return '교통';
}
const GROUPS = ['내 집', '일자리', '오락', '음식점', '가게', '공원', '교통'];

/**
 * M 키 전체 지도: 장소(아이콘·목록)나 빈 길을 누르면 그곳까지 자동으로 걸어간다.
 */
export default function CityMapOverlay({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const m = world.map;

  const grouped = useMemo(() => {
    const out: Record<string, Poi[]> = {};
    for (const p of m.pois) (out[groupOf(p)] ??= []).push(p);
    return out;
  }, [m]);
  // 같은 이름 가게(체인점)는 1호점·2호점으로 구분
  const names = useMemo(() => {
    const seen: Record<string, number> = {};
    const total: Record<string, number> = {};
    for (const p of m.pois) total[p.label] = (total[p.label] ?? 0) + 1;
    const out: Record<string, string> = {};
    for (const p of m.pois) {
      seen[p.label] = (seen[p.label] ?? 0) + 1;
      out[p.id] = total[p.label] > 1 ? `${p.label} ${seen[p.label]}호점` : p.label;
    }
    return out;
  }, [m]);

  // 바탕 지도 (한 번만)
  useEffect(() => {
    const g = baseRef.current!.getContext('2d')!;
    g.fillStyle = '#5d6b55';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#7fae63';
    g.fillRect(0, sz(m.parkZ[0]), W, sz(m.parkZ[1]) - sz(m.parkZ[0]));
    for (const b of m.blocks) {
      if (b.kind !== 'park') continue;
      g.fillStyle = '#76a35c';
      g.fillRect(sx(b.x0), sz(b.z0), sx(b.x1) - sx(b.x0), sz(b.z1) - sz(b.z0));
    }
    g.fillStyle = '#2f6f9f';
    g.fillRect(0, sz(m.riverZ), W, H);
    g.fillStyle = '#3a3d42';
    for (const r of m.roads) {
      if (r.axis === 'x') g.fillRect(0, sz(r.at - r.width / 2), W, (r.width / (Z1 - Z0)) * H);
      else g.fillRect(sx(r.at - r.width / 2), 0, (r.width / (X1 - X0)) * W, sz(r.to));
    }
    g.fillRect(sx(m.bridgeX - 4), sz(m.riverZ), (8 / (X1 - X0)) * W, H);
    for (const t of m.trails) {
      g.fillStyle = '#86b866';
      g.fillRect(sx(t.x0), sz(t.z0), sx(t.x1) - sx(t.x0), sz(t.z1) - sz(t.z0));
      g.strokeStyle = '#c0624a';
      g.lineWidth = 4;
      g.beginPath();
      t.path.forEach((pt, i) => (i ? g.lineTo(sx(pt.x), sz(pt.z)) : g.moveTo(sx(pt.x), sz(pt.z))));
      g.closePath();
      g.stroke();
      g.fillStyle = '#4f9ccf';
      g.beginPath();
      g.arc(sx(t.pond.x), sz(t.pond.z), (t.pond.r / (X1 - X0)) * W, 0, Math.PI * 2);
      g.fill();
    }
    for (const b of m.buildings) {
      g.fillStyle = b.kind === 'home' ? '#ffb84d' : b.kind === 'shop' ? '#d0b48c' : '#c8c8c8';
      g.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), (b.w / (X1 - X0)) * W, (b.d / (Z1 - Z0)) * H);
    }
    // 도로 이름
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'center';
    const named = new Set<string>();
    for (const r of m.roads) {
      if (named.has(r.name)) continue;
      named.add(r.name);
      if (r.axis === 'x') g.fillText(r.name, W * 0.08, sz(r.at) + 4);
      else {
        g.save();
        g.translate(sx(r.at) + 4, H * 0.08);
        g.rotate(Math.PI / 2);
        g.fillText(r.name, 0, 0);
        g.restore();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = 'bold 16px sans-serif';
    g.fillText('한 강', W / 2, sz(m.riverZ) + 28);
  }, [m]);

  // 나·경로·경찰 (매 프레임)
  useEffect(() => {
    const g = liveRef.current!.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      g.clearRect(0, 0, W, H);
      const ap = world.autopilot;
      const p = world.player;
      if (ap) {
        g.strokeStyle = '#ffe066';
        g.lineWidth = 3;
        g.setLineDash([8, 6]);
        g.beginPath();
        g.moveTo(sx(p.x), sz(p.z));
        for (let i = ap.i; i < ap.path.length; i++) g.lineTo(sx(ap.path[i].x), sz(ap.path[i].z));
        g.stroke();
        g.setLineDash([]);
        const end = ap.path[ap.path.length - 1];
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(sx(end.x), sz(end.z), 6, 0, Math.PI * 2);
        g.fill();
      }
      if (world.location === 'city') {
        g.fillStyle = '#ff4d4d';
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(sx(p.x), sz(p.z), 7, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(sx(p.x), sz(p.z));
        g.lineTo(sx(p.x + p.fx * 5), sz(p.z + p.fz * 5));
        g.stroke();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const go = (x: number, z: number, label: string) => {
    const err = world.navigateTo(x, z, label);
    if (err) setMsg(err);
    else onClose();
  };

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0);
    const z = Z0 + ((e.clientY - r.top) / r.height) * (Z1 - Z0);
    go(x, z, '선택한 곳');
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-full max-w-full gap-3 rounded-xl border border-white/20 bg-zinc-900/95 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-col">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="text-lg font-bold">🗺️ 서울 · 한강공원동</div>
            <div className="text-xs text-white/60">장소나 길을 누르면 자동으로 이동 · M / Esc 닫기</div>
          </div>
          <div
            className="relative cursor-crosshair overflow-hidden rounded-lg"
            style={{ width: `min(${W}px, 70vw)`, aspectRatio: `${W} / ${H}` }}
            onClick={onMapClick}
          >
            <canvas ref={baseRef} width={W} height={H} className="absolute inset-0 h-full w-full" />
            <canvas ref={liveRef} width={W} height={H} className="pointer-events-none absolute inset-0 h-full w-full" />
            {m.pois.map((p) => (
              <button
                key={p.id}
                title={names[p.id]}
                onClick={(e) => {
                  e.stopPropagation();
                  go(p.x, p.z, names[p.id]);
                }}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-sm leading-none shadow transition-transform hover:scale-125 ${
                  hover === p.id ? 'z-10 border-amber-300 bg-amber-200' : 'border-white/60 bg-white/85'
                } px-1 py-0.5`}
                style={{ left: `${(sx(p.x) / W) * 100}%`, top: `${(sz(p.z) / H) * 100}%` }}
              >
                {iconOf(p)}
                {(hover === p.id || p.kind === 'home') && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {names[p.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {msg && <div className="mt-2 text-center text-sm font-bold text-red-300">{msg}</div>}
        </div>

        {/* 장소 목록 */}
        <div className="flex w-52 flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: `min(${H + 40}px, 80vh)` }}>
          {GROUPS.filter((gname) => grouped[gname]?.length).map((gname) => (
            <div key={gname}>
              <div className="mb-1 text-xs font-bold text-amber-300">{gname}</div>
              {grouped[gname].map((p) => (
                <button
                  key={p.id}
                  onClick={() => go(p.x, p.z, names[p.id])}
                  onMouseEnter={() => setHover(p.id)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                    hover === p.id ? 'bg-amber-300/25' : 'hover:bg-white/10'
                  }`}
                >
                  <span>{iconOf(p)}</span>
                  <span className="truncate">{names[p.id]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
