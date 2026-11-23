import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD_HALF } from '../core/field';
import { VILLAGE, VILLAGE_DUMMY, VILLAGE_HOUSES, VILLAGE_PORTAL, VILLAGE_SPOTS, type VillageHouse } from '../data/village';
import { SIGN_FONT, liveCanvas } from './signFonts';

/**
 * 경계 마을 그림: 서울(현대 도시)과 전혀 다른 "판타지 RPG 마을".
 * 반목조 집·비늘 기와 박공지붕·굴뚝 연기, 성벽과 망루, 성문 탑·깃발·화로, 자갈길·룬 광장, 시장 노점, 선돌로 둘러싼 포탈, 반딧불이.
 * 집 자리·크기(충돌)는 data/village.ts 그대로 — 그림만 바뀐다.
 * 움직이지 않는 도형은 재질별로 하나로 합쳐 그린다 (폰에서도 그리기 횟수가 적게).
 */

// ───────────────────────── 그림(텍스처): 전부 코드로 그린다 (내려받을 파일 없음)

const seeded = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed = 1, wrap = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  // 글자가 있는 그림은 웹 글꼴이 받아진 뒤 같은 씨앗으로 다시 그린다 (무늬가 바뀌지 않게)
  liveCanvas(c, (g) => draw(g, seeded(seed)), () => (t.needsUpdate = true));
  return t;
}

/** 둥근 자갈 */
const cobbleTex = () =>
  canvasTex(
    512,
    512,
    (g, r) => {
      g.fillStyle = '#35303d';
      g.fillRect(0, 0, 512, 512);
      const n = 12;
      const cell = 512 / n;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5 + (j % 2) * 0.5) * cell + (r() - 0.5) * cell * 0.18;
          const cy = (j + 0.5) * cell + (r() - 0.5) * cell * 0.18;
          const rx = cell * (0.4 + r() * 0.06);
          const ry = cell * (0.37 + r() * 0.07);
          const rot = r() * Math.PI;
          const l = 44 + r() * 9;
          const hh = 250 + (r() - 0.5) * 24;
          const ss = 6 + r() * 10;
          for (const ox of [-512, 0, 512])
            for (const oy of [-512, 0, 512]) {
              const x = cx + ox;
              const y = cy + oy;
              if (x < -cell || x > 512 + cell || y < -cell || y > 512 + cell) continue;
              const grd = g.createRadialGradient(x - rx * 0.3, y - ry * 0.35, 2, x, y, Math.max(rx, ry));
              grd.addColorStop(0, hsl(hh, ss, l + 6));
              grd.addColorStop(1, hsl(hh, ss, l - 7));
              g.fillStyle = grd;
              g.beginPath();
              g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
              g.fill();
            }
        }
    },
    3,
  );

/** 다져진 흙 + 듬성듬성 풀 */
const dirtTex = () =>
  canvasTex(
    512,
    512,
    (g, r) => {
      g.fillStyle = '#5b4a3c';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i++) {
        g.globalAlpha = 0.3 + r() * 0.4;
        g.fillStyle = hsl(26 + r() * 16, 20 + r() * 14, 24 + r() * 22);
        const s = 1 + r() * 3;
        g.fillRect(r() * 512, r() * 512, s, s);
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 70; i++) {
        g.fillStyle = hsl(30, 8, 42 + r() * 20);
        g.beginPath();
        g.ellipse(r() * 512, r() * 512, 2 + r() * 5, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 1.5;
      for (let i = 0; i < 260; i++) {
        const x = r() * 512;
        const y = r() * 512;
        g.globalAlpha = 0.3;
        g.strokeStyle = hsl(140 + r() * 50, 32, 24 + r() * 16);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    7,
  );

/** 회반죽 벽 */
export const plasterTex = () =>
  canvasTex(
    256,
    256,
    (g, r) => {
      g.fillStyle = '#e0d3b8';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.05 + r() * 0.06;
        g.fillStyle = r() > 0.5 ? '#fff6e0' : '#9a8a70';
        g.beginPath();
        g.arc(r() * 256, r() * 256, 4 + r() * 20, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    5,
  );

/** 쌓은 돌 블록 (성벽·주춧돌·여관 1층) */
export const blockTex = () =>
  canvasTex(
    512,
    512,
    (g, r) => {
      g.fillStyle = '#2f2a38';
      g.fillRect(0, 0, 512, 512);
      const h = 64;
      for (let j = 0; j < 8; j++) {
        let x = j % 2 ? -50 : 0;
        while (x < 512) {
          const w = 74 + r() * 46;
          const l = 40 + r() * 15;
          g.fillStyle = hsl(255 + (r() - 0.5) * 24, 7 + r() * 9, l);
          g.fillRect(x + 3, j * h + 3, w - 6, h - 6);
          g.fillStyle = 'rgba(255,255,255,0.09)';
          g.fillRect(x + 3, j * h + 3, w - 6, 6);
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(x + 3, j * h + h - 9, w - 6, 6);
          x += w;
        }
      }
    },
    9,
  );

/** 나무 판자 (문·노점·통) */
export const plankTex = () =>
  canvasTex(
    256,
    256,
    (g, r) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = hsl(24 + r() * 8, 34 + r() * 10, 24 + r() * 9);
        g.fillRect(i * 64, 0, 64, 256);
        g.strokeStyle = 'rgba(0,0,0,0.16)';
        for (let k = 0; k < 9; k++) {
          const x0 = i * 64 + 6 + r() * 52;
          g.beginPath();
          g.moveTo(x0, 0);
          g.bezierCurveTo(x0 + (r() - 0.5) * 10, 90, x0 + (r() - 0.5) * 10, 170, x0, 256);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(i * 64, 0, 3, 256);
      }
    },
    11,
  );

/** 비늘 기와 (지붕 색마다 하나) — 둥근 끝이 처마 쪽을 본다 */
function shingleTex(hex: number, seed: number) {
  const c = new THREE.Color(hex);
  const o = { h: 0, s: 0, l: 0 };
  c.getHSL(o);
  const H = o.h * 360;
  const S = o.s * 100;
  const L = o.l * 100;
  return canvasTex(
    256,
    256,
    (g, r) => {
      g.fillStyle = hsl(H, S, L * 0.45);
      g.fillRect(0, 0, 256, 256);
      const th = 32;
      const tw = 32;
      for (let j = 0; j < 256 / th; j++)
        for (let i = -1; i <= 256 / tw; i++) {
          const x = i * tw + (j % 2) * (tw / 2);
          const y = j * th;
          g.fillStyle = hsl(H + (r() - 0.5) * 10, S, L * (0.8 + r() * 0.45));
          g.beginPath();
          g.moveTo(x + 1, y - 2);
          g.lineTo(x + tw - 1, y - 2);
          g.lineTo(x + tw - 1, y + th * 0.55);
          g.quadraticCurveTo(x + tw / 2, y + th + 8, x + 1, y + th * 0.55);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fillRect(x + 3, y, tw - 6, 3);
        }
    },
    seed,
  );
}

/** 바닥 룬 원 (포탈 아래·광장) */
const runeTex = (color: string, glow: string, seed: number) =>
  canvasTex(
    512,
    512,
    (g, r) => {
      g.translate(256, 256);
      g.strokeStyle = color;
      g.shadowColor = glow;
      g.shadowBlur = 14;
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 236, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 188, 0, Math.PI * 2);
      g.stroke();
      const N = 18;
      for (let k = 0; k < N; k++) {
        g.save();
        g.rotate((k / N) * Math.PI * 2);
        g.translate(0, -212);
        g.beginPath();
        let px = (r() - 0.5) * 18;
        let py = (r() - 0.5) * 18;
        g.moveTo(px, py);
        for (let s = 0; s < 2 + Math.floor(r() * 3); s++) {
          px = (r() - 0.5) * 20;
          py = (r() - 0.5) * 20;
          g.lineTo(px, py);
        }
        g.stroke();
        g.restore();
      }
      // 가운데 육각별
      g.lineWidth = 3;
      for (const off of [0, Math.PI / 3]) {
        g.beginPath();
        for (let k = 0; k <= 3; k++) {
          const a = off + (k * Math.PI * 2) / 3 - Math.PI / 2;
          const x = Math.cos(a) * 176;
          const y = Math.sin(a) * 176;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, 60, 0, Math.PI * 2);
      g.stroke();
    },
    seed,
    false,
  );

/** 마을 깃발: 보라 천에 금빛 초승달과 별 (제비꼬리) */
const bannerTex = () =>
  canvasTex(
    256,
    512,
    (g) => {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(256, 0);
      g.lineTo(256, 512);
      g.lineTo(128, 420);
      g.lineTo(0, 512);
      g.closePath();
      g.fillStyle = '#3b1f70';
      g.fill();
      g.save();
      g.clip();
      g.lineWidth = 26;
      g.strokeStyle = '#d9b45c';
      g.stroke();
      g.restore();
      g.fillStyle = '#f3d68c';
      g.beginPath();
      g.arc(128, 190, 72, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b1f70';
      g.beginPath();
      g.arc(160, 170, 64, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f3d68c';
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        const rr = k % 2 ? 14 : 34;
        g.lineTo(150 + Math.cos(a) * rr, 300 + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    },
    1,
    false,
  );

/** 노점 차양 줄무늬 */
const stripeTex = (a: string, b: string) =>
  canvasTex(256, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 32, 0, 32, 64);
    }
  });

/** 동그랗게 번지는 빛 (반딧불이·불꽃·등불 빛무리) */
export const glowTex = () =>
  canvasTex(
    64,
    64,
    (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    },
    1,
    false,
  );

/** 포탈 안쪽 소용돌이 */
const swirlTex = () =>
  canvasTex(
    512,
    512,
    (g) => {
      g.translate(256, 256);
      const grd = g.createRadialGradient(0, 0, 10, 0, 0, 250);
      grd.addColorStop(0, 'rgba(230,220,255,0.95)');
      grd.addColorStop(0.45, 'rgba(140,100,255,0.6)');
      grd.addColorStop(1, 'rgba(60,200,255,0.15)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, 250, 0, Math.PI * 2);
      g.fill();
      g.lineCap = 'round';
      for (let arm = 0; arm < 5; arm++) {
        g.strokeStyle = arm % 2 ? 'rgba(160,255,255,0.55)' : 'rgba(255,255,255,0.45)';
        g.lineWidth = 10;
        g.beginPath();
        for (let k = 0; k < 60; k++) {
          const t = k / 60;
          const a = (arm / 5) * Math.PI * 2 + t * 5;
          const rr = 20 + t * 225;
          if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
    },
    1,
    false,
  );

/** 현판 아래 작은 옛 영문 (없으면 한글만) */
const SIGN_LATIN: Record<string, string> = {
  '경계 마을': 'BORDER VILLAGE',
  '달빛 여관': 'MOONLIGHT INN',
  '촌장 집': "ELDER'S HALL",
};

/**
 * 나무 현판 (여관·촌장 집·성문): 모서리를 깎은 오래된 참나무 판 + 쇠못, 글자는 판에 파고 금박을 입힌 것처럼
 * (위쪽 그늘 · 아래쪽 빛 · 금색 그라데이션). 각진 옛 명조 + 작은 로마자 부제. 주변은 투명 (alphaTest 로 오려 낸다).
 */
export function signTexture(text: string) {
  const W = 1024;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const latin = SIGN_LATIN[text];
  liveCanvas(
    c,
    (g) => {
      const r = seeded(text.length * 97 + 13);
      const cut = 34;
      const m = 6;
      const shape = (inset: number) => {
        const a = m + inset;
        const k = cut;
        g.beginPath();
        g.moveTo(a + k, a);
        g.lineTo(W - a - k, a);
        g.lineTo(W - a, a + k);
        g.lineTo(W - a, H - a - k);
        g.lineTo(W - a - k, H - a);
        g.lineTo(a + k, H - a);
        g.lineTo(a, H - a - k);
        g.lineTo(a, a + k);
        g.closePath();
      };
      // 판: 짙은 참나무 + 결
      shape(0);
      const wood = g.createLinearGradient(0, 0, 0, H);
      wood.addColorStop(0, '#5d4029');
      wood.addColorStop(0.5, '#4b331f');
      wood.addColorStop(1, '#3a2717');
      g.fillStyle = wood;
      g.fill();
      g.save();
      shape(0);
      g.clip();
      for (let k = 0; k < 70; k++) {
        const y = r() * H;
        g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,220,170,0.05)';
        g.lineWidth = 1 + r() * 2.5;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(W * 0.33, y + (r() - 0.5) * 22, W * 0.66, y + (r() - 0.5) * 22, W, y + (r() - 0.5) * 10);
        g.stroke();
      }
      // 옹이 두어 개
      for (let k = 0; k < 2; k++) {
        const x = W * (0.15 + r() * 0.7);
        const y = H * (0.2 + r() * 0.6);
        for (let ring = 3; ring >= 1; ring--) {
          g.strokeStyle = `rgba(0,0,0,${0.08 * ring})`;
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(x, y, ring * 9, ring * 4, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
      // 판 가장자리 깎은 면: 바깥 어둡게, 안쪽 가는 빛
      shape(0);
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 10;
      g.stroke();
      shape(16);
      g.strokeStyle = 'rgba(255,214,150,0.16)';
      g.lineWidth = 2;
      g.stroke();
      shape(22);
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 2;
      g.stroke();
      // 쇠못 (네 귀퉁이)
      for (const [x, y] of [
        [62, 62],
        [W - 62, 62],
        [62, H - 62],
        [W - 62, H - 62],
      ]) {
        const nail = g.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
        nail.addColorStop(0, '#8d8680');
        nail.addColorStop(0.5, '#3b3632');
        nail.addColorStop(1, '#1c1916');
        g.fillStyle = nail;
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.fill();
      }

      // 글자: 판 글자 → 위 그늘(파인 곳) · 아래 빛(턱) · 금박
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ty = latin ? H * 0.43 : H * 0.52;
      let px = latin ? 128 : 140;
      const setMain = () => {
        g.font = `800 ${px}px ${SIGN_FONT.myeongjo}`;
        g.letterSpacing = `${Math.round(px * 0.16)}px`;
      };
      setMain();
      while (g.measureText(text).width > W * 0.72 && px > 40) {
        px -= 4;
        setMain();
      }
      const tx = W / 2 + Math.round(px * 0.08);
      g.fillStyle = 'rgba(255,226,170,0.22)';
      g.fillText(text, tx, ty + 3);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(text, tx, ty - 3);
      const gold = g.createLinearGradient(0, ty - px * 0.5, 0, ty + px * 0.5);
      gold.addColorStop(0, '#f3dca2');
      gold.addColorStop(0.45, '#d2a95c');
      gold.addColorStop(1, '#9a7134');
      g.fillStyle = gold;
      g.fillText(text, tx, ty);

      if (latin) {
        g.font = `600 34px ${SIGN_FONT.rune}`;
        g.letterSpacing = '12px';
        const lw = g.measureText(latin).width;
        const ly = H * 0.77;
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillText(latin, W / 2 + 6, ly - 2);
        g.fillStyle = '#c9a463';
        g.fillText(latin, W / 2 + 6, ly);
        // 양옆 가는 선 + 마름모
        for (const sd of [-1, 1]) {
          const x0 = W / 2 + sd * (lw / 2 + 26);
          g.fillRect(sd < 0 ? x0 - 90 : x0, ly - 1, 90, 2);
          g.save();
          g.translate(x0 + sd * 100, ly);
          g.rotate(Math.PI / 4);
          g.fillRect(-5, -5, 10, 10);
          g.restore();
        }
      }
    },
    () => (t.needsUpdate = true),
  );
  return t;
}

// ───────────────────────── 합쳐 그리기

/** 움직이지 않는 조각을 재질별로 모았다가 한 덩어리로 그린다. push/pop 으로 집·벽면 기준 좌표를 쌓는다 */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private m = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  get base() {
    return this.stack[this.stack.length - 1];
  }
  push(x: number, y: number, z: number, ry = 0) {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), this.one);
    this.stack.push(this.base.clone().multiply(local));
  }
  pop() {
    this.stack.pop();
  }
  /** 지금 기준 좌표의 한 점 → 세상 좌표 */
  world(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.base);
  }
  /** geo 는 넘겨받아 쓴다 (호출한 쪽에서 다시 쓰지 않는다). uv 로 그림 반복 수를 늘린다 */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, uv?: [number, number]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (uv) {
      const a = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv[0], a.getY(i) * uv[1]);
    }
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.v.set(x, y, z);
    this.m.compose(this.v, this.q, this.one).premultiply(this.base);
    g.applyMatrix4(this.m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }
  /** 상자. tile 을 주면 그 크기(m)마다 그림을 반복 */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 0) {
    this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry, 0, tile ? [Math.max(w, d) / tile, h / tile] : undefined);
  }
  flush(s: THREE.Object3D, noCast: Set<THREE.Material>) {
    const meshes: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !noCast.has(mat);
      mesh.receiveShadow = true;
      s.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

// ───────────────────────── 재질

function makeMats() {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...p });
  const roofs = new Map<number, THREE.MeshStandardMaterial>();
  let seed = 20;
  const glowMap = glowTex();
  return {
    dirt: std({ map: dirtTex(), roughness: 1 }),
    cobble: std({ map: cobbleTex(), roughness: 0.85 }),
    plaster: std({ map: plasterTex() }),
    block: std({ map: blockTex() }),
    stone: std({ color: 0x8a8399 }),
    beam: std({ color: 0x3a2417, roughness: 0.8 }),
    plank: std({ map: plankTex() }),
    iron: std({ color: 0x2b2a33, metalness: 0.6, roughness: 0.45 }),
    glass: std({
      color: 0xffd28a,
      emissive: 0xffa24a,
      emissiveIntensity: 1.35,
      roughness: 0.4,
    }),
    lantern: std({
      color: 0xffe0a0,
      emissive: 0xffb050,
      emissiveIntensity: 2.6,
    }),
    rune: std({ color: 0x9ff3ff, emissive: 0x4ad8ff, emissiveIntensity: 2.2 }),
    crystal: std({
      color: 0xc6a2ff,
      emissive: 0x6a48d8,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
    }),
    water: std({
      color: 0x3a6bff,
      emissive: 0x4a62ff,
      emissiveIntensity: 1.1,
      roughness: 0.2,
    }),
    leaves: std({ color: 0x4d7258, emissive: 0x08140e, roughness: 0.9, flatShading: true }),
    leaves2: std({ color: 0x5b4c7a, emissive: 0x100a1e, roughness: 0.9, flatShading: true }),
    hay: std({ color: 0xd2a94a }),
    dark: std({ color: 0x15100c, roughness: 1 }),
    awningR: std({
      map: stripeTex('#7d3444', '#eadfca'),
      side: THREE.DoubleSide,
    }),
    awningB: std({
      map: stripeTex('#33405e', '#eadfca'),
      side: THREE.DoubleSide,
    }),
    shutters: [0x3d564d, 0x5e3438, 0x3a4763, 0x6e5c40].map((c) => std({ color: c })),
    flowers: [0xe8a0b0, 0xf0d890, 0xc8b8e8, 0xf4efe4, 0xd890a0].map((c) => std({ color: c, roughness: 0.8 })),
    flags: [0x3b1f70, 0xd9b45c, 0xeadfca].map((c) => std({ color: c, side: THREE.DoubleSide })),
    potions: [0xff4a8a, 0x4affc8, 0xffd04a, 0x8a6aff].map((c) => std({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.2 })),
    roof(hex: number) {
      let m = roofs.get(hex);
      if (!m) roofs.set(hex, (m = std({ map: shingleTex(hex, seed++), roughness: 0.75 })));
      return m;
    },
    glowMap,
    glow(color: number, opacity = 1) {
      return new THREE.SpriteMaterial({
        map: glowMap,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    },
  };
}
type Mats = ReturnType<typeof makeMats>;

// ───────────────────────── 집

const DOOR_DIR: Record<VillageHouse['door'], [number, number]> = {
  east: [1, 0],
  west: [-1, 0],
  north: [0, -1],
  south: [0, 1],
};

/** 집 기준 좌표의 네 벽면 (앞면 = 문 쪽 = +z) */
const faces = (w: number, d: number) => [
  { x: 0, z: d / 2, ry: 0, len: w, front: true },
  { x: w / 2, z: 0, ry: Math.PI / 2, len: d, front: false },
  { x: 0, z: -d / 2, ry: Math.PI, len: w, front: false },
  { x: -w / 2, z: 0, ry: -Math.PI / 2, len: d, front: false },
];

/** 창문: 불 켜진 유리 + 창틀·십자 창살 + 덧문 + 꽃 화분 */
function windowAt(b: Batch, M: Mats, u: number, y: number, shutter: THREE.Material, flowers: boolean, r: () => number) {
  b.box(M.glass, 0.5, 0.62, 0.04, u, y, 0.02);
  b.box(M.beam, 0.64, 0.08, 0.08, u, y + 0.35, 0.05);
  b.box(M.beam, 0.72, 0.07, 0.16, u, y - 0.35, 0.08);
  for (const s of [-1, 1]) {
    b.box(M.beam, 0.07, 0.7, 0.08, u + s * 0.29, y, 0.05);
    b.box(shutter, 0.2, 0.68, 0.04, u + s * 0.43, y, 0.04);
  }
  b.box(M.beam, 0.04, 0.62, 0.05, u, y, 0.06);
  b.box(M.beam, 0.5, 0.04, 0.05, u, y + 0.05, 0.06);
  if (!flowers) return;
  b.box(M.plank, 0.66, 0.15, 0.18, u, y - 0.47, 0.11);
  for (let k = 0; k < 5; k++) {
    const fm = M.flowers[Math.floor(r() * M.flowers.length)];
    b.add(new THREE.SphereGeometry(0.06 + r() * 0.025, 7, 5), fm, u - 0.26 + k * 0.13, y - 0.36 + r() * 0.04, 0.12);
  }
  b.add(new THREE.BoxGeometry(0.62, 0.05, 0.14), M.leaves, u, y - 0.39, 0.11);
}

/** 한 벽면: 나무 뼈대(반목조) + 창문. 벽면 기준 좌표(바깥 = +z)에서 그린다 */
function wallFace(
  b: Batch,
  M: Mats,
  o: {
    len: number;
    y0: number;
    h: number;
    door: boolean;
    frame: boolean;
    braces: boolean;
    windows: boolean;
    flowers: boolean;
    shutter: THREE.Material;
    r: () => number;
  },
) {
  const { len, y0, h } = o;
  const bays = Math.max(1, Math.round(len / 1.15));
  const bw = len / bays;
  const T = 0.13;
  const D = 0.07;
  if (o.frame) {
    b.box(M.beam, len + T, T, D, 0, y0 + T / 2, D / 2);
    b.box(M.beam, len + T, T, D, 0, y0 + h - T / 2, D / 2);
    for (let i = 0; i <= bays; i++) {
      const u = -len / 2 + i * bw;
      if (o.door && Math.abs(u) < 0.66) continue;
      b.box(M.beam, T, h, D, u, y0 + h / 2, D / 2);
    }
  }
  for (let i = 0; i < bays; i++) {
    const cu = -len / 2 + (i + 0.5) * bw;
    const nearDoor = o.door && Math.abs(cu) < 1.1;
    const end = i === 0 || i === bays - 1;
    if (o.frame && o.braces && end && bays > 2) {
      // 끝 칸엔 X 자 버팀목
      const L = Math.hypot(bw - T, h - 2 * T);
      const a = Math.atan2(h - 2 * T, bw - T);
      for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(L, T * 0.8, D), M.beam, cu, y0 + h / 2, D / 2, 0, 0, s * a);
      continue;
    }
    if (o.windows && !nearDoor && bw >= 0.85) windowAt(b, M, cu, y0 + h * 0.55, o.shutter, o.flowers, o.r);
  }
}

/** 박공지붕: 용마루는 기준 좌표의 x 축. L = 용마루 길이, S = 폭, y0 = 처마 높이. 돌려주는 rise = 지붕 높이 */
function gableRoof(b: Batch, M: Mats, roofMat: THREE.Material, L: number, S: number, y0: number, ov = 0.35, gableMat: THREE.Material = M.plaster) {
  const a = 0.68;
  const tan = Math.tan(a);
  const rise = (S / 2) * tan;
  const half = S / 2 + ov;
  const sl = half / Math.cos(a);
  const len = L + 0.6;
  for (const s of [-1, 1]) {
    const zc = (s * half) / 2;
    const yc = y0 + rise - (half / 2) * tan + 0.05;
    b.add(new THREE.BoxGeometry(len, 0.1, sl), roofMat, 0, yc, zc, s * a, 0, 0, [len / 1.3, sl / 1.3]);
    // 박공 끝 장식 판 (처마선 테두리)
    for (const e of [-1, 1]) b.add(new THREE.BoxGeometry(0.08, 0.18, sl), M.beam, (e * len) / 2, yc - 0.02, zc, s * a, 0, 0);
  }
  b.box(M.beam, len + 0.08, 0.14, 0.22, 0, y0 + rise + 0.1, 0);
  // 박공벽 (삼각형) + 가운데 기둥 + 둥근 다락 창
  const tri = new THREE.Shape([new THREE.Vector2(-S / 2, 0), new THREE.Vector2(S / 2, 0), new THREE.Vector2(0, rise)]);
  for (const e of [-1, 1]) {
    b.add(new THREE.ShapeGeometry(tri), gableMat, (e * L) / 2, y0, 0, 0, e * (Math.PI / 2), 0, [0.6, 0.6]);
    if (rise <= 0.9) b.add(new THREE.BoxGeometry(0.07, rise, 0.12), M.beam, e * (L / 2 + 0.03), y0 + rise / 2, 0);
    b.add(new THREE.BoxGeometry(0.07, 0.12, S), M.beam, e * (L / 2 + 0.03), y0 + 0.06, 0);
    if (rise > 0.9) b.add(new THREE.CircleGeometry(0.17, 14), M.glass, e * (L / 2 + 0.07), y0 + rise * 0.42, 0, 0, e * (Math.PI / 2), 0);
  }
  return rise;
}

interface HouseOut {
  smoke: THREE.Vector3[];
  signs: { pos: THREE.Vector3; yaw: number; text: string }[];
  lanterns: THREE.Vector3[];
}

function buildHouse(b: Batch, M: Mats, h: VillageHouse, shutter: THREE.Material, r: () => number, out: HouseOut) {
  const [dx, dz] = DOOR_DIR[h.door];
  const yaw = Math.atan2(dx, dz);
  const side = dx !== 0;
  const fw = side ? h.d : h.w; // 문 쪽 벽 길이
  const fd = side ? h.w : h.d;
  const tall = h.id === 'inn' || h.id === 'chief';
  const shed = h.id === 'shed';
  const H1 = shed ? 2.1 : 2.4;
  const F = 0.3; // 주춧돌 높이
  b.push(h.x, 0, h.z, yaw);

  b.box(M.block, fw + 0.24, F, fd + 0.24, 0, F / 2, 0, 0, 1);
  const stoneFloor = h.id === 'inn';
  const wall1 = shed ? M.plank : stoneFloor ? M.block : M.plaster;
  b.box(wall1, fw, H1 - F, fd, 0, F + (H1 - F) / 2, 0, 0, shed ? 1 : 1.6);
  for (const f of faces(fw, fd)) {
    b.push(f.x, 0, f.z, f.ry);
    wallFace(b, M, {
      len: f.len,
      y0: F,
      h: H1 - F,
      door: f.front,
      frame: !stoneFloor,
      braces: false,
      windows: !shed,
      flowers: true,
      shutter,
      r,
    });
    b.pop();
  }

  let top = H1;
  let W = fw;
  let D = fd;
  if (tall) {
    // 2층은 조금 튀어나온다 (중세 집처럼)
    const H2 = 1.9;
    W = fw + 0.36;
    D = fd + 0.36;
    b.box(M.beam, W + 0.12, 0.2, D + 0.12, 0, H1 + 0.1, 0);
    b.box(M.plaster, W, H2, D, 0, H1 + 0.2 + H2 / 2, 0, 0, 1.6);
    for (const f of faces(W, D)) {
      b.push(f.x, 0, f.z, f.ry);
      wallFace(b, M, {
        len: f.len,
        y0: H1 + 0.2,
        h: H2,
        door: false,
        frame: true,
        braces: true,
        windows: true,
        flowers: f.front,
        shutter,
        r,
      });
      b.pop();
    }
    top = H1 + 0.2 + H2;
  }

  // 문 (앞면)
  b.push(0, 0, fd / 2, 0);
  const southU = Math.sin(yaw) > 0.5 ? -1 : 1; // 카메라(남쪽)에서 보이는 쪽
  if (shed) {
    b.box(M.dark, 1.2, 1.5, 0.04, 0, F + 0.75, 0.02);
    b.add(new THREE.BoxGeometry(0.6, 1.5, 0.06), M.plank, -0.75, F + 0.75, 0.32, 0, -1.1, 0);
    b.box(M.beam, 1.45, 0.14, 0.12, 0, F + 1.57, 0.06);
  } else {
    const dh = 1.75;
    b.box(M.plank, 0.9, dh, 0.08, 0, F + dh / 2, 0.04);
    for (const s of [-1, 1]) b.box(M.beam, 0.14, dh + 0.2, 0.12, s * 0.52, F + (dh + 0.2) / 2, 0.06);
    b.box(M.beam, 1.2, 0.16, 0.14, 0, F + dh + 0.12, 0.07);
    b.add(new THREE.SphereGeometry(0.05, 8, 6), M.iron, 0.3, F + 0.9, 0.11);
    b.box(M.block, 1.3, 0.14, 0.5, 0, 0.07, 0.37, 0, 1);
    // 문 위 작은 차양
    b.add(new THREE.BoxGeometry(1.5, 0.07, 0.75), M.roof(h.roof), 0, F + dh + 0.36, 0.33, 0.42, 0, 0, [1.2, 0.6]);
    // 문 옆 등불
    const lu = -southU * 0.95;
    b.box(M.iron, 0.05, 0.05, 0.28, lu, F + 1.75, 0.14);
    b.box(M.lantern, 0.16, 0.24, 0.16, lu, F + 1.6, 0.28);
    b.add(new THREE.ConeGeometry(0.15, 0.14, 4), M.iron, lu, F + 1.79, 0.28, 0, Math.PI / 4, 0);
    out.lanterns.push(b.world(lu, F + 1.6, 0.28));
    if (h.sign) {
      // 벽에서 튀어나온 쇠 팔에 매단 간판 (남쪽 카메라에서 보인다)
      const su = southU * 1.15;
      b.box(M.iron, 0.05, 0.05, 1.5, su, 2.95, 0.75);
      for (const cz of [0.3, 1.4]) b.box(M.iron, 0.03, 0.2, 0.03, su, 2.85, cz);
      out.signs.push({
        pos: b.world(su, 2.55, 0.85),
        yaw: yaw + Math.PI / 2,
        text: h.sign,
      });
    }
  }
  b.pop();

  // 지붕: 긴 쪽이 용마루
  const ridgeX = W >= D;
  const roofMat = M.roof(h.roof);
  b.push(0, 0, 0, ridgeX ? 0 : Math.PI / 2);
  const L = ridgeX ? W : D;
  const S = ridgeX ? D : W;
  const rise = gableRoof(b, M, roofMat, L, S, top, 0.38, shed ? M.plank : M.plaster);
  if (!shed) {
    // 돌 굴뚝 (뒤쪽 경사) + 연기 나올 자리
    const cx = L * 0.28;
    const cz = -S * 0.2;
    const ys = top + rise - S * 0.2 * Math.tan(0.68);
    const ct = top + rise + 0.75;
    b.box(M.block, 0.5, ct - ys + 0.3, 0.5, cx, (ct + ys - 0.3) / 2, cz, 0, 0.8);
    b.box(M.stone, 0.62, 0.12, 0.62, cx, ct, cz);
    out.smoke.push(b.world(cx, ct + 0.15, cz));
  }
  b.pop();
  b.pop();
}

/** 우물: 돌 테두리, 빛나는 물 (콩이가 말한 "이상한 빛"), 작은 지붕, 도르래와 두레박 */
function buildWell(b: Batch, M: Mats, h: VillageHouse) {
  b.push(h.x, 0, h.z, 0);
  b.add(new THREE.CylinderGeometry(0.75, 0.84, 0.8, 18), M.block, 0, 0.4, 0, 0, 0, 0, [3, 0.6]);
  b.add(new THREE.TorusGeometry(0.76, 0.09, 6, 22), M.stone, 0, 0.82, 0, Math.PI / 2);
  b.add(new THREE.CircleGeometry(0.67, 22), M.water, 0, 0.83, 0, -Math.PI / 2);
  for (const s of [-1, 1]) b.box(M.beam, 0.12, 1.45, 0.12, s * 0.72, 1.5, 0);
  b.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), M.beam, 0, 1.78, 0, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), M.beam, 0.15, 1.46, 0);
  b.add(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 10), M.plank, 0.15, 1.08, 0);
  gableRoof(b, M, M.roof(0x8a3a3a), 1.7, 1.45, 2.2, 0.18, M.plank);
  b.pop();
}

// ───────────────────────── 소품

function barrel(b: Batch, M: Mats, x: number, z: number, r = 0.3) {
  b.add(new THREE.CylinderGeometry(r, r * 0.92, 0.85, 12), M.plank, x, 0.425, z, 0, 0, 0, [2, 1]);
  for (const y of [0.18, 0.67]) b.add(new THREE.CylinderGeometry(r + 0.015, r + 0.015, 0.05, 12), M.iron, x, y, z);
}
function crate(b: Batch, M: Mats, x: number, y: number, z: number, s = 0.55, ry = 0) {
  b.box(M.plank, s, s, s, x, y + s / 2, z, ry);
  b.box(M.beam, s + 0.02, 0.06, s + 0.02, x, y + s - 0.03, z, ry);
  b.box(M.beam, s + 0.02, 0.06, s + 0.02, x, y + 0.03, z, ry);
}

/** 시장 노점 (기준 좌표에서 앞 = +z) */
function stall(b: Batch, M: Mats, x: number, z: number, ry: number, kind: 'fruit' | 'arms', r: () => number) {
  b.push(x, 0, z, ry);
  b.box(M.plank, 1.9, 0.9, 0.7, 0, 0.45, 0, 0, 1);
  b.box(M.beam, 2.0, 0.08, 0.8, 0, 0.94, 0);
  for (const sx of [-1, 1]) {
    b.box(M.beam, 0.09, 1.95, 0.09, sx * 0.94, 0.975, 0.4);
    b.box(M.beam, 0.09, 2.35, 0.09, sx * 0.94, 1.175, -0.4);
  }
  const aw = kind === 'fruit' ? M.awningR : M.awningB;
  b.add(new THREE.BoxGeometry(2.25, 0.04, 1.25), aw, 0, 2.15, 0.05, 0.32, 0, 0);
  b.box(aw, 2.25, 0.24, 0.02, 0, 1.86, 0.65);
  if (kind === 'fruit') {
    for (let k = 0; k < 3; k++) {
      const cx = -0.6 + k * 0.6;
      b.box(M.plank, 0.48, 0.2, 0.42, cx, 1.08, 0.05);
      const fm = M.flowers[[0, 1, 3][k]];
      for (let n = 0; n < 6; n++)
        b.add(new THREE.SphereGeometry(0.075, 8, 6), fm, cx - 0.14 + (n % 3) * 0.14, 1.2 + r() * 0.03, -0.06 + Math.floor(n / 3) * 0.14);
    }
  } else {
    // 무구 노점: 판 위에 눕힌 칼 셋 · 뒤에 세운 둥근 방패 · 투구 하나 (차원 장비는 여기서 은화로 산다)
    for (let k = 0; k < 3; k++) {
      const sx = -0.75 + k * 0.32;
      b.box(M.iron, 0.05, 0.02, 0.62, sx, 0.97, 0.05);
      b.box(M.beam, 0.16, 0.03, 0.04, sx, 0.98, -0.28);
      b.box(M.plank, 0.04, 0.035, 0.14, sx, 0.98, -0.37);
    }
    b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 18), M.plank, 0.45, 1.3, -0.3, Math.PI / 2 - 0.25, 0, 0);
    b.add(new THREE.SphereGeometry(0.07, 10, 8), M.iron, 0.45, 1.33, -0.26);
    b.add(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.iron, 0.05, 0.96, 0.15);

  }
  b.pop();
}

function tree(b: Batch, M: Mats, x: number, z: number, purple: boolean) {
  b.add(new THREE.CylinderGeometry(0.14, 0.24, 2.2, 7), M.beam, x, 1.1, z);
  const lm = purple ? M.leaves2 : M.leaves;
  b.add(new THREE.IcosahedronGeometry(1.15, 1), lm, x, 2.7, z);
  b.add(new THREE.IcosahedronGeometry(0.8, 1), lm, x + 0.55, 2.3, z + 0.3);
  b.add(new THREE.IcosahedronGeometry(0.75, 1), lm, x - 0.5, 2.4, z - 0.2);
}

function bench(b: Batch, M: Mats, x: number, z: number, ry: number) {
  b.push(x, 0, z, ry);
  b.box(M.plank, 1.4, 0.07, 0.4, 0, 0.45, 0);
  b.box(M.plank, 1.4, 0.3, 0.06, 0, 0.7, -0.18);
  for (const s of [-1, 1]) b.box(M.iron, 0.06, 0.45, 0.36, s * 0.6, 0.225, 0);
  b.pop();
}

/**
 * 0장 소품: 의뢰 게시판(종이 몇 장), 여관 앞 방명록 받침대(펼친 책), 북문 옆 허수아비(짚 몸통 + 나무 십자)
 */
function storyProps(b: Batch, M: Mats) {
  const paper = M.flags[2];
  for (const sp of VILLAGE_SPOTS) {
    if (sp.id === 'board') {
      // 광장 쪽(서쪽)을 보는 게시판
      b.push(sp.x, 0, sp.z, -Math.PI / 2);
      for (const s of [-1, 1]) b.box(M.beam, 0.1, 1.9, 0.1, s * 0.62, 0.95, 0);
      b.box(M.plank, 1.4, 0.9, 0.06, 0, 1.35, 0.02);
      b.box(M.beam, 1.55, 0.08, 0.2, 0, 1.86, 0.04);
      const notes: [number, number, number, number][] = [
        [-0.42, 1.48, 0.32, 0.4],
        [0.02, 1.38, 0.34, 0.46],
        [0.44, 1.52, 0.28, 0.34],
        [0.38, 1.12, 0.3, 0.22],
        [-0.38, 1.08, 0.36, 0.24],
      ];
      for (const [x, y, w, h] of notes) b.box(paper, w, h, 0.01, x, y, 0.06);
      b.pop();
    } else if (sp.id === 'book') {
      // 여관 문 옆 받침대 위 펼친 방명록
      b.push(sp.x, 0, sp.z, Math.PI / 2);
      b.box(M.beam, 0.12, 0.95, 0.12, 0, 0.47, 0);
      b.box(M.plank, 0.5, 0.05, 0.38, 0, 0.98, 0, 0);
      for (const s of [-1, 1]) {
        const page = new THREE.BoxGeometry(0.21, 0.025, 0.3);
        b.add(page, paper, s * 0.11, 1.02, 0, 0, 0, -s * 0.12);
      }
      b.pop();
    }
  }
  // 허수아비: 나무 기둥 + 가로대, 짚 몸통·머리, 천 조각
  const { x, z } = VILLAGE_DUMMY;
  b.push(x, 0, z, 0.3);
  b.add(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 8), M.beam, 0, 0.95, 0);
  b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), M.beam, 0, 1.35, 0, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 12), M.hay, 0, 1.15, 0);
  b.add(new THREE.SphereGeometry(0.19, 12, 10), M.hay, 0, 1.72, 0);
  b.box(M.awningR, 0.5, 0.18, 0.46, 0, 1.4, 0);
  b.pop();
}

// ───────────────────────── 마을

export interface VillageScene {
  portal: THREE.Group;
  /** 매 프레임: 포탈 소용돌이, 깃발, 불꽃, 연기, 반딧불이, 떠 있는 수정 (t = 프레임 수), 내 캐릭터를 가리는 건물 반투명 (px, pz = 내 위치) */
  update(t: number, px: number, pz: number): void;
}

/**
 * 경계 마을을 그린다: 자갈길·룬 광장, 성벽·망루(북문만 열림), 반목조 집·여관·촌장 집, 우물, 노점, 등불, 선돌 포탈.
 */
export function buildVillage(s: THREE.Scene): VillageScene {
  const { x0, x1, z0, z1, gate } = VILLAGE;
  const P = VILLAGE_PORTAL;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const r = seeded(42);
  const M = makeMats();
  const b = new Batch();
  const noCast = new Set<THREE.Material>([M.dirt, M.cobble, M.glass, M.lantern, M.rune, M.water]);
  const out: HouseOut = { smoke: [], signs: [], lanterns: [] };
  const anim: ((sec: number) => void)[] = [];

  /**
   * 캐릭터를 가리는 높은 건물(성문 탑·북쪽 망루·집)은 따로 묶어, 내 캐릭터가 그 뒤(북쪽)에 서면 반투명해진다.
   * test(x, z) = 이 자리에 서면 이 건물에 가려진다.
   */
  const faders: {
    mats: THREE.Material[];
    test: (x: number, z: number) => boolean;
    a: number;
  }[] = [];
  const fadeZone = (test: (x: number, z: number) => boolean, build: (fb: Batch) => void, extras: () => THREE.Mesh[] = () => []) => {
    const fb = new Batch();
    build(fb);
    const mats: THREE.Material[] = [];
    for (const m of [...fb.flush(s, noCast), ...extras()]) {
      const c = (m.material as THREE.Material).clone();
      c.transparent = true;
      if (c.alphaTest) c.alphaTest = 0.05;
      m.material = c;
      mats.push(c);
    }
    faders.push({ mats, test, a: 1 });
  };

  // ── 바닥: 흙, 자갈 큰길(성문 → 포탈), 집으로 가는 샛길, 둥근 광장
  const ground = (w: number, d: number, x: number, z: number, y: number, mat: THREE.Material, tile: number) =>
    b.add(new THREE.PlaneGeometry(w, d), mat, x, y, z, -Math.PI / 2, 0, 0, [w / tile, d / tile]);
  ground(x1 - x0, z1 - z0, cx, cz, 0.006, M.dirt, 4);
  const roadEnd = P.z - 1.6;
  ground(gate * 2 - 0.4, roadEnd - FIELD_HALF + 0.5, 0, (roadEnd + FIELD_HALF - 0.5) / 2, 0.012, M.cobble, 2.4);
  for (const h of VILLAGE_HOUSES) {
    if (h.id === 'well') continue;
    const [dx] = DOOR_DIR[h.door];
    const doorX = h.x + (dx * h.w) / 2;
    const a = Math.min(doorX, 0);
    const c = Math.max(doorX, 0);
    ground(c - a - gate, h.id === 'shed' ? 1.2 : 1.5, (a + c) / 2 + (dx > 0 ? -gate / 2 : gate / 2), h.z, 0.011, M.cobble, 2.4);
  }
  b.add(new THREE.CircleGeometry(3.6, 48), M.cobble, 0, 0.014, 30.6, -Math.PI / 2, 0, 0, [3, 3]);
  b.add(new THREE.RingGeometry(3.55, 3.85, 48), M.stone, 0, 0.016, 30.6, -Math.PI / 2);

  // 광장 룬 (은은하게 숨 쉰다)
  const plazaRuneMat = new THREE.MeshBasicMaterial({
    map: runeTex('#ffd98a', '#ff9a40', 4),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const plazaRune = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), plazaRuneMat);
  plazaRune.rotation.x = -Math.PI / 2;
  plazaRune.position.set(0, 0.02, 30.6);
  s.add(plazaRune);
  anim.push((sec) => (plazaRuneMat.opacity = 0.2 + Math.sin(sec * 1.3) * 0.06));

  // ── 성벽: 쌓은 돌 + 위에 톱니(총안), 네 귀퉁이 망루
  const wallH = 1.5;
  const WT = 0.55;
  const wall = (ax: number, az: number, bx: number, bz: number, hgt = wallH, merlons = true) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ang = -Math.atan2(bz - az, bx - ax);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    b.add(new THREE.BoxGeometry(len, hgt, WT), M.block, mx, hgt / 2, mz, 0, ang, 0, [len / 1.6, hgt / 1.6]);
    b.add(new THREE.BoxGeometry(len + 0.08, 0.12, WT + 0.12), M.stone, mx, hgt + 0.06, mz, 0, ang);
    if (!merlons) return;
    const n = Math.floor(len / 0.9);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      b.add(new THREE.BoxGeometry(0.42, 0.36, WT + 0.04), M.block, ax + (bx - ax) * t, hgt + 0.3, az + (bz - az) * t, 0, ang, 0, [0.3, 0.25]);
    }
  };
  wall(x0, z1, x1, z1, 0.9, false); // 남쪽(카메라 쪽)은 낮게: 포탈 앞을 가리지 않는다
  wall(x0, z0, x0, z1);
  wall(x1, z0, x1, z1);
  wall(x0, z0, -gate - 1.4, z0);
  wall(gate + 1.4, z0, x1, z0);
  wall(-gate, FIELD_HALF, -gate, z0 - 0.7, 1.0, false);
  wall(gate, FIELD_HALF, gate, z0 - 0.7, 1.0, false);

  const bobbers: { o: THREE.Object3D; y: number; k: number }[] = [];
  const floatCrystal = (x: number, y: number, z: number, sc = 1) => {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * sc, 0), M.crystal);
    c.scale.y = 1.6;
    c.position.set(x, y, z);
    s.add(c);
    bobbers.push({ o: c, y, k: bobbers.length * 1.7 });
  };
  const towerRoof = M.roof(0x2c3148);
  const tower = (b: Batch, tx: number, tz: number) => {
    b.add(new THREE.CylinderGeometry(0.95, 1.05, 3.4, 14), M.block, tx, 1.7, tz, 0, 0, 0, [5, 2.2]);
    b.add(new THREE.CylinderGeometry(1.12, 1.12, 0.22, 14), M.stone, tx, 3.45, tz);
    b.add(new THREE.ConeGeometry(1.3, 1.7, 14), towerRoof, tx, 3.56 + 0.85, tz, 0, 0, 0, [3, 1]);
    // 안쪽(마을 쪽)으로 난 불 켜진 좁은 창
    const ix = -Math.sign(tx) * 0.74;
    const iz = (tz < cz ? 1 : -1) * 0.74;
    b.add(new THREE.BoxGeometry(0.14, 0.5, 0.14), M.glass, tx + ix, 2.4, tz + iz);
    floatCrystal(tx, 5.9, tz, 1);
  };
  tower(b, x0, z1);
  tower(b, x1, z1);
  for (const tx of [x0, x1])
    fadeZone(
      (x, z) => Math.abs(x - tx) < 2.2 && z > z0 - 5.5 && z < z0 + 0.5,
      (fb) => tower(fb, tx, z0),
    );

  // ── 북문: 돌탑 둘 + 위를 잇는 돌다리 + 현판 + 깃발
  const gateParts = (b: Batch) => {
    for (const sx of [-1, 1]) {
      const tx = sx * (gate + 0.7);
      b.box(M.block, 1.4, 4.2, 1.4, tx, 2.1, z0, 0, 1.4);
      b.box(M.stone, 1.6, 0.16, 1.6, tx, 4.28, z0);
      b.add(new THREE.ConeGeometry(1.2, 1.5, 4), towerRoof, tx, 4.36 + 0.75, z0, 0, Math.PI / 4, 0, [2, 1]);
      floatCrystal(tx, 6.4, z0, 0.8);
    }
    b.box(M.block, gate * 2, 0.95, 1.2, 0, 3.6, z0, 0, 1.4);
    b.box(M.beam, gate * 2, 0.18, 1.28, 0, 3.08, z0);
    for (let k = 0; k < 5; k++) b.box(M.block, 0.4, 0.34, 1.24, -gate + 0.5 + k * ((gate * 2 - 1) / 4), 4.25, z0);
  };
  const plates: THREE.Mesh[] = [];
  // 현판은 모서리를 깎은 모양이라 바깥 투명한 곳은 오려 낸다 · 빛을 받지 않는 재질이라 살짝 낮춘 밝기
  const plateMat = new THREE.MeshBasicMaterial({
    map: signTexture(VILLAGE.name),
    color: 0xe8e2da,
    alphaTest: 0.5,
  });
  for (const sd of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), plateMat);
    plate.position.set(0, 3.6, z0 + sd * 0.62);
    plate.rotation.y = sd > 0 ? 0 : Math.PI;
    s.add(plate);
    plates.push(plate);
  }
  // 깃발: 성문 탑 양쪽 면에 매단다 (바람에 흔들린다)
  const banMat = new THREE.MeshStandardMaterial({
    map: bannerTex(),
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const banGeo = new THREE.PlaneGeometry(0.95, 1.9);
  banGeo.translate(0, -0.95, 0);
  const banners: THREE.Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(banGeo, banMat);
      m.position.set(sx * (gate + 0.7), 3.7, z0 + sd * 0.74);
      m.rotation.y = sd > 0 ? 0 : Math.PI;
      m.castShadow = true;
      s.add(m);
      banners.push(m);
    }
  // 성문을 지나거나 그 너머(사냥터 쪽)에 서면 탑·현판·깃발이 반투명해진다
  fadeZone(
    (x, z) => Math.abs(x) < gate + 2.4 && z > z0 - 5 && z < z0 + 0.9,
    gateParts,
    () => [...plates, ...banners],
  );
  anim.push((sec) => banners.forEach((m, i) => (m.rotation.x = Math.sin(sec * 1.6 + i * 1.3) * 0.07 * (m.rotation.y ? -1 : 1))));

  // 성문 안쪽 화로 두 개 (불꽃 + 진짜 빛 하나)
  const fires: { o: THREE.Sprite; k: number; s: number }[] = [];
  for (const sx of [-1, 1]) {
    const fx = sx * 3.3;
    const fz = z0 + 2.6;
    b.add(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 8), M.block, fx, 0.45, fz, 0, 0, 0, [1, 1]);
    b.add(new THREE.CylinderGeometry(0.42, 0.24, 0.26, 10), M.iron, fx, 1.02, fz);
    for (const [fc, sc, y] of [
      [0xff7a20, 1.1, 1.45],
      [0xffd060, 0.6, 1.35],
    ] as const) {
      const f = new THREE.Sprite(M.glow(fc));
      f.position.set(fx, y, fz);
      f.scale.setScalar(sc);
      s.add(f);
      fires.push({ o: f, k: fires.length * 2.1, s: sc });
    }
  }
  const fireLight = new THREE.PointLight(0xff9a40, 5, 10, 2);
  fireLight.position.set(0, 1.8, z0 + 2.4);
  s.add(fireLight);
  anim.push((sec) => {
    fireLight.intensity = 4.6 + Math.sin(sec * 13) * 0.4 + Math.sin(sec * 7.3) * 0.4;
    for (const f of fires) f.o.scale.setScalar(f.s * (0.9 + Math.sin(sec * 11 + f.k) * 0.08 + Math.sin(sec * 17 + f.k) * 0.05));
  });

  // ── 집들
  const shutterOf: Record<string, number> = {
    inn: 0,
    chief: 1,
    houseA: 2,
    houseB: 3,
  };
  // 매단 간판 (앞뒤 두 장 — 글자가 거꾸로 보이지 않게)
  const hangSigns = () => {
    const made: THREE.Mesh[] = [];
    for (const sg of out.signs.splice(0)) {
      const mat = new THREE.MeshBasicMaterial({ map: signTexture(sg.text), color: 0xe8e2da, alphaTest: 0.5 });
      for (const flip of [0, Math.PI]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), mat);
        m.position.copy(sg.pos);
        m.rotation.y = sg.yaw + flip;
        m.translateZ(0.015);
        s.add(m);
        made.push(m);
      }
    }
    return made;
  };
  for (const h of VILLAGE_HOUSES) {
    if (h.id === 'well') {
      buildWell(b, M, h);
      continue;
    }
    const tall = h.id === 'inn' || h.id === 'chief';
    const north = h.z - h.d / 2;
    fadeZone(
      (x, z) => Math.abs(x - h.x) < h.w / 2 + 0.7 && z < north + 0.6 && z > north - (tall ? 3.8 : 2.4),
      (fb) => buildHouse(fb, M, h, M.shutters[shutterOf[h.id] ?? 0], r, out),
      hangSigns,
    );
  }

  // ── 등불 기둥 (쇠 기둥 + 매단 등) + 깃발 줄
  const lamps: [number, number][] = [
    [-3.4, 33.6],
    [3.4, 33.6],
    [-6.6, 28],
    [6.6, 28],
    [-6.6, 35],
    [6.6, 35],
  ];
  const lampTop = new Map<string, THREE.Vector3>();
  const halos: THREE.Sprite[] = [];
  for (const [x, z] of lamps) {
    const dir = x < 0 ? 1 : -1;
    b.add(new THREE.CylinderGeometry(0.05, 0.07, 2.75, 6), M.iron, x, 1.375, z);
    b.add(new THREE.CylinderGeometry(0.14, 0.2, 0.25, 8), M.iron, x, 0.125, z);
    b.box(M.iron, 0.5, 0.05, 0.05, x + dir * 0.22, 2.62, z);
    b.add(new THREE.SphereGeometry(0.07, 8, 6), M.iron, x, 2.78, z);
    const lx = x + dir * 0.44;
    b.box(M.lantern, 0.2, 0.28, 0.2, lx, 2.34, z);
    b.add(new THREE.ConeGeometry(0.17, 0.16, 4), M.iron, lx, 2.56, z, 0, Math.PI / 4, 0);
    b.box(M.iron, 0.24, 0.04, 0.24, lx, 2.19, z);
    const halo = new THREE.Sprite(M.glow(0xffb060, 0.55));
    halo.position.set(lx, 2.34, z);
    halo.scale.setScalar(1.1);
    s.add(halo);
    halos.push(halo);
    lampTop.set(`${x},${z}`, new THREE.Vector3(x, 2.74, z));
  }
  for (const p of out.lanterns) {
    const halo = new THREE.Sprite(M.glow(0xffb060, 0.5));
    halo.position.copy(p);
    halo.scale.setScalar(0.9);
    s.add(halo);
    halos.push(halo);
  }
  anim.push((sec) => halos.forEach((h, i) => (h.material.opacity = 0.45 + Math.sin(sec * 5 + i * 2.3) * 0.06)));
  const lampLight = new THREE.PointLight(0xffb060, 5, 10, 2);
  lampLight.position.set(0, 2.4, 33);
  s.add(lampLight);

  const bunting = (a: THREE.Vector3, c: THREE.Vector3) => {
    const N = 16;
    const sag = 0.5;
    const at = (t: number) => new THREE.Vector3(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (c.z - a.z) * t);
    const ry = -Math.atan2(c.z - a.z, c.x - a.x);
    const flag = new THREE.Shape([new THREE.Vector2(-0.13, 0), new THREE.Vector2(0.13, 0), new THREE.Vector2(0, -0.3)]);
    for (let k = 0; k < N; k++) {
      const p = at(k / N);
      const q = at((k + 1) / N);
      const len = p.distanceTo(q);
      const pitch = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
      b.add(new THREE.BoxGeometry(len, 0.015, 0.015), M.beam, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2, 0, ry, pitch);
      if (k > 0) b.add(new THREE.ShapeGeometry(flag), M.flags[k % M.flags.length], p.x, p.y, p.z, 0, ry, 0);
    }
  };
  const lt = (x: number, z: number) => lampTop.get(`${x},${z}`)!;
  bunting(lt(-6.6, 35), lt(-3.4, 33.6));
  bunting(lt(-3.4, 33.6), lt(3.4, 33.6));
  bunting(lt(3.4, 33.6), lt(6.6, 35));

  // ── 노점 두 곳 (과일 · 무구 — 차원 장비 상점), 통·상자·건초·수레·벤치·나무
  stall(b, M, -6.0, 37.7, Math.PI / 2, 'fruit', r);
  stall(b, M, 6.0, 37.7, -Math.PI / 2, 'arms', r);
  barrel(b, M, -8.2, 33.4);
  barrel(b, M, -7.6, 33.8, 0.27);
  crate(b, M, -8.2, 0, 34.2, 0.5, 0.3);
  barrel(b, M, 8.4, 27.6);
  crate(b, M, 8.0, 0, 27.0, 0.55, -0.2);
  crate(b, M, 8.0, 0.55, 27.0, 0.42, 0.4);
  crate(b, M, -3.9, 0, z0 + 0.8, 0.55);
  crate(b, M, -4.5, 0, z0 + 0.8, 0.5, 0.3);
  barrel(b, M, 5.4, z0 + 0.75);
  // 헛간 옆 건초 더미와 수레
  for (const [hx, hz] of [
    [-8.0, 24.8],
    [-7.6, 25.6],
  ] as const)
    b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12), M.hay, hx, 0.42, hz, 0, 0, Math.PI / 2);
  b.box(M.plank, 1.5, 0.12, 0.95, -6.3, 0.62, 26.6, 0.25);
  b.box(M.plank, 1.5, 0.3, 0.05, -6.3, 0.83, 26.6 + 0.47, 0.25);
  for (const s2 of [-1, 1]) b.add(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 14), M.beam, -6.3, 0.38, 26.6 + s2 * 0.52, Math.PI / 2, 0.25, 0);
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), M.beam, -5.1, 0.45, 26.3, 0, 0.25, Math.PI / 2 - 0.35);
  bench(b, M, 4.1, 30.6, -Math.PI / 2);
  bench(b, M, -3.6, 28.0, 0.5);
  storyProps(b, M);
  tree(b, M, -11.6, 34.3, false);
  tree(b, M, 11.6, 34.2, true);
  tree(b, M, 11.4, 25.4, false);

  // ── 포탈: 돌 단상, 바닥 룬, 돌 고리 + 쐐기돌, 양옆 돌기둥, 앞쪽 반원으로 선돌, 소용돌이
  b.add(new THREE.CylinderGeometry(1.75, 1.9, 0.18, 36), M.block, P.x, 0.09, P.z, 0, 0, 0, [6, 0.3]);
  b.add(new THREE.CylinderGeometry(1.35, 1.45, 0.16, 36), M.stone, P.x, 0.26, P.z);
  b.add(new THREE.TorusGeometry(1.3, 0.17, 10, 48), M.stone, P.x, 1.66, P.z);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + Math.PI / 2;
    b.add(new THREE.BoxGeometry(0.3, 0.42, 0.44), M.block, P.x + Math.cos(a) * 1.3, 1.66 + Math.sin(a) * 1.3, P.z, 0, 0, a, [0.3, 0.3]);
  }
  for (const sx of [-1, 1]) {
    b.box(M.block, 0.42, 3.1, 0.42, P.x + sx * 1.75, 1.55, P.z, 0, 1);
    b.box(M.stone, 0.56, 0.14, 0.56, P.x + sx * 1.75, 3.15, P.z);
    floatCrystal(P.x + sx * 1.75, 3.55, P.z, 0.45);
  }
  for (const deg of [-75, -38, 38, 75]) {
    const a = (deg * Math.PI) / 180;
    const sx = P.x + Math.sin(a) * 2.5;
    const sz = P.z - Math.cos(a) * 2.5;
    const sh = 1.2 + r() * 0.5;
    b.add(new THREE.CylinderGeometry(0.16, 0.3, sh, 5), M.block, sx, sh / 2, sz, 0, r() * 3, 0, [1, 1]);
    b.add(new THREE.BoxGeometry(0.06, 0.45, 0.14), M.rune, sx - Math.sin(a) * 0.2, sh * 0.6, sz + Math.cos(a) * 0.2, 0, -a, 0);
  }
  const portalRuneMat = new THREE.MeshBasicMaterial({
    map: runeTex('#a8f6ff', '#4ad8ff', 9),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const portalRune = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), portalRuneMat);
  portalRune.rotation.x = -Math.PI / 2;
  portalRune.position.set(P.x, 0.36, P.z);
  s.add(portalRune);

  const portal = new THREE.Group();
  const glowRingMat = new THREE.MeshStandardMaterial({
    color: 0x7ef3ff,
    emissive: 0x38d8ff,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.05, 8, 64), glowRingMat);
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, 48),
    new THREE.MeshBasicMaterial({
      map: swirlTex(),
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  portal.add(glowRing, veil);
  portal.position.set(P.x, 1.66, P.z);
  s.add(portal);
  const motes: THREE.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Sprite(M.glow(k % 2 ? 0x8af4ff : 0xb89aff, 0.9));
    m.scale.setScalar(0.22);
    s.add(m);
    motes.push(m);
  }
  const glow = new THREE.PointLight(0x6fdcff, 6, 9, 2);
  glow.position.set(P.x, 1.6, P.z - 0.6);
  s.add(glow);
  anim.push((sec) => {
    veil.rotation.z = -sec * 0.7;
    glowRing.scale.setScalar(1 + Math.sin(sec * 2.4) * 0.03);
    glowRingMat.emissiveIntensity = 2.2 + Math.sin(sec * 2.4) * 0.6;
    portalRuneMat.opacity = 0.65 + Math.sin(sec * 1.8) * 0.2;
    motes.forEach((m, k) => {
      const a = sec * (0.6 + (k % 3) * 0.15) + (k / motes.length) * Math.PI * 2;
      const rr = 1.35 + Math.sin(sec * 1.3 + k) * 0.18;
      m.position.set(P.x + Math.cos(a) * rr, 1.66 + Math.sin(a) * rr, P.z + Math.sin(sec + k) * 0.25);
    });
  });

  // ── 우물의 이상한 빛: 푸른 빛무리 + 천천히 떠오르는 빛 알갱이
  const well = VILLAGE_HOUSES.find((h) => h.id === 'well');
  if (well) {
    const wg = new THREE.Sprite(M.glow(0x5a7cff, 0.7));
    wg.position.set(well.x, 1.0, well.z);
    wg.scale.setScalar(1.7);
    s.add(wg);
    const wl = new THREE.PointLight(0x5a7cff, 2.5, 5, 2);
    wl.position.set(well.x, 1.1, well.z);
    s.add(wl);
    const rising: THREE.Sprite[] = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Sprite(M.glow(0x9ab0ff, 0.8));
      m.scale.setScalar(0.12);
      s.add(m);
      rising.push(m);
    }
    anim.push((sec) => {
      wg.material.opacity = 0.55 + Math.sin(sec * 1.7) * 0.15;
      rising.forEach((m, k) => {
        const p = (sec * 0.25 + k / rising.length) % 1;
        m.position.set(well.x + Math.sin(k * 2.1 + sec) * 0.3, 0.9 + p * 2.2, well.z + Math.cos(k * 1.7 + sec) * 0.3);
        m.material.opacity = (1 - p) * 0.9;
      });
    });
  }

  // ── 굴뚝 연기
  const smokeMap = canvasTex(
    64,
    64,
    (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(220,215,235,0.8)');
      grd.addColorStop(1, 'rgba(220,215,235,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    },
    1,
    false,
  );
  const puffs: { o: THREE.Sprite; from: THREE.Vector3; k: number }[] = [];
  for (const from of out.smoke)
    for (let k = 0; k < 6; k++) {
      const o = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeMap,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      );
      s.add(o);
      puffs.push({ o, from, k: k / 6 + puffs.length * 0.37 });
    }
  anim.push((sec) => {
    for (const p of puffs) {
      const f = (sec * 0.18 + p.k) % 1;
      p.o.position.set(p.from.x + Math.sin(f * 3 + p.k * 9) * 0.25 + f * 0.6, p.from.y + f * 2.4, p.from.z - f * 0.3);
      p.o.scale.setScalar(0.35 + f * 1.1);
      p.o.material.opacity = Math.sin(f * Math.PI) * 0.4;
    }
  });

  // ── 풀 포기와 꽃: 벽 밑·집 둘레에만 (길과 광장은 비운다)
  const nearHouse = (x: number, z: number) =>
    VILLAGE_HOUSES.some((h) => {
      const dx = Math.max(Math.abs(x - h.x) - h.w / 2, 0);
      const dz = Math.max(Math.abs(z - h.z) - h.d / 2, 0);
      const d = Math.hypot(dx, dz);
      return d > 0.25 && d < 0.9;
    });
  const insideHouse = (x: number, z: number) => VILLAGE_HOUSES.some((h) => Math.abs(x - h.x) < h.w / 2 + 0.25 && Math.abs(z - h.z) < h.d / 2 + 0.25);
  const tufts: THREE.Vector3[] = [];
  for (let i = 0; i < 3000 && tufts.length < 190; i++) {
    const x = x0 + 0.5 + r() * (x1 - x0 - 1);
    const z = z0 + 0.5 + r() * (z1 - z0 - 1);
    if (Math.abs(x) < gate + 0.3 || Math.hypot(x, z - 30.6) < 4.1 || Math.hypot(x - P.x, z - P.z) < 3.2 || insideHouse(x, z)) continue;
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z) < 1.3;
    if (!edge && !nearHouse(x, z)) continue;
    tufts.push(new THREE.Vector3(x, 0, z));
  }
  const tuftGeo = new THREE.IcosahedronGeometry(0.2, 0);
  tuftGeo.scale(1, 0.62, 1);
  tuftGeo.translate(0, 0.09, 0);
  const grass = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), tufts.length * 3);
  const flowerMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.06, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    tufts.length,
  );
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  let gi = 0;
  let fi = 0;
  const flowerCols = [0xe8a0b0, 0xf0d890, 0xc8b8e8, 0xf4efe4];
  for (const t of tufts) {
    for (let k = 0; k < 3; k++) {
      e.set(0, r() * 3, 0);
      const sc = 0.7 + r() * 0.7;
      mtx.compose(new THREE.Vector3(t.x + (r() - 0.5) * 0.25, 0, t.z + (r() - 0.5) * 0.25), q.setFromEuler(e), new THREE.Vector3(sc, sc, sc));
      grass.setMatrixAt(gi, mtx);
      grass.setColorAt(gi++, col.setHSL(0.3 + r() * 0.06, 0.45, 0.13 + r() * 0.06));
    }
    if (r() < 0.3) {
      mtx.makeTranslation(t.x + (r() - 0.5) * 0.3, 0.2 + r() * 0.06, t.z + (r() - 0.5) * 0.3);
      flowerMesh.setMatrixAt(fi, mtx);
      flowerMesh.setColorAt(fi++, col.set(flowerCols[Math.floor(r() * flowerCols.length)]));
    }
  }
  grass.count = gi;
  flowerMesh.count = fi;
  grass.receiveShadow = true;
  s.add(grass, flowerMesh);

  // ── 반딧불이
  const FLY = 40;
  const flyPos = new Float32Array(FLY * 3);
  const flySeed = Array.from({ length: FLY }, () => [x0 + 1 + r() * (x1 - x0 - 2), z0 + 1 + r() * (z1 - z0 - 2), 0.4 + r() * 2.4, r() * 10] as const);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(
    flyGeo,
    new THREE.PointsMaterial({
      map: M.glowMap,
      color: 0xffe7a8,
      size: 0.11,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  flies.frustumCulled = false;
  s.add(flies);
  anim.push((sec) => {
    flySeed.forEach(([fx, fz, fy, k], i) => {
      flyPos[i * 3] = fx + Math.sin(sec * 0.35 + k) * 1.2;
      flyPos[i * 3 + 1] = fy + Math.sin(sec * 0.9 + k * 2) * 0.35;
      flyPos[i * 3 + 2] = fz + Math.cos(sec * 0.3 + k * 1.3) * 1.2;
    });
    flyGeo.attributes.position.needsUpdate = true;
  });
  anim.push((sec) =>
    bobbers.forEach((c) => {
      c.o.position.y = c.y + Math.sin(sec * 1.4 + c.k) * 0.15;
      c.o.rotation.y = sec * 0.8 + c.k;
    }),
  );

  b.flush(s, noCast);
  return {
    portal,
    update(t: number, px: number, pz: number) {
      const sec = t / 60;
      for (const f of anim) f(sec);
      for (const f of faders) {
        const want = f.test(px, pz) ? 0.28 : 1;
        if (f.a === want) continue;
        f.a = Math.abs(want - f.a) < 0.01 ? want : f.a + (want - f.a) * 0.18;
        for (const m of f.mats) m.opacity = f.a;
      }
    },
  };
}
