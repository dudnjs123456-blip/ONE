// 생활 기록 (알림 기록 · 머문 곳 · 하루 정리 · 근 감정 반영) 검증: npm run test:life
import { CityWorld, type CityInput } from '../src/game/city/cityWorld';
import { dayDelta, leanTotal, lifeLog, noteLife, pendingDays, recentLife, ruleDigest, today } from '../src/game/core/lifeLog';
import { newProfile } from '../src/game/core/profile';
import { readRoot } from '../src/game/story/chapter1';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

// 1. 알림 기록: 같은 일은 횟수로, 안내·실패 문구는 버린다
const p = newProfile();
noteLife(p, 5, 14 * 60, '🎣 붕어 1.2kg 낚았다!');
noteLife(p, 5, 14 * 60 + 5, '🎣 붕어 0.8kg 낚았다!');
noteLife(p, 5, 14 * 60, '💸 교통비가 모자라요 (5 G)');
noteLife(p, 5, 14 * 60, '🎡 놀이기구 앞에서 E 를 누르면 줄을 서요');
const d5 = lifeLog(p).days['5'];
check('같은 일은 한 줄 + 횟수', d5.notes.length === 1 && d5.notes[0].n === 2, JSON.stringify(d5.notes));
check('시각(시)을 남긴다', d5.notes[0].h === 14);

// 2. 하루 동안 늘어난 숫자: 다음 날을 열면 지난 날이 닫힌다
p.fishing = { stats: { catches: 7 } } as never;
p.jobs = { aptGuard: { shifts: 2, earned: 0 } };
today(p, 6);
const delta = dayDelta(p, d5);
check('지난 날의 늘어난 숫자', delta.fish === 7 && delta.shifts === 2, JSON.stringify(delta));
p.fishing = { stats: { catches: 9 } } as never;
check('닫힌 날은 그 뒤 숫자에 안 흔들린다', dayDelta(p, d5).fish === 7);

// 3. 정리 대상: 지난 날만, 정리 안 된 날만
check('어제는 정리 대상, 오늘은 아님', pendingDays(p, 6).join() === '5');
const rd = ruleDigest(p, d5);
check('규칙 정리: 물고기 7마리 + 알바 2번 → 공 3', rd.lean.공 === 3, JSON.stringify(rd.lean));
lifeLog(p).digests['5'] = { diary: '한강에서 낚시만 했다.', traits: ['낚시꾼'], lean: { 형: 0, 력: 0, 생: 0, 심: 0, 공: 3 }, highlight: '', by: 'ai' };
check('정리된 날은 다시 안 한다', pendingDays(p, 6).length === 0);
check('NPC 에게 줄 요즘 생활', recentLife(p, 6)[0] === '어제: 한강에서 낚시만 했다. (낚시꾼)', recentLife(p, 6)[0]);

// 4. 근 감정: 숫자가 비슷하면 생활 정리가 기운 쪽으로
const q = newProfile();
q.kills = 10; // 력 10점
q.lifeLog = { days: {}, digests: { '1': { diary: 'a', traits: [], lean: { 형: 0, 력: 0, 생: 0, 심: 0, 공: 3 }, highlight: '', by: 'ai' } } };
check('근 기울기 합', leanTotal(q).공 === 3);
check('근 감정에 생활 정리가 더해진다 (공 18 > 력 10)', readRoot(q).root === '공', readRoot(q).root);

// 5. 실제 도시: 알림 문구와 1분마다 머문 곳이 쌓인다
let c: CityInput = { move: null, run: false, interact: false };
const now = Date.UTC(2026, 10, 17, 3, 0, 0);
const w = new CityWorld({ read: () => c });
w.attachSharedClock(() => now);
w.say('🚿 개운하다! 샤워 끝');
for (let i = 0; i < 3601; i++) w.step();
const wd = lifeLog(w.profile).days[String(w.day)];
check('도시 알림이 기록된다', !!wd?.notes.some((n) => n.t.includes('샤워')), JSON.stringify(wd?.notes));
check('1분마다 머문 곳이 쌓인다', Object.values(wd?.mins ?? {}).reduce((a, b) => a + b, 0) >= 1, JSON.stringify(wd?.mins));
c = { move: null, run: false, interact: false };
