/**
 * 카메라 줌: 마우스 휠 또는 Ctrl+휠, Ctrl + / Ctrl − / Ctrl 0(원래대로).
 * 브라우저의 페이지 확대(Ctrl+휠, Ctrl +/−)는 게임 화면에서 막고 카메라 줌으로 쓴다.
 * zoom 값은 카메라 거리 배율: 작을수록 캐릭터가 크게 보인다.
 * @returns 해제 함수
 */
export function attachZoomControls(target: { zoom: number }, min: number, max: number, initial = target.zoom) {
  const clamp = (z: number) => Math.min(max, Math.max(min, z));
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
    target.zoom = clamp(target.zoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!e.ctrlKey) return;
    if (e.key === '+' || e.key === '=') target.zoom = clamp(target.zoom / 1.2);
    else if (e.key === '-' || e.key === '_') target.zoom = clamp(target.zoom * 1.2);
    else if (e.key === '0') target.zoom = initial;
    else return;
    e.preventDefault();
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
  };
}
