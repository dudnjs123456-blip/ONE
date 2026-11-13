// 집 재질 사진(Firefly 로 만든 것)을 게임용으로 다듬는다 → public/textures/home/*.jpg
//   node scripts/process-home-textures.mjs <원본 폴더>
// - 반복해서 까는 재질(바닥·벽지·침구·커튼): 반쯤 밀어 겹친 그림과 섞어 가장자리가 이어지게(타일 이음매 없애기)
// - 러그: 바깥 흰 배경을 잘라 낸다 · 액자 그림: 액자 비율로 가운데를 자른다
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2];
const OUT = 'public/textures/home';
fs.mkdirSync(OUT, { recursive: true });
const find = (words) => {
  const f = fs.readdirSync(SRC).find((n) => n.startsWith('Firefly_') && n.includes(words));
  if (!f) throw new Error('원본 없음: ' + words);
  return path.join(SRC, f);
};

/** 가장자리가 반대쪽과 이어지는 타일로 */
async function seamless(file, out, size = 1024, tone = { brightness: 1, saturation: 1 }) {
  const { data, info } = await sharp(file).resize(size, size).modulate(tone).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const res = Buffer.alloc(data.length);
  // 가운데는 원본, 가장자리로 갈수록 반쯤 민 그림(가장자리 = 원본의 가운데라 서로 이어진다)
  const band = 0.22;
  const w = (t) => {
    const d = Math.min(t, 1 - t); // 가장자리까지 거리 (0~0.5)
    return Math.min(1, d / band);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = Math.min(w(x / W), w(y / H));
      const sx = (x + W / 2) % W, sy = (y + H / 2) % H;
      for (let c = 0; c < C; c++) res[(y * W + x) * C + c] = data[(y * W + x) * C + c] * a + data[(sy * W + sx) * C + c] * (1 - a);
    }
  await sharp(res, { raw: { width: W, height: H, channels: C } }).jpeg({ quality: 84, mozjpeg: true }).toFile(out);
}

// 소녀방: 바닥은 밝고 연한 원목, 벽지는 화사하게, 레이스는 더 하얗게
await seamless(find('oak wood floor'), `${OUT}/floor-oak.jpg`, 1024, { brightness: 1.14, saturation: 0.7 });
await seamless(find('wallpaper pattern'), `${OUT}/wall-pink-stripe.jpg`, 1024, { brightness: 1.1, saturation: 0.85 });
await seamless(find('pink cotton quilt'), `${OUT}/quilt-pink.jpg`);
await seamless(find('voile curtain'), `${OUT}/curtain-lace.jpg`, 1024, { brightness: 1.18, saturation: 0.9 });

// 러그: 흰 배경 잘라 내기
{
  const f = find('fluffy soft pastel pink and cream rug');
  await sharp(f).trim({ background: '#ffffff', threshold: 28 }).resize(1024, 900, { fit: 'fill' }).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}/rug-heart.jpg`);
}
// 액자 그림: 0.98 x 0.58 비율
{
  const f = find('fluffy white bunny');
  const m = await sharp(f).metadata();
  const h = Math.round(m.width * (0.58 / 0.98));
  await sharp(f)
    .extract({ left: 0, top: Math.max(0, Math.round((m.height - h) / 2)), width: m.width, height: Math.min(h, m.height) })
    .resize(1024)
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(`${OUT}/art-bunny.jpg`);
}
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + 'KB');
