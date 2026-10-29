/** 피로도·배고픔 막대: 높을수록 차오르고, 위험 구간이면 빨갛게 깜빡인다 (도시·필드·보스 공용) */
export default function LifeBar({ label, value, color, warn }: { label: string; value: number; color: string; warn: number }) {
  const danger = value > warn;
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
      <span className={`w-10 ${danger ? 'font-bold text-red-300' : 'text-white/70'}`}>{label}</span>
      <div className="relative h-2 w-28 overflow-hidden rounded bg-black/50">
        <div className={`absolute inset-y-0 left-0 ${danger ? 'animate-pulse bg-red-500' : color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums text-white/70">{value}</span>
    </div>
  );
}

/** 피로도 + 배고픔 두 줄 */
export function LifeBars({ fatigue, hunger, hungerRate }: { fatigue: number; hunger: number; hungerRate?: number }) {
  return (
    <>
      <LifeBar label="피로도" value={Math.round(fatigue)} color="bg-violet-400" warn={80} />
      <LifeBar label="배고픔" value={Math.round(hunger)} color="bg-orange-400" warn={85} />
      {hungerRate !== undefined && hungerRate >= 1.15 && (
        <div className="mt-0.5 text-[10px] text-orange-200/80">🔥 활동량이 많아 배고픔 ×{hungerRate.toFixed(1)}</div>
      )}
    </>
  );
}
