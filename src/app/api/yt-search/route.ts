/**
 * 거실 TV 유튜브 검색 (서버).
 * - YOUTUBE_API_KEY 가 있으면 공식 YouTube Data API 로 찾는다 (하루 약 100번)
 * - 없거나 실패하면 유튜브 검색 결과 페이지를 읽어서 찾는다
 * 다른 사이트에서 재생을 막은 영상은 빼고, 영상 id·제목·채널·썸네일만 돌려준다.
 */

interface Item {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  length: string;
}

const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

async function viaApi(q: string, key: string): Promise<Item[] | null> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '18', regionCode: 'KR', relevanceLanguage: 'ko', q, key }).toString();
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = (await r.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] };
  const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return (j.items ?? [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({ id: it.id!.videoId!, title: unescape(it.snippet?.title ?? ''), channel: it.snippet?.channelTitle ?? '', thumb: thumbOf(it.id!.videoId!), length: '' }));
}

type Node = Record<string, unknown>;
const text = (v: unknown): string => {
  const o = v as { simpleText?: string; runs?: { text: string }[] } | undefined;
  return o?.simpleText ?? o?.runs?.map((r) => r.text).join('') ?? '';
};

async function viaPage(q: string): Promise<Item[]> {
  // sp=EgIQAQ== : 동영상만
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=ko&gl=KR`, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  });
  const html = await r.text();
  const start = html.indexOf('var ytInitialData = ');
  if (start < 0) return [];
  const from = start + 'var ytInitialData = '.length;
  const end = html.indexOf(';</script>', from);
  let data: unknown;
  try {
    data = JSON.parse(html.slice(from, end));
  } catch {
    return [];
  }
  const out: Item[] = [];
  const seen = new Set<string>();
  const walk = (n: unknown) => {
    if (out.length >= 18 || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    const v = (n as Node).videoRenderer as Node | undefined;
    if (v && typeof v.videoId === 'string' && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      // 생방송 예고(아직 시작 전)는 뺀다
      if (!v.upcomingEventData) out.push({ id: v.videoId, title: text(v.title), channel: text(v.ownerText), thumb: thumbOf(v.videoId), length: text(v.lengthText) });
      return;
    }
    for (const c of Object.values(n as Node)) walk(c);
  };
  walk(data);
  return out;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!q) return Response.json({ items: [] });
  try {
    const key = process.env.YOUTUBE_API_KEY;
    const items = (key ? await viaApi(q, key).catch(() => null) : null) ?? (await viaPage(q));
    return Response.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=600' } });
  } catch {
    return Response.json({ items: [], error: 'search_failed' }, { status: 502 });
  }
}
