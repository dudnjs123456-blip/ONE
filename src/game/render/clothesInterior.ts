import * as THREE from 'three';
import type { ClothesCorner, Rect, StoreLayout } from '../city/store';
import { CORNER_LABEL } from '../city/store';
import { COSMETICS, type CosmeticDef } from '../data/fashion';
import { SHOP_GEAR, type EquipDef } from '../data/equipment';

/**
 * 옷가게 안: 서쪽은 짙은 색 '배틀 기어' 구역 (무기 벽 · 방어구 · 유리 진열장),
 * 가운데·동쪽은 밝은 '스타일' 구역 (모자 선반 · 상의 행거 · 하의 테이블 · 신발·가방 벽), 남동쪽 탈의실.
 * 파는 물건이 실제 모양·색으로 진열돼 있다.
 */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 옷 무늬 그림 (상의·하의) */
function fabricTex(c: CosmeticDef) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = css(c.color);
    g.fillRect(0, 0, 128, 128);
    const b = css(c.color2 ?? c.color);
    if (c.pattern === 'stripe') {
      g.fillStyle = b;
      for (let y = 0; y < 128; y += 22) g.fillRect(0, y, 128, 10);
    } else if (c.pattern === 'check') {
      g.globalAlpha = 0.55;
      g.fillStyle = b;
      for (let k = 0; k < 128; k += 32) {
        g.fillRect(k, 0, 16, 128);
        g.fillRect(0, k, 128, 16);
      }
      g.globalAlpha = 1;
    } else if (c.pattern === 'dot') {
      g.fillStyle = b;
      for (let y = 10; y < 128; y += 24)
        for (let x = (y / 24) % 2 ? 22 : 10; x < 128; x += 24) {
          g.beginPath();
          g.arc(x, y, 4, 0, Math.PI * 2);
          g.fill();
        }
    }
  });
}

/** 구역 머리 간판 (아이콘 + 이름) */
function headerTex(text: string, dark: boolean) {
  return canvasTex(512, 112, (g) => {
    g.fillStyle = dark ? '#1d1e22' : '#ffffff';
    g.beginPath();
    g.roundRect(4, 4, 504, 104, 22);
    g.fill();
    g.strokeStyle = dark ? '#e0b44a' : '#2b2b30';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = dark ? '#f2d38a' : '#2b2b30';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 44px ${FONT}, ${EMOJI}`;
    g.fillText(text, 256, 60);
  });
}

/** 가격표 (작은 판) */
function priceTex(name: string, price: number, icon: string) {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#2b2b30';
    g.fillRect(0, 0, 256, 8);
    g.textBaseline = 'middle';
    g.font = `46px ${EMOJI}`;
    g.fillText(icon, 8, 52);
    g.font = `700 26px ${FONT}`;
    g.fillText(name.length > 7 ? name.slice(0, 7) + '…' : name, 62, 36);
    g.fillStyle = '#c0392b';
    g.font = `900 30px ${FONT}`;
    g.fillText(`${price.toLocaleString()}G`, 62, 72);
  });
}

export function buildClothesInterior(g: THREE.Group, L: StoreLayout) {
  const cache = new Map<string, THREE.Material>();
  const std = (color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = `${color}|${roughness}|${metalness}|${Object.keys(extra).length ? JSON.stringify(Object.keys(extra)) + Math.random() : ''}`;
    let m = cache.get(key);
    if (!m) cache.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })));
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const rect = (id: string): Rect => L.furniture.find((f) => f.id === id)!.rect;
  const corner = (c: ClothesCorner) => rect(`c:${c}`);
  const tag = (e: { name: string; price?: number; icon: string }, x: number, y: number, z: number, ry = 0) => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshBasicMaterial({ map: priceTex(e.name, e.price ?? 0, e.icon) }));
    t.position.set(x, y, z);
    t.rotation.y = ry;
    g.add(t);
  };
  const header = (c: ClothesCorner, x: number, y: number, z: number, ry = 0, dark = false) => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.27), new THREE.MeshBasicMaterial({ map: headerTex(CORNER_LABEL[c], dark), transparent: true }));
    t.position.set(x, y, z);
    t.rotation.y = ry;
    g.add(t);
  };
  const gearOf = (slots: EquipDef['slot'][]) => SHOP_GEAR.filter((e) => slots.includes(e.slot));
  const cosOf = (slots: CosmeticDef['slot'][]) => COSMETICS.filter((c) => slots.includes(c.slot));
  const chrome = std(0xd9dce1, 0.2, 0.9);
  const black = std(0x1c1d21, 0.5, 0.3);
  const wood = std(0xb08a62, 0.6);
  const white = std(0xf7f6f2, 0.6);

  // ── 배틀 기어 구역: 서쪽 바닥 짙은 깔개 + 벽 판넬 ──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.6), std(0x2e2f35, 0.95));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-2.95, 0.006, -1.2);
  rug.receiveShadow = true;
  g.add(rug);
  box(0.04, 2.6, 4.6, std(0x26272c, 0.8), L.room.x0 + 0.1, 1.3, -1.2);
  box(3.2, 2.6, 0.04, std(0x26272c, 0.8), -2.8, 1.3, L.room.z0 + 0.1);
  const bigSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), new THREE.MeshBasicMaterial({ map: headerTex('⚔️ BATTLE GEAR', true), transparent: true }));
  bigSign.position.set(-2.8, 2.65, L.room.z0 + 0.13);
  g.add(bigSign);

  // 무기 벽: 구멍판 + 걸이 + 무기 (세워서 건다)
  {
    const r = corner('weapon');
    const wx = r.x1 - 0.12;
    box(0.06, 1.6, r.z1 - r.z0, std(0x3a3b41, 0.7), r.x0 + 0.17, 1.35, (r.z0 + r.z1) / 2);
    box(0.3, 0.9, r.z1 - r.z0, black, r.x0 + 0.17, 0.45, (r.z0 + r.z1) / 2);
    const list = gearOf(['weapon']);
    list.forEach((e, i) => {
      const z = r.z0 + ((i + 0.5) * (r.z1 - r.z0)) / list.length;
      const grp = new THREE.Group();
      grp.position.set(wx, 1.4, z);
      grp.rotation.z = 0.12;
      g.add(grp);
      if (e.id === 'aluBat') {
        mesh(new THREE.CylinderGeometry(0.035, 0.016, 0.86, 16), std(0xc9ced6, 0.25, 0.9), 0, 0, 0, grp);
        mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.18, 12), std(0x1c1d21, 0.9), 0, -0.36, 0, grp);
      } else if (e.id === 'steelPipe') {
        mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.9, 14), std(0x7d8187, 0.35, 0.85), 0, 0, 0, grp);
        mesh(new THREE.TorusGeometry(0.028, 0.008, 8, 16), std(0x5d6066, 0.4, 0.8), 0, 0.45, 0, grp).rotation.x = Math.PI / 2;
      } else {
        // 삼단봉: 굵기가 다른 세 마디
        [0.02, 0.016, 0.012].forEach((rr, k) => mesh(new THREE.CylinderGeometry(rr, rr, 0.24, 12), black, 0, -0.2 + k * 0.23, 0, grp));
        mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 12), std(0x8b1e1e, 0.8), 0, -0.36, 0, grp);
      }
      // 걸이 둘
      for (const dy of [-0.25, 0.25]) box(0.12, 0.015, 0.015, chrome, wx - 0.04, 1.4 + dy, z);
      tag(e, wx + 0.02, 0.78, z, Math.PI / 2);
    });
    header('weapon', r.x1 + 0.02, 2.25, (r.z0 + r.z1) / 2, Math.PI / 2, true);
  }

  // 방어구: 북쪽 벽 낮은 단 + 토르소(재킷) · 헬멧 · 카고바지 · 전투화
  {
    const r = corner('armor');
    const cz = (r.z0 + r.z1) / 2;
    box(r.x1 - r.x0, 0.25, r.z1 - r.z0, std(0x34353b, 0.6), (r.x0 + r.x1) / 2, 0.125, cz);
    const list = gearOf(['head', 'top', 'bottom', 'shoes']);
    list.forEach((e, i) => {
      const x = r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / list.length;
      const y0 = 0.25;
      if (e.slot === 'top') {
        // 토르소 마네킹 + 가죽 재킷
        mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 8), chrome, x, y0 + 0.35, cz);
        const jacket = std(0x2a1d17, 0.45, 0.1);
        mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.5, 16), jacket, x, y0 + 0.95, cz).scale.set(1, 1, 0.65);
        for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 10), jacket, x + s * 0.2, y0 + 0.92, cz).rotation.z = s * 0.15;
        box(0.02, 0.4, 0.01, chrome, x + 0.03, y0 + 0.95, cz + 0.1);
      } else if (e.slot === 'head') {
        mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 12), black, x, y0 + 0.25, cz);
        const hm = mesh(new THREE.SphereGeometry(0.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), std(0xf2f2f2, 0.25, 0.3), x, y0 + 0.55, cz);
        hm.scale.set(1, 1.05, 1.1);
        const visor = mesh(new THREE.SphereGeometry(0.152, 20, 8, -0.9, 1.8, 1.0, 0.7), std(0x1b2a3a, 0.05, 0.6, { transparent: true, opacity: 0.8 }), x, y0 + 0.55, cz);
        visor.scale.set(1, 1.05, 1.1);
      } else if (e.slot === 'bottom') {
        for (let k = 0; k < 3; k++) box(0.34, 0.06, 0.3, std(0x6b6a45, 0.85), x, y0 + 0.03 + k * 0.062, cz);
      } else {
        for (const s of [-1, 1]) {
          box(0.1, 0.05, 0.26, std(0x1c1a17, 0.9), x + s * 0.07, y0 + 0.025, cz);
          box(0.09, 0.18, 0.12, std(0x3a3226, 0.6), x + s * 0.07, y0 + 0.14, cz - 0.06);
        }
      }
      tag(e, x, y0 + 0.08, r.z1 + 0.005);
    });
    header('armor', (r.x0 + r.x1) / 2, 2.05, r.z0 + 0.14, 0, true);
  }

  // 장갑·액세서리 유리 진열장 (위에서 내려다보는 유리)
  {
    const r = corner('gearAcc');
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    box(w, 0.85, d, black, cx, 0.425, cz);
    box(w - 0.06, 0.02, d - 0.06, std(0x5a1f2a, 0.95), cx, 0.86, cz); // 벨벳
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff2fa, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
    box(w, 0.26, d, glass, cx, 0.85 + 0.13, cz).castShadow = false;
    box(w + 0.02, 0.015, d + 0.02, chrome, cx, 1.115, cz);
    const glow = new THREE.PointLight(0xfff0d0, 1.2, 1.6, 2);
    glow.position.set(cx, 1.05, cz);
    g.add(glow);
    const list = gearOf(['gloves', 'necklace', 'ring']);
    list.forEach((e, i) => {
      const x = r.x0 + ((i + 0.5) * w) / list.length;
      const y = 0.885;
      if (e.slot === 'gloves') {
        const mt = e.id === 'steelKnuckle' ? std(0xbfc4cc, 0.2, 0.95) : std(0x5a3a22, 0.6);
        for (let k = 0; k < 4; k++) mesh(new THREE.TorusGeometry(0.018, 0.007, 6, 12), mt, x - 0.045 + k * 0.03, y + 0.01, cz).rotation.x = Math.PI / 2;
        box(0.13, 0.015, 0.03, mt, x, y + 0.01, cz + 0.03);
      } else if (e.slot === 'necklace') {
        mesh(new THREE.TorusGeometry(0.08, 0.006, 6, 32), std(0xe2b23c, 0.2, 1), x, y + 0.006, cz).rotation.x = Math.PI / 2;
      } else {
        const ring = mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), std(0xd9b44a, 0.15, 1), x, y + 0.03, cz);
        mesh(new THREE.OctahedronGeometry(0.012), std(0xd23a5a, 0.05, 0.3, { emissive: 0x501020 }), x, y + 0.055, cz);
        ring.rotation.y = 0.4;
      }
      tag(e, x, 0.65, r.z1 + 0.005);
    });
    header('gearAcc', cx, 1.75, cz, 0, true);
  }

  // ── 스타일 구역 ──
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.42), new THREE.MeshBasicMaterial({ map: headerTex(`✨ ${L.sign}`, false), transparent: true }));
  sign2.position.set(0.65, 2.62, L.room.z0 + 0.1);
  g.add(sign2);

  // 모자·안경 선반 (북쪽 벽 세 단)
  {
    const r = corner('hat');
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    box(w, 2.0, 0.05, wood, (r.x0 + r.x1) / 2, 1.0, r.z0 + 0.06);
    const shelves = [0.75, 1.3];
    for (const y of shelves) box(w, 0.03, r.z1 - r.z0, white, (r.x0 + r.x1) / 2, y, cz);
    const hats = cosOf(['hat']);
    hats.forEach((c, i) => {
      const x = r.x0 + ((i + 0.5) * w) / hats.length;
      const y = shelves[1] + 0.015;
      const mt = std(c.color, 0.8);
      if (c.style === 'bunny') {
        // 머리띠 + 쫑긋 선 귀 두 개
        const band = mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 20, Math.PI), std(c.color, 0.6), x, y + 0.005, cz);
        band.scale.y = 1.1;
        for (const s of [-1, 1]) {
          const ear = mesh(new THREE.SphereGeometry(1, 14, 10), std(c.color, 0.7), x + s * 0.04, y + 0.17, cz);
          ear.scale.set(0.022, 0.07, 0.012);
          ear.rotation.z = -s * 0.2;
          const inner = mesh(new THREE.SphereGeometry(1, 12, 8), std(c.color2 ?? 0xf6b3c8, 0.7), x + s * 0.04, y + 0.165, cz + 0.008);
          inner.scale.set(0.012, 0.052, 0.006);
          inner.rotation.z = -s * 0.2;
        }
      } else if (c.style === 'bucket') {
        mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.09, 20), mt, x, y + 0.05, cz);
        mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.012, 20), mt, x, y + 0.006, cz);
      } else {
        const h = mesh(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mt, x, y, cz);
        h.scale.y = c.style === 'beanie' ? 1.2 : 0.85;
        if (c.style === 'cap') {
          const brim = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 18, 1, false, -Math.PI / 2, Math.PI), mt, x, y + 0.005, cz + 0.05);
          brim.scale.z = 1.4;
        } else mesh(new THREE.SphereGeometry(0.025, 10, 8), std(0xffffff, 0.9), x, y + 0.13, cz);
      }
      tag(c, x, shelves[1] - 0.06, r.z1 + 0.005);
    });
    const specs = cosOf(['glasses']);
    specs.forEach((c, i) => {
      const x = r.x0 + 0.5 + i * 0.9;
      const y = shelves[0] + 0.015;
      // 얼굴 모양 받침 + 안경
      mesh(new THREE.SphereGeometry(0.08, 16, 12), white, x, y + 0.1, cz).scale.set(0.9, 1.1, 0.7);
      const sun = c.style === 'sunglasses';
      for (const s of [-1, 1]) {
        mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 18), std(c.color, 0.3, 0.6), x + s * 0.034, y + 0.12, cz + 0.06);
        if (sun) mesh(new THREE.CircleGeometry(0.026, 18), std(0x15161c, 0.1, 0.3), x + s * 0.034, y + 0.12, cz + 0.059);
      }
      tag(c, x, shelves[0] - 0.06, r.z1 + 0.005);
    });
    header('hat', (r.x0 + r.x1) / 2, 2.15, r.z0 + 0.1);
  }

  // 상의 행거: 크롬 봉에 티셔츠를 앞으로 보이게 겹쳐 건다
  {
    const r = corner('top');
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    for (const x of [r.x0 + 0.05, r.x1 - 0.05]) {
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.55, 8), chrome, x, 0.775, cz);
      box(0.04, 0.02, 0.45, chrome, x, 0.01, cz);
    }
    mesh(new THREE.CylinderGeometry(0.012, 0.012, w, 8), chrome, (r.x0 + r.x1) / 2, 1.55, cz).rotation.z = Math.PI / 2;
    // 비키니는 행거 대신 계산대 목록에서만 (티셔츠 모양으로 걸면 이상하다)
    const tops = cosOf(['top']).filter((c) => c.style !== 'bikini');
    tops.forEach((c, i) => {
      const x = r.x0 + 0.2 + ((i + 0.5) * (w - 0.4)) / tops.length;
      const z = cz - 0.12 + i * 0.03;
      const fab = new THREE.MeshStandardMaterial({ map: fabricTex(c), roughness: 0.9 });
      // 옷걸이
      const hook = mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 12, Math.PI * 1.4), chrome, x, 1.57, z);
      hook.rotation.z = -0.3;
      box(0.3, 0.008, 0.008, chrome, x, 1.5, z);
      // 몸판 + 소매
      box(0.3, 0.42, 0.02, fab, x, 1.28, z);
      for (const s of [-1, 1]) {
        const sl = box(0.1, 0.13, 0.018, fab, x + s * 0.18, 1.43, z);
        sl.rotation.z = s * -0.6;
      }
    });
    tag({ name: '티셔츠·셔츠', price: Math.min(...tops.map((t) => t.price)), icon: '👕' }, (r.x0 + r.x1) / 2, 0.95, cz + 0.3);
    header('top', (r.x0 + r.x1) / 2, 1.95, cz);
  }

  // 하의 테이블: 접은 바지 더미
  {
    const r = corner('bottom');
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    box(w, 0.05, r.z1 - r.z0, wood, cx, 0.78, cz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, 0.76, 0.05, wood, cx + dx * (w / 2 - 0.06), 0.38, cz + dz * ((r.z1 - r.z0) / 2 - 0.06));
    const list = cosOf(['bottom']);
    list.forEach((c, i) => {
      const x = r.x0 + ((i + 0.5) * w) / list.length;
      const fab = new THREE.MeshStandardMaterial({ map: fabricTex(c), roughness: 0.95 });
      for (let k = 0; k < 3; k++) {
        const p = box(0.3, 0.05, 0.36, fab, x, 0.83 + k * 0.052, cz + 0.05);
        p.rotation.y = (k - 1) * 0.06;
      }
      tag(c, x, 0.98 + 0.16, cz - 0.24, Math.PI);
    });
    header('bottom', cx, 1.75, cz, Math.PI);
  }

  // 신발·가방 벽 (동쪽): 비스듬한 선반 세 단, 맨 위엔 가방
  {
    const r = corner('shoes');
    const cz = (r.z0 + r.z1) / 2;
    const d = r.z1 - r.z0;
    box(0.05, 2.1, d, wood, r.x1 - 0.06, 1.05, cz);
    const levels = [0.45, 0.9];
    for (const y of [...levels, 1.45]) {
      const s = box(r.x1 - r.x0, 0.03, d, white, (r.x0 + r.x1) / 2, y, cz);
      if (y < 1.4) s.rotation.z = -0.12;
    }
    const shoes = cosOf(['shoes']);
    shoes.forEach((c, i) => {
      const z = r.z0 + ((i + 0.5) * d) / shoes.length;
      const y = levels[i % 2] + 0.05;
      const x = (r.x0 + r.x1) / 2;
      const up = std(c.color, 0.55);
      for (const s of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(x, y, z + s * 0.06);
        sh.rotation.y = -Math.PI / 2;
        g.add(sh);
        box(0.09, 0.03, 0.25, std(0xf4f4f0, 0.8), 0, 0, 0, sh);
        const toe = mesh(new THREE.SphereGeometry(0.05, 12, 8), up, 0, 0.035, 0.07, sh);
        toe.scale.set(0.9, 0.7, 1.2);
        box(0.085, c.id === 'shoes-red' ? 0.13 : 0.07, 0.13, up, 0, 0.06, -0.05, sh);
      }
      tag(c, r.x0 - 0.005, y - 0.08, z, -Math.PI / 2);
    });
    const bags = cosOf(['bag']);
    bags.forEach((c, i) => {
      const z = r.z0 + ((i + 0.5) * d) / bags.length;
      const mini = c.style === 'mini';
      const bw = mini ? 0.17 : 0.26;
      const bh = mini ? 0.2 : 0.32;
      const b = box(0.12, bh, bw, std(c.color, 0.7), (r.x0 + r.x1) / 2, 1.465 + bh / 2, z);
      b.rotation.y = 0.05;
      box(0.13, bh * 0.22, bw * 1.02, std(new THREE.Color(c.color).multiplyScalar(0.75).getHex(), 0.7), (r.x0 + r.x1) / 2, 1.465 + bh * 0.9, z);
      tag(c, r.x0 - 0.005, 1.4, z, -Math.PI / 2);
    });
    // 꼬리: 맨 위 선반 끝에 솜뭉치
    const tails = cosOf(['tail']);
    tails.forEach((c, i) => {
      const z = r.z0 + 0.12 + i * 0.16;
      const mt = std(c.color, 0.95);
      mesh(new THREE.IcosahedronGeometry(0.05, 1), mt, (r.x0 + r.x1) / 2, 1.515, z);
      mesh(new THREE.IcosahedronGeometry(0.03, 1), mt, (r.x0 + r.x1) / 2 + 0.02, 1.55, z + 0.02);
    });
    header('shoes', r.x0 - 0.02, 2.2, cz, -Math.PI / 2);
  }

  // 탈의실: 벽 둘 + 커튼 + 바깥 전신거울
  {
    const r = rect('fitting');
    const wallM = std(0xe9e2d6, 0.9);
    box(r.x1 - r.x0, 2.3, 0.06, wallM, (r.x0 + r.x1) / 2, 1.15, r.z0);
    box(0.06, 2.3, 0.3, wallM, r.x0, 1.15, r.z0 + 0.15);
    box(0.06, 2.3, 0.2, wallM, r.x0, 1.15, r.z1 - 0.1);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, r.z1 - r.z0, 8), chrome, r.x0, 2.2, (r.z0 + r.z1) / 2).rotation.x = Math.PI / 2;
    // 주름진 커튼 (지그재그 판)
    const cw = r.z1 - r.z0 - 0.5;
    const curtain = new THREE.PlaneGeometry(cw, 2.0, 16, 1);
    const pos = curtain.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / cw) * Math.PI * 8) * 0.03);
    curtain.computeVertexNormals();
    const cm = mesh(curtain, std(0x9c2b3a, 0.95, 0, { side: THREE.DoubleSide }), r.x0 - 0.02, 1.15, (r.z0 + r.z1) / 2 + 0.05);
    cm.rotation.y = Math.PI / 2;
    const fsign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: headerTex('🚪 탈의실', false), transparent: true }));
    fsign.position.set(r.x0 - 0.05, 2.42, (r.z0 + r.z1) / 2);
    fsign.rotation.y = -Math.PI / 2;
    g.add(fsign);
    // 전신거울 (탈의실 북쪽 벽 바깥)
    box(0.62, 1.7, 0.04, std(0x2b2b30, 0.4, 0.4), (r.x0 + r.x1) / 2, 1.0, r.z0 - 0.04);
    box(0.54, 1.6, 0.01, std(0xdfeaf2, 0.02, 1), (r.x0 + r.x1) / 2, 1.0, r.z0 - 0.065);
  }

  // 창가 마네킹 둘: 코디 예시
  const dummy = (id: string, top: CosmeticDef, bottom: CosmeticDef, hat: number | null) => {
    const r = rect(id);
    const x = (r.x0 + r.x1) / 2;
    const z = (r.z0 + r.z1) / 2;
    const skin = std(0xeeeae4, 0.4);
    mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), black, x, 0.015, z);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), chrome, x, 0.15, z);
    const pants = new THREE.MeshStandardMaterial({ map: fabricTex(bottom), roughness: 0.9 });
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.8, 12), pants, x + s * 0.08, 0.68, z);
    const shirt = new THREE.MeshStandardMaterial({ map: fabricTex(top), roughness: 0.9 });
    mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 16), shirt, x, 1.35, z).scale.z = 0.7;
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 10), skin, x + s * 0.22, 1.32, z).rotation.z = s * 0.12;
    mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 10), skin, x, 1.67, z);
    mesh(new THREE.SphereGeometry(0.11, 16, 12), skin, x, 1.82, z).scale.set(0.9, 1.1, 0.95);
    if (hat !== null) {
      const h = mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(hat, 0.8), x, 1.86, z);
      h.scale.y = 0.8;
    }
  };
  const by = (id: string) => COSMETICS.find((c) => c.id === id)!;
  dummy('manA', by('stripe-navy'), by('pants-denim'), 0xd8344a);
  dummy('manB', by('check-red'), by('pants-beige'), null);

  // 화분 둘
  for (const [x, z] of [[-4.6, 3.1], [2.9, 0.9]]) {
    mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.35, 14), std(0xe8e2d8, 0.6), x, 0.175, z);
    for (let k = 0; k < 5; k++) {
      const leaf = mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0x3f8a4a, 0.8), x + Math.cos(k * 1.3) * 0.08, 0.5 + k * 0.07, z + Math.sin(k * 1.3) * 0.08);
      leaf.scale.set(0.8, 1.3, 0.8);
    }
  }
}
