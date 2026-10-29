import * as THREE from 'three';
import type { CombatEvent } from '../core/combat';

const SPARK_COLORS: Record<CombatEvent['kind'], number> = {
  hit: 0xffb347,
  counter: 0xff3b3b,
  block: 0x6fb6ff,
};

interface Spark {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  /** 수명 동안 커지는 배율 */
  grow: number;
  spin: number;
}

/** 히트 지점에 터지는 섬광 */
export class SparkSystem {
  private sparks: Spark[] = [];
  private geo = new THREE.IcosahedronGeometry(0.12, 0);
  /** 묵직한 타격의 충격파 고리 */
  private ringGeo = new THREE.RingGeometry(0.16, 0.22, 32);

  constructor(private scene: THREE.Scene) {}

  /** @returns 권장 화면 흔들림 세기 */
  spawn(e: Pick<CombatEvent, 'kind' | 'x' | 'y' | 'z'> & { heavy?: boolean }): number {
    const heavy = !!e.heavy && e.kind !== 'block';
    const add = (geo: THREE.BufferGeometry, color: number, max: number, grow: number, scale: number, spin: number) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(e.x, e.y, e.z);
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);
      this.sparks.push({ mesh, life: max, max, grow, spin });
      return mesh;
    };

    const base = e.kind === 'counter' ? 18 : 12;
    add(this.geo, SPARK_COLORS[e.kind], heavy ? base + 4 : base, heavy ? 4.5 : 3, heavy ? 1.5 : 1, 0.3);
    if (heavy) {
      // 하얀 순간 섬광 + 퍼져나가는 충격파 고리
      add(this.geo, 0xffffff, 6, 2.5, 1.8, 0);
      const ring = add(this.ringGeo, SPARK_COLORS[e.kind], 14, 9, 1, 0);
      ring.lookAt(ring.position.x, ring.position.y + 1, ring.position.z + 2); // 바닥과 비스듬히
    }

    if (e.kind === 'block') return 0;
    const shake = e.kind === 'counter' ? 0.08 : 0.04;
    return heavy ? shake * 1.9 : shake;
  }

  /** @param dt 경과 시간(초). 수명은 60fps 프레임 단위 */
  update(dt: number) {
    const steps = dt * 60;
    this.sparks = this.sparks.filter((s) => {
      s.life -= steps;
      const t = 1 - s.life / s.max;
      const start = s.mesh.userData.start ?? (s.mesh.userData.start = s.mesh.scale.x);
      s.mesh.scale.setScalar(start * (1 + t * s.grow));
      s.mesh.rotation.y += s.spin * steps;
      s.mesh.material.opacity = 1 - t;
      if (s.life > 0) return true;
      this.scene.remove(s.mesh);
      s.mesh.material.dispose();
      return false;
    });
  }

  dispose() {
    for (const s of this.sparks) s.mesh.material.dispose();
    this.geo.dispose();
    this.ringGeo.dispose();
  }
}

function textCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function spriteFrom(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  return sprite;
}

interface FloatItem {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vy: number;
}

/** 위로 떠오르며 사라지는 글자 (데미지, EXP, LEVEL UP) */
export class FloatingTexts {
  private items: FloatItem[] = [];

  constructor(private scene: THREE.Scene) {}

  spawn(text: string, x: number, y: number, z: number, color: string, size = 1) {
    const { canvas, ctx } = textCanvas(256, 64);
    ctx.font = 'italic 900 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
    const sprite = spriteFrom(canvas);
    sprite.position.set(x + (Math.random() - 0.5) * 0.3, y, z);
    sprite.scale.set(1.6 * size, 0.4 * size, 1);
    this.scene.add(sprite);
    this.items.push({ sprite, life: 55, max: 55, vy: 0.025 });
  }

  update(dt: number) {
    const steps = dt * 60;
    this.items = this.items.filter((it) => {
      it.life -= steps;
      it.sprite.position.y += it.vy * steps;
      it.vy *= Math.pow(0.96, steps);
      it.sprite.material.opacity = Math.min(1, it.life / 20);
      if (it.life > 0) return true;
      this.scene.remove(it.sprite);
      it.sprite.material.map?.dispose();
      it.sprite.material.dispose();
      return false;
    });
  }

  dispose() {
    for (const it of this.items) {
      it.sprite.material.map?.dispose();
      it.sprite.material.dispose();
    }
  }
}

/** 머리 위 이름 + HP 바. 값이 바뀔 때만 다시 그린다. */
export class Nameplate {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private key = '';

  constructor(private hostile: boolean) {
    const { canvas, ctx } = textCanvas(256, 64);
    this.canvas = canvas;
    this.ctx = ctx;
    this.sprite = spriteFrom(canvas);
    this.sprite.scale.set(1.6, 0.4, 1);
  }

  draw(label: string, hp: number, maxHp: number) {
    const key = `${label}|${hp}|${maxHp}`;
    if (key === this.key) return;
    this.key = key;
    const { ctx } = this;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(label, 128, 24);
    ctx.fillStyle = this.hostile ? '#ffd2c2' : '#d8f0ff';
    ctx.fillText(label, 128, 24);

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(48, 36, 160, 12);
    ctx.fillStyle = this.hostile ? '#e0443a' : '#46c06a';
    ctx.fillRect(50, 38, 156 * Math.max(0, hp / maxHp), 8);
    (this.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  dispose() {
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
  }
}
