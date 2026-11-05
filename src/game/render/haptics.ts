/**
 * 진동: 게임패드(지원하면 양쪽 모터)와 폰(navigator.vibrate, 안드로이드).
 * 소리 끄기와는 따로 — 크게 맞거나 K.O. 처럼 중요한 순간에만 아주 짧게.
 */
const OFF_KEY = 'ironfist.vibrationOff';
let off = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isVibrationOn() {
  return !off;
}
export function setVibrationOn(on: boolean) {
  off = !on;
  try {
    localStorage.setItem(OFF_KEY, off ? '1' : '0');
  } catch {}
}

type RumblePad = Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> } };

export function rumble(strength: number, ms: number, padIndex = 0) {
  if (off || typeof navigator === 'undefined') return;
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected) : [];
  const pad = pads[padIndex] as RumblePad | undefined;
  if (pad?.vibrationActuator?.playEffect) {
    void pad.vibrationActuator
      .playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength + 0.2) })
      .catch(() => {});
    return;
  }
  // 패드가 없을 때만 폰 진동 (터치 기기)
  // 브라우저는 사용자가 화면을 한 번이라도 누르기 전엔 진동을 막는다 (막히면 경고만 남으니 미리 확인)
  const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
  if (!pads.length && activated && 'vibrate' in navigator && matchMedia?.('(pointer: coarse)').matches) {
    try {
      navigator.vibrate(Math.min(ms, 60));
    } catch {}
  }
}
