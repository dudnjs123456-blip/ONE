'use client';

import { useEffect, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { RIDES } from '@/game/city/themePark';
import { RIDE_MAP_COLOR } from './parkMapDraw';

/**
 * 놀이공원 안내판 (오른쪽, 미니맵 아래): 놀이기구마다 지금 상태(탑승 중 · 운행 중)와 기다릴 시간, 거리.
 * '가기' 를 누르면 길을 따라 그 입구까지 자동으로 걸어간다. 안내 중이면 맨 위에 목적지와 남은 거리.
 */
export default function ParkGuide({ world, onMap, touch = false }: { world: CityWorld; onMap: () => void; touch?: boolean }) {
  const [, tick] = useState(0);
  // 폰 · 태블릿은 화면이 좁아서 접은 채로 시작한다
  const [open, setOpen] = useState(!touch);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 400);
    return () => window.clearInterval(t);
  }, []);
  if (world.location !== 'park' || world.ride) return null;
  const guide = world.parkGuide();
  const target = world.autopilot && world.parkTarget ? world.parkTarget : null;
  const left = (() => {
    const ap = world.autopilot;
    if (!ap) return 0;
    let d = 0;
    let px = world.player.x;
    let pz = world.player.z;
    for (let i = ap.i; i < ap.path.length; i++) {
      d += Math.hypot(ap.path[i].x - px, ap.path[i].z - pz);
      px = ap.path[i].x;
      pz = ap.path[i].z;
    }
    return Math.round(d);
  })();
  return (
    <div className="pointer-events-auto absolute right-4 top-[200px] z-20 w-64 overflow-hidden rounded-xl border border-amber-300/40 bg-[#1b1426]/85 text-white shadow-xl backdrop-blur-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 bg-gradient-to-r from-rose-600/80 to-amber-500/80 px-3 py-1.5 text-left">
        <span className="text-sm font-black">🎡 한강랜드 가이드</span>
        <span className="ml-auto text-xs">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {target && (
        <div className="flex items-center gap-2 border-b border-white/10 bg-amber-400/20 px-3 py-1.5 text-xs">
          <span className="font-bold text-amber-200">🧭 {target === 'station' ? '🚇 한강공원역' : `${RIDES[target].icon} ${RIDES[target].name.split(' (')[0]}`}(으)로 가는 중 · {left}m</span>
          <button onClick={() => (world.autopilot = null)} className="ml-auto rounded bg-white/15 px-1.5 hover:bg-white/25">
            취소
          </button>
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-1 p-2">
          {guide.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-1.5 py-1" style={{ borderLeft: `4px solid ${RIDE_MAP_COLOR[r.id]}` }}>
              <span className="text-lg">{r.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{r.name.split(' (')[0]}</span>
                <span className={`block truncate text-[10px] ${r.state === 'board' ? 'text-emerald-300' : r.state === 'run' ? 'text-amber-300' : 'text-sky-300'}`}>
                  {r.state === 'board' ? '● ' : ''}
                  {r.text} · {r.dist}m
                </span>
              </span>
              <button
                onClick={() => world.parkNavigate(r.id)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${target === r.id ? 'bg-amber-400 text-black' : 'bg-white/15 hover:bg-white/25'}`}
              >
                {target === r.id ? '가는 중' : '가기'}
              </button>
            </div>
          ))}
          <div className="mt-0.5 flex gap-1">
            <button onClick={onMap} className="flex-1 rounded-lg bg-amber-500/90 py-1 text-xs font-bold text-black hover:bg-amber-400">
              🗺️ 지도 (M)
            </button>
            <button onClick={() => world.parkNavigate('station')} className="flex-1 rounded-lg bg-white/15 py-1 text-xs hover:bg-white/25">
              🚇 역으로
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
