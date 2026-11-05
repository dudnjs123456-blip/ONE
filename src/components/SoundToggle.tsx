'use client';

import { useEffect, useState } from 'react';
import { isMuted, onMuteChange, setMuted } from '@/game/render/sfx';

/** 효과음 켜기/끄기 (설정은 이 브라우저에 기억) */
export default function SoundToggle({ className = '', compact = false }: { className?: string; /** 좁은 화면: 아이콘만 */ compact?: boolean }) {
  const [muted, set] = useState(false);
  useEffect(() => {
    set(isMuted());
    const off = onMuteChange(set);
    return () => {
      off();
    };
  }, []);
  return (
    <button
      onClick={() => setMuted(!muted)}
      className={`rounded bg-white/10 px-3 py-1.5 text-white/80 hover:bg-white/20 ${className}`}
      title={muted ? '효과음 켜기' : '효과음 끄기'}
    >
      {compact ? (muted ? '🔇' : '🔊') : muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}
    </button>
  );
}
