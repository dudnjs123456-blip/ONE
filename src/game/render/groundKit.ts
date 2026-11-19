import * as THREE from 'three';

/**
 * 실사 바닥 재질 (Firefly 로 만든 그림 → scripts/process-textures.mjs 로 다듬은 것).
 * 모든 바닥 판의 UV 를 '미터 단위' 로 바꿔 두고, 재질 쪽에서 '한 장이 몇 m 를 덮는지' 만 정한다.
 * 그래서 크기가 다른 판들이 재질 하나를 같이 쓰고, 무늬 크기도 어디서나 같다.
 * 툰 명암으로 바꾸지 않고 사실적인 조명(Standard)을 받는다 (캐릭터만 애니메이션풍).
 */
export type GroundKind = 'asphalt' | 'sidewalk' | 'grass' | 'path';

const BASE = '/textures/ground/';
const FILE: Record<GroundKind, string> = {
  asphalt: 'ground-asphalt',
  sidewalk: 'ground-sidewalk',
  grass: 'ground-grass',
  path: 'ground-park-path',
};
/** 한 장의 세로 길이 (m). 가로는 원래 그림 비율(meta.json)대로 */
const TILE_H: Record<GroundKind, number> = { asphalt: 2.6, sidewalk: 1.05, grass: 1.9, path: 1.9 };
/** 요철 세기 */
const BUMP: Record<GroundKind, number> = { asphalt: 0.9, sidewalk: 1.0, grass: 0.7, path: 0.8 };
const ROUGH: Record<GroundKind, number> = { asphalt: 0.92, sidewalk: 0.85, grass: 1, path: 1 };

interface Pair {
  map: THREE.Texture;
  normal: THREE.Texture;
}

/**
 * 날씨가 바닥에 남기는 흔적 (모든 바닥 재질이 같이 쓴다):
 * - wet 0~1: 비에 젖으면 색이 짙어지고 매끈해져 하늘·햇빛이 비친다. 낮은 곳엔 물웅덩이가 거울처럼 반짝인다
 * - snow 0~1: 눈이 쌓이면 군데군데부터 하얗게 덮인다 (얼룩 무늬는 땅 위치로 정해서 걸어도 안 바뀐다)
 */
export const GROUND_WEATHER = { wet: { value: 0 }, snow: { value: 0 } };

const NOISE_GLSL = /* glsl */ `
  uniform float gWet; uniform float gSnow; uniform float gPuddleAmt;
  varying vec3 vGWorld;
  float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
  }
  float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.3 + 7.1) * 0.3 + gNoise(p * 5.1 + 3.7) * 0.15; }
`;

/** @param puddles 물웅덩이가 생기는 정도 (잔디·흙은 물이 스며들어 거의 안 생긴다) */
function addWeather(m: THREE.MeshStandardMaterial, puddles: number) {
  const gPuddleAmt = { value: puddles };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gPuddleAmt = gPuddleAmt;
    sh.uniforms.gWet = GROUND_WEATHER.wet;
    sh.uniforms.gSnow = GROUND_WEATHER.snow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float gPuddle = smoothstep(0.58, 0.68, gFbm(vGWorld.xz * 0.18)) * gPuddleAmt;
        float gSnowMask = smoothstep(1.0 - gSnow * 1.15, 1.0 - gSnow * 1.15 + 0.22, gFbm(vGWorld.xz * 0.45 + 11.0));
        // 젖은 바닥: 물을 머금어 짙어진다 (웅덩이는 더)
        diffuseColor.rgb *= 1.0 - gWet * (0.32 + gPuddle * 0.25);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.95), gSnowMask);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, gWet);
        roughnessFactor = mix(roughnessFactor, 0.06, gWet * gPuddle);
        roughnessFactor = mix(roughnessFactor, 0.85, gSnowMask);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        // 웅덩이·눈 덮인 곳은 바닥 결(울퉁불퉁)이 묻혀 평평하다
        `#include <normal_fragment_maps>
        normal = normalize(mix(normal, normalize(vNormal), clamp(gWet * gPuddle + gSnowMask, 0.0, 1.0)));`,
      );
  };
  m.customProgramCacheKey = () => 'ground-weather';
}

export class GroundKit {
  private loader = new THREE.TextureLoader();
  private pairs = new Map<GroundKind, Pair>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();

  constructor(private anisotropy: number) {
    // 그림 비율을 읽어서 한 장이 덮는 가로 길이를 맞춘다 (없으면 정사각형으로)
    void fetch(`${BASE}meta.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((meta: Record<string, { aspect?: number }>) => {
        for (const [kind, p] of this.pairs) this.setRepeat(p, kind, meta[FILE[kind]]?.aspect ?? 1);
        this.aspects = meta;
      })
      .catch(() => {});
  }

  private aspects: Record<string, { aspect?: number }> = {};

  private setRepeat(p: Pair, kind: GroundKind, aspect: number) {
    const h = TILE_H[kind];
    for (const t of [p.map, p.normal]) t.repeat.set(1 / (h * aspect), 1 / h);
  }

  private pair(kind: GroundKind): Pair {
    let p = this.pairs.get(kind);
    if (!p) {
      const load = (file: string, srgb: boolean) => {
        const t = this.loader.load(`${BASE}${file}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      p = { map: load(FILE[kind], true), normal: load(`${FILE[kind]}_n`, false) };
      this.setRepeat(p, kind, this.aspects[FILE[kind]]?.aspect ?? 1);
      this.pairs.set(kind, p);
    }
    return p;
  }

  /** 바닥 재질. tint 는 그림에 곱하는 색 (도로는 더 어둡게, 자전거길은 파랗게 등) */
  material(kind: GroundKind, tint = 0xffffff): THREE.MeshStandardMaterial {
    const key = `${kind}:${tint}`;
    let m = this.mats.get(key);
    if (!m) {
      const p = this.pair(kind);
      const b = BUMP[kind];
      m = new THREE.MeshStandardMaterial({
        color: tint,
        map: p.map,
        normalMap: p.normal,
        normalScale: new THREE.Vector2(b, b),
        roughness: ROUGH[kind],
        metalness: 0,
      });
      m.name = `ground-${key}`;
      addWeather(m, kind === 'grass' ? 0 : kind === 'path' ? 0.4 : 1);
      this.mats.set(key, m);
    }
    return m;
  }

  /** 바닥 판 (w × d m) 을 (x, y, z) 에 눕힌다. UV 는 미터 단위 + 위치만큼 밀어서 판끼리 무늬가 이어진다 */
  plane(kind: GroundKind, w: number, d: number, x: number, z: number, y: number, tint?: number) {
    const geo = new THREE.PlaneGeometry(w, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, x - w / 2 + uv.getX(i) * w, -z - d / 2 + uv.getY(i) * d);
    const mesh = new THREE.Mesh(geo, this.material(kind, tint));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    // 툰 재질로 바꾸지 않는다 (실사 조명)
    mesh.userData.keepMaterial = true;
    return mesh;
  }

  dispose() {
    for (const p of this.pairs.values()) {
      p.map.dispose();
      p.normal.dispose();
    }
    for (const m of this.mats.values()) m.dispose();
  }
}
