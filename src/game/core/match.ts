import {
  FPS,
  HITSTOP_HIT,
  INTRO_FRAMES,
  ROUNDS_TO_WIN,
  ROUND_END_FRAMES,
  PLAYER_TEMPO,
  ROUND_TIME,
} from './constants';
import { forwardIsRight, separateInRing, updateCameraAxis } from './arena';
import { applyHit, detectHit, type CombatEvent, type HitInfo, type PendingHit } from './combat';
import type { Controller } from './controllers';
import { Fighter } from './fighter';
import { NEUTRAL_INPUT } from './input';

export type MatchMode = 'cpu' | 'versus' | 'training';
export type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

export type MatchEvent = CombatEvent;
export type { HitInfo };

export interface HudState {
  mode: MatchMode;
  phase: Phase;
  round: number;
  timer: number;
  fighters: { name: string; hp: number; maxHp: number; wins: number }[];
  banner: string | null;
  combo: { side: 0 | 1; hits: number; damage: number } | null;
  lastHit: HitInfo | null;
}

/**
 * 한 판의 전체 게임 상태. 순수 로직이라 렌더러/DOM 과 무관하며,
 * 같은 입력이면 항상 같은 결과가 나온다 (리플레이 / 롤백 넷코드의 전제).
 */
export class Match {
  readonly fighters: [Fighter, Fighter];
  phase: Phase = 'intro';
  phaseFrame = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timerFrames = ROUND_TIME * FPS;
  hitstop = 0;
  frame = 0;
  /** 두 캐릭터 중점에서 카메라 쪽을 향하는 단위 벡터 */
  camNx = 0;
  camNz = 1;
  roundWinner: 0 | 1 | 'draw' | null = null;
  roundEndKind: 'ko' | 'time' | null = null;
  lastHit: HitInfo | null = null;

  private events: MatchEvent[] = [];
  private comboShow: { side: 0 | 1; hits: number; damage: number; frames: number } | null = null;
  private calm: [number, number] = [0, 0];

  constructor(
    readonly mode: MatchMode,
    private controllers: [Controller, Controller],
    names: [string, string] = ['P1', 'P2'],
  ) {
    // 대전은 공정하게 양쪽 다 같은 템포
    this.fighters = [new Fighter(0, names[0], { tempo: PLAYER_TEMPO }), new Fighter(1, names[1], { tempo: PLAYER_TEMPO })];
    this.startRound();
  }

  restart() {
    this.wins = [0, 0];
    this.round = 1;
    this.startRound();
  }

  drainEvents(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step() {
    this.frame++;
    this.phaseFrame++;
    const [a, b] = this.fighters;
    a.snapshot();
    b.snapshot();
    updateCameraAxis(this, a, b);

    const acceptInput = this.phase === 'fight' || (this.mode === 'training' && this.phase !== 'intro');
    for (const i of [0, 1] as const) {
      const self = this.fighters[i];
      const opponent = this.fighters[1 - i];
      const input = acceptInput
        ? this.controllers[i].read({ self, opponent, forwardIsRight: forwardIsRight(this, self, opponent), frame: this.frame })
        : NEUTRAL_INPUT;
      self.feed(input);
    }

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    if (this.phase === 'intro' && this.phaseFrame >= INTRO_FRAMES) this.setPhase('fight');

    const ctx = { awayX: -this.camNx, awayZ: -this.camNz };
    a.tick({ opponent: b, ...ctx });
    b.tick({ opponent: a, ...ctx });

    separateInRing(a, b);
    a.faceToward(b);
    b.faceToward(a);
    this.resolveHits();

    if (this.comboShow && --this.comboShow.frames <= 0) this.comboShow = null;
    if (this.mode === 'training') this.trainingRefill();
    this.updateRound();
  }

  hud(): HudState {
    const [a, b] = this.fighters;
    return {
      mode: this.mode,
      phase: this.phase,
      round: this.round,
      timer: Math.ceil(this.timerFrames / FPS),
      fighters: this.fighters.map((f, i) => ({ name: f.name, hp: f.hp, maxHp: f.maxHp, wins: this.wins[i] })),
      banner: this.banner(a, b),
      combo: this.comboShow && { side: this.comboShow.side, hits: this.comboShow.hits, damage: this.comboShow.damage },
      lastHit: this.lastHit,
    };
  }

  // ───────────────────────── 내부 ─────────────────────────

  private startRound() {
    const [a, b] = this.fighters;
    a.reset(-1.6, 0, 1, 0);
    b.reset(1.6, 0, -1, 0);
    this.camNx = 0;
    this.camNz = 1;
    this.timerFrames = ROUND_TIME * FPS;
    this.hitstop = 0;
    this.roundWinner = null;
    this.roundEndKind = null;
    this.lastHit = null;
    this.comboShow = null;
    this.setPhase(this.mode === 'training' ? 'fight' : 'intro');
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseFrame = 0;
  }

  private resolveHits() {
    const [a, b] = this.fighters;
    // 양쪽 판정을 먼저 모두 계산한 뒤 적용 → 상쇄(트레이드)가 가능
    const hits = [detectHit(a, b), detectHit(b, a)].filter((h): h is PendingHit => !!h);
    let stop = 0;
    for (const h of hits) {
      const out = applyHit(h);
      this.events.push(out.event);
      this.lastHit = out.info;
      if (h.def.combo >= 2) {
        this.comboShow = { side: h.att.index as 0 | 1, hits: h.def.combo, damage: h.def.comboDamage, frames: 90 };
      }
      if (this.mode === 'training' && h.def.hp <= 0) {
        h.def.hp = 1;
        out.hitstop = HITSTOP_HIT;
      }
      stop = Math.max(stop, out.hitstop);
    }
    if (stop) this.hitstop = stop;
  }

  /** 연습 모드: 잠시 맞지 않으면 체력 회복 */
  private trainingRefill() {
    this.fighters.forEach((f, i) => {
      this.calm[i] = f.isActionable ? this.calm[i] + 1 : 0;
      if (this.calm[i] > 60) f.hp = f.maxHp;
    });
  }

  private updateRound() {
    const [a, b] = this.fighters;
    if (this.mode === 'training') return;

    if (this.phase === 'fight') {
      this.timerFrames = Math.max(0, this.timerFrames - 1);
      const ko0 = a.hp <= 0;
      const ko1 = b.hp <= 0;
      if (!ko0 && !ko1 && this.timerFrames > 0) return;

      this.roundEndKind = ko0 || ko1 ? 'ko' : 'time';
      let winner: 0 | 1 | 'draw';
      if (ko0 && ko1) winner = 'draw';
      else if (ko0) winner = 1;
      else if (ko1) winner = 0;
      else winner = a.hp === b.hp ? 'draw' : a.hp > b.hp ? 0 : 1;

      this.roundWinner = winner;
      if (winner === 'draw') {
        this.wins[0]++;
        this.wins[1]++;
      } else {
        this.wins[winner]++;
      }
      this.setPhase('roundEnd');
    } else if (this.phase === 'roundEnd' && this.phaseFrame >= ROUND_END_FRAMES) {
      if (this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN) {
        this.setPhase('matchEnd');
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  private banner(a: Fighter, b: Fighter): string | null {
    switch (this.phase) {
      case 'intro':
        return this.phaseFrame < 65 ? `ROUND ${this.round}` : 'FIGHT!';
      case 'fight':
        return null;
      case 'roundEnd':
        if (this.phaseFrame < 80) return this.roundEndKind === 'ko' ? 'K.O.' : 'TIME UP';
        return this.roundWinner === 'draw' ? 'DRAW' : `${this.fighters[this.roundWinner!].name} WIN`;
      case 'matchEnd': {
        const [w0, w1] = this.wins;
        if (w0 === w1) return 'DRAW GAME';
        return `${(w0 > w1 ? a : b).name} 최종 승리!`;
      }
    }
  }
}
