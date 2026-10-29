/**
 * 건물 그림(Firefly 등) → 게임용 건물 텍스처.
 *
 *   node scripts/process-facades.mjs      (npm run facades)
 *
 * art/inbox 의 파일 이름으로 종류를 나눈다:
 *  - 위층  villa-upper-*.png, facade-shop-upper-*.png, facade-apartment*.png, facade-office*.png
 *      층 간격·창문 반복 간격을 재서 '한 층 × 한 주기' 조각으로 자른다 (층수·폭에 맞춰 쌓는다)
 *  - 1층   villa-ground-*.png, facade-shop-ground-*.png
 *      맨 아래 인도는 잘라 내고 한 장 통째로 쓴다 (좌우 끝만 이어지게 다듬음)
 *  - 옆벽  villa-wall-*.png, wall-*.png
 *      타일 무늬 주기에 맞춰 잘라 이음새 없이 반복
 * 위층·1층은 밤 조명 그림(_e: 유리창만 불빛)도 만든다.
 * 결과: public/textures/facade/<이름>.jpg (+ _e.jpg), 비율 정보는 meta.json 과 src/game/render/facades.json
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IN = 'art/inbox';
const OUT = 'public/textures/facade';
const UPPER = /^(villa-upper|facade-shop-upper|facade-apartment|facade-office).*\.png$/;
const GROUND = /^(villa-ground|facade-shop-ground).*\.png$/;
const WALL = /^(villa-wall|wall)-.*\.png$/;

// ───────────── 공용 ─────────────

async function load(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  return { data, W, H, lum };
}
const profile = (img, axis) => {
  const { lum, W, H } = img;
  const p = new Float32Array(axis === 'x' ? W : H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p[axis === 'x' ? x : y] += lum[y * W + x] / (axis === 'x' ? H : W);
  return p;
};
const corr = (p, s) => {
  let m = 0;
  for (const v of p) m += v;
  m /= p.length;
  let a = 0, n = 0;
  for (let i = 0; i + s < p.length; i++) {
    a += (p[i] - m) * (p[i + s] - m);
    n++;
  }
  return a / n;
};
const bestShift = (p, lo, hi) => {
  let b = Math.floor(lo), bv = -Infinity;
  for (let s = Math.floor(lo); s <= hi; s++) {
    const v = corr(p, s);
    if (v > bv) {
      bv = v;
      b = s;
    }
  }
  return b;
};
/** 밝은 띠(창문 없는 벽)들의 가운데 위치 */
const wallCenters = (p) => {
  const sorted = [...p].sort((a, b) => a - b);
  const th = (sorted[Math.floor(sorted.length * 0.5)] + sorted[sorted.length - 1]) / 2;
  const runs = [];
  p.forEach((v, i) => {
    if (v < th) return;
    if (runs.length && runs.at(-1)[1] === i - 1) runs.at(-1)[1] = i;
    else runs.push([i, i]);
  });
  return runs.map(([a, b]) => ({ c: Math.round((a + b) / 2), w: b - a + 1 }));
};
const sm = (t) => t * t * (3 - 2 * t);

/** (x0,y0) 에서 px×py 로 자르고, 오른쪽·아래 가장자리를 정확히 한 주기 앞 픽셀과 섞어 이음새를 없앤다 */
function periodicCrop(img, x0, y0, px, py, band) {
  const { data, W, H } = img;
  const at = (x, y) => (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 3;
  const out = Buffer.alloc(px * py * 3);
  for (let y = 0; y < py; y++) {
    const ty = y >= py - band ? sm((y - (py - band) + 1) / band) : 0;
    for (let x = 0; x < px; x++) {
      const tx = x >= px - band ? sm((x - (px - band) + 1) / band) : 0;
      const sx = x0 + x, sy = y0 + y;
      const a = at(sx, sy), b = at(sx - px, sy), c = at(sx, sy - py), d = at(sx - px, sy - py);
      for (let k = 0; k < 3; k++) {
        const top = data[a + k] * (1 - tx) + data[b + k] * tx;
        const bot = data[c + k] * (1 - tx) + data[d + k] * tx;
        out[(y * px + x) * 3 + k] = Math.round(top * (1 - ty) + bot * ty);
      }
    }
  }
  return { data: out, W: px, H: py };
}

/**
 * 밤 불빛: 유리창(중간 밝기 + 색이 옅음) 부분만. 목재·벽돌처럼 색이 진한 면은 빼고,
 * 창틀(아주 어두움)과 흰 벽(아주 밝음)도 뺀다. 가로 세대마다 전구색 / 형광등색을 번갈아
 */
function glowOf(tile, units) {
  const { data, W, H } = tile;
  const out = Buffer.alloc(W * H * 3);
  const looks = [
    [255, 205, 140, 1.0],
    [235, 240, 255, 0.55],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      const glass =
        Math.min(1, Math.max(0, (l - 55) / 25)) * Math.min(1, Math.max(0, (185 - l) / 25)) * Math.min(1, Math.max(0, (0.32 - sat) / 0.1));
      const [cr, cg, cb, k] = looks[Math.floor((x / W) * units) % looks.length];
      out[i] = Math.round(cr * glass * k);
      out[i + 1] = Math.round(cg * glass * k);
      out[i + 2] = Math.round(cb * glass * k);
    }
  return { data: out, W, H };
}

const raw = (t) => sharp(t.data, { raw: { width: t.W, height: t.H, channels: 3 } });
async function save(name, tile, glow, size) {
  fs.mkdirSync(OUT, { recursive: true });
  // 2의 거듭제곱 크기로 (반복·밉맵용). 원래 비율은 meta 에 적어 두고 게임에서 되돌린다
  const [tw, th] = size;
  await raw(tile).resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));
  if (glow) await raw(glow).resize(tw, th, { fit: 'fill' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${name}_e.jpg`));
}

// ───────────── 위층: 한 층 × 한 주기 ─────────────

async function processUpper(file, name) {
  const img = await load(file);
  const rows = profile(img, 'y');
  const cols = profile(img, 'x');
  const py = bestShift(rows, img.H * 0.15, img.H * 0.5);
  const px = bestShift(cols, img.W * 0.3, img.W * 0.62);
  const band = 10;
  const pickStart = (centers, period, len) => centers.filter((w) => w.c >= band && w.c + period <= len).sort((a, b) => b.w - a.w)[0]?.c;
  const y0 = pickStart(wallCenters(rows), py, img.H);
  const x0 = pickStart(wallCenters(cols), px, img.W);
  if (y0 === undefined || x0 === undefined) {
    console.log(`✘ ${name}: 반복 무늬를 못 찾았어요 (층 ${py}px, 가로 ${px}px)`);
    return null;
  }
  // 반 주기에서도 잘 겹치면 한 주기 = 2세대 (좌우 대칭 쌍)
  const units = corr(cols, Math.round(px / 2)) > corr(cols, px) * 0.6 ? 2 : 1;
  const tile = periodicCrop(img, x0, y0, px, py, band);
  await save(name, tile, glowOf(tile, units), [1024, 512]);
  console.log(`✔ 위층 ${name}: 층 ${py}px × 가로 주기 ${px}px (가로 ${units}세대)`);
  return { kind: 'upper', aspect: +(px / py).toFixed(4), units };
}

// ───────────── 1층: 한 장 통째로 ─────────────

async function processGround(file, name) {
  const img = await load(file);
  const rows = profile(img, 'y');
  // 맨 아래 25% 안에서 밝기가 가장 크게 바뀌는 줄 = 건물 끝 / 인도 시작
  let cut = img.H, best = 0;
  for (let y = Math.floor(img.H * 0.75); y < img.H - 3; y++) {
    const jump = Math.abs(rows[y + 2] - rows[y - 1]);
    if (jump > best) {
      best = jump;
      cut = y;
    }
  }
  if (best < 25) cut = img.H; // 뚜렷한 경계가 없으면 자르지 않는다
  const H = cut - 1;
  const W = img.W;
  const tile = Buffer.alloc(W * H * 3);
  img.data.copy(tile, 0, 0, W * H * 3);
  // 좌우 끝을 이어지게: 양 끝 몇 줄의 평균 색으로 모은다
  const band = 14;
  for (let y = 0; y < H; y++) {
    const avg = [0, 1, 2].map((k) => (tile[(y * W) * 3 + k] + tile[(y * W + W - 1) * 3 + k]) / 2);
    for (let x = 0; x < band; x++) {
      const t = 1 - sm(x / band);
      for (const xx of [x, W - 1 - x]) {
        const i = (y * W + xx) * 3;
        for (let k = 0; k < 3; k++) tile[i + k] = Math.round(tile[i + k] * (1 - t) + avg[k] * t);
      }
    }
  }
  const t = { data: tile, W, H };
  await save(name, t, glowOf(t, 2), [1024, 512]);
  console.log(`✔ 1층 ${name}: ${W}×${img.H} → 아래 ${img.H - H}px(인도) 잘라 ${W}×${H}`);
  return { kind: 'ground', aspect: +(W / H).toFixed(4) };
}

// ───────────── 옆벽: 타일 무늬 ─────────────

async function processWall(file, name) {
  const img = await load(file);
  const px = bestShift(profile(img, 'x'), img.W * 0.06, img.W * 0.5);
  const py = bestShift(profile(img, 'y'), img.H * 0.06, img.H * 0.5);
  const band = 8;
  const nx = Math.max(1, Math.floor((img.W - band) / px));
  const ny = Math.max(1, Math.floor((img.H - band) / py));
  const tile = periodicCrop(img, band, band, px * nx, py * ny, band);
  await save(name, tile, null, [512, 512]);
  console.log(`✔ 옆벽 ${name}: 무늬 ${px}×${py}px, ${nx}×${ny}칸`);
  return { kind: 'wall', aspect: +((px * nx) / (py * ny)).toFixed(4), cells: [nx, ny] };
}

// ───────────── 실행 ─────────────

const metaPath = path.join(OUT, 'meta.json');
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const files = fs.existsSync(IN) ? fs.readdirSync(IN) : [];
let n = 0;
for (const f of files) {
  const name = path.basename(f, '.png');
  const file = path.join(IN, f);
  const r = UPPER.test(f) ? await processUpper(file, name) : GROUND.test(f) ? await processGround(file, name) : WALL.test(f) ? await processWall(file, name) : undefined;
  if (r === undefined) continue;
  n++;
  if (r) meta[name] = r;
}
if (!n) console.log('처리할 건물 그림이 없습니다 (art/inbox/villa-upper-*.png 등)');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
// 게임 코드가 바로 읽는 사본 (건물을 만들 때 비율이 필요해서 비동기로 받지 않는다)
fs.writeFileSync('src/game/render/facades.json', JSON.stringify(meta, null, 2) + '\n');
