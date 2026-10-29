import * as THREE from 'three';
import { mulberry32 } from '../core/controllers';
import { FIELD_HALF, type FieldWorld, type FloatText } from '../core/field';
import type { Fighter } from '../core/fighter';
import { FIELD_SPAWNS } from '../data/monsters';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, Nameplate, SparkSystem } from './effects';
import { PLAYER_LOOK } from './looks';
import type { Appearance } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';

const CAM_OFFSET = new THREE.Vector3(0, 8.5, 9);
const TEXT_COLORS: Record<FloatText['kind'], string> = { exp: '#b8f36b', gold: '#ffd54a', level: '#ffe066' };

interface Actor {
  mannequin: ReturnType<typeof createCharacter>;
  plate: Nameplate;
  height: number;
}

/** 필드 렌더러: 쿼터뷰 추적 카메라, 풀밭/나무/마을, 머리 위 HP, 데미지 숫자 */
export class FieldRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  private sun: THREE.DirectionalLight;
  private actors = new Map<Fighter, Actor>();
  private sparks: SparkSystem;
  private texts: FloatingTexts;
  private targetRing: THREE.Mesh;
  private camPos = new THREE.Vector3();
  private shake = 0;
  private initialized = false;

  /** 카메라 거리 배율 (1 = 기본 쿼터뷰, 작을수록 가까이) */
  private camOffset: THREE.Vector3;
  /** 카메라 거리 배율 (Ctrl+휠). 작을수록 캐릭터가 크게 */
  zoom = 1;

  constructor(canvas: HTMLCanvasElement, opts: { zoom?: number } = {}) {
    this.camOffset = CAM_OFFSET.clone().multiplyScalar(opts.zoom ?? 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sky = 0x9cc9ec;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 30, 75);

    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4a6b3a, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.far = 60;
    this.scene.add(this.sun, this.sun.target);

    this.buildWorld();
    this.sparks = new SparkSystem(this.scene);
    this.texts = new FloatingTexts(this.scene);

    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.58, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.targetRing);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  sync(world: FieldWorld, clock: FrameClock) {
    this.syncActors(world, clock);

    for (const e of world.drainCombatEvents()) {
      this.shake = Math.max(this.shake, this.sparks.spawn(e) * (e.victim === 0 ? 1.5 : 0.6));
      if (e.damage > 0) {
        const color = e.victim === 0 ? '#ff5a4a' : e.kind === 'counter' ? '#ffb020' : '#ffffff';
        this.texts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, color, e.kind === 'counter' ? 1.3 : 1);
      }
    }
    for (const t of world.drainTexts()) {
      this.texts.spawn(t.text, t.x, t.y, t.z, TEXT_COLORS[t.kind], t.kind === 'level' ? 1.6 : 0.9);
    }
    this.sparks.update(clock.dt);
    this.texts.update(clock.dt);

    const t = world.target?.fighter;
    this.targetRing.visible = !!t;
    if (t) {
      const tp = t.lerped(clock.alpha);
      this.targetRing.position.set(tp.x, 0.03, tp.z);
      this.targetRing.rotation.z = clock.t * 0.03;
    }

    this.updateCamera(world.player, clock);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.sparks.dispose();
    this.texts.dispose();
    for (const a of this.actors.values()) {
      a.plate.dispose();
      a.mannequin.dispose?.();
    }
    disposeObject(this.scene);
    this.sun.shadow.map?.dispose();
    checkLeaks(this.renderer, '필드');
    this.renderer.dispose();
    this.untrack();
  }

  private untrack = trackRenderer('필드');

  // ───────────────────────── 내부 ─────────────────────────

  private syncActors(world: FieldWorld, clock: FrameClock) {
    const present = new Set<Fighter>([world.player, ...world.monsters.map((m) => m.fighter)]);
    for (const [f, a] of this.actors) {
      if (present.has(f)) continue;
      this.scene.remove(a.mannequin.root, a.plate.sprite);
      a.plate.dispose();
      // 사라진 몬스터의 모델도 GPU 에서 지운다 (안 지우면 사냥할수록 쌓인다)
      a.mannequin.dispose?.();
      disposeObject(a.mannequin.root);
      this.actors.delete(f);
    }

    const ensure = (f: Fighter, look: number | Appearance, scale: number, hostile: boolean) => {
      let a = this.actors.get(f);
      if (!a) {
        const mannequin = createCharacter(look);
        mannequin.root.scale.setScalar(scale);
        const plate = new Nameplate(hostile);
        this.scene.add(mannequin.root, plate.sprite);
        a = { mannequin, plate, height: 2.0 * scale };
        this.actors.set(f, a);
      }
      return a;
    };

    const p = world.player;
    const pa = ensure(p, PLAYER_LOOK, 1, false);
    pa.mannequin.update(p, clock);
    pa.plate.draw(`Lv.${world.level} PLAYER`, p.hp, p.maxHp);
    const pp = p.lerped(clock.alpha);
    pa.plate.sprite.position.set(pp.x, pp.y + pa.height, pp.z);

    for (const m of world.monsters) {
      const f = m.fighter;
      const a = ensure(f, m.type.color, m.type.scale, true);
      a.mannequin.update(f, clock);
      a.plate.sprite.visible = f.state !== 'ko';
      a.plate.draw(`Lv.${m.type.level} ${m.type.name}`, f.hp, f.maxHp);
      const fp = f.lerped(clock.alpha);
      a.plate.sprite.position.set(fp.x, fp.y + a.height, fp.z);
      // 시체는 서서히 가라앉는다
      if (m.rewarded && f.state === 'ko') a.mannequin.root.position.y = -m.deadFrames * 0.004;
    }
  }

  private updateCamera(player: Fighter, clock: FrameClock) {
    const p = player.lerped(clock.alpha);
    const off = this.camOffset.clone().multiplyScalar(this.zoom);
    const want = new THREE.Vector3(p.x, 0, p.z).add(off);
    if (!this.initialized) {
      this.camPos.copy(want);
      this.initialized = true;
    }
    this.camPos.lerp(want, smooth(0.08, clock.dt));
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.shake *= Math.pow(0.85, clock.dt * 60);
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    // 가까이 당기면 발 대신 상체를 본다
    const lookY = 0.8 + Math.max(0, 1 - this.zoom) * 0.5;
    this.camera.lookAt(this.camPos.x - off.x, lookY, this.camPos.z - off.z);

    // 그림자 카메라가 플레이어를 따라다니게
    this.sun.position.set(p.x + 8, 16, p.z + 6);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  private buildWorld() {
    const s = this.scene;
    const rng = mulberry32(2024);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x5f9446, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // 사냥터 영역 표시 (조금 밝은 풀)
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_HALF * 2, FIELD_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x6ea851, roughness: 1 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.005;
    field.receiveShadow = true;
    s.add(field);

    // 마을 광장
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 48),
      new THREE.MeshStandardMaterial({ color: 0xb8a98a, roughness: 0.9 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    s.add(plaza);

    const wall = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: 0xb4513b, roughness: 0.8 });
    for (const [x, z, rot] of [[-4.6, -3.2, 0.4], [4.4, -3.6, -0.5], [0, -5.4, 0]] as const) {
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.8), wall);
      body.position.y = 0.8;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.1, 4), roof);
      top.position.y = 2.15;
      top.rotation.y = Math.PI / 4;
      for (const m of [body, top]) {
        m.castShadow = true;
        m.receiveShadow = true;
        house.add(m);
      }
      house.position.set(x, 0, z);
      house.rotation.y = rot;
      s.add(house);
    }

    // 경계 울타리
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.9 });
    const postGeo = new THREE.BoxGeometry(0.15, 0.9, 0.15);
    const posts: THREE.Vector3[] = [];
    for (let i = -FIELD_HALF; i <= FIELD_HALF; i += 2) {
      posts.push(new THREE.Vector3(i, 0.45, -FIELD_HALF), new THREE.Vector3(i, 0.45, FIELD_HALF));
      posts.push(new THREE.Vector3(-FIELD_HALF, 0.45, i), new THREE.Vector3(FIELD_HALF, 0.45, i));
    }
    const fence = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    const mtx = new THREE.Matrix4();
    posts.forEach((v, i) => fence.setMatrixAt(i, mtx.makeTranslation(v.x, v.y, v.z)));
    fence.castShadow = true;
    s.add(fence);

    // 나무: 스폰 지점과 마을은 피해서 배치
    const clear = (x: number, z: number) =>
      Math.hypot(x, z) > 7 && FIELD_SPAWNS.every((sp) => Math.hypot(sp.x - x, sp.z - z) > 3.5);
    const trees: { x: number; z: number; s: number }[] = [];
    while (trees.length < 140) {
      const x = (rng() - 0.5) * 110;
      const z = (rng() - 0.5) * 110;
      const inside = Math.abs(x) < FIELD_HALF && Math.abs(z) < FIELD_HALF;
      if (inside && (rng() > 0.25 || !clear(x, z))) continue; // 사냥터 안은 듬성듬성
      trees.push({ x, z, s: 0.8 + rng() * 0.8 });
    }
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2b }),
      trees.length,
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.1, 2.6, 7),
      new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.9 }),
      trees.length,
    );
    const q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      const sc = new THREE.Vector3(t.s, t.s, t.s);
      trunk.setMatrixAt(i, mtx.compose(new THREE.Vector3(t.x, 0.6 * t.s, t.z), q, sc));
      leaves.setMatrixAt(i, mtx.compose(new THREE.Vector3(t.x, 2.3 * t.s, t.z), q, sc));
    });
    trunk.castShadow = leaves.castShadow = true;
    s.add(trunk, leaves);

    // 바위
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 1 });
    for (let i = 0; i < 30; i++) {
      const x = (rng() - 0.5) * FIELD_HALF * 2;
      const z = (rng() - 0.5) * FIELD_HALF * 2;
      if (!clear(x, z)) continue;
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, 0.15, z);
      r.scale.set(0.6 + rng(), 0.4 + rng() * 0.5, 0.6 + rng());
      r.rotation.y = rng() * Math.PI;
      r.castShadow = r.receiveShadow = true;
      s.add(r);
    }
  }
}
