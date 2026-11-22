/**
 * 새로고침해도 있던 곳에서 이어서: 지금 다른 차원에 있는지 + 차원 안 내 위치를 이 브라우저에 계정별로 기억한다.
 * (서울 안 위치는 CityView 가 따로 기억한다)
 */

export interface DimensionPlace {
  x: number;
  z: number;
  fx: number;
  fz: number;
  hp: number;
}

const screenKey = (userId: string | null) => `ironfist:screen:${userId ?? 'guest'}`;
const placeKey = (userId: string | null) => `ironfist:dimplace:${userId ?? 'guest'}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* 저장 공간을 못 쓰면 그냥 넘어간다 */
  }
}

export function loadLastScreen(userId: string | null): 'field' | null {
  return read(screenKey(userId)) === 'field' ? 'field' : null;
}
export function saveLastScreen(userId: string | null, s: 'field' | null) {
  write(screenKey(userId), s);
}

export function loadDimensionPlace(userId: string | null): DimensionPlace | null {
  try {
    const p = JSON.parse(read(placeKey(userId)) ?? 'null') as DimensionPlace | null;
    if (!p || ![p.x, p.z, p.fx, p.fz, p.hp].every(Number.isFinite)) return null;
    return p;
  } catch {
    return null;
  }
}
export function saveDimensionPlace(userId: string | null, p: DimensionPlace) {
  write(placeKey(userId), JSON.stringify(p));
}
export function clearDimensionPlace(userId: string | null) {
  write(placeKey(userId), null);
}
