import * as THREE from 'three';
import { CORRIDOR } from '../city/cityWorld';
import type { DoorDeco, VillaFloor } from '../city/villa';
import { glassMaterial } from './glassKit';

/**
 * 행복빌라 2층 이상 복도 (모든 층이 같은 구조, 층 데이터로 문 색·명패·문 앞 물건·게시판이 바뀐다).
 * 서쪽 끝: 계단실 (북쪽 반 ↑ 올라가는 계단, 남쪽 반 ↓ 내려가는 계단, 가운데 낮은 벽과 난간),
 * 그 옆 북쪽 벽: 엘리베이터, 북쪽 벽: 현관문 3개와 그 사이 소화기·분전함, 동쪽 끝: 창문.
 */
export interface CorridorFloorView {
  floor: number;
  top: number;
  info: VillaFloor;
  /** 문 번호 → 그 집에 사는 우리 쪽 사람 (내 집 / 친구 이름) */
  owners: (string | null)[];
}

export interface CorridorView {
  /** 층이나 사는 사람이 바뀌면 표지·문·물건을 다시 그린다 */
  setFloor(v: CorridorFloorView): void;
  /** 순찰에서 아직 점검할 곳을 표시 (지점 id → 보이기) */
  setPending(ids: Set<string>, t: number): void;
}

export function buildCorridorScene(s: THREE.Scene): CorridorView {
  s.background = new THREE.Color(0x14161c);
  s.add(new THREE.HemisphereLight(0xf4f6ff, 0x3a3832, 0.75));
  const { x0, x1, z0, z1 } = CORRIDOR.room;
  const st = CORRIDOR.stairs;
  const H = 2.6;
  // 복도 바닥이 깔린 곳 (계단실 앞 층계참까지)
  const fx0 = st.x1;
  const FW = x1 - fx0;
  const D = z1 - z0;

  const std = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const label = (w: number, h: number, cw: number, ch: number) => {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    s.add(mesh);
    return { g: c.getContext('2d')!, tex, mesh, cw, ch };
  };

  // 바닥 (데코타일) · 벽 — 색은 층마다 바뀐다
  const floorMat = std(0xb7ab98, 0.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.x = (fx0 + x1) / 2;
  floor.receiveShadow = true;
  s.add(floor);
  for (let x = fx0 + 0.6; x < x1; x += 0.6) box(0.01, 0.002, D, std(0x9d927f), x, 0.002, 0);
  const wall = std(0xeee8dd, 0.95);
  const W = x1 - x0;
  box(W, H, 0.12, wall, (x0 + x1) / 2, H / 2, z0); // 북쪽
  box(0.12, H + 1.6, D, wall, x0, (H - 1.6) / 2, 0); // 서쪽 (계단실 아래까지)
  // 남쪽 (카메라 쪽은 낮게). 계단실 앞은 난간만 둬서 내려가는 계단이 보이게
  box(x1 - st.x1, 0.9, 0.12, wall, (st.x1 + x1) / 2, 0.45, z1);
  {
    const rm = std(0x4a4a4a, 0.4, 0.6);
    box(st.x1 - st.x0, 0.05, 0.06, rm, (st.x0 + st.x1) / 2, 0.9, z1 - 0.03);
    for (const x of [st.x0 + 0.05, (st.x0 + st.x1) / 2, st.x1]) box(0.05, 0.9 + st.rise, 0.05, rm, x, (0.9 - st.rise) / 2, z1 - 0.03);
  }
  // 동쪽 끝 창문
  box(0.12, 0.8, D, wall, x1, 0.4, 0);
  box(0.12, 0.5, D, wall, x1, H - 0.25, 0);
  {
    // 창 구멍: 아래 0.8m ~ 위 H-0.5m, 남북으로 복도 폭
    const wy0 = 0.8;
    const wy1 = H - 0.5;
    const wh = wy1 - wy0;
    const wd = D - 0.2;
    const cy = (wy0 + wy1) / 2;
    // 창밖 풍경 (건너편 빌라와 하늘): 창에서 조금 떨어진 곳에 세운 그림
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 320);
    sky.addColorStop(0, '#5f8fc4');
    sky.addColorStop(0.6, '#a9c6e3');
    sky.addColorStop(1, '#dfe8ee');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 320);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const bw = 50 + rnd() * 70;
      const bx = i * 60 - 20 + rnd() * 20;
      const top = 70 + rnd() * 140;
      const tone = 150 + Math.floor(rnd() * 50);
      g.fillStyle = `rgb(${tone},${tone - 8},${tone - 18})`;
      g.fillRect(bx, top, bw, 320 - top);
      g.fillStyle = 'rgba(60,80,100,0.55)';
      for (let y = top + 12; y < 300; y += 26) for (let x = bx + 8; x < bx + bw - 12; x += 20) g.fillRect(x, y, 11, 14);
    }
    const viewTex = new THREE.CanvasTexture(c);
    viewTex.colorSpace = THREE.SRGBColorSpace;
    const view = new THREE.Mesh(new THREE.PlaneGeometry(wd, wh + 0.1), new THREE.MeshBasicMaterial({ map: viewTex }));
    view.position.set(x1 + 0.055, cy, 0);
    view.rotation.y = -Math.PI / 2;
    s.add(view);
    // 들어오는 햇빛 (바닥에 창 모양으로)
    const sun = new THREE.SpotLight(0xffffff, 6, 9, 0.5, 0.6, 1.2);
    sun.position.set(x1 + 1.2, wy1 + 0.6, 0);
    sun.target.position.set(x1 - 3, 0, 0);
    s.add(sun, sun.target);
    // 유리 두 짝 (미닫이: 안쪽·바깥쪽 판이 살짝 겹친다)
    const glass = glassMaterial();
    box(0.012, wh - 0.08, wd / 2 + 0.05, glass, x1 - 0.03, cy, -wd / 4 + 0.02);
    box(0.012, wh - 0.08, wd / 2 + 0.05, glass, x1 + 0.0, cy, wd / 4 - 0.02);
    // 알루미늄 창틀: 둘레 + 가운데 세로살 + 창턱
    const alu = std(0xc9cdd2, 0.35, 0.8);
    box(0.08, 0.05, wd, alu, x1 - 0.02, wy0 + 0.025, 0);
    box(0.08, 0.05, wd, alu, x1 - 0.02, wy1 - 0.025, 0);
    for (const z of [-wd / 2, wd / 2]) box(0.08, wh, 0.05, alu, x1 - 0.02, cy, z);
    box(0.09, wh, 0.04, alu, x1 - 0.015, cy, 0);
    box(0.22, 0.03, wd + 0.1, std(0xe8e4dc, 0.5), x1 - 0.1, wy0 - 0.01, 0); // 창턱
    // 손잡이 (잠금 장치)
    box(0.03, 0.12, 0.03, std(0x9aa1a8, 0.3, 0.8), x1 - 0.06, cy, 0.06);
  }
  // 걸레받이
  box(x1 - fx0, 0.1, 0.02, std(0x7a6450), (fx0 + x1) / 2, 0.05, z0 + 0.07);

  // ── 계단실 ──
  const N = 7;
  const run = st.x1 - st.x0;
  const sd = run / N;
  const sh = st.rise / N;
  const stepA = std(0xc4bdb0, 0.8);
  const stepB = std(0xb3ab9e, 0.8);
  const nose = std(0x5a5650, 0.6);
  // 올라가는 계단 (북쪽 반): 서쪽으로 갈수록 높아진다
  const upZ0 = z0;
  const upZ1 = -0.08;
  const upD = upZ1 - upZ0;
  for (let k = 0; k < N; k++) {
    const h = sh * (k + 1);
    const cx = st.x1 - sd * (k + 0.5);
    box(sd, h, upD, k % 2 ? stepB : stepA, cx, h / 2, (upZ0 + upZ1) / 2);
    box(0.03, 0.02, upD, nose, cx + sd / 2 - 0.015, h + 0.005, (upZ0 + upZ1) / 2); // 미끄럼 방지 줄
  }
  // 내려가는 계단 (남쪽 반): 서쪽으로 갈수록 낮아진다 (바닥 아래로)
  const dnZ0 = 0.08;
  const dnZ1 = z1;
  const dnD = dnZ1 - dnZ0;
  for (let k = 0; k < N; k++) {
    const top = -sh * (k + 1);
    const cx = st.x1 - sd * (k + 0.5);
    const bottom = -st.rise - 0.3;
    box(sd, top - bottom, dnD, k % 2 ? stepB : stepA, cx, (top + bottom) / 2, (dnZ0 + dnZ1) / 2);
    box(0.03, 0.02, dnD, nose, cx + sd / 2 - 0.015, top + 0.005, (dnZ0 + dnZ1) / 2);
  }
  // 두 계단 사이 낮은 벽 + 난간
  box(run, 1.0 + st.rise, 0.16, wall, (st.x0 + st.x1) / 2, (1.0 - st.rise) / 2, 0);
  const railM = std(0x4a4a4a, 0.4, 0.6);
  box(run, 0.05, 0.08, railM, (st.x0 + st.x1) / 2, 1.05, 0);
  box(0.06, 1.0, 0.06, railM, st.x1, 0.5, 0);
  // 계단실 앞 층계참 경계 (바닥 줄)
  box(0.04, 0.003, D, std(0xd4af37, 0.4, 0.5), st.x1 + 0.02, 0.003, 0);
  // 올라가는 계단 / 내려가는 계단 표지 (서쪽 벽)
  const upSign = label(0.9, 0.36, 256, 102);
  upSign.mesh.position.set(x0 + 0.07, 2.2, (upZ0 + upZ1) / 2);
  upSign.mesh.rotation.y = Math.PI / 2;
  const dnSign = label(0.9, 0.36, 256, 102);
  dnSign.mesh.position.set(x0 + 0.07, 1.0, (dnZ0 + dnZ1) / 2);
  dnSign.mesh.rotation.y = Math.PI / 2;
  // 꼭대기 층: 옥상으로 가는 계단은 쇠사슬로 막혀 있다
  const roofBar = new THREE.Group();
  s.add(roofBar);
  box(0.06, 1.1, 0.06, railM, st.x1 - 0.05, 0.55, z0 + 0.1, roofBar);
  box(0.06, 1.1, 0.06, railM, st.x1 - 0.05, 0.55, upZ1 - 0.1, roofBar);
  for (const y of [0.55, 0.85]) box(0.04, 0.04, upD - 0.2, std(0xd8b02a, 0.4, 0.6), st.x1 - 0.05, y, (upZ0 + upZ1) / 2, roofBar);
  const roofSign = label(0.7, 0.24, 224, 77);
  roofBar.add(roofSign.mesh);
  roofSign.mesh.position.set(st.x1 - 0.02, 0.7, (upZ0 + upZ1) / 2);
  roofSign.mesh.rotation.y = Math.PI / 2;
  {
    const g = roofSign.g;
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, 224, 77);
    g.fillStyle = '#fff';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('옥상 출입 금지', 112, 40);
    roofSign.tex.needsUpdate = true;
  }

  // 엘리베이터 (북쪽 벽)
  const ex = -4.3;
  box(1.3, 2.2, 0.06, std(0x6b7076, 0.4, 0.6), ex, 1.1, z0 + 0.07);
  box(0.58, 2.05, 0.05, std(0xb8bec4, 0.25, 0.85), ex - 0.3, 1.03, z0 + 0.11);
  box(0.58, 2.05, 0.05, std(0xb8bec4, 0.25, 0.85), ex + 0.3, 1.03, z0 + 0.11);
  box(0.08, 0.16, 0.04, std(0xdddddd, 0.3, 0.6), ex + 0.8, 1.15, z0 + 0.1); // 호출 버튼

  // 현관문 3개 (북쪽 벽) + 호수·이름 명패
  const doorMats: THREE.MeshStandardMaterial[] = [];
  const plates = CORRIDOR.doors.map((dx) => {
    const m = std(0x5b3d2b, 0.5);
    doorMats.push(m);
    box(0.95, 2.05, 0.06, m, dx, 1.03, z0 + 0.09);
    box(0.06, 0.06, 0.06, std(0xd4af37, 0.3, 0.8), dx + 0.35, 1.0, z0 + 0.14); // 손잡이
    box(0.12, 0.18, 0.04, std(0x1d1f23, 0.4, 0.4), dx + 0.35, 1.35, z0 + 0.13); // 도어락
    const p = label(0.62, 0.26, 248, 104);
    p.mesh.position.set(dx, 2.28, z0 + 0.08);
    return p;
  });
  // 층 표지 (엘리베이터 서쪽)
  const floorSign = label(0.5, 0.5, 128, 128);
  floorSign.mesh.position.set(ex - 1.0, 1.7, z0 + 0.08);
  // 게시판 (엘리베이터와 첫 문 사이)
  const board = label(0.85, 0.6, 256, 180);
  board.mesh.position.set(-2.75, 1.5, z0 + 0.08);
  box(0.92, 0.67, 0.03, std(0x6b4f35, 0.7), -2.75, 1.5, z0 + 0.065);

  // 북쪽 벽 현관 사이: 소화기·분전함 (점검 지점)
  const cpx = (id: string) => CORRIDOR.checkpoints.find((c) => c.id === id)!;
  const ext = cpx('extinguisher');
  box(0.3, 0.6, 0.15, std(0xd32f2f, 0.4), ext.x, 0.3, z0 + 0.15);
  const pan = cpx('panel');
  box(0.6, 0.8, 0.12, std(0x9aa1a8, 0.4, 0.6), pan.x, 1.5, z0 + 0.12);
  // 점검할 곳 표시 (순찰 중일 때 위아래로 뜨는 화살표)
  const markers = new Map<string, THREE.Mesh>();
  for (const c of CORRIDOR.checkpoints) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
    m.position.set(c.x, 2.0, c.z);
    m.visible = false;
    s.add(m);
    markers.set(c.id, m);
  }

  // 층마다 바뀌는 문 앞 물건
  const decoG = new THREE.Group();
  s.add(decoG);
  const decoMats = new Map<number, THREE.MeshStandardMaterial>();
  const dm = (c: number) => {
    let m = decoMats.get(c);
    if (!m) decoMats.set(c, (m = std(c, 0.7)));
    return m;
  };
  const putDeco = (kind: DoorDeco, x: number) => {
    const z = z0 + 0.32;
    const add = (geo: THREE.BufferGeometry, color: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(geo, dm(color));
      m.position.set(px, py, pz);
      m.castShadow = true;
      decoG.add(m);
      return m;
    };
    switch (kind) {
      case 'shoes':
        for (const [dx, c] of [[-0.12, 0x222222], [0.0, 0x222222], [0.18, 0xe8e8e8], [0.3, 0xe8e8e8]] as const) add(new THREE.BoxGeometry(0.1, 0.08, 0.26), c, x + dx, 0.04, z + 0.05);
        break;
      case 'umbrella': {
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12), 0x555a60, x, 0.225, z);
        for (const [dx, c] of [[-0.04, 0x2f6fd8], [0.05, 0xd83a3a]] as const) add(new THREE.CylinderGeometry(0.03, 0.05, 0.85, 8), c, x + dx, 0.6, z).rotation.z = dx * 2;
        break;
      }
      case 'stroller':
        add(new THREE.BoxGeometry(0.45, 0.35, 0.3), 0x3a5b8a, x, 0.55, z + 0.05);
        for (const dx of [-0.18, 0.18]) add(new THREE.TorusGeometry(0.1, 0.025, 6, 14), 0x1b1b1b, x + dx, 0.12, z + 0.05);
        add(new THREE.BoxGeometry(0.04, 0.5, 0.04), 0x888888, x + 0.22, 0.75, z + 0.05);
        break;
      case 'bike':
        for (const dx of [-0.32, 0.32]) add(new THREE.TorusGeometry(0.28, 0.03, 6, 20), 0x1b1b1b, x + dx, 0.3, z);
        add(new THREE.BoxGeometry(0.7, 0.05, 0.05), 0x2e9e4f, x, 0.5, z).rotation.z = 0.15;
        add(new THREE.BoxGeometry(0.2, 0.05, 0.12), 0x222222, x - 0.1, 0.68, z);
        break;
      case 'plant':
        for (const dx of [-0.15, 0.2]) {
          add(new THREE.CylinderGeometry(0.13, 0.1, 0.25, 12), 0x8a5a3c, x + dx, 0.125, z);
          add(new THREE.SphereGeometry(0.2, 10, 8), 0x3f8a3a, x + dx, 0.42, z);
        }
        break;
      case 'boxes':
        add(new THREE.BoxGeometry(0.45, 0.32, 0.35), 0xb98a55, x, 0.16, z + 0.03);
        add(new THREE.BoxGeometry(0.32, 0.24, 0.28), 0xc79a63, x + 0.03, 0.44, z + 0.03).rotation.y = 0.2;
        break;
      case 'trash':
        add(new THREE.SphereGeometry(0.2, 10, 8), 0x2f4f3a, x, 0.18, z).scale.set(1, 1.2, 1);
        add(new THREE.SphereGeometry(0.15, 10, 8), 0x2a2f45, x + 0.3, 0.14, z).scale.set(1, 1.1, 1);
        break;
      case 'none':
        break;
    }
  };

  // 조명
  for (const lx of [-6.4, -3.5, 0.5, 4.2]) {
    const l = new THREE.PointLight(0xffffff, lx < -6 ? 3.5 : 5, 6, 1.6);
    l.position.set(lx, H - 0.2, 0);
    s.add(l);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(lx, H - 0.02, 0);
    s.add(lamp);
  }
  // 아래층으로 내려가는 계단 아래쪽 은은한 빛
  const pit = new THREE.PointLight(0xffffff, 2.5, 4, 1.6);
  pit.position.set((st.x0 + st.x1) / 2, -0.6, 0.8);
  s.add(pit);
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(1, 6, 4);
  key.castShadow = true;
  s.add(key);

  const text = (lb: ReturnType<typeof label>, bg: string, lines: { t: string; font: string; color: string; y: number }[]) => {
    const g = lb.g;
    g.fillStyle = bg;
    g.fillRect(0, 0, lb.cw, lb.ch);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of lines) {
      g.font = l.font;
      g.fillStyle = l.color;
      g.fillText(l.t, lb.cw / 2, l.y, lb.cw - 12);
    }
    lb.tex.needsUpdate = true;
  };
  /** 게시판 글을 폭에 맞게 여러 줄로 */
  const wrap = (g: CanvasRenderingContext2D, t: string, max: number) => {
    const out: string[] = [];
    let line = '';
    for (const ch of t) {
      if (g.measureText(line + ch).width > max && line) {
        out.push(line);
        line = ch.trimStart();
      } else line += ch;
    }
    if (line) out.push(line);
    return out;
  };

  let shown = '';
  return {
    setFloor(v: CorridorFloorView) {
      const key = `${v.floor}|${v.top}|${v.owners.join(',')}`;
      if (key === shown) return;
      shown = key;
      const { floor: f, info } = v;
      wall.color.setHex(info.wall);
      floorMat.color.setHex(info.floorColor);
      roofBar.visible = f >= v.top;
      decoG.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      decoG.clear();
      plates.forEach((p, i) => {
        const u = info.units[i];
        const owner = v.owners[i];
        doorMats[i].color.setHex(owner ? 0x8a5a2b : u.door);
        text(p, owner ? '#3a2a10' : '#2b2b2b', [
          { t: `${f}0${i + 1}`, font: 'bold 44px sans-serif', color: owner ? '#ffd27a' : '#f2e6c9', y: 36 },
          { t: owner ?? u.resident, font: '22px sans-serif', color: owner ? '#ffe9b8' : '#cfc6b0', y: 80 },
        ]);
        if (!owner) putDeco(u.deco, CORRIDOR.doors[i] - 0.75);
      });
      text(floorSign, '#23395d', [{ t: `${f}F`, font: 'bold 72px sans-serif', color: '#ffffff', y: 68 }]);
      text(upSign, f >= v.top ? '#5a1f1f' : '#23395d', [{ t: f >= v.top ? '↑ 옥상 (출입 금지)' : `↑ ${f + 1}층`, font: 'bold 44px sans-serif', color: '#ffffff', y: 54 }]);
      text(dnSign, '#23395d', [{ t: f > 2 ? `↓ ${f - 1}층` : '↓ 1층 로비', font: 'bold 44px sans-serif', color: '#ffffff', y: 54 }]);
      // 게시판: 코르크 판에 붙은 종이
      const g = board.g;
      g.fillStyle = '#b98a55';
      g.fillRect(0, 0, 256, 180);
      g.fillStyle = '#fbf7ea';
      g.fillRect(18, 16, 220, 148);
      g.fillStyle = '#c62828';
      g.beginPath();
      g.arc(128, 22, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#23395d';
      g.font = 'bold 22px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${f}층 알림`, 128, 48);
      g.font = '17px sans-serif';
      g.fillStyle = '#333';
      wrap(g, info.notice, 196).slice(0, 4).forEach((l, i) => g.fillText(l, 128, 82 + i * 22));
      board.tex.needsUpdate = true;
    },
    setPending(ids: Set<string>, t: number) {
      for (const [id, m] of markers) {
        m.visible = ids.has(id);
        m.position.y = 2.0 + Math.sin(t * 0.1) * 0.08;
      }
    },
  };
}
