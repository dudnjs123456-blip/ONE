import * as THREE from 'three';
import { pixelRatioFor } from './graphics';
import { mulberry32 } from '../core/controllers';
import { FIELD_HALF, inSafe, type FieldWorld, type FloatText } from '../core/field';
import type { Fighter } from '../core/fighter';
import { FIELD_SPAWNS } from '../data/monsters';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, Nameplate, SparkSystem } from './effects';
import { playerLook, type BodyType } from './looks';
import { SLEEPWEAR, wornList } from '../data/fashion';
import type { Appearance, CharacterView } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { headshot } from './portraitShot';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';
import { playCoin, playHit, playLevelUp } from './sfx';
import { buildVillage, type VillageScene } from './villageScene';
import { VILLAGE } from '../data/village';
import { buildInn, type InnBedUse, type InnScene } from './innScene';
import { INN_BEDS, bedPose } from '../data/inn';

/** 16:10 화면에서 45° 일 때 보이는 옆 시야각 — 세로 화면도 이만큼은 보이게 */
const WIDE_HFOV = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(45) / 2) * 1.6);
const CAM_OFFSET = new THREE.Vector3(0, 8.5, 9);
const TEXT_COLORS: Record<FloatText['kind'], string> = { exp: '#b8f36b', gold: '#ffd54a', level: '#ffe066' };

interface Actor {
  mannequin: CharacterView & { dispose?(): void; setOutfit?(ids: string[]): void };
  plate: Nameplate;
  height: number;
  /** 지금 입힌 옷 (잠옷으로 갈아입을 때 비교) */
  outfitKey?: string;
}

/** 다른 차원(필드) 렌더러: 쿼터뷰 추적 카메라, 보랏빛 들판/수정/귀환 포탈, 머리 위 HP, 데미지 숫자 */
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
  private village: VillageScene | null = null;
  /** 1장 사건: 포탈 빛이 꺼졌다 (로그아웃이 안 되는 동안) */
  setPortalDown(down: boolean) {
    if (this.village) this.village.portal.visible = !down;
  }
  private inn: InnScene | null = null;
  private lastWarp = -1;

  /** 카메라 거리 배율 (1 = 기본 쿼터뷰, 작을수록 가까이) */
  private camOffset: THREE.Vector3;
  /** 카메라 거리 배율 (Ctrl+휠). 작을수록 캐릭터가 크게 */
  zoom = 1;

  constructor(canvas: HTMLCanvasElement, opts: { zoom?: number } = {}) {
    this.camOffset = CAM_OFFSET.clone().multiplyScalar(opts.zoom ?? 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // 저사양 그래픽이면 고해상도 화면에서도 1배로만 그린다
    this.renderer.setPixelRatio(pixelRatioFor(this.renderer.getContext()));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sky = 0x3a2a63;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 26, 70);

    this.scene.add(new THREE.HemisphereLight(0xd9c8ff, 0x2c3d4a, 1.25));
    this.sun = new THREE.DirectionalLight(0xe6dcff, 2.1);
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
    // 세로 화면(폰): 옆 시야가 좁으니 시야각을 넓힌다 (가로·PC 는 그대로 45°)
    const wantV = (2 * Math.atan(Math.tan(WIDE_HFOV / 2) / this.camera.aspect) * 180) / Math.PI;
    this.camera.fov = THREE.MathUtils.clamp(wantV, 45, 75);
    this.camera.updateProjectionMatrix();
  }

  sync(world: FieldWorld, clock: FrameClock) {
    this.syncActors(world, clock);

    for (const e of world.drainCombatEvents()) {
      // 내가 맞으면 크게, 몬스터를 때리면 작게 (자동사냥은 쉬지 않고 때린다)
      playHit(e.kind, e.heavy, e.victim === 0 ? 0.9 : 0.45);
      this.shake = Math.max(this.shake, this.sparks.spawn(e) * (e.victim === 0 ? 1.5 : 0.6));
      if (e.damage > 0) {
        const color = e.victim === 0 ? '#ff5a4a' : e.kind === 'counter' ? '#ffb020' : '#ffffff';
        this.texts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, color, e.kind === 'counter' ? 1.3 : 1);
      }
    }
    for (const t of world.drainTexts()) {
      if (t.kind === 'gold') playCoin();
      else if (t.kind === 'level') playLevelUp();
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

    // 마을: 포탈 소용돌이·깃발·불꽃·연기·반딧불이 (포탈 고리는 돌리지 않는다 — 돌리면 화면 앞을 크게 가린다)
    this.village?.update(clock.t, world.player.x, world.player.z);
    // 달빛 여관: 자는 사람 침대엔 이불, 씻는 사람 칸엔 커튼 · 김
    if (this.inn) {
      const beds = new Map<number, InnBedUse>();
      const booths = new Set<number>();
      // 다 누운 뒤(rest 0.85 → 1)에 발끝부터 덮는다. 걸터앉아 다리를 올리는 동안엔 이불이 없다 · 이불은 누운 몸을 따라 덮인다
      const occupy = (bed: number, rest: number, f: Fighter) => {
        if (beds.has(bed)) return;
        beds.set(bed, { cover: rest >= 0.9 ? 1 : 0, body: this.actors.get(f)?.mannequin });
      };
      if (world.sleep) occupy(world.sleep.bed, world.restAmount, world.player);
      if (world.shower) booths.add(world.shower.booth);
      for (const h of world.hunters.values()) {
        if (!h.target) continue;
        if (h.bed !== null && h.rest > 0) occupy(h.bed, h.rest, h.fighter);
        if (h.booth !== null) booths.add(h.booth);
      }
      this.inn.update(clock.t, { beds, booths });
    }
    // 여관 문을 지났으면 카메라를 바로 옮긴다 (마을과 여관 안은 멀리 떨어져 있다)
    if (world.warpSerial !== this.lastWarp) {
      if (this.lastWarp >= 0) this.initialized = false;
      this.lastWarp = world.warpSerial;
    }

    this.updateCamera(world.player, clock);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 대화창 초상화: 이 캐릭터(나·NPC·몬스터) 얼굴을 찍은 그림. 모델을 아직 다 불러오지 못했으면 null (조금 뒤 다시 부른다)
   */
  portraitOf(f: Fighter): string | null {
    const a = this.actors.get(f);
    if (!a || (a.mannequin as { loaded?: boolean }).loaded === false) return null;
    const others = [...this.actors.values()].map((o) => o.mannequin.root).filter((r) => r !== a.mannequin.root);
    return headshot(this.renderer, this.scene, a.mannequin.root, { x: f.fx, z: f.fz }, { hide: others });
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
    const hunters = [...world.hunters.values()].filter((h) => h.target);
    const present = new Set<Fighter>([world.player, ...world.monsters.map((m) => m.fighter), ...hunters.map((h) => h.fighter), ...world.npcs.map((n) => n.fighter)]);
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
    const worn = wornList(world.profile.wardrobe);
    const pa = ensure(p, playerLook(worn, world.profile.body), 1, false);
    // 경계 마을 · 여관 안에선 서울처럼 편한 자세 (전투 자세는 사냥터에서만)
    pa.mannequin.casual = inSafe(p.x, p.z);
    const myRest = world.sleep ? world.restAmount : 0;
    this.restPose(pa, world.sleep?.bed ?? null, myRest, world.netId ?? 'me', worn);
    pa.mannequin.update(p, clock);
    // 씻는 동안은 커튼 뒤 (모습을 감춘다)
    pa.mannequin.root.visible = !world.shower;
    pa.plate.sprite.visible = !world.shower && myRest < 0.3;
    pa.plate.draw(`Lv.${world.level} 나`, p.hp, p.maxHp);
    const pp = p.lerped(clock.alpha);
    pa.plate.sprite.position.set(pp.x, pp.y + pa.height, pp.z);

    // 같은 차원에 있는 다른 사람 (그 사람이 입은 옷 그대로)
    for (const h of hunters) {
      const f = h.fighter;
      const a = ensure(f, playerLook(h.outfit, h.body as BodyType | undefined), 1, false);
      a.mannequin.casual = inSafe(f.x, f.z);
      this.restPose(a, h.bed, h.bed !== null ? h.rest : 0, h.id, h.outfit);
      a.mannequin.update(f, clock);
      a.mannequin.root.visible = h.booth === null;
      a.plate.sprite.visible = h.booth === null && (h.bed === null || h.rest < 0.3);
      a.plate.draw(`Lv.${h.level} ${h.name}`, f.hp, f.maxHp);
      const fp = f.lerped(clock.alpha);
      a.plate.sprite.position.set(fp.x, fp.y + a.height, fp.z);
    }

    // 경계 마을 사람들: 아직 인사하지 않은 사람은 이름 앞에 ❗ (말을 걸어 보라는 표시)
    for (const n of world.npcs) {
      const f = n.fighter;
      let a = this.actors.get(f);
      if (!a) {
        // 주인공처럼 애니풍 3D 캐릭터 + 판타지 옷 (마법사 모자 · 망토 · 갑옷 · 앞치마)
        const view = createCharacter(playerLook(n.def.outfit, n.def.body));
        const sc = n.def.scale ?? 1;
        view.root.scale.setScalar(sc);
        view.casual = true;
        const plate = new Nameplate(false);
        plate.sprite.scale.multiplyScalar(1.7);
        this.scene.add(view.root, plate.sprite);
        a = { mannequin: view, plate, height: 2.05 * sc + (n.def.outfit.some((id) => id.endsWith('-hat')) ? 0.25 : 0) };
        this.actors.set(f, a);
      }
      a.mannequin.update(f, clock);
      a.plate.draw(`${world.hasMet(n.def.id) ? '' : '❗ '}${n.def.name} · ${n.def.title}`, 0, 0);
      a.plate.sprite.position.set(f.x, a.height, f.z);
    }

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

  /** 여관 침대에 눕는 자세 (서울 집 침대와 같은 동작) · 누우면 잠옷으로 갈아입는다 */
  private restPose(a: Actor, bed: number | null, t: number, seed: string, worn: string[]) {
    const b = bed !== null ? INN_BEDS[bed] : null;
    a.mannequin.rest = b && t > 0 ? { t, ...bedPose(b), sleepSeed: seed } : null;
    const want = b && t > 0 ? [...SLEEPWEAR] : worn;
    const key = want.join(',');
    if (a.outfitKey === undefined) a.outfitKey = worn.join(',');
    if (key !== a.outfitKey) {
      a.outfitKey = key;
      a.mannequin.setOutfit?.(want);
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
      new THREE.MeshStandardMaterial({ color: 0x2f3f4e, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // 사냥터 영역 표시 (조금 밝은 풀)
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_HALF * 2, FIELD_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x3e5a5c, roughness: 1 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.005;
    field.receiveShadow = true;
    s.add(field);

    // 경계 마을 (접속하면 도착하는 곳, 사냥터 남쪽)
    this.village = buildVillage(s);
    // 달빛 여관 안 (게스트하우스, 마을에서 멀리 떨어진 곳)
    this.inn = buildInn(s);

    // 떠 있는 차원 수정
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0xb48cff, emissive: 0x6a3cff, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 });
    for (const [x, z, h] of [[-4.6, -3.4, 1.6], [4.4, -3.8, 1.9], [-3.8, 3.6, 1.2], [4.2, 3.2, 1.4]] as const) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), crystalMat);
      c.scale.set(0.8, h, 0.8);
      c.position.set(x, h * 0.6, z);
      c.castShadow = true;
      s.add(c);
    }

    // 경계 울타리
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4b4566, roughness: 0.9 });
    const postGeo = new THREE.BoxGeometry(0.15, 0.9, 0.15);
    const posts: THREE.Vector3[] = [];
    for (let i = -FIELD_HALF; i <= FIELD_HALF; i += 2) {
      posts.push(new THREE.Vector3(i, 0.45, -FIELD_HALF));
      // 남쪽 울타리는 북문(마을로 가는 길)만 비운다
      if (Math.abs(i) > VILLAGE.gate) posts.push(new THREE.Vector3(i, 0.45, FIELD_HALF));
      posts.push(new THREE.Vector3(-FIELD_HALF, 0.45, i), new THREE.Vector3(FIELD_HALF, 0.45, i));
    }
    const fence = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    const mtx = new THREE.Matrix4();
    posts.forEach((v, i) => fence.setMatrixAt(i, mtx.makeTranslation(v.x, v.y, v.z)));
    fence.castShadow = true;
    s.add(fence);

    // 나무: 스폰 지점과 마을은 피해서 배치
    const clear = (x: number, z: number) =>
      Math.hypot(x, z) > 3 && FIELD_SPAWNS.every((sp) => Math.hypot(sp.x - x, sp.z - z) > 3.5);
    const trees: { x: number; z: number; s: number }[] = [];
    while (trees.length < 140) {
      const x = (rng() - 0.5) * 110;
      const z = (rng() - 0.5) * 110;
      const inside = Math.abs(x) < FIELD_HALF && Math.abs(z) < FIELD_HALF;
      if (inside && (rng() > 0.25 || !clear(x, z))) continue; // 사냥터 안은 듬성듬성
      if (x > VILLAGE.x0 - 2 && x < VILLAGE.x1 + 2 && z > FIELD_HALF - 1 && z < VILLAGE.z1 + 1.5) continue; // 마을 자리
      trees.push({ x, z, s: 0.8 + rng() * 0.8 });
    }
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b2f46 }),
      trees.length,
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.1, 2.6, 7),
      new THREE.MeshStandardMaterial({ color: 0x4a2f7a, roughness: 0.9, emissive: 0x1a0f33 }),
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
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c5a70, roughness: 1 });
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
