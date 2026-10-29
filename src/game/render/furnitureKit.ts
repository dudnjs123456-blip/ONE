import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonify } from './lookFx';
import { track } from './loadTracker';

/**
 * 집·로비 가구: Kenney Furniture Kit (CC0). 가구 자리(가로·세로·높이)에 맞춰 키워 놓는다.
 * 모델 정면은 +z (rotY 로 돌려서 방 안쪽을 보게 한다).
 */
const BASE = '/models/furniture/';

interface Kit {
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
        return { scene: g.scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y };
      }),
    );
    kits.set(name, p);
  }
  return p;
}

export interface Placement {
  /** 바닥 가운데 위치 */
  x: number;
  z: number;
  /** 놓이는 높이 (다른 가구 위 등) */
  y?: number;
  /** 방 기준 가로(x)·세로(z) 크기 */
  w: number;
  d: number;
  /** 높이 (없으면 가로·세로 배율의 평균으로) */
  h?: number;
  /** 정면(+z)을 돌리는 각도 */
  rotY?: number;
}

/**
 * 가구 하나를 놓는다 (비동기).
 * @param fallback 모델이 올 때까지 대신 보이던 상자들 — 모델이 놓이면 치운다
 */
export async function placeFurniture(parent: THREE.Object3D, name: string, o: Placement, fallback?: THREE.Object3D) {
  const kit = await loadKit(name);
  const rot = o.rotY ?? 0;
  // 90° 돌리면 모델의 가로·세로가 방의 세로·가로가 된다
  const swap = Math.abs(Math.sin(rot)) > 0.7;
  const fw = swap ? o.d : o.w;
  const fd = swap ? o.w : o.d;
  const sx = fw / kit.size.x;
  const sz = fd / kit.size.z;
  const sy = o.h ? o.h / kit.size.y : (sx + sz) / 2;
  const model = kit.scene.clone(true);
  model.scale.set(sx, sy, sz);
  model.position.set(-kit.center.x * sx, -kit.minY * sy, -kit.center.z * sz);
  toonify(model, undefined, { matte: true });
  model.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  const holder = new THREE.Group();
  holder.add(model);
  holder.rotation.y = rot;
  holder.position.set(o.x, o.y ?? 0, o.z);
  parent.add(holder);
  if (fallback) fallback.removeFromParent();
  return holder;
}
