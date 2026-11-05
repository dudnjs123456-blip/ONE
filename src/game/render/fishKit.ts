import * as THREE from 'three';
import type { FishDef, FishShape } from '../data/fishing';

/**
 * 물고기 모델 (낚싯줄 끝 · 가게 수조): 몸통은 구를 늘려 앞은 통통하게 · 꼬리 쪽은 가늘게 깎고,
 * 등은 짙은 색 · 배는 밝은 색 (정점 색), 꼬리지느러미 · 등지느러미 · 가슴지느러미 · 눈.
 * 메기류는 납작한 머리와 긴 수염, 철갑상어는 뾰족한 주둥이와 등 비늘판, 뱀장어는 긴 몸.
 * 머리 = +z, 길이 1 (scale 로 실제 길이를 맞춘다). tail = 꼬리 흔들기용 그룹.
 */

interface ShapeSpec {
  h: number;
  w: number;
  /** 몸 굵기 단면이 가장 큰 곳 (-1 꼬리 ~ 1 머리) */
  peak: number;
  /** 꼬리 끝 굵기 비율 */
  tailK: number;
  /** 꼬리지느러미 크기 */
  fin: number;
  /** 머리 납작함 (메기) */
  flatHead?: number;
  barbels?: number;
  snout?: boolean;
}

const SPECS: Record<Exclude<FishShape, 'boot' | 'can'>, ShapeSpec> = {
  slim: { h: 0.22, w: 0.12, peak: 0.25, tailK: 0.22, fin: 0.22 },
  deep: { h: 0.44, w: 0.15, peak: 0.15, tailK: 0.25, fin: 0.26 },
  carp: { h: 0.32, w: 0.19, peak: 0.2, tailK: 0.24, fin: 0.26, barbels: 0.08 },
  cat: { h: 0.19, w: 0.25, peak: 0.45, tailK: 0.3, fin: 0.16, flatHead: 0.55, barbels: 0.32 },
  eel: { h: 0.07, w: 0.065, peak: 0.6, tailK: 0.55, fin: 0.05 },
  puffer: { h: 0.55, w: 0.52, peak: 0.1, tailK: 0.3, fin: 0.18 },
  sturgeon: { h: 0.16, w: 0.17, peak: 0.3, tailK: 0.2, fin: 0.28, snout: true, barbels: 0.06 },
};

/** 무게 → 몸길이 (m): 모양마다 같은 무게라도 길이가 다르다 */
const DENSITY: Record<FishShape, number> = { slim: 0.47, deep: 0.3, carp: 0.4, cat: 0.44, eel: 0.85, puffer: 0.26, sturgeon: 0.5, boot: 0.3, can: 0.12 };

export function fishLength(f: FishDef, kg: number): number {
  if (f.shape === 'boot') return 0.32;
  if (f.shape === 'can') return 0.12;
  return Math.max(0.07, DENSITY[f.shape] * Math.cbrt(kg));
}

export interface FishModel {
  group: THREE.Group;
  tail: THREE.Object3D | null;
  dispose(): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function bodyGeo(shape: Exclude<FishShape, 'boot' | 'can'>, top: number, belly: number): THREE.BufferGeometry {
  const key = `${shape}:${top}:${belly}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const s = SPECS[shape];
  const g = new THREE.SphereGeometry(0.5, 20, 14);
  g.rotateX(Math.PI / 2); // 극이 z 축 (머리 · 꼬리)
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(top);
  const cBelly = new THREE.Color(belly).lerp(new THREE.Color(0xffffff), 0.55);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2;
    const y = pos.getY(i) * 2;
    const z = pos.getZ(i) * 2; // -1 (꼬리) ~ 1 (머리)
    // 단면 굵기: 가장 굵은 곳(peak)에서 꼬리 쪽으로 가늘어지고 머리 쪽은 둥글게
    const u = z >= s.peak ? (z - s.peak) / (1 - s.peak) : (s.peak - z) / (1 + s.peak);
    const thick = z >= s.peak ? Math.sqrt(Math.max(0, 1 - u * u)) : Math.max(s.tailK, 1 - Math.pow(u, 1.6) * (1 - s.tailK));
    // 꼬리 쪽 끝은 원래 구 모양대로 닫는다
    const close = Math.sqrt(Math.max(0, 1 - z * z));
    const k = Math.min(thick, z < 0 ? Math.max(close, s.tailK * close * 3) : 1);
    let hy = (s.h / 2) * k;
    let hx = (s.w / 2) * k;
    if (s.flatHead && z > 0.2) {
      // 메기: 머리가 넓적하고 납작
      const f = (z - 0.2) / 0.8;
      hy *= 1 - s.flatHead * 0.5 * f;
      hx *= 1 + s.flatHead * 0.4 * f;
    }
    let zz = z * 0.5;
    if (s.snout && z > 0.6) zz += (z - 0.6) * 0.18; // 철갑상어 주둥이
    pos.setXYZ(i, x * hx, y * hy - (y < 0 ? 0 : 0), zz);
    // 색: 등(위) 짙고 배(아래) 밝게, 옆줄 근처는 섞기
    const t = Math.max(0, Math.min(1, 0.5 + y * 0.9));
    c.copy(cBelly).lerp(cTop, t * t * (3 - 2 * t));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/** 지느러미 (삼각 · 사다리꼴 판) */
function finGeo(points: [number, number][]): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) sh.lineTo(p[0], p[1]);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
}

export function buildFish(f: FishDef, length: number): FishModel {
  const group = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mat = (m: THREE.Material) => (mats.push(m), m);
  let tail: THREE.Object3D | null = null;

  if (f.shape === 'boot') {
    const m = mat(new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.6 }));
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 12), m);
    leg.position.y = 0.35;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.62), m);
    foot.position.set(0, 0.1, 0.16);
    owned.push(leg.geometry, foot.geometry);
    group.add(leg, foot);
    group.rotation.x = Math.PI / 2;
    group.scale.setScalar(length / 0.7);
  } else if (f.shape === 'can') {
    const m = mat(new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.3, metalness: 0.8 }));
    const lab = mat(new THREE.MeshStandardMaterial({ color: f.color2, roughness: 0.5 }));
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1, 16, 1, true), lab);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.33, 16), m);
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 0.5;
    owned.push(can.geometry, lid.geometry);
    group.add(can, lid);
    group.scale.setScalar(length);
  } else {
    const s = SPECS[f.shape];
    const skin = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 }));
    const body = new THREE.Mesh(bodyGeo(f.shape, f.color2, f.color), skin);
    body.castShadow = true;
    group.add(body);
    const finMat = mat(new THREE.MeshStandardMaterial({ color: new THREE.Color(f.color2).lerp(new THREE.Color(f.color), 0.3), roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }));
    // 꼬리지느러미 (꼬리 끝에서 흔든다)
    tail = new THREE.Group();
    tail.position.z = -0.49;
    group.add(tail);
    if (f.shape === 'eel') {
      // 뱀장어: 등 · 배 지느러미가 꼬리까지 이어진다
      const dorsal = new THREE.Mesh(finGeo([[-0.5, 0], [0.1, 0], [-0.2, 0.035], [-0.5, 0.03]]), finMat);
      dorsal.rotation.y = Math.PI / 2;
      dorsal.position.y = s.h * 0.42;
      owned.push(dorsal.geometry);
      group.add(dorsal);
    } else {
      const F = s.fin;
      const fork = f.shape === 'sturgeon'
        ? finGeo([[0, 0], [-F * 1.3, F * 0.9], [-F * 0.7, 0.02], [-F * 0.6, -F * 0.35]]) // 위가 긴 비대칭 꼬리
        : f.shape === 'cat' || f.shape === 'puffer'
          ? finGeo([[0, 0], [-F, F * 0.55], [-F * 0.85, 0], [-F, -F * 0.55]])
          : finGeo([[0, 0], [-F, F * 0.75], [-F * 0.55, 0], [-F, -F * 0.75]]);
      const tf = new THREE.Mesh(fork, finMat);
      tf.rotation.y = Math.PI / 2;
      owned.push(tf.geometry);
      tail.add(tf);
      // 등지느러미
      const dh = f.shape === 'deep' ? 0.16 : f.shape === 'cat' ? 0.06 : 0.1;
      const dorsal = new THREE.Mesh(finGeo([[-0.12, 0], [0.12, 0], [0.04, dh], [-0.1, dh * 0.6]]), finMat);
      dorsal.rotation.y = Math.PI / 2;
      dorsal.position.set(0, s.h * 0.44, f.shape === 'cat' ? 0.15 : 0.02);
      owned.push(dorsal.geometry);
      group.add(dorsal);
      // 가슴지느러미 (양옆)
      for (const side of [-1, 1]) {
        const pf = new THREE.Mesh(finGeo([[0, 0], [-0.1, 0.035], [-0.12, -0.02]]), finMat);
        pf.position.set(side * s.w * 0.45, -s.h * 0.18, 0.25);
        pf.rotation.set(0, side * 0.9 + Math.PI / 2, side * 0.4);
        owned.push(pf.geometry);
        group.add(pf);
      }
    }
    // 눈: 흰자 + 동공
    const eyeR = Math.min(0.045, s.h * 0.13 + 0.008);
    const white = mat(new THREE.MeshStandardMaterial({ color: f.shape === 'puffer' ? 0x3a3a2a : 0xf1efe4, roughness: 0.2 }));
    const pupil = mat(new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
    const eg = new THREE.SphereGeometry(eyeR, 10, 8);
    const pg = new THREE.SphereGeometry(eyeR * 0.62, 8, 6);
    owned.push(eg, pg);
    const ez = f.shape === 'eel' ? 0.44 : f.shape === 'sturgeon' ? 0.36 : 0.38;
    const ey = f.shape === 'cat' ? s.h * 0.2 : s.h * 0.14;
    const ex = f.shape === 'cat' ? s.w * 0.36 : s.w * 0.4;
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eg, white);
      e.position.set(side * ex, ey, ez);
      const pp = new THREE.Mesh(pg, pupil);
      pp.position.set(side * eyeR * 0.5, 0, eyeR * 0.25);
      e.add(pp);
      group.add(e);
    }
    // 수염
    if (s.barbels) {
      const bm = mat(new THREE.MeshStandardMaterial({ color: f.color2, roughness: 0.7 }));
      const bl = s.barbels;
      for (const side of [-1, 1]) {
        for (const k of f.shape === 'cat' ? [0, 1] : [0]) {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(side * s.w * 0.3, -s.h * 0.1 + k * s.h * 0.15, 0.5),
            new THREE.Vector3(side * (s.w * 0.3 + bl * 0.5), -s.h * 0.2, 0.5 + bl * 0.25),
            new THREE.Vector3(side * (s.w * 0.25 + bl * 0.8), -s.h * 0.45 - k * 0.04, 0.42 - bl * 0.3),
          );
          const tg = new THREE.TubeGeometry(curve, 6, 0.006, 4, false);
          owned.push(tg);
          group.add(new THREE.Mesh(tg, bm));
        }
      }
    }
    // 철갑상어 등 비늘판
    if (f.shape === 'sturgeon') {
      const sm = mat(new THREE.MeshStandardMaterial({ color: 0xc9c2ad, roughness: 0.5 }));
      const sg = new THREE.ConeGeometry(0.018, 0.035, 4);
      owned.push(sg);
      for (let k = 0; k < 9; k++) {
        const sc = new THREE.Mesh(sg, sm);
        sc.position.set(0, s.h * 0.48 * (1 - Math.abs(k - 3) * 0.06), 0.3 - k * 0.075);
        group.add(sc);
        for (const side of [-1, 1]) {
          const ss = new THREE.Mesh(sg, sm);
          ss.position.set(side * s.w * 0.48, 0, 0.3 - k * 0.075);
          ss.rotation.z = -side * Math.PI / 2;
          group.add(ss);
        }
      }
    }
    // 황복 / 블루길 무늬는 몸 색으로 충분, 쏘가리 얼룩은 점으로
    if (f.id === 'mandarin' || f.id === 'goldmandarin') {
      const dm = mat(new THREE.MeshStandardMaterial({ color: f.id === 'goldmandarin' ? 0xb8620f : 0x2b2618, roughness: 0.5 }));
      const dg = new THREE.SphereGeometry(0.022, 6, 5);
      owned.push(dg);
      for (let k = 0; k < 14; k++) {
        const side = k % 2 ? 1 : -1;
        const zz = 0.3 - Math.floor(k / 2) * 0.09;
        const d = new THREE.Mesh(dg, dm);
        d.position.set(side * s.w * 0.47, ((k * 37) % 10) / 10 * s.h * 0.3 - s.h * 0.05, zz);
        d.scale.set(0.4, 1, 1);
        group.add(d);
      }
    }
    group.scale.setScalar(length);
  }
  return {
    group,
    tail,
    dispose() {
      for (const g of owned) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** 낚싯대: 손잡이(코르크) + 릴 (릴대만) + 마디 8개짜리 대 (마디마다 조금씩 휘어 낭창하게 휜다) */
export interface RodModel {
  group: THREE.Group;
  /** 마디 (각각 앞 마디의 자식). 휘기 = 마디마다 x 회전 */
  segs: THREE.Object3D[];
  tip: THREE.Object3D;
  length: number;
  dispose(): void;
}

export function buildRod(color: number, length: number, reel: boolean): RodModel {
  const group = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const blank = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const cork = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
  const handleLen = 0.42;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, handleLen, 10), cork);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = handleLen / 2 - 0.12;
  owned.push(handle.geometry);
  group.add(handle);
  if (reel) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16), metal);
    r.rotation.z = Math.PI / 2;
    r.position.set(0, -0.06, 0.02);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.02), metal);
    stem.position.set(0, -0.03, 0.02);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), cork);
    knob.position.set(0.035, -0.08, 0.02);
    owned.push(r.geometry, stem.geometry, knob.geometry);
    group.add(r, stem, knob);
  }
  const N = 8;
  const segLen = (length - handleLen) / N;
  const segs: THREE.Object3D[] = [];
  let parent: THREE.Object3D = group;
  let z0 = handleLen - 0.12;
  for (let i = 0; i < N; i++) {
    const joint = new THREE.Group();
    joint.position.z = z0;
    parent.add(joint);
    const r0 = 0.013 * (1 - i / N) + 0.002;
    const r1 = 0.013 * (1 - (i + 1) / N) + 0.002;
    const g = new THREE.CylinderGeometry(r1, r0, segLen, 6);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, segLen / 2);
    owned.push(g);
    const m = new THREE.Mesh(g, blank);
    m.castShadow = true;
    joint.add(m);
    // 가이드 (줄이 지나가는 고리) 몇 개
    if (i % 2 === 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, 4, 8), metal);
      ring.position.set(0, -0.012, segLen / 2);
      owned.push(ring.geometry);
      joint.add(ring);
    }
    segs.push(joint);
    parent = joint;
    z0 = segLen;
  }
  const tip = new THREE.Object3D();
  tip.position.z = segLen;
  parent.add(tip);
  return {
    group,
    segs,
    tip,
    length,
    dispose() {
      for (const g of owned) g.dispose();
      blank.dispose();
      cork.dispose();
      metal.dispose();
    },
  };
}

/** 찌: 빨강 · 흰색 몸통 + 위로 솟은 막대 */
export function buildBobber(): THREE.Group {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4, emissive: 0x551010, emissiveIntensity: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), red);
  stick.position.y = 0.13;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffee58 }));
  cap.position.y = 0.245;
  g.add(top, bot, stick, cap);
  return g;
}
