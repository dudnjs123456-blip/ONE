import {
  COUNTER_HITSTUN_BONUS,
  FIGHTER_RADIUS,
  HITSTOP_BLOCK,
  HITSTOP_COUNTER,
  HITSTOP_HIT,
  HITSTOP_KO,
  HIT_WIDTH,
} from './constants';
import type { Fighter } from './fighter';
import { totalFrames, type MoveDef } from '../data/moves';

/** 히트 이펙트용 이벤트. 렌더러가 소비한다. */
export interface CombatEvent {
  kind: 'hit' | 'counter' | 'block';
  x: number;
  y: number;
  z: number;
  damage: number;
  /** 맞은 쪽 Fighter.index */
  victim: number;
  /** 묵직한 기술 (강공격·띄우기) — 이펙트·화면 흔들림을 크게 */
  heavy: boolean;
}

export interface HitInfo {
  attacker: number;
  name: string;
  notation: string;
  startup: number;
  result: 'hit' | 'counter' | 'block';
  /** 공격자 기준 프레임 이득. 띄우기/다운이면 null */
  advantage: number | null;
  damage: number;
}

export interface PendingHit {
  att: Fighter;
  def: Fighter;
  mv: MoveDef;
  blocked: boolean;
  counter: boolean;
}

export interface HitOutcome {
  hitstop: number;
  event: CombatEvent;
  info: HitInfo;
}

/** att 의 현재 공격이 def 에 닿는지 판정. 실제 적용은 applyHit. */
export function detectHit(att: Fighter, def: Fighter): PendingHit | null {
  const mv = att.move;
  if (!mv || !att.isInActiveFrames() || att.moveHits.includes(def) || def.isInvulnerable()) return null;

  // 공격자의 (고정된) 정면 기준 좌표로 상대 위치를 본다. 횡이동하면 lateral 이 커져 빗나간다.
  const dx = def.x - att.x;
  const dz = def.z - att.z;
  const along = dx * att.fx + dz * att.fz;
  const lateral = Math.abs(dx * att.fz - dz * att.fx);
  if (along <= 0 || along - FIGHTER_RADIUS > mv.range || lateral > HIT_WIDTH + mv.tracking) return null;

  const airborne = def.isAirborne();
  if (mv.level === 'high' && def.isCrouching() && !airborne) return null; // 상단은 앉은 상대에게 헛친다
  const jumping = def.state === 'jump' || (def.state === 'attack' && !!def.move?.aerial);
  if (mv.level === 'low' && jumping && def.y > 0.25) return null; // 하단은 점프로 넘는다

  const stance = airborne || !def.canBlock ? null : def.blockStance();
  const blocked = (stance === 'stand' && mv.level !== 'low') || (stance === 'crouch' && mv.level === 'low');
  return { att, def, mv, blocked, counter: !blocked && def.isCounterable() };
}

export function applyHit({ att, def, mv, blocked, counter }: PendingHit): HitOutcome {
  att.moveHits.push(def);
  // 공격자가 다시 행동 가능해지기까지 남은 틱 수
  const remaining = totalFrames(mv) - att.frame + 1;
  const pos = {
    x: def.x - att.fx * FIGHTER_RADIUS,
    y: def.y + (mv.level === 'high' ? 1.55 : mv.level === 'mid' ? 1.1 : 0.35),
    z: def.z - att.fz * FIGHTER_RADIUS,
  };
  const base = { attacker: att.index, name: mv.name, notation: mv.notation, startup: mv.startup };
  const heavy = mv.damage >= 14 || !!mv.launch;

  if (blocked) {
    def.receiveBlock(mv, remaining);
    return {
      hitstop: HITSTOP_BLOCK,
      event: { kind: 'block', ...pos, damage: 0, victim: def.index, heavy },
      info: { ...base, result: 'block', advantage: mv.onBlock, damage: 0 },
    };
  }

  const wasAirborne = def.isAirborne();
  const damage = def.receiveHit(mv, counter, remaining, att.power);
  const kind = counter ? 'counter' : 'hit';
  return {
    hitstop: def.hp <= 0 ? HITSTOP_KO : counter ? HITSTOP_COUNTER : HITSTOP_HIT,
    event: { kind, ...pos, damage, victim: def.index, heavy },
    info: {
      ...base,
      result: kind,
      advantage: def.isAirborne() || wasAirborne ? null : mv.onHit + (counter ? COUNTER_HITSTUN_BONUS : 0),
      damage,
    },
  };
}
