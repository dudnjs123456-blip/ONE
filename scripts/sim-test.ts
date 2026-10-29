// 엔진 헤드리스 검증: npx tsx scripts/sim-test.ts
import { Match } from '../src/game/core/match';
import type { Controller } from '../src/game/core/controllers';
import type { RelInput } from '../src/game/core/input';
import type { Dir } from '../src/game/core/types';

class Script implements Controller {
  frames: RelInput[] = [];
  read() { return this.frames.shift() ?? { dir: 5 as Dir, buttons: [false, false, false, false] }; }
  hold(dir: Dir, n: number) { for (let i = 0; i < n; i++) this.frames.push({ dir, buttons: [false, false, false, false] }); return this; }
  press(dir: Dir, b: number) { this.frames.push({ dir, buttons: [0, 1, 2, 3].map((i) => i === b - 1) as RelInput['buttons'] }); return this; }
}

function setup(dist: number) {
  const p1 = new Script(), p2 = new Script();
  const m = new Match('training', [p1, p2]);
  m.fighters[0].x = -dist / 2; m.fighters[1].x = dist / 2;
  return { m, p1, p2 };
}
function run(m: Match, n: number) { for (let i = 0; i < n; i++) m.step(); }
function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) process.exitCode = 1; }

// 1) 잽 가드 → +1, 히트 → +8 : 양쪽이 행동 가능해지는 프레임 차이를 측정
for (const [label, p2Dir, expect] of [['jab on block', 4, 1], ['jab on hit', 6, 8]] as const) {
  const holdFrames = p2DirFrames(p2Dir);
  const { m, p1, p2 } = setup(1.1);
  p1.press(5, 1); p2.hold(p2Dir as Dir, holdFrames).hold(5, 100);
  let a = -1, d = -1;
  for (let f = 0; f < 80; f++) {
    m.step();
    const [A, D] = m.fighters;
    if (f > 2 && a < 0 && A.isActionable) a = m.frame;
    if (f > 2 && d < 0 && D.state !== 'walkF' && D.state !== 'walkB' && D.isActionable && m.lastHit) d = m.frame;
  }
  check(label, d - a === expect, `(adv ${d - a}, expected ${expect}, result ${m.lastHit?.result})`);
}

// 2) 어퍼 → 공중, 이후 잽 저글
{
  const { m, p1, p2 } = setup(1.0);
  p2.hold(6, 16);
  p1.press(3, 2).hold(5, 25).press(5, 1).hold(5, 15).press(5, 3);
  let air = false; run(m, 3);
  for (let f = 0; f < 70; f++) { m.step(); if (m.fighters[1].state === 'launched') air = true; }
  check('df+2 launches', air);
  check('juggle combo', m.fighters[1].combo >= 0 && (m.lastHit?.result === 'hit'), `(last=${m.lastHit?.name})`);
}

// 3) 상단은 앉은 상대에게 헛침
{
  const { m, p1, p2 } = setup(1.1);
  p2.hold(2, 60); p1.hold(5, 5).press(5, 1);
  run(m, 40);
  check('high whiffs vs crouch', m.lastHit === null);
}

// 4) 하단은 앉아서 가드
{
  const { m, p1, p2 } = setup(1.1);
  p2.hold(1, 60); p1.hold(5, 5).press(2, 4);
  run(m, 40);
  check('low blocked by crouch', m.lastHit?.result === 'block', `(${m.lastHit?.result})`);
}

// 5) 횡이동으로 직선기 회피 (중단킥 i14 동안 SS)
{
  const { m, p1, p2 } = setup(1.2);
  p2.hold(5, 2).hold(8, 1).hold(5, 40);
  p1.hold(5, 6).press(5, 3);
  run(m, 50);
  check('sidestep evades linear', m.lastHit === null, `(${m.lastHit?.result ?? 'none'})`);
}

// 6) 대시 (6,5,6)
{
  const { m, p1 } = setup(3);
  p1.hold(6, 1).hold(5, 1).hold(6, 1);
  run(m, 4);
  check('f,f dash', m.fighters[0].state === 'dash', `(${m.fighters[0].state})`);
}

function p2DirFrames(dir: number) { return dir === 6 ? 11 : 3; }

// 7) 점프: 떴다가 착지해서 다시 행동 가능
{
  const { m, p1 } = setup(3);
  p1.frames.push({ dir: 5, buttons: [false, false, false, false], jump: true });
  let maxY = 0;
  for (let i = 0; i < 60; i++) { m.step(); maxY = Math.max(maxY, m.fighters[0].y); }
  check('jump rises and lands', maxY > 0.5 && m.fighters[0].y === 0 && m.fighters[0].isActionable, `(max ${maxY.toFixed(2)}m)`);
}

// 8) 점프로 하단(로우킥)을 넘는다
{
  const { m, p1, p2 } = setup(1.1);
  // P2 가 먼저 뛰고, P1 로우킥(d+4 발생 10F 전후)이 공중에 있을 때 지나가게
  p2.frames.push({ dir: 5, buttons: [false, false, false, false], jump: true });
  p1.hold(5, 2).press(2, 4);
  run(m, 40);
  check('jump evades low', m.lastHit === null, `(${m.lastHit?.result ?? 'none'})`);
}

// 9) 대시 직후 공격: 대시 전용 기술 + 대시 속도가 실린다
{
  const { m, p1 } = setup(4);
  p1.hold(6, 1).hold(5, 1).hold(6, 1).press(6, 2).hold(5, 40);
  const x0 = m.fighters[0].x;
  let used = '';
  for (let i = 0; i < 30; i++) { m.step(); used ||= m.fighters[0].move?.id ?? ''; }
  const dashDist = m.fighters[0].x - x0;
  // 비교: 제자리 스트레이트
  const s = setup(4);
  s.p1.press(5, 2).hold(5, 40);
  const sx0 = s.m.fighters[0].x;
  run(s.m, 30);
  const standDist = s.m.fighters[0].x - sx0;
  check('dash → W = dash straight', used === 'dashStraight', `(${used})`);
  check('dash momentum carried', dashDist > standDist + 0.5, `(대시공격 ${dashDist.toFixed(2)}m vs 제자리 ${standDist.toFixed(2)}m)`);
}

// 10) 점프 중 공격: 날아차기가 나가고, 맞히고, 착지 후 정상 복귀 / 점프당 한 번
{
  const { m, p1, p2 } = setup(2.0);
  const J = { dir: 6 as const, buttons: [false, false, false, false] as [boolean, boolean, boolean, boolean], jump: true };
  p1.frames.push(J, ...Array(5).fill({ dir: 6, buttons: [false, false, false, false] }));
  p1.press(6, 3).hold(5, 3).press(5, 4).hold(5, 60); // 두 번째 발차기는 무시돼야 함
  p2.hold(6, 30); // 걸어 들어와서 가드 안 함
  const used: string[] = [];
  let airborneAtStart = false;
  for (let i = 0; i < 80; i++) {
    m.step();
    const f = m.fighters[0];
    if (f.move && !used.includes(f.move.id + f.moveSerial)) {
      used.push(f.move.id + f.moveSerial);
      if (f.move.id === 'jumpKick') airborneAtStart = f.y > 0.15;
    }
  }
  const kicks = used.filter((u) => u.startsWith('jumpKick')).length;
  check('jump + kick = flying kick in the air', kicks === 1 && airborneAtStart, `(${used.join(', ')})`);
  check('flying kick hits', m.lastHit?.name.startsWith('날아차기') === true, `(${m.lastHit?.name ?? 'none'} ${m.lastHit?.result ?? ''})`);
  check('lands and recovers', m.fighters[0].y === 0 && m.fighters[0].isActionable, `(state ${m.fighters[0].state})`);
}
