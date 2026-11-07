import * as THREE from 'three';
import { SHOP_BUILDING_FLOORS, STAIR, STAIR_TOP, stairFloorOf, type StoreLayout } from '../city/store';
import { PET_SHOP_NAME } from '../data/pets';
import { glassMaterial } from './glassKit';
import { swingDoors, type DoorControl } from './signage';

/**
 * 펫샵 건물 계단실 한 층 (4 × 6 m). 남쪽 = 층계참, 북쪽 = 꺾어 올라가는 계단:
 * 동쪽 칸은 위층으로 올라가는 계단 (꼭대기 층은 옥상 문 앞 철문으로 막힘),
 * 서쪽 칸은 아래층으로 내려가는 계단 (1층은 계단 밑 창고).
 * 1층: 남쪽 유리문(거리) · 서쪽 벽 층별 안내판 · 우편함 / 위층: 동쪽 벽에 그 층 가게 문 · 큰 층 번호.
 */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const H = 3;
/** 내려가는 계단 아래 깊이 (아래층 바닥) */
const DEEP = STAIR.rise + 0.1;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 층별 안내판 (1층) */
function directoryTex() {
  return canvasTex(320, 400, (g) => {
    g.fillStyle = '#23262b';
    g.fillRect(0, 0, 320, 400);
    g.fillStyle = '#f2f2ee';
    g.font = `900 34px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('층별 안내', 160, 52);
    const rows: [string, string, string][] = [];
    for (let f = STAIR_TOP; f >= 2; f--) {
      const shop = SHOP_BUILDING_FLOORS[f];
      rows.push([`${f}F`, shop ?? '임대 문의', shop ? '#ff8ae6' : '#9aa0a8']);
    }
    rows.push(['1F', PET_SHOP_NAME, '#6fe0c4']);
    rows.forEach(([fl, name, col], i) => {
      const y = 110 + i * 90;
      g.fillStyle = '#3a3e45';
      g.fillRect(16, y - 34, 288, 70);
      g.fillStyle = '#ffd24a';
      g.font = `900 32px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(fl, 32, y + 12);
      g.fillStyle = col;
      g.font = `800 28px ${FONT}`;
      g.fillText(name, 100, y + 12);
    });
  });
}

/** 큰 층 번호 (벽에 칠한 글씨) */
function floorTex(f: number) {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#3d4249';
    g.font = `900 150px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${f}F`, 128, 120);
    g.font = `700 34px ${FONT}`;
    g.fillText(f >= STAIR_TOP ? '↓' : f <= 1 ? '↑' : '↑ ↓', 128, 220);
  });
}

/** 가게 문 위 간판 / 빈 층 안내문 */
function doorSignTex(shop: string | null) {
  return canvasTex(512, 128, (g) => {
    if (shop) {
      g.fillStyle = '#16061f';
      g.fillRect(0, 0, 512, 128);
      g.shadowColor = '#ff4fd8';
      g.shadowBlur = 18;
      g.fillStyle = '#ffe9ff';
      g.font = `900 64px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(shop, 256, 54);
      g.shadowBlur = 0;
      g.fillStyle = '#9ff1ff';
      g.font = `700 24px ${FONT}`;
      g.fillText('OPEN · 어서 오세요', 256, 104);
    } else {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#c62828';
      g.font = `900 60px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('임대 문의', 256, 52);
      g.fillStyle = '#333';
      g.font = `700 24px ${FONT}`;
      g.fillText('010-1234-5678 · 즉시 입주', 256, 104);
    }
  });
}

export function buildStairwellScene(L: StoreLayout): { group: THREE.Group; door: DoorControl } {
  const g = new THREE.Group();
  const f = stairFloorOf(L.sign);
  const { x0, x1, z0, z1 } = L.room;
  const W = x1 - x0;
  const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };

  // 조명
  g.add(new THREE.HemisphereLight(0xfffaf0, 0x4a4238, 0.75));
  const lamp = new THREE.PointLight(0xfff2dc, 6, 9, 1.4);
  lamp.position.set(0, H - 0.3, 1.6);
  g.add(lamp);
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(2, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  g.add(key);

  // 재질: 테라조 바닥 · 회벽 · 계단 (석재 디딤판 + 미끄럼 방지 줄)
  const terrazzo = canvasTex(256, 256, (c) => {
    c.fillStyle = '#c9c5bc';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = ['#a8a39a', '#e4e0d8', '#8f8a82', '#d8cfc0'][i % 4];
      c.fillRect((i * 97) % 256, (i * 53) % 256, 2 + (i % 3), 2 + (i % 2));
    }
  });
  terrazzo.wrapS = terrazzo.wrapT = THREE.RepeatWrapping;
  terrazzo.repeat.set(2, 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: terrazzo, roughness: 0.5 });
  const wall = std(0xe4e1da, 0.95);
  const stepMat = std(0xbdb8ae, 0.6);
  const nosing = std(0x3a3d42, 0.5, 0.3);
  const rail = std(0x2b2e33, 0.35, 0.7);

  // 바닥: 층계참 (남쪽) + 동쪽 칸 아래(꼭대기 층) / 서쪽 칸 아래(1층 창고 바닥)
  const floorPlane = (w: number, d: number, x: number, z: number, y = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
  };
  floorPlane(W, z1 - STAIR.start, 0, (STAIR.start + z1) / 2);
  const flightD = STAIR.start - z0;
  const flightZ = (STAIR.start + z0) / 2;
  const halfW = x1 - STAIR.mid;

  // 동쪽: 올라가는 계단 (꼭대기 층엔 없다 — 바닥 + 옥상 철문)
  const steps = 10;
  const run = flightD / steps;
  const rise = STAIR.rise / steps;
  const ex = (STAIR.mid + x1) / 2;
  if (f < STAIR_TOP) {
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      const zc = STAIR.start - run * (i + 0.5);
      box(halfW, top, run, stepMat, ex, top / 2, zc);
      box(halfW, 0.02, 0.05, nosing, ex, top + 0.005, zc + run / 2 - 0.03, false);
    }
    // 바깥 벽 손잡이 (계단 기울기 따라)
    const len = Math.hypot(flightD, STAIR.rise);
    const hr = box(0.05, 0.05, len, rail, x1 - 0.12, 0.9 + STAIR.rise / 2, flightZ, false);
    hr.rotation.x = Math.atan2(STAIR.rise, flightD);
  } else {
    floorPlane(halfW, flightD, ex, flightZ);
    // 옥상 가는 길: 철문 + '관계자 외 출입 금지'
    box(halfW, 1.1, 0.05, rail, ex, 0.55, STAIR.start - 0.3, false);
    for (let k = 0; k < 6; k++) box(0.03, 1.1, 0.03, rail, STAIR.mid + 0.15 + k * ((halfW - 0.3) / 5), 0.55, STAIR.start - 0.3, false);
    const notice = canvasTex(256, 96, (c) => {
      c.fillStyle = '#ffd24a';
      c.fillRect(0, 0, 256, 96);
      c.fillStyle = '#222';
      c.font = `900 30px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('옥상 출입 금지', 128, 48);
    });
    plane(0.6, 0.22, new THREE.MeshBasicMaterial({ map: notice }), ex, 0.8, STAIR.start - 0.27);
  }

  // 서쪽: 내려가는 계단 (1층엔 없다 — 계단 밑 창고 문)
  const wx = (x0 - STAIR.mid) / 2;
  if (f > 1) {
    for (let i = 0; i < steps; i++) {
      const top = -rise * (i + 1);
      const zc = STAIR.start - run * (i + 0.5);
      box(halfW, DEEP + top, run, stepMat, wx, (top - DEEP) / 2, zc);
      box(halfW, 0.02, 0.05, nosing, wx, top + 0.005, zc + run / 2 - 0.03, false);
    }
    // 내려가는 계단 입구 난간 (층계참 쪽은 열려 있다)
    const len = Math.hypot(flightD, STAIR.rise);
    const hr = box(0.05, 0.05, len, rail, x0 + 0.12, 0.9 - STAIR.rise / 2, flightZ, false);
    hr.rotation.x = -Math.atan2(STAIR.rise, flightD);
  } else {
    floorPlane(halfW, flightD, wx, flightZ);
    box(halfW - 0.1, H - 0.4, 0.06, std(0x8a8f96, 0.5, 0.4), wx, (H - 0.4) / 2, STAIR.start - 0.03);
    const tag = canvasTex(128, 64, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#333';
      c.font = `800 30px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('창고', 64, 34);
    });
    plane(0.3, 0.15, new THREE.MeshBasicMaterial({ map: tag }), wx, 1.6, STAIR.start + 0.01);
  }

  // 벽: 북·동·서 (내려가는 계단 아래까지), 가운데 칸막이, 남쪽은 허리 높이 (1층은 유리문)
  const wallH = H + DEEP;
  box(W, wallH, 0.15, wall, 0, H - wallH / 2, z0);
  box(0.15, wallH, z1 - z0, wall, x0, H - wallH / 2, 0);
  box(0.15, wallH, z1 - z0, wall, x1, H - wallH / 2, 0);
  box(STAIR.mid * 2, wallH, flightD, wall, 0, H - wallH / 2, flightZ);
  // 칸막이 끝 손잡이 기둥
  box(0.08, 1.0, 0.08, rail, 0, 0.5, STAIR.start);
  const door =
    f <= 1
      ? (() => {
          const doorW = 1.2;
          box((W - doorW) / 2, 1.0, 0.15, wall, (x0 - doorW / 2) / 2, 0.5, z1);
          box((W - doorW) / 2, 1.0, 0.15, wall, (x1 + doorW / 2) / 2, 0.5, z1);
          const frame = std(0x555a60, 0.3, 0.7);
          for (const s of [-1, 1]) box(0.08, 2.3, 0.12, frame, (s * (doorW + 0.08)) / 2, 1.15, z1);
          box(doorW + 0.16, 0.08, 0.12, frame, 0, 2.3, z1);
          return swingDoors(g, 0, z1 + 0.04, doorW, 2.25, frame, glassMaterial(), std(0xd3d6db, 0.2, 1));
        })()
      : (() => {
          box(W, 1.0, 0.15, wall, 0, 0.5, z1);
          return { setOpen() {} } as DoorControl;
        })();

  // 큰 층 번호 (서쪽 벽, 층계참 위)
  plane(0.9, 0.9, new THREE.MeshBasicMaterial({ map: floorTex(f), transparent: true }), x0 + 0.085, 2.05, 1.0, Math.PI / 2);

  if (f <= 1) {
    // 층별 안내판 + 우편함
    plane(0.64, 0.8, new THREE.MeshBasicMaterial({ map: directoryTex() }), x0 + 0.085, 1.45, STAIR.doorZ + 0.5, Math.PI / 2);
    for (let k = 0; k < 3; k++) box(0.22, 0.28, 0.32, std(0x9aa3ad, 0.4, 0.6), x0 + 0.2, 0.9 + k * 0.3, 2.55);
  } else {
    // 그 층 가게 문 (동쪽 벽)
    const shop = SHOP_BUILDING_FLOORS[f] ?? null;
    const dz = STAIR.doorZ;
    const dw = 1.0;
    const frameMat = shop ? std(0xff4fd8, 0.4, 0, { emissive: 0xff3fc8, emissiveIntensity: 0.9 }) : std(0x6b6f76, 0.4, 0.6);
    for (const s of [-1, 1]) box(0.08, 2.3, 0.08, frameMat, x1 - 0.1, 1.15, dz + (s * (dw + 0.08)) / 2, false);
    box(0.08, 0.08, dw + 0.16, frameMat, x1 - 0.1, 2.3, dz, false);
    const leaf = shop
      ? new THREE.MeshStandardMaterial({ color: 0x2a0f3a, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 })
      : std(0x7d838b, 0.45, 0.6);
    box(0.05, 2.25, dw, leaf, x1 - 0.1, 1.125, dz);
    box(0.06, 0.04, 0.3, std(0xd3d6db, 0.2, 1), x1 - 0.16, 1.05, dz - 0.3, false);
    plane(1.2, 0.3, new THREE.MeshBasicMaterial({ map: doorSignTex(shop) }), x1 - 0.085, 2.62, dz, -Math.PI / 2);
    if (shop) {
      // 문 안쪽에서 새어 나오는 보라 불빛
      const l = new THREE.PointLight(0xff5fd2, 1.6, 3, 1.6);
      l.position.set(x1 - 0.5, 1.4, dz);
      g.add(l);
    }
  }
  return { group: g, door };
}
