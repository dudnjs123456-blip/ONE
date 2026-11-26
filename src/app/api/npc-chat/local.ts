import type { NpcReply } from '@/game/data/npcs';

/**
 * 로컬 LLM (Ollama) 전용 대화 — NPC_PROVIDER=ollama 일 때만 쓴다 (내 PC 테스트용, 운영은 Claude).
 *
 * 8B~14B 같은 작은 모델은 규칙만 길게 주면 "할 일"을 못 잡고 상대 말을 되풀이한다
 * ("김치찌개가 싫구나"). 그래서 작은 모델에게만 세 가지를 더 준다.
 * 1. 대답 공식: 반응 + 내 것(생각·경험·제안·행동) — 받아 적기 금지
 * 2. 나쁜 대답 / 좋은 대답 예시 (NPC 마다)
 * 3. 대사보다 먼저 "속마음"을 한 줄 쓰게 한다 → 상대가 뭘 원하는지 먼저 생각하고 말한다
 */

export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

/** 작은 모델은 긴 대화를 다 읽으면 오히려 헷갈린다 → 최근 몇 줄만 */
const LOCAL_TURNS = 10;

interface Example {
  said: string;
  bad: string;
  good: string;
}

const GUIDE = `## 대답 잘하는 법 (가장 중요)
- 상대의 말을 되풀이하거나 요약하지 마라. "~구나", "~라니", "~했어?" 로 들은 말을 다시 받아 적는 대답은 실패다.
- 대답 = 너의 반응(감정 한마디) + 너 자신의 것 하나 이상(생각·경험·제안·행동·잔소리·농담).
- 상대가 싫다고 하면: 이유를 묻거나, 다른 걸 제안하거나, 너답게 투덜대거나 달랜다. 상대 말을 그대로 따라 하지 않는다.
- 상대가 물으면 네가 아는 것으로 구체적으로 답한다. 모르면 너답게 모른다고 한다.
- 앞에서 한 말을 또 하지 않는다. 매번 새 내용을 하나 더한다.
- 네 생활(일·취미·좋아하는 것)을 가끔 자연스럽게 섞는다.
- 문장은 짧고 입말로. 끝말이 어색하지 않게 ("고마워?" 처럼 이상한 물음표 금지).
- 말머리("아이고", "허허" 같은 감탄사)는 세 번에 한 번만. 매번 같은 말로 시작하지 않는다.
- 숫자·게임 용어(피로도, 배고픔 몇, 레벨, 호감도, G)를 대사에 그대로 쓰지 않는다. "많이 피곤해 보이네" 처럼 사람 말로 바꾼다.
- 설정에 적힌 좋아하는 것(음식·취미)은 가끔만 꺼낸다. 같은 소재를 연달아 꺼내지 않는다.
- 한 번에 하나의 이야기만. 상관없는 말을 덧붙이지 않는다.`;

const EXAMPLES: Record<string, Example[]> = {
  mom: [
    {
      said: '김치찌개 싫어. 맨날 김치찌개야',
      bad: '김치찌개가 싫구나. 맨날 김치찌개라니.',
      good: '아이고 입맛도 까다롭지. 그럼 내일은 계란말이 해 줄게, 오늘은 그냥 한 그릇 먹어.',
    },
    {
      said: '경비 알바 너무 힘들어',
      bad: '경비 알바가 힘들구나.',
      good: '그러게, 밤새 서 있으니 다리가 퉁퉁 붓지. 들어오면 바로 씻고 자, 엄마가 이불 펴 놨어.',
    },
    {
      said: '박 반장님이 잘 챙겨줘',
      bad: '박 반장님이 잘 챙겨줘서 고마워?',
      good: '어머, 다행이다. 엄마가 다음에 반찬 좀 싸 갈 테니 반장님 갖다드려.',
    },
    {
      said: '엄마 잔소리 좀 그만해',
      bad: '잔소리 그만하라고?',
      good: '얘는, 다 너 잘되라고 하는 소리지. 알았어 알았어, 대신 밥은 꼭 챙겨 먹어.',
    },
    {
      said: '오늘 강도 잡았어',
      bad: '강도를 잡았구나.',
      good: '뭐? 다친 데는 없고? 엄마 심장 떨어지는 줄 알았네. 다음엔 무리하지 말고 그냥 도망쳐.',
    },
  ],
  senior: [
    {
      said: '커피 별로 안 좋아해요',
      bad: '커피를 안 좋아하는구먼.',
      good: '허허, 요즘 젊은 사람들은 믹스 맛을 몰라. 그럼 보리차라도 한 잔 하게, 밤엔 속이 따뜻해야 혀.',
    },
    {
      said: '순찰 너무 귀찮아요',
      bad: '순찰이 귀찮다고?',
      good: '이 사람아, 귀찮은 걸 하니까 월급 받는 거여. 꼭대기부터 내려오면서 돌면 다리가 덜 아프네.',
    },
    {
      said: '강도 무서워요',
      bad: '강도가 무섭구먼.',
      good: '무서운 게 정상이여. 거리 재고 짧은 잽으로 끊어, 큰 기술은 저놈이 헛손질한 다음이고.',
    },
    {
      said: '반장님 오늘 순찰 어떠셨어요?',
      bad: '오늘 순찰 어땠냐고? 괜찮았네.',
      good: '3층 소화기 핀이 또 빠져 있더라고. 허리 때문에 계단은 자네한테 맡겨야겠어.',
    },
  ],
};

/** 작은 모델용 출력 형식: 속마음을 대사보다 먼저 쓰게 한다 (속성 순서대로 만든다) */
const LOCAL_SCHEMA = (base: { properties: Record<string, unknown>; required: readonly string[] }) => ({
  type: 'object',
  properties: {
    thought: { type: 'string', description: '대사 전에 쓰는 속마음 한 줄: 상대가 진짜 원하는 것과, 내가 새로 말할 것' },
    ...base.properties,
  },
  required: ['thought', ...base.required],
});

function systemText(npcId: string, persona: string, situation: string, history: { role: string; content: string }[]): string {
  const ex = EXAMPLES[npcId] ?? [];
  // 방금 한 말을 짚어 주면 작은 모델도 같은 말머리·소재를 덜 반복한다
  const mine = history.filter((m) => m.role === 'assistant').slice(-3).map((m) => m.content);
  return [
    persona,
    '',
    GUIDE,
    ...(ex.length
      ? [
          '',
          '## 예시 (나쁜 대답처럼 하지 말고 좋은 대답처럼 한다. 예시 문장을 그대로 베끼지는 않는다)',
          ...ex.map((e) => `상대: "${e.said}"\n- 나쁜 대답: "${e.bad}"\n- 좋은 대답: "${e.good}"`),
        ]
      : []),
    ...(mine.length ? ['', '## 네가 방금 한 말 (이 말머리·소재·문장을 되풀이하지 않는다)', ...mine.map((m) => '- ' + m)] : []),
    '',
    situation,
    '',
    '출력: 먼저 thought 에 속마음을 한 줄 쓰고(상대가 진짜 원하는 것 + 내가 새로 할 말), 그다음 reply 에 대사를 쓴다. JSON 으로만 답한다.',
  ].join('\n');
}

/** Ollama 에 물어본다. 실패하면 null (→ Claude 나 미리 써 둔 대사로) */
export async function askOllama(
  npcId: string,
  persona: string,
  history: { role: string; content: string }[],
  situation: string,
  schema: { properties: Record<string, unknown>; required: readonly string[] },
): Promise<Partial<NpcReply> | null> {
  try {
    const recent = history.slice(-LOCAL_TURNS);
    while (recent.length && recent[0].role !== 'user') recent.shift();
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        format: LOCAL_SCHEMA(schema),
        // 다시 불러오는 데 몇 분 걸린다 → 한 번 올리면 오래 붙잡아 둔다 (num_ctx 가 바뀌어도 다시 불러온다)
        keep_alive: '2h',
        options: { temperature: 0.75, top_p: 0.9, repeat_penalty: 1.1, num_ctx: 8192 },
        messages: [{ role: 'system', content: systemText(npcId, persona, situation, recent) }, ...recent],
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { message?: { content?: string } };
    const out = JSON.parse(j.message?.content ?? '') as Partial<NpcReply> & { thought?: string };
    if (process.env.NODE_ENV === 'development') console.log(`[npc-chat local] ${npcId} 속마음: ${out.thought ?? ''} → ${out.reply ?? ''}`);
    delete out.thought;
    return out;
  } catch (e) {
    console.error('npc-chat ollama error', e);
    return null;
  }
}
