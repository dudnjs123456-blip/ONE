// 옷 원단 사진(Firefly 로 만든 것)을 게임용 이음매 없는 타일로 다듬는다 → public/textures/fabric/<이름>.jpg
//   node scripts/process-fabric-textures.mjs <원본 폴더>
// 원본 파일 이름(Firefly 가 프롬프트로 붙인 이름)에 들어 있는 낱말로 어떤 원단인지 찾는다.
// 반쯤 밀어 겹친 그림을 가장자리 쪽에 섞어서, 타일을 이어 붙여도 이음매가 보이지 않게 한다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC) throw new Error('원본 폴더를 주세요: node scripts/process-fabric-textures.mjs <폴더>');
const OUT = 'public/textures/fabric';
fs.mkdirSync(OUT, { recursive: true });

/** 게임 이름 → 원본 파일 이름에 들어 있는 낱말 */
const FABRICS = {
  knit: 'cable knit',
  suede: 'suede',
  denim: 'washed denim',
  tweed: 'boucle tweed',
  leather: 'lambskin leather',
};

const find = (words) => {
  const f = fs.readdirSync(SRC).find((n) => n.startsWith('Firefly') && n.includes(words));
  if (!f) throw new Error('원본 없음: ' + words);
  return path.join(SRC, f);
};

/** 가장자리가 반대쪽과 이어지는 타일로 */
async function seamless(file, out, size = 512) {
  const { data, info } = await sharp(file).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const res = Buffer.alloc(data.length);
  // 가운데는 원본, 가장자리로 갈수록 반쯤 민 그림(그 가장자리 = 원본의 가운데라 서로 이어진다)
  const band = 0.25;
  const w = (t) => {
    const d = Math.min(t, 1 - t);
    return d >= band ? 0 : 1 - d / band;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = Math.max(w(x / W), w(y / H));
      const i = (y * W + x) * C;
      const j = (((y + H / 2) % H) * W + ((x + W / 2) % W)) * C;
      for (let c = 0; c < C; c++) res[i + c] = Math.round(data[i + c] * (1 - k) + data[j + c] * k);
    }
  await sharp(res, { raw: { width: W, height: H, channels: C } }).jpeg({ quality: 86 }).toFile(out);
}

for (const [name, words] of Object.entries(FABRICS)) {
  const out = path.join(OUT, `${name}.jpg`);
  await seamless(find(words), out);
  console.log('✓', out);
}
