'use client';

import { useEffect, useState } from 'react';
import { BIND_ACTIONS, bindCodes, keyName, resetBinds, setBind, type BindAction } from '@/game/core/keybinds';

/**
 * 키 설정 창: 바꿀 동작을 누르고 → 원하는 키를 누르면 바로 바뀐다 (Esc = 취소).
 * 다른 동작이 쓰던 키면 서로 맞바꾼다. 이 컴퓨터에 저장된다.
 */
export default function KeySettings({ onClose }: { onClose: () => void }) {
  const [waiting, setWaiting] = useState<BindAction | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 바꾼 뒤 다시 그리기용
  const [, setVersion] = useState(0);

  useEffect(() => {
    // 게임 키 처리보다 먼저 받아서, 키를 고르는 동안엔 게임에 전달하지 않는다
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== 'keydown' || e.repeat) return;
      if (!waiting) {
        if (e.code === 'Escape') onClose();
        return;
      }
      if (e.code === 'Escape') {
        setWaiting(null);
        setMsg(null);
        return;
      }
      const err = setBind(waiting, e.code);
      setMsg(err);
      if (!err) setWaiting(null);
      setVersion((v) => v + 1);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [waiting, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-white/20 bg-zinc-900/95 p-6 text-sm">
        <div className="mb-1 text-center text-xl font-bold">⌨️ 키 설정</div>
        <div className="mb-4 text-center text-xs text-white/50">바꿀 항목을 누른 뒤 원하는 키를 누르세요 (Esc 취소)</div>
        <div className="flex flex-col gap-1">
          {BIND_ACTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                setWaiting(id);
                setMsg(null);
              }}
              className={`flex items-center justify-between rounded px-3 py-1.5 text-left ${
                waiting === id ? 'bg-amber-500/30 ring-1 ring-amber-400' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="text-white/80">{label}</span>
              <span className="min-w-20 rounded bg-black/40 px-2 py-0.5 text-center font-mono font-bold text-amber-300">
                {waiting === id ? '키 입력…' : bindCodes(id).map(keyName).join(' / ')}
              </span>
            </button>
          ))}
        </div>
        {msg && <div className="mt-3 text-center text-xs text-red-400">{msg}</div>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => {
              resetBinds();
              setWaiting(null);
              setMsg(null);
              setVersion((v) => v + 1);
            }}
            className="flex-1 rounded bg-white/10 py-2 hover:bg-white/20"
          >
            기본값으로
          </button>
          <button onClick={onClose} className="flex-1 rounded bg-amber-500 py-2 font-bold text-black hover:bg-amber-400">
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
