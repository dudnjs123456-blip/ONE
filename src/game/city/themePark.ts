import type { Poi } from './cityMap';

/**
 * 한강 놀이공원 (지하철 2호선 한강공원역에서 한 정거장). 좌표: x = 동쪽, z = 남쪽, 1 = 1m.
 * 남쪽 끝에 역 광장(입구), 서쪽엔 롤러코스터, 동쪽엔 자이로드롭 · 바이킹 · 대관람차.
 *
 * 공유 세계: 모든 놀이기구는 서버에 맞춘 실제 시각(sharedNow)으로만 움직인다.
 * 그래서 같은 시각이면 누구 화면에서든 열차·좌석·배가 같은 자리에 있고, 친구와 같은 열차를 함께 탄다.
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type RideId = 'coaster' | 'drop' | 'viking' | 'wheel' | 'gyro' | 'sky';

export const PARK = {
  bounds: { x0: -82, x1: 82, z0: -92, z1: 46 } as Rect,
  /** 역에서 나와 서는 곳 (북쪽을 본다) */
  spawn: { x: 0, z: 40 },
  /** 지하철역 출입구 (입구 오른쪽 안) */
  station: { x: 13, z: 41 },
};

export interface RideDef {
  id: RideId;
  name: string;
  icon: string;
  /** 줄 서는 곳 (POI) */
  gate: { x: number; z: number };
  /** 내린 뒤 서는 곳 */
  exit: { x: number; z: number };
  seats: number;
  /** 한 번 운행 주기(초): 탑승 시간 board 초 + 운행 run 초 + 쉬는 시간 */
  period: number;
  board: number;
  /** 놀이기구가 차지한 땅 (걸어서 못 들어간다) */
  solids: Rect[];
}

// ───────────────────────── 롤러코스터 트랙 ─────────────────────────

/** 트랙 한 점 (0.5m 간격) */
export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  /** 진행 방향 (단위 벡터) */
  tx: number;
  ty: number;
  tz: number;
  /** 좌석 위쪽 방향 (단위 벡터, 기울기·뒤집힘 포함) */
  ux: number;
  uy: number;
  uz: number;
  /** 구간 종류: 역 · 체인 리프트 · 정상 대기 · 감속(트림) 브레이크 · 브레이크 · 자유 주행 */
  tag: 'station' | 'lift' | 'hold' | 'trim' | 'brake' | 'free';
  /** 터널 안 */
  tunnel?: boolean;
}

const STEP = 0.5;

type Pose = { x: number; y: number; z: number; yaw: number };

/** 거북이 그리기: 지금 자세에서 조각을 이어 붙인다 (방향 = (sin yaw, cos yaw)) */
class TrackBuilder {
  pts: { x: number; y: number; z: number; tag: TrackPoint['tag']; roll: number; tunnel: boolean; side?: [number, number, number] }[] = [];
  p: Pose;
  tunnel = false;
  constructor(start: Pose) {
    this.p = { ...start };
  }
  private push(x: number, y: number, z: number, tag: TrackPoint['tag'], roll = 0, side?: [number, number, number]) {
    this.pts.push({ x, y, z, tag, roll, tunnel: this.tunnel, side });
  }
  /** 수평으로 len 만큼, 높이는 y0 → y1 (부드러운 S자, steep = 가운데를 얼마나 가파르게) */
  straight(len: number, y1: number, tag: TrackPoint['tag'] = 'free', roll: (u: number) => number = () => 0) {
    const { x, z, yaw } = this.p;
    const y0 = this.p.y;
    const n = Math.max(1, Math.round(len / STEP));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      this.push(x + Math.sin(yaw) * len * u, y0 + (y1 - y0) * e, z + Math.cos(yaw) * len * u, tag, roll(u));
    }
    this.p = { x: x + Math.sin(yaw) * len, y: y1, z: z + Math.cos(yaw) * len, yaw };
  }
  /** 일정한 기울기로 오르기 (체인 리프트): 처음·끝 ease 구간만 부드럽게 */
  ramp(len: number, y1: number, ease: number, tag: TrackPoint['tag']) {
    const { x, z, yaw } = this.p;
    const y0 = this.p.y;
    const n = Math.max(1, Math.round(len / STEP));
    const e = ease / len;
    // 사다리꼴 기울기 적분: 처음 e 동안 0 → 최대, 끝 e 동안 최대 → 0
    const area = 1 - e;
    const f = (u: number) => {
      if (u < e) return (u * u) / (2 * e);
      if (u > 1 - e) return 1 - e - ((1 - u) * (1 - u)) / (2 * e);
      return u - e / 2;
    };
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const v = Math.min(1, f(u) / area);
      this.push(x + Math.sin(yaw) * len * u, y0 + (y1 - y0) * v, z + Math.cos(yaw) * len * u, tag);
    }
    this.p = { x: x + Math.sin(yaw) * len, y: y1, z: z + Math.cos(yaw) * len, yaw };
  }
  /** 수평 원호 회전 (+ = 왼쪽: 위에서 볼 때 반시계). 높이는 y0 → y1 */
  arc(deg: number, r: number, y1: number, tag: TrackPoint['tag'] = 'free') {
    const a = (deg * Math.PI) / 180;
    const len = Math.abs(a) * r;
    const n = Math.max(2, Math.round(len / STEP));
    const { x, z, yaw } = this.p;
    const y0 = this.p.y;
    // 왼쪽 회전: 진행 방향 (sin, cos) 의 왼쪽 = (cos, -sin) ... 위에서 볼 때 x 동, z 남 이므로 왼쪽은 (dir.z, -dir.x)
    const side = a > 0 ? 1 : -1;
    const cx = x + Math.cos(yaw) * r * side;
    const cz = z - Math.sin(yaw) * r * side;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const th = yaw + a * u;
      const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      this.push(cx - Math.cos(th) * r * side, y0 + (y1 - y0) * e, cz + Math.sin(th) * r * side, tag);
    }
    const th = yaw + a;
    this.p = { x: cx - Math.cos(th) * r * side, y: y1, z: cz + Math.sin(th) * r * side, yaw: th };
  }
  /** 수직 루프: 반지름 r, 옆으로 shift 만큼 비켜서 나온다 (들어간 길과 겹치지 않게) */
  loop(r: number, shift: number) {
    const { x, y, z, yaw } = this.p;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // 오른쪽 = (-fz, fx)
    const sx = -fz;
    const sz = fx;
    const len = 2 * Math.PI * r;
    const n = Math.round(len / STEP);
    for (let i = 1; i <= n; i++) {
      const th = (2 * Math.PI * i) / n;
      // 위로 갈수록 반지름이 작아지는 물방울 모양 (실제 루프처럼 꼭대기가 좁다)
      const k = 1 - 0.18 * (0.5 - 0.5 * Math.cos(th));
      const fwd = Math.sin(th) * r * k;
      const up = (1 - Math.cos(th)) * r * (0.95 + 0.05 * k);
      const lat = shift * (0.5 - 0.5 * Math.cos(th / 2));
      // 루프 안: 좌석 위쪽은 루프 가운데를 향한다 (옆 축 × 진행 방향)
      this.push(x + fx * fwd + sx * lat, y + up, z + fz * fwd + sz * lat, 'free', 0, [sx, 0, sz]);
    }
    this.p = { x: x + sx * shift, y, z: z + sz * shift, yaw };
  }
  /** 이 자세까지 매끈하게 이어 붙인다 (3차 에르미트, 높이도 함께) */
  joinTo(to: Pose, tag: TrackPoint['tag']) {
    // 출발점을 지나쳐 버린 끝 점들은 버린다 (뒤로 꺾이지 않게)
    const dx = Math.sin(to.yaw);
    const dz = Math.cos(to.yaw);
    for (let last = this.pts[this.pts.length - 1]; last && Math.hypot(last.x - to.x, last.z - to.z) < 3 && (last.x - to.x) * dx + (last.z - to.z) * dz > -0.6; last = this.pts[this.pts.length - 1]) this.pts.pop();
    const end = this.pts[this.pts.length - 1];
    if (end && Math.hypot(end.x - to.x, end.z - to.z) < 2.5) {
      // 충분히 가까우면 그대로 이어진다 (한 바퀴 닫기는 다시 찍을 때 처음 점과 잇는다)
      this.p = { ...to };
      return;
    }
    const a = this.p;
    const d = Math.hypot(to.x - a.x, to.z - a.z);
    const k = d * 0.9;
    const n = Math.max(2, Math.round((d * 1.15) / STEP));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      const px = h00 * a.x + h10 * k * Math.sin(a.yaw) + h01 * to.x + h11 * k * Math.sin(to.yaw);
      const pz = h00 * a.z + h10 * k * Math.cos(a.yaw) + h01 * to.z + h11 * k * Math.cos(to.yaw);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      this.push(px, a.y + (to.y - a.y) * e, pz, tag);
    }
    this.p = { ...to };
  }
}

/** 출발점: 역 (남쪽, 동쪽을 보고 선다) */
const COASTER_START: Pose = { x: -66, y: 1.2, z: 30, yaw: Math.PI / 2 };
export const COASTER_LIFT_TOP = 49;

function buildCoaster(): TrackPoint[] {
  const b = new TrackBuilder(COASTER_START);
  b.straight(16, 1.2, 'station');
  // 역을 나와 왼쪽(북쪽)으로 꺾어 체인 리프트로
  b.arc(90, 8, 2.2, 'lift');
  b.straight(4, 2.6, 'lift');
  // 체인 리프트: 16층 높이까지 45° 가까이 (딸깍딸깍)
  b.ramp(46, 46.5, 9, 'lift');
  // 정상: 천천히 넘어가며 아래가 보이는 순간, 브레이크가 잡고 잠깐 멈춘다
  b.straight(4, 48.6, 'lift');
  b.straight(2.5, COASTER_LIFT_TOP, 'hold');
  // 첫 낙하: 수평 15m 동안 46m 를 떨어진다 (가장 가파른 곳 약 80°)
  b.straight(15, 3, 'free');
  b.straight(7, 3.2, 'free');
  // 북쪽 끝에서 올라가며 크게 돌아 서쪽 줄로 (오버뱅크 턴)
  b.arc(180, 18.25, 15, 'free');
  // 내려꽂으며 루프로
  b.straight(13, 2.6, 'free');
  b.loop(10.5, -4.5);
  b.straight(1, 2.6, 'free');
  // 에어타임 언덕 둘: 엉덩이가 붕 뜨는 곳 (두 번째는 어두운 터널 속)
  b.straight(11, 18, 'free');
  b.straight(11, 2.6, 'free');
  b.tunnel = true;
  b.straight(9, 13, 'free');
  b.straight(9, 2.2, 'free');
  b.tunnel = false;
  // 터널을 나오며 트림 브레이크가 살짝 잡는다 (덜컹)
  b.straight(10, 2.4, 'trim');
  // 하트라인 롤: 직선에서 한 바퀴 휙 돈다
  b.straight(14, 8, 'free', (u) => 2 * Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * u)));
  // 브레이크 구간 → 역 앞에서 왼쪽으로 꺾어 출발점으로
  // 역 앞에서 왼쪽(동쪽)으로 꺾어 승강장으로
  b.arc(90, 8.5, 1.4, 'brake');
  b.joinTo({ x: COASTER_START.x, y: COASTER_START.y, z: COASTER_START.z, yaw: COASTER_START.yaw }, 'brake');
  return frame(b.pts);
}

/** 조각마다 점 간격이 달라서(가파른 낙하는 수평 0.5m 에 3D 로 1.6m) 실제 3D 거리 STEP 간격으로 다시 찍는다 */
function resample(src: TrackBuilder['pts']): TrackBuilder['pts'] {
  const pts = [...src, src[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  const total = cum[cum.length - 1];
  const n = Math.round(total / STEP);
  const out: TrackBuilder['pts'] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k * total) / n;
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const u = (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    const a = pts[j];
    const b = pts[j + 1];
    out.push({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
      // 한 바퀴(2π) 돌고 0 으로 돌아가는 곳은 섞지 않는다 (섞으면 중간에 반 바퀴 뒤집힌 점이 생긴다)
      roll: Math.abs(b.roll - a.roll) > Math.PI ? a.roll : a.roll + (b.roll - a.roll) * u,
      tag: a.tag,
      tunnel: a.tunnel,
      side: a.side,
    });
  }
  return out;
}

const norm = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l] as const;
};

/**
 * 좌석 방향 정하기: 진행 방향을 따라 위쪽 벡터를 돌리지 않고 옮겨(평행 이동) 루프에서도 자연스럽게 뒤집히고,
 * 수평으로 돌 때는 원심력만큼 안쪽으로 기울인다(뱅크). roll 은 하트라인 롤처럼 일부러 더 돌리는 각도.
 */
function frame(src: TrackBuilder['pts']): TrackPoint[] {
  const raw = resample(src);
  const n = raw.length;
  const T: (readonly [number, number, number])[] = [];
  for (let i = 0; i < n; i++) {
    const a = raw[(i - 1 + n) % n];
    const c = raw[(i + 1) % n];
    T.push(norm(c.x - a.x, c.y - a.y, c.z - a.z));
  }
  // 좌석 위쪽: 루프 안은 루프 가운데 쪽, 거의 수직인 낙하는 앞 점에서 이어받고, 나머지는 하늘 쪽.
  // (진행 방향을 따라 돌리지 않고 옮기기만 하면 옆으로 비켜 나오는 루프 뒤에 트랙 전체가 기울어 버린다)
  const U: [number, number, number][] = [];
  let u: [number, number, number] = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const t = T[i];
    const sd = raw[i].side;
    if (sd) u = [...norm(sd[1] * t[2] - sd[2] * t[1], sd[2] * t[0] - sd[0] * t[2], sd[0] * t[1] - sd[1] * t[0])] as [number, number, number];
    else if (Math.abs(t[1]) > 0.97) {
      const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
      u = [...norm(u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d)] as [number, number, number];
    } else u = [...norm(-t[0] * t[1], 1 - t[1] * t[1], -t[2] * t[1])] as [number, number, number];
    U.push(u);
  }
  // 경계(루프 들어가고 나오는 곳)가 툭 끊기지 않게 살짝 고른다
  const Us = U.map((_, i) => {
    let x = 0, y = 0, z = 0;
    for (let k = -3; k <= 3; k++) {
      const q = U[(i + k + n) % n];
      x += q[0];
      y += q[1];
      z += q[2];
    }
    const t = T[i];
    const d = x * t[0] + y * t[1] + z * t[2];
    return [...norm(x - t[0] * d, y - t[1] * d, z - t[2] * d)] as [number, number, number];
  });
  U.splice(0, n, ...Us);
  // 수평 곡률로 기울기: 위에서 본 회전 빠르기 × 속도²/g 대신 일정 속도 가정 (부드럽게 평균)
  const bank: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = T[(i - 4 + n) % n];
    const c = T[(i + 4) % n];
    const turn = Math.atan2(a[0] * c[2] - a[2] * c[0], a[0] * c[0] + a[2] * c[2]); // 위에서 본 방향 변화 (+ = 오른쪽?)
    const flat = Math.hypot(T[i][0], T[i][2]);
    bank.push(Math.max(-1.25, Math.min(1.25, turn * 2.6)) * flat * (raw[i].tag === 'station' || raw[i].side ? 0 : 1));
  }
  const smoothBank = bank.map((_, i) => {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += bank[(i + k + n) % n];
    return s / 13;
  });
  return raw.map((p, i) => {
    const t = T[i];
    const r = smoothBank[i] + p.roll;
    // 진행 방향을 축으로 위쪽 벡터를 돌린다 (로드리게스)
    const [ux, uy, uz] = U[i];
    const c = Math.cos(r);
    const s = Math.sin(r);
    const cx = t[1] * uz - t[2] * uy;
    const cy = t[2] * ux - t[0] * uz;
    const cz = t[0] * uy - t[1] * ux;
    const v = norm(ux * c + cx * s, uy * c + cy * s, uz * c + cz * s);
    return { x: p.x, y: p.y, z: p.z, tx: t[0], ty: t[1], tz: t[2], ux: v[0], uy: v[1], uz: v[2], tag: p.tag, tunnel: p.tunnel || undefined };
  });
}

export const COASTER_TRACK: TrackPoint[] = buildCoaster();
export const COASTER_LEN = COASTER_TRACK.length * STEP;

/** 트랙 위 s(m) 지점 (보간) */
export function trackAt(s: number, out: TrackPoint = { ...COASTER_TRACK[0] }): TrackPoint {
  const n = COASTER_TRACK.length;
  const f = (((s / STEP) % n) + n) % n;
  const i = Math.floor(f);
  const u = f - i;
  const a = COASTER_TRACK[i];
  const b = COASTER_TRACK[(i + 1) % n];
  const l = (p: number, q: number) => p + (q - p) * u;
  out.x = l(a.x, b.x);
  out.y = l(a.y, b.y);
  out.z = l(a.z, b.z);
  const t = norm(l(a.tx, b.tx), l(a.ty, b.ty), l(a.tz, b.tz));
  const v = norm(l(a.ux, b.ux), l(a.uy, b.uy), l(a.uz, b.uz));
  out.tx = t[0];
  out.ty = t[1];
  out.tz = t[2];
  out.ux = v[0];
  out.uy = v[1];
  out.uz = v[2];
  out.tag = a.tag;
  out.tunnel = a.tunnel;
  return out;
}

/** 열차: 4칸 × (2줄 × 2자리) = 16자리. 맨 앞 칸 맨 앞 줄이 0·1 번 */
export const COASTER_CARS = 4;
export const CAR_GAP = 2.7;

/** 칸 i 의 트랙 위치 */
export const carS = (mid: number, car: number) => mid + (1.5 - car) * CAR_GAP;

/**
 * 출발부터 시간에 따른 열차 위치(맨 앞 칸, m)와 속도. 물리로 한 번 미리 계산해 둔다:
 * 역(천천히) → 체인 리프트(일정 속도) → 정상에서 잠깐 멈춤 → 중력으로 자유 주행(마찰·공기저항) → 브레이크 → 역.
 */
/** 출발할 때 열차 가운데(2·3번째 칸 사이)가 서는 트랙 위치 (역 승강장 가운데) */
export const COASTER_MID0 = 8;

function simulateCoaster() {
  const G = 9.81;
  const dt = 1 / 30;
  const s: number[] = [COASTER_MID0];
  const v: number[] = [0];
  let pos = COASTER_MID0;
  let vel = 0;
  let held = 0;
  const n = COASTER_TRACK.length;
  for (let k = 0; k < 30 * 400; k++) {
    // 열차 가운데가 지나는 곳의 경사·구간으로 계산한다
    const i = Math.floor((pos % COASTER_LEN) / STEP) % n;
    const p = COASTER_TRACK[i];
    const q = COASTER_TRACK[(i + 1) % n];
    const slope = (q.y - p.y) / STEP; // 진행 1m 당 높이 변화
    if (p.tag === 'station') vel = Math.min(2.6, vel + 0.8 * dt);
    else if (p.tag === 'lift') {
      // 체인: 3.6 m/s 로 끌어올린다 (정상 가까이 가면 조금 느려지며 넘어간다)
      vel += (3.6 - vel) * Math.min(1, dt * 3);
    } else if (p.tag === 'hold') {
      // 정상 브레이크: 멈췄다가(1.8초) 놓는다 — 아래를 내려다보는 가장 무서운 순간
      if (held < 1.8) {
        vel = Math.max(0, vel - 4 * dt);
        if (vel <= 0.05) held += dt;
      } else vel = Math.max(vel, 0.6) + G * Math.max(0, -slope) * dt;
    } else if (p.tag === 'trim') {
      if (vel > 12) vel = Math.max(12, vel - 16 * dt);
    } else if (p.tag === 'brake') {
      const target = 2.4;
      vel = vel > target ? Math.max(target, vel - 13 * dt) : Math.min(target, vel + 1.5 * dt);
    } else {
      // 중력(경사) - 바퀴 마찰 - 공기 저항
      // 점 간격이 3D 거리라 높이 변화 / 간격 = 경사의 sin
      const sin = Math.max(-1, Math.min(1, slope));
      vel += (-G * sin - 0.14 - 0.0009 * vel * vel) * dt;
      vel = Math.max(1.5, vel);
    }
    pos += vel * dt;
    s.push(pos);
    v.push(vel);
    if (pos >= COASTER_LEN + COASTER_MID0) break;
  }
  return { s, v, dt, duration: (s.length - 1) * dt };
}

export const COASTER_RUN = simulateCoaster();

/** 운행 t초 뒤 열차 가운데 위치(m, 트랙 한 바퀴를 넘으면 그대로 커진다)·속도(m/s). 칸 i(0 = 맨 앞)는 s + (1.5 - i) × CAR_GAP */
export function coasterAt(t: number): { s: number; v: number } {
  const R = COASTER_RUN;
  if (t <= 0) return { s: COASTER_MID0, v: 0 };
  const f = t / R.dt;
  const i = Math.floor(f);
  if (i >= R.s.length - 1) return { s: COASTER_LEN + COASTER_MID0, v: 0 };
  const u = f - i;
  return { s: R.s[i] + (R.s[i + 1] - R.s[i]) * u, v: R.v[i] + (R.v[i + 1] - R.v[i]) * u };
}

/** 자리 번호 → 칸·줄·좌우 */
export function coasterSeat(seat: number) {
  const car = Math.floor(seat / 4);
  const row = Math.floor((seat % 4) / 2);
  const side = seat % 2 === 0 ? -1 : 1;
  return { car, row, side };
}

// ───────────────────────── 자이로드롭 · 바이킹 · 대관람차 ─────────────────────────

export const DROP = { x: 22, z: -40, top: 62, seats: 12, ringR: 3.2 };

/** 자이로드롭: 30초 동안 천천히 회전하며 올라가 → 꼭대기에서 몇 초(운행마다 다름) 멈춤 → 자유낙하 → 자석 브레이크 */
export function dropAt(t: number, cycle: number): { y: number; v: number; spin: number; phase: 'rise' | 'top' | 'fall' | 'brake' | 'down' } {
  const RISE = 30;
  const wait = 2 + (((cycle * 2654435761) >>> 0) % 4000) / 1000; // 2~6초, 운행마다 다르게 (모두 같은 값)
  const top = DROP.top - 2;
  const base = 1.0;
  const freeH = top - 14; // 자유낙하 거리
  const tFree = Math.sqrt((2 * freeH) / 9.81);
  const spin = Math.min(t, RISE) * 0.09;
  if (t < RISE) {
    const u = t / RISE;
    const e = u * u * (3 - 2 * u);
    return { y: base + (top - base) * e, v: 0, spin, phase: 'rise' };
  }
  const t1 = t - RISE;
  if (t1 < wait) return { y: top, v: 0, spin, phase: 'top' };
  const t2 = t1 - wait;
  if (t2 < tFree) return { y: top - 0.5 * 9.81 * t2 * t2, v: 9.81 * t2, spin, phase: 'fall' };
  const t3 = t2 - tFree;
  const vf = 9.81 * tFree;
  const BR = 1.6;
  if (t3 < BR) {
    // 일정 감속으로 14m → 4m
    const dec = (vf * vf) / (2 * 10);
    const vv = Math.max(0, vf - dec * t3);
    const y = 14 - (vf * t3 - 0.5 * dec * t3 * t3);
    return { y: Math.max(4, y), v: vv, spin, phase: 'brake' };
  }
  const t4 = t3 - BR;
  return { y: Math.max(base, 4 - t4 * 0.8), v: 0, spin, phase: 'down' };
}
export const DROP_RUN = 30 + 6 + 3.5 + 1.6 + 5;

export const VIKING = { x: 50, z: -8, pivotY: 15, arm: 11.5, seats: 12 };
export const VIKING_RUN = 56;

/** 바이킹 흔들림 각도 (라디안, + = 북쪽(-z) 끝이 올라감) */
export function vikingAt(t: number): number {
  const period = 2 * Math.PI * Math.sqrt(VIKING.arm / 9.81);
  // 처음 18초 동안 점점 크게 → 꼭대기 75° 로 20초 → 18초 동안 잦아든다
  const amp = t < 18 ? (t / 18) * 1.31 : t < 38 ? 1.31 : Math.max(0, 1.31 * (1 - (t - 38) / 18));
  return amp * Math.sin((2 * Math.PI * t) / period);
}

/**
 * 토네이도 (자이로 스윙): 높이 21m 축에 매달린 15m 팔 끝 원판에 16명이 바깥을 보고 앉는다.
 * 팔은 남북(z)으로 그네처럼 점점 크게 흔들려 120°까지 올라가고, 원판은 그동안 빙글빙글 돈다.
 */
export const GYRO = { x: -17, z: -30, pivotY: 21, arm: 15, ringR: 3.6, seats: 16 };
export const GYRO_RUN = 50;

/** 자이로 스윙 팔 각도 (라디안, + = 북쪽(-z)으로 올라감)와 원판 회전각 */
export function gyroAt(t: number): { th: number; spin: number } {
  const period = 7.2;
  const AMP = (120 * Math.PI) / 180;
  const amp = t < 20 ? (t / 20) * AMP : t < 36 ? AMP : Math.max(0, AMP * (1 - (t - 36) / 12));
  const th = t >= 48 ? 0 : amp * Math.sin((2 * Math.PI * t) / period);
  // 원판: 4초 동안 빨라져 초당 0.9 라디안으로 돌고, 끝날 때 4초 동안 천천히 멈춘다
  const w = 0.9;
  const spin = t < 4 ? (w * t * t) / 8 : t < 44 ? w * 2 + w * (t - 4) : w * 2 + w * 40 + w * Math.min(4, t - 44) * (1 - Math.min(4, t - 44) / 8);
  return { th, spin };
}

/**
 * 스카이 스윙 (회오리 그네): 48m 탑을 따라 그네 회전판이 올라가며 돌고, 그네는 원심력으로 바깥으로 날아간다.
 * 0~12초 올라가며 빨라짐 → 12~36초 꼭대기에서 회전 → 36~46초 내려오며 느려짐
 */
export const SKY = { x: -17, z: -70, top: 40, base: 7.2, armR: 5.5, chain: 6.5, seats: 16, mastH: 48 };
export const SKY_RUN = 46;

export function skyAt(t: number): { y: number; spin: number; w: number; tilt: number } {
  const W = 1.25; // 꼭대기 회전 속도 (rad/s)
  const up = (u: number) => u * u * (3 - 2 * u);
  let y: number, w: number, spin: number;
  if (t < 12) {
    const u = t / 12;
    y = SKY.base + (SKY.top - SKY.base) * up(u);
    w = W * u;
    spin = (W * t * t) / 24;
  } else if (t < 36) {
    y = SKY.top;
    w = W;
    spin = W * 6 + W * (t - 12);
  } else {
    const u = Math.min(1, (t - 36) / 10);
    y = SKY.top - (SKY.top - SKY.base) * up(u);
    w = W * (1 - u);
    spin = W * 6 + W * 24 + W * 10 * (u - (u * u) / 2);
  }
  // 그네 줄 기울기: tan β = ω² r / g (r = 팔 + 줄이 바깥으로 나간 만큼, 두 번 고쳐 계산)
  let tilt = 0;
  for (let i = 0; i < 3; i++) tilt = Math.atan((w * w * (SKY.armR + SKY.chain * Math.sin(tilt))) / 9.81);
  return { y, spin, w, tilt };
}

export const WHEEL = { x: 46, z: -62, hubY: 24, r: 21, cabins: 16, period: 240 };

/** 대관람차 칸 k 의 지금 각도 (0 = 맨 아래, 반시계) */
export function wheelAngle(k: number, nowMs: number) {
  return (2 * Math.PI * k) / WHEEL.cabins + (2 * Math.PI * (nowMs / 1000)) / WHEEL.period;
}

/** 지금 맨 아래(타는 곳)에 가장 가까운 칸 */
export function wheelCabinAtBottom(nowMs: number) {
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < WHEEL.cabins; k++) {
    const a = wheelAngle(k, nowMs);
    const d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return { cabin: best, off: bd };
}

// ───────────────────────── 놀이기구 목록 · 운행표 ─────────────────────────

const coasterBox: Rect = { x0: -80, x1: -30, z0: -88, z1: 36 };

export const RIDES: Record<RideId, RideDef> = {
  coaster: {
    id: 'coaster',
    name: '썬더 드래곤 (롤러코스터)',
    icon: '🎢',
    gate: { x: -40, z: 37 },
    exit: { x: -34, z: 40 },
    seats: COASTER_CARS * 4,
    board: 20,
    period: Math.ceil(20 + COASTER_RUN.duration + 6),
    solids: [coasterBox],
  },
  drop: {
    id: 'drop',
    name: '스카이 드롭 (자이로드롭)',
    icon: '🗼',
    gate: { x: DROP.x, z: DROP.z + 8 },
    exit: { x: DROP.x + 5, z: DROP.z + 9 },
    seats: DROP.seats,
    board: 18,
    period: Math.ceil(18 + DROP_RUN + 4),
    solids: [{ x0: DROP.x - 5.5, x1: DROP.x + 5.5, z0: DROP.z - 5.5, z1: DROP.z + 5.5 }],
  },
  viking: {
    id: 'viking',
    name: '바이킹',
    icon: '🏴‍☠️',
    gate: { x: VIKING.x - 9, z: VIKING.z + 2 },
    exit: { x: VIKING.x - 9, z: VIKING.z + 6 },
    seats: VIKING.seats,
    board: 18,
    period: Math.ceil(18 + VIKING_RUN + 4),
    solids: [{ x0: VIKING.x - 5, x1: VIKING.x + 5, z0: VIKING.z - 16, z1: VIKING.z + 16 }],
  },
  wheel: {
    id: 'wheel',
    name: '한강 아이 (대관람차)',
    icon: '🎡',
    gate: { x: WHEEL.x, z: WHEEL.z + 6 },
    exit: { x: WHEEL.x + 5, z: WHEEL.z + 7 },
    seats: WHEEL.cabins * 4,
    board: 0,
    period: WHEEL.period,
    solids: [{ x0: WHEEL.x - 4, x1: WHEEL.x + 4, z0: WHEEL.z - 4, z1: WHEEL.z + 3 }],
  },
  gyro: {
    id: 'gyro',
    name: '토네이도 (자이로 스윙)',
    icon: '🌀',
    gate: { x: GYRO.x + 9, z: GYRO.z + 3 },
    exit: { x: GYRO.x + 9, z: GYRO.z + 7 },
    seats: GYRO.seats,
    board: 18,
    period: Math.ceil(18 + GYRO_RUN + 4),
    solids: [{ x0: GYRO.x - 6, x1: GYRO.x + 6, z0: GYRO.z - 3.5, z1: GYRO.z + 3.5 }],
  },
  sky: {
    id: 'sky',
    name: '스카이 스윙 (회오리 그네)',
    icon: '🪂',
    gate: { x: SKY.x + 10, z: SKY.z + 4 },
    exit: { x: SKY.x + 10, z: SKY.z + 8 },
    seats: SKY.seats,
    board: 18,
    period: Math.ceil(18 + SKY_RUN + 4),
    solids: [{ x0: SKY.x - 3, x1: SKY.x + 3, z0: SKY.z - 3, z1: SKY.z + 3 }],
  },
};

export const RIDE_IDS = Object.keys(RIDES) as RideId[];

export function runLength(id: RideId) {
  return id === 'coaster' ? COASTER_RUN.duration : id === 'drop' ? DROP_RUN : id === 'viking' ? VIKING_RUN : id === 'gyro' ? GYRO_RUN : id === 'sky' ? SKY_RUN : WHEEL.period;
}

/**
 * 지금 이 놀이기구 운행표 (모두 같은 시각을 쓰므로 모두에게 같다).
 * boarding = 타는 중 (left = 출발까지 남은 초), running = 운행 중 (t = 출발 후 초), idle = 쉬는 중
 */
export function rideClock(id: RideId, nowMs: number): { cycle: number; phase: 'boarding' | 'running' | 'idle'; t: number; left: number; nextBoard: number } {
  const R = RIDES[id];
  const sec = nowMs / 1000;
  const cycle = Math.floor(sec / R.period);
  const at = sec - cycle * R.period;
  const run = runLength(id);
  if (at < R.board) return { cycle, phase: 'boarding', t: 0, left: R.board - at, nextBoard: 0 };
  if (at < R.board + run) return { cycle, phase: 'running', t: at - R.board, left: 0, nextBoard: R.period - at };
  return { cycle, phase: 'idle', t: run, left: 0, nextBoard: R.period - at };
}

/** 놀이공원 안 상호작용 지점 */
export function parkPois(): Poi[] {
  const out: Poi[] = RIDE_IDS.map((id) => ({ id: `ride-${id}`, kind: 'park' as const, label: `${RIDES[id].icon} ${RIDES[id].name}`, x: RIDES[id].gate.x, z: RIDES[id].gate.z, radius: 2.6 }));
  out.push({ id: 'park-station', kind: 'subway', label: '🚇 한강공원역 (동네로 돌아가기)', x: PARK.station.x, z: PARK.station.z - 2.2, radius: 2.4 });
  return out;
}

/** 걸어서 못 들어가는 곳 */
export function parkSolids(): Rect[] {
  return RIDE_IDS.flatMap((id) => RIDES[id].solids);
}

// ───────────────────────── 좌석 자세 (내 1인칭 카메라 · 친구 모습 · 화면의 좌석이 모두 이 값을 쓴다) ─────────────────────────

export interface SeatPose {
  /** 좌석 바닥 (앉은 사람 발밑 기준점) */
  x: number;
  y: number;
  z: number;
  /** 앉은 사람이 보는 방향 */
  fx: number;
  fy: number;
  fz: number;
  /** 앉은 사람의 위쪽 */
  ux: number;
  uy: number;
  uz: number;
  /** 지금 속도 (m/s) — 화면 흔들림·바람 소리 */
  speed: number;
  /** 지금 구간 (롤러코스터) */
  tag?: TrackPoint['tag'];
  tunnel?: boolean;
  /** 자이로드롭 단계 */
  phase?: string;
}

const VIKING_ROWS = [-6.2, -3.8, 3.8, 6.2];

/** 바이킹 배 안 좌석 (흔들리기 전, 피벗 기준) */
function vikingLocal(seat: number) {
  const row = Math.floor(seat / 3) % 4;
  const col = seat % 3;
  const z = VIKING_ROWS[row];
  // 배 바닥은 양 끝으로 갈수록 올라간다. 양쪽 끝 줄은 배 가운데를 보고 앉는다
  return { x: (col - 1) * 0.85, y: -VIKING.arm + 0.55 + 0.045 * z * z, z, face: z < 0 ? 1 : -1 };
}

/** 대관람차 칸 안 좌석: 0·1 = 남쪽을 보고, 2·3 = 북쪽을 보고 */
function wheelLocal(j: number) {
  return { x: j % 2 === 0 ? -0.5 : 0.5, z: j < 2 ? -0.55 : 0.55, face: j < 2 ? 1 : -1 };
}

/** 롤러코스터 운행 시각 (탑승 중·쉬는 중엔 역에 서 있다) */
export function coasterTime(nowMs: number) {
  const ck = rideClock('coaster', nowMs);
  return ck.phase === 'running' ? ck.t : 0;
}

/** 놀이기구 id·좌석의 지금 자세 */
export function seatPose(id: RideId, seat: number, nowMs: number, out: SeatPose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, speed: 0 }): SeatPose {
  out.tag = undefined;
  out.tunnel = undefined;
  out.phase = undefined;
  if (id === 'coaster') {
    const { s, v } = coasterAt(coasterTime(nowMs));
    const { car, row, side } = coasterSeat(seat);
    const p = trackAt(carS(s, car) + (row === 0 ? 0.55 : -0.55));
    // 오른쪽 = 진행 × 위
    const rx = p.ty * p.uz - p.tz * p.uy;
    const ry = p.tz * p.ux - p.tx * p.uz;
    const rz = p.tx * p.uy - p.ty * p.ux;
    out.x = p.x + p.ux * 0.25 + rx * side * 0.4;
    out.y = p.y + p.uy * 0.25 + ry * side * 0.4;
    out.z = p.z + p.uz * 0.25 + rz * side * 0.4;
    out.fx = p.tx;
    out.fy = p.ty;
    out.fz = p.tz;
    out.ux = p.ux;
    out.uy = p.uy;
    out.uz = p.uz;
    out.speed = v;
    out.tag = p.tag;
    out.tunnel = p.tunnel;
    return out;
  }
  if (id === 'drop') {
    const ck = rideClock('drop', nowMs);
    const d = dropAt(ck.phase === 'running' ? ck.t : ck.phase === 'idle' ? DROP_RUN : 0, ck.cycle);
    const a = (seat * 2 * Math.PI) / DROP.seats + d.spin;
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    out.x = DROP.x + ox * DROP.ringR;
    out.y = d.y - 0.45;
    out.z = DROP.z + oz * DROP.ringR;
    out.fx = ox;
    out.fy = 0;
    out.fz = oz;
    out.ux = 0;
    out.uy = 1;
    out.uz = 0;
    out.speed = d.v;
    out.phase = d.phase;
    return out;
  }
  if (id === 'viking') {
    const ck = rideClock('viking', nowMs);
    const th = ck.phase === 'running' ? vikingAt(ck.t) : 0;
    const L = vikingLocal(seat);
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // x 축으로 th 만큼 돌린다: (y, z) → (y c - z s, y s + z c)
    out.x = VIKING.x + L.x;
    out.y = VIKING.pivotY + L.y * c - L.z * sn;
    out.z = VIKING.z + L.y * sn + L.z * c;
    out.fx = 0;
    out.fy = -L.face * sn;
    out.fz = L.face * c;
    out.ux = 0;
    out.uy = c;
    out.uz = sn;
    // 좌석 속도 ≈ 각속도 × 반지름
    const dth = (vikingAt(ck.t + 0.05) - vikingAt(ck.t - 0.05)) / 0.1;
    out.speed = ck.phase === 'running' ? Math.abs(dth) * Math.hypot(L.y, L.z) : 0;
    return out;
  }
  if (id === 'gyro') {
    const ck = rideClock('gyro', nowMs);
    const t = ck.phase === 'running' ? ck.t : ck.phase === 'idle' ? GYRO_RUN : 0;
    const g = gyroPose(seat, t);
    Object.assign(out, g);
    const g2 = gyroPose(seat, t + 0.05);
    out.speed = ck.phase === 'running' ? Math.hypot(g2.x - g.x, g2.y - g.y, g2.z - g.z) / 0.05 : 0;
    return out;
  }
  if (id === 'sky') {
    const ck = rideClock('sky', nowMs);
    const t = ck.phase === 'running' ? ck.t : ck.phase === 'idle' ? SKY_RUN : 0;
    Object.assign(out, skyPose(seat, t));
    out.speed = ck.phase === 'running' ? skyAt(t).w * (SKY.armR + SKY.chain * Math.sin(skyAt(t).tilt)) : 0;
    return out;
  }
  const cabin = Math.floor(seat / 4) % WHEEL.cabins;
  const a = wheelAngle(cabin, nowMs);
  const L = wheelLocal(seat % 4);
  out.x = WHEEL.x + Math.sin(a) * WHEEL.r + L.x;
  out.y = WHEEL.hubY - Math.cos(a) * WHEEL.r - 2.45;
  out.z = WHEEL.z + L.z;
  out.fx = 0;
  out.fy = 0;
  out.fz = L.face;
  out.ux = 0;
  out.uy = 1;
  out.uz = 0;
  out.speed = (2 * Math.PI * WHEEL.r) / WHEEL.period;
  return out;
}

/** 대관람차는 탄 뒤 한 바퀴(period) 돌면 내린다 */
export const WHEEL_RIDE_MS = WHEEL.period * 1000;

/** 자이로 스윙 좌석: 원판 가장자리, 바깥을 보고 앉는다 (위쪽 = 축을 향함) */
export function gyroPose(seat: number, t: number) {
  const { th, spin } = gyroAt(t);
  const c = Math.cos(th);
  const sn = Math.sin(th);
  // 팔 (축 → 원판): x 축으로 th 만큼 돌린 (0, -1, 0)
  const ax = 0;
  const ay = -c;
  const az = -sn;
  const cx = GYRO.x;
  const cy = GYRO.pivotY + ay * GYRO.arm;
  const cz = GYRO.z + az * GYRO.arm;
  // 원판 면의 두 축: e1 = x, e2 = x 축으로 돌린 (0, 0, 1)
  const a = (seat * 2 * Math.PI) / GYRO.seats + spin;
  const ox = Math.cos(a);
  const oy = Math.sin(a) * -sn;
  const oz = Math.sin(a) * c;
  return {
    x: cx + ox * GYRO.ringR - ax * 0.4,
    y: cy + oy * GYRO.ringR - ay * 0.4,
    z: cz + oz * GYRO.ringR - az * 0.4,
    fx: ox,
    fy: oy,
    fz: oz,
    ux: -ax,
    uy: -ay,
    uz: -az,
  };
}

/** 스카이 스윙 좌석: 팔 끝에서 줄에 매달려 바깥으로 기울어진 그네. 도는 방향을 본다 */
export function skyPose(seat: number, t: number) {
  const { y, spin, tilt } = skyAt(t);
  const a = (seat * 2 * Math.PI) / SKY.seats + spin;
  const ox = Math.cos(a);
  const oz = Math.sin(a);
  const sb = Math.sin(tilt);
  const cb = Math.cos(tilt);
  return {
    x: SKY.x + ox * (SKY.armR + SKY.chain * sb),
    y: y - SKY.chain * cb,
    z: SKY.z + oz * (SKY.armR + SKY.chain * sb),
    // 반시계로 돈다 (위에서 볼 때): 진행 방향 = (-sin, cos)
    fx: -oz,
    fy: 0,
    fz: ox,
    ux: -ox * sb,
    uy: cb,
    uz: -oz * sb,
  };
}

// ───────────────────────── 산책로 (길 · 이정표 · 길찾기) ─────────────────────────

/** 길 교차점 */
export const PARK_NODES: Record<string, { x: number; z: number }> = {
  gate: { x: 0, z: 42 },
  south: { x: 0, z: 36 },
  plaza: { x: 0, z: 22 },
  cross: { x: 0, z: 10 },
  gyroJ: { x: 0, z: -27 },
  north: { x: 0, z: -66 },
  top: { x: 0, z: -82 },
  coasterW: { x: -24, z: 38.5 },
  coasterG: { x: RIDES.coaster.gate.x, z: RIDES.coaster.gate.z },
  west: { x: -24, z: 10 },
  carousel: { x: 11, z: 22 },
  east: { x: 28, z: 10 },
  far: { x: 64, z: 10 },
  vikJ: { x: 28, z: -6 },
  vikingG: { x: RIDES.viking.gate.x, z: RIDES.viking.gate.z },
  dropJ: { x: 28, z: -32 },
  dropG: { x: RIDES.drop.gate.x, z: RIDES.drop.gate.z },
  wheelJ: { x: 28, z: -56 },
  wheelG: { x: RIDES.wheel.gate.x, z: RIDES.wheel.gate.z },
  gyroG: { x: RIDES.gyro.gate.x, z: RIDES.gyro.gate.z },
  skyG: { x: RIDES.sky.gate.x, z: RIDES.sky.gate.z },
  station: { x: PARK.station.x, z: PARK.station.z - 2.2 },
};

/** 길: [교차점, 교차점, 폭, 대로?] */
export const PARK_PATHS: [string, string, number, boolean][] = [
  ['gate', 'south', 10, true],
  ['south', 'plaza', 10, true],
  ['plaza', 'cross', 10, true],
  ['cross', 'gyroJ', 9, true],
  ['gyroJ', 'north', 9, true],
  ['north', 'top', 8, true],
  ['cross', 'west', 8, true],
  ['cross', 'east', 8, true],
  ['east', 'far', 7, true],
  ['south', 'coasterW', 6, false],
  ['coasterW', 'coasterG', 6, false],
  ['coasterW', 'west', 5, false],
  ['plaza', 'carousel', 5, false],
  ['east', 'vikJ', 6, false],
  ['vikJ', 'vikingG', 5, false],
  ['vikJ', 'dropJ', 6, false],
  ['dropJ', 'dropG', 5, false],
  ['dropJ', 'wheelJ', 6, false],
  ['wheelJ', 'wheelG', 5, false],
  ['gyroJ', 'gyroG', 5, false],
  ['north', 'skyG', 5, false],
  ['north', 'wheelJ', 5, false],
  ['gyroJ', 'dropJ', 5, false],
  ['south', 'station', 5, false],
];

/** 놀이기구 입구 교차점 */
export const RIDE_NODE: Record<RideId, string> = { coaster: 'coasterG', drop: 'dropG', viking: 'vikingG', wheel: 'wheelG', gyro: 'gyroG', sky: 'skyG' };

const adj = (() => {
  const m = new Map<string, { to: string; d: number }[]>();
  for (const [a, b] of PARK_PATHS) {
    const d = Math.hypot(PARK_NODES[a].x - PARK_NODES[b].x, PARK_NODES[a].z - PARK_NODES[b].z);
    (m.get(a) ?? m.set(a, []).get(a)!).push({ to: b, d });
    (m.get(b) ?? m.set(b, []).get(b)!).push({ to: a, d });
  }
  return m;
})();

/** 두 교차점 사이 가장 짧은 길 (교차점 이름들) */
export function parkRoute(from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const n of open) if ((dist.get(n) ?? Infinity) < best) [cur, best] = [n, dist.get(n)!];
    open.delete(cur);
    if (cur === to) break;
    for (const e of adj.get(cur) ?? []) {
      const nd = best + e.d;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur);
        open.add(e.to);
      }
    }
  }
  if (!dist.has(to)) return [];
  const out = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0])!);
  return out;
}

/** 이 점에서 가장 가까운 길 위의 점 (길 한가운데 선 기준)과 그 길의 두 끝 */
export function nearestOnPaths(x: number, z: number): { x: number; z: number; a: string; b: string; d: number } {
  let best = { x, z, a: 'gate', b: 'south', d: Infinity };
  for (const [a, b] of PARK_PATHS) {
    const A = PARK_NODES[a];
    const B = PARK_NODES[b];
    const vx = B.x - A.x;
    const vz = B.z - A.z;
    const L2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / L2));
    const px = A.x + vx * u;
    const pz = A.z + vz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, a, b, d };
  }
  return best;
}

/**
 * 지금 자리에서 목적지(교차점)까지 걸어갈 길 (점 목록): 가까운 길로 올라선 뒤 길을 따라간다.
 * 길의 어느 쪽 끝으로 가는 게 빠른지 둘 다 계산해 짧은 쪽.
 */
export function parkPathTo(x: number, z: number, target: string): { x: number; z: number }[] {
  const on = nearestOnPaths(x, z);
  const len = (ns: string[]) => ns.reduce((s, n, i) => (i ? s + Math.hypot(PARK_NODES[n].x - PARK_NODES[ns[i - 1]].x, PARK_NODES[n].z - PARK_NODES[ns[i - 1]].z) : s), 0);
  let best: { x: number; z: number }[] = [];
  let bestLen = Infinity;
  for (const end of [on.a, on.b]) {
    const r = parkRoute(end, target);
    if (!r.length) continue;
    const L = Math.hypot(on.x - PARK_NODES[end].x, on.z - PARK_NODES[end].z) + len(r);
    if (L < bestLen) {
      bestLen = L;
      best = [{ x: on.x, z: on.z }, ...r.map((n) => PARK_NODES[n])];
    }
  }
  return best;
}

/** 이정표: 큰 교차점마다, 갈래길 방향별로 그쪽으로 가면 나오는 놀이기구 */
export function signposts(): { x: number; z: number; arrows: { dir: number; labels: string[] }[] }[] {
  const out: { x: number; z: number; arrows: { dir: number; labels: string[] }[] }[] = [];
  for (const n of ['south', 'plaza', 'cross', 'gyroJ', 'north', 'east', 'vikJ', 'dropJ', 'wheelJ', 'coasterW', 'west']) {
    const P = PARK_NODES[n];
    const groups = new Map<string, string[]>();
    for (const id of RIDE_IDS) {
      const r = parkRoute(n, RIDE_NODE[id]);
      if (r.length < 2) continue;
      const list = groups.get(r[1]) ?? [];
      list.push(`${RIDES[id].icon} ${RIDES[id].name.split(' (')[0]}`);
      groups.set(r[1], list);
    }
    // 역 · 입구 방향도
    const toGate = parkRoute(n, 'station');
    if (toGate.length > 1) groups.set(toGate[1], [...(groups.get(toGate[1]) ?? []), '🚇 출구 · 역']);
    const arrows = [...groups.entries()].map(([to, labels]) => ({ dir: Math.atan2(PARK_NODES[to].x - P.x, PARK_NODES[to].z - P.z), labels }));
    if (arrows.length) out.push({ x: P.x + 5.6, z: P.z + 5.6, arrows });
  }
  return out;
}
