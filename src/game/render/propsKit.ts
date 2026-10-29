import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonify } from './lookFx';
import { mergeByMaterial } from './merge';
import { track } from './loadTracker';

/**
 * 거리 소품: Kenney Car Kit · City Kit Roads · Nature Kit · Furniture Kit (모두 CC0).
 * 나무·가로등·벤치처럼 수백 개 놓이는 것은 한 번에 그린다 (인스턴싱) — 개수가 많아도 가볍다.
 */
const BASE = '/models/props/';

interface Prop {
  scene: THREE.Group;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}

const loader = new GLTFLoader();
const props = new Map<string, Promise<Prop>>();
export function loadProp(path: string): Promise<Prop> {
  let p = props.get(path);
  if (!p) {
    p = track(
      loader.loadAsync(BASE + path).then((g) => {
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene);
        return { scene: g.scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y };
      }),
    );
    props.set(path, p);
  }
  return p;
}

/**
 * 같은 모델을 여러 자리에 한 번에 놓는다.
 * 모델은 바닥 가운데가 원점이 되고 키가 height 가 되도록 맞춘 뒤, 자리마다 matrices[i] 로 옮긴다.
 * @returns 만든 묶음 (지울 때 쓰기)
 */
export async function instanceProp(
  parent: THREE.Object3D,
  path: string,
  matrices: THREE.Matrix4[],
  height: number,
  shadow = true,
  nightMats?: THREE.MeshToonMaterial[],
  /** 잎 색을 이 색 쪽으로 (청록 → 자연스러운 초록) */
  leafTint?: number,
) {
  const prop = await loadProp(path);
  const k = height / prop.size.y;
  const pre = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-prop.center.x, -prop.minY, -prop.center.z));
  const group = new THREE.Group();
  const scene = prop.scene.clone(true);
  const swapped = toonify(scene, undefined, { matte: true });
  if (leafTint !== undefined) {
    const tint = new THREE.Color(leafTint);
    for (const m of new Set(swapped.values())) {
      const c = (m as THREE.MeshToonMaterial).color;
      // 초록·청록 계열(잎)만 바꾸고 갈색 줄기는 그대로
      if (c.g > c.r * 1.2) c.lerp(tint, 0.7);
    }
  }
  // 밤에 새까만 덩어리가 되지 않게: 자기 색으로 아주 은은하게 빛나는 재질 목록 (밝기는 낮밤에 따라 바깥에서)
  if (nightMats) {
    for (const m of new Set(swapped.values())) {
      const t = m as THREE.MeshToonMaterial;
      t.emissive.copy(t.color);
      if (t.map) t.emissiveMap = t.map;
      t.emissiveIntensity = 0;
      nightMats.push(t);
    }
  }
  scene.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !matrices.length) return;
    // 모델 안쪽 위치·크기를 도형에 구워 넣고, 자리별 변환만 인스턴스로
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(pre);
    const im = new THREE.InstancedMesh(geo, mesh.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, tmp.copy(m)));
    im.castShadow = shadow;
    im.receiveShadow = true;
    group.add(im);
  });
  parent.add(group);
  return group;
}

/** 차 모델 하나 (길이 length 에 맞춤, 정면 +z). 움직이는 차 그룹에 넣는다 */
export async function makeCar(path: string, length: number, width: number) {
  const prop = await loadProp(path);
  const model = mergeByMaterial(prop.scene);
  const sz = length / prop.size.z;
  const sx = width / prop.size.x;
  const sy = (sz + sx) / 2;
  model.scale.set(sx, sy, sz);
  model.position.set(-prop.center.x * sx, -prop.minY * sy, -prop.center.z * sz);
  toonify(model, undefined, { matte: true });
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return model;
}
