import type { PlayerProfile } from './profile';
import { DEFAULT_BODY } from '../data/defaultBody';
import { jumpToStory } from '../story/master';

/**
 * 모든 계정에 한 번씩만 적용하는 일괄 변경. 계정이 접속할 때 프로필(서버와 합친 뒤)에 적용하고 resetV 를 올린다.
 * 새 변경은 RESETS 끝에 하나 추가 (번호는 늘어나기만 한다).
 */
const RESETS: { v: number; apply: (p: PlayerProfile) => void }[] = [
  {
    // 2026-11-26 사용자: "모든 아이디의 기본 캐릭터는 작은은발소녀, 프롤로그부터 다시"
    // 이야기 진행(프롤로그·0장·1장·만난 NPC)만 처음으로. 원래 진행은 dimension.masterBackup 에 남는다.
    // 은화·장비·레벨·서울 생활은 그대로.
    v: 1,
    apply: (p) => {
      p.body = DEFAULT_BODY;
      // 차원에 아직 안 가 본 계정(새 계정)은 되돌릴 이야기가 없다
      const d = p.dimension;
      if (d && (d.prologue || d.ch0 || d.ch1 || d.met?.length)) jumpToStory(p, 'prologue');
    },
  },
];

export const RESET_V = RESETS[RESETS.length - 1].v;

/** @returns 바뀌었으면 true (저장 필요) */
export function applyResets(p: PlayerProfile): boolean {
  const from = p.resetV ?? 0;
  let changed = false;
  // 몸을 안 고른 계정(새 계정)은 기본 캐릭터로 (서버와 합친 뒤에 채운다 — 프로필을 만들 때 넣으면 예전 기록 합치기가 꼬인다)
  if (!p.body) {
    p.body = DEFAULT_BODY;
    changed = true;
  }
  for (const r of RESETS) {
    if (r.v <= from) continue;
    r.apply(p);
    changed = true;
  }
  if (changed) p.resetV = RESET_V;
  return changed;
}
