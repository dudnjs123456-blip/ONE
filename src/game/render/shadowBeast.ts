import * as THREE from 'three';
import { mulberry32 } from '../core/controllers';
import type { Fighter } from '../core/fighter';
import type { FrameClock } from './clock';
import type { CharacterView } from './mannequin';

/**
 * 프롤로그의 "이름 없는 그림자" 전용 모델 (사람 인형을 검게 칠한 게 아니라 따로 만든 짐승).
 * 2D 컷신 속 모습에 맞춘다: 사람 두 배쯤 되는 굽은 몸, 가지 친 사슴뿔, 붉게 타는 두 눈,
 * 땅에 닿을 듯 긴 팔과 갈퀴 손톱, 몸에서 늘어져 흔들리는 그림자 가닥. 빛을 먹는 검은 몸이라
 * 어둠 속에서도 실루엣이 읽히게 가장자리만 보랏빛·붉은빛으로 번진다.
 * 원점 = 발밑, 앞 = +z (다른 캐릭터와 같다).
 */
export class ShadowBeast implements CharacterView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spine = new THREE.Group();
  private neck: THREE.Bone;
  private head: THREE.Bone;
  private arm: Record<'L' | 'R', { sh: THREE.Group; el: THREE.Group; hand: THREE.Group }>;
  private leg: Record<'L' | 'R', { hip: THREE.Group; knee: THREE.Group }>;
  private tendrils: { g: THREE.Object3D; base: THREE.Euler; ph: number }[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private eyeGlow: THREE.Sprite[] = [];
  private eyeLight: THREE.PointLight;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private yaw = Math.PI;
  private gait = 0;
  private speed = 0;
  private last: { x: number; z: number } | null = null;
  private atk = 0;
  private hurt = 0;
  private smoke: { s: THREE.Sprite; r: number; y: number; ph: number }[] = [];

  constructor() {
    const skin = this.shadowMat(0x010102, 0x241438);
    const deep = this.shadowMat(0x000001, 0x160a24);
    const horn = this.shadowMat(0x060508, 0x2e1a30);
    const claw = new THREE.MeshStandardMaterial({ color: 0x1a1218, roughness: 0.4, metalness: 0.2, emissive: 0x1a0508 });
    this.mats.push(claw);

    this.root.add(this.body);
    // 엉덩이 높이에서 몸통이 앞으로 굽는다
    this.body.position.y = 1.32;
    this.body.add(this.spine);
    this.spine.rotation.x = 0.42;

    // 몸통: 넓은 가슴 + 홀쭉한 허리 + 툭 튀어나온 등뼈
    this.part(this.spine, new THREE.SphereGeometry(0.5, 18, 14), skin, [0, 0.95, 0.05], [1.5, 1.15, 1.05]);
    this.part(this.spine, new THREE.SphereGeometry(0.42, 16, 12), skin, [0, 0.35, 0], [1.05, 1.1, 0.85]);
    this.part(this.spine, new THREE.SphereGeometry(0.36, 14, 10), deep, [0, 0.0, -0.02], [1.15, 0.7, 0.9]);
    const rng = mulberry32(13);
    for (let i = 0; i < 6; i++) {
      const s = this.part(this.spine, new THREE.ConeGeometry(0.07, 0.38 - i * 0.03, 5), horn, [0, 0.35 + i * 0.2, -0.42 - Math.sin(i * 0.5) * 0.05], [1, 1, 1]);
      s.rotation.x = -1.1;
    }

    // 목 · 머리 (뼈 이름을 head 로 둬서 대사창 초상화가 얼굴을 찾는다)
    this.neck = new THREE.Bone();
    this.neck.name = 'neck';
    this.neck.position.set(0, 1.38, 0.22);
    this.spine.add(this.neck);
    this.part(this.neck, new THREE.CylinderGeometry(0.16, 0.24, 0.42, 10), skin, [0, 0.12, 0.1], [1, 1, 1]).rotation.x = 0.7;
    this.head = new THREE.Bone();
    this.head.name = 'head';
    this.head.position.set(0, 0.3, 0.3);
    this.neck.add(this.head);
    // 길쭉한 짐승 머리: 두개골 + 내민 주둥이 + 갈라진 턱
    this.part(this.head, new THREE.SphereGeometry(0.24, 16, 12), skin, [0, 0.04, 0], [1, 0.95, 1.15]);
    this.part(this.head, new THREE.SphereGeometry(0.16, 14, 10), skin, [0, -0.04, 0.24], [0.85, 0.7, 1.35]);
    this.part(this.head, new THREE.SphereGeometry(0.13, 12, 8), deep, [0, -0.15, 0.2], [0.9, 0.45, 1.3]);
    // 이빨 몇 개 (입 끝에 희미하게)
    for (const x of [-0.07, -0.025, 0.025, 0.07]) {
      const t = this.part(this.head, new THREE.ConeGeometry(0.014, 0.07, 4), claw, [x, -0.11, 0.38], [1, 1, 1]);
      t.rotation.x = Math.PI;
    }
    // 붉은 눈: 안개 속에서도 보이게 안개를 받지 않고, 둘레로 빛이 번진다
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2638, fog: false });
    this.mats.push(this.eyeMat);
    const glowTex = glowTexture();
    for (const sx of [-1, 1]) {
      const e = this.part(this.head, new THREE.SphereGeometry(0.038, 10, 8), this.eyeMat, [sx * 0.1, 0.07, 0.2], [1.3, 0.75, 1]);
      e.castShadow = false;
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a3a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.mats.push(g.material);
      g.scale.setScalar(0.34);
      g.position.set(sx * 0.1, 0.07, 0.24);
      this.head.add(g);
      this.eyeGlow.push(g);
    }
    // 눈빛이 둘레(내 얼굴, 나무)를 붉게 물들인다
    this.eyeLight = new THREE.PointLight(0xff2a3a, 1.6, 6, 2);
    this.eyeLight.position.set(0, 0.2, 2.2);
    this.head.add(this.eyeLight);
    // 사슴뿔: 머리 양옆에서 위·바깥으로 휘며 가지를 친다
    for (const sx of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(sx * 0.13, 0.18, -0.04);
      a.rotation.set(-0.35, 0, -sx * 0.55);
      this.head.add(a);
      this.antler(a, horn, 0.62, 0.05, 3, sx, rng);
    }

    // 팔: 어깨가 넓고, 팔이 길어 손이 무릎 아래까지 내려온다
    const mkArm = (sx: number) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.7, 1.08, 0.08);
      this.spine.add(sh);
      this.part(sh, new THREE.SphereGeometry(0.19, 12, 10), skin, [0, -0.02, 0], [1, 1.1, 0.9]);
      this.part(sh, new THREE.CylinderGeometry(0.17, 0.12, 0.95, 10), skin, [0, -0.48, 0], [1, 1, 1]);
      const el = new THREE.Group();
      el.position.y = -0.95;
      sh.add(el);
      this.part(el, new THREE.CylinderGeometry(0.12, 0.08, 1.0, 9), skin, [0, -0.5, 0], [1, 1, 1]);
      const hand = new THREE.Group();
      hand.position.y = -1.02;
      el.add(hand);
      this.part(hand, new THREE.SphereGeometry(0.11, 10, 8), skin, [0, -0.04, 0.02], [1.2, 0.8, 1.1]);
      // 갈퀴 손톱 넷: 길고 앞으로 휜다
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Group();
        c.position.set((i - 1.5) * 0.055, -0.1, 0.05);
        c.rotation.set(0.5, 0, (i - 1.5) * 0.12);
        hand.add(c);
        this.part(c, new THREE.ConeGeometry(0.022, 0.42, 5), claw, [0, -0.21, 0], [1, 1, 1]).rotation.x = Math.PI;
      }
      return { sh, el, hand };
    };
    this.arm = { L: mkArm(1), R: mkArm(-1) };

    // 다리: 짐승처럼 무릎이 뒤로 꺾이는 굵은 다리
    const mkLeg = (sx: number) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.3, 0, 0);
      this.body.add(hip);
      this.part(hip, new THREE.CylinderGeometry(0.2, 0.14, 0.72, 10), skin, [0, -0.34, 0.06], [1, 1, 1]).rotation.x = -0.25;
      const knee = new THREE.Group();
      knee.position.set(0, -0.68, 0.16);
      hip.add(knee);
      this.part(knee, new THREE.CylinderGeometry(0.12, 0.08, 0.68, 9), skin, [0, -0.32, -0.12], [1, 1, 1]).rotation.x = 0.38;
      // 발: 앞으로 길고 발톱 셋
      this.part(knee, new THREE.SphereGeometry(0.12, 10, 8), deep, [0, -0.62, -0.08], [1, 0.5, 1.7]);
      for (let i = 0; i < 3; i++) {
        const c = this.part(knee, new THREE.ConeGeometry(0.025, 0.2, 5), claw, [(i - 1) * 0.06, -0.64, 0.12], [1, 1, 1]);
        c.rotation.x = Math.PI / 2;
      }
      return { hip, knee };
    };
    this.leg = { L: mkLeg(1), R: mkLeg(-1) };

    // 그림자 가닥: 어깨·등·팔에서 늘어져 바람에 흔들린다 (끝으로 갈수록 가늘고 투명해 보이게 짙은 색)
    const strand = this.shadowMat(0x000001, 0x120820);
    const hang = (parent: THREE.Object3D, x: number, y: number, z: number, len: number, rx: number, rz: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.set(rx, 0, rz);
      parent.add(g);
      const m = this.part(g, new THREE.ConeGeometry(0.06 + rng() * 0.05, len, 5, 1, true), strand, [0, -len / 2, 0], [1, 1, 0.5]);
      m.rotation.x = Math.PI;
      m.castShadow = false;
      this.tendrils.push({ g, base: g.rotation.clone(), ph: rng() * Math.PI * 2 });
    };
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.4;
      hang(this.spine, Math.sin(a) * 0.62, 1.15 - Math.abs(a) * 0.1, -0.3 + Math.cos(a) * 0.05, 0.8 + rng() * 0.7, -0.4 - rng() * 0.3, Math.sin(a) * 0.4);
    }
    for (const s of ['L', 'R'] as const) {
      for (let i = 0; i < 3; i++) hang(this.arm[s].el, (rng() - 0.5) * 0.1, -0.2 - i * 0.28, -0.08, 0.45 + rng() * 0.4, -0.5, (rng() - 0.5) * 0.5);
    }
    for (let i = 0; i < 5; i++) hang(this.spine, (i - 2) * 0.16, 0.05, -0.1, 0.7 + rng() * 0.5, -0.2, (i - 2) * 0.12);

    // 몸을 감싼 검은 연기 뭉치 (부드러운 가장자리): 굵은 도형의 이음매를 감추고 컷신처럼 연기로 된 몸처럼 보이게
    const smokeTex = smokeTexture();
    const puff = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, op: number) => {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x000000, transparent: true, opacity: Math.min(1, op * 1.6), depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      s.position.set(x, y, z);
      s.scale.setScalar(r * 1.5);
      parent.add(s);
      this.smoke.push({ s, r, y, ph: rng() * Math.PI * 2 });
    };
    for (let i = 0; i < 14; i++) puff(this.spine, (rng() - 0.5) * 1.3, rng() * 1.4, (rng() - 0.5) * 0.8, 0.9 + rng() * 0.8, 0.55);
    for (const s of ['L', 'R'] as const) {
      puff(this.arm[s].sh, 0, -0.1, 0, 0.9, 0.6);
      puff(this.arm[s].sh, 0, -0.55, 0, 0.6, 0.5);
      puff(this.arm[s].el, 0, -0.4, 0, 0.45, 0.45);
      puff(this.leg[s].hip, 0, -0.3, 0, 0.75, 0.55);
      puff(this.leg[s].knee, 0, -0.3, -0.1, 0.5, 0.45);
    }
    puff(this.neck, 0, 0.1, 0, 0.8, 0.5);
    puff(this.head, 0, 0.05, -0.15, 0.6, 0.45);

    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.eyeMat) m.castShadow = true;
    });
  }

  /** 빛을 먹는 검은 재질: 가장자리(옆으로 비스듬한 면)만 은은하게 번져 실루엣이 읽힌다 */
  private shadowMat(color: number, rim: number) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: 0x000000 });
    const rc = new THREE.Color(rim);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rc };
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        'float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\ngl_FragColor.rgb += uRim * pow(rimK, 2.2) * 0.9;\n#include <dithering_fragment>',
      );
    };
    m.customProgramCacheKey = () => 'shadow-rim-' + rim.toString(16);
    this.mats.push(m);
    return m;
  }

  private part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, [x, y, z]: number[], [sx, sy, sz]: number[]) {
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  }

  /** 뿔 한 줄기: 위로 휘며 자라다 가지를 친다 */
  private antler(parent: THREE.Object3D, mat: THREE.Material, len: number, r: number, depth: number, sx: number, rng: () => number) {
    const segs = 3;
    let node: THREE.Object3D = parent;
    for (let i = 0; i < segs; i++) {
      const l = len / segs;
      const seg = new THREE.Group();
      seg.rotation.set(-0.12 - rng() * 0.12, 0, -sx * (0.12 + rng() * 0.1));
      node.add(seg);
      const rr = r * (1 - i / segs) + 0.008;
      this.part(seg, new THREE.CylinderGeometry(rr * 0.75, rr, l, 6), mat, [0, l / 2, 0], [1, 1, 1]);
      const tip = new THREE.Group();
      tip.position.y = l;
      seg.add(tip);
      if (depth > 0 && i >= 1) {
        // 가지: 앞·위로 뻗는다
        const b = new THREE.Group();
        b.rotation.set(0.5 + rng() * 0.4, 0, sx * (0.5 + rng() * 0.3));
        tip.add(b);
        this.antler(b, mat, len * 0.5, rr * 0.7, depth - 1, -sx, rng);
      }
      node = tip;
    }
    // 끝은 뾰족하게
    this.part(node, new THREE.ConeGeometry(r * 0.4 + 0.006, len * 0.18, 5), mat, [0, len * 0.09, 0], [1, 1, 1]);
  }

  update(f: Fighter, c: FrameClock) {
    const lp = f.lerped(c.alpha);
    const dt = Math.max(1e-4, c.dt);
    // 실제로 움직인 거리로 걸음 빠르기를 잰다 (Fighter 상태와 상관없이 발이 미끄러지지 않게)
    if (this.last) {
      const v = Math.hypot(lp.x - this.last.x, lp.z - this.last.z) / dt;
      this.speed += (Math.min(v, 8) - this.speed) * Math.min(1, dt * 8);
    }
    this.last = { x: lp.x, z: lp.z };
    this.gait += this.speed * dt * 2.1;

    // 방향은 천천히 돌린다 (큰 몸이 휙 돌지 않게)
    const want = Math.atan2(lp.fx, lp.fz);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 5);
    this.root.position.set(lp.x, lp.y, lp.z);
    this.root.rotation.y = this.yaw;

    const t = c.t / 60;
    const walk = Math.min(1, this.speed / 2.2);
    const s = Math.sin(this.gait);
    const breathe = Math.sin(t * 1.6);

    // 공격: 크게 치켜들었다가 내려 할퀸다 / 맞으면 움찔
    this.atk = f.state === 'attack' ? Math.min(1, this.atk + dt * 2.6) : Math.max(0, this.atk - dt * 3);
    this.hurt = f.state === 'hitstun' ? Math.min(1, this.hurt + dt * 8) : Math.max(0, this.hurt - dt * 4);
    const swing = f.state === 'attack' ? (this.atk < 0.45 ? this.atk / 0.45 : 1 - (this.atk - 0.45) / 0.55 * 1.6) : 0;

    this.body.position.y = 1.32 + Math.abs(Math.cos(this.gait)) * 0.07 * walk + breathe * 0.015;
    this.body.rotation.z = s * 0.05 * walk;
    this.spine.rotation.x = 0.42 + walk * 0.1 + breathe * 0.025 - this.hurt * 0.3 - swing * 0.15;
    this.spine.rotation.y = -s * 0.1 * walk;
    // 머리는 낮게 내밀고 앞을 노려본다 (몸이 굽은 만큼 들어 올린다)
    this.neck.rotation.x = -0.3 + Math.sin(t * 0.9) * 0.04;
    this.head.rotation.set(-0.15 - walk * 0.08 + this.hurt * 0.25, Math.sin(t * 0.7) * 0.15 * (1 - walk), Math.sin(t * 0.5) * 0.05);

    for (const [k, sx] of [['L', 1], ['R', -1]] as const) {
      const ph = k === 'L' ? s : -s;
      const a = this.arm[k];
      // 걸을 땐 팔을 늘어뜨려 앞뒤로 흔들고, 서 있을 땐 손톱을 벌린 채 살짝 든다
      a.sh.rotation.set(-0.35 - ph * 0.45 * walk - (1 - walk) * 0.15, 0, sx * (0.18 + breathe * 0.02));
      a.el.rotation.x = -0.35 - (1 - walk) * 0.25 + Math.max(0, ph) * 0.2 * walk;
      a.hand.rotation.x = -0.2 + Math.sin(t * 2 + sx) * 0.08;
      if (k === 'R' && swing !== 0) {
        a.sh.rotation.x = -0.4 - swing * 2.4;
        a.sh.rotation.z = -0.35;
        a.el.rotation.x = -0.2 - Math.max(0, swing) * 0.5;
      }
      const l = this.leg[k];
      l.hip.rotation.x = -ph * 0.55 * walk;
      l.knee.rotation.x = Math.max(0, -Math.cos(this.gait + (k === 'L' ? 0 : Math.PI))) * 0.6 * walk;
    }

    for (const td of this.tendrils) {
      const w = Math.sin(t * 2.2 + td.ph) * 0.18 + walk * 0.35;
      td.g.rotation.set(td.base.x - w * 0.5, Math.sin(t * 1.3 + td.ph) * 0.2, td.base.z + Math.cos(t * 1.7 + td.ph) * 0.12);
    }

    // 연기 뭉치: 천천히 부풀었다 줄며 몸 윤곽을 흐린다
    for (const sm of this.smoke) {
      const k = 1 + Math.sin(t * 0.9 + sm.ph) * 0.18;
      sm.s.scale.setScalar(sm.r * 1.5 * k);
      sm.s.material.rotation = sm.ph + t * 0.15;
      sm.s.position.y = sm.y + Math.sin(t * 0.6 + sm.ph) * 0.06;
    }

    // 눈빛이 불규칙하게 일렁인다
    const flick = 0.85 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.05;
    for (const g of this.eyeGlow) g.material.opacity = 0.75 * flick;
    this.eyeLight.intensity = 1.6 * flick;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) {
      m.dispose();
    }
  }
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

/** 연기 뭉치: 가운데가 짙고 가장자리가 구름처럼 울퉁불퉁하게 흐려지는 점 */
let smokeTex: THREE.Texture | null = null;
function smokeTexture(): THREE.Texture {
  if (smokeTex) return smokeTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const rng = mulberry32(31);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * 26;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const r = 18 + rng() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  smokeTex = new THREE.CanvasTexture(cv);
  return smokeTex;
}
