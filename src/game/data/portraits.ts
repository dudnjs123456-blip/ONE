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
    윙크: '/portraits/smallSilverGirl/wink.png',
    졸림: '/portraits/smallSilverGirl/sleepy.png',
    고민: '/portraits/smallSilverGirl/think.png',
  },
};

/**
 * 이야기 장면에만 쓰는 특별한 표정 그림 (몸별). 예: hurt = 하늘에서 떨어져 처박힌 직후 (헝클어진 머리·흙먼지·글썽한 눈).
 * 없는 몸은 기분(mood) 그림 → 그것도 없으면 3D 모델 얼굴
 */
export const STORY_FACES: Record<string, Record<string, string>> = {
  smallSilverGirl: { hurt: '/portraits/smallSilverGirl/hurt.webp' },
};

/** 이야기 대사의 내 초상화: 특별 표정 → 기분 그림 → null */
export function storyPortrait(body: string | undefined, face: string | undefined, mood?: PlayerMood): string | null {
  const special = body && face ? STORY_FACES[body]?.[face] : undefined;
  return special ?? playerPortrait(body, mood);
}

/** 이 몸의 상반신 그림 (없으면 null) */
export function playerPortrait(body: string | undefined, mood: PlayerMood = '기본'): string | null {
  const p = body ? PLAYER_PORTRAITS[body] : undefined;
  return p ? (p[mood] ?? p['기본'] ?? null) : null;
}
