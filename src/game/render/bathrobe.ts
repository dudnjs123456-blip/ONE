import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { toonGradient } from './lookFx';

/**
 * 샤워할 때 입는 목욕 가운 + 머리에 두른 수건.
 * 처음 자세(T자)의 몸 정점으로 몸통·팔 굵기를 재서 모델마다 맞춘 단단한 조각들을 뼈에 붙인다
 * (몸통 위 = 가슴뼈, 치마 = 엉덩이뼈, 소매 = 팔뼈, 수건 = 머리뼈 → 움직이면 같이 움직인다).
 */
export interface RobeMetrics {
  head: THREE.Object3D;
  headPos: THREE.Vector3;
  top: number;
  eyeY: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  v0: boolean;
  /** 몸·옷 정점 (x, y, z 반복) */
  lower: Float32Array;
}

const ROBE = 0xf6f2ea;
const ROBE_DARK = 0xe6dfd2;
const TOWEL = 0xfaf7f0;

/** 타월 올: 작은 고리 점무늬 (멀리서 보면 보송한 결) */
let terryTex: THREE.CanvasTexture | null = null;
function terry(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (terryTex) return terryTex;
  const n = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 520; i++) {
    const v = 200 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.arc(Math.random() * n, Math.random() * n, 0.8 + Math.random() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  terryTex = new THREE.CanvasTexture(cv);
  terryTex.wrapS = terryTex.wrapT = THREE.RepeatWrapping;
  terryTex.repeat.set(6, 6);
  terryTex.colorSpace = THREE.SRGBColorSpace;
  return terryTex;
}

const cloth = (color: number, side: THREE.Side = THREE.DoubleSide) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), map: terry(), side });

/** 높이 y 의 몸통 단면 (팔은 빼고): 가운데 x·z 와 반폭·반두께 */
function slice(m: RobeMetrics, y: number, maxX: number, band = 0.025) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const b = m.lower;
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i + 1] - y) > band || Math.abs(b[i] - m.cx) > maxX) continue;
    x0 = Math.min(x0, b[i]);
    x1 = Math.max(x1, b[i]);
    z0 = Math.min(z0, b[i + 2]);
    z1 = Math.max(z1, b[i + 2]);
  }
  if (!Number.isFinite(x0)) return null;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 };
}

/** 고리(타원) 여러 개를 이어 만든 통 (고리마다 높이·가운데·반폭·반두께) */
function tube(rings: { y: number; cx: number; cz: number; hw: number; hd: number }[], seg = 28) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  rings.forEach((r, j) => {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // 살짝 네모난 타원 (몸통처럼): 지수를 2 보다 조금 크게
      const c = Math.cos(a), s = Math.sin(a);
      const k = 2.6;
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / k);
      const sz = Math.sign(s) * Math.pow(Math.abs(s), 2 / k);
      pos.push(r.cx + sx * r.hw, r.y, r.cz + sz * r.hd);
      uv.push(i / seg, j / (rings.length - 1));
    }
  });
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      // 위쪽 고리가 j+1: 바깥을 보게 감는다
      if (rings[j + 1].y > rings[j].y) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 점들을 따라 몸 표면에 붙는 띠 (깃·앞자락 선). 띠 너비는 경로와 바깥(+z)에 수직한 방향 */
function ribbon(pts: THREE.Vector3[], width: number, mt: THREE.Material) {
  const pos: number[] = [];
  const idx: number[] = [];
  const out = new THREE.Vector3(0, 0, 1);
  pts.forEach((p, i) => {
    const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const side = new THREE.Vector3().crossVectors(d, out).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mt);
  return mesh;
}

/** from → to 를 잇는 원뿔대 (반지름 r0 → r1) */
function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mt: THREE.Material) {
  const d = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 18, 1, true), mt);
  mesh.position.copy(from).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

/**
 * 쓰는 뼈들의 처음 자세 위치와 원본 뼈의 처음 자세 행렬의 역행렬 (캐릭터를 불러올 때 재 둔다: 나중엔 움직이는 중이라 못 잰다).
 * 조각은 원본 뼈에 붙인다: VRM 0.x 모델은 그릴 때 정규화 뼈가 1.0 기준 값으로 돌아가 있어서
 * 정규화 뼈에 붙이면 팔이 거꾸로 꺾여 보인다 (원본 뼈는 화면에 보이는 몸 그대로).
 */
const ROBE_BONES: VRMHumanBoneName[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'leftLowerLeg'];
export type RestBones = Partial<Record<VRMHumanBoneName, { pos: THREE.Vector3; inv: THREE.Matrix4 }>>;
export function measureRestBones(vrm: VRM): RestBones {
  vrm.scene.updateMatrixWorld(true);
  const out: RestBones = {};
  for (const n of ROBE_BONES) {
    const b = vrm.humanoid.getNormalizedBoneNode(n);
    const raw = vrm.humanoid.getRawBoneNode(n);
    if (b && raw) out[n] = { pos: b.getWorldPosition(new THREE.Vector3()), inv: raw.matrixWorld.clone().invert() };
  }
  return out;
}

/**
 * 가운·수건을 만들어 뼈에 붙인다. finish = 조각마다 외곽선 등 마무리.
 * @returns 붙인 묶음들 (켜고 끄기·떼어 내기용)
 */
export function buildBathrobe(vrm: VRM, rest: RestBones, m: RobeMetrics, finish: (g: THREE.Object3D) => void): THREE.Object3D[] {
  const node = (n: VRMHumanBoneName) => (rest[n] ? vrm.humanoid.getRawBoneNode(n) : null);
  const at = (n: VRMHumanBoneName) => rest[n]?.pos.clone() ?? null;
  const hipsPos = at('hips')!;
  const chestName: VRMHumanBoneName = node('upperChest') && rest.upperChest ? 'upperChest' : node('chest') && rest.chest ? 'chest' : 'spine';
  const chestPos = at(chestName)!;
  const neck = at('neck') ?? m.headPos.clone().setY(m.headPos.y - 0.06);
  const shL = at('leftUpperArm');
  const shR = at('rightUpperArm');
  const kneeY = at('leftLowerLeg')?.y ?? hipsPos.y * 0.5;
  const legY = at('leftUpperLeg')?.y ?? hipsPos.y - 0.06;
  const shoulderY = shL && shR ? (shL.y + shR.y) / 2 : chestPos.y + 0.1;
  const shoulderX = shL && shR ? Math.abs(shL.x - shR.x) / 2 : 0.12;
  const out: THREE.Object3D[] = [];
  // 모양은 처음 자세의 세상 좌표로 만들었다 → 원본 뼈의 처음 자세 역행렬로 뼈 기준으로 옮긴다
  const mount = (bone: VRMHumanBoneName, g: THREE.Group) => {
    const parent = node(bone);
    if (!parent) return;
    const holder = new THREE.Group();
    rest[bone]!.inv.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(g);
    parent.add(holder);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    finish(g);
    holder.visible = false;
    out.push(holder);
  };
  const body = cloth(ROBE);
  const pad = 0.022;
  const ring = (y: number, maxX: number, extra: number, fb?: { hw: number; hd: number }) => {
    const s = slice(m, y, maxX) ?? { cx: m.cx, cz: hipsPos.z, hw: fb?.hw ?? 0.13, hd: fb?.hd ?? 0.1 };
    return { y, cx: s.cx, cz: s.cz, hw: s.hw + extra, hd: s.hd + extra };
  };

  // ── 몸통 위 (허리 → 어깨 → 목둘레): 가슴뼈에
  const waistY = hipsPos.y + (chestPos.y - hipsPos.y) * 0.35;
  const armCut = shoulderX * 0.92;
  const upper: ReturnType<typeof ring>[] = [];
  for (let k = 0; k <= 5; k++) {
    const y = waistY + (shoulderY - 0.035 - waistY) * (k / 5);
    upper.push(ring(y, armCut, pad));
  }
  // 어깨: 팔이 시작하는 곳까지 덮고 목으로 오므린다
  const sh = upper[upper.length - 1];
  upper.push({ y: shoulderY + 0.03, cx: sh.cx, cz: sh.cz, hw: shoulderX + 0.04, hd: sh.hd * 0.95 });
  upper.push({ y: shoulderY + 0.06, cx: sh.cx, cz: sh.cz - 0.005, hw: shoulderX * 0.75, hd: sh.hd * 0.82 });
  upper.push({ y: Math.max(shoulderY + 0.06, neck.y - 0.01), cx: sh.cx, cz: sh.cz - 0.01, hw: 0.065, hd: 0.06 });
  const top = new THREE.Group();
  top.add(new THREE.Mesh(tube(upper), body));
  // 깃: 목 옆에서 가슴을 따라 반대쪽 허리로 겹쳐 내려오는 두 줄 (V 넥). 몸통 표면을 따라 이어 붙인다
  const lapel = cloth(ROBE_DARK);
  const K = 2.6;
  const surf = (r: ReturnType<typeof ring>, x: number, out: number) => {
    const u = Math.min(0.98, Math.abs(x - r.cx) / r.hw);
    return new THREE.Vector3(x, r.y, r.cz + (r.hd + out) * Math.pow(1 - Math.pow(u, K), 1 / K));
  };
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    const n = upper.length - 1;
    // 어깨 고리(넓은 것) 두 개는 건너뛰고 목둘레 → 몸통 고리를 따라 내려온다
    const rows = [upper[n], ...upper.slice(0, n - 2).reverse()];
    rows.forEach((r, k) => {
      // 목(위)에서는 목 옆, 허리(아래)에서는 반대쪽으로 넘어간다
      const f = 1 - k / (rows.length - 1);
      const x = m.cx + s * (0.05 * f - 0.07 * (1 - f));
      pts.push(surf(r, x, s > 0 ? 0.007 : 0.004));
    });
    top.add(ribbon(pts, 0.045, lapel));
  }
  // 허리띠 + 옆 매듭
  const w0 = upper[0];
  const belt = new THREE.Mesh(tube([
    { y: waistY - 0.02, cx: w0.cx, cz: w0.cz, hw: w0.hw + 0.008, hd: w0.hd + 0.008 },
    { y: waistY + 0.02, cx: w0.cx, cz: w0.cz, hw: w0.hw + 0.008, hd: w0.hd + 0.008 },
  ]), lapel);
  top.add(belt);
  const knotX = w0.cx + w0.hw * 0.55;
  const knotZ = w0.cz + w0.hd * 0.8 + 0.015;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), lapel);
  knot.position.set(knotX, waistY, knotZ);
  top.add(knot);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.01), lapel);
    tail.position.set(knotX + s * 0.018, waistY - 0.085, knotZ + 0.004);
    tail.rotation.z = s * 0.12;
    top.add(tail);
  }
  mount(chestName, top);

  // ── 치마 (허리 → 무릎 아래): 엉덩이뼈에. 걸을 때 다리가 들어가게 아래로 갈수록 넓게
  const hemY = kneeY - 0.06;
  const skirt: ReturnType<typeof ring>[] = [];
  skirt.push({ ...ring(waistY, armCut, pad), y: waistY + 0.03 });
  const hipR = ring(legY, 0.3, pad + 0.01);
  skirt.push({ ...ring(hipsPos.y, 0.3, pad + 0.005) });
  skirt.push(hipR);
  const flare = (t: number) => ({ y: legY + (hemY - legY) * t, cx: hipR.cx, cz: hipR.cz, hw: hipR.hw + 0.02 + 0.045 * t, hd: hipR.hd + 0.03 + 0.07 * t });
  for (const t of [0.35, 0.7, 1]) skirt.push(flare(t));
  skirt.sort((a, b) => b.y - a.y);
  const low = new THREE.Group();
  low.add(new THREE.Mesh(tube(skirt), cloth(ROBE, THREE.DoubleSide)));
  // 앞자락이 겹친 선
  const seamX = m.cx + 0.07;
  low.add(ribbon(skirt.map((r) => surf(r, seamX, 0.004)), 0.035, lapel));
  mount('hips', low);

  // ── 소매: 위팔(어깨 → 팔꿈치) · 아래팔(팔꿈치 → 손목 조금 위, 넓은 소맷부리)
  for (const side of ['left', 'right'] as const) {
    const up = node(`${side}UpperArm`);
    const lo = node(`${side}LowerArm`);
    const a = at(`${side}UpperArm`);
    const e = at(`${side}LowerArm`);
    const w = at(`${side}Hand`);
    if (!up || !lo || !a || !e || !w) continue;
    // 팔 굵기: 위팔 가운데 둘레 정점의 축까지 거리
    let r = 0;
    const b = m.lower;
    const mid = a.clone().lerp(e, 0.5);
    for (let i = 0; i < b.length; i += 3) {
      if (Math.abs(b[i] - mid.x) > 0.03) continue;
      const d = Math.hypot(b[i + 1] - mid.y, b[i + 2] - mid.z);
      if (d < 0.09) r = Math.max(r, d);
    }
    r = Math.min(0.05, Math.max(0.035, r)) + 0.016;
    const g1 = new THREE.Group();
    const inner = a.clone().lerp(new THREE.Vector3(m.cx, a.y, a.z), 0.35);
    g1.add(limb(inner, e, r + 0.008, r, body));
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), body);
    elbow.position.copy(e);
    g1.add(elbow);
    mount(`${side}UpperArm`, g1);
    const g2 = new THREE.Group();
    const cuff = e.clone().lerp(w, 0.62);
    g2.add(limb(e, cuff, r, r * 1.22, cloth(ROBE, THREE.DoubleSide)));
    const band = limb(cuff.clone().lerp(e, 0.12), cuff, r * 1.2, r * 1.24, lapel);
    g2.add(band);
    mount(`${side}LowerArm`, g2);
  }

  // ── 머리 수건 (터번): 이마 위부터 정수리·뒤통수를 감싸고, 꼬아 올린 끝이 뒤로 넘어간다
  const t = cloth(TOWEL);
  const R = Math.max(m.rx, m.rz);
  const base = m.eyeY + 0.035;
  const crown = Math.max(0.07, m.top - base) * 0.92;
  const h = new THREE.Group();
  // 감은 수건: 앞(이마 위)은 올라가고 뒤(뒤통수)는 내려가게 기울인 반구
  const tilt = 0.45;
  const cy = base - 0.25 * m.rz;
  const cz = m.cz - m.rz * 0.12;
  const wrap = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), t);
  wrap.position.set(m.cx, cy, cz);
  wrap.scale.set(R * 1.2, crown + 0.25 * m.rz + 0.025, m.rz * 1.3);
  wrap.rotation.x = -tilt;
  h.add(wrap);
  // 이마 둘레를 감은 두툼한 단 (반구 끝을 따라)
  const roll = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 10, 32), t);
  roll.position.set(m.cx, cy + 0.006, cz);
  roll.scale.set(R * 1.2, m.rz * 1.3, 0.3);
  roll.rotation.x = Math.PI / 2 - tilt;
  h.add(roll);
  // 꼬아 올린 끝: 뒤통수 위로 넘어간 통통한 꼬리 (두 덩이를 엇갈려 꼰 모양)
  for (const [k, sz] of [[0, 1], [1, 0.8]] as const) {
    const tw = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), cloth(k ? ROBE_DARK : TOWEL));
    tw.position.set(m.cx + (k ? 0.012 : -0.01), cy + crown * (0.95 - 0.12 * k), cz - m.rz * (0.55 + 0.35 * k));
    tw.scale.set(R * 0.48 * sz, crown * 0.36 * sz, m.rz * 0.62 * sz);
    tw.rotation.set(-0.9 - 0.3 * k, 0, k ? 0.25 : -0.2);
    h.add(tw);
  }
  mount('head', h);
  return out;
}
