/**
 * 게임 제목: 둥글둥글한 흰색 글자.
 * - 글꼴: 구름처럼 동글동글한 Sniglet
 * - 모서리: 같은 흰색 테두리를 둥근 이음(stroke-linejoin: round)으로 둘러 모든 모서리를 둥글게 깎는다
 * - 입체 효과 없이 은은한 빛 번짐만 둔다
 */
export default function CloudTitle({ text = 'Together', className = '' }: { text?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 760 180"
      role="img"
      aria-label={text}
      className={`mx-auto block w-full max-w-[36rem] drop-shadow-[0_0_20px_rgba(210,210,255,0.3)] ${className}`}
    >
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={112}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={14}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ fontFamily: 'var(--font-cloud), "Sniglet", ui-rounded, system-ui, sans-serif', fontWeight: 800, letterSpacing: '6px' }}
      >
        {text}
      </text>
    </svg>
  );
}
