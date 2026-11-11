/**
 * 구름처럼 둥글둥글한 흰색 게임 제목.
 * 둥근 글꼴 위에 같은 흰색 테두리를 둥근 이음(stroke-linejoin: round)으로 덧씌워
 * 글자 모서리를 부풀리고, 은은한 빛 번짐으로 구름 느낌을 낸다. 색은 흰색 한 가지.
 */
export default function CloudTitle({ text = 'Together', className = '' }: { text?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 760 190"
      role="img"
      aria-label={text}
      className={`mx-auto block w-full max-w-[38rem] drop-shadow-[0_0_18px_rgba(200,205,255,0.35)] ${className}`}
    >
      <text
        x="50%"
        y="56%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={118}
        fontWeight={600}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={12}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ fontFamily: 'var(--font-fredoka), "Fredoka", ui-rounded, system-ui, sans-serif', letterSpacing: '10px' }}
      >
        {text}
      </text>
    </svg>
  );
}
