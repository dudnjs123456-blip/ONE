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

// 기본 발차기·은빛 회오리 차기·뒤돌려차기는 옆이 아니라 앞(상대 쪽)으로 뻗어야 한다
for (const id of ['midKick', 'highKick', 'lowKick', 'smallSilverTornadoKick', 'smallSilverBackTurnKick'] as const) {
  const m = MOVES[id];
  const f = new Fighter(0, 'T');
  f.reset(0, 0, 0, 1); // +z 를 본다
  const man = new Mannequin(0xffffff) as any;
  const clock = { t: 0, dt: 1 / 60, alpha: 1, sub: 0 };
  for (let i = 0; i < 30; i++) man.update(f, clock);
  man.root.updateMatrixWorld(true);
  const headTop = new THREE.Box3().setFromObject(man.root).max.y;
  f.state = 'attack';
  f.move = m;
  for (let fr = 0; fr <= m.startup + 1; fr++) {
    f.frame = fr;
    man.update(f, clock);
  }
  man.root.updateMatrixWorld(true);
  const knee = man.joints[m.anim.endsWith('L') ? 'knL' : 'knR'] as THREE.Object3D;
  const p = knee.localToWorld(new THREE.Vector3(0, -SHIN, 0));
  const ang = (Math.atan2(-p.x, p.z) * 180) / Math.PI;
  console.log(`${Math.abs(ang) < 15 ? 'PASS' : 'FAIL'}  ${id}: 발이 앞으로 뻗는다 (방향 ${ang.toFixed(0)}°)`);
  if (id === 'smallSilverBackTurnKick') {
    console.log(`${p.y > headTop ? 'PASS' : 'FAIL'}  ${id}: 발이 머리 위까지 올라간다 (발 ${p.y.toFixed(2)}m, 키 ${headTop.toFixed(2)}m)`);
  }
}
