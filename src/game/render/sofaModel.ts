import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toonify } from './lookFx';

/**
 * 거실 3인용 소파 (직접 만든 모델 — 앉고 눕는 자세가 쿠션 높이·깊이에 딱 맞게).
 * 바닥 가운데가 원점, 앞(앉는 쪽)은 -z. 치수는 HOME.sofa 자세와 맞춰져 있다:
 *   폭 2.6 · 깊이 1.0 · 좌석 윗면 0.42 · 등쿠션 앞면 z=+0.19 · 팔걸이 윗면 0.64 (안쪽 x=±1.08)
 */
export const SOFA = { w: 2.6, d: 1.0, seatTop: 0.42, backFront: 0.19, armTop: 0.64, armInner: 1.08 };

/** 부드러운 부클레 원단 느낌 (작은 점 무늬) */
function fabricTexture(base: string, speck: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = speck;
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.08 + Math.random() * 0.12;
    g.beginPath();
    g.arc(Math.random() * 128, Math.random() * 128, 0.6 + Math.random() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** 니트 담요 (굵은 골 줄무늬) */
function knitTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9b48a';
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, 0, 7, 128);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(x + 8, 0, 2, 128);
  }
  g.fillStyle = '#f2ead8';
  g.fillRect(0, 100, 128, 10); // 끝단 줄
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildSofa(): THREE.Group {
  const g = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ map: fabricTexture('#efe6d6', '#a89880'), roughness: 0.95 });
  const fabricDark = new THREE.MeshStandardMaterial({ map: fabricTexture('#e2d6c2', '#9a8a70'), roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.6 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xc8714c, roughness: 0.9 });
  const mustard = new THREE.MeshStandardMaterial({ color: 0xdcae4a, roughness: 0.9 });
  const sage = new THREE.MeshStandardMaterial({ color: 0x9fb79a, roughness: 0.9 });
  const knit = new THREE.MeshStandardMaterial({ map: knitTexture(), roughness: 1 });

  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
  const { w, d } = SOFA;

  // 원목 다리 (살짝 바깥으로 벌어진 테이퍼)
  const leg = new THREE.CylinderGeometry(0.03, 0.018, 0.13, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(leg, wood, sx * (w / 2 - 0.12), 0.065, sz * (d / 2 - 0.1), sz * 0.12, 0, -sx * 0.12);

  // 몸통 받침 + 등판
  put(rbox(w, 0.17, d, 0.05), fabricDark, 0, 0.2, 0);
  put(rbox(w, 0.6, 0.2, 0.08), fabricDark, 0, 0.56, d / 2 - 0.1);

  // 팔걸이 (둥근 롤 형태: 상자 + 위쪽 원통)
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.11);
    put(rbox(0.22, 0.42, d, 0.07), fabric, x, 0.33, 0);
    const roll = put(new THREE.CylinderGeometry(0.115, 0.115, d, 20), fabric, x, SOFA.armTop - 0.115 + 0.01, 0, Math.PI / 2);
    roll.scale.set(1, 1, 0.85);
  }

  // 좌석 쿠션 2개 (가운데 살짝 틈)
  const inner = SOFA.armInner * 2;
  const cw = inner / 2 - 0.01;
  const seatDepth = SOFA.backFront + d / 2 - 0.02;
  for (const sx of [-1, 1]) put(rbox(cw, 0.15, seatDepth, 0.06), fabric, sx * (cw / 2 + 0.005), SOFA.seatTop - 0.075, -d / 2 + 0.01 + seatDepth / 2);

  // 등쿠션 2개 (뒤로 살짝 기운 통통한 쿠션)
  for (const sx of [-1, 1]) put(rbox(cw, 0.5, 0.24, 0.1), fabric, sx * (cw / 2 + 0.005), SOFA.seatTop + 0.24, SOFA.backFront + 0.12, 0.12);

  // 쿠션 (동쪽 구석에 겹쳐서, 서쪽엔 작은 쿠션 하나) — 옆으로 누우면 서쪽 팔걸이에 머리를 괸다
  put(rbox(0.44, 0.44, 0.13, 0.06), terracotta, 0.78, 0.66, SOFA.backFront - 0.04, 0.28, -0.18, 0.08);
  put(rbox(0.38, 0.38, 0.12, 0.06), mustard, 0.5, 0.62, SOFA.backFront - 0.1, 0.32, 0.1, -0.1);
  put(rbox(0.36, 0.3, 0.12, 0.06), sage, -0.86, 0.6, SOFA.backFront - 0.02, 0.25, 0.25, 0.05);

  // 동쪽 팔걸이에 걸친 니트 담요 (위 + 바깥으로 늘어진 부분)
  const ax = w / 2 - 0.11;
  put(new THREE.BoxGeometry(0.3, 0.025, 0.55), knit, ax, SOFA.armTop + 0.005, 0.05);
  put(new THREE.BoxGeometry(0.025, 0.42, 0.55), knit, ax + 0.15, SOFA.armTop - 0.2, 0.05, 0, 0, 0.04);
  put(new THREE.BoxGeometry(0.025, 0.2, 0.55), knit, ax - 0.15, SOFA.armTop - 0.09, 0.05);

  toonify(g, undefined, { matte: true });
  return g;
}
