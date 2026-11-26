import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pixelRatioFor } from './graphics';
import { mulberry32 } from '../core/controllers';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, Nameplate, SparkSystem } from './effects';
import { playerLook } from './looks';
import { wornList } from '../data/fashion';
import type { CharacterView } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';
import { playHit, playWhoosh } from './sfx';
import { headshot } from './portraitShot';
import { ShadowBeast } from './shadowBeast';
import { CLIFF_Z, PATH, PATH_HALF, type PrologueWorld } from '../story/prologue';
import { BEAST_NAME } from '../data/prologueScript';

type View = CharacterView & { dispose?(): void; loaded?: boolean };

/**
 * 프롤로그 장면: 보랏빛 안개 숲 한 줄기 길 → 벼랑 끝. 벼랑 아래 멀리 경계 마을 불빛이 안개 사이로 보인다.
 * 카메라는 단계마다 바뀐다: 처음엔 게임 오프닝처럼 빛기둥 속 나를 한 바퀴 돌며 비추고, 그림자를 만나면 뒤돌아보고, 벼랑에선 옆에서 낭떠러지를 보여 준다.
 */
export class PrologueRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  private moon: THREE.DirectionalLight;
  private player: View;
  private beast: ShadowBeast;
  private beastPlate = new Nameplate(true);
  private wind: THREE.LineSegments;
  /** 게임 스폰 빛기둥 (처음 나타날 때만) */
  private pillar: THREE.Group;
  private lastWhoosh = 0;
  private _pivot = new THREE.Vector3();
  private _rot = new THREE.Vector3();
  private aura: THREE.Points;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private mist: THREE.Points;
  private sparks: SparkSystem;
  private texts: FloatingTexts;
  private camPos = new THREE.Vector3(0, 6, 6);
  private camLook = new THREE.Vector3(0, 1, 0);
  private shake = 0;
  private villageGlow: THREE.Sprite;
  /** 매 프레임 살랑이는 것들 (반딧불 · 땅 안개 · 버섯 빛) */
  private ambient: ((t: number, dt: number) => void)[] = [];
  /** 그린 배경 띠 (카메라를 둘러싼 원통): 숲 전경 + 벼랑 쪽 전망 */
  private band!: { root: THREE.Group; north: THREE.MeshBasicMaterial; vista: THREE.MeshBasicMaterial };

  constructor(canvas: HTMLCanvasElement, world: PrologueWorld) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(pixelRatioFor(this.renderer.getContext()));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 빛 번짐: 붉은 눈·심장, 빛나는 버섯, 포자처럼 밝은 곳만 은은하게 번진다
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // 컷신과 같은 색: 푸른 달빛 안개 숲 (먼 곳일수록 안개 색에 묻힌다)
    const fogColor = 0x1b2a3d;
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(fogColor, 7, 44);
    this.scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x10161c, 0.9));
    this.moon = new THREE.DirectionalLight(0xcfdcff, 1.7);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.far = 70;
    this.scene.add(this.moon, this.moon.target);

    this.buildForest();
    this.villageGlow = this.buildAbyss();
    this.band = this.buildSkyBand();
    this.sparks = new SparkSystem(this.scene);
    this.texts = new FloatingTexts(this.scene);

    this.player = createCharacter(playerLook(wornList(world.profile.wardrobe), world.profile.body));
    this.player.casual = true;
    // 이름 없는 그림자: 컷신 속 모습대로 만든 전용 짐승 모델 (사슴뿔 · 붉은 눈 · 긴 팔과 갈퀴 손톱 · 그림자 가닥)
    this.beast = new ShadowBeast();
    this.beast.root.visible = false;
    this.beastPlate.sprite.visible = false;
    this.beastPlate.sprite.scale.multiplyScalar(1.3);
    // 그림자에서 피어오르는 검은 연기 (발밑에서 머리 위까지 천천히 솟아 흩어진다)
    const n = 160;
    const pos = new Float32Array(n * 3);
    const rng = mulberry32(5);
    // 몸 윤곽(갑주·왕관)이 읽히게 몸 바깥쪽 둘레로만, 옅게 솟는다
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.9 + rng() * 0.8;
      pos.set([Math.sin(a) * r, rng() * 3.4, Math.cos(a) * r * 0.8], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.aura = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x030106, size: 0.8, map: softDot(), transparent: true, opacity: 0.24, depthWrite: false }));
    this.aura.visible = false;
    this.scene.add(this.player.root, this.beast.root, this.beastPlate.sprite, this.aura);

    // 떠다니는 안개 알갱이 (길 위)
    const m = 600;
    const mp = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) mp.set([(rng() - 0.5) * 30, rng() * 6, 8 - rng() * 62], i * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.mist = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xb8c8e8, size: 0.12, map: softDot(), transparent: true, opacity: 0.45, depthWrite: false }));
    this.scene.add(this.mist);

    // 바람 줄기 (떨어질 때만): 몸 둘레 원통 안에 짧은 선들
    const w = 150;
    const wp = new Float32Array(w * 6);
    for (let i = 0; i < w; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 5;
      const y = (rng() - 0.5) * 24;
      wp.set([Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * r, y - 1.5, Math.sin(a) * r], i * 6);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    this.wind = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xe6deff, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
    this.wind.frustumCulled = false;
    this.wind.visible = false;
    this.scene.add(this.wind);

    // 하늘의 구름층 (떨어지며 뚫고 지나간다)
    const cloudTex = softDot();
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xd9ccff, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      const a = rng() * Math.PI * 2;
      const r = 2 + rng() * 14;
      c.position.set(Math.cos(a) * r, 34 + rng() * 26, Math.sin(a) * r);
      c.scale.setScalar(9 + rng() * 12);
      this.scene.add(c);
    }

    // 게임 스폰 빛기둥: 하늘에서 내리꽂힌 하늘색 기둥 + 발밑 마법진 고리 + 솟아오르는 빛 알갱이
    this.pillar = new THREE.Group();
    const glow = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 40, 32, 1, true), glow(0x7fe8ff, 0.55));
    beam.position.y = 20;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 40, 20, 1, true), glow(0xe8fbff, 0.8));
    core.position.y = 20;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.35, 48), glow(0x7fe8ff, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const sp = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 1.1;
      sp.set([Math.cos(a) * r, rng() * 6, Math.sin(a) * r], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const motes = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbff6ff, size: 0.14, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    motes.name = 'motes';
    this.pillar.add(beam, core, ring, motes);
    this.pillar.position.set(world.player.x, 0, world.player.z);
    this.scene.add(this.pillar);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = this.camera.aspect < 1 ? 66 : 48;
    this.camera.updateProjectionMatrix();
  }

  /** 대사창 초상화: 나 · 그림자 얼굴을 찍는다 (모델을 다 불러오기 전이면 null) */
  portrait(who: 'me' | 'beast', world: PrologueWorld): string | null {
    const v = who === 'me' ? this.player : this.beast;
    const f = who === 'me' ? world.player : world.beast;
    if (who === 'me' && this.player.loaded === false) return null;
    const vis = v.root.visible;
    v.root.visible = true;
    const shot = headshot(this.renderer, this.scene, v.root, { x: f.fx, z: f.fz }, { zoom: who === 'beast' ? 0.55 : 1, hide: [who === 'me' ? this.beast.root : this.player.root, this.aura] });
    v.root.visible = vis;
    return shot;
  }

  sync(world: PrologueWorld, clock: FrameClock) {
    const p = world.player;
    const b = world.beast;
    // 허공에선 편한 대기 동작(걷기·서기 동작 파일)을 끄고 허우적거리는 자세를 그대로 보여 준다
    this.player.casual = p.freefall === 0;
    this.player.update(p, clock);
    this.updatePillar(world, clock);
    if (world.phase === 'jump' && p.y < -0.3) {
      // 벼랑에서 몸을 던진 뒤: 앞으로 고꾸라지며 빙글
      const sp = world.fallSpin;
      this.player.root.rotation.set(Math.min(1.4, -p.y * 0.1) + Math.sin(sp) * 0.3, 0, Math.sin(sp * 0.7) * 0.5);
    } else {
      this.player.root.rotation.x = this.player.root.rotation.z = 0;
    }
    // 몸은 그 사람 자리(허리)를 축으로 돈다 (모델 묶음의 원점은 세상 한가운데라 그냥 돌리면 엉뚱한 데로 날아간다)
    {
      const r = this.player.root;
      const lp = p.lerped(clock.alpha);
      const pivot = this._pivot.set(lp.x, lp.y + 0.9, lp.z);
      r.position.copy(pivot).sub(this._rot.copy(pivot).applyEuler(r.rotation));
    }

    const out = world.beastOut;
    this.beast.root.visible = out;
    this.aura.visible = out;
    this.beastPlate.sprite.visible = out;
    if (out) {
      this.beast.update(b, clock);
      const bp = b.lerped(clock.alpha);
      this.aura.position.set(bp.x, 0, bp.z);
      this.aura.rotation.y = clock.t * 0.01;
      // 연기 알갱이가 위로 솟아 머리 위에서 다시 발밑으로
      const ap = this.aura.geometry.attributes.position as THREE.BufferAttribute;
      const aa = ap.array as Float32Array;
      for (let i = 1; i < aa.length; i += 3) aa[i] = (aa[i] + clock.dt * 0.5) % 3.4;
      ap.needsUpdate = true;
      this.beastPlate.draw(BEAST_NAME, 1, 1);
      this.beastPlate.sprite.position.set(bp.x, 4.4, bp.z);
    }

    for (const e of world.drainEvents()) {
      playHit(e.kind, e.heavy, e.victim === 0 ? 0.9 : 0.5);
      this.shake = Math.max(this.shake, this.sparks.spawn(e) * (e.victim === 0 ? 1.6 : 0.5));
    }
    for (const t of world.drainTexts()) this.texts.spawn(t.text, t.x, t.y, t.z, '#c9b8ff', 1.1);
    this.sparks.update(clock.dt);
    this.texts.update(clock.dt);
    this.shake = Math.max(this.shake, world.shake);
    world.shake = 0;

    // 마을 불빛이 숨 쉬듯 일렁인다
    this.villageGlow.material.opacity = 0.22 + Math.sin(clock.t * 0.03) * 0.06;
    this.mist.rotation.y = Math.sin(clock.t * 0.002) * 0.05;
    for (const a of this.ambient) a(clock.t / 60, clock.dt);

    this.updateWind(world, clock);
    this.updateCamera(world, clock);
    if (world.beastOut) this.beast.aim(this.camera);
    this.composer.render();
  }

  /** 떨어지는 동안: 몸 둘레로 위로 솟구치는 바람 줄기, 바람 소리, 땅에 처박히는 순간 흙먼지 */
  private updateWind(world: PrologueWorld, clock: FrameClock) {
    const p = world.player.lerped(clock.alpha);
    const falling = world.player.freefall > 0;
    this.wind.visible = falling;
    // 시야가 넓어지며 속도감이 난다
    const fovWant = (this.camera.aspect < 1 ? 66 : 48) + (falling ? 14 : 0);
    if (Math.abs(this.camera.fov - fovWant) > 0.05) {
      this.camera.fov += (fovWant - this.camera.fov) * smooth(0.08, clock.dt);
      this.camera.updateProjectionMatrix();
    }
    if (falling) {
      const pos = this.wind.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      // 떨어지는 빠르기만큼 줄기가 위로 스친다 (몸 기준 위아래 12m 안에서 돌고 돈다)
      const speed = 2.5;
      for (let i = 0; i < arr.length; i += 6) {
        let y = arr[i + 1] + speed * clock.dt * 60 * 0.35;
        if (y > 12) y -= 24;
        arr[i + 1] = y;
        arr[i + 4] = y - 1.2 - speed * 0.6;
      }
      pos.needsUpdate = true;
      this.wind.position.set(p.x, p.y, p.z);
      (this.wind.material as THREE.LineBasicMaterial).opacity = 0.25 + 0.25 * Math.min(1, speed / 3);
      if (performance.now() - this.lastWhoosh > 420) {
        this.lastWhoosh = performance.now();
        playWhoosh(false);
      }
    }
  }

  /** 스폰 빛기둥: 처음엔 눈부시게 내리꽂혔다가 나를 남기고 가늘어지며 사라진다. 나는 빛 속에서 서서히 나타난다 */
  private updatePillar(world: PrologueWorld, clock: FrameClock) {
    const u = world.spawnT;
    this.pillar.visible = u < 1;
    // 빛이 가장 셀 때(처음 25%)는 몸이 아직 안 보인다
    this.player.root.visible = u > 0.18;
    if (u >= 1) return;
    const fade = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.55) / 0.45);
    const thin = 1 - Math.max(0, (u - 0.5) / 0.5) * 0.8;
    this.pillar.children.forEach((c, i) => {
      const mat = (c as THREE.Mesh).material as THREE.Material & { opacity: number };
      mat.opacity = [0.22, 0.3, 0.75, 0.85][i] * fade;
      if (i < 2) c.scale.set(thin, 1, thin);
    });
    const ring = this.pillar.children[2];
    ring.rotation.z = clock.t * 0.04;
    ring.scale.setScalar(1 + Math.sin(clock.t * 0.12) * 0.05);
    const motes = this.pillar.getObjectByName('motes') as THREE.Points;
    const arr = motes.geometry.attributes.position.array as Float32Array;
    for (let i = 1; i < arr.length; i += 3) arr[i] = (arr[i] + clock.dt * 2.4) % 6;
    motes.geometry.attributes.position.needsUpdate = true;
  }

  private updateCamera(world: PrologueWorld, clock: FrameClock) {
    const p = world.player.lerped(clock.alpha);
    const b = world.beast.lerped(clock.alpha);
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    let k = 0.06;
    switch (world.phase) {
      case 'spawn': {
        // 게임 오프닝: 빛기둥 속 나를 앞쪽에서 반 바퀴 돌며 비추고, 끝나면 등 뒤 평소 자리로 내려앉는다
        const u = world.spawnT;
        const ang = Math.PI * (1 - u * 1.0);
        const r = 5.2 + u * 3;
        wantPos.set(p.x + Math.sin(ang) * r, 1.8 + u * 5.4, p.z + Math.cos(ang) * r);
        wantLook.set(p.x, 1.1 + u * 0.2, p.z - u * 1.5);
        k = 0.12;
        break;
      }
      case 'encounter': {
        // 뒤를 돌아본다: 내 어깨 너머로 그림자
        wantPos.set(p.x - 2.2, 2.6, p.z - 4.2);
        wantLook.set((p.x + b.x) / 2, 1.6, (p.z + b.z) / 2 + 1.5);
        k = 0.08;
        break;
      }
      case 'cliff':
      case 'fight':
      case 'cornered':
        // 그림자 등 뒤에서: 벼랑 끝에 선 나, 그 너머 구름 바다와 멀리 마을 · 산 · 달 (그린 배경)
        wantPos.set(p.x + 1.6, 4.6, CLIFF_Z + 10);
        wantLook.set(p.x + 0.6, -2.2, CLIFF_Z - 14);
        k = 0.05;
        break;
      case 'jump':
      case 'done':
        k = 0.3;
        if (p.y > -1) {
          // 벼랑 끝으로 달려가 몸을 던지는 순간
          wantPos.set(p.x + 3, 3.5, p.z + 4);
          wantLook.set(p.x, 0.5, p.z - 2);
        } else {
          // 같이 떨어지며 위에서 내려다본다: 아래로 빨려 들어가는 몸, 멀어지는 벼랑
          // (카메라는 낭떠러지 쪽 허공에: 벼랑 쪽에 두면 바위벽 속에 묻힌다)
          wantPos.set(p.x + 1.8, p.y + 3.4, p.z - 2.2);
          wantLook.set(p.x, p.y - 0.8, p.z + 0.3);
        }
        break;
      default:
        // 평소: 어깨 너머 낮은 자리에서 길 앞쪽 숲을 바라보는 추적 카메라 (안개 속 숲과 그린 배경이 보이게). 쫓길 땐 조금 더 멀리
        if (world.phase === 'chase') {
          // 쫓길 땐 높이 · 옆으로 비켜서 본다: 뒤따라오는 그림자가 카메라 앞을 막아 내 몸을 가리지 않게
          // (화면 아래쪽에 다가오는 그림자, 가운데에 달아나는 나, 그 앞에 길)
          wantPos.set(p.x + 2.4, 6.4, p.z + 8.5);
          wantLook.set(p.x - 0.3, 0.6, p.z - 4.5);
        } else {
          wantPos.set(p.x, 3.8, p.z + 7);
          wantLook.set(p.x, 1.3, p.z - 5);
        }
    }
    const s = smooth(k, clock.dt);
    this.camPos.lerp(wantPos, s);
    this.camLook.lerp(wantLook, s);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.shake *= Math.pow(0.86, clock.dt * 60);
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.updateSkyBand(world);
    const fp = world.player;
    this.moon.position.set(fp.x + 6, 18, fp.z + 4);
    this.moon.target.position.set(fp.x, 0, fp.z - 2);
  }

  private buildForest() {
    const s = this.scene;
    const rng = mulberry32(77);
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    /** 길 한가운데 선까지 거리 */
    const pathDist = (x: number, z: number) => {
      let best = Infinity;
      for (let i = 0; i + 1 < PATH.length; i++) {
        const a = PATH[i];
        const c = PATH[i + 1];
        const vx = c.x - a.x;
        const vz = c.z - a.z;
        const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(x - (a.x + vx * u), z - (a.z + vz * u)));
      }
      return best;
    };
    const nearPath = (x: number, z: number, pad = 1.2) => pathDist(x, z) < PATH_HALF + pad;
    /** 숲 바닥 높낮이: 길과 벼랑 끝은 평평, 그 밖은 완만하게 울퉁불퉁 */
    const bump = (x: number, z: number) => {
      const away = Math.min(1, Math.max(0, (pathDist(x, z) - PATH_HALF - 1.5) / 4)) * Math.min(1, Math.max(0, (z - CLIFF_Z - 2) / 4));
      return away * (Math.sin(x * 0.35 + z * 0.12) * 0.35 + Math.sin(x * 0.9 - z * 0.7) * 0.15 + Math.cos(z * 0.45) * 0.2 + 0.2);
    };

    // 땅: 이끼 낀 숲 바닥에 흙·낙엽 얼룩 (꼭짓점 색). 벼랑 끝(CLIFF_Z)에서 뚝 끊긴다
    const len = 70;
    const gg = new THREE.PlaneGeometry(90, len, 120, 96);
    gg.rotateX(-Math.PI / 2);
    gg.translate(0, 0, CLIFF_Z + len / 2);
    const gp = gg.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(gp.count * 3);
    const moss = new THREE.Color(0x1c2a2a);
    const leaf = new THREE.Color(0x2a2626);
    const dirt = new THREE.Color(0x3a332f);
    const c = new THREE.Color();
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      gp.setY(i, bump(x, z));
      const pd = pathDist(x, z);
      const n = Math.sin(x * 1.7 + z * 0.9) * 0.5 + Math.sin(x * 0.4 - z * 1.3) * 0.5;
      c.copy(moss).lerp(leaf, 0.5 + n * 0.5);
      // 길: 밟아 다져진 흙. 가장자리는 이끼와 섞인다
      const k = Math.max(0, Math.min(1, (PATH_HALF + 0.9 - pd) / 1.4));
      c.lerp(dirt, k * (0.85 + n * 0.1));
      c.toArray(cols, i * 3);
    }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    s.add(ground);

    // 나무: Firefly 로 그린 전나무·소나무·마른 나무 그림으로 만든 입체 나무.
    // 가까운 나무는 그림을 줄기 축에서 반으로 갈라, 그 반쪽 판(가지)을 줄기 둘레에 별 모양으로 여러 장 꽂는다.
    // 판은 카메라를 따라 돌지 않고 땅에 박혀 있어서, 돌아보면 가지가 겹치고 어긋나며 실제 부피로 보인다.
    // 진짜 원기둥 줄기 · 둥근 나무 모양으로 굽힌 표면 방향(달빛을 받는 쪽이 밝다) · 땅에 드리우는 그림자 · 바람에 흔들림.
    // 멀리 안개에 묻힌 숲만 예전처럼 세운 그림판 (실루엣이라 차이가 안 난다).
    const TREES = [
      // cu = 그림 속 줄기 가운데(가로 0~1), trunk = 줄기 반지름 / 나무 높이, fins = 가지 판 수
      { url: "/prologue/trees/tree-1.webp", aspect: 441 / 1024, h: [8, 12], w: 3, cu: 0.493, trunk: 0.022, fins: 8 },
      { url: "/prologue/trees/tree-2.webp", aspect: 382 / 1024, h: [8, 12], w: 3, cu: 0.531, trunk: 0.02, fins: 8 },
      { url: "/prologue/trees/tree-3.webp", aspect: 266 / 1024, h: [9, 13], w: 1.2, cu: 0.505, trunk: 0.016, fins: 6 },
      { url: "/prologue/trees/tree-4.webp", aspect: 440 / 1024, h: [7, 11], w: 3, cu: 0.494, trunk: 0.021, fins: 8 },
      { url: "/prologue/trees/tree-5.webp", aspect: 342 / 1024, h: [5, 7], w: 0, cu: 0.51, trunk: 0, fins: 6 },
    ];
    const totalW = TREES.reduce((a, t) => a + t.w, 0);
    const pickTree = () => {
      let r = rng() * totalW;
      for (let i = 0; i < TREES.length; i++) if ((r -= TREES[i].w) <= 0) return i;
      return 0;
    };
    const near3d: { x: number; z: number; h: number }[][] = TREES.map(() => []);
    const farLists: THREE.Matrix4[][] = TREES.map(() => []);
    const placeTree = (i: number, x: number, z: number, h: number, far: boolean) => {
      if (!far) {
        near3d[i].push({ x, z, h });
        return;
      }
      const w = h * TREES[i].aspect * (rng() < 0.5 ? -1 : 1); // 좌우를 뒤집어 같은 그림이 덜 겹쳐 보이게
      farLists[i].push(new THREE.Matrix4().compose(v.set(x, bump(x, z) - h * 0.015, z), q.identity(), sc.set(w, h, 1)));
    };
    let tries = 0;
    let nearCount = 0;
    while (nearCount < 210 && tries++ < 5000) {
      const x = (rng() - 0.5) * 44;
      const z = 12 - rng() * (12 - CLIFF_Z - 2);
      if (nearPath(x, z, 3.0) || z < CLIFF_Z + 2) continue;
      const i = pickTree();
      const [h0, h1] = TREES[i].h;
      placeTree(i, x, z, h0 + rng() * (h1 - h0), false);
      nearCount++;
    }
    // 멀리 겹겹이 선 숲 (길에서 먼 양옆과 등 뒤): 안개에 묻혀 실루엣이 된다
    for (let n = 0; n < 200; n++) {
      const back = n >= 160;
      const side = rng() < 0.5 ? -1 : 1;
      const x = back ? (rng() - 0.5) * 50 : side * (22 + rng() * 22);
      const z = back ? 13 + rng() * 10 : 16 - rng() * (16 - CLIFF_Z - 3);
      const i = pickTree();
      const [h0, h1] = TREES[i].h;
      placeTree(i, x, z, (h0 + rng() * (h1 - h0)) * 1.25, true);
    }
    // 마른 나무: 길가 몇 그루와 벼랑 끝 한 그루 (이 숲이 어딘가 이상하다는 느낌)
    for (const [x, z, h] of [[-4.2, -3, 5.5], [5, -12, 6.5], [-6, -20, 6], [6.5, -29, 7], [-5.5, -36, 5.5], [-4, CLIFF_Z + 1.3, 6.5]] as const) placeTree(4, x, z, h, false);

    const up = new THREE.Vector3(0, 1, 0);
    TREES.forEach((t, i) => {
      const tex = new THREE.TextureLoader().load(t.url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      if (farLists[i].length) {
        const g = new THREE.PlaneGeometry(1, 1);
        g.translate(0, 0.5, 0);
        const m = new THREE.InstancedMesh(g, billboardMaterial(tex, 0x8fa0b4), farLists[i].length);
        farLists[i].forEach((mx, k) => m.setMatrixAt(k, mx));
        m.frustumCulled = false;
        s.add(m);
      }
      if (!near3d[i].length) return;
      const fin = new MeshBuilder();
      const bark = new MeshBuilder();
      for (const tr of near3d[i]) {
        const y0 = bump(tr.x, tr.z) - tr.h * 0.015;
        const base = new THREE.Vector3(tr.x, y0, tr.z);
        const yaw0 = rng() * Math.PI * 2;
        const ph = rng() * 6.28;
        for (let f = 0; f < t.fins; f++) {
          const a = yaw0 + (f / t.fins) * Math.PI * 2 + (rng() - 0.5) * 0.35;
          const right = f % 2 === 1;
          // 가지 판: 줄기 축(안쪽 끝)에서 바깥으로. 왼쪽 반쪽 / 오른쪽 반쪽 그림을 번갈아
          const uIn = t.cu;
          const uOut = right ? 1 : 0;
          const hk = tr.h * (0.94 + rng() * 0.08);
          const wk = hk * t.aspect * Math.abs(uOut - uIn) * (0.9 + rng() * 0.2);
          const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          const droop = 0.04 * hk;
          const nrm = d.clone().multiplyScalar(0.8).addScaledVector(up, 0.55).normalize();
          const rows = 5;
          const cols = 2;
          const start = fin.count;
          for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
              const fu = c / cols;
              const fv = r / rows;
              const p = base.clone().addScaledVector(d, fu * wk + tr.h * t.trunk * 0.2).add(new THREE.Vector3(0, fv * hk - fu * droop * (1 - fv * 0.5), 0));
              // 안쪽(줄기 옆)은 옆을, 바깥 끝은 바깥 · 위를 보게: 나무 전체가 둥근 덩어리처럼 빛을 받는다
              const nn = nrm.clone().lerp(d, 0.4 - fu * 0.4).normalize();
              fin.vert(p, nn, uIn + (uOut - uIn) * fu, fv, fv * fv * (0.25 + fu * 0.75), ph + a * 0.3);
            }
          }
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const k = start + r * (cols + 1) + c;
              fin.quad(k, k + 1, k + cols + 2, k + cols + 1);
            }
          }
        }
        if (t.trunk > 0) {
          // 줄기: 아래가 굵고 뿌리 쪽이 벌어진 원기둥. 그림 속 줄기 껍질을 둘러 붙인다
          const R = tr.h * t.trunk;
          const seg = 8;
          const hs = 4;
          const start = bark.count;
          const tw = 0.05;
          for (let r = 0; r <= hs; r++) {
            const fv = r / hs;
            const rad = R * (1 - fv * 0.7) * (r === 0 ? 1.6 : 1);
            for (let c = 0; c <= seg; c++) {
              const a = (c / seg) * Math.PI * 2 + yaw0;
              const nx = Math.sin(a);
              const nz = Math.cos(a);
              bark.vert(
                new THREE.Vector3(tr.x + nx * rad, y0 + fv * tr.h * 0.8 - (r === 0 ? 0.15 : 0), tr.z + nz * rad),
                new THREE.Vector3(nx, 0.15, nz).normalize(),
                t.cu - tw + (c % 2 === 0 ? 0 : tw * 2) * 1,
                0.05 + fv * 0.08,
                0,
                0,
              );
            }
          }
          for (let r = 0; r < hs; r++) {
            for (let c = 0; c < seg; c++) {
              const k = start + r * (seg + 1) + c;
              bark.quad(k, k + seg + 1, k + seg + 2, k + 1);
            }
          }
        }
      }
      const finMesh = new THREE.Mesh(fin.build(), litCardMaterial(tex, 0xc8d6e2, 0.32, true));
      finMesh.castShadow = true;
      finMesh.receiveShadow = true;
      finMesh.customDepthMaterial = cardDepthMaterial(tex);
      s.add(finMesh);
      if (bark.count) {
        const barkMesh = new THREE.Mesh(bark.build(), litCardMaterial(tex, 0xb8c6d2, 0.3, false));
        barkMesh.castShadow = true;
        barkMesh.receiveShadow = true;
        s.add(barkMesh);
      }
    });
    this.ambient.push((t) => {
      WIND.value = t;
    });

    // 숲 바닥: 덤불 · 고사리 · 풀포기 · 쓰러진 통나무 · 빛나는 버섯 · 이끼 바위.
    // 덤불 · 풀은 그림판을 엇갈려 세운 입체 포기(카메라를 따라 돌지 않는다), 바위 · 자갈 · 통나무는 진짜 입체.
    const PROPS = {
      bush: [["bush-1", 512 / 384], ["bush-2", 512 / 376], ["bush-3", 512 / 414], ["bush-4", 512 / 440]],
      fern: [["fern-1", 512 / 389], ["fern-2", 512 / 396]],
      grass: [["grass-1", 512 / 394], ["grass-2", 508 / 448]],
      mush: [["mush", 328 / 225]],
    } as const;
    const cardLists = new Map<string, { aspect: number; list: { x: number; y: number; z: number; h: number }[]; tint: number; fog: boolean; planes: number }>();
    const card = (name: string, aspect: number, x: number, z: number, h: number, tint = 0xd0dae6, fog = true, planes = 3) => {
      let e2 = cardLists.get(name);
      if (!e2) cardLists.set(name, (e2 = { aspect, list: [], tint, fog, planes }));
      e2.list.push({ x, y: bump(x, z) - h * 0.04, z, h });
    };
    const rocks: { x: number; y: number; z: number; r: number; moss: number }[] = [];
    const scatter = (count: number, pad: number, spread: number, put: (x: number, z: number) => void) => {
      let made = 0;
      let n = 0;
      while (made < count && n++ < count * 20) {
        const x = (rng() - 0.5) * spread;
        const z = 10 - rng() * (10 - CLIFF_Z - 0.6);
        if (nearPath(x, z, pad) || z < CLIFF_Z + 0.6) continue;
        put(x, z);
        made++;
      }
    };
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
    scatter(170, 0.7, 40, (x, z) => { const [n, a] = pick(PROPS.bush); card(n, a, x, z, 0.9 + rng() * 0.8); });
    scatter(220, 0.3, 34, (x, z) => { const [n, a] = pick(PROPS.fern); card(n, a, x, z, 0.7 + rng() * 0.6); });
    scatter(700, -0.3, 30, (x, z) => { const [n, a] = pick(PROPS.grass); card(n, a, x, z, 0.4 + rng() * 0.45, 0xd0dae6, true, 2); });
    scatter(60, 0.5, 36, (x, z) => { const r = 0.3 + rng() * 0.55; rocks.push({ x, y: bump(x, z), z, r, moss: 0.6 + rng() * 0.4 }); });
    // 길가 자갈: 길 가장자리를 따라 작은 돌
    for (let n = 0, made = 0; made < 150 && n < 4000; n++) {
      const x = (rng() - 0.5) * 20;
      const z = 6 - rng() * (6 - CLIFF_Z - 1);
      const pd = pathDist(x, z);
      if (pd > PATH_HALF + 0.9 || pd < PATH_HALF - 0.5) continue;
      rocks.push({ x, y: bump(x, z), z, r: 0.07 + rng() * 0.12, moss: rng() * 0.4 });
      made++;
    }
    // 희미하게 빛나는 버섯 무리: 길가 군데군데 (안개를 받지 않아 스스로 빛나 보인다)
    for (let i = 0; i < 22; i++) {
      for (let n = 0; n < 40; n++) {
        const x = (rng() - 0.5) * 14;
        const z = 4 - rng() * (4 - CLIFF_Z - 3);
        const pd = pathDist(x, z);
        if (pd > PATH_HALF + 0.6 && pd < PATH_HALF + 3) {
          const [nm, a] = PROPS.mush[0];
          card(nm, a, x, z, 0.3 + rng() * 0.25, 0xffffff, false, 2);
          break;
        }
      }
    }
    for (const [name, c2] of cardLists) {
      const tex = new THREE.TextureLoader().load(`/prologue/props/${name}.webp`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      // 엇갈려 세운 판 여러 장: 위에서 비스듬히 봐도 포기가 둥글게 보인다
      const mb = new MeshBuilder();
      for (const it of c2.list) {
        const w = it.h * c2.aspect;
        const a0 = rng() * Math.PI;
        const ph = rng() * 6.28;
        for (let p = 0; p < c2.planes; p++) {
          const a = a0 + (p / c2.planes) * Math.PI + (rng() - 0.5) * 0.3;
          const rx = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
          const flip = rng() < 0.5 ? -1 : 1;
          const k = mb.count;
          for (let r = 0; r <= 1; r++) {
            for (let c = 0; c <= 2; c++) {
              const fu = c / 2;
              const p3 = new THREE.Vector3(it.x, it.y, it.z).addScaledVector(rx, (fu - 0.5) * w * flip).add(new THREE.Vector3(0, r * it.h, 0));
              // 포기 가운데에서 바깥 · 위로 둥글게
              const nn = rx.clone().multiplyScalar((fu - 0.5) * flip * 1.2).addScaledVector(up, 0.5).normalize();
              mb.vert(p3, nn, fu, r, r * 0.35, ph);
            }
          }
          mb.quad(k, k + 1, k + 4, k + 3);
          mb.quad(k + 1, k + 2, k + 5, k + 4);
        }
      }
      const glow = name === 'mush';
      // 버섯은 받는 빛을 줄이고 스스로 빛나게, 덤불 · 풀은 숲 그늘 밝기로
      const mat = litCardMaterial(tex, glow ? 0x404040 : 0xa4b0bc, glow ? 0.7 : 0.24, true);
      mat.fog = c2.fog;
      const m = new THREE.Mesh(mb.build(), mat);
      m.receiveShadow = !glow;
      m.castShadow = name.startsWith('bush') || name.startsWith('fern');
      m.customDepthMaterial = cardDepthMaterial(tex);
      s.add(m);
    }
    // 바위 · 자갈: 울퉁불퉁하게 일그러뜨린 진짜 덩어리. 위쪽엔 이끼, 옆과 아래는 젖은 돌
    {
      const rockGeo: THREE.BufferGeometry[] = [];
      const stone = new THREE.Color(0x2c3236);
      const stoneDark = new THREE.Color(0x181c20);
      const mossC = new THREE.Color(0x2c4a40);
      for (const rk of rocks) {
        const g = new THREE.IcosahedronGeometry(1, rk.r > 0.25 ? 2 : 1);
        const pp = g.attributes.position as THREE.BufferAttribute;
        const sx = 1 + rng() * 0.5;
        const sz = 0.8 + rng() * 0.4;
        const sy = 0.55 + rng() * 0.25;
        const s1 = rng() * 10;
        const s2 = rng() * 10;
        for (let k = 0; k < pp.count; k++) {
          v.fromBufferAttribute(pp, k);
          const n = 1 + Math.sin(v.x * 2.3 + s1) * Math.sin(v.y * 2.9 + s2) * 0.18 + Math.sin(v.z * 4.1 + v.x * 3.3 + s2) * 0.08;
          v.multiplyScalar(n);
          // 바닥은 평평하게 눌러 땅에 앉힌다
          if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
          pp.setXYZ(k, v.x * sx * rk.r, v.y * sy * rk.r, v.z * sz * rk.r);
        }
        g.rotateY(rng() * 6.28);
        g.translate(rk.x, rk.y + rk.r * sy * 0.12, rk.z);
        g.computeVertexNormals();
        const nn = g.attributes.normal as THREE.BufferAttribute;
        const cols2 = new Float32Array(pp.count * 3);
        for (let k = 0; k < pp.count; k++) {
          const ny = nn.getY(k);
          const cc = new THREE.Color().copy(stoneDark).lerp(stone, 0.5 + ny * 0.5);
          cc.lerp(mossC, Math.max(0, Math.min(1, (ny - 0.35) * 2.2)) * rk.moss);
          cc.toArray(cols2, k * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols2, 3));
        const ng = g.toNonIndexed();
        g.dispose();
        rockGeo.push(ng);
      }
      if (rockGeo.length) {
        const merged = mergeGeometries(rockGeo);
        rockGeo.forEach((g) => g.dispose());
        const rm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
        rm.castShadow = true;
        rm.receiveShadow = true;
        s.add(rm);
      }
    }
    // 쓰러진 통나무: 나무 껍질을 두른 누운 원기둥 (잘린 면은 나이테 색)
    {
      const barkTex = new THREE.TextureLoader().load(TREES[0].url);
      barkTex.colorSpace = THREE.SRGBColorSpace;
      const mb = new MeshBuilder();
      const ends: THREE.BufferGeometry[] = [];
      scatter(9, 1.5, 26, (x, z) => {
        const L = 2 + rng() * 2;
        const R = 0.2 + rng() * 0.12;
        const a = rng() * Math.PI;
        const ax = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const side = new THREE.Vector3(-ax.z, 0, ax.x);
        const y = bump(x, z) + R * 0.75;
        const seg = 10;
        const k0 = mb.count;
        for (let e = 0; e <= 1; e++) {
          for (let c = 0; c <= seg; c++) {
            const t2 = (c / seg) * Math.PI * 2;
            const nrm = side.clone().multiplyScalar(Math.cos(t2)).add(new THREE.Vector3(0, Math.sin(t2), 0));
            const p3 = new THREE.Vector3(x, y, z).addScaledVector(ax, (e - 0.5) * L).addScaledVector(nrm, R);
            mb.vert(p3, nrm, TREES[0].cu - 0.05 + (c % 2) * 0.1, 0.05 + e * 0.08, 0, 0);
          }
        }
        for (let c = 0; c < seg; c++) mb.quad(k0 + c, k0 + c + 1, k0 + seg + 2 + c, k0 + seg + 1 + c);
        for (const e of [-1, 1]) {
          const cg = new THREE.CircleGeometry(R, seg);
          cg.lookAt(ax.clone().multiplyScalar(e));
          cg.translate(x + ax.x * e * L * 0.5, y, z + ax.z * e * L * 0.5);
          ends.push(cg);
        }
      });
      const lm = new THREE.Mesh(mb.build(), litCardMaterial(barkTex, 0xa0aab4, 0.25, false));
      lm.castShadow = true;
      lm.receiveShadow = true;
      s.add(lm);
      if (ends.length) {
        const em = new THREE.Mesh(mergeGeometries(ends), new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 1 }));
        ends.forEach((g) => g.dispose());
        em.castShadow = true;
        s.add(em);
      }
    }

    // 달빛 줄기: 나무 사이로 비스듬히 내리는 희미한 빛
    const rayTex = rayTexture();
    for (let i = 0; i < 9; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6 + rng() * 1.4, 16),
        new THREE.MeshBasicMaterial({ map: rayTex, color: 0xa8c4ff, transparent: true, opacity: 0.07 + rng() * 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      ray.position.set((rng() - 0.5) * 14, 6, 2 - i * 5.2 - rng() * 2);
      ray.rotation.set(0, (rng() - 0.5) * 0.8, 0.35);
      s.add(ray);
    }

    // 땅에 낮게 깔려 흐르는 안개
    const fogTex = softDot();
    const lowFog: THREE.Sprite[] = [];
    for (let i = 0; i < 46; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: 0x9fb4d0, transparent: true, opacity: 0.1 + rng() * 0.08, depthWrite: false }));
      f.position.set((rng() - 0.5) * 26, 0.4 + rng() * 0.6, 8 - rng() * (8 - CLIFF_Z));
      f.scale.set(6 + rng() * 6, 1.6 + rng(), 1);
      s.add(f);
      lowFog.push(f);
    }
    const fogBase = lowFog.map((f) => f.position.x);
    this.ambient.push((t) => lowFog.forEach((f, i) => {
      f.position.x = fogBase[i] + Math.sin(t * 0.12 + i * 1.7) * 1.6;
    }));

    // 반딧불 같은 포자: 푸르스름하게 떠다니며 깜빡인다
    const fn = 140;
    const fp = new Float32Array(fn * 3);
    const fb = new Float32Array(fn * 3);
    for (let i = 0; i < fn; i++) {
      fb.set([(rng() - 0.5) * 20, 0.3 + rng() * 2.8, 6 - rng() * (6 - CLIFF_Z)], i * 3);
    }
    fp.set(fb);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const flyMat = new THREE.PointsMaterial({ color: 0xa8fff0, size: 0.09, map: softDot(), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    s.add(new THREE.Points(fg, flyMat));
    this.ambient.push((t) => {
      for (let i = 0; i < fn; i++) {
        fp[i * 3] = fb[i * 3] + Math.sin(t * 0.5 + i) * 0.5;
        fp[i * 3 + 1] = fb[i * 3 + 1] + Math.sin(t * 0.8 + i * 2.3) * 0.3;
        fp[i * 3 + 2] = fb[i * 3 + 2] + Math.cos(t * 0.4 + i * 1.1) * 0.5;
      }
      fg.attributes.position.needsUpdate = true;
      flyMat.opacity = 0.7 + Math.sin(t * 2.1) * 0.2;
    });

  }

  /**
   * 그린 배경 띠: 카메라를 둘러싼 커다란 원통 안쪽에 Firefly 로 그린 그림을 붙인다 (하늘 상자처럼 카메라를 따라온다).
   * 아래쪽은 안개 색으로 번져 있어 3D 숲이 안개에 묻히는 색과 이어진다.
   * 북쪽(벼랑 방향) 한 칸은 두 장을 겹쳐 두고, 벼랑에 다가갈수록 숲 그림 → 벼랑 너머 전망(구름 바다 · 마을 · 산 · 달)으로 바뀐다.
   */
  private buildSkyBand() {
    const R = 60;
    const H = 52;
    // 그림 한 장이 차지하는 각도 (가로세로 비율을 지킨다)
    const span = (H * (3168 / 1344)) / R;
    const load = (url: string, repeat: number) => {
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.MirroredRepeatWrapping;
      t.repeat.x = repeat;
      t.anisotropy = 4;
      return t;
    };
    const mat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, color: 0xb4c0cc, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true });
    const seg = (start: number, len: number, m: THREE.MeshBasicMaterial) => {
      const g = new THREE.CylinderGeometry(R, R, H, 48, 1, true, start, len);
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -10;
      mesh.frustumCulled = false;
      return mesh;
    };
    const root = new THREE.Group();
    // 원통 각도 0 = +z(등 뒤), π = -z(벼랑 쪽)
    const nStart = Math.PI - span / 2;
    const rest = Math.PI * 2 - span;
    const forest = mat(load('/prologue/forest-pano.webp', rest / span));
    const north = mat(load('/prologue/forest-pano.webp', 1));
    const vista = mat(load('/prologue/cliff-vista.webp', 1));
    vista.opacity = 0;
    root.add(seg(nStart + span, rest, forest), seg(nStart, span, north), seg(nStart, span, vista));
    this.scene.add(root);
    return { root, north, vista };
  }

  /** 배경 띠를 카메라에 붙이고, 벼랑에 가까울수록 북쪽 그림을 전망으로 바꾼다 */
  private updateSkyBand(world: PrologueWorld) {
    const cam = this.camera.position;
    // 그림의 지평선(아래 1/3 안개 띠 위)이 눈높이 조금 아래에 오게
    const k = Math.min(1, Math.max(0, (world.player.z - (CLIFF_Z + 6)) / 16));
    this.band.root.position.set(cam.x, cam.y - 6 - (1 - k) * 2, cam.z);
    this.band.north.opacity = k;
    this.band.vista.opacity = 1 - k;
  }

  /** 벼랑: 들쭉날쭉한 바위 절벽 · 벼랑 끝 바위 · 깊은 안개 바다와 멀리 경계 마을 불빛 (건너편 산·달은 그린 배경 그림) */
  private buildAbyss(): THREE.Sprite {
    const s = this.scene;
    const rng = mulberry32(9);
    // 벼랑 면: 깎아지른 바위벽 (땅 밑에 둬서 낭떠러지 쪽으로 튀어나오지 않게) + 그 앞에 울퉁불퉁한 바위 덩어리
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 60, 2), new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 1 }));
    wall.position.set(0, -30.02, CLIFF_Z + 1);
    s.add(wall);
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rp = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const k = 0.8 + rng() * 0.35;
      rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x343a46, roughness: 1, flatShading: true });
    const face: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let y = -1.6; y > -40; y -= 2.4) {
      for (let x = -24; x < 24; x += 2 + rng() * 1.5) {
        const k = 1.0 + rng() * 0.6;
        face.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + (rng() - 0.5), CLIFF_Z + 1.25 + rng() * 0.3), q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3)), new THREE.Vector3(k * 1.3, k, Math.min(1.3, k))));
      }
    }
    s.add(instanced(rockGeo, rockMat, face, false, true));
    // 벼랑 끝 바위 (뛰어내리는 자리는 비운다)
    const edge: THREE.Matrix4[] = [];
    for (let x = -18; x < 18; x += 0.9 + rng() * 0.8) {
      if (Math.abs(x) < 2.2) continue;
      const k = 0.35 + rng() * 0.45;
      edge.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.05, CLIFF_Z + 0.35 + rng() * 0.5), q.setFromEuler(e.set(rng() * 3, rng() * 3, rng() * 3)), new THREE.Vector3(k * 1.4, k * (0.6 + rng() * 0.8), k)));
    }
    s.add(instanced(rockGeo, rockMat, edge, true, true));

    // 불빛 무리 둘레의 따뜻한 번짐
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,200,140,0.9)');
    gr.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false }));
    glow.scale.set(34, 12, 1);
    glow.position.set(0, -23, CLIFF_Z - 33);
    s.add(glow);
    // 안개 바다: 벼랑 아래를 천천히 흐르는 구름 덩어리 (마을·산·달은 그린 배경 그림에 있다)
    const tex = softDot();
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 26; i++) {
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xa9bad6, transparent: true, opacity: 0.16 + rng() * 0.12, depthWrite: false, fog: false }));
      cl.position.set((rng() - 0.5) * 90, -12 - rng() * 12, CLIFF_Z - 8 - rng() * 70);
      cl.scale.set(18 + rng() * 20, 5 + rng() * 4, 1);
      s.add(cl);
      clouds.push(cl);
    }
    const base = clouds.map((cl) => cl.position.x);
    this.ambient.push((t) => clouds.forEach((cl, i) => {
      cl.position.x = base[i] + Math.sin(t * 0.05 + i) * 6;
    }));
    return glow;
  }

  dispose() {
    this.composer.dispose();
    this.bloom.dispose();
    this.sparks.dispose();
    this.texts.dispose();
    this.beastPlate.dispose();
    this.player.dispose?.();
    this.beast.dispose?.();
    disposeObject(this.scene);
    this.moon.shadow.map?.dispose();
    checkLeaks(this.renderer, '프롤로그');
    this.renderer.dispose();
    this.untrack();
  }

  private untrack = trackRenderer('프롤로그');
}

/** 둥글고 가장자리가 흐린 점 (연기·안개 알갱이가 네모로 보이지 않게) */
let dot: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (dot) return dot;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(cv);
  return dot;
}

/** 바람에 흔들리는 시간 (숲 판들이 같이 쓴다) */
const WIND = { value: 0 };

/** 위치 · 표면 방향 · 그림 좌표 · 흔들림(세기, 박자)을 쌓아 한 덩어리 모양을 만든다 */
class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private sway: number[] = [];
  private idx: number[] = [];
  count = 0;
  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, sway: number, phase: number) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.sway.push(sway, phase);
    return this.count++;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 숲의 그림판 재질 (나무 가지 · 줄기 · 덤불 · 풀): 달빛 · 하늘빛을 받는 입체 재질.
 * 그림에 칠해진 색은 조금 스스로 빛나게 남기고(어두워도 붓질이 읽히게), 표면 방향은 판의 앞뒤와 상관없이
 * 미리 굽혀 둔 둥근 방향을 그대로 쓴다 (뒷면이라고 뒤집지 않아야 덩어리 전체가 한 빛을 받는다). 바람에 끝이 흔들린다.
 */
function litCardMaterial(tex: THREE.Texture, tint: number, selfLight: number, cutout: boolean) {
  const m = new THREE.MeshLambertMaterial({
    map: tex,
    color: tint,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: selfLight,
    alphaTest: cutout ? 0.45 : 0,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\nattribute vec2 aSway;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed.x += sin(uWind * 0.9 + aSway.y) * 0.09 * aSway.x;
      transformed.z += cos(uWind * 0.7 + aSway.y * 1.3) * 0.06 * aSway.x;`,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
    ).replace(
      '#include <clipping_planes_fragment>',
      // 카메라 바로 앞(3m 안)의 가지 · 덤불은 촘촘한 점으로 솎아 비치게 (카메라가 숲을 지나갈 때 화면을 가리지 않게)
      `#include <clipping_planes_fragment>
      float camNear = smoothstep(1.0, 3.2, length(vViewPosition));
      if (camNear < 1.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > camNear) discard;`,
    );
  };
  m.customProgramCacheKey = () => 'forest-lit-card';
  return m;
}

/** 그림 모양대로 그림자를 드리우는 깊이 재질 (투명한 곳은 그림자도 없다) */
function cardDepthMaterial(tex: THREE.Texture) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
}

/** 같은 모양을 여러 자리에 한 번에 그린다 */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cast: boolean, receive: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((x, i) => m.setMatrixAt(i, x));
  m.count = list.length;
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.computeBoundingSphere();
  return m;
}

/** 하늘: 위는 짙은 남색, 지평선 쪽은 안개 색으로 (안개에 묻힌 먼 숲과 이어지게) */
/**
 * 세운 그림판 재질: 판 아래 가운데를 축으로 늘 카메라 쪽으로 돌아선다 (위아래는 세운 채).
 * 인스턴스 행렬에서 위치와 가로·세로 크기만 쓴다. 투명한 가장자리는 잘라 내 깊이 정렬 문제가 없게.
 */
function billboardMaterial(tex: THREE.Texture, tint: number) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color: tint, alphaTest: 0.45, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <project_vertex>",
      `vec4 bbBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float bbW = instanceMatrix[0].x;
      float bbH = length(instanceMatrix[1].xyz);
      vec3 bbTo = cameraPosition - bbBase.xyz;
      bbTo.y = 0.0;
      bbTo = normalize(bbTo + vec3(1e-5, 0.0, 0.0));
      vec3 bbRight = vec3(bbTo.z, 0.0, -bbTo.x);
      vec3 bbWorld = bbBase.xyz + bbRight * transformed.x * bbW + vec3(0.0, transformed.y * bbH, 0.0);
      vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  m.customProgramCacheKey = () => "billboard";
  return m;
}

function skyTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#070b16');
  gr.addColorStop(0.55, '#14213a');
  gr.addColorStop(1, '#1b2a3d');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 달빛 줄기: 위가 밝고 아래로 흐려지며 양옆이 부드러운 띠 */
function rayTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  const gx = g.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(cv);
}

