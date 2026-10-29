import type { CityMap } from './cityMap';
import { roadSolids } from './traffic';

/**
 * 도시 길찾기 (지도 클릭 자동 이동용).
 * 도시를 CELL 크기 격자로 나누고 건물(여유 폭 포함)과 차도(횡단보도만 열림)를 막힌 칸으로 표시한 뒤 A* 로 경로를 찾는다.
 * 찾은 경로는 직선으로 갈 수 있는 구간을 건너뛰어(문자열 당기기) 자연스럽게 걷도록 줄인다.
 */
const CELL = 1.5;
const CLEARANCE = 0.7;

export class CityNav {
  private x0: number;
  private z0: number;
  private w: number;
  private h: number;
  private blocked: Uint8Array;

  constructor(map: CityMap) {
    const b = map.bounds;
    this.x0 = b.x0;
    this.z0 = b.z0;
    this.w = Math.ceil((b.x1 - b.x0) / CELL);
    this.h = Math.ceil((b.z1 - b.z0) / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    const roads = roadSolids(map);
    const ROAD_PAD = 0.3;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + (i + 0.5) * CELL;
        const z = this.z0 + (j + 0.5) * CELL;
        const hit = map.buildings.some(
          (bd) => Math.abs(x - bd.x) < bd.w / 2 + CLEARANCE && Math.abs(z - bd.z) < bd.d / 2 + CLEARANCE,
        );
        const road = roads.some((r) => x > r.x0 - ROAD_PAD && x < r.x1 + ROAD_PAD && z > r.z0 - ROAD_PAD && z < r.z1 + ROAD_PAD);
        if (hit || road) this.blocked[j * this.w + i] = 1;
      }
    }
  }

  private cell(x: number, z: number): [number, number] {
    return [
      Math.max(0, Math.min(this.w - 1, Math.floor((x - this.x0) / CELL))),
      Math.max(0, Math.min(this.h - 1, Math.floor((z - this.z0) / CELL))),
    ];
  }

  private center(i: number, j: number) {
    return { x: this.x0 + (i + 0.5) * CELL, z: this.z0 + (j + 0.5) * CELL };
  }

  isBlocked(i: number, j: number) {
    return i < 0 || j < 0 || i >= this.w || j >= this.h || this.blocked[j * this.w + i] === 1;
  }

  /** (x, z) 가 막힌 칸이면 가장 가까운 열린 칸 */
  private nearestOpen(i: number, j: number): [number, number] {
    if (!this.isBlocked(i, j)) return [i, j];
    for (let r = 1; r < 30; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.isBlocked(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return [i, j];
  }

  /** 두 칸 사이를 직선으로 막힘 없이 갈 수 있나 */
  private lineOfSight(a: [number, number], b: [number, number]) {
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
    for (let k = 1; k < steps; k++) {
      const u = k / steps;
      if (this.isBlocked(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u))) return false;
    }
    return true;
  }

  /** 경로 (월드 좌표 웨이포인트). 못 가면 null */
  findPath(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
    const start = this.nearestOpen(...this.cell(fromX, fromZ));
    const goal = this.nearestOpen(...this.cell(toX, toZ));
    const N = this.w * this.h;
    const idx = (i: number, j: number) => j * this.w + i;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - goal[0]);
      const dz = Math.abs(j - goal[1]);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    // 이진 힙 (f 값 기준)
    const heap: [number, number][] = [];
    const push = (f: number, n: number) => {
      heap.push([f, n]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };

    const s = idx(...start);
    const t = idx(...goal);
    g[s] = 0;
    push(h(...start), s);
    while (heap.length) {
      const [, n] = pop();
      if (closed[n]) continue;
      if (n === t) break;
      closed[n] = 1;
      const i = n % this.w;
      const j = (n - i) / this.w;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (this.isBlocked(ni, nj)) continue;
          // 대각선은 양옆이 모두 열려 있어야 (모서리를 깎아 지나가지 않게)
          if (di && dj && (this.isBlocked(i + di, j) || this.isBlocked(i, j + dj))) continue;
          const m = idx(ni, nj);
          const cost = g[n] + (di && dj ? Math.SQRT2 : 1);
          if (cost < g[m]) {
            g[m] = cost;
            came[m] = n;
            push(cost + h(ni, nj), m);
          }
        }
      }
    }
    if (s !== t && came[t] < 0) return null;

    // 칸 경로 → 직선 구간 건너뛰기
    const cells: [number, number][] = [];
    for (let n = t; n !== -1; n = came[n]) cells.push([n % this.w, Math.floor(n / this.w)]);
    cells.reverse();
    const pruned: [number, number][] = [cells[0]];
    let anchor = cells[0];
    for (let k = 1; k < cells.length; k++) {
      if (!this.lineOfSight(anchor, cells[k])) {
        anchor = cells[k - 1];
        pruned.push(anchor);
      }
    }
    pruned.push(cells[cells.length - 1]);
    const path = pruned.slice(1).map(([i, j]) => this.center(i, j));
    // 마지막 지점은 클릭한 곳 그대로 (열린 칸이면)
    if (path.length && goal[0] === this.cell(toX, toZ)[0] && goal[1] === this.cell(toX, toZ)[1]) {
      path[path.length - 1] = { x: toX, z: toZ };
    }
    return path;
  }
}
