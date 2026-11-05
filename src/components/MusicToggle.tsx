'use client';

import { useEffect, useState } from 'react';
import { isBgmMuted, onBgmMuteChange, setBgmMuted } from '@/game/render/bgm';

/** 배경 음악 켜기/끄기 (효과음과 따로, 이 브라우저에 기억) */
export default function MusicToggle({ className = '', compact = false }: { className?: string; /** 좁은 화면: 아이콘만 */ compact?: boolean }) {
  const [muted, set] = useState(false);
  useEffect(() => {
    set(isBgmMuted());
    const off = onBgmMuteChange(set);
    return () => {
      off();
    };
  }, []);
  return (
    <button
      onClick={() => setBgmMuted(!muted)}
      className={`rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20 ${className}`}
      title={muted ? '음악 켜기' : '음악 끄기'}
    >
      {compact ? (muted ? '🎵✕' : '🎵') : muted ? '🎵 음악 꺼짐' : '🎵 음악 켜짐'}
    </button>
  );
}
