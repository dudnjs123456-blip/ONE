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
/** 그림을 앞으로 부풀리는 최대 두께 (몸통 한가운데) */
const THICK = 0.42;

export class ShadowBeast implements CharacterView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** 카메라를 향해 도는 판 (자식: 그림 두 장 + 빛) */
  private card = new THREE.Group();
  private planes: THREE.Mesh[] = [];
  /** 판마다 팔 두 개를 붙이는 틀 (판과 같은 방향으로 돌지만 크기는 1:1) */
  private rigs: THREE.Group[] = [];
  private arms: { pivot: THREE.Group; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; side: 1 | -1 }[][] = [[], []];
  /** 이번 공격에 쓰는 팔 (공격마다 번갈아) */
  private atkSide: 1 | -1 = 1;
  private wasAtk = false;
  private planeMats: THREE.MeshStandardMaterial[] = [];
  private tex: Record<View, { map: THREE.Texture; height: THREE.Texture; normal: THREE.Texture; glow: THREE.Texture }>;
  private depthMats: THREE.MeshDepthMaterial[] = [];
  private head: THREE.Bone;
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
  private veil: { s: THREE.Sprite; a: number; r: number; y: number; sc: number; sp: number; ph: number }[] = [];
  private wisps: { s: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; dur: number; drift: number; ox: number; oy: number }[] = [];

  constructor() {
    const rng = mulberry32(13);
    this.root.add(this.body);
    this.body.add(this.card);

    const loader = new THREE.TextureLoader();
    const load = (url: string, color: boolean) => {
      const t = loader.load(url);
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const set = (v: View) => {
      // 앞모습은 팔을 떼어 낸 몸통 그림 (팔은 따로 움직이는 판)
      const base = VIEWS[v].url.replace('.webp', '') + (v === 'front' ? '-body' : '');
      const url = base + '.webp';
      return { map: load(url, true), height: load(base + '-height.webp', false), normal: load(base + '-normal.webp', false), glow: load(base + '-glow.webp', true) };
    };
    this.tex = { front: set('front'), side: set('side'), back: set('back') };

    // 그림 두 장 (지금 방향 + 넘어가는 방향).
    // 윤곽선에서 안쪽으로 갈수록 솟는 높이 지도로 판을 실제로 부풀리고(두께), 표면 방향 지도로 달빛 · 붉은 눈빛을 받는다.
    // 촘촘히 나눠서 부풀린 모양과 아래쪽 연기 물결이 매끄럽게.
    const wave = `
          // 하반신 연기: 아래로 갈수록 크게 물결친다 / 머리 위 불꽃: 끝이 살랑인다
          float low = pow(max(0.0, 1.0 - uv.y / 0.5), 1.6);
          transformed.x += (sin(uTime * 1.6 + uv.y * 11.0) * 0.035 + sin(uTime * 2.7 + uv.y * 23.0 + uv.x * 4.0) * 0.015) * low;
          float top = smoothstep(0.86, 1.0, uv.y);
          transformed.x += sin(uTime * 4.3 + uv.x * 9.0) * 0.012 * top;
          transformed.y += sin(uTime * 3.1 + uv.x * 7.0) * 0.006 * top;`;
    for (let i = 0; i < 2; i++) {
      const g = new THREE.PlaneGeometry(1, 1, 64, 128);
      g.translate(0, 0.5, 0);
      this.geos.push(g);
      const t = this.tex.front;
      const m = new THREE.MeshStandardMaterial({
        map: t.map,
        displacementMap: t.height,
        displacementScale: THICK,
        normalMap: t.normal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        // 스스로 빛나는 건 그림에 칠해진 붉은 눈 · 눈가 줄기 · 이마 보석 · 심장뿐 (발광 지도).
        // 몸은 숲의 달빛 · 하늘빛만 받아서 주변 나무와 같은 밝기 · 안개 속에 녹아든다
        emissiveMap: t.glow,
        emissive: 0xffffff,
        emissiveIntensity: 1.6,
        color: 0xc4c2d0,
        roughness: 0.78,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.12,
        side: THREE.DoubleSide,
      });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time;
        sh.uniforms.uHurt = this.hurtU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + wave);
        sh.fragmentShader = 'uniform float uHurt;\n' + sh.fragmentShader.replace(
          '#include <dithering_fragment>',
          // 맞으면 잠깐 하얗게 번쩍
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uHurt * 0.55 * gl_FragColor.a);\n#include <dithering_fragment>',
        );
      };
      m.customProgramCacheKey = () => 'shadow-card-lit';
      this.mats.push(m);
      this.planeMats.push(m);
      // 달빛 그림자: 그림 모양 그대로 (부풀린 모양 · 연기 물결까지 같이)
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t.map, alphaTest: 0.5, displacementMap: t.height, displacementScale: THICK });
      dm.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + wave);
      };
      dm.customProgramCacheKey = () => 'shadow-card-depth';
      this.mats.push(dm);
      this.depthMats.push(dm);
      const p = new THREE.Mesh(g, m);
      p.customDepthMaterial = dm;
      p.renderOrder = 2 + i;
      this.card.add(p);
      this.planes.push(p);
    }
    this.buildArms(load);
    // 카메라마다(대사창 초상화 포함) 그 카메라를 향해 돌고, 보는 각도에 맞는 그림을 고른다
    this.planes[0].onBeforeRender = (_r, _s, cam) => this.face(cam);

    // 뼈 이름 head: 대사창 초상화가 얼굴을 찾는다
    this.head = new THREE.Bone();
    this.head.name = 'head';
    this.head.position.set(0, HEIGHT * (1 - 0.19), 0);
    this.body.add(this.head);

    // 심장 빛이 둘레 땅 · 연기를 아주 희미하게 붉게 물들인다 (얼굴 앞에 따로 빛 덩어리를 띄우지 않는다)
    this.heartLight = new THREE.PointLight(0xff2a3a, 0.3, 3.5, 2);
    this.heartLight.position.set(0, HEIGHT * 0.62, 0.9);
    this.body.add(this.heartLight);

    // 몸을 감싸고 도는 연기 장막: 몸 앞뒤 · 여러 높이에 떠서, 돌아보면 몸 앞을 지나갔다 뒤로 숨는다.
    // 그림 한 장이 아니라 연기 덩어리 속에 서 있는 것처럼 보이게 (숲 안개 색과 같은 어두운 남빛)
    const veilTex = smokeTexture();
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({ map: veilTex, color: 0x0b0e15, transparent: true, opacity: 0.16 + rng() * 0.14, depthWrite: false });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      this.body.add(s);
      this.veil.push({ s, a: (i / 16) * Math.PI * 2 + rng() * 0.4, r: 0.45 + rng() * 0.4, y: 0.4 + rng() * HEIGHT * 0.62, sc: 0.8 + rng() * 0.7, sp: (rng() < 0.5 ? -1 : 1) * (0.15 + rng() * 0.2), ph: rng() * 6.28 });
    }

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
    this.card.rotation.y = 0;
    let rel = ang - this.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const a = Math.abs(rel);
    const band = 0.14;
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
    // 판은 몸의 방향(앞 0° · 옆 ±90° · 뒤 180°)에 서고 카메라 쪽으로는 30% 만 따라 돈다.
    // 그래서 비스듬히 보면 부풀린 두께가 옆으로 드러나 입체로 보인다 (늘 정면을 보면 두께가 안 보인다)
    const wrap = (x: number) => {
      while (x > Math.PI) x -= Math.PI * 2;
      while (x < -Math.PI) x += Math.PI * 2;
      return x;
    };
    const baseOf = (v: View) => (v === 'front' ? 0 : v === 'back' ? Math.PI : Math.sign(rel || 1) * Math.PI / 2);
    const angOf = (v: View) => baseOf(v) + wrap(rel - baseOf(v)) * 0.3;
    const show = (i: number, v: View, op: number) => {
      const p = this.planes[i];
      p.rotation.y = angOf(v);
      const m = this.planeMats[i];
      const tx = this.tex[v];
      if (m.map !== tx.map) {
        m.map = tx.map;
        m.emissiveMap = tx.glow;
        m.displacementMap = tx.height;
        m.normalMap = tx.normal;
        const dm = this.depthMats[i];
        dm.map = tx.map;
        dm.displacementMap = tx.height;
      }
      const sx = v === 'side' ? flip : 1;
      p.scale.set(HEIGHT * VIEWS[v].aspect * sx, HEIGHT, 1);
      m.opacity = op;
      // 더 많이 보이는 쪽만 깊이를 쓰고 그림자를 드리운다 (겹쳐 넘어가는 동안 서로 가리지 않게)
      m.depthWrite = op >= 0.5;
      p.castShadow = op >= 0.5;
      // 숨기지 않고 투명도로만 (보임 여부는 그리기 목록을 만들 때 이미 정해져서, 바꾸면 한 프레임 늦는다)
      p.visible = true;
      // 앞모습일 때만 이 판의 팔이 같은 방향 · 같은 투명도로 붙는다
      const rig = this.rigs[i];
      rig.rotation.y = angOf(v);
      for (const a of this.arms[i]) {
        const vis = v === 'front' ? op : 0;
        a.mat.opacity = vis;
        a.mat.depthWrite = vis >= 0.5;
        a.mesh.castShadow = vis >= 0.5;
      }
    };
    // 크로스페이드: 아래 그림은 다 보이다가 위 그림이 다 덮은 뒤에야 빠진다 (중간에 비쳐 보이지 않게)
    show(0, main, t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
    show(1, next, t < 0.5 ? t * 2 : 1);
  }

  /**
   * 앞모습 팔 두 개: 그림에서 떼어 낸 팔을 어깨를 축으로 따로 돌린다 (2D 컷아웃 리깅).
   * 팔도 몸통처럼 높이 지도로 부풀려 달빛을 받고 그림자를 드리운다. 판마다 한 벌씩 (크로스페이드 때 같이 흐려진다).
   */
  private buildArms(load: (url: string, color: boolean) => THREE.Texture) {
    const IW = 579;
    const IH = 1024;
    const Wd = HEIGHT * VIEWS.front.aspect;
    // 그림 속 팔 상자(x0, y0, w, h)와 어깨 축(px, py). side: -1 = 화면 왼쪽 팔, 1 = 오른쪽 팔
    const ARMS = [
      { key: 'L', side: -1 as const, x0: 104, y0: 323, w: 116, h: 384, px: 184, py: 334 },
      { key: 'R', side: 1 as const, x0: 371, y0: 323, w: 137, h: 372, px: 400, py: 334 },
    ];
    const tex = ARMS.map((a) => {
      const b = '/prologue/beast/beast-front-arm' + a.key;
      return { map: load(b + '.webp', true), height: load(b + '-height.webp', false), normal: load(b + '-normal.webp', false) };
    });
    for (let i = 0; i < 2; i++) {
      const rig = new THREE.Group();
      this.card.add(rig);
      this.rigs.push(rig);
      ARMS.forEach((a, k) => {
        const g = new THREE.PlaneGeometry((a.w / IW) * Wd, (a.h / IH) * HEIGHT, 12, 36);
        // 어깨 축이 원점에 오게 옮긴다
        g.translate(((a.x0 + a.w / 2 - a.px) / IW) * Wd, -((a.y0 + a.h / 2 - a.py) / IH) * HEIGHT, 0);
        this.geos.push(g);
        const m = new THREE.MeshStandardMaterial({
          map: tex[k].map,
          displacementMap: tex[k].height,
          displacementScale: THICK * 0.7,
          normalMap: tex[k].normal,
          normalScale: new THREE.Vector2(1.1, 1.1),
          color: 0xc4c2d0,
          roughness: 0.78,
          metalness: 0.05,
          transparent: true,
          opacity: 0,
          alphaTest: 0.12,
          side: THREE.DoubleSide,
        });
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uHurt = this.hurtU;
          sh.fragmentShader = 'uniform float uHurt;\n' + sh.fragmentShader.replace(
            '#include <dithering_fragment>',
            'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uHurt * 0.55 * gl_FragColor.a);\n#include <dithering_fragment>',
          );
        };
        m.customProgramCacheKey = () => 'shadow-arm-lit';
        this.mats.push(m);
        const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex[k].map, alphaTest: 0.5, displacementMap: tex[k].height, displacementScale: THICK * 0.7 });
        this.mats.push(dm);
        const mesh = new THREE.Mesh(g, m);
        mesh.customDepthMaterial = dm;
        mesh.renderOrder = 4 + i;
        const pivot = new THREE.Group();
        // 몸통 표면보다 조금 앞 (팔이 망토 · 몸통 위에 얹힌다)
        pivot.position.set((a.px / IW - 0.5) * Wd, HEIGHT * (1 - a.py / IH), THICK * 0.45);
        pivot.add(mesh);
        rig.add(pivot);
        this.arms[i].push({ pivot, mesh, mat: m, side: a.side });
      });
    }
  }

  /**
   * 팔 자세: 평소엔 천천히 흔들리고, 움직이면 뒤로 끌리고, 맞으면 바깥으로 움찔.
   * 할퀴기: 한 팔을 머리 위 바깥으로 치켜들었다가(준비) 앞으로 내밀며 몸 앞을 가로질러 내려친다. 공격마다 팔을 번갈아.
   */
  private poseArms(t: number, attacking: boolean, move: number, dt: number) {
    if (attacking && !this.wasAtk) this.atkSide = this.atkSide === 1 ? -1 : 1;
    this.wasAtk = attacking;
    const ease = (x: number) => {
      const k = Math.max(0, Math.min(1, x));
      return k * k * (3 - 2 * k);
    };
    let up = 0;
    let sweep = 0;
    if (attacking) {
      const a = this.atk;
      if (a < 0.45) up = ease(a / 0.45);
      else if (a < 0.62) {
        const k = ease((a - 0.45) / 0.17);
        up = 1 - k;
        sweep = k;
      } else sweep = 1 - ease((a - 0.62) / 0.38);
    }
    const kk = Math.min(1, dt * 16);
    for (const list of this.arms) {
      for (const arm of list) {
        const s = arm.side;
        const ph = s > 0 ? 0 : 1.7;
        // 바깥쪽으로 벌리기 = s * 각도
        let rz = s * (0.03 + Math.sin(t * 1.3 + ph) * 0.045) + s * 0.35 * this.hurt;
        let rx = Math.sin(t * 0.9 + ph) * 0.06 + move * 0.2 + this.hurt * 0.15;
        if (s === this.atkSide) {
          rz += s * (2.3 * up - 0.75 * sweep);
          rx += 0.25 * up - 0.45 * sweep;
        } else {
          rz += s * 0.3 * (up + sweep * 0.5);
        }
        arm.pivot.rotation.z += (rz - arm.pivot.rotation.z) * kk;
        arm.pivot.rotation.x += (rx - arm.pivot.rotation.x) * kk;
      }
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
    this.poseArms(t, f.state === 'attack', move, dt);

    this.flick = 0.85 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1) * 0.05;
    this.beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);
    // 눈 · 심장 발광: 눈은 깜빡이듯 일렁이고 심장은 맥박에 맞춰 (한 발광 지도라 둘을 섞어 세기를 준다)
    for (const m of this.planeMats) m.emissiveIntensity = 1.3 + (this.flick - 0.85) * 2 + this.beat * 0.7;
    for (const vl of this.veil) {
      const a = vl.a + t * vl.sp;
      vl.s.position.set(Math.sin(a) * vl.r, vl.y + Math.sin(t * 0.6 + vl.ph) * 0.12, Math.cos(a) * vl.r * 0.7);
      vl.s.scale.setScalar(vl.sc * (1 + Math.sin(t * 0.8 + vl.ph) * 0.12));
      vl.s.material.rotation = vl.ph + t * 0.15;
    }
    this.heartLight.intensity = 0.12 + this.beat * 0.18;

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
    for (const t of Object.values(this.tex)) {
      t.map.dispose();
      t.height.dispose();
      t.normal.dispose();
    }
  }
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
