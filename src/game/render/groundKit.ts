import * as THREE from 'three';
import { REALISTIC_WORLD } from './lookFx';

/**
 * 실사 바닥 재질 (Firefly 로 만든 그림 → scripts/process-textures.mjs 로 다듬은 것).
 * 모든 바닥 판의 UV 를 '미터 단위' 로 바꿔 두고, 재질 쪽에서 '한 장이 몇 m 를 덮는지' 만 정한다.
 * 그래서 크기가 다른 판들이 재질 하나를 같이 쓰고, 무늬 크기도 어디서나 같다.
 * 툰 명암으로 바꾸지 않고 사실적인 조명(Standard)을 받는다 (캐릭터만 애니메이션풍).
 */
export type GroundKind = 'asphalt' | 'sidewalk' | 'grass' | 'path';

/**
 * 실사풍(REALISTIC_WORLD)이면 실제 촬영 스캔 텍스처(Poly Haven·ambientCG, CC0 — public/textures/ground-pbr/LICENSE.txt),
 * 아니면 예전 Firefly 그림
 */
const BASE = REALISTIC_WORLD ? '/textures/ground-pbr/' : '/textures/ground/';
const FILE: Record<GroundKind, string> = REALISTIC_WORLD
  ? { asphalt: 'asphalt', sidewalk: 'sidewalk', grass: 'grass', path: 'path' }
  : { asphalt: 'ground-asphalt', sidewalk: 'ground-sidewalk', grass: 'ground-grass', path: 'ground-park-path' };
/** 한 장의 세로 길이 (m). 가로는 원래 그림 비율(meta.json)대로. 스캔 텍스처는 촬영한 실제 크기 */
const TILE_H: Record<GroundKind, number> = REALISTIC_WORLD
  ? { asphalt: 2, sidewalk: 2, grass: 2, path: 2.1 }
  : { asphalt: 2.6, sidewalk: 1.05, grass: 1.9, path: 1.9 };
/** 요철 세기 (스캔 노멀맵은 실제 요철이라 1 이 제 세기) */
const BUMP: Record<GroundKind, number> = REALISTIC_WORLD
  ? { asphalt: 1, sidewalk: 1, grass: 1, path: 1 }
  : { asphalt: 0.9, sidewalk: 1.0, grass: 0.7, path: 0.8 };
const ROUGH: Record<GroundKind, number> = { asphalt: 0.92, sidewalk: 0.85, grass: 1, path: 1 };
/** 스캔 텍스처 밝기 보정 (아스팔트·콘크리트 스캔이 어두워서, 도로에 곱하는 어두운 색과 겹치면 새까맣게 된다) */
const GAIN: Record<GroundKind, number> = REALISTIC_WORLD
  ? { asphalt: 2.6, sidewalk: 1, grass: 1, path: 3 }
  : { asphalt: 1, sidewalk: 1, grass: 1, path: 1 };
/**
 * 하늘 반사 세기. 잔디를 비스듬히 보면 파란 하늘빛이 그대로 비쳐 청록색이 되므로 풀·흙은 약하게
 * (예전 Firefly 바닥엔 하늘 주변광이 없어서 1 그대로)
 */
const ENV: Record<GroundKind, number> = REALISTIC_WORLD
  ? { asphalt: 0.8, sidewalk: 0.8, grass: 0.3, path: 0.6 }
  : { asphalt: 1, sidewalk: 1, grass: 1, path: 1 };

interface Pair {
  map: THREE.Texture;
  normal: THREE.Texture;
}

export class GroundKit {
  private loader = new THREE.TextureLoader();
  private pairs = new Map<GroundKind, Pair>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(private anisotropy: number) {
    // 그림 비율을 읽어서 한 장이 덮는 가로 길이를 맞춘다 (없으면 정사각형으로)
    void fetch(`${BASE}meta.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((meta: Record<string, { aspect?: number }>) => {
        for (const [kind, p] of this.pairs) this.setRepeat(p, kind, meta[FILE[kind]]?.aspect ?? 1);
        this.aspects = meta;
      })
      .catch(() => {});
  }

  private aspects: Record<string, { aspect?: number }> = {};

  private setRepeat(p: Pair, kind: GroundKind, aspect: number) {
    const h = TILE_H[kind];
    for (const t of [p.map, p.normal]) t.repeat.set(1 / (h * aspect), 1 / h);
  }

  private pair(kind: GroundKind): Pair {
    let p = this.pairs.get(kind);
    if (!p) {
      const load = (file: string, srgb: boolean) => {
        const t = this.loader.load(`${BASE}${file}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      p = { map: load(FILE[kind], true), normal: load(`${FILE[kind]}_n`, false) };
      this.setRepeat(p, kind, this.aspects[FILE[kind]]?.aspect ?? 1);
      this.pairs.set(kind, p);
    }
    return p;
  }

  /** 바닥 재질. tint 는 그림에 곱하는 색 (도로는 더 어둡게, 자전거길은 파랗게 등) */
  material(kind: GroundKind, tint = 0xffffff): THREE.MeshStandardMaterial {
    const key = `${kind}:${tint}`;
    let m = this.mats.get(key);
    if (!m) {
      const p = this.pair(kind);
      const b = BUMP[kind];
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(tint).multiplyScalar(GAIN[kind]),
        map: p.map,
        normalMap: p.normal,
        normalScale: new THREE.Vector2(b, b),
        roughness: ROUGH[kind],
        metalness: 0,
        envMapIntensity: ENV[kind],
      });
      m.name = `ground-${key}`;
      this.mats.set(key, m);
    }
    return m;
  }

  /** 바닥 판 (w × d m) 을 (x, y, z) 에 눕힌다. UV 는 미터 단위 + 위치만큼 밀어서 판끼리 무늬가 이어진다 */
  plane(kind: GroundKind, w: number, d: number, x: number, z: number, y: number, tint?: number) {
    const geo = new THREE.PlaneGeometry(w, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, x - w / 2 + uv.getX(i) * w, -z - d / 2 + uv.getY(i) * d);
    const mesh = new THREE.Mesh(geo, this.material(kind, tint));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    // 툰 재질로 바꾸지 않는다 (실사 조명)
    mesh.userData.keepMaterial = true;
    return mesh;
  }

  /**
   * 바닥 재질을 입힌 상자 (콘크리트 벽·턱 등). 면마다 UV 를 미터 단위로 바꿔서 길게 늘여도 무늬가 늘어나지 않는다.
   * 위치는 상자 가운데 (x, y, z)
   */
  box(kind: GroundKind, w: number, h: number, d: number, x: number, y: number, z: number, tint?: number) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i) + x, py = pos.getY(i) + y, pz = pos.getZ(i) + z;
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      // 면 방향에 맞춰 평면으로 투영 (옆면: 가로 = 길이 방향, 세로 = 높이)
      if (ny > 0.5) uv.setXY(i, px, -pz);
      else if (nx > 0.5) uv.setXY(i, pz, py);
      else uv.setXY(i, px, py);
    }
    const mesh = new THREE.Mesh(geo, this.material(kind, tint));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.keepMaterial = true;
    return mesh;
  }

  dispose() {
    for (const p of this.pairs.values()) {
      p.map.dispose();
      p.normal.dispose();
    }
    for (const m of this.mats.values()) m.dispose();
  }
}
