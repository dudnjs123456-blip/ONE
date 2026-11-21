'use client';

import type { VillageNpcDef } from '@/game/data/village';
import StoryDialog from './StoryDialog';

export interface TalkState {
  npc: VillageNpcDef;
  lines: string[];
  idx: number;
  /** 처음 만난 대화 */
  first: boolean;
  /** 그 NPC 얼굴 (장면에서 찍은 그림, 아직 못 찍었으면 null → 조금 뒤 다시 찍는다) */
  portrait: string | null;
}

/** 경계 마을 NPC 대화창: 말하는 NPC 초상화와 함께 (절대 조건). 클릭·E 로 다음 줄, 마지막 줄에서 닫힌다 */
export default function VillageTalk({ talk, onNext, onClose, touch }: { talk: TalkState; onNext: () => void; onClose: () => void; touch: boolean }) {
  const last = talk.idx + 1 >= talk.lines.length;
  const rest = last && talk.npc.service === 'rest';
  return (
    <StoryDialog
      line={{ who: talk.npc.id, name: talk.npc.name, title: talk.npc.title, text: talk.lines[talk.idx], portrait: talk.portrait }}
      idx={talk.idx}
      total={talk.lines.length}
      onNext={onNext}
      onClose={onClose}
      touch={touch}
      nextLabel={rest ? '☕ 차 마시기' : '대화 끝'}
    />
  );
}
