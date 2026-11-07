import * as THREE from 'three';
import type { StockPet, StoreLayout } from '../city/store';
import { glassMaterial } from './glassKit';
import { buildClothesInterior } from './clothesInterior';
import { buildFishingInterior } from './fishingInterior';
import { buildKaraokeInterior } from './karaokeInterior';
import { buildStairwellScene } from './stairwellScene';
import type { FishingState } from '../data/fishing';
import { swingDoors, type DoorControl } from './signage';
import { SHOPS } from '../data/shops';
import { PET_BY_ID, PET_GOOD_BY_ID, coatOf } from '../data/pets';

/**
 * 가게 안 장면 (먹거리 가게 · 펫샵). 남쪽(카메라 쪽) 벽은 허리 높이까지만 세워 안이 잘 보이게 한다.
 * 진열대마다 메뉴 그림(이모지)과 가격표가 떠 있어서 보고 고를 수 있다.
 * 만든 것은 모두 반환하는 group 아래에 있다 (가게가 바뀌면 통째로 버린다).
 */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const H = 3;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 진열 물건 그림 + 이름 · 가격표 (카메라를 늘 바라보는 판) */
function itemSprite(icon: string, name: string, price: number) {
  const tex = canvasTex(256, 300, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `150px ${EMOJI}`;
    g.fillText(icon, 128, 100);
    g.fillStyle = 'rgba(20,20,24,0.82)';
    const r = 18;
    g.beginPath();
    g.roundRect(14, 196, 228, 96, r);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `800 34px ${FONT}`;
    g.fillText(name.length > 8 ? name.slice(0, 8) + '…' : name, 128, 222);
    g.fillStyle = '#ffd25a';
    g.font = `900 36px ${FONT}`;
    g.fillText(`${price.toLocaleString()}G`, 128, 264);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.55, 0.64, 1);
  return sp;
}

export interface StoreScene {
  group: THREE.Group;
  /** 출입문 (안쪽) */
  door: DoorControl;
  /** 펫샵: 용품 id → 진열된 물건들 (남은 개수만큼 보인다) · 입고 id → 분양 이름표 */
  goods: Map<string, THREE.Object3D[]>;
  cards: Map<string, THREE.Object3D>;
  /** 움직이는 것들 (낚시마트 수조 물고기 · 명예의 전당 기록) */
  tick?: (t: number, dex?: FishingState['dex']) => void;
  /** 코인노래방 방 문 (방 번호 → 문). 빌린 방만 열린다 */
  booths?: Map<number, DoorControl>;
}

export function buildStoreScene(L: StoreLayout, stock: StockPet[] = []): StoreScene {
  // 상가 계단실은 가게와 전혀 다른 장면 (계단 · 층계참)
  if (L.kind === 'stairs') {
    const s = buildStairwellScene(L);
    return { group: s.group, door: s.door, goods: new Map(), cards: new Map() };
  }
  const g = new THREE.Group();
  let pet: { goods: Map<string, THREE.Object3D[]>; cards: Map<string, THREE.Object3D> } | null = null;
  let tick: StoreScene['tick'];
  let booths: StoreScene['booths'];
  const { x0, x1, z0, z1 } = L.room;
  const W = x1 - x0;
  const D = z1 - z0;
  const th = L.theme;
  const std = (color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 18), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // 조명 (노래방은 어둡게 — 방마다 색 조명을 따로 단다)
  const dim = L.kind === 'karaoke';
  g.add(new THREE.HemisphereLight(dim ? 0xd9c2ff : 0xfffaf0, 0x4a4238, dim ? 0.45 : 0.8));
  for (const [lx, lz] of dim ? [[0, 2.2]] : [[-2, -1], [2, -1], [-2, 1.6], [2, 1.6]]) {
    const l = new THREE.PointLight(dim ? 0xffd9f4 : 0xfff2dc, dim ? 3 : 5, 7, 1.6);
    l.position.set(lx, H - 0.25, lz);
    g.add(l);
    if (!dim) box(0.9, 0.04, 0.3, new THREE.MeshBasicMaterial({ color: 0xfff6e6 }), lx, H - 0.02, lz, false);
  }
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(2, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  g.add(key);

  // 바닥 (타일)
  const floorTex = canvasTex(256, 256, (c) => {
    const base = new THREE.Color(th.floor);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const k = (i + j) % 2 ? 1 : 0.93;
        c.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
        c.fillRect(i * 64, j * 64, 64, 64);
        c.strokeStyle = 'rgba(0,0,0,0.1)';
        c.strokeRect(i * 64, j * 64, 64, 64);
      }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // 벽: 북·동·서는 천장까지, 남쪽은 허리 높이 + 가운데 유리문
  const wall = std(th.wall, 0.95);
  const base = std(th.accent, 0.6);
  box(W, H, 0.15, wall, 0, H / 2, z0);
  box(0.15, H, D, wall, x0, H / 2, 0);
  box(0.15, H, D, wall, x1, H / 2, 0);
  const doorW = 1.4;
  box((W - doorW) / 2, 1.0, 0.15, wall, (x0 - doorW / 2) / 2, 0.5, z1);
  box((W - doorW) / 2, 1.0, 0.15, wall, (x1 + doorW / 2) / 2, 0.5, z1);
  const doorFrame = std(0x555a60, 0.3, 0.7);
  for (const s of [-1, 1]) box(0.08, 2.3, 0.12, doorFrame, (s * (doorW + 0.08)) / 2, 1.15, z1);
  box(doorW + 0.16, 0.08, 0.12, doorFrame, 0, 2.3, z1);
  const door = swingDoors(g, 0, z1 + 0.04, doorW, 2.25, doorFrame, glassMaterial(), std(0xd3d6db, 0.2, 1));
  box(W, 0.12, 0.04, base, 0, 0.06, z0 + 0.09, false);
  box(0.04, 0.12, D, base, x0 + 0.09, 0.06, 0, false);
  box(0.04, 0.12, D, base, x1 - 0.09, 0.06, 0, false);
  // 문 앞 매트
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), std(0x3d3330, 1));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.01, z1 - 0.5);
  g.add(mat);

  // 북쪽 벽 간판
  const signTex = canvasTex(1024, 200, (c) => {
    c.fillStyle = hex(th.accent);
    c.fillRect(0, 0, 1024, 200);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 110px ${FONT}`;
    c.fillText(L.sign, 512, 104);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.62), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(-1.2, H - 0.55, z0 + 0.09);
  // 옷가게는 구역 간판을 따로 단다
  if (L.kind !== 'clothes' && L.kind !== 'karaoke') g.add(sign);

  // 계산대 + 뒤 선반 (병·상자)
  const ctr = L.furniture.find((f) => f.id === 'counter')!.rect;
  const cw = ctr.x1 - ctr.x0;
  const cx = (ctr.x0 + ctr.x1) / 2;
  const cz = (ctr.z0 + ctr.z1) / 2;
  box(cw, 1.0, ctr.z1 - ctr.z0, std(th.accent, 0.5), cx, 0.5, cz);
  box(cw + 0.08, 0.05, ctr.z1 - ctr.z0 + 0.1, std(0xf3f0ea, 0.4), cx, 1.02, cz);
  box(0.36, 0.26, 0.24, std(0x222428, 0.4, 0.3), cx + 0.6, 1.17, cz);
  const bb = L.furniture.find((f) => f.id === 'backbar')!.rect;
  box(bb.x1 - bb.x0, 1.9, bb.z1 - bb.z0, std(0x6b4f3a, 0.7), (bb.x0 + bb.x1) / 2, 0.95, (bb.z0 + bb.z1) / 2);
  const goodsCols = [0xe24b3b, 0x3a7bd5, 0xf2c230, 0x2fae93, 0xffffff, 0x8b5a2b];
  const perRow = Math.max(1, Math.floor((bb.x1 - bb.x0 - 0.1) / 0.42));
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < perRow; k++) {
      const c = goodsCols[(k * 3 + r) % goodsCols.length];
      box(0.18, 0.28, 0.14, std(c, 0.6), bb.x0 + 0.3 + k * 0.42, 1.25 + r * 0.45, bb.z1 + 0.02, false);
    }

  const shop = SHOPS[L.sign];
  const itemOf = (id: string) => {
    if (L.kind === 'pet') {
      const gd = PET_GOOD_BY_ID[id];
      return gd ? { icon: gd.icon, name: gd.name, price: gd.price } : null;
    }
    const m = shop?.menu.find((x) => x.id === id);
    return m ? { icon: m.icon, name: m.name, price: m.price } : null;
  };

  if (L.kind === 'mart') {
    // 선반 두 줄 (상품이 빼곡) + 서쪽 벽 음료 냉장고
    for (const id of ['shelfA', 'shelfB']) {
      const r = L.furniture.find((f) => f.id === id)!.rect;
      const sx = (r.x0 + r.x1) / 2;
      const sz = (r.z0 + r.z1) / 2;
      box(r.x1 - r.x0, 1.35, r.z1 - r.z0, std(0xe9ecef, 0.5), sx, 0.675, sz);
      for (let lvl = 0; lvl < 3; lvl++)
        for (const side of [-1, 1])
          for (let k = 0; k < 11; k++) {
            const c = goodsCols[(k + lvl * 2 + (side > 0 ? 1 : 0)) % goodsCols.length];
            box(0.18, 0.22, 0.08, std(c, 0.6), r.x0 + 0.2 + k * 0.24, 0.35 + lvl * 0.4, sz + side * 0.27, false);
          }
    }
    const fr = L.furniture.find((f) => f.id === 'fridge')!.rect;
    box(fr.x1 - fr.x0, 2.1, fr.z1 - fr.z0, std(0xdfe3e7, 0.4, 0.3), (fr.x0 + fr.x1) / 2, 1.05, (fr.z0 + fr.z1) / 2);
    const glow = new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x7fbfff, emissiveIntensity: 0.6, roughness: 0.1 });
    box(0.02, 1.8, fr.z1 - fr.z0 - 0.2, glow, fr.x1 + 0.01, 1.05, (fr.z0 + fr.z1) / 2, false);
  } else if (L.kind === 'cafe' || L.kind === 'diner') {
    const cafe = L.kind === 'cafe';
    const wood = std(cafe ? 0x8a5a3a : 0xb98a5a, 0.6);
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff2fa, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false });
    for (const d of L.displays) {
      if (cafe) {
        // 쇼케이스: 나무 받침 + 유리 상자 + 안쪽 조명
        box(0.9, 0.85, 0.7, wood, d.x, 0.425, d.z);
        box(0.86, 0.45, 0.66, glass, d.x, 0.85 + 0.225, d.z, false);
        box(0.8, 0.03, 0.6, std(0xffffff, 0.3, 0, { emissive: 0xfff2d8, emissiveIntensity: 0.4 }), d.x, 0.87, d.z, false);
      } else {
        // 식탁 + 의자 둘 + 접시
        box(0.9, 0.05, 0.7, wood, d.x, 0.74, d.z);
        for (const [lx, lz] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) box(0.05, 0.72, 0.05, wood, d.x + lx, 0.36, d.z + lz);
        for (const s of [-1, 1]) {
          cyl(0.17, 0.17, 0.04, std(0xc0392b, 0.6), d.x + s * 0.62, 0.46, d.z);
          cyl(0.03, 0.03, 0.44, std(0x555555, 0.4, 0.6), d.x + s * 0.62, 0.22, d.z);
        }
        cyl(0.2, 0.16, 0.03, std(0xffffff, 0.3), d.x, 0.78, d.z);
      }
    }
    // 북쪽 벽 메뉴판
    if (shop) {
      const menuTex = canvasTex(512, 384, (c) => {
        c.fillStyle = '#2b2622';
        c.fillRect(0, 0, 512, 384);
        c.fillStyle = '#ffe9b0';
        c.font = `900 40px ${FONT}`;
        c.textBaseline = 'middle';
        c.fillText('MENU', 24, 36);
        shop.menu.slice(0, 6).forEach((m, i) => {
          c.fillStyle = '#ffffff';
          c.font = `700 30px ${FONT}`;
          c.textAlign = 'left';
          c.fillText(`${m.name}`, 24, 92 + i * 50);
          c.textAlign = 'right';
          c.fillStyle = '#ffd25a';
          c.fillText(`${m.price}G`, 488, 92 + i * 50);
        });
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: menuTex }));
      board.position.set(2.2, 2.25, z0 + 0.09);
      g.add(board);
    }
  } else if (L.kind === 'pet') {
    pet = buildPetInterior(g, L, stock, box, std);
  } else if (L.kind === 'clothes') {
    buildClothesInterior(g, L);
  } else if (L.kind === 'fishing') {
    tick = buildFishingInterior(g, L).tick;
  } else if (L.kind === 'karaoke') {
    const k = buildKaraokeInterior(g, L);
    tick = (t) => k.tick(t);
    booths = k.doors;
  }

  // 진열 물건 그림 · 가격표
  for (const d of L.kind === 'pet' || L.kind === 'clothes' || L.kind === 'fishing' || L.kind === 'karaoke' ? [] : L.displays) {
    const it = itemOf(d.item);
    if (!it) continue;
    const sp = itemSprite(it.icon, it.name, it.price);
    const off = L.kind === 'pet' ? { x: -0.5, z: 0 } : L.kind === 'mart' ? { x: 0, z: d.face * 0.15 } : { x: 0, z: 0 };
    sp.position.set(d.x + off.x, d.y + 0.38, d.z + off.z);
    g.add(sp);
  }
  return { group: g, door, goods: pet?.goods ?? new Map(), cards: pet?.cards ?? new Map(), tick, booths };
}
type BoxFn = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow?: boolean) => THREE.Mesh;

/** 상품 이름표가 붙은 포장 (앞면 = +z) */
function labelTex(top: string, main: string, bg: string, fg: string, w = 256, h = 360) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.ellipse(w / 2, h * 0.52, w * 0.36, h * 0.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 ${Math.round(w * 0.11)}px ${FONT}`;
    c.fillText(top, w / 2, h * 0.14);
    c.font = `130px ${EMOJI}`;
    c.font = `${Math.round(h * 0.22)}px ${EMOJI}`;
    c.fillText(main, w / 2, h * 0.53);
    c.fillStyle = '#ffffff';
    c.font = `900 ${Math.round(w * 0.12)}px ${FONT}`;
    c.fillText('멍냥', w / 2, h * 0.86);
  });
}

/** 진열 상품 한 개 모델 (바닥 = y 0, 앞 = +z). 같은 종류는 재질·그림을 같이 쓴다 */
function productFactory() {
  const cache = new Map<string, THREE.Material>();
  const m = (key: string, make: () => THREE.Material) => {
    let x = cache.get(key);
    if (!x) cache.set(key, (x = make()));
    return x;
  };
  const geo = new Map<string, THREE.BufferGeometry>();
  const gm = (key: string, make: () => THREE.BufferGeometry) => {
    let x = geo.get(key);
    if (!x) geo.set(key, (x = make()));
    return x;
  };
  return (item: string, k: number): THREE.Object3D => {
    const o = new THREE.Group();
    const add = (g: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      o.add(mesh);
      return mesh;
    };
    if (item === 'pet-food') {
      // 큰 사료 포대 (색 두 가지 번갈아)
      const red = k % 2 === 0;
      const side = m(`food${red}`, () => new THREE.MeshStandardMaterial({ color: red ? 0xd8432f : 0x2f6fc4, roughness: 0.6 }));
      const front = m(`foodL${red}`, () => new THREE.MeshStandardMaterial({ map: labelTex(red ? '연어 · 그레인프리' : '양고기 · 소화 잘되는', '🐟', red ? '#d8432f' : '#2f6fc4', '#ffffff'), roughness: 0.6 }));
      const bag = add(gm('foodBag', () => new THREE.BoxGeometry(0.32, 0.5, 0.15)), [side, side, side, side, front, side], 0, 0.25, 0);
      bag.rotation.x = -0.04;
      add(gm('foodTop', () => new THREE.BoxGeometry(0.32, 0.04, 0.04)), side, 0, 0.51, 0);
    } else if (item === 'pet-treat') {
      const c = [0xf29a3a, 0x8c5fd6, 0x3fae5a][k % 3];
      const side = m(`treat${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      const front = m(`treatL${c}`, () => new THREE.MeshStandardMaterial({ map: labelTex('수제 간식', ['🦴', '🍗', '🥕'][k % 3], hex(c), '#ffffff', 192, 256), roughness: 0.5 }));
      add(gm('pouch', () => new THREE.BoxGeometry(0.15, 0.22, 0.05)), [side, side, side, side, front, side], 0, 0.11, 0);
    } else if (item === 'pet-toy') {
      // 공 / 뼈다귀 / 삑삑이 오리 번갈아
      const kind = k % 3;
      const c = [0xff5a5a, 0x5ab4ff, 0xffd23a][kind];
      const mat = m(`toy${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
      if (kind === 0) add(gm('ball', () => new THREE.SphereGeometry(0.06, 14, 10)), mat, 0, 0.06, 0);
      else if (kind === 1) {
        const bar = add(gm('boneBar', () => new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8)), mat, 0, 0.03, 0);
        bar.rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) for (const dz of [-0.02, 0.02]) add(gm('boneEnd', () => new THREE.SphereGeometry(0.025, 8, 6)), mat, s * 0.075, 0.03, dz);
      } else {
        add(gm('duckBody', () => new THREE.SphereGeometry(0.05, 12, 8)), mat, 0, 0.045, 0).scale.set(1, 0.8, 1.2);
        add(gm('duckHead', () => new THREE.SphereGeometry(0.03, 10, 8)), mat, 0, 0.1, 0.03);
        add(gm('beak', () => new THREE.ConeGeometry(0.012, 0.03, 6)), m('beak', () => new THREE.MeshStandardMaterial({ color: 0xff8a1a })), 0, 0.1, 0.065).rotation.x = Math.PI / 2;
      }
    } else if (item === 'pet-shampoo') {
      const c = [0x7fd3e8, 0xf6a6c8][k % 2];
      const mat = m(`sh${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
      const cap = m('cap', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      add(gm('bottle', () => new THREE.CylinderGeometry(0.038, 0.042, 0.18, 14)), mat, 0, 0.09, 0);
      add(gm('cap', () => new THREE.CylinderGeometry(0.02, 0.026, 0.05, 10)), cap, 0, 0.205, 0);
      add(gm('pump', () => new THREE.BoxGeometry(0.05, 0.012, 0.012)), cap, 0.015, 0.23, 0);
      const lab = m('shL', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
      add(gm('shLabel', () => new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 14, 1, true, -0.9, 1.8)), lab, 0, 0.09, 0);
    }
    return o;
  };
}

/** 가격표 (진열대 앞 노란 띠) */
function priceTag(text: string, price: number) {
  const tex = canvasTex(256, 96, (c) => {
    c.fillStyle = '#ffd84a';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#222';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `800 30px ${FONT}`;
    c.fillText(text, 12, 32);
    c.textAlign = 'right';
    c.fillStyle = '#d62a2a';
    c.font = `900 40px ${FONT}`;
    c.fillText(`${price}G`, 244, 66);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), new THREE.MeshBasicMaterial({ map: tex }));
}

/** 분양 이름표 (부스 유리 아래 구석) */
function petCard(name: string, coat: string | null, price: number, icon: string) {
  const tex = canvasTex(256, 160, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#2fae93';
    c.fillRect(0, 0, 256, 34);
    c.fillStyle = '#ffffff';
    c.font = `800 22px ${FONT}`;
    c.textBaseline = 'middle';
    c.fillText('분양 · 생후 2개월', 12, 18);
    c.fillStyle = '#222';
    c.font = `900 30px ${FONT}`;
    c.fillText(`${icon} ${name}`, 10, 66);
    c.font = `600 22px ${FONT}`;
    c.fillStyle = '#666';
    c.fillText(coat ? `${coat} · 예방접종 1차` : '예방접종 1차 완료', 12, 100);
    c.fillStyle = '#d62a2a';
    c.font = `900 30px ${FONT}`;
    c.fillText(`${price.toLocaleString()}G`, 12, 136);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshBasicMaterial({ map: tex }));
}

/** 진짜 펫샵: 분양 부스 · 소동물장 · 곤돌라 · 사료 벽 · 미용실 */
function buildPetInterior(g: THREE.Group, L: StoreLayout, stock: StockPet[], box: BoxFn, std: (c: number, r?: number, m?: number, e?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial) {
  const { x0, x1, z0 } = L.room;
  const goods = new Map<string, THREE.Object3D[]>();
  const cards = new Map<string, THREE.Object3D>();
  const white = std(0xfbfbf9, 0.35);
  const glass = new THREE.MeshStandardMaterial({ color: 0xe8f6fb, transparent: true, opacity: 0.16, roughness: 0.02, metalness: 0.1, depthWrite: false });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff3dc });
  const pastel = [0xcfeee3, 0xffe1d2, 0xd7e8ff, 0xeadcff];
  const byStock = new Map(stock.map((s) => [s.spot, s]));

  // 벽 위 띠 + 문구
  const band = canvasTex(1024, 96, (c) => {
    c.fillStyle = '#2fae93';
    c.fillRect(0, 0, 1024, 96);
    c.fillStyle = '#ffffff';
    c.font = `800 52px ${FONT}`;
    c.textBaseline = 'middle';
    c.fillText('🐾  새 가족을 기다리고 있어요  ·  건강한 아이들만 분양합니다  🐾', 20, 50);
  });
  const bandM = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.32), new THREE.MeshBasicMaterial({ map: band }));
  bandM.position.set(-2.6, 1.85, z0 + 0.09);
  g.add(bandM);

  // ── 유리 분양 부스 ──
  const booths = L.spots.filter((s) => s.kind === 'booth');
  if (booths.length) {
    const bw = booths[1] ? booths[1].x - booths[0].x : 1.08;
    const left = booths[0].x - bw / 2;
    const right = booths[booths.length - 1].x + bw / 2;
    const depth = booths[0].z - z0;
    const fy = booths[0].y;
    const top = fy + 0.82;
    box(right - left + 0.1, fy, depth, white, (left + right) / 2, fy / 2, z0 + depth / 2);
    box(right - left + 0.1, 0.08, depth, white, (left + right) / 2, top + 0.04, z0 + depth / 2);
    // 아래 수납장 문 줄눈
    for (let i = 0; i <= booths.length; i++) box(0.012, fy - 0.1, 0.01, std(0xdddddd), left + i * bw, fy / 2, z0 + depth + 0.005, false);
    booths.forEach((b, i) => {
      const ib = std(pastel[i % pastel.length], 0.9);
      box(bw - 0.04, top - fy, 0.02, ib, b.x, (fy + top) / 2, z0 + 0.05, false);
      box(bw - 0.08, 0.025, depth - 0.12, std(pastel[(i + 1) % pastel.length], 0.95), b.x, fy + 0.012, z0 + depth / 2 - 0.02, false);
      box(bw - 0.12, 0.012, 0.3, light, b.x, top - 0.01, z0 + depth / 2, false);
      // 앞 유리 + 물병
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.04, top - fy), glass);
      gl.position.set(b.x, (fy + top) / 2, z0 + depth - 0.01);
      gl.renderOrder = 2;
      g.add(gl);
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.7 }));
      bottle.position.set(b.x + bw / 2 - 0.08, fy + 0.32, z0 + 0.12);
      g.add(bottle);
      const st = byStock.get(L.spots.indexOf(b));
      if (st) {
        const card = cardFor(st);
        card.position.set(b.x - bw / 2 + 0.2, fy + 0.13, z0 + depth + 0.005);
        g.add(card);
        cards.set(st.id, card);
      }
    });
    for (let i = 0; i <= booths.length; i++) box(0.04, top - fy, depth, white, left + i * bw, (fy + top) / 2, z0 + depth / 2);
  }

  // ── 소동물장: 낮은 장 위에 수조 · 새장 ──
  const cages = L.spots.filter((s) => s.kind === 'cage');
  const cab = L.furniture.find((f) => f.id === 'smallCab')?.rect;
  if (cab && cages.length) {
    const cy = cages[0].y;
    box(cab.x1 - cab.x0, cy, cab.z1 - cab.z0, std(0xb98a5a, 0.6), (cab.x0 + cab.x1) / 2, cy / 2, (cab.z0 + cab.z1) / 2);
    box(cab.x1 - cab.x0 + 0.04, 0.03, cab.z1 - cab.z0 + 0.04, white, (cab.x0 + cab.x1) / 2, cy + 0.015, (cab.z0 + cab.z1) / 2);
    const wire = std(0xd8d8d8, 0.3, 0.8);
    cages.forEach((c) => {
      const st = byStock.get(L.spots.indexOf(c));
      const sp = st ? PET_BY_ID[st.species] : null;
      const cz = (c.inner.z0 + c.inner.z1) / 2;
      if (sp?.body === 'bird') {
        // 둥근 새장: 바닥판 + 가는 살 + 지붕 + 횃대
        const r = 0.22;
        const h = 0.55;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 20), std(0xf0f0f0));
        base.position.set(c.x, cy + 0.05, cz);
        g.add(base);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, h, 4), wire);
          bar.position.set(c.x + Math.cos(a) * r, cy + 0.05 + h / 2, cz + Math.sin(a) * r);
          g.add(bar);
        }
        const roof = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), wire);
        roof.position.set(c.x, cy + 0.05 + h, cz);
        (roof.material as THREE.MeshStandardMaterial).wireframe = false;
        roof.scale.y = 0.5;
        g.add(roof);
        const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, r * 1.8, 6), std(0x8b5a2b));
        perch.rotation.z = Math.PI / 2;
        perch.position.set(c.x, cy + 0.2, cz);
        g.add(perch);
      } else {
        // 유리 수조: 톱밥 바닥 (거북이는 물 + 돌)
        const tw = 0.56;
        const th = 0.32;
        const td = c.inner.z1 - c.inner.z0 + 0.2;
        const tank = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), glass);
        tank.position.set(c.x, cy + 0.03 + th / 2, cz);
        tank.renderOrder = 2;
        g.add(tank);
        box(tw, 0.02, td, std(0x2a2a2a), c.x, cy + th + 0.04, cz, false);
        const turtle = sp?.body === 'turtle';
        box(tw - 0.02, 0.035, td - 0.02, std(turtle ? 0x4fa8d8 : 0xe8cf9a, turtle ? 0.1 : 1, 0, turtle ? { transparent: true, opacity: 0.75 } : {}), c.x, cy + 0.05, cz, false);
        if (turtle) box(0.14, 0.05, 0.1, std(0x8a8580, 0.9), c.x + 0.15, cy + 0.07, cz, false);
        else box(0.1, 0.07, 0.08, std(0xd39a5a, 0.8), c.x + 0.17, cy + 0.07, cz - 0.05, false); // 작은 집
      }
      if (st && sp) {
        const card = cardFor(st);
        card.scale.setScalar(0.7);
        card.position.set(c.x, cy - 0.12, cab.z1 + 0.005);
        g.add(card);
        cards.set(st.id, card);
      }
    });
  }

  // ── 곤돌라 진열대 (양면) + 서쪽 벽 사료 선반 ──
  const shelfMat = std(0xf3f3f1, 0.4);
  const edge = std(0x2fae93, 0.5);
  for (const id of ['gondolaA', 'gondolaB']) {
    const r = L.furniture.find((f) => f.id === id)?.rect;
    if (!r) continue;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    box(w, 0.14, d, edge, cx, 0.07, cz);
    box(w, 1.42, 0.04, shelfMat, cx, 0.71, cz);
    for (const y of [0.53, 0.96]) box(w, 0.025, d, shelfMat, cx, y, cz);
    box(w, 0.025, d, shelfMat, cx, 1.4, cz);
    for (const s of [-1, 1]) box(0.04, 1.42, d, edge, cx + (s * w) / 2, 0.71, cz);
    // 위 머리판 (분류)
    const head = canvasTex(512, 96, (c) => {
      c.fillStyle = '#2fae93';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 50px ${FONT}`;
      c.fillText(id === 'gondolaA' ? '간식 · 장난감' : '목욕 · 위생', 256, 50);
    });
    const hm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.26, 0.04), [edge, edge, edge, edge, new THREE.MeshBasicMaterial({ map: head }), new THREE.MeshBasicMaterial({ map: head })]);
    hm.position.set(cx, 1.62, cz);
    g.add(hm);
  }
  const fw = L.furniture.find((f) => f.id === 'foodWall')?.rect;
  if (fw) {
    const cz = (fw.z0 + fw.z1) / 2;
    const d = fw.z1 - fw.z0;
    box(0.04, 2.0, d, shelfMat, fw.x0 + 0.1, 1.0, cz);
    for (const y of [0.4, 1.1, 1.8]) box(fw.x1 - fw.x0 - 0.1, 0.03, d, shelfMat, (fw.x0 + fw.x1) / 2 + 0.05, y - 0.015, cz);
    for (const s of [-1, 1]) box(fw.x1 - fw.x0, 2.0, 0.04, edge, (fw.x0 + fw.x1) / 2, 1.0, cz + (s * d) / 2);
    const head = canvasTex(512, 96, (c) => {
      c.fillStyle = '#d8432f';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 52px ${FONT}`;
      c.fillText('사료 · 주식', 256, 50);
    });
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: head }));
    hm.rotation.y = Math.PI / 2;
    hm.position.set(x0 + 0.1, 2.2, cz);
    g.add(hm);
  }

  // ── 상품: 진열 자리마다 하나씩 (렌더러가 남은 개수만큼만 보이게 한다) ──
  const make = productFactory();
  for (const d of L.displays) {
    const list: THREE.Object3D[] = [];
    (d.slots ?? []).forEach((s, k) => {
      const p = make(d.item, k);
      p.position.set(s.x, s.y, s.z);
      // 손님 쪽을 보게
      p.rotation.y = d.face === 0 ? Math.PI / 2 : d.face > 0 ? 0 : Math.PI;
      g.add(p);
      list.push(p);
    });
    goods.set(d.item, list);
    const it = PET_GOOD_BY_ID[d.item];
    if (!it) continue;
    // 가격표: 선반 아래 단 앞
    const tag = priceTag(it.name, it.price);
    if (d.face === 0) {
      tag.rotation.y = Math.PI / 2;
      tag.position.set(d.x + 0.01, 0.3, d.z);
    } else {
      tag.rotation.y = d.face > 0 ? 0 : Math.PI;
      tag.position.set(d.x, 0.36, d.z + d.face * 0.02);
    }
    g.add(tag);
  }

  // ── 미용실 (유리벽) ──
  const gr = L.furniture.find((f) => f.id === 'grooming')?.rect;
  if (gr) {
    const frame = std(0xffffff, 0.3);
    const pane = (len: number, x: number, z: number, alongX: boolean) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.1), glass);
      p.position.set(x, 1.15, z);
      if (!alongX) p.rotation.y = Math.PI / 2;
      p.renderOrder = 2;
      g.add(p);
      box(alongX ? len : 0.05, 0.1, alongX ? 0.05 : len, frame, x, 0.05, z);
      box(alongX ? len : 0.05, 0.08, alongX ? 0.05 : len, frame, x, 2.2, z);
    };
    pane(gr.z1 - gr.z0, gr.x0, (gr.z0 + gr.z1) / 2, false);
    pane(gr.x1 - gr.x0, (gr.x0 + gr.x1) / 2, gr.z0, true);
    // 미용 테이블 · 드라이어 · 욕조
    const steel = std(0xc8ccd0, 0.25, 0.8);
    box(0.9, 0.04, 0.55, steel, gr.x0 + 0.85, 0.85, gr.z0 + 0.9);
    box(0.06, 0.83, 0.06, steel, gr.x0 + 0.85, 0.42, gr.z0 + 0.9);
    box(0.5, 0.03, 0.4, std(0x333333), gr.x0 + 0.85, 0.02, gr.z0 + 0.9, false);
    box(0.04, 1.5, 0.04, steel, gr.x0 + 1.45, 0.75, gr.z0 + 0.6);
    box(0.2, 0.14, 0.14, std(0xf4f4f4, 0.3), gr.x0 + 1.4, 1.5, gr.z0 + 0.7);
    box(0.9, 0.55, 0.6, std(0xffffff, 0.2), x1 - 0.55, 0.275, gr.z1 - 0.5);
    const sign = canvasTex(512, 128, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#2fae93';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 60px ${FONT}`;
      c.fillText('✂ 미용 · 호텔', 256, 66);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: sign }));
    sm.rotation.y = -Math.PI / 2;
    sm.position.set(gr.x0 - 0.01, 2.45, (gr.z0 + gr.z1) / 2);
    g.add(sm);
  }
  return { goods, cards };
}

function cardFor(st: StockPet) {
  const sp = PET_BY_ID[st.species];
  return petCard(sp?.name ?? '', sp ? coatOf(sp, st.coat).name : null, sp?.price ?? 0, sp?.icon ?? '🐾');
}

