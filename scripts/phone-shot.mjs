// 폰 화면 스크린샷 (Chrome 개발자 도구 프로토콜로 폰 크기·터치를 흉내 낸다)
// node --experimental-websocket scripts/phone-shot.mjs <url> <out.png> [steps.json]
// steps.json: [{ "eval": "자바스크립트" } | { "wait": ms } | { "click": "버튼 글자" } | { "key": "Enter" } | { "type": "글자" } | { "shot": "파일.png" }]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, out, stepsFile] = process.argv.slice(2);
if (!url || !out) {
  console.log('사용법: node --experimental-websocket scripts/phone-shot.mjs <url> <out.png> [steps.json]');
  process.exit(1);
}
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'phoneshot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', ...(process.env.GLFLAGS ?? '--use-angle=d3d11 --ignore-gpu-blocklist --enable-unsafe-swiftshader').split(' '), 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {}
}
if (!target) throw new Error('Chrome 에 연결 못 함');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  // 페이지 오류 모으기 (끝에 출력)
  if (msg.method === 'Runtime.exceptionThrown') errors.push('예외: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) errors.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('로그: ' + msg.params.entry.text.slice(0, 300) + (msg.params.entry.url ? ' @' + msg.params.entry.url : ''));
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    waiting.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('저장:', file);
};

// 가로로 눕힌 폰 (게임은 가로 화면이 기본) — PHONE=portrait 면 세로
// PHONE=desktop 이면 터치 없는 PC 화면 (1280x720)
const portrait = process.env.PHONE === 'portrait';
const desktop = process.env.PHONE === 'desktop';
if (desktop) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
} else {
  await send('Emulation.setDeviceMetricsOverride', { width: portrait ? 390 : 844, height: portrait ? 844 : 390, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
if (!desktop) await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Page.navigate', { url });
await sleep(6000);

const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [];
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.eval) console.log('eval →', await evaluate(s.eval));
  if (s.click) {
    const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.includes(${JSON.stringify(s.click)})); if (b) b.click(); return !!b; })()`);
    console.log(`클릭 "${s.click}" →`, ok);
    await sleep(s.after ?? 1500);
  }
  // 실제 키 입력 (사람이 누른 것과 같다): { "key": "Enter" } · { "type": "글자" }
  if (s.key) {
    const vk = { Enter: 13, Escape: 27, Slash: 191, KeyE: 69 }[s.key] ?? 0;
    const key = { Enter: 'Enter', Escape: 'Escape', Slash: '/', KeyE: 'e' }[s.key] ?? s.key;
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code: s.key, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(type === 'keyDown' && s.key === 'Enter' ? { text: String.fromCharCode(13) } : {}) });
    await sleep(s.after ?? 400);
  }
  if (s.type) {
    await send('Input.insertText', { text: s.type });
    await sleep(300);
  }
  if (s.shot) await shot(s.shot);
}
await shot(out);
console.log(errors.length ? '--- 페이지 오류 ' + errors.length + '개 ---\n' + [...new Set(errors)].join('\n') : '--- 페이지 오류 없음 ---');
ws.close();
chrome.kill();
