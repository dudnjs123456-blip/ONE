import * as THREE from 'three';
import { KARAOKE_BOOTHS, KARAOKE_HALL, KARAOKE_LOBBY_Z, type StoreLayout } from '../city/store';
import { SONG_PRICE } from '../city/karaoke';

/**
 * 코인노래방 안 (펫샵 건물 2층): 어두운 보라 조명 · 복도 천장 네온 띠 · 방 넷.
 * 방마다 바깥 벽에 큰 화면과 노래방 기계 · 양옆 스피커, 긴 벽에 소파, 가운데 테이블 (마이크 둘 · 탬버린),
 * 천장 미러볼과 방마다 다른 색 조명. 로비엔 카운터 위 네온 간판 · 요금표 · 대기 소파.
 */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const H = 3;
/** 방마다 조명 색 (1~4번방) */
const BOOTH_COLORS = [0xff4fd8, 0x38d9ff, 0xffc24a, 0x7cff6b];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 노래방 화면 (대기 화면): 방 번호 + '노래를 골라 주세요' + 인기곡 순위 */
function screenTex(no: number) {
  return canvasTex(512, 288, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 288);
    grd.addColorStop(0, '#1b0b4a');
    grd.addColorStop(1, '#0b2a5a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 288);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffe9ff';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 16;
    g.font = `900 64px ${FONT}`;
    g.fillText('♪ SING!', 256, 70);
    g.shadowBlur = 0;
    g.font = `700 26px ${FONT}`;
    g.fillStyle = '#9ff1ff';
    g.fillText(`${no}번방 · 노래방 기계에서 노래를 골라 주세요`, 256, 132);
    g.font = `600 20px ${FONT}`;
    g.fillStyle = '#ffffffcc';
    g.textAlign = 'left';
    ['인기곡 1위 ─────', '인기곡 2위 ─────', '인기곡 3위 ─────'].forEach((t, i) => g.fillText(t, 150, 180 + i * 30));
    g.textAlign = 'center';
    g.fillStyle = '#ffd24a';
    g.font = `800 20px ${FONT}`;
    g.fillText(`한 곡 ${SONG_PRICE}G`, 256, 272);
  });
}

/** 방 문 위 번호판 */
function plateTex(no: number, color: number) {
  return canvasTex(128, 96, (g) => {
    g.fillStyle = '#12051c';
    g.fillRect(0, 0, 128, 96);
    const c = `#${new THREE.Color(color).getHexString()}`;
    g.strokeStyle = c;
    g.lineWidth = 6;
    g.shadowColor = c;
    g.shadowBlur = 10;
    g.strokeRect(6, 6, 116, 84);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 52px ${FONT}`;
    g.fillText(`${no}`, 64, 50);
  });
}

/** 로비 네온 간판 */
function lobbySignTex() {
  return canvasTex(768, 200, (g) => {
    g.fillStyle = '#12051c';
    g.fillRect(0, 0, 768, 200);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 22;
    g.fillStyle = '#ffe9ff';
    g.font = `900 92px ${FONT}`;
    g.fillText('코인노래방', 384, 86);
    g.shadowColor = '#38d9ff';
    g.fillStyle = '#9ff1ff';
    g.font = `800 34px ${FONT}`;
    g.fillText('COIN KARAOKE · 2F', 384, 160);
  });
}

/** 요금 · 이용 안내판 */
function priceTex() {
  return canvasTex(384, 384, (g) => {
    g.fillStyle = '#1d0b2b';
    g.fillRect(0, 0, 384, 384);
    g.strokeStyle = '#ffd24a';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 368, 368);
    g.textAlign = 'center';
    g.fillStyle = '#ffd24a';
    g.font = `900 46px ${FONT}`;
    g.fillText('이용 안내', 192, 66);
    g.fillStyle = '#ffffff';
    g.font = `800 40px ${FONT}`;
    g.fillText(`1곡 ${SONG_PRICE}G`, 192, 136);
    g.font = `600 24px ${FONT}`;
    g.fillStyle = '#e9d5ff';
    ['빈 방 아무 데나 OK', '방 안 기계에서 결제', '30초 넘게 부르면 점수!', '탬버린 · 박수 환영 🔔'].forEach((t, i) => g.fillText(t, 192, 196 + i * 42));
  });
}

export interface KaraokeInterior {
  tick(t: number): void;
  /** 방 문 (방 번호 → 열린 정도 0~1) */
  doors: Map<number, { setOpen(t: number): void }>;
}

export function buildKaraokeInterior(g: THREE.Group, L: StoreLayout): KaraokeInterior {
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
  const glow = (color: number, intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };
  const rect = (id: string) => L.furniture.find((f) => f.id === id)!.rect;
  const spin: THREE.Object3D[] = [];
  const pulse: { mat: THREE.MeshStandardMaterial; base: number; phase: number }[] = [];
  const lights: { l: THREE.PointLight; base: number; phase: number }[] = [];
  const doors = new Map<number, { setOpen(t: number): void }>();
  const leafGlass = new THREE.MeshStandardMaterial({ color: 0x6a3b8f, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.3, depthWrite: false });
  const leafFrame = std(0x1a1a20, 0.3, 0.6);

  // ── 칸막이 벽: 허리 높이 벽 + 위는 짙은 반투명 유리 (위에서 내려다봐도 방 안이 보이게) ──
  const partMat = std(0x2b1640, 0.85);
  const skirt = std(0x120818, 0.6);
  const rail = std(0x15151a, 0.3, 0.6);
  const tint = new THREE.MeshStandardMaterial({ color: 0x8a5cc8, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false });
  const WALL_H = 1.1;
  const GLASS_TOP = 2.3;
  for (const f of L.furniture) {
    if (!f.id.startsWith('wall:')) continue;
    const r = f.rect;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    box(w, WALL_H, d, partMat, cx, WALL_H / 2, cz);
    box(w + 0.02, 0.12, d + 0.02, skirt, cx, 0.06, cz, false);
    box(w + 0.02, 0.04, d + 0.02, rail, cx, WALL_H + 0.02, cz, false);
    const pane = box(Math.max(w - 0.04, 0.02), GLASS_TOP - WALL_H, Math.max(d - 0.04, 0.02), tint, cx, (WALL_H + GLASS_TOP) / 2, cz, false);
    pane.renderOrder = 2;
    box(w + 0.02, 0.04, d + 0.02, rail, cx, GLASS_TOP, cz, false);
  }

  // ── 복도: 카펫 + 천장 네온 띠 둘 ──
  const hallLen = KARAOKE_LOBBY_Z - L.room.z0;
  const hallZ = (L.room.z0 + KARAOKE_LOBBY_Z) / 2;
  const carpetTex = canvasTex(128, 128, (c) => {
    c.fillStyle = '#1b0d2a';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = ['#ff4fd855', '#38d9ff55', '#ffd24a44'][i % 3];
      c.beginPath();
      c.arc((i * 37) % 128, (i * 61) % 128, 3 + (i % 4), 0, Math.PI * 2);
      c.fill();
    }
  });
  carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
  const carpet = (w: number, d: number, x: number, z: number) => {
    const t = carpetTex.clone();
    t.repeat.set(w, d);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    g.add(m);
  };
  carpet(KARAOKE_HALL * 2, hallLen, 0, hallZ);
  // 복도 바닥 양쪽 LED 띠
  for (const s of [-1, 1]) {
    const strip = box(0.04, 0.02, hallLen, glow(s < 0 ? 0xff4fd8 : 0x38d9ff, 1.6), s * (KARAOKE_HALL - 0.14), 0.02, hallZ, false);
    pulse.push({ mat: strip.material as THREE.MeshStandardMaterial, base: 1.6, phase: s });
  }

  // ── 방 넷 ──
  KARAOKE_BOOTHS.forEach((b, i) => {
    const r = b.rect;
    const col = BOOTH_COLORS[i % BOOTH_COLORS.length];
    const cz = (r.z0 + r.z1) / 2;
    const outX = b.side < 0 ? r.x0 : r.x1;
    const inward = -b.side;
    const hallX = b.side < 0 ? r.x1 : r.x0;
    carpet(r.x1 - r.x0 - 0.12, r.z1 - r.z0 - 0.12, (r.x0 + r.x1) / 2, cz);

    // 문틀 (네온) + 문 위 번호판
    const frame = glow(col, 0.6);
    for (const s of [-1, 1]) box(0.05, GLASS_TOP, 0.04, frame, hallX, GLASS_TOP / 2, b.doorZ + s * 0.49, false);
    box(0.05, 0.04, 1.02, frame, hallX, GLASS_TOP, b.doorZ, false);
    // 번호판: 문 위 (복도 쪽에서 보이게)
    const plate = plateTex(b.no, col);
    plane(0.42, 0.32, new THREE.MeshBasicMaterial({ map: plate }), hallX - inward * 0.075, GLASS_TOP + 0.24, b.doorZ, b.side < 0 ? Math.PI / 2 : -Math.PI / 2);
    plane(0.42, 0.32, new THREE.MeshBasicMaterial({ map: plate }), hallX - inward * 0.075, GLASS_TOP + 0.24, b.doorZ, b.side < 0 ? -Math.PI / 2 : Math.PI / 2).position.x = hallX + inward * 0.075;

    // 방 유리문: 경첩은 문 북쪽 끝, 방 안쪽으로 열린다 (빌린 방만 열림)
    {
      const dw = 0.95;
      const pivot = new THREE.Group();
      pivot.position.set(hallX, 0, b.doorZ - dw / 2);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.15, dw - 0.06), leafGlass);
      pane.position.set(0, 1.1, dw / 2);
      pane.renderOrder = 2;
      pivot.add(pane);
      for (const zz of [0.02, dw - 0.02]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.04), leafFrame);
        post.position.set(0, 1.1, zz);
        pivot.add(post);
      }
      for (const yy of [0.03, 2.18]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, dw), leafFrame);
        bar.position.set(0, yy, dw / 2);
        pivot.add(bar);
      }
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.04), std(0xd3d6db, 0.2, 1));
      knob.position.set(0, 1.0, dw - 0.12);
      pivot.add(knob);
      g.add(pivot);
      let cur = 0;
      doors.set(b.no, {
        setOpen(t: number) {
          cur += (t - cur) * 0.15;
          pivot.rotation.y = b.side * 1.35 * cur;
        },
      });
    }

    // 화면 (바깥 벽) + 노래방 기계 + 스피커
    const scr = new THREE.MeshStandardMaterial({ map: screenTex(b.no), emissive: 0xffffff, roughness: 0.3 });
    scr.emissiveMap = scr.map;
    scr.emissiveIntensity = 0.9;
    plane(1.9, 1.07, scr, outX + inward * 0.09, 1.75, cz, b.side < 0 ? Math.PI / 2 : -Math.PI / 2);
    box(0.06, 1.17, 2.0, std(0x0b0b0f, 0.3, 0.4), outX + inward * 0.05, 1.75, cz);
    pulse.push({ mat: scr, base: 0.9, phase: i * 1.7 });
    const m = rect(`machine:${b.no}`);
    const mcx = (m.x0 + m.x1) / 2;
    box(m.x1 - m.x0, 0.95, m.z1 - m.z0, std(0x1a1a22, 0.4, 0.5), mcx, 0.475, cz);
    // 기계 버튼 · 코인 투입구 불빛
    box(0.02, 0.18, 0.5, glow(col, 1.4), mcx + inward * ((m.x1 - m.x0) / 2 + 0.005), 0.75, cz, false);
    for (let k = 0; k < 4; k++) box(0.02, 0.05, 0.05, glow([0xff4040, 0x40ff70, 0x40a0ff, 0xffe040][k], 1.5), mcx + inward * ((m.x1 - m.x0) / 2 + 0.006), 0.55, cz - 0.18 + k * 0.12, false);
    for (const s of [-1, 1]) {
      const sz = cz + s * 0.85;
      box(0.35, 0.8, 0.32, std(0x15151a, 0.5, 0.3), outX + inward * 0.2, 0.4, sz);
      for (const y of [0.25, 0.58]) {
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), std(0x333338, 0.6));
        cone.rotation.z = Math.PI / 2;
        cone.position.set(outX + inward * 0.38, y, sz);
        g.add(cone);
      }
    }

    // 소파 (방 긴 벽 쪽): 앉는 판 + 등받이 + 팔걸이
    const sf = rect(`sofa:${b.no}`);
    const leather = std([0x7a1f5a, 0x1f4a7a, 0x7a5a1f, 0x2f6a2f][i % 4], 0.55);
    const sw = sf.x1 - sf.x0;
    const sx = (sf.x0 + sf.x1) / 2;
    box(sw, 0.42, sf.z1 - sf.z0, leather, sx, 0.21, (sf.z0 + sf.z1) / 2);
    box(sw, 0.5, 0.16, leather, sx, 0.67, sf.z0 + 0.08);
    for (const s of [-1, 1]) box(0.14, 0.6, sf.z1 - sf.z0, leather, sx + s * (sw / 2 - 0.07), 0.3, (sf.z0 + sf.z1) / 2);
    // 방석 줄눈
    for (let k = 1; k < 3; k++) box(0.015, 0.02, sf.z1 - sf.z0 - 0.2, std(0x111111, 1), sf.x0 + (sw * k) / 3, 0.43, (sf.z0 + sf.z1) / 2, false);

    // 테이블 + 마이크 둘 + 탬버린 + 노래책
    const tb = rect(`table:${b.no}`);
    const tcx = (tb.x0 + tb.x1) / 2;
    const tcz = (tb.z0 + tb.z1) / 2;
    const tw = tb.x1 - tb.x0;
    box(tw, 0.05, tb.z1 - tb.z0, std(0x101014, 0.15, 0.3), tcx, 0.5, tcz);
    box(tw - 0.1, 0.48, tb.z1 - tb.z0 - 0.1, std(0x1c1c22, 0.6), tcx, 0.24, tcz);
    box(tw + 0.02, 0.012, tb.z1 - tb.z0 + 0.02, glow(col, 0.9), tcx, 0.475, tcz, false);
    for (const s of [-1, 1]) {
      const mic = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.2, 12), std(0x222226, 0.3, 0.6));
      body.rotation.z = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), std(0x9a9aa2, 0.3, 0.9));
      head.position.x = 0.12;
      mic.add(body, head);
      mic.position.set(tcx + s * 0.28, 0.55, tcz + 0.05 * s);
      mic.rotation.y = s * 0.4;
      g.add(mic);
    }
    const tamb = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20), std(0xd9b04a, 0.4, 0.6));
    tamb.rotation.x = Math.PI / 2;
    tamb.position.set(tcx, 0.545, tcz - 0.12);
    g.add(tamb);
    box(0.24, 0.03, 0.17, std(0xc0392b, 0.6), tcx - inward * 0.45, 0.54, tcz + 0.05);

    // 천장 미러볼 + 방 조명 (색이 은은하게 출렁인다)
    const ballX = (r.x0 + r.x1) / 2 - inward * 0.3;
    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.1, metalness: 1, flatShading: true, emissive: col, emissiveIntensity: 0.25 }),
    );
    ball.position.set(ballX, H - 0.35, cz);
    g.add(ball);
    box(0.01, 0.2, 0.01, std(0x888888), ballX, H - 0.1, cz, false);
    spin.push(ball);
    const l = new THREE.PointLight(col, 2.2, 4.2, 1.6);
    l.position.set(ballX, H - 0.6, cz);
    g.add(l);
    lights.push({ l, base: 2.2, phase: i * 1.3 });
  });

  // ── 로비: 카운터 위 네온 간판 · 요금표 · 대기 소파 · 화분 ──
  const lobbyZ = (KARAOKE_LOBBY_Z + L.room.z1) / 2;
  const signMat = new THREE.MeshBasicMaterial({ map: lobbySignTex() });
  plane(2.1, 0.55, signMat, L.room.x1 - 0.09, 2.45, 2.05, -Math.PI / 2);
  // 요금표: 대기 소파 위 서쪽 벽
  plane(0.7, 0.7, new THREE.MeshBasicMaterial({ map: priceTex() }), L.room.x0 + 0.09, 1.65, 2.3, Math.PI / 2);
  const ws = rect('waitSofa');
  const wsMat = std(0x5a2a7a, 0.55);
  box(ws.x1 - ws.x0, 0.42, ws.z1 - ws.z0, wsMat, (ws.x0 + ws.x1) / 2, 0.21, (ws.z0 + ws.z1) / 2);
  box(0.16, 0.5, ws.z1 - ws.z0, wsMat, ws.x0 + 0.08, 0.67, (ws.z0 + ws.z1) / 2);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 16), std(0x2b2b30, 0.6));
  pot.position.set(L.room.x0 + 0.35, 0.2, 3.65);
  g.add(pot);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), std(0x2f7a3a, 0.8));
  leaf.position.set(L.room.x0 + 0.35, 0.72, 3.65);
  leaf.scale.y = 1.4;
  g.add(leaf);
  // 로비 바닥 네온 고리 (출입문 앞 → 복도 입구 사이)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 8, 40), glow(0xff4fd8, 1.6));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.02, lobbyZ - 0.3);
  g.add(ring);
  pulse.push({ mat: ring.material as THREE.MeshStandardMaterial, base: 1.6, phase: 0.5 });

  return {
    doors,
    tick(t: number) {
      for (const s of spin) s.rotation.y = t * 0.8;
      for (const p of pulse) p.mat.emissiveIntensity = p.base * (0.8 + 0.2 * Math.sin(t * 2.2 + p.phase));
      for (const q of lights) q.l.intensity = q.base * (0.75 + 0.25 * Math.sin(t * 1.6 + q.phase));
    },
  };
}
