// 차원 태그 전투: Tab 교대 · 쓰러지면 다음 캐릭터로 저절로 교대 · 모두 쓰러지면 포탈 앞 (npm run test:tag)
import { AUTO_TAG_FRAMES, FieldWorld, TAG_COOLDOWN_FRAMES } from '../src/game/core/field';
import { AutoHuntController } from '../src/game/core/fieldControllers';
import { NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';
import { buildParty, toggleTestCompanion } from '../src/game/data/companions';
import { VILLAGE_SPAWN } from '../src/game/data/village';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const still = { read: () => ({ move: null, input: NEUTRAL_INPUT }) };
const steps = (w: FieldWorld, n: number) => {
  for (let i = 0; i < n; i++) w.step();
};
/** 싸우는 캐릭터를 쓰러뜨린다 (사냥터 한가운데서) */
const knockOut = (w: FieldWorld) => {
  w.player.hp = 0;
  w.player.state = 'ko';
};

// ── 동료가 없으면 Tab 은 아무것도 안 한다 ──
{
  const w = new FieldWorld(still, new AutoHuntController(), newProfile());
  check('혼자면 파티 한 명', w.party.length === 1 && w.activeMember.isMe);
  check('혼자면 Tab 교대 안 됨', w.tag() === false && w.active === 0);
  check('혼자 쓰러지면 사망 표시', (knockOut(w), w.hud().dead && !w.hud().tagging));
}

// ── 시험 동료 넣기 / 빼기 ──
{
  const pr = newProfile();
  check('시험 동료 넣기', toggleTestCompanion(pr) === true && buildParty(pr).length === 2);
  check('시험 동료 빼기', toggleTestCompanion(pr) === false && buildParty(pr).length === 1);
  pr.dimension = { visits: 0, party: ['tester', 'nobody'] };
  check('모르는 동료 id 는 건너뜀', buildParty(pr).length === 2);
}

// ── Tab 교대 ──
{
  const pr = newProfile();
  toggleTestCompanion(pr);
  const w = new FieldWorld(still, new AutoHuntController(), pr);
  steps(w, 2);
  w.player.hp = 37;
  check('Tab 으로 동료 교대', w.tag() === true && w.active === 1 && !w.activeMember.isMe);
  check('교대하면 동료 체력으로', w.player.hp === w.party[1].maxHp);
  check('주인공 체력은 기억', w.party[0].hp === 37);
  check('교대 직후엔 다시 못 바꿈', w.tag() === false && w.active === 1);
  steps(w, TAG_COOLDOWN_FRAMES + 1);
  // 쉬는 동안 마을이라 조금 회복했을 수 있다
  check('잠시 뒤 다시 교대 → 주인공', w.tag() === true && w.active === 0 && w.player.hp >= 37 && w.player.hp < w.player.maxHp);
  check('HUD 파티 표시', w.hud().party.length === 2 && w.hud().party[0].active);
  w.forceMe();
  check('이미 주인공이면 forceMe 그대로', w.active === 0);
}

// ── 쓰러지면 Tab 없이도 다음 캐릭터로 ──
{
  const pr = newProfile();
  toggleTestCompanion(pr);
  const w = new FieldWorld(still, new AutoHuntController(), pr);
  w.player.reset(0, -10, 0, -1); // 사냥터
  steps(w, 2);
  knockOut(w);
  steps(w, 2);
  check('쓰러지면 교대 중 표시 (사망 아님)', w.hud().tagging && !w.hud().dead);
  steps(w, AUTO_TAG_FRAMES + 2);
  check('저절로 동료 교대', w.active === 1 && w.player.hp > 0);
  check('쓰러진 주인공 체력 0', w.party[0].hp === 0);
  check('그 자리에서 이어 싸움 (포탈로 안 감)', Math.abs(w.player.z - -10) < 1);
  check('Tab 으로 쓰러진 주인공은 못 부름', (steps(w, TAG_COOLDOWN_FRAMES + 1), w.tag() === false && w.active === 1));

  // 이야기 장면은 주인공으로 (쓰러져 있었으면 조금 회복)
  const w2 = new FieldWorld(still, new AutoHuntController(), pr);
  w2.party[0].hp = 0;
  w2.tag();
  w2.forceMe();
  check('forceMe: 주인공으로 돌아오고 조금 회복', w2.active === 0 && w2.player.hp > 0);

  // 마지막 캐릭터까지 쓰러지면 포탈 앞에서 모두 일어난다
  knockOut(w);
  steps(w, 2);
  check('모두 쓰러지면 사망 표시', w.hud().dead);
  steps(w, 200);
  const back = Math.hypot(w.player.x - VILLAGE_SPAWN.x, w.player.z - VILLAGE_SPAWN.z) < 1;
  check('포탈 앞에서 주인공으로 깨어남', back && w.active === 0 && w.player.hp === w.player.maxHp);
  check('동료도 모두 일어남', w.party.every((m) => m.hp === m.maxHp));
}

// ── 쉬는 동료 회복 · 쓰러진 동료는 마을에서 일어남 ──
{
  const pr = newProfile();
  toggleTestCompanion(pr);
  const w = new FieldWorld(still, new AutoHuntController(), pr);
  w.party[1].hp = 0;
  steps(w, 120);
  check('마을에선 쓰러진 동료가 일어남', w.party[1].hp > 0);
  w.player.reset(0, -10, 0, -1);
  w.party[1].hp = 0;
  steps(w, 120);
  check('사냥터에선 쓰러진 동료 그대로', w.party[1].hp === 0);
  w.party[1].hp = 5;
  steps(w, 120);
  check('사냥터에서도 살아 있는 동료는 쉬며 회복', w.party[1].hp > 5);
}
