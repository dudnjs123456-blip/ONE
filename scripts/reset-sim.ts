// 모든 계정 일괄 변경 (core/resets) 검증: npm run test:reset
import { applyResets, RESET_V } from '../src/game/core/resets';
import { newProfile, type PlayerProfile } from '../src/game/core/profile';
import { mergeProfiles, toSave } from '../src/game/net/cloudSave';
import { bodyUrl } from '../src/game/render/looks';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

// 1. 이야기를 진행한 예전 계정: 몸은 작은은발소녀로, 이야기는 프롤로그 전으로 (원래 진행은 백업)
const old: PlayerProfile = newProfile();
old.body = 'male' as PlayerProfile['body'];
old.gold = 1234;
old.dimension = { visits: 7, prologue: true, met: ['dallae', 'noa'], coin: 30, ch1: { step: 'quest' } } as PlayerProfile['dimension'];
check('처음 적용하면 바뀐다', applyResets(old) === true);
check('몸 = 작은은발소녀', old.body === 'smallSilverGirl', String(old.body));
check('프롤로그부터 다시', old.dimension!.prologue === false && !old.dimension!.ch1 && old.dimension!.met!.length === 0);
check('원래 진행은 백업', old.dimension!.masterBackup?.prologue === true && old.dimension!.masterBackup?.ch1?.step === 'quest');
check('은화·골드·접속 횟수는 그대로', old.dimension!.coin === 30 && old.gold === 1234 && old.dimension!.visits === 7);
check('적용 번호 저장', old.resetV === RESET_V);

// 2. 두 번째 접속: 다시 안 바뀐다 (다시 고른 몸 · 다시 본 프롤로그 유지)
old.body = 'pink' as PlayerProfile['body'];
old.dimension!.prologue = true;
check('한 번만 적용', applyResets(old) === false && old.body === 'pink' && old.dimension!.prologue === true);

// 3. 서버 저장에 적용 번호가 같이 올라간다 (안 그러면 접속할 때마다 초기화된다)
check('서버 저장에 resetV 포함', toSave(old).resetV === RESET_V);
const server = { ...old, savedAt: 2 };
const stale = { ...newProfile(), savedAt: 1 };
check('합칠 때 resetV 유지', mergeProfiles(server, stale).resetV === RESET_V);

// 4. 새 계정: 기본 몸이 작은은발소녀, 차원 기록은 안 만든다
const fresh = newProfile();
applyResets(fresh);
check('새 계정 기본 몸 (접속할 때 채운다)', fresh.body === 'smallSilverGirl', String(fresh.body));
check('새 계정엔 이야기 백업을 안 만든다', !fresh.dimension);
check('모르는 몸 값도 작은은발소녀 모델', bodyUrl(undefined).includes('a3.vrm'), bodyUrl(undefined));
