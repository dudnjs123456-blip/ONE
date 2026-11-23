import type { PlayerMood } from './npcs';

/**
 * 차원 프롤로그 대사. who: 'me' = 나 · 'beast' = 정체 모를 그림자 · 그 밖엔 경계 마을 NPC id (data/village).
 * mood 는 내 초상화 표정 (그림이 있는 몸만 바뀐다).
 * 대사가 나올 땐 언제나 말하는 사람 초상화가 같이 나온다 (절대 조건).
 */
export interface ScriptLine {
  who: string;
  text: string;
  mood?: PlayerMood;
  /** 이야기 장면 전용 표정 그림 (data/portraits STORY_FACES). 예: hurt = 떨어져 처박힌 직후 */
  face?: string;
}

export const PROLOGUE_SCRIPT = {
  /** 빛기둥 속에서 나타난 직후: 아직 진짜 게임이라고 믿는다 */
  wake: [
    { who: 'me', mood: '놀람', text: '…오. 오오오? 방금 화면이 하얘지더니… 나 지금 숲 한가운데 서 있는 거야?' },
    { who: 'me', mood: '웃음', text: '와… 그래픽 미쳤다. 바람 냄새까지 나는 것 같아. VR 기계도 안 썼는데 이게 된다고?' },
    { who: 'me', mood: '웃음', text: '커뮤니티 후기가 과장이 아니었네. "진짜 그 세계에 들어간 것 같다"더니 진짜잖아 ㅋㅋ' },
    { who: 'me', mood: '고민', text: '퀘스트는… "안개 숲을 벗어나라". 미니맵도 있고, 체력 바도 있고. 튜토리얼인가 보다.' },
    { who: 'me', mood: '기본', text: '좋아, 일단 길 따라 가 보자. 첫 퀘스트부터 깨야지!' },
  ] as ScriptLine[],
  /** 등 뒤 안개 속에서 그림자가 나타난다 (게임 화면이 지지직 흔들리기 시작한다) */
  encounter: [
    { who: 'me', mood: '놀람', text: '…어? 방금 화면이 지지직거렸는데. 렉인가?' },
    { who: 'beast', text: '그르르르르…' },
    { who: 'me', mood: '놀람', text: '뭐야, 몬스터 등장 연출? …근데 이름표가 "???"야. 레벨도 안 떠.' },
    { who: 'beast', text: '크아아아아아——!!' },
    { who: 'me', mood: '울음', text: '튜토리얼 몹이 왜 이렇게 커?! 일단 도망! (Shift + 방향키로 달리기)' },
  ] as ScriptLine[],
  /** 막다른 벼랑 (퀘스트 창·미니맵은 이미 꺼졌다) */
  cliff: [
    { who: 'me', mood: '놀람', text: '헉… 헉… 길이 끊겼어. 막다른 벼랑이야!' },
    { who: 'me', mood: '고민', text: '퀘스트 창도 미니맵도 꺼져 버렸어… 버그인가? 아래엔 안개 사이로 불빛이… 마을?' },
    { who: 'beast', text: '그르르르… (한 걸음씩 다가온다)' },
    { who: 'me', mood: '화남', text: '…뭐, 어차피 게임이잖아. 떨어져 봤자 다시 시작하겠지.' },
  ] as ScriptLine[],
  /** 맞서 본 뒤: 꿈쩍도 하지 않는다 */
  cornered: [
    { who: 'me', mood: '화남', text: '뭐야, 대미지가 하나도 안 들어가잖아! 무적 몹이야? 밸런스 완전 망겜이네.' },
    { who: 'beast', text: '크르르르르…!!' },
    { who: 'me', mood: '고민', text: '…게임이니까 괜찮아. 떨어지면 리스폰이겠지. 뛴다!' },
  ] as ScriptLine[],
};

/** 벼랑 밑에서 구해 준 뒤 경계 마을 여관 앞에서 깨어난다 (FieldView 에서) */
export const RESCUE_SCRIPT: ScriptLine[] = [
  { who: 'dallae', text: '어머, 눈 떴다! 다행이야… 정말 다행이야.' },
  { who: 'me', mood: '울음', face: 'hurt', text: '으… 리스폰 지점인가…? 근데 화면이 왜 이렇게 깨끗해. 체력 바도, 미니맵도 없어.' },
  { who: 'me', mood: '놀람', text: '메뉴… 메뉴 창 어떻게 열지? ESC, Tab… 아무것도 안 떠.' },
  { who: 'dallae', text: '얘, 허공에다 뭘 그렇게 더듬어? 움직이지 마, 아직 상처에 약을 바르는 중이야.' },
  { who: 'me', mood: '울음', face: 'hurt', text: '아, 아야야…! …아파? 게임인데 왜 진짜로 아픈 거야…?' },
  { who: 'dallae', text: '벼랑에서 떨어졌으니 당연히 아프지. 강가에 빨래하러 갔다가, 벼랑 밑 물웅덩이에 쓰러져 있는 너를 업어 왔어.' },
  { who: 'dallae', text: '여긴 경계 마을이야. 그 높은 데서 떨어졌는데 살아 있다니… 너 혹시, "저편"에서 온 사람이야?' },
  { who: 'me', mood: '고민', text: '저편…? 난 그냥 서울 내 방에서 요즘 유행한다는 게임을 켰을 뿐인데…' },
  { who: 'dallae', text: '역시. 가끔 그런 사람들이 와. 다들 같은 이름을 말하더라. "디멘션"이라던가.' },
  { who: 'me', mood: '놀람', text: '…게임 캐릭터가 게임 이름을 안다고? 이거, 그냥 엄청 잘 만든 게임… 맞지?' },
  { who: 'dallae', text: '게임이 뭔지는 모르겠지만, 우리한텐 그냥 사는 곳인걸. 그보다… 안개 숲에서 검은 그림자 못 봤어?' },
  { who: 'me', mood: '울음', text: '봤어…! 주먹이 하나도 안 통하는 괴물이었어. 그게 나타나니까 화면이 다 꺼졌고…' },
  { who: 'dallae', text: '…이름 없는 그림자. 마을 사람들은 그걸 그렇게 불러. 다시는 그 숲에 가면 안 돼.' },
  { who: 'dallae', text: '자세한 건 포탈 앞에 있는 노아한테 물어봐. 저편 사람들을 맞이하는 애야. 마을 한가운데 빛나는 문 앞에 있어.' },
  { who: 'me', mood: '고민', text: '…아픈 것도, 이 사람 손이 따뜻한 것도 진짜야. 일단 노아라는 사람을 찾아가 보자.' },
];

/** 정체 모를 그림자 (이름표·초상화에 쓰는 이름) */
export const BEAST_NAME = '???';
