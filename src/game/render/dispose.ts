import * as THREE from 'three';

/**
 * GPU 자원 정리 (메모리 누수 방지).
 * three.js 는 장면에서 빼기만 하면 GPU 메모리를 돌려주지 않는다. 모양(geometry)·재질·그림(texture)·뼈(skeleton)를
 * 직접 dispose 해야 한다. 이 함수는 재질에 붙은 모든 그림(map·normalMap·MToon 의 여러 그림 등)을 빠짐없이 지운다.
 *
 * 여러 곳에서 같이 쓰는 자원(공용 툰 명암 그림 등)을 지워도 괜찮다: 다음에 쓰일 때 three 가 다시 올린다.
 */
export function disposeObject(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  const skels = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geos.add(mesh.geometry);
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (m) for (const x of Array.isArray(m) ? m : [m]) mats.add(x);
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if (sk) skels.add(sk);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) disposeMaterial(m);
  for (const s of skels) s.dispose();
}

export function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  // ShaderMaterial(MToon 등)은 그림이 uniforms 안에 있다
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k in u) if (u[k]?.value instanceof THREE.Texture) (u[k].value as THREE.Texture).dispose();
  m.dispose();
}

/** 지금 살아 있는 WebGL 렌더러 수. 화면을 나갔는데 줄지 않으면 정리가 빠진 것 */
let live = 0;
export function trackRenderer(name: string) {
  live++;
  // 개발 모드(StrictMode)에선 잠깐 2개가 정상이라 3개부터 경고
  if (live > 2) console.warn(`[메모리] 렌더러가 ${live}개 살아 있습니다 (${name}). 이전 화면의 dispose 가 빠졌을 수 있어요`);
  let done = false;
  return () => {
    if (!done) live--;
    done = true;
  };
}

/**
 * 누수 경보: 화면을 정리한 직후 GPU 에 남은 모양·그림 수를 확인한다. 0 이 아니면 어딘가 dispose 가 빠졌다.
 * (개발 중에만 콘솔에 경고. 게임 동작에는 영향 없음)
 */
export function checkLeaks(renderer: THREE.WebGLRenderer, name: string) {
  const { geometries, textures } = renderer.info.memory;
  if (geometries > 0 || textures > 0) {
    console.warn(`[메모리] ${name} 정리 후에도 GPU 에 남음: 모양 ${geometries}개, 그림 ${textures}개`);
  } else if (process.env.NODE_ENV !== 'production') {
    console.info(`[메모리] ${name} 정리 완료 (남은 GPU 자원 없음)`);
  }
}
