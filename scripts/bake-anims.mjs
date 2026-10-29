// Quaternius Universal Animation Library (CC0) → VRM 휴머노이드 뼈대용 애니메이션 데이터로 굽기.
// GLB 의 JSON/BIN 데이터만 읽는다 (코드 실행 없음).
// 사용: node scripts/bake-anims.mjs node_modules/three/build/three.module.js public/anims/ual.json <UAL1 .glb> <UAL2 .glb>
// 원본: https://opengameart.org/node/174563 , https://opengameart.org/content/universal-animation-library-2 (CC0)
//
// 원리: 원본 리그의 T포즈(A_TPose 첫 프레임) 대비 각 뼈의 '월드 회전 변화량' D 를 프레임마다 기록한다.
// VRM 정규화 뼈대는 T포즈에서 모든 회전이 항등이므로, 실행 시 local = D(부모)^-1 · D(뼈) 로 바로 쓸 수 있다.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const [threePath, outPath, ...glbs] = process.argv.slice(2);
const THREE = await import(pathToFileURL(threePath).href);

/** VRM 휴머노이드 뼈 ← Rigify DEF 뼈 (라이브러리 1). 손가락 제외: 주먹은 코드로 쥔다 */
const RIGIFY = {
  hips: 'DEF-hips',
  spine: 'DEF-spine.001',
  chest: 'DEF-spine.002',
  upperChest: 'DEF-spine.003',
  neck: 'DEF-neck',
  head: 'DEF-head',
  leftShoulder: 'DEF-shoulder.L',
  leftUpperArm: 'DEF-upper_arm.L',
  leftLowerArm: 'DEF-forearm.L',
  leftHand: 'DEF-hand.L',
  rightShoulder: 'DEF-shoulder.R',
  rightUpperArm: 'DEF-upper_arm.R',
  rightLowerArm: 'DEF-forearm.R',
  rightHand: 'DEF-hand.R',
  leftUpperLeg: 'DEF-thigh.L',
  leftLowerLeg: 'DEF-shin.L',
  leftFoot: 'DEF-foot.L',
  leftToes: 'DEF-toe.L',
  rightUpperLeg: 'DEF-thigh.R',
  rightLowerLeg: 'DEF-shin.R',
  rightFoot: 'DEF-foot.R',
  rightToes: 'DEF-toe.R',
};

/** VRM 휴머노이드 뼈 ← 언리얼 마네킹 뼈 (라이브러리 2) */
const UE = {
  hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', upperChest: 'spine_03', neck: 'neck_01', head: 'Head',
  leftShoulder: 'clavicle_l', leftUpperArm: 'upperarm_l', leftLowerArm: 'lowerarm_l', leftHand: 'hand_l',
  rightShoulder: 'clavicle_r', rightUpperArm: 'upperarm_r', rightLowerArm: 'lowerarm_r', rightHand: 'hand_r',
  leftUpperLeg: 'thigh_l', leftLowerLeg: 'calf_l', leftFoot: 'foot_l', leftToes: 'ball_l',
  rightUpperLeg: 'thigh_r', rightLowerLeg: 'calf_r', rightFoot: 'foot_r', rightToes: 'ball_r',
};
let MAP = RIGIFY;

/** 게임에서 쓸 클립 → 이름 */
const WANT = {
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  jab: 'Punch_Jab',
  cross: 'Punch_Cross',
  hook: 'Melee_Hook',
  hitChest: 'Hit_Chest',
  hitHead: 'Hit_Head',
  knockback: 'Hit_Knockback',
  getup: 'LayToIdle',
  crouch: 'Crouch_Idle_Loop',
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jump: 'Jump_Loop',
};
const FPS = 30;

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'glTF') throw new Error('not glb: ' + file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const accessor = (i) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const n = N[a.type];
    if (a.componentType !== 5126) throw new Error('only float accessors supported');
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = bv.byteStride ?? n * 4;
    const out = new Float32Array(a.count * n);
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(off + k * stride + c * 4);
    return { data: out, n };
  };
  return { json, accessor };
}

function evaluator({ json, accessor }) {
  const nodes = json.nodes;
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const rest = nodes.map((n) => {
    if (n.matrix) {
      const m = new THREE.Matrix4().fromArray(n.matrix);
      const t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(t, r, s);
      return { t, r, s };
    }
    return {
      t: new THREE.Vector3(...(n.translation ?? [0, 0, 0])),
      r: new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
      s: new THREE.Vector3(...(n.scale ?? [1, 1, 1])),
    };
  });

  const clips = new Map();
  for (const a of json.animations ?? []) {
    const ch = a.channels.map((c) => {
      const s = a.samplers[c.sampler];
      const input = accessor(s.input).data;
      const out = accessor(s.output);
      return { node: c.target.node, path: c.target.path, input, out, interp: s.interpolation ?? 'LINEAR' };
    });
    const duration = Math.max(...ch.map((c) => c.input[c.input.length - 1]));
    clips.set(a.name, { ch, duration });
  }

  function sampleChannel(c, t) {
    const { input, out, interp } = c;
    const n = out.n;
    const cubic = interp === 'CUBICSPLINE';
    const val = (k) => {
      const base = cubic ? (k * 3 + 1) * n : k * n; // 큐빅이면 [in, value, out] 중 value
      return Array.from(out.data.subarray(base, base + n));
    };
    if (t <= input[0]) return val(0);
    const last = input.length - 1;
    if (t >= input[last]) return val(last);
    let k = 0;
    while (input[k + 1] < t) k++;
    const u = interp === 'STEP' ? 0 : (t - input[k]) / (input[k + 1] - input[k]);
    const a = val(k), b = val(k + 1);
    if (c.path === 'rotation') {
      const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), u);
      return [q.x, q.y, q.z, q.w];
    }
    return a.map((x, i) => x + (b[i] - x) * u);
  }

  /** 시간 t 에서 모든 노드의 월드 행렬 */
  function pose(clipName, t) {
    const local = rest.map((r) => ({ t: r.t.clone(), r: r.r.clone(), s: r.s.clone() }));
    const clip = clips.get(clipName);
    for (const c of clip.ch) {
      const v = sampleChannel(c, t);
      if (c.path === 'rotation') local[c.node].r.set(...v);
      else if (c.path === 'translation') local[c.node].t.set(...v);
      else if (c.path === 'scale') local[c.node].s.set(...v);
    }
    const world = new Array(nodes.length);
    const calc = (i) => {
      if (world[i]) return world[i];
      const m = new THREE.Matrix4().compose(local[i].t, local[i].r, local[i].s);
      world[i] = parent[i] >= 0 ? calc(parent[i]).clone().multiply(m) : m;
      return world[i];
    };
    nodes.forEach((_, i) => calc(i));
    return world;
  }

  const decompose = (m) => {
    const t = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(t, r, s);
    return { t, r };
  };
  return { clips, byName, pose, decompose };
}

const r4 = (x) => Math.round(x * 10000) / 10000;
const result = { fps: FPS, source: 'Quaternius Universal Animation Library 1/2 (CC0)', clips: {} };

for (const file of glbs) {
  const ev = evaluator(readGlb(file));
  MAP = ev.byName.has('pelvis') ? UE : RIGIFY;
  if (!ev.clips.has('A_TPose')) throw new Error('A_TPose missing in ' + file);
  for (const name of Object.values(MAP)) if (!ev.byName.has(name)) throw new Error(`bone ${name} missing in ${file}`);

  // T포즈 기준
  const tpose = ev.pose('A_TPose', 0);
  const T = {};
  for (const [vrm, src] of Object.entries(MAP)) T[vrm] = ev.decompose(tpose[ev.byName.get(src)]);
  const hipsT = T.hips.t;
  const hipH = hipsT.y;
  // 원본이 바라보는 방향: 발끝이 발목보다 +Z 쪽이면 +Z (VRM 과 같음)
  const faceSign = Math.sign(T.leftToes.t.z - T.leftFoot.t.z) || 1;
  const flip = faceSign < 0 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) : null;

  for (const [key, clipName] of Object.entries(WANT)) {
    if (result.clips[key] || !ev.clips.has(clipName)) continue;
    const { duration } = ev.clips.get(clipName);
    const frames = Math.max(2, Math.round(duration * FPS) + 1);
    const tracks = Object.fromEntries(Object.keys(MAP).map((k) => [k, []]));
    const hips = [];
    const reach = { L: [], R: [] };
    for (let f = 0; f < frames; f++) {
      const w = ev.pose(clipName, Math.min(duration, f / FPS));
      const hipNow = ev.decompose(w[ev.byName.get(MAP.hips)]).t;
      for (const [vrm, src] of Object.entries(MAP)) {
        const cur = ev.decompose(w[ev.byName.get(src)]);
        const D = cur.r.clone().multiply(T[vrm].r.clone().invert());
        if (flip) D.premultiply(flip).multiply(flip.clone().invert());
        tracks[vrm].push(r4(D.x), r4(D.y), r4(D.z), r4(D.w));
      }
      const off = hipNow.clone().sub(hipsT).divideScalar(hipH);
      if (flip) off.set(-off.x, off.y, -off.z);
      hips.push(r4(off.x), r4(off.y), r4(off.z));
      // 손이 골반보다 얼마나 앞(+Z)에 있나 → 타격 순간 찾기
      for (const side of ['L', 'R']) {
        const hand = ev.decompose(w[ev.byName.get(MAP[side === 'L' ? 'leftHand' : 'rightHand'])]).t;
        reach[side].push(((hand.z - hipNow.z) * faceSign) / hipH);
      }
    }
    const span = (a) => Math.max(...a) - Math.min(...a);
    const hand = span(reach.L) >= span(reach.R) ? 'L' : 'R';
    const peak = reach[hand].indexOf(Math.max(...reach[hand]));
    result.clips[key] = { name: clipName, duration: r4(duration), frames, impact: r4(peak / FPS), hand, hips, tracks };
    console.log(`${key.padEnd(10)} ${clipName.padEnd(18)} ${duration.toFixed(2)}s  hand=${hand} impact=${(peak / FPS).toFixed(2)}s  face=${faceSign}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(result));
console.log('wrote', outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + 'KB');
