import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KARAOKE_NAME, stairDoorSpan, type Building } from "../city/cityMap";
import { PET_BY_ID, PET_SHOP_NAME } from "../data/pets";
import { CLOTHES_SHOP_NAME } from "../data/fashion";
import { FISHING_SHOP_NAME } from "../data/fishing";
import { animatePet, buildPet, disposePet } from "./petKit";

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
function bannerTexture(aspect: number, floorsText = "1층~4층") {
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
    g.fillText(`${floorsText} · 신축 · 즉시입주`, W * 0.06 + aw, H * 0.34);
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

/** 펫샵 간판: 민트 바탕 + 발자국 + 가게 이름 */
function petSignTexture(aspect: number) {
  const W = 1024;
  const H = Math.max(160, Math.round(W / aspect));
  return canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#5fd3b8");
    grd.addColorStop(1, "#2fae93");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${Math.round(H * 0.5)}px ${FONT}`;
    const fit = Math.min(1, (W * 0.72) / g.measureText(PET_SHOP_NAME).width);
    g.font = `900 ${Math.round(H * 0.5 * fit)}px ${FONT}`;
    g.fillText(PET_SHOP_NAME, W * 0.56, H * 0.46);
    g.font = `700 ${Math.round(H * 0.17 * Math.max(fit, 0.7))}px ${FONT}`;
    g.fillStyle = "#fff7c2";
    g.fillText("분양 · 용품 · 미용", W * 0.56, H * 0.84);
    paw(g, W * 0.1, H * 0.5, H * 0.32, "#ffffff");
  });
}

/** 옷가게 간판: 검은 바탕 + 금색 글씨 + 옷걸이 */
function clothesSignTexture(aspect: number) {
  const W = 1024;
  const H = Math.max(160, Math.round(W / aspect));
  return canvasTex(W, H, (g) => {
    g.fillStyle = "#1d1e22";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#e0b44a";
    g.lineWidth = H * 0.04;
    g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
    g.fillStyle = "#f2d38a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${Math.round(H * 0.42)}px ${FONT}`;
    g.fillText(CLOTHES_SHOP_NAME, W * 0.56, H * 0.44);
    g.font = `700 ${Math.round(H * 0.15)}px ${FONT}`;
    g.fillStyle = "#ffffff";
    g.fillText("FASHION · BATTLE GEAR", W * 0.56, H * 0.8);
    // 옷걸이
    const x = W * 0.11;
    const y = H * 0.5;
    const s = H * 0.3;
    g.strokeStyle = "#f2d38a";
    g.lineWidth = H * 0.035;
    g.beginPath();
    g.arc(x, y - s * 0.75, s * 0.18, Math.PI, Math.PI * 2.4);
    g.moveTo(x, y - s * 0.55);
    g.lineTo(x - s, y + s * 0.3);
    g.lineTo(x + s, y + s * 0.3);
    g.closePath();
    g.stroke();
  });
}

/** 낚시점 간판: 짙은 파랑 바탕 + 흰 글씨 + 물고기 */
function fishingSignTexture(aspect: number) {
  const W = 1024;
  const H = Math.max(160, Math.round(W / aspect));
  return canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#2a7ab8");
    grd.addColorStop(1, "#174d78");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // 물결 무늬
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = H * 0.03;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 16) g.lineTo(x, H * (0.78 + k * 0.08) + Math.sin(x / 40 + k) * H * 0.025);
      g.stroke();
    }
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${Math.round(H * 0.4)}px ${FONT}`;
    g.fillText(FISHING_SHOP_NAME, W * 0.57, H * 0.42);
    g.font = `700 ${Math.round(H * 0.15)}px ${FONT}`;
    g.fillStyle = "#ffe08a";
    g.fillText("낚싯대 · 미끼 · 활어 수매", W * 0.57, H * 0.76);
    // 물고기 (몸 + 꼬리 + 눈)
    const x = W * 0.1;
    const y = H * 0.45;
    const s = H * 0.28;
    g.fillStyle = "#ffe08a";
    g.beginPath();
    g.ellipse(x, y, s, s * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x - s * 0.8, y);
    g.lineTo(x - s * 1.5, y - s * 0.5);
    g.lineTo(x - s * 1.5, y + s * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = "#174d78";
    g.beginPath();
    g.arc(x + s * 0.5, y - s * 0.1, s * 0.1, 0, Math.PI * 2);
    g.fill();
  });
}

/** 낚시점 유리 광고 */
function fishingPoster(big: string, small: string) {
  return canvasTex(360, 512, (g) => {
    g.fillStyle = big === "수매" ? "#c0392b" : "#174d78";
    g.fillRect(0, 0, 360, 512);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 104px ${FONT}`;
    g.fillText(big, 180, 200);
    g.font = `800 36px ${FONT}`;
    g.fillStyle = "#ffe08a";
    g.fillText(small, 180, 320);
    g.font = `700 26px ${FONT}`;
    g.fillStyle = "#ffffff";
    g.fillText(FISHING_SHOP_NAME, 180, 452);
  });
}

/** 낚시점 진열창 너머: 벽에 세운 낚싯대들 · 미끼 냉장고 불빛 · 계산대 */
function buildFishingFront(w: number, depth: number, ceilY: number, keep: (t: THREE.Texture) => THREE.Texture) {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: new THREE.Color(color).multiplyScalar(0.18), ...extra });
    mats.push(m);
    return m;
  };
  const put = (m: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geo.translate(x, y, z);
    const list = parts.get(m) ?? [];
    list.push(geo);
    parts.set(m, list);
  };
  const box = (m: THREE.Material, bw: number, bh: number, bd: number, x: number, y: number, z: number) => put(m, new THREE.BoxGeometry(bw, bh, bd), x, y, z);
  const floorTex = keep(woodFloorTexture());
  floorTex.repeat.set(w / 2, depth / 2);
  put(std(0xffffff, { map: floorTex, emissive: 0x2a2a28, roughness: 0.6 }), new THREE.PlaneGeometry(w, depth).rotateX(-Math.PI / 2), 0, 0.2, depth / 2);
  box(std(0xe9eef0), w, ceilY - 0.25, 0.04, 0, 0.2 + (ceilY - 0.25) / 2, 0.07);
  const light = new THREE.MeshBasicMaterial({ color: 0xf0f8ff });
  for (const z of [depth * 0.3, depth * 0.72]) box(light, w * 0.7, 0.04, 0.35, 0, ceilY - 0.04, z);
  // 뒷벽 나무 판 + 낚싯대 여덟 자루 (색이 다르다)
  box(std(0x4a3322), w - 0.3, 2.0, 0.05, 0, 0.2 + 1.1, 0.12);
  const rodCols = [0xc8a25a, 0x2b2d33, 0x1f5fbf, 0xb3261e, 0xd4a017, 0x2b2d33, 0x1f5fbf, 0xc8a25a];
  const n = Math.max(4, Math.floor((w - 0.6) / 0.3));
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + 0.45 + (k * (w - 0.9)) / (n - 1);
    put(std(rodCols[k % rodCols.length], { roughness: 0.35 }), new THREE.CylinderGeometry(0.008, 0.016, 1.9, 6).rotateZ(0.04), x, 0.2 + 0.25 + 0.95, 0.2);
    put(std(0xc49a6c), new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), x - 0.03, 0.2 + 0.42, 0.2);
  }
  // 오른쪽: 미끼 냉장고 (불빛)
  const glow = new THREE.MeshBasicMaterial({ color: 0xbfe6ff });
  box(std(0xdfe3e7), 0.7, 1.9, 0.6, w / 2 - 0.5, 0.2 + 0.95, depth * 0.45);
  box(glow, 0.6, 1.6, 0.02, w / 2 - 0.5, 0.2 + 1.0, depth * 0.45 + 0.31);
  // 계산대 + 수조 (앞쪽 가운데)
  box(std(0x1f5f8b), 1.3, 0.95, 0.5, -w / 2 + 1.0, 0.2 + 0.475, depth * 0.62);
  box(std(0x5fb4d9, { emissive: 0x1d6f96, transparent: true, opacity: 0.75 }), 1.1, 0.55, 0.45, 0.2, 0.2 + 1.0, depth * 0.55);
  box(std(0x2a2e33), 1.14, 0.75, 0.49, 0.2, 0.2 + 0.375, depth * 0.55);
  for (const [m, list] of parts) {
    if (!list.length) continue;
    const flat = list.map((g) => {
      if (!g.index) return g;
      const nn = g.toNonIndexed();
      g.dispose();
      return nn;
    });
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const geo = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.userData.keepMaterial = true;
    group.add(mesh);
  }
  void light;
  return { group, mats: mats.filter((m) => parts.get(m)?.length) };
}

/** 옷가게 유리 광고 */
function clothesPoster(big: string, small: string) {
  return canvasTex(360, 512, (g) => {
    g.fillStyle = big === "SALE" ? "#c0392b" : "#1d1e22";
    g.fillRect(0, 0, 360, 512);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 96px ${FONT}`;
    g.fillText(big, 180, 210);
    g.font = `800 44px ${FONT}`;
    g.fillStyle = "#f2d38a";
    g.fillText(small, 180, 330);
    g.font = `700 28px ${FONT}`;
    g.fillStyle = "#ffffff";
    g.fillText(CLOTHES_SHOP_NAME, 180, 452);
  });
}

/** 발바닥 모양 (가운데 큰 볼록 + 발가락 넷) */
function paw(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y + s * 0.18, s * 0.34, s * 0.28, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [
    [-0.42, -0.15],
    [-0.15, -0.42],
    [0.15, -0.42],
    [0.42, -0.15],
  ]) {
    g.beginPath();
    g.ellipse(x + dx * s, y + dy * s, s * 0.13, s * 0.16, dx * 0.6, 0, Math.PI * 2);
    g.fill();
  }
}

/** 펫샵 유리 광고 (발자국 + 한 줄) */
function petPoster(text: string) {
  return canvasTex(360, 512, (g) => {
    g.fillStyle = "#fffaf0";
    g.fillRect(0, 0, 360, 512);
    g.fillStyle = "#2fae93";
    g.fillRect(0, 0, 360, 26);
    g.fillRect(0, 486, 360, 26);
    paw(g, 180, 190, 190, "#f29a6b");
    g.fillStyle = "#2b2b2b";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${text.length > 3 ? 62 : 84}px ${FONT}`;
    g.fillText(text, 180, 390);
    g.font = `700 30px ${FONT}`;
    g.fillStyle = "#2fae93";
    g.fillText(PET_SHOP_NAME, 180, 452);
  });
}

/** 나뭇결 바닥 타일 */
function woodFloorTexture() {
  return canvasTex(
    256,
    256,
    (g) => {
      for (let r = 0; r < 8; r++) {
        const off = (r % 2) * 64;
        for (let c = -1; c < 3; c++) {
          const k = (((r * 7 + c * 13) % 9) + 9) % 9 - 4;
          g.fillStyle = `rgb(${214 + k * 3},${184 + k * 3},${140 + k * 2})`;
          g.fillRect(off + c * 128, r * 32, 128, 32);
          g.fillStyle = "rgba(90,60,30,0.25)";
          g.fillRect(off + c * 128, r * 32, 2, 32);
        }
        g.fillStyle = "rgba(90,60,30,0.25)";
        g.fillRect(0, r * 32, 256, 1);
      }
    },
    true,
  );
}

/**
 * 펫샵 매장 안 (원점 = 안쪽 벽 가운데 바닥, +z = 유리 쪽).
 * 뒷벽 진열장(두 줄 × 세 칸)에 강아지·고양이·햄스터·토끼 · 오른쪽 계산대 · 왼쪽 어항 · 사료 더미 · 밝은 천장 등.
 * 정적인 물체는 재질(색)별로 합쳐서 그리기 횟수를 줄인다.
 */
function buildPetInterior(w: number, depth: number, ceilY: number, keep: (t: THREE.Texture) => THREE.Texture) {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
    mats.push(m);
    return m;
  };
  const put = (m: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geo.translate(x, y, z);
    const list = parts.get(m) ?? [];
    list.push(geo);
    parts.set(m, list);
  };
  const box = (m: THREE.Material, bw: number, bh: number, bd: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(bw, bh, bd), x, y, z);

  // 실내는 늘 불이 켜져 있다: 살짝 스스로 빛나게
  const floorTex = keep(woodFloorTexture());
  floorTex.repeat.set(w / 2, depth / 2);
  const floor = std(0xffffff, { map: floorTex, emissive: 0x3a2a18, roughness: 0.6 });
  put(floor, new THREE.PlaneGeometry(w, depth).rotateX(-Math.PI / 2), 0, 0.2, depth / 2);
  const mint = std(0xbfe8da, { emissive: 0x1f3a33 });
  box(mint, w, ceilY - 0.25, 0.04, 0, 0.2 + (ceilY - 0.25) / 2, 0.07);
  const white = std(0xf6f4ef, { emissive: 0x2a2a28 });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (const z of [depth * 0.3, depth * 0.72]) box(light, w * 0.7, 0.04, 0.35, 0, ceilY - 0.04, z);

  // 뒷벽 진열장: 아래 수납장 + 칸막이 두 줄
  const cols = 3;
  const cellW = Math.min(0.8, (w - 0.2) / cols);
  const shelfW = cellW * cols;
  const shelfD = 0.55;
  const shelfZ = 0.09 + shelfD / 2;
  box(white, shelfW + 0.06, 0.75, shelfD, 0, 0.2 + 0.375, shelfZ);
  const rowY = [0.95, 1.6];
  const rowH = 0.6;
  for (const y of [...rowY, rowY[1] + rowH]) box(white, shelfW + 0.06, 0.04, shelfD, 0, y, shelfZ);
  for (let c = 0; c <= cols; c++) box(white, 0.04, rowH * 2 + 0.04, shelfD, -shelfW / 2 + c * cellW, rowY[0] + rowH, shelfZ);
  // 칸마다 푹신한 방석 + 아이
  const cushion = [std(0xf2b8c6), std(0xa8d8f0), std(0xf7e3a1)];
  const residents = ["maltese", "koshort", "hamster", "pomeranian", "rabbit", "cheese"];
  const pets: ReturnType<typeof buildPet>[] = [];
  residents.forEach((id, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = -shelfW / 2 + cellW * (c + 0.5);
    box(cushion[(i + r) % 3], cellW * 0.7, 0.05, shelfD * 0.6, x, rowY[r] + 0.045, shelfZ);
    const sp = PET_BY_ID[id];
    const pm = buildPet(sp);
    // 칸 높이에 맞게 (작은 아이는 그대로, 큰 아이는 줄여서)
    pm.root.scale.setScalar(Math.min(0.9, sp.size * 0.9));
    pm.root.position.set(x, rowY[r] + 0.07, shelfZ);
    pm.root.rotation.y = (c - 1) * -0.35;
    animatePet(pm, i * 1.7, 0, i);
    pets.push(pm);
    group.add(pm.root);
  });
  // 진열장 유리 (앞면)
  const glassFront = new THREE.MeshStandardMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
  put(glassFront, new THREE.PlaneGeometry(shelfW, rowH * 2), 0, rowY[0] + rowH, shelfZ + shelfD / 2 + 0.02);

  // 오른쪽 앞: 계산대 + 포스기
  const counter = std(0x2fae93, { emissive: 0x0a2a22 });
  const cw = Math.min(0.9, w * 0.3);
  const cx = w / 2 - cw / 2 - 0.08;
  box(counter, cw, 0.95, 0.5, cx, 0.2 + 0.475, depth - 1.1);
  box(white, cw + 0.04, 0.04, 0.54, cx, 0.2 + 0.97, depth - 1.1);
  box(std(0x222428), 0.28, 0.22, 0.2, cx + 0.08, 0.2 + 1.1, depth - 1.15);
  // 왼쪽: 어항 (받침 + 파란 물 + 금붕어)
  const tx = -w / 2 + 0.42;
  const tz = depth - 1.4;
  box(std(0x3a3d42), 0.7, 0.75, 0.4, tx, 0.2 + 0.375, tz);
  const water = new THREE.MeshStandardMaterial({ color: 0x4fb8e8, emissive: 0x1d6fa0, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
  put(water, new THREE.BoxGeometry(0.66, 0.42, 0.36), tx, 0.2 + 0.75 + 0.21, tz);
  const fish = std(0xff7a1a, { emissive: 0x662200 });
  for (const [fx, fy, fz] of [
    [-0.15, 1.12, 0.05],
    [0.12, 1.02, -0.06],
    [0.02, 1.2, 0.08],
  ])
    put(fish, new THREE.SphereGeometry(0.03, 8, 6).scale(1.6, 1, 0.8), tx + fx, fy, tz + fz);
  // 사료 · 모래 포대 더미 (유리 바로 안쪽, 가운데 문은 비운다)
  const bags = [std(0xe24b3b), std(0x3a7bd5), std(0xf2c230), std(0x8b5a2b)];
  for (let k = 0; k < 4; k++) {
    box(bags[k], 0.34, 0.48, 0.16, -w / 2 + 0.25 + (k % 2) * 0.38, 0.2 + 0.24 + Math.floor(k / 2) * 0.48, depth - 0.35);
  }

  // 정적인 것들을 합친다 (진열장 아이들도 색별로 묶는다)
  for (const pm of pets) {
    pm.root.updateMatrixWorld(true);
    pm.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const hex = src.color.getHex();
      let tgt = [...parts.keys()].find((k) => k.userData.petColor === hex && (k as THREE.MeshStandardMaterial).flatShading === src.flatShading);
      if (!tgt) {
        tgt = std(hex, { emissive: new THREE.Color(hex).multiplyScalar(0.15), flatShading: src.flatShading });
        tgt.userData.petColor = hex;
        parts.set(tgt, []);
      }
      parts.get(tgt)!.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
    });
    disposePet(pm);
  }
  for (const [m, list] of parts) {
    if (!list.length) continue;
    const flat = list.map((g) => {
      if (!g.index) return g;
      const n = g.toNonIndexed();
      g.dispose();
      return n;
    });
    // 합치려면 속성 구성이 같아야 한다 (uv 가 없는 것도 있다)
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const geo = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.userData.keepMaterial = true;
    if ((m as THREE.MeshStandardMaterial).transparent) mesh.renderOrder = 1;
    group.add(mesh);
  }
  return { group, mats: mats.filter((m) => parts.get(m)?.length) };
}

/** 옷가게 매장 (밖에서 유리 너머로 보이는 모습): 행거 두 줄 + 마네킹 + 뒷벽 선반. 재질별로 합쳐서 가볍게 */
function buildClothesFront(w: number, depth: number, ceilY: number, keep: (t: THREE.Texture) => THREE.Texture) {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: new THREE.Color(color).multiplyScalar(0.18), ...extra });
    mats.push(m);
    return m;
  };
  const put = (m: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geo.translate(x, y, z);
    const list = parts.get(m) ?? [];
    list.push(geo);
    parts.set(m, list);
  };
  const box = (m: THREE.Material, bw: number, bh: number, bd: number, x: number, y: number, z: number) => put(m, new THREE.BoxGeometry(bw, bh, bd), x, y, z);
  const floorTex = keep(woodFloorTexture());
  floorTex.repeat.set(w / 2, depth / 2);
  put(std(0xffffff, { map: floorTex, emissive: 0x3a2a18, roughness: 0.6 }), new THREE.PlaneGeometry(w, depth).rotateX(-Math.PI / 2), 0, 0.2, depth / 2);
  box(std(0xf1ece4), w, ceilY - 0.25, 0.04, 0, 0.2 + (ceilY - 0.25) / 2, 0.07);
  const light = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (const z of [depth * 0.3, depth * 0.72]) box(light, w * 0.7, 0.04, 0.35, 0, ceilY - 0.04, z);
  // 뒷벽: 짙은 판 + 선반 위 접은 옷
  const dark = std(0x26272c);
  box(dark, w - 0.2, 1.9, 0.05, 0, 0.2 + 1.15, 0.12);
  const white = std(0xf7f6f2);
  const cols = [0xd8344a, 0x8ec5f2, 0xf6d35b, 0x2a2b31, 0xf5a3c0, 0x7c7f4e, 0x6f95c8, 0xffffff];
  const fold = cols.map((c) => std(c, { roughness: 0.95 }));
  for (const [r, y] of [0.95, 1.5].entries()) {
    box(white, w - 0.3, 0.03, 0.35, 0, 0.2 + y, 0.3);
    const n = Math.max(2, Math.floor((w - 0.5) / 0.38));
    for (let k = 0; k < n; k++) for (let h = 0; h < 3; h++) box(fold[(k * 3 + r + h) % fold.length], 0.3, 0.05, 0.28, -((n - 1) * 0.38) / 2 + k * 0.38, 0.2 + y + 0.04 + h * 0.052, 0.3);
  }
  // 행거 두 줄 (티셔츠를 앞으로 보이게)
  const chrome = std(0xd9dce1, { metalness: 0.9, roughness: 0.2 });
  for (const [side, z] of [[-1, depth * 0.45], [1, depth * 0.62]] as const) {
    const rx = side * Math.min(0.75, w * 0.22);
    const rw = Math.min(1.1, w * 0.32);
    for (const s of [-1, 1]) put(chrome, new THREE.CylinderGeometry(0.015, 0.015, 1.45, 8), rx + (s * rw) / 2, 0.2 + 0.725, z);
    put(chrome, new THREE.CylinderGeometry(0.012, 0.012, rw, 8).rotateZ(Math.PI / 2), rx, 0.2 + 1.45, z);
    for (let k = 0; k < 4; k++) {
      const x = rx - rw / 2 + 0.17 + k * ((rw - 0.34) / 3);
      const m = fold[(k * 2 + (side > 0 ? 1 : 0)) % fold.length];
      box(m, 0.26, 0.38, 0.02, x, 0.2 + 1.2, z + k * 0.025);
      for (const s of [-1, 1]) put(m, new THREE.BoxGeometry(0.09, 0.12, 0.018).rotateZ(s * -0.6), x + s * 0.16, 0.2 + 1.34, z + k * 0.025);
    }
  }
  // 유리 바로 안쪽 마네킹 (줄무늬 티 + 청바지 + 빨간 모자)
  const mx = w / 2 - 0.45;
  const mz = depth - 0.55;
  const skin = std(0xeeeae4);
  const stripeTex = keep(
    canvasTex(64, 64, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#24365e";
      for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 7);
    }),
  );
  const tee = std(0xffffff, { map: stripeTex });
  const denim = std(0x6f95c8);
  put(std(0x1c1d21), new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18), mx, 0.215, mz);
  for (const s of [-1, 1]) put(denim, new THREE.CylinderGeometry(0.065, 0.05, 0.8, 10), mx + s * 0.08, 0.2 + 0.68, mz);
  put(tee, new THREE.CylinderGeometry(0.17, 0.15, 0.55, 14).scale(1, 1, 0.7), mx, 0.2 + 1.35, mz);
  for (const s of [-1, 1]) put(skin, new THREE.CylinderGeometry(0.05, 0.04, 0.5, 8).rotateZ(s * 0.12), mx + s * 0.22, 0.2 + 1.32, mz);
  put(skin, new THREE.SphereGeometry(0.11, 14, 10).scale(0.9, 1.1, 0.95), mx, 0.2 + 1.8, mz);
  put(std(0xd8344a), new THREE.SphereGeometry(0.115, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), mx, 0.2 + 1.84, mz);
  for (const [m, list] of parts) {
    if (!list.length) continue;
    const flat = list.map((g) => {
      if (!g.index) return g;
      const n = g.toNonIndexed();
      g.dispose();
      return n;
    });
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    const geo = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.userData.keepMaterial = true;
    group.add(mesh);
  }
  return { group, mats: mats.filter((m) => parts.get(m)?.length) };
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
  const backWallZ = coreZ + coreD / 2 + 0.03;
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
  // 앞쪽 기둥(pilD) 자리는 비운다 — 기둥과 같은 면이 겹쳐 깜박이지 않게
  const pilD = 0.5;
  const sideD = roomD + 0.42 - pilD;
  const sideZ = front - pilD - sideD / 2;
  for (const s of [-1, 1])
    slab(stone, 0.3, h, sideD, s * (w / 2 - 0.15), h / 2, sideZ);
  // 실내 양옆 안쪽 면 (흰 벽)
  for (const s of [-1, 1]) {
    const p = new THREE.PlaneGeometry(roomD, h);
    put(
      plaster,
      p,
      s * (w / 2 - 0.33),
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
    h + 0.04,
    0,
  );

  // ── 정면 석재: 양쪽 기둥 (1층은 짙은 화강석) + 층 띠 + 옥상 난간 ──
  const pilW = w < 6 ? 0.4 : 0.62;
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
    slab(stone, 0.2, 0.9, d - 0.8, s * (w / 2 - 0.1), h + 0.45, -0.2);
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
  /** 2층 코인노래방: 1층 오른쪽 끝 계단 출입문 칸 */
  const stair = b.upstairs === "karaoke" && !wide ? stairDoorSpan(w) : null;
  const units: [number, number][] = wide
    ? [
        [gx0, midCol - colW / 2],
        [midCol + colW / 2, lx0 - colW],
      ]
    : stair
      ? [stair.shop]
      : [[gx0, gx1]];
  // 점포 사이 기둥 · 계단 입구 옆 기둥 (화강석)
  if (wide) {
    // 간판 띠 아래까지만 (간판 띠 앞면과 겹치지 않게)
    for (const cx of [midCol, lx0 - colW / 2])
      slab(granite, colW, 3.05, 0.3, cx, 3.05 / 2, front - 0.27);
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
  const mats: THREE.MeshStandardMaterial[] = [];
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
  const pet = b.tenant === "pet";
  const clothes = b.tenant === "clothes";
  const fishing = b.tenant === "fishing";
  const shutterAt = pet || clothes || fishing ? -1 : b.id % (units.length + 1);
  units.forEach(([x0, x1], i) => {
    const uw = x1 - x0;
    const cx = (x0 + x1) / 2;
    // 빈 간판 틀 (펫샵은 불 켜진 간판)
    if (pet || clothes || fishing) {
      const sh = signY1 - signY0 - 0.12;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(uw - 0.1, sh),
        new THREE.MeshStandardMaterial({
          map: keep(fishing ? fishingSignTexture((uw - 0.1) / sh) : clothes ? clothesSignTexture((uw - 0.1) / sh) : petSignTexture((uw - 0.1) / sh)),
          emissive: 0xffffff,
          emissiveMap: textures[textures.length - 1],
          emissiveIntensity: 0.55,
          roughness: 0.5,
        }),
      );
      sign.position.set(cx, (signY0 + signY1) / 2, front - 0.09);
      flat.push({ mesh: sign });
    } else paper(
      blankSign(uw / (signY1 - signY0 - 0.16), ghosts[i]),
      uw - 0.12,
      signY1 - signY0 - 0.16,
      cx,
      (signY0 + signY1) / 2,
      front - 0.09,
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
    // 펫샵: 유리에 발자국 광고 / 빈 점포: 임대 안내문 (문 양쪽 유리, 안쪽에서 붙인 종이)
    if (fishing) {
      paper(fishingPoster("미끼", "지렁이 · 새우"), 0.42, 0.6, cx - dw / 2 - 0.42, 1.45, glassZ - 0.01);
      paper(fishingPoster("수매", "잡은 고기 삽니다"), 0.42, 0.6, cx + dw / 2 + 0.42, 1.45, glassZ - 0.01);
      return;
    }
    if (clothes) {
      paper(clothesPoster("NEW", "신상 입고"), 0.42, 0.6, cx - dw / 2 - 0.42, 1.45, glassZ - 0.01);
      paper(clothesPoster("SALE", "배틀 기어"), 0.42, 0.6, cx + dw / 2 + 0.42, 1.45, glassZ - 0.01);
      return;
    }
    if (pet) {
      paper(petPoster("분양"), 0.42, 0.6, cx - dw / 2 - 0.42, 1.45, glassZ - 0.01);
      paper(petPoster("미용·호텔"), 0.42, 0.6, cx + dw / 2 + 0.42, 1.45, glassZ - 0.01);
      return;
    }
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
  // 펫샵 매장 / 빈 점포 안: 접은 박스 더미 (마지막 점포 안쪽)
  if (fishing) {
    const [x0, x1] = units[0];
    const fi = buildFishingFront(x1 - x0 - 0.1, roomD, SHOP_GROUND_H - 0.3, keep);
    fi.group.position.set((x0 + x1) / 2, 0, glassZ - roomD);
    group.add(fi.group);
    for (const m of fi.mats) mats.push(m);
  } else if (clothes) {
    const [x0, x1] = units[0];
    const ci = buildClothesFront(x1 - x0 - 0.1, roomD, SHOP_GROUND_H - 0.3, keep);
    ci.group.position.set((x0 + x1) / 2, 0, glassZ - roomD);
    group.add(ci.group);
    for (const m of ci.mats) mats.push(m);
  } else if (pet) {
    const [x0, x1] = units[0];
    const pi = buildPetInterior(x1 - x0 - 0.1, roomD, SHOP_GROUND_H - 0.3, keep);
    pi.group.position.set((x0 + x1) / 2, 0, glassZ - roomD);
    group.add(pi.group);
    for (const m of pi.mats) mats.push(m);
  } else {
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
      lobbyZ + 0.055,
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
  if (stair && floors >= 3)
    paper(bannerTexture(bw / bh, floors > 3 ? `3층~${floors}층` : "3층"), bw, bh, 0, base(3) + 0.25, front + 0.03);
  else if (!stair)
    paper(bannerTexture(bw / bh, pet || clothes || fishing ? `2층~${floors}층` : `1층~${floors}층`), bw, bh, 0, base(2) + 0.25, front + 0.03);
  if (floors >= 3 && w >= 4) {
    const vh = Math.min(5.2, h - base(3) - 0.6);
    // 기둥 바로 옆, 층 띠 앞에 늘어뜨린다
    paper(
      verticalBanner(),
      vh * 0.22,
      vh,
      gx1 - 0.45,
      base(3) + 0.45 + vh / 2,
      front + 0.05,
    );
  }
  // 위층 유리마다 '임대' 종이 한두 장
  for (let f = stair ? 3 : 2; f <= floors; f++) {
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

  if (stair) {
    const k = buildKaraokeFront(
      stair.door,
      gx0,
      gx1,
      { front, glassZ, backWallZ, signY0, signY1, floor2: base(2) },
      keep,
      put,
      { alu, granite, plaster, glass, concrete },
    );
    for (const m of k) flat.push({ mesh: m });
  }

  // ── 옥상: 계단실 + 실외기 ──
  // 좁은 건물에선 폭을 줄여 옆 건물과 맞닿지 않게
  const stairW = Math.min(3.2, w - 1.2);
  slab(stone, stairW, 2.6, 3.0, -w / 2 + 0.6 + stairW / 2, h + 1.3, -d / 2 + 2.0);
  const acs = Math.min(3, Math.floor((w - 0.8) / 1.1));
  for (let k = 0; k < acs; k++)
    boxAt(alu, 0.9, 0.7, 0.4, w / 2 - 0.85 - k * 1.1, h + 0.35, -d / 2 + 1.0);

  // ── 합치기 ──
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

/** 코인노래방 네온 간판 (2층 띠): 짙은 보라 바탕 + 분홍 네온 글씨 + 마이크 */
function karaokeSignTexture(aspect: number) {
  const W = 1024;
  const H = Math.max(120, Math.round(W / aspect));
  return canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, "#2a0a3d");
    grd.addColorStop(1, "#15052a");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ff5fd2";
    g.lineWidth = H * 0.05;
    g.shadowColor = "#ff5fd2";
    g.shadowBlur = H * 0.12;
    g.strokeRect(H * 0.08, H * 0.1, W - H * 0.16, H - H * 0.2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${Math.round(H * 0.44)}px ${FONT}`;
    const fit = Math.min(1, (W * 0.62) / g.measureText(KARAOKE_NAME).width);
    g.font = `900 ${Math.round(H * 0.44 * fit)}px ${FONT}`;
    g.fillStyle = "#ffe9ff";
    g.shadowColor = "#ff4fd8";
    g.shadowBlur = H * 0.18;
    g.fillText(KARAOKE_NAME, W * 0.57, H * 0.43);
    g.font = `800 ${Math.round(H * 0.17)}px ${FONT}`;
    g.fillStyle = "#7fe9ff";
    g.shadowColor = "#38d9ff";
    g.fillText("COIN KARAOKE · 2F", W * 0.57, H * 0.78);
    // 마이크
    g.shadowColor = "#ffd24a";
    g.fillStyle = "#ffd24a";
    const mx = W * 0.13;
    const my = H * 0.42;
    const r = H * 0.16;
    g.beginPath();
    g.arc(mx, my, r, 0, Math.PI * 2);
    g.fill();
    g.fillRect(mx - r * 0.35, my + r * 0.8, r * 0.7, r * 1.6);
  });
}

/** 계단 출입문 위 작은 안내판: '2F ↑ 코인노래방' */
function stairSignTexture() {
  return canvasTex(256, 200, (g) => {
    g.fillStyle = "#1b0629";
    g.fillRect(0, 0, 256, 200);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "#ff4fd8";
    g.shadowBlur = 14;
    g.fillStyle = "#ffe9ff";
    g.font = `900 64px ${FONT}`;
    g.fillText("2F ↑", 128, 62);
    g.font = `800 36px ${FONT}`;
    g.fillStyle = "#7fe9ff";
    g.shadowColor = "#38d9ff";
    g.fillText(KARAOKE_NAME, 128, 140);
  });
}

/** 2층 유리 너머 노래방 안 (보라 조명 · 방 문 · 네온 띠): 밤낮 없이 불이 켜져 있다 */
function karaokeWindowTexture(aspect: number) {
  const W = 1024;
  const H = Math.max(200, Math.round(W / aspect));
  return canvasTex(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#3b0f5c");
    grd.addColorStop(0.7, "#24093d");
    grd.addColorStop(1, "#14051f");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // 천장 네온 띠
    g.fillStyle = "#ff5fd2";
    g.shadowColor = "#ff5fd2";
    g.shadowBlur = 24;
    g.fillRect(0, H * 0.06, W, H * 0.025);
    g.shadowBlur = 0;
    // 방 문 셋 (번호 + 작은 유리창)
    for (let i = 0; i < 3; i++) {
      const dx = W * (0.12 + i * 0.3);
      const dw = W * 0.18;
      g.fillStyle = "#1a0a26";
      g.fillRect(dx, H * 0.22, dw, H * 0.78);
      g.fillStyle = i === 1 ? "#ffcf5a" : "#7fe9ff";
      g.globalAlpha = 0.75;
      g.fillRect(dx + dw * 0.3, H * 0.34, dw * 0.4, H * 0.22);
      g.globalAlpha = 1;
      g.fillStyle = "#ffe9ff";
      g.font = `800 ${Math.round(H * 0.08)}px ${FONT}`;
      g.textAlign = "center";
      g.fillText(`${i + 1}`, dx + dw / 2, H * 0.29);
    }
    // 미러볼 빛 점
    for (let k = 0; k < 40; k++) {
      g.fillStyle = ["#ffffff", "#ff9ae6", "#9ff1ff", "#fff19a"][k % 4];
      g.globalAlpha = 0.5;
      g.fillRect((k * 197) % W, H * 0.1 + ((k * 89) % Math.round(H * 0.5)), 6, 6);
    }
    g.globalAlpha = 1;
  });
}

type PutFn = (mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry?: number) => void;

/**
 * 펫샵 건물의 2층 코인노래방 겉모습:
 *  - 1층 오른쪽 끝 계단 출입문 칸: 계단실 (올라가는 계단 · 보라 LED 띠) + 문 위 '2F ↑' 안내판
 *    (유리문 문짝은 다른 가게 문처럼 cityRenderer 가 단다)
 *  - 2층 띠: 네온 간판 / 2층 유리 너머: 불 켜진 노래방 안
 * 반환: 따로 그리는 빛나는 판들
 */
function buildKaraokeFront(
  door: [number, number],
  gx0: number,
  gx1: number,
  at: { front: number; glassZ: number; backWallZ: number; signY0: number; signY1: number; floor2: number },
  keep: (t: THREE.Texture) => THREE.Texture,
  put: PutFn,
  m: { alu: THREE.Material; granite: THREE.Material; plaster: THREE.Material; glass: THREE.Material; concrete: THREE.Material },
): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const [dx0, dx1] = door;
  const dw = dx1 - dx0;
  const dcx = (dx0 + dx1) / 2;
  const box = (mat: THREE.Material, bw: number, bh: number, bd: number, x: number, y: number, z: number) => put(mat, new THREE.BoxGeometry(bw, bh, bd), x, y, z);
  // 점포 칸과 계단 칸 사이 화강석 기둥 (간판 띠 아래까지)
  box(m.granite, 0.12, at.signY0, 0.3, dx0 - 0.06, at.signY0 / 2, at.front - 0.27);
  // 계단실 옆벽 (점포 쪽): 점포 안이 계단실로 이어져 보이지 않게
  const depth = at.glassZ - at.backWallZ;
  box(m.plaster, 0.08, at.signY1, depth, dx0 - 0.02, at.signY1 / 2, at.backWallZ + depth / 2);
  // 계단 (안쪽으로 올라간다)
  const steps = 10;
  const run = Math.min(0.28, (depth - 0.5) / steps);
  for (let i = 0; i < steps; i++) {
    const h = 0.18 * (i + 1);
    box(m.concrete, dw - 0.1, h, run, dcx, h / 2, at.glassZ - 0.45 - i * run);
  }
  // 계단실 천장 (간판 띠 높이)
  box(m.plaster, dw, 0.06, depth, dcx, at.signY0, at.backWallZ + depth / 2);
  // 문틀 + 문 위 채광창
  for (const s of [-1, 1]) box(m.alu, 0.06, 2.35, 0.12, dcx + (s * dw) / 2 - s * 0.03, 1.175, at.glassZ);
  box(m.alu, dw, 0.08, 0.12, dcx, 2.39, at.glassZ);
  put(m.glass, new THREE.PlaneGeometry(dw - 0.06, at.signY0 - 2.45), dcx, (2.43 + at.signY0) / 2, at.glassZ);
  // 보라 LED 띠 (계단 벽을 따라) + 계단실 안쪽 빛
  const neon = new THREE.MeshStandardMaterial({ color: 0xff5fd2, emissive: 0xff3fc8, emissiveIntensity: 1.4, roughness: 0.4 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, depth - 0.3), neon);
  led.position.set(dx1 - 0.06, 0.95, at.backWallZ + depth / 2);
  out.push(led);
  const glowBack = new THREE.Mesh(
    new THREE.PlaneGeometry(dw - 0.1, at.signY0 - 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2a0b3e, emissive: 0x5a1a7a, emissiveIntensity: 0.9, roughness: 1 }),
  );
  glowBack.position.set(dcx, (at.signY0 - 0.2) / 2 + 0.1, at.backWallZ + 0.04);
  out.push(glowBack);
  // 문 위 안내판 (간판 띠)
  const sh = at.signY1 - at.signY0 - 0.12;
  const stTex = keep(stairSignTexture());
  const stairSign = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(dw - 0.08, sh * 1.28), sh),
    new THREE.MeshStandardMaterial({ map: stTex, emissive: 0xffffff, emissiveMap: stTex, emissiveIntensity: 0.6, roughness: 0.5 }),
  );
  stairSign.position.set(dcx, (at.signY0 + at.signY1) / 2, at.front - 0.09);
  out.push(stairSign);

  // ── 2층 ──
  const gw = gx1 - gx0;
  // 네온 간판: 2층 창 아래 띠 앞
  const sw = gw - 0.1;
  const sgh = 0.78;
  const sTex = keep(karaokeSignTexture(sw / sgh));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sgh),
    new THREE.MeshStandardMaterial({ map: sTex, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0.85, roughness: 0.5 }),
  );
  sign.position.set((gx0 + gx1) / 2, at.floor2 + 0.27, at.front + 0.04);
  out.push(sign);
  // 유리 너머 불 켜진 노래방 (안쪽 벽에 붙인 그림)
  const ih = 3.4 - 0.35;
  const iTex = keep(karaokeWindowTexture((gw - 0.1) / ih));
  const inside = new THREE.Mesh(
    new THREE.PlaneGeometry(gw - 0.1, ih),
    new THREE.MeshStandardMaterial({ map: iTex, emissive: 0xffffff, emissiveMap: iTex, emissiveIntensity: 0.7, roughness: 1 }),
  );
  inside.position.set((gx0 + gx1) / 2, at.floor2 + ih / 2, at.backWallZ + 0.02);
  out.push(inside);
  return out;
}
