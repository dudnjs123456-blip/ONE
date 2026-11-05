import * as THREE from 'three';
import type { WeatherState } from '../city/weather';

/** 비·눈이 내리는 상자 크기 (카메라를 둘러싼다) */
const BOX = new THREE.Vector3(56, 32, 56);
const RAIN_MAX = 7000;
const SNOW_MAX = 4500;

/** 상자 안에서 감고 돌아가는 공통 셰이더 조각: 세상에 고정된 자리 + 흐른 거리 → 카메라 주변 상자 안 위치 */
const WRAP_GLSL = /* glsl */ `
  uniform vec3 center; uniform vec3 box;
  varying float vFade;
  vec3 wrapBox(vec3 p, out vec3 q) {
    vec3 lo = center - box * 0.5;
    q = mod(p - lo, box);
    vec3 r = q / box - 0.5;
    // 상자 가장자리에선 흐려져서 툭 생기고 사라지는 게 안 보이게
    vFade = (1.0 - smoothstep(0.3, 0.5, length(r.xz))) * (1.0 - smoothstep(0.38, 0.5, abs(r.y)));
    return lo + q;
  }
`;

/**
 * 비·눈·번개. 빗방울·눈송이는 세상에 고정된 자리를 갖고, 카메라 주변 상자 안에서 감고 돌아(mod) 그린다.
 * 위치 계산은 셰이더에서 해서 매 프레임 CPU 일이 거의 없다. 세기는 그릴 개수와 투명도로 조절.
 * 흐른 거리(drift)는 CPU 에서 속도 × 시간을 쌓아 넘긴다 (바람이 바뀌어도 빗줄기가 순간이동하지 않게).
 */
export class WeatherFx {
  private rain: THREE.LineSegments;
  private snow: THREE.Mesh;
  private rainMat: THREE.ShaderMaterial;
  private snowMat: THREE.ShaderMaterial;
  private rainDrift = new THREE.Vector3();
  private snowDrift = new THREE.Vector3();
  private time = 0;
  /** 번개 밝기 (0~1) */
  flash = 0;
  private flashT = 0;
  private nextBolt = 4;

  constructor(scene: THREE.Scene) {
    const common = {
      transparent: true,
      depthWrite: false,
      fog: false,
    };

    // 비: 빗방울 하나 = 선분 하나 (꼭짓점 둘, 같은 자리 · tip 0/1)
    {
      const seed = new Float32Array(RAIN_MAX * 6);
      const tip = new Float32Array(RAIN_MAX * 2);
      for (let i = 0; i < RAIN_MAX; i++) {
        const x = Math.random(), y = Math.random(), z = Math.random();
        seed.set([x, y, z, x, y, z], i * 6);
        tip[i * 2 + 1] = 1;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
      g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
      g.setDrawRange(0, 0);
      this.rainMat = new THREE.ShaderMaterial({
        ...common,
        uniforms: {
          center: { value: new THREE.Vector3() },
          box: { value: BOX },
          drift: { value: this.rainDrift },
          dir: { value: new THREE.Vector3(0, -1, 0) },
          len: { value: 0.75 },
          opacity: { value: 0.5 },
          color: { value: new THREE.Color(0xbfd4ea) },
        },
        vertexShader: /* glsl */ `
          attribute float tip;
          uniform vec3 drift; uniform vec3 dir; uniform float len;
          ${WRAP_GLSL}
          void main() {
            vec3 q;
            vec3 w = wrapBox(position * box + drift, q) - dir * len * tip;
            vFade *= mix(0.25, 1.0, tip);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float opacity; uniform vec3 color;
          varying float vFade;
          void main() { gl_FragColor = vec4(color, opacity * vFade); }
        `,
      });
      this.rain = new THREE.LineSegments(g, this.rainMat);
    }

    // 눈: 작은 사각형 하나 = 눈송이 하나 (늘 카메라를 향한다), 천천히 내리며 좌우로 하늘하늘.
    // 점(Points) 대신 사각형: 점 크기 한계·환경 차이 없이 어디서나 같은 크기로 보이게
    {
      const seed = new Float32Array(SNOW_MAX * 12);
      const corner = new Float32Array(SNOW_MAX * 12);
      const index = new Uint32Array(SNOW_MAX * 6);
      const CX = [-0.5, 0.5, 0.5, -0.5], CY = [-0.5, -0.5, 0.5, 0.5];
      for (let i = 0; i < SNOW_MAX; i++) {
        const x = Math.random(), y = Math.random(), z = Math.random();
        // 크기·낙하 속도는 자리와 따로 뽑는다 (자리 y 로 속도를 정하면 시간이 지나며 눈이 한 높이로 몰린다)
        const size = 0.12 + Math.random() * 0.12;
        // 속도는 0.01 단위 (낙하 거리를 3200m 마다 감아도 모든 눈송이가 정확히 제자리로 돌아오게)
        const speed100 = 70 + Math.floor(Math.random() * 61);
        for (let k = 0; k < 4; k++) {
          seed.set([x, y, z], (i * 4 + k) * 3);
          corner.set([CX[k], CY[k], speed100 + size], (i * 4 + k) * 3);
        }
        index.set([0, 1, 2, 0, 2, 3].map((v) => v + i * 4), i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
      g.setAttribute('corner', new THREE.BufferAttribute(corner, 3));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.setDrawRange(0, 0);
      this.snowMat = new THREE.ShaderMaterial({
        ...common,
        uniforms: {
          center: { value: new THREE.Vector3() },
          box: { value: BOX },
          drift: { value: this.snowDrift },
          fallen: { value: 0 },
          time: { value: 0 },
          opacity: { value: 0.9 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 corner;
          uniform vec3 drift; uniform float fallen; uniform float time;
          varying vec2 vUv;
          ${WRAP_GLSL}
          void main() {
            // corner.z = 속도×100 (정수) + 크기 (1 미만): 속성 하나에 둘을 담았다
            float speed = floor(corner.z) / 100.0;
            float size = fract(corner.z);
            float ph = position.x * 40.0 + position.z * 17.0;
            vec3 sway = vec3(sin(time * 1.1 + ph), 0.0, cos(time * 0.9 + ph * 1.3)) * 0.7;
            vec3 q;
            vec3 w = wrapBox(position * box + drift + vec3(0.0, -fallen * speed, 0.0) + sway, q);
            vUv = corner.xy;
            vec4 mv = viewMatrix * vec4(w, 1.0);
            // 멀리 있는 눈송이도 화면에서 몇 픽셀은 되게 거리에 비례해 키운다
            mv.xy += corner.xy * max(size, -mv.z * 0.006);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float opacity;
          varying float vFade;
          varying vec2 vUv;
          void main() {
            float d = length(vUv);
            if (d > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, opacity * vFade * (1.0 - smoothstep(0.15, 0.5, d)));
          }
        `,
      });
      this.snow = new THREE.Mesh(g, this.snowMat);
    }

    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.renderOrder = 5;
      o.userData.noAO = true;
      o.userData.keepMaterial = true;
      scene.add(o);
    }
  }

  /**
   * @param around 비·눈 상자의 가운데 (카메라와 플레이어 사이). 높이는 땅~30m 로 고정
   */
  update(w: WeatherState, around: THREE.Vector3, dt: number, night: number) {
    dt = Math.min(dt, 0.1);
    // 시간·흐른 거리는 상자 크기의 배수로 감아 둔다 (값이 커지면 소수점이 뭉개진다)
    this.time = (this.time + dt) % 1000;
    const center = this._c.copy(around);
    center.y = BOX.y * 0.5 - 2;

    // 뇌우 땐 빗줄기가 굵고 바람에 더 눕는다
    const vel = this._v.set(2.5 + w.storm * 5, -24 - w.storm * 6, 1.2 + w.storm * 2);
    this.rainDrift.addScaledVector(vel, dt);
    this.wrapDrift(this.rainDrift);
    const ru = this.rainMat.uniforms;
    ru.center.value.copy(center);
    ru.dir.value.copy(vel).normalize();
    ru.opacity.value = (0.32 + w.rain * 0.25) * (1 - night * 0.35);
    const rainN = Math.round(RAIN_MAX * w.rain);
    this.rain.visible = rainN > 0;
    this.rain.geometry.setDrawRange(0, rainN * 2);

    // 눈: 옆바람으로 흐르고, 떨어지는 거리는 눈송이마다 속도를 곱한다
    this.snowDrift.x += 0.6 * dt;
    this.snowDrift.z += 0.3 * dt;
    this.wrapDrift(this.snowDrift);
    const su = this.snowMat.uniforms;
    // 낙하 거리: 속도가 0.01 단위라 상자 높이 × 100 마다 감으면 모든 눈송이가 이음매 없이 이어진다
    su.fallen.value = (su.fallen.value + 1.6 * dt) % (BOX.y * 100);
    su.time.value = this.time;
    su.center.value.copy(center);
    su.opacity.value = 0.95 - night * 0.3;
    const snowN = Math.round(SNOW_MAX * w.snow);
    this.snow.visible = snowN > 0;
    this.snow.geometry.setDrawRange(0, snowN * 6);

    // 번개: 몇 초에 한 번, 두세 번 번쩍이고 사라진다
    if (w.storm > 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flashT = 0.6;
        this.nextBolt = 5 + (Math.random() * 12) / w.storm;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const t = 0.6 - this.flashT;
      // 0~0.08 번쩍, 0.15~0.22 한 번 더, 그 뒤 잦아든다
      this.flash = t < 0.08 ? 1 : t < 0.15 ? 0.25 : t < 0.22 ? 0.8 : Math.max(0, 1 - (t - 0.22) / 0.38) * 0.4;
    } else this.flash = 0;
  }

  private wrapDrift(d: THREE.Vector3) {
    d.x = ((d.x % BOX.x) + BOX.x) % BOX.x;
    d.y = ((d.y % BOX.y) + BOX.y) % BOX.y;
    d.z = ((d.z % BOX.z) + BOX.z) % BOX.z;
  }

  private _c = new THREE.Vector3();
  private _v = new THREE.Vector3();

  dispose() {
    for (const o of [this.rain, this.snow]) {
      o.removeFromParent();
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
