// 액션 목소리(기합·비명) + 큰기술 컷인: 내 화면과 친구 화면이 같은 소리·같은 컷인 (npm run test:actvoice)
import { CityWorld } from '../src/game/city/cityWorld';
import { newProfile } from '../src/game/core/profile';
import type { PlayerProfile } from '../src/game/core/profile';
import { MOVES } from '../src/game/data/moves';
import { moveVoiceKind } from '../src/game/data/actionVoices';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const girl = (): PlayerProfile => ({ ...newProfile(), body: 'smallSilverGirl' });
type Inp = ReturnType<CityWorld['input']['read']>;
const idle = (): Inp => ({ move: null, run: false, interact: false });

// 기술 분류
check('kind: jab is a light shout', moveVoiceKind(MOVES.jab) === 'atk');
check('kind: uppercut is a heavy shout', moveVoiceKind(MOVES.uppercut) === 'heavy');
check('kind: character skills shout their own name', moveVoiceKind(MOVES.smallSilverFlyingKick) === 'skillFly' && moveVoiceKind(MOVES.smallSilverTornadoKick) === 'skillTornado' && moveVoiceKind(MOVES.smallSilverBackTurnKick) === 'skillBack');

// 큰기술: 내 외침 + 컷인, 같은 곳 친구도 같은 소리 + 컷인
{
  let next: Inp = idle();
  const A = new CityWorld({ read: () => next }, girl(), 41);
  const B = new CityWorld({ read: idle }, newProfile(), 42);
  B.upsertRemote('a', '친구A', '302', [], 'smallSilverGirl');
  const heardA: string[] = [];
  const heardB: { who: string; src: string; v: number }[] = [];
  A.onActionVoice = (who, src) => heardA.push(`${who} ${src}`);
  B.onActionVoice = (who, src, v) => heardB.push({ who, src, v });
  for (let i = 0; i < 5; i++) A.step();
  check('quiet: standing still makes no sound', heardA.length === 0, `(${heardA.join()})`);
  next = { ...idle(), skill: 'flyingKick' } as Inp;
  A.step();
  next = idle();
  for (let i = 0; i < 3; i++) A.step();
  check('skill: I shout the skill name', heardA.includes('me /voices/smallSilverGirl/act/skillFly.mp3'), `(${heardA.join()})`);
  check('skill: cut-in shows on my screen', A.cutIns.some((c) => c.who === 'me' && c.kind === 'skillFly'));
  const sent = A.actOut.splice(0);
  check('skill: the shout is sent to the town', sent.includes('skillFly'), `(${sent.join()})`);
  const ra = B.remotes.get('a')!;
  ra.room = B.roomKey;
  ra.fighter.x = B.player.x + 3;
  ra.fighter.z = B.player.z;
  for (const s of sent) B.receiveAct('a', s);
  check('skill: friend nearby hears the same shout', heardB.some((h) => h.who === 'a' && h.src.endsWith('/act/skillFly.mp3') && h.v > 0.5), `(${JSON.stringify(heardB)})`);
  check('skill: friend sees my cut-in too', B.cutIns.some((c) => c.who === 'a' && c.kind === 'skillFly'));

  // 맞으면 비명
  heardA.length = 0;
  for (let i = 0; i < 60; i++) A.step();
  heardA.length = 0;
  A.player.hp -= 5;
  A.step();
  check('hurt: getting hit makes a short cry', heardA.length === 1 && /act\/hurt\d\.mp3$/.test(heardA[0]), `(${heardA.join()})`);
  for (let i = 0; i < 30; i++) A.step();
  heardA.length = 0;
  A.player.hp -= 20;
  A.step();
  check('hurt: a big hit makes a scream', heardA.length === 1 && heardA[0].endsWith('/act/hurtBig.mp3'), `(${heardA.join()})`);

  // 다른 곳 · 모르는 소리 · 먼 곳
  heardB.length = 0;
  B.cutIns.length = 0;
  B.receiveAct('a', '<script>');
  B.receiveAct('a', 3);
  check('net: unknown sounds are ignored', heardB.length === 0);
  ra.fighter.x = B.player.x + 100;
  B.receiveAct('a', 'skillBack');
  check('net: too far away → silent and no cut-in', heardB.length === 0 && B.cutIns.length === 0);
  ra.fighter.x = B.player.x + 2;
  ra.room = 'somewhere-else';
  B.receiveAct('a', 'atk1');
  check('net: friend in another place is not heard', heardB.length === 0);
}

// 목소리가 없는 몸은 조용하다
{
  let next: Inp = idle();
  const A = new CityWorld({ read: () => next }, newProfile(), 43);
  const heard: string[] = [];
  A.onActionVoice = (_w, src) => heard.push(src);
  A.step();
  A.player.hp -= 5;
  next = { ...idle(), buttons: [true, false, false, false] } as Inp;
  for (let i = 0; i < 10; i++) A.step();
  check('body: characters without a voice stay silent', heard.length === 0 && A.actOut.length === 0, `(${heard.join()})`);
}
