/**
 * 배경 음악: 음원 파일 없이 Web Audio 로 만드는 짧은 반복 비트 (킥·스네어·하이햇·베이스·패드).
 * 효과음과 따로 켜고 끈다. 박자에 맞춰 조금씩 앞서 예약하는 방식이라 화면이 버벅여도 박자가 밀리지 않는다.
 */

const MUTE_KEY = 'ironfist.bgmMuted';

export type BgmTheme = 'fight' | 'boss' | 'field';

/** 테마별 템포·베이스 음 (단조 느낌) */
const THEMES: Record<BgmTheme, { bpm: number; bass: number[]; pad: number[][]; volume: number }> = {
  fight: { bpm: 132, bass: [55, 55, 65.4, 49], pad: [[220, 261.6, 329.6], [220, 261.6, 329.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], volume: 0.16 },
  // 필드: 밝은 장조, 느리고 가볍게 (오래 틀어 둬도 덜 피곤하게)
  field: { bpm: 100, bass: [65.4, 49, 55, 43.65], pad: [[261.6, 329.6, 392], [196, 246.9, 293.7], [220, 261.6, 329.6], [174.6, 220, 261.6]], volume: 0.12 },
  boss: { bpm: 118, bass: [41.2, 41.2, 43.65, 36.7], pad: [[164.8, 196, 246.9], [164.8, 196, 246.9], [174.6, 207.7, 261.6], [146.8, 174.6, 220]], volume: 0.18 },
};

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let timer = 0;
let playing: BgmTheme | null = null;
let nextTime = 0;
let step = 0;
let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isBgmMuted() {
  return muted;
}

export function setBgmMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {}
  if (out && ctx) out.gain.setTargetAtTime(m ? 0 : THEMES[playing ?? 'fight'].volume, ctx.currentTime, 0.1);
  listeners.forEach((l) => l(m));
}

export function onBgmMuteChange(l: (m: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function env(c: AudioContext, at: number, peak: number, dur: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(out!);
  return g;
}

function kick(c: AudioContext, at: number) {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
  o.connect(env(c, at, 1, 0.22));
  o.start(at);
  o.stop(at + 0.25);
}

function hiss(c: AudioContext, at: number, dur: number, freq: number, peak: number) {
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  s.connect(f).connect(env(c, at, peak, dur));
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.02);
}

function note(c: AudioContext, at: number, freq: number, dur: number, peak: number, type: OscillatorType) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = type === 'sawtooth' ? 900 : 2400;
  o.connect(f).connect(env(c, at, peak, dur));
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** 16분음표 한 칸 */
function schedule(c: AudioContext, theme: BgmTheme, at: number, i: number) {
  const t = THEMES[theme];
  const sixteenth = 60 / t.bpm / 4;
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  if (theme === 'field') {
    // 킥은 마디 첫 박만, 하이햇은 살짝, 화음을 한 음씩 짚는 아르페지오
    if (s === 0) kick(c, at);
    if (s === 8) hiss(c, at, 0.1, 2500, 0.18);
    if (s % 4 === 2) hiss(c, at, 0.03, 8000, 0.07);
    if (s === 0 || s === 10) note(c, at, t.bass[bar], sixteenth * 5, 0.5, 'triangle');
    if (s % 2 === 0) {
      const chord = t.pad[bar];
      const k = (s / 2) % 4;
      note(c, at, chord[k % 3] * (k === 3 ? 2 : 1), sixteenth * 2.5, 0.07, 'triangle');
    }
    if (s === 0) for (const f of t.pad[bar]) note(c, at, f / 2, sixteenth * 15, 0.035, 'sine');
    return;
  }
  if (s === 0 || s === 8 || (theme === 'fight' && s === 10)) kick(c, at);
  if (s === 4 || s === 12) hiss(c, at, 0.14, 1500, 0.45); // 스네어
  if (s % 2 === 0) hiss(c, at, 0.04, 7000, s % 4 === 2 ? 0.22 : 0.12); // 하이햇
  if (s % 4 === 0 || s === 14) note(c, at, t.bass[bar], sixteenth * 1.8, 0.55, 'sawtooth');
  if (s === 0) for (const f of t.pad[bar]) note(c, at, f, sixteenth * 14, 0.05, 'triangle');
}

/** 테마 음악을 튼다 (이미 같은 테마면 그대로) */
export function startBgm(theme: BgmTheme) {
  const c = ensure();
  if (!c || playing === theme) return;
  stopBgm();
  playing = theme;
  step = 0;
  nextTime = c.currentTime + 0.1;
  out!.gain.setTargetAtTime(muted ? 0 : THEMES[theme].volume, c.currentTime, 0.3);
  const tick = () => {
    if (!ctx || playing !== theme) return;
    // 소리가 꺼져 있거나 브라우저가 아직 오디오를 막고 있으면 예약하지 않는다
    if (ctx.state === 'running' && !muted) {
      const sixteenth = 60 / THEMES[theme].bpm / 4;
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
      while (nextTime < ctx.currentTime + 0.2) {
        schedule(ctx, theme, nextTime, step++);
        nextTime += sixteenth;
      }
    } else if (ctx.state === 'suspended') void ctx.resume();
  };
  timer = window.setInterval(tick, 50);
}

export function stopBgm() {
  if (timer) window.clearInterval(timer);
  timer = 0;
  playing = null;
  if (out && ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}
