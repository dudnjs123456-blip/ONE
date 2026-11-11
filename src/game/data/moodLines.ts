import type { PlayerMood } from './npcs';

/**
 * 숫자 키 1~9 대사: 누르면 내 캐릭터가 이 말을 하고 (머리 위 말풍선으로 마을 사람들에게도 보인다),
 * 내 화면에는 그 기분의 상반신 그림 옆에 대사가 뜬다.
 */
export const MOOD_LINES: readonly { mood: PlayerMood; text: string }[] = [
  { mood: '기본', text: '안녕! 오늘 날씨 좋다~' },
  { mood: '웃음', text: '헤헤, 진짜 재밌다!' },
  { mood: '웃음', text: '고마워! 정말 기뻐!' },
  { mood: '울음', text: '흑… 너무 속상해…' },
  { mood: '화남', text: '흥! 나 지금 삐졌거든?' },
  { mood: '놀람', text: '에엣?! 진짜야?!' },
  { mood: '부끄러움', text: '그, 그렇게 쳐다보지 마…' },
  { mood: '기본', text: '배고파… 뭐 먹으러 갈래?' },
  { mood: '웃음', text: '다음에 또 같이 놀자!' },
];

/** 대사가 화면에 떠 있는 시간 (ms) */
export const MOOD_LINE_MS = 4000;

/** 키 코드 → 대사 번호 (1~9, 아니면 null) */
export function moodLineKey(code: string): number | null {
  const m = /^(Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[2]) : null;
}
