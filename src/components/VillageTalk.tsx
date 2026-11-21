'use client';

import type { VillageNpcDef } from '@/game/data/village';

export interface TalkState {
  npc: VillageNpcDef;
  lines: string[];
  idx: number;
  /** 처음 만난 대화 */
  first: boolean;
}

/** 경계 마을 NPC 대화창 (화면 아래). 클릭·E 로 다음 줄, 마지막 줄에서 닫힌다 */
export default function VillageTalk({ talk, onNext, onClose, touch }: { talk: TalkState; onNext: () => void; onClose: () => void; touch: boolean }) {
  const last = talk.idx + 1 >= talk.lines.length;
  const rest = last && talk.npc.service === 'rest';
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-3" onClick={onNext}>
      <div className="w-full max-w-2xl cursor-pointer select-none rounded-xl border border-amber-200/30 bg-[#1a1420]/92 p-4 text-white shadow-[0_0_30px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <span className="text-lg font-black text-amber-200">{talk.npc.name}</span>
            <span className="ml-2 text-xs text-white/50">{talk.npc.title}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20"
          >
            닫기{!touch && ' (Esc)'}
          </button>
        </div>
        <p className="min-h-[3rem] text-[15px] leading-7 text-white/90">{talk.lines[talk.idx]}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-white/45">
          <span>
            {talk.idx + 1} / {talk.lines.length}
          </span>
          <span className="font-bold text-amber-200/80">
            {rest ? '☕ 차 마시기' : last ? '대화 끝' : '다음'} ▸{!touch && ' E'}
          </span>
        </div>
      </div>
    </div>
  );
}
