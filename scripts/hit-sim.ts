// 타격 판정·자동 회피 검증: npm run test:hit
import { Fighter } from '../src/game/core/fighter';
import { applyHit, autoDodge, detectHit } from '../src/game/core/combat';
import { moveReach, strikeContact } from '../src/game/core/reach';
import { NEUTRAL_INPUT, type RelInput } from '../src/game/core/input';
import { MOVES, type MoveDef } from '../src/game/data/moves';
import { BODY_SPECS, type BodySpec } from '../src/game/data/bodies';
import { PLAYER_TEMPO } from '../src/game/core/constants';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

interface Duel {
  att: Fighter;
  def: Fighter;
  /** 첫 타격이 들어간 공격자 프레임 (없으면 -1) */
  hitFrame: number;
  dodged: boolean;
  hitY: number;
}

/**
 * att 가 def 를 마주 보고 mv 를 쓴다. def 는 dist 만큼 떨어져 att 를 보고(또는 등지고) 서 있다.
 * @param defInput def 에게 매 프레임 넣는 입력 (사람 조작 흉내)
 */
function duel(mv: MoveDef, dist: number, opts: { defSpec?: BodySpec; attSpec?: BodySpec; watching?: boolean; defManual?: boolean; defInput?: RelInput } = {}): Duel {
  const att = new Fighter(0, 'A', { tempo: PLAYER_TEMPO, body: opts.attSpec ?? BODY_SPECS.female, canBlock: false });
  const def = new Fighter(1, 'D', { body: opts.defSpec ?? BODY_SPECS.npc, autoDodge: true, manual: opts.defManual, canBlock: false });
  att.reset(0, 0, 1, 0);
  const watching = opts.watching ?? true;
  def.reset(dist, 0, watching ? -1 : 1, 0);
  att.queueMove(mv);
  const out: Duel = { att, def, hitFrame: -1, dodged: false, hitY: 0 };
  for (let i = 0; i < 90; i++) {
    att.feed(NEUTRAL_INPUT);
    def.feed(opts.defInput ?? NEUTRAL_INPUT);
    att.tick({ opponent: def, awayX: 0, awayZ: -1 });
    def.tick({ opponent: att, awayX: 0, awayZ: -1 });
    // 몸끼리 겹치지 않게 (대전과 같은 최소 거리)
    const d = def.x - att.x;
    if (d < 0.64) {
      const push = (0.64 - d) / 2;
      att.x -= push;
      def.x += push;
    }
    if (autoDodge(def, att)) out.dodged = true;
    const h = detectHit(att, def);
    if (h && out.hitFrame < 0) {
      out.hitFrame = att.frame;
      out.hitY = applyHit(h).event.y;
    }
    if (att.state !== 'attack' && i > 2) break;
  }
  return out;
}

// 1) 닿을 때만 맞는다: 멀면 헛치고, 맞는 순간엔 주먹이 실제로 몸에 닿아 있다
{
  const far = duel(MOVES.jab, 2.2, { watching: false });
  check('멀리서 친 잽은 헛친다 (주먹이 닿지 않음)', far.hitFrame < 0);
  const near = duel(MOVES.jab, 0.9, { watching: false });
  check('붙어서 친 잽은 맞는다', near.hitFrame > 0, `(F${near.hitFrame})`);
  check('맞은 자리 = 주먹 높이 (가슴~얼굴)', near.hitY > 0.9 && near.hitY < 1.6, `(${near.hitY.toFixed(2)}m)`);
}
{
  // 지속 프레임이라도 주먹이 아직 몸에 닿지 않았으면 판정이 없다
  const att = new Fighter(0, 'A', { body: BODY_SPECS.female });
  const def = new Fighter(1, 'D', { body: BODY_SPECS.npc });
  att.reset(0, 0, 1, 0);
  def.reset(1.6, 0, -1, 0);
  att.state = 'attack';
  att.move = MOVES.jab;
  att.frame = MOVES.jab.startup;
  check('지속 프레임이어도 닿지 않으면 판정 없음', att.isInActiveFrames() && strikeContact(att, def) === null && detectHit(att, def) === null);
  def.x = 0.7;
  check('같은 프레임, 주먹이 몸에 닿는 거리면 판정', strikeContact(att, def) instanceof Object && !!detectHit(att, def));
}

// 2) 캐릭터마다 팔다리 길이가 달라 닿는 거리가 다르다
{
  const reachOf = (spec: BodySpec, mv: MoveDef) => {
    const f = new Fighter(0, 'A', { body: spec });
    f.state = 'attack';
    f.move = mv;
    return moveReach(f, spec)!;
  };
  const male = reachOf(BODY_SPECS.male, MOVES.highKick);
  const pink = reachOf(BODY_SPECS.pink, MOVES.highKick);
  check('다리가 긴 캐릭터(남자)의 하이킥이 더 멀리 닿는다', male > pink + 0.05, `(남자 ${male.toFixed(2)}m, 핑크 ${pink.toFixed(2)}m)`);
  const boyJab = reachOf(BODY_SPECS.silverboy, MOVES.jab);
  const femJab = reachOf(BODY_SPECS.female, MOVES.jab);
  check('팔이 긴 캐릭터(은발 소년)의 잽이 더 멀리 닿는다', boyJab > femJab, `(은발 소년 ${boyJab.toFixed(2)}m, 여자 ${femJab.toFixed(2)}m)`);
  check('반응 속도가 캐릭터마다 다르다', new Set(Object.values(BODY_SPECS).map((s) => s.reaction)).size >= 4);
}

// 3) 자동 회피: 보고 있고, 반응할 시간이 있고, 거리가 되면 피한다
{
  const slow = MOVES.smallSilverBackTurnKick;
  const dodge = duel(slow, 1.0);
  check('느린 발차기를 보고 있으면 자동으로 뒤로 피한다 (모션)', dodge.dodged);
  check('거리가 되면 피해서 안 맞는다 (같은 거리에서 등지고 있으면 맞는다)', dodge.hitFrame < 0);

  const close = duel(slow, 0.7);
  check('너무 가까우면 피하는 모션은 하지만 맞는다', close.dodged && close.hitFrame > 0, `(피함 ${close.dodged}, 맞은 F${close.hitFrame})`);

  const jab = duel(MOVES.jab, 0.9);
  check('반응보다 빠른 잽은 피하지 못하고 맞는다', !jab.dodged && jab.hitFrame > 0);

  const back = duel(slow, 1.0, { watching: false });
  check('등지고 있으면(보고 있지 않으면) 피하지 않고 맞는다', !back.dodged && back.hitFrame > 0);

  // 반응이 빠른 캐릭터는 같은 거리에서 피하고, 느린 캐릭터는 맞는다
  const fast = duel(slow, 0.75, { defSpec: BODY_SPECS.smallSilverGirl });
  const sluggish = duel(slow, 0.75, { defSpec: { ...BODY_SPECS.npc, reaction: 30 } });
  check('반응이 빠르면 피하고, 느리면 같은 거리에서도 맞는다', fast.hitFrame < 0 && sluggish.hitFrame > 0, `(빠름 F${fast.hitFrame}, 느림 F${sluggish.hitFrame})`);
}

// 4) 내 캐릭터: 손을 놓고 있으면 자동으로 피하고, 조작 중이면 안 피한다
{
  const slow = MOVES.smallSilverBackTurnKick;
  const idle = duel(slow, 1.0, { defManual: true });
  check('내 캐릭터도 조작하지 않을 땐 자동으로 피한다', idle.dodged);
  const holding = duel(slow, 1.0, { defManual: true, defInput: { dir: 6, buttons: [false, false, false, false] } });
  check('방향키를 누르고 있으면(조작 중) 자동 회피가 꺼진다', !holding.dodged);
  check('손을 놓은 내 캐릭터는 피해서 안 맞는다', idle.hitFrame < 0);
}
