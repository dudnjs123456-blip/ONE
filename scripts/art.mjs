// 그림 보관함 (art/library): Firefly 로 뽑은 원본 + 프롬프트 + 설명 + 화풍 점수를 함께 쌓는다.
// 쌓인 것은 그대로 게임에 넣고(변환), 나중에 내 PC 그림 모델 학습 재료(dataset)로 쓴다.
//
//   node scripts/art.mjs scan                        다운로드 폴더의 새 Firefly 그림 + 화풍 점수
//   node scripts/art.mjs check <그림>                화풍 점수만 (기준: art/style-bible.json)
//   node scripts/art.mjs add <그림> --kind bg --id <이름> --prompt-file <프롬프트.txt> [--ref 다른id,...]
//                        [--caption "학습용 설명"] [--to public/prologue/x.webp] [--width 2560] [--q 80]
//   node scripts/art.mjs export <id> --to public/prologue/x.webp [--width 2560] [--q 80]
//   node scripts/art.mjs list                        보관함 목록
//   node scripts/art.mjs dataset                     학습용 묶음 만들기 (art/dataset, 저장소에 안 올림)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const LIB = path.join(ROOT, 'art', 'library');
const BIBLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'style-bible.json'), 'utf8'));
const DOWNLOADS = path.join(os.homedir(), 'Downloads');

const [cmd, ...rest] = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? true : rest[++i];
  else args._.push(rest[i]);
}

// ───────────────────────── 화풍 측정

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), l = (M + m) / 2;
  let h = 0, s = 0;
  if (M !== m) {
    const d = M - m;
    s = l > 0.5 ? d / (2 - M - m) : d / (M + m);
    h = M === r ? (g - b) / d + (g < b ? 6 : 0) : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

/** 밝기·색상·채도 분포 (작게 줄여서 잰다) */
export async function measure(file) {
  const img = sharp(file);
  const meta = await img.metadata();
  const { data, info } = await img.resize(320).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const L = [], H = [], S = [];
  const rows = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [h, s, l] = hsl(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    L.push(l); S.push(s);
    if (s > 0.08) H.push(h);
    rows[Math.min(3, Math.floor((Math.floor(i / info.width) / info.height) * 4))] += l;
  }
  const q = (a, p) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length * p)] : 0);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    width: meta.width,
    height: meta.height,
    aspect: r3(meta.width / meta.height),
    meanL: r3(L.reduce((a, b) => a + b, 0) / n),
    p05: r3(q(L, 0.05)),
    p95: r3(q(L, 0.95)),
    brightPx: Math.round((L.filter((x) => x > 0.75).length / n) * 10000) / 10000,
    hueMed: Math.round(q(H, 0.5)),
    satMed: r3(q(S, 0.5)),
    rowsL: rows.map((v) => r3(v / (n / 4))),
  };
}

/** 기준표(style-bible.json)와 비교: 항목마다 통과/벗어남 */
function score(m, kind) {
  const rule = BIBLE[kind];
  if (!rule) return { pass: null, items: [] };
  const items = Object.entries(rule.ranges).map(([k, [lo, hi]]) => {
    const v = m[k];
    const ok = v >= lo && v <= hi;
    return { k, v, lo, hi, ok, label: rule.labels?.[k] ?? k };
  });
  const passed = items.filter((x) => x.ok).length;
  return { pass: passed === items.length, passed, total: items.length, items };
}

function printScore(file, m, s) {
  console.log(`\n${path.basename(file)}  (${m.width}×${m.height})`);
  if (s.pass === null) return console.log('  (이 종류는 기준표가 없어요)');
  for (const x of s.items) console.log(`  ${x.ok ? '✓' : '✗'} ${x.label}: ${x.v}  (기준 ${x.lo} ~ ${x.hi})`);
  console.log(`  → ${s.pass ? '합격' : '불합격'} (${s.passed}/${s.total})`);
}

// ───────────────────────── 보관함

function items() {
  const out = [];
  if (!fs.existsSync(LIB)) return out;
  for (const kind of fs.readdirSync(LIB)) {
    const kd = path.join(LIB, kind);
    if (!fs.statSync(kd).isDirectory()) continue;
    for (const id of fs.readdirSync(kd)) {
      const mf = path.join(kd, id, 'meta.json');
      if (fs.existsSync(mf)) out.push({ dir: path.join(kd, id), ...JSON.parse(fs.readFileSync(mf, 'utf8')) });
    }
  }
  return out;
}

/** 와이드(가로 2:1 넘음) = 배경, 나머지는 시트로 짐작 */
const guessKind = (m) => (m.aspect >= 2 ? 'bg' : 'sheet');

async function toWebp(src, to, width, q) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const meta = await sharp(src).metadata();
  await sharp(src)
    .resize(Math.min(width, meta.width))
    .webp({ quality: q, alphaQuality: 90 })
    .toFile(to);
  return fs.statSync(to).size;
}

async function main() {
  switch (cmd) {
    case 'check': {
      const f = args._[0];
      const m = await measure(f);
      printScore(f, m, score(m, args.kind ?? guessKind(m)));
      break;
    }
    case 'scan': {
      // 보관함에 없는 Firefly 그림 (최근 것부터 20장)
      const known = new Set(items().map((x) => x.source));
      const files = fs
        .readdirSync(DOWNLOADS)
        .filter((n) => /^Firefly/i.test(n) && /\.(png|jpe?g|webp)$/i.test(n) && !known.has(n))
        .map((n) => ({ n, t: fs.statSync(path.join(DOWNLOADS, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(0, Number(args.n ?? 20));
      if (!files.length) console.log('새 Firefly 그림이 없어요');
      for (const { n } of files) {
        const f = path.join(DOWNLOADS, n);
        const m = await measure(f);
        printScore(f, m, score(m, guessKind(m)));
      }
      break;
    }
    case 'add': {
      const src = args._[0];
      const kind = args.kind;
      const id = args.id;
      if (!src || !kind || !id) throw new Error('add <그림> --kind bg|sheet|concept --id <이름> 이 필요해요');
      const dir = path.join(LIB, kind, id);
      fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || '.png';
      const orig = path.join(dir, `original${ext}`);
      if (path.resolve(src) !== path.resolve(orig)) fs.copyFileSync(src, orig);
      const prompt = args['prompt-file'] ? fs.readFileSync(args['prompt-file'], 'utf8').trim() : String(args.prompt ?? '').trim();
      if (prompt) fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt + '\n');
      const m = await measure(orig);
      const s = score(m, kind);
      const prev = fs.existsSync(path.join(dir, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) : {};
      const meta = {
        ...prev,
        id,
        kind,
        source: prev.source ?? path.basename(src),
        tool: args.tool ?? prev.tool ?? 'Adobe Firefly · Gemini Flash (Google)',
        added: prev.added ?? new Date().toISOString().slice(0, 10),
        refs: args.ref ? String(args.ref).split(',') : (prev.refs ?? []),
        caption: args.caption ?? prev.caption ?? '',
        usedIn: prev.usedIn ?? [],
        metrics: m,
        bible: { pass: s.pass, passed: s.passed, total: s.total },
      };
      if (args.to) {
        const size = await toWebp(orig, path.join(ROOT, args.to), Number(args.width ?? 2560), Number(args.q ?? 80));
        meta.usedIn = [...new Set([...meta.usedIn, args.to])];
        console.log(`게임용 → ${args.to} (${Math.round(size / 1024)}KB)`);
      }
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
      printScore(orig, m, s);
      console.log(`보관함 → art/library/${kind}/${id}/`);
      break;
    }
    case 'export': {
      const it = items().find((x) => x.id === args._[0]);
      if (!it || !args.to) throw new Error('export <id> --to <경로> 가 필요해요');
      const orig = fs.readdirSync(it.dir).find((n) => n.startsWith('original'));
      const size = await toWebp(path.join(it.dir, orig), path.join(ROOT, args.to), Number(args.width ?? 2560), Number(args.q ?? 80));
      it.usedIn = [...new Set([...(it.usedIn ?? []), args.to])];
      const { dir, ...meta } = it;
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
      console.log(`게임용 → ${args.to} (${Math.round(size / 1024)}KB)`);
      break;
    }
    case 'list': {
      for (const it of items()) {
        const b = it.bible?.pass === null || it.bible?.pass === undefined ? '-' : it.bible.pass ? '합격' : `불합격 ${it.bible.passed}/${it.bible.total}`;
        console.log(`${it.kind.padEnd(8)} ${it.id.padEnd(20)} ${b.padEnd(10)} ${it.added}  ${it.usedIn?.join(', ') ?? ''}`);
      }
      break;
    }
    case 'dataset': {
      // 학습 도구(kohya 등)가 읽는 모양: 그림 + 같은 이름의 .txt 설명. 기준표 합격 + 설명 있는 배경만
      const out = path.join(ROOT, 'art', 'dataset', 'bg');
      fs.mkdirSync(out, { recursive: true });
      let n = 0;
      for (const it of items().filter((x) => x.kind === 'bg' && x.bible?.pass && x.caption)) {
        const orig = fs.readdirSync(it.dir).find((f) => f.startsWith('original'));
        await sharp(path.join(it.dir, orig)).resize({ width: 1536, withoutEnlargement: true }).png().toFile(path.join(out, `${it.id}.png`));
        fs.writeFileSync(path.join(out, `${it.id}.txt`), `${BIBLE.bg.trigger}, ${it.caption}\n`);
        n++;
      }
      console.log(`학습 묶음 ${n}장 → art/dataset/bg/ (그림 + 설명 .txt)`);
      // 캐릭터: meta.json 의 captions(게임 그림 경로 → 표정·구도 설명). 투명 배경은 회색으로 깔아 학습한다
      const cd = path.join(LIB, 'character');
      for (const id of fs.existsSync(cd) ? fs.readdirSync(cd) : []) {
        const mf = path.join(cd, id, 'meta.json');
        if (!fs.existsSync(mf)) continue;
        const cm = JSON.parse(fs.readFileSync(mf, 'utf8'));
        const co = path.join(ROOT, 'art', 'dataset', 'character', id);
        fs.mkdirSync(co, { recursive: true });
        let k = 0;
        for (const [img, cap] of Object.entries(cm.captions ?? {})) {
          const name = path.basename(img).replace(/\.(png|webp)$/i, '');
          await sharp(path.join(ROOT, img)).flatten({ background: '#808080' }).png().toFile(path.join(co, `${name}.png`));
          fs.writeFileSync(path.join(co, `${name}.txt`), `${cm.trigger}, ${cm.base}, ${cap}\n`);
          k++;
        }
        console.log(`캐릭터 ${cm.name ?? id} ${k}장 → art/dataset/character/${id}/`);
      }
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 12).join('\n'));
  }
}

main().catch((e) => {
  console.error('오류:', e.message);
  process.exitCode = 1;
});
