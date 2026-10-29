import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadProp } from './propsKit';

/**
 * 실사풍 자동차 (Kenney Car Kit 모양 + 진짜 차 재질).
 * Kenney 차는 팔레트 그림 한 장으로 색을 칠해서, 삼각형마다 팔레트의 어느 칸을 쓰는지 보고 부위를 나눈다:
 *  - 도장(가장 많이 쓴 색 칸): 클리어코트 광택 도장. 일반 차는 길에 정해진 색(흰·검·은·남색…)으로 칠한다
 *  - 유리(밝은 하늘색 칸): 짙은 반사 유리
 *  - 전조등(노랑)·후미등(빨강): 밤에 켜진다 (경찰차 지붕 경광등은 깜빡이게 따로)
 *  - 아래쪽 회색·검정 칸: 범퍼·몰딩(무광 플라스틱), 나머지: 크롬
 * 가볍게: 범퍼·타이어·크롬은 꼭짓점 색으로 재질 하나, 전조등·후미등도 하나로 묶는다 (차 한 대 = 4번 그리기 + 바퀴 축 2개).
 * 바퀴는 축(좌우 한 쌍)마다 떼어 굴러가게 한다. 반사는 하늘 그라데이션을 미리 구운 환경 맵 한 장.
 * 버스는 모델이 없어 상자들로 만든다 (도장 + 유리 띠 + 행선지 LED).
 */
type Part = 'paint' | 'glass' | 'trim' | 'rubber' | 'chrome' | 'head' | 'tail' | 'sirenRed' | 'sirenBlue';
/** 실제로 그리는 재질 칸: 어두운 부품·등은 꼭짓점 색으로 한 재질에 */
type Slot = 'paint' | 'glass' | 'dark' | 'lamp' | 'sirenRed' | 'sirenBlue';
const SLOT_OF: Record<Part, Slot> = { paint: 'paint', glass: 'glass', trim: 'dark', rubber: 'dark', chrome: 'dark', head: 'lamp', tail: 'lamp', sirenRed: 'sirenRed', sirenBlue: 'sirenBlue' };
const SLOT_ORDER: Slot[] = ['paint', 'glass', 'dark', 'lamp', 'sirenRed', 'sirenBlue'];
/** 꼭짓점 색: 어두운 부품은 바탕색, 등은 빛 색 */
const PART_COLOR: Partial<Record<Part, number>> = { trim: 0x2a2c30, rubber: 0x151515, chrome: 0xb9bcc1, head: 0xfff3dc, tail: 0xff2414 };

interface CarModel {
  /** 재질 칸별로 나눈 차체 */
  body: THREE.BufferGeometry;
  slots: Slot[];
  /** 바퀴 (불러온 직후는 한 개씩, 크기를 맞춘 뒤엔 축마다 좌우 한 쌍) */
  wheels: { geo: THREE.BufferGeometry; center: THREE.Vector3 }[];
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
  /** 도장 칸이 원래 무슨 색이었는지 (택시·경찰차는 원래 색을 쓴다) */
  paintHex: number;
}

export interface CarView {
  group: THREE.Group;
  /** 굴러가는 바퀴 (x 축으로 돈다) */
  wheels: THREE.Object3D[];
  wheelRadius: number;
  /** 경찰차 경광등 [빨강, 파랑] */
  sirens: THREE.MeshStandardMaterial[];
}

const SWATCH = (u: number, v: number) => `${Math.floor(THREE.MathUtils.clamp(u, 0, 0.999) * 8)},${Math.floor(THREE.MathUtils.clamp(v, 0, 0.999) * 4)}`;

export class CarKit {
  private envRT: THREE.WebGLRenderTarget;
  private env: THREE.Texture;
  private models = new Map<string, Promise<CarModel>>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  /** 밤에 켜지는 등 */
  private lamps: { m: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  /** 하늘을 비추는 재질 (밤엔 반사를 줄인다) */
  private shiny: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private textures: THREE.Texture[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.envRT = makeSkyEnv(renderer);
    this.env = this.envRT.texture;
  }

  private mat(key: string, make: () => THREE.MeshStandardMaterial, shine = 0) {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      if (shine) {
        m.envMap = this.env;
        m.envMapIntensity = shine;
        this.shiny.push({ m, k: shine });
      }
      this.mats.set(key, m);
    }
    return m;
  }

  private lamp(key: string, color: number, day: number, night: number) {
    return this.mat(key, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: day, roughness: 0.2 });
      this.lamps.push({ m, day, night });
      return m;
    });
  }

  /** 차 모델용 재질 칸 */
  private slotMat(slot: Slot, paint: number) {
    switch (slot) {
      case 'dark':
        return this.mat('dark', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }), 0.8);
      case 'lamp':
        return this.mat('lampV', () => {
          // 발광도 꼭짓점 색으로 (전조등은 흰빛, 후미등은 빨강)
          const m = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.2 });
          m.onBeforeCompile = (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;');
          };
          m.customProgramCacheKey = () => 'carLamp';
          this.lamps.push({ m, day: 0.4, night: 2.2 });
          return m;
        });
      default:
        return this.partMat(slot, paint);
    }
  }

  private partMat(part: Part, paint: number) {
    switch (part) {
      case 'paint':
        return this.mat(`paint:${paint}`, () => paintMaterial(paint), 1);
      case 'glass':
        return this.mat('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x141b22, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }), 1.6);
      case 'trim':
        return this.mat('trim', () => new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
      case 'rubber':
        return this.mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }));
      case 'chrome':
        return this.mat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.18, metalness: 1 }), 1.2);
      case 'head':
        return this.lamp('head', 0xfff3dc, 0.35, 2.6);
      case 'tail':
        return this.lamp('tail', 0xff2414, 0.5, 1.8);
      case 'sirenRed':
      case 'sirenBlue':
        // 차마다 따로 깜빡이므로 공유하지 않는다
        return new THREE.MeshStandardMaterial({ color: part === 'sirenRed' ? 0xff2020 : 0x2060ff, emissive: part === 'sirenRed' ? 0xff2020 : 0x2060ff, emissiveIntensity: 2 });
    }
  }

  /**
   * 모델을 실제 차 크기로 구워 둔다 (길이 length, 폭 1.85m, 높이는 장난감 비율을 눌러 실제에 가깝게).
   * 바퀴는 동그랗게 남도록 세로·앞뒤를 같은 비율로. 같은 모델·길이는 한 번만 만든다.
   */
  private load(path: string, length: number): Promise<CarModel> {
    const key = `${path}@${length}`;
    let p = this.models.get(key);
    if (!p) {
      p = loadProp(path).then((prop) => {
        const m = splitModel(prop.scene);
        const sz = length / m.size.z;
        const sx = 1.85 / m.size.x;
        const sy = sz * 0.72;
        const ox = -m.center.x * sx, oy = -m.minY * sy, oz = -m.center.z * sz;
        m.body.scale(sx, sy, sz).translate(ox, oy, oz);
        for (const w of m.wheels) {
          w.geo.scale(sx, sy, sy);
          w.center.set(w.center.x * sx + ox, w.center.y * sy + oy, w.center.z * sz + oz);
        }
        // 같은 축(앞뒤 위치가 같은)의 좌우 바퀴를 하나로: 축 가운데를 중심으로 같이 돈다
        const axles = new Map<number, typeof m.wheels>();
        for (const w of m.wheels) {
          const k = Math.round(w.center.z * 10);
          if (!axles.has(k)) axles.set(k, []);
          axles.get(k)!.push(w);
        }
        m.wheels = [...axles.values()].map((list) => {
          const c = list.reduce((a, w) => a.add(w.center), new THREE.Vector3()).divideScalar(list.length);
          const geo = mergeGeometries(list.map((w) => w.geo.translate(w.center.x - c.x, w.center.y - c.y, w.center.z - c.z)), false)!;
          for (const w of list) w.geo.dispose();
          return { geo, center: c };
        });
        this.geos.push(m.body, ...m.wheels.map((w) => w.geo));
        return m;
      });
      this.models.set(key, p);
    }
    return p;
  }

  /**
   * 차 한 대 (길이 length). 정면 +z, 바닥 가운데가 원점.
   * @param paint 도장 색 (없으면 모델 원래 색: 택시·경찰차)
   */
  async car(path: string, length: number, paint?: number): Promise<CarView> {
    const m = await this.load(path, length);
    const group = new THREE.Group();
    const color = paint ?? m.paintHex;
    const sirens: THREE.MeshStandardMaterial[] = [];
    const mats = m.slots.map((slot) => {
      const mat = this.slotMat(slot, color);
      if (slot === 'sirenRed' || slot === 'sirenBlue') sirens.push(mat);
      return mat;
    });
    const body = new THREE.Mesh(m.body, mats);
    body.castShadow = true;
    body.userData.keepMaterial = true;
    group.add(body);
    const wheels: THREE.Object3D[] = [];
    let r = 0;
    for (const w of m.wheels) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.center);
      const mesh = new THREE.Mesh(w.geo, this.slotMat('dark', color));
      mesh.castShadow = true;
      mesh.userData.keepMaterial = true;
      pivot.add(mesh);
      group.add(pivot);
      wheels.push(pivot);
      w.geo.computeBoundingBox();
      r = Math.max(r, (w.geo.boundingBox!.max.y - w.geo.boundingBox!.min.y) / 2);
    }
    // 경찰차 경광등: 빨강·파랑 칸이 따로 없으면 (모델마다 다름) 빈 목록
    return { group, wheels, wheelRadius: r || 0.35, sirens: dedupe(sirens) };
  }

  /** 시내버스 (길이 10.5m): 도장 + 유리 띠 + 흰 지붕 + 행선지 LED + 굴러가는 바퀴 */
  bus(color: number, route: string): CarView {
    const g = new THREE.Group();
    const paint = this.partMat('paint', color);
    const white = this.mat('paint:busRoof', () => paintMaterial(0xeef0f2), 1);
    const glass = this.partMat('glass', 0);
    const trim = this.partMat('trim', 0);
    const L = 10.5, W = 2.5;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.userData.keepMaterial = true;
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(W, 1.15, L), paint, 0, 0.95, 0); // 아래 차체
    add(new THREE.BoxGeometry(W - 0.02, 1.2, L - 0.3), glass, 0, 2.1, -0.05); // 옆 유리 띠
    add(new THREE.BoxGeometry(W - 0.12, 1.25, 0.06), glass, 0, 2.05, L / 2 - 0.12); // 앞 유리
    add(new THREE.BoxGeometry(W, 0.32, L), white, 0, 2.86, 0); // 지붕
    add(new THREE.BoxGeometry(W - 0.4, 0.22, L * 0.4), white, 0, 3.12, -1); // 지붕 위 에어컨
    // 창틀 기둥
    for (let z = -L / 2 + 1.4; z < L / 2 - 1; z += 1.55) for (const x of [-W / 2, W / 2]) add(new THREE.BoxGeometry(0.04, 1.2, 0.1), trim, x, 2.1, z);
    // 오른쪽(-x) 출입문 두 개
    for (const z of [L / 2 - 1.1, -0.6]) add(new THREE.BoxGeometry(0.04, 2.3, 1.1), glass, -W / 2 - 0.005, 1.55, z);
    add(new THREE.BoxGeometry(W + 0.02, 0.3, 0.25), trim, 0, 0.42, L / 2 - 0.05); // 범퍼
    add(new THREE.BoxGeometry(W + 0.02, 0.3, 0.25), trim, 0, 0.42, -L / 2 + 0.05);
    // 등
    const head = this.partMat('head', 0), tail = this.partMat('tail', 0);
    for (const x of [-0.95, 0.95]) {
      add(new THREE.BoxGeometry(0.35, 0.14, 0.04), head, x, 0.75, L / 2 + 0.01);
      add(new THREE.BoxGeometry(0.22, 0.4, 0.04), tail, x, 1.1, -L / 2 - 0.01);
    }
    // 행선지 LED (앞 유리 위)
    const led = this.mat(`led:${route}`, () => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 64;
      const cg = c.getContext('2d')!;
      cg.fillStyle = '#0b0b0b';
      cg.fillRect(0, 0, 512, 64);
      cg.fillStyle = '#ffae2a';
      cg.font = 'bold 44px "Malgun Gothic", sans-serif';
      cg.textBaseline = 'middle';
      cg.fillText(route, 16, 34);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(t);
      const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9 });
      this.lamps.push({ m, day: 0.9, night: 1.6 });
      return m;
    });
    add(new THREE.PlaneGeometry(1.9, 0.24), led, 0, 2.82, L / 2 + 0.005);
    // 바퀴 (앞·뒤 축)
    const wheels: THREE.Object3D[] = [];
    const R = 0.5;
    const tire = new THREE.CylinderGeometry(R, R, 0.32, 18).rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.34, 10).rotateZ(Math.PI / 2);
    this.geos.push(tire, hub);
    const rubber = this.partMat('rubber', 0), chrome = this.partMat('chrome', 0);
    for (const z of [L / 2 - 2.3, -L / 2 + 2.6])
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, R, z);
        const t = new THREE.Mesh(tire, rubber);
        t.castShadow = true;
        const h = new THREE.Mesh(hub, chrome);
        // 바퀴살 모양이 보이게 한 칸 비튼다
        h.rotation.x = 0.3;
        t.userData.keepMaterial = h.userData.keepMaterial = true;
        pivot.add(t, h);
        g.add(pivot);
        wheels.push(pivot);
      }
    return { group: g, wheels, wheelRadius: R, sirens: [] };
  }

  /** 하늘 반사용 환경 맵 (유리창 등에 같이 쓴다) */
  get envMap() {
    return this.env;
  }

  /** 낮 → 밤: 등은 밝게, 하늘 반사는 약하게 */
  setNight(night: number) {
    for (const l of this.lamps) l.m.emissiveIntensity = l.day + (l.night - l.day) * night;
    for (const s of this.shiny) s.m.envMapIntensity = s.k * (1 - night * 0.8);
  }

  dispose() {
    this.envRT.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    this.mats.clear();
    this.models.clear();
  }
}

const dedupe = <T>(a: T[]) => [...new Set(a)];

function paintMaterial(color: number) {
  const c = new THREE.Color(color);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  // 짙은 색은 메탈릭 펄, 흰색은 솔리드에 가깝게
  return new THREE.MeshPhysicalMaterial({
    color: c,
    metalness: hsl.l > 0.8 ? 0.1 : 0.55,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
}

/** 하늘(위) · 지평선(밝게) · 땅(어둡게) 그라데이션을 미리 구운 반사용 환경 맵 */
function makeSkyEnv(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 sky = mix(vec3(0.85, 0.9, 0.97), vec3(0.35, 0.55, 0.85), smoothstep(0.0, 0.6, y));
        vec3 ground = mix(vec3(0.42, 0.42, 0.44), vec3(0.16, 0.16, 0.17), smoothstep(0.0, -0.4, y));
        vec3 c = y > 0.0 ? sky : ground;
        // 지평선의 밝은 띠 (건물 사이로 보이는 하늘)
        c += vec3(0.5) * exp(-abs(y) * 30.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return rt;
}

/**
 * Kenney 차 모델을 부위별 차체 하나 + 바퀴들로 나눈다.
 * 삼각형을 부위 순서로 다시 줄 세우고 부위마다 그리기 묶음(group)을 만든다 → 재질 배열로 한 번에 그린다.
 */
function splitModel(root: THREE.Object3D): CarModel {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const bodies: THREE.BufferGeometry[] = [];
  const wheelGeos: THREE.BufferGeometry[] = [];
  const isWheel = (o: THREE.Object3D | null) => !!o && /^wheel-(front|back)-(left|right)/.test(o.name);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    local.multiplyMatrices(inv, mesh.matrixWorld);
    const geo = mesh.geometry.clone().applyMatrix4(local);
    (isWheel(mesh) || isWheel(mesh.parent) ? wheelGeos : bodies).push(geo);
  });
  const flat = merge(bodies);
  const tris = flat.pos.length / 9;
  // 도장 = 아래쪽 회색·검정, 맨 아랫줄(유리·등) 을 뺀 칸 중 가장 많이 쓴 칸
  const area = new Map<string, number>();
  for (let t = 0; t < tris; t++) {
    const s = swatchOf(flat.uv, t);
    area.set(s, (area.get(s) ?? 0) + 1);
  }
  const NOT_PAINT = new Set(['3,2', '2,2']);
  const paintKey = [...area].filter(([k]) => !NOT_PAINT.has(k) && !k.endsWith(',3')).sort((a, b) => b[1] - a[1])[0]?.[0];
  const box = new THREE.Box3().setFromArray(flat.pos);
  const h = box.max.y - box.min.y;
  const body = regroup(flat, (s, t) => {
    if (s === paintKey) return 'paint';
    if (s.endsWith(',0') || s.endsWith(',1')) return 'paint'; // 도장 칸의 다른 음영
    if (s === '0,3') return 'glass';
    if (s === '1,3') return 'head';
    if (s === '3,3') return 'sirenBlue';
    if (s === '2,3') {
      // 빨강: 지붕 위면 경광등, 아니면 후미등
      const y = (flat.pos[t * 9 + 1] + flat.pos[t * 9 + 4] + flat.pos[t * 9 + 7]) / 3;
      return (y - box.min.y) / h > 0.75 ? 'sirenRed' : 'tail';
    }
    if (s === '3,2') return 'trim';
    if (s === '2,2') return 'rubber';
    return 'chrome';
  });
  // 바퀴: 타이어(검정 칸)와 휠(나머지)
  const all = box.clone();
  const wheels = wheelGeos.map((g) => {
    const w = regroup(merge([g]), (s) => (s === '2,2' || s === '3,2' ? 'rubber' : 'chrome'));
    w.geo.clearGroups();
    w.geo.computeBoundingBox();
    const center = w.geo.boundingBox!.getCenter(new THREE.Vector3());
    all.union(w.geo.boundingBox!);
    w.geo.translate(-center.x, -center.y, -center.z);
    return { geo: w.geo, center };
  });
  return {
    body: body.geo,
    slots: body.slots,
    wheels,
    size: all.getSize(new THREE.Vector3()),
    center: all.getCenter(new THREE.Vector3()),
    minY: all.min.y,
    paintHex: PALETTE[paintKey ?? ''] ?? 0xcccccc,
  };
}

interface Flat {
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
}

/** 여러 도형을 번호 없는 삼각형 목록 하나로 (위치·법선·uv) */
function merge(geos: THREE.BufferGeometry[]): Flat {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const count = list.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = { pos: new Float32Array(count * 3), nor: new Float32Array(count * 3), uv: new Float32Array(count * 2) };
  let off = 0;
  for (const g of list) {
    out.pos.set(g.attributes.position.array as Float32Array, off * 3);
    out.nor.set(g.attributes.normal.array as Float32Array, off * 3);
    if (g.attributes.uv) out.uv.set(g.attributes.uv.array as Float32Array, off * 2);
    off += g.attributes.position.count;
    g.dispose();
  }
  for (const g of geos) g.dispose();
  return out;
}

const swatchOf = (uv: Float32Array, t: number) => SWATCH((uv[t * 6] + uv[t * 6 + 2] + uv[t * 6 + 4]) / 3, (uv[t * 6 + 1] + uv[t * 6 + 3] + uv[t * 6 + 5]) / 3);

/** 삼각형을 재질 칸별로 모아 그리기 묶음을 만든다 (부위 색은 꼭짓점 색으로). slots[i] = i 번째 묶음의 재질 칸 */
function regroup(f: Flat, classify: (swatch: string, tri: number) => Part) {
  const tris = f.pos.length / 9;
  const bySlot = new Map<Slot, { t: number; part: Part }[]>();
  for (let t = 0; t < tris; t++) {
    const part = classify(swatchOf(f.uv, t), t);
    const slot = SLOT_OF[part];
    let list = bySlot.get(slot);
    if (!list) bySlot.set(slot, (list = []));
    list.push({ t, part });
  }
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(tris * 9), N = new Float32Array(tris * 9), U = new Float32Array(tris * 6), C = new Float32Array(tris * 9);
  const slots: Slot[] = [];
  const col = new THREE.Color();
  let k = 0;
  for (const slot of SLOT_ORDER) {
    const list = bySlot.get(slot);
    if (!list?.length) continue;
    geo.addGroup(k * 3, list.length * 3, slots.length);
    slots.push(slot);
    for (const { t, part } of list) {
      P.set(f.pos.subarray(t * 9, t * 9 + 9), k * 9);
      N.set(f.nor.subarray(t * 9, t * 9 + 9), k * 9);
      U.set(f.uv.subarray(t * 6, t * 6 + 6), k * 6);
      col.set(PART_COLOR[part] ?? 0xffffff);
      for (let v = 0; v < 3; v++) C.set([col.r, col.g, col.b], k * 9 + v * 3);
      k++;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return { geo, slots };
}

/** Kenney 팔레트 칸의 대표 색 (택시·경찰차가 원래 색을 쓸 때) */
const PALETTE: Record<string, number> = {
  '4,1': 0xffb447, // 택시 노랑
  '6,2': 0xeeeef5, // 경찰 흰색
  '6,1': 0xe86147,
  '3,1': 0x43ac7c,
  '7,1': 0x6384d2,
};
