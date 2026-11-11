import { PARK, PARK_NODES, PARK_PATHS, RIDES, RIDE_IDS, type RideId } from '@/game/city/themePark';

/** 놀이공원 지도 범위 (공원 울타리 + 여유) */
export const PARK_VIEW = { x0: PARK.bounds.x0 - 4, x1: PARK.bounds.x1 + 4, z0: PARK.bounds.z0 - 4, z1: PARK.bounds.z1 + 6 };

/** 놀이기구 지도 색 (3D 입구 아치와 같은 색) */
export const RIDE_MAP_COLOR: Record<RideId, string> = {
  coaster: '#d6332f',
  drop: '#2f6fd8',
  viking: '#8a5a2b',
  wheel: '#e08a1c',
  gyro: '#7b2fd8',
  sky: '#14a37f',
};

/** 놀이기구가 지도에서 차지하는 자리 (아이콘을 놓을 곳) */
export const RIDE_MAP_SPOT: Record<RideId, { x: number; z: number }> = {
  coaster: { x: -55, z: -25 },
  drop: { x: 22, z: -40 },
  viking: { x: 50, z: -8 },
  wheel: { x: 46, z: -64 },
  gyro: { x: -17, z: -30 },
  sky: { x: -17, z: -70 },
};

export function parkProjector(W: number, H: number) {
  const v = PARK_VIEW;
  const k = Math.min(W / (v.x1 - v.x0), H / (v.z1 - v.z0));
  const ox = (W - (v.x1 - v.x0) * k) / 2;
  const oz = (H - (v.z1 - v.z0) * k) / 2;
  return {
    k,
    sx: (x: number) => ox + (x - v.x0) * k,
    sz: (z: number) => oz + (z - v.z0) * k,
    wx: (px: number) => v.x0 + (px - ox) / k,
    wz: (pz: number) => v.z0 + (pz - oz) / k,
  };
}

/** 바탕: 잔디 · 울타리 · 길 · 광장 · 놀이기구 (글자 크기는 지도 크기에 맞춘다) */
export function drawParkBase(g: CanvasRenderingContext2D, W: number, H: number, labels: boolean) {
  const P = parkProjector(W, H);
  const b = PARK.bounds;
  g.fillStyle = '#3f5a37';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#6fa356';
  g.fillRect(P.sx(b.x0), P.sz(b.z0), (b.x1 - b.x0) * P.k, (b.z1 - b.z0) * P.k);
  g.strokeStyle = '#2d3a2e';
  g.lineWidth = Math.max(1, P.k * 0.6);
  g.strokeRect(P.sx(b.x0), P.sz(b.z0), (b.x1 - b.x0) * P.k, (b.z1 - b.z0) * P.k);
  // 길: 대로(붉은 벽돌) 아래에 테두리, 그 위 길
  g.lineCap = 'round';
  for (const pass of [0, 1])
    for (const [a, c, w, main] of PARK_PATHS) {
      const A = PARK_NODES[a];
      const B = PARK_NODES[c];
      g.strokeStyle = pass ? (main ? '#c4654a' : '#ead7ae') : 'rgba(0,0,0,0.35)';
      g.lineWidth = Math.max(pass ? 2 : 3, (w + (pass ? 0 : 1.2)) * P.k);
      g.beginPath();
      g.moveTo(P.sx(A.x), P.sz(A.z));
      g.lineTo(P.sx(B.x), P.sz(B.z));
      g.stroke();
    }
  // 광장 · 분수
  g.fillStyle = '#e3cfa4';
  g.beginPath();
  g.arc(P.sx(0), P.sz(22), 13 * P.k, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3b8fd1';
  g.beginPath();
  g.arc(P.sx(0), P.sz(22), 4 * P.k, 0, Math.PI * 2);
  g.fill();
  // 입구 · 역
  const fs = Math.max(9, P.k * 3.2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${fs}px sans-serif`;
  g.fillText('🚇', P.sx(PARK.station.x), P.sz(PARK.station.z));
  g.fillText('🎠', P.sx(18), P.sz(22));
  if (labels) {
    g.fillStyle = '#fff';
    g.font = `bold ${Math.round(fs * 0.7)}px sans-serif`;
    g.fillText('정문', P.sx(0), P.sz(PARK.bounds.z1) + fs * 0.6);
  }
  // 놀이기구: 색 원 + 아이콘 (+ 이름)
  for (const id of RIDE_IDS) {
    const s = RIDE_MAP_SPOT[id];
    const r = Math.max(7, P.k * (id === 'coaster' ? 7 : 5));
    g.fillStyle = RIDE_MAP_COLOR[id];
    g.strokeStyle = '#fff';
    g.lineWidth = Math.max(1.5, P.k * 0.5);
    g.beginPath();
    g.arc(P.sx(s.x), P.sz(s.z), r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.font = `${Math.round(r * 1.1)}px sans-serif`;
    g.fillText(RIDES[id].icon, P.sx(s.x), P.sz(s.z) + 1);
    if (labels) {
      const name = RIDES[id].name.split(' (')[0];
      g.font = `bold ${Math.round(fs * 0.75)}px sans-serif`;
      const tw = g.measureText(name).width + 10;
      const ty = P.sz(s.z) + r + fs * 0.7;
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillRect(P.sx(s.x) - tw / 2, ty - fs * 0.5, tw, fs);
      g.fillStyle = '#fff';
      g.fillText(name, P.sx(s.x), ty);
    }
  }
}

/** 내 위치(빨간 점 + 바라보는 쪽)와 가는 길(점선) */
export function drawParkPlayer(g: CanvasRenderingContext2D, W: number, H: number, p: { x: number; z: number; fx: number; fz: number }, route: { x: number; z: number }[] | null, from = 0) {
  const P = parkProjector(W, H);
  if (route && route.length > from) {
    g.strokeStyle = '#ffe14a';
    g.lineWidth = Math.max(2, P.k * 0.9);
    g.setLineDash([Math.max(3, P.k * 2), Math.max(3, P.k * 1.5)]);
    g.beginPath();
    g.moveTo(P.sx(p.x), P.sz(p.z));
    for (let i = from; i < route.length; i++) g.lineTo(P.sx(route[i].x), P.sz(route[i].z));
    g.stroke();
    g.setLineDash([]);
  }
  const r = Math.max(3.5, P.k * 1.6);
  g.fillStyle = '#ff4d4d';
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(P.sx(p.x), P.sz(p.z), r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(P.sx(p.x), P.sz(p.z));
  g.lineTo(P.sx(p.x + p.fx * 7), P.sz(p.z + p.fz * 7));
  g.stroke();
}
