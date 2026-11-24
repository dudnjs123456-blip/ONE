import type { PlayerProfile } from '../core/profile';
import type { Ch0State } from './chapter0';
import { readRoot, ROOT_INFO, type Ch1State, type Ch1Step } from './chapter1';

/**
 * 마스터 계정: 스토리 확인용. 집 컴퓨터(DIMENSION.exe)에서 장 · 장면을 골라 바로 들어간다.
 * 진행한 뒤에도 언제든 다시 고를 수 있다. 처음 고를 때 원래 진행을 한 번 백업해 두고, 되돌릴 수 있다.
 * - 마스터: 아이디가 MASTER_USERNAMES 에 있거나, NEXT_PUBLIC_MASTER_USERS(쉼표로 여럿)에 있거나, 로컬 개발(npm run dev)
 * - 자기 저장만 바꾼다 (다른 사람에게 영향 없음)
 */
export const MASTER_USERNAMES = ['master'];

export function isMaster(username?: string | null): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (!username) return false;
  const extra = (process.env.NEXT_PUBLIC_MASTER_USERS ?? '').split(',').map((s) => s.trim().toLowerCase());
  const u = username.trim().toLowerCase();
  return MASTER_USERNAMES.includes(u) || extra.includes(u);
}

type Dim = NonNullable<PlayerProfile['dimension']>;

export interface StoryEntry {
  id: string;
  chapter: '프롤로그' | '0장' | '1장';
  label: string;
}

const CH1_STEPS: { step: Ch1Step; label: string }[] = [
  { step: 'start', label: '① 바위의 버티기 수련' },
  { step: 'toSeoul', label: '② 로그아웃 → 서울 내 방의 멍' },
  { step: 'back', label: '③ 숨 고르기 → 포탈이 꺼진다' },
  { step: 'noa', label: '④ 노아의 근 감정' },
  { step: 'doha', label: '⑤ 벤치의 도하' },
  { step: 'order', label: '⑥ 바위의 고블린 의뢰' },
  { step: 'quest', label: '⑦ 고블린 셋 → 고블린 떼 → 도하의 흙벽' },
  { step: 'badge', label: '⑧ 마루의 길드 배지 → 마무리' },
];

export const STORY_ENTRIES: StoryEntry[] = [
  { id: 'prologue', chapter: '프롤로그', label: '게임 설치 → 안개 숲 → 벼랑' },
  { id: 'ch0:wake', chapter: '0장', label: '① 구조 · 여관 앞에서 깨어남' },
  { id: 'ch0:maru', chapter: '0장', label: '② 촌장 마루 (서울의 뒷면)' },
  { id: 'ch0:noa', chapter: '0장', label: '③ 노아 (시간이 멈춘 냄새)' },
  { id: 'ch0:bawi', chapter: '0장', label: '④ 바위 (반만 닿는 주먹) → 마무리' },
  ...CH1_STEPS.map((s) => ({ id: `ch1:${s.step}`, chapter: '1장' as const, label: s.label })),
];

const ORDER: Ch1Step[] = CH1_STEPS.map((s) => s.step);
const at = (step: Ch1Step, from: Ch1Step) => ORDER.indexOf(step) >= ORDER.indexOf(from);

/** 0장을 다 마친 기록 (1장 장면으로 들어갈 때) */
function ch0Done(visits: number): Ch0State {
  return { notes: { body: 2, where: 2, home: 2, shadow: 1, fist: 2 }, clues: ['board', 'well', 'book', 'kong'], choice: 'wonder', fresh: true, since: visits, done: true };
}

/** 0장 중간 기록. since 는 다음 접속 횟수 (그래야 "서울에 다녀왔네" 마중 장면이 잘못 나오지 않는다) */
function ch0At(point: 'maru' | 'noa' | 'bawi', visits: number): Ch0State {
  const notes: Ch0State['notes'] = { body: 1 };
  if (point !== 'maru') Object.assign(notes, { where: 2, home: 2 });
  if (point === 'bawi') notes.shadow = 1;
  return { notes, clues: [], ...(point !== 'maru' ? { choice: 'wonder' as const } : {}), fresh: true, since: visits + 1 };
}

const ALL_MET = ['dallae', 'kong', 'maru', 'noa', 'bawi'];

/**
 * 고른 장면에서 시작하도록 이야기 기록을 바꾼다. 처음 고를 때만 원래 진행을 백업한다.
 * @returns 바꿨으면 true. 다음 접속 때 그 장면부터 나온다
 */
export function jumpToStory(p: PlayerProfile, id: string): boolean {
  const entry = STORY_ENTRIES.find((e) => e.id === id);
  if (!entry) return false;
  const d: Dim = (p.dimension ??= { visits: 0 });
  d.masterBackup ??= structuredClone({ prologue: d.prologue, ch0: d.ch0, ch1: d.ch1, met: d.met });
  const visits = d.visits ?? 0;
  delete d.replayRescue;
  delete d.sleep;
  delete d.ch1;
  if (id === 'prologue') {
    d.prologue = false;
    delete d.ch0;
    d.met = [];
    return true;
  }
  d.prologue = true;
  if (id === 'ch0:wake') {
    // 프롤로그에서 떨어진 직후처럼: 달래의 구조 장면 → 깨어남 → 0장 처음
    delete d.ch0;
    d.met = [];
    d.replayRescue = true;
    return true;
  }
  if (id.startsWith('ch0:')) {
    d.ch0 = ch0At(id.slice(4) as 'maru' | 'noa' | 'bawi', visits);
    d.met = ['dallae'];
    return true;
  }
  const step = id.slice(4) as Ch1Step;
  d.ch0 = ch0Done(visits);
  d.met = [...ALL_MET];
  const s: Ch1State = { step };
  if (at(step, 'doha')) s.root = readRoot(p).root;
  if (at(step, 'quest')) s.questKills = 0;
  if (at(step, 'badge')) s.skillName = ROOT_INFO[s.root ?? '력'].suggest;
  d.ch1 = s;
  return true;
}

/** 원래 진행으로 되돌린다 (백업이 있을 때만). @returns 되돌렸으면 true */
export function restoreStory(p: PlayerProfile): boolean {
  const d = p.dimension;
  const b = d?.masterBackup;
  if (!d || !b) return false;
  d.prologue = b.prologue;
  d.ch0 = b.ch0;
  d.ch1 = b.ch1;
  d.met = b.met;
  delete d.masterBackup;
  delete d.replayRescue;
  return true;
}

export function hasStoryBackup(p: PlayerProfile): boolean {
  return !!p.dimension?.masterBackup;
}
