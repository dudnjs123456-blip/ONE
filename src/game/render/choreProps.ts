/**
 * 집안일 소품: 집안 상태(ChoreState)와 지금 하는 동작(ChoreActor)을 보고 움직이며 그린다.
 *  - 싱크대: 더러운 그릇 더미 · 손에 든 그릇과 거품 · 수돗물 · 건조대에 올린 그릇
 *  - 화장실: 사람이 오면 열리는 문 · 샤워기 물줄기 · 김(증기) · 김 서린 유리 · 세면대 물 · 칫솔 · 수건
 *  - 세탁기: 열고 닫히는 문 · 도는 드럼과 빨래 · 물 · 단계별 빠르기 · 탈수 때 흔들림 · 남은 시간 표시창 · 불빛
 *  - 빨래 바구니 · 젖은 빨래 바구니 · 빨래 건조대 (널린 옷이 마르며 색이 밝아지고, 젖은 동안 물방울이 떨어진다)
 *  - 소리: 물소리 · 세탁기 돌아가는 소리 · 끝났을 때 삐삐삐
 * 모든 좌표는 집 좌표 (HOME 과 같음).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BATH_DOOR, BATH_ROOM } from '../city/cityWorld';
import { choreFrame, dryness, washStage, washerPhase, washLeft, type ChoreKind, type ChoreState } from '../city/chores';
import { audioBus } from './sfx';

/** 지금 집안일을 하는 사람 (나 또는 친구) */
export interface ChoreActor {
  kind: ChoreKind;
  t: number;
  n: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** 오른손 위치 (모델이 있으면) */
  hand: THREE.Vector3 | null;
}

const std = (color: number, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
const rb = (w: number, h: number, d: number, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cyl = (t: number, b: number, h: number, n = 16) => new THREE.CylinderGeometry(t, b, h, n);
const ball = (r: number, n = 10) => new THREE.SphereGeometry(r, n, Math.max(6, Math.round(n * 0.7)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (u: number) => u * u * (3 - 2 * u);

/** 빨래 색 (옷마다 다르게) */
const CLOTH_COLORS = [0xf2b6c6, 0x9cc3e6, 0xf6f1e4, 0x7d8fa8, 0xe8d38a, 0xb9d9b0, 0xd7a6e0, 0xf0a77c, 0x5f6b7a, 0xffffff, 0xc9b6a0, 0x8fb7c9];

// ───── 고정 자리 (집 좌표) ─────
/** 싱크대 볼 바닥 가운데 · 수도꼭지 끝 */
const SINK = { x: -4.58, y: 0.73, z: -1.025 };
const TAP = { x: -4.68, y: 1.205, z: -1.025 };
/** 그릇 건조대: 씻은 그릇을 세우는 둘째 줄 */
const DRY_ROW = { x: -4.43, y: 1.04, z0: -1.86, dz: 0.05 };
/** 샤워기 머리 · 샤워 부스 가운데 바닥 */
const SHOWER_HEAD = { x: -1.05, y: 1.9, z: 2.48 };
const SHOWER_FLOOR = { x: -1.31, z: 2.71 };
/** 화장실 세면대 수도꼭지 끝 */
const BASIN_TAP = { x: -2.75, y: 0.975, z: 3.3 };
/** 빨래 바구니 · 젖은 빨래 바구니 · 빨래 건조대 */
const HAMPER = { x: -4.66, z: 1.37 };
const WET_BASKET = { x: 1.6, z: 3.6 };
const RACK = { x0: 0.0, x1: 1.2, z: 3.55 };

/** 둥근 김 · 물방울 그림 */
function softDot(rgb: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 젖은 옷 · 마른 옷 하나 (건조대에 걸쳐 아래로 늘어진다) */
function garment(kind: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
  g.userData.mat = mat;
  g.userData.base = new THREE.Color(color);
  const plane = (w: number, h: number, y: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (kind % 4) {
    case 0: {
      // 티셔츠: 몸통 + 소매 두 쪽
      plane(0.3, 0.36, -0.18);
      for (const sx of [-1, 1]) {
        const s = plane(0.12, 0.1, -0.05);
        s.position.x = sx * 0.19;
        s.rotation.z = sx * 0.5;
      }
      break;
    }
    case 1:
      // 수건
      plane(0.32, 0.5, -0.25);
      break;
    case 2: {
      // 양말 한 켤레
      for (const sx of [-1, 1]) {
        const s = plane(0.07, 0.2, -0.1);
        s.position.x = sx * 0.06;
      }
      break;
    }
    default: {
      // 바지 (두 다리)
      for (const sx of [-1, 1]) {
        const s = plane(0.12, 0.55, -0.3);
        s.position.x = sx * 0.07;
      }
      plane(0.26, 0.08, -0.04);
    }
  }
  return g;
}

/** 물소리 · 세탁기 소리 (필요할 때만 노드를 만든다) */
class ChoreAudio {
  private nodes: {
    ctx: AudioContext;
    water: GainNode;
    waterF: BiquadFilterNode;
    hum: GainNode;
    humOsc: OscillatorNode;
    slosh: GainNode;
  } | null = null;

  private ensure() {
    if (this.nodes) return this.nodes;
    const bus = audioBus();
    if (!bus) return null;
    const { ctx, out, noise } = bus;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const waterF = ctx.createBiquadFilter();
    waterF.type = 'bandpass';
    waterF.frequency.value = 1800;
    waterF.Q.value = 0.6;
    const water = ctx.createGain();
    water.gain.value = 0;
    src.connect(waterF).connect(water).connect(out);
    // 세탁기: 낮게 웅웅 + 물 철벅
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const hum = ctx.createGain();
    hum.gain.value = 0;
    humOsc.connect(lp).connect(hum).connect(out);
    const src2 = ctx.createBufferSource();
    src2.buffer = noise;
    src2.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 500;
    const slosh = ctx.createGain();
    slosh.gain.value = 0;
    src2.connect(sf).connect(slosh).connect(out);
    src.start();
    src2.start();
    humOsc.start();
    this.nodes = { ctx, water, waterF, hum, humOsc, slosh };
    return this.nodes;
  }

  set(water: number, waterHz: number, hum: number, humHz: number, slosh: number) {
    if (!this.nodes && water + hum + slosh < 0.001) return;
    const n = this.ensure();
    if (!n) return;
    const t = n.ctx.currentTime;
    n.water.gain.setTargetAtTime(water, t, 0.15);
    n.waterF.frequency.setTargetAtTime(waterHz, t, 0.2);
    n.hum.gain.setTargetAtTime(hum, t, 0.3);
    n.humOsc.frequency.setTargetAtTime(humHz, t, 0.5);
    n.slosh.gain.setTargetAtTime(slosh, t, 0.3);
  }

  /** 세탁 끝: 삐-삐-삐 */
  beep() {
    const bus = audioBus();
    if (!bus) return;
    const { ctx, out } = bus;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1568 : 1318;
      const t0 = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0, t0 + 0.2);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 0.25);
    }
  }
}

export class ChoreProps {
  private root = new THREE.Group();
  // 싱크대
  private dirty: THREE.Mesh[] = [];
  private clean: THREE.Mesh[] = [];
  private handDish: THREE.Group;
  private foam: THREE.Mesh[] = [];
  private tapWater: THREE.Mesh;
  // 화장실
  private bathDoor: THREE.Object3D | null;
  private doorAngle = 0;
  private showerDrops: THREE.Points;
  private dropV: Float32Array;
  private steam: THREE.Sprite[] = [];
  private steamAmt = 0;
  private glass: THREE.Material | null = null;
  private basinWater: THREE.Mesh;
  private brush: THREE.Group;
  private towel: THREE.Mesh;
  // 세탁기
  private washer: THREE.Object3D | null;
  private washerBase = new THREE.Vector3();
  private washerDoor = new THREE.Group();
  private doorOpen = 0;
  private drum = new THREE.Group();
  private drumClothes: THREE.Mesh[] = [];
  private drumWater: THREE.Mesh;
  private drumSpin = 0;
  private led: THREE.MeshBasicMaterial;
  private screen: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; last: string };
  // 빨래
  private hamperPile: THREE.Mesh[] = [];
  private wetBasket: THREE.Group;
  private wetPile: THREE.Mesh[] = [];
  private rackClothes: THREE.Group[] = [];
  private drips: THREE.Points;
  private dripV: Float32Array;
  private handCloth: THREE.Mesh;
  private audio = new ChoreAudio();
  private wasDone: boolean | null = null;
  private time = 0;

  constructor(home: THREE.Object3D) {
    home.add(this.root);
    const r = this.root;
    const porcelain = std(0xfbfaf6, 0.35);
    const stain = std(0x8a6a3e, 0.9);
    const add = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T => {
      o.position.set(x, y, z);
      r.add(o);
      return o;
    };

    // ── 싱크대: 더러운 그릇 더미 (위 그릇엔 음식 자국) ──
    for (let i = 0; i < 8; i++) {
      const plate = new THREE.Mesh(cyl(0.1, 0.075, 0.022, 20), porcelain);
      const st = new THREE.Mesh(cyl(0.05 + (i % 3) * 0.01, 0.05, 0.003, 12), stain);
      st.position.set(0.015 * ((i % 2) * 2 - 1), 0.012, 0.01);
      plate.add(st);
      plate.rotation.set(((i * 37) % 7) * 0.02 - 0.06, i * 0.7, ((i * 13) % 5) * 0.02 - 0.04);
      add(plate, SINK.x + ((i % 3) - 1) * 0.02, SINK.y + 0.012 + i * 0.022, SINK.z + ((i % 2) - 0.5) * 0.03);
      this.dirty.push(plate);
    }
    // 건조대 둘째 줄: 씻은 그릇
    for (let i = 0; i < 6; i++) {
      const plate = new THREE.Mesh(cyl(0.1, 0.1, 0.012, 20), porcelain);
      plate.rotation.x = Math.PI / 2 - 0.12;
      add(plate, DRY_ROW.x, DRY_ROW.y, DRY_ROW.z0 + i * DRY_ROW.dz);
      this.clean.push(plate);
    }
    // 손에 든 그릇 + 거품
    this.handDish = new THREE.Group();
    const hd = new THREE.Mesh(cyl(0.1, 0.075, 0.022, 20), porcelain);
    this.handDish.add(hd);
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(ball(0.012 + (i % 3) * 0.006, 8), foamMat);
      b.position.set(Math.cos(i * 2.4) * 0.05, 0.016, Math.sin(i * 2.4) * 0.05);
      this.handDish.add(b);
      this.foam.push(b);
    }
    add(this.handDish).visible = false;
    // 수돗물 줄기
    const waterMat = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    this.tapWater = add(new THREE.Mesh(cyl(0.008, 0.012, TAP.y - SINK.y, 8), waterMat), TAP.x, (TAP.y + SINK.y) / 2, TAP.z);
    this.tapWater.visible = false;

    // ── 화장실 ──
    this.bathDoor = home.getObjectByName('bathDoor') ?? null;
    home.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m) && m.name === 'showerGlass') this.glass = m;
    });
    // 샤워기 물방울 (떨어지는 점들)
    const N = 140;
    const pos = new Float32Array(N * 3);
    this.dropV = new Float32Array(N);
    for (let i = 0; i < N; i++) this.respawnDrop(pos, i, Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.showerDrops = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8fcaf2, size: 0.045, transparent: true, opacity: 0.9, depthWrite: false, map: softDot('255,255,255') }));
    this.showerDrops.frustumCulled = false;
    this.showerDrops.visible = false;
    r.add(this.showerDrops);
    // 김
    const steamTex = softDot('214,224,230');
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false }));
      sp.scale.setScalar(0.6);
      sp.userData.seed = i * 0.37;
      add(sp, SHOWER_FLOOR.x, 1, SHOWER_FLOOR.z);
      this.steam.push(sp);
    }
    // 세면대 물
    this.basinWater = add(new THREE.Mesh(cyl(0.006, 0.009, 0.12, 8), waterMat), BASIN_TAP.x, BASIN_TAP.y - 0.06, BASIN_TAP.z);
    this.basinWater.visible = false;
    // 칫솔 · 수건 (손에 든다)
    this.brush = new THREE.Group();
    const handle = new THREE.Mesh(cyl(0.006, 0.006, 0.16, 6), std(0x9fb3c2, 0.5));
    handle.rotation.z = Math.PI / 2;
    this.brush.add(handle);
    const head = new THREE.Mesh(rb(0.025, 0.018, 0.012, 0.004), std(0xffffff, 0.6));
    head.position.x = 0.08;
    this.brush.add(head);
    add(this.brush).visible = false;
    this.towel = add(new THREE.Mesh(rb(0.32, 0.06, 0.24, 0.025), std(0xd8ccb9, 0.95)));
    this.towel.visible = false;

    // ── 세탁기: 문 (경첩은 문 왼쪽 = -z), 드럼, 물, 불빛, 표시창 ──
    this.washer = home.getObjectByName('washer') ?? null;
    if (this.washer) this.washerBase.copy(this.washer.position);
    const wroot = this.washer ?? r;
    const chrome = std(0xb8bcc2, 0.3);
    this.washerDoor.position.set(0.31, 0.4, -0.2);
    wroot.add(this.washerDoor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 12, 32), chrome);
    ring.rotation.y = Math.PI / 2;
    ring.position.z = 0.2;
    this.washerDoor.add(ring);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb7c8, roughness: 0.08, transparent: true, opacity: 0.3, depthWrite: false });
    const glass = new THREE.Mesh(cyl(0.165, 0.165, 0.012, 32), glassMat);
    glass.rotation.z = Math.PI / 2;
    glass.position.z = 0.2;
    this.washerDoor.add(glass);
    const handleBar = new THREE.Mesh(rb(0.02, 0.08, 0.03, 0.008), chrome);
    handleBar.position.set(0.02, 0, 0.36);
    this.washerDoor.add(handleBar);
    this.drum.position.set(0.27, 0.4, 0);
    wroot.add(this.drum);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ball(0.055 + (i % 3) * 0.012, 10), std(CLOTH_COLORS[i], 0.95));
      const a = (i / 8) * Math.PI * 2;
      m.position.set(-0.01 * (i % 2), Math.cos(a) * 0.09, Math.sin(a) * 0.09);
      m.scale.set(0.6, 1, 1.2);
      this.drum.add(m);
      this.drumClothes.push(m);
    }
    this.drumWater = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8fc8ee, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.drumWater.rotation.y = Math.PI / 2;
    this.drumWater.position.set(0.29, 0.4, 0);
    wroot.add(this.drumWater);
    this.led = new THREE.MeshBasicMaterial({ color: 0x555a60 });
    const led = new THREE.Mesh(rb(0.004, 0.02, 0.02, 0.003), this.led);
    led.position.set(0.307, 0.78, 0.2);
    wroot.add(led);
    const sc = document.createElement('canvas');
    sc.width = 96;
    sc.height = 32;
    const sg = sc.getContext('2d')!;
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), new THREE.MeshBasicMaterial({ map: tex }));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(0.307, 0.78, -0.02);
    wroot.add(screen);
    this.screen = { tex, g: sg, last: '' };

    // ── 빨래 바구니 (등나무) ──
    const wicker = std(0xc9a77a, 0.95);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.42, 20, 1, true), wicker);
    (basket.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    add(basket, HAMPER.x, 0.21, HAMPER.z);
    add(new THREE.Mesh(cyl(0.17, 0.17, 0.01, 20), wicker), HAMPER.x, 0.005, HAMPER.z);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 24), wicker), HAMPER.x, 0.42, HAMPER.z).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ball(0.075, 10), std(CLOTH_COLORS[i], 0.95));
      const a = i * 2.39;
      const layer = Math.floor(i / 4);
      m.position.set(HAMPER.x + Math.cos(a) * 0.08, 0.06 + layer * 0.09 + (i % 2) * 0.02, HAMPER.z + Math.sin(a) * 0.08);
      m.scale.set(1.2, 0.55, 1);
      m.rotation.y = a;
      r.add(m);
      this.hamperPile.push(m);
    }
    // 젖은 빨래 바구니 (파란 플라스틱, 건조대 옆)
    this.wetBasket = new THREE.Group();
    this.wetBasket.position.set(WET_BASKET.x, 0, WET_BASKET.z);
    const plastic = std(0x6fa8d6, 0.5);
    for (const [w, d, x, z] of [[0.42, 0.02, 0, -0.14], [0.42, 0.02, 0, 0.14], [0.02, 0.3, -0.2, 0], [0.02, 0.3, 0.2, 0]] as const) {
      const side = new THREE.Mesh(rb(w, 0.2, d, 0.005), plastic);
      side.position.set(x, 0.1, z);
      this.wetBasket.add(side);
    }
    const floor = new THREE.Mesh(rb(0.42, 0.02, 0.3, 0.005), plastic);
    floor.position.y = 0.01;
    this.wetBasket.add(floor);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ball(0.06, 10), std(new THREE.Color(CLOTH_COLORS[i]).multiplyScalar(0.7).getHex(), 0.4));
      m.position.set(-0.13 + (i % 4) * 0.085, 0.07 + Math.floor(i / 4) * 0.06, (i % 2) * 0.08 - 0.04);
      m.scale.set(1.2, 0.6, 1);
      this.wetBasket.add(m);
      this.wetPile.push(m);
    }
    r.add(this.wetBasket);

    // ── 빨래 건조대 (접이식: X 다리 + 가로대 네 줄) ──
    const steel = std(0xdfe3e7, 0.35);
    for (const x of [RACK.x0, RACK.x1]) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(cyl(0.01, 0.01, 1.18, 8), steel);
        leg.position.set(x, 0.56, RACK.z);
        leg.rotation.x = s * 0.32;
        r.add(leg);
      }
    }
    for (const dz of [-0.17, -0.06, 0.06, 0.17]) {
      const bar = new THREE.Mesh(cyl(0.008, 0.008, RACK.x1 - RACK.x0, 8), steel);
      bar.rotation.z = Math.PI / 2;
      bar.position.set((RACK.x0 + RACK.x1) / 2, 1.0 + (Math.abs(dz) < 0.1 ? 0.08 : 0), RACK.z + dz);
      r.add(bar);
    }
    for (let i = 0; i < 8; i++) {
      const g = garment(i, CLOTH_COLORS[(i * 5) % CLOTH_COLORS.length]);
      const row = i % 4;
      const dz = [-0.17, -0.06, 0.06, 0.17][row];
      g.position.set(RACK.x0 + 0.2 + Math.floor(i / 4) * 0.55 + (row % 2) * 0.12, 1.0 + (Math.abs(dz) < 0.1 ? 0.08 : 0), RACK.z + dz);
      g.visible = false;
      r.add(g);
      this.rackClothes.push(g);
    }
    // 젖은 빨래에서 떨어지는 물방울
    const DN = 40;
    const dp = new Float32Array(DN * 3);
    this.dripV = new Float32Array(DN);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.drips = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xbfe3ff, size: 0.02, transparent: true, opacity: 0.85, depthWrite: false, map: softDot('255,255,255') }));
    this.drips.frustumCulled = false;
    this.drips.visible = false;
    r.add(this.drips);
    // 손에 든 빨래 한 뭉치
    this.handCloth = add(new THREE.Mesh(ball(0.07, 10), std(0xf2b6c6, 0.95)));
    this.handCloth.scale.set(1.3, 0.7, 1);
    this.handCloth.visible = false;
  }

  private respawnDrop(pos: Float32Array, i: number, life: number) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 0.12;
    const y = SHOWER_HEAD.y - life * (SHOWER_HEAD.y - 0.05);
    // 머리에서 아래로 갈수록 넓게 퍼진다
    const spread = 0.05 + life * 0.18;
    pos[i * 3] = SHOWER_HEAD.x - 0.15 * life + Math.cos(a) * (rr + spread * Math.random());
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = SHOWER_HEAD.z + 0.15 * life + Math.sin(a) * (rr + spread * Math.random());
    this.dropV[i] = 0.05 + Math.random() * 0.03;
  }

  /**
   * @param state 지금 보고 있는 집의 집안 상태 (모르면 null → 소품은 기본 모습)
   * @param actors 이 집에서 집안일을 하는 사람들
   * @param people 이 집에 있는 사람들 위치 (화장실 문을 연다)
   * @param audible 이 집을 보고 있다 (소리를 낸다)
   */
  update(state: ChoreState | null, actors: ChoreActor[], people: { x: number; z: number }[], now: number, dt: number, audible: boolean) {
    const steps = Math.max(0.001, dt * 60);
    this.time += steps;
    const T = this.time;
    const s = state;
    const act = (k: ChoreKind | ChoreKind[]) => actors.find((a) => (Array.isArray(k) ? k.includes(a.kind) : a.kind === k)) ?? null;

    // ── 싱크대 ──
    const dish = act('dishes');
    const df = dish ? choreFrame('dishes', dish.t) : null;
    const holding = !!df && !(df.step === 'pick' && df.k < 0.35);
    const dirtyN = Math.max(0, (s?.dishes ?? 0) - (holding ? 1 : 0));
    this.dirty.forEach((m, i) => (m.visible = i < dirtyN));
    this.clean.forEach((m, i) => (m.visible = i < Math.min(6, s?.clean ?? 0)));
    this.handDish.visible = holding;
    this.tapWater.visible = !!df && df.step === 'wash';
    if (dish && df && holding) {
      const chest = new THREE.Vector3(dish.x + dish.fx * 0.32, 1.0, dish.z + dish.fz * 0.32);
      const under = new THREE.Vector3(TAP.x + 0.02, 0.86, TAP.z);
      const pile = new THREE.Vector3(SINK.x, SINK.y + 0.02 + dirtyN * 0.022, SINK.z);
      const slot = new THREE.Vector3(DRY_ROW.x, DRY_ROW.y, DRY_ROW.z0 + Math.min(5, s?.clean ?? 0) * DRY_ROW.dz);
      const p = this.handDish.position;
      const rot = this.handDish.rotation;
      switch (df.step) {
        case 'pick':
          p.lerpVectors(pile, chest, ease(clamp01((df.k - 0.35) / 0.65)));
          rot.set(0, 0, 0);
          break;
        case 'scrub':
          p.copy(chest).add(new THREE.Vector3(Math.sin(T * 0.3) * 0.01, 0, Math.cos(T * 0.3) * 0.01));
          rot.set(0.5 * dish.fz, 0, -0.5 * dish.fx);
          break;
        case 'wash':
          p.lerpVectors(chest, under, ease(clamp01(df.k * 4)));
          rot.set(0.9 * dish.fz + Math.sin(T * 0.25) * 0.2, 0, -0.9 * dish.fx);
          break;
        default:
          p.lerpVectors(under, slot, ease(df.k));
          rot.set(lerp(0, Math.PI / 2 - 0.12, df.k), 0, 0);
      }
      // 거품: 문지를수록 늘고, 헹구면 사라진다
      const foamAmt = df.step === 'scrub' ? df.k : df.step === 'wash' ? 1 - clamp01(df.k * 2) : 0;
      this.foam.forEach((b, i) => {
        b.visible = i / this.foam.length < foamAmt;
        b.scale.setScalar(0.8 + 0.25 * Math.sin(T * 0.2 + i));
      });
    }
    if (this.tapWater.visible) this.tapWater.scale.set(1 + 0.15 * Math.sin(T * 1.7), 1, 1 + 0.15 * Math.cos(T * 1.3));

    // ── 화장실 문: 누가 가까이 오거나 안에 있으면 열린다 ──
    if (this.bathDoor) {
      const cx = (BATH_DOOR.x0 + BATH_DOOR.x1) / 2;
      const near = people.some((q) => Math.hypot(q.x - cx, q.z - BATH_DOOR.z) < 1.3 || (q.x > BATH_ROOM.x0 && q.x < BATH_ROOM.x1 && q.z > BATH_ROOM.z0 && q.z < BATH_ROOM.z1 && !act('shower')));
      this.doorAngle += ((near ? -1.45 : 0) - this.doorAngle) * (1 - Math.pow(0.88, steps));
      this.bathDoor.rotation.y = this.doorAngle;
    }

    // ── 샤워 ──
    const sh = act('shower');
    const sf = sh ? choreFrame('shower', sh.t) : null;
    const showering = !!sf && sf.water;
    this.showerDrops.visible = showering;
    if (showering) {
      const pos = (this.showerDrops.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.dropV.length; i++) {
        pos[i * 3 + 1] -= this.dropV[i] * steps;
        if (pos[i * 3 + 1] < 0.05) this.respawnDrop(pos, i, 0);
      }
      this.showerDrops.geometry.getAttribute('position').needsUpdate = true;
    }
    // 김: 샤워하는 동안 차오르고, 끝나면 천천히 걷힌다
    this.steamAmt = clamp01(this.steamAmt + (showering ? 0.004 : -0.0015) * steps);
    this.steam.forEach((sp, i) => {
      const u = (T * 0.004 + sp.userData.seed) % 1;
      sp.position.set(SHOWER_FLOOR.x + Math.sin(T * 0.01 + i) * 0.25, 0.4 + u * 1.7, SHOWER_FLOOR.z + Math.cos(T * 0.013 + i * 2) * 0.25 - 0.1);
      sp.scale.setScalar(0.5 + u * 0.8);
      (sp.material as THREE.SpriteMaterial).opacity = this.steamAmt * 0.6 * Math.sin(u * Math.PI);
      sp.visible = this.steamAmt > 0.01;
    });
    if (this.glass) {
      const g = this.glass as THREE.MeshStandardMaterial;
      g.opacity = 0.14 + this.steamAmt * 0.5;
      g.color.setRGB(0.95 - 0.12 * this.steamAmt, 0.98 - 0.08 * this.steamAmt, 1);
    }
    // 수건 (머리 위에서 턴다)
    const towelOn = !!sf && sf.hold === 'towel';
    this.towel.visible = towelOn;
    if (towelOn && sh) {
      const hp = sh.hand ?? new THREE.Vector3(sh.x, 1.55, sh.z);
      this.towel.position.set(sh.x + sh.fx * 0.05, Math.max(hp.y, 1.45) + 0.08, sh.z + sh.fz * 0.05);
      this.towel.rotation.set(0.3 * Math.sin(T * 0.6), Math.atan2(sh.fx, sh.fz), 0.2);
    }
    // 양치: 칫솔 · 입 헹굴 때 세면대 물
    const br = act('brush');
    const bf = br ? choreFrame('brush', br.t) : null;
    this.brush.visible = !!bf && bf.hold === 'brush';
    if (br && this.brush.visible) {
      const hp = br.hand ?? new THREE.Vector3(br.x + br.fx * 0.15, 1.35, br.z + br.fz * 0.15);
      this.brush.position.copy(hp);
      this.brush.rotation.set(0, Math.atan2(br.fx, br.fz) + Math.PI / 2, 0.2);
    }
    this.basinWater.visible = !!bf && bf.water;

    // ── 세탁기 ──
    const ld = act(['load', 'unload']);
    const lf = ld ? choreFrame(ld.kind, ld.t) : null;
    const phase = s ? washerPhase(s, now) : 'empty';
    const stage = s ? washStage(s, now) : null;
    // 문: 넣고 꺼내는 동안 열린다
    const wantOpen = lf ? (lf.step === 'door' ? (lf.k < 0.5 || ld!.t < 60 ? 1 : 0) : lf.step === 'stuff' ? 1 : 0) : 0;
    const openNow = lf && lf.step === 'door' ? (ld!.t < 60 ? ease(lf.k) : 1 - ease(lf.k)) : wantOpen;
    this.doorOpen += (openNow - this.doorOpen) * (1 - Math.pow(0.75, steps));
    this.washerDoor.rotation.y = 1.7 * this.doorOpen;
    // 드럼 속 빨래 수
    let inDrum = phase === 'empty' ? 0 : (s?.washer?.n ?? 0);
    if (ld && lf) {
      const prog = lf.step === 'stuff' ? lf.k : ld.t < 60 ? 0 : 1;
      const n = ld.kind === 'load' ? Math.min(8, s?.hamper ?? 0) : (s?.washer?.n ?? 0);
      inDrum = ld.kind === 'load' ? Math.round(n * prog) : Math.round(n * (1 - prog));
    }
    this.drumClothes.forEach((m, i) => (m.visible = i < inDrum));
    // 단계별 빠르기: 불림 천천히 · 세탁 좌우로 · 헹굼 · 탈수 아주 빠르게
    const spinRate = stage === 'soak' ? 0.03 : stage === 'wash' ? 0.09 * Math.sign(Math.sin(T * 0.012)) : stage === 'rinse' ? 0.07 : stage === 'spin' ? 0.55 : 0;
    this.drumSpin += spinRate * steps;
    this.drum.rotation.x = this.drumSpin;
    this.drumWater.visible = !!stage && stage !== 'spin';
    if (this.washer) {
      const shake = stage === 'spin' ? 0.004 : stage === 'wash' ? 0.0012 : 0;
      this.washer.position.set(this.washerBase.x + Math.sin(T * 2.1) * shake, this.washerBase.y + Math.abs(Math.sin(T * 1.7)) * shake * 0.5, this.washerBase.z + Math.cos(T * 2.6) * shake);
    }
    const blink = Math.sin(T * 0.15) > 0;
    this.led.color.setHex(phase === 'running' ? 0x58b8ff : phase === 'done' ? (blink ? 0x6fe39a : 0x2f6a45) : 0x555a60);
    const label = phase === 'running' && s ? (() => {
      const left = Math.ceil(washLeft(s, now) / 1000);
      return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    })() : phase === 'done' ? 'End' : '- -';
    if (label !== this.screen.last) {
      const g = this.screen.g;
      g.fillStyle = '#0d1418';
      g.fillRect(0, 0, 96, 32);
      g.fillStyle = phase === 'done' ? '#6fe39a' : '#7fd3ff';
      g.font = 'bold 24px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 48, 17);
      this.screen.tex.needsUpdate = true;
      this.screen.last = label;
    }
    // 세탁 끝: 그 집을 보고 있으면 삐삐삐
    const done = phase === 'done';
    if (this.wasDone === false && done && audible) this.audio.beep();
    this.wasDone = s ? done : null;

    // ── 빨래 바구니 · 젖은 빨래 바구니 ──
    let hamperN = s?.hamper ?? 0;
    if (ld?.kind === 'load' && lf) hamperN = Math.max(0, hamperN - (lf.step === 'stuff' ? Math.round(Math.min(8, hamperN) * lf.k) : ld.t >= 150 ? Math.min(8, hamperN) : 0));
    this.hamperPile.forEach((m, i) => (m.visible = i < hamperN));
    const hang = act('hang');
    const hf = hang ? choreFrame('hang', hang.t) : null;
    const wetN = Math.max(0, (s?.wet ?? 0) - (hf && hf.step !== 'pick' ? 1 : 0));
    this.wetBasket.visible = (s?.wet ?? 0) > 0;
    this.wetPile.forEach((m, i) => (m.visible = i < wetN));

    // ── 건조대: 널린 옷 (젖으면 어둡고 물방울, 마르면 밝게) ──
    const fold = act('fold');
    const ff = fold ? choreFrame('fold', fold.t) : null;
    const rackN = s?.rack?.n ?? 0;
    const dryK = s ? dryness(s, now) : 1;
    this.rackClothes.forEach((g, i) => {
      // 개는 중이면 지금 개는 옷은 손으로 옮겨 간다
      const folding = ff && i === rackN - 1 && ff.step !== 'pick';
      g.visible = i < rackN && !folding;
      const mat = g.userData.mat as THREE.MeshStandardMaterial;
      const base = g.userData.base as THREE.Color;
      mat.color.copy(base).multiplyScalar(0.62 + 0.38 * dryK);
      mat.roughness = 0.5 + 0.45 * dryK;
      g.rotation.x = Math.sin(T * 0.02 + i) * 0.03;
    });
    const dripping = rackN > 0 && dryK < 0.6;
    this.drips.visible = dripping;
    if (dripping) {
      const pos = (this.drips.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const shown = this.rackClothes.filter((g) => g.visible);
      for (let i = 0; i < this.dripV.length; i++) {
        pos[i * 3 + 1] -= this.dripV[i] * steps;
        if (pos[i * 3 + 1] < 0.02 || this.dripV[i] === 0) {
          const g = shown[i % Math.max(1, shown.length)];
          if (!g || Math.random() > 0.6 - dryK) {
            pos[i * 3 + 1] = -1;
            this.dripV[i] = 0.001;
            continue;
          }
          pos[i * 3] = g.position.x + (Math.random() - 0.5) * 0.25;
          pos[i * 3 + 1] = g.position.y - 0.3 - Math.random() * 0.2;
          pos[i * 3 + 2] = g.position.z;
          this.dripV[i] = 0.01 + Math.random() * 0.02;
        }
      }
      this.drips.geometry.getAttribute('position').needsUpdate = true;
    }

    // 손에 든 빨래 (넣기·꺼내기·널기·개기)
    const clothActor = (lf?.hold === 'cloth' ? ld : null) ?? (hf?.hold === 'cloth' ? hang : null) ?? (ff ? fold : null);
    this.handCloth.visible = !!clothActor;
    if (clothActor) {
      const fr = choreFrame(clothActor.kind, clothActor.t);
      const p = clothActor.hand ?? new THREE.Vector3(clothActor.x + clothActor.fx * 0.35, 1.0, clothActor.z + clothActor.fz * 0.35);
      this.handCloth.position.copy(p);
      if (fr.step === 'fold') this.handCloth.scale.set(1.3 - 0.6 * fr.k, 0.7 - 0.3 * fr.k, 1);
      else this.handCloth.scale.set(1.3, 0.7, 1);
      const wet = clothActor.kind !== 'fold' && clothActor.kind !== 'load';
      (this.handCloth.material as THREE.MeshStandardMaterial).color.setHex(CLOTH_COLORS[fr.item % CLOTH_COLORS.length]).multiplyScalar(wet ? 0.7 : 1);
    }

    // ── 소리 ──
    if (audible) {
      const tap = this.tapWater.visible || this.basinWater.visible;
      const water = showering ? 0.09 : tap ? 0.05 : 0;
      const hum = stage === 'spin' ? 0.05 : stage ? 0.025 : 0;
      const humHz = stage === 'spin' ? 95 : 55;
      const slosh = stage === 'wash' || stage === 'rinse' ? 0.03 * (0.6 + 0.4 * Math.abs(Math.sin(T * 0.05))) : 0;
      this.audio.set(water, showering ? 1400 : 2600, hum, humHz, slosh);
    } else this.audio.set(0, 2000, 0, 55, 0);
  }

  /** 집을 떠나면 소리를 끈다 */
  silence() {
    this.audio.set(0, 2000, 0, 55, 0);
  }
}

/** 오래 안 씻으면 머리 위로 피어오르는 냄새 (초록 물결 세 줄) */
export class StinkFx {
  readonly sprite: THREE.Sprite;
  private t = Math.random() * 100;
  constructor() {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(140,190,90,0.9)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const x0 = 22 + k * 26;
      for (let y = 88; y >= 8; y -= 4) {
        const x = x0 + Math.sin(y * 0.12 + k) * 7;
        if (y === 88) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    this.sprite.scale.set(0.45, 0.45, 1);
    this.sprite.visible = false;
  }

  /** @param at 머리 꼭대기 위치 (냄새가 안 나면 null) */
  update(at: THREE.Vector3 | null, dt: number) {
    this.t += dt * 60;
    const m = this.sprite.material as THREE.SpriteMaterial;
    if (!at) {
      this.sprite.visible = false;
      return;
    }
    const u = (this.t * 0.01) % 1;
    this.sprite.visible = true;
    this.sprite.position.set(at.x + Math.sin(this.t * 0.03) * 0.05, at.y + 0.15 + u * 0.35, at.z);
    m.opacity = 0.75 * Math.sin(u * Math.PI);
  }
}
