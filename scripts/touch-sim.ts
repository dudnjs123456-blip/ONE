// 터치 버튼 입력 검증: npx tsx scripts/touch-sim.ts
import { Keyboard, P1_KEYS } from '../src/game/core/input';
import * as padMod from '../src/game/core/input';

function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) process.exitCode = 1; }

const kb = new Keyboard();
const b1 = P1_KEYS.buttons[0];

// 프레임 사이에 눌렀다 뗀 아주 짧은 탭도 한 번은 읽힌다
kb.setVirtual(b1, true);
kb.setVirtual(b1, false);
check('짧은 탭이 다음 프레임에 눌림으로 읽힌다', kb.read(P1_KEYS).buttons[0]);
check('그다음 프레임엔 떼어져 있다', !kb.read(P1_KEYS).buttons[0]);

// 누르고 있으면 계속 눌림, 떼면 바로 뗌
kb.setVirtual(P1_KEYS.right, true);
kb.read(P1_KEYS);
check('누르는 동안 유지', kb.read(P1_KEYS).right);
kb.setVirtual(P1_KEYS.right, false);
check('읽힌 뒤 떼면 바로 떼어진다', !kb.read(P1_KEYS).right);

// 짧은 탭 도중 다시 누르면 계속 눌림
kb.setVirtual(P1_KEYS.down, true);
kb.setVirtual(P1_KEYS.down, false);
kb.setVirtual(P1_KEYS.down, true);
kb.read(P1_KEYS);
check('다시 누르면 유지된다', kb.read(P1_KEYS).down);

// 게임패드: 표준 배치 → 철권 패드(1=X, 2=Y, 3=A, 4=B), 방향 패드·왼쪽 스틱, 키보드와 합치기
{
  const { padToRaw, mergeRaw } = padMod;
  const pad = (pressed: number[], axes = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes });
  const a = padToRaw(pad([2, 15]))!;
  check('패드 X = 1번, 방향패드 → = 오른쪽', a.buttons[0] && !a.buttons[1] && a.right && !a.left);
  const b = padToRaw(pad([0, 1, 5], [-0.9, 0.8]))!;
  check('패드 A = 3번, B = 4번, RB = 점프, 스틱 왼쪽아래', b.buttons[2] && b.buttons[3] && !!b.jump && b.left && b.down);
  const c = padToRaw(pad([], [0.3, -0.2]))!;
  check('스틱 살짝은 무시', !c.left && !c.right && !c.up && !c.down);
  check('패드 없으면 null', padToRaw(null) === null);
  const kbRaw = { up: true, down: false, left: false, right: false, buttons: [false, true, false, false] as [boolean, boolean, boolean, boolean] };
  const m = mergeRaw(kbRaw, a);
  check('키보드 + 패드 합치기', m.up && m.right && m.buttons[0] && m.buttons[1]);
}
