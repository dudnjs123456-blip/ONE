// 집 재질을 코드로 만든다 (사진·AI 그림 없이) → public/textures/home/*.jpg
//   node scripts/make-home-textures.mjs
// - marble-floor: 60cm 대리석 타일 2×2 장 (밝은 웜 화이트 + 옅은 회색 결, 장마다 결이 다르다, 가는 줄눈)
// - marble-slab: 이음매 없이 반복되는 대리석 판 (책상·협탁·주방 상판·걸레받이)
// - plaster-wall: 아주 옅은 얼룩만 있는 무광 페인트 벽 (반복해도 무늬가 안 보이게)
// 모든 노이즈는 주기(그림 크기)에 맞춰 만들어 반복해 깔아도 가장자리가 이어진다.
import fs from 'node:fs';
import sharp from 'sharp';

const OUT = 'public/textures/home';
fs.mkdirSync(OUT, { recursive: true });

/** 고정 난수 (늘 같은 그림) */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 주기 p 로 반복되는 값 노이즈 (격자 p×p, 부드러운 보간) */
function periodicNoise(p, seed) {
  const r = rng(seed);
  const g = new Float32Array(p * p).map(() => r());
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = s(x - xi), fy = s(y - yi);
    const at = (i, j) => g[(((j % p) + p) % p) * p + (((i % p) + p) % p)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** 여러 겹 노이즈 (fbm). u, v 는 0~1 (그림 한 장 = 한 주기) */
function fbm(seed, base = 4, oct = 6) {
  const layers = Array.from({ length: oct }, (_, k) => ({ n: periodicNoise(base << k, seed + k * 101), f: base << k, a: 0.5 ** k }));
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (u, v) => layers.reduce((s, l) => s + l.n(u * l.f, v * l.f) * l.a, 0) / norm;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * 대리석 한 장 (u, v 0~1 → 색).
 * - 큰 결 1~2줄: 비스듬한 줄기를 노이즈로 크게 휘게 하고, 가는 심 + 은은하게 번진 테두리
 * - 실금: 능선 노이즈(노이즈가 0.5 를 지나는 곳)로 그물처럼 갈라지는 아주 옅은 선
 * - 밑바탕: 옅은 회색 구름 얼룩 (평평한 흰색이 아니게)
 */
function marble(seed, opts = {}) {
  const { angle = 0.35, warp = 0.3, strength = 0.55, net = 0.14 } = opts;
  const cloud = fbm(seed, 2, 6);
  const turb = fbm(seed + 7, 2, 6);
  const crack = fbm(seed + 13, 4, 5);
  const fine = fbm(seed + 19, 16, 3);
  const base = [243, 241, 236];
  const vein = [122, 121, 120];
  const halo = [214, 211, 206];
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return (u, v) => {
    // 큰 결: 한 주기에 한 줄 (반복돼도 이어지게 u·v 에 정수 배)
    const t = turb(u, v) - 0.5;
    const phase = (u * 1 + v * 1) * Math.PI * 2 + t * warp * Math.PI * 4;
    const d = Math.abs(Math.sin(phase)); // 0 = 결 한가운데
    const core = Math.exp(-((d / 0.018) ** 2));
    const glow = Math.exp(-((d / 0.09) ** 2));
    // 결 세기가 자리마다 달라 끊겼다 이어진다
    const along = Math.pow(clamp01((cloud(u + 0.37, v + 0.11) - 0.3) * 2.2), 1.3);
    // 실금 그물
    const r = 1 - Math.abs(crack(u, v) * 2 - 1);
    const thin = Math.pow(clamp01((r - 0.975) / 0.025), 3) * net;
    const c = cloud(u, v) - 0.5;
    const speck = (fine(u, v) - 0.5) * 3;
    const out = [0, 1, 2].map((i) => {
      let col = base[i] + c * 16 + speck;
      col = mix(col, halo[i] + c * 10, glow * along * 0.45);
      col = mix(col, vein[i], clamp01(core * along * strength + thin));
      return Math.max(0, Math.min(255, col));
    });
    void ca;
    void sa;
    return out;
  };
}

async function save(name, W, H, px, q = 86) {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = px(x, y);
      buf[(y * W + x) * 3] = c[0];
      buf[(y * W + x) * 3 + 1] = c[1];
      buf[(y * W + x) * 3 + 2] = c[2];
    }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: q, mozjpeg: true }).toFile(`${OUT}/${name}.jpg`);
  console.log(name, (fs.statSync(`${OUT}/${name}.jpg`).size / 1024).toFixed(0) + 'KB');
}

// 바닥: 2×2 타일 (한 장 = 60cm), 장마다 다른 대리석, 줄눈 2px
{
  const S = 1024, T = S / 2;
  const tiles = [marble(11), marble(23, { warp: 0.38 }), marble(37, { warp: 0.26 }), marble(41, { warp: 0.34 })];
  const tint = [0, 2, -2, 1];
  await save('marble-floor', S, S, (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x - tx * T, ly = y - ty * T;
    const k = ty * 2 + tx;
    // 줄눈: 타일 가장자리 1.5px 는 옅은 회색, 그 안쪽 1px 은 살짝 어둡게 (모서리 모따기 느낌)
    const e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    if (e < 1.5) return [196, 192, 186];
    const c = tiles[k](lx / T, ly / T).map((v) => v + tint[k]);
    if (e < 3) return c.map((v) => v * 0.94);
    return c;
  });
}

// 판재: 이음매 없는 대리석 (가로 2 : 세로 1)
{
  const W = 1024, H = 512;
  const m = marble(77, { warp: 0.32, strength: 0.6 });
  await save('marble-slab', W, H, (x, y) => m(x / W, y / H));
}

// 벽: 따뜻한 회백색 무광 페인트, 아주 옅은 붓 자국·얼룩만
{
  const S = 512;
  const a = fbm(5, 4, 5);
  const b = fbm(9, 32, 3);
  await save('plaster-wall', S, S, (x, y) => {
    const u = x / S, v = y / S;
    const d = (a(u, v) - 0.5) * 7 + (b(u, v) - 0.5) * 3;
    return [233 + d, 228 + d, 220 + d];
  }, 88);
}
