/**
 * 그래픽 사양 추측 + 화질 설정 (저사양 컴퓨터 대응).
 *
 * 화질 단계 (도시 화면): 0 = 최고 … 8 = 가장 가벼움
 *   1 구석 그림자(AO) 끔 · 계단 방지 4→2배   2 해상도 1배   3 계단 방지 끔   4 블룸 끔
 *   5 그림자 해상도 절반   6 후처리 통째로 끔   7 그림자 끔   8 해상도 0.75배
 */
export const QUALITY_MAX = 8;

export type GfxMode = 'auto' | 'high' | 'mid' | 'low' | 'lowest';

/** 직접 고른 화질 → 고정 단계 */
export const MODE_LEVEL: Record<Exclude<GfxMode, 'auto'>, number> = { high: 0, mid: 3, low: 5, lowest: 8 };

export const MODE_LABEL: Record<GfxMode, string> = {
  auto: '자동',
  high: '높음',
  mid: '중간',
  low: '낮음',
  lowest: '최저',
};

export type GpuTier = 'high' | 'mid' | 'low' | 'software';

export type GpuInfo = { name: string; tier: GpuTier };

/** 사양별 처음 시작 단계 (그 뒤엔 자동 화질이 프레임을 보고 맞춘다) */
export const TIER_START: Record<GpuTier, number> = { high: 0, mid: 2, low: 5, software: 8 };

let info: GpuInfo | null = null;

/** 지금 쓰는 그래픽카드 이름으로 사양을 대충 가늠한다 */
export function detectGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  if (info) return info;
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    name = '';
  }
  info = { name, tier: classify(name) };
  return info;
}

export function gpuInfo() {
  return info;
}

export function classify(name: string): GpuTier {
  const n = name.toLowerCase();
  // 그래픽카드 없이 CPU 로 그리는 중 (크롬 하드웨어 가속이 꺼졌거나 드라이버 문제)
  if (/swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/.test(n)) return 'software';
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const cores = nav?.hardwareConcurrency ?? 8;
  const mem = (nav as (Navigator & { deviceMemory?: number }) | null)?.deviceMemory ?? 8;
  const mobile = !!nav && /android|iphone|ipad|mobile/i.test(nav.userAgent);
  // 외장 그래픽카드
  if (/nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|\brx ?\d{3,4}|arc a\d/.test(n)) return cores <= 2 ? 'mid' : 'high';
  if (/apple m\d/.test(n)) return 'high';
  // 예전 내장 그래픽·저가 모바일 칩
  if (/intel.*\b(u?hd)\b|gma|mali|adreno\D*[1-5]\d\d|powervr|videocore/.test(n)) return 'low';
  if (mobile || cores <= 4 || mem <= 4) return 'low';
  // 요즘 내장 그래픽 (Iris Xe, 라데온 내장, 애플 칩 등) · 이름을 숨긴 브라우저
  return 'mid';
}

const MODE_KEY = 'iron-fist.gfxMode';
let mode: GfxMode | null = null;
const listeners = new Set<(m: GfxMode) => void>();

export function getGfxMode(): GfxMode {
  if (mode) return mode;
  try {
    const v = localStorage.getItem(MODE_KEY) as GfxMode | null;
    mode = v && v in MODE_LABEL ? v : 'auto';
  } catch {
    mode = 'auto';
  }
  return mode;
}

export function setGfxMode(m: GfxMode) {
  mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // 저장소를 못 쓰면 이번 접속 동안만 적용
  }
  for (const f of listeners) f(m);
}

export function onGfxMode(f: (m: GfxMode) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 대전·필드 화면용: 저사양이면 고해상도 화면에서도 1배로만 그린다 */
export function pixelRatioFor(gl: WebGLRenderingContext | WebGL2RenderingContext, cap = 2) {
  const t = detectGpu(gl).tier;
  const m = getGfxMode();
  const light = m === 'low' || m === 'lowest' || (m === 'auto' && (t === 'low' || t === 'software'));
  return Math.min(window.devicePixelRatio, light ? 1 : cap);
}
