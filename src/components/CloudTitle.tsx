import { useId } from 'react';

/**
 * 게임 제목: 둥글둥글한 흰색 입체 글자.
 * - 글꼴: 구름처럼 동글동글한 Sniglet
 * - 모서리: 같은 흰색 테두리를 둥근 이음(stroke-linejoin: round)으로 둘러 모든 모서리를 둥글게 깎는다
 * - 입체감: 아래쪽으로 보랏빛 두께를 여러 겹 쌓고 그 아래 그림자를 깐다
 */
const DEPTH = 9; // 두께 (겹 수 = 픽셀)

export default function CloudTitle({ text = 'Together', className = '' }: { text?: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const base = {
    x: '50%',
    y: '50%',
    textAnchor: 'middle' as const,
    dominantBaseline: 'middle' as const,
    fontSize: 112,
    strokeWidth: 14,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    style: { fontFamily: 'var(--font-cloud), "Sniglet", ui-rounded, system-ui, sans-serif', fontWeight: 800, letterSpacing: '6px' },
  };
  return (
    <svg viewBox="0 0 760 200" role="img" aria-label={text} className={`mx-auto block w-full max-w-[36rem] ${className}`}>
      <defs>
        {/* 두께 색: 위는 연보라, 아래로 갈수록 진한 보라 */}
        <linearGradient id={`side-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9bcff" />
          <stop offset="100%" stopColor="#7d6bd8" />
        </linearGradient>
        {/* 앞면: 흰색에 아래쪽만 아주 살짝 라벤더 */}
        <linearGradient id={`face-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#efeaff" />
        </linearGradient>
        <filter id={`shadow-${id}`} x="-10%" y="-30%" width="120%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#2a1a5e" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* 바닥 그림자 + 두께 */}
      <g filter={`url(#shadow-${id})`}>
        {Array.from({ length: DEPTH }, (_, i) => DEPTH - i).map((d) => (
          <text key={d} {...base} transform={`translate(0 ${d})`} fill={`url(#side-${id})`} stroke={`url(#side-${id})`}>
            {text}
          </text>
        ))}
      </g>
      {/* 앞면 */}
      <text {...base} fill={`url(#face-${id})`} stroke={`url(#face-${id})`}>
        {text}
      </text>
    </svg>
  );
}
