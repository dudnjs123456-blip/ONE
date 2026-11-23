import type { ScriptLine } from '../data/prologueScript';

/**
 * 0장 「저편에서 온 사람」 (프롤로그 다음, 수련 전): 벼랑 밑에서 구해져 깨어난 주인공이 "여긴 게임이 아니다"를 받아들이고
 * 이 세계를 알아 가는 과정. 의문 수첩의 ??? 를 마을 사람들과 이야기하며 하나씩 채운다. 순수 로직 + 대사 (그리기는 FieldView).
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
  { id: 'body', q: '이게 진짜 내 몸이야?', half: '아프다. 게임인데 진짜로 아프다.', full: '서울에서 보낸 만큼 여기도 시간이 흘렀다. 몸이 통째로 오간다.' },
  { id: 'where', q: '여기는 어디지?', full: '서울의 "뒷면". 서울 사람들이 살며 흘린 기운이 쌓여 생긴 세계.' },
  { id: 'home', q: '나 돌아갈 수 있어?', full: '내가 온 길은 아직 열려 있다. 로그아웃하면 서울 내 방으로.' },
  { id: 'shadow', q: '숲의 그림자는 뭐였지?', half: '노아: "시간이 멈춘 냄새". 정체는 아무도 모른다.', full: '' },
  { id: 'fist', q: '왜 내 주먹이 안 통했지?', full: '앞면의 주먹은 여기서 반만 닿는다. 내 안의 "근"을 깨워야 한다.' },
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

/** 깨어난 직후 혼잣말: 휴대폰 시계와 여관 벽시계 (실제 한국 시각) */
export function wakeScene(hhmm: string): Scene {
  return {
    id: 'wake',
    lines: [
      { who: 'me', mood: '고민', text: `휴대폰… 신호는 없는데 시계는 가네. ${hhmm}.` },
      { who: 'me', mood: '놀람', text: `여관 벽에 걸린 시계도 ${hhmm}… 서울이랑 시간이 똑같아.` },
      { who: 'me', mood: '고민', text: '모르는 게 너무 많아. 하나씩 적어 두자. 마을 사람들한테 물어보고, 이곳저곳 살펴보면서.' },
    ],
  };
}

const CHOICES: Partial<Record<SceneId, { label: string; value: string }[]>> = {
  maru: [
    { label: '😨 믿을 수 없어요', value: 'doubt' },
    { label: '✨ 신기해요', value: 'wonder' },
    { label: '✊ 일단 살아남아야죠', value: 'survive' },
  ],
  bawi: [{ label: '👊 허수아비를 쳐 본다', value: 'hit' }],
};

const MARU_REPLY: Record<Ch0Choice, ScriptLine[]> = {
  doubt: [{ who: 'maru', text: '허허, 당연하지. 저편 사람들은 다들 처음엔 그 얼굴을 하더군. 믿는 건 천천히 해도 되네.' }],
  wonder: [{ who: 'maru', text: '신기하다라… 그 마음 잃지 말게. 이 세계는 그런 눈을 가진 사람에게 더 많은 걸 보여 주거든.' }],
  survive: [{ who: 'maru', text: '좋은 대답이야. 여기선 그게 제일 먼저라네. 살아 있어야 나머지도 알 수 있지.' }],
};

const SCRIPTS: Record<SceneId, ScriptLine[]> = {
  wake: [],
  return: [
    { who: 'me', mood: '고민', text: '서울 내 방에 다녀왔어. 눈을 감았다 뜨니 다시 이 포탈 앞이야.' },
    { who: 'dallae', text: '돌아왔네? 기다렸어. 네가 없는 동안 여기도 딱 그만큼 시간이 흘렀어.' },
    { who: 'me', mood: '놀람', text: '…서울에서 보낸 시간만큼 여기도 흘렀다고? 그럼 이건 저장해 두고 끄는 게임이 아니잖아.' },
    { who: 'dallae', text: '저편 사람들은 몸째로 왔다 갔다 해. 그러니까 다치면 진짜 아픈 거야. 몸조심해.' },
  ],
  kong: [
    { who: 'kong', text: '우와! 형아… 아니 누나? 아무튼! 저편 사람이지? 하늘에서 떨어졌다는 그 사람!' },
    { who: 'me', mood: '놀람', text: '저편 사람…? 다들 나를 그렇게 부르네.' },
    { who: 'kong', text: '하늘 너머 저편에서 온 사람! 백 년에 한 명 올까 말까래. 근데 요즘은 자꾸 와. 신기하지?' },
    { who: 'kong', text: '저편엔 하늘까지 닿는 건물이 있다며? 불 없이 밝은 등도 있고, 손바닥만 한 판으로 얘기도 한다며!' },
    { who: 'me', mood: '웃음', text: '…휴대폰 말하는 거구나. 이거 봐, 여기선 신호가 안 잡히지만.' },
    { who: 'kong', text: '우와아아…! 나중에 나도 저편에 데려가 줘! 약속!' },
    { who: 'kong', text: '아, 그리고 촌장님은 동쪽 큰 집, 노아 언니는 포탈 앞, 바위 아저씨는 북문에 있어. 내가 마을 대장이라 다 알아!' },
  ],
  maru: [
    { who: 'maru', text: '오, 자네가 달래가 업어 왔다는 저편 사람이로군. 이 마을 촌장 마루라네. 몸은 좀 괜찮은가?' },
    { who: 'me', mood: '고민', text: '촌장님… 솔직히 하나도 모르겠어요. 여긴 대체 어디예요? 게임 속 아니에요?' },
    { who: 'maru', text: '게임이라… 저편 사람들은 다들 그렇게 말하더군. 하지만 우리에겐 대대로 살아온 땅이라네.' },
    { who: 'maru', text: '자네들이 사는 곳을 "앞면"이라 한다면, 여긴 그 "뒷면"이야. 앞면 사람들이 살며 흘린 기운이 오랜 세월 쌓여 생긴 세계지.' },
    { who: 'maru', text: '웃고, 울고, 밥 짓고, 걷고… 그런 하루하루가 이쪽으로 스며들어 땅이 되고, 바람이 되고, 우리가 됐다네.' },
    { who: 'me', mood: '놀람', text: '서울의… 뒷면. 그럼 저는 어떻게 돌아가요? 돌아갈 수는 있는 거죠?' },
    { who: 'maru', text: '걱정 말게. 자네가 온 길은 아직 열려 있어. 사람마다 길이 다르게 열린다지만, 자네 길은 그 "컴퓨터"라는 것이겠지.' },
    { who: 'maru', text: '그건 그렇고… 자네, 지금 이 모든 게 어떻게 느껴지나?' },
  ],
  maruAfter: [
    { who: 'maru', text: '자, 이걸 받게. 임시 신분패야. 마을 사람들이 자네를 손님으로 대해 줄 걸세.' },
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
    { who: 'me', mood: '울음', text: '그림자요. 주먹이 닿는 순간마다 하나도 안 들어갔어요. 그게 나타나니까 화면도 전부 꺼졌고…' },
    { who: 'noa', text: '…그게 뭔지는 저도 몰라요. 아는 사람이 없어요. 다만 아무나 낼 수 있는 냄새는 아니에요.' },
    { who: 'noa', text: '이 세계의 모든 사람 안에는 "근(根)"이 있어요. 힘의 뿌리. 형, 력, 생, 심, 공, 시… 여섯 갈래로 뻗어 있죠.' },
    { who: 'noa', text: '당신 안에도 분명 있어요. 아직 잠들어 있을 뿐. 깨우는 건 제가 도와줄 수 있지만… 몸이 먼저 버텨야 해요.' },
    { who: 'noa', text: '북문의 바위 아저씨를 찾아가요. 거칠어 보여도 몸 쓰는 건 마을에서 제일이에요.' },
  ],
  bawiEarly: [
    { who: 'bawi', text: '어이, 벼랑에서 떨어졌다는 녀석이구나. 그 몸으로 어딜 나가려고?' },
    { who: 'bawi', text: '문 밖은 아직 안 돼. 촌장님이랑 노아부터 만나고 와. 그다음에 얘기하자.' },
  ],
  bawi: [
    { who: 'bawi', text: '노아가 보냈냐? …그래, 눈빛은 나쁘지 않네. 북문을 지키는 바위다.' },
    { who: 'me', mood: '화남', text: '아저씨, 저 주먹엔 자신 있어요. 서울에서 격투 게임도 엄청 했고요.' },
    { who: 'bawi', text: '그래? 그럼 저 허수아비 한번 쳐 봐. 전력으로.' },
  ],
  bawiHit: [
    { who: 'me', mood: '놀람', text: '…어? 분명 제대로 들어갔는데. 허수아비가 거의 안 흔들려.' },
    { who: 'bawi', text: '봤지? 앞면의 주먹은 여기서 반만 닿는다. 네 주먹엔 아직 이 세계의 힘이 실려 있지 않으니까.' },
    { who: 'bawi', text: '고블린 정도는 그 주먹으로도 어떻게든 돼. 하지만 안개 숲 그 그림자 같은 건… 근을 깨우지 않으면 손도 못 대.' },
    { who: 'me', mood: '고민', text: '근을… 깨운다.' },
  ],
  end: [
    { who: 'me', mood: '고민', text: '게임인 줄 알았던 곳은 서울의 뒷면이었고, 아픈 것도, 흐르는 시간도 다 진짜였어.' },
    { who: 'me', mood: '화남', text: '그리고 지금의 나로는 그 그림자 앞에서 아무것도 못 해.' },
    { who: 'bawi', text: '그 얼굴 보니 마음은 정했나 보군. 좋아, 몸부터 만들어 주지. 근은 그다음에 노아가 깨워 줄 거다.' },
    { who: 'me', mood: '웃음', text: '…네! 살아남으려면, 배워야죠.' },
  ],
  board: [
    { who: 'me', mood: '고민', text: '마을 의뢰 게시판이다. 종이마다 처음 보는 글자가 빼곡해.' },
    { who: 'me', mood: '놀람', text: '…근데 읽혀. 「북문 밖 고블린 퇴치 · 보수 은화 세 닢」. 글자는 모르는데 뜻이 그냥 머리에 들어와.' },
    { who: 'me', mood: '고민', text: '이것도 게임 자막 같은 건가…? 아니면 내 안에서 뭔가가 읽어 주고 있는 건가.' },
  ],
  well: [
    { who: 'me', mood: '고민', text: '우물 바닥이 푸르게 빛나. 콩이가 말한 이상한 빛이 이건가.' },
    { who: 'me', mood: '놀람', text: '물에 비친 하늘에… 방금 아주 높은 건물 같은 윤곽이 흔들렸어. 낯익은 모양이었는데.' },
    { who: 'me', mood: '고민', text: '…잘못 봤나. 다시 보니 그냥 별빛뿐이야.' },
  ],
  book: [
    { who: 'me', mood: '고민', text: '"달빛 여관" 방명록. 여기 묵었던 사람들 이름이 적혀 있나 봐.' },
    { who: 'me', mood: '놀람', text: '맨 앞 장, 엄청 오래된 이 한 줄만 글씨체가 달라. 이건… 우리 쪽 글씨 같은데?' },
    { who: 'me', mood: '고민', text: '번져서 읽을 수가 없어. 나보다 훨씬 먼저 온 저편 사람이 있었던 걸까.' },
  ],
};
