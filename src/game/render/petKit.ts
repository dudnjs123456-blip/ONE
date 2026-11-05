import * as THREE from 'three';
import { coatOf, type PetSpecies } from '../data/pets';

/** 견종별 체형 */
interface Breed {
  bodyR: number;
  legLen: number;
  legR: number;
  bodyW: number;
  bodyH: number;
  bodyL: number;
  headR: number;
  headW: number;
  neckUp: number;
  /** 주둥이 길이 (0 = 납작, 클수록 길다) */
  muzzle: number;
  ear: 'drop' | 'longDrop' | 'point' | 'bigPoint' | 'tiny';
  tail: 'curl' | 'plumeBack' | 'puff' | 'feather' | 'stub';
  /** 털 길이 (겹 털 두께, 몸 크기 대비) */
  fluff: number;
  skirt?: boolean;
  mane?: boolean;
  bow?: boolean;
  bigEyes?: boolean;
  whiteMask?: boolean;
  whiteSocks?: boolean;
}

const DOG_BREEDS: Record<string, Breed> = {
  default: { bodyR: 0.13, legLen: 0.16, legR: 0.035, bodyW: 1, bodyH: 1, bodyL: 1.75, headR: 0.095, headW: 1, neckUp: 0.75, muzzle: 0.02, ear: 'drop', tail: 'feather', fluff: 0.07 },
  // 말티즈: 작고 새하얀 긴 털, 늘어진 귀, 정수리 리본, 크고 까만 눈
  maltese: { bodyR: 0.12, legLen: 0.1, legR: 0.03, bodyW: 1.05, bodyH: 1, bodyL: 1.45, headR: 0.105, headW: 1.1, neckUp: 0.85, muzzle: 0, ear: 'longDrop', tail: 'puff', fluff: 0.16, skirt: true, bow: true, bigEyes: true },
  // 포메라니안: 동그란 솜뭉치, 목 갈기, 작은 여우 귀, 등 위로 넘어온 꼬리
  pomeranian: { bodyR: 0.14, legLen: 0.08, legR: 0.03, bodyW: 1.2, bodyH: 1.15, bodyL: 1.15, headR: 0.1, headW: 1.15, neckUp: 0.9, muzzle: -0.01, ear: 'tiny', tail: 'plumeBack', fluff: 0.2, mane: true, bigEyes: true },
  // 시바: 쫑긋 귀, 말린 꼬리, 흰 볼·가슴·발
  shiba: { bodyR: 0.13, legLen: 0.17, legR: 0.035, bodyW: 0.95, bodyH: 1, bodyL: 1.7, headR: 0.095, headW: 1.05, neckUp: 0.8, muzzle: 0.03, ear: 'point', tail: 'curl', fluff: 0.06, whiteMask: true, whiteSocks: true },
  // 웰시코기: 긴 몸, 아주 짧은 다리, 커다란 귀, 짧은 꼬리
  corgi: { bodyR: 0.13, legLen: 0.07, legR: 0.04, bodyW: 1.05, bodyH: 1, bodyL: 2.1, headR: 0.1, headW: 1.05, neckUp: 0.85, muzzle: 0.025, ear: 'bigPoint', tail: 'stub', fluff: 0.07, whiteMask: true, whiteSocks: true },
  // 골든 리트리버: 크고 긴 주둥이, 늘어진 귀, 깃털 꼬리
  golden: { bodyR: 0.13, legLen: 0.17, legR: 0.038, bodyW: 1, bodyH: 1, bodyL: 1.9, headR: 0.095, headW: 1, neckUp: 0.85, muzzle: 0.045, ear: 'drop', tail: 'feather', fluff: 0.1 },
};

/**
 * 애완동물 3D 모델 (코드로 만든 저폴리). 앞 = +z, 바닥 = y 0.
 * 개·고양이는 가슴·허리·엉덩이로 나뉜 몸통, 목, 튀어나온 주둥이, 관절이 있는 다리(허벅지·정강이·발·발가락),
 * 끝으로 갈수록 가늘어지는 꼬리로 만들고, 겉에 털 결이 보이는 겹 털(shell fur)을 입힌다.
 * animate() 로 걷기(다리·무릎)·꼬리 흔들기·깡총·날갯짓·가끔 두리번거리기를 한다.
 */
export interface PetModel {
  root: THREE.Group;
  /** 몸통 (위아래로 들썩인다) */
  body: THREE.Group;
  legs: THREE.Object3D[];
  tail: THREE.Object3D | null;
  head: THREE.Object3D;
  wings: THREE.Object3D[];
  species: PetSpecies;
  mats: THREE.Material[];
  geos: THREE.BufferGeometry[];
}

const EYE = 0x1a1410;
const NOSE = 0x231a17;
const PINK = 0xe9a0a6;
/** 눈 반짝임 (털 결을 입히지 않는 흰색) */
const HILITE = 0xfffffe;
/** 털 길이 1 = 이만큼 (m, 몸 크기 배율 전) */
const FUR_UNIT = 0.1;

// ───────────────────────── 털 그림 (모든 펫이 같이 쓴다) ─────────────────────────

let furTexture: THREE.CanvasTexture | null = null;
/** 짧은 털 가닥이 촘촘히 그려진 그림: 겹 털의 투명도 지도 + 바탕 털의 결(범프) */
function furTex(): THREE.CanvasTexture | null {
  if (furTexture) return furTexture;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const a = Math.PI / 2 + (rnd() - 0.5) * 0.9; // 대체로 한 방향으로 누운 털
    const len = 3 + rnd() * 6;
    const v = 120 + Math.floor(rnd() * 135);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.8 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  furTexture = new THREE.CanvasTexture(c);
  furTexture.wrapS = furTexture.wrapT = THREE.RepeatWrapping;
  furTexture.repeat.set(5, 5);
  return furTexture;
}

const SHELLS = 3;

/** 끝으로 갈수록 가늘어지는 관 (꼬리·목): 점들을 지나는 곡선 */
function taperTube(points: THREE.Vector3[], r0: number, r1: number, tubular = 14, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, c);
    // 끝은 둥글게 오므린다
    const r = (r0 + (r1 - r0) * u) * (u > 0.85 ? Math.sqrt(Math.max(0.05, (1 - u) / 0.15)) : 1);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function buildPet(sp: PetSpecies, coat = 0): PetModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const fur = furTex();
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  /** 바탕 재질: 털 부위는 털 결이 살짝 도드라진다 */
  const mat = (c: number, rough = 0.85, furry = false) => {
    const key = `${c}:${rough}:${furry}`;
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: rough });
      if (furry && fur) {
        m.bumpMap = fur;
        m.bumpScale = 0.6;
      }
      matCache.set(key, m);
      mats.push(m);
    }
    return m;
  };
  /**
   * 겹 털 재질: 표면을 법선 방향으로 off 만큼 밀어낸 껍질.
   * 안쪽 겹일수록 살짝 어둡고(그늘), 바깥 겹일수록 가닥이 성글다
   */
  const shellMat = (c: number, layer: number, off: number) => {
    const key = `shell:${c}:${layer}:${off.toFixed(4)}`;
    let m = matCache.get(key);
    if (!m) {
      const col = new THREE.Color(c).multiplyScalar(0.84 + 0.06 * layer);
      const mm = new THREE.MeshStandardMaterial({ color: col, roughness: 1, alphaMap: fur, alphaTest: 0.3 + layer * 0.13 });
      mm.onBeforeCompile = (sh) => {
        sh.uniforms.uFurOff = { value: off };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uFurOff;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * uFurOff;');
      };
      mm.customProgramCacheKey = () => 'petFurShell';
      m = mm;
      matCache.set(key, m);
      mats.push(m);
    }
    return m;
  };
  const furSpecies = sp.body === 'dog' || sp.body === 'cat' || sp.body === 'rabbit' || sp.body === 'hamster';
  const mesh = (geo: THREE.BufferGeometry, c: number, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    geos.push(geo);
    const hard = c === EYE || c === NOSE || c === HILITE;
    const m = new THREE.Mesh(geo, mat(c, c === EYE || c === NOSE ? 0.25 : 0.85, furSpecies && !hard));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.userData.keepMaterial = true;
    parent.add(m);
    return m;
  };
  /**
   * 털 입히기: 같은 모양을 조금씩 크게 겹겹이 덮는다 (가닥 그림으로 구멍을 뚫어 보송한 테두리).
   * @param amount 털 길이 (이 부위 크기 대비 비율)
   */
  const fuzz = (m: THREE.Mesh, amount: number) => {
    if (!fur || amount <= 0) return m;
    const c = (m.material as THREE.MeshStandardMaterial).color.getHex();
    // 몸 크기 배율이 겹 두께에도 곱해지므로, 부위 배율의 평균으로 나눠 털 길이를 고르게
    const k = (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3 || 1;
    const len = (amount * FUR_UNIT) / k;
    for (let i = 1; i <= SHELLS; i++) {
      const sh = new THREE.Mesh(m.geometry, shellMat(c, i, Math.round(((len * i) / SHELLS) * 2000) / 2000));
      sh.userData.keepMaterial = true;
      m.add(sh);
    }
    return m;
  };
  const ball = (r: number, seg = 16) => new THREE.SphereGeometry(r, seg, Math.max(10, Math.round(seg * 0.75)));
  /** 앞뒤(z)로 누운 캡슐 */
  const capsuleZ = (r: number, len: number, c: number, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = mesh(new THREE.CapsuleGeometry(r, len, 6, 14), c, parent, x, y, z, sx, sy, sz);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const [c0, c1, c2] = coatOf(sp, coat).colors;
  const legs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];
  let tail: THREE.Object3D | null = null;
  const head = new THREE.Group();
  body.add(head);

  /** 눈: 아몬드 모양 + 반짝이는 하이라이트 (고양이는 세로 동공) */
  const eyes = (y: number, z: number, gap: number, r: number, iris = EYE, slit = false) => {
    for (const s of [-1, 1]) {
      const e = mesh(ball(r, 12), iris, head, s * gap, y, z, 1.05, 0.85, 0.6);
      e.rotation.z = s * -0.15;
      if (slit) mesh(ball(r * 0.4, 8), EYE, head, s * gap, y, z + r * 0.4, 0.45, 1.6, 0.5);
      mesh(ball(r * 0.28, 6), HILITE, head, s * gap + r * 0.3, y + r * 0.35, z + r * 0.5);
    }
  };

  /**
   * 관절 다리: 엉덩이(어깨) 관절 → 허벅지 → 무릎(발목) 관절 → 정강이 → 발 + 발가락.
   * 뒷다리는 허벅지가 뒤로, 정강이가 앞으로 꺾여 뒷다리 특유의 굽은 모양이 난다.
   */
  const limb = (x: number, z: number, top: number, len: number, r: number, c: number, rear: boolean, fluff: number, toe = c) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, top, z);
    body.add(pivot);
    const pawH = r * 0.7;
    const bend = rear ? 0.38 : -0.1;
    const seg = (len - pawH) / (2 * Math.cos(bend));
    // 허벅지 (위가 굵다)
    const thighG = new THREE.CylinderGeometry(r * (rear ? 1.75 : 1.35), r * 1.0, seg, 10);
    thighG.translate(0, -seg / 2, 0);
    const thigh = mesh(thighG, c, pivot, 0, 0, 0);
    thigh.rotation.x = bend;
    fuzz(thigh, fluff);
    // 허벅지 윗부분 근육 (몸통과 자연스럽게 이어진다)
    fuzz(mesh(ball(r * (rear ? 1.9 : 1.45), 10), c, pivot, 0, -r * 0.3, 0, 1, 1.3, 1.2), fluff);
    const knee = new THREE.Group();
    knee.position.set(0, -seg * Math.cos(bend), -seg * Math.sin(bend));
    knee.rotation.x = -bend;
    knee.userData.base = -bend;
    pivot.add(knee);
    pivot.userData.knee = knee;
    pivot.userData.rear = rear;
    const shinG = new THREE.CylinderGeometry(r * 0.95, r * 0.78, seg, 8);
    shinG.translate(0, -seg / 2, 0);
    fuzz(mesh(shinG, toe, knee, 0, 0, 0), fluff * 0.6);
    mesh(ball(r * 1.02, 8), toe, knee, 0, 0, 0);
    // 발: 납작한 발바닥 + 발가락 세 개 (발은 늘 바닥과 나란히)
    const foot = new THREE.Group();
    foot.position.set(0, -seg, 0);
    foot.rotation.x = bend;
    knee.add(foot);
    mesh(ball(r * 1.15, 10), toe, foot, 0, -pawH * 0.25, r * 0.35, 1.05, 0.62, 1.4);
    for (const k of [-1, 0, 1]) mesh(ball(r * 0.42, 6), toe, foot, k * r * 0.55, -pawH * 0.35, r * 1.3 - Math.abs(k) * r * 0.15, 1, 0.75, 1.1);
    legs.push(pivot);
  };

  switch (sp.body) {
    case 'dog': {
      // 견종마다 체형·귀·꼬리·털이 다르다
      const B = DOG_BREEDS[sp.id] ?? DOG_BREEDS.default;
      const R = B.bodyR;
      const legLen = B.legLen;
      const bodyY = legLen + R * 0.85;
      const L = R * B.bodyL * 0.62; // 가슴·엉덩이 중심까지
      const F = B.fluff;
      // 몸통: 깊은 가슴 → 잘록한 허리 → 엉덩이, 아래엔 밝은 배
      fuzz(mesh(ball(R * 1.02, 18), c0, body, 0, bodyY + R * 0.04, L * 0.75, B.bodyW, B.bodyH * 1.08, 1.0), F);
      fuzz(capsuleZ(R * 0.8, L * 1.2, c0, body, 0, bodyY + R * 0.08, 0, B.bodyW, 1, B.bodyH * 0.95), F);
      fuzz(mesh(ball(R * 0.93, 16), c0, body, 0, bodyY + R * 0.06, -L * 0.8, B.bodyW * 1.02, B.bodyH, 1.05), F);
      fuzz(capsuleZ(R * 0.6, L * 1.1, c1, body, 0, bodyY - R * 0.32, 0.03, B.bodyW * 0.95, 1, 0.75), F * 0.8);
      // 등줄기: 살짝 진한 털
      fuzz(capsuleZ(R * 0.45, L * 1.3, c2, body, 0, bodyY + R * 0.55, -0.01, B.bodyW * 0.9, 1, 0.55), F * 0.8);
      // 다리
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
        const rear = sz < 0;
        limb(sx * R * 0.55 * B.bodyW, sz * L * (rear ? 0.85 : 0.8), bodyY - R * 0.25, legLen + R * 0.6, B.legR, c0, rear, F * 0.9, B.whiteSocks ? c1 : c0);
      }
      // 말티즈: 바닥까지 늘어진 긴 털 (다리가 거의 안 보인다)
      if (B.skirt) {
        const sk = mesh(new THREE.CylinderGeometry(R * 0.95, R * 1.3, bodyY, 18, 3, true), c0, body, 0, bodyY / 2, 0, B.bodyW, 1, B.bodyL * 0.8);
        (sk.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        fuzz(sk, 0.12);
      }
      // 포메: 목둘레 풍성한 갈기
      if (B.mane) fuzz(mesh(ball(R * 1.05, 16), c0, body, 0, bodyY + R * 0.4, L * 0.9, 1.3, 1.15, 0.9), F * 1.2);
      // 목: 가슴 위에서 머리 쪽으로 비스듬히
      const hr = B.headR;
      const hy = bodyY + R * B.neckUp + R * 0.25;
      const hz = L * 0.75 + R * 0.95 + hr * 0.2;
      const neck = taperTube([new THREE.Vector3(0, bodyY + R * 0.3, L * 0.7), new THREE.Vector3(0, (bodyY + hy) / 2 + R * 0.15, (L * 0.7 + hz) / 2 + R * 0.05), new THREE.Vector3(0, hy - hr * 0.2, hz - hr * 0.35)], R * 0.62, hr * 0.75, 6, 10);
      fuzz(mesh(neck, c0, body, 0, 0, 0, B.bodyW * 0.95, 1, 1), F);
      // 머리: 두개골 + 이마 + 볼
      head.position.set(0, hy, hz);
      fuzz(mesh(ball(hr, 18), c0, head, 0, 0, 0, B.headW, 0.92, 1.05), F * 0.8);
      for (const s of [-1, 1]) fuzz(mesh(ball(hr * 0.3, 10), c0, head, s * hr * 0.36, hr * 0.5, hr * 0.42, 1, 0.6, 0.8), F * 0.3); // 이마 (눈썹 뼈)
      for (const s of [-1, 1]) fuzz(mesh(ball(hr * 0.5, 10), B.whiteMask ? 0xffffff : c0, head, s * hr * 0.5, -hr * 0.3, hr * 0.42, 1, 0.85, 1), F * 0.6); // 볼
      // 주둥이: 앞으로 튀어나온 둥근 막대 + 아래턱 + 코
      const muz = B.muzzle;
      const mLen = hr * (0.2 + Math.max(0, muz) * 8);
      const mz = hr * 0.62 + mLen / 2;
      const snout = capsuleZ(hr * 0.36, Math.max(0.001, mLen), B.whiteMask ? 0xffffff : c1, head, 0, -hr * 0.3, mz, 1.15, 0.85, 1);
      fuzz(snout, F * 0.35);
      fuzz(capsuleZ(hr * 0.24, Math.max(0.001, mLen * 0.8), c1, head, 0, -hr * 0.55, mz - mLen * 0.05, 1.1, 0.7, 1), F * 0.3); // 아래턱
      const tip = mz + mLen / 2 + hr * 0.3;
      mesh(ball(hr * 0.15, 12), NOSE, head, 0, -hr * 0.2, tip, 1.35, 0.95, 0.9);
      // 입선 (코 아래에서 양쪽으로)
      for (const s of [-1, 1]) {
        const lip = mesh(new THREE.CylinderGeometry(hr * 0.018, hr * 0.018, hr * 0.32, 4), NOSE, head, s * hr * 0.14, -hr * 0.47, tip - hr * 0.1);
        lip.rotation.z = Math.PI / 2 - s * 0.5;
      }
      // 눈: 말티즈·포메는 크고 동그란 까만 눈
      eyes(hr * 0.18, hr * 0.86, hr * (B.bigEyes ? 0.38 : 0.4), hr * (B.bigEyes ? 0.18 : 0.13));
      // 귀
      for (const s of [-1, 1]) {
        if (B.ear === 'point' || B.ear === 'bigPoint' || B.ear === 'tiny') {
          const k = B.ear === 'bigPoint' ? 1.5 : B.ear === 'tiny' ? 0.65 : 1;
          const ear = new THREE.Group();
          ear.position.set(s * hr * (B.ear === 'tiny' ? 0.45 : 0.52), hr * 0.72, -hr * 0.1);
          ear.rotation.z = -s * (B.ear === 'bigPoint' ? 0.38 : 0.24);
          ear.rotation.x = -0.12;
          head.add(ear);
          const eh = hr * 0.85 * k;
          fuzz(mesh(new THREE.ConeGeometry(hr * 0.36 * k, eh, 14), c2, ear, 0, eh / 2, 0, 1, 1, 0.42), F * 0.5);
          mesh(new THREE.ConeGeometry(hr * 0.22 * k, eh * 0.7, 12), PINK, ear, 0, eh * 0.42, hr * 0.07 * k, 1, 1, 0.3);
        } else {
          // 늘어진 귀 (말티즈는 길게 늘어진 털 귀)
          const long = B.ear === 'longDrop';
          const ear = new THREE.Group();
          ear.position.set(s * hr * 0.78, hr * 0.42, -hr * 0.08);
          ear.rotation.z = s * (long ? 0.12 : 0.28);
          head.add(ear);
          const el = hr * (long ? 0.95 : 0.65);
          const eg = new THREE.CapsuleGeometry(hr * 0.26, el, 6, 12);
          eg.translate(0, -el / 2 - hr * 0.1, 0);
          fuzz(mesh(eg, c2, ear, 0, 0, 0, 0.42, 1, 1.05), F * (long ? 1.2 : 0.8));
        }
      }
      // 말티즈: 정수리 묶은 털 + 분홍 리본
      if (B.bow) {
        fuzz(mesh(ball(hr * 0.3, 10), c0, head, 0, hr * 0.95, -hr * 0.05, 1, 1.2, 1), 0.15);
        for (const s of [-1, 1]) {
          const loop = mesh(new THREE.ConeGeometry(hr * 0.18, hr * 0.35, 12), 0xff7fae, head, s * hr * 0.2, hr * 1.14, -hr * 0.05, 1, 1, 0.5);
          loop.rotation.z = s * Math.PI / 2;
        }
        mesh(ball(hr * 0.09, 8), 0xe0457f, head, 0, hr * 1.14, -hr * 0.05);
      }
      // 꼬리
      const tp = new THREE.Group();
      tp.position.set(0, bodyY + R * 0.45, -L * 0.8 - R * 0.75);
      body.add(tp);
      tail = tp;
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      if (B.tail === 'curl') {
        // 시바: 등 위로 둥글게 말린 꼬리 (안쪽은 흰 털)
        fuzz(mesh(taperTube([V(0, 0, 0), V(0, 0.07, -0.03), V(0, 0.13, 0.01), V(0.015, 0.13, 0.07), V(0.03, 0.08, 0.08)], 0.032, 0.02), c0, tp, 0, 0, 0), 0.25);
        fuzz(mesh(ball(0.022, 8), 0xffffff, tp, 0.03, 0.075, 0.08), 0.3);
      } else if (B.tail === 'plumeBack') {
        // 포메: 등 위로 넘어온 풍성한 꼬리
        fuzz(mesh(taperTube([V(0, 0, 0), V(0, R * 0.55, -R * 0.05), V(0, R * 0.8, R * 0.4), V(0, R * 0.7, R * 0.9)], R * 0.32, R * 0.22), c0, tp, 0, 0, 0), 0.6);
      } else if (B.tail === 'puff') {
        fuzz(mesh(ball(0.055, 12), c0, tp, 0, 0.04, -0.03, 1, 1.25, 1), 0.3);
      } else if (B.tail === 'feather') {
        // 골든: 아래로 늘어진 꼬리 + 아래쪽 깃털 같은 긴 털
        fuzz(mesh(taperTube([V(0, 0, 0), V(0, -0.02, -0.09), V(0, -0.08, -0.18), V(0, -0.15, -0.23)], 0.032, 0.014), c0, tp, 0, 0, 0), 0.3);
        const fe = mesh(ball(0.035, 10), c1, tp, 0, -0.08, -0.15, 0.55, 1.6, 2.2);
        fe.rotation.x = 0.7;
        fuzz(fe, 0.35);
      } else fuzz(mesh(ball(0.035, 10), c0, tp, 0, 0.01, 0), 0.3);
      // 코기: 흰 목털 + 빵빵한 엉덩이 털
      if (sp.id === 'corgi') {
        fuzz(mesh(ball(R * 0.75, 12), 0xffffff, body, 0, bodyY + R * 0.05, L + R * 0.2, 1, 1.05, 0.7), F);
        fuzz(mesh(ball(R * 0.95, 12), c0, body, 0, bodyY + R * 0.12, -L * 0.95, 1.18, 1, 0.85), F);
      }
      // 시바: 흰 가슴
      if (sp.id === 'shiba') fuzz(mesh(ball(R * 0.72, 12), 0xffffff, body, 0, bodyY - R * 0.05, L + R * 0.2, 0.95, 1.05, 0.6), F);
      break;
    }
    case 'cat': {
      const legLen = 0.17;
      const R = 0.1;
      const bodyY = legLen + R * 0.85;
      const L = R * 1.25;
      const F = 0.08;
      // 고등어·치즈: 등에 줄무늬 (몸통 그림)
      let stripe: THREE.MeshStandardMaterial | null = null;
      if (sp.variant === 'tabby' && typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = 64;
        cv.height = 128;
        const g = cv.getContext('2d')!;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 64, 128);
        g.fillStyle = 'rgba(0,0,0,0.42)';
        for (let i = 0; i < 9; i++) {
          g.beginPath();
          g.ellipse(32, 8 + i * 14, 40, 3.2, 0, 0, Math.PI * 2);
          g.fill();
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        stripe = new THREE.MeshStandardMaterial({ color: c0, map: tex, roughness: 0.85, bumpMap: fur ?? undefined, bumpScale: 0.6 });
        mats.push(stripe);
      }
      const torso = capsuleZ(R * 0.85, L * 1.3, c0, body, 0, bodyY + R * 0.05, 0, 1, 1, 1);
      if (stripe) torso.material = stripe;
      fuzz(torso, F);
      fuzz(mesh(ball(R * 0.95, 16), c0, body, 0, bodyY, L * 0.7, 0.98, 1.08, 1), F);
      fuzz(mesh(ball(R * 0.92, 16), c0, body, 0, bodyY + R * 0.05, -L * 0.75, 1.02, 1, 1.05), F);
      fuzz(capsuleZ(R * 0.6, L * 1.1, c1, body, 0, bodyY - R * 0.35, 0.02, 0.9, 1, 0.7), F);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
        const rear = sz < 0;
        const sock = sz > 0 && sp.id === 'koshort' && c1 === 0xffffff ? c1 : c0;
        limb(sx * R * 0.52, sz * L * 0.85, bodyY - R * 0.25, legLen + R * 0.6, 0.026, c0, rear, F * 0.7, sock);
      }
      // 목 + 머리: 둥근 두개골, 볼 털, 작은 주둥이 패드
      const hr = 0.085;
      const hy = bodyY + R * 1.05;
      const hz = L * 0.7 + R * 1.05;
      fuzz(mesh(taperTube([new THREE.Vector3(0, bodyY + R * 0.3, L * 0.7), new THREE.Vector3(0, hy - hr * 0.3, hz - hr * 0.4)], R * 0.6, hr * 0.7, 4, 10), c0, body, 0, 0, 0), F);
      head.position.set(0, hy, hz);
      fuzz(mesh(ball(hr, 18), c0, head, 0, 0, 0, 1.12, 0.92, 0.98), F * 0.8);
      for (const s of [-1, 1]) fuzz(mesh(ball(hr * 0.5, 10), c0, head, s * hr * 0.62, -hr * 0.3, hr * 0.25, 0.9, 0.8, 0.9), F * 1.4); // 볼 털
      for (const s of [-1, 1]) fuzz(mesh(ball(hr * 0.27, 10), c1, head, s * hr * 0.18, -hr * 0.35, hr * 0.82, 1, 0.85, 0.9), F * 0.4); // 수염 패드
      fuzz(mesh(ball(hr * 0.2, 8), c1, head, 0, -hr * 0.55, hr * 0.72, 1, 0.7, 0.9), F * 0.3); // 턱
      const nose = mesh(new THREE.ConeGeometry(hr * 0.11, hr * 0.1, 3), 0xd98a8a, head, 0, -hr * 0.17, hr * 1.0);
      nose.rotation.x = Math.PI;
      eyes(hr * 0.18, hr * 0.78, hr * 0.4, hr * 0.17, sp.id === 'russianblue' ? 0x3fae5a : 0xc9a43a, true);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * hr * 0.55, hr * 0.68, -hr * 0.1);
        ear.rotation.z = -s * 0.28;
        head.add(ear);
        const eh = hr * 0.75;
        fuzz(mesh(new THREE.ConeGeometry(hr * 0.38, eh, 14), c2, ear, 0, eh / 2, 0, 1, 1, 0.4), F * 0.4);
        mesh(new THREE.ConeGeometry(hr * 0.24, eh * 0.75, 12), PINK, ear, 0, eh * 0.42, hr * 0.06, 1, 1, 0.3);
      }
      // 수염
      for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
        const wsk = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, hr * 1.1, 3), 0xffffff, head, s * hr * 0.65, -hr * 0.32 + k * 0.008, hr * 0.85);
        wsk.rotation.z = Math.PI / 2 + k * 0.12 * s;
        wsk.rotation.y = -s * 0.25;
      }
      // 꼬리: 위로 S자로 휘어 올라간다
      const tp = new THREE.Group();
      tp.position.set(0, bodyY + R * 0.3, -L * 0.75 - R * 0.85);
      body.add(tp);
      tail = tp;
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      fuzz(mesh(taperTube([V(0, 0, 0), V(0, 0.05, -0.08), V(0, 0.16, -0.13), V(0, 0.27, -0.1), V(0, 0.31, -0.05)], 0.022, 0.014), c0, tp, 0, 0, 0), 0.35);
      fuzz(mesh(ball(0.016, 8), c2, tp, 0, 0.31, -0.05), 0.4);
      break;
    }
    case 'rabbit': {
      fuzz(mesh(ball(0.12, 18), c0, body, 0, 0.12, -0.02, 1, 0.95, 1.2), 0.12);
      fuzz(mesh(ball(0.07, 12), c1, body, 0, 0.09, 0.07, 0.9, 1, 0.8), 0.12);
      head.position.set(0, 0.22, 0.1);
      fuzz(mesh(ball(0.075, 16), c0, head, 0, 0, 0, 1, 0.95, 1.05), 0.12);
      for (const s of [-1, 1]) fuzz(mesh(ball(0.032, 10), c1, head, s * 0.022, -0.025, 0.06, 1, 0.85, 0.9), 0.15); // 볼
      mesh(ball(0.011, 8), PINK, head, 0, -0.008, 0.083, 1.2, 0.9, 0.8);
      eyes(0.015, 0.05, 0.048, 0.013, 0xa0283a);
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.03, 0.06, -0.02);
        ear.rotation.z = -s * 0.18;
        ear.rotation.x = -0.15;
        head.add(ear);
        const eg = new THREE.CapsuleGeometry(0.024, 0.1, 6, 12);
        eg.translate(0, 0.07, 0);
        fuzz(mesh(eg, c0, ear, 0, 0, 0, 1, 1, 0.45), 0.1);
        const ig = new THREE.CapsuleGeometry(0.016, 0.085, 6, 10);
        ig.translate(0, 0.07, 0);
        mesh(ig, c2, ear, 0, 0, 0.007, 1, 1, 0.3);
      }
      tail = fuzz(mesh(ball(0.035, 10), c1, body, 0, 0.14, -0.16), 0.4);
      for (const s of [-1, 1]) {
        legs.push(fuzz(mesh(ball(0.05, 10), c0, body, s * 0.07, 0.045, -0.07, 0.8, 0.65, 1.5), 0.12));
        legs.push(fuzz(mesh(ball(0.024, 8), c0, body, s * 0.04, 0.03, 0.09, 1, 1.3, 1.3), 0.12));
      }
      break;
    }
    case 'hamster': {
      fuzz(mesh(ball(0.065, 16), c0, body, 0, 0.06, 0, 1.05, 0.9, 1.25), 0.14);
      fuzz(mesh(ball(0.05, 12), c1, body, 0, 0.045, 0.025, 1, 0.8, 1.1), 0.14);
      head.position.set(0, 0.075, 0.06);
      fuzz(mesh(ball(0.04, 14), c1, head, 0, 0, 0.01, 1.15, 0.9, 0.9), 0.12);
      for (const s of [-1, 1]) fuzz(mesh(ball(0.02, 10), c1, head, s * 0.03, -0.012, 0.02), 0.2); // 볼주머니
      eyes(0.012, 0.04, 0.022, 0.008);
      mesh(ball(0.006, 6), 0xd98a8a, head, 0, 0, 0.05);
      for (const s of [-1, 1]) {
        mesh(ball(0.016, 10), c2, head, s * 0.03, 0.035, -0.01, 1, 1, 0.45);
        mesh(ball(0.01, 8), PINK, head, s * 0.03, 0.035, -0.004, 1, 1, 0.3);
      }
      for (const s of [-1, 1]) for (const z of [0.04, -0.04]) legs.push(mesh(ball(0.012, 6), 0xf3c9b6, body, s * 0.035, 0.008, z, 1, 0.7, 1.3));
      break;
    }
    case 'hedgehog': {
      // 가시 외투 + 말랑한 얼굴
      const coatM = mesh(new THREE.IcosahedronGeometry(0.11, 2), c0, body, 0, 0.08, -0.01, 1, 0.75, 1.25);
      (coatM.material as THREE.MeshStandardMaterial).flatShading = true;
      for (let k = 0; k < 60; k++) {
        // 등 전체에 고르게 (황금각 나선)
        const u = (k + 0.5) / 60;
        const a = k * 2.39996;
        const el = Math.acos(1 - u * 1.2);
        const dx = Math.sin(el) * Math.cos(a);
        const dz = Math.sin(el) * Math.sin(a);
        const dy = Math.cos(el);
        const sp2 = mesh(new THREE.ConeGeometry(0.009, 0.055, 5), k % 3 ? c2 : 0xe8dccb, body, dx * 0.1, 0.08 + dy * 0.075, dz * 0.12 - 0.02);
        sp2.lookAt(sp2.position.x * 4, 0.08 + dy * 0.6 + 0.15, (sp2.position.z + 0.04) * 4 - 0.15);
        sp2.rotateX(Math.PI / 2);
      }
      mesh(ball(0.07, 12), c1, body, 0, 0.045, 0.02, 1, 0.6, 1.3);
      head.position.set(0, 0.06, 0.12);
      const sn = mesh(new THREE.ConeGeometry(0.045, 0.1, 14), c1, head, 0, 0, 0.02);
      sn.rotation.x = Math.PI / 2;
      mesh(ball(0.012, 8), NOSE, head, 0, 0, 0.075);
      eyes(0.018, 0.0, 0.03, 0.009);
      for (const s of [-1, 1]) for (const z of [0.06, -0.06]) legs.push(mesh(ball(0.016, 6), c1, body, s * 0.05, 0.012, z));
      break;
    }
    case 'bird': {
      mesh(ball(0.055, 16), c0, body, 0, 0.09, 0, 1, 1.1, 1.4);
      mesh(ball(0.045, 12), c1, body, 0, 0.075, 0.025, 0.9, 1, 1.1);
      head.position.set(0, 0.16, 0.04);
      mesh(ball(0.04, 14), c1, head, 0, 0, 0);
      const beak = mesh(new THREE.ConeGeometry(0.012, 0.03, 10), 0xe6a23a, head, 0, -0.008, 0.045);
      beak.rotation.x = Math.PI / 2 + 0.4;
      eyes(0.008, 0.03, 0.025, 0.007);
      for (const s of [-1, 1]) {
        const wp = new THREE.Group();
        wp.position.set(s * 0.05, 0.11, 0);
        mesh(ball(0.04, 12), c0, wp, s * 0.02, -0.01, -0.02, 0.35, 0.9, 1.6);
        // 날개 끝 깃털 세 겹
        for (let k = 0; k < 3; k++) mesh(ball(0.02, 8), c2, wp, s * 0.024, -0.025 - k * 0.006, -0.05 - k * 0.012, 0.35, 0.7, 1.7);
        body.add(wp);
        wings.push(wp);
      }
      const tp = new THREE.Group();
      tp.position.set(0, 0.07, -0.07);
      for (const k of [-1, 0, 1]) {
        const f = mesh(ball(0.018, 8), c2, tp, k * 0.008, -0.01, -0.06, 0.7, 0.25, 3.2);
        f.rotation.y = k * 0.15;
      }
      body.add(tp);
      tail = tp;
      for (const s of [-1, 1]) {
        legs.push(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 6), 0xc28a5a, body, s * 0.02, 0.02, 0.01));
        for (const k of [-1, 0, 1]) {
          const toe = mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.018, 4), 0xc28a5a, body, s * 0.02 + k * 0.005, 0.002, 0.018);
          toe.rotation.x = Math.PI / 2;
          toe.rotation.y = k * 0.4;
        }
      }
      break;
    }
    case 'turtle': {
      const shell = mesh(new THREE.SphereGeometry(0.12, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), c0, body, 0, 0.04, 0, 1, 0.8, 1.2);
      (shell.material as THREE.MeshStandardMaterial).flatShading = true;
      mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 18), c1, body, 0, 0.045, 0, 1, 1, 1.2);
      // 등딱지 무늬 (육각 판)
      for (const [x, z] of [[0, 0], [0.05, 0.05], [-0.05, 0.05], [0.05, -0.05], [-0.05, -0.05], [0, 0.085], [0, -0.085]]) {
        const p = mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.01, 6), c2, body, x, 0.135 - Math.hypot(x, z) * 0.55, z * 1.2);
        p.lookAt(x * 3, 0.6, z * 3.6);
        p.rotateX(Math.PI / 2);
      }
      head.position.set(0, 0.05, 0.16);
      mesh(ball(0.035, 12), 0x7f9a52, head, 0, 0, 0, 1, 0.9, 1.25);
      eyes(0.012, 0.03, 0.022, 0.006);
      for (const s of [-1, 1]) for (const z of [0.09, -0.09]) legs.push(mesh(ball(0.025, 10), 0x7f9a52, body, s * 0.1, 0.025, z, 1.2, 0.6, 1));
      tail = mesh(new THREE.ConeGeometry(0.012, 0.04, 8), 0x7f9a52, body, 0, 0.035, -0.16);
      (tail as THREE.Mesh).rotation.x = -Math.PI / 2;
      break;
    }
  }
  root.scale.setScalar(sp.size);
  return { root, body, legs, tail, head, wings, species: sp, mats, geos };
}

// ───────────────────────── 움직임 ─────────────────────────

/** 0~1 사이 부드러운 보간 */
const smooth = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};
/** 정수 → 0~1 난수 (같은 칸이면 늘 같은 값) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * 두리번거리기: 대부분 앞을 보고 가만히 있다가, 가끔 한쪽을 쳐다보고 잠시 머문다.
 * 한 칸(hold 초)마다 볼 방향을 하나 정하고, 칸이 바뀔 때만 turn 초 동안 부드럽게 고개를 돌린다.
 */
function glance(t: number, phase: number, hold: number, turn: number, range: number) {
  const x = t / hold + phase * 3.1;
  const i = Math.floor(x);
  const pick = (n: number) => {
    const r = hash(n + phase * 17);
    // 60% 는 정면, 나머지는 좌·우 또는 살짝 위아래
    if (r < 0.6) return { yaw: 0, pitch: 0 };
    const side = hash(n * 3.7 + 1) < 0.5 ? -1 : 1;
    return { yaw: side * range * (0.5 + hash(n * 5.3) * 0.5), pitch: (hash(n * 9.1) - 0.5) * 0.25 };
  };
  const a = pick(i - 1);
  const b = pick(i);
  const u = smooth(((x - i) * hold) / turn);
  return { yaw: a.yaw + (b.yaw - a.yaw) * u, pitch: a.pitch + (b.pitch - a.pitch) * u };
}

/** 고개 자세: 걸을 땐 앞을 보고, 멈춰 있으면 두리번 (전환은 매 프레임 조금씩 따라가서 부드럽게) */
function setHead(m: PetModel, yaw: number, pitch: number, moving: number) {
  const w = 1 - smooth(moving / 0.3);
  const ud = m.head.userData as { yaw?: number; pitch?: number };
  const ty = yaw * w;
  const tp = pitch * w;
  ud.yaw = (ud.yaw ?? ty) + (ty - (ud.yaw ?? ty)) * 0.12;
  ud.pitch = (ud.pitch ?? tp) + (tp - (ud.pitch ?? tp)) * 0.12;
  m.head.rotation.y = ud.yaw;
  m.head.rotation.x = ud.pitch;
}

/**
 * 한 프레임 자세.
 * @param t 초
 * @param moving 0~1 (걷는 정도)
 * @param phase 펫마다 다른 시작점 (여러 마리가 똑같이 움직이지 않게)
 */
export function animatePet(m: PetModel, t: number, moving: number, phase = 0, happy = 0.5) {
  const sp = m.species;
  const k = t * (6 + sp.speed * 4) + phase;
  const swing = Math.sin(k) * 0.6 * moving;
  switch (sp.body) {
    case 'dog':
    case 'cat': {
      // 대각선 다리끼리 같이 (앞왼·뒤오 / 앞오·뒤왼). 다리를 앞으로 내딛는 동안 무릎을 굽혀 발을 든다
      m.legs.forEach((l, i) => {
        const s = i === 0 || i === 3 ? 1 : -1;
        l.rotation.x = s * swing;
        const knee = l.userData.knee as THREE.Object3D | undefined;
        if (knee) knee.rotation.x = (knee.userData.base as number) + Math.max(0, Math.cos(k) * s) * 0.75 * moving;
      });
      m.body.position.y = Math.abs(Math.sin(k)) * 0.01 * moving;
      // 숨쉬기: 가슴이 아주 살짝 부풀었다 줄었다
      const breathe = 1 + Math.sin(t * 2.2 + phase) * 0.012 * (1 - moving);
      m.body.scale.set(breathe, breathe, 1);
      // 기분이 좋을수록 꼬리를 세차게 흔든다 (고양이는 느릿하게 살랑)
      if (m.tail) {
        if (sp.body === 'cat') {
          m.tail.rotation.y = Math.sin(t * 1.4 + phase) * 0.22;
          m.tail.rotation.x = Math.sin(t * 0.9 + phase) * 0.08;
        } else m.tail.rotation.y = Math.sin(t * (8 + happy * 7) + phase) * (0.2 + happy * 0.4);
      }
      const g = glance(t, phase, sp.body === 'cat' ? 4.5 : 3.6, 0.7, sp.body === 'cat' ? 0.55 : 0.5);
      setHead(m, g.yaw, g.pitch, moving);
      break;
    }
    case 'rabbit': {
      // 깡총깡총
      const hop = Math.max(0, Math.sin(k * 0.8));
      m.body.position.y = hop * 0.08 * moving;
      m.body.rotation.x = -hop * 0.25 * moving;
      const g = glance(t, phase, 3.2, 0.35, 0.45);
      setHead(m, g.yaw, 0, moving);
      // 코 씰룩
      m.head.position.y = 0.22 + Math.max(0, Math.sin(t * 9 + phase)) * 0.002 * (1 - moving);
      break;
    }
    case 'hamster':
    case 'hedgehog': {
      m.body.position.y = Math.abs(Math.sin(k * 1.6)) * 0.008 * moving;
      m.body.rotation.z = Math.sin(k * 1.6) * 0.06 * moving;
      m.legs.forEach((l, i) => (l.position.y = 0.008 + Math.max(0, Math.sin(k * 1.6 + i * 1.5)) * 0.01 * moving));
      const g = glance(t, phase, 2.2, 0.3, 0.45);
      setHead(m, g.yaw, g.pitch * 0.5, moving);
      break;
    }
    case 'bird': {
      const fly = moving;
      const flap = Math.sin(t * (fly > 0.2 ? 30 : 3) + phase) * (fly > 0.2 ? 0.9 : 0.06);
      m.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (flap + fly * 0.3)));
      // 새는 고개를 짧게 딱딱 끊어서 돌린다
      const g = glance(t, phase, 1.3, 0.1, 0.7);
      setHead(m, g.yaw, g.pitch, fly);
      if (m.tail) m.tail.rotation.x = Math.sin(t * 2 + phase) * 0.08;
      break;
    }
    case 'turtle':
      m.legs.forEach((l, i) => (l.rotation.y = Math.sin(k * 0.6 + i * 1.6) * 0.5 * moving));
      m.head.position.z = 0.16 + Math.sin(t * 0.5 + phase) * 0.01;
      break;
  }
}

export function disposePet(m: PetModel) {
  m.root.removeFromParent();
  for (const g of m.geos) g.dispose();
  for (const x of m.mats) x.dispose();
}
