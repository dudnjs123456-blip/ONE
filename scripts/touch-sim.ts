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

// 실제 키보드도: 프레임 사이에 눌렀다 뗀 탭은 한 번 읽히고, 읽지 않는 키는 잠시 뒤 저절로 풀린다
{
  const k2 = new Keyboard();
  type KH = { onDown: (e: Partial<KeyboardEvent>) => void; onUp: (e: Partial<KeyboardEvent>) => void };
  const h = k2 as unknown as KH;
  const ev = (code: string, repeat = false) => ({ code, repeat, preventDefault() {} });
  h.onDown(ev(P1_KEYS.buttons[1]));
  h.onUp(ev(P1_KEYS.buttons[1]));
  const r1 = k2.read(P1_KEYS);
  const r2 = k2.read(P1_KEYS);
  check('keyboard: tap between frames is read once', r1.buttons[1] && !r2.buttons[1]);
  h.onDown(ev('ShiftLeft'));
  h.onUp(ev('ShiftLeft'));
  check('keyboard: non-read key released right away', !k2.has('ShiftLeft'));
  h.onDown(ev(P1_KEYS.right));
  h.onDown(ev(P1_KEYS.right, true));
  check('keyboard: held key stays held', k2.read(P1_KEYS).right && k2.read(P1_KEYS).right);
  h.onUp(ev(P1_KEYS.right));
  check('keyboard: release after read is immediate', !k2.read(P1_KEYS).right);
  // P2 키처럼 이 화면에서 읽지 않는 게임 키도 잠시 뒤엔 풀린다
  h.onDown(ev('Numpad7'));
  h.onUp(ev('Numpad7'));
  setTimeout(() => check('keyboard: unread game key auto-released', !k2.has('Numpad7')), 200);
}
