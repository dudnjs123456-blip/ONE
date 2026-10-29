import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityMap } from '../city/cityMap';
import { CROSS_W, crosswalks, fences, junctions, stopLines, vehicleLight, walkLight } from '../city/traffic';

/**
 * 도로 소품: 횡단보도 줄무늬 · 정지선 · 길가 보행자 펜스 · 차량 신호등 · 보행 신호등.
 * 신호등 불빛은 방향(동서/남북)마다 재질 하나씩이라, 모든 교차로가 같은 재질 색만 바꿔 깜박인다.
 * 정적인 기둥·함·펜스는 재질별로 합치거나 인스턴스로 그려 그리기 횟수를 적게.
 */
type Axis = 'x' | 'z';

const ON = { red: 0xff3b30, yellow: 0xffc21a, green: 0x1fe37f };
const OFF = { red: 0x3a1714, yellow: 0x3a3214, green: 0x10301f };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 보행 신호 사람 모양 (흰 그림 → 재질 색으로 물들인다). walking = 걷는 모습 */
function manTexture(walking: boolean) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(64, 24, 11, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(64, 42);
    g.lineTo(walking ? 60 : 64, 76);
    g.stroke();
    g.lineWidth = 11;
    g.beginPath();
    if (walking) {
      g.moveTo(62, 48);
      g.lineTo(42, 66);
      g.moveTo(64, 48);
      g.lineTo(84, 62);
      g.moveTo(60, 76);
      g.lineTo(44, 112);
      g.moveTo(60, 76);
      g.lineTo(82, 110);
    } else {
      g.moveTo(58, 48);
      g.lineTo(52, 80);
      g.moveTo(70, 48);
      g.lineTo(76, 80);
      g.moveTo(60, 76);
      g.lineTo(58, 114);
      g.moveTo(68, 76);
      g.lineTo(70, 114);
    }
    g.stroke();
  });
}

/** 펜스 한 칸 (2m): 위아래 가로대 + 세로살, 가운데 노란 띠. 빈 곳은 투명 */
function fenceTexture() {
  return canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = '#eef0f0';
    g.fillRect(0, 4, 256, 12);
    g.fillRect(0, 112, 256, 10);
    for (let x = 8; x < 256; x += 16) g.fillRect(x, 16, 5, 96);
    g.fillStyle = '#f2c21b';
    g.fillRect(0, 46, 256, 22);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 16, 256, 2);
  });
}

export class TrafficProps {
  readonly group = new THREE.Group();
  private veh: Record<Axis, Record<'red' | 'yellow' | 'green', THREE.MeshBasicMaterial>>;
  private ped: Record<Axis, { stop: THREE.MeshBasicMaterial; walk: THREE.MeshBasicMaterial }>;
  private disposables: { dispose(): void }[] = [];

  constructor(map: CityMap) {
    const lamp = (c: number) => {
      const m = new THREE.MeshBasicMaterial({ color: c });
      this.disposables.push(m);
      return m;
    };
    this.veh = {
      x: { red: lamp(OFF.red), yellow: lamp(OFF.yellow), green: lamp(OFF.green) },
      z: { red: lamp(OFF.red), yellow: lamp(OFF.yellow), green: lamp(OFF.green) },
    };
    const stopTex = manTexture(false);
    const walkTex = manTexture(true);
    this.disposables.push(stopTex, walkTex);
    const pedMat = (tex: THREE.Texture) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, color: 0x333333 });
      this.disposables.push(m);
      return m;
    };
    this.ped = {
      x: { stop: pedMat(stopTex), walk: pedMat(walkTex) },
      z: { stop: pedMat(stopTex), walk: pedMat(walkTex) },
    };

    const paint = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.5 });
    const housing = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.2 });
    this.disposables.push(paint, metal, housing);

    // 재질별로 모았다가 하나로
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
      geo.applyMatrix4(m);
      const list = parts.get(mat) ?? [];
      list.push(geo);
      parts.set(mat, list);
    };
    const at = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);

    // ── 횡단보도 줄무늬 · 정지선 ──
    const stripeLen = CROSS_W - 0.3;
    for (const c of crosswalks()) {
      const along = c.road === 'z'; // 남북 길을 가로지르면 줄무늬는 남북 방향
      const cx = (c.x0 + c.x1) / 2;
      const cz = (c.z0 + c.z1) / 2;
      const span = along ? c.x1 - c.x0 : c.z1 - c.z0;
      for (let k = -span / 2 + 0.6; k <= span / 2 - 0.4; k += 1.1) {
        put(paint, new THREE.BoxGeometry(0.55, 0.02, stripeLen), along ? at(cx + k, 0.06, cz) : at(cx, 0.06, cz + k, Math.PI / 2));
      }
    }
    for (const r of map.roads) {
      const hw = r.width / 2;
      for (const dir of [1, -1] as const) {
        for (const s of stopLines(r.axis, r.at, dir)) {
          // 진행 방향 오른쪽 절반 차로를 가로지르는 흰 선
          const line = s + dir * 0.35;
          const lat = r.axis === 'x' ? r.at + (dir * hw) / 2 : r.at - (dir * hw) / 2;
          put(paint, new THREE.BoxGeometry(0.4, 0.02, hw - 0.3), r.axis === 'x' ? at(line, 0.061, lat) : at(lat, 0.061, line, Math.PI / 2));
        }
      }
    }

    // ── 차량 신호등: 교차로 건너편 오른쪽 모퉁이 기둥 + 차로 위로 뻗은 팔 + 가로형 3구 신호 ──
    const lampGeo = (r: number) => new THREE.CircleGeometry(r, 18);
    for (const j of junctions()) {
      const approaches: { dx: number; dz: number }[] = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
      ];
      if (j.south) approaches.push({ dx: 0, dz: -1 });
      for (const a of approaches) {
        // 강변북로 T 자 교차로는 남쪽으로 이어지는 길이 없어 남행 신호를 건너편(강 쪽)에 둘 수 없다
        if (!j.south && a.dz > 0) continue;
        const axis: Axis = a.dx ? 'x' : 'z';
        const rx = -a.dz;
        const rz = a.dx;
        const hAlong = axis === 'x' ? j.hv : j.hh;
        const hAcross = axis === 'x' ? j.hh : j.hv;
        const px = j.x + a.dx * (hAlong + 0.9) + rx * (hAcross + 0.9);
        const pz = j.z + a.dz * (hAlong + 0.9) + rz * (hAcross + 0.9);
        const H = 5.6;
        put(metal, new THREE.CylinderGeometry(0.11, 0.14, H, 10), at(px, H / 2, pz));
        // 팔: 기둥에서 차로 쪽(오른쪽의 반대)으로
        const arm = hAcross + 0.9 - 1.6;
        const ax = px - rx * (arm / 2);
        const az = pz - rz * (arm / 2);
        put(metal, new THREE.BoxGeometry(arm, 0.12, 0.12), at(ax, H - 0.2, az, axis === 'x' ? Math.PI / 2 : 0));
        // 신호 함: 오는 차를 본다 (진행 방향의 반대쪽)
        const hx = px - rx * (arm - 0.3);
        const hz = pz - rz * (arm - 0.3);
        const face = Math.atan2(-a.dx, -a.dz);
        put(housing, new THREE.BoxGeometry(1.25, 0.4, 0.3), at(hx, H - 0.55, hz, face));
        // 차양 + 불빛 (왼쪽부터 빨강 · 노랑 · 초록)
        const fwd = new THREE.Vector3(-a.dx, 0, -a.dz);
        const side = new THREE.Vector3(-a.dz, 0, a.dx).multiplyScalar(-1); // 오는 차가 보기에 왼쪽 → 오른쪽
        (['red', 'yellow', 'green'] as const).forEach((c, k) => {
          const off = (k - 1) * 0.38;
          const p = new THREE.Vector3(hx, H - 0.55, hz).addScaledVector(side, off).addScaledVector(fwd, 0.155);
          put(this.veh[axis][c], lampGeo(0.13), at(p.x, p.y, p.z, face));
          const visor = new THREE.CylinderGeometry(0.16, 0.16, 0.16, 12, 1, true, Math.PI / 2, Math.PI);
          visor.rotateX(Math.PI / 2);
          const q = p.clone().addScaledVector(fwd, 0.08);
          put(housing, visor, at(q.x, q.y, q.z, face));
        });
      }
    }

    // ── 보행 신호등: 횡단보도 양 끝 기둥에 건너편을 보는 사람 신호 ──
    for (const c of crosswalks()) {
      const along = c.road === 'z'; // true = 동서로 걸어서 건넌다
      for (const end of [-1, 1]) {
        // 끝 (인도 위) 과 그 끝에서 건너편을 보는 방향
        const px = along ? (end < 0 ? c.x0 - 0.6 : c.x1 + 0.6) : c.x1 + 0.3;
        const pz = along ? c.z1 + 0.3 : end < 0 ? c.z0 - 0.6 : c.z1 + 0.6;
        // 이 기둥의 신호는 건너편에서 기다리는 사람이 본다 → 길 쪽을 향한다
        const face = along ? (end < 0 ? Math.PI / 2 : -Math.PI / 2) : end < 0 ? 0 : Math.PI;
        const H = 2.9;
        put(metal, new THREE.CylinderGeometry(0.06, 0.07, H, 8), at(px, H / 2, pz));
        put(housing, new THREE.BoxGeometry(0.4, 0.78, 0.22), at(px, H - 0.2, pz, face));
        const fwd = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
        for (const [kind, y] of [
          ['stop', H - 0.01],
          ['walk', H - 0.39],
        ] as const) {
          const p = new THREE.Vector3(px, y, pz).addScaledVector(fwd, 0.115);
          put(this.ped[c.road][kind], new THREE.PlaneGeometry(0.3, 0.3), at(p.x, p.y, p.z, face));
        }
      }
    }

    for (const [mat, list] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      for (const g of list) g.dispose();
      mesh.userData.keepMaterial = true;
      mesh.castShadow = mat === metal || mat === housing;
      mesh.receiveShadow = mat === paint;
      this.group.add(mesh);
      this.disposables.push(mesh.geometry);
    }

    // ── 길가 펜스: 2m 한 칸씩 인스턴스 (기둥은 칸마다) ──
    const tex = fenceTexture();
    const fenceMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e2, roughness: 0.5, metalness: 0.3 });
    const panelGeo = new THREE.PlaneGeometry(2, 0.9);
    const postGeo = new THREE.BoxGeometry(0.07, 1.0, 0.07);
    this.disposables.push(tex, fenceMat, postMat, panelGeo, postGeo);
    const panels: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    for (const f of fences(map)) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      const n = Math.max(1, Math.round(len / 2));
      const step = len / n;
      const ux = (f.x1 - f.x0) / len;
      const uz = (f.z1 - f.z0) / len;
      const ry = Math.atan2(ux, uz) - Math.PI / 2;
      for (let k = 0; k < n; k++) {
        const s = (k + 0.5) * step;
        panels.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(f.x0 + ux * s, 0.55, f.z0 + uz * s),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
            new THREE.Vector3(step / 2, 1, 1),
          ),
        );
      }
      for (let k = 0; k <= n; k++) posts.push(new THREE.Matrix4().makeTranslation(f.x0 + ux * k * step, 0.5, f.z0 + uz * k * step));
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.userData.keepMaterial = true;
      this.group.add(im);
    };
    inst(panelGeo, fenceMat, panels);
    inst(postGeo, postMat, posts);
  }

  /** 신호 시계(초)에 맞춰 불빛을 바꾼다 */
  update(seconds: number) {
    for (const axis of ['x', 'z'] as const) {
      const l = vehicleLight(axis, seconds);
      for (const c of ['red', 'yellow', 'green'] as const) this.veh[axis][c].color.setHex(l === c ? ON[c] : OFF[c]);
      const w = walkLight(axis, seconds);
      const blinkOff = w === 'flash' && Math.floor(seconds * 2) % 2 === 1;
      this.ped[axis].walk.color.setHex(w !== 'stop' && !blinkOff ? ON.green : 0x1a1a1a);
      this.ped[axis].stop.color.setHex(w === 'stop' ? ON.red : 0x1a1a1a);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
