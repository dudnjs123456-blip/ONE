import * as THREE from 'three';
import type { StoreLayout } from '../city/store';
import { BAIT_BY_ID, FISH, FISH_BY_ID, RODS, ROD_BY_ID, TIER_INFO, fmtKg, type BaitId, type FishingState } from '../data/fishing';
import { buildFish, buildRod, fishLength, type FishModel } from './fishKit';

/**
 * 낚시마트 안: 북쪽 벽 낚싯대 진열대 · 서쪽 벽 미끼 냉장고 · 가운데 루어 걸이 곤돌라 ·
 * 동쪽 큰 수조 (한강 물고기들이 헤엄친다) · 동쪽 벽 명예의 전당 (내 기록이 적힌다) · 벽 포스터.
 */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const H = 3;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 가격표 판 (이모지 + 이름 + 가격) */
function tag(icon: string, name: string, price: string, w = 0.42) {
  const tex = canvasTex(256, 150, (g) => {
    g.fillStyle = '#fffdf6';
    g.beginPath();
    g.roundRect(4, 4, 248, 142, 16);
    g.fill();
    g.strokeStyle = '#1f5f8b';
    g.lineWidth = 6;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `52px ${EMOJI}`;
    g.fillText(icon, 128, 44);
    g.fillStyle = '#1d232b';
    g.font = `800 28px ${FONT}`;
    g.fillText(name.length > 9 ? name.slice(0, 9) + '…' : name, 128, 92);
    g.fillStyle = '#c0392b';
    g.font = `900 28px ${FONT}`;
    g.fillText(price, 128, 126);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.586), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

export interface FishingInterior {
  tick(t: number, dex?: FishingState['dex']): void;
}

export function buildFishingInterior(g: THREE.Group, L: StoreLayout): FishingInterior {
  const std = (color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const rect = (id: string) => L.furniture.find((f) => f.id === id)!.rect;
  const { x0, x1, z0 } = L.room;
  const wood = std(0x7a5636, 0.75);
  const darkWood = std(0x4a3322, 0.8);

  // ── 북쪽 벽: 낚싯대 진열대 (나무 판 + 받침 + 세워 둔 대) ──
  const rr = rect('rodRack');
  box(rr.x1 - rr.x0, 2.3, 0.06, darkWood, (rr.x0 + rr.x1) / 2, 1.15, rr.z0 + 0.1);
  box(rr.x1 - rr.x0, 0.12, 0.4, wood, (rr.x0 + rr.x1) / 2, 0.06, rr.z0 + 0.25);
  box(rr.x1 - rr.x0, 0.05, 0.12, wood, (rr.x0 + rr.x1) / 2, 1.55, rr.z0 + 0.18);
  for (const d of L.displays.filter((d) => d.item.startsWith('rod:'))) {
    const r = ROD_BY_ID[d.item.slice(4)];
    if (!r) continue;
    const model = buildRod(r.color, 2.05, r.id !== 'bamboo');
    // 손잡이가 아래, 끝이 위로: 살짝 기울여 세운다
    model.group.rotation.set(-Math.PI / 2 + 0.06, 0, 0);
    model.group.position.set(d.x, 0.2, d.z + 0.02);
    g.add(model.group);
    const t = tag(r.icon, r.name, `${r.price.toLocaleString()}G`, 0.5);
    t.position.set(d.x, 0.95, rr.z1 + 0.02);
    g.add(t);
  }
  // 진열대 머리 글씨
  const head = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.32),
    new THREE.MeshBasicMaterial({
      map: canvasTex(512, 64, (c) => {
        c.fillStyle = '#1f5f8b';
        c.fillRect(0, 0, 512, 64);
        c.fillStyle = '#ffffff';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `900 38px ${FONT}`;
        c.fillText('🎣 낚싯대  RODS', 256, 34);
      }),
    }),
  );
  head.position.set((rr.x0 + rr.x1) / 2, 2.05, rr.z0 + 0.14);
  g.add(head);

  // ── 서쪽 벽: 미끼 냉장고 (유리문 · 칸마다 미끼) ──
  const fr = rect('baitFridge');
  const fcx = (fr.x0 + fr.x1) / 2;
  const fcz = (fr.z0 + fr.z1) / 2;
  box(fr.x1 - fr.x0, 2.0, fr.z1 - fr.z0, std(0xe8ecef, 0.35, 0.3), fcx, 1.0, fcz);
  const glow = std(0xd8f0ff, 0.1, 0, { emissive: 0x9fd4ff, emissiveIntensity: 0.55 });
  box(0.02, 1.7, fr.z1 - fr.z0 - 0.16, glow, fr.x1 + 0.005, 1.05, fcz, false);
  const glass = new THREE.MeshStandardMaterial({ color: 0xdff2fa, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
  box(0.02, 1.72, fr.z1 - fr.z0 - 0.12, glass, fr.x1 + 0.04, 1.05, fcz, false);
  for (let k = 0; k < 4; k++) box(0.5, 0.025, fr.z1 - fr.z0 - 0.2, std(0xffffff, 0.3), fr.x1 - 0.25, 0.45 + k * 0.42, fcz, false);
  const baitCol: Record<string, number> = { worm: 0x8b5a2b, paste: 0xd9b26a, shrimp: 0x7fb6c9, golden: 0xf2c230 };
  for (const d of L.displays.filter((d) => d.item.startsWith('bait:') && d.face === 0)) {
    const id = d.item.slice(5) as BaitId;
    const b = BAIT_BY_ID[id];
    // 미끼 통 여러 개 (뚜껑 색 = 미끼 색)
    // 칸 하나에 미끼 하나: 선반 위에 통 여섯 개 (2줄 × 3), 선반 앞에 가격표
    const shelf = 0.45 + ['worm', 'paste', 'shrimp', 'golden'].indexOf(id) * 0.42;
    for (let k = 0; k < 6; k++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.09, 12), std(0xffffff, 0.4));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 12), std(baitCol[id] ?? 0x888888, 0.5));
      const sx = fr.x1 - 0.12 - Math.floor(k / 3) * 0.14;
      const sz = d.z - 0.15 + (k % 3) * 0.15;
      cup.position.set(sx, shelf + 0.058, sz);
      lid.position.set(sx, shelf + 0.113, sz);
      g.add(cup, lid);
    }
    const t = tag(b.icon, `${b.name} ${b.pack}개`, `${b.price}G`, 0.3);
    t.position.set(fr.x1 + 0.06, shelf - 0.07, d.z);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
  const fridgeHead = tag('🧊', '미끼 냉장고', '신선 보관', 0.5);
  fridgeHead.position.set(fr.x1 + 0.06, 2.25, fcz);
  fridgeHead.rotation.y = Math.PI / 2;
  g.add(fridgeHead);

  // ── 가운데: 소품 곤돌라 (북쪽 면 루어 걸이, 위엔 찌 · 봉돌 상자) ──
  const gd = rect('tackle');
  const gcx = (gd.x0 + gd.x1) / 2;
  const gcz = (gd.z0 + gd.z1) / 2;
  box(gd.x1 - gd.x0, 1.1, gd.z1 - gd.z0, std(0xdfe4e8, 0.5), gcx, 0.55, gcz);
  box(gd.x1 - gd.x0, 0.7, 0.04, std(0xc8a97e, 0.8), gcx, 1.45, gd.z0 + 0.02);
  const lureCols = [0xff5252, 0xffd740, 0x40c4ff, 0x69f0ae, 0xff6e40, 0xe040fb, 0xffffff, 0x76ff03];
  for (let k = 0; k < 16; k++) {
    const c = lureCols[k % lureCols.length];
    const lx = gd.x0 + 0.15 + (k % 8) * ((gd.x1 - gd.x0 - 0.3) / 7);
    const ly = 1.62 - Math.floor(k / 8) * 0.3;
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), std(0x888888, 0.3, 0.8));
    peg.rotation.x = Math.PI / 2;
    peg.position.set(lx, ly + 0.05, gd.z0 - 0.04);
    const lure = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 4, 8), std(c, 0.3, 0.3));
    lure.position.set(lx, ly - 0.03, gd.z0 - 0.07);
    const blade = new THREE.Mesh(new THREE.CircleGeometry(0.02, 8), std(0xd8d8d8, 0.2, 1, { side: THREE.DoubleSide }));
    blade.position.set(lx + 0.02, ly + 0.01, gd.z0 - 0.07);
    blade.rotation.y = 0.8;
    g.add(peg, lure, blade);
  }
  const lt = tag(BAIT_BY_ID.lure.icon, BAIT_BY_ID.lure.name, `${BAIT_BY_ID.lure.price}G`, 0.42);
  lt.position.set(gcx, 1.0, gd.z0 - 0.03);
  lt.rotation.y = Math.PI;
  g.add(lt);
  // 위: 찌 · 봉돌 상자들
  const boxCols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047];
  for (let k = 0; k < 6; k++) box(0.26, 0.1, 0.18, std(boxCols[k % 4], 0.5), gd.x0 + 0.25 + k * 0.34, 1.15, gd.z1 - 0.12, false);

  // ── 동쪽: 큰 수조 (물 · 자갈 · 수초 · 물고기) ──
  const tk = rect('tank');
  const tcx = (tk.x0 + tk.x1) / 2;
  const tcz = (tk.z0 + tk.z1) / 2;
  const tw = tk.x1 - tk.x0;
  const td = tk.z1 - tk.z0;
  box(tw, 0.75, td, darkWood, tcx, 0.375, tcz);
  const waterY0 = 0.78;
  const waterH = 0.95;
  box(tw - 0.06, 0.06, td - 0.06, std(0xb9a98a, 0.95), tcx, waterY0 + 0.03, tcz, false);
  const water = new THREE.MeshStandardMaterial({ color: 0x5fb4d9, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false, emissive: 0x0d4f6e, emissiveIntensity: 0.25 });
  box(tw - 0.04, waterH, td - 0.04, water, tcx, waterY0 + waterH / 2, tcz, false);
  const frame = std(0x2a2e33, 0.4, 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.03, waterH + 0.06, 0.03, frame, tcx + sx * (tw / 2 - 0.015), waterY0 + waterH / 2, tcz + sz * (td / 2 - 0.015), false);
  box(tw, 0.04, td, frame, tcx, waterY0 + waterH + 0.02, tcz, false);
  const tl = new THREE.PointLight(0x9fdcff, 1.5, 2.5, 2);
  tl.position.set(tcx, waterY0 + waterH - 0.05, tcz);
  g.add(tl);
  // 수초
  const weed = std(0x2e7d32, 0.8, 0, { side: THREE.DoubleSide });
  for (let k = 0; k < 9; k++) {
    const h = 0.25 + ((k * 37) % 10) / 20;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h), weed);
    blade.position.set(tk.x0 + 0.15 + ((k * 0.27) % (tw - 0.3)), waterY0 + 0.06 + h / 2, tk.z0 + 0.15 + ((k * 0.19) % (td - 0.3)));
    blade.rotation.y = k;
    g.add(blade);
  }
  // 헤엄치는 물고기: 흔한 · 보통 고기 몇 마리
  const swimmers: { m: FishModel; phase: number; r: number; y: number; speed: number }[] = [];
  ['crucian', 'carp', 'pirami', 'bass', 'bluegill', 'nuchi', 'pirami'].forEach((id, i) => {
    const f = FISH_BY_ID[id];
    const kg = id === 'carp' ? 2.2 : f.kg[0] + (f.kg[1] - f.kg[0]) * 0.35;
    const m = buildFish(f, Math.min(0.42, fishLength(f, kg)));
    g.add(m.group);
    swimmers.push({ m, phase: i * 1.7, r: 0.55 + (i % 3) * 0.18, y: waterY0 + 0.25 + (i % 4) * 0.16, speed: 0.008 + (i % 3) * 0.003 });
  });
  const tankLabel = tag('🐟', '한강 물고기 수조', '도감 보기 (E)', 0.48);
  tankLabel.position.set(tcx, 0.45, tk.z1 + 0.005);
  g.add(tankLabel);

  // ── 동쪽 벽: 명예의 전당 (내 기록) + 박제 ──
  const tr = rect('trophy');
  const trz = (tr.z0 + tr.z1) / 2;
  const boardW = tr.z1 - tr.z0 - 0.2;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 512;
  boardCanvas.height = 600;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  let boardKey = '';
  const drawBoard = (dex: FishingState['dex'] = {}) => {
    const c = boardCanvas.getContext('2d')!;
    c.fillStyle = '#2b1d12';
    c.fillRect(0, 0, 512, 600);
    c.strokeStyle = '#d4a017';
    c.lineWidth = 10;
    c.strokeRect(10, 10, 492, 580);
    c.fillStyle = '#f2d38a';
    c.textAlign = 'center';
    c.font = `900 48px ${FONT}`;
    c.fillText('🏆 명예의 전당', 256, 74);
    c.font = `700 22px ${FONT}`;
    c.fillStyle = '#e8dcc4';
    c.fillText('내가 낚은 가장 큰 놈들', 256, 108);
    const best = FISH.filter((f) => dex[f.id] && f.tier !== 'junk')
      .sort((a, b) => TIER_INFO[b.tier].stars - TIER_INFO[a.tier].stars || dex[b.id].best - dex[a.id].best)
      .slice(0, 9);
    c.textAlign = 'left';
    if (!best.length) {
      c.textAlign = 'center';
      c.fillStyle = '#bfae8e';
      c.font = `700 26px ${FONT}`;
      c.fillText('아직 기록이 없어요', 256, 300);
      c.fillText('한강에서 첫 고기를 낚아 보세요!', 256, 340);
    }
    best.forEach((f, i) => {
      const y = 160 + i * 48;
      c.fillStyle = TIER_INFO[f.tier].color;
      c.font = `800 26px ${FONT}`;
      c.fillText(`${i + 1}. ${f.name}`, 40, y);
      c.textAlign = 'right';
      c.fillStyle = '#ffffff';
      c.fillText(`${fmtKg(dex[f.id].best)}  ×${dex[f.id].n}`, 472, y);
      c.textAlign = 'left';
    });
    boardTex.needsUpdate = true;
  };
  drawBoard();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardW * (600 / 512)), new THREE.MeshBasicMaterial({ map: boardTex }));
  board.position.set(x1 - 0.09, 1.55, trz);
  board.rotation.y = -Math.PI / 2;
  g.add(board);
  // 박제 (잉어 대물) — 판자 위
  const plaque = box(0.04, 0.3, 1.0, wood, x1 - 0.09, 2.62, trz);
  void plaque;
  const mounted = buildFish(FISH_BY_ID.carp, 0.85);
  mounted.group.position.set(x1 - 0.2, 2.62, trz);
  mounted.group.rotation.set(0, Math.PI, 0);
  g.add(mounted.group);

  // ── 포스터: 오늘의 물때 · 한강 어종 안내 ──
  const poster = (tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  };
  poster(
    canvasTex(360, 480, (c) => {
      c.fillStyle = '#e8f4fb';
      c.fillRect(0, 0, 360, 480);
      c.fillStyle = '#1f5f8b';
      c.fillRect(0, 0, 360, 80);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.font = `900 40px ${FONT}`;
      c.fillText('물때표', 180, 54);
      c.fillStyle = '#1d232b';
      c.font = `700 26px ${FONT}`;
      [['🌅 05~07시', '입질 ↑ 물때'], ['☀️ 07~17시', '쏘가리 낮'], ['🌇 17~19시', '입질 ↑ 물때'], ['🌙 19~05시', '메기 · 장어']].forEach(([a, b], i) => {
        c.fillText(a, 180, 140 + i * 86);
        c.fillStyle = '#c0392b';
        c.fillText(b, 180, 174 + i * 86);
        c.fillStyle = '#1d232b';
      });
    }),
    0.6,
    0.8,
    1.6,
    1.75,
    z0 + 0.085,
  );
  poster(
    canvasTex(360, 480, (c) => {
      c.fillStyle = '#fffaf0';
      c.fillRect(0, 0, 360, 480);
      c.fillStyle = '#2e7d32';
      c.fillRect(0, 0, 360, 80);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.font = `900 34px ${FONT}`;
      c.fillText('미끼 궁합', 180, 54);
      c.font = `700 24px ${FONT}`;
      c.fillStyle = '#1d232b';
      [['🐛 지렁이', '뭐든 · 메기 · 장어'], ['🥣 떡밥', '붕어 · 잉어 · 초어'], ['🦐 새우', '대물 · 철갑상어'], ['🌀 루어', '배스 · 쏘가리'], ['✨ 황금 떡밥', '전설 확률 ↑']].forEach(([a, b], i) => {
        c.fillText(a, 180, 128 + i * 72);
        c.fillStyle = '#666';
        c.fillText(b, 180, 158 + i * 72);
        c.fillStyle = '#1d232b';
      });
    }),
    0.6,
    0.8,
    x0 + 0.085,
    1.75,
    2.6,
    Math.PI / 2,
  );
  void RODS;

  return {
    tick(t, dex) {
      for (const s of swimmers) {
        const a = t * s.speed + s.phase;
        const x = tcx + Math.cos(a) * (tw / 2 - 0.3) * s.r;
        const z = tcz + Math.sin(a) * (td / 2 - 0.2) * s.r;
        s.m.group.position.set(x, s.y + Math.sin(a * 3) * 0.04, z);
        s.m.group.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
        if (s.m.tail) s.m.tail.rotation.y = Math.sin(t * 0.35 + s.phase) * 0.45;
      }
      if (dex) {
        const key = JSON.stringify(dex);
        if (key !== boardKey) {
          boardKey = key;
          drawBoard(dex);
        }
      }
    },
  };
}
