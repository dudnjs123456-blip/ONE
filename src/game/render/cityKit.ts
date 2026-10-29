import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Building } from '../city/cityMap';
import { toonify } from './lookFx';
import { mergeByMaterial } from './merge';
import { track } from './loadTracker';

/**
 * 도시 건물 모델: Kenney City Kit (Commercial, CC0).
 * 모델을 옆으로 크게 늘리면 창문(짙은 남색)이 벽을 다 덮어 건물이 검게 보인다.
 * 그래서 높이에 맞춰 '원래 비율대로' 키우고, 폭이 남으면 같은 모델을 옆으로 이어 붙인다.
 * 후보 중 늘어나는 정도가 가장 적은 모델을 고른다 (조금 남는 폭만 살짝 늘림).
 * 정면(현관·차양)은 +z, 즉 도로 쪽.
 */
const BASE = '/models/city/';
const SKYSCRAPERS = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
const LOWRISE = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n'];

interface Kit {
  name: string;
  scene: THREE.Group;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}

const loader = new GLTFLoader();
const kits = new Map<string, Promise<Kit>>();
function loadKit(name: string): Promise<Kit> {
  let p = kits.get(name);
  if (!p) {
    p = track(
      loader.loadAsync(`${BASE}${name}.glb`).then((g) => {
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene);
        return { name, scene: g.scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y };
      }),
    );
    kits.set(name, p);
  }
  return p;
}

/**
 * 건물 색 이미지 (기본 + 색 변형 2종). 이 키트는 벽·1층이 짙은 남회색이라 위에서 내려다보면 건물이 검게 보인다.
 * 그래서 불러올 때 어두운 색을 밝게 들어 올린다 (흰색은 그대로, 짙은 색일수록 많이 밝아짐).
 */
const LIFT = 0.32;
const palettes = new Map<string, THREE.Texture>();
function palette(name: string) {
  let t = palettes.get(name);
  if (!t) {
    const cv = document.createElement('canvas');
    // 그림이 오기 전에 먼저 그려져도 크기가 안 바뀌게 실제 크기(512)로 미리 잡는다.
    // (그래픽 카드에 한 번 잡힌 텍스처 크기가 나중에 바뀌면 건물이 검게 깨져 보인다)
    cv.width = 512;
    cv.height = 512;
    const tex = new THREE.CanvasTexture(cv);
    // glTF 텍스처 규칙에 맞춘다 (뒤집지 않음, sRGB)
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      if (cv.width !== img.width || cv.height !== img.height) {
        cv.width = img.width;
        cv.height = img.height;
        tex.dispose();
      }
      const g = cv.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < d.data.length; i += 4) {
        for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(d.data[i + k] + (255 - d.data[i + k]) * LIFT);
      }
      g.putImageData(d, 0, 0);
      tex.needsUpdate = true;
    };
    void track(
      new Promise<void>((res) => {
        img.addEventListener('load', () => res());
        img.addEventListener('error', () => res());
      }),
    );
    img.src = `${BASE}Textures/${name}.png`;
    t = tex;
    palettes.set(name, t);
  }
  return t;
}

/** 이 건물에 가장 덜 늘어나는 모델과 이어 붙일 개수 */
function fitKit(b: Building, cands: Kit[]) {
  let best: { kit: Kit; n: number; stretch: number; score: number } | null = null;
  for (const kit of cands) {
    const s = b.h / kit.size.y;
    const n = Math.max(1, Math.round(b.w / (kit.size.x * s)));
    const stretch = b.w / (n * kit.size.x * s);
    // 비슷한 점수면 건물마다 다른 모델이 나오게 조금 섞는다
    const jitter = ((((b.id * 2654435761) >>> 0) + kit.name.charCodeAt(kit.name.length - 1) * 7919) % 1000) / 1000 * 0.08;
    const score = Math.abs(Math.log(stretch)) + jitter;
    if (!best || score < best.score) best = { kit, n, stretch, score };
  }
  return best!;
}

/**
 * 건물 하나를 만든다 (비동기): 높이에 맞춰 원래 비율로 키우고, 폭은 같은 모델을 이어 붙여 채운다.
 * @returns 모델과 그 재질들 (가림 투명 처리·밤 조명용)
 */
export async function makeKitBuilding(b: Building, face: 1 | -1 = 1): Promise<{ model: THREE.Object3D; mats: THREE.MeshToonMaterial[] }> {
  const tall = b.kind === 'office' || b.kind === 'apartment';
  const cands = await Promise.all((tall ? SKYSCRAPERS : LOWRISE).map(loadKit));
  const { kit, n, stretch } = fitKit(b, cands);
  const s = b.h / kit.size.y;
  const sx = s * stretch;
  const sz = b.d / kit.size.z;
  const tiles = new THREE.Group();
  const unit = kit.size.x * sx;
  for (let i = 0; i < n; i++) {
    const m = kit.scene.clone(true);
    m.scale.set(sx, s, sz);
    m.position.set(-kit.center.x * sx + (i - (n - 1) / 2) * unit, -kit.minY * s, -kit.center.z * sz);
    tiles.add(m);
  }
  // 이어 붙인 조각들을 재질별로 하나로 (건물 하나 = 그리기 한두 번)
  const row = mergeByMaterial(tiles);
  // 건물마다 재질을 따로 (뒤에 가려진 건물만 반투명하게 하려면)
  const swapped = toonify(row);
  const mats = [...new Set(swapped.values())] as THREE.MeshToonMaterial[];
  const tint = b.id % 3;
  for (const m of mats) {
    m.map = palette(tint === 0 ? 'colormap' : tint === 1 ? 'variation-a' : 'variation-b');
    // 밤엔 창문 쪽이 은은하게 보이도록 (전체를 아주 약하게 발광)
    m.emissive.setRGB(1, 0.85, 0.6);
    m.emissiveMap = m.map;
    m.emissiveIntensity = 0;
    // 앞면만 (반투명으로 가릴 때 안쪽 면이 겹겹이 비치지 않게)
    m.side = THREE.FrontSide;
  }
  row.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // 정면이 북쪽이면 통째로 돌린다
  if (face < 0) row.rotation.y = Math.PI;
  return { model: row, mats };
}
