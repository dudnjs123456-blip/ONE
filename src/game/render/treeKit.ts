import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 실사풍 가로수 (모델 파일 없이 코드로 만든다).
 *  - 줄기: 굵기가 점점 가늘어지는 가지를 여러 번 갈라 뻗는다 (나무 껍질 그림)
 *  - 잎: 잎사귀 수십 장을 그린 투명 그림 카드를 가지 끝마다 엇갈려 붙인다.
 *    카드 법선을 수관(잎 덩어리) 바깥쪽으로 돌려서 덩어리 전체가 부드럽게 빛을 받는다
 *  - 바람: 위로 갈수록 크게 천천히 흔들리고, 잎은 잘게 떨린다 (그래픽 카드에서 계산)
 * 종류 3가지: 둥근 플라타너스, 좁고 높은 은행나무, 넓게 퍼지는 느티나무. 모양별로 한 번에 그린다 (인스턴싱).
 */
export interface TreeSpot {
  x: number;
  z: number;
  s: number;
}

interface Species {
  name: string;
  leaf: number;
  bark: number;
  /** 줄기 높이·굵기 */
  trunkH: number;
  trunkR: number;
  /** 1차 가지 수, 위로 향하는 정도(0 = 옆, 1 = 위), 길이 */
  limbs: number;
  rise: number;
  limbLen: number;
  /** 중심 줄기가 끝까지 올라가나 (은행나무) */
  leader: boolean;
  /** 잎 카드 크기 */
  card: number;
}

const SPECIES: Species[] = [
  { name: 'plane', leaf: 0x5c8a3a, bark: 0xb3a58e, trunkH: 2.4, trunkR: 0.17, limbs: 5, rise: 0.55, limbLen: 1.9, leader: false, card: 1.25 },
  { name: 'ginkgo', leaf: 0x7fa040, bark: 0x6e6155, trunkH: 2.2, trunkR: 0.15, limbs: 9, rise: 0.25, limbLen: 1.15, leader: true, card: 1.0 },
  { name: 'zelkova', leaf: 0x4f7f34, bark: 0x857866, trunkH: 2.0, trunkR: 0.2, limbs: 6, rise: 0.7, limbLen: 2.4, leader: false, card: 1.3 },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** 가지 하나: start 에서 dir 로 len, 굵기 r0 → r1 */
function limb(start: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, sides: number) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  g.translate(start.x, start.y, start.z);
  // 껍질 무늬가 굵기와 길이에 맞게 (가는 가지에서 늘어나지 않게)
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, r0 * 12), uv.getY(i) * len * 1.5);
  return g;
}

/** 나무 한 종류의 모양: 줄기 도형 + 잎 카드 도형 */
function growTree(sp: Species, seed: number) {
  const rand = rng(seed);
  const wood: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const trunkTop = new THREE.Vector3(0, sp.trunkH, 0);
  // 줄기 (살짝 기운다)
  const lean = new THREE.Vector3((rand() - 0.5) * 0.08, 1, (rand() - 0.5) * 0.08).normalize();
  wood.push(limb(new THREE.Vector3(), lean, sp.trunkH + 0.2, sp.trunkR * 1.25, sp.trunkR, 7));

  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const end = from.clone().addScaledVector(dir, len);
    wood.push(limb(from, dir, len, r, r * 0.65, depth === 0 ? 6 : 4));
    if (depth >= 2 || r < 0.025) {
      tips.push(end);
      // 가지 중간에도 잎
      tips.push(from.clone().lerp(end, 0.55));
      return;
    }
    const n = depth === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const d = dir.clone().multiplyScalar(0.75).addScaledVector(side, 0.55 + rand() * 0.3).addScaledVector(UP, 0.15).normalize();
      grow(from.clone().lerp(end, 0.6 + rand() * 0.4), d, len * (0.55 + rand() * 0.2), r * 0.6, depth + 1);
    }
  };

  if (sp.leader) {
    // 은행나무: 가운데 줄기가 계속 올라가고, 층층이 짧은 가지 (위로 갈수록 짧게 → 원뿔꼴)
    const H = sp.trunkH + 3.6;
    wood.push(limb(trunkTop, UP, H - sp.trunkH, sp.trunkR, 0.03, 6));
    for (let i = 0; i < sp.limbs; i++) {
      const t = i / (sp.limbs - 1);
      const y = sp.trunkH + 0.2 + t * (H - sp.trunkH - 0.6);
      const a = i * 2.4 + rand() * 0.5;
      const d = new THREE.Vector3(Math.cos(a), sp.rise + t * 0.4, Math.sin(a)).normalize();
      grow(new THREE.Vector3(0, y, 0), d, sp.limbLen * (1.1 - t * 0.6), sp.trunkR * (0.55 - t * 0.3), 1);
    }
    tips.push(new THREE.Vector3(0, H, 0), new THREE.Vector3(0, H - 0.6, 0));
  } else {
    for (let i = 0; i < sp.limbs; i++) {
      const a = (i / sp.limbs) * Math.PI * 2 + rand() * 0.6;
      const d = new THREE.Vector3(Math.cos(a), sp.rise + rand() * 0.3, Math.sin(a)).normalize();
      grow(trunkTop.clone().addScaledVector(UP, -rand() * 0.4), d, sp.limbLen * (0.85 + rand() * 0.3), sp.trunkR * 0.62, 0);
    }
  }

  // 잎 카드: 끝마다 엇갈린 카드 2장. 법선은 수관 중심에서 바깥쪽 (+ 위쪽 조금)
  const crown = new THREE.Vector3();
  for (const p of tips) crown.add(p);
  crown.divideScalar(tips.length);
  const leaves: THREE.BufferGeometry[] = [];
  const nrm = new THREE.Vector3();
  for (const p of tips) {
    for (let k = 0; k < 2; k++) {
      const sz = sp.card * (0.8 + rand() * 0.45);
      const q = new THREE.PlaneGeometry(sz, sz);
      q.rotateY(rand() * Math.PI);
      q.rotateX((rand() - 0.5) * 1.2);
      q.translate(p.x + (rand() - 0.5) * 0.3, p.y + (rand() - 0.5) * 0.3, p.z + (rand() - 0.5) * 0.3);
      const pos = q.attributes.position as THREE.BufferAttribute;
      const nor = q.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        nrm.set(pos.getX(i) - crown.x, (pos.getY(i) - crown.y) * 0.7 + 0.35, pos.getZ(i) - crown.z).normalize();
        nor.setXYZ(i, nrm.x, nrm.y, nrm.z);
      }
      leaves.push(q);
    }
  }
  const woodGeo = mergeGeometries(wood)!;
  const leafGeo = mergeGeometries(leaves)!;
  for (const g of [...wood, ...leaves]) g.dispose();
  return { woodGeo, leafGeo };
}

/** 잎사귀 수십 장 (가운데 빽빽, 가장자리 듬성) */
function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rand = rng(7);
  // 잔가지
  g.strokeStyle = 'rgba(70,55,40,0.9)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(128, 128);
    const a = rand() * Math.PI * 2;
    g.lineTo(128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90);
    g.stroke();
  }
  for (let i = 0; i < 150; i++) {
    const r = Math.sqrt(rand()) * 112;
    const a = rand() * Math.PI * 2;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    const len = 13 + rand() * 12;
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI * 2);
    // 아래쪽 잎은 그늘져 어둡게, 위쪽은 밝게
    const l = 30 + rand() * 22 - (y / 256) * 8;
    const grad = g.createLinearGradient(-len, 0, len, 0);
    grad.addColorStop(0, `hsl(${92 + rand() * 18}, 42%, ${l - 6}%)`);
    grad.addColorStop(1, `hsl(${92 + rand() * 18}, 50%, ${l + 6}%)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    // 잎맥
    g.strokeStyle = `rgba(230,240,200,0.25)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len * 0.9, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 나무 껍질: 세로 결 + 얼룩 (흰색 바탕 → 종류별 색으로 물들인다) */
function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rand = rng(11);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) {
    const v = Math.floor(150 + rand() * 90);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath();
    g.ellipse(rand() * 128, rand() * 256, 6 + rand() * 14, 10 + rand() * 24, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    const x = rand() * 128;
    g.strokeStyle = `rgba(40,35,30,${0.25 + rand() * 0.35})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    g.moveTo(x, rand() * 256);
    g.lineTo(x + (rand() - 0.5) * 6, rand() * 256);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class TreeKit {
  private time = { value: 0 };
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private textures: THREE.Texture[] = [];
  /** 밤에 은은하게 빛나는 재질 (바깥에서 밝기 조절) */
  readonly nightMats: THREE.MeshStandardMaterial[] = [];

  /** 자리마다 나무를 심는다 (종류는 자리 순서로 돌아가며) */
  plant(parent: THREE.Object3D, spots: TreeSpot[]) {
    const leafTex = leafTexture();
    const barkTex = barkTexture();
    this.textures.push(leafTex, barkTex);
    const time = this.time;
    SPECIES.forEach((sp, ki) => {
      const mine = spots.filter((_, i) => i % SPECIES.length === ki);
      if (!mine.length) return;
      const { woodGeo, leafGeo } = growTree(sp, 1000 + ki * 77);
      this.geos.push(woodGeo, leafGeo);
      const bark = new THREE.MeshStandardMaterial({ map: barkTex, color: sp.bark, roughness: 0.95, emissive: sp.bark, emissiveMap: barkTex, emissiveIntensity: 0 });
      const leaf = new THREE.MeshStandardMaterial({
        map: leafTex,
        color: sp.leaf,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.85,
        emissive: sp.leaf,
        emissiveMap: leafTex,
        emissiveIntensity: 0,
      });
      // 그림이 이미 초록이라, 종류 색은 살짝만 물들인다 (곱해져 너무 짙어지지 않게)
      leaf.color.set(0xffffff).lerp(new THREE.Color(sp.leaf), 0.45).multiplyScalar(1.15);
      leaf.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            vec3 ip = vec3(instanceMatrix[3]);
            float ph = ip.x * 0.37 + ip.z * 0.53;
            float h = max(0.0, position.y - 1.8);
            // 큰 흔들림 (위로 갈수록) + 잎 떨림
            transformed.x += sin(uTime * 1.3 + ph) * 0.035 * h + sin(uTime * 5.0 + position.x * 4.0 + position.z * 3.0 + ph) * 0.03;
            transformed.z += cos(uTime * 1.1 + ph * 1.3) * 0.025 * h + cos(uTime * 4.3 + position.y * 5.0 + ph) * 0.03;
            transformed.y += sin(uTime * 4.7 + position.x * 6.0 + ph) * 0.02;
          }`,
        );
      };
      leaf.customProgramCacheKey = () => 'treeLeaf';
      this.mats.push(bark, leaf);
      this.nightMats.push(bark, leaf);
      const mats = mine.map((t, i) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(t.x, 0, t.z),
          new THREE.Quaternion().setFromAxisAngle(UP, (i * 2.39 + t.x * 0.13) % (Math.PI * 2)),
          new THREE.Vector3(t.s, t.s * (0.92 + ((i * 7) % 5) * 0.04), t.s),
        ),
      );
      for (const [geo, mat] of [[woodGeo, bark], [leafGeo, leaf]] as const) {
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = true;
        im.receiveShadow = true;
        im.userData.keepMaterial = true;
        // 화면 밖 판정이 인스턴스 전체 범위로 되도록
        im.computeBoundingSphere();
        parent.add(im);
      }
    });
  }

  update(t: number) {
    this.time.value = t;
  }

  /** 밤: 자기 색으로 아주 살짝 (새까만 덩어리 방지) */
  setNight(night: number) {
    for (const m of this.nightMats) m.emissiveIntensity = night * 0.1;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
