import type { PlayerProfile } from '../core/profile';
import { dimensionStats } from './equipment';

/**
 * 태그 동료: 차원에서 플레이어가 Tab 으로 바꿔 다루는 캐릭터 (docs/world-rules.md "차원 전투는 태그 방식").
 * 장이 늘 때 새 마을과 함께 들어온다. 도하 · 노아 · 바위 · 마루 · 콩이 같은 이야기 NPC 는 동료가 아니다.
 *
 * 아직 이야기 동료는 없다. 지금은 마스터 계정이 태그를 확인하는 시험 동료만 있다.
 * 동료의 레벨 · 장비 · 근 기술은 마을을 추가할 때 정한다 (그 전까지는 주인공 몸 능력치를 빌려 쓴다).
 */
export interface CompanionDef {
  id: string;
  name: string;
  /** 외형 (looks.ts BODY_TYPES 또는 NPC_BODIES id) */
  body: string;
  outfit?: string[];
  /** 주인공 능력치에 곱한다 (임시) */
  hpMul: number;
  powerMul: number;
  /** 시험용 (마스터 메뉴에서만 넣고 뺀다) */
  test?: boolean;
}

export const COMPANIONS: Record<string, CompanionDef> = {
  tester: { id: 'tester', name: '시험 동료', body: 'silverboy', hpMul: 1, powerMul: 1, test: true },
};

/** 파티 한 자리 (주인공 포함). 필드 위엔 지금 싸우는 한 명만 나온다 */
export interface PartyMember {
  id: string;
  name: string;
  /** 주인공이면 true (근 기술 · 이야기 장면은 주인공 몫) */
  isMe: boolean;
  body?: string;
  outfit?: string[];
  hp: number;
  maxHp: number;
  power: number;
}

/** 저장된 동료 id 중 있는 것만 (모르는 id 는 건너뛴다) */
export function partyIds(p: PlayerProfile): string[] {
  return (p.dimension?.party ?? []).filter((id) => COMPANIONS[id]);
}

/** 주인공 + 함께하는 동료. 처음엔 모두 체력이 가득 */
export function buildParty(p: PlayerProfile): PartyMember[] {
  const st = dimensionStats(p);
  const me: PartyMember = { id: 'me', name: '나', isMe: true, body: p.body, hp: st.maxHp, maxHp: st.maxHp, power: st.power };
  return [
    me,
    ...partyIds(p).map((id) => {
      const c = COMPANIONS[id];
      const maxHp = Math.round(st.maxHp * c.hpMul);
      return { id, name: c.name, isMe: false, body: c.body, outfit: c.outfit, hp: maxHp, maxHp, power: st.power * c.powerMul };
    }),
  ];
}

/** 마스터: 시험 동료를 넣거나 뺀다. @returns 넣었으면 true */
export function toggleTestCompanion(p: PlayerProfile): boolean {
  const d = (p.dimension ??= { visits: 0 });
  const list = d.party ?? [];
  const has = list.includes('tester');
  d.party = has ? list.filter((id) => id !== 'tester') : [...list, 'tester'];
  return !has;
}
