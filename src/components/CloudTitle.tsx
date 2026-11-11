import { useId } from 'react';

/**
 * 구름처럼 몽실몽실한 게임 제목.
 * 같은 글자를 세 겹으로 그린다: 바깥 보랏빛 테두리 → 두툼한 흰 구름 테두리 → 파스텔 글자.
 * 테두리를 둥근 이음(stroke-linejoin: round)으로 크게 부풀려 글자가 구름 덩어리처럼 보인다.
 */
export default function CloudTitle({ text = 'Together', className = '' }: { text?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const common = {
    x: '50%',
    y: '58%',
    textAnchor: 'middle' as const,
    dominantBaseline: 'middle' as const,
    fontSize: 118,
    fontWeight: 700,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    style: { fontFamily: 'var(--font-fredoka), "Fredoka", ui-rounded, system-ui, sans-serif', letterSpacing: '14px' },
  };
  return (
    <svg viewBox="0 0 760 190" role="img" aria-label={text} className={`mx-auto block w-full max-w-[38rem] ${className}`}>
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd3ea" />
          <stop offset="55%" stopColor="#f6b9e3" />
          <stop offset="100%" stopColor="#b7c4ff" />
        </linearGradient>
        <linearGradient id={`puff-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e9ff" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="0" floodColor="#4b3f8f" floodOpacity="0.9" />
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#a99cff" floodOpacity="0.45" />
        </filter>
      </defs>
      {/* 바깥 보랏빛 테두리 + 그림자 */}
      <text {...common} fill="#8c84d6" stroke="#8c84d6" strokeWidth={30} filter={`url(#glow-${id})`}>
        {text}
      </text>
      {/* 두툼한 흰 구름 */}
      <text {...common} fill={`url(#puff-${id})`} stroke={`url(#puff-${id})`} strokeWidth={20}>
        {text}
      </text>
      {/* 파스텔 글자 */}
      <text {...common} fill={`url(#fill-${id})`}>
        {text}
      </text>
    </svg>
  );
}
