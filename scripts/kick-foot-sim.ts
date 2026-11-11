// 땅에서 차는 발차기: 차는 발이 아닌 디딤발은 거의 움직이지 않아야 한다 (npm run test:kickfoot)
import * as THREE from 'three';
import { Fighter } from '../src/game/core/fighter';
import { MOVES } from '../src/game/data/moves';
import { Mannequin } from '../src/game/render/mannequin';
import { BODY_SPECS } from '../src/game/data/bodies';
import { NEUTRAL_INPUT } from '../src/game/core/input';

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
    // 타격 순간엔 머리 높이에서 맞히고, 맞히는 동안 계속 올라가 머리 위까지 간다
    const impactY = p.y;
    let topY = 0;
    for (let fr = m.startup + 2; fr <= m.startup + m.active - 1; fr++) {
      f.frame = fr;
      man.update(f, clock);
      man.root.updateMatrixWorld(true);
      topY = Math.max(topY, knee.localToWorld(new THREE.Vector3(0, -SHIN, 0)).y);
    }
    const headOk = impactY > headTop * 0.75 && impactY < headTop;
    console.log(`${headOk ? 'PASS' : 'FAIL'}  ${id}: 타격 순간 발이 머리 높이 (발 ${impactY.toFixed(2)}m, 키 ${headTop.toFixed(2)}m)`);
    console.log(`${topY > headTop ? 'PASS' : 'FAIL'}  ${id}: 발이 머리 위까지 올라간다 (발 ${topY.toFixed(2)}m, 키 ${headTop.toFixed(2)}m)`);
    if (!headOk || topY <= headTop) process.exitCode = 1;
  }
}

// 실제 게임처럼 Fighter 를 매 프레임 진행시켜도(스텝·돌진 포함) 디딤발이 월드에서 제자리에 있어야 한다
for (const [id, side] of [['midKick', 'R'], ['highKick', 'L'], ['lowKick', 'L'], ['sweep', 'R'], ['smallSilverBackTurnKick', 'L']] as const) {
  const move = MOVES[id];
  const f = new Fighter(0, 'A', { body: BODY_SPECS.female, canBlock: false });
  const foe = new Fighter(1, 'D', { canBlock: false });
  f.reset(0, 0, 0, 1);
  foe.reset(0, 6, 0, -1);
  const man = new Mannequin(0xffffff) as any;
  const clock = { t: 0, dt: 1 / 60, alpha: 1, sub: 0 };
  for (let i = 0; i < 30; i++) man.update(f, clock);
  f.queueMove(move);
  let maxD = 0;
  let start: THREE.Vector3 | null = null;
  for (let i = 0; i < 120; i++) {
    f.feed(NEUTRAL_INPUT);
    f.tick({ opponent: foe, awayX: 0, awayZ: -1 });
    if (f.state !== 'attack') break;
    man.update(f, clock);
    man.root.updateMatrixWorld(true);
    const knee = man.joints[side === 'L' ? 'knL' : 'knR'] as THREE.Object3D;
    const p = knee.localToWorld(new THREE.Vector3(0, -SHIN, 0));
    if (f.frame < 3) continue; // 가드 → 디딤 자세로 옮겨 딛는 첫 몇 프레임은 뺀다
    if (!start) start = p.clone();
    maxD = Math.max(maxD, Math.hypot(p.x - start.x, p.z - start.z));
  }
  const ok = maxD < 0.08;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}: 실제 진행(이동 포함) 중에도 디딤발이 월드에서 제자리 (최대 이동 ${(maxD * 100).toFixed(1)}cm)`);
  if (!ok) process.exitCode = 1;
}
