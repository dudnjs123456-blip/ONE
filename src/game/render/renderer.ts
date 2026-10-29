import * as THREE from 'three';
import { FIGHTER_RADIUS, HIT_WIDTH, STAGE_RADIUS } from '../core/constants';
import type { CombatEvent } from '../core/combat';
import type { Fighter } from '../core/fighter';
import { smooth, type FrameClock } from './clock';
import { FloatingTexts, SparkSystem } from './effects';
import { PLAYER2_LOOK, PLAYER_LOOK } from './looks';
import type { Appearance } from './mannequin';
import { createCharacter } from './vrmCharacter';
import { checkLeaks, disposeObject, trackRenderer } from './dispose';

/** 1:1 경기장 렌더러가 읽는 최소 상태 (Match, BossBattle 둘 다 만족) */
export interface ArenaView {
  readonly fighters: readonly [Fighter, Fighter];
  readonly frame: number;
  readonly camNx: number;
  readonly camNz: number;
  readonly hitstop: number;
  drainEvents(): CombatEvent[];
}

export interface ArenaOptions {
  /** 기본값: 플레이어 캐릭터 1P / 2P 컬러 */
  looks?: [Appearance, Appearance];
  scales?: [number, number];
  theme?: 'dojo' | 'boss';
  /** 데미지 숫자 표시 (보스전) */
  damageNumbers?: boolean;
}

const THEMES = {
  dojo: { bg: 0x0b0d17, floor: 0x2a2f45, grid: [0x3d4466, 0x2f3550], edge: 0xff7a3d, glow: 0x2aa8ff, rim: 0xff7a3d },
  boss: { bg: 0x14070a, floor: 0x2b1a1c, grid: [0x5a2a2a, 0x3a1c1e], edge: 0xff3a1d, glow: 0xff2a1a, rim: 0xff3a3a },
};

interface HitboxViz {
  hurt: THREE.LineLoop;
  hit: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
}

/** 1:1 경기장 상태를 읽어서 그리기만 한다. 게임 로직은 절대 여기서 바꾸지 않는다. */
export class GameRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private mannequins: [ReturnType<typeof createCharacter>, ReturnType<typeof createCharacter>];
  private hitboxes: [HitboxViz, HitboxViz];
  private sparks: SparkSystem;
  private texts: FloatingTexts;
  private theme: (typeof THEMES)['dojo'];
  private damageNumbers: boolean;
  /** 큰 캐릭터(보스)가 있으면 카메라를 더 멀리·높게 */
  private sizeBias: number;
  private camN = new THREE.Vector2(0, 1);
  private camDist = 5;
  /** 카메라 거리 배율 (Ctrl+휠). 작을수록 캐릭터가 크게 */
  zoom = 1;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, opts: ArenaOptions = {}) {
    this.theme = THEMES[opts.theme ?? 'dojo'];
    this.damageNumbers = opts.damageNumbers ?? false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(this.theme.bg);
    this.scene.fog = new THREE.Fog(this.theme.bg, 14, 40);

    this.buildStage();
    const looks = opts.looks ?? [PLAYER_LOOK, PLAYER2_LOOK];
    const scales = opts.scales ?? [1, 1];
    this.sizeBias = Math.max(...scales);
    this.mannequins = [createCharacter(looks[0]), createCharacter(looks[1])];
    this.mannequins.forEach((m, i) => {
      m.root.scale.setScalar(scales[i]);
      this.scene.add(m.root);
    });
    this.hitboxes = [this.makeHitbox(), this.makeHitbox()];
    this.sparks = new SparkSystem(this.scene);
    this.texts = new FloatingTexts(this.scene);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  sync(match: ArenaView, showHitboxes: boolean, clock: FrameClock) {
    const [a, b] = match.fighters;
    match.fighters.forEach((f, i) => this.mannequins[i].update(f, clock));

    for (const e of match.drainEvents()) {
      this.shake = Math.max(this.shake, this.sparks.spawn(e));
      if (this.damageNumbers && e.damage > 0) {
        const color = e.victim === 0 ? '#ff5a4a' : e.kind === 'counter' ? '#ffb020' : '#ffffff';
        this.texts.spawn(String(e.damage), e.x, e.y + 0.4, e.z, color, e.kind === 'counter' ? 1.3 : 1);
      }
    }
    this.sparks.update(clock.dt);
    this.texts.update(clock.dt);
    match.fighters.forEach((f, i) => this.updateHitbox(this.hitboxes[i], f, showHitboxes));
    this.updateCamera(a, b, match, clock);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const m of this.mannequins) m.dispose?.();
    this.sparks.dispose();
    this.texts.dispose();
    disposeObject(this.scene);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Light) o.shadow?.map?.dispose();
    });
    checkLeaks(this.renderer, '대전');
    this.renderer.dispose();
    this.untrack();
  }

  private untrack = trackRenderer('대전');

  // ───────────────────────── 내부 ─────────────────────────

  private buildStage() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8fa6ff, 0x1a1420, 0.9));

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -STAGE_RADIUS;
    sc.right = sc.top = STAGE_RADIUS;
    s.add(sun);

    const th = this.theme;
    const rim = new THREE.DirectionalLight(th.rim, 1.0);
    rim.position.set(-6, 4, -8);
    s.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(STAGE_RADIUS, 64),
      new THREE.MeshStandardMaterial({ color: th.floor, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const grid = new THREE.PolarGridHelper(STAGE_RADIUS, 16, 8, 64, th.grid[0], th.grid[1]);
    grid.position.y = 0.002;
    s.add(grid);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(STAGE_RADIUS, 0.05, 8, 128),
      new THREE.MeshStandardMaterial({ color: th.edge, emissive: th.edge, emissiveIntensity: 1.5 }),
    );
    edge.rotation.x = -Math.PI / 2;
    s.add(edge);

    const outer = new THREE.Mesh(
      new THREE.RingGeometry(STAGE_RADIUS, 60, 64),
      new THREE.MeshStandardMaterial({ color: 0x121522, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    s.add(outer);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1d2133, roughness: 0.7 });
    const glowMat = new THREE.MeshStandardMaterial({ color: th.glow, emissive: th.glow, emissiveIntensity: 1.2 });
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const r = STAGE_RADIUS + 4;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), pillarMat);
      p.position.set(Math.cos(ang) * r, 3.5, Math.sin(ang) * r);
      s.add(p);
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.82), glowMat);
      g.position.set(p.position.x, 4.5, p.position.z);
      s.add(g);
    }
  }

  private makeHitbox(): HitboxViz {
    const pts = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * FIGHTER_RADIUS, 0.02, Math.sin(a) * FIGHTER_RADIUS);
    });
    const hurt = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x4dff88 }),
    );
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.scene.add(hurt, hit);
    return { hurt, hit };
  }

  private updateHitbox(v: HitboxViz, f: Fighter, show: boolean) {
    v.hurt.visible = show;
    v.hurt.position.set(f.x, f.y, f.z);
    const m = f.move;
    v.hit.visible = show && f.isInActiveFrames() && !!m;
    if (!v.hit.visible || !m) return;

    // 판정 조건(match.checkHit)과 같은 영역: 정면 [0, range + 반지름], 좌우 ±(HIT_WIDTH + tracking)
    const len = m.range + FIGHTER_RADIUS;
    const width = (HIT_WIDTH + m.tracking) * 2;
    const [y0, y1] = m.level === 'high' ? [1.35, 1.8] : m.level === 'mid' ? [0.8, 1.35] : [0, 0.6];
    v.hit.scale.set(width, y1 - y0, len);
    v.hit.position.set(f.x + (f.fx * len) / 2, f.y + (y0 + y1) / 2, f.z + (f.fz * len) / 2);
    v.hit.rotation.y = Math.atan2(f.fx, f.fz);
  }

  private updateCamera(fa: Fighter, fb: Fighter, match: ArenaView, clock: FrameClock) {
    const target = new THREE.Vector2(match.camNx, match.camNz);
    this.camN.lerp(target, smooth(0.12, clock.dt)).normalize();

    const a = fa.lerped(clock.alpha);
    const b = fb.lerped(clock.alpha);
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    const sep = Math.hypot(b.x - a.x, b.z - a.z);
    const k = this.sizeBias;
    const wantDist = THREE.MathUtils.clamp(sep * 0.9 + 3.6 * k, 4.2 * k, 10) * this.zoom;
    this.camDist += (wantDist - this.camDist) * smooth(0.08, clock.dt);

    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.shake *= Math.pow(0.85, clock.dt * 60);

    this.camera.position.set(
      midX + this.camN.x * this.camDist + sx,
      1.45 * k + this.camDist * 0.08 + sy,
      midZ + this.camN.y * this.camDist,
    );
    this.camera.lookAt(midX, 1.0 + (k - 1) * 0.9, midZ);
  }
}
