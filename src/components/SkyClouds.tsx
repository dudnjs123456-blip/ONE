import type { CSSProperties } from 'react';

/**
 * 화면 위쪽에서 천천히 흘러가는 구름들.
 * 크기·높이·속도·진하기를 다르게 해서 겹쳐 보이게 하고, 시작 시점을 엇갈려 처음부터 화면에 떠 있게 한다.
 */
const CLOUDS = [
  { top: '3%', size: 30, speed: 140, delay: -20, opacity: 0.16 },
  { top: '11%', size: 18, speed: 95, delay: -60, opacity: 0.12 },
  { top: '1%', size: 22, speed: 120, delay: -95, opacity: 0.13 },
  { top: '18%', size: 14, speed: 80, delay: -10, opacity: 0.09 },
  { top: '7%', size: 26, speed: 160, delay: -130, opacity: 0.14 },
  { top: '22%', size: 12, speed: 70, delay: -45, opacity: 0.08 },
];

export default function SkyClouds() {
  return (
    <div aria-hidden className="tg-clouds">
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="tg-cloud"
          style={
            {
              top: c.top,
              ['--x' as string]: `${i * 17}vw`,
              fontSize: `${c.size}px`,
              opacity: c.opacity,
              animationDuration: `${c.speed}s, ${6 + i}s`,
              animationDelay: `${c.delay}s, ${-i}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
