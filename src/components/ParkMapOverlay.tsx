'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { RIDES, RIDE_IDS, type RideId } from '@/game/city/themePark';
import { RIDE_MAP_COLOR, RIDE_MAP_SPOT, drawParkBase, drawParkPlayer, parkProjector } from './parkMapDraw';

const W = 760;
const H = 640;

/**
 * 놀이공원 전체 지도 (M): 놀이기구를 누르면(지도 위 아이콘이나 오른쪽 목록) 길을 따라 그 입구까지 자동으로 걸어간다.
 * 목록엔 지금 운행 상태와 기다릴 시간이 보인다.
 */
export default function ParkMapOverlay({ world, onClose }: { world: CityWorld; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hover, setHover] = useState<RideId | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    drawParkBase(base.getContext('2d')!, W, H, true);
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      g.drawImage(base, 0, 0);
      const ap = world.autopilot;
      drawParkPlayer(g, W, H, world.player, ap && world.location === 'park' ? ap.path : null, ap?.i ?? 0);
      if (t - last > 500) {
        last = t;
        tick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const go = (id: RideId | 'station') => {
    const m = world.parkNavigate(id);
    if (m) setMsg(m);
    else onClose();
  };

  /** 지도에서 누른 곳에 가장 가까운 놀이기구 */
  const pickAt = (e: React.MouseEvent<HTMLCanvasElement>): RideId | null => {
    const rc = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rc.left) / rc.width) * W;
    const pz = ((e.clientY - rc.top) / rc.height) * H;
    const P = parkProjector(W, H);
    let best: RideId | null = null;
    let bd = Infinity;
    for (const id of RIDE_IDS) {
      const s = RIDE_MAP_SPOT[id];
      const d = Math.hypot(P.sx(s.x) - px, P.sz(s.z) - pz);
      if (d < bd) [best, bd] = [id, d];
    }
    return bd < Math.max(28, P.k * 9) ? best : null;
  };

  const guide = world.parkGuide();
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-5xl flex-col gap-3 overflow-auto rounded-2xl border border-amber-300/40 bg-[#1b1426]/95 p-3 text-white shadow-2xl md:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-lg font-black text-amber-300">🎡 한강랜드 지도</div>
            <div className="text-xs text-white/60">놀이기구를 누르면 길을 따라 걸어가요</div>
            <button onClick={onClose} className="ml-auto rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">
              닫기 (M)
            </button>
          </div>
          <canvas
            ref={ref}
            width={W}
            height={H}
            className={`w-full rounded-lg ${hover ? 'cursor-pointer' : 'cursor-default'}`}
            onMouseMove={(e) => setHover(pickAt(e))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const id = pickAt(e);
              if (id) go(id);
            }}
          />
          {hover && <div className="mt-1 text-center text-sm font-bold text-amber-200">{RIDES[hover].icon} {RIDES[hover].name} — 눌러서 가기</div>}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-1.5 md:w-72">
          <div className="text-sm font-bold text-white/80">놀이기구 · 지금 운행 상태</div>
          {guide.map((r) => (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left hover:bg-white/15"
              style={{ borderLeft: `5px solid ${RIDE_MAP_COLOR[r.id]}` }}
            >
              <span className="text-2xl">{r.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.name.split(' (')[0]}</span>
                <span className={`block text-[11px] ${r.state === 'board' ? 'text-emerald-300' : r.state === 'run' ? 'text-amber-300' : 'text-sky-300'}`}>{r.text}</span>
              </span>
              <span className="text-[11px] text-white/50">{r.dist}m</span>
            </button>
          ))}
          <button onClick={() => go('station')} className="mt-1 rounded-lg bg-white/10 px-2 py-1.5 text-sm hover:bg-white/20">
            🚇 한강공원역으로 (동네로 돌아가기)
          </button>
          {msg && <div className="rounded bg-black/50 px-2 py-1 text-center text-xs text-amber-200">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
