import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * 화면 분위기 (애니메이션 툰 화풍):
 * - 블룸: 네온·가로등·밤 창문처럼 밝은 것만 은은하게 번진다
 * - 색감: 채도 조금 올리고, 밤엔 푸르게·노을엔 따뜻하게, 가장자리는 살짝 어둡게 (비네트)
 * - 톤 매핑(ACES)과 sRGB 출력은 마지막 OutputPass 가 한다
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.15 },
    vignette: { value: 0.32 },
    tint: { value: new THREE.Color(1, 1, 1) },
    /** 화면 암전 (0 = 보통, 1 = 깜깜) — 장소가 바뀔 때 */
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float vignette;
    uniform vec3 tint;
    uniform float fade;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation) * tint;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c.rgb *= 1.0 - fade;
      gl_FragColor = c;
    }
  `,
};

/**
 * 구석 그림자 (AO): 벽과 바닥이 만나는 곳, 캐릭터 발밑, 건물 틈이 은은하게 어두워져 입체감이 산다.
 * 장면을 한 번 더 그려야 해서 무겁기 때문에 절반 해상도로 계산하고, 화질 최고 단계에서만 켠다.
 */
class HalfResAO extends GTAOPass {
  private hidden: THREE.Object3D[] = [];

  setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
  }

  /** AO 계산용 그리기에서 뺄 것: 글자·이름표(스프라이트), 점·선, 캐릭터 외곽선, 하늘 */
  overrideVisibility() {
    this.scene.traverse((o) => {
      if (!o.visible) return;
      if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || o.userData.isOutline || o.userData.noAO) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
  }

  restoreVisibility() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}

/** 캐릭터 가장자리 빛 (림 라이트). 배경에서 캐릭터가 또렷하게 떨어져 보인다. 낮·노을·밤에 따라 색이 바뀐다 */
export const RIM = {
  color: { value: new THREE.Color(0xfff2dc) },
  strength: { value: 0.32 },
};

/** 낮밤에 맞춰 림 라이트 색을 정한다 (낮 = 따뜻한 흰색, 노을 = 주황, 밤 = 푸른 네온빛) */
export function updateRim(night: number, dusk: number, indoor: boolean) {
  if (indoor) RIM.color.value.setRGB(1, 0.93, 0.82);
  else RIM.color.value.setRGB(1, 0.95, 0.86).lerp(_rimDusk, Math.min(1, dusk)).lerp(_rimNight, night);
  RIM.strength.value = indoor ? 0.22 : 0.3 + night * 0.12;
}
const _rimDusk = new THREE.Color(1, 0.62, 0.38);
const _rimNight = new THREE.Color(0.45, 0.62, 1);

/** 툰 재질에 림 라이트를 넣는다 (행인 모델). 경계가 또렷한 애니메이션식 테두리 빛 */
export function addRim(mat: THREE.MeshToonMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = RIM.color;
    shader.uniforms.rimStrength = RIM.strength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float rimF = smoothstep(0.55, 0.8, 1.0 - saturate(dot(normal, normalize(vViewPosition))));
          // 그늘진 쪽에선 약하게: 위를 향한 면(빛 받는 쪽)일수록 세게
          float up = 0.6 + 0.4 * saturate(dot((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, normal) + 0.3);
          outgoingLight += rimColor * rimF * rimStrength * up;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'toon-rim';
}

/** VRM(MToon) 재질의 림 라이트 설정. 원래 모델에 있던 림 색에 더한다 */
export interface MToonRim {
  mat: THREE.Material & { parametricRimColorFactor: THREE.Color };
  base: THREE.Color;
}
export function setupMToonRim(root: THREE.Object3D): MToonRim[] {
  const out: MToonRim[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const mt = m as THREE.Material & {
        isMToonMaterial?: boolean;
        isOutline?: boolean;
        parametricRimColorFactor: THREE.Color;
        parametricRimFresnelPowerFactor: number;
        parametricRimLiftFactor: number;
        rimLightingMixFactor: number;
      };
      if (!mt.isMToonMaterial || mt.isOutline || seen.has(m)) continue;
      seen.add(m);
      mt.parametricRimFresnelPowerFactor = 4.5;
      mt.parametricRimLiftFactor = 0;
      mt.rimLightingMixFactor = 0.35;
      out.push({ mat: mt, base: mt.parametricRimColorFactor.clone() });
    }
  });
  return out;
}
export function updateMToonRim(list: MToonRim[]) {
  for (const r of list) r.mat.parametricRimColorFactor.copy(RIM.color.value).multiplyScalar(RIM.strength.value * 1.6).add(r.base);
}

export class LookFx {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private ao: HalfResAO;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // 후처리를 거쳐도 계단 현상이 없게 다중 샘플 렌더 타깃
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.ao = new HalfResAO(new THREE.Scene(), new THREE.PerspectiveCamera(), Math.max(1, size.x / 2), Math.max(1, size.y / 2));
    this.ao.blendIntensity = 0.8;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.35, 0.9);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /**
   * 화질 단계 (느린 컴퓨터용): 0 = 최고 (구석 그림자 AO 포함), 1 = AO 끔 + 계단 방지(MSAA) 4→2배, 2 = 계단 방지 끔, 3 = 블룸도 끔.
   * 해상도를 낮추는 것보다 화면이 덜 뭉개진다 (외곽선이 있어 계단 현상이 크게 티 나지 않는다)
   */
  setQuality(level: number) {
    const samples = level <= 0 ? 4 : level === 1 ? 2 : 0;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples === samples) continue;
      t.samples = samples;
      // 다음 그리기에서 새 설정으로 다시 만든다
      t.dispose();
    }
    this.bloom.enabled = level < 3;
    this.ao.enabled = level <= 0;
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  /**
   * @param night 0 = 낮, 1 = 밤 (밤엔 블룸이 세지고 화면이 푸르게)
   * @param dusk 0~1 노을 (따뜻하게)
   * @param indoor 실내는 블룸을 약하게 (조명이 많아 번지기 쉬움)
   */
  /** 화면 암전 (0 = 보통, 1 = 깜깜) */
  fade = 0;

  render(scene: THREE.Scene, camera: THREE.Camera, night: number, dusk: number, indoor: boolean) {
    this.grade.uniforms.fade.value = this.fade;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.ao.scene = scene;
    this.ao.camera = camera;
    // 실외(도시)는 건물 틈·발밑까지 넓게, 실내는 가구 주변만 좁게
    this.ao.updateGtaoMaterial(indoor ? { radius: 0.35, thickness: 0.6 } : { radius: 0.7, thickness: 1 });
    updateRim(night, dusk, indoor);
    // 정말 밝은 것(네온·전구·해)만 번지게: 문턱은 높게, 밤에도 조금만 낮춘다
    this.bloom.strength = indoor ? 0.25 : 0.3 + night * 0.3;
    // 낮: 해·전구처럼 정말 밝은 것만 (흰 옷·흰 벽은 안 번진다), 밤: 네온·간판까지
    this.bloom.threshold = indoor ? 1.1 : 1.08 - night * 0.2;
    const t = this.grade.uniforms.tint.value as THREE.Color;
    if (indoor) t.setRGB(1.02, 1.0, 0.97);
    else t.setRGB(1 + dusk * 0.06 - night * 0.06, 1 - night * 0.02, 1 - dusk * 0.06 + night * 0.08);
    this.composer.render();
  }

  dispose() {
    this.ao.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}

/**
 * 화풍 스위치: true = 배경(건물·땅·소품)은 실사풍 조명 + 사진 하늘, 캐릭터는 그대로 애니메이션 툰.
 * false 로 바꾸면 예전처럼 전부 툰 + 그라데이션 하늘
 */
export const REALISTIC_WORLD = true;

/** 툰 명암: 3단계 (그림자 / 중간 / 밝음) */
let gradient: THREE.DataTexture | null = null;
export function toonGradient() {
  if (gradient) return gradient;
  // 그림자 쪽도 너무 검지 않게 (60% · 82% · 100%)
  const data = new Uint8Array([155, 155, 155, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/**
 * 장면의 Standard 재질을 툰 재질로 바꾼다 (색·질감·발광은 그대로).
 * @returns 바뀐 재질 대응표 (기존 재질 → 툰 재질). 재질을 따로 들고 있는 곳(창문 밤 조명 등)을 고칠 때 쓴다
 */
export function toonify(root: THREE.Object3D, swapped = new Map<THREE.Material, THREE.Material>(), opts: { matte?: boolean } = {}) {
  const convert = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial)) return m;
    let t = swapped.get(m);
    if (!t) {
      // 반짝이는 유리·금속은 툰으로 바꾸면 밋밋해져서 둔다
      // (matte: 금속값이 빠져 기본값 1 로 읽힌 에셋도 무광으로 보고 바꾼다)
      if ((!opts.matte && m.metalness > 0.45) || (m.transparent && m.opacity < 0.6) || m.userData.glass) return m;
      if (REALISTIC_WORLD) {
        // 실사풍: 툰 대신 빛·하늘 반사를 그대로 받는 재질 (재질은 따로 복사해서 돌려준다 — 부르는 쪽이 색을 바꾼다)
        const s = m.clone();
        if (opts.matte) s.metalness = 0;
        s.roughness = Math.max(s.roughness, 0.55);
        t = s;
        swapped.set(m, t);
        return t;
      }
      t = new THREE.MeshToonMaterial({
        color: m.color,
        map: m.map,
        emissive: m.emissive,
        emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent,
        opacity: m.opacity,
        side: m.side,
        gradientMap: toonGradient(),
      });
      t.name = m.name;
      swapped.set(m, t);
    }
    return t;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) return;
    // 캐릭터(VRM)는 이미 툰 재질(MToon)이라 건드리지 않는다
    if (o.userData.keepMaterial) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return swapped;
}

/**
 * 하늘: 지평선 → 하늘 꼭대기 그라데이션 + 해 주변 빛무리 (단색 배경 대신).
 * 안개 색은 지평선 색과 맞춘다.
 */
const _c = new THREE.Color();
const _g = new THREE.Color();

/**
 * 실사 하늘 사진 (Poly Haven CC0 "pure sky", 위쪽 반구만 4096×1024):
 * sunU = 사진 속 해의 가로 위치 (0~1) — 게임 속 해 방향과 맞춰 돌린다. horizon = 사진 지평선 평균 색 (안개 색)
 */
const SKY_PHOTOS = [
  { url: '/textures/sky/sky-day.jpg', sunU: 0.62, horizon: 0x9ba1b2 },
  { url: '/textures/sky/sky-dusk.jpg', sunU: 0.66, horizon: 0x978b89 },
  { url: '/textures/sky/sky-overcast.jpg', sunU: 0.5, horizon: 0x807d79 },
] as const;
/** 사진 하늘 밝기 (사진은 이미 톤 매핑된 색이라, 마지막 톤 매핑에서 어두워지는 만큼 미리 올려 둔다) */
const PHOTO_GAIN = 1.25;
const _h = new THREE.Color();

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private loaded = 0;
  /** 주변광(환경 지도)을 다시 구울 때 쓰는 장면 (같은 하늘 재질을 원점에 둔다) */
  readonly envScene = new THREE.Scene();

  constructor() {
    const photos = REALISTIC_WORLD
      ? SKY_PHOTOS.map((p) => {
          const t = new THREE.TextureLoader().load(p.url, () => {
            this.loaded++;
            this.mat.uniforms.ready.value = this.loaded === SKY_PHOTOS.length ? 1 : 0;
          });
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          // 밉맵을 쓰면 사진 이음매(경도 0°)에 세로 줄이 생긴다 — 하늘은 늘 멀어서 밉맵 없이도 깨지지 않는다
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
          return t;
        })
      : [null, null, null];
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d7fd1) },
        horizon: { value: new THREE.Color(0xbfe0f7) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffe2b0) },
        sunGlow: { value: 0.6 },
        dayMap: { value: photos[0] },
        duskMap: { value: photos[1] },
        overMap: { value: photos[2] },
        sunU: { value: new THREE.Vector3(SKY_PHOTOS[0].sunU, SKY_PHOTOS[1].sunU, SKY_PHOTOS[2].sunU) },
        sunAz: { value: 0 },
        /** 사진 섞는 비율: 맑음 · 노을 · 흐림 (합 1) */
        photoW: { value: new THREE.Vector3(1, 0, 0) },
        /** 사진 하늘 비중 (0 = 그라데이션만, 밤) · 밝기 */
        photoAmt: { value: 0 },
        photoBright: { value: 1 },
        flash: { value: 0 },
        ready: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
        uniform sampler2D dayMap; uniform sampler2D duskMap; uniform sampler2D overMap;
        uniform vec3 sunU; uniform float sunAz; uniform vec3 photoW;
        uniform float photoAmt; uniform float photoBright; uniform float flash; uniform float ready;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          float amt = photoAmt * ready;
          // 사진에도 해가 있으니 사진이 보일 땐 그린 해는 은은한 빛무리만
          c += sunColor * (pow(s, 64.0) * 1.6 * (1.0 - amt) + pow(s, 6.0) * 0.35) * sunGlow;
          if (amt > 0.0) {
            // 방향 → 사진 좌표 (가로: 해 방향이 사진 속 해 위치에 오게 돌림, 세로: 지평선 0 → 꼭대기 1)
            float az = atan(d.z, d.x) / 6.2831853 - sunAz;
            float v = asin(clamp(d.y, 0.003, 1.0)) / 1.5707963;
            vec3 p = texture2D(dayMap, vec2(fract(az + sunU.x), v)).rgb * photoW.x
                   + texture2D(duskMap, vec2(fract(az + sunU.y), v)).rgb * photoW.y
                   + texture2D(overMap, vec2(fract(az + sunU.z), v)).rgb * photoW.z;
            // 노을: 지평선 쪽이 사방으로 따뜻하게 물든다
            p += sunColor * photoW.y * 0.22 * pow(1.0 - v, 3.0);
            p = p * photoBright + vec3(0.85, 0.88, 1.0) * flash;
            c = mix(c, p, amt);
          }
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.userData.noAO = true;
    const envDome = new THREE.Mesh(this.mesh.geometry, this.mat);
    envDome.frustumCulled = false;
    this.envScene.add(envDome);
  }

  /** @returns 지평선 색 (안개 색으로 쓴다) */
  update(daylight: number, dusk: number, sunDir: THREE.Vector3, cloud = 0, flash = 0): THREE.Color {
    const u = this.mat.uniforms;
    const night = 1 - daylight;
    // 흐린 날: 노을도 구름에 묻히고 하늘이 회색으로
    dusk *= 1 - cloud * 0.7;
    const top = (u.top.value as THREE.Color).setHex(0x3d7fd1).lerp(_c.setHex(0x050816), night).lerp(_c.setHex(0x4a3a8a), dusk * 0.5);
    const hor = (u.horizon.value as THREE.Color).setHex(0xcfe7f7).lerp(_c.setHex(0x1a2142), night).lerp(_c.setHex(0xff9a5c), Math.min(0.8, dusk));
    if (cloud > 0) {
      const grey = _g.setHex(0x8d959e).lerp(_c.setHex(0x15181f), night);
      top.lerp(grey, cloud * 0.85);
      hor.lerp(grey.multiplyScalar(1.12), cloud * 0.75);
    }
    // 번개: 하늘 전체가 번쩍
    if (flash > 0) {
      top.lerp(_c.setHex(0xdde4ff), flash * 0.8);
      hor.lerp(_c.setHex(0xeef0ff), flash * 0.8);
    }
    (u.sunColor.value as THREE.Color).setHex(0xfff0c8).lerp(_c.setHex(0xff7a3a), Math.min(1, dusk));
    u.sunDir.value.copy(sunDir);
    u.sunGlow.value = Math.max(0, daylight + dusk * 0.6) * (1 - cloud * 0.9);

    if (REALISTIC_WORLD) {
      // 노을 사진은 일찍·확실히 넘어가게 (반반 섞이면 구름이 겹쳐 보인다)
      const k = THREE.MathUtils.smoothstep(dusk, 0.05, 0.5);
      // 맑음·노을·흐림 비율 (합이 1)
      const w = u.photoW.value as THREE.Vector3;
      w.set((1 - k) * (1 - cloud), k * (1 - cloud), cloud);
      u.sunAz.value = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2);
      // 낮엔 사진 하늘, 해가 지면서 어두워지다가 밤엔 원래 그라데이션(남색) 하늘로
      const amt = THREE.MathUtils.smoothstep(daylight + k * 0.4, 0.05, 0.55);
      const bright = PHOTO_GAIN * (0.2 + 0.8 * Math.min(1, daylight + k * 0.3));
      u.photoAmt.value = amt;
      u.photoBright.value = bright;
      u.flash.value = flash * 0.8;
      if (u.ready.value > 0) {
        // 안개 색도 사진 지평선 색에 맞춘다 (먼 건물이 하늘에 자연스럽게 묻히게)
        _h.setRGB(0, 0, 0);
        SKY_PHOTOS.forEach((p, i) => _h.add(_c.setHex(p.horizon).multiplyScalar(w.getComponent(i))));
        hor.lerp(_h.multiplyScalar(bright), amt);
      }
    }
    return hor;
  }

  /** 하늘 사진이 다 불러와졌나 (주변광을 사진 기준으로 다시 구울 때) */
  get photosReady() {
    return this.mat.uniforms.ready.value > 0;
  }

  /** 카메라를 따라다닌다 (하늘이 멀리 있는 것처럼) */
  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position);
  }
}

/**
 * 캐릭터 외곽선 (애니메이션 같은 또렷한 테두리): 메쉬를 한 번 더, 뒷면만, 법선 방향으로 살짝 부풀려
 * 어두운 색으로 그린다 (inverted hull). 뼈 움직임(스키닝)도 그대로 따라간다.
 * @param rel 외곽선 두께 = 가장 큰 메쉬의 크기(가장 긴 변) × rel.
 *            모델마다 내부 단위(미터·센티미터)가 달라도 같은 굵기로 보인다
 */
export function addOutline(root: THREE.Object3D, rel = 0.004, color = 0x1a1622) {
  let ref = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const s = m.geometry.boundingBox!.getSize(new THREE.Vector3());
    ref = Math.max(ref, s.x, s.y, s.z);
  });
  const width = ref * rel;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      // 스키닝 전에 법선 방향으로 부풀리면, 그 뒤 스키닝이 뼈 움직임대로 함께 옮겨 준다
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * outlineWidth;');
  };
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.isOutline) targets.push(m);
  });
  for (const m of targets) {
    let line: THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = m as THREE.SkinnedMesh;
      const s = new THREE.SkinnedMesh(sm.geometry, mat);
      s.bind(sm.skeleton, sm.bindMatrix);
      s.bindMode = sm.bindMode;
      line = s;
    } else line = new THREE.Mesh(m.geometry, mat);
    line.userData.isOutline = true;
    line.castShadow = false;
    line.receiveShadow = false;
    line.frustumCulled = m.frustumCulled;
    // 원래 메쉬와 같은 자리에 (같은 부모 아래, 같은 변환)
    line.position.copy(m.position);
    line.quaternion.copy(m.quaternion);
    line.scale.copy(m.scale);
    line.renderOrder = m.renderOrder;
    m.parent?.add(line);
  }
}
