/**
 * 게임 로고: 'Together'
 * - 글꼴: 손글씨 Nothing You Could Do, 흰색
 * - 글꼴 굵기가 하나뿐이라 같은 흰색 테두리를 둥근 이음으로 둘러 획을 두껍고 둥글게 키운다
 * - 오른쪽 위 작은 초승달, 반짝이 두 개, 은은한 라벤더 빛 번짐
 */
export default function GameTitle({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const width = size === 'lg' ? 'w-[min(34rem,88vw)]' : 'w-[min(26rem,80vw)]';
  return (
    <span className={`relative mx-auto block ${width}`}>
      <svg
        viewBox="0 0 620 210"
        role="img"
        aria-label="Together"
        className="block w-full overflow-visible"
        style={{ filter: 'drop-shadow(0 0 16px rgba(214, 206, 255, 0.5)) drop-shadow(0 0 40px rgba(170, 150, 255, 0.25))' }}
      >
        <text
          x="50%"
          y="56%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={150}
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ fontFamily: 'var(--font-logo), "Nothing You Could Do", cursive' }}
        >
          Together
        </text>
      </svg>
      {/* 초승달 */}
      <svg aria-hidden viewBox="0 0 40 40" className="absolute -right-[3%] top-[2%] w-[9%]">
        <path d="M27 5a15 15 0 1 0 8 26A13 13 0 1 1 27 5z" fill="#fff4c7" style={{ filter: 'drop-shadow(0 0 6px rgba(255, 236, 170, 0.8))' }} />
      </svg>
      {/* 반짝이 */}
      <Sparkle className="absolute left-[2%] top-[14%] w-[5%]" />
      <Sparkle className="absolute bottom-[6%] right-[10%] w-[3.5%] opacity-80" />
    </span>
  );
}

function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`tg-sparkle ${className}`}>
      <path d="M10 0c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10z" fill="#ffffff" />
    </svg>
  );
}
