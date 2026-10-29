import Anthropic from '@anthropic-ai/sdk';
import { NPC_EMOTIONS, TALK_NPCS, type NpcContext, type NpcReply } from '@/game/data/npcs';

/**
 * NPC 대화 (서버). API 키는 서버에만 두고 브라우저엔 대사만 돌려준다.
 * - 성격(persona)은 고정 system 프롬프트 → 캐시된다
 * - 그때그때의 게임 상황은 대화 끝에 system 메시지로 덧붙인다
 * - 출력은 JSON 형식으로 고정하고, 서버에서 한 번 더 범위를 검사한다
 */

const MODEL = process.env.NPC_MODEL || 'claude-opus-5-5';
const MAX_TURNS = 20;
const MAX_CHARS = 200;

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    emotion: { type: 'string', enum: [...NPC_EMOTIONS] },
    affinity: { type: 'integer' },
    memory: { type: 'string' },
    gift: { type: 'boolean' },
  },
  required: ['reply', 'emotion', 'affinity', 'memory', 'gift'],
  additionalProperties: false,
} as const;

interface Body {
  npcId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  context: NpcContext;
}

let client: Anthropic | null = null;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'no_key' }, { status: 503 });
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const npc = TALK_NPCS[body.npcId];
  if (!npc || !Array.isArray(body.messages) || body.messages.length === 0) return Response.json({ error: 'bad_request' }, { status: 400 });

  // 최근 대화만, 너무 긴 말은 자른다. 첫 메시지는 user 여야 한다
  const history = body.messages
    .slice(-MAX_TURNS)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (history.length && history[0].role !== 'user') history.shift();
  if (!history.length || history[history.length - 1].role !== 'user') return Response.json({ error: 'bad_request' }, { status: 400 });

  client ??= new Anthropic();
  // Haiku 는 서버 쪽 대체 모델(fallbacks)을 지원하지 않는다
  const fallback = MODEL.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      ...fallback,
      system: [{ type: 'text', text: npc.persona, cache_control: { type: 'ephemeral' } }],
      messages: [...history, { role: 'system', content: describe(body.context) }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
    if (res.stop_reason === 'refusal') return Response.json(soft('…허허, 그 얘긴 넘어가세. 근무나 열심히 하자고.'));
    const text = res.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return Response.json(soft('…응? 잠깐 딴생각했네. 다시 말해 보게.'));
    return Response.json(sanitize(JSON.parse(text.text), body.context));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return Response.json(soft('어이쿠, 숨 좀 돌리고 얘기하세. 잠깐만.'));
    if (e instanceof Anthropic.APIError) console.error('npc-chat API error', e.status, e.message);
    else console.error('npc-chat error', e);
    return Response.json(soft('…라디오 소리에 못 들었네. 뭐라고 했나?'));
  }
}

/** 게임 상황 → AI 가 읽을 글 */
function describe(c: NpcContext): string {
  const lines = [
    '[지금 상황]',
    `- ${c.day}일째 ${c.clock} (${c.partOfDay})`,
    c.onShift && c.shift
      ? `- 후배는 근무 중. 남은 시간 ${c.shift.left}, 출입 확인 ${c.shift.checked}명, 순찰 ${c.shift.patrols}회, 강도 제압 ${c.shift.robbers}명, 지금까지 ${c.shift.pay}G${c.shift.alert ? `. 지금 경보: ${c.shift.alert}` : ''}`
      : '- 후배는 지금 근무 시간이 아니다 (쉬는 중에 들렀다).',
    `- 후배 상태: 레벨 ${c.player.level}, ${c.player.gold}G, 체력 ${c.player.hp}/${c.player.maxHp}, 배고픔 ${c.player.hunger}/100, 피로 ${c.player.fatigue}/100 (높을수록 힘듦)`,
    `- 후배가 끝까지 마친 근무: ${c.pastShifts}번`,
    `- 후배에 대한 호감도: ${c.affinity}/100`,
    c.canGift ? '- 오늘 커피 줄 수 있음' : '- 오늘은 이미 커피를 줬다 (gift 는 false)',
    '',
    '[기억]',
    ...(c.memories.length ? c.memories.map((m) => `- ${m}`) : ['- (아직 특별한 기억 없음)']),
    '',
    '위 상황에 맞게 박 반장으로서 후배의 마지막 말에 답하라.',
  ];
  return lines.join('\n');
}

/** AI 출력 검사: 범위를 벗어난 값은 잘라낸다 */
function sanitize(raw: Partial<NpcReply>, c: NpcContext): NpcReply {
  const emotion = NPC_EMOTIONS.includes(raw.emotion as never) ? raw.emotion! : '평온';
  return {
    reply: String(raw.reply ?? '').slice(0, 200) || '…음.',
    emotion,
    affinity: Math.max(-3, Math.min(3, Math.round(Number(raw.affinity) || 0))),
    memory: String(raw.memory ?? '').slice(0, 40),
    gift: !!raw.gift && c.canGift,
  };
}

function soft(reply: string): NpcReply {
  return { reply, emotion: '평온', affinity: 0, memory: '', gift: false };
}
