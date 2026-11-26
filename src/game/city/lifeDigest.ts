import { saveProfile, type PlayerProfile } from '../core/profile';
import { LEAN_ROOTS, cleanDigest, dayDelta, lifeLog, pendingDays, ruleDigest } from '../core/lifeLog';
import { getSupabase } from '../net/supabase';

/**
 * 지난 날 기록을 정리한다 (하루 한 번이면 충분: 게임을 켤 때 + 몇 분마다 확인).
 * 서버 AI(로컬은 8B)가 있으면 AI 정리, 꺼져 있으면 규칙으로 정리. 네트워크가 끊겼으면 다음에 다시.
 */
let running = false;

export async function digestPending(p: PlayerProfile, day: number): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    const log = lifeLog(p);
    for (const k of pendingDays(p, day)) {
      const d = log.days[String(k)];
      if (!d) continue;
      const res = await ask({ day: k, notes: d.notes, mins: d.mins, hours: d.hours, delta: dayDelta(p, d) });
      if (res === 'retry') break;
      const rule = ruleDigest(p, d);
      // 근 기울기 = AI 가 고른 근(정성) 과 게임 숫자로 센 근(정량)의 평균 — 한쪽이 틀려도 크게 빗나가지 않게
      if (res) for (const r of LEAN_ROOTS) res.lean[r] = Math.min(3, Math.ceil((res.lean[r] + rule.lean[r]) / 2));
      log.digests[String(k)] = res ?? rule;
      done++;
    }
    if (done) saveProfile(p);
  } finally {
    running = false;
  }
  return done;
}

/** @returns AI 정리 / null(AI 꺼짐 → 규칙으로) / 'retry'(지금은 못 함) */
async function ask(body: unknown) {
  try {
    const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
    const res = await fetch('/api/life-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && j && !j.error) return cleanDigest(j);
    if (j?.error === 'off') return null;
    return 'retry' as const;
  } catch {
    return 'retry' as const;
  }
}
