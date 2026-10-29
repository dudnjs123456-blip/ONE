// 클라우드 저장 합치기 규칙 확인: npx tsx scripts/save-sim.ts
import { mergeProfiles, toSave } from '../src/game/net/cloudSave';
import { newProfile, type PlayerProfile } from '../src/game/core/profile';

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
