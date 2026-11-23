/** 은화 (차원 돈) 아이콘: 이모지가 없는 기기도 있어 코드로 그린 은빛 동전 */
export default function CoinIcon({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[0.9em] w-[0.9em] translate-y-[0.08em] rounded-full bg-gradient-to-br from-white via-slate-300 to-slate-500 shadow-[inset_0_0_0_1.5px_rgba(71,85,105,0.9)] ${className}`}
    />
  );
}
