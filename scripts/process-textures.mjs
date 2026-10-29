/**
 * Firefly 등으로 만든 바닥 그림 → 게임용 텍스처.
 *
 *   node scripts/process-textures.mjs                    art/inbox/ground-*.png 를 처리
 *   node scripts/process-textures.mjs --collage 합본.png  2×2 합본(아스팔트·보도블록 / 잔디·흙길)을 잘라서 처리
 *
 * 하는 일:
 *  1) 이음새 없애기: 무늬가 규칙적인 것(보도블록)은 무늬 주기에 맞춰 자르고,
 *     불규칙한 것(아스팔트·잔디·흙)은 반 칸 밀린 사본과 가장자리를 섞어 이어 붙여도 경계가 안 보이게
 *  2) 노멀맵: 밝기를 높이로 보고 요철 방향을 계산 (빛을 받으면 돌·풀이 도드라져 보인다)
 *  3) public/textures/ground/<이름>.jpg + <이름>_n.png 로 저장
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = 'public/textures/ground';
const NAMES = ['ground-asphalt', 'ground-sidewalk', 'ground-grass', 'ground-park-path'];
/** 무늬가 규칙적이라 주기에 맞춰 잘라야 하는 것 */
const PATTERNED = new Set(['ground-sidewalk']);
/** 노멀맵 세기 */
const BUMP = { 'ground-asphalt': 2.2, 'ground-sidewalk': 3.0, 'ground-grass': 1.6, 'ground-park-path': 2.0 };

async function load(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 2×2 합본에서 흰 여백을 찾아 네 칸으로 자른다 */
async function splitCollage(file) {
  const img = await load(file);
  const white = (x, y) => {
    const i = (y * img.w + x) * 3;
    return img.data[i] > 235 && img.data[i + 1] > 235 && img.data[i + 2] > 235;
  };
  const gap = (len, other, isWhite) => {
    const runs = [];
    for (let a = 0; a < len; a++) {
      let n = 0;
      for (let b = 0; b < other; b += 4) if (isWhite(a, b)) n++;
      runs.push(n / Math.ceil(other / 4) > 0.9);
    }
    // 가운데 근처의 흰 띠
    let s = -1, e = -1;
    for (let a = Math.floor(len * 0.3); a < len * 0.7; a++) {
      if (runs[a] && s < 0) s = a;
      if (runs[a]) e = a;
    }
    return s < 0 ? [Math.floor(len / 2), Math.floor(len / 2)] : [s, e + 1];
  };
  const [x0, x1] = gap(img.w, img.h, (x, y) => white(x, y));
  const [y0, y1] = gap(img.h, img.w, (y, x) => white(x, y));
  const pad = 3; // 경계의 흐린 픽셀 제외
  const rects = [
    { left: pad, top: pad, width: x0 - 2 * pad, height: y0 - 2 * pad },
    { left: x1 + pad, top: pad, width: img.w - x1 - 2 * pad, height: y0 - 2 * pad },
    { left: pad, top: y1 + pad, width: x0 - 2 * pad, height: img.h - y1 - 2 * pad },
    { left: x1 + pad, top: y1 + pad, width: img.w - x1 - 2 * pad, height: img.h - y1 - 2 * pad },
  ];
  console.log(`합본 ${img.w}×${img.h} → 세로 여백 ${x0}~${x1}, 가로 여백 ${y0}~${y1}`);
  const out = {};
  for (let k = 0; k < 4; k++) {
    const { data, info } = await sharp(file).removeAlpha().extract(rects[k]).raw().toBuffer({ resolveWithObject: true });
    out[NAMES[k]] = { data, w: info.width, h: info.height };
  }
  return out;
}

function lum(img) {
  const L = new Float32Array(img.w * img.h);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * img.data[i * 3] + 0.587 * img.data[i * 3 + 1] + 0.114 * img.data[i * 3 + 2];
  return L;
}

/** 무늬 주기 (가로 dx 또는 세로 dy 로 밀었을 때 가장 잘 겹치는 거리) */
function period(img, axis) {
  const L = lum(img);
  let mean = 0;
  for (const v of L) mean += v;
  mean /= L.length;
  const len = axis === 'x' ? img.w : img.h;
  const scores = [];
  for (let s = 0; s < len / 2; s++) {
    let sum = 0, n = 0;
    for (let y = 0; y < img.h - (axis === 'y' ? s : 0); y += 2) {
      for (let x = 0; x < img.w - (axis === 'x' ? s : 0); x += 2) {
        const a = L[y * img.w + x] - mean;
        const b = L[(y + (axis === 'y' ? s : 0)) * img.w + x + (axis === 'x' ? s : 0)] - mean;
        sum += a * b;
        n++;
      }
    }
    scores.push(sum / n);
  }
  // 처음으로 크게 솟는 봉우리 (너무 작은 거리는 제외)
  let best = -1, bestV = -Infinity;
  for (let s = Math.floor(len * 0.08); s < scores.length - 1; s++) {
    if (scores[s] > scores[s - 1] && scores[s] >= scores[s + 1] && scores[s] > bestV * 1.02) {
      if (best > 0 && scores[s] < scores[best] * 1.05) continue;
      best = s;
      bestV = scores[s];
    }
  }
  return best;
}

/**
 * 규칙 무늬 이어 붙이기: 무늬 주기의 정수배(W×H)로 자르고, 오른쪽·아래 가장자리 band 픽셀은
 * '자른 영역 바로 앞(정확히 W, H 만큼 앞)' 의 원본과 섞는다. 주기가 맞으니 블록이 겹쳐 보이지 않고,
 * 오른쪽 끝이 왼쪽 시작 바로 앞 픽셀이 되어 이어 붙인 경계가 매끄럽다.
 */
function periodicTile(img, x0, y0, W, H, band) {
  const px = (x, y) => (Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 3;
  const sm = (t) => t * t * (3 - 2 * t);
  // 가로: 행 y0-band ~ y0+H 를 미리 만든다 (세로 처리에서 위쪽 band 행도 필요)
  const rows = H + band;
  const R = new Float32Array(W * rows * 3);
  for (let r = 0; r < rows; r++) {
    const y = y0 - band + r;
    for (let x = 0; x < W; x++) {
      const t = x >= W - band ? sm((x - (W - band) + 1) / band) : 0;
      const a = px(x0 + x, y), b = px(x0 + x - W, y);
      for (let c = 0; c < 3; c++) R[(r * W + x) * 3 + c] = img.data[a + c] * (1 - t) + img.data[b + c] * t;
    }
  }
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y >= H - band ? sm((y - (H - band) + 1) / band) : 0;
    for (let x = 0; x < W; x++) {
      const a = ((y + band) * W + x) * 3; // 원래 행
      const b = ((y + band - H) * W + x) * 3; // H 만큼 앞 행 (band 안쪽이면 미리 만든 위쪽 행)
      for (let c = 0; c < 3; c++) data[(y * W + x) * 3 + c] = Math.round(R[a + c] * (1 - t) + (y + band - H >= 0 ? R[b + c] : R[a + c]) * t);
    }
  }
  return { data, w: W, h: H };
}

/**
 * 이어 붙이기: 반 칸 밀린 사본(B)은 가장자리가 원래 그림의 한가운데라 이어 붙여도 매끄럽다.
 * 가장자리 쪽은 B, 가운데는 원본(A) 을 써서 섞는다.
 */
function makeSeamless(img, band) {
  const { w, h } = img;
  const out = Buffer.alloc(w * h * 3);
  const edge = (t, len) => {
    const d = Math.min(t, len - 1 - t) / (len * band); // 가장자리에서 떨어진 정도
    const u = Math.min(1, Math.max(0, d));
    return 1 - u * u * (3 - 2 * u);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wgt = Math.max(edge(x, w), edge(y, h));
      const bx = (x + Math.floor(w / 2)) % w;
      const by = (y + Math.floor(h / 2)) % h;
      const ia = (y * w + x) * 3;
      const ib = (by * w + bx) * 3;
      for (let c = 0; c < 3; c++) out[ia + c] = Math.round(img.data[ia + c] * (1 - wgt) + img.data[ib + c] * wgt);
    }
  }
  return { data: out, w, h };
}

/** 밝기 → 높이 → 노멀맵 (가장자리는 반대편과 이어지게 감싸서 계산) */
function normalMap(img, strength) {
  const { w, h } = img;
  const L = lum(img);
  // 잔무늬만 남기도록 살짝 흐리게
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += L[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      H[y * w + x] = s / 9 / 255;
    }
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = (xx, yy) => H[((yy + h) % h) * w + ((xx + w) % w)];
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      let nx = -gx, ny = gy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  return { data: out, w, h };
}

async function processOne(name, img) {
  let tile = img;
  if (PATTERNED.has(name)) {
    const px = period(img, 'x');
    const py = period(img, 'y');
    const band = 12;
    if (px > 0 && py > 0 && img.w - band >= px && img.h - band >= py) {
      const nx = Math.max(1, Math.floor((img.w - band) / px));
      const ny = Math.max(1, Math.floor((img.h - band) / py));
      console.log(`  ${name}: 무늬 주기 ${px}×${py}px → ${nx}×${ny} 칸으로 자름`);
      tile = periodicTile(img, band, band, px * nx, py * ny, band);
    } else tile = makeSeamless(img, 0.25);
  } else tile = makeSeamless(img, 0.25);

  const raw = (t) => sharp(t.data, { raw: { width: t.w, height: t.h, channels: 3 } });
  // 정사각형 2의 거듭제곱 크기로 (반복·밉맵에 유리). 원본이 작으면 512, 크면 1024
  const size = Math.max(tile.w, tile.h) >= 900 ? 1024 : 512;
  const sq = await raw(tile).resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const sqImg = { data: sq, w: size, h: size };
  fs.mkdirSync(OUT, { recursive: true });
  await raw(sqImg).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));
  // 노멀맵도 jpg (png 의 1/5 크기, 화질 차이는 거의 없다)
  await raw(normalMap(sqImg, BUMP[name] ?? 2)).jpeg({ quality: 92, mozjpeg: true }).toFile(path.join(OUT, `${name}_n.jpg`));
  // 원래 가로세로 비율 (게임에서 한 칸의 실제 크기를 정할 때 참고)
  return { name, size, aspect: +(tile.w / tile.h).toFixed(3) };
}

const args = process.argv.slice(2);
const ci = args.indexOf('--collage');
let inputs = {};
if (ci >= 0) inputs = await splitCollage(args[ci + 1]);
else
  for (const n of NAMES) {
    const f = path.join('art/inbox', `${n}.png`);
    if (fs.existsSync(f)) inputs[n] = await load(f);
  }
if (!Object.keys(inputs).length) {
  console.log('처리할 그림이 없습니다 (art/inbox/ground-*.png)');
  process.exit(0);
}
const meta = {};
for (const [n, img] of Object.entries(inputs)) {
  const r = await processOne(n, img);
  meta[n] = { aspect: r.aspect };
  console.log(`✔ ${n}: ${img.w}×${img.h} → ${r.size}×${r.size} (타일 비율 ${r.aspect})`);
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
