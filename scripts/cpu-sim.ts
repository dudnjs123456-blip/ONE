// CPU 난이도 검증: npx tsx scripts/cpu-sim.ts
// 난이도끼리 붙여서 어려움 > 보통 > 쉬움 순으로 이기는지 본다.
import { Match } from '../src/game/core/match';
import * as rewardMod from '../src/game/core/cpuReward';
import { newProfile } from '../src/game/core/profile';
import { CpuController, type CpuLevel } from '../src/game/core/controllers';
import * as ctrlMod from '../src/game/core/controllers';

function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) process.exitCode = 1; }

function series(a: CpuLevel, b: CpuLevel, n: number) {
  let winsA = 0, winsB = 0;
  for (let i = 0; i < n; i++) {
    // 좌우 자리 차이를 없애려고 번갈아 앉힌다
    const swap = i % 2 === 1;
    const ca = new CpuController(1000 + i * 7, 0, a), cb = new CpuController(5000 + i * 13, 0, b);
    const m = new Match('cpu', swap ? [cb, ca] : [ca, cb]);
    for (let f = 0; f < 60 * 60 * 6 && m.phase !== 'matchEnd'; f++) m.step();
    const [w0, w1] = m.wins;
    const aWon = swap ? w1 > w0 : w0 > w1, bWon = swap ? w0 > w1 : w1 > w0;
    if (aWon) winsA++; else if (bWon) winsB++;
  }
  return [winsA, winsB];
}

const N = 20;
const [h1, e1] = series('hard', 'easy', N);
check('어려움이 쉬움을 이긴다', h1 > e1 * 2, `(어려움 ${h1} : 쉬움 ${e1})`);
const [h2, n2] = series('hard', 'normal', N);
check('어려움이 보통을 이긴다', h2 > n2, `(어려움 ${h2} : 보통 ${n2})`);
const [n3, e3] = series('normal', 'easy', N);
check('보통이 쉬움을 이긴다', n3 > e3, `(보통 ${n3} : 쉬움 ${e3})`);

// 벽 활용: 어려움 CPU 끼리 붙이면 벽꽝이 실제로 나온다
{
  let walls = 0;
  for (let i = 0; i < 20; i++) {
    const m = new Match('cpu', [new CpuController(300 + i, 0, 'hard'), new CpuController(900 + i, 0, 'hard')]);
    for (let f = 0; f < 60 * 60 * 6 && m.phase !== 'matchEnd'; f++) {
      m.step();
      for (const e of m.drainEvents()) if (e.wall) walls++;
    }
  }
  check('어려움 CPU 는 벽꽝을 만든다', walls >= 4, `(20경기 벽꽝 ${walls}번)`);
}

// 횡보 회피: CPU 가 반응할 수 있을 때 직선기(라이트 스트레이트)가 나오면, 어려움은 가끔 막는 대신 옆으로 피한다
{
  const count = (lv: 'hard' | 'easy') => {
    let n = 0;
    for (let seed = 0; seed < 200; seed++) {
      const idle: import('../src/game/core/controllers').Controller = { read: () => ({ dir: 5, buttons: [false, false, false, false] }) };
      const m = new Match('training', [idle, idle]);
      const [opp, self] = m.fighters;
      opp.x = -0.5; self.x = 0.5;
      // 상대가 라이트 스트레이트를 막 시작한 순간
      opp.feed({ dir: 5, buttons: [false, true, false, false] });
      opp.tick({ opponent: self, awayX: 0, awayZ: -1 });
      // 동시 입력(2+4)을 잠깐 기다리므로 몇 프레임 더 진행해야 기술이 나간다
      for (let k = 0; k < 3 && opp.state !== 'attack'; k++) {
        opp.feed({ dir: 5, buttons: [false, false, false, false] });
        opp.tick({ opponent: self, awayX: 0, awayZ: -1 });
      }
      const cpu = new CpuController(seed, 0, lv);
      const out = cpu.read({ self, opponent: opp, forwardIsRight: false, frame: 1 });
      if (out.dir === 8 || out.dir === 2) n++;
    }
    return n;
  };
  const hard = count('hard'), easy = count('easy');
  check('어려움 CPU 는 직선기를 횡보로 피하기도 한다', hard >= 30 && hard <= 90, '(200번 중 ' + hard + '번)');
  check('쉬움 CPU 는 피하지 않는다 (가끔 견제로 옆걸음만)', easy < hard / 2, '(' + easy + '번)');
}

// VS CPU 승리 보상: 실제 경기를 이긴 뒤 보상, 난이도 첫 승리는 3배
{
  const { grantCpuReward, CPU_REWARD, FIRST_WIN_MULT } = rewardMod;
  const prof = newProfile();
  const g0 = prof.gold;
  // P1 자리에 어려움 CPU 를 앉혀 쉬움 CPU 를 이기게 한다
  const m = new Match('cpu', [new CpuController(11, 0, 'hard'), new CpuController(22, 0, 'easy')]);
  for (let f = 0; f < 60 * 60 * 6 && m.phase !== 'matchEnd'; f++) m.step();
  const won = m.wins[0] > m.wins[1];
  const first = won ? grantCpuReward(prof, 'easy', true) : 0;
  const second = won ? grantCpuReward(prof, 'easy', false) : 0;
  check('승리 보상: 첫 승리는 3배, 그다음은 기본', won && first === CPU_REWARD.easy * FIRST_WIN_MULT && second === CPU_REWARD.easy && prof.gold === g0 + first + second, `(경기 ${m.wins.join(':')}, ${first}G → ${second}G)`);
}

// CPU 성격: 어떤 성격이든 어려움은 쉬움을 이기고, 공격형은 수비형보다 기술을 더 많이 낸다
{
  const { CPU_STYLES } = ctrlMod;
  const styles = Object.keys(CPU_STYLES) as (keyof typeof CPU_STYLES)[];
  const bad: string[] = [];
  for (const st of styles) {
    let w = 0;
    for (let i = 0; i < 8; i++) {
      const m = new Match('cpu', [new CpuController(40 + i, 0, 'hard', st), new CpuController(80 + i, 0, 'easy', 'balanced')]);
      for (let f = 0; f < 60 * 60 * 6 && m.phase !== 'matchEnd'; f++) m.step();
      if (m.wins[0] > m.wins[1]) w++;
    }
    if (w < 6) bad.push(`${st} ${w}/8`);
  }
  check('성격과 상관없이 어려움 > 쉬움', bad.length === 0, bad.join(', '));
  const attacks = (st: keyof typeof CPU_STYLES) => {
    const m = new Match('training', [new CpuController(5, 0, 'normal', st), { read: () => ({ dir: 5, buttons: [false, false, false, false] }) }]);
    m.fighters[0].x = -0.5; m.fighters[1].x = 0.5;
    let n = 0, prev = -1;
    for (let f = 0; f < 60 * 30; f++) { m.step(); const s = m.fighters[0].moveSerial; if (s !== prev) { n++; prev = s; } }
    return n;
  };
  const ag = attacks('aggressive'), df = attacks('defensive');
  check('공격형이 수비형보다 기술을 더 많이 낸다', ag > df * 1.15, `(공격형 ${ag}, 수비형 ${df})`);
}
