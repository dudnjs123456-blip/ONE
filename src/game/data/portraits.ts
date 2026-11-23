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
const SSG = '/portraits/smallSilverGirl/';
export const STORY_FACES: Record<string, Record<string, string>> = {
  smallSilverGirl: {
    hurt: `${SSG}hurt.webp`,
    // 대사마다 다른 표정이 나오도록 (같은 기분이라도 장면에 맞는 몸짓으로). bust-* = 대사창 정사각에 맞춰 얼굴을 가운데 둔 상반신 (전신은 face-*)
    startled: `${SSG}bust-startled.webp`, // 깜짝 놀라 뒤로 물러남
    shocked: `${SSG}bust-shocked.webp`, // 얼어붙은 충격 · 입을 가림
    scared: `${SSG}bust-scared.webp`, // 겁에 질려 자기 몸을 끌어안음
    panic: `${SSG}bust-panic.webp`, // 머리를 감싸 쥐고 비명
    sob: `${SSG}bust-sob.webp`, // 눈물을 훔치며 흐느낌
    think2: `${SSG}bust-think2.webp`, // 팔짱 끼고 고개 갸웃
    doubt: `${SSG}bust-doubt.webp`, // 곁눈질 · 미심쩍음
    curious: `${SSG}bust-curious.webp`, // 몸을 숙여 들여다봄
    awe: `${SSG}bust-awe.webp`, // 반짝이는 눈으로 감탄
    laugh: `${SSG}bust-laugh.webp`, // 손 모으고 활짝 웃음
    relief: `${SSG}bust-relief.webp`, // 가슴에 손 얹고 안도
    cheer: `${SSG}bust-cheer.webp`, // 주먹 쥐고 신나서 깡충
    confident: `${SSG}bust-confident.webp`, // 엄지 척 · 자신만만
    determined: `${SSG}bust-determined.webp`, // 주먹 쥐고 결심
    pout: `${SSG}bust-pout.webp`, // 볼 부풀리고 뾰로통
    rage: `${SSG}bust-rage.webp`, // 주먹을 내지르며 외침
    gentle: `${SSG}bust-gentle.webp`, // 몸을 숙여 다정하게 달램
    tired: `${SSG}bust-tired.webp`, // 멍든 팔을 문지르며 지침
    wink: `${SSG}wink.png`,
  },
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
