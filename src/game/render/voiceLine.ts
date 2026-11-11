import { isMuted } from './sfx';

/**
 * 대사 목소리 재생. 같은 사람이 새 대사를 하면 앞 대사는 끊는다.
 * 효과음 끄기(음소거)를 켜 두면 목소리도 나지 않는다.
 */
const playing = new Map<string, HTMLAudioElement>();
const VOICE_GAIN = 0.9;

export function playVoiceLine(who: string, src: string, volume = 1) {
  if (typeof window === 'undefined' || isMuted() || volume <= 0) return;
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
