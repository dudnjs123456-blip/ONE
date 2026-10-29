import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import { GETUP_FRAMES } from '../core/constants';
import type { Fighter } from '../core/fighter';
import { totalFrames } from '../data/moves';
import { track } from './loadTracker';

/**
 * 모션캡처 애니메이션 (Quaternius Universal Animation Library, CC0).
 * public/anims/ual.json 은 원본 리그 → VRM 휴머노이드 뼈대로 미리 구운 데이터:
 * 각 뼈의 T포즈 대비 '월드 회전 변화량' 을 30fps 로 담고 있다.
 * (굽는 스크립트: scripts/bake-anims.mjs)
 */
export interface BakedClip {
  name: string;
  duration: number;
  frames: number;
  /** 손이 가장 멀리 뻗는 순간 (초) — 게임의 히트 프레임에 맞춘다 */
  impact: number;
  hand: 'L' | 'R';
  /** 골반 위치 변화 (골반 높이 비율), 프레임당 xyz */
  hips: number[];
  /** 뼈별 월드 회전 변화량, 프레임당 xyzw */
  tracks: Record<string, number[]>;
}

export interface ClipLibrary {
  fps: number;
  clips: Record<string, BakedClip>;
}

export const CLIP_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
] as const satisfies readonly VRMHumanBoneName[];
export type ClipBone = (typeof CLIP_BONES)[number];

/** 부모 후보 (모델에 없는 뼈는 건너뛰고 가장 가까운 조상 기준으로 계산) */
export const CLIP_PARENTS: Partial<Record<ClipBone, ClipBone[]>> = {
  spine: ['hips'],
  chest: ['spine', 'hips'],
  upperChest: ['chest', 'spine'],
  neck: ['upperChest', 'chest', 'spine'],
  head: ['neck', 'upperChest', 'chest'],
  leftShoulder: ['upperChest', 'chest', 'spine'],
  rightShoulder: ['upperChest', 'chest', 'spine'],
  leftUpperArm: ['leftShoulder', 'upperChest', 'chest'],
  rightUpperArm: ['rightShoulder', 'upperChest', 'chest'],
  leftLowerArm: ['leftUpperArm'],
  rightLowerArm: ['rightUpperArm'],
  leftHand: ['leftLowerArm'],
  rightHand: ['rightLowerArm'],
  leftUpperLeg: ['hips'],
  rightUpperLeg: ['hips'],
  leftLowerLeg: ['leftUpperLeg'],
  rightLowerLeg: ['rightUpperLeg'],
  leftFoot: ['leftLowerLeg'],
  rightFoot: ['rightLowerLeg'],
  leftToes: ['leftFoot'],
  rightToes: ['rightFoot'],
};

let library: Promise<ClipLibrary | null> | null = null;

export function loadClipLibrary(url = '/anims/ual.json'): Promise<ClipLibrary | null> {
  library ??= track(
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ClipLibrary>) : null))
      .catch(() => null),
  );
  return library;
}

export interface ClipChoice {
  key: string;
  /** 재생 위치 (초) */
  time: number;
  loop: boolean;
  /** 두 번째 클립을 w 만큼 섞는다 (걷기 ↔ 달리기 사이 속도) */
  mix?: { key: string; time: number; w: number };
}

// ───────────────────────── 걸음 보정 (발 미끄러짐 방지) ─────────────────────────

/** 모델 다리 치수 (미터). 같은 클립이라도 다리가 길면 보폭이 길다 */
export interface Legs {
  thigh: number;
  shin: number;
  /** 골반 중심 ~ 고관절 좌우 거리 */
  hipX: number;
  /** 서 있을 때 골반 높이 */
  hipsY: number;
}

export interface Gait {
  /** 한 주기(두 걸음)에 나아가는 거리 (m). 이 값으로 위상을 돌리면 딛은 발이 땅에 붙어 있다 */
  stride: number;
  /** 위상 0 = 왼발이 가장 앞에 있는 순간이 되도록 더할 값 (주기 단위). 걷기·달리기 발을 맞춰 섞기 위해 */
  offset: number;
}

export interface GaitSet {
  walk?: Gait;
  jog?: Gait;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _fq = new THREE.Quaternion();
const _fv = new THREE.Vector3();

/** 클립 i 번째 프레임의 발목 위치 (골반 바로 아래 바닥 기준). 클립은 T포즈 대비 월드 회전이라 다리 뼈를 아래로 뻗은 뒤 돌리면 된다 */
function footAt(clip: BakedClip, i: number, left: boolean, legs: Legs, out: THREE.Vector3) {
  const h = clip.hips;
  out.set(h[i * 3], h[i * 3 + 1], h[i * 3 + 2]).multiplyScalar(legs.hipsY);
  out.y += legs.hipsY;
  const hipsQ = clip.tracks.hips ? _fq.fromArray(clip.tracks.hips, i * 4) : _fq.identity();
  out.add(_fv.set(left ? legs.hipX : -legs.hipX, 0, 0).applyQuaternion(hipsQ));
  const up = clip.tracks[left ? 'leftUpperLeg' : 'rightUpperLeg'];
  const lo = clip.tracks[left ? 'leftLowerLeg' : 'rightLowerLeg'];
  if (up) out.addScaledVector(_fv.copy(DOWN).applyQuaternion(_fq.fromArray(up, i * 4)), legs.thigh);
  if (lo) out.addScaledVector(_fv.copy(DOWN).applyQuaternion(_fq.fromArray(lo, i * 4)), legs.shin);
  return out;
}

/**
 * 제자리 걷기 클립에서 '땅을 딛고 있는 발이 뒤로 밀리는 속도' 를 재서 보폭을 구한다.
 * 몸이 이 속도로 앞으로 가면 딛은 발이 땅에 딱 붙어 보인다.
 */
export function measureGait(clip: BakedClip, fps: number, legs: Legs): Gait | undefined {
  const n = clip.frames;
  if (n < 3 || !clip.tracks.leftUpperLeg) return undefined;
  const p = new THREE.Vector3();
  const ground = 0.035 * ((legs.thigh + legs.shin) / 0.84);
  let sum = 0;
  let count = 0;
  let front = 0;
  let frontZ = -Infinity;
  for (const left of [true, false]) {
    const ys: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < n; i++) {
      footAt(clip, i, left, legs, p);
      ys.push(p.y);
      zs.push(p.z);
      if (left && p.z > frontZ) {
        frontZ = p.z;
        front = i;
      }
    }
    const minY = Math.min(...ys);
    for (let i = 0; i < n - 1; i++) {
      if (ys[i] < minY + ground && ys[i + 1] < minY + ground) {
        sum += zs[i] - zs[i + 1];
        count++;
      }
    }
  }
  const speed = count ? (sum / count) * fps : 0; // m/s
  const stride = speed * clip.duration;
  if (!(stride > 0.3)) return undefined;
  return { stride, offset: front / (n - 1) };
}

export function measureGaits(lib: ClipLibrary, legs: Legs): GaitSet {
  const c = lib.clips;
  return {
    walk: c.walk && measureGait(c.walk, lib.fps, legs),
    jog: c.jog && measureGait(c.jog, lib.fps, legs),
  };
}

/** 걷기(0) ↔ 달리기(1) 섞는 비율. 속도는 m/s. 2.2 m/s 까지는 걷기, 4.4 m/s 부터 달리기 */
export function runBlend(ms: number) {
  const u = Math.min(1, Math.max(0, (ms - 2.2) / 2.2));
  return u * u * (3 - 2 * u);
}

/** 지금 속도에서 한 주기에 나아갈 거리 (속도는 60fps 1프레임당 m). 걷기·달리기를 섞는 비율과 같게 */
export function strideFor(g: GaitSet, speed: number, casual: boolean): number | null {
  if (!g.jog) return null;
  if (!casual || !g.walk) return g.jog.stride;
  const w = runBlend(speed * 60);
  return g.walk.stride + (g.jog.stride - g.walk.stride) * w;
}

const cyc = (u: number) => ((u % 1) + 1) % 1;

/** 기술 id → 모션캡처 클립. 없는 기술(발차기·어퍼 등)은 절차적 포즈를 쓴다 */
const ATTACK_CLIPS: Record<string, string> = {
  jab: 'jab',
  straight: 'cross',
  oneTwo: 'cross',
  bodyBlow: 'hook',
  dashStraight: 'cross',
};

/**
 * 지금 상태에 쓸 클립과 재생 위치. null 이면 절차적 포즈 그대로.
 * @param fr 보간된 소수점 프레임 (f.frame + sub)
 * @param cycles 달리기 발 위상 (주기 단위, 이동 거리 기반)
 */
/** 걷기로 볼 최대 속도 (60fps 1프레임당 m). 이보다 빠르면 달리기 */
export const WALK_SPEED_MAX = 0.07;

export function chooseClip(
  lib: ClipLibrary,
  f: Fighter,
  fr: number,
  cycles: number,
  t: number,
  opts: { casual?: boolean; speed?: number; gait?: GaitSet | null } = {},
): ClipChoice | null {
  const c = lib.clips;
  const u = ((cycles % 1) + 1) % 1;
  const g = opts.gait;
  switch (f.state) {
    case 'idle':
      // 일상 모드(도시)에선 편하게 선 자세, 전투에선 철권 스탠스(절차적)
      return opts.casual && c.idle ? { key: 'idle', time: (t / 60) % c.idle.duration, loop: true } : null;
    case 'run':
      // 보정값이 있으면: 걷기·달리기를 속도에 따라 섞는다 (같은 발 위상으로 맞춰서 다리가 엇갈리지 않게)
      if (g?.walk && g.jog && c.walk && c.jog) {
        const jog = { key: 'jog', time: cyc(u + g.jog.offset) * c.jog.duration, loop: true };
        if (!opts.casual) return jog;
        const w = runBlend((opts.speed ?? 0) * 60);
        return { key: 'walk', time: cyc(u + g.walk.offset) * c.walk.duration, loop: true, mix: { key: 'jog', time: jog.time, w } };
      }
      if (opts.casual && (opts.speed ?? 1) < WALK_SPEED_MAX && c.walk) return { key: 'walk', time: u * c.walk.duration, loop: true };
      return c.jog && { key: 'jog', time: u * c.jog.duration, loop: true };
    case 'crouch':
      return c.crouch && { key: 'crouch', time: (t / 60) % c.crouch.duration, loop: true };
    case 'jump':
      return c.jump && { key: 'jump', time: (fr / 60) % c.jump.duration, loop: true };
    case 'hitstun': {
      // 콤보 짝·홀에 따라 가슴/머리 피격을 번갈아
      const key = f.combo % 2 === 0 ? 'hitHead' : 'hitChest';
      const clip = c[key];
      return clip && { key, time: clip.duration * Math.min(1, fr / Math.max(1, f.stun)), loop: false };
    }
    case 'getup':
      return c.getup && { key: 'getup', time: c.getup.duration * Math.min(1, fr / GETUP_FRAMES), loop: false };
    case 'attack': {
      const m = f.move;
      const key = m && ATTACK_CLIPS[m.id];
      const clip = key ? c[key] : undefined;
      if (!m || !key || !clip) return null;
      // 발생까지 = 클립 시작 → 타격 순간, 이후 = 타격 순간 → 끝. 게임 히트 프레임과 주먹이 다 뻗는 순간이 일치
      const total = totalFrames(m);
      const time =
        fr < m.startup
          ? clip.impact * (fr / m.startup)
          : clip.impact + (clip.duration - clip.impact) * Math.min(1, (fr - m.startup) / Math.max(1, total - m.startup));
      return { key, time, loop: false };
    }
    default:
      return null;
  }
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** 클립을 시간 t 에서 샘플링해 뼈별 월드 회전 변화량(out)과 골반 이동(hips)을 채운다 */
export function sampleClip(
  clip: BakedClip,
  fps: number,
  time: number,
  loop: boolean,
  out: Map<ClipBone, THREE.Quaternion>,
  hips: THREE.Vector3,
) {
  const last = clip.frames - 1;
  let x = time * fps;
  if (loop) x = ((x % last) + last) % last;
  else x = Math.min(last, Math.max(0, x));
  const i = Math.min(last - 1, Math.floor(x));
  const u = x - i;
  for (const b of CLIP_BONES) {
    const tr = clip.tracks[b];
    if (!tr) continue;
    qa.fromArray(tr, i * 4);
    qb.fromArray(tr, (i + 1) * 4);
    let q = out.get(b);
    if (!q) out.set(b, (q = new THREE.Quaternion()));
    q.copy(qa).slerp(qb, u);
  }
  const h = clip.hips;
  hips.set(
    h[i * 3] + (h[(i + 1) * 3] - h[i * 3]) * u,
    h[i * 3 + 1] + (h[(i + 1) * 3 + 1] - h[i * 3 + 1]) * u,
    h[i * 3 + 2] + (h[(i + 1) * 3 + 2] - h[i * 3 + 2]) * u,
  );
}

const mixOut = new Map<ClipBone, THREE.Quaternion>();
const mixHips = new THREE.Vector3();

/** 고른 클립을 샘플링한다. 섞을 클립(mix)이 있으면 그 비율만큼 섞는다 */
export function sampleChoice(lib: ClipLibrary, ch: ClipChoice, out: Map<ClipBone, THREE.Quaternion>, hips: THREE.Vector3) {
  const clip = lib.clips[ch.key];
  if (!clip) return;
  sampleClip(clip, lib.fps, ch.time, ch.loop, out, hips);
  const m = ch.mix;
  const mc = m && lib.clips[m.key];
  if (!m || !mc || m.w <= 0.001) return;
  sampleClip(mc, lib.fps, m.time, ch.loop, mixOut, mixHips);
  for (const [b, q] of mixOut) out.get(b)?.slerp(q, m.w);
  hips.lerp(mixHips, m.w);
}
