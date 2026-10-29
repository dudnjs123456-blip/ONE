import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 진짜 유리처럼 보이는 재질 (창문·유리문 공용).
 * - 거의 투명하고, 매끈한 표면에 방 모습이 비친다 (환경 반사, 비스듬히 볼수록 세지는 프레넬)
 * - 판 전체에 빛이 비친 듯한 사선 줄무늬가 은은하게 지나간다
 * - 아주 살짝 초록빛 (판유리 특유의 색)
 * 굴절(transmission)은 장면을 한 번 더 그려야 해서 쓰지 않는다.
 */

const mats: THREE.MeshPhysicalMaterial[] = [];
let env: THREE.Texture | null = null;
let streak: THREE.CanvasTexture | null = null;

/** 사선 반사 줄무늬 (투명도 지도: 밝을수록 덜 투명) */
function streakTexture(): THREE.CanvasTexture | null {
  if (streak) return streak;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(34,34,34)';
  g.fillRect(0, 0, 256, 256);
  g.save();
  g.translate(128, 128);
  g.rotate(-0.6);
  // 굵은 줄 하나 + 가는 줄 둘, 가장자리는 부드럽게 흐려진다
  for (const [x, w, a] of [[-60, 46, 0.42], [8, 14, 0.3], [40, 7, 0.24]] as const) {
    const gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - w, -200, w * 2, 400);
  }
  g.restore();
  // 테두리 쪽은 조금 더 진하게 (유리 단면이 두꺼워 보이게)
  const edge = g.createRadialGradient(128, 128, 90, 128, 128, 190);
  edge.addColorStop(0, 'rgba(255,255,255,0)');
  edge.addColorStop(1, 'rgba(255,255,255,0.12)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 256);
  streak = new THREE.CanvasTexture(c);
  return streak;
}

export function glassMaterial(o: { tint?: number; opacity?: number } = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    // 유리 자체는 거의 빛을 내지 않고(어두운 색) 비친 모습(반사)으로만 보이게
    color: o.tint ?? 0x2a3c3a,
    metalness: 0,
    roughness: 0.02,
    ior: 1.52,
    specularIntensity: 1,
    clearcoat: 0.4,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: o.opacity ?? 1,
    alphaMap: streakTexture(),
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // 툰 재질로 바꾸지 않는다 (투명도·반사가 사라진다)
  m.userData.glass = true;
  if (env) m.envMap = env;
  mats.push(m);
  return m;
}

/** 유리 단면 (판 가장자리에 보이는 초록빛 띠) */
export function glassEdgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x7fb3a3, roughness: 0.1, transparent: true, opacity: 0.55 });
}

/** 반사에 쓸 방 모습을 한 번 만들어 모든 유리에 붙인다 (렌더러가 생긴 뒤 한 번) */
export function initGlassEnv(renderer: THREE.WebGLRenderer) {
  if (env) return;
  const pm = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  env = pm.fromScene(room, 0.04).texture;
  pm.dispose();
  room.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | undefined;
    mat?.dispose?.();
  });
  for (const m of mats) {
    m.envMap = env;
    m.needsUpdate = true;
  }
}
