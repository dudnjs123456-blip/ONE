'use client';

import { useEffect, useState } from 'react';
import { MODE_LABEL, getGfxMode, gpuInfo, onGfxMode, setGfxMode, type GfxMode } from '@/game/render/graphics';

const MODES: GfxMode[] = ['auto', 'high', 'mid', 'low', 'lowest'];

const TIER_TEXT = { high: '좋은 편', mid: '보통', low: '낮은 편', software: '그래픽 가속 꺼짐' } as const;

/** Esc 메뉴 안의 화질 고르기 (자동 / 높음 / 중간 / 낮음 / 최저) */
export function GraphicsSettings() {
  const [mode, setMode] = useState<GfxMode>(getGfxMode);
  useEffect(() => {
    const off = onGfxMode(setMode);
    return () => {
      off();
    };
  }, []);
  const gpu = gpuInfo();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm text-zinc-300">🖥️ 화질</div>
      <div className="grid grid-cols-5 gap-1">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setGfxMode(m)}
            className={`rounded py-1.5 text-xs font-bold ${mode === m ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="text-[11px] leading-snug text-zinc-400">
        {mode === 'auto' ? '느려지면 저절로 화질을 낮춰요.' : '고른 화질로 고정돼요. 버벅이면 한 단계 낮춰 보세요.'}
        {gpu && <> · 이 컴퓨터 그래픽: {TIER_TEXT[gpu.tier]}</>}
      </div>
    </div>
  );
}

/** 그래픽카드 없이 CPU 로 그리고 있으면 (크롬 하드웨어 가속 꺼짐) 한 번 알려 준다 */
export function SoftwareGpuNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // 화면(렌더러)이 만들어진 뒤에 그래픽카드 정보가 생긴다
    const t = window.setTimeout(() => {
      let seen = false;
      try {
        seen = sessionStorage.getItem('iron-fist.swGpuSeen') === '1';
      } catch {
        // 못 읽으면 그냥 보여 준다
      }
      if (!seen && gpuInfo()?.tier === 'software') setShow(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      sessionStorage.setItem('iron-fist.swGpuSeen', '1');
    } catch {
      // 저장 못 해도 닫기는 된다
    }
  };
  return (
    <div className="pointer-events-auto absolute left-1/2 top-16 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-amber-400/50 bg-zinc-900/95 p-4 text-sm shadow-xl">
      <div className="mb-1 font-bold text-amber-300">⚠️ 그래픽 가속이 꺼져 있어요</div>
      <div className="leading-relaxed text-zinc-300">
        지금은 그래픽카드 없이 그리고 있어서 많이 느릴 수 있어요. 메뉴(Esc) → 화질에서 &lsquo;최저&rsquo;를 고르면 조금 나아져요.
        <br />
        크롬이면 설정 → 시스템 → <b>&lsquo;가능한 경우 그래픽 가속 사용&rsquo;</b>을 켜고 브라우저를 다시 열어 주세요.
      </div>
      <button onClick={close} className="mt-3 w-full rounded bg-amber-500 py-1.5 font-bold text-black hover:bg-amber-400">
        확인
      </button>
    </div>
  );
}
