// 驗證 mid2asm 產生的 .asm：組得過、跑起來的音高與音長對不對
// 用法：node tools/check-song.mjs <檔案.asm> [要聽幾秒]
import { readFileSync } from 'node:fs';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const src = readFileSync(process.argv[2], 'utf-8');
const r = assemble(src, { codeSize: 4096 });
if (!r.ok) { console.error('組譯失敗'); console.error(r.diagnostics); process.exit(1); }
console.log('組譯 OK，' + (r.codeBytes ?? '?') + ' 位元組（上限 4096）');

const sim = new Sim();
sim.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 'song' });

const evs = [];
const secs = +(process.argv[3] || 12);
for (let t = 0; t < secs * 1e6; t += 20000) {
  sim.cpu.run(20000);
  for (const e of sim.buzzer.frame(sim.cpu.cycles)) evs.push(e);
}
const notes = [];
let cur = null;
for (let i = 1; i < evs.length; i++) {
  const gap = evs[i][0] - evs[i - 1][0];
  if (gap > 4000 || !cur) { if (cur && cur.n > 2) notes.push(cur); cur = { t0: evs[i][0], t1: evs[i][0], n: 0, sum: 0 }; }
  if (gap <= 4000) { cur.n++; cur.sum += gap; cur.t1 = evs[i][0]; }
}
if (cur && cur.n > 2) notes.push(cur);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (f) => {
  const m = Math.round(69 + 12 * Math.log2(f / 440));
  const cents = Math.round(1200 * Math.log2(f / (440 * Math.pow(2, (m - 69) / 12))));
  return NAMES[m % 12] + (Math.floor(m / 12) - 1) + (Math.abs(cents) > 12 ? `(${cents > 0 ? '+' : ''}${cents}¢)` : '');
};
console.log(`\n前 ${secs} 秒辨識出 ${notes.length} 個音：`);
console.log(notes.slice(0, 40).map((n) => nameOf(5e5 / (n.sum / n.n))).join(' '));
const bad = notes.filter((n) => /\(/.test(nameOf(5e5 / (n.sum / n.n))));
console.log(`\n音準：${notes.length - bad.length}/${notes.length} 個在 ±12 音分內`);
const lens = notes.map((n) => ((n.t1 - n.t0) / 1000));
console.log(`音長：最短 ${Math.min(...lens).toFixed(0)}ms、最長 ${Math.max(...lens).toFixed(0)}ms`);
