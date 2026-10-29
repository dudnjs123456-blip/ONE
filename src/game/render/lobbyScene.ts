import * as THREE from 'three';
import { LOBBY } from '../city/cityWorld';
import { placeFurniture } from './furnitureKit';
import { glassMaterial } from './glassKit';
import { swingDoors, type DoorControl } from './signage';

/**
 * 행복빌라 1층 로비: 남쪽 유리 현관, 북쪽 엘리베이터·계단, 동쪽 우편함, 서쪽 경비 데스크와 의자.
 */
export function buildLobbyScene(s: THREE.Scene): { door: DoorControl } {
  s.background = new THREE.Color(0x14161c);
  s.add(new THREE.HemisphereLight(0xf4f6ff, 0x3a3832, 0.7));
  const { x0, x1, z0, z1 } = LOBBY.room;
  const W = x1 - x0;
  const D = z1 - z0;
  const H = 2.9;

  const std = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    s.add(m);
    return m;
  };
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // 바닥: 대리석 타일
  const floorTex = canvasTex(256, 256, (g) => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#e9e5dc' : '#d9d3c7';
        g.fillRect(i * 64, j * 64, 64, 64);
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.strokeRect(i * 64, j * 64, 64, 64);
      }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 2.4, D / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);
  // 현관 매트
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1), std(0x4a3b33, 1));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0.5, 0.01, 3.3);
  s.add(mat);

  // 벽
  const wall = std(0xece6da, 0.95);
  const wainscot = std(0x8a6f58, 0.8);
  const elevX = 2.0;
  box(elevX - 0.8 - x0, H, 0.15, wall, (x0 + elevX - 0.8) / 2, H / 2, z0); // 북쪽 (엘리베이터 왼쪽)
  box(x1 - (elevX + 0.8), H, 0.15, wall, (elevX + 0.8 + x1) / 2, H / 2, z0); // 북쪽 (오른쪽)
  box(1.6, H - 2.2, 0.15, wall, elevX, 2.2 + (H - 2.2) / 2, z0); // 엘리베이터 위
  box(0.15, H, D, wall, x0, H / 2, 0); // 서쪽
  box(0.15, H, D, wall, x1, H / 2, 0); // 동쪽
  // 남쪽: 낮은 벽 + 유리 현관 (카메라 쪽이라 허리 높이까지만)
  box(0.5 - 0.9 - x0, 1.0, 0.15, wall, (x0 + 0.5 - 0.9) / 2, 0.5, z1);
  box(x1 - (0.5 + 0.9), 1.0, 0.15, wall, (0.5 + 0.9 + x1) / 2, 0.5, z1);
  const glass = glassMaterial();
  // 유리 양문 (밖으로 열린다): 문틀 + 짝 두 개
  const doorFrame = std(0x555a60, 0.3, 0.7);
  for (const gx of [-0.43, 1.43]) box(0.06, 2.3, 0.1, doorFrame, gx, 1.15, z1);
  box(1.92, 0.08, 0.1, doorFrame, 0.5, 2.26, z1);
  const door = swingDoors(s, 0.5, z1 + 0.04, 1.8, 2.2, doorFrame, glass, std(0xd3d6db, 0.2, 1));
  door.setOpen(0);
  // 아래쪽 걸레받이 (나무)
  box(0.04, 0.9, D, wainscot, x0 + 0.09, 0.45, 0);
  box(0.04, 0.9, D, wainscot, x1 - 0.09, 0.45, 0);

  // 엘리베이터: 금속 문 두 짝 + 층 표시
  const steel = std(0xb8bec4, 0.25, 0.85);
  box(1.7, 2.3, 0.1, std(0x6b7076, 0.4, 0.6), elevX, 1.15, z0 + 0.02);
  box(0.66, 2.1, 0.06, steel, elevX - 0.34, 1.05, z0 + 0.1);
  box(0.66, 2.1, 0.06, steel, elevX + 0.34, 1.05, z0 + 0.1);
  const floorNo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.22),
    new THREE.MeshBasicMaterial({
      map: canvasTex(128, 56, (g) => {
        g.fillStyle = '#111';
        g.fillRect(0, 0, 128, 56);
        g.fillStyle = '#ff4a3a';
        g.font = 'bold 40px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('▲ 1', 64, 30);
      }),
    }),
  );
  floorNo.position.set(elevX, 2.48, z0 + 0.09);
  s.add(floorNo);
  box(0.08, 0.16, 0.04, std(0xdddddd, 0.3, 0.6), elevX + 1.05, 1.15, z0 + 0.1); // 호출 버튼

  // 계단 (북동쪽, 북쪽으로 올라간다)
  const st = LOBBY.stairs;
  const steps = 9;
  const stepD = (st.z1 - st.z0) / steps;
  for (let k = 0; k < steps; k++) {
    const h = 0.18 * (k + 1);
    box(st.x1 - st.x0, h, stepD, std(k % 2 ? 0xb9b2a5 : 0xc4bdb0, 0.8), (st.x0 + st.x1) / 2, h / 2, st.z1 - stepD * (k + 0.5));
  }
  // 난간: 계단 기울기를 따라가는 가는 손잡이 + 양 끝 기둥
  const run = st.z1 - st.z0;
  const rise = 0.18 * steps;
  const railM = std(0x4a4a4a, 0.4, 0.6);
  const rail = box(0.05, 0.05, Math.hypot(run, rise), railM, st.x0, 0.95 + rise / 2, (st.z0 + st.z1) / 2);
  rail.rotation.x = Math.atan2(rise, run);
  box(0.05, 0.95, 0.05, railM, st.x0, 0.18 + 0.47, st.z1 - 0.1);
  box(0.05, 0.95, 0.05, railM, st.x0, rise + 0.47, st.z0 + 0.1);

  // 우편함 (동쪽 벽)
  const mb = LOBBY.furniture.find((f) => f.id === 'mailbox')!.rect;
  box(mb.x1 - mb.x0, 1.3, mb.z1 - mb.z0, std(0x9aa1a8, 0.4, 0.6), (mb.x0 + mb.x1) / 2, 0.95, (mb.z0 + mb.z1) / 2);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) box(0.02, 0.24, 0.32, std(0x6d747b, 0.4, 0.6), mb.x0 - 0.01, 0.48 + r * 0.3, mb.z0 + 0.22 + c * 0.39);

  // 화분
  const pl = LOBBY.furniture.find((f) => f.id === 'plant')!.rect;
  void placeFurniture(s, 'pottedPlant', { x: (pl.x0 + pl.x1) / 2, z: (pl.z0 + pl.z1) / 2, w: 0.6, d: 0.6, h: 1.5 });

  // 경비 데스크: 긴 카운터 (동쪽을 본다) + CCTV 모니터 + 출입 기록부
  const dk = LOBBY.furniture.find((f) => f.id === 'desk')!.rect;
  const dcx = (dk.x0 + dk.x1) / 2;
  const dcz = (dk.z0 + dk.z1) / 2;
  box(dk.x1 - dk.x0, 1.0, dk.z1 - dk.z0, std(0x5b4636, 0.6), dcx, 0.5, dcz);
  box(dk.x1 - dk.x0 + 0.15, 0.05, dk.z1 - dk.z0 + 0.1, std(0xd9c6a5, 0.4), dcx, 1.02, dcz);
  // 앉은 쪽(서쪽) 낮은 작업대
  box(0.55, 0.04, dk.z1 - dk.z0, std(0xd9c6a5, 0.4), dk.x0 - 0.27, 0.74, dcz);
  for (const [i, mz] of [[0, -0.5], [1, 0.35]] as const) {
    box(0.08, 0.36, 0.5, std(0x1b1b1b, 0.3), dk.x0 + 0.05, 1.25, mz);
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.3),
      new THREE.MeshBasicMaterial({
        map: canvasTex(128, 84, (g) => {
          g.fillStyle = '#0d1a12';
          g.fillRect(0, 0, 128, 84);
          g.fillStyle = '#6fd18a';
          g.font = '12px monospace';
          g.fillText(`CAM ${i + 1}  ${i ? '현관' : '엘리베이터'}`, 6, 14);
          g.strokeStyle = 'rgba(111,209,138,0.5)';
          g.strokeRect(10, 24, 108, 52);
        }),
      }),
    );
    scr.position.set(dk.x0 - 0.0, 1.25, mz);
    scr.rotation.y = -Math.PI / 2;
    s.add(scr);
  }
  box(0.3, 0.02, 0.4, std(0xf3efe2, 0.9), dk.x0 - 0.25, 0.77, 0.9); // 출입 기록부
  // 의자 (앉는 높이 0.47)
  const ch = LOBBY.chair;
  // 경비 의자: 동쪽(데스크 쪽)을 본다
  void placeFurniture(s, 'chairDesk', { x: ch.x - 0.05, z: ch.z, w: 0.62, d: 0.62, h: 1.1, rotY: Math.PI / 2 });
  // 벽 명판
  const sign = (text: string, sub: string, w: number) =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({
        map: canvasTex(512, 128, (g) => {
          g.fillStyle = '#23395d';
          g.fillRect(0, 0, 512, 128);
          g.fillStyle = '#ffffff';
          g.textAlign = 'center';
          g.font = 'bold 52px sans-serif';
          g.fillText(text, 256, 66);
          g.font = '24px sans-serif';
          g.fillStyle = '#c9d6ea';
          g.fillText(sub, 256, 104);
        }),
      }),
    );
  const s1 = sign('경비실', '출입 시 확인 부탁드립니다', 1.4);
  s1.position.set(x0 + 0.09, 2.15, 0);
  s1.rotation.y = Math.PI / 2;
  s.add(s1);
  const s2 = sign('행복빌라', 'HAPPY VILLA', 1.6);
  s2.position.set(-1.6, 2.1, z0 + 0.09);
  s.add(s2);

  // 천장 조명
  for (const [lx, lz] of [[-2.5, 0], [2, -1.5], [0.5, 2.5]]) {
    const l = new THREE.PointLight(0xffffff, 7, 8, 1.6);
    l.position.set(lx, H - 0.2, lz);
    s.add(l);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(lx, H - 0.02, lz);
    s.add(lamp);
  }
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(2, 6, 4);
  key.castShadow = true;
  s.add(key);
  return { door };
}
