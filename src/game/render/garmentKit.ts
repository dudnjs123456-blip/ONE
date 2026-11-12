import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { addOutline } from './lookFx';
import { keepFieldOutline } from './outfitKit';

/**
 * 갈아입는 옷 (scripts/outfit-transplant.mjs --garment 로 만든 "옷만 담긴 VRM").
 * 옷 메쉬를 입는 캐릭터의 같은 이름 뼈에 다시 묶고, 옷에만 있는 뼈(이름 앞 G_ — 치마·리본 흔들림 뼈)는
 * 캐릭터의 부모 뼈 밑으로 옮겨 붙인다. 흔들림(spring bone)은 옷 파일의 설정대로 따로 움직인다.
 * 옷은 그 캐릭터의 기본 몸에 맞춰 만든 것이라 같은 몸에만 입힌다 (data/fashion 의 garment).
 */

const buffers = new Map<string, Promise<ArrayBuffer>>();
function fetchBuffer(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return p;
}

/** 메쉬들의 가장 긴 크기 (외곽선 두께를 캐릭터 몸과 같게 맞출 때) */
function meshExtent(root: THREE.Object3D) {
  let ref = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.isOutline) return;
    m.geometry.computeBoundingBox();
    const s = m.geometry.boundingBox!.getSize(new THREE.Vector3());
    ref = Math.max(ref, s.x, s.y, s.z);
  });
  return ref;
}

export class Garment {
  /** 옷 메쉬(외곽선 포함)를 담아 캐릭터 장면에 붙인 묶음 */
  readonly root = new THREE.Group();
  /** 캐릭터 뼈 밑으로 옮겨 붙인 것 (옷 전용 뼈·충돌체) — 벗을 때 떼어 낸다 */
  private moved: THREE.Object3D[] = [];

  private constructor(
    private readonly src: VRM,
    target: VRM,
    outlineRel: number,
  ) {
    const bones = new Map<string, THREE.Object3D>();
    target.scene.traverse((o) => {
      if (o.name && !bones.has(o.name)) bones.set(o.name, o);
    });
    const at = (o: THREE.Object3D | null) => (o && !o.name.startsWith('G_') ? bones.get(o.name) : undefined);

    // 옷 전용 뼈: 사슬의 맨 위만 캐릭터의 같은 이름 부모 뼈 밑으로 (붙일 때 부모 기준 자세는 그대로)
    const extraTops: THREE.Object3D[] = [];
    src.scene.traverse((o) => {
      if (o.name.startsWith('G_') && !o.parent?.name.startsWith('G_')) extraTops.push(o);
    });
    for (const e of extraTops) {
      const parent = at(e.parent);
      if (!parent) continue;
      parent.add(e);
      this.moved.push(e);
    }
    // 따라가기 설정 (소매·바짓가랑이 뼈가 팔·다리를 바라본다): 바라보는 대상을 캐릭터의 같은 이름 뼈로.
    // 쉬는 자세 값은 옷 파일을 불러올 때(같은 쉬는 자세) 이미 재 두었으니 대상만 바꾼다
    for (const c of src.nodeConstraintManager?.constraints ?? []) {
      const t = at(c.source);
      if (t) c.source = t;
    }
    // 흔들림 충돌체 (팔·다리 뼈에 붙어 있다) → 캐릭터의 같은 뼈로
    for (const c of src.springBoneManager?.colliders ?? []) {
      const parent = at(c.parent);
      if (!parent) continue;
      parent.add(c);
      this.moved.push(c);
    }
    // 옷 메쉬를 캐릭터 뼈대에 다시 묶는다
    const meshes: THREE.SkinnedMesh[] = [];
    src.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    for (const sm of meshes) {
      const list = sm.skeleton.bones.map((b) => (b.name.startsWith('G_') ? b : (bones.get(b.name) as THREE.Bone | undefined) ?? b));
      sm.bind(new THREE.Skeleton(list, sm.skeleton.boneInverses), sm.bindMatrix);
      sm.frustumCulled = false; // 스킨 메시는 경계 상자가 정확하지 않아 가끔 사라지는 것 방지
      sm.castShadow = true;
      this.root.add(sm);
    }
    addOutline(this.root, outlineRel);
    keepFieldOutline(this.root);
    target.scene.add(this.root);
    // 흔들림 처음 상태를 지금 붙은 자리에서 다시 잡는다
    src.springBoneManager?.setInitState();
    src.springBoneManager?.reset();
  }

  /** 옷 파일을 불러와 target 에 입힌다. outline = 캐릭터 몸에 쓴 외곽선 비율 */
  static async load(url: string, target: VRM, outline = 0.0035): Promise<Garment> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(await fetchBuffer(url), '');
    const src = gltf.userData.vrm as VRM;
    // 외곽선 두께: 캐릭터 몸 전체 크기 기준과 같게
    const rel = (outline * meshExtent(target.scene)) / Math.max(0.01, meshExtent(src.scene));
    return new Garment(src, target, rel);
  }

  /** 매 프레임 (캐릭터 vrm.update 다음에) */
  update(dt: number) {
    this.src.nodeConstraintManager?.update();
    this.src.springBoneManager?.update(dt);
  }

  /** 순간이동했을 때 치마가 튀지 않게 */
  reset() {
    this.src.springBoneManager?.reset();
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of this.moved) o.removeFromParent();
    VRMUtils.deepDispose(this.root);
    for (const o of this.moved) VRMUtils.deepDispose(o);
    VRMUtils.deepDispose(this.src.scene);
    this.moved = [];
  }
}

/** 미리 받아 두기 (코디 창에서 마우스를 올렸을 때) */
export function preloadGarment(url: string) {
  void fetchBuffer(url).catch(() => {});
}
