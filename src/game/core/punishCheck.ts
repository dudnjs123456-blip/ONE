import { Match } from './match';
import { TrainingDummyController, type Controller } from './controllers';
import { DASH_MOVES, DIR_OF_KEY, PLAYER_MOVE_LIST } from '../data/moves';
import type { Button } from './types';
import type { RelInput } from './input';

/**
 * 기술마다 "막힌 뒤 반격당하나"를 실제 엔진으로 돌려 본다 (가드 후 반격 허수아비 상대로, 붙은·중간·먼 거리).
 * 손해 프레임만으로는 모른다 — 많이 밀어내는 기술은 손해가 커도 잽이 닿지 않는다.
 * @returns 기술 id → true(반격당함) / false(안전) / null(막히지 않아 판단 불가: 잡기 등)
 */
let cache: Record<string, boolean | null> | null = null;
export function punishableMoves(): Record<string, boolean | null> {
  if (cache) return cache;
  const out: Record<string, boolean | null> = {};
  const N: RelInput = { dir: 5, buttons: [false, false, false, false] };
  const btn = (...bs: number[]) => [1, 2, 3, 4].map((b) => bs.includes(b)) as RelInput['buttons'];
  for (const mv of PLAYER_MOVE_LIST) {
    // 입력 순서: 일반 기술은 방향+버튼, 대시 기술은 →,→ 대시 후 버튼
    let seq: RelInput[] | null = null;
    if (mv.input) {
      const input = mv.input;
      seq = [{ dir: DIR_OF_KEY[input.dir], buttons: btn(input.button, input.with ?? 0) }];
    } else {
      const dashBtn = (Object.entries(DASH_MOVES) as [string, string][]).find(([, id]) => id === mv.id)?.[0];
      if (dashBtn) seq = [{ dir: 6, buttons: btn() }, N, { dir: 6, buttons: btn() }, { dir: 6, buttons: btn(Number(dashBtn) as Button) }];
    }
    if (!seq) continue;
    let blocked = false;
    let punished = false;
    // 대시 기술은 대시로 다가가므로 더 멀리서 시작
    const dists = mv.input ? [0.7, 0.85, 1.0] : [1.6, 2.0, 2.4];
    for (const dist of dists) {
      const q: RelInput[] = [...seq];
      const p1: Controller = { read: () => q.shift() ?? N };
      const dummy = new TrainingDummyController();
      dummy.mode = 'punish';
      const m = new Match('training', [p1, dummy]);
      m.fighters[0].x = -dist / 2;
      m.fighters[1].x = dist / 2;
      for (let f = 0; f < 100; f++) {
        m.step();
        const h = m.lastHit;
        if (h?.attacker === 0 && h.result === 'block') blocked = true;
        if (blocked && h?.attacker === 1 && h.result !== 'block') punished = true;
      }
    }
    out[mv.id] = blocked ? punished : null;
  }
  cache = out;
  return out;
}
