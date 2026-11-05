'use client';

import { useIsTouch } from './TouchControls';

/** 폰·태블릿이면 화면 버튼 조작법을 보여준다 (키보드 설명만으론 알 수 없으니) */
export default function TouchGuide() {
  const touch = useIsTouch();
  if (!touch) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-white/80">
      <div className="mb-1 font-bold text-amber-200">📱 화면 버튼으로 할 때</div>
      <ul className="space-y-0.5 text-[13px]">
        <li>· 왼쪽 동그라미 = 이동 (앞으로 두 번 = 대시, 위·아래 톡 = 횡이동)</li>
        <li>· 오른쪽 1·2 = 왼손·오른손, 3·4 = 왼발·오른발, 점프</li>
        <li>· 두 버튼 동시에 = 합동 기술 (→ 누르고 1+3 = 잡기)</li>
        <li>· 가로로 눕혀서 하면 더 편해요</li>
      </ul>
      <button
        onClick={() => {
          // 전체화면 + 가로 고정 (지원하는 브라우저만. 아이폰 사파리는 "홈 화면에 추가"로)
          const el = document.documentElement;
          const done = el.requestFullscreen?.();
          void Promise.resolve(done)
            .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
            .catch(() => {});
        }}
        className="mt-2 w-full rounded bg-amber-500 py-2 text-sm font-bold text-black hover:bg-amber-400"
      >
        ⛶ 가로 전체화면으로 하기
      </button>
      <div className="mt-1 text-[11px] text-white/50">아이폰은 공유 → ‘홈 화면에 추가’로 설치하면 전체화면으로 열려요</div>
    </div>
  );
}
