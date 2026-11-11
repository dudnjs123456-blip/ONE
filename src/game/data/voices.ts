import type { PlayerMood } from './npcs';

/**
 * 숫자 키 대사의 목소리 (캐릭터 몸별, 기분별). ElevenLabs 로 미리 만들어 둔 mp3.
 * 기분마다 대사가 하나라 기분만 알면 어떤 소리인지 정해진다 (친구 화면에서도 같은 소리).
 */
const VOICE_MOODS: Record<PlayerMood, string> = {
  기본: 'default',
  웃음: 'smile',
  울음: 'cry',
  화남: 'angry',
  놀람: 'surprised',
  부끄러움: 'shy',
  윙크: 'wink',
  졸림: 'sleepy',
  고민: 'think',
};

/** 목소리가 있는 몸 */
const VOICED_BODIES = new Set(['smallSilverGirl']);

/** 이 몸·기분의 목소리 파일 (없으면 null) */
export function playerVoice(body: string | undefined, mood: PlayerMood): string | null {
  return body && VOICED_BODIES.has(body) ? `/voices/${body}/${VOICE_MOODS[mood]}.mp3` : null;
}

/** 친구 목소리가 들리는 거리 (m). 가까울수록 크게 */
export const VOICE_HEAR_M = 18;

/** 거리에 따른 크기 (0~1, 너무 멀면 0) */
export function voiceVolume(dist: number): number {
  if (dist >= VOICE_HEAR_M) return 0;
  return Math.max(0.15, 1 - dist / VOICE_HEAR_M);
}
