import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { COSMETIC_BY_ID, type CosmeticDef, type CosmeticSlot, type Pattern } from '../data/fashion';
import { addOutline, toonGradient } from './lookFx';

/**
 * 코디 입히기 (주인공 VRM): 상의·하의·신발은 옷 재질의 그림을 다시 칠하고(색 + 무늬),
 * 모자·안경·가방은 작은 모형을 머리·가슴 뼈에 붙인다.
 * 모델 치수(머리 크기·눈 높이·등 위치)는 처음에 정점으로 재서, 모델이 바뀌어도 대충 맞게 붙는다.
 */

/**
 * 다시 칠하는 옷 재질 이름 (VRoid 표준 이름의 앞부분). 앞에 있는 이름부터 찾고, 없으면 다음 이름.
 * 원피스(Onepiece_)를 입은 모델은 상의·하의 둘 다 원피스를 칠한다 (둘 다 입으면 상의 색이 이긴다).
 */
const CLOTH_MAT: [CosmeticSlot, string[]][] = [
  ['top', ['Tops_', 'Onepiece_']],
  ['bottom', ['Bottoms_', 'Onepiece_']],
  ['shoes', ['Shoes_']],
];

/** 비키니를 입을 때 감추는 옷 (신발은 그대로) */
const SWIM_HIDE = ['Tops_', 'Bottoms_', 'Onepiece_'];

/**
 * 피부 그림에 비키니를 그린다. 몸 삼각형을 그림 좌표(UV)에서 한 픽셀씩 훑으며, 그 픽셀이 처음 자세에서
 * 몸의 어디인지(높이·좌우)를 삼각형 안에서 보간해 정한다 → 경계가 매끈하고 모델마다 몸에 맞는다.
 * 옷에 가려져 있던 몸통 그림은 비어 있거나 얼룩이 있어서, 비키니 밖 몸통은 다리에서 뽑은 피부색으로 먼저 채운다.
 */
function paintSwimsuit(mesh: THREE.Mesh, mat: THREE.Material, src: THREE.Texture, m: Metrics, color: number): THREE.Texture | null {
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const geo = mesh.geometry;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (!uv || !img?.width) return null;
  const W = img.width;
  const H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, W, H);
  const px = data.data;
  mesh.updateMatrixWorld(true);
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
  const chestY = m.chestPos.y;
  const hipY = m.hipsPos.y;
  // 삼각형 목록 (처음 자세 위치 + 그림 좌표)
  const tris: { p: THREE.Vector3[]; u: number[] }[] = [];
  for (const gr of groups) {
    if (mats[gr.materialIndex ?? 0] !== mat) continue;
    for (let k = gr.start; k + 2 < gr.start + gr.count; k += 3) {
      const ids = [0, 1, 2].map((j) => (geo.index ? geo.index.getX(k + j) : k + j));
      tris.push({
        p: ids.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)),
        u: ids.flatMap((i) => [uv.getX(i) * W, uv.getY(i) * H]),
      });
    }
  }
  // 피부색: 허벅지 가운데 삼각형들의 그림 색 평균 (옷에 안 가려진 곳)
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (const t of tris) {
    const y = (t.p[0].y + t.p[1].y + t.p[2].y) / 3;
    if (y > hipY - 0.45 && y < hipY - 0.32) {
      const x = Math.floor((t.u[0] + t.u[2] + t.u[4]) / 3);
      const yy = Math.floor((t.u[1] + t.u[3] + t.u[5]) / 3);
      const i = (Math.max(0, Math.min(H - 1, yy)) * W + Math.max(0, Math.min(W - 1, x))) * 4;
      if (px[i + 3] < 200) continue;
      sr += px[i];
      sg += px[i + 1];
      sb += px[i + 2];
      sn++;
    }
  }
  const skin = sn ? [sr / sn, sg / sn, sb / sn] : [246, 224, 210];
  const suit = new THREE.Color(color);
  const sc = suit.clone().convertLinearToSRGB();
  const suitRgb = [sc.r * 255, sc.g * 255, sc.b * 255];
  // 아랫단: 허벅지 뼈(다리 시작) 조금 위 허리선 → 가랑이(허벅지 뼈 아래)로 좁아진다
  const top = m.legY + 0.075;
  const bot = m.legY - 0.075;
  /** 0 = 그대로, 1 = 피부로 채움 (옷에 가려졌던 몸통), 2 = 수영복 */
  const zone = (dx: number, y: number) => {
    // 위: 가슴을 감싸는 띠 + 가운데에서 목 뒤로 올라가는 끈 두 줄
    if (y > chestY - 0.125 && y < chestY - 0.01 && dx < 0.18) return 2;
    if (y >= chestY - 0.01 && y < chestY + 0.12 && Math.abs(dx - (0.05 + (y - chestY) * 0.2)) < 0.009) return 2;
    // 아래: 허리선에서 가랑이로 좁아지는 삼각형
    if (y < top && y > bot && dx < 0.03 + ((y - bot) / (top - bot)) * 0.16) return 2;
    // 옷에 가려졌던 몸통 (팔·다리는 그대로)
    if (y > hipY - 0.28 && y < chestY + 0.16 && dx < 0.2) return 1;
    return 0;
  };
  const p = new THREE.Vector3();
  for (const t of tris) {
    const ys = t.p.map((q) => q.y);
    if (Math.max(...ys) < hipY - 0.3 || Math.min(...ys) > chestY + 0.18) continue;
    if (Math.min(...t.p.map((q) => Math.abs(q.x - m.cx))) > 0.22) continue;
    const [x0, y0, x1, y1, x2, y2] = t.u;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1);
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-9) continue;
    for (let yy = minY; yy <= maxY; yy++)
      for (let xx = minX; xx <= maxX; xx++) {
        const fx = xx + 0.5;
        const fy = yy + 0.5;
        const w0 = ((y1 - y2) * (fx - x2) + (x2 - x1) * (fy - y2)) / den;
        const w1 = ((y2 - y0) * (fx - x2) + (x0 - x2) * (fy - y2)) / den;
        const w2 = 1 - w0 - w1;
        // 경계 픽셀도 칠해 그림 이음매가 벌어지지 않게 (조금 바깥까지)
        const e = -1.5 / Math.max(1, Math.abs(den) ** 0.5);
        if (w0 < e || w1 < e || w2 < e) continue;
        p.set(0, 0, 0).addScaledVector(t.p[0], w0).addScaledVector(t.p[1], w1).addScaledVector(t.p[2], w2);
        const z = zone(Math.abs(p.x - m.cx), p.y);
        if (!z) continue;
        const i = (yy * W + xx) * 4;
        const c = z === 2 ? suitRgb : skin;
        px[i] = c[0];
        px[i + 1] = c[1];
        px[i + 2] = c[2];
        px[i + 3] = 255;
      }
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  return tex;
}

type ClothMat = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  shadeMultiplyTexture?: THREE.Texture | null;
};

/** 옷 재질 한 조각 (조각마다 그림이 달라서 따로 칠하고 따로 되돌린다) */
interface ClothPart {
  mat: ClothMat;
  /** 이 조각을 칠할 수 있는 부위 (앞쪽이 우선) */
  slots: CosmeticSlot[];
  /** 지금 칠해진 코디 id ('' = 원래 옷) */
  cur: string;
  origMap: THREE.Texture | null;
  origShade: THREE.Texture | null;
  origColor: THREE.Color;
  /** 원래 그림의 밝기만 뽑아 0.35~1 로 펴 둔 것 (검은 바지도 색을 입힐 수 있게) */
  shade: { w: number; h: number; v: Float32Array; a: Uint8ClampedArray } | null;
}

interface Metrics {
  head: THREE.Object3D;
  headPos: THREE.Vector3;
  /** 머리카락 위 끝, 눈 높이 */
  top: number;
  eyeY: number;
  /** 머리 가운데 (x, z) 와 반지름 */
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  /** 눈 앞 얼굴 표면 z, 두 눈 사이 반 간격 */
  faceZ: number;
  eyeX: number;
  /** 눈 높이 얼굴 반폭 (안경다리) */
  sideX: number;
  /** 눈 반지름 (렌즈 크기) */
  eyeR: number;
  /** 상의 정점 (어깨 위 높이) */
  tops: Float32Array;
  chest: THREE.Object3D;
  chestPos: THREE.Vector3;
  /** 몸 정점 (등·어깨 표면 찾기) */
  body: Float32Array;
  /** VRM 0.x 모델 (뼈 기준 방향이 180° 돌아 있다) */
  v0: boolean;
  /** 골반 뼈 (꼬리) · 엉덩이 둘레 정점 (몸 · 하의 · 원피스 · 치마처럼 긴 상의) */
  hips: THREE.Object3D;
  hipsPos: THREE.Vector3;
  /** 다리가 시작되는 높이 (허벅지 뼈) — 비키니 아랫단 기준 */
  legY: number;
  lower: Float32Array;
}

/** VRoid 0.x 모델은 재질 이름 앞에 'M00_001_01_' 같은 번호가 붙는다 → 떼고 비교 */
const matName = (m: THREE.Material) => m.name.replace(/^[A-Z]\d{2}_\d{3}_(\d{2}_)?/, '');

const textureCache = new Map<string, THREE.Texture>();

export class OutfitDresser {
  private parts: ClothPart[] = [];
  private m: Metrics | null = null;
  private acc = new Map<CosmeticSlot, { id: string; obj: THREE.Object3D }>();
  private own: THREE.Texture[] = [];

  constructor(private vrm: VRM) {
    const all: ClothMat[] = [];
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.isOutline) return;
      for (const mt of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!(mt as { isOutline?: boolean }).isOutline && !all.includes(mt as ClothMat)) all.push(mt as ClothMat);
      }
    });
    for (const [slot, prefixes] of CLOTH_MAT) {
      const prefix = prefixes.find((pf) => all.some((mt) => matName(mt).startsWith(pf)));
      if (!prefix) continue;
      for (const mat of all) {
        if (!matName(mat).startsWith(prefix)) continue;
        let part = this.parts.find((pt) => pt.mat === mat);
        if (!part) {
          part = { mat, slots: [], cur: '', origMap: mat.map ?? null, origShade: mat.shadeMultiplyTexture ?? null, origColor: mat.color?.clone() ?? new THREE.Color(1, 1, 1), shade: null };
          this.parts.push(part);
        }
        part.slots.push(slot);
      }
    }
    try {
      this.m = measure(vrm);
    } catch (e) {
      console.warn('코디 치수 재기 실패:', e);
    }
    // 비키니용: 감출 옷 조각(외곽선 포함)과 수영복을 그릴 피부
    const clothGeo = new Set<THREE.BufferGeometry>();
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.isOutline) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((mt) => SWIM_HIDE.some((pf) => matName(mt).startsWith(pf)))) {
        this.clothMeshes.push(mesh);
        clothGeo.add(mesh.geometry);
      }
      const skin = mats.find((mt) => matName(mt).startsWith('Body_')) as ClothMat | undefined;
      if (skin && !this.skin.some((k) => k.mat === skin)) this.skin.push({ mesh, mat: skin, origMap: skin.map ?? null, origShade: skin.shadeMultiplyTexture ?? null });
    });
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.isOutline && clothGeo.has(mesh.geometry)) this.clothMeshes.push(mesh);
    });
  }

  private clothMeshes: THREE.Object3D[] = [];
  private skin: { mesh: THREE.Mesh; mat: ClothMat; origMap: THREE.Texture | null; origShade: THREE.Texture | null }[] = [];
  private swim = '';

  /** 비키니: 옷을 감추고 피부 그림 위에 수영복을 그린다 (null = 원래대로) */
  private setSwim(c: CosmeticDef | null) {
    const id = c?.id ?? '';
    if (this.swim === id) return;
    this.swim = id;
    for (const o of this.clothMeshes) o.visible = !c;
    for (const k of this.skin) {
      if (!c || !this.m || !k.origMap?.image) {
        if (k.origMap) k.mat.map = k.origMap;
        if (k.origShade) k.mat.shadeMultiplyTexture = k.origShade;
        continue;
      }
      const tex = paintSwimsuit(k.mesh, k.mat, k.origMap, this.m, c.color);
      if (!tex) continue;
      this.own.push(tex);
      k.mat.map = tex;
      if (k.origShade) k.mat.shadeMultiplyTexture = tex;
    }
  }

  /** 입은 코디 id 목록을 그대로 반영한다 (빠진 칸은 기본 옷으로) */
  apply(ids: string[]) {
    const want = new Map<CosmeticSlot, CosmeticDef>();
    for (const id of ids) {
      const c = COSMETIC_BY_ID[id];
      if (c) want.set(c.slot, c);
    }
    // 비키니를 입으면 상의·하의 코디는 쓰지 않는다 (옷이 감춰진다)
    const swim = want.get('top')?.style === 'bikini' ? want.get('top')! : null;
    if (swim) {
      want.delete('top');
      want.delete('bottom');
    }
    this.setSwim(swim);
    for (const part of this.parts) {
      // 이 조각을 칠할 수 있는 부위 중 실제로 입은 첫 코디
      const slot = part.slots.find((sl) => want.has(sl));
      const c = slot ? want.get(slot)! : null;
      if (part.cur === (c?.id ?? '')) continue;
      this.paint(part, c);
      part.cur = c?.id ?? '';
    }
    for (const slot of ['hat', 'glasses', 'bag', 'tail'] as CosmeticSlot[]) {
      const c = want.get(slot);
      const cur = this.acc.get(slot);
      if ((cur?.id ?? '') === (c?.id ?? '')) continue;
      if (cur) {
        cur.obj.removeFromParent();
        disposeTree(cur.obj);
        this.acc.delete(slot);
      }
      if (c && this.m) {
        const obj = buildAccessory(c, this.m);
        if (obj) this.acc.set(slot, { id: c.id, obj });
      }
    }
  }

  dispose() {
    for (const { obj } of this.acc.values()) disposeTree(obj);
    this.acc.clear();
    for (const t of this.own) t.dispose();
  }

  /** 옷 재질 다시 칠하기 (null = 원래대로) */
  private paint(part: ClothPart, c: CosmeticDef | null) {
    const mt = part.mat;
    if (!c) {
      if (part.origMap) mt.map = part.origMap;
      if (part.origShade) mt.shadeMultiplyTexture = part.origShade;
      mt.color?.copy(part.origColor);
      return;
    }
    const src = part.origMap;
    let tex: THREE.Texture | null = null;
    if (src?.image) {
      part.shade ??= readShade(src.image as CanvasImageSource & { width: number; height: number });
      if (part.shade) tex = this.dyed(`${src.uuid}|${c.id}`, src, part.shade, c);
    }
    if (tex) {
      mt.map = tex;
      if (part.origShade) mt.shadeMultiplyTexture = tex;
      mt.color?.setRGB(1, 1, 1);
    } else mt.color?.setHex(c.color);
  }

  /** 밝기 그림 × 옷 색(무늬) → 새 그림 */
  private dyed(key: string, src: THREE.Texture, s: NonNullable<ClothPart['shade']>, c: CosmeticDef): THREE.Texture {
    const hit = textureCache.get(key);
    if (hit && hit.source.data) return hit;
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(s.w, s.h);
    const a = new THREE.Color(c.color);
    const b = new THREE.Color(c.color2 ?? c.color);
    const mix = a.clone().lerp(b, 0.5);
    const lin = (col: THREE.Color) => {
      // 그림 자료는 sRGB: 색도 sRGB 값으로 곱한다
      const o = col.clone().convertLinearToSRGB();
      return [o.r * 255, o.g * 255, o.b * 255];
    };
    const ca = lin(a);
    const cb = lin(b);
    const cm = lin(mix);
    const per = Math.max(8, Math.round(s.w / 18));
    const pat: Pattern = c.pattern ?? 'solid';
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        let col = ca;
        if (pat === 'stripe') col = Math.floor(y / per) % 2 ? cb : ca;
        else if (pat === 'check') {
          const u = Math.floor(x / per) % 2;
          const v = Math.floor(y / per) % 2;
          col = u && v ? cb : u || v ? cm : ca;
        } else if (pat === 'dot') {
          const px = (x % per) - per / 2;
          const py = (y % per) - per / 2;
          const odd = Math.floor(y / per) % 2;
          const qx = odd ? ((x + per / 2) % per) - per / 2 : px;
          if (qx * qx + py * py < (per * 0.22) ** 2) col = cb;
        }
        const v = s.v[i];
        img.data[i * 4] = col[0] * v;
        img.data[i * 4 + 1] = col[1] * v;
        img.data[i * 4 + 2] = col[2] * v;
        img.data[i * 4 + 3] = s.a[i];
      }
    g.putImageData(img, 0, 0);
    const t = src.clone();
    // clone 은 원본과 그림(source)을 같이 쓰니 새 그림으로 바꿔 끼운다
    t.source = new THREE.Source(cv);
    t.needsUpdate = true;
    textureCache.set(key, t);
    return t;
  }
}

/** 그림의 밝기를 0.35~1 로 편다 (가장 밝은 쪽 = 1). 주름·바느질선 명암은 남는다 */
function readShade(image: CanvasImageSource & { width: number; height: number }) {
  const w = Math.min(1024, image.width);
  const h = Math.min(1024, image.height);
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const n = w * h;
  const lum = new Float32Array(n);
  const a = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    const l = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    lum[i] = l;
    a[i] = d[i * 4 + 3];
    if (a[i] > 128) {
      hist[Math.min(255, Math.round(l * 255))]++;
      opaque++;
    }
  }
  // 밝은 쪽 95% 지점을 '천 원래 색'으로 본다
  let acc = 0;
  let ref = 1;
  for (let k = 0; k < 256; k++) {
    acc += hist[k];
    if (acc >= opaque * 0.95) {
      ref = Math.max(0.04, k / 255);
      break;
    }
  }
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(1, 0.35 + 0.65 * Math.min(1, lum[i] / ref));
  return { w, h, v, a };
}

// ───────────── 치수 재기 ─────────────

/** 재질 이름이 prefix 로 시작하는 면의 정점들 (모델 기준 좌표) */
function vertsOf(vrm: VRM, prefixes: string[]): number[] {
  const out: number[] = [];
  const p = new THREE.Vector3();
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.isOutline) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mt = mats[gr.materialIndex ?? 0];
      if (!mt || !prefixes.some((x) => matName(mt).startsWith(x))) continue;
      const seen = new Set<number>();
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        const vi = geo.index ? geo.index.getX(k) : k;
        if (seen.has(vi)) continue;
        seen.add(vi);
        p.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
        out.push(p.x, p.y, p.z);
      }
    }
  });
  return out;
}

function measure(vrm: VRM): Metrics {
  vrm.scene.updateMatrixWorld(true);
  const node = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const head = node('head')!;
  const chest = node('upperChest') ?? node('chest') ?? node('spine')!;
  const headPos = head.getWorldPosition(new THREE.Vector3());
  const chestPos = chest.getWorldPosition(new THREE.Vector3());
  const le = node('leftEye')?.getWorldPosition(new THREE.Vector3());
  const re = node('rightEye')?.getWorldPosition(new THREE.Vector3());
  const hair = vertsOf(vrm, ['Hair_']);
  const face = vertsOf(vrm, ['Face_', 'FaceMouth', 'EyeWhite']);
  let top = headPos.y + 0.2;
  if (hair.length) {
    top = -Infinity;
    for (let i = 1; i < hair.length; i += 3) top = Math.max(top, hair[i]);
  }
  // 눈: 흰자 면이 있으면 그 범위 (눈 뼈는 눈알 가운데라 실제 보이는 눈보다 안쪽)
  const white = vertsOf(vrm, ['EyeWhite']);
  let eyeY = le && re ? (le.y + re.y) / 2 : headPos.y + 0.06;
  let eyeX = le && re ? Math.max(0.02, Math.abs(le.x - re.x) / 2) : 0.03;
  let eyeR = eyeX * 0.8;
  if (white.length) {
    let wx0 = Infinity, wx1 = -Infinity, wy0 = Infinity, wy1 = -Infinity;
    for (let i = 0; i < white.length; i += 3) {
      if (white[i] < 0) continue; // 한쪽 눈만 재고 좌우 대칭으로
      wx0 = Math.min(wx0, white[i]);
      wx1 = Math.max(wx1, white[i]);
      wy0 = Math.min(wy0, white[i + 1]);
      wy1 = Math.max(wy1, white[i + 1]);
    }
    if (Number.isFinite(wx0)) {
      eyeX = (wx0 + wx1) / 2;
      eyeY = (wy0 + wy1) / 2;
      eyeR = Math.max(wx1 - wx0, wy1 - wy0) / 2;
    }
  }
  // 머리 크기: 눈보다 위쪽 머리카락·얼굴 정점의 범위
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const list of [hair, face])
    for (let i = 0; i < list.length; i += 3) {
      if (list[i + 1] < eyeY) continue;
      x0 = Math.min(x0, list[i]);
      x1 = Math.max(x1, list[i]);
      z0 = Math.min(z0, list[i + 2]);
      z1 = Math.max(z1, list[i + 2]);
    }
  if (!Number.isFinite(x0)) {
    x0 = headPos.x - 0.09;
    x1 = headPos.x + 0.09;
    z0 = headPos.z - 0.1;
    z1 = headPos.z + 0.1;
  }
  // 눈 앞 얼굴 표면
  let faceZ = -Infinity;
  for (let i = 0; i < face.length; i += 3) if (Math.abs(face[i + 1] - eyeY) < 0.025 && Math.abs(face[i]) < eyeX * 2.2) faceZ = Math.max(faceZ, face[i + 2]);
  if (!Number.isFinite(faceZ)) faceZ = z1;
  let sideX = 0;
  for (let i = 0; i < face.length; i += 3) if (Math.abs(face[i + 1] - eyeY) < 0.03) sideX = Math.max(sideX, Math.abs(face[i] - (x0 + x1) / 2));
  if (!sideX) sideX = (x1 - x0) / 2;
  const body = new Float32Array(vertsOf(vrm, ['Tops_', 'Body_']));
  return { head, headPos, top, eyeY, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, faceZ, eyeX, eyeR, sideX, chest, chestPos, body, tops: new Float32Array(vertsOf(vrm, ['Tops_'])), v0: vrm.meta?.metaVersion === '0', hips: node('hips')!, hipsPos: node('hips')!.getWorldPosition(new THREE.Vector3()), legY: (node('leftUpperLeg') ?? node('hips')!).getWorldPosition(new THREE.Vector3()).y, lower: new Float32Array(vertsOf(vrm, ['Body_', 'Bottoms_', 'Onepiece_', 'Tops_'])) };
}

/** 몸 표면 z: (x, y) 근처 정점 중 가장 앞(dir 1) 또는 뒤(dir -1) */
function surfaceZ(m: Metrics, x: number, y: number, dir: 1 | -1, r = 0.035) {
  let best = dir > 0 ? -Infinity : Infinity;
  const b = m.body;
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i] - x) > r || Math.abs(b[i + 1] - y) > r) continue;
    best = dir > 0 ? Math.max(best, b[i + 2]) : Math.min(best, b[i + 2]);
  }
  return Number.isFinite(best) ? best : m.chestPos.z + dir * 0.1;
}

// ───────────── 소품 ─────────────

function mat(color: number, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

function buildAccessory(c: CosmeticDef, m: Metrics): THREE.Object3D | null {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mt);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const R = Math.max(m.rx, m.rz) * 1.06;
  const base = m.eyeY + 0.045;
  const crownH = Math.max(0.05, m.top + 0.012 - base);
  const main = mat(c.color);
  let parent: THREE.Object3D = m.head;
  let origin = m.headPos;
  switch (c.style) {
    case 'cap': {
      add(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), main, m.cx, base, m.cz).scale.set(R, crownH, R * (m.rz / Math.max(m.rx, m.rz)) * 1.06);
      // 챙: 앞쪽 반원
      const brim = add(new THREE.CylinderGeometry(R * 0.92, R * 0.92, 0.008, 24, 1, false, -Math.PI / 2, Math.PI), main, m.cx, base + 0.004, m.cz + m.rz * 0.35);
      brim.scale.set(1, 1, 1.45);
      brim.rotation.x = 0.1;
      // 꼭대기 단추
      add(new THREE.SphereGeometry(0.012, 10, 6), main, m.cx, base + crownH, m.cz);
      break;
    }
    case 'beanie': {
      const knit = mat(c.color);
      add(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), knit, m.cx, base, m.cz).scale.set(R * 1.04, crownH * 1.12, R * 1.04);
      // 접은 단
      add(new THREE.CylinderGeometry(R * 1.1, R * 1.12, 0.045, 28, 1, true), mat(new THREE.Color(c.color).multiplyScalar(0.85).getHex(), { side: THREE.DoubleSide }), m.cx, base + 0.005, m.cz);
      add(new THREE.SphereGeometry(0.03, 12, 8), mat(0xffffff), m.cx, base + crownH * 1.12 + 0.015, m.cz);
      break;
    }
    case 'bucket': {
      add(new THREE.CylinderGeometry(R * 0.9, R * 1.06, crownH * 0.95, 28, 1, false), main, m.cx, base + (crownH * 0.95) / 2, m.cz);
      add(new THREE.CylinderGeometry(R * 1.06, R * 1.62, 0.06, 28, 1, true), mat(c.color, { side: THREE.DoubleSide }), m.cx, base - 0.012, m.cz);
      add(new THREE.CylinderGeometry(R * 1.07, R * 1.07, 0.022, 28, 1, true), mat(new THREE.Color(c.color).multiplyScalar(0.7).getHex(), { side: THREE.DoubleSide }), m.cx, base + 0.02, m.cz);
      break;
    }
    case 'sunglasses':
    case 'round': {
      const sun = c.style === 'sunglasses';
      const rim = mat(c.color);
      const lr = m.eyeR * (sun ? 1.3 : 1.18);
      const z = m.faceZ + 0.014;
      const tube = Math.max(0.0025, lr * 0.09);
      const lens = new THREE.MeshPhysicalMaterial({ color: sun ? 0x15161c : 0xffffff, transparent: true, opacity: sun ? 0.82 : 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false });
      for (const s of [-1, 1]) {
        const x = m.cx + s * m.eyeX;
        const ring = add(new THREE.TorusGeometry(lr, tube, 8, 28), rim, x, m.eyeY, z);
        if (sun) ring.scale.set(1.08, 0.86, 1);
        const ln = add(new THREE.CircleGeometry(lr, 28), lens, x, m.eyeY, z - 0.001);
        if (sun) ln.scale.set(1.08, 0.86, 1);
        // 다리: 관자놀이를 따라 귀 쪽으로
        const tx = m.cx + s * (m.sideX + 0.006);
        const len = Math.max(0.04, z - m.cz);
        const arm = add(new THREE.BoxGeometry(tube * 1.6, tube * 1.6, len), rim, tx, m.eyeY + 0.004, z - len / 2);
        arm.castShadow = false;
        // 바깥 경첩 (렌즈 → 다리)
        add(new THREE.BoxGeometry(Math.abs(tx - (x + s * lr)) + tube, tube * 1.6, tube * 1.6), rim, (tx + x + s * lr) / 2, m.eyeY + 0.004, z);
      }
      add(new THREE.BoxGeometry(Math.max(0.006, m.eyeX * 2 - lr * 2 + tube * 2), tube * 1.6, tube * 1.6), rim, m.cx, m.eyeY + lr * 0.25, z);
      break;
    }
    case 'backpack':
    case 'mini': {
      parent = m.chest;
      origin = m.chestPos;
      const mini = c.style === 'mini';
      const cy = m.chestPos.y - (mini ? 0.02 : 0.08);
      const back = surfaceZ(m, m.cx, cy, -1, 0.06);
      const bw = mini ? 0.17 : 0.26;
      const bh = mini ? 0.2 : 0.32;
      const bd = mini ? 0.08 : 0.12;
      const bz = back - bd / 2 - 0.006;
      const body = add(new THREE.BoxGeometry(bw, bh, bd, 2, 2, 2), main, m.cx, cy, bz);
      roundBox(body.geometry as THREE.BoxGeometry, 0.6);
      // 앞주머니 · 덮개
      const dark = mat(new THREE.Color(c.color).multiplyScalar(0.75).getHex());
      add(new THREE.BoxGeometry(bw * 0.7, bh * 0.38, 0.03), dark, m.cx, cy - bh * 0.18, bz - bd / 2 - 0.012);
      add(new THREE.BoxGeometry(bw * 1.02, bh * 0.22, bd * 1.06), dark, m.cx, cy + bh * 0.42, bz);
      // 멜빵: 가방 위 → 어깨 위 → 가슴 앞으로 내려온다
      const strap = mat(0x2a2a2e);
      const shY = m.chestPos.y + 0.1;
      for (const s of [-1, 1]) {
        const x = m.cx + s * (mini ? 0.055 : 0.075);
        const topY = surfaceTop(m, x, back + 0.04) + 0.01;
        const front = surfaceZ(m, x, shY - 0.1, 1, 0.03) + 0.008;
        const pts = [
          new THREE.Vector3(x, cy + bh * 0.4, back - 0.01),
          new THREE.Vector3(x, Math.max(topY, shY), (back + front) / 2 - 0.01),
          new THREE.Vector3(x, shY - 0.1, front),
          new THREE.Vector3(x + s * 0.02, cy - bh * 0.25, surfaceZ(m, x + s * 0.02, cy - bh * 0.25, 1, 0.04) + 0.008),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        add(new THREE.TubeGeometry(curve, 16, 0.009, 6, false), strap, 0, 0, 0).castShadow = false;
      }
      break;
    }
    case 'bunny': {
      // 머리띠: 정수리를 넘어가는 반원 (귀에서 귀까지) + 쫑긋 선 토끼 귀 두 개 (안쪽은 분홍)
      // 머리카락 부피(똥머리·바보털)까지 잰 크기라 조금 줄여서 머리에 붙게 한다
      const bandR = R * 0.97;
      const bandH = crownH * 0.86;
      const band = add(new THREE.TorusGeometry(bandR, 0.007, 6, 28, Math.PI), main, m.cx, base - 0.015, m.cz - m.rz * 0.08);
      band.scale.y = bandH / bandR;
      const inner = mat(c.color2 ?? 0xf6b3c8);
      const earH = Math.max(0.12, crownH * 1.25);
      for (const s of [-1, 1]) {
        // 머리띠 위, 정수리에서 양옆으로 조금 벌어진 곳
        const a = 0.42;
        const ex = m.cx + s * bandR * Math.sin(a);
        const ey = base - 0.015 + bandH * Math.cos(a);
        const ear = new THREE.Group();
        ear.position.set(ex, ey, m.cz - m.rz * 0.08);
        // 바깥으로 살짝 벌어지고, 한쪽 귀는 끝이 앞으로 살짝 접힌다
        ear.rotation.set(s > 0 ? -0.12 : 0, 0, -s * 0.22);
        g.add(ear);
        const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), main);
        outer.scale.set(0.028, earH / 2, 0.014);
        outer.position.y = earH / 2 - 0.005;
        outer.castShadow = true;
        const pink = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), inner);
        pink.scale.set(0.016, earH * 0.38, 0.006);
        pink.position.set(0, earH / 2 - 0.004, 0.01);
        ear.add(outer, pink);
      }
      break;
    }
    case 'bunnyTail': {
      // 꼬리뼈 높이, 엉덩이(또는 치마) 뒷면에 붙는 솜뭉치
      parent = m.hips;
      origin = m.hipsPos;
      const ty = m.hipsPos.y - 0.06;
      let back = Infinity;
      const b = m.lower;
      for (let i = 0; i < b.length; i += 3) {
        if (Math.abs(b[i] - m.cx) > 0.05 || Math.abs(b[i + 1] - ty) > 0.05) continue;
        back = Math.min(back, b[i + 2]);
      }
      if (!Number.isFinite(back)) back = m.hipsPos.z - 0.12;
      const fluff = mat(c.color);
      const r = 0.045;
      const z = back - r * 0.6;
      add(new THREE.IcosahedronGeometry(r, 2), fluff, m.cx, ty, z);
      // 몽실몽실하게 작은 솜을 둘레에 붙인다
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        add(new THREE.IcosahedronGeometry(r * 0.55, 1), fluff, m.cx + Math.cos(a) * r * 0.62, ty + Math.sin(a) * r * 0.62, z - r * 0.15);
      }
      add(new THREE.IcosahedronGeometry(r * 0.6, 1), fluff, m.cx, ty + r * 0.1, z - r * 0.55);
      break;
    }
    default:
      return null;
  }
  // 뼈 기준 위치로 옮겨 붙인다 (정규화 뼈는 처음 자세에서 회전이 없다)
  g.position.set(-origin.x, -origin.y, -origin.z);
  const holder = new THREE.Group();
  // VRM 0.x 모델은 정규화 뼈가 처음부터 180° 돌아 있다 (모양은 화면 기준으로 만들었으니 되돌린다)
  if (m.v0) holder.rotation.y = Math.PI;
  holder.add(g);
  parent.add(holder);
  const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  addOutline(g, 0.0045 / Math.max(0.05, Math.max(size.x, size.y, size.z)));
  keepFieldOutline(g);
  return holder;
}

/**
 * 외곽선 굵기는 미터 단위라 카메라가 가까울수록(대전·동네·코디 창) 화면에서 두꺼워 보인다.
 * 필드 카메라(약 12m, 시야 45°)에서 보이는 굵기를 기준으로, 그보다 가까우면 그만큼 가늘게 해서
 * 어디서 보든 화면 속 선 굵기가 필드와 비슷하게 한다. 더 멀 때는 지금처럼 둔다.
 * 거의 검정이던 선은 진해 보여서, 색은 부드러운 짙은 장밋빛으로 바꾸고 굵기도 절반으로 줄인다.
 */
const SOFT_OUTLINE = 0x7a6070;
const OUTLINE_SCALE = 0.5;
const FIELD_VIEW = Math.hypot(8.5, 9) * Math.tan(THREE.MathUtils.degToRad(45 / 2));
export function keepFieldOutline(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.isOutline) mats.add(m.material as THREE.Material);
  });
  for (const mat of mats) {
    (mat as THREE.MeshBasicMaterial).color?.setHex(SOFT_OUTLINE);
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r);
      shader.vertexShader = shader.vertexShader.replace(
        'transformed += normalize(normal) * outlineWidth;',
        // 화면 속 크기 ∝ 1 / (거리 × tan(시야/2)), projectionMatrix[1][1] = 1 / tan(시야/2)
        `float olView = length((modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz) / projectionMatrix[1][1];
  transformed += normalize(normal) * outlineWidth * ${OUTLINE_SCALE.toFixed(2)} * clamp(olView / ${FIELD_VIEW.toFixed(3)}, 0.15, 1.0);`,
      );
    };
    mat.needsUpdate = true;
  }
}

/** 어깨 위 표면 높이 (x 근처, z 근처 정점 중 가장 높은 곳) */
function surfaceTop(m: Metrics, x: number, z: number) {
  let best = -Infinity;
  const b = m.tops.length ? m.tops : m.body;
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i] - x) > 0.03 || Math.abs(b[i + 2] - z) > 0.08 || b[i + 1] > m.headPos.y) continue;
    best = Math.max(best, b[i + 1]);
  }
  return Number.isFinite(best) ? best : m.chestPos.y + 0.12;
}

/** 상자 모서리를 둥글게 (정점을 구 쪽으로 조금 당긴다) */
function roundBox(geo: THREE.BoxGeometry, k: number) {
  geo.computeBoundingBox();
  const s = geo.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = new THREE.Vector3(v.x / s.x, v.y / s.y, v.z / s.z);
    const len = n.length();
    if (len > 1.2) {
      const sph = n.clone().normalize().multiplyScalar(Math.SQRT2 * 0.9);
      n.lerp(sph, k * 0.35);
    }
    p.setXYZ(i, n.x * s.x, n.y * s.y, n.z * s.z);
  }
  geo.computeVertexNormals();
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const mt of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mt.dispose();
  });
}
