import * as THREE from 'three';
import { glassMaterial } from './glassKit';

/**
 * 행복빌라 각 집의 베란다 창: 진짜 유리 + 그 너머로 방 안이 깊이 있게 보인다.
 *
 * 방 안은 실제 장면을 그리지 않고, 창 사각형 하나에서 "창 뒤에 상자 모양 방이 있다"고 보고
 * 시선이 방의 뒷벽·옆벽·바닥·천장 중 어디에 닿는지 계산해 색을 칠한다 (인테리어 매핑).
 * 카메라가 움직이면 방 안쪽이 원근에 맞게 따라 움직여서 진짜 방처럼 보인다. 창 하나 = 그리기 몇 번.
 */

export interface UnitRoom {
  /** 사는 사람이 없으면 커튼도 불도 없다 */
  empty: boolean;
  /** 같은 집은 늘 같은 모습 (벽 색·가구·커튼·밤에 불 켜는지) */
  seed: number;
}

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vRay;
  void main() {
    vLocal = position;
    vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vRay = position - camLocal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tBack;
  uniform vec2 size;
  uniform float depth;
  uniform vec3 wallC;
  uniform vec3 floorC;
  uniform vec3 curtainC;
  uniform float curtainL;
  uniform float curtainR;
  uniform float sheer;
  uniform float night;
  uniform float lit;
  uniform float sill;
  uniform float head;
  varying vec3 vLocal;
  varying vec3 vRay;

  void main() {
    vec3 o = vLocal;
    vec3 d = normalize(vRay);
    // 방: 문보다 좌우로 넓고, 바닥은 문 아래 sill, 천장은 문 위 head 만큼
    float hx = size.x * 0.5 + 0.7;
    float yFloor = -size.y * 0.5 - sill;
    float yCeil = size.y * 0.5 + head;
    float tx = ((d.x > 0.0 ? hx : -hx) - o.x) / (abs(d.x) < 1e-4 ? 1e-4 : d.x);
    float ty = ((d.y > 0.0 ? yCeil : yFloor) - o.y) / (abs(d.y) < 1e-4 ? 1e-4 : d.y);
    float tz = (-depth - o.z) / min(d.z, -1e-4);
    float t = min(tz, min(tx, ty));
    vec3 h = o + d * t;
    float back = -h.z / depth; // 0 = 창 쪽, 1 = 뒷벽

    vec3 col;
    if (t == tz) {
      vec2 uv = vec2((h.x + hx) / (2.0 * hx), (h.y - yFloor) / (yCeil - yFloor));
      col = texture2D(tBack, uv).rgb;
    } else if (t == tx) {
      col = wallC * 0.82;
    } else if (d.y < 0.0) {
      // 마루: 결 무늬
      float plank = 0.9 + 0.1 * step(0.5, fract(h.x * 2.2 + floor(h.z * 0.8) * 0.37));
      col = floorC * plank;
    } else {
      col = mix(wallC, vec3(1.0), 0.35);
    }

    // 밝기: 낮엔 바깥보다 어두운 방 (안쪽일수록 더), 밤엔 불 켠 집만 환하다
    float dayL = mix(0.85, 0.45, back);
    float lamp = 0.0;
    if (t == ty && d.y > 0.0) lamp = exp(-dot(h.xz + vec2(0.0, depth * 0.5), h.xz + vec2(0.0, depth * 0.5)) * 3.0);
    // 밤 불빛은 따뜻한 흰빛
    vec3 nightL = lit > 0.5 ? vec3(1.0, 0.9, 0.74) * (mix(2.2, 1.4, back) + lamp * 2.5) : vec3(0.05, 0.06, 0.09) * (1.2 - back * 0.5);
    col *= mix(vec3(dayL), nightL, night);

    // 커튼 (창 바로 안쪽): 양옆으로 걷힌 두꺼운 커튼 + 얇은 속커튼
    float u = (o.x + size.x * 0.5) / size.x;
    float folds = 0.86 + 0.14 * sin(o.x * 38.0);
    vec3 glow = mix(vec3(0.95), lit > 0.5 ? vec3(1.9, 1.65, 1.25) : vec3(0.06), night);
    vec3 cur = curtainC * folds * glow;
    if (u < curtainL || u > 1.0 - curtainR) col = cur;
    else col = mix(col, vec3(0.93, 0.92, 0.88) * glow, sheer);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const WALLS = ['#e9e1d2', '#dfe6e8', '#eadbd0', '#d9dfd0', '#efe9df', '#d8d4e3'];
const CURTAINS = [0xb9a68a, 0x7e8f9e, 0xa07468, 0x8f9a7b, 0xd9d2c4, 0x6d6a80];

/** 0~1 의사난수 (집마다 같은 값) */
function rng(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** 뒷벽 그림: 벽지 + 가구 실루엣 (소파·책장·액자·화분·TV·옷장) */
function backTexture(room: UnitRoom): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  const r = rng(room.seed);
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  g.fillStyle = wall;
  g.fillRect(0, 0, 256, 160);
  // 걸레받이
  g.fillStyle = 'rgba(90,70,55,0.6)';
  g.fillRect(0, 152, 256, 8);
  if (!room.empty) {
    const pick = Math.floor(r() * 3);
    if (pick === 0) {
      // 소파 + 액자 + 스탠드
      g.fillStyle = ['#6b5a4a', '#4f5d6b', '#7a4b45'][Math.floor(r() * 3)];
      g.fillRect(60, 108, 130, 44);
      g.fillRect(52, 96, 16, 56);
      g.fillRect(182, 96, 16, 56);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(60, 108, 130, 10);
      g.fillStyle = '#3b3530';
      g.fillRect(96, 40, 56, 40);
      g.fillStyle = ['#9fb7c9', '#c9a98a', '#a5b98f'][Math.floor(r() * 3)];
      g.fillRect(100, 44, 48, 32);
      g.fillStyle = '#2f2f2f';
      g.fillRect(222, 70, 4, 82);
      g.fillStyle = '#f2e6c8';
      g.fillRect(212, 58, 24, 16);
    } else if (pick === 1) {
      // 책장 + 책상 + 화분
      g.fillStyle = '#7b5e45';
      g.fillRect(30, 30, 70, 122);
      for (let y = 46; y < 150; y += 26) {
        g.fillStyle = '#5a4433';
        g.fillRect(30, y, 70, 4);
        for (let x = 34; x < 96; x += 7) {
          g.fillStyle = ['#a33', '#357', '#593', '#cb6', '#666'][Math.floor(r() * 5)];
          g.fillRect(x, y - 18 + Math.floor(r() * 4), 5, 18);
        }
      }
      g.fillStyle = '#c9b79c';
      g.fillRect(130, 104, 80, 6);
      g.fillRect(134, 110, 5, 42);
      g.fillRect(202, 110, 5, 42);
      g.fillStyle = '#222';
      g.fillRect(150, 78, 40, 26);
      g.fillStyle = '#3d6b3d';
      g.beginPath();
      g.arc(232, 108, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8a5a3c';
      g.fillRect(224, 120, 16, 32);
    } else {
      // TV + 낮은 장 + 옷장
      g.fillStyle = '#e8e2d8';
      g.fillRect(170, 20, 70, 132);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(170, 20, 35, 132);
      g.strokeRect(205, 20, 35, 132);
      g.fillStyle = '#6b5240';
      g.fillRect(30, 124, 120, 28);
      g.fillStyle = '#111';
      g.fillRect(48, 66, 84, 50);
      g.fillStyle = '#26324a';
      g.fillRect(51, 69, 78, 44);
    }
  } else {
    // 빈집: 바닥에 상자 하나
    g.fillStyle = '#b89a6a';
    g.fillRect(110, 124, 40, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 베란다 유리 난간 (사진 속 난간과 같은 모양): 바닥에서 1m 높이 유리판 + 위 손잡이 + 기둥.
 * @param bottom 그룹 좌표에서 베란다 바닥 높이
 */
export function addBalconyRail(group: THREE.Group, W: number, bottom: number, z: number) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.35, metalness: 0.7 });
  const glass = glassMaterial({ tint: 0x3a4c4a });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, zz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, zz);
    m.userData.keepMaterial = true;
    group.add(m);
    return m;
  };
  const RH = 1.0;
  add(new THREE.BoxGeometry(W + 0.06, 0.04, 0.05), metal, 0, bottom + RH, z);
  const pane = add(new THREE.PlaneGeometry(W - 0.04, RH - 0.1), glass, 0, bottom + RH / 2, z);
  pane.renderOrder = 3;
  const posts = Math.max(2, Math.round(W / 1.1) + 1);
  for (let i = 0; i < posts; i++) add(new THREE.BoxGeometry(0.03, RH, 0.03), metal, -W / 2 + (W * i) / (posts - 1), bottom + RH / 2, z);
}

/**
 * 사진 속 베란다 문 자리를 덮는 벽판 (외벽 사진의 흰 벽 색). 창문 그룹 원점 기준 dy 만큼 위아래로.
 */
export function coverPlate(group: THREE.Group, w: number, h: number, dy: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008), new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.9 }));
  // 창 그룹은 외벽에서 1cm 앞 → 벽판은 외벽보다 6mm 앞, 창 유리보다 뒤
  m.position.set(0, dy, -0.008);
  m.receiveShadow = true;
  m.userData.keepMaterial = true;
  group.add(m);
  return m;
}

/** 이웃 집 창문: 유리 미닫이 두 짝 + 그 너머 방 */
export class UnitWindow {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;

  /**
   * @param W 문 폭, H 문 높이 (그림 속 베란다 문 크기)
   * @param sill 그 층 바닥에서 문 아래까지, head 문 위에서 천장까지
   */
  constructor(W: number, H: number, sill: number, head: number, room: UnitRoom, night: { value: number }) {
    const r = rng(room.seed + 17);
    const wall = new THREE.Color(WALLS[Math.floor(r() * WALLS.length)]);
    const curtain = new THREE.Color(CURTAINS[Math.floor(r() * CURTAINS.length)]);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tBack: { value: backTexture(room) },
        size: { value: new THREE.Vector2(W, H) },
        depth: { value: 3.2 },
        sill: { value: sill },
        head: { value: head },
        wallC: { value: wall.convertSRGBToLinear() },
        floorC: { value: new THREE.Color(0xa47a52).convertSRGBToLinear() },
        curtainC: { value: curtain.convertSRGBToLinear() },
        curtainL: { value: room.empty ? 0 : 0.08 + r() * 0.22 },
        curtainR: { value: room.empty ? 0 : 0.08 + r() * 0.22 },
        sheer: { value: room.empty ? 0 : r() < 0.5 ? 0.35 + r() * 0.3 : 0 },
        night,
        lit: { value: !room.empty && r() < 0.7 ? 1 : 0 },
      },
      vertexShader,
      fragmentShader,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.mat);
    quad.position.z = 0.004;
    quad.userData.keepMaterial = true;
    this.group.add(quad);

    const frame = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.6 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame);
      m.position.set(x, y, z);
      m.userData.keepMaterial = true;
      this.group.add(m);
    };
    // 바깥 창틀 + 미닫이 두 짝의 틀
    const T = 0.06;
    box(W + T * 2, T, 0.08, 0, H / 2 + T / 2, 0.03);
    box(W + T * 2, T, 0.08, 0, -H / 2 - T / 2, 0.03);
    box(T, H, 0.08, -W / 2 - T / 2, 0, 0.03);
    box(T, H, 0.08, W / 2 + T / 2, 0, 0.03);
    const glass = glassMaterial();
    const sw = W / 2 + 0.03;
    for (const [x, z] of [[-W / 4, 0.03], [W / 4, 0.065]] as const) {
      box(0.045, H, 0.04, x - sw / 2 + 0.02, 0, z);
      box(0.045, H, 0.04, x + sw / 2 - 0.02, 0, z);
      box(sw, 0.045, 0.04, x, H / 2 - 0.02, z);
      box(sw, 0.045, 0.04, x, -H / 2 + 0.02, z);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.06, H - 0.06), glass);
      pane.position.set(x, 0, z);
      pane.renderOrder = 2;
      pane.userData.keepMaterial = true;
      this.group.add(pane);
    }
    // 돌 창턱
    const stone = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.06, 0.24), new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.8 }));
    stone.position.set(0, -H / 2 - T - 0.03, 0.1);
    stone.userData.keepMaterial = true;
    this.group.add(stone);
  }
}
