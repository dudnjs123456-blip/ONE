import * as THREE from 'three';
import { FIELD_HALF } from '../core/field';
import { VILLAGE, VILLAGE_HOUSES, VILLAGE_PORTAL, type VillageHouse } from '../data/village';

/** 간판 글자 텍스처 */
function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b1d14';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#c9a46a';
  g.lineWidth = 10;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#ffe7b0';
  g.font = '800 64px "Pretendard", "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOOR_DIR: Record<VillageHouse['door'], [number, number]> = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };

function house(h: VillageHouse, wallMat: THREE.Material) {
  const g = new THREE.Group();
  const H = 2.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(h.w, H, h.d), wallMat);
  body.position.y = H / 2;
  body.castShadow = body.receiveShadow = true;
  // 사각뿔 지붕 (네 귀퉁이가 벽 모서리에 오게 45° 돌린다)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.hypot(h.w, h.d) / 2 + 0.35, 1.5, 4),
    new THREE.MeshStandardMaterial({ color: h.roof, roughness: 0.8 }),
  );
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(h.w / Math.max(h.w, h.d), 1, h.d / Math.max(h.w, h.d));
  roof.position.y = H + 0.75;
  roof.castShadow = true;
  g.add(body, roof);

  // 문과 창 (문 쪽 벽에 붙인다), 문 옆 따뜻한 창 불빛
  const [dx, dz] = DOOR_DIR[h.door];
  const half = dx !== 0 ? h.w / 2 : h.d / 2;
  const yaw = Math.atan2(dx, dz);
  const face = new THREE.Group();
  face.position.set(dx * (half + 0.01), 0, dz * (half + 0.01));
  face.rotation.y = yaw;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.9 }));
  door.position.y = 0.8;
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffb050, emissiveIntensity: 1.4 });
  const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), winMat);
  w1.position.set(-1.0, 1.5, 0);
  const w2 = w1.clone();
  w2.position.x = 1.0;
  face.add(door, w1, w2);
  if (h.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: signTexture(h.sign) }));
    sign.position.set(0, 2.05, 0.02);
    face.add(sign);
  }
  g.add(face);
  g.position.set(h.x, 0, h.z);
  return g;
}

function well(h: VillageHouse, stone: THREE.Material) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(h.w / 2, h.w / 2 + 0.05, 0.7, 16, 1, true), stone);
  ring.position.y = 0.35;
  ring.castShadow = true;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(h.w / 2 - 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a6bff, emissive: 0x4a5cff, emissiveIntensity: 0.8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.45;
  const postGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d2b });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, wood);
    p.position.set((sx * h.w) / 2, 0.75, 0);
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.2, 0.1, 0.1), wood);
  beam.position.y = 1.5;
  g.add(ring, water, beam);
  g.position.set(h.x, 0, h.z);
  return g;
}

/**
 * 경계 마을을 그린다: 흙바닥 광장, 돌담(북문만 열림), 집·여관·촌장 집, 우물, 등불, 접속 포탈.
 * 돌려주는 portal 은 렌더러가 매 프레임 돌린다.
 */
export function buildVillage(s: THREE.Scene): { portal: THREE.Group } {
  const { x0, x1, z0, z1, gate } = VILLAGE;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0.006, cz);
  ground.receiveShadow = true;
  // 포탈에서 북문까지 이어진 돌길
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(gate * 2 - 0.6, VILLAGE_PORTAL.z - FIELD_HALF + 1),
    new THREE.MeshStandardMaterial({ color: 0x8a8098, roughness: 0.9 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.012, (VILLAGE_PORTAL.z + FIELD_HALF - 1) / 2);
  road.receiveShadow = true;
  // 가운데 광장
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshStandardMaterial({ color: 0x8a8098, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.014, 30.6);
  plaza.receiveShadow = true;
  s.add(ground, road, plaza);

  // 돌담 (북쪽은 문만 열려 있다) + 북문과 사냥터 사이 짧은 통로 벽
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d6880, roughness: 1 });
  const wallH = 1.1;
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.4), stone);
    m.position.set((ax + bx) / 2, wallH / 2, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    m.castShadow = m.receiveShadow = true;
    s.add(m);
  };
  wall(x0, z1, x1, z1);
  wall(x0, z0, x0, z1);
  wall(x1, z0, x1, z1);
  wall(x0, z0, -gate, z0);
  wall(gate, z0, x1, z0);
  wall(-gate, FIELD_HALF, -gate, z0);
  wall(gate, FIELD_HALF, gate, z0);

  // 북문: 기둥 둘 + 들보 + 현판
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d2b, roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.2, 0.45), wood);
    post.position.set(sx * (gate + 0.2), 1.6, z0);
    post.castShadow = true;
    s.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(gate * 2 + 1.2, 0.35, 0.5), wood);
  beam.position.set(0, 3.2, z0);
  beam.castShadow = true;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(VILLAGE.name), side: THREE.DoubleSide }));
  plate.position.set(0, 2.75, z0 - 0.27);
  plate.rotation.y = Math.PI;
  const plateIn = plate.clone();
  plateIn.position.z = z0 + 0.27;
  plateIn.rotation.y = 0;
  s.add(beam, plate, plateIn);

  // 집들
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9b9a0, roughness: 0.95 });
  for (const h of VILLAGE_HOUSES) s.add(h.id === 'well' ? well(h, stone) : house(h, wallMat));

  // 등불 (기둥 + 빛나는 등, 몇 개만 실제 빛)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffa040, emissiveIntensity: 2.2 });
  const lamps: [number, number, boolean][] = [
    [-2.4, 25.6, true], [2.4, 25.6, false], [-3.4, 33.6, false], [3.4, 33.6, true],
    [-6.6, 28, false], [6.6, 28, false], [-6.6, 35, false], [6.6, 35, false],
  ];
  for (const [x, z, light] of lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2, 6), wood);
    pole.position.set(x, 1, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), lampMat);
    lamp.position.set(x, 2.05, z);
    s.add(pole, lamp);
    if (light) {
      const l = new THREE.PointLight(0xffb060, 5, 9, 2);
      l.position.set(x, 2.1, z);
      s.add(l);
    }
  }

  // 접속 포탈: 서울 집 컴퓨터와 이어진 곳 (로그아웃하면 여기서 컴퓨터 앞으로)
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.3, 0.12, 16, 64),
    new THREE.MeshStandardMaterial({ color: 0x7ef3ff, emissive: 0x38d8ff, emissiveIntensity: 2.2, roughness: 0.3 }),
  );
  ring.position.y = 1.6;
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 48),
    new THREE.MeshBasicMaterial({ color: 0x9a7bff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  veil.position.y = 1.6;
  portal.add(ring, veil);
  portal.position.set(VILLAGE_PORTAL.x, 0, VILLAGE_PORTAL.z);
  const base = new THREE.Mesh(new THREE.CircleGeometry(2, 40), new THREE.MeshStandardMaterial({ color: 0x6d6a8c, roughness: 0.8 }));
  base.rotation.x = -Math.PI / 2;
  base.position.set(VILLAGE_PORTAL.x, 0.018, VILLAGE_PORTAL.z);
  const glow = new THREE.PointLight(0x6fdcff, 6, 9, 2);
  glow.position.set(VILLAGE_PORTAL.x, 1.6, VILLAGE_PORTAL.z - 0.4);
  s.add(base, portal, glow);
  return { portal };
}
