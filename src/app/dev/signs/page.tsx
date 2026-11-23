'use client';

import { notFound } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** 개발용: 서울·차원 간판을 한 화면에 늘어놓고 보는 페이지 (운영 빌드에선 없음) */
export default function SignsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const [signage, city, vacant, village, map] = await Promise.all([
        import('@/game/render/signage'),
        import('@/game/render/cityRenderer'),
        import('@/game/render/vacantShop'),
        import('@/game/render/villageScene'),
        import('@/game/city/cityMap'),
      ]);
      if (dead || !root.current) return;
      const el = root.current;
      el.innerHTML = '';
      const section = (title: string) => {
        const h = document.createElement('h2');
        h.textContent = title;
        h.style.cssText = 'color:#ddd;font:600 15px sans-serif;margin:28px 0 10px';
        el.appendChild(h);
        const box = document.createElement('div');
        box.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end';
        el.appendChild(box);
        return box;
      };
      const show = (box: HTMLElement, tex: { image: unknown }, width: number, bg = '#5a5f66') => {
        const c = tex.image as HTMLCanvasElement;
        c.style.cssText = `width:${width}px;height:auto;display:block;background:${bg}`;
        box.appendChild(c);
      };
      const shops = section('서울 1층 가게 간판');
      for (const s of map.SHOPS) show(shops, signage.fasciaTexture(s, 7.4 / 0.85), 430);
      const special = section('서울 특수 가게 (펫샵 · 옷가게 · 낚시 · 노래방)');
      show(special, vacant.petSignTexture(7), 430);
      show(special, vacant.clothesSignTexture(7), 430);
      show(special, vacant.fishingSignTexture(7), 430);
      show(special, vacant.karaokeSignTexture(7), 430);
      show(special, vacant.stairSignTexture(), 140);
      const ten = section('서울 위층 업체 · 세로 간판');
      signage.TENANTS.forEach(([n, bg, fg], i) => show(ten, signage.tenantTexture(n, bg, fg, 2 + (i % 4)), 300));
      show(ten, signage.verticalTexture(['수학전문학원'], '#22324f', '#ffffff', 900), 60);
      show(ten, signage.verticalTexture(['스터디카페'], '#1d1f22', '#f1c75b', 800), 60);
      const misc = section('서울 안내판');
      for (const s of [
        { text: '2 한강공원역', bg: '#2e9e4f', fg: '#ffffff' },
        { text: '버스', bg: '#2f6fd8', fg: '#ffffff' },
        { text: 'POLICE 경찰', bg: '#1e4fa8', fg: '#ffffff' },
        { text: '🌳 단지 산책로', bg: '#2f6b3a', fg: '#ffffff' },
      ])
        show(misc, city.signTexture(s, 512, 128), 300);
      show(misc, city.casinoSignTexture(), 420);
      const dim = section('차원 · 경계 마을 현판');
      for (const t of ['경계 마을', '달빛 여관', '촌장 집']) show(dim, village.signTexture(t), 360);
    })();
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div style={{ background: '#2a2d31', minHeight: '100vh', padding: 24 }}>
      <div ref={root} />
    </div>
  );
}
