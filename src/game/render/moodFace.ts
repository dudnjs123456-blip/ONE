import type { PlayerMood } from '../data/npcs';

/** VRM 표준 표정 이름 (VRoid 모델은 모두 가지고 있다. 없는 표정은 그냥 무시된다) */
export type FaceKey = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised' | 'aa' | 'oh' | 'ou' | 'blink' | 'blinkLeft';

export const FACE_KEYS: readonly FaceKey[] = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'oh', 'ou', 'blink', 'blinkLeft'];

/**
 * 기분 → 3D 얼굴 (VRM 표정 섞기, 0~1). 숫자 키 대사·NPC 대화의 기분과 같은 이름.
 * happy 는 VRoid 에서 눈이 웃는 모양으로 감기므로 그때는 따로 눈을 깜빡이지 않는다.
 */
export const MOOD_FACE: Record<PlayerMood, Partial<Record<FaceKey, number>>> = {
  기본: { relaxed: 0.25 },
  웃음: { happy: 1, aa: 0.35 },
  울음: { sad: 1, ou: 0.25 },
  화남: { angry: 1, ou: 0.3 },
  놀람: { surprised: 1, oh: 0.7 },
  부끄러움: { happy: 0.45, relaxed: 0.35, blink: 0.2 },
  윙크: { happy: 0.55, blinkLeft: 1, aa: 0.25 },
  졸림: { relaxed: 0.7, blink: 0.65, aa: 0.75 },
  고민: { sad: 0.2, relaxed: 0.15, ou: 0.45 },
};

/** 이 얼굴이면 눈을 이미 감고 있어서 따로 깜빡이지 않는다 */
export function eyesBusy(face: Partial<Record<FaceKey, number>>): boolean {
  return (face.happy ?? 0) >= 0.5 || (face.blink ?? 0) > 0 || (face.blinkLeft ?? 0) > 0;
}
