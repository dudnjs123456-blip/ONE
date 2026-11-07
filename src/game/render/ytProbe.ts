/**
 * 유튜브 영상을 이 사이트에서 틀 수 있는지 미리 알아보기.
 * 영상 주인이 '다른 사이트에서 재생'을 막아 두면 틀자마자 오류(101·150)가 난다.
 * 유튜브는 서버에서 묻는 요청을 막아서, 브라우저에서 화면 밖에 소리 없이 잠깐 틀어 보고 바로 지운다.
 */
import type { Playable } from '../city/karaoke';

/** 한 영상을 틀어 보는 최대 시간. 넘으면 모름(null) */
const PROBE_MS = 9000;

export function probeYouTube(id: string): {
  done: Promise<Playable | null>;
  cancel: () => void;
} {
  let finish: (r: Playable | null) => void = () => {};
  const done = new Promise<Playable | null>((res) => (finish = res));
  if (typeof document === 'undefined') {
    finish(null);
    return { done, cancel: () => {} };
  }
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.allow = 'autoplay; encrypted-media';
  f.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;border:0';
  f.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&enablejsapi=1&playsinline=1&controls=0&origin=${encodeURIComponent(location.origin)}`;
  let over = false;
  const end = (r: Playable | null) => {
    if (over) return;
    over = true;
    window.removeEventListener('message', onMsg);
    window.clearTimeout(timer);
    f.remove();
    finish(r);
  };
  const onMsg = (e: MessageEvent) => {
    if (e.source !== f.contentWindow) return;
    let m: { event?: string; info?: unknown };
    try {
      m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    if (m?.event === 'onError') return end('blocked');
    const st = m?.event === 'onStateChange' ? m.info : m?.event === 'infoDelivery' ? (m.info as { playerState?: number } | null)?.playerState : undefined;
    // 재생(1)이나 버퍼링(3)까지 갔으면 틀 수 있는 영상
    if (st === 1 || st === 3) end('ok');
  };
  window.addEventListener('message', onMsg);
  f.onload = () => f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
  const timer = window.setTimeout(() => end(null), PROBE_MS);
  document.body.appendChild(f);
  return { done, cancel: () => end(null) };
}
