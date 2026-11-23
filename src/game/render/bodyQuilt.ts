import * as THREE from 'three';
import type { CharacterView } from './mannequin';

/**
 * 자는 사람에게 덮는 이불 (서울 집 침대 · 차원 여관 침대 공용).
 *
 * 누운 몸이 이불을 뚫고 나오지 않게, 몇 프레임마다 누운 몸의 실제 윗면 높이를 침대 위 격자 칸마다 재서
 * 그 위로 이불을 부풀린다. 칸마다 "그 칸 안의 몸 가장 높은 곳 + 두께" 보다 이불 면이 낮아지지 않게
 * 꼭짓점을 둘레 칸들의 최댓값으로 잡는다 (삼각형 면은 꼭짓점 사이에 있으므로 칸 안 어디서도 몸보다 위).
 * 몸이 없는 곳은 침대에 깔린 침구보다 높은 기본 높이 → 침대 밖으로는 자락이 늘어진다.
 */
export interface QuiltSpec {
  /** 이불이 덮는 침대 폭 (매트리스와 그 위 침구의 바깥 끝까지) */
  x0: number;
  x1: number;
  /** 다 덮었을 때 어깨 쪽 끝 (머리는 내놓는다) · 발치 끝. zHem < zFoot (머리가 -z 쪽) */
  zHem: number;
  zFoot: number;
  /** 아무도 없는 곳의 이불 높이 (매트리스·깔린 침구 윗면보다 위) */
  top: number;
  /** 침대 밖으로 늘어지는 폭 · 내려가는 깊이 */
  drape?: number;
  fall?: number;
  /** 무늬 크기 (1m 당 반복) */
  uvScale?: number;
}

const CELL = 0.1;
/** 이불 두께: 몸 윗면과 이불 면 사이 */
const GAP = 0.045;
/** 몇 프레임마다 몸을 다시 잴지 */
const MEASURE_EVERY = 3;

export class BodyQuilt {
  readonly mesh: THREE.Mesh;
  private readonly nx: number;
  private readonly nz: number;
  private readonly gx0: number;
  private readonly gz0: number;
  private readonly gz1: number;
  private readonly cw: number;
  private readonly cd: number;
  private readonly base: Float32Array;
  /** 칸마다 이불 높이 (번진 몸 + 두께) · 어깨 끝단용 (번지지 않은 몸 + 두께) */
  private readonly cell: Float32Array;
  private readonly hem: Float32Array;
  private readonly acc: Float32Array;
  private readonly buf: Float32Array;
  private readonly spec: QuiltSpec;
  private frame = 0;
  private measured = false;
  private lastCover = -1;

  constructor(spec: QuiltSpec, material: THREE.Material) {
    this.spec = spec;
    const d = spec.drape ?? 0.2;
    this.gx0 = spec.x0 - d;
    const gx1 = spec.x1 + d;
    this.gz0 = spec.zHem;
    this.gz1 = spec.zFoot + d;
    this.nx = Math.ceil((gx1 - this.gx0) / CELL);
    this.nz = Math.ceil((this.gz1 - this.gz0) / CELL);
    this.cw = (gx1 - this.gx0) / this.nx;
    this.cd = (this.gz1 - this.gz0) / this.nz;
    const n = this.nx * this.nz;
    this.base = new Float32Array(n);
    this.cell = new Float32Array(n);
    this.hem = new Float32Array(this.nx);
    this.acc = new Float32Array(n);
    this.buf = new Float32Array(n);
    const fall = spec.fall ?? 0.3;
    for (let iz = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        // 칸에서 침대 바깥으로 가장 멀리 나간 곳 (칸이 조금이라도 침대 위면 침구를 덮는 높이)
        const cx0 = this.gx0 + ix * this.cw;
        const cz0 = this.gz0 + iz * this.cd;
        const out = Math.max(spec.x0 - (cx0 + this.cw), cx0 - spec.x1, cz0 - spec.zFoot, 0);
        this.base[iz * this.nx + ix] = out <= 0 ? spec.top : spec.top - fall * Math.min(1, out / d) ** 1.2;
      }
    this.cell.set(this.base);

    const vx = this.nx + 1;
    const vz = this.nz + 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vx * vz * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vx * vz * 2), 2));
    const idx: number[] = [];
    for (let r = 0; r < vz - 1; r++)
      for (let c = 0; c < vx - 1; c++) {
        const a = r * vx + c;
        idx.push(a, a + vx, a + 1, a + 1, a + vx, a + vx + 1);
      }
    g.setIndex(idx);
    const mat = material.clone();
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'bodyQuilt';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * cover: 덮인 정도 (0 = 안 덮음 → 1 = 발끝부터 어깨까지 다 덮음)
   * bodies: 이 침대에 누운 사람들 (이불이 그 몸을 따라 부푼다)
   */
  update(cover: number, bodies: (CharacterView | null | undefined)[]) {
    const show = cover > 0.01;
    this.mesh.visible = show;
    if (!show) {
      this.measured = false;
      this.lastCover = -1;
      return;
    }
    this.frame++;
    let changed = Math.abs(cover - this.lastCover) > 1e-4;
    if (!this.measured || this.frame % MEASURE_EVERY === 0) {
      this.measure(bodies);
      changed = true;
    }
    // 당기는 속도: 천천히 시작해서 고르게 당기고 부드럽게 멈춘다 (확 튀어 올랐다가 끝에서 질질 끌지 않게)
    if (changed) this.shape(cover * cover * (3 - 2 * cover));
    this.lastCover = cover;
  }

  private measure(bodies: (CharacterView | null | undefined)[]) {
    const { nx, nz, acc, buf } = this;
    acc.fill(-Infinity);
    let any = false;
    for (const b of bodies) {
      if (!b?.bodyHeights?.(this.gx0, this.gz0, this.cw, this.cd, nx, nz, buf)) continue;
      any = true;
      for (let k = 0; k < acc.length; k++) if (buf[k] > acc[k]) acc[k] = buf[k];
    }
    if (!any) {
      // 몸 모양을 잴 수 없는 캐릭터: 사람 하나 누운 만큼 넉넉히 부풀린다
      for (let k = 0; k < acc.length; k++) acc[k] = this.base[k] >= this.spec.top ? this.spec.top + 0.3 : -Infinity;
    }
    const at = (x: number, z: number) => acc[Math.max(0, Math.min(nz - 1, z)) * nx + Math.max(0, Math.min(nx - 1, x))];
    const snap = !this.measured;
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        // 이불은 몸 위에서 완만하게 처진다: 이웃 칸의 몸 높이를 조금 낮춰서 번지게
        let m = at(ix, iz);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) m = Math.max(m, at(ix + dx, iz + dz) - 0.06);
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) m = Math.max(m, at(ix + dx, iz + dz) - 0.13);
        const k = iz * nx + ix;
        const want = Math.max(this.base[k], m + GAP);
        // 몸이 높아지면 바로 따라 올라가고, 낮아지면 천천히 가라앉는다
        this.cell[k] = snap || want >= this.cell[k] ? want : this.cell[k] + (want - this.cell[k]) * 0.3;
      }
    // 어깨 끝단: 번지지 않은 몸 높이만 (얼굴 쪽으로 불룩 솟지 않게) · 그래도 몸보다는 위
    for (let ix = 0; ix < nx; ix++) this.hem[ix] = Math.max(this.base[ix], at(ix, 0) + GAP);
    this.measured = true;
  }

  private shape(cover: number) {
    const { nx, nz, cw, cd, gx0, gz0, gz1 } = this;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const uv = this.mesh.geometry.attributes.uv as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const t = uv.array as Float32Array;
    const us = this.spec.uvScale ?? 1.1;
    // 덮인 길이: 발치 끝(gz1)에서 어깨 쪽으로 cover 만큼
    const zStart = gz1 - (gz1 - gz0) * cover;
    const step = (gz1 - zStart) / nz;
    const cellAt = (ix: number, iz: number) => this.cell[iz * nx + ix];
    for (let r = 0; r <= nz; r++) {
      const z = zStart + r * step;
      // 이 줄 꼭짓점이 닿는 칸들 (앞뒤 한 줄 간격 안) · 다 덮었을 때는 꼭짓점 둘레 칸
      const iz0 = Math.max(0, Math.min(nz - 1, Math.floor((z - step - gz0) / cd + 1e-6)));
      const iz1 = Math.max(0, Math.min(nz - 1, Math.floor((z + step - gz0) / cd - 1e-6)));
      for (let c = 0; c <= nx; c++) {
        const ix0 = Math.max(0, c - 1);
        const ix1 = Math.min(nx - 1, c);
        let y = -Infinity;
        if (r === 0 && cover > 0.999) {
          for (let ix = ix0; ix <= ix1; ix++) y = Math.max(y, this.hem[ix]);
        } else {
          for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) y = Math.max(y, cellAt(ix, iz));
        }
        const k = r * (nx + 1) + c;
        const x = gx0 + c * cw;
        a[k * 3] = x;
        a[k * 3 + 1] = y;
        a[k * 3 + 2] = z;
        t[k * 2] = (x - gx0) * us;
        t[k * 2 + 1] = (z - zStart) * us;
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
