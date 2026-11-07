/**
 * VS CPU 난이도별 전적 · 연승. 이 브라우저(localStorage)와 계정(프로필 cpu 칸) 양쪽에 둔다.
 * 프로필은 통째로 클라우드에 저장되므로 다른 기기에서도 이어진다 (DB 스키마 변경 없음).
 */
import type { CpuLevel } from './controllers';
import type { PlayerProfile } from './profile';

const RECORD_KEY = 'ironfist.cpuRecord';
export type CpuRecord = Record<CpuLevel, { w: number; l: number }>;
export const EMPTY_RECORD: CpuRecord = { easy: { w: 0, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 0 } };
/** VS CPU 난이도별 전적: 이 브라우저 + 계정(프로필). 둘 다 있으면 난이도별로 큰 쪽 */
export function loadRecord(prof?: PlayerProfile): CpuRecord {
  let local: Partial<CpuRecord> = {};
  try {
    const v = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null');
    if (v && typeof v === 'object') local = v;
  } catch {}
  const cloud = (prof?.cpu?.record ?? {}) as Partial<CpuRecord>;
  const out = { ...EMPTY_RECORD };
  for (const lv of Object.keys(EMPTY_RECORD) as CpuLevel[]) {
    const a = local[lv] ?? { w: 0, l: 0 };
    const b = cloud[lv] ?? { w: 0, l: 0 };
    out[lv] = { w: Math.max(a.w || 0, b.w || 0), l: Math.max(a.l || 0, b.l || 0) };
  }
  return out;
}
const STREAK_KEY = 'ironfist.cpuStreak';
export type Streak = { cur: number; best: number };
/** VS CPU 연승 (난이도 상관없이 이어진다). 계정 기록이 있으면 그쪽의 현재 연승, 최고 연승은 큰 쪽 */
export function loadStreak(prof?: PlayerProfile): Streak {
  let local: Streak = { cur: 0, best: 0 };
  try {
    const v = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null');
    if (v && typeof v.cur === 'number' && typeof v.best === 'number') local = v;
  } catch {}
  const cloud = prof?.cpu?.streak;
  return cloud ? { cur: cloud.cur, best: Math.max(cloud.best, local.best) } : local;
}

/** 경기 결과를 브라우저와 프로필 양쪽에 적는다 (프로필 저장은 부르는 쪽에서) */
export function addResult(level: CpuLevel, won: boolean, prof?: PlayerProfile): { record: CpuRecord; streak: Streak } {
  const r = loadRecord(prof);
  const cur = r[level];
  const record = { ...r, [level]: { w: cur.w + (won ? 1 : 0), l: cur.l + (won ? 0 : 1) } };
  const s = loadStreak(prof);
  const n = won ? s.cur + 1 : 0;
  const streak = { cur: n, best: Math.max(s.best, n) };
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {}
  if (prof) prof.cpu = { record, streak };
  return { record, streak };
}

/** 난이도별 승리 점수 */
const RANK_POINTS: Record<CpuLevel, number> = { easy: 1, normal: 2, hard: 3 };

/** VS CPU 랭크 (승리 점수로 오른다) */
export const RANKS: { name: string; min: number; icon: string }[] = [
  { name: '입문', min: 0, icon: '🥋' },
  { name: '수련생', min: 5, icon: '🟢' },
  { name: '도전자', min: 15, icon: '🔵' },
  { name: '실력자', min: 30, icon: '🟣' },
  { name: '고수', min: 60, icon: '🟠' },
  { name: '달인', min: 100, icon: '🔴' },
  { name: '철권왕', min: 200, icon: '👑' },
];

export function rankPoints(r: CpuRecord): number {
  return (Object.keys(RANK_POINTS) as CpuLevel[]).reduce((s, lv) => s + (r[lv]?.w ?? 0) * RANK_POINTS[lv], 0);
}

/** 지금 랭크와 다음 랭크까지 남은 점수 */
export function rankOf(r: CpuRecord): { index: number; name: string; icon: string; points: number; next: { name: string; need: number } | null } {
  const points = rankPoints(r);
  let index = 0;
  RANKS.forEach((k, i) => {
    if (points >= k.min) index = i;
  });
  const nx = RANKS[index + 1];
  return { index, name: RANKS[index].name, icon: RANKS[index].icon, points, next: nx ? { name: nx.name, need: nx.min - points } : null };
}
