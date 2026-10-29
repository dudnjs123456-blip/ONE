import { saveProfile } from '../core/profile';
import { TALK_NPCS, type NpcBond, type NpcContext, type NpcReply } from '../data/npcs';
import type { CityWorld } from './cityWorld';

/** 기억은 최근 것만 남긴다 */
const MAX_MEMORIES = 15;
const COFFEE = { fatigue: 10, hunger: 3 };

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
    affinity: bond.affinity,
    canGift: bond.lastGiftDay !== world.day,
    memories: bond.memories.map((m) => `${m.day}일째: ${m.text}`),
  };
}

/** 대화를 열 때 첫 인사 (API 를 부르지 않는다) */
export function greeting(world: CityWorld, npcId: string): string {
  const bond = bondOf(world, npcId);
  const h = Math.floor(world.minutes / 60) % 24;
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
  return offlineReply(lines[lines.length - 1]?.content ?? '', context);
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
    life.fatigue = Math.max(0, life.fatigue - COFFEE.fatigue);
    life.hunger = Math.max(0, life.hunger - COFFEE.hunger);
    note = `☕ 박 반장이 믹스커피를 타 주셨다 (피로도 -${COFFEE.fatigue}, 배고픔 -${COFFEE.hunger})`;
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

function offlineReply(said: string, c: NpcContext): NpcReply {
  const hit = OFFLINE.find((o) => o.keys.some((k) => said.includes(k)));
  const pool = hit?.lines ?? ['허허, 그려그려.', '음, 그렇구먼. 근무나 잘 서게.', '뭐, 젊을 땐 다 그런 거여.'];
  return {
    reply: pool[Math.floor(Math.random() * pool.length)],
    emotion: '평온',
    affinity: 0,
    memory: '',
    gift: c.canGift && c.player.fatigue >= 60,
    offline: true,
  };
}

function fmt(frames: number) {
  const s = Math.ceil(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
