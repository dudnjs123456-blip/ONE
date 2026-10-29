/**
 * VRM(=GLB) 안의 텍스처를 줄여서 GPU 메모리와 다운로드 크기를 줄인다.
 *
 *   node scripts/shrink-vrm.mjs public/models/heroine.vrm            (기본: 최대 1024, 썸네일 256)
 *   node scripts/shrink-vrm.mjs 모델.vrm --max 512
 *
 * 원본은 art/originals/ 에 한 번만 복사해 두고, 항상 그 원본에서 다시 만든다 (여러 번 돌려도 화질이 계속 떨어지지 않게).
 * 뼈·표정·물리(VRM 확장) 데이터는 건드리지 않고, 이미지 조각만 바꿔 끼운 뒤 바이너리 위치를 다시 계산한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const max = Number(args[args.indexOf('--max') + 1]) || 1024;
const THUMB = 256;
if (!file) {
  console.log('사용법: node scripts/shrink-vrm.mjs <파일.vrm> [--max 1024]');
  process.exit(1);
}

const origDir = 'art/originals';
const orig = path.join(origDir, path.basename(file));
fs.mkdirSync(origDir, { recursive: true });
if (!fs.existsSync(orig)) fs.copyFileSync(file, orig);

const glb = fs.readFileSync(orig);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB(VRM) 파일이 아닙니다');
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binHeader = 20 + jsonLen;
const binLen = glb.readUInt32LE(binHeader);
const bin = glb.subarray(binHeader + 8, binHeader + 8 + binLen);

// 썸네일 이미지 번호 (VRM 1.0 / 0.x)
const thumbTex = json.extensions?.VRMC_vrm?.meta?.thumbnailImage ?? json.extensions?.VRM?.meta?.texture;
const thumbImage = json.extensions?.VRMC_vrm ? thumbTex : json.textures?.[thumbTex]?.source;

const replaced = new Map(); // bufferView 번호 → 새 데이터
let before = 0;
let after = 0;
for (const [i, im] of (json.images ?? []).entries()) {
  if (im.bufferView === undefined) continue;
  const bv = json.bufferViews[im.bufferView];
  const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const meta = await sharp(data).metadata();
  const limit = i === thumbImage ? THUMB : max;
  const big = Math.max(meta.width, meta.height);
  if (big <= limit) continue;
  const s = limit / big;
  const w = Math.max(1, Math.round(meta.width * s));
  const h = Math.max(1, Math.round(meta.height * s));
  let img = sharp(data).resize(w, h, { kernel: 'lanczos3' });
  img = im.mimeType === 'image/jpeg' ? img.jpeg({ quality: 90 }) : img.png({ compressionLevel: 9 });
  const out = await img.toBuffer();
  replaced.set(im.bufferView, out);
  before += meta.width * meta.height * 4 * 1.33;
  after += w * h * 4 * 1.33;
  console.log(`  ${im.name ?? i}: ${meta.width}×${meta.height} → ${w}×${h}${i === thumbImage ? ' (썸네일)' : ''}`);
}
if (!replaced.size) {
  console.log('줄일 텍스처가 없습니다');
  fs.copyFileSync(orig, file);
  process.exit(0);
}

// 바이너리 다시 쌓기: 조각마다 4바이트 정렬
const parts = [];
let offset = 0;
const order = json.bufferViews.map((bv, i) => ({ bv, i })).sort((a, b) => (a.bv.byteOffset ?? 0) - (b.bv.byteOffset ?? 0));
for (const { bv, i } of order) {
  const data = replaced.get(i) ?? bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad));
  offset += pad;
  bv.byteOffset = offset;
  bv.byteLength = data.length;
  parts.push(data);
  offset += data.length;
}
const tail = (4 - (offset % 4)) % 4;
if (tail) parts.push(Buffer.alloc(tail));
const newBin = Buffer.concat(parts);
json.buffers[0].byteLength = offset;

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jpad = (4 - (jsonBuf.length % 4)) % 4;
if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonBuf.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(newBin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(file, Buffer.concat([header, jh, jsonBuf, bh, newBin]));

const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
console.log(`✔ ${file}: 파일 ${mb(glb.length)} → ${mb(fs.statSync(file).size)}, 줄인 텍스처의 GPU 메모리 ${mb(before)} → ${mb(after)}`);
console.log(`  원본: ${orig}`);
