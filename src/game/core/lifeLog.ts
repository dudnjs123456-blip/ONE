import type { PlayerProfile } from './profile';

/**
 * 생활 기록: 서울에서 실제로 한 일을 날짜(게임 일 = 실제 한국 날짜)별로 쌓는다.
 * - 기록은 게임 코드가 그대로 남긴다 (AI 없이 정확하게): 알림 문구 · 장소별로 머문 분 · 시간대 · 하루 동안 늘어난 숫자
 * - 지난 날이 끝나면 AI(로컬은 8B)가 그날을 "일기 한 줄 + 생활 성향 + 여섯 근 기울기"로 정리해 digests 에 남긴다 (lifeDigest.ts)
 * - 정리된 기록은 노아의 근 감정(readRoot)과 NPC 대화(요즘 생활)에 쓴다
 * 원본은 최근 14일, 정리본은 60일만 남긴다 (프로필이 커지지 않게).
 */

export type LeanRoot = '형' | '력' | '생' | '심' | '공';
export const LEAN_ROOTS: LeanRoot[] = ['형', '력', '생', '심', '공'];

/** 하루 동안 늘어난 만큼을 세는 숫자들 (프로필에 원래 있는 누적값의 차이) */
export interface LifeCounters {
  fish: number;
  shifts: number;
  kills: number;
  wins: number;
  casino: number;
  talks: number;
  pets: number;
  level: number;
}

export interface LifeNote {
  /** 게임 시각 (시) */
  h: number;
  t: string;
  /** 같은 일을 몇 번 했는지 */
  n: number;
}

export interface LifeDay {
  /** 그날 처음 기록할 때의 숫자 (다음 날 처음 숫자와의 차이 = 그날 한 양) */
  start: LifeCounters;
  /** 그날 끝 숫자 (날이 바뀌며 닫을 때) */
  end?: LifeCounters;
  notes: LifeNote[];
  /** 장소별로 머문 분 */
  mins: Record<string, number>;
  /** 시간대(0~23시)별로 접속해 있던 분 */
  hours: number[];
}

export interface LifeDigest {
  /** 일기 한 줄 (그날 무엇을 하며 보냈나) */
  diary: string;
  /** 생활 성향 낱말 (예: 밤샘형, 집순이, 낚시꾼) */
  traits: string[];
  /** 여섯 근 기울기 0~3 (시는 생활로 정해지지 않는다) */
  lean: Record<LeanRoot, number>;
  /** 그날 가장 눈에 띈 일 */
  highlight: string;
  /** 누가 정리했나: AI / 규칙(AI 가 없을 때) */
  by: 'ai' | 'rule';
}

export interface LifeLog {
  days: Record<string, LifeDay>;
  digests: Record<string, LifeDigest>;
}

const KEEP_DAYS = 14;
const KEEP_DIGESTS = 60;
const MAX_NOTES = 40;
const MAX_NOTE_CHARS = 60;

export function lifeLog(p: PlayerProfile): LifeLog {
  return (p.lifeLog ??= { days: {}, digests: {} });
}

export function countersOf(p: PlayerProfile): LifeCounters {
  return {
    fish: p.fishing?.stats?.catches ?? 0,
    shifts: Object.values(p.jobs ?? {}).reduce((a, j) => a + (j?.shifts ?? 0), 0),
    kills: p.kills ?? 0,
    wins: Object.values(p.cpu?.record ?? {}).reduce((a, r) => a + (r?.w ?? 0), 0),
    casino: p.casino?.played ?? 0,
    talks: Object.values(p.npcs ?? {}).reduce((a, b) => a + ((b as { talks?: number })?.talks ?? 0), 0),
    pets: p.pets?.list?.length ?? 0,
    level: p.level ?? 1,
  };
}

/** 오늘 기록장 (없으면 새로 연다. 지난 날은 닫고 오래된 것은 지운다) */
export function today(p: PlayerProfile, day: number): LifeDay {
  const log = lifeLog(p);
  const key = String(day);
  let d = log.days[key];
  if (!d) {
    const now = countersOf(p);
    for (const [k, old] of Object.entries(log.days)) if (Number(k) < day && !old.end) old.end = now;
    d = log.days[key] = { start: now, notes: [], mins: {}, hours: new Array(24).fill(0) };
    prune(log, day);
  }
  return d;
}

function prune(log: LifeLog, day: number) {
  for (const k of Object.keys(log.days)) if (Number(k) <= day - KEEP_DAYS) delete log.days[k];
  const ds = Object.keys(log.digests).map(Number).sort((a, b) => a - b);
  while (ds.length > KEEP_DIGESTS) delete log.digests[String(ds.shift())];
}

/** 안내·실패 문구는 생활이 아니다 (키 설명, 돈 모자람, 자리 없음 …) */
const NOISE = /누르면|눌러|E 를|E로|E:|\(E\)|모자라|꽉 찼|기다려|방향키|안내|할 수 없|못 |없어요|아직|먼저|키 설정/;

/** 알림 문구를 기록한다 (같은 일은 횟수만 늘린다) */
export function noteLife(p: PlayerProfile, day: number, minutes: number, raw: string) {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_CHARS);
  if (t.length < 4 || NOISE.test(t)) return;
  const d = today(p, day);
  // 숫자만 다른 같은 일(예: 남은 그릇 3개 / 2개)은 하나로 센다
  const shape = t.replace(/[\d,.]+/g, '#');
  const same = d.notes.find((n) => n.t.replace(/[\d,.]+/g, '#') === shape);
  if (same) {
    same.n++;
    same.t = t;
    return;
  }
  if (d.notes.length >= MAX_NOTES) return;
  d.notes.push({ h: Math.floor(minutes / 60) % 24, t, n: 1 });
}

/** 1분마다: 어디서 몇 시에 시간을 보냈나 */
export function tickLife(p: PlayerProfile, day: number, minutes: number, place: string) {
  const d = today(p, day);
  d.mins[place] = (d.mins[place] ?? 0) + 1;
  d.hours[Math.floor(minutes / 60) % 24]++;
}

/** 그날 한 양 (닫힌 날은 끝 숫자, 오늘은 지금 숫자 기준) */
export function dayDelta(p: PlayerProfile, d: LifeDay): LifeCounters {
  const end = d.end ?? countersOf(p);
  const out = {} as LifeCounters;
  for (const k of Object.keys(d.start) as (keyof LifeCounters)[]) out[k] = Math.max(0, (end[k] ?? 0) - (d.start[k] ?? 0));
  return out;
}

/** 아직 정리 안 된 지난 날들 (최근 것부터, 기록이 있는 날만) */
export function pendingDays(p: PlayerProfile, day: number, max = 3): number[] {
  const log = lifeLog(p);
  return Object.entries(log.days)
    .filter(([k, d]) => Number(k) < day && !log.digests[k] && (d.notes.length || Object.keys(d.mins).length))
    .map(([k]) => Number(k))
    .sort((a, b) => b - a)
    .slice(0, max);
}

/** AI 가 없을 때의 정리: 숫자와 머문 곳으로만 기울기를 정한다 (일기는 짧게) */
export function ruleDigest(p: PlayerProfile, d: LifeDay): LifeDigest {
  const c = dayDelta(p, d);
  const m = d.mins;
  const lean: Record<LeanRoot, number> = {
    형: c.shifts * 1.5 + (m.home ?? 0) / 60,
    력: c.kills / 5 + c.wins + (m.park ?? 0) / 30,
    생: c.pets * 2 + (m.home ?? 0) / 90,
    심: c.talks / 3 + c.casino / 10,
    공: c.fish / 2 + (m.fishing ?? 0) / 30 + (m.city ?? 0) / 60,
  };
  for (const r of LEAN_ROOTS) lean[r] = Math.max(0, Math.min(3, Math.round(lean[r])));
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return {
    diary: top ? `${PLACE_LABEL[top[0]] ?? top[0]}에서 가장 오래 지냈다.` : '',
    traits: [],
    lean,
    highlight: d.notes.slice().sort((a, b) => b.n - a.n)[0]?.t ?? '',
    by: 'rule',
  };
}

export const PLACE_LABEL: Record<string, string> = {
  city: '동네 거리',
  home: '집',
  lobby: '빌라 로비',
  corridor: '빌라 복도',
  park: '놀이공원',
  fishing: '한강 낚시터',
};

/** AI 가 돌려준 정리를 범위 안으로 */
export function cleanDigest(raw: unknown): LifeDigest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lean = (r.lean && typeof r.lean === 'object' ? r.lean : {}) as Record<string, unknown>;
  const diary = String(r.diary ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!diary) return null;
  const out: LifeDigest = {
    diary,
    traits: (Array.isArray(r.traits) ? r.traits : [])
      .map((t) => String(t).trim().slice(0, 10))
      .filter(Boolean)
      .slice(0, 3),
    lean: { 형: 0, 력: 0, 생: 0, 심: 0, 공: 0 },
    highlight: String(r.highlight ?? '').trim().slice(0, 40),
    by: 'ai',
  };
  for (const k of LEAN_ROOTS) out.lean[k] = Math.max(0, Math.min(3, Math.round(Number(lean[k]) || 0)));
  return out;
}

/** 지금까지 쌓인 근 기울기 합 (근 감정에 더한다) */
export function leanTotal(p: PlayerProfile): Record<LeanRoot, number> {
  const t: Record<LeanRoot, number> = { 형: 0, 력: 0, 생: 0, 심: 0, 공: 0 };
  for (const d of Object.values(p.lifeLog?.digests ?? {})) for (const k of LEAN_ROOTS) t[k] += d.lean?.[k] ?? 0;
  return t;
}

/** NPC 에게 알려 줄 요즘 생활 (최근 정리 3일, 오래된 것부터) */
export function recentLife(p: PlayerProfile, day: number): string[] {
  const ds = p.lifeLog?.digests ?? {};
  return Object.keys(ds)
    .map(Number)
    .filter((k) => k < day)
    .sort((a, b) => a - b)
    .slice(-3)
    .map((k) => {
      const d = ds[String(k)];
      const ago = day - k === 1 ? '어제' : `${day - k}일 전`;
      return `${ago}: ${d.diary}${d.traits.length ? ` (${d.traits.join(', ')})` : ''}`;
    });
}
