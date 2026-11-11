// 땅에서 차는 발차기: 차는 발이 아닌 디딤발은 거의 움직이지 않아야 한다 (npm run test:kickfoot)
import * as THREE from 'three';
import { Fighter } from '../src/game/core/fighter';
import { MOVES } from '../src/game/data/moves';
import { Mannequin } from '../src/game/render/mannequin';

const SHIN = 0.46;
for (const [id, side] of [['smallSilverBackTurnKick', 'L'], ...Object.entries(MOVES).filter(([, m]) => ['midKickL', 'sweepL', 'highKickR', 'lowKickR', 'kneeR'].includes(m.anim)).map(([k, m]) => [k, m.anim.endsWith('L') ? 'R' : 'L'])] as [string, 'L' | 'R'][]) {
  const f = new (Fighter as any)(0, 0, 0, 1);
  const man = new Mannequin(0xffffff) as any;
  const clock = { t: 0, dt: 1 / 60, alpha: 1, sub: 0 };
  for (let i = 0; i < 30; i++) man.update(f, clock); // 가드 안정
  const move = MOVES[id as keyof typeof MOVES];
  const total = move.startup + move.active + move.recovery;
  f.state = 'attack'; f.move = move;
  let maxD = 0; let start: THREE.Vector3 | null = null;
  for (let fr = 0; fr < total; fr++) {
    f.frame = fr;
    man.update(f, clock);
    man.root.updateMatrixWorld(true);
    const knee = man.joints[side === 'L' ? 'knL' : 'knR'] as THREE.Object3D;
    const p = knee.localToWorld(new THREE.Vector3(0, -SHIN, 0));
    if (!start) start = p.clone();
    maxD = Math.max(maxD, Math.hypot(p.x - start.x, p.z - start.z));
  }
  const ok = maxD < 0.08;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}: 발차기 중 디딤발이 제자리에 붙어 있다 (최대 이동 ${(maxD * 100).toFixed(1)}cm)`);
}
