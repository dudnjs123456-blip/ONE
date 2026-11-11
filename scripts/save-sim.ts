// 클라우드 저장 합치기 규칙 확인: npx tsx scripts/save-sim.ts
import { mergeProfiles, toSave } from '../src/game/net/cloudSave';
import { newProfile, type PlayerProfile } from '../src/game/core/profile';
import { addResult, loadRecord, loadStreak, rankOf, rankPoints } from '../src/game/core/cpuRecord';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}
const mk = (patch: Partial<PlayerProfile>): PlayerProfile => ({ ...newProfile(), ...patch });

// 최근에 저장한 기기가 이긴다 (카지노에서 돈을 잃은 기록이 되살아나지 않게)
{
  const server = mk({ level: 5, gold: 1000, savedAt: 1000, casino: { played: 1, won: 0, lost: 0, best: 0 } });
  const local = mk({ level: 5, gold: 200, savedAt: 2000, casino: { played: 9, won: 50, lost: 850, best: 50 } });
  const m = mergeProfiles(server, local);
  check('newest save wins (gold, casino)', m.gold === 200 && m.casino?.played === 9);
  const m2 = mergeProfiles({ ...local, savedAt: 3000, gold: 999 }, local);
  check('newer server save wins too', m2.gold === 999);
}
// 보스 기록·처치 수는 더 좋은 쪽을 남긴다
{
  const a = mk({ savedAt: 1, kills: 50, bossClears: { goblin: 3 }, bossBest: { goblin: 40 } });
  const b = mk({ savedAt: 2, kills: 10, bossClears: { goblin: 1, ogre: 1 }, bossBest: { goblin: 55, ogre: 90 } });
  const m = mergeProfiles(a, b);
  check('boss records keep best of both', m.kills === 50 && m.bossClears.goblin === 3 && m.bossClears.ogre === 1 && m.bossBest.goblin === 40 && m.bossBest.ogre === 90);
}
// 예전 서버 기록(생활 데이터 없음) + 이 브라우저의 생활 데이터 → 생활 데이터가 사라지지 않는다
{
  const server = mk({ level: 7, exp: 10, gold: 300 });
  delete (server as Partial<PlayerProfile>).savedAt;
  const local = mk({ level: 3, savedAt: 5, fridge: [{ name: '김밥', icon: '🍙', hunger: 25, fatigue: 0, from: '분식천국' }], gear: { owned: [], equipped: { weapon: 'woodBat' } } });
  const m = mergeProfiles(server, local);
  check('old server row keeps local life data', !!m.fridge?.length && m.gear?.equipped.weapon === 'woodBat', `(Lv.${m.level})`);
}
// save(jsonb) 에는 생활 데이터만
{
  const s = toSave(mk({ gear: { owned: ['cap'], equipped: {} }, casino: { played: 1, won: 0, lost: 0, best: 0 } }));
  check('toSave holds life data only', 'gear' in s && 'casino' in s && 'life' in s && !('level' in s) && !('gold' in s));
}

// VS CPU 전적·연승은 계정(save jsonb)에 들어가고, 이 브라우저 기록과 합쳐진다
{
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem'> }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
  // 예전에 이 브라우저에만 쌓인 기록
  mem.set('ironfist.cpuRecord', JSON.stringify({ easy: { w: 5, l: 1 }, normal: { w: 0, l: 2 } }));
  mem.set('ironfist.cpuStreak', JSON.stringify({ cur: 2, best: 4 }));
  const p = mk({ cpu: { record: { easy: { w: 3, l: 3 }, normal: { w: 0, l: 0 }, hard: { w: 1, l: 0 } }, streak: { cur: 1, best: 6 } } });
  const r = loadRecord(p);
  check('cpu record merges browser + account (bigger per level)', r.easy.w === 5 && r.easy.l === 3 && r.normal.l === 2 && r.hard.w === 1, JSON.stringify(r));
  const s = loadStreak(p);
  check('cpu streak: account current, best of both', s.cur === 1 && s.best === 6);
  const res = addResult('hard', true, p);
  check('result goes into profile', p.cpu?.record.hard.w === 2 && p.cpu?.streak.cur === 2 && res.streak.best === 6);
  check('toSave includes cpu', JSON.stringify(toSave(p)).includes('"cpu"'));
  const other = mk({ savedAt: 1, level: 1 });
  const m = mergeProfiles(other, { ...p, savedAt: 5 });
  check('cpu record survives cloud merge', m.cpu?.record.hard.w === 2);
  // 로그인 안 한 상태(프로필 없음)도 브라우저에만 그대로
  const g = addResult('easy', false);
  check('guest result stays in browser', g.record.easy.w === 5 && g.record.easy.l === 4, JSON.stringify(g.record.easy));
}

// VS CPU 랭크: 승리 점수(쉬움 1·보통 2·어려움 3)로 오른다
{
  const r = (e: number, n: number, h: number) => ({ easy: { w: e, l: 0 }, normal: { w: n, l: 0 }, hard: { w: h, l: 0 } });
  check('rank: no wins = 입문', rankOf(r(0, 0, 0)).name === '입문' && rankOf(r(0, 0, 0)).next?.need === 5);
  check('rank: points weight by level', rankPoints(r(1, 2, 3)) === 1 + 4 + 9);
  check('rank: 5 points = 수련생', rankOf(r(3, 1, 0)).name === '수련생');
  check('rank: top rank has no next', rankOf(r(0, 0, 70)).name === '철권왕' && rankOf(r(0, 0, 70)).next === null);
}

// 코디 창에서 고른 캐릭터·낚시 기록도 서버에 저장되어, 새로고침(서버 기록과 합치기) 뒤에도 남는다
{
  const fishing = { rod: 'pro', bait: { worm: 3 } } as unknown as PlayerProfile['fishing'];
  const local = mk({ body: 'silver' as PlayerProfile['body'], fishing, savedAt: 7000 });
  const save = toSave(local);
  check('toSave includes body & fishing', save.body === 'silver' && JSON.stringify(save.fishing) === JSON.stringify(fishing));
  // 서버에서 다시 읽은 기록 (pull 과 같은 모양) 과 브라우저 기록을 합친다
  const remote = mk({ ...(save as Partial<PlayerProfile>), savedAt: 7000 });
  const m = mergeProfiles(remote, local);
  check('body survives refresh merge', m.body === 'silver', String(m.body));
  check('fishing survives refresh merge', JSON.stringify(m.fishing) === JSON.stringify(fishing));
  // 예전 서버 기록(캐릭터 없음)이 더 최근이어도 브라우저에 남은 캐릭터를 쓴다
  const old = mergeProfiles(mk({ savedAt: 9000 }), local);
  check('older browser body fills missing server body', old.body === 'silver', String(old.body));
}
