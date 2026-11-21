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
}

export const PROLOGUE_SCRIPT = {
  /** 숲속 빈터에 떨어져 정신을 차린다 */
  wake: [
    { who: 'me', mood: '울음', text: '으윽… 아파라…' },
    { who: 'me', mood: '놀람', text: '…잠깐. 여기 어디야? 방금까지 분명 내 방에서 게임을 켰는데.' },
    { who: 'me', mood: '고민', text: '모니터가 갑자기 번쩍하더니… 화면 속으로 빨려 들어가서… 그대로 하늘에서 떨어졌어.' },
    { who: 'me', mood: '놀람', text: '하늘이 보라색이야. 나무도 이상하게 생겼고… 이거 설마, 진짜 게임 속에 들어온 거야?' },
    { who: 'me', mood: '고민', text: '휴대폰은… 신호 없음. 일단 길을 따라 가 보자.' },
  ] as ScriptLine[],
  /** 등 뒤 안개 속에서 그림자가 나타난다 */
  encounter: [
    { who: 'me', mood: '놀람', text: '…방금 뒤에서 뭔가 움직였어.' },
    { who: 'beast', text: '그르르르르…' },
    { who: 'me', mood: '울음', text: '뭐, 뭐야 저건…! 몬스터? 이름도 안 보여…!' },
    { who: 'beast', text: '크아아아아아——!!' },
    { who: 'me', mood: '화남', text: '저건 상대할 수 있는 게 아니야. 도망쳐야 해!! (Shift + 방향키로 달리기)' },
  ] as ScriptLine[],
  /** 막다른 벼랑 */
  cliff: [
    { who: 'me', mood: '놀람', text: '헉… 헉… 길이 끊겼어. 막다른 벼랑이야!' },
    { who: 'me', mood: '고민', text: '아래는… 안개 때문에 바닥이 안 보여. 그런데 저 밑에 작은 불빛들이… 마을인가?' },
    { who: 'beast', text: '그르르르… (한 걸음씩 다가온다)' },
    { who: 'me', mood: '화남', text: '어떻게 하지…?' },
  ] as ScriptLine[],
  /** 맞서 본 뒤: 꿈쩍도 하지 않는다 */
  cornered: [
    { who: 'me', mood: '울음', text: '꿈쩍도 안 해…! 내 주먹이 하나도 안 통해.' },
    { who: 'beast', text: '크르르르르…!!' },
    { who: 'me', mood: '화남', text: '여기서 버티면 끝이야. …뛰는 수밖에 없어!' },
  ] as ScriptLine[],
};

/** 벼랑 밑에서 구해 준 뒤 경계 마을 여관 앞에서 깨어난다 (FieldView 에서) */
export const RESCUE_SCRIPT: ScriptLine[] = [
  { who: 'dallae', text: '어머, 눈 떴다! 다행이야… 정말 다행이야.' },
  { who: 'me', mood: '울음', text: '으… 여기는…? 나 분명 벼랑에서 떨어졌는데.' },
  { who: 'dallae', text: '여긴 경계 마을이야. 강가에 빨래하러 갔다가, 벼랑 밑 물웅덩이에 쓰러져 있는 너를 업어 왔어.' },
  { who: 'dallae', text: '그 높은 데서 떨어졌는데 멀쩡하다니… 너 혹시, 하늘 너머 "저편"에서 온 사람이야?' },
  { who: 'me', mood: '고민', text: '저편…? 난 그냥 서울에서 요즘 유행한다는 게임을 켰을 뿐인데…' },
  { who: 'dallae', text: '역시! 요즘 그런 사람들이 가끔 하늘에서 떨어지곤 해. 다들 같은 게임 이름을 말하더라. "디멘션"이라던가.' },
  { who: 'me', mood: '놀람', text: '그럼… 여긴 진짜 게임 속 세계라는 거야?' },
  { who: 'dallae', text: '글쎄, 우리한텐 그냥 사는 곳인걸. 그보다… 벼랑 위 "안개 숲"에서 왔다면, 혹시 검은 그림자 못 봤어?' },
  { who: 'me', mood: '울음', text: '봤어…! 주먹이 하나도 안 통하는 괴물이었어.' },
  { who: 'dallae', text: '…이름 없는 그림자. 마을 사람들은 그걸 그렇게 불러. 다시는 그 숲에 가면 안 돼.' },
  { who: 'dallae', text: '자세한 건 포탈 앞에 있는 노아한테 물어봐. 저편 사람들을 맞이하는 애야. 마을 한가운데 빛나는 문 앞에 있어.' },
  { who: 'me', mood: '고민', text: '…진짜로 게임 속에 들어와 버렸구나. 일단 노아라는 사람을 찾아가 보자.' },
];

/** 정체 모를 그림자 (이름표·초상화에 쓰는 이름) */
export const BEAST_NAME = '???';
