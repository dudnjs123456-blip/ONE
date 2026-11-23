import type { ScriptLine } from '../data/prologueScript';

/**
 * 0장 「저편에서 온 사람」 (프롤로그 다음, 수련 전): 벼랑 밑에서 구해져 깨어난 주인공이 이 세계 이야기를 듣는 과정.
 * 주인공은 0장 내내 끝까지 "엄청 잘 만든 게임"이라고 믿는다 (아픔 = 햅틱, 같은 시각 = 실시간 서버, 설명 = 세계관 설정, 근 = 스탯).
 * 진짜라고 받아들이는 건 1장에서 여러 사건을 겪으며. 의문 수첩의 ??? 를 마을 사람들과 이야기하며 하나씩 채운다. 순수 로직 + 대사 (그리기는 FieldView).
 *
 * 순서: 깨어남(달래, 필수) → [자유] 마을 살펴보기 · 콩이 · 서울 다녀오기 → 마루(필수) → 노아(마루 다음) → 바위(노아 다음, 마지막)
 * 세계 이름 · 지형 · DIMENSION 제작자 정체는 아직 정하지 않았다 → 대사에 못 박지 않고 떡밥으로만 둔다.
 */

/** 수첩의 의문 */
export type NoteId = 'body' | 'where' | 'home' | 'shadow' | 'fist';
/** 마을에서 혼자 알아챈 것 (선택) */
export type ClueId = 'board' | 'well' | 'book' | 'kong';
/** 마루가 물었을 때 고른 마음 (지금은 기록만, 나중에 개인 힘의 성향에 쓸 수 있게) */
export type Ch0Choice = 'doubt' | 'wonder' | 'survive';

export interface Ch0State {
  /** 1 = 절반 알아냄, 2 = 다 알아냄 */
  notes: Partial<Record<NoteId, 1 | 2>>;
  clues?: ClueId[];
  choice?: Ch0Choice;
  /** 프롤로그에서 바로 이어진 새 사람: 0장이 끝나기 전엔 북문을 못 나간다 (예전부터 하던 사람은 막지 않는다) */
  fresh?: boolean;
  /** 깨어났을 때의 접속 횟수 (이보다 많아지면 서울에 다녀온 것) */
  since?: number;
  done?: boolean;
}

export const NOTES: { id: NoteId; q: string; half?: string; full: string }[] = [
  { id: 'body', q: '이게 진짜 내 몸이야?', half: '아프다. …햅틱 피드백이 엄청 좋은 게임인가 보다.', full: '서울에 갔다 온 만큼 여기도 시간이 흘렀다. 실시간 서버겠지.' },
  { id: 'where', q: '여기는 어디지?', full: '촌장 말로는 서울의 "뒷면". …세계관 설정치곤 꽤 진지하다.' },
  { id: 'home', q: '나 돌아갈 수 있어?', full: '로그아웃하면 내 방으로 돌아간다. 역시 게임 맞잖아.' },
  { id: 'shadow', q: '숲의 그림자는 뭐였지?', half: '노아: "시간이 멈춘 냄새". 무슨 소린지 모르겠다. 히든 보스?', full: '' },
  { id: 'fist', q: '왜 내 주먹이 안 통했지?', full: '바위 말로는 "반만 닿는다". 레벨 1이라 그런 거겠지. 스킬 해금 퀘스트가 있나 봐.' },
];

export const CLUES: { id: ClueId; label: string }[] = [
  { id: 'board', label: '읽히는 낯선 글자' },
  { id: 'well', label: '우물에 비친 윤곽' },
  { id: 'book', label: '방명록의 오래된 한 줄' },
  { id: 'kong', label: '"저편 사람"' },
];

/** 장면 이름 */
export type SceneId =
  | 'wake'
  | 'return'
  | 'kong'
  | 'maru'
  | 'maruAfter'
  | 'noaEarly'
  | 'noa'
  | 'bawiEarly'
  | 'bawi'
  | 'bawiHit'
  | 'end'
  | 'board'
  | 'well'
  | 'book';

export interface Scene {
  id: SceneId;
  lines: ScriptLine[];
  /** 마지막 줄에서 고르는 것 (없으면 그냥 끝) */
  choices?: { label: string; value: string }[];
}

/** 프로필에서 0장 상태를 꺼낸다 (없으면 null = 아직 시작 안 함) */
export function ch0Of(dimension: { ch0?: Ch0State } | undefined): Ch0State | null {
  return dimension?.ch0 ?? null;
}

/** 0장을 시작한다. fresh = 프롤로그에서 바로 이어진 새 사람 */
export function startCh0(visits: number, fresh: boolean): Ch0State {
  return { notes: { body: 1 }, clues: [], fresh, since: visits };
}

const has = (s: Ch0State, n: NoteId) => (s.notes[n] ?? 0) > 0;

/** 수첩이 다 찼나 (몸은 절반만 알아도 된다 · 그림자는 절반이 끝) */
export function notesComplete(s: Ch0State): boolean {
  return has(s, 'body') && has(s, 'where') && has(s, 'home') && has(s, 'shadow') && has(s, 'fist');
}

/**
 * 퀘스트 자동진행: 지금 꼭 해야 할 다음 일 (촌장 마루 → 노아 → 바위). 다 했거나 0장이 끝났으면 null.
 * 살펴보기 · 콩이 · 서울 다녀오기는 선택이라 자동진행에선 건너뛴다.
 */
export function nextObjective(s: Ch0State | null): { npc: 'maru' | 'noa' | 'bawi'; label: string } | null {
  if (!s || s.done) return null;
  if (!has(s, 'where')) return { npc: 'maru', label: '촌장 마루에게 이곳이 어디인지 묻기' };
  if (!has(s, 'shadow')) return { npc: 'noa', label: '포탈 앞 노아에게 그림자 이야기하기' };
  if (!has(s, 'fist')) return { npc: 'bawi', label: '북문 기사 바위 찾아가기' };
  return null;
}

/** 북문이 막혀 있나 */
export function gateLocked(s: Ch0State | null): boolean {
  return !!s && !!s.fresh && !s.done;
}

/** 지금 이 NPC 와 이야기하면 나오는 0장 장면 (없으면 평소 대사) */
export function sceneForNpc(npcId: string, s: Ch0State | null): Scene | null {
  if (!s || s.done) return null;
  switch (npcId) {
    case 'kong':
      return s.clues?.includes('kong') ? null : scene('kong');
    case 'maru':
      return has(s, 'where') ? null : scene('maru');
    case 'noa':
      if (has(s, 'shadow')) return null;
      return has(s, 'where') ? scene('noa') : scene('noaEarly');
    case 'bawi':
      if (has(s, 'fist')) return null;
      return has(s, 'shadow') ? scene('bawi') : scene('bawiEarly');
    default:
      return null;
  }
}

/** 마을의 살펴볼 곳 (E) */
export function sceneForSpot(spot: 'board' | 'well' | 'book'): Scene {
  return scene(spot);
}

/** 접속했을 때 바로 나오는 장면: 서울에 다녀왔으면 달래가 마중 */
export function sceneOnArrive(s: Ch0State | null, visits: number): Scene | null {
  if (!s || s.done) return null;
  if ((s.notes.body ?? 0) < 2 && s.since !== undefined && visits > s.since) return scene('return');
  return null;
}

/**
 * 장면이 끝났다: 수첩·단서를 채운다. 새로 알아낸 수첩 줄을 돌려준다 (화면에 "수첩에 적었다").
 * choice = 마지막 줄에서 고른 값
 */
export function finishScene(s: Ch0State, id: SceneId, choice?: string): NoteId[] {
  const got: NoteId[] = [];
  const note = (n: NoteId, lv: 1 | 2) => {
    if ((s.notes[n] ?? 0) >= lv) return;
    s.notes[n] = lv;
    got.push(n);
  };
  const clue = (c: ClueId) => {
    s.clues ??= [];
    if (!s.clues.includes(c)) s.clues.push(c);
  };
  switch (id) {
    case 'return':
      note('body', 2);
      break;
    case 'kong':
      clue('kong');
      break;
    case 'maru':
      if (choice === 'doubt' || choice === 'wonder' || choice === 'survive') s.choice = choice;
      break;
    case 'maruAfter':
      note('where', 2);
      note('home', 2);
      break;
    case 'noa':
      note('shadow', 1);
      break;
    case 'bawiHit':
      note('fist', 2);
      break;
    case 'end':
      s.done = true;
      break;
    case 'board':
    case 'well':
    case 'book':
      clue(id);
      break;
  }
  return got;
}

/** 이 장면 다음에 바로 이어지는 장면 (마루의 대답 · 허수아비 · 수첩이 다 차면 마무리) */
export function nextScene(s: Ch0State, id: SceneId): SceneId | null {
  if (id === 'maru') return 'maruAfter';
  if (id === 'bawi') return 'bawiHit';
  if (id !== 'end' && !s.done && notesComplete(s)) return 'end';
  return null;
}

export function scene(id: SceneId, s?: Ch0State | null): Scene {
  const lines = SCRIPTS[id];
  if (id === 'maruAfter') return { id, lines: [...MARU_REPLY[s?.choice ?? 'survive'], ...lines] };
  return { id, lines, choices: CHOICES[id] };
}

/** 깨어난 직후 혼잣말: 휴대폰 시계와 여관 벽시계 (실제 한국 시각) — 그래도 게임이라고 넘긴다 */
export function wakeScene(hhmm: string): Scene {
  return {
    id: 'wake',
    lines: [
      { who: 'me', mood: '고민', text: `휴대폰… 신호는 없는데 시계는 가네. ${hhmm}.` },
      { who: 'me', mood: '놀람', text: `여관 벽에 걸린 시계도 ${hhmm}… 게임 시간이 현실 시간이랑 연동되나 봐. 디테일 미쳤다.` },
      { who: 'me', mood: '고민', text: '메뉴도 안 열리고 로그아웃 버튼도 숨겨져 있고… 일단 모르는 건 적어 두자. 퀘스트 로그 대신.' },
    ],
  };
}

const CHOICES: Partial<Record<SceneId, { label: string; value: string }[]>> = {
  maru: [
    { label: '😏 NPC 대사치곤 설정이 깊네요', value: 'doubt' },
    { label: '✨ 그래도 신기하긴 해요', value: 'wonder' },
    { label: '✊ 일단 퀘스트나 깰게요', value: 'survive' },
  ],
  bawi: [{ label: '👊 허수아비를 쳐 본다', value: 'hit' }],
};

const MARU_REPLY: Record<Ch0Choice, ScriptLine[]> = {
  doubt: [{ who: 'maru', text: '설정이라… 허허, 저편 사람들은 다들 그 얼굴로 시작하지. 믿는 건 천천히 해도 되네. 땅은 도망가지 않으니까.' }],
  wonder: [{ who: 'maru', text: '신기하다라… 그 마음 잃지 말게. 이 세계는 그런 눈을 가진 사람에게 더 많은 걸 보여 주거든.' }],
  survive: [{ who: 'maru', text: '퀘스트라… 뭐라 부르든 좋네. 여기선 살아 있는 게 제일 먼저야. 나머지는 살아 있어야 알 수 있지.' }],
};

const SCRIPTS: Record<SceneId, ScriptLine[]> = {
  wake: [],
  return: [
    { who: 'me', mood: '고민', text: '서울 내 방에 갔다 왔어. 다시 켜니까 이 포탈 앞이네.' },
    { who: 'dallae', text: '돌아왔네? 기다렸어. 네가 없는 동안 여기도 딱 그만큼 시간이 흘렀어.' },
    { who: 'me', mood: '웃음', text: '아~ 실시간 서버구나. 내가 꺼도 월드는 계속 돌아가는 거. 요즘 MMO는 다 그렇지.' },
    { who: 'dallae', text: '…무슨 말인지 하나도 모르겠지만, 몸조심해. 저편 사람도 다치면 진짜로 아픈 거야.' },
    { who: 'me', mood: '고민', text: '(진짜로 아프다… 그 말만은 자꾸 걸리네. 아니야, 그냥 대사겠지.)' },
  ],
  kong: [
    { who: 'kong', text: '우와! 형아… 아니 누나? 아무튼! 저편 사람이지? 하늘에서 떨어졌다는 그 사람!' },
    { who: 'me', mood: '놀람', text: '저편 사람…? 이 게임은 플레이어를 그렇게 부르나 보네.' },
    { who: 'kong', text: '하늘 너머 저편에서 온 사람! 백 년에 한 명 올까 말까래. 근데 요즘은 자꾸 와. 신기하지?' },
    { who: 'kong', text: '저편엔 하늘까지 닿는 건물이 있다며? 불 없이 밝은 등도 있고, 손바닥만 한 판으로 얘기도 한다며!' },
    { who: 'me', mood: '웃음', text: '…휴대폰 말하는 거구나. 이것 봐. 꼬마 NPC 반응이 이렇게 자연스럽다니, AI 진짜 잘 만들었네.' },
    { who: 'kong', text: '에이아이가 뭐야? 아무튼 우와아아…! 나중에 나도 저편에 데려가 줘! 약속!' },
    { who: 'kong', text: '아, 그리고 촌장님은 동쪽 큰 집, 노아 언니는 포탈 앞, 바위 아저씨는 북문에 있어. 내가 마을 대장이라 다 알아!' },
  ],
  maru: [
    { who: 'maru', text: '오, 자네가 달래가 업어 왔다는 저편 사람이로군. 이 마을 촌장 마루라네. 몸은 좀 괜찮은가?' },
    { who: 'me', mood: '고민', text: '아직 좀 쑤셔요. 근데 촌장님, 여긴 무슨 맵이에요? 튜토리얼 마을 같은 거예요?' },
    { who: 'maru', text: '맵이라… 저편 사람들은 다들 그렇게 말하더군. 하지만 우리에겐 대대로 살아온 땅이라네.' },
    { who: 'maru', text: '자네들이 사는 곳을 "앞면"이라 한다면, 여긴 그 "뒷면"이야. 앞면 사람들이 살며 흘린 기운이 오랜 세월 쌓여 생긴 세계지.' },
    { who: 'maru', text: '웃고, 울고, 밥 짓고, 걷고… 그런 하루하루가 이쪽으로 스며들어 땅이 되고, 바람이 되고, 우리가 됐다네.' },
    { who: 'me', mood: '놀람', text: '서울의 뒷면… 세계관 설정 꽤 깊네요. 그래서, 로그아웃은 어떻게 해요?' },
    { who: 'maru', text: '자네가 온 길은 아직 열려 있어. 사람마다 길이 다르게 열린다지만, 자네 길은 그 "컴퓨터"라는 것이겠지.' },
    { who: 'me', mood: '웃음', text: '거 봐요, 로그아웃 되잖아요. 게임 맞네.' },
    { who: 'maru', text: '…허허. 그건 그렇고, 자네는 지금 이 모든 게 어떻게 느껴지나?' },
  ],
  maruAfter: [
    { who: 'maru', text: '자, 이걸 받게. 임시 신분패야. 마을 사람들이 자네를 손님으로 대해 줄 걸세.' },
    { who: 'me', mood: '웃음', text: '(아이템 획득 연출도 없네. 인벤토리엔 언제 들어가지?)' },
    { who: 'maru', text: '포탈 앞의 노아를 찾아가 보게. 저편 사람들을 맞이하는 아이인데, 이 세계의 "힘"에 대해선 나보다 훨씬 잘 안다네.' },
  ],
  noaEarly: [
    { who: 'noa', text: '어머, 깨어났네요. 달래 언니가 많이 걱정했어요.' },
    { who: 'noa', text: '저랑 얘기하기 전에 촌장님께 먼저 인사드리고 와요. 동쪽 큰 집이에요. 이 마을 규칙이거든요.' },
  ],
  noa: [
    { who: 'noa', text: '촌장님께 인사드렸군요. 저는 노아. 저편 사람들을 맞이하고, 포탈을 지키는 일을 해요.' },
    { who: 'noa', text: '……잠깐만요. (노아가 주인공 주위를 한 바퀴 천천히 돈다)' },
    { who: 'noa', text: '이상하다. 당신한테서… 시간이 멈춘 냄새가 나요. 안개 숲에서 뭔가 만났죠?' },
    { who: 'me', mood: '화남', text: '그림자요! 대미지가 하나도 안 들어갔어요. 무적 판정 버그 같던데, 신고는 어디다 해요?' },
    { who: 'noa', text: '…신고요? 그게 뭔지는 몰라도, 그건 버그 같은 게 아니에요. 아는 사람이 아무도 없어요. 아무나 낼 수 있는 냄새가 아니에요.' },
    { who: 'noa', text: '이 세계의 모든 사람 안에는 "근(根)"이 있어요. 힘의 뿌리. 형, 력, 생, 심, 공, 시… 여섯 갈래로 뻗어 있죠.' },
    { who: 'me', mood: '고민', text: '근… 여섯 갈래. 속성 같은 거구나. 스탯 창은 어디서 보죠?' },
    { who: 'noa', text: '창이요? …당신 안에도 근은 분명 있어요. 아직 잠들어 있을 뿐. 깨우는 건 도와줄 수 있지만… 몸이 먼저 버텨야 해요.' },
    { who: 'noa', text: '북문의 바위 아저씨를 찾아가요. 거칠어 보여도 몸 쓰는 건 마을에서 제일이에요.' },
  ],
  bawiEarly: [
    { who: 'bawi', text: '어이, 벼랑에서 떨어졌다는 녀석이구나. 그 몸으로 어딜 나가려고?' },
    { who: 'bawi', text: '문 밖은 아직 안 돼. 촌장님이랑 노아부터 만나고 와. 그다음에 얘기하자.' },
  ],
  bawi: [
    { who: 'bawi', text: '노아가 보냈냐? …그래, 눈빛은 나쁘지 않네. 북문을 지키는 바위다.' },
    { who: 'me', mood: '화남', text: '아저씨, 저 이런 거 자신 있어요. 서울에서 격투 게임 랭크도 꽤 높았거든요.' },
    { who: 'bawi', text: '게임이 뭔진 몰라도 자신은 있나 보군. 그럼 저 허수아비 한번 쳐 봐. 전력으로.' },
  ],
  bawiHit: [
    { who: 'me', mood: '놀람', text: '…어? 분명 제대로 들어갔는데. 허수아비가 거의 안 흔들려. 히트 판정이 이상한데?' },
    { who: 'bawi', text: '봤지? 앞면의 주먹은 여기서 반만 닿는다. 네 주먹엔 아직 이 세계의 힘이 실려 있지 않으니까.' },
    { who: 'bawi', text: '고블린 정도는 그 주먹으로도 어떻게든 돼. 하지만 안개 숲 그 그림자 같은 건… 근을 깨우지 않으면 손도 못 대.' },
    { who: 'me', mood: '고민', text: '근을 깨운다… 레벨 1 너프에, 스킬 해금 퀘스트구나. 구조는 딱 RPG네.' },
  ],
  end: [
    { who: 'me', mood: '고민', text: '앞면, 뒷면, 근… 다들 엄청 진지하게 말하네. 세계관 하나는 제대로 짰다.' },
    { who: 'me', mood: '울음', text: '아픈 건 좀 너무하지만… 요즘 게임은 원래 이 정도겠지. 로그아웃도 되잖아.' },
    { who: 'bawi', text: '…아직도 꿈이나 놀이라고 생각하는 얼굴이군.' },
    { who: 'bawi', text: '뭐, 좋다. 믿든 말든 몸은 만들어 주지. 근은 그다음에 노아가 깨워 줄 거다.' },
    { who: 'me', mood: '웃음', text: '튜토리얼 다음 단계네요. 좋아요, 수련 퀘스트 받을게요!' },
    { who: 'bawi', text: '(작게) …저편 사람들은 다 그렇게 말하지. 처음엔.' },
  ],
  board: [
    { who: 'me', mood: '고민', text: '마을 의뢰 게시판이다. 종이마다 처음 보는 글자가 빼곡해.' },
    { who: 'me', mood: '놀람', text: '…근데 읽혀. 「북문 밖 고블린 퇴치 · 보수 은화 세 닢」. 글자는 모르는데 뜻이 그냥 머리에 들어와.' },
    { who: 'me', mood: '웃음', text: '자동 번역 기능인가 보네. 편하다. 이런 것까지 신경 썼구나.' },
  ],
  well: [
    { who: 'me', mood: '고민', text: '우물 바닥이 푸르게 빛나. 콩이가 말한 이상한 빛이 이건가.' },
    { who: 'me', mood: '놀람', text: '물에 비친 하늘에… 방금 아주 높은 건물 같은 윤곽이 흔들렸어. 낯익은 모양이었는데.' },
    { who: 'me', mood: '고민', text: '…그래픽 버그인가. 다시 보니 그냥 별빛뿐이야.' },
  ],
  book: [
    { who: 'me', mood: '고민', text: '"달빛 여관" 방명록. 여기 묵었던 사람들 이름이 적혀 있나 봐.' },
    { who: 'me', mood: '놀람', text: '맨 앞 장, 엄청 오래된 이 한 줄만 글씨체가 달라. 이건… 우리 쪽 글씨 같은데?' },
    { who: 'me', mood: '웃음', text: '번져서 안 읽히네. 개발자가 숨겨 놓은 이스터에그인가 보다.' },
  ],
};
