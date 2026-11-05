/**
 * 날씨: 게임 날짜·시각만으로 정해진다 (저장할 것도, 서버에 맞출 것도 없다).
 * 하루를 4시간씩 6칸으로 나눠 칸마다 날씨를 뽑고, 칸이 바뀔 때 40분에 걸쳐 서서히 넘어간다.
 * 계절(달)에 따라 잘 나오는 날씨가 다르다: 여름엔 비·뇌우, 겨울엔 눈.
 */
import { dateOfDay } from './calendar';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

/** 화면·게임에 쓰는 날씨 세기 (모두 0~1, 넘어가는 중엔 섞인 값) */
export interface WeatherState {
  /** 지금 칸의 날씨 (HUD 표시용) */
  kind: WeatherKind;
  /** 구름 (하늘이 회색, 해가 약해진다) */
  cloud: number;
  rain: number;
  snow: number;
  /** 안개 (멀리가 안 보인다) */
  fog: number;
  /** 천둥번개 */
  storm: number;
}

export const WEATHER_LABEL: Record<WeatherKind, { icon: string; name: string }> = {
  clear: { icon: '☀️', name: '맑음' },
  cloudy: { icon: '☁️', name: '흐림' },
  rain: { icon: '🌧️', name: '비' },
  storm: { icon: '⛈️', name: '뇌우' },
  snow: { icon: '🌨️', name: '눈' },
  fog: { icon: '🌫️', name: '안개' },
};

const SLOT_MIN = 240;
const BLEND_MIN = 40;

/** 달(0=1월)별 날씨 가중치: 맑음 · 흐림 · 비 · 뇌우 · 눈 · 안개 */
const SEASON: Record<number, [number, number, number, number, number, number]> = {
  0: [35, 25, 2, 0, 30, 8],
  1: [38, 25, 5, 0, 24, 8],
  2: [42, 25, 15, 2, 6, 10],
  3: [45, 22, 20, 5, 0, 8],
  4: [50, 20, 18, 6, 0, 6],
  5: [38, 22, 25, 12, 0, 3],
  6: [25, 20, 35, 18, 0, 2],
  7: [32, 18, 28, 20, 0, 2],
  8: [48, 22, 18, 7, 0, 5],
  9: [52, 22, 14, 2, 0, 10],
  10: [40, 26, 16, 2, 6, 10],
  11: [35, 25, 6, 0, 26, 8],
};
const KINDS: WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

const BASE: Record<WeatherKind, Omit<WeatherState, 'kind'>> = {
  clear: { cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0 },
  cloudy: { cloud: 0.75, rain: 0, snow: 0, fog: 0.15, storm: 0 },
  rain: { cloud: 0.9, rain: 0.7, snow: 0, fog: 0.3, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.4, storm: 1 },
  snow: { cloud: 0.8, rain: 0, snow: 0.85, fog: 0.35, storm: 0 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1, storm: 0 },
};

/** 같은 칸 번호면 언제나 같은 0~1 값 */
function hash01(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** 시험용: 주소 뒤에 ?weather=rain 처럼 붙이면 그 날씨로 고정 */
let forced: WeatherKind | null | undefined;
function forcedKind(): WeatherKind | null {
  if (forced !== undefined) return forced;
  forced = null;
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('weather') as WeatherKind | null;
    if (q && KINDS.includes(q)) forced = q;
  }
  return forced;
}

/** 칸 번호 → 그 칸의 날씨 */
export function slotWeather(slot: number): WeatherKind {
  const f = forcedKind();
  if (f) return f;
  const day = Math.floor(slot / (1440 / SLOT_MIN));
  const w = SEASON[dateOfDay(day).month];
  // 한 칸 전 날씨를 이어갈 확률 45% (비가 4시간 만에 매번 뚝 그치지 않게)
  if (hash01(slot * 7 + 3) < 0.45 && slot > 0) {
    const prev = rawSlot(slot - 1, w);
    // 계절에 안 맞는 날씨(11월 초 눈 같은)는 이어가지 않는다
    if (w[KINDS.indexOf(prev)] > 0) return prev;
  }
  return rawSlot(slot, w);
}

function rawSlot(slot: number, w: number[]): WeatherKind {
  const sum = w.reduce((a, b) => a + b, 0);
  let r = hash01(slot) * sum;
  for (let i = 0; i < KINDS.length; i++) {
    r -= w[i];
    if (r < 0) return KINDS[i];
  }
  return 'clear';
}

/** 날짜·시각의 날씨 (칸 경계에선 앞 칸 날씨에서 서서히 넘어간다) */
export function weatherAt(day: number, minutes: number): WeatherState {
  const slot = day * (1440 / SLOT_MIN) + Math.floor(minutes / SLOT_MIN);
  const kind = slotWeather(slot);
  const into = minutes % SLOT_MIN;
  const cur = BASE[kind];
  if (into >= BLEND_MIN) return { kind, ...cur };
  const prev = BASE[slotWeather(slot - 1)];
  const k = into / BLEND_MIN;
  const t = k * k * (3 - 2 * k);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    kind,
    cloud: mix(prev.cloud, cur.cloud),
    rain: mix(prev.rain, cur.rain),
    snow: mix(prev.snow, cur.snow),
    fog: mix(prev.fog, cur.fog),
    storm: mix(prev.storm, cur.storm),
  };
}
