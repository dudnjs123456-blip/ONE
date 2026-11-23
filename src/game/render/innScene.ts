import * as THREE from 'three';
import type { CharacterView } from './mannequin';
import { BodyQuilt } from './bodyQuilt';
import { Batch, blockTex, canvasTex, glowTex, plankTex, plasterTex, signTexture } from './villageScene';
import { SIGN_FONT } from './signFonts';
import { BED_L, BED_W, BOOTH_D, BOOTH_W, INN, INN_BEDS, INN_BOOTHS, INN_EXIT, INN_HALL_Z, INN_ROOM_DOORS, INN_ROOMS } from '../data/inn';

/**
 * 달빛 여관 1층 안 (게스트하우스) 그림. 천장 없이 위에서 내려다보는 단면:
 * 북쪽·옆 바깥벽은 높게, 방 칸막이는 허리 높이, 남쪽 벽은 문턱만 (카메라가 남쪽에서 본다).
 * 씻는 곳(샤워 3칸 · 세면대 · 나무 욕조) · 먹는 곳(주방 · 화덕 · 식탁) · 자는 곳(침대 6개) · 복도와 안내 데스크.
 * 움직이지 않는 도형은 재질별로 합쳐 그린다. 누가 자면 그 침대에 이불이 덮이고, 누가 씻으면 커튼이 닫히고 김이 오른다.
 */

const FLOOR_Y = 0.02;
const WALL_H = 2.9;
const PART_H = 1.5;
const HALL_H = 1.05;

const woodFloorTex = () =>
  canvasTex(
    512,
    512,
    (g, r) => {
      const rows = 8;
      const h = 512 / rows;
      for (let j = 0; j < rows; j++) {
        let x = (j % 2) * -120;
        while (x < 512) {
          const w = 150 + r() * 120;
          g.fillStyle = `hsl(${28 + r() * 8},${38 + r() * 12}%,${33 + r() * 9}%)`;
          g.fillRect(x, j * h, w, h);
          g.strokeStyle = 'rgba(0,0,0,0.12)';
          for (let k = 0; k < 5; k++) {
            const y = j * h + 4 + r() * (h - 8);
            g.beginPath();
            g.moveTo(x, y);
            g.bezierCurveTo(x + w / 3, y + (r() - 0.5) * 6, x + (2 * w) / 3, y + (r() - 0.5) * 6, x + w, y);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(x, j * h, 2, h);
          x += w;
        }
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, j * h, 512, 2);
      }
    },
    41,
  );

const tileTex = () =>
  canvasTex(
    256,
    256,
    (g, r) => {
      g.fillStyle = '#5d6a73';
      g.fillRect(0, 0, 256, 256);
      const n = 4;
      const c = 256 / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const l = 70 + r() * 8;
          g.fillStyle = `hsl(${195 + r() * 14},${14 + r() * 8}%,${l}%)`;
          g.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(i * c + 3, j * c + 3, c - 6, 5);
        }
    },
    43,
  );

const rugTex = (base: string, border: string, seed: number) =>
  canvasTex(
    256,
    384,
    (g, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 384);
      g.strokeStyle = border;
      g.lineWidth = 14;
      g.strokeRect(14, 14, 228, 356);
      g.lineWidth = 4;
      g.strokeRect(34, 34, 188, 316);
      g.fillStyle = border;
      for (let k = 0; k < 5; k++) {
        const y = 80 + k * 56;
        g.beginPath();
        g.moveTo(128, y - 18);
        g.lineTo(150, y);
        g.lineTo(128, y + 18);
        g.lineTo(106, y);
        g.closePath();
        g.fill();
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
        g.fillRect(r() * 256, r() * 384, 2, 2);
      }
    },
    seed,
    false,
  );

const quiltTex = (a: string, b: string, seed: number) =>
  canvasTex(
    128,
    128,
    (g, r) => {
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          g.fillStyle = (i + j) % 2 ? a : b;
          g.fillRect(i * 32, j * 32, 32, 32);
          g.fillStyle = 'rgba(255,255,255,0.12)';
          if (r() > 0.4) g.fillRect(i * 32 + 12, j * 32 + 12, 8, 8);
        }
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 2;
      for (let k = 0; k <= 4; k++) {
        g.beginPath();
        g.moveTo(k * 32, 0);
        g.lineTo(k * 32, 128);
        g.moveTo(0, k * 32);
        g.lineTo(128, k * 32);
        g.stroke();
      }
    },
    seed,
  );

/** 바깥 창: 밤하늘 + 달빛 */
const nightWindowTex = () =>
  canvasTex(
    128,
    160,
    (g, r) => {
      const grd = g.createLinearGradient(0, 0, 0, 160);
      grd.addColorStop(0, '#1b1840');
      grd.addColorStop(1, '#3d3478');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 160);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(255,255,240,${0.4 + r() * 0.6})`;
        g.fillRect(r() * 128, r() * 110, 2, 2);
      }
      g.fillStyle = '#f4ecc8';
      g.beginPath();
      g.arc(88, 38, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f1c48';
      g.beginPath();
      g.arc(95, 33, 12, 0, Math.PI * 2);
      g.fill();
    },
    47,
    false,
  );

/** 칠판 메뉴판 */
const menuBoardTex = () =>
  canvasTex(
    384,
    256,
    (g) => {
      g.fillStyle = '#26302a';
      g.fillRect(0, 0, 384, 256);
      g.strokeStyle = '#8a6a44';
      g.lineWidth = 16;
      g.strokeRect(8, 8, 368, 240);
      g.fillStyle = '#f2ead8';
      g.font = `700 38px ${SIGN_FONT.batang}`;
      g.textAlign = 'center';
      g.fillText('오늘의 메뉴', 192, 60);
      g.font = `700 25px ${SIGN_FONT.batang}`;
      g.textAlign = 'left';
      const rows = [
        ['허브차', '5'],
        ['빵과 수프', '10'],
        ['사냥꾼 스튜', '22'],
        ['달빛 정식', '40'],
      ];
      rows.forEach(([n, p], i) => {
        g.fillStyle = '#f2ead8';
        g.fillText(n, 40, 108 + i * 36);
        g.fillStyle = '#f0d27a';
        g.textAlign = 'right';
        g.fillText(`${p} 은화`, 344, 108 + i * 36);
        g.textAlign = 'left';
      });
    },
    1,
    false,
  );

/** 안내 데스크 위 가격표 */
const priceTex = () =>
  canvasTex(
    320,
    200,
    (g) => {
      g.fillStyle = '#efe3c6';
      g.fillRect(0, 0, 320, 200);
      g.strokeStyle = '#7a5532';
      g.lineWidth = 8;
      g.strokeRect(4, 4, 312, 192);
      g.fillStyle = '#4a2f1a';
      g.textAlign = 'center';
      g.font = `800 30px ${SIGN_FONT.myeongjo}`;
      g.fillText('달빛 여관 안내', 160, 46);
      g.font = `700 21px ${SIGN_FONT.myeongjo}`;
      g.fillText('숙박 하룻밤 30 은화', 160, 92);
      g.fillText('샤워 무료 · 식사는 식당에서', 160, 126);
      g.fillStyle = '#9a3434';
      g.fillText('서울 돈(G)은 받지 않아요', 160, 164);
    },
    1,
    false,
  );

/** 침대를 쓰는 사람: cover 이불이 덮인 정도 (0 = 걸터앉는 중 · 1 = 다 덮음), body 누운 사람 (이불이 그 몸을 따라 덮인다) */
export interface InnBedUse {
  cover: number;
  body?: CharacterView;
}

export interface InnSceneState {
  /** 누가 쓰는 침대 → cover: 이불이 덮인 정도 (0 = 걸터앉는 중 · 1 = 다 덮음), side: 돌아누운 정도 (몸이 높아진 만큼 이불이 부푼다) */
  beds: Map<number, InnBedUse>;
  /** 누가 씻는 샤워 칸 (커튼이 닫히고 김이 오른다) */
  booths: Set<number>;
}

export interface InnScene {
  update(t: number, state: InnSceneState): void;
}

// 매트리스 윗면 (누운 등이 닿는 높이)
const MAT_TOP = 0.62;

export function buildInn(s: THREE.Scene): InnScene {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p });
  const glowMap = glowTex();
  const M = {
    floor: std({ map: woodFloorTex() }),
    tile: std({ map: tileTex(), roughness: 0.5 }),
    plaster: std({ map: plasterTex() }),
    wood: std({ map: plankTex() }),
    beam: std({ color: 0x3a2417, roughness: 0.8 }),
    stone: std({ map: blockTex() }),
    dark: std({ color: 0x0c0a14, roughness: 1 }),
    sheet: std({ color: 0xf1ece2, roughness: 0.95 }),
    pillow: std({ color: 0xfbf8f2, roughness: 0.95 }),
    brass: std({ color: 0xc9a45c, metalness: 0.6, roughness: 0.35 }),
    iron: std({ color: 0x2b2a33, metalness: 0.5, roughness: 0.5 }),
    ceramic: std({ color: 0xe9e2d4, roughness: 0.4 }),
    water: std({ color: 0x5aa0c8, emissive: 0x1e4a6a, emissiveIntensity: 0.6, roughness: 0.15 }),
    window: std({ map: nightWindowTex(), emissive: 0x3a3478, emissiveIntensity: 0.6 }),
    curtainWin: std({ color: 0x5b2f4a, roughness: 0.95, side: THREE.DoubleSide }),
    flame: std({ color: 0xffd28a, emissive: 0xff8a2a, emissiveIntensity: 3 }),
    candle: std({ color: 0xfff1c8, emissive: 0xffc070, emissiveIntensity: 1.8 }),
    ember: std({ color: 0xff7a30, emissive: 0xff5a10, emissiveIntensity: 2.2 }),
    towel: [0xe7d8b8, 0x9cc0c8, 0xd89ca0, 0xb8c89c].map((c) => std({ color: c, roughness: 1 })),
    quilts: [
      ['#7d3444', '#d9b45c'],
      ['#33405e', '#9cc0c8'],
      ['#4d7258', '#eadfca'],
      ['#5b4c7a', '#d89ca0'],
      ['#8a5a2e', '#eadfca'],
      ['#3b5c7a', '#d9b45c'],
    ].map(([a, b], i) => std({ map: quiltTex(a, b, 60 + i), roughness: 1 })),
    rugRed: std({ map: rugTex('#7a2f36', '#d9b45c', 51), roughness: 1 }),
    rugBlue: std({ map: rugTex('#2f3e5e', '#eadfca', 52), roughness: 1 }),
    plate: std({ color: 0xf4efe4, roughness: 0.4 }),
    food: [0xd9a04a, 0x9a4a2a, 0x7aa04a, 0xe8d090].map((c) => std({ color: c })),
    jars: [0x8a6aff, 0x4affc8, 0xffd04a, 0xff7a8a].map((c) => std({ color: c, transparent: true, opacity: 0.85, roughness: 0.2 })),
    menu: std({ map: menuBoardTex(), roughness: 0.9 }),
    price: std({ map: priceTex(), roughness: 0.9 }),
    leaves: std({ color: 0x4d7258, roughness: 0.9, flatShading: true }),
    pot: std({ color: 0x9a5a3a, roughness: 0.8 }),
  };
  const noCast = new Set<THREE.Material>([M.floor, M.tile, M.rugRed, M.rugBlue, M.window, M.dark]);
  const b = new Batch();
  const cx = (INN.x0 + INN.x1) / 2;
  const cz = (INN.z0 + INN.z1) / 2;
  const W = INN.x1 - INN.x0;
  const D = INN.z1 - INN.z0;

  // ── 바닥: 어두운 바깥(밤) · 나무 마루 · 욕실 타일 · 깔개
  b.add(new THREE.PlaneGeometry(W + 40, D + 30), M.dark, cx, -0.03, cz, -Math.PI / 2);
  const floor = (mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, tile: number, y = FLOOR_Y) =>
    b.add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat, (x0 + x1) / 2, y, (z0 + z1) / 2, -Math.PI / 2, 0, 0, [(x1 - x0) / tile, (z1 - z0) / tile]);
  const bath = INN_ROOMS[0];
  floor(M.floor, INN.x0, INN.x1, INN_HALL_Z, INN.z1, 3);
  floor(M.floor, bath.x1, INN.x1, INN.z0, INN_HALL_Z, 3);
  floor(M.tile, bath.x0, bath.x1, INN.z0, INN_HALL_Z, 0.8);
  // 복도 깔개 (문에서 안쪽으로) · 침실 깔개
  b.add(new THREE.PlaneGeometry(1.5, 3.4), M.rugRed, INN_EXIT.x, FLOOR_Y + 0.01, INN.z1 - 2.0, -Math.PI / 2);
  b.add(new THREE.PlaneGeometry(12, 1.1), M.rugRed, cx, FLOOR_Y + 0.012, INN_HALL_Z + 1.3, -Math.PI / 2);
  b.add(new THREE.PlaneGeometry(1.0, 5.6), M.rugBlue, 105.95, FLOOR_Y + 0.01, 28.9, -Math.PI / 2, 0, Math.PI / 2);

  // ── 바깥벽: 북쪽·서쪽·동쪽은 높게 (아래는 나무 판벽, 위는 회벽), 남쪽은 문턱만
  const T = 0.25;
  const wall = (x0: number, x1: number, z0: number, z1: number, h: number, lower = 0.9) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    b.box(M.wood, w, Math.min(lower, h), d, x, Math.min(lower, h) / 2, z, 0, 1.2);
    if (h > lower) b.box(M.plaster, w, h - lower, d, x, lower + (h - lower) / 2, z, 0, 1.6);
    b.box(M.beam, w + 0.04, 0.12, d + 0.04, x, h + 0.06, z);
    if (h > lower) b.box(M.beam, w + 0.03, 0.07, d + 0.03, x, lower, z);
  };
  wall(INN.x0 - T, INN.x1 + T, INN.z0 - T, INN.z0, WALL_H);
  wall(INN.x0 - T, INN.x0, INN.z0, INN.z1 + T, WALL_H);
  wall(INN.x1, INN.x1 + T, INN.z0, INN.z1 + T, WALL_H);
  const ex0 = INN_EXIT.x - 0.75;
  const ex1 = INN_EXIT.x + 0.75;
  wall(INN.x0, ex0, INN.z1, INN.z1 + T, 0.45, 0.45);
  wall(ex1, INN.x1, INN.z1, INN.z1 + T, 0.45, 0.45);
  // 바깥벽 기둥 (반목조 느낌)
  for (let x = INN.x0 + 1.5; x < INN.x1; x += 3) b.box(M.beam, 0.14, WALL_H, 0.08, x, WALL_H / 2, INN.z0 + 0.04);
  for (const x of [INN.x0, INN.x1]) for (let z = INN.z0 + 2; z < INN.z1; z += 3) b.box(M.beam, 0.08, WALL_H, 0.14, x + (x === INN.x0 ? 0.04 : -0.04), WALL_H / 2, z);
  // 남쪽 문: 문틀 + 열린 문짝 + 문 위 등
  for (const sx of [-1, 1]) b.box(M.beam, 0.14, 2.3, 0.3, INN_EXIT.x + sx * 0.75, 1.15, INN.z1 + 0.12);
  b.box(M.beam, 1.66, 0.16, 0.3, INN_EXIT.x, 2.35, INN.z1 + 0.12);
  b.box(M.wood, 0.7, 2.1, 0.06, INN_EXIT.x - 0.78, 1.05, INN.z1 + 0.5, Math.PI / 2.4);
  b.box(M.stone, 1.5, 0.05, 0.4, INN_EXIT.x, 0.03, INN.z1 + 0.12);

  // 북쪽 창: 밤하늘 + 커튼
  const windowN = (x: number) => {
    b.add(new THREE.PlaneGeometry(0.8, 1.0), M.window, x, 1.75, INN.z0 + 0.01);
    b.box(M.beam, 0.96, 0.08, 0.1, x, 2.29, INN.z0 + 0.05);
    b.box(M.beam, 0.96, 0.1, 0.16, x, 1.21, INN.z0 + 0.08);
    b.box(M.beam, 0.05, 1.0, 0.06, x, 1.75, INN.z0 + 0.04);
    for (const sx of [-1, 1]) {
      b.box(M.beam, 0.08, 1.12, 0.1, x + sx * 0.44, 1.75, INN.z0 + 0.05);
      b.box(M.curtainWin, 0.22, 1.3, 0.05, x + sx * 0.58, 1.68, INN.z0 + 0.1);
    }
  };
  for (const x of [99.5 - 2, 99.5 + 2, 104.95, 106.95]) windowN(x);

  // ── 방 칸막이 (허리 높이) · 복도 쪽 벽 (문 자리 비움) · 문틀 · 방 간판
  for (const x of [bath.x1, INN_ROOMS[1].x1]) wall(x - 0.06, x + 0.06, INN.z0, INN_HALL_Z - 0.06, PART_H, 0.75);
  let hx: number = INN.x0;
  for (const d of INN_ROOM_DOORS) {
    wall(hx, d.x0, INN_HALL_Z - 0.06, INN_HALL_Z + 0.06, HALL_H, 0.7);
    hx = d.x1;
  }
  wall(hx, INN.x1, INN_HALL_Z - 0.06, INN_HALL_Z + 0.06, HALL_H, 0.7);
  const signs: THREE.Mesh[] = [];
  for (const d of INN_ROOM_DOORS) {
    for (const x of [d.x0, d.x1]) b.box(M.beam, 0.12, 2.25, 0.12, x, 1.12, INN_HALL_Z);
    b.box(M.beam, d.x1 - d.x0 + 0.2, 0.12, 0.14, (d.x0 + d.x1) / 2, 2.25, INN_HALL_Z);
    const room = INN_ROOMS.find((r) => r.id === d.room)!;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshStandardMaterial({ map: signTexture(room.name), roughness: 0.8, emissive: 0x2a1a0a, emissiveIntensity: 0.4 }));
    sign.position.set((d.x0 + d.x1) / 2, 2.5, INN_HALL_Z + 0.08);
    s.add(sign);
    signs.push(sign);
    for (const sx of [-0.4, 0.4]) b.box(M.iron, 0.02, 0.14, 0.02, (d.x0 + d.x1) / 2 + sx, 2.37, INN_HALL_Z + 0.05);
  }

  // ── 씻는 곳: 샤워 3칸 (타일 칸막이 · 놋쇠 샤워기 · 커튼) · 세면대 · 거울 · 나무 욕조 · 수건 선반
  const curtains: { open: THREE.Mesh; closed: THREE.Mesh }[] = [];
  const curtainMat = std({ color: 0x9cc0c8, roughness: 0.95, side: THREE.DoubleSide });
  const curtainClosedMat = std({ color: 0x7aa8b4, roughness: 0.95, side: THREE.DoubleSide });
  for (const bo of INN_BOOTHS) {
    const x0 = bo.x - BOOTH_W / 2;
    const x1 = bo.x + BOOTH_W / 2;
    for (const x of [x0, x1]) b.box(M.tile, 0.08, 2.1, BOOTH_D, x, 1.05, INN.z0 + BOOTH_D / 2, 0, 0.8);
    b.box(M.tile, BOOTH_W, 0.06, BOOTH_D, bo.x, 0.05, INN.z0 + BOOTH_D / 2);
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), M.iron, bo.x, 0.09, INN.z0 + BOOTH_D / 2);
    // 샤워기: 벽 관 + 꺾인 팔 + 둥근 머리
    b.box(M.brass, 0.04, 1.9, 0.04, bo.x + 0.3, 1.0, INN.z0 + 0.06);
    b.box(M.brass, 0.04, 0.04, 0.32, bo.x + 0.3, 1.95, INN.z0 + 0.2);
    b.add(new THREE.CylinderGeometry(0.11, 0.07, 0.05, 14), M.brass, bo.x + 0.3, 1.92, INN.z0 + 0.36);
    b.add(new THREE.SphereGeometry(0.05, 8, 6), M.brass, bo.x + 0.3, 1.05, INN.z0 + 0.08);
    // 커튼 봉
    b.box(M.brass, BOOTH_W, 0.03, 0.03, bo.x, 2.05, INN.z0 + BOOTH_D);
    const open = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.75, 0.06), curtainMat);
    open.position.set(x0 + 0.16, 1.15, INN.z0 + BOOTH_D);
    const closed = new THREE.Mesh(new THREE.PlaneGeometry(BOOTH_W - 0.06, 1.75, 6, 1), curtainClosedMat);
    {
      // 주름: 앞뒤로 물결
      const pos = closed.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / (BOOTH_W - 0.06)) * Math.PI * 6) * 0.035);
      closed.geometry.computeVertexNormals();
    }
    closed.position.set(bo.x, 1.15, INN.z0 + BOOTH_D);
    closed.visible = false;
    open.castShadow = closed.castShadow = true;
    s.add(open, closed);
    curtains.push({ open, closed });
  }
  // 세면대 (서쪽 벽): 나무 받침 + 대야 2개 + 거울 + 물병
  b.box(M.wood, 0.62, 0.85, 2.4, INN.x0 + 0.31, 0.43, 30.2, 0, 1);
  b.box(M.stone, 0.68, 0.06, 2.46, INN.x0 + 0.34, 0.88, 30.2);
  for (const z of [29.6, 30.8]) {
    b.add(new THREE.CylinderGeometry(0.22, 0.15, 0.12, 16), M.ceramic, INN.x0 + 0.33, 0.97, z);
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), M.water, INN.x0 + 0.33, 1.0, z);
    b.box(M.beam, 0.04, 0.62, 0.52, INN.x0 + 0.02, 1.55, z);
    b.add(new THREE.PlaneGeometry(0.44, 0.54), std({ color: 0xbfd8e0, metalness: 0.7, roughness: 0.08, emissive: 0x24343a, emissiveIntensity: 0.5 }), INN.x0 + 0.05, 1.55, z, 0, Math.PI / 2);
  }
  b.add(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 10), M.pot, INN.x0 + 0.33, 1.04, 30.2);
  // 나무 욕조: 판자 통 + 쇠테 + 따뜻한 물
  {
    const x = 95.25;
    const z = 31.45;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      b.box(M.wood, 0.25, 0.7, 0.07, x + Math.cos(a) * 0.62, 0.35, z + Math.sin(a) * 0.62, -a + Math.PI / 2);
    }
    for (const y of [0.15, 0.55]) b.add(new THREE.TorusGeometry(0.64, 0.02, 6, 28), M.iron, x, y, z, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.58, 0.58, 0.02, 24), M.water, x, 0.56, z);
  }
  // 수건 선반 (칸막이 쪽) + 개어 둔 수건 · 낮은 걸상
  b.box(M.wood, 0.3, 1.2, 1.3, bath.x1 - 0.25, 0.6, 28.7, 0, 1);
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++) b.box(M.towel[(k + j) % M.towel.length], 0.24, 0.08, 0.36, bath.x1 - 0.25, 0.42 + k * 0.33 + j * 0.085, 28.25 + (j % 2) * 0.05 + (k % 2) * 0.45);
  b.box(M.wood, 0.9, 0.08, 0.32, 93.3, 0.42, 30.3);
  for (const sx of [-1, 1]) b.box(M.wood, 0.06, 0.4, 0.26, 93.3 + sx * 0.38, 0.2, 30.3);

  // ── 먹는 곳: 주방 카운터 · 돌 화덕(불) · 선반 · 걸린 냄비 · 식탁 두 개와 의자 · 칠판 메뉴판
  const dining = INN_ROOMS[1];
  b.box(M.wood, 4.2, 0.95, 0.6, 99.5, 0.48, 27.62, 0, 1);
  b.box(M.beam, 4.32, 0.07, 0.72, 99.5, 0.99, 27.62);
  // 카운터 위: 빵 바구니 · 수프 냄비 · 머그
  b.add(new THREE.CylinderGeometry(0.22, 0.17, 0.12, 12), M.wood, 98.3, 1.08, 27.6);
  for (let k = 0; k < 4; k++) b.add(new THREE.SphereGeometry(0.08, 8, 6), M.food[0], 98.22 + (k % 2) * 0.14, 1.16, 27.55 + (k > 1 ? 0.1 : 0));
  b.add(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 14), M.iron, 100.8, 1.14, 27.62);
  for (const x of [99.3, 99.6]) b.add(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), M.ceramic, x, 1.07, 27.7);
  // 화덕 (북쪽 벽 가운데): 돌 + 아치 + 불씨
  b.box(M.stone, 1.5, 1.3, 0.55, 99.5, 0.65, INN.z0 + 0.28, 0, 1);
  b.box(M.stone, 1.1, 1.6, 0.4, 99.5, 2.1, INN.z0 + 0.2, 0, 1);
  b.box(M.dark, 0.8, 0.6, 0.1, 99.5, 0.5, INN.z0 + 0.52);
  b.box(M.beam, 1.7, 0.1, 0.62, 99.5, 1.32, INN.z0 + 0.3);
  for (let k = 0; k < 5; k++) b.add(new THREE.DodecahedronGeometry(0.06, 0), M.ember, 99.25 + k * 0.12, 0.27, INN.z0 + 0.5);
  b.add(new THREE.CylinderGeometry(0.24, 0.2, 0.26, 14), M.iron, 99.5, 1.5, INN.z0 + 0.32);
  // 양옆 선반: 병 · 접시
  for (const x of [97.6, 101.4]) {
    for (const y of [1.15, 1.6, 2.05]) b.box(M.wood, 1.2, 0.05, 0.3, x, y, INN.z0 + 0.15);
    for (let k = 0; k < 4; k++) b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), M.jars[(k + (x > 99 ? 2 : 0)) % 4], x - 0.42 + k * 0.28, 1.28, INN.z0 + 0.15);
    for (let k = 0; k < 3; k++) b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), M.plate, x - 0.35 + k * 0.35, 1.75, INN.z0 + 0.12, Math.PI / 2.4);
  }
  // 걸린 냄비 · 국자
  b.box(M.iron, 2.2, 0.03, 0.03, 99.5, 2.5, INN.z0 + 0.7);
  for (let k = 0; k < 4; k++) b.add(new THREE.CylinderGeometry(0.1 + (k % 2) * 0.03, 0.08, 0.14, 10), M.pot, 98.7 + k * 0.55, 2.33, INN.z0 + 0.7);
  // 칠판 메뉴판 (서쪽 칸막이 위에 걸침)
  b.add(new THREE.PlaneGeometry(1.2, 0.8), M.menu, dining.x0 + 0.1, 2.0, 29.2, 0, Math.PI / 2);
  b.box(M.beam, 0.05, 0.05, 1.0, dining.x0 + 0.08, 1.55, 29.2);
  // 식탁 두 개: 둥근 상판 + 다리 + 의자 넷 + 촛불 · 접시
  const candles: THREE.Vector3[] = [];
  for (const tx of [98.2, 100.9]) {
    const tz = 30.1;
    b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 20), M.wood, tx, 0.76, tz);
    b.add(new THREE.CylinderGeometry(0.08, 0.12, 0.72, 10), M.beam, tx, 0.37, tz);
    b.add(new THREE.CylinderGeometry(0.32, 0.36, 0.05, 14), M.beam, tx, 0.03, tz);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = tx + Math.cos(a) * 0.85;
      const sz = tz + Math.sin(a) * 0.85;
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), M.wood, sx, 0.46, sz);
      for (let l = 0; l < 3; l++) {
        const la = (l / 3) * Math.PI * 2;
        b.box(M.beam, 0.04, 0.44, 0.04, sx + Math.cos(la) * 0.13, 0.22, sz + Math.sin(la) * 0.13);
      }
      b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 14), M.plate, tx + Math.cos(a) * 0.38, 0.8, tz + Math.sin(a) * 0.38);
      b.add(new THREE.SphereGeometry(0.06, 8, 5), M.food[(k + (tx > 99 ? 1 : 0)) % 4], tx + Math.cos(a) * 0.38, 0.83, tz + Math.sin(a) * 0.38);
    }
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), M.candle, tx, 0.88, tz);
    b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), M.brass, tx, 0.81, tz);
    candles.push(new THREE.Vector3(tx, 1.0, tz));
  }
  // 술통 두 개 (구석)
  for (const [x, z] of [
    [101.95, 32.9],
    [101.4, 33.0],
  ])
    b.add(new THREE.CylinderGeometry(0.28, 0.25, 0.6, 12), M.wood, x, 0.3, z);

  // ── 자는 곳: 침대 6개 (머리판 · 매트리스 · 베개 · 개어 둔 이불) · 협탁과 촛불 · 침대 발치 상자
  const blankets: BodyQuilt[] = [];
  const foldeds: THREE.Mesh[] = [];
  const covers = INN_BEDS.map(() => 0);
  INN_BEDS.forEach((bed, i) => {
    const bz = bed.head + BED_L / 2;
    for (const sx of [-1, 1]) for (const sz of [0.08, BED_L - 0.08]) b.box(M.beam, 0.08, 0.34, 0.08, bed.x + sx * (BED_W / 2 - 0.04), 0.17, bed.head + sz);
    b.box(M.wood, BED_W, 0.12, BED_L, bed.x, 0.32, bz, 0, 1);
    b.box(M.wood, BED_W + 0.06, 1.05, 0.08, bed.x, 0.62, bed.head + 0.04, 0, 1);
    b.box(M.beam, BED_W + 0.12, 0.08, 0.12, bed.x, 1.16, bed.head + 0.04);
    b.box(M.wood, BED_W + 0.04, 0.5, 0.06, bed.x, 0.4, bed.head + BED_L - 0.03, 0, 1);
    // 매트리스 윗면 0.62 (서울 집 침대와 같은 높이 · 누운 몸이 그 위에 닿는다)
    b.box(M.sheet, BED_W - 0.08, 0.22, BED_L - 0.14, bed.x, 0.51, bz + 0.03);
    // 베개: 누운 머리 바로 밑
    b.box(M.pillow, BED_W - 0.3, 0.12, 0.44, bed.x, 0.66, bed.head + 0.43);
    // 낮에는 발치에 개어 둔 이불 (누가 침대를 쓰면 치운다 · 다리가 뚫고 지나가지 않게)
    const folded = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.06, 0.1, 0.55), M.quilts[i]);
    folded.position.set(bed.x, 0.67, bed.head + BED_L - 0.42);
    folded.castShadow = folded.receiveShadow = true;
    s.add(folded);
    foldeds.push(folded);
    // 자는 사람에게 덮는 이불: 누운 몸보다 늘 위로 부풀고 (뒤척여도 안 뚫린다), 발끝부터 어깨까지 당겨 덮는다.
    // 발치 판(윗면 0.65)까지 덮고, 발치 너머 자락은 발치 상자(윗면 0.4)에 닿기 전에 멈춘다
    const quilt = new BodyQuilt(
      { x0: bed.x - BED_W / 2 - 0.03, x1: bed.x + BED_W / 2 + 0.03, zHem: bed.head + 0.6, zFoot: bed.head + BED_L, top: MAT_TOP + 0.05, drape: 0.18, fall: 0.2, uvScale: 1.1 },
      M.quilts[i],
    );
    s.add(quilt.mesh);
    blankets.push(quilt);
    // 발치 상자
    if (bed.head < 29) b.box(M.wood, 0.7, 0.4, 0.4, bed.x, 0.2, bed.head + BED_L + 0.28, 0, 1);
  });
  // 협탁 (머리맡 사이) + 촛불
  for (const head of [26.0, 29.6])
    for (const x of [104.98, 106.93]) {
      b.box(M.wood, 0.4, 0.55, 0.36, x, 0.28, head + 0.25, 0, 1);
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), M.candle, x, 0.62, head + 0.25);
      b.add(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10), M.brass, x, 0.56, head + 0.25);
      candles.push(new THREE.Vector3(x, 0.72, head + 0.25));
    }
  // 옷걸이 (침실 서쪽 칸막이 앞)
  b.box(M.beam, 0.05, 1.7, 0.05, INN_ROOMS[2].x0 + 0.3, 0.85, 32.9);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    b.box(M.beam, 0.25, 0.03, 0.03, INN_ROOMS[2].x0 + 0.3 + Math.cos(a) * 0.1, 1.6, 32.9 + Math.sin(a) * 0.1, -a);
  }
  b.add(new THREE.SphereGeometry(0.16, 8, 6), M.towel[1], INN_ROOMS[2].x0 + 0.42, 1.45, 32.9);

  // ── 복도 · 로비: 안내 데스크(방명록 · 종 · 가격표) · 벤치 · 화분 · 등
  b.box(M.wood, 2.3, 0.95, 0.65, 96.55, 0.48, 36.22, 0, 1);
  b.box(M.beam, 2.42, 0.07, 0.77, 96.55, 0.99, 36.22);
  b.box(M.sheet, 0.42, 0.04, 0.3, 96.1, 1.05, 36.2);
  b.box(M.beam, 0.02, 0.05, 0.3, 96.1, 1.06, 36.2);
  b.add(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, 97.1, 1.03, 36.2);
  b.add(new THREE.PlaneGeometry(0.7, 0.44), M.price, 96.55, 1.3, 36.0, -0.35);
  b.box(M.beam, 0.04, 0.3, 0.04, 96.55, 1.12, 36.05);
  b.box(M.wood, 2.2, 0.08, 0.45, 107.5, 0.45, 37.5, 0, 1);
  for (const sx of [-1, 1]) b.box(M.beam, 0.08, 0.42, 0.38, 107.5 + sx * 0.95, 0.21, 37.5);
  const plant = (x: number, z: number, sc = 1) => {
    b.add(new THREE.CylinderGeometry(0.22 * sc, 0.17 * sc, 0.38 * sc, 12), M.pot, x, 0.19 * sc, z);
    for (let k = 0; k < 4; k++) b.add(new THREE.IcosahedronGeometry(0.2 * sc, 0), M.leaves, x + Math.cos(k * 1.7) * 0.1 * sc, (0.5 + k * 0.1) * sc, z + Math.sin(k * 1.7) * 0.1 * sc);
  };
  plant(INN.x0 + 0.4, INN.z1 - 0.45);
  plant(INN.x1 - 0.4, INN.z1 - 0.45);
  plant(ex0 - 0.35, INN.z1 - 0.4, 0.8);
  plant(ex1 + 0.35, INN.z1 - 0.4, 0.8);
  plant(bath.x1 - 0.35, INN_HALL_Z - 0.4, 0.75);
  // 벽 등 (복도 · 각 방)
  const sconces: THREE.Vector3[] = [];
  for (const [x, z, ry] of [
    [INN.x0 + 0.06, 35.8, Math.PI / 2],
    [INN.x1 - 0.06, 35.8, -Math.PI / 2],
    [93.6, INN.z0 + 0.06, 0],
    [103.95, INN.z0 + 0.06, 0],
    [107.9, INN.z0 + 0.06, 0],
  ] as const) {
    b.push(x, 0, z, ry);
    b.box(M.iron, 0.12, 0.25, 0.06, 0, 2.1, 0.03);
    b.box(M.iron, 0.03, 0.03, 0.2, 0, 2.15, 0.13);
    b.add(new THREE.SphereGeometry(0.09, 10, 8), M.candle, 0, 2.1, 0.25);
    sconces.push(b.world(0, 2.1, 0.3));
    b.pop();
  }

  b.flush(s, noCast);

  // ── 빛: 화덕(일렁임) · 복도 · 침실 · 욕실. 그림자는 해(달빛) 하나만
  const hearth = new THREE.PointLight(0xff9a4a, 6, 7, 1.6);
  hearth.position.set(99.5, 1.0, INN.z0 + 1.0);
  const hall = new THREE.PointLight(0xffc88a, 5, 10, 1.6);
  hall.position.set(cx, 2.4, 35.8);
  const dorm = new THREE.PointLight(0xffd0a0, 3.5, 8, 1.6);
  dorm.position.set(105.9, 2.4, 29.8);
  const bathL = new THREE.PointLight(0xcfe6ff, 3.5, 7, 1.6);
  bathL.position.set(93.7, 2.4, 29.5);
  s.add(hearth, hall, dorm, bathL);

  // 빛무리: 촛불 · 벽 등 · 화덕
  const halo = (p: THREE.Vector3, color: number, size: number, opacity: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(p);
    sp.scale.setScalar(size);
    s.add(sp);
    return sp;
  };
  const flickers = [...candles.map((p) => halo(p, 0xffc070, 0.45, 0.7)), ...sconces.map((p) => halo(p, 0xffc070, 0.8, 0.6))];
  const fire = halo(new THREE.Vector3(99.5, 0.45, INN.z0 + 0.62), 0xff7a30, 1.3, 0.9);
  // 화덕 불꽃 (흔들리는 원뿔 셋)
  const flames: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.09 - k * 0.015, 0.32 - k * 0.05, 8), M.flame);
    fl.position.set(99.38 + k * 0.12, 0.42, INN.z0 + 0.5);
    s.add(fl);
    flames.push(fl);
  }

  // 김: 샤워 칸 · 욕조에서 피어오르는 하얀 빛
  const steamMat = (o: number) => new THREE.SpriteMaterial({ map: glowMap, color: 0xeaf4ff, transparent: true, opacity: o, depthWrite: false });
  const boothSteam = INN_BOOTHS.map((bo) =>
    Array.from({ length: 6 }, (_, k) => {
      const sp = new THREE.Sprite(steamMat(0));
      sp.position.set(bo.x + (k % 3) * 0.3 - 0.3, 1, INN.z0 + 0.4 + (k % 2) * 0.4);
      sp.scale.setScalar(0.8);
      s.add(sp);
      return sp;
    }),
  );
  const tubSteam = Array.from({ length: 4 }, (_, k) => {
    const sp = new THREE.Sprite(steamMat(0.12));
    sp.position.set(95.25 + (k - 1.5) * 0.25, 0.8, 31.45);
    sp.scale.setScalar(0.7);
    s.add(sp);
    return sp;
  });

  return {
    update(t, state) {
      const sec = t / 60;
      hearth.intensity = 6 + Math.sin(sec * 9) * 0.8 + Math.sin(sec * 23) * 0.5;
      fire.material.opacity = 0.75 + Math.sin(sec * 11) * 0.15;
      flames.forEach((f, k) => {
        f.scale.y = 1 + Math.sin(sec * (8 + k * 3) + k) * 0.25;
        f.rotation.z = Math.sin(sec * 5 + k) * 0.12;
      });
      flickers.forEach((h, k) => {
        h.material.opacity = 0.55 + Math.sin(sec * 7 + k * 1.3) * 0.12;
      });
      INN_BOOTHS.forEach((_, i) => {
        const busy = state.booths.has(i);
        curtains[i].open.visible = !busy;
        curtains[i].closed.visible = busy;
        boothSteam[i].forEach((sp, k) => {
          const u = (sec * 0.35 + k / 6) % 1;
          sp.position.y = 0.9 + u * 1.5;
          sp.material.opacity = busy ? 0.22 * Math.sin(u * Math.PI) : 0;
          sp.scale.setScalar(0.6 + u * 0.7);
        });
      });
      tubSteam.forEach((sp, k) => {
        const u = (sec * 0.25 + k / 4) % 1;
        sp.position.y = 0.7 + u * 1.1;
        sp.material.opacity = 0.14 * Math.sin(u * Math.PI);
      });
      INN_BEDS.forEach((bed, i) => {
        const use = state.beds.get(i);
        foldeds[i].visible = !use;
        // 다 누우면 발끝부터 어깨까지 0.8초에 걸쳐 고르게 당겨 덮고, 일어날 땐 0.3초에 걷는다
        const want = use?.cover ?? 0;
        covers[i] = want > covers[i] ? Math.min(want, covers[i] + 1 / 48) : Math.max(want, covers[i] - 1 / 18);
        blankets[i].update(covers[i], [use?.body]);
      });
    },
  };
}
