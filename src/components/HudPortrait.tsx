'use client';

import { BODY_TYPES } from '@/game/render/looks';
import { playerPortrait } from '@/game/data/portraits';
import type { PlayerMood } from '@/game/data/npcs';

/** 지금 상태로 고르는 표정: 아프면 울고, 졸리면 졸고, 배고프면 고민한다 */
export function hudMood(s: { hp: number; maxHp: number; fatigue: number; hunger: number }): PlayerMood {
  if (s.hp / s.maxHp <= 0.25) return '울음';
  if (s.fatigue >= 80) return '졸림';
  if (s.hunger >= 80) return '고민';
  if (s.hp / s.maxHp >= 0.9 && s.fatigue < 40 && s.hunger < 40) return '웃음';
  return '기본';
}

/**
 * 화면 왼쪽 위: 내 캐릭터 얼굴 + 이름 + 레벨.
 * 초상화가 없는 몸은 그 몸의 아이콘을 동그라미 안에 띄운다.
 */
export default function HudPortrait({ body, name, level, mood }: { body: string | undefined; name: string | null; level: number; mood: PlayerMood }) {
  const b = BODY_TYPES.find((t) => t.id === (body ?? 'female')) ?? BODY_TYPES[0];
  const src = playerPortrait(body, mood);
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <div className="relative h-14 w-14 overflow-hidden rounded-full bg-gradient-to-b from-sky-200/30 to-indigo-900/60 ring-2 ring-amber-300/80 shadow-[0_0_12px_rgba(251,191,36,0.35)]">
          {src ? (
            // 전신 그림에서 얼굴만 보이게 크게 띄운다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ width: '260%', left: '-82%', top: '-18%' }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl">{b.icon}</span>
          )}
        </div>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200/70 bg-amber-400 px-1.5 text-[10px] font-black leading-4 text-zinc-900 shadow">
          Lv.{level}
        </span>
      </div>
      <div className="min-w-0">
        <div className="max-w-[9.5rem] truncate text-base font-black leading-tight text-white drop-shadow">{name || '손님'}</div>
        <div className="text-[11px] text-white/60">
          {b.icon} {b.label}
        </div>
      </div>
    </div>
  );
}
