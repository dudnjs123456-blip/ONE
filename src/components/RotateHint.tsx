'use client';

import { useEffect, useState } from 'react';

/** 화면이 세로(높이 > 폭)인가 */
export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return portrait;
}

/** 폰을 세로로 들고 있으면 "가로로 돌려주세요" 안내 (닫으면 이번 화면에선 다시 안 띄움) */
export default function RotateHint({ touch }: { touch: boolean }) {
  const portrait = usePortrait();
  const [closed, setClosed] = useState(false);
  if (!touch || !portrait || closed) return null;
  return (
    <div className="absolute inset-x-4 top-1/3 z-30 rounded-lg border border-amber-300/40 bg-black/85 p-4 text-center text-white">
      <div className="text-3xl">📱↻</div>
      <div className="mt-1 font-bold">폰을 가로로 돌리면 더 잘 보여요</div>
      <div className="mt-1 text-xs text-white/60">세로에선 화면이 좁아 캐릭터가 작게 보여요</div>
      <button onClick={() => setClosed(true)} className="mt-3 rounded bg-white/15 px-4 py-1.5 text-sm hover:bg-white/25">
        그냥 세로로 할게요
      </button>
    </div>
  );
}
