import * as THREE from 'three';
import { addOutline, setupMToonRim, updateMToonRim, type MToonRim } from './lookFx';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Fighter } from '../core/fighter';
import { smooth, type FrameClock } from './clock';
import { track } from './loadTracker';
import { OutfitDresser, keepFieldOutline } from './outfitKit';
import {
  CLIP_BONES,
  CLIP_PARENTS,
  WALK_SPEED_MAX,
  chooseClip,
  loadClipLibrary,
  measureGaits,
  sampleChoice,
  strideFor,
  type ClipBone,
  type ClipChoice,
  type ClipLibrary,
  type GaitSet,
} from './clips';
import {
  Heading,
  Locomotion,
  Mannequin,
  PoseSpring,
  attackBoost,
  poseFor,
  type Appearance,
  type CharacterView,
  type HeroinePalette,
  type RestPose,
} from './mannequin';

/** 같은 파일을 여러 캐릭터가 쓰면 다운로드는 한 번만 */
const buffers = new Map<string, Promise<ArrayBuffer>>();

/** 게임 메뉴에 있을 때 주인공 모델을 미리 받아 둔다 (들어가자마자 바로 보이게) */
export function preloadVrm(url: string) {
  void fetchBuffer(url).catch(() => {});
}

function fetchBuffer(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.arrayBuffer();
    });
    buffers.set(url, p);
  }
  return p;
}

async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(await fetchBuffer(url), '');
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x 는 -Z 를 보므로 1.0 과 같게 +Z 로
  if (vrm.meta?.metaVersion === '0') tameVroid0(vrm);
  vrm.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // 스킨 메시는 경계 상자가 정확하지 않아 가끔 사라지는 것 방지
    }
  });
  return vrm;
}

/**
 * 옛 VRoid(0.x) 샘플 재질 다듬기: 옷의 반사 그림(matcap)이 검은 바지에 금색 광택으로 번져서
 * 다리를 들면 허벅지가 금색 덩어리처럼 보인다 → 옷 광택만 끈다 (안쪽 보라 머리는 원래 디자인)
 */
function tameVroid0(vrm: VRM) {
  const seen = new Set<THREE.Material>();
  vrm.scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const mt = m as THREE.Material & { isMToonMaterial?: boolean; matcapFactor?: THREE.Color };
      if (!mt.isMToonMaterial || seen.has(m)) continue;
      seen.add(m);
      if (/_CLOTH/.test(m.name)) mt.matcapFactor?.setScalar(0);
    }
  });
}

/** T포즈(정규화 포즈)에서 팔을 몸 옆으로 내리는 각도 */
const ARM_HANG = 1.3;
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const;

// 매 프레임 쓰는 임시 값 (새로 만들지 않고 재사용해서 메모리 정리로 끊기는 일을 줄인다)
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _axL = new THREE.Vector3();
const _axR = new THREE.Vector3();

/** 절차적 포즈가 직접 움직이지 않는 뼈. 매 프레임 기본 자세로 돌려서 클립이 끝난 뒤 자세가 남지 않게 */
const UNDRIVEN: VRMHumanBoneName[] = ['upperChest', 'neck', 'leftShoulder', 'rightShoulder', 'leftHand', 'rightHand', 'leftToes', 'rightToes'];

/** 소파 자세 한 장: 골반의 월드 위치, 몸 방향(YXZ), 뼈 회전, 표정 */
interface SofaPose {
  hx: number;
  hy: number;
  hz: number;
  rx: number;
  ry: number;
  rz: number;
  bones: Map<VRMHumanBoneName, THREE.Quaternion>;
  phone: number;
  blink: number;
  aa: number;
  happy: number;
  /** 서서 하는 동작 (1): 골반은 서 있는 높이 + hy 만큼 (뛰기) */
  stand: number;
  /** 오른손에 마이크 */
  mic: number;
}

const SOFA_BONES: VRMHumanBoneName[] = [
  'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
];

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** 오른손 마이크를 입 앞으로: 팔을 앞으로 들고 팔꿈치를 접는다 */
function micArm(arm: (side: 'left' | 'right', sh: number, el: number, ar: number, tw?: number) => void, wob: number) {
  arm('right', -1.3 + wob, -2.4, 0.06, -0.35);
}

/**
 * 소파 동작별 자세. f = 그 동작을 시작하고 지난 프레임 (반복 동작용).
 * 앉은 자세들은 TV 를 보고(sit), 옆으로 눕기는 서쪽 팔걸이에 머리를 괴고 TV 쪽을 본다(lie)
 */
function sofaPose(act: string, f: number, r: RestPose): SofaPose {
  const bones = new Map<VRMHumanBoneName, THREE.Quaternion>();
  const P: SofaPose = { hx: r.sit.x, hy: r.seatY ?? 0.45, hz: r.sit.z, rx: 0, ry: r.sit.yaw, rz: 0, bones, phone: 0, blink: 0, aa: 0, happy: 0, stand: 0, mic: 0 };
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  const arm = (side: 'left' | 'right', sh: number, el: number, ar: number, tw = 0) => {
    const hang = ARM_HANG - ar;
    const L = side === 'left';
    bones.set(L ? 'leftUpperArm' : 'rightUpperArm', q(sh, tw, L ? -hang : hang));
    const ax = L ? new THREE.Vector3(Math.cos(hang), Math.sin(hang), 0) : new THREE.Vector3(Math.cos(hang), -Math.sin(hang), 0);
    bones.set(L ? 'leftLowerArm' : 'rightLowerArm', new THREE.Quaternion().setFromAxisAngle(ax, el));
  };
  const leg = (side: 'left' | 'right', hip: number, knee: number, ab = 0.05, foot = 0) => {
    const L = side === 'left';
    bones.set(L ? 'leftUpperLeg' : 'rightUpperLeg', q(hip, 0, L ? ab : -ab));
    bones.set(L ? 'leftLowerLeg' : 'rightLowerLeg', q(knee));
    bones.set(L ? 'leftFoot' : 'rightFoot', q(foot));
  };
  const breathe = Math.sin(f * 0.06) * 0.03;
  // 기본: 바르게 앉아 두 손은 무릎 위
  for (const n of ['upperChest', 'neck', 'leftHand', 'rightHand'] as const) bones.set(n, q(0));
  bones.set('spine', q(0.06));
  bones.set('chest', q(breathe));
  bones.set('head', q(0.05));
  // 허벅지는 좌석 위에 수평, 종아리는 소파 앞으로 수직 (쿠션·몸통을 뚫지 않게)
  leg('left', -1.55, 1.5);
  leg('right', -1.55, 1.5);
  arm('left', -0.5, -0.95, -0.05);
  arm('right', -0.5, -0.95, -0.05);

  switch (act) {
    case 'relax': {
      // 등받이에 푹 기대 두 팔을 등받이 위에 걸치고 다리를 쭉 뻗는다
      P.rx = -0.32;
      P.hz -= 0.06; // 엉덩이를 앞으로 빼고 기댄다 (등이 쿠션에 묻히지 않게)
      bones.set('spine', q(-0.05));
      bones.set('head', q(0.28 + breathe * 0.5));
      leg('left', -1.22, 1.2, 0.16, 0.1);
      leg('right', -1.28, 1.3, 0.12, 0.1);
      arm('left', 0.85, -0.35, 0.72);
      arm('right', 0.85, -0.35, 0.72);
      break;
    }
    case 'phone': {
      // 고개를 숙이고 두 손으로 휴대폰. 가끔 엄지로 넘기며 고개를 까딱
      P.phone = 1;
      bones.set('chest', q(0.12 + breathe));
      bones.set('head', q(0.5 + Math.sin(f * 0.025) * 0.05, Math.sin(f * 0.011) * 0.1));
      arm('left', -0.7, -1.95, -0.5);
      arm('right', -0.75, -1.9 + Math.max(0, Math.sin(f * 0.2)) * 0.12, -0.5);
      leg('left', -1.55, 1.45, 0.03);
      leg('right', -1.62, 1.5, -0.1); // 다리를 살짝 꼰 듯이
      break;
    }
    case 'doze': {
      // 기대앉아 꾸벅꾸벅: 고개가 천천히 떨어졌다 퍼뜩 든다
      P.rx = -0.22;
      P.hz -= 0.03;
      P.blink = 1;
      const c = (f % 260) / 260;
      const nod = c < 0.85 ? smoothstep(0, 0.85, c) : 1 - smoothstep(0.85, 0.9, c);
      bones.set('head', q(0.15 + nod * 0.55, 0, nod * 0.18));
      bones.set('chest', q(0.05 + breathe * 1.5));
      leg('left', -1.35, 1.25, 0.1);
      leg('right', -1.35, 1.25, 0.1);
      arm('left', -0.15, -0.75, -0.3);
      arm('right', -0.15, -0.75, -0.3);
      break;
    }
    case 'cheer': {
      // TV 보며 응원: 박수 치다가 두 팔 번쩍 "와!"
      const c = f % 130;
      const up = smoothstep(80, 90, c) * (1 - smoothstep(118, 130, c));
      const clap = 0.5 + 0.5 * Math.sin(f * 0.55);
      P.happy = 1;
      P.aa = up * 0.8;
      P.rx = 0.08;
      P.hy += up * 0.04 + clap * 0.008;
      bones.set('head', q(-0.05 - up * 0.2));
      const sh = -1.15 + (-2.7 + 1.15) * up;
      const ar = -0.32 + clap * 0.25 * (1 - up) + up * 0.55;
      arm('left', sh, -0.55 + up * 0.3, ar);
      arm('right', sh, -0.55 + up * 0.3, ar);
      leg('left', -1.65, 1.6 - up * 0.3);
      leg('right', -1.65, 1.6 - up * 0.3);
      break;
    }
    case 'stretch': {
      // 기지개: 두 팔을 머리 위로 쭉, 다리도 쭉 폈다가 돌아온다 (약 3초)
      const u = smoothstep(0, 45, f) * (1 - smoothstep(130, 175, f));
      P.rx = -0.12 * u;
      P.blink = u > 0.6 ? 1 : 0;
      P.aa = u * 0.5;
      bones.set('chest', q(-0.18 * u + breathe));
      bones.set('head', q(0.05 - 0.35 * u));
      const lerp = (a: number, b: number) => a + (b - a) * u;
      arm('left', lerp(-0.5, -2.95), lerp(-0.95, -0.12), lerp(-0.05, 0.12));
      arm('right', lerp(-0.5, -2.95), lerp(-0.95, -0.12), lerp(-0.05, 0.12));
      leg('left', lerp(-1.55, -1.45), lerp(1.5, 0.35), 0.05, 0.5 * u);
      leg('right', lerp(-1.55, -1.45), lerp(1.5, 0.35), 0.05, 0.5 * u);
      break;
    }
    case 'kSit': {
      // 소파에 앉아 마이크를 입에 대고 부른다: 몸을 박자에 맞춰 좌우로, 왼손은 무릎에서 까딱
      P.mic = 1;
      P.happy = 0.4;
      P.aa = 0.25 + 0.45 * Math.max(0, Math.sin(f * 0.21));
      const beat = Math.sin(f * 0.105);
      P.rz = beat * 0.05;
      bones.set('chest', q(0.04 + breathe, beat * 0.06));
      bones.set('head', q(-0.08, beat * 0.1, beat * 0.08));
      micArm(arm, 0);
      arm('left', -0.55 + Math.max(0, beat) * 0.15, -0.95, -0.02);
      leg('left', -1.55, 1.5 - Math.max(0, beat) * 0.12);
      leg('right', -1.55, 1.5 - Math.max(0, -beat) * 0.12);
      break;
    }
    case 'kTamb': {
      // 앉아서 탬버린: 오른손을 머리 옆으로 들고 흔들며, 왼손으로 '착!' 친다
      P.happy = 1;
      P.aa = 0.3;
      const c = f % 40;
      const hit = c < 6 ? 1 - c / 6 : 0;
      const shake = Math.sin(f * 0.9) * 0.18;
      bones.set('head', q(-0.05, Math.sin(f * 0.1) * 0.12));
      arm('right', -2.0 + shake * 0.4, -0.9, 0.35 + shake);
      arm('left', -1.4 + hit * 0.4, -0.7 - hit * 0.5, -0.1);
      leg('left', -1.6, 1.55);
      leg('right', -1.6, 1.55);
      break;
    }
    case 'kStand':
    case 'kHype':
    case 'kDance': {
      // 서서 부르기: 화면 앞에서 마이크를 입에 대고. 신나게 = 박자에 맞춰 뛰며 왼주먹을 번쩍,
      // 춤추며 = 엉덩이를 흔들며 좌우로 스텝
      const st = r.stand ?? r.sit;
      P.hx = st.x;
      P.hz = st.z;
      P.ry = st.yaw;
      P.stand = 1;
      P.hy = 0;
      P.mic = 1;
      P.aa = 0.3 + 0.5 * Math.max(0, Math.sin(f * 0.21));
      for (const n of ['spine', 'chest'] as const) bones.set(n, q(0));
      leg('left', 0, 0.04, 0.07, 0);
      leg('right', 0, 0.04, 0.07, 0);
      micArm(arm, 0);
      if (act === 'kStand') {
        // 왼손은 천천히 앞으로 뻗었다 가슴으로 (감정 잡기)
        const sway = Math.sin(f * 0.05);
        P.rz = sway * 0.04;
        P.happy = 0.3;
        P.blink = Math.sin(f * 0.02) > 0.7 ? 1 : 0;
        bones.set('chest', q(breathe, sway * 0.08));
        bones.set('head', q(-0.12, sway * 0.12, sway * 0.06));
        const reach = 0.5 + 0.5 * Math.sin(f * 0.03);
        arm('left', -0.4 - reach * 0.9, -0.3 - (1 - reach) * 1.2, 0.15 + reach * 0.3);
      } else if (act === 'kHype') {
        // 박자마다 콩콩 뛰고, 착지할 때 무릎을 굽힌다. 왼주먹은 하늘로
        const ph = (f % 30) / 30;
        const hop = Math.sin(ph * Math.PI);
        P.hy = hop * 0.13 - (1 - hop) * 0.05;
        P.happy = 1;
        P.aa = 0.6 + hop * 0.35;
        bones.set('chest', q(-0.1 * hop));
        bones.set('head', q(-0.2 + (1 - hop) * 0.25));
        leg('left', -0.35 * (1 - hop), 0.6 * (1 - hop) + 0.05, 0.12, 0.2 * hop);
        leg('right', -0.35 * (1 - hop), 0.6 * (1 - hop) + 0.05, 0.12, 0.2 * hop);
        arm('left', -2.9 + (1 - hop) * 0.5, -0.15 - (1 - hop) * 0.4, 0.1);
      } else {
        // 엉덩이를 좌우로 흔들며 옆으로 한 발씩, 왼팔은 크게 흔든다
        const sw = Math.sin(f * 0.11);
        P.hx += Math.cos(st.yaw) * sw * 0.12;
        P.hz -= Math.sin(st.yaw) * sw * 0.12;
        P.hy = -0.04 + Math.abs(sw) * 0.02;
        P.rz = -sw * 0.12;
        P.happy = 1;
        bones.set('spine', q(0, 0, sw * 0.15));
        bones.set('chest', q(0.02, sw * 0.15, -sw * 0.1));
        bones.set('head', q(-0.08, -sw * 0.15, sw * 0.12));
        leg('left', -0.15 - Math.max(0, sw) * 0.2, 0.25 + Math.max(0, sw) * 0.35, 0.14);
        leg('right', -0.15 - Math.max(0, -sw) * 0.2, 0.25 + Math.max(0, -sw) * 0.35, 0.14);
        arm('left', -0.6 + sw * 0.9, -0.5, 0.45 + Math.abs(sw) * 0.4);
      }
      break;
    }
    case 'lounge': {
      // 옆으로 누워 팔걸이에 팔을 괴고 TV 보기 (침대처럼 바로 눕지 않는다)
      P.hx = r.lie.x;
      P.hy = r.lie.y;
      P.hz = r.lie.z;
      P.ry = r.lie.yaw;
      P.rz = -(Math.PI / 2 - 0.32);
      bones.set('spine', q(0.12));
      bones.set('chest', q(0.04 + breathe));
      bones.set('head', q(0.1, 0, 0.3));
      leg('left', -0.7, 1.25, 0.02, 0.3);
      leg('right', -0.95, 1.05, -0.02, 0.3);
      arm('left', -0.25, -2.3, 2.35);
      arm('right', -0.15, -0.3, -0.2 + Math.sin(f * 0.02) * 0.03);
      break;
    }
  }
  return P;
}

/**
 * VRM 3D 모델 캐릭터. 기존 절차적 포즈(poseFor)를 VRM 표준 휴머노이드 뼈대에 옮겨서
 * 같은 기술 모션·판정을 그대로 쓴다. 로딩 중에는 절차적 모델(fallback)을 보여준다.
 *
 * 그 위에 모션캡처 클립(달리기·펀치·피격 등)이 있는 상태는 클립으로 덮어쓴다 (하이브리드).
 * 클립이 없는 기술(발차기·어퍼·대시·횡이동)은 절차적 포즈 그대로.
 */
export class VrmCharacter implements CharacterView {
  readonly root = new THREE.Group();
  casual = false;
  rest: RestPose | null = null;
  /** 두 손으로 낚싯대를 쥔 자세 (pitch = 대를 든 각도 rad). null = 안 쥠 */
  hold: { pitch: number } | null = null;
  private holdW = 0;
  private holdPitch = 0.5;
  private fallback: Mannequin;
  /** 앉아서 휴대폰 보기·쳐다보기 섞는 정도 (부드럽게) */
  private phoneW = 0;
  private lookW = 0;
  private lookYaw = 0;
  private phoneMesh: THREE.Group | null = null;
  /** 노래방 마이크 (노래 부를 때만 보인다): 오른손에 쥔다 */
  private micMesh: THREE.Group | null = null;
  /** 소파 동작 중 표정 (눈 감기·입 벌림·웃음) */
  private sofaFace: { blink: number; aa: number; happy: number } | null = null;
  /** VRM 을 못 불러와서 상자 인형으로 대신하는 중 */
  private failed = false;
  private vrm: VRM | null = null;
  /**
   * VRM 0.x 모델 (VRoid 샘플 등): 모델 자체가 -Z 를 본다. 자세 계산은 1.0 기준(+Z)으로 하고,
   * 모델에 넘기기 직전에만 0.x 방향으로 바꾼다 (뼈 회전 x·z 부호 반대, 몸 방향 180°).
   */
  private v0 = false;
  /** 모델을 다 불러왔다 (실패해서 상자 인형을 쓰게 된 것도 포함) */
  get loaded() {
    return !!this.vrm || this.failed;
  }
  private disposed = false;
  private spring = new PoseSpring();
  private heading = new Heading();
  private loco = new Locomotion();
  private rig = { thigh: 0.42, shin: 0.42, hipsY: 0.85, hipX: 0.09 };
  /** 이 모델 다리 길이로 잰 걷기·달리기 보폭 (클립·모델 둘 다 불러온 뒤 한 번 계산) */
  private gait: GaitSet | null = null;
  /** 림 라이트를 넣을 MToon 재질들 */
  private rims: MToonRim[] = [];
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private blinkSeed = Math.floor(Math.random() * 200);
  /** 코디 (모델을 불러오기 전에 정해지면 기다렸다 입힌다) */
  private dresser: OutfitDresser | null = null;
  private outfit: string[] = [];

  // 모션캡처 클립 재생 상태
  private lib: ClipLibrary | null = null;
  /** 0 = 절차적 포즈, 1 = 클립 */
  private clipW = 0;
  private lastChoice: ClipChoice | null = null;
  private parentOf = new Map<ClipBone, ClipBone>();
  private deltas = new Map<ClipBone, THREE.Quaternion>();
  private hipsOff = new THREE.Vector3();
  private hipsRest = new THREE.Vector3();
  /** 클립끼리 바뀔 때 직전 화면 자세에서 짧게 이어주기 */
  private xfade = 1;
  private snap = new Map<ClipBone, THREE.Quaternion>();
  private prevFinal = new Map<ClipBone, THREE.Quaternion>();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();

  constructor(url: string, fallback: HeroinePalette, tint?: number) {
    // 상자 인형은 VRM 을 못 불러왔을 때만 쓴다 (불러오는 동안 상자 몸이 비치지 않게 아무것도 안 보인다)
    this.fallback = new Mannequin({ kind: 'heroine', palette: fallback });
    loadClipLibrary().then((lib) => (this.lib = lib));
    track(loadVrm(url))
      .then((vrm) => {
        if (this.disposed) VRMUtils.deepDispose(vrm.scene);
        else this.attach(vrm, tint);
      })
      .catch((e) => {
        console.warn('VRM 로딩 실패, 기본 모델을 씁니다:', e);
        this.failed = true;
        this.root.add(this.fallback.root);
      });
  }

  update(f: Fighter, c: FrameClock) {
    const vrm = this.vrm;
    if (!vrm) {
      if (this.failed) this.fallback.update(f, c);
      return;
    }

    const t = c.t;
    const lp = f.lerped(c.alpha);
    if (!this.gait && this.lib) this.gait = measureGaits(this.lib, this.rig);
    const prevSpeed = Math.hypot(this.loco.fwd, this.loco.lat);
    // 한 주기(두 걸음)에 나아가는 거리: 달리기는 클립에서 잰 보폭 (딛은 발이 미끄러지지 않게), 철권 스텝 0.8m
    const runStride = (this.gait && strideFor(this.gait, prevSpeed, this.casual)) ?? (this.casual && prevSpeed < WALK_SPEED_MAX ? 1.35 : 1.7);
    this.loco.update(lp, c.dt, f.state === 'run' ? runStride : 0.8);
    const target = poseFor(f, t, c.sub, this.loco);
    // 관절별 스프링: 골반 → 몸통 → 팔 순으로 시차를 두고 따라와 사람 같은 무게감
    const p = this.spring.step(target, c.dt, attackBoost(f));
    const speed = Math.hypot(this.loco.fwd, this.loco.lat);
    const { yaw, bank } = this.heading.update(Math.atan2(lp.fx, lp.fz), c.dt, f.state === 'attack', speed);
    const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);

    vrm.scene.position.set(lp.x, lp.y, lp.z);
    vrm.scene.rotation.y = yaw;

    // 골반 높이: 다리 각도로 발이 바닥에 닿는 높이를 계산 (누우면 바닥 가까이)
    const { thigh, shin, hipsY } = this.rig;
    const ext = (hp: number, kn: number, ab: number) => (thigh * Math.cos(hp) + shin * Math.cos(hp + kn)) * Math.cos(ab);
    const grounded = hipsY - (thigh + shin - Math.max(ext(p.hpL, p.knL, p.abL), ext(p.hpR, p.knR, p.abR)));
    const hips = bone('hips')!;
    hips.position.y = grounded * (1 - p.drop) + 0.12 * p.drop;
    hips.rotation.set(p.tilt, p.hipYaw, p.roll + bank);

    // 상체: 숙임·비틀기를 척추와 가슴에 나눠서
    // 어깨의 전체 회전(twist) 중 골반이 돈 만큼을 빼고 척추·가슴에 나눈다
    const upper = p.twist - p.hipYaw;
    bone('spine')?.rotation.set(p.lean * 0.5, upper * 0.5, 0);
    bone('chest')?.rotation.set(p.lean * 0.5, upper * 0.5, 0);
    bone('head')?.rotation.set(-p.lean * 0.4, -p.twist * 0.7, 0); // 시선은 상대 쪽 유지

    // 팔: T포즈에서 내린 뒤 앞뒤로 휘두름. 팔꿈치는 '내린 팔' 기준 축으로 굽힌다
    const e = _e;
    // 팔 벌림(ar): 내리는 각도를 줄이면 바깥으로, 늘리면 몸통 쪽으로 붙는다
    const hangL = ARM_HANG - p.arL;
    const hangR = ARM_HANG - p.arR;
    bone('leftUpperArm')?.quaternion.setFromEuler(e.set(p.shL, 0, -hangL, 'XYZ'));
    bone('rightUpperArm')?.quaternion.setFromEuler(e.set(p.shR, 0, hangR, 'XYZ'));
    const axL = _axL.set(Math.cos(hangL), Math.sin(hangL), 0);
    const axR = _axR.set(Math.cos(hangR), -Math.sin(hangR), 0);
    bone('leftLowerArm')?.quaternion.setFromAxisAngle(axL, p.elL);
    bone('rightLowerArm')?.quaternion.setFromAxisAngle(axR, p.elR);

    // 다리 (정규화 포즈에서 이미 아래로 뻗어 있음). 발은 바닥과 대략 평행하게
    bone('leftUpperLeg')?.rotation.set(p.hpL, 0, p.abL);
    bone('leftLowerLeg')?.rotation.set(p.knL, 0, 0);
    bone('rightUpperLeg')?.rotation.set(p.hpR, 0, -p.abR);
    bone('rightLowerLeg')?.rotation.set(p.knR, 0, 0);
    const foot = (hp: number, kn: number) => {
      const flat = -(hp + kn) * 0.7;
      const lifted = Math.min(1, Math.max(0, (-hp - 0.7) / 0.5)); // 허벅지를 40°→70° 들수록 발끝을 편다
      return flat + (0.45 - flat) * lifted;
    };
    bone('leftFoot')?.rotation.set(foot(p.hpL, p.knL), 0, 0);
    bone('rightFoot')?.rotation.set(foot(p.hpR, p.knR), 0, 0);

    this.applyClip(f, c, vrm);
    vrm.scene.rotation.order = 'YXZ';
    vrm.scene.rotation.x = 0;
    vrm.scene.rotation.z = 0;
    this.sofaFace = null;
    if (this.micMesh) this.micMesh.visible = false;
    if (this.rest && this.rest.t > 0) {
      if (this.rest.sofa) this.applySofa(vrm, this.rest, lp, yaw);
      else this.applyRest(vrm, this.rest, lp, yaw, t);
    }
    this.applyHold(vrm, c.dt);

    // 표정
    const em = vrm.expressionManager;
    if (em) {
      const hurt = f.state === 'hitstun' || f.state === 'launched';
      const down = f.state === 'knockdown' || f.state === 'ko';
      const blink = (t + this.blinkSeed) % 230 < 6;
      const sf = this.sofaFace as VrmCharacter['sofaFace']; // applySofa 가 바꿨을 수 있다
      const asleep = sf ? sf.blink > 0.5 : !!this.rest && this.rest.t > 0.85;
      em.setValue('blink', hurt || down || blink || asleep ? 1 : 0);
      em.setValue('angry', f.state === 'attack' ? 0.7 : 0);
      em.setValue('aa', f.state === 'attack' && f.isInActiveFrames() ? 0.6 : hurt ? 0.5 : (sf?.aa ?? 0));
      em.setValue('happy', sf?.happy ?? 0);
    }

    updateMToonRim(this.rims);

    // 순간이동(라운드 리셋·부활)이면 머리카락/옷 물리가 튀지 않게 리셋
    const moved = vrm.scene.position.distanceTo(this.lastPos);
    this.lastPos.copy(vrm.scene.position);
    // 머리카락·옷 물리는 실제 흐른 시간으로 (탭 전환 등 큰 공백은 잘라냄)
    if (this.v0) {
      // 화면에 보이는 몸 방향: (rx, ry, rz) 다음에 모델을 180° 돌린 것과 같다
      const r = vrm.scene.rotation;
      r.set(-r.x, r.y + Math.PI, -r.z, 'YXZ');
      this.flipV0(vrm);
    }
    vrm.update(Math.min(c.dt, 1 / 20));
    // 다음 프레임 계산은 다시 1.0 기준 값에서 이어간다
    if (this.v0) this.flipV0(vrm);
    if (moved > 1) vrm.springBoneManager?.reset();
  }

  /** 1.0 기준 자세 ↔ 0.x 모델 자세 (두 번 하면 원래대로): 모든 정규화 뼈 회전의 x·z, 골반 위치의 x·z 부호를 뒤집는다 */
  private flipV0(vrm: VRM) {
    for (const b of Object.values(vrm.humanoid.normalizedHumanBones)) {
      const n = b?.node;
      if (!n) continue;
      n.quaternion.x = -n.quaternion.x;
      n.quaternion.z = -n.quaternion.z;
    }
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
      hips.position.x = -hips.position.x;
      hips.position.z = -hips.position.z;
    }
  }

  /**
   * 소파: 서 있다가 앉고(r.t 0→1), 앉은 뒤엔 동작(기대앉기·옆으로 눕기·휴대폰·기지개·응원·졸기) 사이를 부드럽게 넘어간다.
   * 골반을 중심으로 몸을 돌려서 눕거나 기대도 자연스럽게 이어진다.
   */
  private applySofa(vrm: VRM, r: RestPose, lp: { x: number; y: number; z: number }, yaw: number) {
    const s = r.sofa!;
    const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
    const ease = (u: number) => u * u * (3 - 2 * u);
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const lerpAng = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
    const A = sofaPose(s.prev, s.pt, r);
    const B = sofaPose(s.act, s.at, r);
    const k = ease(Math.min(1, Math.max(0, s.k)));
    // 서 있는 자세 → 소파 자세 (몸 위치·방향), 뼈는 조금 먼저 따라간다
    const u = ease(Math.min(1, r.t));
    const wb = Math.min(1, r.t * 1.6);
    const hips = bone('hips')!;
    const standHy = hips.position.y;
    // 서서 하는 동작은 골반을 서 있는 높이로 (hy 는 뛰는 만큼만 더한다)
    const hyOf = (P: SofaPose) => (P.stand ? lp.y + standHy + P.hy : P.hy);
    const hipLocal = (P: SofaPose) => (P.stand ? standHy : this.rig.hipsY);
    const hx = lerp(lp.x, lerp(A.hx, B.hx, k), u);
    const hy = lerp(lp.y + standHy, lerp(hyOf(A), hyOf(B), k), u);
    const hz = lerp(lp.z, lerp(A.hz, B.hz, k), u);
    const ry = lerpAng(yaw, lerpAng(A.ry, B.ry, k), Math.min(1, u * 1.4));
    const rx = lerp(A.rx, B.rx, k) * u;
    const rz = lerp(A.rz, B.rz, k) * u;
    vrm.scene.rotation.set(rx, ry, rz, 'YXZ');
    // 골반이 (hx,hy,hz) 에 오도록 장면 루트 위치를 거꾸로 계산
    hips.position.y = lerp(standHy, lerp(hipLocal(A), hipLocal(B), k), wb);
    hips.quaternion.slerp(this.tmpQ.identity(), wb);
    const off = this.tmpV.set(hips.position.x, hips.position.y, hips.position.z).applyEuler(vrm.scene.rotation);
    vrm.scene.position.set(hx - off.x, hy - off.y, hz - off.z);
    const q = _q;
    for (const n of SOFA_BONES) {
      const a = A.bones.get(n);
      const b = B.bones.get(n);
      if (!a || !b) continue;
      bone(n)?.quaternion.slerp(q.copy(a).slerp(b, k), wb);
    }
    this.phoneW = lerp(A.phone, B.phone, k) * u;
    this.lookW = 0;
    if (this.phoneMesh) this.phoneMesh.visible = this.phoneW > 0.5;
    this.sofaFace = { blink: lerp(A.blink, B.blink, k) * u, aa: lerp(A.aa, B.aa, k) * u, happy: lerp(A.happy, B.happy, k) * u };
    if (this.micMesh) this.micMesh.visible = lerp(A.mic, B.mic, k) * u > 0.5;
  }

  /**
   * 침대에 눕기: 침대 옆에 서서 → 걸터앉고 → 다리를 올리며 뒤로 눕는다.
   * 몸 전체(장면 루트)의 위치·방향·뒤로 젖힘과 골반 높이·다리 굽힘을 열쇠 자세 사이로 보간한다.
   */
  private applyRest(vrm: VRM, r: RestPose, lp: { x: number; y: number; z: number }, yaw: number, t: number) {
    const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
    const ease = (u: number) => u * u * (3 - 2 * u);
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const lerpAng = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
    const hips = bone('hips')!;
    const standY = hips.position.y;
    const SEAT = r.seatY ?? 0.66; // 걸터앉은 골반 높이 (매트리스 위)
    const SIT_LEG = r.sitLeg ?? 1.1; // 걸터앉을 때 허벅지를 앞으로 든 각도 (종아리는 수직)
    let px: number, py: number, pz: number, ry: number, rx: number, sit: number, hy: number;
    if (r.t < 0.35) {
      const u = ease(r.t / 0.35);
      px = lerp(lp.x, r.sit.x, u);
      py = lerp(lp.y, 0, u);
      pz = lerp(lp.z, r.sit.z, u);
      ry = lerpAng(yaw, r.sit.yaw, Math.min(1, u * 1.6));
      rx = 0;
      sit = u;
      hy = lerp(standY, SEAT, u);
    } else {
      const u = ease((r.t - 0.35) / 0.65);
      px = lerp(r.sit.x, r.lie.x, u);
      py = lerp(0, r.lie.y, u);
      pz = lerp(r.sit.z, r.lie.z, u);
      ry = lerpAng(r.sit.yaw, r.lie.yaw, u);
      rx = (-Math.PI / 2) * u;
      sit = 1 - u;
      hy = lerp(SEAT, this.rig.hipsY, u);
    }
    vrm.scene.position.set(px, py, pz);
    vrm.scene.rotation.set(rx, ry, 0, 'YXZ');

    // 골반·다리: 걷던 자세에서 앉은/누운 자세로 (처음 몇 프레임에 걸쳐 섞음)
    const w = Math.min(1, r.t / 0.12);
    hips.position.y = lerp(hips.position.y, hy, w);
    hips.quaternion.slerp(this.tmpQ.identity(), w);
    const e = _e;
    const q = _q;
    const set = (n: VRMHumanBoneName, x: number, z = 0) => bone(n)?.quaternion.slerp(q.setFromEuler(e.set(x, 0, z)), w);
    set('leftUpperLeg', -SIT_LEG * sit, 0.04);
    set('rightUpperLeg', -SIT_LEG * sit, -0.04);
    set('leftLowerLeg', SIT_LEG * sit);
    set('rightLowerLeg', SIT_LEG * sit);
    set('leftFoot', 0.8 * (1 - sit));
    set('rightFoot', 0.8 * (1 - sit));
    set('spine', 0.08 * sit);
    // 잠든 숨결: 가슴이 천천히 오르내린다
    const lying = Math.max(0, (r.t - 0.85) / 0.15);
    set('chest', Math.sin(t * 0.07) * 0.035 * lying);
    set('head', -0.15 * lying);

    // 앉아서: 사람이 없으면 휴대폰을 보고, 사람이 오면 고개를 들어 그쪽을 본다
    const seated = r.t <= 0.36 ? sit * w : 0;
    this.phoneW += ((r.phone ?? 0) * seated - this.phoneW) * 0.08;
    this.lookW += ((r.look ? 1 : 0) * seated - this.lookW) * 0.12;
    if (this.phoneMesh) this.phoneMesh.visible = this.phoneW > 0.35;
    const k = this.phoneW;
    if (k > 0.002) {
      // 두 손을 가슴 앞에 모아 휴대폰을 들고, 고개를 숙인다
      const arm = (side: 'left' | 'right', sh: number, el: number, ar: number) => {
        const hang = ARM_HANG - ar;
        const up = bone(side === 'left' ? 'leftUpperArm' : 'rightUpperArm');
        const lo = bone(side === 'left' ? 'leftLowerArm' : 'rightLowerArm');
        up?.quaternion.slerp(q.setFromEuler(e.set(sh, 0, side === 'left' ? -hang : hang, 'XYZ')), k);
        const ax = side === 'left' ? _axL.set(Math.cos(hang), Math.sin(hang), 0) : _axR.set(Math.cos(hang), -Math.sin(hang), 0);
        lo?.quaternion.slerp(q.setFromAxisAngle(ax, el), k);
      };
      arm('left', -0.55, -2.05, -0.2);
      arm('right', -0.6, -2.0, -0.2);
      bone('head')?.quaternion.slerp(q.setFromEuler(e.set(0.5, 0, 0)), k * (1 - this.lookW));
      bone('chest')?.quaternion.slerp(q.setFromEuler(e.set(0.12, 0, 0)), k);
    }
    if (r.look && this.lookW > 0.002) {
      // 쳐다볼 사람 쪽으로 고개(대부분)와 상체(조금)를 돌린다
      const want = Math.atan2(r.look.x - px, r.look.z - pz) - ry;
      const rel = Math.max(-1.2, Math.min(1.2, Math.atan2(Math.sin(want), Math.cos(want))));
      this.lookYaw += (rel - this.lookYaw) * 0.15;
      bone('head')?.quaternion.slerp(q.setFromEuler(e.set(0.05, this.lookYaw * 0.75, 0)), this.lookW);
      bone('chest')?.quaternion.slerp(q.setFromEuler(e.set(0, this.lookYaw * 0.25, 0)), this.lookW);
    }
  }

  /** 낚싯대 쥐기: 오른손은 손잡이 앞, 왼손은 그 아래 끝을 받친다. 대를 들수록 팔도 올라간다 */
  private applyHold(vrm: VRM, dt: number) {
    this.holdW += ((this.hold ? 1 : 0) - this.holdW) * smooth(0.15, dt);
    if (this.hold) this.holdPitch = this.hold.pitch;
    const k = this.holdW;
    if (k < 0.002) return;
    const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
    const q = new THREE.Quaternion();
    const e = _e;
    const lift = Math.max(0, Math.min(1.5, this.holdPitch));
    const arm = (side: 'left' | 'right', sh: number, el: number, ar: number) => {
      const hang = ARM_HANG - ar;
      bone(side === 'left' ? 'leftUpperArm' : 'rightUpperArm')?.quaternion.slerp(q.setFromEuler(e.set(sh, 0, side === 'left' ? -hang : hang, 'XYZ')), k);
      const ax = side === 'left' ? _axL.set(Math.cos(hang), Math.sin(hang), 0) : _axR.set(Math.cos(hang), -Math.sin(hang), 0);
      bone(side === 'left' ? 'leftLowerArm' : 'rightLowerArm')?.quaternion.slerp(q.setFromAxisAngle(ax, el), k);
    };
    arm('right', -0.55 - lift * 0.3, -1.15 + lift * 0.15, 0.05);
    arm('left', -0.45 - lift * 0.2, -1.35, -0.45);
    bone('chest')?.quaternion.slerp(q.setFromEuler(e.set(0.05, -0.12, 0)), k);
    bone('head')?.quaternion.slerp(q.setFromEuler(e.set(0.18 - lift * 0.1, 0, 0)), k);
  }

  /** 오른손 위치 (월드). 모델이 아직 없으면 false */
  handWorld(out: THREE.Vector3): boolean {
    const h = this.vrm?.humanoid.getRawBoneNode('rightHand');
    if (!h) return false;
    h.getWorldPosition(out);
    return true;
  }

  /** 클립이 있는 상태면 절차적 포즈 위에 모션캡처 자세를 섞는다 */
  private applyClip(f: Fighter, c: FrameClock, vrm: VRM) {
    const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
    for (const n of UNDRIVEN) bone(n)?.quaternion.identity();
    const hips = bone('hips')!;
    hips.position.x = this.hipsRest.x;
    hips.position.z = this.hipsRest.z;

    const lib = this.lib;
    const fr = Math.max(0, f.frame + c.sub);
    const speed = Math.hypot(this.loco.fwd, this.loco.lat);
    const choice = lib ? chooseClip(lib, f, fr, this.loco.phase / (Math.PI * 2), c.t, { casual: this.casual, speed, gait: this.gait }) : null;
    this.clipW += ((choice ? 1 : 0) - this.clipW) * smooth(choice ? 0.4 : 0.3, c.dt);
    if (choice) {
      if (this.lastChoice && this.lastChoice.key !== choice.key && this.clipW > 0.2) {
        for (const [b, q] of this.prevFinal) {
          const s = this.snap.get(b);
          if (s) s.copy(q);
          else this.snap.set(b, q.clone());
        }
        this.xfade = 0;
      }
      this.lastChoice = choice;
    }

    const use = choice ?? this.lastChoice;
    if (lib && use && this.clipW > 0.005) {
      sampleChoice(lib, use, this.deltas, this.hipsOff);
      for (const b of CLIP_BONES) {
        const node = bone(b);
        const D = this.deltas.get(b);
        if (!node || !D) continue;
        // 월드 변화량 → 이 모델의 부모 기준 로컬 회전
        const parent = this.parentOf.get(b);
        const local = parent ? this.tmpQ.copy(this.deltas.get(parent)!).invert().multiply(D) : this.tmpQ.copy(D);
        node.quaternion.slerp(local, this.clipW);
      }
      hips.position.lerp(this.tmpV.copy(this.hipsRest).addScaledVector(this.hipsOff, this.rig.hipsY), this.clipW);
    }

    if (this.xfade < 1) {
      this.xfade = Math.min(1, this.xfade + c.dt / 0.12);
      const w = 1 - Math.pow(1 - this.xfade, 2);
      for (const [b, q] of this.snap) {
        const node = bone(b);
        if (node) node.quaternion.copy(this.tmpQ.copy(q).slerp(node.quaternion, w));
      }
    }

    for (const b of CLIP_BONES) {
      const node = bone(b);
      if (!node) continue;
      let q = this.prevFinal.get(b);
      if (!q) this.prevFinal.set(b, (q = new THREE.Quaternion()));
      q.copy(node.quaternion);
    }
  }

  /** 코디 옷 입히기 (data/fashion id 목록) */
  setOutfit(ids: string[]) {
    this.outfit = ids;
    this.dresser?.apply(ids);
  }

  dispose() {
    this.disposed = true;
    this.dresser?.dispose();
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
  }

  private attach(vrm: VRM, tint?: number) {
    // 정규화 포즈에서 다리 길이·골반 높이를 재서 접지 계산에 쓴다
    vrm.humanoid.resetNormalizedPose();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const pos = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n)!.getWorldPosition(new THREE.Vector3());
    this.rig = {
      thigh: pos('leftUpperLeg').distanceTo(pos('leftLowerLeg')),
      shin: pos('leftLowerLeg').distanceTo(pos('leftFoot')),
      hipsY: vrm.humanoid.getNormalizedBoneNode('hips')!.position.y,
      hipX: Math.abs(pos('leftUpperLeg').x - pos('hips').x),
    };
    this.gait = null; // 새 다리 치수로 다시 잰다
    this.v0 = vrm.meta?.metaVersion === '0';
    this.hipsRest.copy(vrm.humanoid.getNormalizedBoneNode('hips')!.position);
    if (this.v0) {
      // 골반 기본 위치도 1.0 기준으로
      this.hipsRest.x = -this.hipsRest.x;
      this.hipsRest.z = -this.hipsRest.z;
    }
    // 휴대폰 (앉아서 볼 때만 보인다): 오른손에 쥔다
    const hand = vrm.humanoid.getNormalizedBoneNode('rightHand');
    if (hand) {
      const ph = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.15), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.3, metalness: 0.5 }));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.135), new THREE.MeshBasicMaterial({ color: 0x6fb6ff }));
      screen.rotation.x = -Math.PI / 2;
      screen.position.y = 0.007;
      ph.add(body, screen);
      ph.position.set(-0.07, 0.03, 0.02);
      if (this.v0) {
        // 0.x 모델은 손 뼈 기준 방향이 180° 돌아 있다
        ph.position.set(0.07, 0.03, -0.02);
        ph.rotation.y = Math.PI;
      }
      ph.visible = false;
      hand.add(ph);
      this.phoneMesh = ph;
      // 마이크: 손잡이(검정) + 그물 머리(은색). 주먹에서 엄지 쪽(위)으로 솟는다
      const mic = new THREE.Group();
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.17, 12), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.35, metalness: 0.5 }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.9 }));
      head.position.y = 0.1;
      mic.add(grip, head);
      mic.position.set(-0.075, 0.02, 0.0);
      if (this.v0) mic.position.set(0.075, 0.02, 0.0);
      mic.visible = false;
      hand.add(mic);
      this.micMesh = mic;
    }

    // 클립 계산용: 모델에 실제로 있는 가장 가까운 부모 뼈
    for (const b of CLIP_BONES) {
      const parent = CLIP_PARENTS[b]?.find((p) => vrm.humanoid.getNormalizedBoneNode(p));
      if (parent) this.parentOf.set(b, parent);
    }

    // 주먹 쥐기
    for (const side of ['left', 'right'] as const) {
      const curl = side === 'left' ? -1.2 : 1.2;
      for (const fg of FINGERS) {
        for (const seg of SEGMENTS) {
          vrm.humanoid.getNormalizedBoneNode(`${side}${fg}${seg}` as VRMHumanBoneName)?.rotation.set(0, 0, curl);
        }
      }
      // 엄지: 손바닥 쪽으로 접고(+X축) 손가락 위로 덮는다(Y축, 좌우 반대)
      const sweep = side === 'left' ? 1 : -1;
      const thumb = (seg: string) => vrm.humanoid.getNormalizedBoneNode(`${side}Thumb${seg}` as VRMHumanBoneName);
      thumb('Metacarpal')?.rotation.set(0.5, 0.5 * sweep, 0);
      thumb('Proximal')?.rotation.set(0.6, 0.4 * sweep, 0);
      thumb('Distal')?.rotation.set(0.6, 0, 0);
    }

    // 2P 컬러: 재질 색에 곱해서 구분
    if (tint !== undefined) {
      const c = new THREE.Color(tint);
      vrm.scene.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
          (m as THREE.MeshStandardMaterial).color?.multiply(c);
        }
      });
    }

    // 애니메이션 같은 또렷한 외곽선 (VRM 좌표는 미터 단위)
    addOutline(vrm.scene, 0.0035);
    keepFieldOutline(vrm.scene);
    this.rims = setupMToonRim(vrm.scene);
    this.dresser = new OutfitDresser(vrm);
    if (this.outfit.length) this.dresser.apply(this.outfit);
    this.root.remove(this.fallback.root);
    this.root.add(vrm.scene);
    this.vrm = vrm;
  }
}

/** 외형 정의로 캐릭터 표현을 만든다 */
export function createCharacter(look: number | Appearance): CharacterView & { dispose?(): void; setOutfit?(ids: string[]): void; loaded?: boolean } {
  if (typeof look !== 'number' && look.kind === 'vrm') {
    const v = new VrmCharacter(look.url, look.fallback, look.tint);
    if (look.outfit?.length) v.setOutfit(look.outfit);
    return v;
  }
  return new Mannequin(look);
}
