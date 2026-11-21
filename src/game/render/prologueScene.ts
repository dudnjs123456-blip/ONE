import * as THREE from 'three';
import { pixelRatioFor } from './graphics';
import { mulberry32 } from '../core/controllers';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, Nameplate, SparkSystem } from './effects';
import { playerLook } from './looks';
import { wornList } from '../data/fashion';
import type { CharacterView } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';
import { playHit } from './sfx';
import { headshot } from './portraitShot';
import { CLIFF_Z, PATH, PATH_HALF, type PrologueWorld } from '../story/prologue';
import { BEAST_NAME } from '../data/prologueScript';

type View = CharacterView & { dispose?(): void; loaded?: boolean };

/**
 * 프롤로그 장면: 보랏빛 안개 숲 한 줄기 길 → 벼랑 끝. 벼랑 아래 멀리 경계 마을 불빛이 안개 사이로 보인다.
 * 카메라는 단계마다 바뀐다: 떨어질 땐 위에서 따라 내려오고, 그림자를 만나면 뒤돌아보고, 벼랑에선 옆에서 낭떠러지를 보여 준다.
 */
export class PrologueRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  private moon: THREE.DirectionalLight;
  private player: View;
  private beast: View;
  private beastPlate = new Nameplate(true);
  private eyes = new THREE.Group();
  private eyesPlaced = false;
  private darkened = false;
  private _pivot = new THREE.Vector3();
  private _rot = new THREE.Vector3();
  private aura: THREE.Points;
  private mist: THREE.Points;
  private sparks: SparkSystem;
  private texts: FloatingTexts;
  private camPos = new THREE.Vector3(0, 30, 12);
  private camLook = new THREE.Vector3(0, 20, 0);
  private shake = 0;
  private villageGlow: THREE.Sprite;

  constructor(canvas: HTMLCanvasElement, world: PrologueWorld) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(pixelRatioFor(this.renderer.getContext()));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sky = 0x1d1436;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 10, 46);
    this.scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x1a2230, 0.95));
    this.moon = new THREE.DirectionalLight(0xcfc2ff, 1.6);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.far = 70;
    this.scene.add(this.moon, this.moon.target);

    this.buildForest();
    this.villageGlow = this.buildAbyss();
    this.sparks = new SparkSystem(this.scene);
    this.texts = new FloatingTexts(this.scene);

    this.player = createCharacter(playerLook(wornList(world.profile.wardrobe), world.profile.body));
    this.player.casual = true;
    this.beast = createCharacter(0x150b20);
    this.beast.root.scale.setScalar(1.7);
    this.beast.root.visible = false;
    this.beastPlate.sprite.visible = false;
    this.beastPlate.sprite.scale.multiplyScalar(1.3);
    // 그림자의 붉은 눈 (안개 속에서도 보이게 안개 영향을 받지 않는다)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, fog: false });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeMat);
      e.position.x = sx * 0.055;
      this.eyes.add(e);
    }
    this.beast.root.add(this.eyes);
    // 그림자에서 피어오르는 검은 연기
    const n = 120;
    const pos = new Float32Array(n * 3);
    const rng = mulberry32(5);
    for (let i = 0; i < n; i++) pos.set([(rng() - 0.5) * 1.4, rng() * 2.6, (rng() - 0.5) * 1.4], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.aura = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x07030c, size: 0.55, map: softDot(), transparent: true, opacity: 0.8, depthWrite: false }));
    this.aura.visible = false;
    this.scene.add(this.player.root, this.beast.root, this.beastPlate.sprite, this.aura);

    // 떠다니는 안개 알갱이 (길 위)
    const m = 600;
    const mp = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) mp.set([(rng() - 0.5) * 30, rng() * 6, 8 - rng() * 62], i * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.mist = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xc8b8ff, size: 0.12, map: softDot(), transparent: true, opacity: 0.45, depthWrite: false }));
    this.scene.add(this.mist);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
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
    const shot = headshot(this.renderer, this.scene, v.root, { x: f.fx, z: f.fz }, { zoom: who === 'beast' ? 1.6 : 1, hide: [who === 'me' ? this.beast.root : this.player.root, this.aura] });
    v.root.visible = vis;
    return shot;
  }

  sync(world: PrologueWorld, clock: FrameClock) {
    const p = world.player;
    const b = world.beast;
    this.player.update(p, clock);
    if (world.phase === 'fall') {
      // 떨어지는 동안 몸이 허공에서 빙글 돈다
      this.player.root.rotation.z = Math.sin(world.fallSpin) * 0.7;
      this.player.root.rotation.x = Math.cos(world.fallSpin * 0.7) * 0.4;
    } else if (world.phase === 'jump' && p.y < -0.5) {
      this.player.root.rotation.x = Math.min(1.2, -p.y * 0.08);
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
      if (!this.darkened) {
        // 온몸이 빛을 먹는 검은 그림자 (살색 머리·옷 색이 보이지 않게)
        this.beast.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || this.eyes.children.includes(m)) return;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => {
            const c = mt.clone() as THREE.MeshStandardMaterial;
            c.color?.setHex(0x0a0510);
            if (c.emissive) c.emissive.setHex(0x12051c);
            c.map = null;
            return c;
          });
          m.material = Array.isArray(m.material) ? mats : mats[0];
        });
        this.darkened = true;
      }
      if (!this.eyesPlaced) {
        // 모델 키에 맞춰 눈 자리를 잡는다 (얼굴 앞쪽 = 몸 기준 +z)
        const box = new THREE.Box3().setFromObject(this.beast.root);
        const h = (box.max.y - box.min.y) / this.beast.root.scale.y;
        if (h > 0.5) {
          this.eyes.position.set(0, h * 0.885, 0.13);
          this.eyesPlaced = true;
        }
      }
      const bp = b.lerped(clock.alpha);
      this.aura.position.set(bp.x, 0, bp.z);
      this.aura.rotation.y = clock.t * 0.01;
      this.beastPlate.draw(BEAST_NAME, 1, 1);
      this.beastPlate.sprite.position.set(bp.x, 3.9, bp.z);
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
    this.villageGlow.material.opacity = 0.55 + Math.sin(clock.t * 0.03) * 0.15;
    this.mist.rotation.y = Math.sin(clock.t * 0.002) * 0.05;

    this.updateCamera(world, clock);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(world: PrologueWorld, clock: FrameClock) {
    const p = world.player.lerped(clock.alpha);
    const b = world.beast.lerped(clock.alpha);
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    let k = 0.06;
    switch (world.phase) {
      case 'fall':
        // 위에서 같이 떨어지며 내려다본다
        wantPos.set(p.x + 1.5, p.y + 7, p.z + 7.5);
        wantLook.set(p.x, p.y, p.z);
        k = 0.2;
        break;
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
        // 그림자 등 뒤 위에서: 벼랑 끝에 선 나, 그 너머 낭떠러지와 아래 마을 불빛
        wantPos.set(p.x + 3, 7.5, CLIFF_Z + 6.5);
        wantLook.set(p.x - 0.5, -8.5, CLIFF_Z - 10);
        k = 0.05;
        break;
      case 'jump':
      case 'done':
        // 낭떠러지 위 허공에서 떨어지는 나를 내려다본다
        wantPos.set(3, 5, CLIFF_Z - 3);
        wantLook.set(p.x, Math.max(p.y, -30), p.z);
        k = 0.12;
        break;
      default:
        // 평소: 등 뒤 위에서 길 앞쪽을 보는 추적 카메라 (쫓길 땐 조금 더 낮고 멀리)
        if (world.phase === 'chase') {
          wantPos.set(p.x, 6.2, p.z + 8.8);
          wantLook.set(p.x, 0.8, p.z - 2.5);
        } else {
          wantPos.set(p.x, 7.2, p.z + 8.2);
          wantLook.set(p.x, 0.8, p.z - 1.5);
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
    const fp = world.player;
    this.moon.position.set(fp.x + 6, 18, fp.z + 4);
    this.moon.target.position.set(fp.x, 0, fp.z - 2);
  }

  private buildForest() {
    const s = this.scene;
    const rng = mulberry32(77);
    // 땅: 벼랑 끝(CLIFF_Z)에서 뚝 끊긴다
    const len = 70;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, len), new THREE.MeshStandardMaterial({ color: 0x272238, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, CLIFF_Z + len / 2);
    ground.receiveShadow = true;
    s.add(ground);
    // 길 (흙길 조각들)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x3d3446, roughness: 1 });
    for (let i = 0; i + 1 < PATH.length; i++) {
      const a = PATH[i];
      const c = PATH[i + 1];
      const l = Math.hypot(c.x - a.x, c.z - a.z);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(PATH_HALF * 1.6, l + 1.5), pathMat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -Math.atan2(c.x - a.x, -(c.z - a.z));
      seg.position.set((a.x + c.x) / 2, 0.01, (a.z + c.z) / 2);
      seg.receiveShadow = true;
      s.add(seg);
    }
    // 벼랑 면: 깎아지른 바위벽이 아래로 끝없이
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 60, 2), new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 1 }));
    wall.position.set(0, -30.02, CLIFF_Z + 1); // 땅 밑에 (낭떠러지 쪽으로 튀어나오면 아래가 안 보인다)
    s.add(wall);
    // 벼랑 끝 울퉁불퉁한 바위
    const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3450, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      const x = -16 + i * 1.3 + (rng() - 0.5);
      if (Math.abs(x) < 2.2) continue; // 뛰어내리는 자리는 비운다
      r.position.set(x, 0.1, CLIFF_Z + 0.2 + rng() * 0.6);
      r.scale.set(0.6 + rng(), 0.4 + rng() * 0.8, 0.6 + rng());
      r.rotation.y = rng() * Math.PI;
      r.castShadow = r.receiveShadow = true;
      s.add(r);
    }
    // 뒤틀린 보랏빛 나무: 길 양옆으로 빽빽이
    const trees: { x: number; z: number; s: number }[] = [];
    const nearPath = (x: number, z: number) =>
      PATH.slice(1).some((c, i) => {
        const a = PATH[i];
        const vx = c.x - a.x;
        const vz = c.z - a.z;
        const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
        return Math.hypot(x - (a.x + vx * u), z - (a.z + vz * u)) < PATH_HALF + 1.2;
      });
    while (trees.length < 260) {
      const x = (rng() - 0.5) * 60;
      const z = 12 - rng() * (12 - CLIFF_Z - 2);
      if (nearPath(x, z) || z < CLIFF_Z + 1.5) continue;
      trees.push({ x, z, s: 0.9 + rng() * 1.1 });
    }
    const mtx = new THREE.Matrix4();
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.26, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x241a2e }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: 0x3a1f5e, roughness: 0.9, emissive: 0x140826, flatShading: true }), trees.length);
    const q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.25, rng() * 6, (rng() - 0.5) * 0.25));
      const sc = new THREE.Vector3(t.s, t.s * (1 + rng() * 0.6), t.s);
      trunk.setMatrixAt(i, mtx.compose(new THREE.Vector3(t.x, 1.2 * sc.y, t.z), q, sc));
      crown.setMatrixAt(i, mtx.compose(new THREE.Vector3(t.x, 2.9 * sc.y, t.z), q, new THREE.Vector3(t.s, t.s * 0.8, t.s)));
    });
    trunk.castShadow = crown.castShadow = true;
    s.add(trunk, crown);
    // 숲속에 떠 있는 희미한 수정 (이 세계가 이상하다는 표시)
    const crystal = new THREE.MeshStandardMaterial({ color: 0x9b7cff, emissive: 0x5a2cff, emissiveIntensity: 1.1, roughness: 0.3 });
    for (const [x, z] of [[-5, -6], [5.5, -16], [-5.5, -25], [6, -33], [-5, -41]] as const) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), crystal);
      c.scale.y = 2;
      c.position.set(x, 1.4, z);
      s.add(c);
      const l = new THREE.PointLight(0x8a5cff, 3, 7, 2);
      l.position.set(x, 1.6, z);
      s.add(l);
    }
  }

  /** 벼랑 아래: 깊은 안개 바다와 멀리 경계 마을 불빛 */
  private buildAbyss(): THREE.Sprite {
    const s = this.scene;
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: false });
    const rng = mulberry32(9);
    for (let i = 0; i < 44; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rng() * 0.22, 8, 6), lightMat);
      l.position.set((rng() - 0.5) * 22, -24 + rng() * 2, CLIFF_Z - 26 - rng() * 12);
      s.add(l);
    }
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
    glow.scale.set(40, 18, 1);
    glow.position.set(0, -23, CLIFF_Z - 32);
    s.add(glow);
    // 안개 바다 (벼랑 아래를 덮는 반투명 판 몇 겹)
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 120),
        new THREE.MeshBasicMaterial({ color: 0x6a5a9a, transparent: true, opacity: 0.05, depthWrite: false, fog: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -14 - i * 6, CLIFF_Z - 55);
      s.add(m);
    }
    return glow;
  }

  dispose() {
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
