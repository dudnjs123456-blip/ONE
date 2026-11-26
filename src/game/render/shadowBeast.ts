import * as THREE from 'three';
import { mulberry32 } from '../core/controllers';
import type { Fighter } from '../core/fighter';
import type { FrameClock } from './clock';
import type { CharacterView } from './mannequin';

/**
 * 프롤로그의 "이름 없는 그림자" 전용 모델.
 * 2D 컷신 속 모습(붉은 눈, 연기로 된 큰 사람 모양, 다리 대신 흩어지는 하반신)을 바탕으로
 * 더 위압적으로 다듬은 콘셉트 시트를 따른다:
 *  - 3m 가까운 키, 가슴을 편 꼿꼿한 자세, 넓은 V자 어깨와 가는 허리
 *  - 굳은 그림자로 된 날카로운 어깨 갑주
 *  - 머리 위로 타오르는 검은 연기 불꽃 왕관, 꼬리를 끄는 붉은 눈, 이마의 붉은 결정
 *  - 가슴 한가운데 금이 간 듯 새어 나오는 붉은 심장빛
 *  - 땅에 닿을 듯 긴 팔과 긴 갈퀴 손톱
 *  - 어깨에서 등 뒤로 흐르는 찢어진 연기 망토
 *  - 허리 아래는 다리 대신 바닥으로 넓게 퍼지며 소용돌이치는 연기 자락 (미끄러지듯 떠다닌다)
 * 원점 = 발밑(연기 자락 끝), 앞 = +z (다른 캐릭터와 같다).
 */
export class ShadowBeast implements CharacterView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private neck: THREE.Bone;
  private head: THREE.Bone;
  private arm: Record<'L' | 'R', { sh: THREE.Group; el: THREE.Group; hand: THREE.Group; fingers: THREE.Group[] }>;
  /** 흔들리는 조각들: 망토 자락 · 하반신 연기 자락 · 왕관 불꽃 */
  private sway: { g: THREE.Object3D; base: THREE.Euler; ph: number; amp: number; kind: 'cloak' | 'trail' | 'flame' }[] = [];
  private eyeGlow: THREE.Sprite[] = [];
  private heartGlow: THREE.Sprite;
  private heartMat: THREE.MeshBasicMaterial;
  private crackMat: THREE.MeshBasicMaterial;
  private eyeLight: THREE.PointLight;
  private heartLight: THREE.PointLight;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private yaw = Math.PI;
  private speed = 0;
  private last: { x: number; z: number } | null = null;
  private atk = 0;
  private hurt = 0;
  /** 바닥 쪽 연기 뭉치 (천천히 맴돈다) */
  private skirt: { s: THREE.Sprite; a: number; r: number; y: number; sc: number; ph: number }[] = [];
  /** 왕관·어깨에서 피어올라 흩어지는 연기 가닥 */
  private wisps: { s: THREE.Sprite; mat: THREE.SpriteMaterial; from: THREE.Object3D; ox: number; oz: number; life: number; dur: number; drift: number }[] = [];

  constructor() {
    const rng = mulberry32(13);
    const skin = this.shadowMat(0x0c0b10, 0x6a5878, 2.2, 1.0, 0.62);
    const deep = this.shadowMat(0x030305, 0x3a2c48, 2.4, 0.8);
    const plate = this.shadowMat(0x14121a, 0x9a7088, 1.8, 1.0, 0.35);
    const strand = this.shadowMat(0x020203, 0x2e2238, 2.0, 0.7);
    strand.side = THREE.DoubleSide;
    const claw = new THREE.MeshStandardMaterial({ color: 0x15101a, roughness: 0.35, metalness: 0.3, emissive: 0x140306 });
    this.mats.push(claw);
    const red = (c: number, op = 1) => {
      const m = new THREE.MeshBasicMaterial({ color: c, fog: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 });
      this.mats.push(m);
      return m;
    };
    const glowTex = glowTexture();
    const glow = (parent: THREE.Object3D, x: number, y: number, z: number, s: number, color: number, op: number, sx = 1) => {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.mats.push(g.material);
      g.scale.set(s * sx, s, 1);
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    this.root.add(this.body);
    // 허리 높이 (다리가 없어 이 아래는 전부 연기 자락)
    this.body.position.y = 1.2;
    this.body.add(this.spine);

    // ── 하반신: 바닥으로 넓게 퍼지는 연기 자락 ──
    // 허리에서 아래로 갈수록 벌어지는 속이 빈 깔때기 (자락들의 이음매를 감춘다)
    const skirtProfile: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12; // 0 = 허리, 1 = 바닥
      skirtProfile.push(new THREE.Vector2(0.26 + Math.pow(k, 1.8) * 0.62 + Math.sin(k * 9) * 0.03, -k * 1.2));
    }
    this.part(this.body, new THREE.LatheGeometry(skirtProfile, 20), this.shadowMat(0x010102, 0x18121f, 2.6, 0.5), [0, 0, 0], [1, 1, 0.85]);
    // 찢어진 연기 자락: 허리 둘레에서 늘어져 바닥에 끌리며 흔들린다
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rng() * 0.2;
      // 바깥을 보게 돌린 뒤(y), 바깥쪽으로 벌어지며 늘어진다(x)
      const turn = new THREE.Group();
      turn.rotation.y = a;
      this.body.add(turn);
      const g = new THREE.Group();
      g.position.set(0, 0.05, 0.22);
      g.rotation.set(-0.5 - rng() * 0.15, 0, 0);
      turn.add(g);
      const len = 1.15 + rng() * 0.5;
      this.part(g, ribbonGeometry(0.3 + rng() * 0.16, len, rng, 0.55), strand, [0, 0, 0], [1, 1, 1]);
      this.sway.push({ g, base: g.rotation.clone(), ph: rng() * Math.PI * 2, amp: 0.14, kind: 'trail' });
    }

    // ── 몸통: 넓은 가슴에서 가는 허리로 좁아지는 V자 ──
    this.part(this.spine, new THREE.SphereGeometry(0.3, 16, 12), skin, [0, 0.15, 0], [1, 1.25, 0.8]);
    this.part(this.spine, new THREE.CylinderGeometry(0.62, 0.3, 1.0, 14), skin, [0, 0.72, 0], [1, 1, 0.58]);
    this.spine.add(this.chest);
    this.chest.position.y = 1.2;
    this.part(this.chest, new THREE.SphereGeometry(0.5, 18, 14), skin, [0, 0, 0.02], [1.38, 0.72, 0.66]);
    // 가슴 근육 두 덩이 + 복근 결
    for (const sx of [-1, 1]) this.part(this.chest, new THREE.SphereGeometry(0.26, 14, 10), skin, [sx * 0.22, -0.08, 0.2], [1.1, 0.75, 0.55]);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) this.part(this.spine, new THREE.SphereGeometry(0.09, 10, 8), deep, [sx * 0.09, 0.38 + i * 0.17, 0.2 - i * 0.01], [1.2, 0.8, 0.5]);
    // 굳은 그림자 갑주: 가슴 위쪽으로 칼날 같은 판이 겹쳐 솟는다
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const sh = this.part(this.chest, shardGeometry(0.09, 0.42 - i * 0.08), plate, [sx * (0.18 + i * 0.13), 0.16 + i * 0.02, 0.26 - i * 0.05], [1, 1, 0.5]);
        sh.rotation.set(0.25, 0, sx * (0.5 + i * 0.25));
      }
    }

    // 금이 간 가슴 한가운데서 새어 나오는 붉은 심장빛
    this.heartMat = red(0xff2238);
    this.part(this.chest, new THREE.OctahedronGeometry(0.05, 0), this.heartMat, [0, -0.05, 0.36], [1, 1.6, 0.6]);
    this.crackMat = red(0xff3046, 0.7);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3 + rng() * 0.6;
      const len = 0.07 + rng() * 0.1;
      const c = this.part(this.chest, new THREE.BoxGeometry(0.007, len, 0.008), this.crackMat, [Math.sin(a) * len * 0.55, -0.05 + Math.cos(a) * len * 0.55, 0.355], [1, 1, 1]);
      c.rotation.z = -a;
    }
    this.heartGlow = glow(this.chest, 0, -0.05, 0.42, 0.4, 0xff2236, 0.8);
    this.heartLight = new THREE.PointLight(0xff2a3a, 0.3, 3, 2);
    this.heartLight.position.set(0, -0.05, 1.4);
    this.chest.add(this.heartLight);

    // 등 뒤로 비죽 솟은 척추 칼날
    for (let i = 0; i < 4; i++) {
      const s = this.part(this.spine, shardGeometry(0.07, 0.32 - i * 0.04), plate, [0, 1.25 - i * 0.22, -0.26 + i * 0.02], [0.6, 1, 1]);
      s.rotation.x = -1.0;
    }

    // ── 목 · 머리 (뼈 이름을 head 로 둬서 대사창 초상화가 얼굴을 찾는다) ──
    this.neck = new THREE.Bone();
    this.neck.name = 'neck';
    this.neck.position.set(0, 1.42, 0.02);
    this.spine.add(this.neck);
    this.part(this.neck, new THREE.CylinderGeometry(0.13, 0.22, 0.32, 10), skin, [0, 0.1, 0], [1, 1, 0.9]);
    // 목덜미를 감싼 높은 깃 (갑주가 목 뒤로 솟는다)
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 2.2;
      const s = this.part(this.neck, shardGeometry(0.08, 0.34 + (1 - Math.abs(a) / 1.1) * 0.1), plate, [Math.sin(a) * 0.24, 0.02, -Math.cos(a) * 0.16], [1, 1, 0.45]);
      s.rotation.set(-0.35, a * 0.5, Math.sin(a) * -0.4);
    }
    this.head = new THREE.Bone();
    this.head.name = 'head';
    this.head.position.set(0, 0.36, 0.03);
    this.neck.add(this.head);
    // 갸름하고 각진 두개골 + 뾰족한 턱
    this.part(this.head, new THREE.SphereGeometry(0.19, 16, 12), skin, [0, 0.05, 0], [0.92, 1.12, 1.0]);
    const jaw = this.part(this.head, new THREE.ConeGeometry(0.13, 0.2, 8), skin, [0, -0.14, 0.04], [1, 1, 0.85]);
    jaw.rotation.x = Math.PI;
    // 눈두덩: 눈 위로 날카롭게 내리누르는 이마
    for (const sx of [-1, 1]) {
      const b = this.part(this.head, new THREE.BoxGeometry(0.15, 0.035, 0.06), deep, [sx * 0.07, 0.085, 0.165], [1, 1, 1]);
      b.rotation.z = sx * 0.32;
    }
    // 이마의 붉은 결정
    this.part(this.head, new THREE.OctahedronGeometry(0.03, 0), red(0xff2a3c), [0, 0.15, 0.18], [0.8, 1.6, 0.6]);
    // 위로 째진 붉은 눈 + 옆으로 꼬리를 끄는 빛
    const eyeMat = red(0xff3446);
    for (const sx of [-1, 1]) {
      const e = this.part(this.head, new THREE.SphereGeometry(0.03, 10, 8), eyeMat, [sx * 0.075, 0.045, 0.172], [1.9, 0.6, 0.6]);
      e.rotation.z = sx * 0.3;
      this.eyeGlow.push(glow(this.head, sx * 0.08, 0.045, 0.2, 0.26, 0xff2a3a, 0.9));
      const trail = glow(this.head, sx * 0.2, 0.08, 0.15, 0.06, 0xff2236, 0.7, 5.5);
      trail.material.rotation = sx * 0.28;
      this.eyeGlow.push(trail);
    }
    // 눈빛이 둘레(내 얼굴, 나무)를 붉게 물들인다
    this.eyeLight = new THREE.PointLight(0xff2a3a, 1.0, 5, 2);
    this.eyeLight.position.set(0, 0.1, 2.2);
    this.head.add(this.eyeLight);

    // 검은 연기 불꽃 왕관: 머리 위로 높게 타오르며 일렁인다
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 3.2;
      const center = 1 - Math.abs(a) / 1.7;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * 0.15, 0.17, Math.cos(a) * 0.05 - 0.04);
      g.rotation.set(-0.2 - rng() * 0.15, 0, -Math.sin(a) * 0.6);
      this.head.add(g);
      const h = 0.32 + center * 0.55 + rng() * 0.15;
      this.part(g, flameGeometry(0.07 + center * 0.05, h, rng), strand, [0, 0, 0], [1, 1, 0.7]);
      this.sway.push({ g, base: g.rotation.clone(), ph: rng() * Math.PI * 2, amp: 0.18, kind: 'flame' });
    }

    // ── 팔: 넓은 어깨에서 늘어져 손끝이 무릎(연기 자락) 아래까지 ──
    const mkArm = (sx: number) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.74, 1.28, 0);
      this.spine.add(sh);
      this.part(sh, new THREE.SphereGeometry(0.22, 14, 10), skin, [0, 0, 0], [1, 1, 0.95]);
      // 어깨 갑주: 바깥·위로 뻗는 칼날 여러 겹
      for (let i = 0; i < 5; i++) {
        const s = this.part(sh, shardGeometry(0.08 + (i === 2 ? 0.02 : 0), 0.32 + (i === 2 ? 0.2 : (2 - Math.abs(i - 2)) * 0.06)), plate, [sx * 0.08, 0.12, (i - 2) * 0.09], [1, 1, 0.55]);
        s.rotation.set((i - 2) * 0.28, 0, -sx * (0.55 + (2 - Math.abs(i - 2)) * 0.12));
      }
      this.part(sh, new THREE.CylinderGeometry(0.19, 0.12, 0.9, 10), skin, [0, -0.47, 0], [1, 1, 0.9]);
      const el = new THREE.Group();
      el.position.y = -0.92;
      sh.add(el);
      // 팔꿈치 뒤로 솟은 가시
      this.part(el, shardGeometry(0.04, 0.2), plate, [0, 0.02, -0.1], [1, 1, 1]).rotation.x = -2.2;
      this.part(el, new THREE.CylinderGeometry(0.13, 0.065, 0.92, 9), skin, [0, -0.46, 0], [1, 1, 0.9]);
      const hand = new THREE.Group();
      hand.position.y = -0.94;
      el.add(hand);
      this.part(hand, new THREE.SphereGeometry(0.095, 10, 8), skin, [0, -0.04, 0.01], [1.15, 0.9, 0.75]);
      // 길게 뻗은 손가락 다섯: 끝이 갈퀴처럼 휜다
      const fingers: THREE.Group[] = [];
      for (let i = 0; i < 5; i++) {
        const fg = new THREE.Group();
        const thumb = i === 0;
        fg.position.set(thumb ? -sx * 0.0 + 0.0 : (i - 2.5) * 0.04 * sx, -0.1, thumb ? 0.07 : 0.02);
        fg.rotation.set(0.25, 0, thumb ? sx * 0.6 : (i - 2.5) * 0.08 * sx);
        hand.add(fg);
        this.part(fg, new THREE.CylinderGeometry(0.018, 0.022, 0.16, 6), skin, [0, -0.08, 0], [1, 1, 1]);
        const tip = new THREE.Group();
        tip.position.y = -0.16;
        tip.rotation.x = 0.45;
        fg.add(tip);
        this.part(tip, new THREE.ConeGeometry(0.018, thumb ? 0.16 : 0.26, 5), claw, [0, -(thumb ? 0.08 : 0.13), 0], [1, 1, 1]).rotation.x = Math.PI;
        fingers.push(fg);
      }
      return { sh, el, hand, fingers };
    };
    this.arm = { L: mkArm(1), R: mkArm(-1) };

    // ── 찢어진 연기 망토: 어깨 뒤에서 바닥까지 흐른다 ──
    for (let i = 0; i < 11; i++) {
      const k = i / 10 - 0.5;
      const g = new THREE.Group();
      g.position.set(k * 1.0, 1.38, -0.3 - (0.5 - Math.abs(k)) * 0.06);
      g.rotation.set(0.3 + Math.abs(k) * 0.1, k * 0.35, k * 0.12);
      this.spine.add(g);
      const len = 2.3 + (0.5 - Math.abs(k)) * 0.5 + rng() * 0.35;
      this.part(g, ribbonGeometry(0.24 + rng() * 0.06, len, rng, 0.75), strand, [0, 0, 0], [1, 1, 1]);
      this.sway.push({ g, base: g.rotation.clone(), ph: rng() * Math.PI * 2, amp: 0.1, kind: 'cloak' });
    }

    // 바닥에서 맴도는 연기 뭉치 (자락 끝을 흐려 땅에 녹아든 것처럼)
    const smokeTex = smokeTexture();
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x000000, transparent: true, opacity: 0.75 + rng() * 0.25, depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      const sc = 1.0 + rng() * 0.8;
      const it = { s, a: (i / 20) * Math.PI * 2 + rng(), r: 0.25 + rng() * 0.55, y: 0.1 + rng() * 0.85, sc, ph: rng() * Math.PI * 2 };
      this.root.add(s);
      this.skirt.push(it);
    }
    // 왕관·어깨에서 피어오르는 연기 가닥 (계속 새로 피어 흩어진다)
    const wispTex = wispTexture();
    const spots: [THREE.Object3D, number, number][] = [
      [this.head, 0, 0], [this.head, 0.1, 0], [this.head, -0.1, 0], [this.head, 0, -0.05],
      [this.arm.L.sh, 0.1, 0], [this.arm.R.sh, -0.1, 0], [this.arm.L.sh, 0.05, -0.1], [this.arm.R.sh, -0.05, -0.1],
    ];
    for (let i = 0; i < 16; i++) {
      const [from, ox, oz] = spots[i % spots.length];
      const mat = new THREE.SpriteMaterial({ map: wispTex, color: 0x050407, transparent: true, opacity: 0, depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      this.root.add(s);
      this.wisps.push({ s, mat, from, ox, oz, life: 1 + rng() * 0.99, dur: 1.6 + rng() * 1.2, drift: (rng() - 0.5) * 0.5 });
    }

    // 그림자는 단단한 몸(살·갑주·손톱)만 드리운다 (연기 자락·불꽃·빛은 빼서 그림자가 지저분하지 않게)
    const solid = new Set<THREE.Material>([skin, plate, claw]);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = solid.has(m.material as THREE.Material);
    });
  }

  /** 빛을 먹는 검은 재질: 가장자리(옆으로 비스듬한 면)만 은은하게 번져 실루엣이 읽힌다 */
  private shadowMat(color: number, rim: number, pow: number, k: number, roughness = 1) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: roughness < 1 ? 0.25 : 0, emissive: 0x000000 });
    const rc = new THREE.Color(rim);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rc };
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\ngl_FragColor.rgb += uRim * pow(rimK, ${pow.toFixed(2)}) * ${k.toFixed(2)};\n#include <dithering_fragment>`,
      );
    };
    m.customProgramCacheKey = () => `shadow-rim-${rim.toString(16)}-${pow}-${k}`;
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

  update(f: Fighter, c: FrameClock) {
    const lp = f.lerped(c.alpha);
    const dt = Math.max(1e-4, c.dt);
    // 실제로 움직인 거리로 빠르기를 잰다
    if (this.last) {
      const v = Math.hypot(lp.x - this.last.x, lp.z - this.last.z) / dt;
      this.speed += (Math.min(v, 8) - this.speed) * Math.min(1, dt * 6);
    }
    this.last = { x: lp.x, z: lp.z };

    // 큰 몸은 천천히 돌아선다
    const want = Math.atan2(lp.fx, lp.fz);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 4);
    this.root.position.set(lp.x, lp.y, lp.z);
    this.root.rotation.y = this.yaw;

    const t = c.t / 60;
    const move = Math.min(1, this.speed / 3);
    const breathe = Math.sin(t * 1.4);

    // 공격: 오른팔을 높이 들었다가 내려 할퀸다 / 맞으면 움찔
    this.atk = f.state === 'attack' ? Math.min(1, this.atk + dt * 2.6) : Math.max(0, this.atk - dt * 3);
    this.hurt = f.state === 'hitstun' ? Math.min(1, this.hurt + dt * 8) : Math.max(0, this.hurt - dt * 4);
    const swing = f.state === 'attack' ? (this.atk < 0.45 ? this.atk / 0.45 : 1 - (this.atk - 0.45) / 0.55 * 1.6) : 0;

    // 미끄러지듯 떠서 오르내린다 (걷지 않는다). 움직이면 앞으로 기울어 밀고 들어온다
    this.body.position.y = 1.2 + Math.sin(t * 1.1) * 0.05 + breathe * 0.012;
    this.body.rotation.x = move * 0.16;
    this.body.rotation.z = Math.sin(t * 0.8) * 0.02;
    // 가슴을 편 꼿꼿한 자세 (맞으면 뒤로 젖혔다가, 할퀼 때 앞으로 숙인다)
    this.spine.rotation.x = -0.04 + breathe * 0.02 - this.hurt * 0.3 + Math.max(0, swing) * 0.12 - Math.min(0, swing) * 0.25;
    this.spine.rotation.y = Math.sin(t * 0.6) * 0.04 - swing * 0.2;
    this.chest.scale.set(1 + breathe * 0.015, 1, 1 + breathe * 0.02);
    // 고개를 살짝 숙여 내려다보며 노려본다
    this.neck.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
    this.head.rotation.set(0.12 - move * 0.1 + this.hurt * 0.25, Math.sin(t * 0.5) * 0.12 * (1 - move), Math.sin(t * 0.4) * 0.04);

    for (const [k, sx] of [['L', 1], ['R', -1]] as const) {
      const a = this.arm[k];
      const ph = Math.sin(t * 1.2 + (k === 'L' ? 0 : 1.6));
      // 서 있을 땐 손톱을 살짝 벌리고 늘어뜨린다 / 움직이면 뒤로 끌린다
      a.sh.rotation.set(0.1 + move * 0.35 + ph * 0.04, 0, sx * (0.24 + breathe * 0.015));
      a.el.rotation.set(-0.3 - (1 - move) * 0.15 + ph * 0.03, 0, -sx * 0.1);
      a.hand.rotation.x = -0.15 + Math.sin(t * 1.8 + sx) * 0.06;
      for (let i = 0; i < a.fingers.length; i++) a.fingers[i].rotation.x = 0.25 + Math.sin(t * 2.3 + i + sx) * 0.08;
      if (k === 'R' && swing !== 0) {
        a.sh.rotation.x = -0.3 - swing * 2.5;
        a.sh.rotation.z = -0.4;
        a.el.rotation.x = -0.25 - Math.max(0, swing) * 0.55;
      }
    }

    for (const s of this.sway) {
      const w = Math.sin(t * (s.kind === 'flame' ? 3.1 : 1.6) + s.ph);
      const w2 = Math.cos(t * (s.kind === 'flame' ? 4.3 : 1.1) + s.ph * 1.7);
      if (s.kind === 'flame') {
        s.g.rotation.set(s.base.x + w * s.amp * 0.5, 0, s.base.z + w2 * s.amp);
        s.g.scale.y = 1 + Math.sin(t * 5.2 + s.ph) * 0.12;
      } else {
        // 움직이면 자락이 뒤로 휘날린다
        const back = move * (s.kind === 'cloak' ? 0.45 : 0.35);
        s.g.rotation.set(s.base.x + back + w * s.amp, s.base.y, s.base.z + w2 * s.amp * 0.6);
      }
    }

    // 바닥 연기: 몸 둘레를 천천히 맴돌며 부풀었다 준다
    for (const sm of this.skirt) {
      const a = sm.a + t * 0.25;
      const k = 1 + Math.sin(t * 0.9 + sm.ph) * 0.15;
      sm.s.position.set(Math.sin(a) * sm.r, sm.y + Math.sin(t * 0.7 + sm.ph) * 0.05, Math.cos(a) * sm.r * 0.8 - move * 0.3);
      sm.s.scale.setScalar(sm.sc * k);
      sm.s.material.rotation = sm.ph + t * 0.2;
    }

    // 피어오르는 연기 가닥: 피어나 위로 흘러가며 흩어진다 (몸이 움직이면 뒤로 끌린다)
    this.root.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const p = new THREE.Vector3();
    for (const w of this.wisps) {
      w.life += dt / w.dur;
      if (w.life >= 1) {
        w.life -= 1;
        p.set(w.ox, 0.15, w.oz);
        w.from.localToWorld(p);
        p.applyMatrix4(inv);
        w.s.position.copy(p);
      }
      const l = w.life;
      w.s.position.y += dt * 0.55;
      w.s.position.x += dt * w.drift;
      w.s.position.z -= dt * (0.15 + move * 1.2);
      w.mat.opacity = Math.sin(l * Math.PI) * 0.55;
      w.s.scale.set(0.22 + l * 0.35, 0.4 + l * 0.6, 1);
      w.mat.rotation = w.drift * 2 + l * 0.6;
    }

    // 눈빛·심장빛이 불규칙하게 일렁인다 (심장은 맥박처럼)
    const flick = 0.85 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.05;
    for (const g of this.eyeGlow) g.material.opacity = 0.8 * flick;
    this.eyeLight.intensity = 1.0 * flick;
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);
    this.heartGlow.material.opacity = 0.55 + beat * 0.4;
    this.heartGlow.scale.setScalar(0.5 + beat * 0.18);
    this.crackMat.opacity = 0.55 + beat * 0.4;
    this.heartLight.intensity = 0.22 + beat * 0.3;
    this.heartMat.color.setRGB(1, 0.13 + beat * 0.2, 0.2 + beat * 0.1);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** 칼날 조각: 바닥이 넓고 끝이 뾰족한 납작한 사면체 (갑주·가시용). 원점 = 밑동, 위로 자란다 */
function shardGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(w, h, 4, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** 찢어진 천/연기 자락: 위가 넓고 아래로 갈수록 가늘어지며 끝이 들쭉날쭉. 원점 = 윗변 가운데, 아래로 늘어진다 */
function ribbonGeometry(w: number, len: number, rng: () => number, taper: number): THREE.BufferGeometry {
  const segY = 8;
  const g = new THREE.PlaneGeometry(w, len, 2, segY);
  g.translate(0, -len / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const jag = Array.from({ length: 3 }, () => rng() * 0.25 * len);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const k = -y / len; // 0 = 위, 1 = 끝
    const col = Math.round((x / w + 0.5) * 2);
    // 끝자락은 칸마다 다른 길이로 찢어진다
    const ny = k > 0.99 ? y + jag[col] : y;
    pos.setXYZ(i, x * (1 - k * taper), ny, Math.sin(k * 3 + col) * 0.03 - k * k * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

/** 연기 불꽃 한 줄기: 밑이 굵고 위로 비틀리며 가늘게 타오른다. 원점 = 밑동 */
function flameGeometry(r: number, h: number, rng: () => number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 8, 8, true);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bend = (rng() - 0.5) * 0.18;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y / h;
    pos.setX(i, pos.getX(i) + Math.sin(k * 4.5) * 0.03 + bend * k * k);
    pos.setZ(i, pos.getZ(i) - k * k * 0.08);
  }
  g.computeVertexNormals();
  return g;
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

/** 피어오르는 연기 가닥: 위아래로 길쭉하고 살짝 휜 옅은 줄기 */
let wispTex: THREE.Texture | null = null;
function wispTexture(): THREE.Texture {
  if (wispTex) return wispTex;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const k = i / 13;
    const x = 32 + Math.sin(k * 5) * 10;
    const y = 120 - k * 112;
    const r = 14 - k * 7;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.5 - k * 0.25})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 128);
  }
  wispTex = new THREE.CanvasTexture(cv);
  return wispTex;
}
