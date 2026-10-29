import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 여러 조각으로 된 모델을 재질별로 하나씩 합친다 (그리기 횟수가 줄어 가벼워진다).
 * 조각 위치·크기는 도형에 구워 넣는다. 합칠 수 없는 조각(재질 여러 개 등)은 그대로 둔다.
 * @returns 합친 모델 (원점·변환은 root 기준)
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const out = new THREE.Group();
  const local = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    local.multiplyMatrices(inv, mesh.matrixWorld);
    if (Array.isArray(mesh.material)) {
      const keep = new THREE.Mesh(mesh.geometry, mesh.material);
      keep.applyMatrix4(local);
      out.add(keep);
      return;
    }
    const geo = mesh.geometry.clone().applyMatrix4(local);
    // 뒤집힌 변환(음수 배율)이 섞이면 면 방향이 어긋나므로 합치지 않는다
    if (local.determinant() < 0) {
      out.add(new THREE.Mesh(geo, mesh.material));
      return;
    }
    let list = groups.get(mesh.material);
    if (!list) groups.set(mesh.material, (list = []));
    list.push(geo);
  });
  for (const [mat, list] of groups) {
    // 번호 매긴 도형(index)과 아닌 도형은 섞어 합칠 수 없어 한쪽으로 맞춘다
    const same = list.every((g) => g.index) || list.every((g) => !g.index);
    const merged = list.length === 1 ? list[0] : mergeGeometries(same ? list : list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (merged) {
      out.add(new THREE.Mesh(merged, mat));
      if (list.length > 1) list.forEach((g) => g.dispose());
    } else for (const g of list) out.add(new THREE.Mesh(g, mat));
  }
  return out;
}
