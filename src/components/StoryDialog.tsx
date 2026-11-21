'use client';

import { useEffect, useState } from 'react';

/** 대사 한 줄 (누가 · 무슨 말 · 그 사람 얼굴) */
export interface DialogLine {
  /** 말하는 사람 ('me' = 나) */
  who: string;
  name: string;
  title?: string;
  text: string;
  /** 초상화 그림 주소 (그린 그림 또는 3D 모델을 찍은 그림). 아직 못 찍었으면 null → 그림자 틀 */
  portrait: string | null;
  /** 몬스터·정체 모를 것: 붉은 틀 */
  tone?: 'normal' | 'danger';
}

export interface DialogChoice {
  label: string;
  onPick: () => void;
}

/** 한 글자씩 나오는 속도 (ms) */
const TYPE_MS = 28;

/**
 * 대화창 (절대 조건: 대사가 나올 땐 언제나 말하는 사람의 초상화가 같이 나온다).
 * 화면 아래 대사 상자 + 왼쪽(나)·오른쪽(상대) 위로 튀어나온 초상화. 글자는 한 글자씩, 누르면 바로 다 보이고 한 번 더 누르면 다음 줄.
 */
export default function StoryDialog({
  line,
  idx,
  total,
  onNext,
  onClose,
  choices,
  touch,
  nextLabel,
}: {
  line: DialogLine;
  idx: number;
  total: number;
  onNext: () => void;
  onClose?: () => void;
  /** 마지막 줄에서 고르는 선택지 (있으면 '다음' 대신) */
  choices?: DialogChoice[] | null;
  touch: boolean;
  /** 마지막 줄 버튼 글자 (기본 '대화 끝') */
  nextLabel?: string;
}) {
  const [shown, setShown] = useState(0);
  const full = line.text.length;
  useEffect(() => {
    setShown(0);
    const id = window.setInterval(() => setShown((n) => (n >= full ? n : n + 1)), TYPE_MS);
    return () => window.clearInterval(id);
  }, [line, full]);
  const typing = shown < full;
  const last = idx + 1 >= total;
  const me = line.who === 'me';
  const danger = line.tone === 'danger';
  const showChoices = last && !typing && !!choices?.length;

  const advance = () => {
    if (typing) setShown(full);
    else if (!showChoices) onNext();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center p-3" onClick={advance}>
      <div className="relative w-full max-w-3xl">
        {/* 초상화: 대사 상자 바로 위에 상반신 (상자에 가리지 않게). 나는 왼쪽, 상대는 오른쪽 */}
        <div
          className={`pointer-events-none absolute bottom-full z-10 mb-2 ${me ? 'left-2' : 'right-2'} h-32 w-32 overflow-hidden rounded-2xl border-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:h-44 sm:w-44 ${
            danger ? 'border-rose-500/80 bg-gradient-to-b from-[#2a0610] to-black' : 'border-amber-200/60 bg-gradient-to-b from-[#3a2c52] to-[#140f20]'
          }`}
        >
          {line.portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={line.portrait} src={line.portrait} alt={line.name} draggable={false} className="h-full w-full select-none object-cover" />
          ) : (
            // 아직 얼굴을 못 찍었을 때: 그 사람 실루엣 틀 (빈 대사창은 띄우지 않는다)
            <div className="flex h-full w-full items-end justify-center">
              <div className={`mb-[-12%] h-[78%] w-[62%] rounded-t-full ${danger ? 'bg-rose-950' : 'bg-black/60'}`} />
            </div>
          )}
          <div className={`absolute inset-x-0 bottom-0 px-2 py-1 text-center text-xs font-black ${danger ? 'bg-rose-900/80 text-rose-100' : 'bg-black/60 text-amber-100'}`}>{line.name}</div>
        </div>

        <div
          className={`cursor-pointer select-none rounded-xl border p-4 pt-5 text-white shadow-[0_0_30px_rgba(0,0,0,0.6)] backdrop-blur-sm ${
            danger ? 'border-rose-400/40 bg-[#1c0a10]/94' : 'border-amber-200/30 bg-[#1a1420]/92'
          }`}
        >
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <div>
              <span className={`text-lg font-black ${danger ? 'text-rose-300' : me ? 'text-sky-200' : 'text-amber-200'}`}>{line.name}</span>
              {line.title && <span className="ml-2 text-xs text-white/50">{line.title}</span>}
            </div>
            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20"
              >
                닫기{!touch && ' (Esc)'}
              </button>
            )}
          </div>
          <p className="min-h-[3.5rem] whitespace-pre-line text-[15px] leading-7 text-white/90">
            {line.text.slice(0, shown)}
            {typing && <span className="animate-pulse text-white/50">▌</span>}
          </p>
          {showChoices ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {choices!.map((c) => (
                <button
                  key={c.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onPick();
                  }}
                  className="flex-1 rounded-lg border border-amber-200/40 bg-amber-300/15 px-3 py-2 text-sm font-bold text-amber-100 hover:bg-amber-300/30"
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between text-xs text-white/45">
              <span>
                {idx + 1} / {total}
              </span>
              <span className="font-bold text-amber-200/80">
                {typing ? '…' : last ? (nextLabel ?? '대화 끝') : '다음'} ▸{!touch && ' E'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
