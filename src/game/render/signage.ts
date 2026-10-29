import * as THREE from 'three';
import { glassMaterial } from './glassKit';
import type { Building, Sign } from '../city/cityMap';

/**
 * 한국 거리 간판 (요즘 세련된 상가 느낌):
 * - 1층 가게: 얇은 금속 패널 위 채널 글자 (로고 마크 + 상호 + 작은 영문 부제, 아래 가는 강조선)
 * - 2층 이상: 창에 붙인 듯한 반투명 판 (층 번호 + 상호, 넉넉한 자간)
 * - 세로 돌출 간판: 둥근 모서리 짙은 판 + 강조색 글자
 * - 빌라: 옥상 앞쪽에 세운 입체 글자 이름
 * - 오피스: 옥상 위 흰 채널 글자 (밤엔 은은한 푸른 빛)
 * 전부 캔버스로 그려 붙인다 (밤에도 보이게 빛을 받지 않는 재질). 상호는 실제 상표가 아닌 지어낸 이름.
 */
const SUB: Record<string, string> = {
  '편의점 24': '24H CONVENIENCE',
  '카페 모먼트': 'COFFEE & DESSERT',
  황금치킨: 'GOLDEN CHICKEN · 배달',
  분식천국: 'KIMBAP · RAMYEON',
  PC방: 'GAMING LOUNGE · 24H',
  코인노래방: 'COIN KARAOKE',
  약국: 'PHARMACY',
  헤어살롱: 'HAIR & NAIL',
  꽃집: 'FLOWER SHOP',
  베이커리: 'BAKERY · SINCE 1998',
  세탁소: 'LAUNDRY & REPAIR',
  고깃집: 'KOREAN BBQ',
  마라탕: 'MALATANG',
  떡볶이: 'TTEOKBOKKI',
  부동산: 'REAL ESTATE',
  안경원: 'OPTICAL',
};

/** 2층 이상 입주 업체 (상호, 판 색, 글자색) — 채도를 낮춘 차분한 색 */
const TENANTS: [string, string, string][] = [
  ['수학전문학원', '#22324f', '#ffffff'],
  ['영어학원', '#f4f6fa', '#28458a'],
  ['피아노 음악학원', '#f7eef2', '#8c3358'],
  ['태권도 체육관', '#7c1f24', '#ffffff'],
  ['미소 치과의원', '#ffffff', '#1d7a63'],
  ['연세 내과의원', '#ffffff', '#24589a'],
  ['한의원', '#3d2b1f', '#e9d3a6'],
  ['필라테스 & 요가', '#f2eff7', '#5b4a86'],
  ['스터디카페', '#1d1f22', '#f1c75b'],
  ['노래연습장', '#2a1b3d', '#e9a8ff'],
  ['당구장', '#1f3a2c', '#ffffff'],
  ['세무회계사무소', '#eceae6', '#33373d'],
  ['네일 · 속눈썹', '#f6e7ea', '#9b3456'],
  ['헬스클럽 24', '#16181b', '#6fd3ff'],
  ['법무사 사무소', '#f2ede4', '#4a3b2a'],
  ['어린이 미술학원', '#fff7df', '#c25a12'],
];

const VILLAS = ['해오름빌라', '그린빌', '청솔빌라', '다솜하우스', '미소빌', '한빛빌라', '은하맨션', '라온하우스'];
const OFFICES = ['한강 파이낸스 센터', 'HG 타워', '넥스트 IT 센터', '서울 메디컬 빌딩', '블루오션 빌딩'];

/** 한글이 반듯하게 보이는 글꼴 (윈도우: 맑은 고딕, 맥: 애플 SD 고딕) */
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", sans-serif';
const CHARCOAL = '#1e2024';
const IVORY = '#f3f1ec';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function plane(w: number, h: number, map: THREE.Texture, opts: { double?: boolean; cutout?: boolean } = {}) {
  // 조명 간판: 빛을 받지 않고 늘 보이지만, 밝은 흰 간판이 밤에 하얗게 번지지 않게 살짝 낮춘 밝기
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map,
      color: 0xdedede,
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
      // 글자만 있는 간판: 투명한 곳은 버린다 (뒤 건물과 겹쳐 그릴 때 순서 문제 없음)
      transparent: !!opts.cutout,
      alphaTest: opts.cutout ? 0.04 : 0,
    }),
  );
  m.renderOrder = 1;
  return m;
}

/** 글꼴 (자간 포함) 을 정하고, 칸 폭에 맞게 크기를 줄인다 */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700, spacing = 0) {
  let s = size;
  const set = () => {
    g.font = `${weight} ${s}px ${FONT}`;
    g.letterSpacing = `${Math.round(s * spacing)}px`;
  };
  set();
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    set();
  }
  return s;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

const hslOf = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });

/** 간판 색 정리: 상호 색(강조색)과 패널 색 */
function brand(sign: Sign) {
  const a = hslOf(sign.bg);
  const b = hslOf(sign.fg);
  // 더 선명한 쪽이 이 가게의 색
  const accentHex = a.s * (1 - Math.abs(a.l - 0.5)) >= b.s * (1 - Math.abs(b.l - 0.5)) ? sign.bg : sign.fg;
  const acc = hslOf(accentHex);
  // 짙은 강조색은 밝은 패널, 나머지는 짙은 패널 위에
  const light = acc.l < 0.32;
  const c = new THREE.Color().setHSL(acc.h, Math.min(0.85, acc.s), light ? Math.min(0.4, acc.l) : Math.max(0.58, Math.min(0.7, acc.l)));
  return { panel: light ? IVORY : CHARCOAL, accent: `#${c.getHexString()}`, muted: light ? '#6b6b6b' : '#a9adb5' };
}

/** 1층 가게 간판: 로고 마크 + 상호 + 영문 부제 + 아래 가는 강조선 */
function fasciaTexture(sign: Sign, aspect: number) {
  const W = 1536;
  const H = Math.max(120, Math.round(W / aspect));
  const { panel, accent, muted } = brand(sign);
  return canvasTex(W, H, (g) => {
    g.fillStyle = panel;
    g.fillRect(0, 0, W, H);
    // 위쪽 아주 옅은 광택
    const sheen = g.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    // 아래 강조선
    const line = Math.round(H * 0.07);
    g.fillStyle = accent;
    g.fillRect(0, H - line, W, line);

    const sub = SUB[sign.text];
    // 가운데 정렬: [마크] 상호 / 부제
    const mark = H * 0.62;
    const nameSize = fit(g, sign.text, W * 0.62, Math.round(H * (sub ? 0.5 : 0.6)), 800, 0.06);
    const nameW = g.measureText(sign.text).width;
    let subW = 0;
    let subSize = 0;
    if (sub) {
      subSize = fit(g, sub, W * 0.62, Math.round(H * 0.15), 600, 0.24);
      subW = g.measureText(sub).width;
    }
    const gap = H * 0.22;
    const x0 = (W - (mark + gap + Math.max(nameW, subW))) / 2;
    const cy = H * 0.46;

    // 로고 마크: 둥근 사각형 안에 첫 글자
    g.fillStyle = accent;
    roundRect(g, x0, cy - mark / 2, mark, mark, mark * 0.24);
    g.fill();
    g.fillStyle = panel;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(mark * 0.56)}px ${FONT}`;
    g.letterSpacing = '0px';
    g.fillText(sign.text.replace(/\s|\d/g, '').slice(0, 1) || sign.text.slice(0, 1), x0 + mark / 2, cy + mark * 0.03);

    // 상호 + 부제
    const tx = x0 + mark + gap;
    g.textAlign = 'left';
    g.fillStyle = accent;
    fit(g, sign.text, W * 0.62, nameSize, 800, 0.06);
    g.fillText(sign.text, tx, sub ? cy - H * 0.09 : cy + H * 0.02);
    if (sub) {
      g.fillStyle = muted;
      fit(g, sub, W * 0.62, subSize, 600, 0.24);
      g.fillText(sub, tx + 2, cy + H * 0.27);
    }
  });
}

/** 2층 이상 입주 업체: 반투명 판 (층 번호 원 + 상호) */
function tenantTexture(name: string, bg: string, fg: string, floor: number) {
  const W = 1024;
  const H = 150;
  return canvasTex(W, H, (g) => {
    g.globalAlpha = 0.94;
    g.fillStyle = bg;
    roundRect(g, 0, 0, W, H, 18);
    g.fill();
    g.globalAlpha = 1;
    // 층 번호: 가는 원 테두리
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(78, H / 2, 46, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 40px ${FONT}`;
    g.letterSpacing = '0px';
    g.fillText(`${floor}F`, 78, H / 2 + 2);
    // 구분선
    g.globalAlpha = 0.35;
    g.fillRect(150, 34, 3, H - 68);
    g.globalAlpha = 1;
    g.textAlign = 'left';
    fit(g, name, W - 210, 74, 700, 0.12);
    g.fillText(name, 182, H / 2 + 3);
  });
}

/** 세로 돌출 간판: 둥근 모서리, 위에 강조색 띠, 상호를 한 글자씩 세로로 */
function verticalTexture(lines: string[], bg: string, fg: string, heightPx: number) {
  const W = 160;
  return canvasTex(W, heightPx, (g) => {
    g.fillStyle = bg;
    roundRect(g, 0, 0, W, heightPx, 22);
    g.fill();
    g.fillStyle = fg;
    g.fillRect(28, 22, W - 56, 6);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const chars = lines.join(' ').replace(/[·&]/g, '').split('').filter((ch) => ch.trim());
    const step = Math.min(110, (heightPx - 70) / Math.max(1, chars.length));
    g.font = `800 ${Math.round(step * 0.74)}px ${FONT}`;
    g.letterSpacing = '0px';
    chars.forEach((ch, i) => g.fillText(ch, W / 2, 50 + step * (i + 0.5)));
  });
}

const pick = <T,>(list: T[], seed: number) => list[((seed % list.length) + list.length) % list.length];

/**
 * 건물 정면(도로 쪽)에 간판·차양·진열창을 붙인다.
 * @param face 정면 방향 (+1 = 남쪽 +z, -1 = 북쪽 -z)
 * @returns 진열창 유리 재질 (밤에 밝힌다)
 */
export function decorateFacade(g: THREE.Group, b: Building, face: 1 | -1): THREE.MeshStandardMaterial[] {
  // 정면 기준 좌표계: 바깥 = +z, 오른쪽 = +x (북쪽 정면이면 통째로 돌린다)
  const f = new THREE.Group();
  f.position.z = (b.d / 2 + 0.02) * face;
  f.rotation.y = face > 0 ? 0 : Math.PI;
  g.add(f);
  const glow: THREE.MeshStandardMaterial[] = [];
  const floors = Math.max(1, Math.round(b.h / 3.2));
  const metal = (color: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 });

  if (b.kind === 'shop' && b.sign) {
    const { panel, accent } = brand(b.sign);
    // 1층: 건물 폭 가득한 얇은 금속 패널 (두께가 있어 옆에서 봐도 진짜 간판처럼)
    const sw = b.w - 0.4;
    const sh = 0.85;
    const box = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.16), metal(panel));
    box.position.set(0, 3.55, 0.08);
    box.castShadow = true;
    f.add(box);
    const fascia = plane(sw - 0.02, sh - 0.02, fasciaTexture(b.sign, sw / sh));
    fascia.position.set(0, 3.55, 0.165);
    f.add(fascia);
    // 차양: 가게 색을 차분하게 낮춘 천
    const cloth = new THREE.Color(accent).lerp(new THREE.Color(panel), 0.35);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.8, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 }));
    awning.position.set(0, 2.85, 0.62);
    awning.rotation.x = 0.22;
    awning.castShadow = true;
    f.add(awning);
    // 진열창: 짙은 프레임 + 유리 (밤엔 안쪽 불빛)
    const glass = new THREE.MeshStandardMaterial({ color: 0x7fa6bd, emissive: 0xffd9a0, emissiveIntensity: 0.25, roughness: 0.1 });
    glow.push(glass);
    const ww = b.w - 1.2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.3), glass);
    win.position.set(0, 1.3, 0.03);
    f.add(win);
    const frame = metal(0x2a2c30);
    const bars: [number, number, number, number][] = [
      [ww + 0.1, 0.08, 0, 2.48],
      [ww + 0.1, 0.08, 0, 0.14],
      [0.08, 2.36, -ww / 2, 1.3],
      [0.08, 2.36, ww / 2, 1.3],
      [0.06, 2.36, 0, 1.3],
    ];
    for (const [w, h, x, y] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame);
      m.position.set(x, y, 0.05);
      f.add(m);
    }

    // 2층 이상: 입주 업체 간판 (층마다 하나, 가끔 빈 층)
    const used: string[] = [];
    for (let fl = 2; fl <= floors; fl++) {
      const seed = b.id * 31 + fl * 7;
      if (seed % 5 === 0) continue;
      const [name, bg, fg] = pick(TENANTS, seed);
      if (used.includes(name)) continue;
      used.push(name);
      const tw = Math.min(b.w * 0.45, 3.6);
      const t = plane(tw, tw / (1024 / 150), tenantTexture(name, bg, fg, fl), { cutout: true });
      t.position.set(-b.w * 0.2, (fl - 1) * 3.2 + 2.3, 0.09);
      f.add(t);
    }
    // 세로 돌출 간판 (3층 이상 건물): 위층 업체 이름을 세로로
    if (floors >= 3 && used.length) {
      const [, bg, fg] = TENANTS.find(([n]) => n === used[0])!;
      const dark = hslOf(bg).l < 0.5;
      const vbg = dark ? bg : CHARCOAL;
      const vfg = dark ? fg : hslOf(fg).l < 0.4 ? '#ffffff' : fg;
      const chars = used[0].replace(/[s·&]/g, '').length;
      const vh = Math.min(b.h - 4.6, 0.75 + chars * 0.62);
      const v = plane(0.8, vh, verticalTexture([used[0]], vbg, vfg, Math.round(160 * (vh / 0.8))), { double: true, cutout: true });
      v.position.set(b.w / 2 - 0.25, 4.6 + vh / 2, 0.55);
      v.rotation.y = Math.PI / 2;
      f.add(v);
      for (const y of [4.8, 4.4 + vh]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), metal(0x3a3c40));
        arm.position.set(b.w / 2 - 0.25, y, 0.28);
        f.add(arm);
      }
    }
  } else if (b.kind === 'villa') {
    // 빌라 이름: 옥상 앞쪽에 세운 입체 글자 (창문을 가리지 않는다)
    const name = pick(VILLAS, b.id * 13);
    const nw = Math.min(b.w * 0.55, 4.2);
    const nh = nw / 4;
    const tone = b.id % 2 ? '#2b2d31' : '#6b4b2e';
    const nt = canvasTex(1024, 256, (cg) => {
      cg.clearRect(0, 0, 1024, 256);
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      // 글자 옆면 (살짝 아래로 겹쳐 그려 입체감)
      fit(cg, name, 960, 150, 800, 0.1);
      cg.fillStyle = 'rgba(0,0,0,0.45)';
      cg.fillText(name, 516, 120);
      cg.fillStyle = tone;
      cg.fillText(name, 512, 114);
      fit(cg, 'VILLA', 400, 34, 600, 0.6);
      cg.fillText('VILLA', 512, 222);
    });
    const p = plane(nw, nh, nt, { cutout: true });
    p.position.set(0, b.h + nh / 2 + 0.12, -0.25);
    f.add(p);
    // 받침 막대 두 개
    for (const x of [-nw * 0.35, nw * 0.35]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, nh * 0.6, 0.05), metal(0x3a3c40));
      post.position.set(x, b.h + nh * 0.3, -0.3);
      f.add(post);
    }
  } else if (b.kind === 'office' && !b.label) {
    // 오피스 옥상: 얇은 받침대 위 흰 채널 글자 (밤엔 푸른 빛이 은은하게)
    const name = pick(OFFICES, b.id * 3);
    const ot = canvasTex(1536, 220, (cg) => {
      cg.clearRect(0, 0, 1536, 220);
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      fit(cg, name, 1440, 150, 700, 0.08);
      cg.shadowColor = 'rgba(77,210,255,0.55)';
      cg.shadowBlur = 16;
      cg.fillStyle = '#f4f9ff';
      cg.fillText(name, 768, 112);
    });
    const ow = Math.min(b.w * 0.85, 13);
    const oh = ow / (1536 / 220);
    const p = plane(ow, oh, ot, { cutout: true });
    (p.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    p.position.set(0, b.h + oh / 2 + 0.25, -0.2);
    f.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(ow * 0.92, 0.12, 0.12), metal(0x2a2c30));
    rail.position.set(0, b.h + 0.2, -0.25);
    f.add(rail);
  }
  return glow;
}

/** 여닫는 문 (0 = 닫힘, 1 = 활짝) */
export interface DoorControl {
  setOpen(t: number): void;
}

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * 경첩으로 바깥(+z)쪽으로 열리는 유리 양문. 문 가운데 = (cx, 0, z), 문 전체 폭 width.
 * 짝마다 문틀(세로·가로 살) + 유리 + 세로 손잡이.
 */
export function swingDoors(parent: THREE.Object3D, cx: number, z: number, width: number, height: number, frameMat: THREE.Material, glassMat: THREE.Material, handleMat: THREE.Material): DoorControl {
  const leafW = width / 2;
  const leaves: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    // 경첩 = 바깥 끝. 짝은 경첩에서 가운데 쪽(-side)으로 뻗는다
    leaf.position.set(cx + side * leafW, 0, z);
    const dir = -side;
    const part = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, zz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(dir * x, y, zz);
      m.castShadow = true;
      leaf.add(m);
    };
    const st = 0.06;
    part(st, height, 0.06, frameMat, st / 2, height / 2);
    part(st, height, 0.06, frameMat, leafW - st / 2, height / 2);
    part(leafW, st, 0.06, frameMat, leafW / 2, height - st / 2);
    part(leafW, 0.14, 0.06, frameMat, leafW / 2, 0.07);
    part(leafW - st * 2, height - st - 0.14, 0.02, glassMat, leafW / 2, 0.14 + (height - st - 0.14) / 2);
    // 손잡이: 문 가운데 쪽 끝, 바깥으로 살짝 띄운 세로 막대
    part(0.035, 0.75, 0.035, handleMat, leafW - 0.14, 1.05, 0.07);
    for (const y of [0.72, 1.38]) part(0.03, 0.03, 0.07, handleMat, leafW - 0.14, y, 0.035);
    parent.add(leaf);
    leaves.push(leaf);
  }
  return {
    setOpen(t: number) {
      const a = ease(t) * 1.45;
      // 왼쪽 짝(경첩 -x)은 -a, 오른쪽 짝은 +a 로 돌아야 바깥(+z)으로 열린다
      leaves[0].rotation.y = -a;
      leaves[1].rotation.y = a;
    },
  };
}

/** 글자 모양 그림 (흰 글자 + 투명 바탕). 입체 글자의 앞면·옆면 모두 이 그림으로 오려 낸다 */
function letterMask(text: string, w: number, h: number, weight: number, spacing: number) {
  return canvasTex(w, h, (cg) => {
    cg.clearRect(0, 0, w, h);
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    fit(cg, text, w * 0.96, Math.round(h * 0.82), weight, spacing);
    cg.fillStyle = '#ffffff';
    cg.fillText(text, w / 2, h * 0.54);
  });
}

/**
 * 입체 채널 글자: 같은 글자 그림을 얇은 판 여러 장으로 겹쳐 두께를 만든다 (앞면은 금속, 옆면은 짙게).
 * 비스듬히 봐도 글자에 두께가 보인다.
 */
function channelLetters(mask: THREE.Texture, w: number, h: number, depth: number, face: THREE.MeshStandardMaterial, side: THREE.MeshStandardMaterial) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const LAYERS = 7;
  for (let i = 0; i <= LAYERS; i++) {
    const m = new THREE.Mesh(geo, i === LAYERS ? face : side);
    m.position.z = (i / LAYERS) * depth;
    m.castShadow = i === LAYERS;
    g.add(m);
  }
  for (const m of [face, side]) {
    m.map = mask;
    m.alphaTest = 0.5;
  }
  return g;
}

/**
 * 행복빌라 현관 (내 집 건물): 짙은 금속 포털 프레임 + 위 보에 입체 황동 글자 (밤엔 글자 뒤 후광) +
 * 원목 루버 벽 + 여닫는 유리 양문 + 안쪽 전실 불빛 + 도어락 + 벽등 + 파란 도로명 주소판.
 * 정면(+z) 기준으로 g 안에 만든다.
 * @returns 문 (여닫기), 밤에 켜질 재질 (opacity = 밤 정도)
 */
export function buildVillaEntrance(g: THREE.Group, b: Building): { door: DoorControl; glow: THREE.MeshBasicMaterial[] } {
  const f = new THREE.Group();
  f.position.z = b.d / 2 + 0.02;
  g.add(f);
  const glow: THREE.MeshBasicMaterial[] = [];
  const std = (color: number, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    f.add(m);
    return m;
  };
  const DW = 2.0; // 문 폭
  const DH = 2.35; // 문 높이
  const PW = 3.4; // 포털 바깥 폭
  const PH = 3.15; // 포털 높이 (보 포함)
  const PD = 0.7; // 포털이 벽에서 튀어나온 깊이

  // 바닥: 화강석 계단 두 칸 + 문 앞 매트
  const granite = std(0x9d9a94, 0.75);
  box(PW + 0.4, 0.08, PD + 0.9, granite, 0, 0.04, (PD + 0.9) / 2);
  box(PW, 0.08, PD + 0.3, granite, 0, 0.12, (PD + 0.3) / 2);
  box(1.4, 0.012, 0.7, std(0x2f2b28, 1), 0, 0.166, 0.55);

  // 문 양옆·위 안쪽 벽: 따뜻한 원목 루버 (세로 살)
  const wood = std(0x9a6b45, 0.7);
  const back = std(0x3a2a20, 0.9);
  const louverH = PH - 0.56;
  for (const side of [-1, 1]) {
    const xa = side * (DW / 2 + 0.06);
    const xb = side * (PW / 2 - 0.16);
    const lo = Math.min(xa, xb);
    const hi = Math.max(xa, xb);
    box(hi - lo, louverH, 0.04, back, (lo + hi) / 2, louverH / 2, 0.02);
    for (let x = lo + 0.04; x < hi - 0.02; x += 0.09) box(0.045, louverH, 0.05, wood, x, louverH / 2, 0.06);
  }
  box(DW + 0.12, louverH - DH, 0.05, wood, 0, DH + (louverH - DH) / 2, 0.06);

  // 포털 프레임: 짙은 금속 (기둥 둘 + 위 보)
  const metal = std(0x26282c, 0.42, 0.55);
  for (const side of [-1, 1]) box(0.16, PH, PD, metal, side * (PW / 2 - 0.08), PH / 2, PD / 2);
  const beamH = 0.56;
  box(PW, beamH, PD, metal, 0, PH - beamH / 2, PD / 2);
  // 보 아래 다운라이트 두 개
  for (const x of [-0.7, 0.7]) {
    const dl = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0xfff0d6 }));
    dl.rotation.x = Math.PI / 2;
    dl.position.set(x, PH - beamH - 0.002, PD * 0.55);
    f.add(dl);
  }
  // 다운라이트가 비추는 바닥 빛 (밤)
  const pool = canvasTex(128, 128, (cg) => {
    const gr = cg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, 128, 128);
  });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffcf8f, map: pool, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  glow.push(poolMat);
  const poolM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), poolMat);
  poolM.rotation.x = -Math.PI / 2;
  poolM.position.set(0, 0.175, PD * 0.6);
  f.add(poolM);

  // 문 안쪽: 불 켜진 전실 (유리 너머로, 문이 열리면 더 잘 보인다)
  const hall = canvasTex(256, 300, (cg) => {
    const wall = cg.createLinearGradient(0, 0, 0, 200);
    wall.addColorStop(0, '#f3e6cc');
    wall.addColorStop(1, '#c9b58f');
    cg.fillStyle = wall;
    cg.fillRect(0, 0, 256, 300);
    // 바닥 타일 (원근)
    cg.fillStyle = '#8d8478';
    cg.beginPath();
    cg.moveTo(0, 300);
    cg.lineTo(256, 300);
    cg.lineTo(196, 200);
    cg.lineTo(60, 200);
    cg.fill();
    cg.strokeStyle = 'rgba(40,35,30,0.35)';
    for (let i = 0; i <= 6; i++) {
      cg.beginPath();
      cg.moveTo(60 + (136 * i) / 6, 200);
      cg.lineTo((256 * i) / 6, 300);
      cg.stroke();
    }
    // 안쪽 벽의 우편함과 천장 등
    cg.fillStyle = '#7d8790';
    cg.fillRect(150, 100, 70, 70);
    cg.strokeStyle = '#4d555c';
    for (let y = 100; y <= 170; y += 14) {
      cg.beginPath();
      cg.moveTo(150, y);
      cg.lineTo(220, y);
      cg.stroke();
    }
    cg.fillStyle = '#fffaf0';
    cg.fillRect(100, 10, 56, 8);
  });
  const hallM = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ map: hall, color: 0xc8c8c8 }));
  hallM.position.set(0, DH / 2, 0.03);
  f.add(hallM);

  // 유리 양문 (바깥으로 열린다)
  const frame = std(0x1f2124, 0.35, 0.7);
  const glass = glassMaterial();
  const handle = std(0xd3d6db, 0.2, 1);
  box(DW + 0.12, 0.06, 0.1, frame, 0, DH + 0.03, 0.09);
  for (const side of [-1, 1]) box(0.06, DH, 0.1, frame, side * (DW / 2 + 0.03), DH / 2, 0.09);
  const door = swingDoors(f, 0, 0.11, DW, DH, frame, glass, handle);

  // 도어락 (오른쪽 기둥 안쪽, 작은 화면이 빛난다)
  box(0.12, 0.24, 0.05, std(0x111214, 0.3, 0.5), PW / 2 - 0.26, 1.2, 0.1);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0x5ad1ff }));
  pad.position.set(PW / 2 - 0.26, 1.24, 0.126);
  f.add(pad);

  // 벽등: 포털 바깥 양옆, 위아래로 빛이 새는 기둥등
  for (const side of [-1, 1]) {
    const x = side * (PW / 2 + 0.35);
    box(0.12, 0.42, 0.12, metal, x, 2.2, 0.08);
    for (const y of [1.98, 2.42]) {
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), new THREE.MeshBasicMaterial({ color: 0xf4f8ff }));
      bulb.position.set(x, y, 0.08);
      f.add(bulb);
    }
  }

  // 간판: 보 앞면에 입체 황동 글자 '행복빌라' + 작은 영문, 밤엔 글자 뒤로 따뜻한 후광
  const beamFront = PD + 0.001;
  const beamY = PH - beamH / 2;
  const nameW = 1.9;
  const nameH = nameW / 4;
  const nameX = -0.32;
  const nameMask = letterMask('행복빌라', 1024, 256, 800, 0.08);
  const brass = new THREE.MeshStandardMaterial({ color: 0xe0c48e, roughness: 0.32, metalness: 0.55, emissive: 0x3a2a10, emissiveIntensity: 0.6 });
  const brassSide = new THREE.MeshStandardMaterial({ color: 0x6b5330, roughness: 0.5, metalness: 0.4 });
  const letters = channelLetters(nameMask, nameW, nameH, 0.035, brass, brassSide);
  letters.position.set(nameX, beamY + 0.02, beamFront + 0.025);
  f.add(letters);
  const halo = canvasTex(1024, 256, (cg) => {
    cg.clearRect(0, 0, 1024, 256);
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    fit(cg, '행복빌라', 1024 * 0.96, Math.round(256 * 0.82), 800, 0.08);
    cg.shadowColor = 'rgba(255,255,255,1)';
    cg.shadowBlur = 30;
    cg.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 3; i++) cg.fillText('행복빌라', 512, 256 * 0.54);
  });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, map: halo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  glow.push(haloMat);
  const haloM = new THREE.Mesh(new THREE.PlaneGeometry(nameW * 1.08, nameH * 1.3), haloMat);
  haloM.position.set(nameX, beamY + 0.02, beamFront + 0.004);
  f.add(haloM);
  // 오른쪽: 가는 세로선 + 영문 이름 · 번지
  box(0.012, nameH * 0.8, 0.01, brass, 0.78, beamY + 0.02, beamFront + 0.005);
  const sub = plane(
    0.8,
    0.2,
    canvasTex(512, 128, (cg) => {
      cg.clearRect(0, 0, 512, 128);
      cg.textBaseline = 'middle';
      cg.fillStyle = '#d9c08a';
      fit(cg, 'HAPPY VILLA', 480, 44, 600, 0.35);
      cg.fillText('HAPPY VILLA', 8, 42);
      cg.fillStyle = '#9b9ea4';
      fit(cg, 'HANGANG-RO 12', 480, 30, 500, 0.4);
      cg.fillText('HANGANG-RO 12', 8, 94);
    }),
    { cutout: true },
  );
  sub.position.set(1.22, beamY + 0.02, beamFront + 0.006);
  f.add(sub);

  // 파란 도로명 주소판 (한국식) — 왼쪽 기둥 바깥 벽
  const addr = canvasTex(512, 160, (cg) => {
    cg.fillStyle = '#1f4ea3';
    cg.fillRect(0, 0, 512, 160);
    cg.strokeStyle = '#ffffff';
    cg.lineWidth = 6;
    cg.strokeRect(10, 10, 492, 140);
    cg.fillStyle = '#ffffff';
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    cg.font = `bold 64px ${FONT}`;
    cg.fillText('한강로 12', 256, 68);
    cg.font = `600 28px ${FONT}`;
    cg.fillText('Hangang-ro', 256, 124);
  });
  const ap = plane(0.6, 0.19, addr);
  ap.position.set(-PW / 2 - 0.5, 2.75, 0.03);
  f.add(ap);
  door.setOpen(0);
  return { door, glow };
}

/**
 * 아파트: 정면 꼭대기 단지 이름 + 옆벽 큰 동 번호 (요즘 아파트처럼 바탕 없는 입체 글자).
 */
export function apartmentSigns(g: THREE.Group, b: Building, label: string) {
  const letters = (text: string, sub: string | null, w: number, h: number, color: string) =>
    canvasTex(w, h, (cg) => {
      cg.clearRect(0, 0, w, h);
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      const main = fit(cg, text, w * 0.94, Math.round(h * (sub ? 0.62 : 0.8)), 800, 0.06);
      const y = sub ? h * 0.4 : h * 0.52;
      cg.fillStyle = 'rgba(0,0,0,0.3)';
      cg.fillText(text, w / 2 + main * 0.03, y + main * 0.04);
      cg.fillStyle = color;
      cg.fillText(text, w / 2, y);
      if (sub) {
        fit(cg, sub, w * 0.8, Math.round(h * 0.16), 600, 0.5);
        cg.fillText(sub, w / 2, h * 0.86);
      }
    });
  // 정면 꼭대기: 단지 이름
  const fw = Math.min(b.w * 0.6, 9);
  const front = plane(fw, fw / 4, letters('한강뷰', 'HANGANG VIEW', 1024, 256, '#24406e'), { cutout: true });
  front.position.set(0, b.h - 1.6, b.d / 2 + 0.06);
  g.add(front);
  // 옆벽(동쪽) 꼭대기: 동 번호
  const side = plane(4.2, 2.1, letters(label, null, 1024, 512, '#24406e'), { cutout: true });
  side.position.set(b.w / 2 + 0.06, b.h - 2.6, 0);
  side.rotation.y = Math.PI / 2;
  g.add(side);
}
