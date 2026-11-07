// 모든 시뮬 테스트를 차례로 돌리고 요약: npm run test:all
import { spawnSync } from 'node:child_process';

const TESTS = ['sim', 'cpu', 'touch', 'training', 'field', 'boss', 'city', 'save', 'npc', 'mp', 'fish', 'karaoke', 'weather', 'share'];
let failed = 0;
for (const t of TESTS) {
  const r = spawnSync('npm', ['run', '-s', `test:${t}`], { encoding: 'utf8', shell: true });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL'));
  const passes = out.split('\n').filter((l) => l.startsWith('PASS')).length;
  const bad = fails.length > 0 || r.status !== 0;
  if (bad) failed++;
  console.log(`${bad ? '✗' : '✓'} test:${t}  (PASS ${passes}${fails.length ? `, FAIL ${fails.length}` : ''}${r.status ? `, 종료코드 ${r.status}` : ''})`);
  for (const f of fails) console.log('    ' + f);
}
console.log(failed ? `\n${failed}개 테스트 묶음 실패` : '\n전부 통과');
process.exitCode = failed ? 1 : 0;
