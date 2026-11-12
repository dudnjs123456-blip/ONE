// 옷 옮겨 입히기: 옷 입은 VRoid 모델(from)에서 옷 조각을 떼어, 몸매가 다른 VRoid 기본 몸(to)에 맞춰 입힌 VRM 을 만든다.
//
//   node scripts/outfit-transplant.mjs <옷 입은.vrm> <기본 몸.vrm> <결과.vrm> [옷 재질 앞부분 ...]
//   예) node scripts/outfit-transplant.mjs a3.vrm a3수정.vrm a3-new.vrm Tops_ Shoes_ --foot
//   --garment : 몸·얼굴·머리는 빼고 옷만 담는다 (게임에서 기본 몸에 갈아입히는 옷 파일, 뼈대·흔들림 설정은 함께)
//   --foot : 굽 있는 신발이면 발 모양도 옷 입은 모델의 발(VRoid 가 신발에 맞춰 바꾼 모양)로 바꾼다
//
// 맞추는 방법
//  1) 뼈 위치 차이만큼 옮긴다 (키·팔다리 길이). 새 몸에 없는 뼈(치마·리본 흔들림 뼈)는 부모 뼈를 따라 함께 옮겨 새로 붙인다.
//  2) 몸에 붙는 부분은 "원래 몸 표면에서 얼마나 떠 있었나"를 재서, 새 몸 표면에서 같은 만큼 띄운다 (몸 그림 좌표 UV 로 같은 자리를 찾는다).
//     원래 몸이 지워져 있던 곳(옷에 가려 잘린 곳)은 이웃 정점의 값으로 채운다.
//  3) 그래도 몸 안으로 들어간 정점은 몸 밖으로 밀어낸다.
// 흔들림 뼈 설정(VRMC_springBone)과 충돌체도 함께 옮긴다. VRoid VRM 1.0 (뼈에 회전 없음) 기준.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const FOOT = argv.includes('--foot');
const GARMENT = argv.includes('--garment');
const [FROM, TO, OUT, ...prefixArgs] = argv.filter((a) => !a.startsWith('--'));
const PREFIXES = prefixArgs.length ? prefixArgs : ['Tops_', 'Bottoms_', 'Shoes_'];
if (!FROM || !TO || !OUT) {
  console.error('사용법: node scripts/outfit-transplant.mjs <옷 입은.vrm> <기본 몸.vrm> <결과.vrm> [재질 앞부분...]');
  process.exit(1);
}

// ---------- glb 읽기·쓰기 ----------
function loadGlb(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jl));
  const bo = 20 + jl;
  const bl = b.readUInt32LE(bo);
  return { json, bin: Buffer.from(b.subarray(bo + 8, bo + 8 + bl)) };
}
const CT = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAcc(g, i) {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const T = CT[a.componentType];
  const n = NC[a.type];
  const size = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || size * n;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0));
  const out = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++)
    for (let c = 0; c < n; c++) {
      const o = k * stride + c * size;
      out[k * n + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint32Array ? dv.getUint32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : dv.getUint8(o);
    }
  return { v: out, n, count: a.count };
}
/** 결과 파일 버퍼 뒤에 데이터를 붙이고 bufferView 번호를 돌려준다 */
function appendView(g, buf, target) {
  const pad = (4 - (g.bin.length % 4)) % 4;
  if (pad) g.bin = Buffer.concat([g.bin, Buffer.alloc(pad)]);
  const view = { buffer: 0, byteOffset: g.bin.length, byteLength: buf.length };
  if (target) view.target = target;
  g.bin = Buffer.concat([g.bin, buf]);
  g.json.bufferViews.push(view);
  return g.json.bufferViews.length - 1;
}
function addAccessor(g, arr, type, componentType, target, minmax = false) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const bufferView = appendView(g, buf, target);
  const n = NC[type];
  const acc = { bufferView, componentType, count: arr.length / n, type };
  if (minmax) {
    const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity);
    for (let k = 0; k < arr.length; k++) {
      mn[k % n] = Math.min(mn[k % n], arr[k]);
      mx[k % n] = Math.max(mx[k % n], arr[k]);
    }
    acc.min = mn;
    acc.max = mx;
  }
  g.json.accessors.push(acc);
  return g.json.accessors.length - 1;
}
function saveGlb(g, file) {
  g.json.buffers = [{ byteLength: g.bin.length }];
  let js = Buffer.from(JSON.stringify(g.json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat([g.bin, Buffer.alloc((4 - (g.bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  fs.writeFileSync(file, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]));
}

// ---------- 4x4 행렬 (열 우선, glTF 와 같음) ----------
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const t = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function m4mul(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
  return r;
}
function m4inv(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}
const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// ---------- 뼈대 ----------
function skeleton(g) {
  const nodes = g.json.nodes;
  const parent = new Map();
  nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const world = new Map();
  const wm = (i) => {
    if (world.has(i)) return world.get(i);
    const local = trs(nodes[i]);
    const r = parent.has(i) ? m4mul(wm(parent.get(i)), local) : local;
    world.set(i, r);
    return r;
  };
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  return { nodes, parent, wm, byName };
}

const src = loadGlb(FROM);
const dst = loadGlb(TO);
const S = skeleton(src);
const D = skeleton(dst);
// 옷만 뽑을 때(--garment) 치마 흔들림 뼈는 입는 몸에 같은 이름 뼈가 있어도(같은 VRoid 옷을 입은 몸) 옷 전용 뼈로 새로 만든다.
// 안 그러면 새 옷 치마가 원래 옷의 (짧은) 치마 뼈를 따라가 걸을 때 찢어진다
const FRESH = (name) => GARMENT && /Skirt/.test(name);
const freshMade = new Set();
/** 새 몸에 쓸 수 있는 같은 이름 뼈가 있나 */
const dstHas = (name) => D.byName.has(name) && (!FRESH(name) || freshMade.has(name));
const matName = (g, i) => g.json.materials[i].name.replace(/ \(Instance\)/g, '').replace(/^[A-Z]\d{2}_\d{3}_(\d{2}_)?/, '');

const srcBodyMesh = src.json.meshes.find((m) => /^Body/.test(m.name));
const dstBodyIdx = dst.json.meshes.findIndex((m) => /^Body/.test(m.name));
const dstBodyMesh = dst.json.meshes[dstBodyIdx];
const srcSkin = src.json.skins[src.json.nodes.find((n) => n.mesh === src.json.meshes.indexOf(srcBodyMesh)).skin];
const dstSkinIdx = dst.json.nodes.find((n) => n.mesh === dstBodyIdx).skin;
const dstSkin = dst.json.skins[dstSkinIdx];

// 옷 조각
// 재질 앞부분: 표준 이름(Tops_) 또는 VRoid 원래 이름(N00_007_01_Tops_) — 같은 종류 옷이 여러 벌인 모델에서 한 벌만 고를 때
const rawName = (g, i) => g.json.materials[i].name.replace(/ \(Instance\)/g, '');
const clothPrims = srcBodyMesh.primitives.filter((p) => PREFIXES.some((pf) => matName(src, p.material).startsWith(pf) || rawName(src, p.material).startsWith(pf)));
if (!clothPrims.length) throw new Error('옮길 옷 조각이 없다: ' + PREFIXES.join(','));
console.log('옮길 옷:', clothPrims.map((p) => matName(src, p.material)).join(', '));

// ---------- 몸 표면 (삼각형 목록) ----------
function bodySurface(g, mesh) {
  const prim = mesh.primitives.find((p) => matName(g, p.material).startsWith('Body_'));
  const P = readAcc(g, prim.attributes.POSITION).v;
  const N = readAcc(g, prim.attributes.NORMAL).v;
  const U = readAcc(g, prim.attributes.TEXCOORD_0).v;
  const I = readAcc(g, prim.indices).v;
  const J = readAcc(g, prim.attributes.JOINTS_0).v;
  const W = readAcc(g, prim.attributes.WEIGHTS_0).v;
  return { prim, P, N, U, I, J, W, tris: I.length / 3, verts: [...new Set(I)] };
}
const oldBody = bodySurface(src, srcBodyMesh);
const newBody = bodySurface(dst, dstBodyMesh);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vtx = (B, i) => [B.P[i * 3], B.P[i * 3 + 1], B.P[i * 3 + 2]];

/** 삼각형 위에서 p 에 가장 가까운 점의 무게 (Ericson) */
function closestBary(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [1 - v, v, 0];
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [1 - w, 0, w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [0, 1 - w, w];
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}
function interp(B, t, bc, arr, n) {
  const out = new Array(n).fill(0);
  for (let k = 0; k < 3; k++) {
    const i = B.I[t * 3 + k];
    for (let c = 0; c < n; c++) out[c] += arr[i * n + c] * bc[k];
  }
  return out;
}
/** 몸 표면에서 가장 가까운 점: 위치·법선·UV */
function nearest(B, p) {
  let best = Infinity, bt = -1, bb = null;
  for (let t = 0; t < B.tris; t++) {
    const a = vtx(B, B.I[t * 3]), b = vtx(B, B.I[t * 3 + 1]), c = vtx(B, B.I[t * 3 + 2]);
    // 멀리 있는 삼각형은 건너뛴다
    if (Math.abs(a[1] - p[1]) > 0.25 && Math.abs(b[1] - p[1]) > 0.25 && Math.abs(c[1] - p[1]) > 0.25) continue;
    const bc = closestBary(p, a, b, c);
    const q = interp(B, t, bc, B.P, 3);
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (d < best) {
      best = d;
      bt = t;
      bb = bc;
    }
  }
  if (bt < 0) return null;
  return { pos: interp(B, bt, bb, B.P, 3), nrm: norm(interp(B, bt, bb, B.N, 3)), uv: interp(B, bt, bb, B.U, 2), dist: Math.sqrt(best) };
}
/** 몸 그림 좌표(UV)가 같은 자리 (없으면 null = 그 몸에서 지워진 곳) */
function atUv(B, uv) {
  for (let t = 0; t < B.tris; t++) {
    const i0 = B.I[t * 3], i1 = B.I[t * 3 + 1], i2 = B.I[t * 3 + 2];
    const x0 = B.U[i0 * 2], y0 = B.U[i0 * 2 + 1], x1 = B.U[i1 * 2], y1 = B.U[i1 * 2 + 1], x2 = B.U[i2 * 2], y2 = B.U[i2 * 2 + 1];
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-12) continue;
    const w0 = ((y1 - y2) * (uv[0] - x2) + (x2 - x1) * (uv[1] - y2)) / den;
    const w1 = ((y2 - y0) * (uv[0] - x2) + (x0 - x2) * (uv[1] - y2)) / den;
    const w2 = 1 - w0 - w1;
    if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
    const bc = [w0, w1, w2];
    return { t, bc, pos: interp(B, t, bc, B.P, 3), nrm: norm(interp(B, t, bc, B.N, 3)) };
  }
  return null;
}

// ---------- 뼈 옮기기 ----------
const srcJointNames = srcSkin.joints.map((j) => S.nodes[j].name);
/** 옛 뼈 이름 → 새 몸에서의 세계 행렬 (새 몸에 없으면 부모를 따라 옮긴 자리, 부모 기준 모양은 그대로) */
const newWorldOf = new Map();
function newWorld(name) {
  if (newWorldOf.has(name)) return newWorldOf.get(name);
  let r;
  if (dstHas(name)) r = D.wm(D.byName.get(name));
  else {
    const si = S.byName.get(name);
    r = m4mul(newWorld(S.nodes[S.parent.get(si)].name), trs(S.nodes[si]));
  }
  newWorldOf.set(name, r);
  return r;
}
const srcIbm = readAcc(src, srcSkin.inverseBindMatrices).v;
/** 옛 관절 k: 옛 묶음 자세 → 새 몸 쉬는 자세로 옮기는 행렬 */
const moveMat = srcSkin.joints.map((j, k) => m4mul(newWorld(S.nodes[j].name), Array.from(srcIbm.subarray(k * 16, k * 16 + 16))));

// ---------- 발 모양 (굽 있는 신발) ----------
if (FOOT) {
  // 옛 몸 정점을 새 뼈대로 옮겨 둔다
  const oldMoved = new Float64Array(oldBody.P.length);
  for (const i of oldBody.verts) {
    const v = [oldBody.P[i * 3], oldBody.P[i * 3 + 1], oldBody.P[i * 3 + 2]];
    let r = [0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const w = oldBody.W[i * 4 + c];
      if (w) r = add(r, mul(xform(moveMat[oldBody.J[i * 4 + c]], v), w));
    }
    oldMoved.set(r, i * 3);
  }
  const ankle = Math.max(...['J_Bip_L_Foot', 'J_Bip_R_Foot'].map((n) => D.wm(D.byName.get(n))[13]));
  const top = ankle + 0.05; // 이 위는 그대로, 발목 아래는 옛 발 모양
  const acc = dst.json.accessors[newBody.prim.attributes.POSITION];
  const nacc = dst.json.accessors[newBody.prim.attributes.NORMAL];
  const pv = dst.json.bufferViews[acc.bufferView], nv = dst.json.bufferViews[nacc.bufferView];
  const pStride = pv.byteStride || 12, nStride = nv.byteStride || 12;
  let changed = 0;
  for (const i of newBody.verts) {
    const y = newBody.P[i * 3 + 1];
    if (y > top) continue;
    const hit = atUv(oldBody, [newBody.U[i * 2], newBody.U[i * 2 + 1]]);
    if (!hit) continue;
    const f = y <= ankle ? 1 : (top - y) / (top - ankle);
    const q = interp(oldBody, hit.t, hit.bc, oldMoved, 3);
    for (let c = 0; c < 3; c++) {
      const val = newBody.P[i * 3 + c] * (1 - f) + q[c] * f;
      newBody.P[i * 3 + c] = val;
      dst.bin.writeFloatLE(val, (pv.byteOffset || 0) + (acc.byteOffset || 0) + i * pStride + c * 4);
      const nn = newBody.N[i * 3 + c] * (1 - f) + hit.nrm[c] * f;
      newBody.N[i * 3 + c] = nn;
      dst.bin.writeFloatLE(nn, (nv.byteOffset || 0) + (nacc.byteOffset || 0) + i * nStride + c * 4);
    }
    changed++;
  }
  // 위치 범위 다시 계산 (같은 정점 묶음을 쓰는 다른 조각도 포함)
  const all = readAcc(dst, newBody.prim.attributes.POSITION).v;
  acc.min = [0, 1, 2].map((c) => { let m = Infinity; for (let k = 0; k < acc.count; k++) m = Math.min(m, all[k * 3 + c]); return m; });
  acc.max = [0, 1, 2].map((c) => { let m = -Infinity; for (let k = 0; k < acc.count; k++) m = Math.max(m, all[k * 3 + c]); return m; });
  console.log('발 모양 바꾼 정점', changed);
}

// ---------- 옷 정점 모으기 ----------
const P0 = clothPrims[0].attributes;
for (const p of clothPrims) for (const k of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) if (p.attributes[k] !== P0[k]) throw new Error('옷 조각이 정점을 함께 쓰지 않는다');
const SP = readAcc(src, P0.POSITION).v, SN = readAcc(src, P0.NORMAL).v, SU = readAcc(src, P0.TEXCOORD_0).v;
const SJ = readAcc(src, P0.JOINTS_0).v, SW = readAcc(src, P0.WEIGHTS_0).v;
const remap = new Map();
const used = [];
const primIdx = clothPrims.map((p) => {
  const I = readAcc(src, p.indices).v;
  return Array.from(I, (i) => {
    if (!remap.has(i)) {
      remap.set(i, used.length);
      used.push(i);
    }
    return remap.get(i);
  });
});
const V = used.length;
console.log('옷 정점', V, '삼각형', primIdx.reduce((s, a) => s + a.length / 3, 0));

/** 신발 조각의 정점인가 */
const isShoe = new Array(V).fill(false);
clothPrims.forEach((p, n) => {
  if (matName(src, p.material).startsWith('Shoes_')) for (const k of primIdx[n]) isShoe[k] = true;
});

// 1) 뼈 위치 차이만큼 옮기기
const moved = [];
for (let k = 0; k < V; k++) {
  const i = used[k];
  const v = [SP[i * 3], SP[i * 3 + 1], SP[i * 3 + 2]];
  let r = [0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const w = SW[i * 4 + c];
    if (w) r = add(r, mul(xform(moveMat[SJ[i * 4 + c]], v), w));
  }
  moved.push(r);
}

// 2) 몸에 붙는 부분: 원래 몸에서 떠 있던 만큼 새 몸에서 띄우기
const TIGHT = 0.03; // 이보다 가까우면 몸에 붙는 옷
const gap = new Float64Array(V).fill(NaN);
const surf = [];
for (let k = 0; k < V; k++) {
  const i = used[k];
  const orig = [SP[i * 3], SP[i * 3 + 1], SP[i * 3 + 2]];
  const nb = nearest(newBody, moved[k]);
  surf.push(nb);
  if (!nb || nb.dist > 0.08) continue;
  const ob = atUv(oldBody, nb.uv);
  if (!ob) continue; // 원래 몸에서 지워진 곳
  gap[k] = dot(sub(orig, ob.pos), ob.nrm);
  if (k % 500 === 0) process.stdout.write(`  ${k}/${V}\r`);
}
// 지워진 곳은 이웃 정점 값으로 채운다 (옷 삼각형으로 이어진 이웃)
const nbrs = Array.from({ length: V }, () => new Set());
for (const I of primIdx)
  for (let t = 0; t < I.length; t += 3)
    for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
      nbrs[a].add(b);
      nbrs[b].add(a);
    }
for (let it = 0; it < 200; it++) {
  let changed = 0;
  for (let k = 0; k < V; k++) {
    if (!Number.isNaN(gap[k]) || !surf[k] || surf[k].dist > 0.08) continue;
    let s = 0, n = 0;
    for (const j of nbrs[k]) if (!Number.isNaN(gap[j])) {
      s += gap[j];
      n++;
    }
    if (n) {
      gap[k] = s / n;
      changed++;
    }
  }
  if (!changed) break;
}
const MARGIN = 0.002;
const out = new Float32Array(V * 3);
let pushed = 0;
for (let k = 0; k < V; k++) {
  let p = moved[k];
  const nb = surf[k];
  if (nb && !Number.isNaN(gap[k]) && gap[k] < TIGHT * 1.5 && !(FOOT && isShoe[k])) {
    const fitted = add(nb.pos, mul(nb.nrm, Math.max(gap[k], MARGIN)));
    // 붙는 옷은 맞춘 자리로, 조금 뜬 옷은 섞고, 많이 뜬 옷(치마 자락)은 뼈만 따라간다
    const f = gap[k] <= TIGHT ? 1 : 1 - (gap[k] - TIGHT) / (TIGHT * 0.5);
    p = add(mul(fitted, f), mul(p, 1 - f));
  }
  // 3) 몸 안으로 들어간 정점은 밀어낸다
  const chk = nearest(newBody, p);
  if (chk && chk.dist < 0.08) {
    const h = dot(sub(p, chk.pos), chk.nrm);
    if (h < MARGIN) {
      p = add(p, mul(chk.nrm, MARGIN - h));
      pushed++;
    }
  }
  out.set(p, k * 3);
}
console.log('\n몸 밖으로 밀어낸 정점', pushed);

// 4) 옷 삼각형 사이로 몸이 뚫고 나온 곳: 그 옷 삼각형을 몸 바깥으로 밀어낸다 (신발 빼고)
const pokedAll = new Set();
function fixPokes() {
  const tri = primIdx.flatMap((I, n) => (matName(src, clothPrims[n].material).startsWith('Shoes_') ? [] : Array.from({ length: I.length / 3 }, (_, t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]])));
  const P3 = (k) => [out[k * 3], out[k * 3 + 1], out[k * 3 + 2]];
  let fixed = 0;
  for (let round = 0; round < 8; round++) {
    const push = new Float64Array(V * 3), cnt = new Float64Array(V);
    for (const i of newBody.verts) {
      const b = vtx(newBody, i);
      const bn = norm([newBody.N[i * 3], newBody.N[i * 3 + 1], newBody.N[i * 3 + 2]]);
      // 몸이 옷 밖으로 크게(4.5cm 까지) 튀어나온 곳도 찾는다. 옷 가장자리 밖(팔·다리 맨살)은 빼려고 삼각형 안쪽에 떨어지는 점만
      let best = 0.045 ** 2, hit = null;
      for (const [a, c, d] of tri) {
        const A = P3(a), C = P3(c), Dd = P3(d);
        if (Math.abs(A[1] - b[1]) > 0.05) continue;
        const bc = closestBary(b, A, C, Dd);
        const q = add(add(mul(A, bc[0]), mul(C, bc[1])), mul(Dd, bc[2]));
        const dd = (q[0] - b[0]) ** 2 + (q[1] - b[1]) ** 2 + (q[2] - b[2]) ** 2;
        if (dd < best && (dd < 0.02 ** 2 || Math.min(...bc) > 0.01)) {
          best = dd;
          hit = { ids: [a, c, d], bc, q };
        }
      }
      if (!hit) continue;
      // 몸 법선 방향으로 옷보다 바깥이면 (또는 너무 가까우면) 뚫고 나온 것
      const need = dot(sub(b, hit.q), bn) + 0.003;
      if (need <= 0) continue;
      hit.ids.forEach((k, j) => {
        for (let c = 0; c < 3; c++) push[k * 3 + c] += bn[c] * need * hit.bc[j];
        cnt[k] += hit.bc[j];
      });
    }
    let n = 0;
    for (let k = 0; k < V; k++)
      if (cnt[k] > 0) {
        for (let c = 0; c < 3; c++) out[k * 3 + c] += push[k * 3 + c] / cnt[k];
        pokedAll.add(k);
        n++;
      }
    fixed += n;
    if (!n) break;
  }
  return fixed;
}
console.log('몸이 뚫고 나온 곳 고친 옷 정점', fixPokes());
// 5) 밀어낸 자리가 접히지 않게: 밀린 정점과 그 이웃을 주변 평균 쪽으로 부드럽게 → 다시 뚫린 곳 고치기
{
  const zone = new Set(pokedAll);
  for (const k of pokedAll) for (const j of nbrs[k]) if (!isShoe[j]) zone.add(j);
  for (let it = 0; it < 6; it++) {
    const next = new Float32Array(out);
    for (const k of zone) {
      if (!nbrs[k].size) continue;
      const avg = [0, 0, 0];
      for (const j of nbrs[k]) for (let c = 0; c < 3; c++) avg[c] += out[j * 3 + c] / nbrs[k].size;
      for (let c = 0; c < 3; c++) next[k * 3 + c] = out[k * 3 + c] * 0.5 + avg[c] * 0.5;
    }
    out.set(next);
  }
  console.log('부드럽게 다듬은 옷 정점', zone.size, '· 다시 고친 정점', fixPokes());
}

// ---------- 새 뼈 붙이기 ----------
const neededNames = new Set();
for (let k = 0; k < V; k++) for (let c = 0; c < 4; c++) if (SW[used[k] * 4 + c]) neededNames.add(srcJointNames[SJ[used[k] * 4 + c]]);
// 흔들림 뼈 사슬 전체 (옷에 쓰인 뼈가 들어 있는 사슬)
const springs = src.json.extensions?.VRMC_springBone?.springs ?? [];
const takeSprings = springs.filter((s) => s.joints.some((j) => neededNames.has(S.nodes[j.node].name)) && s.joints.some((j) => !dstHas(S.nodes[j.node].name)));
for (const s of takeSprings) for (const j of s.joints) neededNames.add(S.nodes[j.node].name);
const added = [];
function ensureNode(name) {
  if (dstHas(name)) return D.byName.get(name);
  const si = S.byName.get(name);
  const pname = S.nodes[S.parent.get(si)].name;
  const pi = ensureNode(pname);
  const { translation, rotation, scale } = S.nodes[si];
  // 옷만 담는 파일에서는 새로 붙인 뼈 이름 앞에 G_ 를 붙인다 (게임에서 입는 몸의 같은 이름 뼈와 헷갈리지 않게)
  dst.json.nodes.push({ name: GARMENT ? `G_${name}` : name, ...(translation && { translation }), ...(rotation && { rotation }), ...(scale && { scale }) });
  const ni = dst.json.nodes.length - 1;
  (dst.json.nodes[pi].children ||= []).push(ni);
  D.byName.set(name, ni);
  if (FRESH(name)) freshMade.add(name);
  D.parent.set(ni, pi);
  added.push(name);
  return ni;
}
for (const name of neededNames) ensureNode(name);
// 새로 붙인 뼈의 따라가기 설정 (VRMC_node_constraint): 소매·바짓가랑이 뼈(J_Aim_…)가 팔·다리 쪽을 바라보게.
// 이게 빠지면 팔을 내려도 소매가 T자세 그대로 옆으로 뻗어 있다
let constraints = 0;
for (const name of [...added]) {
  const ext = S.nodes[S.byName.get(name)].extensions?.VRMC_node_constraint;
  if (!ext) continue;
  const c = JSON.parse(JSON.stringify(ext));
  for (const def of Object.values(c.constraint)) def.source = ensureNode(S.nodes[def.source].name);
  const node = dst.json.nodes[D.byName.get(name)];
  node.extensions = { ...node.extensions, VRMC_node_constraint: c };
  constraints++;
}
if (constraints) {
  const used = (dst.json.extensionsUsed ||= []);
  if (!used.includes('VRMC_node_constraint')) used.push('VRMC_node_constraint');
}
console.log('새로 붙인 뼈', added.length, '· 따라가기 설정', constraints);

// 스킨 관절 목록에 추가 + 묶음 행렬
const ibmOld = readAcc(dst, dstSkin.inverseBindMatrices).v;
const joints = [...dstSkin.joints];
const jointIndex = new Map(joints.map((j, k) => [dst.json.nodes[j].name, k]));
const ibm = Array.from(ibmOld);
for (const name of neededNames) {
  if (jointIndex.has(name) && !freshMade.has(name)) continue;
  const ni = D.byName.get(name);
  joints.push(ni);
  jointIndex.set(name, joints.length - 1);
  ibm.push(...m4inv(newWorld(name)));
}
dstSkin.joints = joints;
dstSkin.inverseBindMatrices = addAccessor(dst, new Float32Array(ibm), 'MAT4', 5126);

// ---------- 옷 정점 데이터 ----------
const nrm = new Float32Array(V * 3), uv = new Float32Array(V * 2), jo = new Uint16Array(V * 4), we = new Float32Array(V * 4);
for (let k = 0; k < V; k++) {
  const i = used[k];
  for (let c = 0; c < 3; c++) nrm[k * 3 + c] = SN[i * 3 + c];
  uv[k * 2] = SU[i * 2];
  uv[k * 2 + 1] = SU[i * 2 + 1];
  for (let c = 0; c < 4; c++) {
    const w = SW[i * 4 + c];
    jo[k * 4 + c] = w ? jointIndex.get(srcJointNames[SJ[i * 4 + c]]) : 0;
    we[k * 4 + c] = w;
  }
}
const aPos = addAccessor(dst, out, 'VEC3', 5126, 34962, true);
const aNrm = addAccessor(dst, nrm, 'VEC3', 5126, 34962);
const aUv = addAccessor(dst, uv, 'VEC2', 5126, 34962);
const aJo = addAccessor(dst, jo, 'VEC4', 5123, 34962);
const aWe = addAccessor(dst, we, 'VEC4', 5126, 34962);

// ---------- 재질·그림 복사 ----------
const texMap = new Map(), imgMap = new Map(), smpMap = new Map();
function copyImage(i) {
  if (imgMap.has(i)) return imgMap.get(i);
  const im = src.json.images[i];
  const bv = src.json.bufferViews[im.bufferView];
  const data = src.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const view = appendView(dst, Buffer.from(data));
  dst.json.images.push({ name: im.name, mimeType: im.mimeType, bufferView: view });
  imgMap.set(i, dst.json.images.length - 1);
  return imgMap.get(i);
}
function copyTexture(i) {
  if (texMap.has(i)) return texMap.get(i);
  const t = src.json.textures[i];
  const nt = { ...t, source: copyImage(t.source) };
  if (t.sampler !== undefined) {
    if (!smpMap.has(t.sampler)) {
      dst.json.samplers.push({ ...src.json.samplers[t.sampler] });
      smpMap.set(t.sampler, dst.json.samplers.length - 1);
    }
    nt.sampler = smpMap.get(t.sampler);
  }
  dst.json.textures.push(nt);
  texMap.set(i, dst.json.textures.length - 1);
  return texMap.get(i);
}
function remapTextures(o) {
  if (Array.isArray(o)) return o.map(remapTextures);
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (/Texture$/.test(k) && v && typeof v.index === 'number') r[k] = { ...remapTextures(v), index: copyTexture(v.index) };
    else r[k] = remapTextures(v);
  }
  return r;
}
const baseMatCount = dst.json.materials.length;
const basePrimCount = dstBodyMesh.primitives.length;
const baseSpringCount = dst.json.extensions.VRMC_springBone.springs.length;
const matMap = new Map();
for (const p of clothPrims) {
  if (matMap.has(p.material)) continue;
  dst.json.materials.push(remapTextures(src.json.materials[p.material]));
  matMap.set(p.material, dst.json.materials.length - 1);
}
clothPrims.forEach((p, n) => {
  const I = primIdx[n];
  const aI = addAccessor(dst, V < 65536 ? new Uint16Array(I) : new Uint32Array(I), 'SCALAR', V < 65536 ? 5123 : 5125, 34963);
  dstBodyMesh.primitives.push({ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv, JOINTS_0: aJo, WEIGHTS_0: aWe }, indices: aI, material: matMap.get(p.material), mode: 4 });
});

// ---------- 흔들림 뼈 설정 ----------
const sb = dst.json.extensions.VRMC_springBone;
const srcSb = src.json.extensions.VRMC_springBone;
const colMap = new Map(), grpMap = new Map();
const nodeOf = (oldNode) => ensureNode(S.nodes[oldNode].name);
function copyGroup(gi) {
  if (grpMap.has(gi)) return grpMap.get(gi);
  const g = srcSb.colliderGroups[gi];
  const cols = g.colliders.map((ci) => {
    if (!colMap.has(ci)) {
      const c = srcSb.colliders[ci];
      sb.colliders.push({ ...c, node: nodeOf(c.node) });
      colMap.set(ci, sb.colliders.length - 1);
    }
    return colMap.get(ci);
  });
  sb.colliderGroups.push({ ...g, colliders: cols });
  grpMap.set(gi, sb.colliderGroups.length - 1);
  return grpMap.get(gi);
}
for (const s of takeSprings) {
  const ns = { ...s, joints: s.joints.map((j) => ({ ...j, node: nodeOf(j.node) })) };
  if (s.colliderGroups) ns.colliderGroups = s.colliderGroups.map(copyGroup);
  if (s.center !== undefined) ns.center = nodeOf(s.center);
  sb.springs.push(ns);
}
console.log('옮긴 흔들림 사슬', takeSprings.length);

// 기본 몸의 목걸이·팔찌는 VRoid 가 '원피스' 로 분류해 둔다 → 장신구 이름으로 바꿔 코디(색 칠하기)·비키니(옷 감추기)에서 빠지게
for (const m of dst.json.materials.slice(0, baseMatCount)) if (/Onepiece_/.test(m.name)) m.name = m.name.replace('Onepiece_', 'Accessory_');

if (GARMENT) stripToGarment();

saveGlb(dst, OUT);

/** 몸·얼굴·머리를 빼고 옛 옷 조각만 남긴 뒤, 쓰지 않는 그림·자료를 버려 파일을 줄인다 */
function stripToGarment() {
  const J = dst.json;
  // 메쉬: 몸 메쉬의 옷 조각만 남기고 나머지 메쉬는 노드에서 뗀다
  dstBodyMesh.primitives = dstBodyMesh.primitives.slice(basePrimCount);
  J.nodes.forEach((n) => {
    if (n.mesh !== undefined && n.mesh !== dstBodyIdx) {
      delete n.mesh;
      delete n.skin;
    }
  });
  // 원래 몸의 흔들림(머리카락·가슴)은 빼고 옷의 흔들림만
  const sb = J.extensions.VRMC_springBone;
  sb.springs = sb.springs.slice(baseSpringCount);
  // 표정·1인칭 설정은 얼굴 메쉬를 가리키므로 비운다. 썸네일도 뺀다
  const vrmc = J.extensions.VRMC_vrm;
  if (vrmc.expressions) vrmc.expressions = { preset: {}, custom: {} };
  if (vrmc.firstPerson) vrmc.firstPerson = { meshAnnotations: [] };
  if (vrmc.meta) delete vrmc.meta.thumbnailImage;

  // ---- 쓰는 것만 모으기 ----
  const usedAcc = new Set(), usedMat = new Set();
  for (const pr of dstBodyMesh.primitives) {
    Object.values(pr.attributes).forEach((a) => usedAcc.add(a));
    if (pr.indices !== undefined) usedAcc.add(pr.indices);
    if (pr.material !== undefined) usedMat.add(pr.material);
  }
  J.meshes = [dstBodyMesh];
  J.nodes.forEach((n) => {
    if (n.mesh !== undefined) n.mesh = 0;
  });
  const skinIdx = J.nodes.find((n) => n.mesh === 0).skin;
  J.skins = [J.skins[skinIdx]];
  J.nodes.forEach((n) => {
    if (n.skin !== undefined) n.skin = 0;
  });
  usedAcc.add(J.skins[0].inverseBindMatrices);
  const usedTex = new Set();
  const walkTex = (o) => {
    if (Array.isArray(o)) return o.forEach(walkTex);
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (/Texture$/.test(k) && v && typeof v.index === 'number') usedTex.add(v.index);
      walkTex(v);
    }
  };
  for (const m of usedMat) walkTex(J.materials[m]);
  const usedImg = new Set([...usedTex].map((t) => J.textures[t].source));

  // ---- 번호 다시 매기기 ----
  const remapList = (arr, used) => {
    const map = new Map();
    const out = [];
    arr.forEach((x, i) => {
      if (used.has(i)) {
        map.set(i, out.length);
        out.push(x);
      }
    });
    return { out, map };
  };
  const mats = remapList(J.materials, usedMat);
  const texs = remapList(J.textures, usedTex);
  const imgs = remapList(J.images, usedImg);
  const accs = remapList(J.accessors, usedAcc);
  const fixTex = (o) => {
    if (Array.isArray(o)) return o.map(fixTex);
    if (!o || typeof o !== 'object') return o;
    const r = {};
    for (const [k, v] of Object.entries(o)) r[k] = /Texture$/.test(k) && v && typeof v.index === 'number' ? { ...fixTex(v), index: texs.map.get(v.index) } : fixTex(v);
    return r;
  };
  J.materials = mats.out.map(fixTex);
  J.textures = texs.out.map((t) => ({ ...t, source: imgs.map.get(t.source) }));
  for (const pr of dstBodyMesh.primitives) {
    for (const k of Object.keys(pr.attributes)) pr.attributes[k] = accs.map.get(pr.attributes[k]);
    if (pr.indices !== undefined) pr.indices = accs.map.get(pr.indices);
    if (pr.material !== undefined) pr.material = mats.map.get(pr.material);
  }
  J.skins[0].inverseBindMatrices = accs.map.get(J.skins[0].inverseBindMatrices);

  // ---- 자료 덩어리(bin) 다시 만들기: 쓰는 bufferView 만 ----
  const oldViews = J.bufferViews;
  const oldBin = dst.bin;
  J.bufferViews = [];
  dst.bin = Buffer.alloc(0);
  const viewMap = new Map();
  const copyView = (vi) => {
    if (viewMap.has(vi)) return viewMap.get(vi);
    const v = oldViews[vi];
    const data = oldBin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const ni = appendView(dst, Buffer.from(data), v.target);
    if (v.byteStride) J.bufferViews[ni].byteStride = v.byteStride;
    viewMap.set(vi, ni);
    return ni;
  };
  J.accessors = accs.out.map((a) => ({ ...a, bufferView: copyView(a.bufferView) }));
  J.images = imgs.out.map((im) => ({ ...im, bufferView: copyView(im.bufferView) }));
  console.log('옷만 남김: 조각', dstBodyMesh.primitives.length, '재질', J.materials.length, '그림', J.images.length, '흔들림 사슬', sb.springs.length);
}
console.log('저장:', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + 'MB');
