import * as THREE from 'three';
import FACADES from './facades.json';
import { realUV, stoneTexture } from './vacantShop';

/**
 * 실사 건물 (Firefly 그림 → scripts/process-facades.mjs).
 * 상자 건물에 '한 층 조각' 을 층수만큼 쌓고 폭만큼 이어 붙인다. 1층·옆벽 그림이 있으면 그것을 쓴다.
 *  - 위층: 한 층(3m) × 한 주기. 층수에 딱 맞게 반복해서 창문이 잘리지 않는다
 *  - 1층: 한 장 통째. 가운데를 건물 가운데에 맞춘다 (현관 자리)
 *  - 옆벽: 타일 무늬 반복
 * 툰 명암으로 바꾸지 않고 사실적인 조명을 받는다. 밤엔 유리창만 불이 켜진다 (_e 그림).
 */
interface FacadeMeta {
  kind: 'upper' | 'ground' | 'wall';
  aspect: number;
  units?: number;
  cells?: [number, number];
}
const META = FACADES as Record<string, FacadeMeta>;
/**
 * 위층 그림 한 장 속 베란다 문(창) 자리: 가로 [시작, 끝] (그림 폭 비율), 세로 [아래, 위] (한 층 높이 비율).
 * 그림을 새로 만들면 여기도 맞춘다.
 */
const OPENINGS: Record<string, { u: [number, number][]; v: [number, number] }> = {
  'villa-upper-white': { u: [[32 / 1024, 458 / 1024], [506 / 1024, 930 / 1024]], v: [44 / 512, 468 / 512] },
};

/** 정면 한 층의 베란다 문 하나 (건물 좌표, 왼쪽부터) */
export interface FacadeOpening {
  /** 가운데 x */
  x: number;
  w: number;
  /** 그 층 바닥에서 문 아래·위까지 높이 */
  y0: number;
  y1: number;
}
const BASE = '/textures/facade/';
const FLOOR_H = 3;
const GROUND_H = 3.6;
/** 옆벽 타일 한 칸의 실제 높이 (m) */
const WALL_CELL_H = 0.6;

export interface FacadeSet {
  upper: string;
  ground?: string;
  wall?: string;
}

const names = (prefix: string) => Object.keys(META).filter((n) => n.startsWith(prefix));

/** 빌라 그림 세트. 같은 재질 이름(white, home …)끼리 묶고, 없는 조각은 다른 빌라 것을 빌린다. 위층 그림이 없으면 null */
export function villaSet(seed: number, home: boolean): FacadeSet | null {
  const uppers = names('villa-upper-');
  if (!uppers.length) return null;
  const upper = (home && uppers.find((n) => n.endsWith('-home'))) || uppers[seed % uppers.length];
  const variant = upper.slice('villa-upper-'.length);
  const pickPart = (prefix: string) => {
    const list = names(prefix);
    return list.find((n) => n.endsWith(`-${variant}`)) ?? list[seed % Math.max(1, list.length)];
  };
  return { upper, ground: pickPart('villa-ground-'), wall: pickPart('villa-wall-') };
}

/** BoxGeometry 면 번호: +x, -x, +y, -y, +z, -z (면마다 정점 4개, uv = (0,1)(1,1)(0,0)(1,0)) */
function setFaceUV(geo: THREE.BufferGeometry, face: number, u0: number, u1: number, v0: number, v1: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < 4; k++) {
    const i = face * 4 + k;
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

export class FacadeKit {
  private loader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();

  constructor(private anisotropy: number) {}

  private tex(file: string) {
    let t = this.textures.get(file);
    if (!t) {
      t = this.loader.load(`${BASE}${file}.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.anisotropy;
      this.textures.set(file, t);
    }
    return t;
  }

  /** 건물마다 따로 만든다 (가림 처리로 한 채만 반투명해질 때 다른 건물까지 흐려지지 않게). 그림은 같이 쓴다 */
  private material(name: string) {
    const glow = META[name].kind !== 'wall';
    return new THREE.MeshStandardMaterial({
      map: this.tex(name),
      emissive: glow ? 0xffffff : 0x000000,
      emissiveMap: glow ? this.tex(`${name}_e`) : null,
      emissiveIntensity: 0,
      roughness: 0.75,
      metalness: 0,
    });
  }

  /**
   * 빌라 한 채. 건물 그룹 좌표계 (바닥 가운데 = 원점, 정면 = +z)
   * @returns 메쉬 그룹, 가림 처리용 재질 전부, 밤에 불 켤 재질
   */
  /**
   * @param units 정면 한 층에 들어갈 세대(베란다 문) 수를 고정 (게임 속 호수와 맞추려고)
   * @param plinth 1층 그림이 없을 때 1층 모양: 'lobby' = 석재로 마감한 현관 층 (행복빌라), 'piloti' = 기둥만 선 주차장
   *               (위층 방 그림을 1층까지 깔면 현관과 방 창문이 겹쳐 보인다)
   */
  build(size: { w: number; h: number; d: number }, set: FacadeSet, seed: number, units?: number, plinth: 'lobby' | 'piloti' = 'piloti') {
    const { w, h, d } = size;
    const group = new THREE.Group();
    const upperMat = this.material(set.upper);
    const groundMat = set.ground ? this.material(set.ground) : null;
    const wallMat = set.wall ? this.material(set.wall) : null;
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8e9093, roughness: 0.95 });
    const mats: THREE.MeshStandardMaterial[] = [upperMat, roofMat];
    const glow: THREE.MeshStandardMaterial[] = [upperMat];
    if (groundMat) {
      mats.push(groundMat);
      glow.push(groundMat);
    }
    if (wallMat) mats.push(wallMat);

    const up = META[set.upper];
    const upUnits = up.units ?? 1;
    // 위층: 반 주기(=한 세대) 단위로 폭을 맞춘다. 세대 순서를 건물마다 바꿔 불빛 무늬가 덜 똑같게
    const step = upUnits === 2 ? 0.5 : 1;
    const upperU = (width: number) => Math.max(step, Math.round(width / (FLOOR_H * up.aspect) / step) * step);
    const frontU = units ? units / upUnits : upperU(w);
    const shift = upUnits === 2 && seed % 2 ? 0.5 : 0;
    const wallUV = (geo: THREE.BufferGeometry, face: number, width: number, height: number) => {
      const m = META[set.wall!];
      const cellH = WALL_CELL_H * (m.cells?.[1] ?? 1);
      setFaceUV(geo, face, 0, width / (cellH * m.aspect), 0, height / cellH);
    };

    const box = (height: number, y: number, front: THREE.Material, side: THREE.Material, uv: (geo: THREE.BufferGeometry) => void) => {
      const geo = new THREE.BoxGeometry(w, height, d);
      uv(geo);
      // 위·아래 면은 지붕 재질
      const mesh = new THREE.Mesh(geo, [side, side, roofMat, roofMat, front, front]);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.keepMaterial = true;
      group.add(mesh);
    };

    // 위층 (1층 그림이 없으면 1층부터 위층 그림)
    const gh = groundMat ? GROUND_H : FLOOR_H;
    const upperH = h - gh;
    const floors = Math.max(1, Math.round(upperH / FLOOR_H));
    box(upperH, gh + upperH / 2, upperMat, wallMat ?? upperMat, (geo) => {
      for (const f of [4, 5]) setFaceUV(geo, f, shift, shift + frontU, 0, floors);
      if (wallMat) for (const f of [0, 1]) wallUV(geo, f, d, upperH);
      else for (const f of [0, 1]) setFaceUV(geo, f, shift, shift + upperU(d), 0, floors);
    });

    // 1층: 그림 가운데가 건물 가운데에 오게 (현관 자리)
    if (groundMat) {
      const g = META[set.ground!];
      const reps = Math.max(1, Math.round(w / (GROUND_H * g.aspect)));
      box(GROUND_H, GROUND_H / 2, groundMat, wallMat ?? groundMat, (geo) => {
        for (const f of [4, 5]) setFaceUV(geo, f, 0.5 - reps / 2, 0.5 + reps / 2, 0, 1);
        if (wallMat) for (const f of [0, 1]) wallUV(geo, f, d, GROUND_H);
        else {
          const sr = Math.max(1, Math.round(d / (GROUND_H * g.aspect)));
          for (const f of [0, 1]) setFaceUV(geo, f, 0.5 - sr / 2, 0.5 + sr / 2, 0, 1);
        }
      });
    }

    // 1층 그림이 없으면: 코드로 짓는 1층 (현관 층 또는 필로티 주차장)
    if (!groundMat) this.plinth(group, w, gh, d, plinth, mats, glow, seed);

    // 옥상 계단실
    const stair = new THREE.Mesh(new THREE.BoxGeometry(Math.min(4, w * 0.3), 2.6, Math.min(3.5, d * 0.4)), wallMat ?? roofMat);
    if (wallMat) {
      const sw = Math.min(4, w * 0.3), sd = Math.min(3.5, d * 0.4);
      for (const f of [0, 1]) wallUV(stair.geometry, f, sd, 2.6);
      for (const f of [4, 5]) wallUV(stair.geometry, f, sw, 2.6);
    }
    stair.position.set(-w * 0.22, h + 1.3, -d * 0.15);
    stair.castShadow = true;
    stair.userData.keepMaterial = true;
    group.add(stair);

    /** f 층 바닥 높이 (1층 = 0) */
    const floorBase = (f: number) => (f <= 1 ? 0 : gh > 0 ? gh + (f - 2) * FLOOR_H : (f - 1) * FLOOR_H);
    // 정면 베란다 문 자리 (그림 반복을 따라 왼쪽부터)
    const openings: FacadeOpening[] = [];
    const op = OPENINGS[set.upper];
    if (op) {
      const tileW = w / frontU;
      const th = upperH / floors;
      for (let k = Math.floor(shift) - 1; k <= Math.ceil(shift + frontU); k++)
        for (const [a, b] of op.u) {
          const u0 = k + a;
          const u1 = k + b;
          if (u0 < shift - 1e-6 || u1 > shift + frontU + 1e-6) continue;
          const xa = (u0 - shift) * tileW - w / 2;
          const xb = (u1 - shift) * tileW - w / 2;
          openings.push({ x: (xa + xb) / 2, w: xb - xa, y0: (1 - op.v[1]) * th, y1: (1 - op.v[0]) * th });
        }
      openings.sort((a, b) => a.x - b.x);
    }
    return { group, mats, glow, floorBase, floors: floors + (gh > 0 ? 1 : 0), openings };
  }

  private stoneTex: THREE.Texture | null = null;
  private lotTex: THREE.Texture | null = null;

  /** 빌라 1층 (높이 gh): 석재 현관 층 / 필로티 주차장 */
  private plinth(group: THREE.Group, w: number, gh: number, d: number, kind: 'lobby' | 'piloti', mats: THREE.MeshStandardMaterial[], glow: THREE.MeshStandardMaterial[], seed: number) {
    this.stoneTex ??= stoneTexture([200, 190, 174], 23);
    const stone = new THREE.MeshStandardMaterial({ map: this.stoneTex, roughness: 0.7, color: kind === 'lobby' ? 0xffffff : 0xe6e2da });
    const dark = new THREE.MeshStandardMaterial({ color: 0x55575b, roughness: 0.6 });
    const slab = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.85 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xf2eee6, emissive: 0xffe0b0, emissiveIntensity: 0, roughness: 0.4 });
    mats.push(stone, dark, slab, lamp);
    glow.push(lamp);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.keepMaterial = true;
      group.add(m);
      return m;
    };
    const stoneBox = (bw: number, bh: number, bd: number, x: number, y: number, z: number) => add(realUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, 1.8, 1.2), stone, x, y, z);
    // 2층 바닥 띠 (밝은 콘크리트, 살짝 튀어나옴)
    add(new THREE.BoxGeometry(w + 0.12, 0.28, d + 0.12), slab, 0, gh - 0.14, 0);

    if (kind === 'lobby') {
      // 현관 층: 통째로 석재 + 아래 짙은 걸레받이. 현관(문·포털)은 따로 붙는다
      stoneBox(w, gh - 0.28, d, 0, (gh - 0.28) / 2, 0);
      add(new THREE.BoxGeometry(w + 0.04, 0.3, d + 0.04), dark, 0, 0.15, 0);
      const side = w / 2 - (w / 2 - 1.85) / 2; // 현관 포털(3.4m) 바깥 양옆 가운데
      if (w / 2 - 1.85 > 1.0) {
        // 왼쪽: 우편함 (짙은 금속 칸칸이)
        const mail = add(new THREE.BoxGeometry(Math.min(1.2, w / 2 - 2.1), 0.7, 0.14), dark, -side, 1.35, d / 2 + 0.07);
        mail.castShadow = false;
        for (let r = 0; r < 3; r++) add(new THREE.BoxGeometry(Math.min(1.1, w / 2 - 2.2), 0.015, 0.02), slab, -side, 1.12 + r * 0.22, d / 2 + 0.145);
        // 오른쪽: 로비 쪽 젖빛 창 (밤엔 은은하게)
        add(new THREE.BoxGeometry(Math.min(1.3, w / 2 - 2.1) + 0.1, 1.0, 0.06), dark, side, 1.75, d / 2 + 0.02);
        add(new THREE.PlaneGeometry(Math.min(1.3, w / 2 - 2.1), 0.9), lamp, side, 1.75, d / 2 + 0.055);
      }
      return;
    }

    // 필로티: 뒤쪽만 막힌 벽, 앞쪽 4m 는 기둥만 선 주차 공간
    const open = Math.min(4.5, d - 3);
    const coreD = d - open;
    stoneBox(w, gh - 0.28, coreD, 0, (gh - 0.28) / 2, -d / 2 + coreD / 2);
    const cols = w > 9 ? [-1, 0, 1] : [-1, 1];
    for (const c of cols) stoneBox(0.45, gh - 0.28, 0.45, c * (w / 2 - 0.225), (gh - 0.28) / 2, d / 2 - 0.225);
    // 바닥: 콘크리트 + 흰 주차선
    this.lotTex ??= (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#9d9a94';
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
        g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
      }
      g.fillStyle = '#f2f0ea';
      g.fillRect(0, 0, 5, 128);
      g.fillRect(251, 0, 5, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      return t;
    })();
    const lot = new THREE.MeshStandardMaterial({ map: this.lotTex, roughness: 0.9 });
    mats.push(lot);
    const floor = new THREE.PlaneGeometry(w - 0.1, open).rotateX(-Math.PI / 2);
    const uv = floor.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * Math.max(1, Math.round(w / 2.5)));
    add(floor, lot, 0, 0.035, d / 2 - open / 2).castShadow = false;
    // 천장 등 (밤에 켜진다)
    for (const x of cols.length === 3 ? [-w / 4, w / 4] : [0]) add(new THREE.BoxGeometry(0.9, 0.05, 0.14), lamp, x, gh - 0.3, d / 2 - open / 2);
    // 안쪽 벽: 계단실 철문 하나
    add(new THREE.BoxGeometry(0.95, 2.1, 0.05), dark, (seed % 2 ? -1 : 1) * (w / 2 - 1.2), 1.05, d / 2 - open + 0.03);
  }

  dispose() {
    this.stoneTex?.dispose();
    this.lotTex?.dispose();
    this.stoneTex = this.lotTex = null;
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
