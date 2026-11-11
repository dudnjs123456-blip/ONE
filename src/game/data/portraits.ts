import type { PlayerMood } from './npcs';

/**
 * 대화창에 띄우는 플레이어 상반신 일러스트 (캐릭터 몸별, 기분별).
 * 없는 기분은 '기본' 그림을 쓴다. 대본 대화(놀이기구 직원 등)·숫자 키 대사도 이 그림을 쓴다.
 */
export const PLAYER_PORTRAITS: Record<string, Partial<Record<PlayerMood, string>>> = {
  smallSilverGirl: {
    기본: '/portraits/smallSilverGirl/default.png',
    웃음: '/portraits/smallSilverGirl/smile.png',
    울음: '/portraits/smallSilverGirl/cry.png',
    화남: '/portraits/smallSilverGirl/angry.png',
    놀람: '/portraits/smallSilverGirl/surprised.png',
    부끄러움: '/portraits/smallSilverGirl/shy.png',
  },
};

/** 이 몸의 상반신 그림 (없으면 null) */
export function playerPortrait(body: string | undefined, mood: PlayerMood = '기본'): string | null {
  const p = body ? PLAYER_PORTRAITS[body] : undefined;
  return p ? (p[mood] ?? p['기본'] ?? null) : null;
}
