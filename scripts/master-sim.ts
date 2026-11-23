// 마스터 계정: 장면 고르기 → 그 장면 상태 · 다시 고르기 · 되돌리기 (npm run test:master)
import { newProfile } from '../src/game/core/profile';
import { nextObjective, sceneForNpc } from '../src/game/story/chapter0';
import { ch1Objective, ch1SceneForNpc } from '../src/game/story/chapter1';
import { STORY_ENTRIES, hasStoryBackup, isMaster, jumpToStory, restoreStory } from '../src/game/story/master';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

check('master account is recognized', isMaster('master') && isMaster('MASTER') && !isMaster('someone') && !isMaster(null));
check('every chapter has entries', ['프롤로그', '0장', '1장'].every((c) => STORY_ENTRIES.some((e) => e.chapter === c)));

const p = newProfile();
p.dimension = { visits: 12, prologue: true, ch0: { notes: { body: 2, where: 2, home: 2, shadow: 1, fist: 2 }, done: true }, ch1: { step: 'done', root: '공', skillName: '내 기술' }, met: ['noa'] };

jumpToStory(p, 'prologue');
check('prologue: plays again from the start', p.dimension!.prologue === false && !p.dimension!.ch0 && !p.dimension!.ch1);
check('first jump backs up the real progress', hasStoryBackup(p) && p.dimension!.masterBackup?.ch1?.skillName === '내 기술');

jumpToStory(p, 'ch0:wake');
check('0장 ①: rescue scene first, fresh chapter 0', p.dimension!.prologue === true && !p.dimension!.ch0 && p.dimension!.replayRescue === true);
jumpToStory(p, 'ch0:noa');
check('0장 ③: noa is next, no "came back from Seoul" scene', nextObjective(p.dimension!.ch0!)?.npc === 'noa' && sceneForNpc('noa', p.dimension!.ch0!)?.id === 'noa' && p.dimension!.ch0!.since === 13);

jumpToStory(p, 'ch1:noa');
check('1장 ④: chapter 0 done, noa reads the root', !!p.dimension!.ch0?.done && ch1SceneForNpc('noa', p.dimension!.ch1!, p)?.id === 'read');
jumpToStory(p, 'ch1:quest');
check('1장 ⑦: goblin quest from 0/3 with a root', p.dimension!.ch1!.step === 'quest' && p.dimension!.ch1!.questKills === 0 && !!p.dimension!.ch1!.root && ch1Objective(p.dimension!.ch1!)?.kind === 'hunt');
jumpToStory(p, 'ch1:badge');
check('1장 ⑧: badge from maru, skill already named', ch1SceneForNpc('maru', p.dimension!.ch1!, p)?.id === 'badge' && !!p.dimension!.ch1!.skillName);
check('backup still holds the original (not overwritten by later jumps)', p.dimension!.masterBackup?.ch1?.step === 'done');

// 진행한 뒤 다시 같은 장면
p.dimension!.ch1!.step = 'done';
jumpToStory(p, 'ch1:start');
check('can re-enter a chapter after finishing it', (p.dimension!.ch1!.step as string) === 'start');

check('restore brings back the real progress', restoreStory(p) && p.dimension!.ch1?.step === 'done' && p.dimension!.ch1?.skillName === '내 기술' && !hasStoryBackup(p));
check('unknown entry does nothing', !jumpToStory(p, 'ch9:nope'));
