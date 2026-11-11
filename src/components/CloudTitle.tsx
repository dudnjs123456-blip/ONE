/**
 * 게임 제목: 구름처럼 동글동글한 Sniglet 글꼴, 흰색 한 가지.
 * 아래쪽에 옅은 보랏빛 그림자, 주변에 은은한 빛 번짐을 넣어 몽실몽실하게 띄운다.
 */
export default function CloudTitle({ text = 'Together', className = '' }: { text?: string; className?: string }) {
  return (
    <span
      className={`font-title block text-center text-7xl leading-none text-white sm:text-8xl ${className}`}
      style={{
        letterSpacing: '0.02em',
        textShadow: '0 5px 0 rgba(150, 130, 230, 0.55), 0 0 24px rgba(255, 255, 255, 0.35), 0 10px 30px rgba(120, 90, 200, 0.5)',
      }}
    >
      {text}
    </span>
  );
}
