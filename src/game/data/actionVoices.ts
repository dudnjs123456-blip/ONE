/**
 * 액션 목소리 (공격·기술·피격·쓰러짐·점프·일어나기). ElevenLabs 웹에서 숫자 키 대사와 같은 목소리(JY)로 만든 mp3.
 * 몇 번째 소리인지는 행동한 사람이 정해서 보내므로, 친구 화면에서도 똑같은 소리가 난다.
 */
import type { MoveDef } from './moves';

export type ActionVoiceKind = 'atk' | 'heavy' | 'skillFly' | 'skillTornado' | 'skillBack' | 'hurt' | 'hurtBig' | 'down' | 'jump' | 'getup';

/** 종류 → 파일 이름들 (public/voices/<몸>/act/<이름>.mp3) */
export const ACTION_VOICES: Record<ActionVoiceKind, readonly string[]> = {
  atk: ['atk1', 'atk2', 'atk3'],
  heavy: ['heavy1', 'heavy2'],
  skillFly: ['skillFly'],
  skillTornado: ['skillTornado'],
  skillBack: ['skillBack'],
  hurt: ['hurt1', 'hurt2', 'hurt3'],
  hurtBig: ['hurtBig'],
  down: ['down'],
  jump: ['jump1', 'jump2'],
  getup: ['getup'],
};

/** 액션 목소리가 있는 몸 */
const ACTION_VOICED = new Set(['smallSilverGirl']);

export function hasActionVoice(body: string | undefined): boolean {
  return !!body && ACTION_VOICED.has(body);
}

/** 네트워크로 받은 값이 맞는 목소리 이름인가 */
export function isActionVoiceName(v: unknown): v is string {
  return typeof v === 'string' && Object.values(ACTION_VOICES).some((l) => l.includes(v));
}

export function actionVoiceSrc(body: string | undefined, name: string): string | null {
  return hasActionVoice(body) && isActionVoiceName(name) ? `/voices/${body}/act/${name}.mp3` : null;
}

/** 큰기술 (캐릭터 스킬): 옆에 컷인 그림 (기술 이름 외침은 끔 — 소리는 타격음만) */
export const SKILL_VOICE: Record<string, ActionVoiceKind> = {
  smallSilverFlyingKick: 'skillFly',
  smallSilverTornadoKick: 'skillTornado',
  smallSilverBackTurnKick: 'skillBack',
};

/** 기술 → 목소리 종류. 강한 기술(데미지 18↑ 또는 띄우기·다운)은 기합을 크게 */
export function moveVoiceKind(mv: Pick<MoveDef, 'id' | 'damage' | 'launch'>): ActionVoiceKind {
  const skill = SKILL_VOICE[mv.id];
  if (skill) return skill;
  return mv.damage >= 18 || (mv.launch ?? 0) >= 0.1 ? 'heavy' : 'atk';
}

/** 같은 종류가 이어지면 다른 소리로 돌린다 (n = 몇 번째) */
export function pickVoice(kind: ActionVoiceKind, n: number): string {
  const l = ACTION_VOICES[kind];
  return l[n % l.length];
}

/** 모든 액션 목소리 파일 (미리 받기용) */
export function allActionVoiceSrcs(body: string | undefined): string[] {
  if (!hasActionVoice(body)) return [];
  // 큰기술 외침은 안 쓰므로 받지 않는다
  return (Object.keys(ACTION_VOICES) as ActionVoiceKind[])
    .filter((k) => !(k in SKILL_CUTIN))
    .flatMap((k) => ACTION_VOICES[k].map((n) => `/voices/${body}/act/${n}.mp3`));
}

/** 큰기술 컷인이 떠 있는 시간 (ms) */
export const CUTIN_MS = 1500;

/**
 * 컷인 그림 (public/portraits/<몸>/<파일>): 숫자 키 대사 때 나오는 원래 캐릭터 그림(default.png)을 바탕으로
 * 얼굴·옷·그림체는 그대로 두고 자세만 그 기술로 바꿔 그린 공격 그림 (Firefly · Nano Banana, 표정 그림과 같은 방법)
 */
export const SKILL_CUTIN: Record<string, { img: string; name: string }> = {
  skillFly: { img: 'cutin-fly.webp', name: '은빛 날라차기' },
  skillTornado: { img: 'cutin-tornado.webp', name: '은빛 회오리 차기' },
  skillBack: { img: 'cutin-back.webp', name: '은빛 뒤돌려차기' },
};

/** 공격 그림이 있는 몸 (이 몸은 3D 실시간 대신 그림으로 컷인) */
export const CUTIN_ART_BODIES = new Set<string>(['smallSilverGirl']);
