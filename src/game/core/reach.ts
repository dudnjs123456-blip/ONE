import * as THREE from 'three';
import type { Fighter } from './fighter';
import type { MoveAnim, MoveDef } from '../data/moves';
import { FIGHTER_RADIUS } from './constants';
import { BODY_SPECS, type BodySpec } from '../data/bodies';
import { backTurnPivot, backTurnPivotPoint, backTurnSpin, poseFor, supportFootAnchor, type LegDims } from '../render/mannequin';

/**
 * 타격 판정용 팔·다리 위치 계산.
 * 화면 캐릭터와 같은 관절 각도(poseFor)를 캐릭터 몸 치수(BodySpec)로 이어 붙여
 * 지금 프레임의 주먹/발이 어디 있는지 구하고, 상대 몸(세운 원기둥)에 실제로 닿았는지 본다.
 */

/** 기술 → 때리는 부위. 여기 없는 기술(보스 몸통 박치기 등)은 예전 사거리 판정을 쓴다 */
export const STRIKER: Partial<Record<MoveAnim, 'handL' | 'handR' | 'footL' | 'footR' | 'kneeR'>> = {
  jabL: 'handL',
  straightR: 'handR',
  midPunchL: 'handL',
  uppercutR: 'handR',
  bodyBlowR: 'handR',
  jumpPunchR: 'handR',
  midKickL: 'footL',
  highKickR: 'footR',
  lowKickR: 'footR',
  sweepL: 'footL',
  flyKick: 'footR',
  tornadoKick: 'footR',
  backTurnKick: 'footR',
  slide: 'footR',
  kneeR: 'kneeR',
};

/** 주먹·발 굵기 (닿음 판정 여유) */
export const LIMB_RADIUS = 0.06;
/** 휘두르는 궤적이 몸 중심에서 살짝 비껴도 몸 폭 안이면 닿은 것으로 본다 */
const LATERAL_SLACK = 0.06;
/** 공중에 뜬 몸의 맞는 굵기 배율 */
const AIR_SPREAD = 2.1;

interface Rig {
  root: THREE.Object3D;
  body: THREE.Object3D;
  torso: THREE.Object3D;
  shL: THREE.Object3D;
  shR: THREE.Object3D;
  elL: THREE.Object3D;
  elR: THREE.Object3D;
  hpL: THREE.Object3D;
  hpR: THREE.Object3D;
  knL: THREE.Object3D;
  knR: THREE.Object3D;
}

/** 몸 치수마다 뼈대 두 벌 (0 = 때리는 쪽, 1 = 맞는 쪽: 둘이 같은 외형일 수 있다) */
const rigs = new WeakMap<BodySpec, [Rig, Rig]>();

function buildRig(spec: BodySpec): Rig {
  const node = (parent: THREE.Object3D | null, x = 0, y = 0) => {
    const g = new THREE.Object3D();
    g.position.set(x, y, 0);
    parent?.add(g);
    return g;
  };
  const root = node(null);
  const body = node(root);
  const torso = node(body);
  // 캐릭터는 +Z 를 바라보고, 왼쪽이 +X (mannequin 과 같은 좌표)
  const shL = node(torso, spec.shX, spec.shY);
  const shR = node(torso, -spec.shX, spec.shY);
  const hpL = node(body, spec.hipX, HIP_Y);
  const hpR = node(body, -spec.hipX, HIP_Y);
  return {
    root, body, torso, shL, shR, hpL, hpR,
    elL: node(shL, 0, -spec.upperArm),
    elR: node(shR, 0, -spec.upperArm),
    knL: node(hpL, 0, -spec.thigh),
    knR: node(hpR, 0, -spec.thigh),
  };
}

const HIP_Y = -0.04;

export function legDims(spec: BodySpec): LegDims {
  return { hipX: spec.hipX, hipY: HIP_Y, thigh: spec.thigh, shin: spec.shin };
}

function legHeight(spec: BodySpec, hip: number, knee: number, ab: number) {
  return (spec.thigh * Math.cos(hip) + spec.shin * Math.cos(hip + knee)) * Math.cos(ab);
}

/** f 의 지금 자세를 몸 치수대로 뼈대에 입힌다 (화면 캐릭터와 같은 계산) */
function posedRig(f: Fighter, spec: BodySpec, slot: 0 | 1): Rig {
  let pair = rigs.get(spec);
  if (!pair) rigs.set(spec, (pair = [buildRig(spec), buildRig(spec)]));
  const r = pair[slot];
  const p = poseFor(f, 0);
  const legs = legDims(spec);

  const yaw = Math.atan2(f.fx, f.fz);
  const spin = backTurnSpin(f);
  const axis = backTurnPivotPoint(legs);
  const pivot = backTurnPivot(spin, yaw, axis.x, axis.z);
  r.root.position.set(f.x + pivot.x, f.y, f.z + pivot.z);
  r.root.rotation.set(0, yaw + spin, 0);

  const standY = Math.max(legHeight(spec, p.hpL, p.knL, p.abL + p.roll), legHeight(spec, p.hpR, p.knR, p.abR - p.roll)) + 0.06;
  const anchor = supportFootAnchor(f, p, 0, legs);
  r.body.position.set(anchor.x, standY * (1 - p.drop) + 0.14 * p.drop + p.rise, anchor.z);
  r.body.rotation.set(p.tilt, p.hipYaw, p.roll);
  r.torso.rotation.set(p.lean, p.twist - p.hipYaw, 0);
  r.shL.rotation.set(p.shL, 0, 0.08 + p.arL);
  r.elL.rotation.set(p.elL, 0, 0);
  r.shR.rotation.set(p.shR, 0, -(0.08 + p.arR));
  r.elR.rotation.set(p.elR, 0, 0);
  r.hpL.rotation.set(p.hpL, 0, p.abL);
  r.knL.rotation.set(p.knL, 0, 0);
  r.hpR.rotation.set(p.hpR, 0, -p.abR);
  r.knR.rotation.set(p.knR, 0, 0);
  r.root.updateMatrixWorld(true);
  return r;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** 지금 프레임의 때리는 부위 선분 (팔꿈치→주먹 끝, 또는 무릎→발 끝). 때리는 부위가 없는 기술이면 null */
export function strikeSegment(f: Fighter, spec: BodySpec): { a: THREE.Vector3; b: THREE.Vector3 } | null {
  const m = f.move;
  const part = m && STRIKER[m.anim];
  if (!m || !part) return null;
  const r = posedRig(f, spec, 0);
  switch (part) {
    case 'handL':
      r.elL.getWorldPosition(_a);
      _b.set(0, -spec.lowerArm, 0).applyMatrix4(r.elL.matrixWorld);
      break;
    case 'handR':
      r.elR.getWorldPosition(_a);
      _b.set(0, -spec.lowerArm, 0).applyMatrix4(r.elR.matrixWorld);
      break;
    case 'footL':
      r.knL.getWorldPosition(_a);
      _b.set(0, -spec.shin, 0).applyMatrix4(r.knL.matrixWorld);
      break;
    case 'footR':
      r.knR.getWorldPosition(_a);
      _b.set(0, -spec.shin, 0).applyMatrix4(r.knR.matrixWorld);
      break;
    case 'kneeR':
      // 무릎차기: 허벅지 앞쪽(고관절→무릎)으로 때린다
      r.hpR.getWorldPosition(_a);
      r.knR.getWorldPosition(_b);
      break;
  }
  return { a: _a.clone(), b: _b.clone() };
}

/** 몸의 한 부분 (선분 + 굵기) */
interface BodyPart {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}

/**
 * 맞는 쪽 몸: 지금 자세 그대로의 몸통(골반→머리 꼭대기)과 두 다리(고관절→무릎→발).
 * 앉으면 낮아지고, 띄워지면 공중에 누운 채로 계산된다. 몸 치수가 없는 몬스터·보스는 크기만큼 세운 원기둥.
 */
export function bodyParts(def: Fighter): BodyPart[] {
  const spec = def.body;
  if (!spec) {
    const r = 0.24 * def.size;
    return [{ a: new THREE.Vector3(def.x, def.y + r, def.z), b: new THREE.Vector3(def.x, def.y + 1.7 * def.size - r, def.z), r }];
  }
  const rig = posedRig(def, spec, 1);
  const pelvis = rig.body.getWorldPosition(new THREE.Vector3());
  // 골반 → 머리 꼭대기 (서 있을 때 골반 높이 ≈ 다리 길이)
  const headTop = new THREE.Vector3(0, Math.max(0.3, spec.height - (spec.thigh + spec.shin) * 0.97 - 0.06), 0).applyMatrix4(rig.torso.matrixWorld);
  // 공중에 뜬 몸은 팔다리가 흔들리며 넓게 퍼진다: 맞는 범위를 넓힌다
  const spread = def.state === 'launched' ? AIR_SPREAD : 1;
  const leg = spec.radius * 0.5 * spread;
  const parts: BodyPart[] = [{ a: pelvis, b: headTop, r: spec.radius * spread }];
  for (const [hp, kn] of [[rig.hpL, rig.knL], [rig.hpR, rig.knR]] as const) {
    const hip = hp.getWorldPosition(new THREE.Vector3());
    const knee = kn.getWorldPosition(new THREE.Vector3());
    const foot = new THREE.Vector3(0, -spec.shin, 0).applyMatrix4(kn.matrixWorld);
    parts.push({ a: hip, b: knee, r: leg }, { a: knee, b: foot, r: leg });
  }
  return parts;
}

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();

function pointSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? Math.min(1, Math.max(0, _ap.dot(_ab) / len2)) : 0;
  return _ap.addScaledVector(_ab, -t).length();
}

/**
 * att 의 주먹/발이 지금 def 몸에 닿았나.
 * @returns 닿은 점 / 닿지 않음(null) / 이 기술은 부위 판정을 안 씀(undefined → 예전 사거리 판정)
 */
export function strikeContact(att: Fighter, def: Fighter): THREE.Vector3 | null | undefined {
  if (!att.body) return undefined;
  const seg = strikeSegment(att, att.body);
  if (!seg) return undefined;
  const parts = bodyParts(def);
  // 팔꿈치→주먹 끝(무릎→발 끝) 위의 점 중 하나라도 몸에 닿으면 맞았다. 끝(주먹·발)부터 본다
  for (let i = 4; i >= 0; i--) {
    const p = seg.a.clone().lerp(seg.b, i / 4);
    for (const part of parts) if (pointSegmentDistance(p, part.a, part.b) <= part.r + LIMB_RADIUS + LATERAL_SLACK) return p;
  }
  return null;
}

/**
 * 이 기술이 앞으로 닿는 최대 거리 (공격자 중심 → 주먹/발 끝, 정면 방향). 지속 프레임 중 가장 멀리 뻗은 값.
 * 자동 회피(피할 만큼 떨어졌나)와 AI 거리 판단에 쓴다. 몸 치수·기술별로 한 번만 계산해 둔다.
 */
const reachCache = new WeakMap<BodySpec, Map<string, number>>();

export function moveReach(att: Fighter, spec: BodySpec): number | null {
  const m = att.move;
  if (!m || !STRIKER[m.anim]) return null;
  let byMove = reachCache.get(spec);
  if (!byMove) reachCache.set(spec, (byMove = new Map()));
  const key = `${m.id}:${m.startup}:${m.active}`;
  const hit = byMove.get(key);
  if (hit !== undefined) return hit;
  // 제자리·정면(+z) 에서 지속 프레임을 돌려 본다 (돌진 거리 lunge 는 따로 더한다)
  const probe = Object.create(att) as Fighter;
  probe.x = 0;
  probe.z = 0;
  probe.y = 0;
  probe.fx = 0;
  probe.fz = 1;
  let best = 0;
  for (let fr = m.startup; fr <= m.startup + m.active - 1; fr++) {
    probe.frame = fr;
    const seg = strikeSegment(probe, spec);
    if (seg) best = Math.max(best, seg.a.z, seg.b.z);
  }
  const reach = best + (isPlantedKick(m) ? 0 : (m.lunge ?? 0) * m.startup) + stepDistance(m) + LIMB_RADIUS;
  byMove.set(key, reach);
  return reach;
}

// ───────────────────────── 파고드는 스텝 ─────────────────────────

/** 디딤발을 땅에 박고 차는 발차기: 몸이 앞으로 미끄러지면 디딤발도 끌려가므로 스텝·돌진 없이 제자리에서 찬다 */
const PLANTED_KICKS = new Set<string>(['midKickL', 'highKickR', 'lowKickR', 'sweepL', 'backTurnKick']);
export function isPlantedKick(mv: MoveDef): boolean {
  return PLANTED_KICKS.has(mv.anim);
}

/** 스텝 계산 기준 몸 (기본 외형). 팔다리가 더 긴 캐릭터는 그만큼 더 멀리 닿는다 */
let refSpec: BodySpec | null = null;
const stepCache = new Map<string, number>();
/** 한 기술이 파고드는 최대 거리 */
const MAX_STEP = 0.8;

/** 스텝 없이 제자리에서 쳤을 때 서 있는 상대(기준 몸)에게 닿는 가장 먼 중심 거리 */
function standingContactMax(mv: MoveDef, spec: BodySpec): number {
  const att = { state: 'attack', move: mv, frame: mv.startup, x: 0, y: 0, z: 0, fx: 0, fz: 1, body: spec, sidestepDir: 1, moveHits: [] } as unknown as Fighter;
  const def = { state: 'idle', frame: 0, move: null, body: spec, size: 1, x: 0, y: 0, z: 0, fx: 0, fz: -1, sidestepDir: 1 } as unknown as Fighter;
  const touches = (d: number) => {
    def.z = d;
    for (let fr = mv.startup; fr <= mv.startup + mv.active - 1; fr++) {
      att.frame = fr;
      if (strikeContact(att, def)) return true;
    }
    return false;
  };
  for (let d = 3; d >= 0.3; d -= 0.05) if (touches(d)) return d;
  return 0.3;
}

/**
 * 공격하며 앞으로 파고드는 거리 (발생 프레임 동안 나눠서 전진).
 * 실제로 닿는 거리를 기술의 사거리(range)에 맞춰, 화면에서도 주먹/발이 몸에 닿는 순간에 맞게 한다.
 */
export function stepDistance(mv: MoveDef): number {
  const m = STRIKER[mv.anim];
  if (!m || isPlantedKick(mv)) return 0;
  const cached = stepCache.get(mv.id);
  if (cached !== undefined) return cached;
  refSpec ??= BODY_SPECS.female;
  const lunge = (mv.lunge ?? 0) * mv.startup; // 디딤발 발차기는 위에서 이미 0
  const reach = standingContactMax(mv, refSpec) + lunge;
  const step = Math.min(MAX_STEP, Math.max(0, mv.range + FIGHTER_RADIUS - reach));
  stepCache.set(mv.id, step);
  return step;
}
