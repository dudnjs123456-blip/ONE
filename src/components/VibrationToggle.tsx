'use client';

import { useEffect, useState } from 'react';
import { isVibrationOn, rumble, setVibrationOn } from '@/game/render/haptics';

/** 일시정지 메뉴용 진동 켜기/끄기 (켤 때 한 번 짧게 떨려서 확인) */
export default function VibrationToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(isVibrationOn()), []);
  return (
    <button
      onClick={() => {
        const next = !on;
        setVibrationOn(next);
        setOn(next);
        if (next) rumble(0.5, 80);
      }}
      className="rounded bg-white/10 py-2 hover:bg-white/20"
    >
      📳 진동 {on ? '켜짐' : '꺼짐'}
    </button>
  );
}
