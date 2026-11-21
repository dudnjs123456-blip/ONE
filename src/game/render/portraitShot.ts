import * as THREE from 'three';

/** 실제로 보이는 메쉬만 담은 상자 */
function visibleBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.union(tmp);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return box;
}

/** 모델 안의 머리 뼈 (VRM: J_Bip_C_Head · Normalized_Head, 사람 모델: Head 등). 머리카락 뼈는 뺀다 */
function headBone(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found || !(o as THREE.Bone).isBone) return;
    const n = o.name;
    if (/head$/i.test(n) && !/hair|top|end|nub|sec/i.test(n)) found = o;
  });
  return found;
}

/**
 * 대화창 초상화: 장면 속 캐릭터 얼굴을 따로 찍어 그림(data URL)으로 만든다.
 * 그린 초상화가 없는 몸·NPC·몬스터도 대사가 나올 땐 늘 얼굴이 보이게 (절대 조건: 대사 = 초상화).
 * 그 캐릭터가 보는 쪽 앞에 작은 카메라를 두고 머리를 찍는다. 이름표 같은 스프라이트는 잠깐 감춘다.
 */
export function headshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  root: THREE.Object3D,
  facing: { x: number; z: number },
  opts: { size?: number; zoom?: number; /** 찍는 동안 감출 것 (앞을 가리는 다른 캐릭터) */ hide?: THREE.Object3D[] } = {},
): string | null {
  const size = opts.size ?? 320;
  root.updateMatrixWorld(true);
  // 보이는 메쉬만으로 몸 크기를 잰다 (숨겨 둔 예비 모델·소품까지 넣으면 머리 위치가 어긋난다)
  const box = visibleBox(root);
  if (box.isEmpty()) return null;
  const h = box.max.y - box.min.y;
  if (!(h > 0.2)) return null;
  const len = Math.hypot(facing.x, facing.z) || 1;
  const fx = facing.x / len;
  const fz = facing.z / len;
  // 머리 뼈가 있으면 그 자리 (몸 상자로 어림하면 머리카락·외곽선 때문에 머리 위치가 어긋난다)
  const head = headBone(root)?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3().setFromMatrixPosition(root.matrixWorld).setY(box.max.y - h * 0.12);
  // 머리 뼈(목 위)에서 정수리까지 = 머리 크기. 머리가 큰 2등신 모델도 얼굴이 잘리지 않게 그 크기에 맞춰 찍는다
  // 정수리: 몸 상자 위끝은 머리카락 뼈대 등으로 실제보다 높게 잡히기도 해서 목→머리 뼈 길이로 한 번 더 어림한 값과 비교한다
  const hb = headBone(root);
  let top = box.max.y;
  if (hb?.parent) {
    const neck = hb.parent.getWorldPosition(new THREE.Vector3());
    const span = head.y - neck.y;
    if (span > 0.02) top = Math.min(top, head.y + Math.max(0.16, span * 2.6));
  }
  const headSize = Math.max(0.1, top - head.y);
  const frame = Math.max(headSize * 3.4, 0.4) * (opts.zoom ?? 1);
  // 화면 위쪽 끝이 정수리 조금 위, 아래쪽은 어깨·가슴
  const aim = new THREE.Vector3(head.x, top + frame * 0.08 - frame / 2, head.z);
  const dist = frame / 2 / Math.tan(THREE.MathUtils.degToRad(15));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  cam.position.set(aim.x + fx * dist, aim.y + frame * 0.05, aim.z + fz * dist);
  cam.lookAt(aim);

  const hidden: THREE.Object3D[] = [];
  for (const o of opts.hide ?? []) {
    if (o !== root && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  }
  scene.traverse((o) => {
    if ((o as THREE.Sprite).isSprite && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(size, size);
    // 렌더 타깃은 아래 줄부터 담겨 있어 위아래를 뒤집는다
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  } catch (e) {
    console.warn('초상화 찍기 실패:', e);
    return null;
  } finally {
    renderer.setRenderTarget(prev);
    rt.dispose();
    for (const o of hidden) o.visible = true;
  }
}
