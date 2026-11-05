// 연습 모드 허수아비 검증: npx tsx scripts/training-sim.ts
import { Match } from '../src/game/core/match';
import { MOVES, playerStartup } from '../src/game/data/moves';
import { punishableMoves } from '../src/game/core/punishCheck';
import { TrainingDummyController, type Controller } from '../src/game/core/controllers';
import type { RelInput } from '../src/game/core/input';
import type { Dir } from '../src/game/core/types';

function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) process.exitCode = 1; }

class Script implements Controller {
  frames: RelInput[] = [];
  read() { return this.frames.shift() ?? { dir: 5 as Dir, buttons: [false, false, false, false] }; }
  press(dir: Dir, b: number) { this.frames.push({ dir, buttons: [0, 1, 2, 3].map((i) => i === b - 1) as RelInput['buttons'] }); return this; }
}

/** 플레이어가 기술 하나를 쓰고, 허수아비 반응 후 결과를 본다 */
function tryMove(mode: TrainingDummyController['mode'], dir: Dir, button: number, dist = 0.9) {
  const p1 = new Script(), dummy = new TrainingDummyController();
  dummy.mode = mode;
  const m = new Match('training', [p1, dummy]);
  m.fighters[0].x = -dist / 2; m.fighters[1].x = dist / 2;
  const hp0 = m.fighters[0].hp;
  p1.press(dir, button);
  const results: string[] = [];
  for (let f = 0; f < 120; f++) {
    m.step();
    if (m.lastHit && results[results.length - 1] !== `${m.lastHit.attacker}:${m.lastHit.result}`) results.push(`${m.lastHit.attacker}:${m.lastHit.result}`);
  }
  return { results, playerHit: m.fighters[0].hp < hp0 || results.some((r) => r.startsWith('1:hit') || r.startsWith('1:counter')) };
}

{
  const r = tryMove('stand', 5, 1);
  check('서서 가드: 잽을 막는다', r.results[0] === '0:block', r.results.join(' '));
}
{
  const r = tryMove('stand', 2, 4);
  check('서서 가드: 하단은 맞는다', r.results[0] === '0:hit', r.results.join(' '));
}
{
  const r = tryMove('crouch', 2, 4);
  check('앉아 가드: 하단을 막는다', r.results[0] === '0:block', r.results.join(' '));
}
{
  const r = tryMove('punish', 3, 2, 0.8);
  check('가드 후 반격: 막힌 어퍼(-13)는 반격당한다', r.results[0] === '0:block' && r.playerHit, r.results.join(' '));
}
{
  const r = tryMove('punish', 5, 1);
  check('가드 후 반격: 잽(+1)은 반격당하지 않는다', r.results[0] === '0:block' && !r.playerHit, r.results.join(' '));
}
{
  let stand = 0, crouch = 0;
  for (let i = 0; i < 1; i++) {
    const p1 = new Script(), dummy = new TrainingDummyController();
    dummy.mode = 'random';
    const m = new Match('training', [p1, dummy]);
    m.fighters[0].x = -0.45; m.fighters[1].x = 0.45;
    for (let k = 0; k < 20; k++) {
      p1.press(5, 1);
      for (let w = 0; w < 39; w++) p1.frames.push({ dir: 5, buttons: [false, false, false, false] });
    }
    for (let f = 0; f < 20 * 40 + 60; f++) {
      m.step();
      if (m.fighters[1].state === 'crouch') crouch++;
      else if (m.fighters[1].state === 'idle' || m.fighters[1].state === 'blockstun') stand++;
    }
  }
  check('랜덤 가드: 서기와 앉기를 섞는다', stand > 50 && crouch > 50, `(서기 ${stand}F, 앉기 ${crouch}F)`);
}

// 잡기 (f+1+3): 서서 막아도 들어가고, 앉으면 헛친다
function tryGrab(mode: TrainingDummyController['mode']) {
  const p1 = new Script(), dummy = new TrainingDummyController();
  dummy.mode = mode;
  const m = new Match('training', [p1, dummy]);
  m.fighters[0].x = -0.3; m.fighters[1].x = 0.3;
  for (let i = 0; i < 20; i++) m.step(); // 앉기 자세가 잡히도록 잠깐 기다림
  p1.frames.push({ dir: 6, buttons: [true, false, true, false] });
  const hp0 = m.fighters[1].hp;
  let name = '';
  for (let f = 0; f < 90; f++) { m.step(); if (m.lastHit) name = `${m.lastHit.name}:${m.lastHit.result}`; }
  return { dmg: hp0 - m.fighters[1].hp, name, attackName: name || '(헛침)' };
}
{
  const r = tryGrab('stand');
  check('잡기: 서서 가드해도 들어간다', r.dmg > 0 && r.name.startsWith('잡아 던지기') && r.name.endsWith('hit'), `(${r.attackName}, ${r.dmg} dmg)`);
}
{
  const r = tryGrab('crouch');
  check('잡기: 앉으면 피한다', r.dmg === 0, `(${r.attackName})`);
}

// 잡기 풀기: 잡히기 직전에 1 을 누르면 풀린다 (가드 중이라 공격이 안 나가는 상황)
{
  const p1 = new Script(), p2 = new Script();
  const m = new Match('training', [p1, p2]);
  m.fighters[0].x = -0.3; m.fighters[1].x = 0.3;
  for (let i = 0; i < 10; i++) m.step();
  p1.frames.push({ dir: 6, buttons: [true, false, true, false] });
  // P2: 잡기 발생 몇 프레임 전에 1 을 누른다 (막 움직이기 시작한 틈 없이 같은 프레임에 겹치게)
  for (let i = 0; i < 6; i++) p2.frames.push({ dir: 5, buttons: [false, false, false, false] });
  p2.frames.push({ dir: 4, buttons: [true, false, false, false] });
  const hp0 = m.fighters[1].hp;
  const names: string[] = [];
  for (let f = 0; f < 90; f++) { m.step(); if (m.lastHit && names[names.length - 1] !== m.lastHit.name) names.push(m.lastHit.name); }
  check('잡기 풀기: 직전에 1 을 누르면 풀린다', m.fighters[1].hp === hp0 && names.includes('잡기 풀기!'), `(${names.join(' → ') || '없음'}, 데미지 ${hp0 - m.fighters[1].hp})`);
}

// 레이지: 대전에서 체력 20% 이하면 데미지가 10% 오른다 (연습 모드엔 없음)
function jabDamage(mode: 'versus' | 'training', attackerHp: number) {
  const p1 = new Script(), p2 = new Script();
  const m = new Match(mode, [p1, p2]);
  while (m.phase !== 'fight') m.step();
  m.fighters[0].x = -0.45; m.fighters[1].x = 0.45;
  m.fighters[0].hp = attackerHp;
  m.fighters[1].hp = m.fighters[1].maxHp;
  p1.press(6, 2); // 보디 블로. P2 는 앞으로 걸어서(가드 안 함) 그대로 맞는다
  p2.frames.push(...Array.from({ length: 40 }, () => ({ dir: 6 as Dir, buttons: [false, false, false, false] as RelInput['buttons'] })));
  const hp0 = m.fighters[1].hp;
  for (let f = 0; f < 40; f++) m.step();
  return { dmg: hp0 - m.fighters[1].hp, rage: m.hud().fighters[0].rage };
}
{
  const normal = jabDamage('versus', 100);
  const rage = jabDamage('versus', 10);
  const train = jabDamage('training', 10);
  check('레이지: 체력 적으면 데미지 증가', rage.rage && rage.dmg > normal.dmg && normal.dmg > 0, `(보통 ${normal.dmg}, 레이지 ${rage.dmg})`);
  check('레이지: 연습 모드엔 없음', !train.rage && train.dmg === normal.dmg, `(${train.dmg})`);
}

// 경기 종료 화면용 최대 콤보 기록: 띄우기 → 공중 잽이 2HIT 이상으로 남는다
{
  const p1 = new Script(), p2 = new Script();
  const m = new Match('versus', [p1, p2]);
  while (m.phase !== 'fight') m.step();
  m.fighters[0].x = -0.4; m.fighters[1].x = 0.4;
  p1.press(3, 2);
  for (let i = 0; i < 24; i++) p1.frames.push({ dir: 5, buttons: [false, false, false, false] });
  p1.press(5, 1);
  for (let i = 0; i < 8; i++) p1.frames.push({ dir: 5, buttons: [false, false, false, false] });
  p1.press(5, 1);
  p2.frames.push(...Array.from({ length: 20 }, () => ({ dir: 6 as Dir, buttons: [false, false, false, false] as RelInput['buttons'] })));
  for (let f = 0; f < 120; f++) m.step();
  const b = m.hud().bestCombo;
  check('최대 콤보 기록', b[0].hits >= 2 && b[0].damage > 0 && b[1].hits === 0, `(P1 ${b[0].hits}HIT ${b[0].damage}, P2 ${b[1].hits})`);
  m.restart();
  check('다시 시작하면 콤보 기록 초기화', m.hud().bestCombo[0].hits === 0);
}

// 벽꽝: 경기장 끝 근처에서 세게 밀어내는 기술(보디 블로)을 맞으면 벽에 붙어 오래 경직
function wallTest(edge: boolean) {
  const p1 = new Script(), p2 = new Script();
  const m = new Match('versus', [p1, p2]);
  while (m.phase !== 'fight') m.step();
  const base = edge ? 5.6 : -0.4;
  m.fighters[0].x = base; m.fighters[1].x = base + 0.8;
  m.fighters[0].z = 0; m.fighters[1].z = 0;
  p1.press(6, 2);
  p2.frames.push(...Array.from({ length: 12 }, () => ({ dir: 6 as Dir, buttons: [false, false, false, false] as RelInput['buttons'] })));
  let wall = false, stunFrames = 0;
  for (let f = 0; f < 90; f++) {
    m.step();
    for (const e of m.drainEvents()) if (e.wall) wall = true;
    if (m.fighters[1].state === 'hitstun') stunFrames++;
  }
  return { wall, stunFrames };
}
{
  const atWall = wallTest(true), mid = wallTest(false);
  check('벽꽝: 끝에서 세게 맞으면 벽에 붙는다', atWall.wall && atWall.stunFrames > mid.stunFrames + 15, `(벽 ${atWall.stunFrames}F vs 가운데 ${mid.stunFrames}F)`);
  check('벽꽝: 가운데에선 안 난다', !mid.wall);
}

// 횡보: 위를 톡 = 한 번 비키기, 위를 누르고 있기 = 옆으로 계속 걷기
function sideMove(holdFrames: number) {
  const p1 = new Script(), p2 = new Script();
  const m = new Match('training', [p1, p2]);
  m.fighters[0].x = -1.5; m.fighters[1].x = 1.5;
  for (let i = 0; i < 5; i++) m.step();
  const z0 = m.fighters[0].z;
  for (let i = 0; i < holdFrames; i++) p1.frames.push({ dir: 8, buttons: [false, false, false, false] });
  for (let f = 0; f < 70; f++) m.step();
  return { dist: Math.abs(m.fighters[0].z - z0), state: m.fighters[0].state };
}
{
  const tap = sideMove(1), hold = sideMove(60);
  check('횡보: 누르고 있으면 더 멀리 옆으로 걷는다', hold.dist > tap.dist * 2, `(톡 ${tap.dist.toFixed(2)}m, 누르기 ${hold.dist.toFixed(2)}m)`);
  check('횡보: 톡은 한 번만 비키고 멈춘다', tap.state === 'idle' && tap.dist > 0.3, `(${tap.state})`);
}

// 기술표의 발생 프레임 = 경기 중 실제 발생 (템포 보정 포함)
{

  const cases: [string, Dir, number][] = [['jab', 5, 1], ['straight', 5, 2], ['highKick', 5, 4], ['uppercut', 3, 2]];
  const bad: string[] = [];
  for (const [id, dir, btn] of cases) {
    const p1 = new Script(), p2 = new Script();
    const m = new Match('training', [p1, p2]);
    m.fighters[0].x = -0.45; m.fighters[1].x = 0.45;
    p1.press(dir, btn);
    for (let f = 0; f < 60 && !m.lastHit; f++) m.step();
    const shown = playerStartup(MOVES[id]);
    if (m.lastHit?.startup !== shown) bad.push(`${id}: 표 ${shown} / 실제 ${m.lastHit?.startup}`);
  }
  check('기술표 발생 프레임이 실제와 같다', bad.length === 0, bad.join(', '));
}

// 반격 기준 = 실제 잽 속도: 막힌 하이 킥(-9)은 잽(8F)으로 반격당한다, 중단 잽(-1)은 안 당한다
{
  const pm = punishableMoves();
  check('반격 판정: 어퍼(-13)·로우킥(-13, 앉아 막고 중단 잽)은 반격당한다', pm.uppercut === true && pm.lowKick === true);
  check('반격 판정: 하이 킥(-9)·드롭킥(-18)은 멀리 밀어내서 안전', pm.highKick === false && pm.dropKick === false);
  check('반격 판정: 잡기는 막히지 않음', pm.grab === null);
  const mj = tryMove('punish', 3, 1);
  check('가드 후 반격: 막힌 중단 잽(-1)은 안 당한다', mj.results[0] === '0:block' && !mj.playerHit, mj.results.join(' '));
}
