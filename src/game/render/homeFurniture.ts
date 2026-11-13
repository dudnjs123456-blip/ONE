import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toonify } from './lookFx';

/**
 * 원룸 집 가구 (직접 만든 모델). 자리·크기는 HOME.furniture 부딪힘 상자와 자세 기준점에 맞춰 있다.
 * 방 좌표: 북쪽 = -z (창문), 서쪽 = -x (현관·주방), 남쪽 = +z (카메라 쪽).
 */

type Put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => THREE.Mesh;

/** 늘 같은 모양이 나오게 고정된 난수 */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seeded(7);

function place(parent: THREE.Object3D, x: number, z: number, ry = 0): [THREE.Group, Put] {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  parent.add(g);
  const put: Put = (geo, mat, px, py, pz, rx = 0, ryy = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ryy, rz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  return [g, put];
}

const rb = (w: number, h: number, d: number, r = 0.02, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (top: number, bottom: number, h: number, n = 16) => new THREE.CylinderGeometry(top, bottom, h, n);
const ball = (r: number, n = 14) => new THREE.SphereGeometry(r, n, Math.max(6, Math.round(n * 0.7)));
const std = (color: number, roughness = 0.8, map?: THREE.Texture) => new THREE.MeshStandardMaterial({ color, roughness, map: map ?? null });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

// ───────────── 사진 재질 (Firefly 로 만든 소녀방 재질 → scripts/process-home-textures.mjs) ─────────────

const photoTex = new Map<string, THREE.Texture>();
/**
 * public/textures/home/<name>.jpg 를 반복(rx × ry)해서 까는 재질 그림.
 * 같은 사진은 한 번만 받고, 반복 수가 다른 곳은 그림을 같이 쓰는 복사본을 쓴다.
 * (방은 게임을 시작할 때 미리 만들어 두므로 집에 들어갈 즈음엔 이미 받아져 있다)
 */
export function homePhoto(name: string, rx = 1, ry = 1): THREE.Texture {
  let base = photoTex.get(name);
  if (!base) {
    base = new THREE.TextureLoader().load(`/textures/home/${name}.jpg?v=2`);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 8;
    photoTex.set(name, base);
  }
  const t = base.clone();
  t.repeat.set(rx, ry);
  return t;
}

// ───────────── 무늬 (캔버스로 그린다) ─────────────

function ctex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** 나뭇결 (가로 방향) */
function woodTex(base: string, grain: string, repeat: [number, number] = [1, 1]) {
  return ctex(
    256,
    256,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = grain;
      for (let i = 0; i < 46; i++) {
        g.globalAlpha = 0.06 + rnd() * 0.16;
        g.lineWidth = 0.6 + rnd() * 1.8;
        const y = rnd() * 256;
        const amp = 1 + rnd() * 4;
        const ph = rnd() * 6;
        g.beginPath();
        for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.025 + ph) * amp);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    repeat,
  );
}

/** 직물 (작은 점 무늬) */
function fabricTex(base: string, speck: string, rep = 3) {
  return ctex(
    128,
    128,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = speck;
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.06 + rnd() * 0.12;
        g.beginPath();
        g.arc(rnd() * 128, rnd() * 128, 0.6 + rnd() * 1.1, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    [rep, rep],
  );
}

/** 굵은 골 니트 */
function knitTex(base: string) {
  return ctex(
    128,
    128,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(x, 0, 7, 128);
        g.fillStyle = 'rgba(0,0,0,0.1)';
        g.fillRect(x + 8, 0, 2, 128);
      }
    },
    [3, 1],
  );
}

/** 대리석 상판 */
function marbleTex() {
  return ctex(
    512,
    256,
    (g) => {
      g.fillStyle = '#ecebe7';
      g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#9d9a94';
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = 0.12 + rnd() * 0.25;
        g.lineWidth = 0.5 + rnd() * 1.5;
        let x = rnd() * 512;
        let y = rnd() * 256;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 30; k++) {
          x += 6 + rnd() * 12;
          y += (rnd() - 0.45) * 14;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    [2, 1],
  );
}

/** 주방 벽 타일 (가로로 긴 서브웨이 타일) */
function tileTex() {
  return ctex(
    256,
    256,
    (g) => {
      g.fillStyle = '#d9d4ca';
      g.fillRect(0, 0, 256, 256);
      const tw = 64;
      const th = 32;
      for (let r = 0; r < 8; r++) {
        for (let c = -1; c < 5; c++) {
          const x = c * tw + (r % 2 ? tw / 2 : 0);
          const y = r * th;
          const shade = 244 - Math.floor(rnd() * 8);
          g.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
          g.fillRect(x + 2, y + 2, tw - 4, th - 4);
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fillRect(x + 4, y + 4, tw - 12, 3);
        }
      }
    },
    [6, 1.6],
  );
}

/** 세로 홈이 파인 원목 문 (플루티드) */
function flutedTex(base: string) {
  return ctex(128, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, 0, 1.5, 64);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 2, 0, 2, 64);
    }
  });
}

/** 모니터 바탕화면 (노을 + 창 하나 + 작업표시줄) */
function screenTex() {
  return ctex(512, 288, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 288);
    sky.addColorStop(0, '#3b4a8c');
    sky.addColorStop(0.55, '#d97b8f');
    sky.addColorStop(1, '#f6c28b');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#2b2f4a';
    g.beginPath();
    g.moveTo(0, 230);
    g.lineTo(90, 170);
    g.lineTo(170, 215);
    g.lineTo(260, 150);
    g.lineTo(380, 220);
    g.lineTo(512, 175);
    g.lineTo(512, 288);
    g.lineTo(0, 288);
    g.fill();
    // 창 (메모장)
    g.fillStyle = 'rgba(250,250,252,0.95)';
    g.fillRect(150, 50, 250, 160);
    g.fillStyle = '#4b6fd8';
    g.fillRect(150, 50, 250, 18);
    g.fillStyle = '#9aa3b5';
    for (let i = 0; i < 9; i++) g.fillRect(162, 80 + i * 14, 40 + rnd() * 180, 5);
    // 작업표시줄
    g.fillStyle = 'rgba(20,22,30,0.85)';
    g.fillRect(0, 270, 512, 18);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#ffd166', '#5ab0ff', '#7bd389', '#ff8fab', '#c3b1ff', '#ffffff'][i];
      g.fillRect(200 + i * 20, 274, 12, 10);
    }
  });
}

/** 꺼진 TV 화면 (어두운 유리 + 비스듬한 반사) */
function tvTex() {
  return ctex(256, 144, (g) => {
    const bg = g.createLinearGradient(0, 0, 256, 144);
    bg.addColorStop(0, '#1b1e24');
    bg.addColorStop(1, '#07080a');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 144);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.moveTo(40, 0);
    g.lineTo(110, 0);
    g.lineTo(50, 144);
    g.lineTo(-20, 144);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.beginPath();
    g.moveTo(130, 0);
    g.lineTo(150, 0);
    g.lineTo(90, 144);
    g.lineTo(70, 144);
    g.fill();
  });
}

/** 키보드 자판 */
function keyTex() {
  return ctex(256, 72, (g) => {
    g.fillStyle = '#26272b';
    g.fillRect(0, 0, 256, 72);
    g.fillStyle = '#e9e9ec';
    for (let r = 0; r < 5; r++) {
      const n = 15 - (r === 4 ? 7 : 0);
      const kw = r === 4 ? 30 : 15;
      for (let c = 0; c < n; c++) {
        const w = r === 4 && c === 3 ? kw * 3 : kw;
        const x = 4 + (r === 4 ? (c > 3 ? (c + 2) * kw : c * kw) : c * 16.6 + (r % 2) * 4);
        if (x + w > 252) continue;
        g.fillRect(x, 4 + r * 13.5, w - 3, 11);
      }
    }
  });
}

/** 액자 그림 (해 + 겹친 언덕) */
function artTex() {
  return ctex(300, 180, (g) => {
    g.fillStyle = '#f1e6d4';
    g.fillRect(0, 0, 300, 180);
    g.fillStyle = '#e07a4f';
    g.beginPath();
    g.arc(205, 70, 34, 0, Math.PI * 2);
    g.fill();
    const hill = (color: string, y: number, amp: number, ph: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 180);
      for (let x = 0; x <= 300; x += 10) g.lineTo(x, y + Math.sin(x * 0.02 + ph) * amp);
      g.lineTo(300, 180);
      g.fill();
    };
    hill('#c9b48a', 110, 14, 0.5);
    hill('#9fb79a', 128, 12, 2.2);
    hill('#3f5a6b', 150, 9, 4);
  });
}

/** 인덕션 상판 (화구 3개) */
function cooktopTex() {
  return ctex(256, 256, (g) => {
    g.fillStyle = '#111214';
    g.fillRect(0, 0, 256, 256);
    const ring = (x: number, y: number, r: number) => {
      g.strokeStyle = 'rgba(200,205,215,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(200,205,215,0.25)';
      g.beginPath();
      g.arc(x, y, r * 0.6, 0, Math.PI * 2);
      g.stroke();
    };
    ring(75, 80, 50);
    ring(185, 80, 40);
    ring(128, 180, 48);
    g.fillStyle = 'rgba(255,90,60,0.8)';
    for (let i = 0; i < 4; i++) g.fillRect(70 + i * 34, 238, 14, 4);
  });
}

/** 몬스테라 잎 (구멍 뚫린 잎) */
function monsteraTex() {
  return ctex(128, 128, (g) => {
    g.fillStyle = '#3f7a45';
    g.beginPath();
    g.moveTo(64, 124);
    g.bezierCurveTo(4, 110, 0, 30, 64, 6);
    g.bezierCurveTo(128, 30, 124, 110, 64, 124);
    g.fill();
    // 잎맥
    g.strokeStyle = '#6aa86b';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(64, 124);
    g.lineTo(64, 10);
    g.stroke();
    // 갈라진 틈
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      const y = 36 + i * 20;
      g.beginPath();
      g.moveTo(10, y - 6);
      g.lineTo(42, y + 8);
      g.moveTo(118, y - 6);
      g.lineTo(86, y + 8);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  });
}

// ───────────── 가구 ─────────────

/** 더블 침대 (머리 = 북쪽). 매트리스 윗면 0.62, 걸터앉는 서쪽 가장자리 x=2.3 */
function bed(s: THREE.Object3D) {
  const [, put] = place(s, 3.6, -2.4);
  const frame = std(0xffffff, 0.95, fabricTex('#f2dce2', '#d8b7c1'));
  const wood = std(0xe9dccf, 0.6);
  const sheet = std(0xffffff, 0.95, fabricTex('#fffafb', '#efdde2'));
  const duvet = std(0xffffff, 0.95, homePhoto('quilt-pink', 3, 2.4));
  const pillow = std(0xffffff, 0.95, fabricTex('#fffafc', '#f0d6de'));
  const knit = std(0xffffff, 1, knitTex('#f6e6d8'));

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(cyl(0.035, 0.028, 0.08, 10), wood, sx * 1.18, 0.04, 0.05 + sz * 1.32);
  put(rb(2.6, 0.3, 2.9, 0.05), frame, 0, 0.23, 0.05);
  // 헤드보드: 뒤판 + 세로 누빔 6칸
  put(rb(2.64, 1.2, 0.1, 0.04), frame, 0, 0.62, -1.47);
  const n = 6;
  const cw = 2.6 / n;
  for (let i = 0; i < n; i++) put(rb(cw - 0.014, 0.86, 0.1, 0.045, 3), frame, -1.3 + cw * (i + 0.5), 0.76, -1.38);
  // 매트리스 (흰 시트)
  put(rb(2.46, 0.26, 2.78, 0.07, 3), sheet, 0, 0.49, 0.07);
  // 베개 2개 (헤드보드에 살짝 기댐) + 포인트 쿠션
  for (const sx of [-1, 1]) put(rb(0.86, 0.16, 0.5, 0.075, 3), pillow, sx * 0.56, 0.71, -1.04, -0.15);
  put(rb(0.42, 0.3, 0.1, 0.045, 3), std(0xf3a9c0, 0.9), 0.62, 0.8, -0.74, -0.3, -0.12);
  // 낮에 덮어 둔 이불: 윗면 + 양옆·발끝으로 늘어진 자락 + 접힌 이불깃
  put(rb(2.56, 0.08, 1.95, 0.038, 3), duvet, 0, 0.66, 0.5);
  for (const sx of [-1, 1]) put(rb(0.05, 0.32, 1.95, 0.02), duvet, sx * 1.265, 0.53, 0.5);
  put(rb(2.56, 0.32, 0.05, 0.02), duvet, 0, 0.53, 1.475);
  put(cyl(0.055, 0.055, 2.54, 16), sheet, 0, 0.68, -0.46, 0, 0, Math.PI / 2);
  // 발치에 걸친 니트 담요
  put(bx(2.62, 0.02, 0.5), knit, 0, 0.71, 1.05);
  for (const sx of [-1, 1]) put(bx(0.02, 0.28, 0.5), knit, sx * 1.31, 0.59, 1.05);
}

/** 협탁 + 스탠드 (lampMat: 잠잘 때 어두워지는 갓) */
function nightstand(s: THREE.Object3D, lampMat: THREE.Material) {
  const [, put] = place(s, 2.0, -3.6);
  const wood = std(0xffffff, 0.6, woodTex('#8a5f3e', '#4a2e1c'));
  const brass = std(0xc9a45c, 0.35);
  const ceramic = std(0xe9e2d4, 0.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(cyl(0.016, 0.012, 0.07, 8), brass, sx * 0.21, 0.035, sz * 0.18);
  put(rb(0.5, 0.44, 0.44, 0.015), wood, 0, 0.29, 0);
  for (const i of [0, 1]) {
    put(rb(0.46, 0.18, 0.02, 0.008), wood, 0, 0.18 + i * 0.2, 0.225);
    put(ball(0.017, 10), brass, 0, 0.18 + i * 0.2, 0.245);
  }
  // 도자기 스탠드
  put(cyl(0.07, 0.08, 0.02, 20), ceramic, -0.07, 0.52, -0.06);
  put(ball(0.085, 20), ceramic, -0.07, 0.6, -0.06).scale.set(1, 1.1, 1);
  put(cyl(0.012, 0.012, 0.12, 8), brass, -0.07, 0.73, -0.06);
  const shade = put(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 28, 1, true), lampMat, -0.07, 0.85, -0.06);
  shade.castShadow = false;
  // 책 두 권 + 탁상시계
  put(rb(0.16, 0.03, 0.22, 0.004), std(0x3f5a6b, 0.8), 0.12, 0.525, 0.07, 0, 0.1);
  put(rb(0.15, 0.025, 0.2, 0.004), std(0xdcae4a, 0.8), 0.12, 0.552, 0.07, 0, -0.05);
  put(rb(0.08, 0.07, 0.04, 0.012), std(0xf3efe7, 0.6), 0.13, 0.6, 0.06);
  put(cyl(0.025, 0.025, 0.004, 16), glow(0xffffff), 0.13, 0.6, 0.081, Math.PI / 2);
}

/** 책상 (창 아래, 앞 = 남쪽) + 모니터 · 키보드 · 소품 */
function desk(s: THREE.Object3D) {
  const [g, put] = place(s, -0.9, -3.57);
  const oak = std(0xffffff, 0.55, woodTex('#dcc29c', '#a47f55'));
  const black = std(0x2a2a2c, 0.5);
  const white = std(0xf2f0eb, 0.6);
  put(rb(2.5, 0.035, 0.72, 0.012), oak, 0, 0.7575, 0);
  // 철제 다리 (ㅁ자 프레임)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) put(bx(0.045, 0.74, 0.045), black, sx * 1.17, 0.37, sz * 0.3);
    put(bx(0.045, 0.03, 0.65), black, sx * 1.17, 0.725, 0);
    put(bx(0.045, 0.03, 0.65), black, sx * 1.17, 0.015, 0);
  }
  put(bx(2.3, 0.05, 0.02), black, 0, 0.71, -0.32);
  // 오른쪽 서랍장 (바퀴 달린 3단)
  put(rb(0.42, 0.56, 0.6, 0.01), white, 0.82, 0.34, -0.02);
  for (let i = 0; i < 3; i++) {
    put(rb(0.4, 0.17, 0.02, 0.006), white, 0.82, 0.15 + i * 0.185, 0.285);
    put(bx(0.12, 0.012, 0.015), black, 0.82, 0.2 + i * 0.185, 0.3);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(ball(0.025, 8), black, 0.82 + sx * 0.17, 0.03, -0.02 + sz * 0.25);
  // 모니터
  put(rb(0.26, 0.015, 0.18, 0.006), black, 0, 0.783, -0.16);
  put(rb(0.05, 0.32, 0.025, 0.01), black, 0, 0.94, -0.225, 0.06);
  put(rb(0.98, 0.58, 0.035, 0.012), black, 0, 1.2, -0.2);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.53), new THREE.MeshBasicMaterial({ map: screenTex(), color: 0xe4e4e4 }));
  scr.position.set(0, 1.205, -0.181);
  g.add(scr);
  put(bx(0.06, 0.06, 0.002), std(0xffe27a, 0.9), 0.43, 1.42, -0.181, 0, 0, 0.1); // 포스트잇
  // 스피커
  for (const sx of [-1, 1]) {
    put(rb(0.1, 0.18, 0.1, 0.012), black, sx * 0.65, 0.865, -0.18);
    put(cyl(0.032, 0.032, 0.006, 16), std(0x55565a, 0.6), sx * 0.65, 0.84, -0.129, Math.PI / 2);
  }
  // 키보드 · 마우스패드 · 마우스
  put(rb(0.44, 0.022, 0.14, 0.006), std(0x1b1c1f, 0.5), 0, 0.786, 0.17);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.12), std(0xffffff, 0.6, keyTex()));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.798, 0.17);
  g.add(keys);
  put(rb(0.28, 0.004, 0.22, 0.002), std(0x3c4a63, 0.95), 0.42, 0.777, 0.16);
  put(ball(1, 14), std(0xe9e9ec, 0.4), 0.42, 0.785, 0.17).scale.set(0.035, 0.02, 0.055);
  // 머그컵
  const mug = std(0xc8714c, 0.6);
  put(cyl(0.04, 0.036, 0.1, 16), mug, -0.55, 0.825, 0.12);
  put(new THREE.TorusGeometry(0.028, 0.008, 8, 16), mug, -0.505, 0.83, 0.12);
  put(cyl(0.036, 0.036, 0.004, 16), std(0x3b2316, 0.3), -0.55, 0.872, 0.12);
  // 책 (왼쪽 끝에 세워 둠)
  const books = [0x3f5a6b, 0xe8d5b0, 0x9fb79a, 0xb85c4a, 0x2d2d33, 0xdcae4a];
  let bxp = -1.2;
  for (const c of books) {
    const w = 0.035 + rnd() * 0.02;
    const h = 0.2 + rnd() * 0.07;
    put(rb(w, h, 0.17, 0.004), std(c, 0.8), bxp + w / 2, 0.775 + h / 2, -0.22);
    bxp += w + 0.003;
  }
  // 스탠드 (꺾인 팔)
  put(cyl(0.065, 0.07, 0.02, 20), black, -0.85, 0.785, -0.22);
  put(cyl(0.01, 0.01, 0.38, 8), black, -0.915, 0.963, -0.22, 0, 0, 0.35);
  put(cyl(0.01, 0.01, 0.3, 8), black, -0.84, 1.194, -0.22, 0, 0, -1.2);
  put(new THREE.CylinderGeometry(0.03, 0.075, 0.11, 18, 1, true), black, -0.69, 1.2, -0.22, 0, 0, 0.35);
  put(cyl(0.025, 0.025, 0.01, 12), glow(0xfff1c9), -0.68, 1.15, -0.22, 0, 0, 0.35).castShadow = false;
  // 다육이 화분
  put(cyl(0.05, 0.04, 0.09, 16), std(0xd08a63, 0.85), 1.05, 0.82, -0.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    put(ball(0.022, 10), std(0x7fae7a, 0.7), 1.05 + Math.cos(a) * 0.022, 0.875, -0.2 + Math.sin(a) * 0.022).scale.set(1, 1.4, 1);
  }
}

/** 사무용 의자 (책상 쪽 = 북쪽을 본다) */
function chair(s: THREE.Object3D) {
  const [, put] = place(s, -0.9, -2.8);
  const fab = std(0xffffff, 0.95, fabricTex('#f4c7d4', '#dba3b4'));
  const mesh = std(0xffffff, 0.9, ctex(64, 64, (g) => {
    g.fillStyle = '#2c2e33';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#4a4d55';
    for (let i = 0; i < 64; i += 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
  }, [4, 4]));
  const plastic = std(0x2b2b2e, 0.5);
  const chrome = std(0xb8bcc2, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(bx(0.05, 0.035, 0.3), plastic, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, 0, a);
    put(ball(0.03, 10), plastic, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
  }
  put(cyl(0.05, 0.06, 0.06, 16), plastic, 0, 0.08, 0);
  put(cyl(0.025, 0.025, 0.32, 12), chrome, 0, 0.26, 0);
  put(bx(0.2, 0.04, 0.22), plastic, 0, 0.42, 0);
  put(rb(0.52, 0.09, 0.5, 0.04, 3), fab, 0, 0.48, -0.02);
  // 등받이 (뒤로 살짝 기운 메쉬)
  put(bx(0.06, 0.32, 0.03), plastic, 0, 0.58, 0.25, 0.12);
  put(rb(0.5, 0.6, 0.06, 0.05, 3), plastic, 0, 0.93, 0.3, 0.12);
  put(rb(0.44, 0.52, 0.02, 0.03), mesh, 0, 0.93, 0.27, 0.12);
  for (const sx of [-1, 1]) {
    put(bx(0.035, 0.2, 0.04), plastic, sx * 0.28, 0.6, 0.04);
    put(rb(0.07, 0.03, 0.26, 0.012), plastic, sx * 0.28, 0.715, 0.0);
  }
}

/** 주방 (서쪽 벽, 앞 = 동쪽 +x): 인덕션·오븐 · 서랍 · 수납장 · 싱크 + 상부장 · 타일 · 소품 */
function kitchen(s: THREE.Object3D) {
  const [g, put] = place(s, -4.58, -2.25);
  const L = 3.3;
  const cab = std(0xf3f1ec, 0.6);
  const front = std(0xe7e1d5, 0.5);
  const handle = std(0x3a3a3a, 0.4);
  const steel = std(0xc9ccd0, 0.35);
  const darkGlass = std(0x1c1d20, 0.25);

  put(bx(0.62, 0.1, L), std(0x3b3b3b, 0.8), -0.04, 0.05, 0);
  put(bx(0.7, 0.78, L), cab, -0.02, 0.49, 0);
  // 상판 (싱크 자리만 비운다)
  const top = std(0xffffff, 0.35, marbleTex());
  const T = (x0: number, x1: number, z0: number, z1: number) => put(bx(x1 - x0, 0.04, z1 - z0), top, (x0 + x1) / 2, 0.9, (z0 + z1) / 2);
  T(-0.375, 0.39, -1.67, 1.0);
  T(-0.375, 0.39, 1.45, 1.67);
  T(-0.375, -0.2, 1.0, 1.45);
  T(0.2, 0.39, 1.0, 1.45);
  // 문짝
  const F = (z0: number, z1: number, y0: number, y1: number, mat: THREE.Material = front) => put(rb(0.02, y1 - y0 - 0.008, z1 - z0 - 0.008, 0.004), mat, 0.34, (y0 + y1) / 2, (z0 + z1) / 2);
  const bar = (y: number, z: number, w = 0.3) => put(bx(0.015, 0.012, w), handle, 0.36, y, z);
  const vbar = (y: number, z: number) => put(bx(0.015, 0.14, 0.012), handle, 0.36, y, z);
  // 1) 인덕션 아래 오븐
  F(-1.65, -0.85, 0.74, 0.88);
  bar(0.83, -1.25, 0.4);
  put(rb(0.02, 0.6, 0.78, 0.006), darkGlass, 0.34, 0.43, -1.25);
  put(bx(0.004, 0.26, 0.56), std(0x0b0b0c, 0.2), 0.352, 0.43, -1.25);
  put(cyl(0.01, 0.01, 0.6, 8), steel, 0.38, 0.68, -1.25, Math.PI / 2);
  for (const dz of [-0.28, 0.28]) put(bx(0.03, 0.012, 0.012), steel, 0.365, 0.68, -1.25 + dz);
  put(bx(0.012, 0.32, 0.22), std(0xffffff, 0.95, ctex(32, 64, (g) => {
    g.fillStyle = '#f3efe6';
    g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#b85c4a';
    for (const y of [8, 14, 48, 54]) g.fillRect(0, y, 32, 3);
  })), 0.39, 0.55, -1.1); // 손잡이에 건 행주
  // 2) 서랍 3단
  for (const [y0, y1] of [[0.1, 0.36], [0.36, 0.62], [0.62, 0.88]]) {
    F(-0.85, -0.03, y0, y1);
    bar(y1 - 0.05, -0.44);
  }
  // 3) 여닫이 2짝 · 4) 싱크 아래 2짝
  for (const [z0, z1] of [[-0.03, 0.38], [0.38, 0.79], [0.79, 1.22], [1.22, 1.65]]) F(z0, z1, 0.1, 0.88);
  for (const z of [0.34, 0.42, 1.18, 1.26]) vbar(0.78, z);
  // 걸레받이 위 손가락 홈 같은 가는 그림자 줄
  put(bx(0.005, 0.01, L), std(0x8d8a84, 0.8), 0.352, 0.1, 0);

  // 인덕션 + 냄비
  put(rb(0.52, 0.012, 0.66, 0.004), std(0xffffff, 0.2, cooktopTex()), 0.02, 0.925, -1.25);
  put(cyl(0.11, 0.1, 0.13, 22), steel, -0.06, 0.995, -1.36);
  put(cyl(0.113, 0.113, 0.01, 22), std(0xaeb2b8, 0.3), -0.06, 1.065, -1.36);
  put(ball(0.018, 10), std(0x2a2a2a, 0.5), -0.06, 1.08, -1.36);
  for (const dz of [-1, 1]) put(bx(0.03, 0.02, 0.05), std(0x2a2a2a, 0.5), -0.06, 1.03, -1.36 + dz * 0.13);
  // 주전자
  const kettle = std(0xa9c4b4, 0.45);
  put(cyl(0.065, 0.085, 0.17, 20), kettle, -0.05, 1.005, -0.62);
  put(cyl(0.03, 0.065, 0.03, 20), kettle, -0.05, 1.105, -0.62);
  put(cyl(0.012, 0.02, 0.12, 8), kettle, 0.03, 1.02, -0.62, 0, 0, -0.9);
  put(new THREE.TorusGeometry(0.06, 0.01, 8, 16, Math.PI), std(0x2a2a2a, 0.5), -0.05, 1.12, -0.62, 0, Math.PI / 2);
  // 도마 + 칼
  put(rb(0.28, 0.02, 0.4, 0.01), std(0xffffff, 0.6, woodTex('#d8b98a', '#a8865a')), 0.06, 0.93, -0.3, 0, 0.12);
  put(bx(0.03, 0.006, 0.2), steel, 0.08, 0.945, -0.28, 0, 0.3);
  put(bx(0.025, 0.012, 0.1), std(0x2a2a2a, 0.6), 0.115, 0.946, -0.15, 0, 0.3);
  // 조리도구 통 + 양념병
  put(cyl(0.05, 0.05, 0.13, 16), std(0xe9e2d4, 0.5), -0.27, 0.985, -0.76);
  for (let i = 0; i < 4; i++) put(cyl(0.008, 0.008, 0.26, 6), std(i % 2 ? 0x2a2a2a : 0xb08a5c, 0.6), -0.27 + (i - 1.5) * 0.015, 1.1, -0.76 + (i % 2 ? 0.01 : -0.01), 0, 0, (i - 1.5) * 0.08);
  for (const [z, c] of [[0.18, 0xd9a441], [0.26, 0x3b2a20], [0.33, 0xf0ece4]] as const) {
    put(cyl(0.032, 0.032, 0.18, 14), std(c, 0.3), -0.28, 1.01, z);
    put(cyl(0.012, 0.016, 0.05, 10), std(c, 0.3), -0.28, 1.125, z);
    put(cyl(0.013, 0.013, 0.02, 10), std(0x2a2a2a, 0.5), -0.28, 1.16, z);
  }
  // 식기 건조대 + 접시 + 컵
  put(bx(0.3, 0.02, 0.42), std(0xf6f6f4, 0.5), 0.05, 0.93, 0.57);
  for (const x of [-0.08, 0.18]) for (const z of [0.38, 0.76]) put(cyl(0.006, 0.006, 0.16, 6), steel, x, 1.01, z);
  for (let i = 0; i < 4; i++) put(cyl(0.11, 0.11, 0.012, 24), std(i === 2 ? 0x9fbde0 : 0xfbfaf6, 0.4), 0.02, 1.05, 0.46 + i * 0.06, Math.PI / 2 - 0.12);
  for (const z of [0.5, 0.62]) put(cyl(0.035, 0.03, 0.09, 14), std(0xfbfaf6, 0.4), 0.15, 0.985, z);
  // 싱크 볼 + 수전
  put(bx(0.4, 0.01, 0.45), std(0xb5b9be, 0.35), 0, 0.72, 1.225);
  for (const sx of [-1, 1]) put(bx(0.01, 0.2, 0.45), steel, sx * 0.2, 0.82, 1.225);
  for (const z of [1.0, 1.45]) put(bx(0.4, 0.2, 0.01), steel, 0, 0.82, z);
  put(cyl(0.025, 0.025, 0.004, 14), std(0x55585c, 0.4), 0, 0.727, 1.225);
  put(cyl(0.025, 0.03, 0.04, 14), steel, -0.3, 0.94, 1.225);
  put(cyl(0.015, 0.015, 0.3, 10), steel, -0.3, 1.09, 1.225);
  put(new THREE.TorusGeometry(0.1, 0.014, 8, 20, Math.PI), steel, -0.2, 1.24, 1.225);
  put(cyl(0.016, 0.016, 0.05, 10), steel, -0.1, 1.22, 1.225);
  put(bx(0.08, 0.012, 0.015), steel, -0.3, 0.97, 1.27, 0, 0.6);
  put(rb(0.1, 0.035, 0.07, 0.01), std(0xf2d34f, 0.9), 0.27, 0.94, 1.56); // 수세미
  // 허브 화분
  put(cyl(0.05, 0.04, 0.09, 14), std(0xd08a63, 0.85), -0.28, 0.965, 0.82);
  for (let i = 0; i < 7; i++) put(ball(0.03, 8), std(0x6fa060, 0.8), -0.28 + (rnd() - 0.5) * 0.06, 1.04 + rnd() * 0.05, 0.82 + (rnd() - 0.5) * 0.06);

  // 벽 타일
  const back = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.78), std(0xffffff, 0.4, tileTex()));
  back.rotation.y = Math.PI / 2;
  back.position.set(-0.34, 1.31, 0);
  back.receiveShadow = true;
  g.add(back);
  // 상부장 · 후드 · 간접등
  put(bx(0.36, 0.72, L), cab, -0.165, 2.06, 0);
  const n = 4;
  const dw = L / n;
  for (let i = 0; i < n; i++) {
    const zc = -L / 2 + dw * (i + 0.5);
    put(rb(0.02, 0.7, dw - 0.008, 0.004), front, 0.025, 2.06, zc);
    put(bx(0.015, 0.012, 0.18), handle, 0.045, 1.74, zc);
  }
  put(rb(0.4, 0.1, 0.72, 0.012), steel, -0.14, 1.65, -1.25);
  put(bx(0.02, 0.01, 0.4), std(0x2a2a2a, 0.5), 0.06, 1.62, -1.25);
  put(bx(0.03, 0.01, L - 0.1), glow(0xfff0cf), -0.02, 1.695, 0).castShadow = false;
}

/** 냉장고 (서쪽 벽, 앞 = 동쪽 +x): 위 양문 + 아래 서랍 2칸 */
function fridge(s: THREE.Object3D) {
  const [, put] = place(s, -4.55, -0.05);
  const beige = std(0xe8e2d7, 0.45);
  const sage = std(0xb7cbbd, 0.45);
  const handle = std(0x9a9ea4, 0.35);
  put(rb(0.7, 1.84, 0.84, 0.03), std(0xd8d4cc, 0.5), -0.02, 0.94, 0);
  for (const sz of [-1, 1]) {
    put(rb(0.05, 1.08, 0.414, 0.015), beige, 0.355, 1.31, sz * 0.2085);
    put(rb(0.05, 0.64, 0.414, 0.015), sage, 0.355, 0.42, sz * 0.2085);
    put(bx(0.02, 0.5, 0.02), handle, 0.39, 1.2, sz * 0.025);
    put(bx(0.02, 0.02, 0.3), handle, 0.385, 0.7, sz * 0.2085);
  }
  put(bx(0.02, 0.07, 0.8), std(0x3b3b3b, 0.8), 0.33, 0.045, 0);
  // 문 위 표시창
  put(rb(0.006, 0.06, 0.05, 0.002), std(0x1b1c1f, 0.3), 0.383, 1.5, 0.24);
  put(bx(0.002, 0.012, 0.03), glow(0x7fd3ff), 0.387, 1.5, 0.24);
  // 메모 · 사진 · 자석
  put(bx(0.004, 0.15, 0.12), std(0xfff1a8, 0.9), 0.384, 1.28, -0.24, 0.06);
  put(bx(0.004, 0.12, 0.1), std(0xffffff, 0.9, ctex(40, 48, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 40, 48);
    const sky = g.createLinearGradient(0, 4, 0, 36);
    sky.addColorStop(0, '#8ec5ff');
    sky.addColorStop(1, '#ffd29d');
    g.fillStyle = sky;
    g.fillRect(4, 4, 32, 32);
    g.fillStyle = '#3f7a45';
    g.fillRect(4, 28, 32, 8);
  })), 0.384, 1.45, -0.12, -0.08);
  for (const [y, z, c] of [[1.36, -0.24, 0xe07a4f], [1.52, -0.12, 0x5ab0ff], [1.1, -0.1, 0x7bd389]] as const) put(cyl(0.015, 0.015, 0.01, 12), std(c, 0.5), 0.39, y, z, 0, 0, Math.PI / 2);
}

/** TV 장 + TV + 사운드바 (앞 = 소파 쪽 +z) */
function tvSet(s: THREE.Object3D) {
  const [g, put] = place(s, 3.5, 0.22);
  const walnut = std(0xffffff, 0.55, woodTex('#7a5236', '#3f2716'));
  const inner = std(0x3b281b, 0.8);
  const dark = std(0x17181b, 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(cyl(0.022, 0.014, 0.14, 10), std(0x2a2a2a, 0.5), sx * 0.95, 0.07, sz * 0.15);
  // 몸통 (가운데는 열린 칸)
  put(rb(2.1, 0.03, 0.42, 0.01), walnut, 0, 0.525, 0);
  put(bx(2.06, 0.03, 0.4), walnut, 0, 0.155, 0);
  for (const sx of [-1, 1]) put(bx(0.03, 0.37, 0.42), walnut, sx * 1.035, 0.34, 0);
  for (const sx of [-1, 1]) put(bx(0.02, 0.34, 0.4), walnut, sx * 0.36, 0.34, 0);
  put(bx(2.06, 0.34, 0.02), inner, 0, 0.34, -0.195);
  put(bx(0.7, 0.015, 0.38), walnut, 0, 0.34, 0);
  // 양쪽 문 (세로 홈)
  const fluted = std(0xffffff, 0.6, flutedTex('#7a5236'));
  for (const sx of [-1, 1]) {
    put(rb(0.66, 0.33, 0.02, 0.006), fluted, sx * 0.695, 0.34, 0.205);
    put(cyl(0.006, 0.006, 0.1, 8), std(0xc9a45c, 0.35), sx * 0.4, 0.34, 0.225);
  }
  // 열린 칸: 게임기 · 공유기 · 책
  put(rb(0.3, 0.07, 0.22, 0.012), std(0xf2f2f4, 0.4), 0, 0.21, 0.02);
  put(bx(0.18, 0.004, 0.006), glow(0x5ab0ff), 0, 0.2, 0.132);
  put(rb(0.18, 0.04, 0.12, 0.01), dark, -0.15, 0.37, -0.02);
  for (const dx of [-0.06, 0.06]) put(cyl(0.006, 0.006, 0.12, 6), dark, -0.15 + dx, 0.45, -0.06);
  for (let i = 0; i < 4; i++) put(rb(0.03, 0.14 + i * 0.01, 0.15, 0.004), std([0xb85c4a, 0xe8d5b0, 0x3f5a6b, 0x9fb79a][i], 0.8), 0.18 + i * 0.035, 0.42 + i * 0.005, 0.0);
  // TV (얇은 베젤 + 받침)
  put(rb(0.42, 0.015, 0.22, 0.006), dark, 0, 0.548, -0.02);
  put(rb(0.08, 0.14, 0.04, 0.01), dark, 0, 0.61, -0.06);
  put(rb(1.62, 0.94, 0.045, 0.012), dark, 0, 1.13, -0.05);
  put(rb(1.0, 0.5, 0.06, 0.03), dark, 0, 1.08, -0.09);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.57, 0.89), new THREE.MeshBasicMaterial({ map: tvTex() }));
  scr.position.set(0, 1.13, -0.026);
  g.add(scr);
  // 사운드바
  put(rb(0.9, 0.065, 0.09, 0.025, 3), std(0xffffff, 0.9, fabricTex('#2c2e33', '#5a5d66', 4)), 0, 0.575, 0.15);
  // 양 끝 소품: 화분 · 초 · 액자
  put(cyl(0.07, 0.055, 0.14, 18), std(0xf0ece4, 0.5), -0.85, 0.61, 0.02);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    put(new THREE.ConeGeometry(0.018, 0.2 + rnd() * 0.12, 6), std(0x5f9a5c, 0.8), -0.85 + Math.cos(a) * 0.03, 0.78, 0.02 + Math.sin(a) * 0.03, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
  }
  put(cyl(0.045, 0.045, 0.09, 16), std(0xe9dccb, 0.6), 0.78, 0.585, 0.08);
  put(cyl(0.004, 0.004, 0.02, 6), std(0x2a2a2a, 0.6), 0.78, 0.64, 0.08);
  put(rb(0.18, 0.22, 0.02, 0.006), std(0x2a2a2a, 0.5), 0.92, 0.65, -0.02, -0.12);
  put(bx(0.14, 0.18, 0.004), std(0xffffff, 0.8, artTex()), 0.92, 0.65, -0.008, -0.12);
}

/** 거실 테이블 (둥근 모서리 상판 + 아래 선반) */
function coffeeTable(s: THREE.Object3D) {
  const [, put] = place(s, 3.4, 1.75);
  const oak = std(0xffffff, 0.55, woodTex('#c9a27a', '#8f6a45', [0.5, 0.5]));
  const shape = new THREE.Shape();
  const w = 0.6;
  const d = 0.35;
  const r = 0.12;
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  topGeo.rotateX(-Math.PI / 2);
  put(topGeo, oak, 0, 0.402, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(cyl(0.024, 0.016, 0.4, 10), oak, sx * 0.46, 0.2, sz * 0.22, sz * 0.06, 0, -sx * 0.06);
  put(rb(1.0, 0.02, 0.5, 0.008), oak, 0, 0.12, 0);
  // 아래 선반: 잡지
  put(rb(0.24, 0.012, 0.32, 0.003), std(0xe07a4f, 0.8), -0.22, 0.137, 0.02, 0, 0.1);
  put(rb(0.22, 0.01, 0.3, 0.003), std(0xf1e6d4, 0.8), -0.2, 0.148, 0.0, 0, -0.06);
  // 위: 머그 · 리모컨 · 과일 그릇 · 책
  const top = 0.44;
  const mug = std(0xf0ece4, 0.5);
  put(cyl(0.04, 0.036, 0.09, 16), mug, 0.3, top + 0.045, 0.12);
  put(new THREE.TorusGeometry(0.026, 0.008, 8, 16), mug, 0.343, top + 0.05, 0.12);
  put(rb(0.05, 0.02, 0.18, 0.008), std(0x2a2a2c, 0.5), 0.05, top + 0.01, 0.14, 0, 0.5);
  const bowl = new THREE.LatheGeometry(
    [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.06, 0.0), new THREE.Vector2(0.11, 0.035), new THREE.Vector2(0.13, 0.07), new THREE.Vector2(0.125, 0.072)],
    24,
  );
  const b = put(bowl, std(0x5f7d8c, 0.5), -0.28, top, -0.06);
  (b.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  for (const [x, z] of [[-0.31, -0.08], [-0.25, -0.03], [-0.27, -0.1]]) put(ball(0.04, 12), std(0xf09a3e, 0.7), x, top + 0.07, z);
  put(rb(0.2, 0.03, 0.27, 0.004), std(0x3f5a6b, 0.8), 0.25, top + 0.015, -0.12, 0, -0.2);
}

/** 신발장 (남쪽 허리벽 앞, 앞 = 북쪽 -z) + 현관 매트 · 신발 */
function entrance(s: THREE.Object3D) {
  const [, put] = place(s, -2.9, 3.75);
  const body = std(0xffffff, 0.6, woodTex('#e3d3bb', '#b9a07f'));
  const doors = std(0xffffff, 0.6, flutedTex('#e3d3bb'));
  const brass = std(0xc9a45c, 0.35);
  put(bx(1.34, 0.06, 0.34), std(0x3b3b3b, 0.8), 0, 0.03, 0.02);
  put(rb(1.4, 0.74, 0.4, 0.015), body, 0, 0.43, 0);
  for (let i = 0; i < 3; i++) {
    const x = -0.466 + i * 0.466;
    put(rb(0.455, 0.7, 0.02, 0.005), doors, x, 0.43, -0.205);
    put(ball(0.014, 10), brass, x + (i === 2 ? -0.19 : 0.19), 0.66, -0.222);
  }
  // 위: 열쇠 접시 · 디퓨저 · 작은 화분
  put(cyl(0.08, 0.06, 0.02, 20), std(0x6b4630, 0.5), -0.4, 0.81, 0);
  put(new THREE.TorusGeometry(0.018, 0.004, 6, 12), brass, -0.42, 0.825, 0.01, Math.PI / 2);
  put(rb(0.025, 0.05, 0.012, 0.004), std(0x2a2a2a, 0.6), -0.38, 0.825, -0.02, Math.PI / 2, 0, 0.4);
  put(cyl(0.035, 0.04, 0.1, 14), std(0x9fb79a, 0.25), 0.1, 0.85, 0.02);
  for (let i = 0; i < 5; i++) put(cyl(0.003, 0.003, 0.22, 4), std(0x3b2a20, 0.8), 0.1 + (i - 2) * 0.008, 1.0, 0.02, (i - 2) * 0.1, 0, (i - 2) * 0.12);
  put(cyl(0.06, 0.05, 0.1, 16), std(0xd08a63, 0.85), 0.48, 0.85, 0.0);
  for (let i = 0; i < 6; i++) put(ball(0.045, 10), std(0x5f9a5c, 0.8), 0.48 + (rnd() - 0.5) * 0.07, 0.93 + rnd() * 0.06, (rnd() - 0.5) * 0.07);

  // 현관 매트 + 운동화 한 켤레 + 슬리퍼
  const [, p2] = place(s, -4.45, 2.5);
  p2(rb(0.7, 0.012, 0.95, 0.005), std(0xffffff, 1, ctex(64, 64, (g) => {
    g.fillStyle = '#b08a5c';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 64, 1.5);
  }, [3, 4])), 0, 0.006, 0);
  const shoe = (x: number, z: number, ry: number, c: number) => {
    const [, p] = place(s, x, z, ry);
    p(rb(0.1, 0.03, 0.27, 0.012), std(0xf6f6f4, 0.6), 0, 0.015, 0);
    p(rb(0.095, 0.075, 0.2, 0.035, 3), std(c, 0.7), 0, 0.065, 0.03);
    p(rb(0.09, 0.04, 0.09, 0.03, 3), std(c, 0.7), 0, 0.045, -0.08);
  };
  shoe(-4.6, 3.45, 0.15, 0x3f5a6b);
  shoe(-4.45, 3.5, -0.1, 0x3f5a6b);
  shoe(-4.6, 1.55, 2.9, 0xf1e6d4);
  shoe(-4.45, 1.58, 3.2, 0xf1e6d4);
}

/** 몬스테라 화분 (창가) */
function plant(s: THREE.Object3D) {
  const [g, put] = place(s, 1.6, -3.55);
  const pot = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0.19, 0.3), new THREE.Vector2(0.2, 0.36), new THREE.Vector2(0.18, 0.36), new THREE.Vector2(0.17, 0.33)],
    28,
  );
  put(pot, std(0xece6dc, 0.5), 0, 0, 0);
  put(cyl(0.175, 0.175, 0.01, 24), std(0x3b2a20, 1), 0, 0.33, 0);
  const stem = std(0x4f7d45, 0.8);
  const leafMat = new THREE.MeshStandardMaterial({ map: monsteraTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
  const leafGeo = new THREE.PlaneGeometry(0.42, 0.42).translate(0, 0.2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + 0.3;
    const h = 0.7 + rnd() * 0.55;
    const r = 0.1 + rnd() * 0.18;
    const tip = new THREE.Vector3(Math.sin(a) * r, h, Math.cos(a) * r);
    const base = new THREE.Vector3(0, 0.33, 0);
    const dir = tip.clone().sub(base);
    const st = put(cyl(0.008, 0.011, dir.length(), 6), stem, 0, 0, 0);
    st.position.copy(base).addScaledVector(dir, 0.5);
    st.quaternion.setFromUnitVectors(up, dir.normalize());
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.userData.keepMaterial = true;
    leaf.castShadow = true;
    leaf.position.copy(tip);
    leaf.rotation.set(0.9 + rnd() * 0.5, a, 0, 'YXZ');
    g.add(leaf);
  }
}

/** 주름진 커튼 한 폭 */
function curtain(w: number, h: number, mat: THREE.Material) {
  const geo = new THREE.PlaneGeometry(w, h, 32, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI * 2 * 5) * 0.035);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export interface HomeLayout {
  /** 침대 스탠드 갓 (잠자기 연출에서 밝기를 바꾼다) */
  lampMat: THREE.MeshBasicMaterial;
  /** 북쪽 창 (방 좌표) */
  win: { x0: number; x1: number; z: number };
  /** 천장 높이 */
  H: number;
  /** 동쪽 벽 안쪽 x */
  eastX: number;
}

/** 집 가구를 모두 놓는다 (소파는 sofaModel 이 따로) */
export function furnishHome(s: THREE.Object3D, o: HomeLayout): THREE.Group {
  const root = new THREE.Group();
  s.add(root);
  o.lampMat.side = THREE.DoubleSide;
  bed(root);
  nightstand(root, o.lampMat);
  desk(root);
  chair(root);
  kitchen(root);
  fridge(root);
  tvSet(root);
  coffeeTable(root);
  entrance(root);
  plant(root);

  // 러그
  const rug = new THREE.Mesh(rb(2.6, 0.015, 2.2, 0.006), std(0xffffff, 1, homePhoto('rug-heart', 1, 1)));
  rug.position.set(0.3, 0.0075, 1.2);
  rug.receiveShadow = true;
  root.add(rug);

  // 커튼 (주름) + 커튼봉
  const linen = std(0xffffff, 1, homePhoto('curtain-lace', 1, 2.2));
  linen.side = THREE.DoubleSide;
  const ch = o.H - 0.2;
  for (const cx of [o.win.x0 - 0.3, o.win.x1 + 0.3]) {
    const c = curtain(0.6, ch, linen);
    c.position.set(cx, ch / 2 + 0.02, o.win.z + 0.17);
    root.add(c);
  }
  const rodMat = std(0x2b2b2b, 0.4);
  const rodW = o.win.x1 - o.win.x0 + 1.4;
  const rod = new THREE.Mesh(cyl(0.015, 0.015, rodW, 10), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set((o.win.x0 + o.win.x1) / 2, o.H - 0.12, o.win.z + 0.17);
  root.add(rod);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(ball(0.03, 10), rodMat);
    f.position.set((o.win.x0 + o.win.x1) / 2 + (sx * rodW) / 2, o.H - 0.12, o.win.z + 0.17);
    root.add(f);
  }

  // 동쪽 벽 액자 (원목 틀 + 흰 여백 + 그림)
  {
    const [g, put] = place(root, o.eastX - 0.03, 2.0, -Math.PI / 2);
    put(rb(1.26, 0.86, 0.04, 0.008), std(0xffffff, 0.6, woodTex('#f3e6d6', '#d9c3a8')), 0, 1.7, 0);
    put(bx(1.16, 0.76, 0.01), std(0xfbfaf6, 0.9), 0, 1.7, 0.018);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.58), std(0xffffff, 0.9, homePhoto('art-bunny', 1, 1)));
    art.position.set(0, 1.7, 0.025);
    g.add(art);
  }

  toonify(root, undefined, { matte: true });
  return root;
}

/** 잠잘 때 덮는 두툼한 누빔 이불 */
export function sleepDuvet(): THREE.Mesh {
  const m = new THREE.Mesh(rb(2.3, 0.2, 1.8, 0.08, 3), std(0xffffff, 0.95, homePhoto('quilt-pink', 3, 2.4)));
  m.castShadow = m.receiveShadow = true;
  return m;
}
