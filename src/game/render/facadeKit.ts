import * as THREE from 'three';
import FACADES from './facades.json';

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
  build(size: { w: number; h: number; d: number }, set: FacadeSet, seed: number) {
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
    const gh = groundMat ? GROUND_H : 0;
    const upperH = h - gh;
    const floors = Math.max(1, Math.round(upperH / FLOOR_H));
    box(upperH, gh + upperH / 2, upperMat, wallMat ?? upperMat, (geo) => {
      for (const f of [4, 5]) setFaceUV(geo, f, shift, shift + upperU(w), 0, floors);
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
    return { group, mats, glow, floorBase, floors: floors + (gh > 0 ? 1 : 0) };
  }

  dispose() {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
