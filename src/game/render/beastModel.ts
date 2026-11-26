import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 이름 없는 그림자 — 진짜 3D 몸.
 * Tripo(이미지 → 3D, 무료 H2.5)로 콘셉트 앞모습에서 뽑은 모양을 삼각형 3만 개로 줄인 모델(beast-3d.glb)에
 * 뼈대를 직접 심는다: 척추 · 가슴 · 목 · 머리 · 양 어깨 · 팔꿈치 · 손. 정점마다 가까운 뼈(선분까지 거리)에 무게를 나눈다.
 * 색은 콘셉트 그림을 앞 · 뒤에서 비춰 입히고(모델이 그 그림에서 나와 실루엣이 그대로 맞는다), 옆은 두 그림을 섞는다.
 * 붉은 눈 · 심장은 앞 그림의 발광 지도만 빛난다.
 * 모델 좌표: 발밑 y = 0, 키 1, 앞 = +z (게임 캐릭터와 같다). 불러온 뒤 키를 height 로 맞춘다.
 */
export interface BeastRig {
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  dispose(): void;
}

export type BoneName = 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'shL' | 'elL' | 'haL' | 'shR' | 'elR' | 'haR';

// 그림 속 위치(가로 px, 세로 px, 579×1024 앞모습)로 잡은 관절. 깊이(z)는 그 둘레 정점의 가운데로 정한다
const IW = 579;
const IH = 1024;
const JOINTS: Record<BoneName, [number, number]> = {
  hips: [290, 640],
  spine: [290, 520],
  chest: [290, 380],
  neck: [290, 255],
  head: [290, 200],
  shL: [196, 338],
  elL: [150, 470],
  haL: [158, 610],
  shR: [384, 338],
  elR: [440, 470],
  haR: [432, 610],
};
const PARENT: Partial<Record<BoneName, BoneName>> = {
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shL: 'chest',
  elL: 'shL',
  haL: 'elL',
  shR: 'chest',
  elR: 'shR',
  haR: 'elR',
};
/** 뼈 선분: 시작 뼈 → 끝 위치 (그 선분 둘레 정점이 이 뼈를 따른다). 손은 손톱 끝까지 */
const SEGS: { bone: BoneName; to: BoneName | [number, number]; r: number }[] = [
  { bone: 'hips', to: [290, 1010], r: 1.6 },
  { bone: 'spine', to: 'chest', r: 1.3 },
  { bone: 'chest', to: 'neck', r: 1.2 },
  { bone: 'neck', to: 'head', r: 0.7 },
  { bone: 'head', to: [290, 40], r: 0.9 },
  { bone: 'shL', to: 'elL', r: 0.75 },
  { bone: 'elL', to: 'haL', r: 0.7 },
  { bone: 'haL', to: [160, 700], r: 0.7 },
  { bone: 'shR', to: 'elR', r: 0.75 },
  { bone: 'elR', to: 'haR', r: 0.7 },
  { bone: 'haR', to: [430, 700], r: 0.7 },
];

export function loadBeastModel(height: number): Promise<BeastRig> {
  return new GLTFLoader().loadAsync('/prologue/beast/beast-3d.glb').then((gltf) => {
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (!src) throw new Error('beast model: no mesh');
    const geo = (src as THREE.Mesh).geometry.clone();
    (src as THREE.Mesh).geometry.dispose();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const k = height / (bb.max.y - bb.min.y);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(k, k, k);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const hw = Math.max(-box.min.x, box.max.x);
    // 그림 px → 모델 좌표 (앞모습 실루엣이 가로 7~578, 세로 6~1018 에 꽉 찬다)
    const px2x = (px: number) => ((px - 7) / (578 - 7) - 0.5) * 2 * hw;
    const py2y = (py: number) => (1 - (py - 6) / (1018 - 6)) * height;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    // 관절 깊이: 그 높이 · 가로 둘레 정점들의 z 가운데
    const zAt = (x: number, y: number, rad: number) => {
      let s = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (Math.abs(pos.getX(i) - x) < rad && Math.abs(pos.getY(i) - y) < rad) {
          s += pos.getZ(i);
          c++;
        }
      }
      return c ? s / c : 0;
    };
    const unit = height * 0.06;
    const jp = {} as Record<BoneName, THREE.Vector3>;
    for (const b of Object.keys(JOINTS) as BoneName[]) {
      const [ix, iy] = JOINTS[b];
      const x = px2x(ix);
      const y = py2y(iy);
      jp[b] = new THREE.Vector3(x, y, zAt(x, y, unit));
    }
    const names = Object.keys(JOINTS) as BoneName[];
    const bones = {} as Record<BoneName, THREE.Bone>;
    for (const b of names) {
      const bone = new THREE.Bone();
      bone.name = 'beast_' + b;
      bones[b] = bone;
    }
    for (const b of names) {
      const p = PARENT[b];
      const bone = bones[b];
      if (p) {
        bones[p].add(bone);
        bone.position.copy(jp[b]).sub(jp[p]);
      } else bone.position.copy(jp[b]);
    }
    // 정점 무게: 뼈 선분까지 거리가 가까울수록 (반지름 r 로 나눠 굵은 몸통 뼈가 더 넓게 잡는다), 상위 4개만
    const segs = SEGS.map((s) => {
      const a = jp[s.bone];
      const e = typeof s.to === 'string' ? jp[s.to] : new THREE.Vector3(px2x(s.to[0]), py2y(s.to[1]), a.z);
      return { idx: names.indexOf(s.bone), a, ab: e.clone().sub(a), r: s.r * unit * 2 };
    });
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    const ap = new THREE.Vector3();
    const w = new Float32Array(segs.length);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      for (let s = 0; s < segs.length; s++) {
        const sg = segs[s];
        ap.copy(v).sub(sg.a);
        const t = Math.max(0, Math.min(1, ap.dot(sg.ab) / sg.ab.lengthSq()));
        const d = ap.addScaledVector(sg.ab, -t).length() / sg.r;
        w[s] = 1 / (Math.pow(d, 6) + 1e-4);
      }
      const order = Array.from(w.keys()).sort((a, b) => w[b] - w[a]).slice(0, 4);
      let sum = 0;
      for (const o of order) sum += w[o];
      order.forEach((o, j) => {
        skinIndex[i * 4 + j] = segs[o].idx;
        skinWeight[i * 4 + j] = w[o] / sum;
      });
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

    const loader = new THREE.TextureLoader();
    const tex = (url: string) => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const front = tex('/prologue/beast/beast-front.webp');
    const back = tex('/prologue/beast/beast-back.webp');
    const glow = tex('/prologue/beast/beast-front-glow.webp');
    const mat = new THREE.MeshStandardMaterial({ color: 0xc4c2d0, roughness: 0.72, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 1.6 });
    const uni = { tFront: { value: front }, tBack: { value: back }, tGlow: { value: glow }, uHW: { value: hw }, uH: { value: height } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = 'varying vec3 vBodyPos;\nvarying vec3 vBodyN;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBodyPos = position;\nvBodyN = normal;',
      );
      sh.fragmentShader =
        'uniform sampler2D tFront;\nuniform sampler2D tBack;\nuniform sampler2D tGlow;\nuniform float uHW;\nuniform float uH;\nvarying vec3 vBodyPos;\nvarying vec3 vBodyN;\n' +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            `// 앞 · 뒤 그림을 몸에 비춘다 (처음 자세 기준 좌표라 팔을 움직여도 그림이 따라간다)
            float bu = (vBodyPos.x / uHW) * 0.5 + 0.5;
            float bv = vBodyPos.y / uH;
            vec2 fuv = vec2(mix(7.0, 578.0, bu) / 579.0, mix(1.0 - 1018.0 / 1024.0, 1.0 - 6.0 / 1024.0, bv));
            vec2 buv = vec2(mix(482.0, 6.0, bu) / 483.0, fuv.y);
            vec4 cf = texture2D(tFront, fuv);
            vec4 cb = texture2D(tBack, buv);
            float wf = smoothstep(-0.35, 0.35, normalize(vBodyN).z);
            vec4 bodyCol = mix(cb, cf, wf);
            // 그림 밖(투명)으로 삐져나온 곳은 검은 연기색
            bodyCol.rgb = mix(vec3(0.05, 0.05, 0.07), bodyCol.rgb, smoothstep(0.1, 0.6, bodyCol.a));
            diffuseColor.rgb *= bodyCol.rgb;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `// 붉은 눈 · 심장: 앞을 보는 면만
            totalEmissiveRadiance *= texture2D(tGlow, fuv).rgb * smoothstep(0.2, 0.6, normalize(vBodyN).z);`,
          );
    };
    mat.customProgramCacheKey = () => 'beast-3d-body';
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(bones.hips);
    mesh.bind(new THREE.Skeleton(names.map((b) => bones[b])));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return {
      mesh,
      bones,
      dispose() {
        geo.dispose();
        mat.dispose();
        front.dispose();
        back.dispose();
        glow.dispose();
      },
    };
  });
}
