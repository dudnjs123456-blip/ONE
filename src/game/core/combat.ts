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
import { moveReach, strikeContact } from './reach';
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
  /** 벽꽝 (경기장 끝에 부딪힘) */
  wall?: boolean;
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
  /** 주먹/발이 닿은 점 (히트 이펙트 위치) */
  at?: { x: number; y: number; z: number };
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

  // 사람 캐릭터: 주먹/발이 상대 몸에 실제로 닿은 프레임에만 맞는다 (뻗기 전·빗나간 공격은 헛친다)
  const contact = strikeContact(att, def);
  if (contact === null) return null;
  if (contact === undefined) {
    // 부위 판정이 없는 공격(보스 몸통 박치기·몬스터 등): 정면 사거리 상자
    // 공격자의 (고정된) 정면 기준 좌표로 상대 위치를 본다. 횡이동하면 lateral 이 커져 빗나간다.
    const dx = def.x - att.x;
    const dz = def.z - att.z;
    const along = dx * att.fx + dz * att.fz;
    const lateral = Math.abs(dx * att.fz - dz * att.fx);
    if (along <= 0 || along - FIGHTER_RADIUS > mv.range || lateral > HIT_WIDTH + mv.tracking) return null;
  }

  const airborne = def.isAirborne();
  if (mv.level === 'high' && def.isCrouching() && !airborne) return null; // 상단은 앉은 상대에게 헛친다
  const jumping = def.state === 'jump' || (def.state === 'attack' && !!def.move?.aerial);
  if (mv.level === 'low' && jumping && def.y > 0.25) return null; // 하단은 점프로 넘는다

  const stance = airborne || !def.canBlock ? null : def.blockStance();
  const blocked = !mv.unblockable && ((stance === 'stand' && mv.level !== 'low') || (stance === 'crouch' && mv.level === 'low'));
  const at = contact ? { x: contact.x, y: contact.y, z: contact.z } : undefined;
  return { att, def, mv, blocked, counter: !blocked && def.isCounterable(), at };
}

/** 상대를 보고 있다고 치는 시야 (정면 ±60°) */
const WATCH_COS = Math.cos(Math.PI / 3);
/** 이만큼 더 떨어지면 닿지도 않을 공격이라 피할 필요가 없다 */
const THREAT_MARGIN = 0.5;

/**
 * 자동 회피: def 가 att 를 보고 있고, att 의 공격이 시작된 지 def 의 반응 프레임이 지났으면 뒤로 피한다.
 * 피하는 모션은 항상 나가고, 실제로 피했는지는 주먹/발이 닿는지(detectHit)로 정해진다
 * — 반응이 늦거나 너무 가까우면 피하는 도중에 맞는다. 공격 판정 검사 직전에 매 프레임 부른다.
 * @returns 이번 프레임에 피하기 시작했나
 */
export function autoDodge(def: Fighter, att: Fighter): boolean {
  const mv = att.move;
  const spec = def.body;
  if (!def.autoDodge || !spec || att === def || att.state !== 'attack' || !mv) return false;
  if (def.dodged && def.dodged.from === att && def.dodged.serial === att.moveSerial) return false;
  if (!def.isActionable || def.isAirborne()) return false;
  // 사람이 조작하는 동안엔 끈다 (손을 놓고 있을 때만 몸이 알아서 피한다)
  if (def.isUnderControl()) return false;
  // 이미 맞았거나, 맞는 순간이 지났으면 늦었다
  if (att.moveHits.includes(def) || att.frame > mv.startup + mv.active - 1) return false;
  if (att.frame < spec.reaction) return false;
  const dx = att.x - def.x;
  const dz = att.z - def.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return false;
  // 나를 보고 있나 (시선 안에 공격자가 있다)
  if ((def.fx * dx + def.fz * dz) / dist < WATCH_COS) return false;
  // 나를 향한 공격인가 (공격자가 나를 바라보며 친다)
  if ((-att.fx * dx - att.fz * dz) / dist < WATCH_COS) return false;
  const reach = att.body ? moveReach(att, att.body) : mv.range + FIGHTER_RADIUS;
  if (reach === null || dist - spec.radius > reach + THREAT_MARGIN) return false;
  def.dodgeFrom(att);
  return true;
}

/** 잡기를 풀었을 때 양쪽이 멈칫하는 프레임 */
const THROW_BREAK_STUN = 16;

export function applyHit({ att, def, mv, blocked, counter, at }: PendingHit): HitOutcome {
  att.moveHits.push(def);
  // 공격자가 다시 행동 가능해지기까지 남은 틱 수
  const remaining = totalFrames(mv) - att.frame + 1;
  const pos = at ?? {
    x: def.x - att.fx * FIGHTER_RADIUS,
    y: def.y + (mv.level === 'high' ? 1.55 : mv.level === 'mid' ? 1.1 : 0.35),
    z: def.z - att.fz * FIGHTER_RADIUS,
  };
  const base = { attacker: att.index, name: mv.name, notation: mv.notation, startup: mv.startup };
  const heavy = mv.damage >= 14 || !!mv.launch;

  // 잡기 풀기: 잡히기 직전에 1·2 를 눌렀으면 서로 밀려나며 풀린다 (양쪽 같은 경직)
  if (mv.unblockable && !def.isAirborne() && def.throwBreak > 0) {
    const brk = { ...mv, onBlock: 0, pushback: 0.7 };
    att.receiveBlock(brk, THROW_BREAK_STUN);
    def.receiveBlock(brk, THROW_BREAK_STUN);
    def.throwBreak = 0;
    return {
      hitstop: HITSTOP_BLOCK,
      event: { kind: 'block', ...pos, damage: 0, victim: def.index, heavy: true },
      info: { ...base, name: '잡기 풀기!', result: 'block', advantage: 0, damage: 0 },
    };
  }

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
