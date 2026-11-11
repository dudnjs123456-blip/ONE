/**
 * 대화창에 띄우는 플레이어 상반신 일러스트 (캐릭터 몸별).
 * 표정 그림이 생기면 여기에 기분별로 추가한다 — 없는 기분은 '기본' 그림을 쓴다.
 * 대본 대화(놀이기구 직원 등)도 이 그림을 쓴다.
 */
export const PLAYER_PORTRAITS: Record<string, Record<string, string>> = {
  smallSilverGirl: { 기본: '/portraits/smallSilverGirl/default.png' },
};

/** 이 몸의 상반신 그림 (없으면 null) */
export function playerPortrait(body: string | undefined, mood = '기본'): string | null {
  const p = body ? PLAYER_PORTRAITS[body] : undefined;
  return p ? (p[mood] ?? p['기본'] ?? null) : null;
}
