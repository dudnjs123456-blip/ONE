import { audioBus, isMuted } from './sfx';

/**
 * 대사 목소리 재생. 같은 사람이 새 대사를 하면 앞 대사는 끊는다.
 * 효과음 끄기(음소거)를 켜 두면 목소리도 나지 않는다.
 */
const playing = new Map<string, HTMLAudioElement>();
const VOICE_GAIN = 0.9;

export function playVoiceLine(who: string, src: string, volume = 1) {
  if (typeof window === 'undefined' || isMuted() || volume <= 0) return;
  stopAction(who);
  playing.get(who)?.pause();
  const a = new Audio(src);
  a.volume = Math.min(1, volume * VOICE_GAIN);
  playing.set(who, a);
  a.onended = () => {
    if (playing.get(who) === a) playing.delete(who);
  };
  void a.play().catch(() => {});
}

/** 처음 누를 때 늦지 않게 미리 받아 둔다 */
export function preloadVoices(srcs: (string | null)[]) {
  if (typeof window === 'undefined') return;
  for (const s of srcs) if (s) new Audio(s).preload = 'auto';
}

/**
 * 액션 목소리 (기합·비명): 동작과 딱 맞아야 해서 Web Audio 로 바로 튼다.
 * 받은 mp3 앞의 조용한 부분은 건너뛰고 첫 소리부터 (ElevenLabs 파일은 앞에 짧은 무음이 있다)
 */
interface Clip {
  buf: AudioBuffer;
  /** 소리가 시작되는 시각 (초) */
  start: number;
}
const clips = new Map<string, Promise<Clip | null>>();
const actionPlaying = new Map<string, AudioBufferSourceNode>();
/** 효과음 총볼륨(0.55)을 지나므로 조금 키운다 */
const ACTION_GAIN = 1.5;

function firstSound(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const th = 0.02;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) return Math.max(0, i / buf.sampleRate - 0.015);
  return 0;
}

function loadClip(src: string): Promise<Clip | null> {
  let p = clips.get(src);
  if (!p) {
    const bus = audioBus();
    if (!bus) return Promise.resolve(null); // 아직 오디오가 안 깨어남: 다음에 다시
    p = fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((a) => bus.ctx.decodeAudioData(a))
      .then((buf) => ({ buf, start: firstSound(buf) }))
      .catch(() => {
        clips.delete(src);
        return null;
      });
    clips.set(src, p);
  }
  return p;
}

function stopAction(who: string) {
  const s = actionPlaying.get(who);
  if (s) {
    try {
      s.stop();
    } catch {}
    actionPlaying.delete(who);
  }
}

export function playActionVoice(who: string, src: string, volume = 1) {
  if (typeof window === 'undefined' || isMuted() || volume <= 0) return;
  void loadClip(src).then((clip) => {
    const bus = audioBus();
    if (!clip || !bus || isMuted()) return;
    // 같은 사람의 앞 소리(대사 포함)는 끊는다
    stopAction(who);
    playing.get(who)?.pause();
    const s = bus.ctx.createBufferSource();
    s.buffer = clip.buf;
    const g = bus.ctx.createGain();
    g.gain.value = Math.min(1, volume) * ACTION_GAIN;
    s.connect(g).connect(bus.out);
    s.onended = () => {
      if (actionPlaying.get(who) === s) actionPlaying.delete(who);
    };
    actionPlaying.set(who, s);
    s.start(0, clip.start);
  });
}

/** 액션 목소리를 미리 받아 풀어 둔다 (오디오가 깨어난 뒤에야 풀 수 있어 잠깐 뒤에 다시 부른다) */
export function preloadActionVoices(srcs: string[]) {
  if (typeof window === 'undefined' || !srcs.length) return;
  const go = () => {
    if (!audioBus()) return false;
    for (const s of srcs) void loadClip(s);
    return true;
  };
  if (go()) return;
  const wake = () => {
    if (go()) {
      window.removeEventListener('keydown', wake);
      window.removeEventListener('pointerdown', wake);
    }
  };
  window.addEventListener('keydown', wake);
  window.addEventListener('pointerdown', wake);
}
