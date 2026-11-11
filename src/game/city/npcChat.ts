import { saveProfile } from '../core/profile';
import { TALK_NPCS, type NpcBond, type NpcContext, type NpcReply } from '../data/npcs';
import type { CityWorld } from './cityWorld';
import { FLOWER_GIFTS } from '../data/items';
import { MALE_BODIES } from '../data/fashion';

/** 기억은 최근 것만 남긴다 */
const MAX_MEMORIES = 15;

/** 엄마가 보기에 딸인지 아들인지 (캐릭터 몸으로 정한다) */
export function childOf(world: CityWorld): '딸' | '아들' {
  return MALE_BODIES.includes(world.profile.body ?? '') ? '아들' : '딸';
}

/** 엄마가 지금 하는 일 (시각에 따라) */
function momDoing(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  if (h < 6) return '잠이 안 와서 주방에서 따뜻한 물을 마시는 중';
  if (h < 9) return '주방에서 아침밥을 차리는 중';
  if (h < 13) return '반찬가게 일을 마치고 막 들어와 장 본 것을 정리하는 중';
  if (h < 17) return '주방에서 반찬을 만드는 중';
  if (h < 21) return '주방에서 저녁 찌개를 끓이는 중';
  return '설거지를 끝내고 주방을 정리하는 중';
}

export interface ChatLine {
  role: 'user' | 'assistant';
  content: string;
}

export function bondOf(world: CityWorld, npcId: string): NpcBond {
  const pr = world.profile;
  pr.npcs ??= {};
  return (pr.npcs[npcId] ??= { affinity: TALK_NPCS[npcId].startAffinity, talks: 0, memories: [] });
}

function partOfDay(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  if (h < 5) return '새벽';
  if (h < 9) return '아침';
  if (h < 12) return '오전';
  if (h < 14) return '점심때';
  if (h < 18) return '오후';
  if (h < 21) return '저녁';
  return '밤';
}

/** 지금 게임 상황을 NPC 가 알 수 있게 정리 */
export function buildContext(world: CityWorld, npcId: string): NpcContext {
  const pr = world.profile;
  const bond = bondOf(world, npcId);
  const job = world.job;
  return {
    day: world.day,
    clock: world.clock,
    partOfDay: partOfDay(world.minutes),
    onShift: !!job,
    shift: job
      ? {
          left: fmt(job.remainingFrames),
          checked: job.checked,
          patrols: job.patrolsDone,
          robbers: job.robbersBeaten,
          pay: job.earnedBase + job.bonus,
          alert: job.alert,
        }
      : undefined,
    player: {
      level: pr.level,
      gold: pr.gold,
      hunger: Math.round(pr.life.hunger),
      fatigue: Math.round(pr.life.fatigue),
      hp: Math.round(world.player.hp),
      maxHp: world.player.maxHp,
    },
    pastShifts: pr.jobs?.aptGuard?.shifts ?? 0,
    doing: npcId === 'senior' ? world.seniorAI.status : npcId === 'mom' ? momDoing(world.minutes) : undefined,
    ...(npcId === 'mom' ? { child: childOf(world), fridge: pr.fridge?.length ?? 0 } : {}),
    affinity: bond.affinity,
    canGift: bond.lastGiftDay !== world.day,
    memories: bond.memories.map((m) => `${m.day}일째: ${m.text}`),
  };
}

/** 대화를 열 때 첫 인사 (API 를 부르지 않는다) */
export function greeting(world: CityWorld, npcId: string): string {
  const bond = bondOf(world, npcId);
  const h = Math.floor(world.minutes / 60) % 24;
  if (npcId === 'mom') {
    const life = world.profile.life;
    if (world.player.hp < world.player.maxHp * 0.4) return '아이고, 얼굴이 왜 이래! 어디서 다쳤어? 이리 와 봐.';
    if (h < 5 || h >= 23) return '이 시간까지 안 자고 뭐 해? 얼른 씻고 자야지.';
    if (life.hunger >= 60) return '배고프지? 얼굴에 다 쓰여 있네. 밥 먹을래?';
    if (h < 9) return '일어났어? 아침은 먹고 나가야지.';
    if (h >= 17 && h < 21) return '왔어? 찌개 거의 다 됐어. 손 씻고 와.';
    return bond.affinity >= 80 ? '우리 예쁜 새끼 왔네! 오늘은 어땠어?' : '왔니? 밖에 별일 없었고?';
  }
  if (bond.talks === 0) return '자네가 이번에 새로 온 후배인가? 난 박만수, 다들 박 반장이라 부르지. 잘 지내보세.';
  if (world.job?.robber) return '이 사람아, 지금 말할 때가 아니여! 강도부터 잡고 오게!';
  if (h < 6 || h >= 22) return '허허, 이 밤에 왔나. 졸리면 커피 한 잔 하고 하게.';
  if (bond.affinity >= 70) return '왔는가, 후배! 자네 오니까 로비가 다 환하네.';
  if (world.job) return '근무 중엔 데스크 앞을 잘 봐야 혀. 뭐 물어볼 거라도 있나?';
  return '오늘은 쉬는 날인가? 쉴 땐 푹 쉬어야 오래 하는 거여.';
}

/** API 로 대답 받기. 키가 없거나 서버가 안 되면 미리 써 둔 대사로 */
export async function ask(world: CityWorld, npcId: string, lines: ChatLine[]): Promise<NpcReply> {
  const context = buildContext(world, npcId);
  try {
    const res = await fetch('/api/npc-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npcId, messages: lines, context }),
    });
    if (res.ok) return (await res.json()) as NpcReply;
  } catch {
    // 네트워크 오류 → 오프라인 대사
  }
  return offlineReply(npcId, lines[lines.length - 1]?.content ?? '', context);
}

/** 가방의 꽃을 선물한다 (하루 한 번 호감도 +). @returns 못 주면 이유, 줬으면 null */
export function giftFlower(world: CityWorld, npcId: string, itemId: string): string | null {
  const bonus = FLOWER_GIFTS[itemId];
  const inv = world.profile.inventory;
  if (!bonus || !(inv[itemId] > 0)) return '가방에 꽃이 없어요';
  const bond = bondOf(world, npcId);
  if (bond.lastFlowerDay === world.day) return '오늘은 이미 꽃을 드렸어요 (내일 또)';
  inv[itemId]--;
  if (inv[itemId] <= 0) delete inv[itemId];
  bond.lastFlowerDay = world.day;
  bond.affinity = Math.min(100, bond.affinity + bonus);
  const who = npcId === 'mom' ? childOf(world) : '후배';
  bond.memories.push({ day: world.day, text: itemId === 'bouquet' ? `${who}가 꽃다발을 선물했다` : `${who}가 장미 한 송이를 줬다` });
  if (bond.memories.length > MAX_MEMORIES) bond.memories.splice(0, bond.memories.length - MAX_MEMORIES);
  saveProfile(world.profile);
  return null;
}

/** 대답을 게임에 반영: 호감도·기억·커피. @returns 화면에 띄울 알림 (없으면 null) */
export function applyReply(world: CityWorld, npcId: string, r: NpcReply): string | null {
  const bond = bondOf(world, npcId);
  bond.talks++;
  bond.affinity = Math.max(0, Math.min(100, bond.affinity + r.affinity));
  if (r.memory.trim()) {
    bond.memories.push({ day: world.day, text: r.memory.trim() });
    if (bond.memories.length > MAX_MEMORIES) bond.memories.splice(0, bond.memories.length - MAX_MEMORIES);
  }
  let note: string | null = null;
  if (r.gift && bond.lastGiftDay !== world.day) {
    bond.lastGiftDay = world.day;
    const life = world.profile.life;
    const g = TALK_NPCS[npcId].gift;
    life.fatigue = Math.max(0, life.fatigue - g.fatigue);
    life.hunger = Math.max(0, life.hunger - g.hunger);
    note = `${g.label} (피로도 -${g.fatigue}, 배고픔 -${g.hunger})`;
  }
  saveProfile(world.profile);
  return note;
}

// ───────── API 키가 없을 때 ─────────

const OFFLINE: { keys: string[]; lines: string[] }[] = [
  { keys: ['안녕', '반가', '하이', '처음'], lines: ['그려, 반갑네. 오늘도 무사히 넘기세.', '왔는가. 커피 한 잔 할 텐가?'] },
  { keys: ['요령', '방법', '팁', '어떻게 해', '알려'], lines: ['데스크 앞에 선 주민은 E 로 확인하게. 귀찮으면 G 로 자동 체크를 켜고.', '순찰은 5분마다여. P 누르면 알아서 돌고 오지.'] },
  { keys: ['강도', '도둑', '싸움', '싸우', '격투', '권투'], lines: ['잽으로 끊고, 상대가 헛손질하면 그때 크게 넣어. 내가 코치할 때 그렇게 가르쳤지.', '전설의 강도가 오면 무리하지 말게. 도망치는 것도 실력이여.'] },
  { keys: ['피곤', '졸', '힘들', '배고'], lines: ['힘들면 쉬엄쉬엄 하게. 몸 상하면 다 소용없어.', '집에 가서 푹 자고 와. 내일도 근무여.'] },
  { keys: ['주민', '빌라', '별일', '소문'], lines: ['요즘 401호가 택배를 자주 시키더구먼. 뭘 그리 사는지.', '밤에 계단 쪽에서 소리 나면 꼭 가 보게. 그게 다 일이여.'] },
];

const OFFLINE_MOM: { keys: string[]; lines: string[] }[] = [
  { keys: ['안녕', '왔어', '다녀', '엄마'], lines: ['왔어? 밖에 춥지 않았어?', '응 왔구나. 손부터 씻고 와.'] },
  { keys: ['배고', '밥', '먹을', '반찬'], lines: ['냉장고에 반찬 있어. 꺼내 먹으렴.', '조금만 기다려, 찌개 데워 줄게.'] },
  { keys: ['힘들', '피곤', '졸', '아파'], lines: ['아이고 우리 새끼, 오늘은 일찍 자.', '무리하지 마. 몸이 제일이야.'] },
  { keys: ['돈', '일', '알바', '경비'], lines: ['1층 경비 일 있잖아, 박 반장님께 여쭤 봐.', '돈 버는 것도 좋지만 밥은 꼭 챙겨 먹고 해.'] },
];

function offlineReply(npcId: string, said: string, c: NpcContext): NpcReply {
  const mom = npcId === 'mom';
  const hit = (mom ? OFFLINE_MOM : OFFLINE).find((o) => o.keys.some((k) => said.includes(k)));
  const pool = hit?.lines ?? (mom ? ['그래그래, 엄마는 다 알아.', '응, 그랬구나.', '얘는, 엄마 말 좀 들어.'] : ['허허, 그려그려.', '음, 그렇구먼. 근무나 잘 서게.', '뭐, 젊을 땐 다 그런 거여.']);
  return {
    reply: pool[Math.floor(Math.random() * pool.length)],
    emotion: '평온',
    playerMood: '기본',
    affinity: 0,
    memory: '',
    gift: c.canGift && (mom ? c.player.hunger >= 60 : c.player.fatigue >= 60),
    offline: true,
  };
}

function fmt(frames: number) {
  const s = Math.ceil(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
