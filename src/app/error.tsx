'use client';

/**
 * 화면이 통째로 깨졌을 때 (Next 기본 'Application error' 대신).
 * 가장 흔한 원인은 브라우저가 3D(WebGL)를 막은 경우 — 그래픽카드가 한 번 멈추면 크롬이 그 사이트의 3D 를 막는다.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const gl = /webgl/i.test(error.message);
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <div className="max-w-md rounded-xl border border-white/15 bg-white/5 p-6 text-center">
        <div className="mb-2 text-3xl">{gl ? '🖥️' : '😵'}</div>
        <div className="mb-2 text-lg font-bold">{gl ? '브라우저가 3D 그래픽을 막았어요' : '문제가 생겼어요'}</div>
        {gl ? (
          <div className="mb-4 space-y-1 text-sm text-white/70">
            <p>그래픽카드가 잠깐 멈추면 크롬이 이 사이트의 3D 를 막아 둬요.</p>
            <p>
              <b>크롬 창을 모두 닫고 다시 켜면</b> 풀려요.
            </p>
            <p className="text-xs text-white/50">계속 그러면 설정 → 시스템 → &lsquo;그래픽 가속 사용&rsquo;이 켜져 있는지 확인해 주세요.</p>
          </div>
        ) : (
          <div className="mb-4 break-all text-xs text-white/50">{error.message}</div>
        )}
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            다시 시도
          </button>
          <button onClick={() => location.reload()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400">
            새로고침
          </button>
        </div>
      </div>
    </div>
  );
}
