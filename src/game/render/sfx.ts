/**
 * 효과음: 음원 파일 없이 Web Audio 로 바로 합성한다 (용량 0, 저작권 걱정 없음).
 * 브라우저는 사용자 입력 전엔 소리를 막으므로, 첫 키/터치 때 깨운다.
 */

const MUTE_KEY = 'ironfist.sfxMuted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    // 큰 소리가 겹쳐도 찢어지지 않게
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.state === 'running' ? ctx : null;
}

/** 첫 입력 때 오디오를 깨운다. 반환값으로 해제 */
export function unlockAudioOnInput(): () => void {
  const wake = () => {
    audio();
  };
  window.addEventListener('keydown', wake);
  window.addEventListener('pointerdown', wake);
  return () => {
    window.removeEventListener('keydown', wake);
    window.removeEventListener('pointerdown', wake);
  };
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {}
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
  listeners.forEach((l) => l(m));
}

export function onMuteChange(l: (m: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 잡음 터짐: 타격의 "퍽" 부분 */
/** 지금 소리들에 곱하는 크기 (필드처럼 소리가 잦은 곳은 작게) */
let scale = 1;

function noise(c: AudioContext, at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
  gain *= scale;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

/** 음 하나: 저음 "쿵", 신호음 등 */
function tone(c: AudioContext, at: number, dur: number, from: number, to: number, gain: number, type: OscillatorType = 'sine') {
  gain *= scale;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export type HitSound = 'hit' | 'counter' | 'block';

/** @param volume 0~1 (필드 자동사냥처럼 잦으면 작게) */
export function playHit(kind: HitSound, heavy: boolean, volume = 1) {
  const c = audio();
  if (!c || muted) return;
  scale = volume;
  try {
    hitSound(c, kind, heavy);
  } finally {
    scale = 1;
  }
}

function hitSound(c: AudioContext, kind: HitSound, heavy: boolean) {
  const t = c.currentTime;
  if (kind === 'block') {
    // 막힘: 짧고 딱딱한 "탁"
    noise(c, t, 0.06, 2400, 4, 0.5);
    tone(c, t, 0.05, 900, 500, 0.15, 'square');
    return;
  }
  const big = heavy || kind === 'counter';
  noise(c, t, big ? 0.16 : 0.09, big ? 900 : 1400, 1.2, big ? 0.9 : 0.7);
  tone(c, t, big ? 0.22 : 0.12, big ? 160 : 220, 50, big ? 0.9 : 0.6);
  if (kind === 'counter') {
    // 카운터: 위에 날카로운 "칭"
    tone(c, t, 0.25, 1800, 1200, 0.18, 'triangle');
  }
}

/** 헛스윙 "휙" */
export function playWhoosh(heavy: boolean) {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.5;
  f.frequency.setValueAtTime(heavy ? 500 : 900, t);
  f.frequency.exponentialRampToValueAtTime(heavy ? 1400 : 2600, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(heavy ? 0.22 : 0.14, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.17);
}

/** 라운드 시작 종 / FIGHT! / K.O. */
export function playCue(cue: 'round' | 'fight' | 'ko' | 'win' | 'lose' | 'roar') {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime;
  switch (cue) {
    case 'round':
      tone(c, t, 0.9, 660, 640, 0.25, 'triangle');
      tone(c, t, 0.9, 1320, 1300, 0.08, 'sine');
      break;
    case 'fight':
      tone(c, t, 0.12, 440, 440, 0.2, 'sawtooth');
      tone(c, t + 0.12, 0.35, 660, 660, 0.25, 'sawtooth');
      noise(c, t + 0.12, 0.3, 3000, 0.7, 0.15, 'highpass');
      break;
    case 'ko':
      tone(c, t, 1.2, 120, 35, 1.0);
      noise(c, t, 0.5, 400, 0.8, 0.8, 'lowpass');
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, 0.3, f, f, 0.18, 'triangle'));
      break;
    case 'lose':
      // 내려가는 세 음
      [392, 330, 262].forEach((f, i) => tone(c, t + i * 0.22, 0.5, f, f * 0.97, 0.16, 'triangle'));
      break;
    case 'roar':
      // 보스 분노: 낮게 긁는 포효
      tone(c, t, 1.1, 90, 55, 0.5, 'sawtooth');
      tone(c, t, 1.1, 135, 80, 0.25, 'sawtooth');
      noise(c, t, 1.0, 300, 0.6, 0.5, 'lowpass');
      break;
  }
}

let lastCoin = 0;
/** 골드 획득 "찰랑" (너무 잦으면 건너뜀) */
export function playCoin() {
  const c = audio();
  if (!c || muted || c.currentTime - lastCoin < 0.08) return;
  lastCoin = c.currentTime;
  const t = c.currentTime;
  tone(c, t, 0.08, 1568, 1568, 0.09, 'square');
  tone(c, t + 0.07, 0.25, 2093, 2093, 0.09, 'square');
}

/** 레벨업 팡파르 */
export function playLevelUp() {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime;
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.07, 0.35, f, f, 0.16, 'triangle'));
  tone(c, t + 0.35, 0.8, 1047, 1047, 0.12, 'sine');
}

/** 다운: 바닥에 떨어지는 "쿵" (heavy = KO 처럼 크게) */
export function playThud(heavy = false) {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime;
  tone(c, t, heavy ? 0.45 : 0.3, heavy ? 110 : 140, 40, heavy ? 0.9 : 0.6);
  noise(c, t, heavy ? 0.3 : 0.18, 260, 0.7, heavy ? 0.6 : 0.4, 'lowpass');
}
