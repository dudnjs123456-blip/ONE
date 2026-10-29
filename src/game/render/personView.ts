import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { track } from './loadTracker';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Fighter } from '../core/fighter';
import { totalFrames } from '../data/moves';
import {
  CLIP_BONES,
  chooseClip,
  loadClipLibrary,
  measureGaits,
  sampleChoice,
  sampleClip,
  strideFor,
  type ClipBone,
  type ClipChoice,
  type ClipLibrary,
  type GaitSet,
  type Legs,
} from './clips';
import type { FrameClock } from './clock';
import { Heading, type CharacterView } from './mannequin';
import { addOutline, addRim, toonGradient } from './lookFx';

/**
 * 행인·주민·강도·경찰: Kenney Animated Characters (CC0) — 사람 비율 모델 하나에 옷(스킨)만 바꿔 입힌다.
 * 움직임은 주인공과 같은 모션캡처 라이브러리(Quaternius UAL)를 이 뼈대에 옮겨 입힌다:
 * 각 뼈의 'T포즈 대비 월드 회전 변화량' D 를 받아, 새 월드 회전 = D × (T포즈 월드 회전) 으로 놓고
 * 부모 기준 로컬 회전으로 되돌린다 (두 모델 모두 T포즈·앞 +z 라서 그대로 맞는다).
 */
export const PERSON_SKINS = ['humanMaleA', 'humanFemaleA', 'skaterMaleA', 'skaterFemaleA', 'survivorMaleB', 'survivorFemaleA', 'cyborgFemaleA'] as const;
export const ROBBER_SKIN = 'criminalMaleA';

const BASE = '/models/people/';
const HEIGHT = 1.68;

/** VRM 휴머노이드 뼈 이름 → 이 모델의 뼈 이름 */
const BONE: Record<ClipBone, string> = {
  hips: 'Hips', spine: 'Spine', chest: 'Chest', upperChest: 'UpperChest', neck: 'Neck', head: 'Head',
  leftShoulder: 'LeftShoulder', leftUpperArm: 'LeftArm', leftLowerArm: 'LeftForeArm', leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder', rightUpperArm: 'RightArm', rightLowerArm: 'RightForeArm', rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpLeg', leftLowerLeg: 'LeftLeg', leftFoot: 'LeftFoot', leftToes: 'LeftToes',
  rightUpperLeg: 'RightUpLeg', rightLowerLeg: 'RightLeg', rightFoot: 'RightFoot', rightToes: 'RightToes',
};

let modelPromise: Promise<THREE.Group> | null = null;
const skinCache = new Map<string, THREE.Texture>();
function loadModel() {
  modelPromise ??= track(new FBXLoader().loadAsync(`${BASE}characterMedium.fbx`));
  return modelPromise;
}
function skin(name: string) {
  let t = skinCache.get(name);
  if (!t) {
    let done = () => {};
    void track(new Promise<void>((res) => (done = res)));
    t = new THREE.TextureLoader().load(`${BASE}skins/${name}.png`, done, undefined, done);
    t.colorSpace = THREE.SRGBColorSpace;
    skinCache.set(name, t);
  }
  return t;
}

const KICK_ANIMS = new Set(['midKickL', 'highKickR', 'lowKickR', 'sweepL', 'slide', 'flyKick', 'kneeR', 'tailSweep']);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const UPPER_BODY: ClipBone[] = ['spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'];
const _p = new THREE.Quaternion();
const _kick = new THREE.Quaternion();
const _lean = new THREE.Quaternion();

/** 이 거리(m)보다 멀면 외곽선을 끈다 (어차피 1픽셀도 안 되는 굵기라 티가 안 난다) */
const OUTLINE_FAR = 25;
/** 이 거리보다 멀면 그림자를 만들지 않는다 */
const SHADOW_FAR = 35;

export class PersonView implements CharacterView {
  readonly root = new THREE.Group();
  casual = true;
  private model: THREE.Object3D | null = null;
  private bones = new Map<ClipBone, THREE.Bone>();
  /** T포즈 월드 회전 (모델 기준) */
  private restWorld = new Map<ClipBone, THREE.Quaternion>();
  /**
   * 부모 쪽 계산용 (행렬 갱신 없이 회전만으로 계산해서 가볍게):
   * 가장 가까운 '움직이는 조상 뼈' a 와, a 기준 '실제 부모 노드'의 T포즈 상대 회전.
   * 조상이 없으면(골반) 실제 부모의 T포즈 월드 회전
   */
  private chain = new Map<ClipBone, { anc: ClipBone | null; rel: THREE.Quaternion }>();
  private posed = new Map<ClipBone, THREE.Quaternion>();
  private hipsRest = new THREE.Vector3();
  private lib: ClipLibrary | null = null;
  /** 지금 화면에 보이는 뼈별 변화량 (목표 쪽으로 부드럽게 따라가서 동작이 바뀔 때 자연스럽다) */
  private shown = new Map<ClipBone, THREE.Quaternion>();
  private target = new Map<ClipBone, THREE.Quaternion>();
  private hipsOff = new THREE.Vector3();
  private hipsShown = new THREE.Vector3();
  private heading = new Heading();
  private last = new THREE.Vector3(Number.NaN, 0, 0);
  private speed = 0;
  private phase = 0;
  private mat: THREE.MeshToonMaterial | null = null;
  /** 이 모델 다리 치수 (모델 축소 반영, root 크기 1 기준) */
  private legs: Legs | null = null;
  private gait: GaitSet | null = null;
  private bodyMeshes: THREE.Mesh[] = [];
  private outlineMeshes: THREE.Mesh[] = [];
  private near = true;
  private shadowNear = true;
  private skinName: string;
  private readonly defaultSkin: string;

  /**
   * @param variant 스킨 번호 (행인마다 다른 옷)
   * @param opts.skin 특정 스킨 (강도 등) / opts.tint 옷 색 덧칠 (경찰 제복)
   */
  constructor(readonly variant: number, opts: { skin?: string; tint?: number } = {}) {
    const n = PERSON_SKINS.length;
    const skinName = opts.skin ?? PERSON_SKINS[((variant % n) + n) % n];
    this.skinName = this.defaultSkin = skinName;
    void loadClipLibrary().then((lib) => (this.lib = lib));
    void loadModel().then((src) => {
      const model = SkeletonUtils.clone(src);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      const s = HEIGHT / Math.max(1e-3, box.max.y - box.min.y);
      model.scale.setScalar(s);
      model.position.y = -box.min.y * s;
      const mat = new THREE.MeshToonMaterial({ map: skin(this.skinName), gradientMap: toonGradient() });
      addRim(mat);
      this.mat = mat;
      if (opts.tint !== undefined) mat.color.set(opts.tint);
      model.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (mesh.isMesh) {
          mesh.material = mat;
          mesh.castShadow = true;
          // 화면 밖이면 그리지 않는다 (뼈 움직임이 크지 않아 기본 경계 상자로 충분)
          mesh.frustumCulled = true;
        }
      });
      model.updateMatrixWorld(true);
      const rootInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
      for (const b of CLIP_BONES) {
        const bone = model.getObjectByName(BONE[b]) as THREE.Bone | undefined;
        if (!bone) continue;
        this.bones.set(b, bone);
        this.restWorld.set(b, rootInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
        this.shown.set(b, new THREE.Quaternion());
        this.target.set(b, new THREE.Quaternion());
      }
      this.hipsRest.copy(this.bones.get('hips')!.position);
      // 다리 치수 (보폭 보정용). model 은 아직 부모가 없어서 월드 좌표 = 모델 좌표 (축소 포함)
      {
        const w = (b: ClipBone) => this.bones.get(b)?.getWorldPosition(new THREE.Vector3());
        const hp = w('hips'), up = w('leftUpperLeg'), kn = w('leftLowerLeg'), ft = w('leftFoot');
        if (hp && up && kn && ft) this.legs = { thigh: up.distanceTo(kn), shin: kn.distanceTo(ft), hipX: Math.abs(up.x - hp.x), hipsY: hp.y };
      }
      // 뼈마다 '움직이는 조상'과 상대 회전을 미리 계산
      const byNode = new Map<THREE.Object3D, ClipBone>();
      for (const [b, bone] of this.bones) byNode.set(bone, b);
      for (const [b, bone] of this.bones) {
        const parentRest = rootInv.clone().multiply(bone.parent!.getWorldQuaternion(new THREE.Quaternion()));
        let anc: ClipBone | null = null;
        for (let n = bone.parent; n && n !== model; n = n.parent) {
          const hit = byNode.get(n);
          if (hit) {
            anc = hit;
            break;
          }
        }
        const rel = anc ? this.restWorld.get(anc)!.clone().invert().multiply(parentRest) : parentRest;
        this.chain.set(b, { anc, rel });
        this.posed.set(b, new THREE.Quaternion());
      }
      // 외곽선 두께: 실제 1cm 쯤 (모델은 축소돼 있어서 축소 비율로 나눈 값)
      addOutline(model, 0.006);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (mesh.userData.isOutline ? this.outlineMeshes : this.bodyMeshes).push(mesh);
      });
      this.applyDetail();
      this.model = model;
      this.root.add(model);
    });
  }

  /** 카메라(주인공)와의 거리로 외곽선·그림자를 켜고 끈다. 멀리 있는 행인을 덜 그려서 가볍게 */
  setDistance(d: number) {
    const near = d < OUTLINE_FAR;
    const shadowNear = d < SHADOW_FAR;
    if (near === this.near && shadowNear === this.shadowNear) return;
    this.near = near;
    this.shadowNear = shadowNear;
    this.applyDetail();
  }

  private applyDetail() {
    for (const m of this.outlineMeshes) m.visible = this.near;
    for (const m of this.bodyMeshes) m.castShadow = this.shadowNear;
  }

  /** 옷 바꿔 입기 (null = 원래 옷). 로비에서 같은 모델 자리를 주민·강도가 번갈아 쓸 때 */
  setSkin(name: string | null) {
    const want = name ?? this.defaultSkin;
    if (want === this.skinName) return;
    this.skinName = want;
    if (this.mat) this.mat.map = skin(want);
  }

  /** 발차기는 모션캡처 클립이 없어서 다리를 직접 들어 올린다 */
  private proceduralKick(f: Fighter, fr: number, t: number) {
    const m = f.move!;
    const u = Math.min(1, fr / Math.max(1, totalFrames(m)));
    // 발생까지 들어 올렸다가 지속 동안 뻗고, 후딜 동안 내린다
    const up = Math.max(0, Math.min(1, fr < m.startup ? fr / m.startup : u < 0.85 ? 1 : (1 - u) / 0.15));
    const left = /L$/.test(m.anim);
    const low = m.level === 'low';
    const lift = (low ? 0.7 : m.level === 'high' ? 1.6 : 1.25) * up;
    // 바탕은 서 있는 자세 (T포즈에서 시작하면 팔이 벌어진다)
    const idle = this.lib!.clips.idle;
    if (idle) sampleClip(idle, this.lib!.fps, (t / 60) % idle.duration, true, this.target, this.hipsOff);
    else for (const q of this.target.values()) q.identity();
    // 그 위에: 차는 다리를 앞으로 들어 올리고 (변화량끼리 곱한다: 들기 × 서 있기)
    const kick = _kick.setFromAxisAngle(X_AXIS, -lift);
    const leg: ClipBone[] = left ? ['leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes'] : ['rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'];
    for (const b of leg) this.target.get(b)?.premultiply(kick);
    // 몸을 살짝 뒤로 젖혀 균형, 팔은 가드처럼 조금 올린다
    const lean = _lean.setFromAxisAngle(X_AXIS, lift * 0.18);
    for (const b of UPPER_BODY) this.target.get(b)?.premultiply(lean);
    this.hipsOff.y += low ? -0.12 * up : 0;
  }

  /** 클립 라이브러리에 없는 상태 → 대체 클립 */
  private choose(f: Fighter, fr: number, t: number): ClipChoice | null {
    const lib = this.lib!;
    const c = lib.clips;
    switch (f.state) {
      case 'launched':
      case 'knockdown':
      case 'ko':
        return c.knockback ? { key: 'knockback', time: c.knockback.duration * Math.min(1, (f.state === 'launched' ? fr : fr + 20) / 40), loop: false } : null;
      case 'blockstun':
        return c.hitChest ? { key: 'hitChest', time: c.hitChest.duration * 0.3, loop: false } : null;
      case 'dash':
      case 'backdash':
      case 'walkF':
      case 'walkB':
        return c.jog ? { key: 'jog', time: ((((this.phase + (this.gait?.jog?.offset ?? 0)) % 1) + 1) % 1) * c.jog.duration, loop: true } : null;
      case 'idle':
        return c.idle ? { key: 'idle', time: (t / 60) % c.idle.duration, loop: true } : null;
      case 'attack': {
        const got = chooseClip(lib, f, fr, this.phase, t, { casual: true, speed: this.speed / 60, gait: this.gait });
        if (got) return got;
        // 클립이 없는 주먹 기술: 왼손 = 잽, 어퍼·훅 계열 = 훅, 나머지 = 크로스 (히트 프레임에 맞춰 재생)
        const m = f.move;
        const key = !m ? 'idle' : /L$/.test(m.anim) ? 'jab' : /uppercut|bodyBlow|claw|smash|charge/.test(m.anim) ? 'hook' : 'cross';
        const clip = c[key];
        if (!m || !clip) return null;
        const total = totalFrames(m);
        const time =
          fr < m.startup ? clip.impact * (fr / m.startup) : clip.impact + (clip.duration - clip.impact) * Math.min(1, (fr - m.startup) / Math.max(1, total - m.startup));
        return { key, time, loop: false };
      }
      default:
        return chooseClip(lib, f, fr, this.phase, t, { casual: true, speed: this.speed / 60, gait: this.gait });
    }
  }

  /** 멀리 있으면 3프레임에 한 번만 자세를 계산한다 (위치·방향은 매번) */
  private tick = 0;

  /** @param far 카메라에서 멀리 있음 → 자세 계산을 줄인다 */
  update(f: Fighter, c: FrameClock, far = false) {
    const lp = f.lerped(c.alpha);
    this.root.position.set(lp.x, lp.y, lp.z);
    if (!Number.isNaN(this.last.x) && c.dt > 0) {
      const d = Math.hypot(lp.x - this.last.x, lp.z - this.last.z);
      this.speed += (Math.min(d / c.dt, 12) - this.speed) * Math.min(1, c.dt * 8);
      // 걸음 주기: 클립에서 잰 보폭 (모델 크기만큼 늘려서) — 딛은 발이 미끄러지지 않게.
      // 아직 못 쟀으면 예전 값 (걷기 1.35m, 달리기 1.7m)
      if (!this.gait && this.lib && this.legs) this.gait = measureGaits(this.lib, this.legs);
      const stride = this.gait && strideFor(this.gait, this.speed / 60, true);
      this.phase += d / (stride ? stride * this.root.scale.x : this.speed > 3.2 ? 1.7 : 1.35);
    }
    this.last.set(lp.x, 0, lp.z);
    const { yaw } = this.heading.update(Math.atan2(lp.fx, lp.fz), c.dt, f.state === 'attack', this.speed / 60);
    this.root.rotation.y = yaw;

    if (!this.model || !this.lib) return;
    if (far && ++this.tick % 3 !== 0) return;
    const fr = Math.max(0, f.frame + c.sub);
    // 목표 변화량: 발차기는 직접, 나머지는 모션캡처 클립
    const m = f.move;
    if (f.state === 'attack' && m && KICK_ANIMS.has(m.anim)) this.proceduralKick(f, fr, c.t);
    else {
      // 맞는 클립이 없으면 T포즈가 되지 않게 편히 선 자세로
      const ch = this.choose(f, fr, c.t) ?? (this.lib.clips.idle ? { key: 'idle', time: (c.t / 60) % this.lib.clips.idle.duration, loop: true } : null);
      const clip = ch ? this.lib.clips[ch.key] : undefined;
      if (ch && clip) sampleChoice(this.lib, ch, this.target, this.hipsOff);
    }
    // 부드럽게 따라가기 (공격·피격은 빠르게)
    const quick = f.state === 'attack' || f.state === 'hitstun' || f.state === 'launched';
    const k = 1 - Math.pow(1 - (quick ? 0.5 : 0.22), Math.max(0.5, c.dt * 60));
    for (const [b, q] of this.shown) {
      const tq = this.target.get(b);
      if (tq) q.slerp(tq, k);
    }
    this.hipsShown.lerp(this.hipsOff, k);
    this.apply();
  }

  /** 변화량을 뼈에 입힌다: 새 월드 = D × T포즈 월드 → 부모 기준 로컬 */
  private apply() {
    // 조상 → 자손 순서 (CLIP_BONES 순서가 그렇다). 행렬은 그릴 때 three 가 한 번만 갱신한다
    for (const b of CLIP_BONES) {
      const bone = this.bones.get(b);
      const D = this.shown.get(b);
      const rest = this.restWorld.get(b);
      const ch = this.chain.get(b);
      const out = this.posed.get(b);
      if (!bone || !D || !rest || !ch || !out) continue;
      out.copy(D).multiply(rest); // 새 월드 회전 (모델 기준)
      const parentWorld = ch.anc ? _p.copy(this.posed.get(ch.anc)!).multiply(ch.rel) : _p.copy(ch.rel);
      bone.quaternion.copy(parentWorld.invert()).multiply(out);
    }
    // 골반 높이·위치 변화 (골반 높이 비율)
    const hips = this.bones.get('hips')!;
    hips.position.copy(this.hipsRest).addScaledVector(this.hipsShown, this.hipsRest.y);
  }
}
