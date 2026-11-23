/**
 * 간판 글꼴: 캔버스로 그리는 간판은 CSS 처럼 글꼴을 기다려 주지 않는다.
 * 예전엔 "Pretendard" 를 적어 놓고 불러오지 않아서 전부 윈도우 기본 글꼴(맑은 고딕)로 그려졌다.
 *
 * - 웹 글꼴(Google Fonts, 한글은 글자 묶음별로 나눠 받는다)을 한 번 불러온다.
 * - liveCanvas: 일단 지금 있는 글꼴로 그리고, 그 간판에 쓴 글꼴·글자가 다 받아지면 한 번 더 그린다.
 *   (그린 글자를 기록해 두었다가 그 글자 묶음만 받는다 → 처음 화면이 늦어지지 않는다)
 * 모두 무료 글꼴 (SIL Open Font License).
 */

const CSS_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Gothic+A1:wght@500;600;700;800;900',
    'family=Hahmlet:wght@500;600;700',
    'family=Gowun+Batang:wght@700',
    'family=Nanum+Myeongjo:wght@700;800',
    'family=Black+Han+Sans',
    'family=Jua',
    'family=Orbit',
    'family=Cinzel:wght@600;700',
    'family=Outfit:wght@500;600;700',
    'family=Cormorant+Garamond:wght@600;700',
  ].join('&') +
  '&display=swap';

const FALLBACK = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** 간판 글꼴 묶음 (캔버스 font 문자열의 글꼴 이름 부분) */
export const SIGN_FONT = {
  /** 반듯한 고딕: 편의점·약국·학원·안내판 (500~900) */
  sans: `"Gothic A1", ${FALLBACK}`,
  /** 요즘 감성 명조: 카페·헤어·빌라 이름 (500~700) */
  serif: `"Hahmlet", "Nanum Myeongjo", serif`,
  /** 손맛 있는 바탕체: 꽃집·빵집 (700) */
  batang: `"Gowun Batang", "Nanum Myeongjo", serif`,
  /** 각진 옛 명조: 차원 마을 현판 (700·800) */
  myeongjo: `"Nanum Myeongjo", "Gowun Batang", serif`,
  /** 굵은 제목체: 치킨·마라탕·고깃집 (400 하나뿐 — 굵게 지정하면 가짜 굵기가 된다) */
  display: `"Black Han Sans", ${FALLBACK}`,
  /** 둥근 글씨: 분식·떡볶이·펫샵 (400 하나) */
  round: `"Jua", ${FALLBACK}`,
  /** 기계 느낌: PC방·노래방 (400 하나) */
  tech: `"Orbit", ${FALLBACK}`,
  /** 영문 부제 */
  latin: `"Outfit", ${FALLBACK}`,
  latinSerif: `"Cormorant Garamond", "Hahmlet", serif`,
  /** 판타지 영문 (차원 마을) */
  rune: `"Cinzel", "Cormorant Garamond", serif`,
} as const;

let cssReady: Promise<void> | null = null;

/** 글꼴 CSS 를 한 번만 붙이고, 다 읽힐 때까지 기다린다 */
function loadCss(): Promise<void> {
  if (cssReady) return cssReady;
  cssReady = new Promise<void>((resolve) => {
    if (typeof document === 'undefined') return resolve();
    let link = document.querySelector<HTMLLinkElement>('link[data-sign-fonts]');
    if (link?.sheet) return resolve();
    if (!link) {
      // 글꼴 서버와 미리 연결해 두면 첫 글자 묶음이 빨리 온다
      for (const href of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = href;
        if (href.includes('gstatic')) pre.crossOrigin = 'anonymous';
        document.head.appendChild(pre);
      }
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      link.dataset.signFonts = '1';
      document.head.appendChild(link);
    }
    link.addEventListener('load', () => resolve(), { once: true });
    // 오프라인 등으로 못 받으면 기본 글꼴 그대로 (기다리지 않는다)
    link.addEventListener('error', () => resolve(), { once: true });
    setTimeout(resolve, 8000);
  });
  return cssReady;
}

/** 게임을 켤 때 미리 불러 두기 (선택) */
export function preloadSignFonts() {
  void loadCss();
}

/**
 * 캔버스에 간판을 그린다. 쓴 글꼴이 아직 안 받아졌으면, 받아진 뒤 처음부터 다시 그리고 onRedraw 를 부른다
 * (THREE.CanvasTexture 라면 needsUpdate = true).
 * draw 는 여러 번 불릴 수 있으니 매번 같은 그림이 나오게 (무작위는 draw 안에서 씨앗부터 다시) 짠다.
 */
export function liveCanvas(c: HTMLCanvasElement, draw: (g: CanvasRenderingContext2D) => void, onRedraw: () => void) {
  const g = c.getContext('2d')!;
  const used = new Map<string, string>();
  const fill = g.fillText.bind(g);
  const stroke = g.strokeText.bind(g);
  const note = (t: string) => used.set(g.font, (used.get(g.font) ?? '') + t);
  g.fillText = (t: string, x: number, y: number, maxW?: number) => {
    note(t);
    if (maxW === undefined) fill(t, x, y);
    else fill(t, x, y, maxW);
  };
  g.strokeText = (t: string, x: number, y: number, maxW?: number) => {
    note(t);
    if (maxW === undefined) stroke(t, x, y);
    else stroke(t, x, y, maxW);
  };
  draw(g);
  if (!used.size || typeof document === 'undefined' || !document.fonts) return;
  void loadCss()
    .then(() => Promise.all([...used].map(([font, text]) => document.fonts.load(font, text).catch(() => []))))
    .then((faces) => {
      if (!faces.some((f) => f.length)) return;
      // 크기를 다시 정하면 그림과 그리기 설정(글꼴·그림자·투명도)이 모두 처음으로 돌아간다
      c.width = c.width;
      draw(g);
      onRedraw();
    });
}
