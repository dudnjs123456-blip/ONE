import * as THREE from 'three';
import type { FishScene } from '../city/fishing';
import type { CityMap } from '../city/cityMap';
import { buildBobber, buildFish, buildRod, fishLength, type FishModel, type RodModel } from './fishKit';
import type { FrameClock } from './clock';

/** 한강 물 높이 (cityRenderer 의 강물 판과 같다) */
export const WATER_Y = -1.2;

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/**
 * 한강 강둑 석축 + 낚시 데크 여섯 곳 (나무 바닥 · 기둥 · 난간 · 안내판).
 * 데크 바닥 높이 0 (공원 잔디와 같은 높이), 강물은 1.2m 아래.
 */
export function buildFishDecks(scene: THREE.Object3D, m: CityMap) {
  const g = new THREE.Group();
  scene.add(g);
  // 강둑 석축: 잔디 끝(riverZ)에서 물까지 비스듬히 내려가는 돌 경사면 + 위 갓돌
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d877b, roughness: 0.95 });
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1.9), stone);
  slope.rotation.x = -Math.PI / 2 + 0.68;
  slope.position.set(0, WATER_Y / 2 - 0.05, m.riverZ + 0.75);
  slope.receiveShadow = true;
  g.add(slope);
  const cope = new THREE.Mesh(new THREE.BoxGeometry(1600, 0.12, 0.45), new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.8 }));
  cope.position.set(0, 0.03, m.riverZ - 0.1);
  cope.receiveShadow = true;
  g.add(cope);

  // 데크 나무 (판자 무늬)
  const plankTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#8a6243' : '#7d583b';
      x.fillRect(i * 16, 0, 16, 256);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(i * 16, 0, 1.5, 256);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(i * 16 + 7, (i * 61) % 200, 2, 40);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4b33, roughness: 0.85 });
  const rail = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.5, metalness: 0.2 });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, y, z);
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
    return b;
  };
  const signTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const x = c.getContext('2d')!;
    x.fillStyle = '#1f5f8b';
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#ffffff';
    x.textAlign = 'center';
    x.font = `900 40px ${FONT}`;
    x.fillText('🎣 낚시 데크', 128, 58);
    x.font = `700 21px ${FONT}`;
    x.fillText('난간에 기대지 마세요', 128, 98);
    x.fillStyle = '#ffd25a';
    x.fillText('잡은 고기는 살림망에!', 128, 132);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const d of m.fishDecks) {
    const len = d.z1 - d.z0;
    const cz = (d.z0 + d.z1) / 2;
    const top = new THREE.MeshStandardMaterial({ map: plankTex.clone(), roughness: 0.8 });
    (top.map as THREE.Texture).repeat.set(d.w / 2, len / 4);
    (top.map as THREE.Texture).needsUpdate = true;
    box(d.w, 0.12, len, [wood, wood, top, wood, wood, wood] as unknown as THREE.Material, d.x, -0.04, cz);
    // 기둥: 물속까지
    for (const sx of [-1, 1])
      for (let k = 0; k <= 2; k++) {
        const z = m.riverZ + 0.6 + k * ((d.z1 - m.riverZ - 0.8) / 2);
        box(0.16, 2.6, 0.16, wood, d.x + sx * (d.w / 2 - 0.12), -1.35, z);
      }
    // 난간: 양옆 · 끝 (기둥 + 위 손잡이 + 가운데 살)
    const H = 1.0;
    const side = (x: number) => {
      for (let z = d.z0 + 1.6; z <= d.z1 + 0.01; z += (d.z1 - d.z0 - 1.6) / 3) box(0.06, H, 0.06, rail, x, H / 2, z);
      box(0.07, 0.05, d.z1 - d.z0 - 1.55, rail, x, H, (d.z0 + 1.6 + d.z1) / 2);
      box(0.03, 0.03, d.z1 - d.z0 - 1.55, rail, x, H * 0.5, (d.z0 + 1.6 + d.z1) / 2);
    };
    side(d.x - d.w / 2 + 0.04);
    side(d.x + d.w / 2 - 0.04);
    for (let k = 0; k <= 4; k++) box(0.06, H, 0.06, rail, d.x - d.w / 2 + 0.04 + (k * (d.w - 0.08)) / 4, H / 2, d.z1 - 0.04);
    box(d.w, 0.05, 0.07, rail, d.x, H, d.z1 - 0.04);
    box(d.w, 0.03, 0.03, rail, d.x, H * 0.5, d.z1 - 0.04);
    // 안내판 (데크 입구 왼쪽)
    const post = box(0.06, 1.3, 0.06, rail, d.x - d.w / 2 - 0.35, 0.65, d.z0 + 0.6);
    void post;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
    sign.position.set(d.x - d.w / 2 - 0.35, 1.25, d.z0 + 0.64);
    g.add(sign);
    // 양동이 하나 (데크 모서리)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.5 }));
    bucket.position.set(d.x + d.w / 2 - 0.35, 0.17, d.z0 + 1.0);
    bucket.castShadow = true;
    g.add(bucket);
  }
  return g;
}

/** 물 위 동그랗게 퍼지는 물결 */
interface Ripple {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  size: number;
}

/**
 * 낚시하는 모습: 손에 든 낚싯대 (긴장할수록 휜다) · 낚싯줄 · 찌 · 물결 · 튀어 오르는 물고기 · 잡아 올린 물고기.
 * 렌더러가 매 프레임 update 를 부른다 (낚시 중이 아니면 다 감춘다).
 */
export class FishingView {
  readonly group = new THREE.Group();
  private rod: RodModel | null = null;
  private rodKey = '';
  private bobber = buildBobber();
  private line: THREE.Line;
  private linePos: Float32Array;
  private ripples: Ripple[] = [];
  private fish: FishModel | null = null;
  private fishKey = '';
  private pitch = 0.5;
  private bend = 0.05;
  private lastPhase = '';
  private lastSurge = false;
  private leap = -1;
  private nibbleWas = 0;
  private tip = new THREE.Vector3();
  private end = new THREE.Vector3();
  private bobPos = new THREE.Vector3();
  private rippleGeo = new THREE.RingGeometry(0.8, 1, 28);

  /** 낚싯대를 든 각도 (몸 자세가 따라간다) */
  get armPitch() {
    return this.pitch;
  }

  constructor(scene: THREE.Object3D) {
    scene.add(this.group);
    this.group.visible = false;
    this.group.add(this.bobber);
    const N = 24;
    this.linePos = new Float32Array(N * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.group.add(this.line);
    this.rippleGeo.rotateX(-Math.PI / 2);
  }

  private ripple(x: number, z: number, size: number, life = 1.2) {
    let r = this.ripples.find((q) => q.age >= q.life);
    if (!r) {
      if (this.ripples.length >= 10) return;
      const mesh = new THREE.Mesh(this.rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      this.group.add(mesh);
      r = { mesh, age: 0, life, size };
      this.ripples.push(r);
    }
    r.age = 0;
    r.life = life;
    r.size = size;
    r.mesh.position.set(x, WATER_Y + 0.02, z);
    r.mesh.visible = true;
  }

  /**
   * @param scene 낚시 장면 (내 낚시든 친구 낚시든 같은 모양). null 이면 감춘다
   * @param hand 낚시하는 사람 오른손 위치 (없으면 몸 기준 어림)
   */
  update(scene: FishScene | null, clock: FrameClock, hand: THREE.Vector3 | null) {
    this.group.visible = !!scene;
    if (!scene) {
      this.lastPhase = '';
      return;
    }
    const { f, spot, rod: rodDef } = scene;
    const dt = clock.dt;
    if (this.rodKey !== rodDef.id) {
      this.rod?.group.removeFromParent();
      this.rod?.dispose();
      this.rod = buildRod(rodDef.color, 2.2 + rodDef.cast * 0.08, rodDef.id !== 'bamboo');
      this.group.add(this.rod.group);
      this.rodKey = rodDef.id;
    }
    const rod = this.rod!;
    const sec = f.t / 60;
    const phase = f.phase;
    if (phase !== this.lastPhase) {
      if (phase === 'bite') this.ripple(this.bobPos.x, this.bobPos.z, 0.5, 0.9);
      if (phase === 'wait' && this.lastPhase === 'cast') this.ripple(this.bobPos.x, this.bobPos.z, 0.6, 1.4);
      this.lastPhase = phase;
    }

    // 낚싯대 각도 (위로 든 정도) · 휨
    let pitch = 0.5;
    let bend = 0.06;
    if (phase === 'ready') pitch = 0.6;
    else if (phase === 'cast') {
      // 뒤로 젖혔다가 (머리 위) 앞으로 휙
      pitch = sec < 0.35 ? 0.6 + (sec / 0.35) * 0.95 : sec < 0.6 ? 1.55 - ((sec - 0.35) / 0.25) * 1.35 : 0.2 + ((sec - 0.6) / 0.3) * 0.25;
      bend = sec > 0.35 && sec < 0.6 ? -0.25 : 0.1;
    } else if (phase === 'wait') {
      pitch = 0.45;
      bend = 0.08 + f.nibble * 0.12 * Math.abs(Math.sin(clock.t * 0.45));
    } else if (phase === 'bite') {
      pitch = 0.42;
      bend = 0.35 + 0.12 * Math.sin(clock.t * 0.9);
    } else if (phase === 'fight') {
      const surge = f.surge > 0;
      pitch = 1.0 - (surge ? 0.3 : 0) + (f.tapFlash ? 0.08 : 0);
      bend = 0.25 + (f.tension / 100) * 1.0 + (surge ? 0.25 : 0);
    } else if (phase === 'reel') {
      pitch = 0.65;
      bend = 0.1;
    } else if (phase === 'result') {
      pitch = 1.15;
      bend = 0.3;
    }
    const k = 1 - Math.exp(-dt * (phase === 'cast' ? 22 : 9));
    this.pitch += (pitch - this.pitch) * k;
    this.bend += (bend - this.bend) * k;

    // 낚싯대 위치: 오른손에 쥐고 강 쪽(+z)으로
    const base = hand ? hand.clone() : new THREE.Vector3(spot.x + 0.2, 1.0, spot.z + 0.3);
    rod.group.position.copy(base);
    rod.group.rotation.set(-this.pitch, 0, 0, 'YXZ');
    const per = this.bend / rod.segs.length;
    rod.segs.forEach((s, i) => (s.rotation.x = per * (0.4 + (i / rod.segs.length) * 1.2)));
    rod.group.updateMatrixWorld(true);
    rod.tip.getWorldPosition(this.tip);

    // 찌 / 줄 끝 자리
    const out = f.lineOut;
    const cast = rodDef.cast + 0.5;
    const target = new THREE.Vector3(spot.x + (phase === 'fight' ? f.swim * 2.6 * out : 0.3), WATER_Y, spot.z + 1.2 + cast * Math.max(out, 0.001));
    const bob = this.bobPos;
    let showBobber = true;
    let slack = 0.2;
    if (phase === 'cast') {
      // 끝에서 포물선을 그리며 날아간다
      const u = out;
      bob.lerpVectors(this.tip, target, u);
      bob.y += Math.sin(Math.PI * u) * 2.2;
      if (u <= 0) bob.copy(this.tip).y -= 0.6;
      slack = 0.05;
    } else if (phase === 'wait' || phase === 'bite') {
      bob.copy(target);
      bob.y = WATER_Y + 0.01 + Math.sin(clock.t * 0.05) * 0.012;
      if (f.nibble > 0) {
        bob.y -= 0.05 * f.nibble * Math.abs(Math.sin(clock.t * 0.55));
        if (this.nibbleWas <= 0) this.ripple(bob.x, bob.z, 0.25, 0.6);
      }
      if (phase === 'bite') bob.y = WATER_Y - 0.16 - 0.03 * Math.sin(clock.t * 0.8);
      slack = phase === 'bite' ? 0.02 : 0.35;
    } else if (phase === 'fight') {
      bob.copy(target);
      bob.y = WATER_Y - 0.08;
      slack = 0.01;
      // 물고기가 줄 끝에서 버둥 · 차고 나갈 때 물결
      if (Math.random() < (f.surge > 0 ? 0.35 : 0.08)) this.ripple(bob.x + (Math.random() - 0.5) * 0.4, bob.z + (Math.random() - 0.5) * 0.4, f.surge > 0 ? 0.7 : 0.35, 0.8);
      if (f.surge > 0 && !this.lastSurge && f.fish && f.fish.tier !== 'junk') this.leap = 0;
    } else if (phase === 'reel') {
      bob.lerpVectors(this.tip, target, Math.max(0, out));
      bob.y = Math.max(bob.y - 1, WATER_Y + 0.01);
      showBobber = out > 0.02;
      slack = 0.15;
    } else {
      showBobber = false;
      bob.copy(this.tip);
      bob.y -= 0.7;
    }
    this.nibbleWas = f.nibble;
    this.lastSurge = f.surge > 0;
    this.bobber.visible = showBobber && phase !== 'result';
    this.bobber.position.copy(bob);
    this.bobber.rotation.z = phase === 'fight' ? Math.sin(clock.t * 0.4) * 0.6 : 0;

    // 물고기 모델 (튀어 오를 때 · 잡아 올렸을 때)
    const fishDef = f.fish;
    const wantFish = fishDef && (phase === 'fight' || phase === 'result');
    if (wantFish && fishDef) {
      const key = `${fishDef.id}:${f.kg}`;
      if (this.fishKey !== key) {
        this.fish?.group.removeFromParent();
        this.fish?.dispose();
        this.fish = buildFish(fishDef, fishLength(fishDef, f.kg));
        this.group.add(this.fish.group);
        this.fishKey = key;
      }
    }
    const fm = this.fish;
    if (fm) {
      fm.group.visible = false;
      if (wantFish && phase === 'result') {
        // 줄 끝에 매달려 파닥파닥
        fm.group.visible = true;
        const L = fishLength(fishDef!, f.kg);
        this.end.copy(this.tip);
        this.end.y -= 0.55;
        fm.group.position.set(this.end.x, this.end.y - L * 0.5, this.end.z);
        fm.group.rotation.set(Math.PI / 2, 0, Math.sin(clock.t * 0.35) * 0.35, 'YXZ');
        if (fm.tail) fm.tail.rotation.y = Math.sin(clock.t * 0.9) * 0.6;
      } else if (wantFish && this.leap >= 0) {
        // 차고 나가며 물 위로 튀어 오른다
        this.leap += dt;
        const u = this.leap / 0.7;
        if (u >= 1) {
          this.leap = -1;
          this.ripple(bob.x, bob.z, 0.9, 1.2);
        } else {
          fm.group.visible = true;
          const L = fishLength(fishDef!, f.kg);
          fm.group.position.set(bob.x + 0.3, WATER_Y + Math.sin(Math.PI * u) * Math.min(1.1, 0.4 + L * 0.6), bob.z + 0.2);
          fm.group.rotation.set(-(u - 0.5) * 2.2, 0.6, Math.sin(u * 12) * 0.3, 'YXZ');
          if (fm.tail) fm.tail.rotation.y = Math.sin(clock.t * 1.4) * 0.7;
        }
      }
    }
    if (phase !== 'fight') this.leap = -1;

    // 낚싯줄: 끝 → 찌 (또는 매달린 고기 입). 느슨하면 처진다
    const endP = phase === 'result' ? this.end : bob;
    const n = this.linePos.length / 3;
    const dist = this.tip.distanceTo(endP);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = this.tip.x + (endP.x - this.tip.x) * u;
      const z = this.tip.z + (endP.z - this.tip.z) * u;
      const y = this.tip.y + (endP.y - this.tip.y) * u - Math.sin(Math.PI * u) * dist * slack;
      this.linePos[i * 3] = x;
      this.linePos[i * 3 + 1] = Math.max(y, Math.min(endP.y, WATER_Y));
      this.linePos[i * 3 + 2] = z;
    }
    (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // 물결
    for (const r of this.ripples) {
      if (r.age >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      r.age += dt;
      const u = r.age / r.life;
      const s = r.size * (0.3 + u);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - u);
    }
  }

  dispose() {
    this.rod?.dispose();
    this.fish?.dispose();
    this.rippleGeo.dispose();
    this.group.removeFromParent();
  }
}
