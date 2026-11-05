/** 날씨 시험: 같은 시각은 항상 같은 날씨, 칸 경계에서 부드럽게, 계절별 분포가 맞는지 */
import { slotWeather, weatherAt, type WeatherKind } from '../src/game/city/weather';
import { dateOfDay } from '../src/game/city/calendar';

let fail = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) {
    fail++;
    console.error('✗', msg);
  }
};

// 1) 결정적
for (let d = 1; d < 50; d++) ok(JSON.stringify(weatherAt(d, 600)) === JSON.stringify(weatherAt(d, 600)), `day ${d} 결정적`);

// 2) 1분 간격으로 급격히 튀지 않는다
let maxJump = 0;
for (let d = 1; d < 30; d++)
  for (let m = 1; m < 1440; m++) {
    const a = weatherAt(d, m - 1), b = weatherAt(d, m);
    maxJump = Math.max(maxJump, Math.abs(a.rain - b.rain), Math.abs(a.cloud - b.cloud), Math.abs(a.snow - b.snow), Math.abs(a.fog - b.fog));
  }
ok(maxJump < 0.06, `분당 변화 ${maxJump.toFixed(3)} < 0.06`);

// 3) 계절 분포
for (const [name, from, to] of [['11월', 1, 30], ['1월', 62, 92], ['7월', 243, 273]] as const) {
  const n: Record<string, number> = {};
  for (let d = from; d <= to; d++) for (let s = 0; s < 6; s++) {
    const k = slotWeather(d * 6 + s);
    n[k] = (n[k] ?? 0) + 1;
  }
  console.log(name, `(${dateOfDay(from).month + 1}월)`, n);
}
const july = (k: WeatherKind) => Array.from({ length: 31 * 6 }, (_, i) => slotWeather(243 * 6 + i)).filter((x) => x === k).length;
ok(july('snow') === 0, '7월엔 눈이 안 온다');
console.log('오늘(1일째) 칸별:', [0, 1, 2, 3, 4, 5].map((s) => slotWeather(6 + s)).join(' → '));
console.log(fail ? `실패 ${fail}건` : '날씨 시험 통과');
process.exit(fail ? 1 : 0);
