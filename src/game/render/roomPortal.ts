import * as THREE from 'three';

/**
 * 바깥에서 들여다보는 진짜 방: 빌라 창문에 실제 집 장면(가구 배치 그대로)을 비춘다.
 *
 * 원리 (포털): 바깥 창문과 방 안 창문을 '같은 구멍'으로 보고, 지금 카메라를 방 좌표로 옮긴 가상 카메라로
 * 집 장면을 따로 그린다 → 그 그림을 창문 사각형에 화면 좌표 그대로 붙인다.
 * 카메라가 움직이면 방 안이 원근에 맞게 보인다 (가까이 가면 안쪽 벽·가구가 깊이 있게).
 * 방 쪽 창문 바깥(창밖 풍경판·벽 바깥면)은 잘라 낸다.
 *
 * 바깥 창: 짙은 알루미늄 창틀 + 미닫이 유리 두 짝 (열면 오른쪽 짝이 왼쪽 짝 뒤로 미끄러진다).
 */
export interface PortalSpec {
  /** 창 크기 (방 창문과 같게, m) */
  width: number;
  height: number;
  /** 방 좌표에서 창문 가운데 (벽 면 위) */
  roomCenter: THREE.Vector3;
  /** 방 좌표에서 이 z 보다 바깥(작은 쪽)은 그리지 않는다 */
  clipZ: number;
}

const PortalShader = {
  vertexShader: /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tPortal;
    uniform vec2 invRes;
    uniform float live;
    uniform vec3 fallback;
    void main() {
      vec3 c = live > 0.5 ? texture2D(tPortal, gl_FragCoord.xy * invRes).rgb : fallback;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class RoomPortal {
  /** 바깥 창 (건물 그룹 안에 넣는다. 원점 = 창 가운데, 정면 = +z) */
  readonly group = new THREE.Group();
  private rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  private cam = new THREE.PerspectiveCamera();
  /** 바깥(도시) 좌표 → 방 좌표 */
  private roomFromWorld = new THREE.Matrix4();
  private clip: THREE.Plane;
  private quadMat: THREE.ShaderMaterial;
  private sash: THREE.Group;
  private sashClosedX: number;
  private sashOpenX: number;
  private center = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private box = new THREE.Box3();
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private disposables: { dispose(): void }[] = [];
  /** 바깥 창틀·유리 재질 (건물이 반투명해질 때 같이) */
  readonly mats: THREE.Material[] = [];

  constructor(
    private spec: PortalSpec,
    envMap: THREE.Texture | null,
  ) {
    const { width: W, height: H } = spec;
    this.cam.matrixAutoUpdate = false;
    this.cam.matrixWorldAutoUpdate = false;
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, 1), -spec.clipZ);
    this.rt.texture.generateMipmaps = false;
    this.disposables.push(this.rt);

    // 방이 비치는 사각형 (창틀 안쪽)
    this.quadMat = new THREE.ShaderMaterial({
      uniforms: {
        tPortal: { value: this.rt.texture },
        invRes: { value: new THREE.Vector2(1, 1) },
        live: { value: 0 },
        fallback: { value: new THREE.Color(0x1a1612) },
      },
      vertexShader: PortalShader.vertexShader,
      fragmentShader: PortalShader.fragmentShader,
    });
    const quadGeo = new THREE.PlaneGeometry(W, H);
    const quad = new THREE.Mesh(quadGeo, this.quadMat);
    quad.position.z = 0.004;
    quad.userData.keepMaterial = true;
    this.group.add(quad);
    this.disposables.push(this.quadMat, quadGeo);

    const std = (color: number, roughness: number, metalness: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.mats.push(m);
      return m;
    };
    const frame = std(0x2a2c30, 0.4, 0.6);
    const stone = std(0xcfcac0, 0.8, 0);
    const glass = new THREE.MeshStandardMaterial({
      color: 0xb4cad8,
      roughness: 0.04,
      metalness: 0.6,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      envMap,
      envMapIntensity: 0.9,
    });
    // 유리는 반투명 고정이라 건물 흐리기 목록에 넣지 않는다 (흐려질 땐 창 전체를 감춘다)
    const geos: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const g = new THREE.BoxGeometry(w, h, d);
      geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.userData.keepMaterial = true;
      parent.add(m);
      return m;
    };
    // 바깥 창틀 (벽에서 살짝 튀어나온 두꺼운 틀) + 돌 창턱
    const T = 0.09;
    box(W + T * 2, T, 0.16, frame, 0, H / 2 + T / 2, 0.06);
    box(W + T * 2, T, 0.16, frame, 0, -H / 2 - T / 2, 0.06);
    box(T, H, 0.16, frame, -W / 2 - T / 2, 0, 0.06);
    box(T, H, 0.16, frame, W / 2 + T / 2, 0, 0.06);
    box(W + 0.36, 0.06, 0.28, stone, 0, -H / 2 - T - 0.03, 0.12);

    // 미닫이 두 짝: 왼쪽 짝은 안쪽 레일(고정), 오른쪽 짝은 바깥 레일 (열면 왼쪽으로)
    const sw = W / 2 + 0.04;
    const sashOf = (z: number) => {
      const g = new THREE.Group();
      const s = 0.05;
      box(sw, s, 0.04, frame, 0, H / 2 - s / 2, 0, g);
      box(sw, s, 0.04, frame, 0, -H / 2 + s / 2, 0, g);
      box(s, H, 0.04, frame, -sw / 2 + s / 2, 0, 0, g);
      box(s, H, 0.04, frame, sw / 2 - s / 2, 0, 0, g);
      const pg = new THREE.PlaneGeometry(sw - s * 2, H - s * 2);
      geos.push(pg);
      const pane = new THREE.Mesh(pg, glass);
      pane.userData.keepMaterial = true;
      pane.renderOrder = 2;
      g.add(pane);
      g.position.z = z;
      this.group.add(g);
      return g;
    };
    const left = sashOf(0.03);
    left.position.x = -W / 2 + sw / 2;
    this.sash = sashOf(0.075);
    this.sashClosedX = W / 2 - sw / 2;
    this.sashOpenX = -W / 2 + sw / 2 + 0.12;
    this.sash.position.x = this.sashClosedX;
    this.disposables.push(...geos, ...this.mats, glass);
  }

  /**
   * 바깥 창이 도시 어디에 있는지 정해지면 (그룹을 건물에 넣고 자리를 잡은 뒤) 부른다.
   * 바깥 창 → 방 창이 되는 변환: 반 바퀴 돌린다 (밖에서 보는 쪽 = 방 안쪽)
   */
  place() {
    this.group.updateWorldMatrix(true, false);
    const world = this.group.matrixWorld;
    this.center.setFromMatrixPosition(world);
    this.normal.set(0, 0, 1).transformDirection(world);
    const { width: W, height: H } = this.spec;
    this.box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(W, H, 0.2)).applyMatrix4(world);
    // 방 좌표 = 방 창 가운데 + (y 축 반 바퀴) × 바깥 창 좌표
    const toRoom = new THREE.Matrix4().makeTranslation(this.spec.roomCenter.x, this.spec.roomCenter.y, this.spec.roomCenter.z).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    this.roomFromWorld.multiplyMatrices(toRoom, this.m.copy(world).invert());
  }

  /** 미닫이 (0 = 닫힘, 1 = 열림) */
  setOpen(t: number) {
    this.sash.position.x = this.sashClosedX + (this.sashOpenX - this.sashClosedX) * t;
  }

  /**
   * 창이 화면에 보이면 방을 그린다. 안 보이면 건너뛴다 (그 사이 창은 어두운 실내 색).
   * @param size 후처리 그림 크기 (화면 픽셀 = 그리기 버퍼)
   * @param force 보이는지 따지지 않고 그린다 (로딩 때 셰이더를 미리 만들어 두기)
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, room: THREE.Scene, size: THREE.Vector2, allow: boolean, force = false) {
    const u = this.quadMat.uniforms;
    let show = force || (allow && this.group.visible);
    if (show && !force) {
      // 창 앞쪽에서, 너무 멀지 않고, 화면 안에 있을 때만
      const toCam = camera.position.clone().sub(this.center);
      this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      show = toCam.dot(this.normal) > 0.05 && toCam.length() < 90 && this.frustum.intersectsBox(this.box);
    }
    u.live.value = show ? 1 : 0;
    if (!show) return false;

    // 방 해상도는 화면의 60% (창이 작아서 충분하다)
    const w = Math.max(4, Math.ceil(size.x * 0.6));
    const h = Math.max(4, Math.ceil(size.y * 0.6));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    u.invRes.value.set(1 / size.x, 1 / size.y);

    const cam = this.cam;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    cam.matrixWorld.multiplyMatrices(this.roomFromWorld, camera.matrixWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    const prevShadow = renderer.shadowMap.needsUpdate;
    // 집 그림자 지도는 다시 그리지 않는다 (가구는 그대로라 처음 그린 것을 쓴다) — 도시 그림자 차례도 지킨다
    renderer.shadowMap.needsUpdate = false;
    renderer.clippingPlanes = [this.clip];
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(room, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.clippingPlanes = prevClip;
    renderer.shadowMap.needsUpdate = prevShadow;
    return true;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
