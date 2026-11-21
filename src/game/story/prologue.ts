import { FPS, PLAYER_TEMPO } from '../core/constants';
import { applyHit, detectHit, type CombatEvent } from '../core/combat';
import { bodySpecFor } from '../data/bodies';
import { Fighter } from '../core/fighter';
import { NEUTRAL_INPUT, makeInput } from '../core/input';
import type { FieldCommand, FieldWorld, PlayerController } from '../core/field';
import type { PlayerProfile } from '../core/profile';
import { playerStats } from '../data/equipment';
import { DIR_OF_KEY, MOVES } from '../data/moves';

/**
 * 차원 프롤로그 (처음 접속할 때 한 번만, 나 혼자 보는 장면):
 * 요즘 유행한다는 게임을 켰더니 컴퓨터 속으로 빨려 들어가 → 안개 숲에 떨어진다 → 정체 모를 그림자를 만나
 * 도망친다 → 벼랑 끝에 몰려 뛰어내린다 (이어서 경계 마을 사람이 벼랑 밑에서 구해 준다 — FieldView).
 *
 * 숲은 한 줄기 길(남 → 북). 화면 안쪽 = -z = 북쪽 = 벼랑. 순수 로직 (그리기는 prologueScene).
 */

/** 길 한가운데 줄 (z 는 북쪽으로 갈수록 작아진다). 이 줄에서 HALF 안쪽만 걸을 수 있다 */
export const PATH: { x: number; z: number }[] = [
  { x: 0, z: 4 },
  { x: 0, z: -4 },
  { x: 2.2, z: -11 },
  { x: -1.5, z: -19 },
  { x: 2.5, z: -27 },
  { x: -0.5, z: -35 },
  { x: 0.5, z: -43 },
  { x: 0, z: -48 },
];
export const PATH_HALF = 3.3;
/** 벼랑 끝 (이보다 북쪽은 낭떠러지) */
export const CLIFF_Z = -48;
/** 떨어지는 곳 (처음 내려앉는 숲속 빈터) */
export const LAND = { x: 0, z: 0 };
/** 그림자가 나타나는 곳: 여기를 지나면 등 뒤에서 나타난다 */
const ENCOUNTER_Z = -9;
/** 여기까지 오면 막다른 벼랑 */
const CLIFF_REACH_Z = CLIFF_Z + 3.2;
/** 하늘에서 떨어지는 시간 (프레임) */
const FALL_FRAMES = 150;
const FALL_HEIGHT = 26;
/** 그림자가 쫓아오는 속도: 걸으면 따라잡히고, 달리면(Shift) 겨우 벌어진다 */
const BEAST_SPEED = 0.072;
const WALK = 0.045;
const RUN = 0.1;

export type ProloguePhase =
  /** 하늘에서 떨어지는 중 */
  | 'fall'
  /** 정신 차리는 대사 */
  | 'wake'
  /** 숲길 걷기 (조작) */
  | 'explore'
  /** 그림자와 마주친 대사 */
  | 'encounter'
  /** 도망 (조작) */
  | 'chase'
  /** 벼랑 끝 대사 + 선택 */
  | 'cliff'
  /** "맞서 싸운다" 를 골랐다: 몇 대 쳐 보지만 꿈쩍도 않고 벼랑 끝으로 밀려난다 */
  | 'fight'
  /** 싸워 본 뒤 대사 + 다시 선택 */
  | 'cornered'
  /** 뛰어내린다 */
  | 'jump'
  /** 끝 (화면 어두워짐) */
  | 'done';

/** 대사가 나오는 단계 (그동안 세상은 멈춰 서서 기다린다) */
export const TALK_PHASES: ProloguePhase[] = ['wake', 'encounter', 'cliff', 'cornered'];

export class PrologueWorld {
  frame = 0;
  phase: ProloguePhase = 'fall';
  /** 지금 단계에 들어선 프레임 */
  at = 0;
  readonly player: Fighter;
  readonly beast: Fighter;
  /** 그림자가 세상에 나타났나 */
  beastOut = false;
  /** 화면 흔들림 요청 (렌더러가 가져간다) */
  shake = 0;
  /** "효과 없음" 같은 떠오르는 글자 */
  private texts: { x: number; y: number; z: number; text: string }[] = [];
  private events: CombatEvent[] = [];
  private beastGap = 60;
  private fightHits = 0;
  private spin = 0;

  constructor(
    private manual: PlayerController,
    readonly profile: PlayerProfile,
  ) {
    this.player = new Fighter(0, 'PLAYER', { ...playerStats(profile), tempo: PLAYER_TEMPO, body: bodySpecFor(profile.body), autoDodge: false, manual: true });
    this.player.reset(LAND.x, LAND.z, 0, -1);
    this.player.y = FALL_HEIGHT;
    this.beast = new Fighter(1, '???', { maxHp: 99999, power: 1.6, canBlock: false, runSpeed: BEAST_SPEED, size: 1.7 });
    this.beast.reset(0, 30, 0, -1);
  }

  /** 떨어지는 동안 몸이 빙글 도는 각도 (렌더러용) */
  get fallSpin(): number {
    return this.spin;
  }

  /** 하늘에서 떨어지는 진행도 0~1 */
  get fallT(): number {
    return this.phase === 'fall' ? Math.min(1, (this.frame - this.at) / FALL_FRAMES) : 1;
  }

  get talking(): boolean {
    return TALK_PHASES.includes(this.phase);
  }

  /** 단계를 넘긴다 (대사가 끝났을 때 화면이 부른다) */
  go(phase: ProloguePhase) {
    this.phase = phase;
    this.at = this.frame;
    if (phase === 'chase') this.beastGap = 40;
    if (phase === 'fight') this.fightHits = 0;
  }

  /** 대사창이 닫혔다: 다음 단계로 */
  finishTalk() {
    if (this.phase === 'wake') this.go('explore');
    else if (this.phase === 'encounter') this.go('chase');
  }

  /** 벼랑 끝 선택 */
  choose(jump: boolean) {
    this.go(jump ? 'jump' : 'fight');
  }

  drainEvents(): CombatEvent[] {
    return this.events.splice(0);
  }

  drainTexts() {
    return this.texts.splice(0);
  }

  step() {
    this.frame++;
    const p = this.player;
    const b = this.beast;
    p.snapshot();
    b.snapshot();
    const t = this.frame - this.at;

    switch (this.phase) {
      case 'fall': {
        // 점점 빨라지며 떨어진다 (몸이 천천히 돈다). 땅에 닿으면 쿵
        const u = Math.min(1, t / FALL_FRAMES);
        p.y = FALL_HEIGHT * (1 - u * u);
        this.spin += 0.05 * (1 - u);
        if (u >= 1) {
          p.y = 0;
          this.spin = 0;
          this.shake = 0.6;
          this.go('wake');
        }
        return;
      }
      case 'jump': {
        // 벼랑 끝까지 달려가 몸을 던진다: 앞으로 뛰어오른 뒤 아래로 끝없이
        if (p.z > CLIFF_Z - 0.2 && p.y >= 0 && t < 90) {
          p.freeMove = { x: 0 - p.x, z: -1 };
          p.runSpeed = RUN;
          p.feed(NEUTRAL_INPUT);
          p.tick({ opponent: b, awayX: 0, awayZ: -1 });
          this.clampPath(p, true);
        } else {
          p.freeMove = null;
          p.z -= 0.06;
          p.y -= 0.02 + t * 0.004;
          if (p.y < -60) this.go('done');
        }
        this.stepBeast(false, 2.2);
        return;
      }
      case 'done':
        return;
    }

    // 대사 중엔 멈춰 선다 (그림자도 노려보기만)
    const talk = this.talking;
    const cmd: FieldCommand = talk || this.phase === 'fight' ? { move: null, input: NEUTRAL_INPUT } : this.manual.read(this as unknown as FieldWorld);
    if (this.phase === 'fight') {
      // 맞서 본다: 그림자 쪽을 보고 주먹을 몇 번 날린다
      p.faceToward(b);
      if (p.isActionable && this.fightHits < 3 && t % 26 === 5) {
        p.feed(makeInput(5, this.fightHits === 2 ? 4 : 2));
        this.fightHits++;
      } else p.feed(NEUTRAL_INPUT);
      p.freeMove = null;
    } else {
      p.runSpeed = cmd.run ? RUN : WALK;
      p.freeMove = cmd.move;
      p.feed(cmd.input);
    }
    p.tick({ opponent: this.beastOut ? b : p, awayX: 0, awayZ: -1 });
    this.clampPath(p);

    if (this.phase === 'explore' && p.z < ENCOUNTER_Z) {
      // 등 뒤 안개 속에서 그림자가 나타난다
      this.beastOut = true;
      b.reset(p.x, p.z + 6.5, 0, -1);
      this.shake = 0.35;
      this.go('encounter');
    }
    if (this.phase === 'chase' && p.z < CLIFF_REACH_Z) {
      // 막다른 벼랑: 그림자는 몇 걸음 뒤에서 멈춰 노려본다
      if (b.z < p.z + 4) b.z = p.z + 4;
      this.go('cliff');
    }

    if (this.beastOut) {
      const chasing = this.phase === 'chase';
      this.stepBeast(chasing || this.phase === 'fight', this.phase === 'fight' ? 1.25 : 4);
      this.resolveHits();
    }
    if (this.phase === 'fight' && this.fightHits >= 3 && t > 150) {
      // 주먹이 안 통한다: 벼랑 끝으로 밀려나 다시 고른다
      this.go('cornered');
    }
    this.shake = Math.max(0, this.shake - 0.02);
  }

  /** 그림자: 쫓아오다 붙으면 크게 휘두른다. hunt=false 면 거리 keep 만큼 떨어져 노려본다 */
  private stepBeast(hunt: boolean, keep: number) {
    const b = this.beast;
    const p = this.player;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const d = Math.hypot(dx, dz);
    b.faceToward(p);
    let move: { x: number; z: number } | null = null;
    let input = NEUTRAL_INPUT;
    if (hunt && p.y <= 0.01) {
      if (d > 1.25) move = { x: dx, z: dz };
      else if (b.isActionable && --this.beastGap <= 0) {
        this.beastGap = 70;
        const mv = MOVES.bodyBlow.input!;
        input = makeInput(DIR_OF_KEY[mv.dir], mv.button);
      }
    } else if (d > keep + 0.3) move = { x: dx, z: dz };
    b.runSpeed = this.talking ? 0.02 : BEAST_SPEED;
    b.freeMove = this.talking ? null : move;
    b.feed(input);
    b.tick({ opponent: p, awayX: 0, awayZ: -1 });
    this.clampPath(b);
    // 대사 중에도 천천히 다가오는 느낌만 (멈춰 있지 않게)
  }

  private lastNoEffect = -999;
  private resolveHits() {
    const p = this.player;
    const b = this.beast;
    const h1 = detectHit(p, b);
    if (h1) {
      const out = applyHit(h1);
      this.events.push(out.event);
      // 아무리 때려도 상처 하나 나지 않는다
      b.hp = b.maxHp;
      if (this.frame - this.lastNoEffect > FPS * 0.8) {
        this.lastNoEffect = this.frame;
        this.texts.push({ x: b.x, y: 3.2, z: b.z, text: '효과 없음…' });
      }
    }
    const h2 = detectHit(b, p);
    if (h2) {
      const out = applyHit(h2);
      this.events.push(out.event);
      this.shake = 0.5;
      // 프롤로그에선 쓰러지지 않는다 (벼랑까지 밀려날 뿐)
      p.hp = Math.max(Math.round(p.maxHp * 0.15), p.hp);
    }
  }

  /** 숲길 밖으로 못 나가게 (가장 가까운 길 토막 쪽으로 당긴다). 벼랑 너머는 막는다 */
  private clampPath(f: Fighter, toEdge = false) {
    let best = { x: f.x, z: f.z, d: Infinity };
    for (let i = 0; i + 1 < PATH.length; i++) {
      const a = PATH[i];
      const c = PATH[i + 1];
      const vx = c.x - a.x;
      const vz = c.z - a.z;
      const u = Math.max(0, Math.min(1, ((f.x - a.x) * vx + (f.z - a.z) * vz) / (vx * vx + vz * vz)));
      const qx = a.x + vx * u;
      const qz = a.z + vz * u;
      const d = Math.hypot(f.x - qx, f.z - qz);
      if (d < best.d) best = { x: qx, z: qz, d };
    }
    if (best.d > PATH_HALF) {
      const k = PATH_HALF / best.d;
      f.x = best.x + (f.x - best.x) * k;
      f.z = best.z + (f.z - best.z) * k;
    }
    const edge = toEdge ? CLIFF_Z - 0.6 : CLIFF_Z + 0.5;
    if (f.z < edge) f.z = edge;
    if (f.z > PATH[0].z) f.z = PATH[0].z;
  }
}

