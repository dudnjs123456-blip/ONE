'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityWorld } from '@/game/city/cityWorld';
import { RIDES } from '@/game/city/themePark';
import { RIDE_MAP_COLOR } from './parkMapDraw';
import { playerPortrait } from '@/game/data/portraits';

/** 한 글자씩 찍히는 속도 (ms) */
const TYPE_MS = 26;

/**
 * 놀이기구 직원 대화창 (대본): 아래 대사창에 말하는 사람 이름표와 대사가 한 글자씩 찍힌다.
 * Enter · Space · E · 클릭 = 다음 (찍히는 중이면 한 번에 다 보이기), Esc = 그만두기.
 * 마지막 대사 다음엔 탑승하거나 줄을 선다 (world.staffTalkNext 가 정한다).
 */
export default function RideStaffTalk({ world }: { world: CityWorld }) {
  const [, tick] = useState(0);
  const [typed, setTyped] = useState(0);
  const key = useRef('');
  const t = world.staffTalk;

  // 대화 상태는 게임 세계에 있으니 자주 다시 그린다
  useEffect(() => {
    const iv = window.setInterval(() => tick((n) => n + 1), 80);
    return () => window.clearInterval(iv);
  }, []);

  const line = t ? t.lines[t.i] : null;
  const lineKey = t ? `${t.ride}:${t.i}:${line?.text}` : '';
  // 대사가 바뀌면 처음부터 찍는다
  useEffect(() => {
    if (key.current === lineKey) return;
    key.current = lineKey;
    setTyped(0);
  }, [lineKey]);
  useEffect(() => {
    if (!line || typed >= line.text.length) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => window.clearTimeout(id);
  }, [line, typed]);

  const typing = !!line && typed < line.text.length;
  const next = () => {
    if (!world.staffTalk) return;
    if (typing) setTyped(line!.text.length);
    else world.staffTalkNext();
    tick((n) => n + 1);
  };

  // 대화 중 키: 채팅(Enter)·메뉴(Esc) 같은 다른 단축키보다 먼저 받는다
  useEffect(() => {
    if (!t) return;
    const onKey = (e: KeyboardEvent) => {
      if (!world.staffTalk) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) next();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        world.staffTalkCancel();
        tick((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!t || !line) return null;
  const R = RIDES[t.ride];
  const staff = line.who === 'staff';
  const last = t.i === t.lines.length - 1 && t.lines.length > 2;
  const portrait = playerPortrait(world.profile.body);
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-6 z-40 flex justify-center px-3" onClick={next}>
      <style>{'@keyframes portrait-in{from{opacity:.5;transform:translateY(10px)}to{opacity:1;transform:none}}'}</style>
      <div className="relative w-full max-w-2xl cursor-pointer select-none rounded-2xl border-2 bg-[#14101d]/92 px-5 pb-4 pt-6 text-white shadow-2xl" style={{ borderColor: RIDE_MAP_COLOR[t.ride] }}>
        {/* 내 캐릭터 상반신: 대사창 오른쪽 위에 걸쳐 선다. 직원이 말할 땐 살짝 어둡게 */}
        {portrait && (
          <div
            className="pointer-events-none absolute bottom-[calc(100%-1.5rem)] right-2 aspect-[4/5] w-[34vw] max-w-[260px] overflow-hidden sm:right-6"
            style={{ maskImage: 'linear-gradient(to bottom, black 78%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 78%, transparent)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 w-full select-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition-[filter] duration-300"
              style={{ animation: 'portrait-in 0.3s ease-out', filter: staff ? 'brightness(0.72) saturate(0.85)' : 'none' }}
            />
          </div>
        )}
        {/* 이름표: 직원은 왼쪽, 나는 오른쪽 */}
        <div
          className={`absolute -top-4 rounded-lg px-3 py-1 text-sm font-black shadow ${staff ? 'left-5' : 'right-5'}`}
          style={{ background: staff ? RIDE_MAP_COLOR[t.ride] : '#f59e0b', color: staff ? '#fff' : '#111' }}
        >
          {staff ? `🎫 ${R.icon} ${t.name}` : `${world.netName ?? '나'}`}
        </div>
        <p className={`min-h-[3rem] text-base leading-relaxed ${staff ? '' : 'text-right text-amber-100'}`}>
          {line.text.slice(0, typed)}
          {typing && <span className="animate-pulse">▍</span>}
        </p>
        <div className="mt-1 flex items-center justify-between text-[11px] text-white/45">
          <button
            onClick={(e) => {
              e.stopPropagation();
              world.staffTalkCancel();
              tick((n) => n + 1);
            }}
            className="rounded bg-white/10 px-2 py-0.5 text-white/70 hover:bg-white/20"
          >
            그만두기 (Esc)
          </button>
          <span className={typing ? 'opacity-0' : 'animate-pulse text-white/70'}>{last ? '▶ 확인 (Enter)' : '▼ 다음 (Enter · 클릭)'}</span>
        </div>
      </div>
    </div>
  );
}
