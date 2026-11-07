// 연습 모드 허수아비 검증: npx tsx scripts/training-sim.ts
import { Match } from '../src/game/core/match';
import * as ctrlDemo from '../src/game/core/controllers';
import * as combosMod from '../src/game/data/combos';
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

// 퍼펙트: 한 대도 안 맞고 라운드를 이기면 승리 문구에 PERFECT, 맞았으면 없음
function perfectRound(p1Hurt: boolean) {
  const p1 = new Script(), p2 = new Script();
  const m = new Match('versus', [p1, p2]);
  while (m.phase !== 'fight') m.step();
  m.fighters[0].x = -0.45; m.fighters[1].x = 0.45;
  if (p1Hurt) m.fighters[0].hp -= 5;
  m.fighters[1].hp = 1;
  p1.press(6, 2);
  p2.frames.push(...Array.from({ length: 20 }, () => ({ dir: 6 as Dir, buttons: [false, false, false, false] as RelInput['buttons'] })));
  let banner = '';
  for (let f = 0; f < 200; f++) { m.step(); const b = m.hud().banner; if (b && b.includes('WIN')) banner = b; }
  return { banner, perfects: m.hud().perfects[0] };
}
{
  const a = perfectRound(false), b = perfectRound(true);
  check('퍼펙트: 무피해 승리면 PERFECT', a.banner.includes('PERFECT') && a.perfects === 1, `(${a.banner})`);
  check('퍼펙트: 맞았으면 없음', b.banner.includes('WIN') && !b.banner.includes('PERFECT') && b.perfects === 0, `(${b.banner})`);
}

// 추천 콤보: 기술표에 적은 콤보가 실제로 끝까지 이어진다 (가드 안 하는 상대에게)
{
  const { COMBOS } = combosMod;
  for (const c of COMBOS) {
    let best = 0;
    for (const dist of [0.75, 0.9, 1.05, 1.6, 2.0]) {
      const p1 = new Script(), p2 = new Script();
      const m = new Match('training', [p1, p2]);
      m.fighters[0].x = -dist / 2; m.fighters[1].x = dist / 2;
      for (const st of c.steps) {
        p1.frames.push({ dir: st.dir, buttons: [1, 2, 3, 4].map((b) => st.buttons.includes(b)) as RelInput['buttons'] });
        for (let i = 0; i < st.wait; i++) p1.frames.push({ dir: 5, buttons: [false, false, false, false] });
      }
      p2.frames.push(...Array.from({ length: 240 }, () => ({ dir: 6 as Dir, buttons: [false, false, false, false] as RelInput["buttons"] })));
      let maxHits = 0;
      for (let f = 0; f < 240; f++) { m.step(); maxHits = Math.max(maxHits, m.fighters[1].combo); }
      best = Math.max(best, maxHits);
    }
    check(`추천 콤보 "${c.name}" ${c.hits}HIT 이상`, best >= c.hits, `(${best}HIT)`);
  }
}

// 콤보 시연: 연습 모드에서 DemoController 로 재생하면 허수아비('open')에게 콤보가 들어간다
{
  const { DemoController } = ctrlDemo;
  const { COMBOS } = combosMod;
  const c = COMBOS[1];
  const idle = new Script();
  const demo = new DemoController(idle);
  const dummy = new TrainingDummyController();
  dummy.mode = 'open';
  const m = new Match('training', [demo, dummy]);
  m.fighters[0].reset(-0.425, 0, 1, 0); m.fighters[1].reset(0.425, 0, -1, 0);
  const inputs: RelInput[] = [];
  for (const st of c.steps) { inputs.push({ dir: st.dir, buttons: [1, 2, 3, 4].map((b) => st.buttons.includes(b)) as RelInput['buttons'] }); for (let i = 0; i < st.wait; i++) inputs.push({ dir: 5, buttons: [false, false, false, false] }); }
  demo.play(inputs);
  let mx = 0;
  for (let f = 0; f < 200; f++) { m.step(); mx = Math.max(mx, m.fighters[1].combo); }
  check(`시연: "${c.name}" 이 실제로 ${c.hits}HIT`, mx >= c.hits && !demo.playing, `(${mx}HIT)`);
}

// ── 입력 기록: 같은 입력은 프레임 수로 합치고, 최신이 맨 위, 최대 개수 유지 ──
{
  const seq: RelInput[] = [
    ...Array.from({ length: 10 }, () => ({ dir: 5 as Dir, buttons: [false, false, false, false] as RelInput['buttons'] })),
    { dir: 3 as Dir, buttons: [false, true, false, false] },
    { dir: 3 as Dir, buttons: [false, true, false, false] },
    ...Array.from({ length: 30 }, (_, i) => ({ dir: (i % 2 ? 6 : 4) as Dir, buttons: [true, false, false, true] as RelInput['buttons'] })),
  ];
  const src: Controller = { read: () => seq.shift()! };
  const lg = new ctrlDemo.InputLogController(src, 14);
  const ctx = {} as Parameters<Controller['read']>[0];
  const first: RelInput[] = [];
  for (let i = 0; i < 12; i++) first.push(lg.read(ctx));
  check('입력 기록: 입력을 그대로 넘긴다', first[10].dir === 3 && first[10].buttons[1] === true);
  check('입력 기록: 같은 입력은 프레임 수로 합친다 (최신이 위)', lg.log.length === 2 && lg.log[0].dir === 3 && lg.log[0].frames === 2 && lg.log[0].buttons.join() === '2' && lg.log[1].frames === 10, JSON.stringify(lg.log));
  for (let i = 0; i < 30; i++) lg.read(ctx);
  check('입력 기록: 최대 14줄', lg.log.length === 14 && lg.log[0].buttons.join() === '1,4', String(lg.log.length));
}

// ── 허수아비 녹화 재생: 내가 녹화한 입력(→ 기준)을 허수아비가 나를 향해 똑같이 쓴다 ──
{
  const idle: RelInput = { dir: 5 as Dir, buttons: [false, false, false, false] };
  const upper: RelInput = { dir: 3 as Dir, buttons: [false, true, false, false] };
  const tape = ctrlDemo.trimTape([idle, idle, idle, upper, idle, idle]);
  check('녹화 앞뒤 빈 입력은 잘라낸다', tape.length === 1 && tape[0].dir === 3);
  // 1P 가 직접 쓴 기술
  const q = [upper];
  const mine = new Match('training', [{ read: () => q.shift() ?? idle }, new TrainingDummyController()]);
  let myMove = '';
  for (let i = 0; i < 30; i++) {
    mine.step();
    if (mine.fighters[0].move && !myMove) myMove = mine.fighters[0].move.id;
  }
  // 허수아비가 재생
  const d = new TrainingDummyController();
  d.mode = 'playback';
  d.setTape(tape);
  const m = new Match('training', [{ read: () => idle }, d]);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    m.step();
    const mv = m.fighters[1].move;
    if (mv) seen.add(mv.id);
  }
  check('허수아비 녹화 재생: 같은 기술을 나를 향해 쓴다', !!myMove && seen.has(myMove), `${myMove} / ${[...seen].join(',')}`);
  // 녹화기: 꺼 두면 안 모으고, 최대 길이에서 멈춘다
  const rec = new ctrlDemo.RecordingController({ read: () => upper });
  rec.enabled = false;
  rec.read({} as Parameters<Controller['read']>[0]);
  rec.enabled = true;
  rec.limit = 3;
  for (let i = 0; i < 10; i++) rec.read({} as Parameters<Controller['read']>[0]);
  check('녹화기: 꺼 두면 안 모으고 최대 길이에서 멈춤', rec.tape.length === 3);
}

// ── 연습 과제가 실제로 해낼 수 있는지: 앉아 가드 허수아비에게 4 HIT · 40 데미지 콤보 ──
{
  const run = (steps: [Dir, number[], number][]) => {
    const frames: RelInput[] = [];
    for (const [dir, b, w] of steps) {
      frames.push({ dir, buttons: [1, 2, 3, 4].map((x) => b.includes(x)) as RelInput['buttons'] });
      for (let i = 0; i < w; i++) frames.push({ dir: 5 as Dir, buttons: [false, false, false, false] });
    }
    const d = new TrainingDummyController();
    d.mode = 'crouch';
    const m = new Match('training', [{ read: () => frames.shift() ?? { dir: 5 as Dir, buttons: [false, false, false, false] } }, d]);
    m.fighters[0].x = -0.45;
    m.fighters[1].x = 0.45;
    let hits = 0;
    let dmg = 0;
    for (let f = 0; f < 320; f++) {
      m.step();
      hits = Math.max(hits, m.fighters[1].combo);
      dmg = Math.max(dmg, m.fighters[1].comboDamage);
    }
    return { hits, dmg };
  };
  const c4 = run([[3, [2], 28], [5, [1], 21], [6, [2], 22], [6, [2], 6], [5, [4], 4]]);
  check('과제 "4 HIT 콤보"를 해낼 수 있다 (↘+2 → 1 → →+2 → →+2)', c4.hits >= 4, `${c4.hits}HIT ${c4.dmg}`);
  const d40 = run([[3, [2], 36], [5, [2, 4], 11], [5, [1], 8], [2, [4], 16], [5, [1], 15], [5, [2], 33], [5, [2], 19]]);
  check('과제 "한 콤보로 40 데미지"를 해낼 수 있다', Math.max(c4.dmg, d40.dmg) >= 40, `${c4.dmg} / ${d40.dmg}`);
  // 서서 가드 허수아비는 어퍼컷(중단)을 막는다 → 기초 과제 힌트가 앉아 가드를 알려 줘야 함
  const stand = (() => {
    const frames: RelInput[] = [{ dir: 3 as Dir, buttons: [false, true, false, false] }];
    const m = new Match('training', [{ read: () => frames.shift() ?? { dir: 5 as Dir, buttons: [false, false, false, false] } }, new TrainingDummyController()]);
    m.fighters[0].x = -0.45;
    m.fighters[1].x = 0.45;
    for (let f = 0; f < 60; f++) m.step();
    return m.hud().lastHit?.result;
  })();
  check('서서 가드 허수아비는 어퍼컷을 막는다 (힌트: 앉아 가드)', stand === 'block', String(stand));
}

// ── 시연: 추천 콤보 전부 — 게임과 같은 거리(대시 콤보 2.0m, 나머지 0.85m)에서 실제로 HIT 수가 나온다 ──
for (const c of combosMod.COMBOS) {
  const demo = new ctrlDemo.DemoController(new Script());
  const dummy = new TrainingDummyController();
  dummy.mode = 'open';
  const m = new Match('training', [demo, dummy]);
  const dist = c.notation.startsWith('f,f') ? 2.0 : 0.85;
  m.fighters[0].reset(-dist / 2, 0, 1, 0);
  m.fighters[1].reset(dist / 2, 0, -1, 0);
  const inputs: RelInput[] = [];
  for (const st of c.steps) {
    inputs.push({ dir: st.dir, buttons: [1, 2, 3, 4].map((b) => st.buttons.includes(b)) as RelInput['buttons'] });
    for (let i = 0; i < st.wait; i++) inputs.push({ dir: 5, buttons: [false, false, false, false] });
  }
  demo.play(inputs);
  let mx = 0;
  for (let f = 0; f < 260; f++) {
    m.step();
    mx = Math.max(mx, m.fighters[1].combo);
  }
  check(`시연 전부: "${c.name}" ${c.hits}HIT`, mx >= c.hits, `(${mx}HIT)`);
}

// ── 허수아비 '가드 안 함' (연습 모드 기본): 중단도 맞고, 서서 가드로 바꾸면 다시 막는다 ──
{
  const hitWith = (mode: ctrlDemo.DummyMode) => {
    const frames: RelInput[] = [{ dir: 3 as Dir, buttons: [false, true, false, false] }];
    const d = new TrainingDummyController();
    d.mode = mode;
    const m = new Match('training', [{ read: () => frames.shift() ?? { dir: 5 as Dir, buttons: [false, false, false, false] } }, d]);
    m.fighters[0].x = -0.45;
    m.fighters[1].x = 0.45;
    for (let f = 0; f < 60; f++) m.step();
    return { res: m.hud().lastHit?.result, d, m };
  };
  const a = hitWith('noguard');
  check('가드 안 함: 어퍼컷(중단)이 맞는다', a.res === 'hit', String(a.res));
  a.d.mode = 'stand';
  a.m.step();
  check('서서 가드로 바꾸면 다시 막을 수 있다', a.m.fighters[1].canBlock === true);
  check('서서 가드: 어퍼컷을 막는다', hitWith('stand').res === 'block');
}
