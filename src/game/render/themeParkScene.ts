import * as THREE from 'three';
import {
  CAR_GAP,
  COASTER_CARS,
  COASTER_TRACK,
  DROP,
  PARK,
  RIDES,
  VIKING,
  WHEEL,
  carS,
  coasterAt,
  coasterTime,
  dropAt,
  rideClock,
  trackAt,
  vikingAt,
  wheelAngle,
  DROP_RUN,
  GYRO,
  GYRO_RUN,
  SKY,
  SKY_RUN,
  PARK_NODES,
  PARK_PATHS,
  RIDE_NODE,
  gyroAt,
  skyAt,
  nearestOnPaths,
  signposts,
  seatPose,
  type RideId,
  type SeatPose,
  type TrackPoint,
} from '../city/themePark';
import { mergeByMaterial } from './merge';
import { Fighter } from '../core/fighter';
import { PersonView } from './personView';
import { FloatingTexts } from './effects';
import type { FrameClock } from './clock';
import { STAFF_NAMES, parkPeople } from '../city/parkPeople';

/** 놀이공원 사람 하나: 움직임용 Fighter + 모델 + (좌석에 앉을 때 쓰는) 받침 */
interface ParkPersonView {
  f: Fighter;
  view: PersonView;
  lift: THREE.Group;
  label: THREE.Sprite | null;
}

/** 직원 제복 색 */
const STAFF_TINT = 0xff8a5c;

/** 머리 위 이름표 (체력바 없이 글자만) */
function labelSprite(text: string, color: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(1.6, 0.4, 1);
  return sp;
}

/**
 * 한강 놀이공원 장면. 놀이기구 움직임은 themePark.ts 의 공유 시각 계산을 그대로 그린다
 * (그래서 친구 화면과 열차·배·좌석 위치가 같다). 해·하늘빛·하늘은 도시 것을 빌려 쓴다(cityRenderer).
 */

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const std = (color: number, rough = 0.7, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 글자 간판 */
function signTexture(text: string, bg: string, fg: string, w = 1024, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = h * 0.05;
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  g.fillStyle = fg;
  g.font = `900 ${Math.round(h * 0.5)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 점들을 따라가는 관(레일) */
function tubeAlong(points: THREE.Vector3[], radius: number, radial = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const n = points.length;
  const t = new THREE.Vector3();
  const a = new THREE.Vector3(0, 1, 0);
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    t.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    // 평행 이동한 법선
    b.copy(a).addScaledVector(t, -a.dot(t));
    if (b.lengthSq() < 1e-6) b.set(1, 0, 0).addScaledVector(t, -t.x);
    b.normalize();
    a.copy(b);
    c.crossVectors(t, b);
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const nx = b.x * Math.cos(th) + c.x * Math.sin(th);
      const ny = b.y * Math.cos(th) + c.y * Math.sin(th);
      const nz = b.z * Math.cos(th) + c.z * Math.sin(th);
      pos.push(points[i].x + nx * radius, points[i].y + ny * radius, points[i].z + nz * radius);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a0 = i * radial + k;
      const a1 = i * radial + ((k + 1) % radial);
      const b0 = a0 + radial;
      const b1 = a1 + radial;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** 트랙 점의 좌우·위·진행 기준 행렬 */
function basisAt(p: TrackPoint, m: THREE.Matrix4, offUp = 0, offRight = 0) {
  const t = new THREE.Vector3(p.tx, p.ty, p.tz);
  const u = new THREE.Vector3(p.ux, p.uy, p.uz);
  const r = new THREE.Vector3().crossVectors(t, u).normalize();
  m.makeBasis(r, u, t);
  m.setPosition(p.x + u.x * offUp + r.x * offRight, p.y + u.y * offUp + r.y * offRight, p.z + u.z * offUp + r.z * offRight);
  return m;
}


// ───────────────────────── 길 · 이정표 · 입구 아치 · 새 놀이기구 · 장식 (ThemeParkScene 확장) ─────────────────────────

/** 벽돌 포장 무늬 (헤링본 비슷하게 엇갈려 쌓은 벽돌) */
function brickTexture(base: string, dark: string, mortar: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = mortar;
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 4; col++) {
      g.fillStyle = (row * 7 + col * 3) % 5 === 0 ? dark : base;
      g.fillRect(col * 32 + off + 1, row * 16 + 1, 30, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 이정표 화살표 판: 화살표가 오른쪽(dir = 1) 또는 왼쪽(-1)을 가리킨다 */
function arrowBoardTexture(labels: string[], dir: 1 | -1, color: string) {
  const W = 512;
  const lineH = 56;
  const H = 24 + labels.length * lineH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // 화살표 모양 판 (뾰족한 끝이 가리키는 쪽)
  const tip = 46;
  g.fillStyle = color;
  g.beginPath();
  if (dir > 0) {
    g.moveTo(4, 4);
    g.lineTo(W - tip, 4);
    g.lineTo(W - 4, H / 2);
    g.lineTo(W - tip, H - 4);
    g.lineTo(4, H - 4);
  } else {
    g.moveTo(W - 4, 4);
    g.lineTo(tip, 4);
    g.lineTo(4, H / 2);
    g.lineTo(tip, H - 4);
    g.lineTo(W - 4, H - 4);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `800 38px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = dir > 0 ? 'left' : 'right';
  labels.forEach((t, i) => g.fillText(t, dir > 0 ? 22 : W - 22, 12 + lineH * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: W / H };
}

/** 놀이기구 상징 색 */
const RIDE_COLOR: Record<RideId, string> = {
  coaster: '#d6332f',
  drop: '#2f6fd8',
  viking: '#8a5a2b',
  wheel: '#e08a1c',
  gyro: '#7b2fd8',
  sky: '#14a37f',
};

export class ThemeParkScene {
  readonly scene = new THREE.Scene();
  private cars: THREE.Group[] = [];
  private dropCarriage = new THREE.Group();
  private ship = new THREE.Group();
  private wheel = new THREE.Group();
  private cabins: THREE.Group[] = [];
  private carousel = new THREE.Group();
  private nightMats: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  private _m = new THREE.Matrix4();
  private _p: TrackPoint = { ...COASTER_TRACK[0] };

  constructor() {
    this.buildGround();
    this.buildPaths();
    this.buildGate();
    this.buildCoaster();
    this.buildDrop();
    this.buildViking();
    this.buildWheel();
    this.buildGyro();
    this.buildSky();
    this.buildCarousel();
    this.buildStalls();
    this.buildDecor();
    this.buildSignposts();
    this.buildTreesAndLamps();
    this.buildSkyline();
  }

  private glow(color: number, k = 1) {
    const m = std(color, 0.4, 0, { emissive: new THREE.Color(color), emissiveIntensity: 0 });
    this.nightMats.push({ m, k });
    return m;
  }

  private add(o: THREE.Object3D, shadow = true) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadow;
        m.receiveShadow = true;
      }
    });
    this.scene.add(o);
    return o;
  }

  // ───────────── 땅 · 길 · 울타리 · 입구 ─────────────

  private buildGround() {
    const b = PARK.bounds;
    const w = b.x1 - b.x0 + 120;
    const d = b.z1 - b.z0 + 120;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(0x5f9e48, 0.95));
    // 공원 밖 먼 땅 (멀리 도시 건물이 허공에 뜨지 않게)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), std(0x56704a, 1));
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.05;
    this.scene.add(far);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    grass.receiveShadow = true;
    this.scene.add(grass);
    const pave = std(0xd8c7a3, 0.9);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 48), pave);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.05, 22);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    // 분수
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.6, 32), std(0xbfc4c9, 0.6));
    basin.position.set(0, 0.3, 22);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.05, 32), std(0x3b8fd1, 0.1, 0.2));
    water.position.set(0, 0.58, 22);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 2.2, 12), std(0xe8edf2, 0.15, 0.1, { transparent: true, opacity: 0.75 }));
    spout.position.set(0, 1.6, 22);
    this.add(basin);
    this.scene.add(water, spout);

    // 울타리
    const post = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
    const postMat = std(0x2d3a2e, 0.6, 0.4);
    const posts: THREE.Vector3[] = [];
    const per = (a: [number, number], c: [number, number]) => {
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.round(L / 3);
      for (let i = 0; i <= n; i++) {
        const x = a[0] + ((c[0] - a[0]) * i) / n;
        const z = a[1] + ((c[1] - a[1]) * i) / n;
        if (Math.abs(x) < 7 && z > b.z1 - 1) continue; // 입구
        posts.push(new THREE.Vector3(x, 0.7, z));
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(c[0] - a[0]) || 0.05, 0.05, Math.abs(c[1] - a[1]) || 0.05), postMat);
      rail.position.set((a[0] + c[0]) / 2, 1.25, (a[1] + c[1]) / 2);
      if (!(a[1] === b.z1 && c[1] === b.z1)) this.scene.add(rail);
    };
    per([b.x0, b.z0], [b.x1, b.z0]);
    per([b.x0, b.z0], [b.x0, b.z1]);
    per([b.x1, b.z0], [b.x1, b.z1]);
    per([b.x0, b.z1], [b.x1, b.z1]);
    const im = new THREE.InstancedMesh(post, postMat, posts.length);
    posts.forEach((p, i) => im.setMatrixAt(i, this._m.makeTranslation(p.x, p.y, p.z)));
    this.scene.add(im);
    // 남쪽 울타리 (입구 양옆)
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - 7, 0.05, 0.05), postMat);
      r.position.set(s * ((b.x1 + 7) / 2), 1.25, b.z1);
      this.scene.add(r);
    }
  }

  private buildGate() {
    const g = new THREE.Group();
    const red = std(0xc8323c, 0.5);
    const gold = std(0xf2c14e, 0.35, 0.5);
    for (const s of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), red);
      tower.position.set(s * 7, 4.5, 0);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 4), gold);
      cap.position.set(s * 7, 10.5, 0);
      cap.rotation.y = Math.PI / 4;
      g.add(tower, cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(16.5, 2.4, 1.2), red);
    beam.position.set(0, 8.2, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2), new THREE.MeshBasicMaterial({ map: signTexture('한강랜드  HANGANG LAND', '#c8323c', '#ffe9a8') }));
    sign.position.set(0, 8.2, 0.61);
    const signBack = sign.clone();
    signBack.position.z = -0.61;
    signBack.rotation.y = Math.PI;
    g.add(beam, sign, signBack);
    // 전구 줄
    const bulbs = this.glow(0xffe08a, 2.2);
    for (let i = 0; i < 18; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bulbs);
      bulb.position.set(-8 + (16 * i) / 17, 6.85, 0.62);
      g.add(bulb);
    }
    g.position.set(0, 0, PARK.bounds.z1 - 1);
    this.add(g);
    // 역 출구 (지하철 계단 지붕)
    const st = new THREE.Group();
    const glass = std(0x9fc6d9, 0.1, 0.3, { transparent: true, opacity: 0.55 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 4), std(0x2f6fb5, 0.5));
    roof.position.y = 3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.1), glass);
    back.position.set(0, 1.5, 2);
    const ssign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ map: signTexture('🚇 2호선 한강공원역', '#2f6fb5', '#ffffff', 1024, 205) }));
    ssign.position.set(0, 3.5, -1.9);
    ssign.rotation.y = Math.PI;
    const ssign2 = ssign.clone();
    ssign2.rotation.y = 0;
    ssign2.position.z = -2.05;
    st.add(roof, back, ssign, ssign2);
    st.position.set(PARK.station.x, 0, PARK.station.z);
    this.add(st);
  }

  // ───────────── 롤러코스터 ─────────────

  private buildCoaster() {
    const T = COASTER_TRACK;
    // 밤엔 레일이 은은하게 빛난다 (깜깜한 데서도 트랙이 보이게)
    const railMat = this.glow(0xd9262f, 0.55);
    railMat.roughness = 0.35;
    railMat.metalness = 0.6;
    const spineMat = std(0xf4f4f4, 0.4, 0.5);
    const tieMat = std(0x30343b, 0.6, 0.5);
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    const spine: THREE.Vector3[] = [];
    const chain: THREE.Vector3[][] = [];
    let cur: THREE.Vector3[] | null = null;
    for (let i = 0; i <= T.length; i += 2) {
      const p = T[i % T.length];
      const t = new THREE.Vector3(p.tx, p.ty, p.tz);
      const u = new THREE.Vector3(p.ux, p.uy, p.uz);
      const r = new THREE.Vector3().crossVectors(t, u).normalize();
      const c = new THREE.Vector3(p.x, p.y, p.z);
      left.push(c.clone().addScaledVector(r, -0.52));
      right.push(c.clone().addScaledVector(r, 0.52));
      spine.push(c.clone().addScaledVector(u, -0.42));
      if (p.tag === 'lift') {
        if (!cur) chain.push((cur = []));
        cur.push(c.clone().addScaledVector(u, -0.05));
      } else cur = null;
    }
    this.add(new THREE.Mesh(tubeAlong(left, 0.08), railMat));
    this.add(new THREE.Mesh(tubeAlong(right, 0.08), railMat));
    this.add(new THREE.Mesh(tubeAlong(spine, 0.2, 8), spineMat));
    for (const c of chain) if (c.length > 2) this.scene.add(new THREE.Mesh(tubeAlong(c, 0.07, 4), std(0x1b1b1b, 0.9)));
    // 침목
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.12, 0.22), tieMat, Math.ceil(T.length / 3));
    let k = 0;
    for (let i = 0; i < T.length; i += 3) ties.setMatrixAt(k++, basisAt(T[i], this._m, -0.2));
    ties.count = k;
    ties.castShadow = true;
    this.scene.add(ties);
    // 기둥: 트랙이 바로 서 있는 곳에 5m 마다, 땅에서 트랙 밑까지 (루프·뒤집힌 곳은 따로)
    const colGeo = new THREE.CylinderGeometry(0.22, 0.28, 1, 8);
    colGeo.translate(0, 0.5, 0);
    const cols = new THREE.InstancedMesh(colGeo, spineMat, Math.ceil(T.length / 10) + 40);
    let c = 0;
    for (let i = 0; i < T.length; i += 10) {
      const p = T[i];
      if (p.y < 2.2 || p.uy < 0.55 || p.tunnel) continue;
      const h = p.y - 0.55;
      cols.setMatrixAt(c++, this._m.makeScale(1, h, 1).setPosition(p.x, 0, p.z));
      // 높은 곳은 굵은 받침을 좌우로 하나씩 더
      if (h > 18) {
        const t = new THREE.Vector3(p.tx, 0, p.tz).normalize();
        const r = new THREE.Vector3(-t.z, 0, t.x);
        for (const s of [-1, 1]) cols.setMatrixAt(c++, this._m.makeScale(1, h * 0.98, 1).setPosition(p.x + r.x * s * 2.2, 0, p.z + r.z * s * 2.2));
      }
    }
    // 루프: 양옆 바깥에서 받치는 기둥
    const inv = T.filter((p) => p.uy < -0.6);
    if (inv.length) {
      const top = inv[Math.floor(inv.length / 2)];
      for (const s of [-1, 1]) cols.setMatrixAt(c++, this._m.makeScale(1.4, top.y + 0.6, 1.4).setPosition(top.x + s * 4, 0, top.z));
    }
    cols.count = c;
    cols.castShadow = true;
    this.scene.add(cols);

    // 터널: 시커먼 상자 (안은 깜깜, 입구만 뻥)
    const tunnelPts = T.filter((p) => p.tunnel);
    if (tunnelPts.length) {
      const wall = std(0x3a3d42, 0.95);
      const n = Math.ceil(tunnelPts.length / 4);
      const L = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 5, 2.2).translate(-2.3, 1.6, 0), wall, n);
      const R = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 5, 2.2).translate(2.3, 1.6, 0), wall, n);
      const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 0.4, 2.2).translate(0, 4.1, 0), wall, n);
      let j = 0;
      for (let i = 0; i < tunnelPts.length; i += 4) {
        const p = tunnelPts[i];
        const t = new THREE.Vector3(p.tx, 0, p.tz).normalize();
        const m = this._m.makeBasis(new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(-1), new THREE.Vector3(0, 1, 0), t).setPosition(p.x, Math.max(0, p.y - 1.6), p.z);
        L.setMatrixAt(j, m);
        R.setMatrixAt(j, m);
        roof.setMatrixAt(j, m);
        j++;
      }
      L.count = R.count = roof.count = j;
      for (const im of [L, R, roof]) {
        im.castShadow = true;
        this.scene.add(im);
      }
    }

    // 머리 위를 스치는 철골 (헤드 초퍼): 첫 낙하 바닥과 루프 앞
    const beamMat = std(0x55606b, 0.5, 0.7);
    let dropEnd = 0;
    for (let i = 0; i < T.length; i++) if (T[i].ty < -0.9) dropEnd = i;
    const loopStart = T.findIndex((p) => p.uy < 0.2);
    for (const at of [dropEnd + 16, Math.max(0, loopStart - 22), dropEnd + 70]) {
      const p = T[(at + T.length) % T.length];
      if (p.uy < 0.8) continue;
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(7, 0.45, 0.45), beamMat);
      beam.position.y = 2.25;
      g.add(beam);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, p.y + 2.5, 0.35), beamMat);
        post.position.set(s * 3.3, 2.25 - (p.y + 2.5) / 2, 0);
        g.add(post);
      }
      g.applyMatrix4(basisAt(p, this._m));
      this.add(g);
    }

    // 역: 승강장 + 지붕 + 간판
    const st = new THREE.Group();
    const s0 = trackAt(0);
    const s1 = trackAt(16);
    // 승강장은 역 직선 구간 안쪽만 (서쪽에서 꺾여 들어오는 트랙과 겹치지 않게)
    const cx = (s0.x + s1.x) / 2 + 1.5;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(15, 1.0, 3.4), std(0xbfb7a8, 0.85));
    plat.position.set(cx, 0.5, s0.z + 2.3);
    const plat2 = plat.clone();
    plat2.position.z = s0.z - 2.3;
    const roofMat = std(0x7a1f26, 0.6);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.3, 8.5), roofMat);
    roof.position.set(cx, 5.2, s0.z);
    st.add(plat, plat2, roof);
    for (const x of [-7.5, -2.5, 2.5, 7.5])
      for (const z of [-3.9, 3.9]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), roofMat);
        p.position.set(cx + x, 2.6, s0.z + z);
        st.add(p);
      }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: signTexture('🎢 썬더 드래곤', '#1d1d24', '#ff5a3c') }));
    sign.position.set(cx, 6.3, s0.z + 4.3);
    const signBox = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.8, 0.2), std(0x1d1d24));
    signBox.position.set(cx, 6.3, s0.z + 4.15);
    st.add(signBox, sign);
    this.add(mergeByMaterial(st));
    // 줄 서는 곳 표지판
    this.queueSign('coaster');

    // 열차
    const body = std(0xe0262f, 0.35, 0.4);
    const seat = std(0x1c1c22, 0.8);
    const bar = std(0xf2c14e, 0.3, 0.7);
    const dark = std(0x2a2a2a, 0.6, 0.6);
    for (let i = 0; i < COASTER_CARS; i++) {
      const car = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.4), body);
      shell.position.y = 0.3;
      car.add(shell);
      // 바퀴 뭉치
      const bog = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.2), dark);
      bog.position.y = -0.1;
      car.add(bog);
      for (const row of [0.55, -0.55]) {
        for (const side of [-0.4, 0.4]) {
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.14), seat);
          back.position.set(side, 0.95, row - 0.38);
          const cush = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), seat);
          cush.position.set(side, 0.62, row - 0.05);
          // 무릎 위 안전바
          const lap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), bar);
          lap.position.set(side, 1.0, row + 0.32);
          const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), bar);
          stem.position.set(side, 0.8, row + 0.36);
          car.add(back, cush, lap, stem);
        }
      }
      if (i === 0) {
        // 맨 앞 칸: 용 머리
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.3, 4), body);
        nose.rotation.x = Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.35, 1.75);
        const eye = this.glow(0xffd23f, 3);
        for (const s of [-0.3, 0.3]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eye);
          e.position.set(s, 0.62, 1.35);
          car.add(e);
        }
        car.add(nose);
      }
      const merged = mergeByMaterial(car);
      merged.matrixAutoUpdate = false;
      this.add(merged);
      this.cars.push(merged);
    }
  }

  /** 놀이기구 입구 표지판 */
  private queueSign(id: keyof typeof RIDES) {
    this.buildEntrance(id);
  }

  // ───────────── 자이로드롭 ─────────────

  private buildDrop() {
    const g = new THREE.Group();
    const white = std(0xf1f1f1, 0.45, 0.3);
    const red = std(0xcf2b2b, 0.45, 0.3);
    const top = DROP.top;
    for (let y = 0; y < top; y += 4) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4, 2.2), (y / 4) % 2 === 0 ? white : red);
      seg.position.y = y + 2;
      g.add(seg);
    }
    const lights = this.glow(0x7fe1ff, 2.5);
    for (const [x, z] of [[-1.12, -1.12], [1.12, -1.12], [-1.12, 1.12], [1.12, 1.12]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, top, 0.08), lights);
      strip.position.set(x, top / 2, z);
      g.add(strip);
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.2, 3, 16), red);
    crown.position.y = top + 1.5;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 5, 12), white);
    spire.position.y = top + 5.5;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), this.glow(0xff3030, 4));
    beacon.position.y = top + 8.1;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.5, 32), std(0x6b6f76, 0.8));
    base.position.y = 0.25;
    g.add(crown, spire, beacon, base);
    const merged = mergeByMaterial(g);
    merged.position.set(DROP.x, 0, DROP.z);
    this.add(merged);
    // 좌석 고리
    const ring = new THREE.Mesh(new THREE.TorusGeometry(DROP.ringR - 0.5, 0.35, 8, 32), std(0xf2c14e, 0.35, 0.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    this.dropCarriage.add(ring);
    const seatMat = std(0x1d2a52, 0.6);
    const harness = std(0xffd23f, 0.35, 0.5);
    for (let k = 0; k < DROP.seats; k++) {
      const a = (k * 2 * Math.PI) / DROP.seats;
      const s = new THREE.Group();
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.15), seatMat);
      back.position.set(0, 0.9, -0.3);
      const cush = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.5), seatMat);
      cush.position.set(0, 0.42, 0);
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), harness);
      h1.position.set(-0.22, 1.25, -0.05);
      const h2 = h1.clone();
      h2.position.x = 0.22;
      s.add(back, cush, h1, h2);
      // 좌석은 바깥(고리 반대쪽)을 본다
      s.position.set(Math.cos(a) * DROP.ringR, 0, Math.sin(a) * DROP.ringR);
      s.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      this.dropCarriage.add(s);
    }
    const mc = mergeByMaterial(this.dropCarriage);
    this.dropCarriage = mc;
    this.add(mc);
    this.queueSign('drop');
  }

  // ───────────── 바이킹 ─────────────

  private buildViking() {
    const frame = std(0x5b6670, 0.5, 0.7);
    const g = new THREE.Group();
    const P = new THREE.Vector3(0, VIKING.pivotY, 0);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const foot = new THREE.Vector3(sx * 4.2, 0, sz * 6);
        const top = new THREE.Vector3(sx * 2.2, VIKING.pivotY, 0);
        const len = foot.distanceTo(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, len, 10), frame);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        g.add(leg);
      }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 5, 12), frame);
    axle.rotation.z = Math.PI / 2;
    axle.position.copy(P);
    g.add(axle);
    const fr = mergeByMaterial(g);
    fr.position.set(VIKING.x, 0, VIKING.z);
    this.add(fr);

    // 배: 피벗 기준 (아래로 arm 만큼). 길이 방향 = z
    const ship = new THREE.Group();
    const wood = std(0x7b4a26, 0.75);
    const trim = std(0xf2c14e, 0.35, 0.6);
    const sail = std(0xeee6d0, 0.9);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, VIKING.arm, 0.5), frame);
      arm.position.set(s * 1.9, -VIKING.arm / 2, 0);
      ship.add(arm);
    }
    // 선체: 끝으로 갈수록 올라가는 바닥판 + 옆판
    for (let z = -8; z <= 8; z += 1) {
      const y = -VIKING.arm + 0.3 + 0.045 * z * z;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2 - Math.abs(z) * 0.12, 0.25, 1.05), wood);
      floor.position.set(0, y, z);
      ship.add(floor);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 1.05), wood);
        side.position.set(s * (1.6 - Math.abs(z) * 0.06), y + 0.6, z);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.05), trim);
        rim.position.set(s * (1.6 - Math.abs(z) * 0.06), y + 1.25, z);
        ship.add(side, rim);
      }
    }
    // 의자 줄
    const bench = std(0x2b1b10, 0.8);
    for (const z of [-6.2, -3.8, 3.8, 6.2]) {
      const y = -VIKING.arm + 0.55 + 0.045 * z * z;
      const face = z < 0 ? 1 : -1;
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.15, 0.55), bench);
      b.position.set(0, y + 0.45, z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.8, 0.12), bench);
      back.position.set(0, y + 0.85, z - face * 0.3);
      const barr = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 0.08), trim);
      barr.position.set(0, y + 0.95, z + face * 0.45);
      ship.add(b, back, barr);
    }
    // 용머리 · 꼬리
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 8), trim);
    head.position.set(0, -VIKING.arm + 4.5, -9);
    head.rotation.x = -0.5;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2, 8), trim);
    tail.position.set(0, -VIKING.arm + 4.3, 9);
    tail.rotation.x = 0.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), wood);
    mast.position.set(0, -VIKING.arm + 2.4, 0);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.4), sail);
    sl.position.set(0, -VIKING.arm + 3, 0.15);
    ship.add(head, tail, mast, sl);
    const sm = mergeByMaterial(ship);
    this.ship.add(sm);
    this.ship.position.set(VIKING.x, VIKING.pivotY, VIKING.z);
    this.add(this.ship);
    this.queueSign('viking');
  }

  // ───────────── 대관람차 ─────────────

  private buildWheel() {
    const frame = std(0xe9edf1, 0.4, 0.5);
    const legs = new THREE.Group();
    for (const sz of [-1.8, 1.8])
      for (const sx of [-1, 1]) {
        const foot = new THREE.Vector3(sx * 9, 0, sz * 1.6);
        const top = new THREE.Vector3(0, WHEEL.hubY, sz);
        const len = foot.distanceTo(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, len, 10), frame);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        legs.add(leg);
      }
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 7), std(0x8a8f96, 0.8));
    base.position.set(0, 0.3, 2);
    legs.add(base);
    const lm = mergeByMaterial(legs);
    lm.position.set(WHEEL.x, 0, WHEEL.z);
    this.add(lm);
    const rimLight = this.glow(0xff7ad9, 2.2);
    for (const z of [-1.1, 1.1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.r, 0.2, 8, 96), frame);
      rim.position.z = z;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.r + 0.25, 0.06, 4, 96), rimLight);
      glow.position.z = z;
      this.wheel.add(rim, glow);
    }
    for (let k = 0; k < WHEEL.cabins; k++) {
      const a = (k / WHEEL.cabins) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, WHEEL.r, 0.12), frame);
      spoke.position.set(Math.sin(a) * (WHEEL.r / 2), -Math.cos(a) * (WHEEL.r / 2), 0);
      spoke.rotation.z = a;
      this.wheel.add(spoke);
      const spoke2 = spoke.clone();
      spoke2.position.z = 1.1;
      const spoke3 = spoke.clone();
      spoke3.position.z = -1.1;
      this.wheel.add(spoke2, spoke3);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 3, 20), frame);
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(hub);
    const wm = mergeByMaterial(this.wheel);
    this.wheel = new THREE.Group();
    this.wheel.add(wm);
    this.wheel.position.set(WHEEL.x, WHEEL.hubY, WHEEL.z);
    this.add(this.wheel);
    const colors = [0xe8483b, 0xf2b705, 0x1e9e5a, 0x2f6fd8, 0x9b59b6, 0xff7ad9];
    const glass = std(0xbfe3f2, 0.05, 0.2, { transparent: true, opacity: 0.35 });
    for (let k = 0; k < WHEEL.cabins; k++) {
      const c = new THREE.Group();
      const col = std(colors[k % colors.length], 0.5, 0.2);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 2.1), col);
      floor.position.y = -2.45;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), col);
      roof.position.y = -0.2;
      const hang = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), frame);
      hang.position.y = 0.05;
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.05, 2.1, 2.05), glass);
      win.position.y = -1.32;
      const lowWall = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 2.1), col);
      lowWall.position.y = -2.05;
      for (const z of [-0.55, 0.55]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.45), std(0xf5f0e6, 0.8));
        bench.position.set(0, -2.0, z + (z < 0 ? -0.35 : 0.35));
        c.add(bench);
      }
      c.add(floor, roof, hang, lowWall, win);
      this.cabins.push(c);
      this.add(c);
    }
    this.queueSign('wheel');
  }

  // ───────────── 회전목마 · 노점 · 나무 · 가로등 · 먼 도시 ─────────────

  private buildCarousel() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, 0.6, 32), std(0xf6e7c8, 0.6));
    base.position.y = 0.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 24), std(0xe8483b, 0.5));
    roof.position.y = 6.2;
    const center = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.4, 16), std(0xf2c14e, 0.4, 0.4));
    center.position.y = 2.8;
    g.add(base, roof, center);
    const pole = std(0xf2c14e, 0.3, 0.8);
    const horseMats = [std(0xffffff, 0.5), std(0xf8bbd0, 0.5), std(0x90caf9, 0.5)];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), pole);
      p.position.set(Math.cos(a) * 4.4, 2.7, Math.sin(a) * 4.4);
      const horse = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 1.3), horseMats[k % 3]);
      horse.position.set(Math.cos(a) * 4.4, 1.6 + (k % 2) * 0.4, Math.sin(a) * 4.4);
      horse.rotation.y = -a;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.35), horseMats[k % 3]);
      neck.position.set(Math.cos(a) * 4.4 + Math.cos(a + Math.PI / 2) * 0.5, horse.position.y + 0.5, Math.sin(a) * 4.4 + Math.sin(a + Math.PI / 2) * 0.5);
      g.add(p, horse, neck);
    }
    const bulbs = this.glow(0xffe08a, 2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.07, 4, 64), bulbs);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.8;
    g.add(ring);
    const m = mergeByMaterial(g);
    this.carousel.add(m);
    this.carousel.position.set(18, 0, 22);
    this.add(this.carousel);
  }

  private buildStalls() {
    const stalls: [number, number, number, string][] = [
      [-14, 26, 0xe8483b, '츄러스'],
      [-14, 18, 0x1e9e5a, '솜사탕'],
      [12, 34, 0x2f6fd8, '핫도그'],
      [-12, 4, 0xf2b705, '기념품'],
    ];
    for (const [x, z, color, label] of stalls) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), std(0xf4efe6, 0.8));
      box.position.y = 1.1;
      const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 3), std(color, 0.6));
      awn.position.y = 2.5;
      awn.rotation.x = 0.12;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(label, '#ffffff', '#333333', 512, 128) }));
      sign.position.set(0, 3.0, 0);
      sign.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(box, awn, sign);
      g.position.set(x, 0, z);
      g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(g);
    }
  }

  private buildTreesAndLamps() {
    const r = rng(77);
    const b = PARK.bounds;
    const blocked = (x: number, z: number) =>
      Math.abs(x) < 7 ||
      (z > 3 && z < 17 && x > -38) ||
      (x < -28 && z > -90) ||
      Math.hypot(x - DROP.x, z - DROP.z) < 9 ||
      (Math.abs(x - VIKING.x) < 9 && Math.abs(z - VIKING.z) < 19) ||
      (Math.abs(x - WHEEL.x) < 14 && Math.abs(z - WHEEL.z) < 8) ||
      Math.hypot(x - 18, z - 22) < 9 ||
      Math.hypot(x, z - 22) < 15 ||
      (z > 30 && Math.abs(x) < 50) ||
      nearestOnPaths(x, z).d < 7 ||
      (x > GYRO.x - 9 && x < GYRO.x + 9 && z > GYRO.z - 19 && z < GYRO.z + 19) ||
      Math.hypot(x - SKY.x, z - SKY.z) < 14 ||
      Object.values(RIDES).some((R) => Math.hypot(x - R.gate.x, z - R.gate.z) < 5);
    const trees: [number, number, number][] = [];
    for (let i = 0; i < 400 && trees.length < 90; i++) {
      const x = b.x0 + 3 + r() * (b.x1 - b.x0 - 6);
      const z = b.z0 + 3 + r() * (b.z1 - b.z0 - 6);
      if (blocked(x, z)) continue;
      trees.push([x, z, 0.8 + r() * 0.6]);
    }
    // 서쪽 코스터 둘레 (트랙에서 떨어진 바깥쪽)
    for (let z = -84; z < 26; z += 7) trees.push([-80.5 + r() * 1, z, 0.9 + r() * 0.4]);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6).translate(0, 1.2, 0), std(0x6b4a2f, 0.9), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.6, 0), std(0x3f8a3a, 0.9), trees.length);
    const col = new THREE.Color();
    trees.forEach(([x, z, s], i) => {
      this._m.makeScale(s, s, s).setPosition(x, 0, z);
      trunk.setMatrixAt(i, this._m);
      crown.setMatrixAt(i, this._m);
      crown.setColorAt(i, col.setHSL(0.27 + r() * 0.08, 0.45, 0.32 + r() * 0.1));
    });
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
    // 가로등: 대로 양옆
    const lamps: [number, number][] = [];
    for (let z = -80; z < 40; z += 12) lamps.push([-6, z], [6, z]);
    for (let x = -30; x < 70; x += 12) lamps.push([x, 5], [x, 15]);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 6).translate(0, 2, 0), std(0x2d3a2e, 0.5, 0.6), lamps.length);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8).translate(0, 4.1, 0), this.glow(0xffe7b0, 3), lamps.length);
    lamps.forEach(([x, z], i) => {
      this._m.makeTranslation(x, 0, z);
      pole.setMatrixAt(i, this._m);
      bulb.setMatrixAt(i, this._m);
    });
    this.scene.add(pole, bulb);
  }

  private buildSkyline() {
    const r = rng(11);
    const mats = [std(0x5b6b7c, 0.9), std(0x6f7d8c, 0.9), std(0x4b5868, 0.9)];
    const win = this.glow(0xffd58a, 0.7);
    const g = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 230 + r() * 160;
      const h = 15 + r() * r() * 110;
      const w = 12 + r() * 20;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats[i % 3]);
      m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d - 20);
      g.add(m);
      if (i % 3 === 0) {
        const lw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.6, 0.2), win);
        lw.position.set(m.position.x, h * 0.5, m.position.z + w / 2 + 0.11);
        g.add(lw);
      }
    }
    // 북쪽 멀리 남산 · 타워
    const hill = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3e6b3a, 1));
    hill.scale.y = 0.45;
    hill.position.set(-40, -5, -520);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, 90, 10), std(0xdfe4ea, 0.6));
    tower.position.set(-40, 100, -520);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 16), std(0xdfe4ea, 0.6));
    deck.position.set(-40, 140, -520);
    g.add(hill, tower, deck);
    this.scene.add(mergeByMaterial(g));
  }

  // ───────────── 산책로: 대로(붉은 벽돌) · 갈래길(베이지) · 연석 · 교차로 원형 바닥 ─────────────

  private buildPaths() {
    const mainTex = brickTexture('#b8573f', '#9a4433', '#7e3628');
    const sideTex = brickTexture('#e6d3a8', '#d4bd8f', '#b9a27a');
    const curb = std(0xeceae4, 0.85);
    const padR = new Map<string, number>();
    for (const [a, b, w] of PARK_PATHS) {
      padR.set(a, Math.max(padR.get(a) ?? 0, w * 0.62));
      padR.set(b, Math.max(padR.get(b) ?? 0, w * 0.62));
    }
    const mainNodes = new Set(PARK_PATHS.filter((p) => p[3]).flatMap((p) => [p[0], p[1]]));
    PARK_PATHS.forEach(([a, b, w, main], i) => {
      const A = PARK_NODES[a];
      const B = PARK_NODES[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const ang = Math.atan2(B.x - A.x, B.z - A.z);
      const tex = (main ? mainTex : sideTex).clone();
      tex.repeat.set(w / 2.5, len / 2.5);
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
      m.rotation.order = 'YXZ';
      m.rotation.y = ang;
      m.rotation.x = -Math.PI / 2;
      m.position.set((A.x + B.x) / 2, (main ? 0.03 : 0.025) + i * 0.0004, (A.z + B.z) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
      // 연석: 양쪽 가장자리, 교차로 원형 바닥 안쪽은 비운다
      const ra = padR.get(a)!;
      const rb = padR.get(b)!;
      const cl = len - ra - rb;
      if (cl > 0.5) {
        const ux = (B.x - A.x) / len;
        const uz = (B.z - A.z) / len;
        const mid = ra + cl / 2;
        for (const s of [-1, 1]) {
          const k = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, cl), curb);
          k.rotation.y = ang;
          k.position.set(A.x + ux * mid + uz * s * (w / 2 + 0.14), 0.07, A.z + uz * mid - ux * s * (w / 2 + 0.14));
          k.receiveShadow = true;
          this.scene.add(k);
        }
      }
    });
    // 교차로 원형 바닥 (대로가 지나는 곳은 붉은 벽돌 + 가운데 무늬)
    for (const [n, r] of padR) {
      if (n === 'plaza') continue;
      const P = PARK_NODES[n];
      const main = mainNodes.has(n);
      const tex = (main ? mainTex : sideTex).clone();
      tex.repeat.set(r / 1.25, r / 1.25);
      tex.needsUpdate = true;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(P.x, 0.045, P.z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      if (main && r > 4) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r * 0.42, 40), std(0xf2c14e, 0.6));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(P.x, 0.05, P.z);
        this.scene.add(ring);
      }
    }
  }

  // ───────────── 이정표: 교차로마다, 그쪽으로 가면 나오는 놀이기구를 화살표로 ─────────────

  private buildSignposts() {
    const postMat = std(0x2d3a2e, 0.5, 0.6);
    const capMat = std(0xf2c14e, 0.35, 0.6);
    const colors = ['#c8323c', '#2f6fd8', '#1e9e5a', '#7b2fd8', '#e08a1c'];
    for (const sp of signposts()) {
      const g = new THREE.Group();
      const h = 1.6 + sp.arrows.length * 0.75;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h, 8), postMat);
      post.position.y = h / 2;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), capMat);
      cap.position.y = h + 0.1;
      g.add(post, cap);
      sp.arrows.forEach((ar, i) => {
        const col = colors[i % colors.length];
        const front = arrowBoardTexture(ar.labels, 1, col);
        const back = arrowBoardTexture(ar.labels, -1, col);
        const bw = 2.5;
        const bh = bw / front.aspect;
        const y = h - 0.45 - i * 0.75 - (bh - 0.5) / 2;
        // 판의 x 축이 가리키는 방향(ar.dir)으로 뻗는다. 뒷면은 반대로 그린 판 (뒤에서 봐도 같은 쪽을 가리킨다)
        const board = new THREE.Group();
        const f = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: front.tex }));
        f.position.set(bw / 2 + 0.12, 0, 0.02);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: back.tex }));
        b.position.set(bw / 2 + 0.12, 0, -0.02);
        b.rotation.y = Math.PI;
        board.add(f, b);
        board.position.y = y;
        board.rotation.y = ar.dir - Math.PI / 2;
        g.add(board);
      });
      g.position.set(sp.x, 0, sp.z);
      this.add(g);
    }
  }

  // ───────────── 놀이기구 입구: 색 아치 + 실시간 운행 전광판 ─────────────

  private statusBoards: { id: RideId; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; last: string }[] = [];

  private buildEntrance(id: RideId) {
    const R = RIDES[id];
    const node = RIDE_NODE[id];
    // 이 입구로 들어오는 길의 방향 (아치가 길을 가로지르게)
    const edge = PARK_PATHS.find((p) => p[0] === node || p[1] === node)!;
    const other = PARK_NODES[edge[0] === node ? edge[1] : edge[0]];
    const ang = Math.atan2(R.gate.x - other.x, R.gate.z - other.z);
    const col = new THREE.Color(RIDE_COLOR[id]);
    const pillar = std(col.getHex(), 0.45, 0.2);
    const gold = std(0xf2c14e, 0.35, 0.6);
    const g = new THREE.Group();
    const span = 4.4;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), pillar);
      p.position.set(s * span / 2, 2.1, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), gold);
      ball.position.set(s * span / 2, 4.5, 0);
      g.add(p, ball);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.6, 0.9, 0.35), pillar);
    beam.position.y = 3.95;
    g.add(beam);
    const nameTex = signTexture(`${R.icon} ${R.name.split(' (')[0]}`, RIDE_COLOR[id], '#ffffff', 1024, 200);
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(span + 0.4, 0.78), new THREE.MeshBasicMaterial({ map: nameTex }));
      n.position.set(0, 3.95, s * 0.19);
      if (s < 0) n.rotation.y = Math.PI;
      g.add(n);
    }
    // 전광판 (검은 바탕 LED 글씨): 탑승 중 · 출발까지 · 운행 중
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.8, 0.12), std(0x1b1b1f, 0.4, 0.5));
    frame.position.y = 5.0;
    g.add(frame);
    for (const s of [1, -1]) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.64), new THREE.MeshBasicMaterial({ map: tex }));
      scr.position.set(0, 5.0, s * 0.07);
      if (s < 0) scr.rotation.y = Math.PI;
      g.add(scr);
    }
    this.statusBoards.push({ id, ctx, tex, last: '' });
    // 아치에 전구
    const bulbs = this.glow(0xffe08a, 2.4);
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), bulbs);
      b.position.set(-span / 2 + (span * k) / 8, 3.45, 0.2);
      g.add(b);
    }
    // 줄 서는 곳 난간 (아치 안쪽 옆으로 지그재그)
    const rail = std(0xc0c4c8, 0.3, 0.8);
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 3.2), rail);
      r.position.set(span / 2 + 0.9 + k * 0.85, 0.95, 1.2);
      g.add(r);
      for (const zz of [-0.4, 2.8]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), rail);
        p.position.set(span / 2 + 0.9 + k * 0.85, 0.5, zz);
        g.add(p);
      }
    }
    // 아치는 입구에서 길 쪽으로 조금 나와서 선다 (입구 POI 와 겹치지 않게)
    g.position.set(R.gate.x - Math.sin(ang) * 2.6, 0, R.gate.z - Math.cos(ang) * 2.6);
    g.rotation.y = ang;
    this.add(g);
  }

  /** 전광판 글자를 지금 운행표로 (바뀔 때만 다시 그린다) */
  private drawBoards(nowMs: number) {
    for (const b of this.statusBoards) {
      const ck = rideClock(b.id, nowMs);
      const text =
        b.id === 'wheel'
          ? '상시 운행 · 바로 탑승'
          : ck.phase === 'boarding'
            ? `탑승 중 · 출발 ${Math.ceil(ck.left)}초`
            : ck.phase === 'running'
              ? `운행 중 · 다음 ${Math.ceil(ck.nextBoard)}초`
              : `곧 탑승 · ${Math.ceil(ck.nextBoard)}초`;
      if (text === b.last) continue;
      b.last = text;
      const g = b.ctx;
      g.fillStyle = '#050505';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = ck.phase === 'boarding' || b.id === 'wheel' ? '#47ff6b' : ck.phase === 'running' ? '#ffb020' : '#7fd8ff';
      g.font = `800 50px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 66, 496);
      b.tex.needsUpdate = true;
    }
  }

  // ───────────── 토네이도 (자이로 스윙) ─────────────

  private gyroArm = new THREE.Group();
  private gyroDisc = new THREE.Group();

  private buildGyro() {
    const frame = new THREE.Group();
    const steel = std(0x5b2b9e, 0.4, 0.6);
    const white = std(0xf1f1f1, 0.4, 0.3);
    // A 자 다리 넷 (동서 양쪽에 둘씩)이 21m 축을 받친다
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const top = new THREE.Vector3(sx * 4.2, GYRO.pivotY, 0);
        const foot = new THREE.Vector3(sx * 5.6, 0, sz * 3.2);
        const L = top.distanceTo(foot);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, L, 10), steel);
        leg.position.copy(top).add(foot).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        frame.add(leg);
      }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 9.2, 16), white);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = GYRO.pivotY;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.4, 32), std(0x6b6f76, 0.8));
    base.position.y = 0.2;
    frame.add(axle, base);
    const lights = this.glow(0xd77bff, 2.6);
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, GYRO.pivotY, 0.1), lights);
      strip.position.set(sx * 4.9, GYRO.pivotY / 2, 0);
      frame.add(strip);
    }
    const mf = mergeByMaterial(frame);
    mf.position.set(GYRO.x, 0, GYRO.z);
    this.add(mf);
    // 팔 (축에서 아래로 15m) + 끝의 원판
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, GYRO.arm, 12), std(0xf2c14e, 0.35, 0.6));
    arm.position.y = -GYRO.arm / 2;
    const armLights = new THREE.Mesh(new THREE.BoxGeometry(0.08, GYRO.arm - 1, 0.08), lights);
    armLights.position.set(0.5, -GYRO.arm / 2, 0);
    this.gyroArm.add(arm, armLights);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(GYRO.ringR + 0.6, GYRO.ringR + 0.3, 0.6, 32), std(0x7b2fd8, 0.4, 0.4));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(GYRO.ringR + 0.6, 0.12, 6, 48), this.glow(0xffe08a, 2.6));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.32;
    this.gyroDisc.add(disc, rim);
    const seatMat = std(0x1d1d24, 0.6);
    const harness = std(0xffd23f, 0.35, 0.5);
    for (let k = 0; k < GYRO.seats; k++) {
      const a = (k * 2 * Math.PI) / GYRO.seats;
      const s = new THREE.Group();
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.15), seatMat);
      back.position.set(0, 0.95, -0.3);
      const cush = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.5), seatMat);
      cush.position.set(0, 0.42, 0);
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), harness);
      h1.position.set(0, 1.25, 0.05);
      s.add(back, cush, h1);
      s.position.set(Math.cos(a) * GYRO.ringR, 0.3, Math.sin(a) * GYRO.ringR);
      s.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      this.gyroDisc.add(s);
    }
    const md = mergeByMaterial(this.gyroDisc);
    this.gyroDisc = md;
    md.position.y = -GYRO.arm;
    this.gyroArm.add(md);
    this.gyroArm.position.set(GYRO.x, GYRO.pivotY, GYRO.z);
    this.add(this.gyroArm);
    this.buildEntrance('gyro');
  }

  // ───────────── 스카이 스윙 (회오리 그네) ─────────────

  private skyRig = new THREE.Group();
  private skySwings: THREE.Group[] = [];

  private buildSky() {
    const mast = new THREE.Group();
    const a = std(0x14a37f, 0.4, 0.4);
    const b = std(0xf1f1f1, 0.4, 0.3);
    for (let y = 0; y < SKY.mastH; y += 4) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 4, 16), (y / 4) % 2 ? a : b);
      seg.position.y = y + 2;
      mast.add(seg);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4, 16), std(0xf2c14e, 0.35, 0.6));
    crown.position.y = SKY.mastH + 2;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), this.glow(0xfff2a8, 4));
    star.position.y = SKY.mastH + 5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 0.4, 32), std(0x6b6f76, 0.8));
    base.position.y = 0.2;
    mast.add(crown, star, base);
    const ml = mergeByMaterial(mast);
    ml.position.set(SKY.x, 0, SKY.z);
    this.add(ml);
    // 회전판 (지붕 + 전구) + 16개 팔
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(SKY.armR + 1.2, 2.2, 32, 1, true), std(0x14a37f, 0.5, 0.2, { side: THREE.DoubleSide }));
    canopy.position.y = 1.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(SKY.armR + 1.1, 0.1, 6, 64), this.glow(0xffe08a, 2.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 16), std(0xf2c14e, 0.35, 0.6));
    this.skyRig.add(canopy, ring, collar);
    const chainMat = std(0xbfc4c9, 0.3, 0.9);
    const seatCols = [0xe8483b, 0x2f6fd8, 0xf2c14e, 0x1e9e5a];
    for (let k = 0; k < SKY.seats; k++) {
      const ang = (k * 2 * Math.PI) / SKY.seats;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, SKY.armR), chainMat);
      arm.position.set((Math.cos(ang) * SKY.armR) / 2, 0.1, (Math.sin(ang) * SKY.armR) / 2);
      arm.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
      this.skyRig.add(arm);
      // 그네: 팔 끝에 매달린 고리 (+z = 바깥, 기울기는 x 축 회전)
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(ang) * SKY.armR, 0, Math.sin(ang) * SKY.armR);
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
      for (const sx of [-0.25, 0.25]) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, SKY.chain, 4), chainMat);
        ch.position.set(sx, -SKY.chain / 2, 0);
        pivot.add(ch);
      }
      const seat = new THREE.Group();
      const cush = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.5), std(seatCols[k % 4], 0.5));
      cush.position.y = 0.42;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), std(seatCols[k % 4], 0.5));
      back.position.set(0, 0.75, -0.25);
      seat.add(cush, back);
      seat.position.y = -SKY.chain;
      seat.rotation.y = -Math.PI / 2;
      pivot.add(seat);
      this.skyRig.add(pivot);
      this.skySwings.push(pivot);
    }
    this.skyRig.position.set(SKY.x, SKY.base, SKY.z);
    this.add(this.skyRig);
    this.buildEntrance('sky');
  }

  // ───────────── 장식: 깃발 줄 · 꽃밭 · 벤치 · 풍선 가게 · 노점 더 ─────────────

  private buildDecor() {
    const r = rng(303);
    // 깃발 줄: 대로를 가로질러 가로등 사이에 (12m 마다)
    const flags: { x: number; y: number; z: number; ry: number }[] = [];
    const flagCols = [0xe8483b, 0xf2c14e, 0x2f6fd8, 0x1e9e5a, 0xffffff, 0xd77bff];
    for (let z = -74; z < 36; z += 12) {
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        flags.push({ x: -6 + 12 * u, y: 4.05 - Math.sin(Math.PI * u) * 0.7, z, ry: 0 });
      }
    }
    for (let x = -24; x < 64; x += 12) {
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        flags.push({ x, y: 4.05 - Math.sin(Math.PI * u) * 0.6, z: 5 + 10 * u, ry: Math.PI / 2 });
      }
    }
    const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0.22, 0, 0), new THREE.Vector3(0, -0.5, 0)]);
    flagGeo.computeVertexNormals();
    const flagMesh = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), flags.length);
    const col = new THREE.Color();
    flags.forEach((f, i) => {
      this._m.makeRotationY(f.ry).setPosition(f.x, f.y, f.z);
      flagMesh.setMatrixAt(i, this._m);
      flagMesh.setColorAt(i, col.setHex(flagCols[i % flagCols.length]));
    });
    this.scene.add(flagMesh);
    // 꽃밭: 대로 양옆 (가로등 사이)
    const beds: [number, number, number][] = [];
    for (let z = -70; z < 32; z += 12) if (Math.abs(z - 10) > 8 && Math.abs(z + 27) > 6 && Math.abs(z + 66) > 6) beds.push([-7.6, z, 0], [7.6, z, 0]);
    const bedBox = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.4, 5).translate(0, 0.2, 0), std(0x8a6a4a, 0.9), beds.length);
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 5), std(0xffffff, 0.8), beds.length * 18);
    let fi = 0;
    const fcol = [0xff5d8f, 0xffd23f, 0xff8a3d, 0xc77dff, 0xffffff];
    beds.forEach(([x, z], i) => {
      this._m.makeTranslation(x, 0, z);
      bedBox.setMatrixAt(i, this._m);
      for (let k = 0; k < 18; k++) {
        this._m.makeTranslation(x - 0.4 + (k % 3) * 0.4, 0.5, z - 2.2 + Math.floor(k / 3) * 0.88);
        flowers.setMatrixAt(fi, this._m);
        flowers.setColorAt(fi++, col.setHex(fcol[(i + k) % fcol.length]));
      }
    });
    this.scene.add(bedBox, flowers);
    // 벤치: 대로 · 동서 길 옆
    const benches: [number, number, number][] = [];
    for (let z = -64; z < 30; z += 24) benches.push([-9.2, z + 6, Math.PI / 2], [9.2, z + 6, -Math.PI / 2]);
    for (let x = -18; x < 60; x += 20) benches.push([x + 6, 16.6, Math.PI]);
    const wood = std(0xa0663a, 0.8);
    const iron = std(0x2d3a2e, 0.5, 0.6);
    for (const [x, z, ry] of benches) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.06), wood);
      back.position.set(0, 0.75, -0.24);
      g.add(seat, back);
      for (const s of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), iron);
        leg.position.set(s, 0.22, 0);
        g.add(leg);
      }
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.add(g);
    }
    // 풍선 가게 (광장 옆)
    const cart = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), std(0xffffff, 0.6));
    body.position.y = 0.75;
    cart.add(body);
    for (let k = 0; k < 14; k++) {
      const bx = (r() - 0.5) * 1.4;
      const bz = (r() - 0.5) * 1.2;
      const by = 3.2 + r() * 1.3;
      const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), std(flagCols[k % flagCols.length], 0.3, 0.1));
      balloon.scale.y = 1.15;
      balloon.position.set(bx, by, bz);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, by - 1.2, 3), std(0xeeeeee, 0.9));
      str.position.set(bx / 2, (by + 1.2) / 2, bz / 2);
      str.lookAt(bx, by, bz);
      str.rotateX(Math.PI / 2);
      cart.add(balloon, str);
    }
    cart.position.set(-9, 0, 31);
    this.add(cart);
    // 노점 더: 아이스크림 · 팝콘 · 음료 · 닭꼬치 · 기념사진
    const more: [number, number, number, string][] = [
      [10, -14, 0xff8ab3, '아이스크림'],
      [-10, -46, 0xf2b705, '팝콘'],
      [36, 18, 0x14a37f, '음료'],
      [-30, 18, 0xc8323c, '닭꼬치'],
      [10, -76, 0x7b2fd8, '기념사진'],
    ];
    for (const [x, z, color, label] of more) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), std(0xf4efe6, 0.8));
      box.position.y = 1.1;
      // 줄무늬 차양
      for (let k = 0; k < 6; k++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 3), std(k % 2 ? 0xffffff : color, 0.6));
        st.position.set(-1.45 + k * 0.58, 2.5, 0);
        st.rotation.x = 0.12;
        g.add(st);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(label, '#ffffff', '#333333', 512, 128) }));
      sign.position.set(0, 3.05, 1.2);
      g.add(box, sign);
      g.position.set(x, 0, z);
      // 간판이 가까운 길 쪽을 보게
      const on = nearestOnPaths(x, z);
      g.rotation.y = Math.atan2(on.x - x, on.z - z);
      this.add(g);
    }
  }

  // ───────────── 매 프레임 ─────────────

  /** 놀이기구를 지금 시각(공유)에 맞춰 움직인다 */
  update(nowMs: number, night: number) {
    // 속도선은 탑승 카메라가 켤 때만 (내리면 감춘다)
    if (this.speedLines) this.speedLines.visible = false;
    for (const { m, k } of this.nightMats) m.emissiveIntensity = (0.15 + night) * k;
    // 롤러코스터
    const { s } = coasterAt(coasterTime(nowMs));
    for (let i = 0; i < this.cars.length; i++) {
      const p = trackAt(carS(s, i), this._p);
      basisAt(p, this.cars[i].matrix, 0);
      this.cars[i].matrixWorldNeedsUpdate = true;
    }
    // 자이로드롭
    const dc = rideClock('drop', nowMs);
    const d = dropAt(dc.phase === 'running' ? dc.t : dc.phase === 'idle' ? DROP_RUN : 0, dc.cycle);
    this.dropCarriage.position.set(DROP.x, d.y - 0.45, DROP.z);
    this.dropCarriage.rotation.y = -d.spin;
    // 바이킹
    const vc = rideClock('viking', nowMs);
    this.ship.rotation.x = vc.phase === 'running' ? vikingAt(vc.t) : 0;
    // 대관람차: 바퀴는 돌고, 칸은 매달려 늘 똑바로
    const base = (2 * Math.PI * (nowMs / 1000)) / WHEEL.period;
    this.wheel.rotation.z = base;
    for (let k = 0; k < this.cabins.length; k++) {
      const a = wheelAngle(k, nowMs);
      this.cabins[k].position.set(WHEEL.x + Math.sin(a) * WHEEL.r, WHEEL.hubY - Math.cos(a) * WHEEL.r, WHEEL.z);
      this.cabins[k].rotation.z = Math.sin(nowMs / 900 + k) * 0.02;
    }
    this.carousel.rotation.y = (nowMs / 1000) * 0.45;
    // 토네이도: 팔은 그네처럼, 원판은 팔을 축으로 빙글빙글
    const gc = rideClock('gyro', nowMs);
    const gy = gyroAt(gc.phase === 'running' ? gc.t : gc.phase === 'idle' ? GYRO_RUN : 0);
    this.gyroArm.rotation.x = gy.th;
    this.gyroDisc.rotation.y = -gy.spin;
    // 스카이 스윙: 회전판이 탑을 따라 오르내리며 돌고, 그네는 바깥으로 기운다
    const sc = rideClock('sky', nowMs);
    const sk = skyAt(sc.phase === 'running' ? sc.t : sc.phase === 'idle' ? SKY_RUN : 0);
    this.skyRig.position.y = sk.y;
    this.skyRig.rotation.y = -sk.spin;
    for (const sw of this.skySwings) sw.rotation.x = -sk.tilt;
    this.drawBoards(nowMs);
  }

  // ───────────── 놀이공원 사람들 (직원 · 손님) ─────────────

  private people = new Map<number, ParkPersonView>();
  private _pose: SeatPose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, speed: 0 };
  private _pm = new THREE.Matrix4();
  /** 머리 위 말풍선 (직원 대사 등) */
  private texts: FloatingTexts | null = null;

  /** 말풍선 띄우기 (cityRenderer 가 world.drainSpeech() 를 넘긴다) */
  speech(text: string, x: number, z: number, color: string) {
    (this.texts ??= new FloatingTexts(this.scene)).spawn(text, x, 2.4, z, color, 1.1);
  }

  /**
   * 직원·손님을 그린다. 자리는 공유 시각만으로 정해진다 (parkPeople).
   * @param eye 카메라가 보는 곳 — 멀리 있는 사람은 자세 계산을 줄이고, 아주 멀면 감춘다
   */
  updatePeople(nowMs: number, clock: FrameClock, eye: { x: number; z: number }) {
    for (const p of parkPeople(nowMs)) {
      let v = this.people.get(p.id);
      if (!v) {
        const staff = p.state === 'staff';
        const view = new PersonView(p.id, staff ? { skin: 'humanMaleA', tint: STAFF_TINT } : {});
        view.root.scale.setScalar(0.92 + (p.id % 5) * 0.03);
        const lift = new THREE.Group();
        lift.matrixAutoUpdate = false;
        lift.add(view.root);
        this.scene.add(lift);
        const f = new Fighter(p.id, 'npc', { canBlock: false });
        f.reset(p.x, p.z, p.fx, p.fz);
        let label: THREE.Sprite | null = null;
        if (staff && p.ride) {
          label = labelSprite(`🎫 ${STAFF_NAMES[p.ride]}`, '#bfe9ff');
          label.position.set(p.x, 2.15, p.z);
          this.scene.add(label);
        }
        v = { f, view, lift, label };
        this.people.set(p.id, v);
      }
      const riding = p.state === 'ride' && p.ride && p.seat !== undefined;
      const d = riding ? 0 : Math.hypot(p.x - eye.x, p.z - eye.z);
      v.lift.visible = riding || d < 80;
      if (!v.lift.visible) continue;
      const f = v.f;
      if (riding) {
        // 좌석 자세 그대로 (기울기·뒤집힘 포함), 모델은 받침 안에서 원점에 앉는다
        const pose = seatPose(p.ride!, p.seat!, nowMs, this._pose);
        this.seatMatrix(pose, this._pm);
        v.lift.matrix.copy(this._pm);
        f.x = 0;
        f.z = 0;
        f.fx = 0;
        f.fz = 1;
        v.view.sit = 1;
      } else {
        v.lift.matrix.identity();
        f.x = p.x;
        f.z = p.z;
        f.fx = p.fx;
        f.fz = p.fz;
        v.view.sit = 0;
      }
      v.lift.matrixWorldNeedsUpdate = true;
      // 보간 없이 지금 자리 그대로 (걸음 속도는 모델이 위치 변화로 잰다)
      f.snapshot();
      v.view.setDistance(d);
      v.view.update(f, clock, d > 25);
    }
    this.texts?.update(clock.dt);
  }

  // ───────────── 1인칭 탑승 카메라 ─────────────

  private fov = 72;
  private _f = new THREE.Vector3();
  private _u = new THREE.Vector3();
  private _r = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _q2 = new THREE.Quaternion();

  /**
   * 좌석에 앉은 눈높이에서 본다. 속도가 빠를수록 시야가 넓어지고(속도감) 화면이 떨린다.
   * lookYaw·lookPitch = 고개 돌리기 (방향키)
   */
  riderCamera(pose: SeatPose, lookYaw: number, lookPitch: number, cam: THREE.PerspectiveCamera, tSec: number, dt: number, kind: string) {
    const f = this._f.set(pose.fx, pose.fy, pose.fz).normalize();
    const u = this._u.set(pose.ux, pose.uy, pose.uz).normalize();
    const r = this._r.crossVectors(f, u).normalize();
    // 카메라는 -z 를 본다: x = 오른쪽, y = 위, z = 뒤
    this._m.makeBasis(r, u, f.clone().negate());
    cam.quaternion.setFromRotationMatrix(this._m);
    // 고개 돌리기: 위쪽 축으로 좌우, 그다음 옆 축으로 위아래
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), lookYaw);
    this._q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), lookPitch);
    cam.quaternion.multiply(this._q).multiply(this._q2);
    const eye = 1.2;
    cam.position.set(pose.x + u.x * eye + f.x * 0.12, pose.y + u.y * eye + f.y * 0.12, pose.z + u.z * eye + f.z * 0.12);
    // 흔들림: 바퀴 진동(빠른 떨림) + 큰 출렁임. 롤러코스터 > 자이로드롭 > 토네이도 > 바이킹 > 스카이 스윙
    const v = pose.speed;
    const k = kind === 'coaster' ? 1.25 : kind === 'drop' ? 0.9 : kind === 'gyro' ? 0.75 : kind === 'viking' ? 0.55 : kind === 'sky' ? 0.4 : 0;
    const amp = k * Math.min(0.085, 0.0013 * v * v + (pose.tag === 'lift' ? 0.004 : 0) + (pose.tag === 'brake' || pose.tag === 'trim' ? 0.025 : 0));
    const n1 = Math.sin(tSec * 61.3) * 0.6 + Math.sin(tSec * 37.1 + 1.3) * 0.4;
    const n2 = Math.sin(tSec * 53.7 + 2.1) * 0.6 + Math.sin(tSec * 29.3) * 0.4;
    cam.position.addScaledVector(r, n1 * amp).addScaledVector(u, n2 * amp);
    cam.rotateZ(Math.sin(tSec * 17.3) * amp * 0.8);
    // 시야: 빠를수록 넓게 (자유낙하는 확 넓어진다)
    const want = Math.min(115, 70 + Math.min(40, v * (kind === 'drop' ? 1.55 : 1.3)) + (pose.phase === 'fall' ? 9 : 0));
    this.fov += (want - this.fov) * Math.min(1, dt * 5);
    cam.fov = this.fov;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.updateSpeedLines(cam, v, dt);
  }

  // ───────────── 속도선: 빠를 때 화면 가장자리로 스쳐 지나가는 흰 줄 ─────────────

  private speedLines: THREE.LineSegments | null = null;
  private speedZ: Float32Array | null = null;
  private static readonly SPEED_LINES = 90;

  private updateSpeedLines(cam: THREE.Camera, v: number, dt: number) {
    const N = ThemeParkScene.SPEED_LINES;
    if (!this.speedLines) {
      const pos = new Float32Array(N * 6);
      this.speedZ = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        // 시선 가운데는 비우고 가장자리 둘레에 (카메라 기준: -z 가 앞)
        const a = (i / N) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.3;
        const r = 1.9 + ((i * 7) % 11) * 0.25;
        pos[i * 6] = pos[i * 6 + 3] = Math.cos(a) * r;
        pos[i * 6 + 1] = pos[i * 6 + 4] = Math.sin(a) * r * 0.7;
        this.speedZ[i] = -1 - ((i * 37) % 16);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
      // 더하기 섞기: 어두운 색일수록 투명 → 먼 줄은 흐리게, 가까운 줄은 밝게
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
      this.speedLines = new THREE.LineSegments(geo, mat);
      this.speedLines.frustumCulled = false;
      this.speedLines.renderOrder = 999;
      this.scene.add(this.speedLines);
    }
    const lines = this.speedLines;
    const zs = this.speedZ!;
    const mat = lines.material as THREE.LineBasicMaterial;
    // 시속 25km 쯤부터 보이기 시작해 빠를수록 진하고 길게
    const show = Math.max(0, Math.min(1, (v - 7) / 18));
    mat.opacity = show * 0.8;
    lines.visible = show > 0.01;
    if (!lines.visible) return;
    lines.position.copy(cam.position);
    lines.quaternion.copy(cam.quaternion);
    const pos = (lines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const col = (lines.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const len = 0.5 + v * 0.09;
    for (let i = 0; i < N; i++) {
      zs[i] += v * 1.2 * dt;
      if (zs[i] > -0.3) zs[i] -= 16;
      pos[i * 6 + 2] = zs[i];
      pos[i * 6 + 5] = zs[i] - len;
      // 가까울수록 밝고, 꼬리 끝은 어둡게
      const near = Math.max(0, 1 + zs[i] / 16);
      col[i * 6] = col[i * 6 + 1] = col[i * 6 + 2] = near;
      col[i * 6 + 3] = col[i * 6 + 4] = col[i * 6 + 5] = near * 0.15;
    }
    lines.geometry.getAttribute('position').needsUpdate = true;
    lines.geometry.getAttribute('color').needsUpdate = true;
  }

  /** 오른쪽·위·앞 축으로 좌석 행렬 (친구 모습을 좌석에 앉힐 때) */
  seatMatrix(pose: SeatPose, out: THREE.Matrix4) {
    const f = this._f.set(pose.fx, pose.fy, pose.fz).normalize();
    const u = this._u.set(pose.ux, pose.uy, pose.uz).normalize();
    const r = this._r.crossVectors(f, u).normalize();
    // 캐릭터 모델은 +z 가 앞, x 는 왼쪽(캐릭터 기준)이라 오른쪽의 반대
    out.makeBasis(r.clone().negate(), u, f);
    out.setPosition(pose.x, pose.y, pose.z);
    return out;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        (mt as THREE.MeshBasicMaterial).map?.dispose();
        mt.dispose();
      }
    });
  }
}

void CAR_GAP;
