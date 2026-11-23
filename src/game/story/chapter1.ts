import type { ScriptLine } from '../data/prologueScript';
import type { PlayerProfile } from '../core/profile';

/**
 * 1장 「기운 수련」: 0장 내내 "잘 만든 게임"이라고 믿던 주인공이, 수련 사이사이 터지는 사건들로 핑계를 하나씩 잃고
 * 마지막에 "이건 게임이 아니야"를 받아들인다. 순수 로직 + 대사 (그리기·미니게임은 FieldView · TrainingGame).
 *
 * 순서 (step):
 *  start   바위의 몸 수련 ① 버티기 (미니게임) → 마지막 한 대는 세게 맞는다
 *  toSeoul 로그아웃하면 서울 내 방: 거울 속 팔에 같은 자리 멍 (사건 A — "햅틱이겠지" 무너짐)
 *  back    바위의 몸 수련 ② 숨 고르기 (미니게임) → 땅이 울리고 포탈이 꺼져 로그아웃이 안 된다 (사건 B — "로그아웃 되잖아")
 *  noa     노아의 근 감정: 서울에서 실제로 해 온 생활(플레이 기록)을 맞힌다 (사건 C — "NPC AI") → 내 근이 정해진다
 *  doha    벤치 옆 낯선 사람 도하: 지하철 마지막 칸으로 온 먼저 온 저편 사람 (사건 D — "다 설정 대사")
 *  quest   북문 밖 고블린 세 마리 → 몰래 따라온 콩이가 다친다 (사건 E — "NPC니까") → 근이 처음 터진다 → 기술 이름 짓기
 *  badge   촌장 마루의 정식 길드 배지 → "이건… 게임이 아니야"
 *  done
 */

export type RootId = '형' | '력' | '생' | '심' | '공' | '시';
export type Ch1Step = 'start' | 'toSeoul' | 'back' | 'noa' | 'doha' | 'quest' | 'badge' | 'done';

export interface Ch1State {
  step: Ch1Step;
  /** 노아가 읽어 낸 내 근 */
  root?: RootId;
  /** 첫 발현에 붙인 이름 */
  skillName?: string;
  /** 고블린 의뢰: 잡은 수 */
  questKills?: number;
  /** 미니게임 점수 (막은 수 · 맞춘 숨) — 지금은 기록만 */
  guard?: number;
  breath?: number;
}

export const QUEST_GOAL = 3;

export type Ch1SceneId = 'intro' | 'guarded' | 'bruise' | 'breath' | 'quake' | 'read' | 'doha' | 'scream' | 'awaken' | 'named' | 'badge' | 'final';

export interface Ch1Scene {
  id: Ch1SceneId;
  lines: ScriptLine[];
}

/** 장면이 끝난 뒤 할 일: 미니게임 · 근 폭발 연출 · 이름 짓기 · 서울로 나가기, 다음 장면, 넘어갈 단계 */
export interface Ch1After {
  effect?: 'guard' | 'breath' | 'burst' | 'name' | 'exit';
  next?: Ch1SceneId;
  step?: Ch1Step;
}

const AFTER: Record<Ch1SceneId, Ch1After> = {
  intro: { effect: 'guard', next: 'guarded' },
  guarded: { step: 'toSeoul' },
  bruise: { step: 'back', effect: 'exit' },
  breath: { effect: 'breath', next: 'quake' },
  quake: { step: 'noa' },
  read: { step: 'doha' },
  doha: { step: 'quest' },
  scream: { effect: 'burst', next: 'awaken' },
  awaken: { effect: 'name', next: 'named' },
  named: { step: 'badge' },
  badge: { next: 'final' },
  final: { step: 'done' },
};

export function afterScene(id: Ch1SceneId): Ch1After {
  return AFTER[id];
}

/** 장면이 끝났다: 단계를 넘긴다 */
export function finishCh1(s: Ch1State, id: Ch1SceneId): Ch1After {
  const a = AFTER[id];
  if (a.step) s.step = a.step;
  if (a.step === 'quest') s.questKills = 0;
  return a;
}

/** 0장을 마친 사람은 1장을 시작한다 */
export function startCh1(): Ch1State {
  return { step: 'start' };
}

/** 지금 이 NPC 와 이야기하면 나오는 1장 장면 (없으면 평소 대사) */
export function ch1SceneForNpc(npcId: string, s: Ch1State | null, profile: PlayerProfile): Ch1Scene | null {
  if (!s) return null;
  const want: Partial<Record<Ch1Step, [string, Ch1SceneId]>> = {
    start: ['bawi', 'intro'],
    back: ['bawi', 'breath'],
    noa: ['noa', 'read'],
    doha: ['doha', 'doha'],
    badge: ['maru', 'badge'],
  };
  const w = want[s.step];
  return w && w[0] === npcId ? ch1Scene(w[1], s, profile) : null;
}

/** 고블린을 잡았다: 의뢰 중이면 센다. 다 잡은 순간 true (콩이 비명 장면) */
export function countQuestKill(s: Ch1State | null, monsterId: string): boolean {
  if (!s || s.step !== 'quest' || monsterId !== 'goblin') return false;
  const before = s.questKills ?? 0;
  if (before >= QUEST_GOAL) return false;
  s.questKills = before + 1;
  return s.questKills === QUEST_GOAL;
}

/** 로그아웃 버튼을 눌렀을 때: 서울에 다녀오는 차례면 서울 내 방 장면부터 */
export function sceneOnLogout(s: Ch1State | null): Ch1SceneId | null {
  return s?.step === 'toSeoul' ? 'bruise' : null;
}

/** 다음 할 일 (수첩 · 자동진행) */
export function ch1Objective(s: Ch1State | null): { kind: 'npc'; npc: string; label: string } | { kind: 'logout' | 'hunt'; label: string } | null {
  if (!s) return null;
  switch (s.step) {
    case 'start':
      return { kind: 'npc', npc: 'bawi', label: '북문의 바위에게 몸 수련 받기' };
    case 'toSeoul':
      return { kind: 'logout', label: '로그아웃해서 서울 집에 다녀오기' };
    case 'back':
      return { kind: 'npc', npc: 'bawi', label: '바위에게 두 번째 수련 받기' };
    case 'noa':
      return { kind: 'npc', npc: 'noa', label: '노아에게 근 감정 받기' };
    case 'doha':
      return { kind: 'npc', npc: 'doha', label: '벤치 옆 낯선 사람에게 말 걸기' };
    case 'quest':
      return { kind: 'hunt', label: `북문 밖 고블린 잡기 (${Math.min(s.questKills ?? 0, QUEST_GOAL)}/${QUEST_GOAL})` };
    case 'badge':
      return { kind: 'npc', npc: 'maru', label: '촌장 마루에게 돌아가기' };
    default:
      return null;
  }
}

// ───────────────────────── 근 감정: 서울 생활 기록 → 근

export interface RootReading {
  root: RootId;
  /** 주인공이 놀라는 실제 기록 한마디 */
  fact: string;
  noa: string;
}

/**
 * 서울에서 실제로 해 온 생활(플레이 기록)으로 근을 정한다. 가장 많이 해 온 쪽.
 * 시(時)는 아주 드문 근이라 생활로는 정해지지 않는다 (이야기에서만).
 */
export function readRoot(p: PlayerProfile): RootReading {
  const fish = Object.values(p.fishing?.dex ?? {}).reduce((a, d) => a + (d?.n ?? 0), 0);
  const shifts = Object.values(p.jobs ?? {}).reduce((a, j) => a + (j?.shifts ?? 0), 0);
  const pets = p.pets?.list?.length ?? 0;
  const friends = Object.values(p.npcs ?? {}).filter((b) => (b as { affinity?: number })?.affinity && (b as { affinity: number }).affinity > 0).length;
  const wins = Object.values(p.cpu?.record ?? {}).reduce((a, r) => a + (r?.w ?? 0), 0);
  const fights = (p.kills ?? 0) + wins * 3;
  const score: [RootId, number][] = [
    ['력', fights],
    ['공', fish * 3],
    ['형', shifts * 4],
    ['생', pets * 25],
    ['심', friends * 10],
  ];
  score.sort((a, b) => b[1] - a[1]);
  const root = score[0][1] > 0 ? score[0][0] : '력';
  switch (root) {
    case '공':
      return { root, fact: `한강에서 낚시한 거… ${fish}마리 잡은 것까지 안다고?`, noa: '손에서 강바람 냄새가 나요. 물가에 앉아 멀리 줄을 던지고, 오래 기다렸죠?' };
    case '형':
      return { root, fact: `알바 ${shifts}번 뛴 걸… 그걸 어떻게 알아?`, noa: '손끝에 일한 흔적이 배어 있어요. 무언가를 나르고, 다듬고, 쌓아 온 사람.' };
    case '생':
      return { root, fact: `우리 집 펫들… ${pets}마리 키우는 걸 어떻게 알아?`, noa: '작은 숨결 냄새가 나요. 누군가를 먹이고, 씻기고, 돌봐 온 사람이죠?' };
    case '심':
      return { root, fact: `동네 사람 ${friends}명이랑 친해진 것까지…?`, noa: '당신 안에 다른 사람 목소리가 많이 남아 있어요. 사람들과 오래 마음을 나눴죠?' };
    default:
      return {
        root: '력',
        fact: fights > 0 ? `싸운 거… 몬스터 ${p.kills ?? 0}마리, 대전 ${wins}번 이긴 것까지?` : '격투 게임 랭크 올리느라 밤새운 것까지…?',
        noa: '주먹에 오래 겨뤄 온 사람 냄새가 배어 있어요. 누군가와 수없이 맞붙어 봤죠?',
      };
  }
}

export const ROOT_INFO: Record<RootId, { hanja: string; desc: string; color: string; suggest: string }> = {
  형: { hanja: '形', desc: '물질의 뿌리. 만지고 빚고 굳히는 힘.', color: '#e0b25a', suggest: '굳은 손' },
  력: { hanja: '力', desc: '힘과 움직임의 뿌리. 밀고 치고 내달리는 힘.', color: '#ff6a4a', suggest: '첫 주먹' },
  생: { hanja: '生', desc: '생명과 몸의 뿌리. 살리고 북돋는 힘.', color: '#6ad68a', suggest: '돌보는 숨' },
  심: { hanja: '心', desc: '마음과 감각의 뿌리. 느끼고 잇는 힘.', color: '#c08aff', suggest: '마음 울림' },
  공: { hanja: '空', desc: '공간과 거리의 뿌리. 멀고 가까움을 다루는 힘.', color: '#6ac8ff', suggest: '한 걸음 너머' },
  시: { hanja: '時', desc: '시간의 뿌리. 아주 드물다.', color: '#f2f2f2', suggest: '멈춘 순간' },
};

/** 기술 이름: 앞뒤 공백 빼고 1~12자 */
export function cleanSkillName(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= 12 ? t : null;
}

// ───────────────────────── 대사

export function ch1Scene(id: Ch1SceneId, s: Ch1State, profile: PlayerProfile): Ch1Scene {
  if (id === 'read') {
    const r = readRoot(profile);
    s.root = r.root;
    const info = ROOT_INFO[r.root];
    return {
      id,
      lines: [
        { who: 'noa', text: '몸이 근을 버틸 만큼 단단해졌네요. 자, 손 줘 봐요. 눈 감고.' },
        { who: 'noa', text: '……(노아의 손끝에서 희미한 빛이 번져, 주인공의 손목을 타고 올라온다)' },
        { who: 'noa', text: r.noa },
        { who: 'me', mood: '놀람', text: r.fact },
        { who: 'me', mood: '고민', text: '…계정 연동? 아니, 그런 걸로 설명이 돼? 이 사람은 그냥 손만 잡았을 뿐인데.' },
        { who: 'noa', text: `당신의 근은 「${r.root}(${info.hanja})」. ${info.desc}` },
        { who: 'noa', text: '근은 그 사람이 살아온 모양대로 피어나요. 그래서 같은 근이라도 사람마다 다 달라요. 오직 당신만의 힘이에요.' },
        { who: 'noa', text: '아직은 잠들어 있어요. 무언가가 정말 간절해지는 순간, 처음으로 깨어날 거예요.' },
        { who: 'noa', text: '…아, 그리고 여관 쪽 벤치에 있는 사람. 한번 만나 봐요. 당신이랑 같은 데서 왔어요.' },
      ],
    };
  }
  if (id === 'named') {
    const name = s.skillName ?? ROOT_INFO[s.root ?? '력'].suggest;
    return {
      id,
      lines: [
        { who: 'noa', text: `「${name}」… 좋은 이름이에요. 이제 그 힘은 당신이 부르면 대답할 거예요.` },
        { who: 'kong', text: '…고마워. 진짜, 진짜 무서웠어. 흐윽…' },
        { who: 'me', mood: '울음', text: '울지 마, 콩이야. 다친 데는…? 달래 언니한테 가자. 내가 업어 줄게.' },
        { who: 'noa', text: '콩이는 제가 데려갈게요. 당신은 촌장님께 가 봐요. 다 보셨을 거예요.' },
      ],
    };
  }
  return { id, lines: SCRIPTS[id] };
}

const SCRIPTS: Record<Exclude<Ch1SceneId, 'read' | 'named'>, ScriptLine[]> = {
  intro: [
    { who: 'bawi', text: '왔냐. 약속대로 몸부터 만든다.' },
    { who: 'bawi', text: '내가 이 목검을 휘두르면, 막아. 다섯 번이다. 눈 감지 말고, 끝까지 봐.' },
    { who: 'me', mood: '웃음', text: '타이밍 맞춰 누르는 미니게임이네요. 이런 거 자신 있어요.' },
  ],
  guarded: [
    { who: 'me', mood: '울음', face: 'hurt', text: '아야야…! 마지막 건 진짜 세게 쳤잖아요! 팔이 저려…' },
    { who: 'bawi', text: '일부러 그랬다. 맞아 봐야 아는 것도 있지.' },
    { who: 'bawi', text: '오늘은 여기까지. 서울 집에도 한번 들렀다 와. 몸은 쉬어야 큰다.' },
    { who: 'me', mood: '고민', text: '(햅틱 진동이 이렇게까지 아플 수 있나… 아니, 요즘 기술이면 되겠지.)' },
  ],
  bruise: [
    { who: 'me', mood: '고민', text: '(서울, 내 방. 의자에서 일어나자 팔이 욱신거린다)' },
    { who: 'me', mood: '놀람', text: '…어? 팔에 멍이 들었어. 바위 아저씨 목검에 맞은 자리랑 똑같은 데에.' },
    { who: 'me', mood: '울음', text: '햅틱 진동으로 멍이 들 리가 없잖아… 나 책상에 부딪힌 적도 없는데.' },
    { who: 'me', mood: '고민', text: '…피곤해. 몸이 진짜로 운동한 것처럼 무거워. 이거, 대체 뭐야.' },
  ],
  breath: [
    { who: 'bawi', text: '멍은 좀 어떠냐.' },
    { who: 'me', mood: '고민', text: '…서울에서도 그대로였어요. 같은 자리에. 햅틱이 멍까지 만들진 않잖아요.' },
    { who: 'bawi', text: '햅틱인지 뭔지는 모르겠고. 오늘은 숨이다.' },
    { who: 'bawi', text: '들이쉴 땐 땅 기운을 발끝부터 끌어올리고, 내쉴 땐 몸 끝까지 보내. 원이 커질 때 들이쉬고, 작아질 때 내쉬어.' },
  ],
  quake: [
    { who: 'me', mood: '놀람', text: '…어? 땅이 울려. 뭐야, 지진?!' },
    { who: 'bawi', text: '숙여! 북쪽 틈이 운다!' },
    { who: 'noa', text: '포탈이…! 포탈 빛이 꺼지고 있어요!' },
    { who: 'me', mood: '울음', text: '로그아웃… 로그아웃 버튼이 안 눌려…! 왜 안 돼, 왜!' },
    { who: 'me', mood: '울음', text: '나… 못 돌아가는 거야? 집에 못 가는 거야…?' },
    { who: 'noa', text: '괜찮아요, 제가 붙잡고 있어요…! 조금만, 조금만 버텨요…!' },
    { who: 'noa', text: '……휴. 다시 열렸어요. 가끔 이래요. 북쪽 틈이 크게 숨을 쉴 때면.' },
    { who: 'me', mood: '고민', text: '(손이 떨려… 게임이면, 로그아웃이 안 될 리가 없잖아.)' },
    { who: 'bawi', text: '오늘 수련은 여기까지. 노아, 이 녀석 근 좀 봐 줘라. 이제 몸은 버틸 거다.' },
  ],
  doha: [
    { who: 'doha', text: '…너도 저편에서 왔구나. 표정 보니 아직 반쯤은 게임이라고 생각하지?' },
    { who: 'me', mood: '놀람', text: '…그쪽도 플레이어예요? 아니, NPC가 이런 말까지 하나…' },
    { who: 'doha', text: '나 도하. 서울 사는 대학생이야. NPC 아니고.' },
    { who: 'doha', text: '난 컴퓨터로 안 왔어. 막차 지하철 마지막 칸에서 졸다가 눈 떴더니 여기였어. 석 달 전에.' },
    { who: 'me', mood: '놀람', text: '지하철…? 게임을 켜지도 않았는데 왔다고요?' },
    { who: 'doha', text: '길은 사람마다 다르게 열린대. 노아가 그러더라. 너는 컴퓨터, 나는 지하철 마지막 칸.' },
    { who: 'doha', text: '나도 처음엔 꿈인 줄 알았어. 그다음엔 몰래카메라, 그다음엔 게임. …다 아니더라.' },
    { who: 'doha', text: '여기서 다치면 서울에서도 아파. 여기서 보낸 시간은 서울에서도 똑같이 흘러.' },
    { who: 'doha', text: '쓰러지면 포탈 앞에서 깨어나긴 해. 근데 그게 언제까지 될지는… 아무도 몰라.' },
    { who: 'me', mood: '고민', text: '……' },
    { who: 'doha', text: '북문 밖 고블린 의뢰, 바위 아저씨가 너한테 맡긴다더라. 조심해. 걔네도 진짜로 물어.' },
  ],
  scream: [
    { who: 'me', mood: '웃음', text: '세 마리 끝! 의뢰 완료. 이 정도면 바위 아저씨도 인정하겠지.' },
    { who: 'kong', text: '꺄아아아악——!!' },
    { who: 'me', mood: '놀람', text: '콩이…?! 너 왜 문 밖에 있어!' },
    { who: 'kong', text: '몰래 따라왔는데… 고블린이… 다리가, 다리가 아파… 흐아앙…!' },
    { who: 'me', mood: '울음', text: '(피가 나. 울고 있어. 숨이 막 가빠지고…)' },
    { who: 'me', mood: '울음', text: 'NPC니까… 그냥 프로그램이니까… 아니야. 아니야, 아니라고!' },
    { who: 'me', mood: '화남', text: '콩이한테서 떨어져어어어——!!' },
  ],
  awaken: [
    { who: 'me', mood: '놀람', text: '…방금, 뭐였지. 몸 안에서 뭔가가 터져 나왔어.' },
    { who: 'noa', text: '봤어요. 저 멀리 포탈 앞에서도 느껴졌어요. 당신 근이 깨어났어요. 첫 발현이에요.' },
    { who: 'noa', text: '처음 피어난 힘엔 이름을 붙여 줘요. 이름이 있어야 다시 부를 수 있거든요.' },
  ],
  badge: [
    { who: 'maru', text: '콩이를 구했다지. 고맙네… 정말로 고맙네.' },
    { who: 'maru', text: '이건 정식 길드 배지일세. 이제 자네는 손님이 아니라 이 마을 사람이야.' },
    { who: 'me', mood: '고민', text: '촌장님. 저… 이제 알 것 같아요.' },
    { who: 'maru', text: '허허. 그 얼굴이면 됐네. 처음 왔을 때랑은 눈빛이 다르구먼.' },
  ],
  final: [
    { who: 'me', mood: '고민', text: '아팠던 것도, 서울까지 따라온 멍도, 닫혀 버린 포탈도, 내 서울 생활을 읽어 낸 손도.' },
    { who: 'me', mood: '울음', text: '그리고 콩이의 눈물도. 다 진짜였어.' },
    { who: 'me', mood: '놀람', text: '(…멀리 안개 숲 쪽에서, 누군가 지켜보는 시선이 느껴진다)' },
    { who: 'me', mood: '화남', text: '이건… 게임이 아니야.' },
  ],
};
