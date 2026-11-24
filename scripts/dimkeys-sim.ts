// 차원 조작: Ctrl 한 키 = 무작위 팔·다리 공격 (누르는 동안 같은 것), 방향키 걷기, 숙이기 없음 (npm run test:dimkeys)
import { FieldWorld } from '../src/game/core/field';
import { AutoHuntController, DimensionKeyboardController } from '../src/game/core/fieldControllers';
import { Keyboard, NEUTRAL_INPUT } from '../src/game/core/input';
import { newProfile } from '../src/game/core/profile';

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) process.exitCode = 1;
}

const kb = new Keyboard();
let r = 0;
const seq = [0.1, 0.3, 0.6, 0.9];
const ctl = new DimensionKeyboardController(kb, undefined, () => seq[r++ % seq.length]);
const w = new FieldWorld({ read: () => ({ move: null, input: NEUTRAL_INPUT }) }, new AutoHuntController(), newProfile());

const pressed = () => ctl.read(w).input.buttons.findIndex(Boolean);
check('nothing pressed → no attack', pressed() === -1);

const seen: number[] = [];
for (let i = 0; i < 4; i++) {
  kb.setVirtual('ControlLeft', true);
  const a = pressed();
  const b = pressed();
  check(`Ctrl press ${i + 1}: one limb, same while held`, a >= 0 && a === b, `(버튼 ${a + 1})`);
  seen.push(a);
  kb.setVirtual('ControlLeft', false);
  pressed();
}
check('each new press can pick a different limb (all four)', new Set(seen).size === 4, `(${seen.map((s) => s + 1).join(',')})`);

kb.setVirtual('ArrowRight', true);
const c = ctl.read(w);
check('arrow keys walk', !!c.move && c.move.x === 1);
kb.setVirtual('ArrowRight', false);
ctl.read(w);

kb.setVirtual('ArrowDown', true);
kb.setVirtual('ShiftLeft', true);
kb.setVirtual('ControlRight', true);
const d = ctl.read(w);
check('no crouch in the other world (Shift + attack stays standing)', d.input.dir !== 1 && d.input.dir !== 2 && d.input.dir !== 3, `(dir ${d.input.dir})`);
check('right Ctrl attacks too', d.input.buttons.some(Boolean));
