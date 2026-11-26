import * as THREE from 'three';
import { mulberry32 } from '../core/controllers';
import type { Fighter } from '../core/fighter';
import type { FrameClock } from './clock';
import type { CharacterView } from './mannequin';

/**
 * 프롤로그의 "이름 없는 그림자" — 그림판 모델.
 * 콘셉트 시트(Firefly)의 앞 · 옆 · 뒤 그림을 배경 없이 오려, 카메라가 보는 방향에 맞는 그림을 세워 보여 준다
 * (방향이 바뀌는 사이는 두 그림을 겹쳐 부드럽게 넘긴다). 숲 나무와 같은 붓질이라 화면에서 따로 놀지 않는다.
 * 그 위에 움직임을 얹는다: 미끄러지듯 떠 오르내림, 연기 하반신 · 왕관 불꽃의 일렁임(정점 셰이더),
 * 깜빡이는 붉은 눈, 맥박처럼 뛰는 심장빛, 몸에서 피어올라 흩어지는 연기, 바닥을 맴도는 연기.
 * 원점 = 발밑(연기 자락 끝), 앞 = +z (다른 캐릭터와 같다).
 */
type View = 'front' | 'side' | 'back';
const VIEWS: Record<View, { url: string; aspect: number; eyes: [number, number][]; heart: [number, number] | null }> = {
  // eyes · heart = 그림 안 위치 (가로 0~1 왼쪽부터, 세로 0~1 위부터)
  front: { url: '/prologue/beast/beast-front.webp', aspect: 579 / 1024, eyes: [[0.458, 0.178], [0.545, 0.178]], heart: [0.515, 0.322] },
  side: { url: '/prologue/beast/beast-side.webp', aspect: 404 / 1024, eyes: [[0.2, 0.172]], heart: [0.245, 0.33] },
  back: { url: '/prologue/beast/beast-back.webp', aspect: 483 / 1024, eyes: [], heart: null },
};
const HEIGHT = 3.15;

export class ShadowBeast implements CharacterView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** 카메라를 향해 도는 판 (자식: 그림 두 장 + 빛) */
  private card = new THREE.Group();
  private planes: THREE.Mesh[] = [];
  private planeMats: THREE.MeshBasicMaterial[] = [];
  private tex: Record<View, THREE.Texture>;
  private head: THREE.Bone;
  private eyeGlow: THREE.Sprite[] = [];
  private heartGlow: THREE.Sprite;
  private eyeLight: THREE.PointLight;
  private heartLight: THREE.PointLight;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private time = { value: 0 };
  private hurtU = { value: 0 };
  private yaw = Math.PI;
  private speed = 0;
  private last: { x: number; z: number } | null = null;
  private atk = 0;
  private hurt = 0;
  private flick = 1;
  private beat = 0;
  private skirt: { s: THREE.Sprite; a: number; r: number; y: number; sc: number; ph: number }[] = [];
  private wisps: { s: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; dur: number; drift: number; ox: number; oy: number }[] = [];

  constructor() {
    const rng = mulberry32(13);
    this.root.add(this.body);
    this.body.add(this.card);

    const loader = new THREE.TextureLoader();
    const load = (url: string) => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    this.tex = { front: load(VIEWS.front.url), side: load(VIEWS.side.url), back: load(VIEWS.back.url) };

    // 그림 두 장 (지금 방향 + 넘어가는 방향). 세로로 잘게 나눠 아래쪽 연기가 물결치게 한다
    for (let i = 0; i < 2; i++) {
      const g = new THREE.PlaneGeometry(1, 1, 6, 40);
      g.translate(0, 0.5, 0);
      this.geos.push(g);
      const m = new THREE.MeshBasicMaterial({ map: this.tex.front, color: 0xa4a2b0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time;
        sh.uniforms.uHurt = this.hurtU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // 하반신 연기: 아래로 갈수록 크게 물결친다 / 머리 위 불꽃: 끝이 살랑인다
          float low = pow(max(0.0, 1.0 - uv.y / 0.5), 1.6);
          transformed.x += (sin(uTime * 1.6 + uv.y * 11.0) * 0.035 + sin(uTime * 2.7 + uv.y * 23.0 + uv.x * 4.0) * 0.015) * low;
          float top = smoothstep(0.86, 1.0, uv.y);
          transformed.x += sin(uTime * 4.3 + uv.x * 9.0) * 0.012 * top;
          transformed.y += sin(uTime * 3.1 + uv.x * 7.0) * 0.006 * top;`,
        );
        sh.fragmentShader = 'uniform float uHurt;\n' + sh.fragmentShader.replace(
          '#include <dithering_fragment>',
          // 맞으면 잠깐 하얗게 번쩍
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uHurt * 0.55 * gl_FragColor.a);\n#include <dithering_fragment>',
        );
      };
      m.customProgramCacheKey = () => 'shadow-card';
      this.mats.push(m);
      this.planeMats.push(m);
      const p = new THREE.Mesh(g, m);
      p.renderOrder = 2 + i;
      this.card.add(p);
      this.planes.push(p);
    }
    // 카메라마다(대사창 초상화 포함) 그 카메라를 향해 돌고, 보는 각도에 맞는 그림을 고른다
    this.planes[0].onBeforeRender = (_r, _s, cam) => this.face(cam);

    // 뼈 이름 head: 대사창 초상화가 얼굴을 찾는다
    this.head = new THREE.Bone();
    this.head.name = 'head';
    this.head.position.set(0, HEIGHT * (1 - 0.19), 0);
    this.body.add(this.head);

    const glowTex = glowTexture();
    const glow = (s: number, color: number, op: number) => {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.mats.push(g.material);
      g.scale.setScalar(s);
      g.renderOrder = 5;
      this.card.add(g);
      return g;
    };
    for (let i = 0; i < 2; i++) this.eyeGlow.push(glow(0.16, 0xff2a3a, 0.8));
    this.heartGlow = glow(0.3, 0xff2236, 0.5);

    this.eyeLight = new THREE.PointLight(0xff2a3a, 1.0, 5, 2);
    this.eyeLight.position.set(0, HEIGHT * 0.82, 1.6);
    this.body.add(this.eyeLight);
    this.heartLight = new THREE.PointLight(0xff2a3a, 0.3, 3, 2);
    this.heartLight.position.set(0, HEIGHT * 0.68, 1.2);
    this.body.add(this.heartLight);

    // 바닥을 맴도는 연기 (그림 끝자락을 땅에 녹인다)
    const smokeTex = smokeTexture();
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x000000, transparent: true, opacity: 0.4 + rng() * 0.2, depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      this.root.add(s);
      // 땅에 묻혀 잘리지 않게 연기 뭉치 아래끝이 바닥 위에 오도록 띄운다
      const sc = 0.7 + rng() * 0.5;
      this.skirt.push({ s, a: (i / 12) * Math.PI * 2 + rng(), r: 0.3 + rng() * 0.45, y: sc * 0.45 + rng() * 0.1, sc, ph: rng() * Math.PI * 2 });
    }
    // 왕관 · 어깨에서 피어올라 흩어지는 연기 가닥
    const wispTex = wispTexture();
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({ map: wispTex, color: 0x060508, transparent: true, opacity: 0, depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      this.root.add(s);
      const crown = i % 3 !== 0;
      this.wisps.push({ s, mat, life: rng(), dur: 1.6 + rng() * 1.3, drift: (rng() - 0.5) * 0.5, ox: crown ? (rng() - 0.5) * 0.35 : (rng() < 0.5 ? -1 : 1) * (0.45 + rng() * 0.2), oy: crown ? HEIGHT * 0.9 : HEIGHT * 0.7 });
    }
  }

  /** 카메라를 향해 판을 돌리고, 보는 각도(앞 · 옆 · 뒤)에 맞는 그림 두 장을 섞는다 */
  /** 이 카메라를 향하게 미리 맞춘다 (그리기 전에 부르면 같은 프레임에 바로 들어간다) */
  aim(cam: THREE.Camera) {
    this.root.updateMatrixWorld(true);
    this.faceCam(cam);
    this.card.updateMatrixWorld(true);
  }

  private face(cam: THREE.Camera) {
    this.faceCam(cam);
    // 이 판의 행렬은 그리기 직전에 다시 계산되므로, 바뀐 방향이 같은 프레임에 바로 들어간다
    this.card.updateMatrixWorld(true);
  }

  private faceCam(cam: THREE.Camera) {
    const wp = new THREE.Vector3();
    this.root.getWorldPosition(wp);
    const ang = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z);
    this.card.rotation.y = ang - this.yaw;
    let rel = ang - this.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const a = Math.abs(rel);
    const band = 0.3;
    const sm = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    let main: View;
    let next: View;
    let t: number;
    if (a < Math.PI / 2) {
      main = 'front';
      next = 'side';
      t = sm(Math.PI / 4 - band, Math.PI / 4 + band, a);
    } else {
      main = 'side';
      next = 'back';
      t = sm((3 * Math.PI) / 4 - band, (3 * Math.PI) / 4 + band, a);
    }
    // 옆 그림은 왼쪽을 본다: 몸의 앞이 화면 오른쪽이면 뒤집는다
    const flip = Math.sin(rel) > 0 ? 1 : -1;
    const show = (i: number, v: View, op: number) => {
      const p = this.planes[i];
      const m = this.planeMats[i];
      if (m.map !== this.tex[v]) m.map = this.tex[v];
      const sx = v === 'side' ? flip : 1;
      p.scale.set(HEIGHT * VIEWS[v].aspect * sx, HEIGHT, 1);
      m.opacity = op;
      // 숨기지 않고 투명도로만 (보임 여부는 그리기 목록을 만들 때 이미 정해져서, 바꾸면 한 프레임 늦는다)
      p.visible = true;
    };
    // 크로스페이드: 아래 그림은 다 보이다가 위 그림이 다 덮은 뒤에야 빠진다 (중간에 비쳐 보이지 않게)
    show(0, main, t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
    show(1, next, t < 0.5 ? t * 2 : 1);
    // 빛: 더 많이 보이는 그림의 눈 · 심장 자리에
    const v = t < 0.5 ? main : next;
    const info = VIEWS[v];
    const sx = v === 'side' ? flip : 1;
    const w = HEIGHT * info.aspect;
    const at = (u: number, vv: number, o: THREE.Object3D) => o.position.set((u - 0.5) * w * sx, HEIGHT * (1 - vv), 0.05);
    this.eyeGlow.forEach((g, i) => {
      const e = info.eyes[i];
      if (e) at(e[0], e[1], g);
      g.material.opacity = e ? 0.85 * this.flick : 0;
    });
    this.heartGlow.material.opacity = 0;
    if (info.heart) {
      at(info.heart[0], info.heart[1], this.heartGlow);
      this.heartGlow.material.opacity = 0.3 + this.beat * 0.35;
      this.heartGlow.scale.setScalar(0.26 + this.beat * 0.1);
    }
  }

  update(f: Fighter, c: FrameClock) {
    const lp = f.lerped(c.alpha);
    const dt = Math.max(1e-4, c.dt);
    if (this.last) {
      const v = Math.hypot(lp.x - this.last.x, lp.z - this.last.z) / dt;
      this.speed += (Math.min(v, 8) - this.speed) * Math.min(1, dt * 6);
    }
    this.last = { x: lp.x, z: lp.z };
    const want = Math.atan2(lp.fx, lp.fz);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 4);
    this.root.position.set(lp.x, lp.y, lp.z);
    this.root.rotation.y = this.yaw;

    const t = c.t / 60;
    this.time.value = t;
    const move = Math.min(1, this.speed / 3);
    this.atk = f.state === 'attack' ? Math.min(1, this.atk + dt * 2.6) : Math.max(0, this.atk - dt * 3);
    this.hurt = f.state === 'hitstun' ? Math.min(1, this.hurt + dt * 8) : Math.max(0, this.hurt - dt * 4);
    const swing = f.state === 'attack' ? (this.atk < 0.45 ? this.atk / 0.45 : 1 - (this.atk - 0.45) / 0.55 * 1.6) : 0;
    this.hurtU.value = this.hurt;

    // 미끄러지듯 떠서 오르내린다. 할퀼 땐 몸을 부풀렸다가 앞으로 덮쳐 오고, 맞으면 움찔 물러선다
    const rise = Math.max(0, swing);
    this.body.position.set(Math.sin(t * 23) * 0.04 * this.hurt, 0.08 + Math.sin(t * 1.1) * 0.06, Math.max(0, -swing) * 0.6 - this.hurt * 0.25);
    this.body.scale.set(1 + rise * 0.06, 1 + rise * 0.08 - Math.max(0, -swing) * 0.04, 1);
    this.body.rotation.z = Math.sin(t * 0.8) * 0.015 + move * 0.0;

    this.flick = 0.85 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.05;
    this.beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);
    this.eyeLight.intensity = 1.0 * this.flick;
    this.heartLight.intensity = 0.22 + this.beat * 0.3;

    for (const sm of this.skirt) {
      const a = sm.a + t * 0.25;
      const k = 1 + Math.sin(t * 0.9 + sm.ph) * 0.15;
      sm.s.position.set(Math.sin(a) * sm.r, sm.y + Math.sin(t * 0.7 + sm.ph) * 0.05, Math.cos(a) * sm.r * 0.8 - move * 0.3);
      sm.s.scale.setScalar(sm.sc * k);
      sm.s.material.rotation = sm.ph + t * 0.2;
    }
    for (const w of this.wisps) {
      w.life += dt / w.dur;
      if (w.life >= 1) {
        w.life -= 1;
        w.s.position.set(w.ox, w.oy + this.body.position.y, -0.05);
      }
      const l = w.life;
      w.s.position.y += dt * 0.5;
      w.s.position.x += dt * w.drift;
      w.s.position.z -= dt * (0.1 + move * 1.2);
      w.mat.opacity = Math.sin(l * Math.PI) * 0.5;
      w.s.scale.set(0.2 + l * 0.35, 0.4 + l * 0.6, 1);
      w.mat.rotation = w.drift * 2 + l * 0.6;
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of Object.values(this.tex)) t.dispose();
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
