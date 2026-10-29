import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Building } from "../city/cityMap";

/**
 * 공실 상가 건물 (근린생활시설, 4층): 행복빌라 옆에 새로 지은 통유리 상가. 아직 들어온 가게가 없다.
 *  - 정면: 밝은 석재 기둥·층 띠 + 층마다 통유리 (안쪽은 텅 빈 콘크리트 바닥·흰 벽이 원근에 맞게 보인다)
 *  - 1층: 점포 두 칸 (한 칸은 셔터 반쯤 내림) + 오른쪽 위층 계단 입구. 간판 틀은 비어 있고 옛 간판 자국만
 *  - 유리마다 '임대' 안내문, 2층 띠에 가로 현수막, 위층엔 세로 '전층 임대' 현수막
 *  - 밤: 빈 건물이라 창이 어둡다. 계단 입구 등만 켜진다
 * 건물 그룹 좌표계 (바닥 가운데 = 원점, 정면 = +z). 같은 재질끼리 합쳐 그리기 횟수를 줄인다.
 */
const FONT =
  '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif';
export const SHOP_GROUND_H = 4.2;
export const SHOP_FLOOR_H = 3.4;
const PHONE = "010-1234-5678";

function canvasTex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  repeat = false,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 큰 석재 판 (0.9 × 0.6 m 한 장, 판마다 색이 조금씩 다르다) — 2 × 2 장이 한 타일 */
export function stoneTexture(base: [number, number, number], seed: number) {
  return canvasTex(
    256,
    256,
    (g) => {
      let s = seed;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const k = (rnd() - 0.5) * 14;
          g.fillStyle = `rgb(${base[0] + k},${base[1] + k},${base[2] + k})`;
          g.fillRect(c * 128, r * 128, 128, 128);
          // 돌결 점
          for (let i = 0; i < 260; i++) {
            const a = rnd() * 0.08;
            g.fillStyle =
              rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
            g.fillRect(
              c * 128 + rnd() * 128,
              r * 128 + rnd() * 128,
              1 + rnd() * 2,
              1 + rnd() * 2,
            );
          }
        }
      }
      // 줄눈
      g.fillStyle = "rgba(0,0,0,0.28)";
      for (const p of [0, 128]) {
        g.fillRect(p, 0, 2, 256);
        g.fillRect(0, p, 256, 2);
      }
    },
    true,
  );
}

/** 상자 면마다 uv 를 실제 크기(m) / 한 타일 크기로 (석재 무늬가 늘어나지 않게) */
export function realUV(
  geo: THREE.BoxGeometry,
  w: number,
  h: number,
  d: number,
  tw: number,
  th: number,
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  faces.forEach(([fu, fv], f) => {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * fu) / tw, (uv.getY(i) * fv) / th);
    }
  });
  return geo;
}

/** 유리에 붙인 '임대' 종이 */
function rentPoster(big: boolean) {
  return canvasTex(512, big ? 360 : 720, (g) => {
    const W = 512;
    const H = big ? 360 : 720;
    g.fillStyle = "#fbfaf6";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#d62a2a";
    g.lineWidth = 10;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.fillStyle = "#d62a2a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${big ? 190 : 210}px ${FONT}`;
    if (big) g.fillText("임 대", W / 2, H * 0.42);
    else {
      g.fillText("임", W / 2, H * 0.2);
      g.fillText("대", W / 2, H * 0.47);
    }
    g.fillStyle = "#222";
    g.font = `700 ${big ? 44 : 50}px ${FONT}`;
    g.fillText("문의", W / 2, big ? H * 0.74 : H * 0.7);
    g.font = `800 ${big ? 46 : 52}px ${FONT}`;
    g.fillText(PHONE, W / 2, big ? H * 0.87 : H * 0.82);
  });
}

/** 2층 띠에 묶은 가로 현수막 */
function bannerTexture(aspect: number) {
  const W = 2048;
  const H = Math.round(W / aspect);
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1f4fb8";
    g.fillRect(0, 0, W, H * 0.08);
    g.fillRect(0, H * 0.92, W, H * 0.08);
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillStyle = "#d62a2a";
    g.font = `900 ${Math.round(H * 0.56)}px ${FONT}`;
    const a = "상가·사무실 임대";
    g.fillText(a, W * 0.04, H * 0.52);
    const aw = g.measureText(a).width;
    g.fillStyle = "#1f4fb8";
    g.font = `800 ${Math.round(H * 0.3)}px ${FONT}`;
    g.fillText("1층~4층 · 신축 · 즉시입주", W * 0.06 + aw, H * 0.34);
    g.fillStyle = "#111";
    g.font = `900 ${Math.round(H * 0.36)}px ${FONT}`;
    g.fillText(`☎ ${PHONE}`, W * 0.06 + aw, H * 0.7);
  });
}

/** 세로 현수막: '전층 임대' */
function verticalBanner() {
  const W = 220;
  const H = 1000;
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#ffd400";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#d62a2a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 150px ${FONT}`;
    ["전", "층", "임", "대"].forEach((ch, i) =>
      g.fillText(ch, W / 2, 110 + i * 175),
    );
    g.fillStyle = "#111";
    g.font = `800 34px ${FONT}`;
    g.save();
    g.translate(W / 2, H - 120);
    g.fillText("☎ 문의", 0, -24);
    g.font = `800 30px ${FONT}`;
    g.fillText(PHONE, 0, 22);
    g.restore();
  });
}

/** 비어 있는 간판 틀: 떼어 낸 옛 간판 자국과 나사 구멍만 */
function blankSign(aspect: number, ghost: string) {
  const W = 1024;
  const H = Math.round(W / aspect);
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#c9cbcd";
    g.fillRect(0, 0, W, H);
    // 옛 간판 자리: 둘레보다 덜 바랜 사각형
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(W * 0.08, H * 0.16, W * 0.84, H * 0.68);
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 ${Math.round(H * 0.5)}px ${FONT}`;
    g.fillText(ghost, W / 2, H / 2);
    g.fillStyle = "rgba(40,40,40,0.55)";
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const y of [0.2, 0.8]) {
        g.beginPath();
        g.arc(W * x, H * y, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 빗물 자국
    for (let i = 0; i < 9; i++) {
      const x = ((i * 137) % 97) / 97;
      const grd = g.createLinearGradient(0, H * 0.8, 0, H);
      grd.addColorStop(0, "rgba(60,60,60,0.12)");
      grd.addColorStop(1, "rgba(60,60,60,0)");
      g.fillStyle = grd;
      g.fillRect(W * x, H * 0.8, 6, H * 0.2);
    }
  });
}

/** 계단 입구 층별 안내판 */
function directoryTexture(floors: number) {
  const W = 256;
  const H = 384;
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#2b2e33";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#e9e6df";
    g.textBaseline = "middle";
    g.font = `800 30px ${FONT}`;
    g.textAlign = "center";
    g.fillText("층별 안내", W / 2, 36);
    const rowH = (H - 80) / floors;
    for (let f = floors; f >= 1; f--) {
      const y = 76 + (floors - f) * rowH + rowH / 2;
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(14, y - rowH / 2 + 4, W - 28, rowH - 8);
      g.textAlign = "left";
      g.fillStyle = "#ffd400";
      g.font = `800 32px ${FONT}`;
      g.fillText(`${f}F`, 26, y);
      g.fillStyle = "#c9c6bf";
      g.font = `700 26px ${FONT}`;
      g.fillText("임대 문의", 92, y);
    }
  });
}

/** 접이식 셔터 (골판 무늬) */
function shutterTexture() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = "#a9adb2";
      g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 8) {
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(0, y, 64, 2);
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(0, y + 6, 64, 2);
      }
    },
    true,
  );
}

export function buildVacantShop(b: Building, envMap: THREE.Texture | null) {
  const { w, h, d } = b;
  const group = new THREE.Group();
  const upperFloors = Math.max(
    1,
    Math.round((h - SHOP_GROUND_H) / SHOP_FLOOR_H),
  );
  const floors = upperFloors + 1;
  const base = (f: number) =>
    f <= 1 ? 0 : SHOP_GROUND_H + (f - 2) * SHOP_FLOOR_H;
  const front = d / 2;
  /** 통유리 면 (기둥보다 안쪽으로 들어간 자리) */
  const glassZ = front - 0.42;
  /** 빈 실내 깊이 */
  const roomD = 3.6;
  const textures: THREE.Texture[] = [];
  const keep = (t: THREE.Texture) => (textures.push(t), t);

  // ── 재질 ──
  const stoneTex = keep(stoneTexture([214, 209, 199], 7));
  const graniteTex = keep(stoneTexture([82, 84, 88], 11));
  // 건물마다 석재 색을 조금씩 다르게 (b.color 로 물들인다)
  const stone = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.78,
    color: b.color,
  });
  const granite = new THREE.MeshStandardMaterial({
    map: graniteTex,
    roughness: 0.45,
    metalness: 0.05,
  });
  const alu = new THREE.MeshStandardMaterial({
    color: 0x33363b,
    roughness: 0.35,
    metalness: 0.7,
    envMap,
    envMapIntensity: 0.8,
  });
  const plaster = new THREE.MeshStandardMaterial({
    color: 0xeeebe4,
    roughness: 0.95,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xa8a49c,
    roughness: 0.9,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: 0x8e9093,
    roughness: 0.95,
  });
  const shutter = new THREE.MeshStandardMaterial({
    map: keep(shutterTexture()),
    roughness: 0.5,
    metalness: 0.4,
  });
  const cardboard = new THREE.MeshStandardMaterial({
    color: 0xb98d5a,
    roughness: 0.95,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fb4c0,
    roughness: 0.05,
    metalness: 0.55,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    envMap,
    envMapIntensity: 1.1,
  });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xf4efe2,
    emissive: 0xffe2b0,
    emissiveIntensity: 0,
    roughness: 0.4,
  });

  // 같은 재질끼리 모았다가 끝에 하나로 합친다
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    const list = parts.get(mat) ?? [];
    list.push(geo);
    parts.set(mat, list);
  };
  /** 석재 상자 (무늬가 실제 크기로) */
  const slab = (
    mat: THREE.Material,
    bw: number,
    bh: number,
    bd: number,
    x: number,
    y: number,
    z: number,
  ) =>
    put(
      mat,
      realUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd, 1.8, 1.2),
      x,
      y,
      z,
    );
  const boxAt = (
    mat: THREE.Material,
    bw: number,
    bh: number,
    bd: number,
    x: number,
    y: number,
    z: number,
  ) => put(mat, new THREE.BoxGeometry(bw, bh, bd), x, y, z);

  // ── 몸체: 뒤쪽은 꽉 찬 상자, 앞쪽 roomD 만큼은 비어 있는 실내 (앞면 = 실내 안쪽 벽) ──
  const coreD = d - roomD - 0.42;
  const coreZ = -d / 2 + coreD / 2;
  const core = realUV(
    new THREE.BoxGeometry(w, h, coreD),
    w,
    h,
    coreD,
    1.8,
    1.2,
  );
  // 앞면(+z) 은 실내 흰 벽: 따로 판으로 덮는다
  put(stone, core, 0, h / 2, coreZ);
  const backWallZ = coreZ + coreD / 2 + 0.005;
  for (let f = 1; f <= floors; f++) {
    const y0 = base(f);
    const fh = f === 1 ? SHOP_GROUND_H : SHOP_FLOOR_H;
    put(
      plaster,
      new THREE.PlaneGeometry(w - 0.6, fh - 0.35),
      0,
      y0 + (fh - 0.35) / 2,
      backWallZ,
    );
  }
  // 옆벽 (실내 양옆)
  const sideD = roomD + 0.42;
  const sideZ = front - sideD / 2;
  for (const s of [-1, 1])
    slab(stone, 0.3, h, sideD, s * (w / 2 - 0.15), h / 2, sideZ);
  // 실내 양옆 안쪽 면 (흰 벽)
  for (const s of [-1, 1]) {
    const p = new THREE.PlaneGeometry(roomD, h);
    put(
      plaster,
      p,
      s * (w / 2 - 0.305),
      h / 2,
      front - 0.42 - roomD / 2,
      -s * (Math.PI / 2),
    );
  }
  // 층 바닥판 (위 = 콘크리트 바닥, 아래 = 천장)
  for (let f = 1; f <= floors; f++) {
    const y = base(f);
    boxAt(
      concrete,
      w - 0.6,
      0.3,
      roomD,
      0,
      y + (f === 1 ? 0.02 : -0.15),
      front - 0.42 - roomD / 2,
    );
  }
  // 지붕판 + 옥상 바닥 (방수 도장 회색)
  boxAt(roof, w - 0.6, 0.3, roomD, 0, h - 0.15, front - 0.42 - roomD / 2);
  put(
    roof,
    new THREE.PlaneGeometry(w - 0.4, d - 0.4).rotateX(-Math.PI / 2),
    0,
    h + 0.012,
    0,
  );

  // ── 정면 석재: 양쪽 기둥 (1층은 짙은 화강석) + 층 띠 + 옥상 난간 ──
  const pilW = w < 6 ? 0.4 : 0.62;
  const pilD = 0.5;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - pilW / 2);
    slab(
      granite,
      pilW,
      SHOP_GROUND_H - 0.3,
      pilD,
      x,
      (SHOP_GROUND_H - 0.3) / 2,
      front - pilD / 2,
    );
    slab(
      stone,
      pilW,
      h - SHOP_GROUND_H + 0.3 + 0.9,
      pilD,
      x,
      (SHOP_GROUND_H - 0.3 + h + 0.9) / 2,
      front - pilD / 2,
    );
  }
  // 위층 띠: 각 층 바닥 아래 0.3 ~ 창턱 0.85
  for (let f = 2; f <= floors; f++) {
    const y0 = base(f) - 0.3;
    slab(stone, w - pilW * 2, 1.15, 0.36, 0, y0 + 0.575, front - 0.18);
  }
  // 옥상 난간 (앞) + 갓돌
  slab(stone, w - pilW * 2, 1.15, 0.36, 0, h + 0.9 - 0.575, front - 0.18);
  boxAt(alu, w + 0.06, 0.06, 0.6, 0, h + 0.93, front - 0.3);
  // 옥상 난간 (옆·뒤, 낮게)
  for (const s of [-1, 1])
    slab(stone, 0.2, 0.9, d - 0.6, s * (w / 2 - 0.1), h + 0.45, -0.3);
  slab(stone, w, 0.9, 0.2, 0, h + 0.45, -d / 2 + 0.1);

  // ── 위층 통유리: 알루미늄 멀리언 + 가로 창살 ──
  const gx0 = -w / 2 + pilW;
  const gx1 = w / 2 - pilW;
  const gw = gx1 - gx0;
  const panes = Math.max(2, Math.round(gw / 1.5));
  for (let f = 2; f <= floors; f++) {
    const y0 = base(f) + 0.85;
    const y1 = base(f) + SHOP_FLOOR_H - 0.3;
    const gh = y1 - y0;
    put(glass, new THREE.PlaneGeometry(gw, gh), 0, (y0 + y1) / 2, glassZ);
    for (let i = 1; i < panes; i++)
      boxAt(alu, 0.06, gh, 0.12, gx0 + (gw * i) / panes, (y0 + y1) / 2, glassZ);
    // 아래 고정창 / 위 여닫이창 나누는 가로살
    boxAt(alu, gw, 0.06, 0.12, 0, y0 + gh * 0.72, glassZ);
  }

  // ── 1층: 넓은 건물은 점포 둘 + 위층 계단 입구, 좁은 건물은 점포 하나 ──
  const wide = w >= 7;
  const lobbyW = 1.7;
  const colW = 0.36;
  const lx1 = gx1;
  const lx0 = lx1 - lobbyW;
  const midCol = (gx0 + lx0 - colW) / 2;
  const units: [number, number][] = wide
    ? [
        [gx0, midCol - colW / 2],
        [midCol + colW / 2, lx0 - colW],
      ]
    : [[gx0, gx1]];
  // 점포 사이 기둥 · 계단 입구 옆 기둥 (화강석)
  if (wide) {
    slab(
      granite,
      colW,
      SHOP_GROUND_H - 0.3,
      0.3,
      midCol,
      (SHOP_GROUND_H - 0.3) / 2,
      front - 0.27,
    );
    slab(
      granite,
      colW,
      SHOP_GROUND_H - 0.3,
      0.3,
      lx0 - colW / 2,
      (SHOP_GROUND_H - 0.3) / 2,
      front - 0.27,
    );
  }
  // 간판 띠 (짙은 금속 틀) — 1층 위쪽 3.05 ~ 3.9
  const signY0 = 3.05;
  const signY1 = SHOP_GROUND_H - 0.3;
  boxAt(
    alu,
    w - pilW * 2,
    signY1 - signY0,
    0.3,
    0,
    (signY0 + signY1) / 2,
    front - 0.27,
  );
  const shopGlassY1 = signY0;

  const flat: { mesh: THREE.Mesh; tex?: THREE.Texture }[] = [];
  const paper = (
    tex: THREE.Texture,
    pw: number,
    ph: number,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ) => {
    keep(tex);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    flat.push({ mesh: m, tex });
    return m;
  };

  const GHOSTS = ["CAFE", "부동산", "PC방", "편의점", "치킨", "HAIR", "분식"];
  const ghosts = units.map((_, i) => GHOSTS[(b.id * 3 + i) % GHOSTS.length]);
  /** 셔터를 반쯤 내린 점포 (건물마다 다르게, 없을 수도) */
  const shutterAt = b.id % (units.length + 1);
  units.forEach(([x0, x1], i) => {
    const uw = x1 - x0;
    const cx = (x0 + x1) / 2;
    // 빈 간판 틀
    paper(
      blankSign(uw / (signY1 - signY0 - 0.16), ghosts[i]),
      uw - 0.12,
      signY1 - signY0 - 0.16,
      cx,
      (signY0 + signY1) / 2,
      front - 0.115,
    );
    // 진열창 유리 + 아래 걸레받이 + 틀
    put(
      glass,
      new THREE.PlaneGeometry(uw, shopGlassY1 - 0.3),
      cx,
      0.3 + (shopGlassY1 - 0.3) / 2,
      glassZ,
    );
    boxAt(alu, uw, 0.3, 0.1, cx, 0.15, glassZ);
    boxAt(alu, uw, 0.08, 0.12, cx, shopGlassY1 - 0.04, glassZ);
    boxAt(alu, uw, 0.06, 0.12, cx, 2.35, glassZ);
    // 가운데 유리문 (문틀 + 손잡이 막대)
    const dw = Math.min(1.8, uw * 0.5);
    for (const s of [-1, 1])
      boxAt(alu, 0.07, 2.35, 0.12, cx + (s * dw) / 2, 2.35 / 2, glassZ);
    boxAt(alu, 0.04, 0.04, 0.04, cx, 2.35, glassZ);
    for (const s of [-1, 1]) {
      const bar = new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8);
      put(alu, bar, cx + s * 0.12, 1.1, glassZ + 0.07);
    }
    // 진열창 양쪽 세로살
    for (const s of [-1, 1]) {
      const x = cx + s * (dw / 2 + (uw - dw) / 4);
      if (Math.abs(x - cx) < uw / 2 - 0.2)
        boxAt(
          alu,
          0.05,
          shopGlassY1 - 0.3,
          0.1,
          x,
          0.3 + (shopGlassY1 - 0.3) / 2,
          glassZ,
        );
    }
    // 임대 안내문 (문 양쪽 유리, 안쪽에서 붙인 종이)
    paper(
      rentPoster(false),
      0.42,
      0.6,
      cx - dw / 2 - 0.42,
      1.45,
      glassZ - 0.01,
    );
    paper(rentPoster(true), 0.7, 0.5, cx + 0.32, 1.55, glassZ - 0.01);
    // 점포 A 는 셔터를 반쯤 내렸다
    if (i === shutterAt) {
      const sh = 1.25;
      const sg = new THREE.PlaneGeometry(uw, sh);
      const uv = sg.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, uv.getX(k) * uw, uv.getY(k) * sh * 5);
      put(shutter, sg, cx, shopGlassY1 - sh / 2, glassZ + 0.1);
      boxAt(alu, uw + 0.1, 0.08, 0.14, cx, shopGlassY1 - sh, glassZ + 0.1);
      // 셔터 상자
      boxAt(alu, uw + 0.1, 0.3, 0.3, cx, shopGlassY1 + 0.05, glassZ + 0.12);
    }
  });
  // 빈 점포 안: 접은 박스 더미 (마지막 점포 안쪽)
  {
    const [x0] = units[units.length - 1];
    for (let k = 0; k < 4; k++) {
      const bw = 0.5 + (k % 2) * 0.15;
      boxAt(
        cardboard,
        bw,
        0.38,
        0.45,
        x0 + 0.6 + (k > 1 ? 0.25 : 0),
        0.19 + 0.17 + Math.floor(k / 2) * 0.38,
        front - 0.42 - roomD + 0.5 + (k % 2) * 0.1,
      );
    }
  }

  // 계단 입구: 짙은 철문 + 작은 창 + 층별 안내판 + 문 위 등 (넓은 건물만)
  if (wide) {
    const lcx = (lx0 + lx1) / 2;
    const lobbyZ = front - 0.55;
    boxAt(alu, lobbyW, signY1, 0.08, lcx, signY1 / 2, lobbyZ - 0.06);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x4b4f55,
      roughness: 0.5,
      metalness: 0.5,
    });
    boxAt(doorMat, 1.0, 2.2, 0.06, lcx - 0.15, 1.1, lobbyZ);
    put(
      glass,
      new THREE.PlaneGeometry(0.22, 1.2),
      lcx - 0.15,
      1.35,
      lobbyZ + 0.035,
    );
    boxAt(alu, 0.03, 0.3, 0.04, lcx + 0.25, 1.05, lobbyZ + 0.06);
    boxAt(lamp, 0.36, 0.08, 0.18, lcx - 0.15, 2.55, lobbyZ + 0.05);
    paper(
      directoryTexture(floors),
      0.36,
      0.54,
      lcx + 0.55,
      1.55,
      lobbyZ + 0.04,
    );
    // 주소판
    const addr = canvasTex(256, 96, (g) => {
      g.fillStyle = "#1f4fb8";
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `800 34px ${FONT}`;
      g.fillText("한강로 10", 128, 36);
      g.font = `600 20px ${FONT}`;
      g.fillText("HANGANG-RO 10", 128, 72);
    });
    paper(addr, 0.42, 0.16, lcx + 0.55, 2.2, lobbyZ + 0.04);
  }

  // ── 현수막: 2층 띠에 가로로, 위층 오른쪽에 세로로 ──
  const bw = w - pilW * 2 - 0.5;
  const bh = 0.82;
  paper(bannerTexture(bw / bh), bw, bh, 0, base(2) + 0.25, front + 0.01);
  if (floors >= 3 && w >= 4) {
    const vh = Math.min(5.2, h - base(3) - 0.6);
    // 기둥 바로 옆, 층 띠 앞에 늘어뜨린다
    paper(
      verticalBanner(),
      vh * 0.22,
      vh,
      gx1 - 0.45,
      base(3) + 0.45 + vh / 2,
      front + 0.03,
    );
  }
  // 위층 유리마다 '임대' 종이 한두 장
  for (let f = 2; f <= floors; f++) {
    const y = base(f) + 1.6;
    const n = f % 2 ? 2 : 1;
    for (let k = 0; k < n; k++)
      paper(
        rentPoster(true),
        0.84,
        0.6,
        gx0 + gw * (0.2 + k * 0.38),
        y,
        glassZ - 0.01,
      );
  }

  // ── 옥상: 계단실 + 실외기 ──
  slab(stone, 3.2, 2.6, 3.0, -w / 2 + 2.0, h + 1.3, -d / 2 + 2.0);
  const acs = Math.min(3, Math.floor((w - 0.8) / 1.1));
  for (let k = 0; k < acs; k++)
    boxAt(alu, 0.9, 0.7, 0.4, w / 2 - 0.85 - k * 1.1, h + 0.35, -d / 2 + 1.0);

  // ── 합치기 ──
  const mats: THREE.MeshStandardMaterial[] = [];
  for (const [mat, list] of parts) {
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(geo, mat);
    const isGlass = mat === glass;
    mesh.castShadow = !isGlass;
    mesh.receiveShadow = !isGlass;
    mesh.userData.keepMaterial = true;
    if (isGlass) mesh.renderOrder = 2;
    group.add(mesh);
    if (!isGlass) mats.push(mat as THREE.MeshStandardMaterial);
  }
  for (const { mesh } of flat) {
    mesh.userData.keepMaterial = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    mats.push(mesh.material as THREE.MeshStandardMaterial);
  }
  return { group, mats, glow: [lamp], textures, glass };
}
