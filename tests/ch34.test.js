// 快學 8051 第 3 章（掃描式七段、4x4 鍵盤）與第 4 章（外部中斷、計時器、時鐘）
// 的課本實驗與思考題，在模擬器上跑起來要跟課本說的一樣。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { wiringForExample, DEFAULT_WIRING } from '../web/src/board/wiring.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function simOf(name) {
  const src = readFileSync(path.join(ROOT, 'examples', 'asm', name), 'utf-8');
  const r = assemble(src, { codeSize: 4096 });
  assert.ok(r.ok, name + ' 組譯失敗：' + JSON.stringify(r.diagnostics));
  const s = new Sim();
  const w = wiringForExample(name);
  assert.ok(w, name + ' 沒有登記接線');
  const cfg = JSON.parse(JSON.stringify(DEFAULT_WIRING));
  Object.assign(cfg, w, { enabled: { ...cfg.enabled, ...(w.enabled || {}) } });
  s.wiring.set(cfg);
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name });
  return s;
}
const runMs = (s, ms) => s.cpu.run(Math.round(ms * 1000));

// 七段：段 0~6 = a~g。把每位數亮的段組成 bitmask，查回字元
const GLYPH = {
  0x3F: '0', 0x06: '1', 0x5B: '2', 0x4F: '3', 0x66: '4', 0x6D: '5', 0x7D: '6', 0x07: '7', 0x7F: '8', 0x6F: '9',
  0x5F: 'A', 0x7C: 'b', 0x39: 'C', 0x5E: 'd', 0x79: 'E', 0x71: 'F', 0x40: '-', 0x00: ' ',
};
// 看 ms 毫秒的工作週期，解成 8 個字（由左到右）
function readDisplay(s, ms, thr = 0.03) {
  s.display.frame();
  runMs(s, ms);
  const f = s.display.frame().seg;
  let out = '';
  for (let d = 0; d < 8; d++) {
    let m = 0;
    for (let g = 0; g < 7; g++) if (f[d * 8 + g] > thr) m |= 1 << g;
    out += GLYPH[m] ?? '?';
  }
  return out;
}
// 按一下 4x4 鍵盤的 PBn（n = 鍵值 0~15），按住 holdMs 再放開
function tapKey(s, n, holdMs = 30) {
  s.keypad.press(n, 1); runMs(s, holdMs);
  s.keypad.press(n, 0); runMs(s, 30);
}
// 每 stepMs 看一次 P1，收集變化序列
function watchP1(s, totalMs, stepMs = 5) {
  const seq = [];
  for (let t = 0; t < totalMs; t += stepMs) {
    runMs(s, stepMs);
    const v = s.bus.latch[1];
    if (seq.length === 0 || seq[seq.length - 1].v !== v) seq.push({ t: t + stepMs, v });
  }
  return seq;
}

// ---------------- 第 3 章 ----------------
test('3-7-1 查表法：左邊四位顯示 8051', () => {
  const s = simOf('CH3-7-1 查表法4位七節顯示.asm');
  runMs(s, 50);
  assert.equal(readDisplay(s, 100), '8051    ');
});

test('3-7-1 思考：SCAN_TIME 改 40，每位數要亮 20ms，掃一圈 80ms 肉眼會閃', () => {
  const s = simOf('CH3-7-1T 掃描時間改40會閃.asm');
  runMs(s, 50);
  assert.equal(readDisplay(s, 160), '8051    ');
  // 位選線每 20ms 才換一次
  const times = []; let last = s.bus.latch[2];
  for (let t = 0; t < 200; t++) { runMs(s, 1); const v = s.bus.latch[2]; if (v !== last) { times.push(t); last = v; } }
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 2);
  assert.ok(gaps.length >= 5 && gaps.every((g) => g >= 18 && g <= 23), `每位數應停約 20ms，實際間隔 ${gaps.join(',')}`);
});

test('3-7-2 移位法：顯示 8052', () => {
  const s = simOf('CH3-7-2 移位法4位七節顯示.asm');
  runMs(s, 50);
  assert.equal(readDisplay(s, 100), '8052    ');
});

test('3-7-2 思考：改成 8 位，顯示 12345678', () => {
  const s = simOf('CH3-7-2T 8位顯示12345678.asm');
  runMs(s, 50);
  assert.equal(readDisplay(s, 100), '12345678');
});

function expectBlink(name, text) {
  const s = simOf(name);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(readDisplay(s, 40));
  assert.ok(seen.has(text), `應該看得到 ${JSON.stringify(text)}，實際看到 ${[...seen].map((x) => JSON.stringify(x)).join(' ')}`);
  assert.ok(seen.has('        '), '閃爍：應該有整排全暗的時候');
}
test('3-7-3 閃爍顯示 8053：一會兒亮一會兒暗', () => expectBlink('CH3-7-3 4位七節閃爍顯示.asm', '8053    '));
test('3-7-3 思考：8 位閃爍 12345678', () => expectBlink('CH3-7-3T 8位閃爍12345678.asm', '12345678'));

test('3-7-4 右移跑馬燈：8054 → 4805 → 5480 → 0548', () => {
  const s = simOf('CH3-7-4 4位右移跑馬燈.asm');
  // 每個畫面掃 100 次 × 4 位 × 1ms ≈ 0.4 秒
  const frames = [];
  for (let i = 0; i < 8; i++) { runMs(s, 100); frames.push(readDisplay(s, 60)); runMs(s, 240); }
  const want = ['8054    ', '4805    ', '5480    ', '0548    '];
  const idx = frames.indexOf('8054    ');
  assert.ok(idx >= 0 && idx <= 1, `應先看到 8054，實際 ${frames.join(' | ')}`);
  for (let k = 0; k < 4; k++) assert.equal(frames[idx + k], want[k], `第 ${k + 1} 個畫面，實際序列 ${frames.join(' | ')}`);
});

test('3-7-4 思考：8 位跑馬燈 12345678 → 81234567', () => {
  const s = simOf('CH3-7-4T 8位跑馬燈12345678.asm');
  const frames = [];
  for (let i = 0; i < 4; i++) { runMs(s, 150); frames.push(readDisplay(s, 100)); runMs(s, 550); }
  const idx = frames.indexOf('12345678');
  assert.ok(idx >= 0 && idx <= 1, `應先看到 12345678，實際 ${frames.join(' | ')}`);
  assert.equal(frames[idx + 1], '81234567', `實際序列 ${frames.join(' | ')}`);
});

test('3-7-5 鍵盤：按鍵值從右邊推進來，1 2 3 4 → 1234，再按 A → 234A', () => {
  const s = simOf('CH3-7-5 4x4鍵盤與4位七節.asm');
  runMs(s, 20);
  assert.equal(readDisplay(s, 60), '   0    ', '開機只有最右位顯示 0');
  tapKey(s, 1);
  assert.equal(readDisplay(s, 60), '  01    ');
  tapKey(s, 2); tapKey(s, 3); tapKey(s, 4);
  assert.equal(readDisplay(s, 60), '1234    ');
  tapKey(s, 10);
  assert.equal(readDisplay(s, 60), '234A    ');
});

test('3-7-5 思考：A 鍵 LED 全亮、B 鍵全暗、C 鍵清成 0，0~9 照常', () => {
  const s = simOf('CH3-7-5T 鍵盤ABC特殊功能.asm');
  runMs(s, 20);
  tapKey(s, 1); tapKey(s, 2);
  assert.equal(readDisplay(s, 60), ' 012    ', '開機的 0 還留在緩衝區裡，所以是 012');
  tapKey(s, 10);
  assert.equal(s.bus.latch[1], 0x00, 'A 鍵：P1 全 0 → LED 全亮');
  assert.equal(readDisplay(s, 60), ' 012    ', 'A 鍵不該動到顯示');
  tapKey(s, 11);
  assert.equal(s.bus.latch[1], 0xFF, 'B 鍵：P1 全 1 → LED 全暗');
  tapKey(s, 12);
  assert.equal(readDisplay(s, 60), '   0    ', 'C 鍵：DIG3~DIG1 暗、DIG0 顯示 0');
  tapKey(s, 13);
  assert.equal(readDisplay(s, 60), '   0    ', 'D 鍵沒有功能，顯示不變');
  tapKey(s, 7);
  assert.equal(readDisplay(s, 60), '  07    ');
});

// ---------------- 第 4 章 ----------------
function leftRightScenario(name) {
  const s = simOf(name);
  // 主程式：0FH / F0H 每 0.1 秒反相
  runMs(s, 50); const a = s.bus.latch[1]; runMs(s, 100); const b = s.bus.latch[1];
  assert.ok((a === 0x0F && b === 0xF0) || (a === 0xF0 && b === 0x0F), `主程式應在 0FH/F0H 之間反相，實際 ${a.toString(16)} → ${b.toString(16)}`);
  // 按 PB1(INT0)：嗶兩聲後 LED 左移 7 步
  s.buttons.press(0, 1); runMs(s, 20); s.buttons.press(0, 0);
  const seq = watchP1(s, 1400).map((x) => x.v);
  const leftSeq = [0xFE, 0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF];
  let j = 0; for (const v of seq) if (v === leftSeq[j]) j++;
  assert.equal(j, 7, `LEFT 應依序輸出 FE FD FB F7 EF DF BF，實際 ${seq.map((v) => v.toString(16).toUpperCase()).join(' ')}`);
  // 回到主程式繼續反相
  const tail = seq.slice(-3);
  assert.ok(tail.includes(0x0F) || tail.includes(0xF0), '中斷結束後主程式應繼續反相');
  return s;
}
test('4-7-1 外部中斷：按 PB1 嗶兩聲然後 LED 左移，按 PB2 右移', () => {
  const s = leftRightScenario('CH4-7-1 外部中斷LED左右移.asm');
  s.buffer = null;
  s.buzzer.events.length = 0;
  s.buttons.press(1, 1); runMs(s, 20); s.buttons.press(1, 0);
  const seq = watchP1(s, 1400).map((x) => x.v);
  const rightSeq = [0x7F, 0xBF, 0xDF, 0xEF, 0xF7, 0xFB, 0xFD];
  let j = 0; for (const v of seq) if (v === rightSeq[j]) j++;
  assert.equal(j, 7, `RIGHT 應依序輸出 7F BF DF EF F7 FB FD，實際 ${seq.map((v) => v.toString(16).toUpperCase()).join(' ')}`);
  assert.ok(s.buzzer.events.length > 100, '中斷副程式開頭應該有嗶聲');
});

// 兩個中斷同等級時，INT1 要等 LEFT 做完才輪到；INT1 設高優先就能插進去。
// INT1 是低態觸發(IT1=0)，放開按鍵旗標就消失，所以 PB2 要按著 0.8 秒，
// 跟真板子上「按著等它反應」一樣。
function firstRightAfterLeft(name) {
  const s = simOf(name);
  runMs(s, 50);
  s.buttons.press(0, 1); runMs(s, 20); s.buttons.press(0, 0);
  runMs(s, 480);                       // LEFT 還在嗶的時候
  s.buttons.press(1, 1);
  let t = 500, hit = Infinity;
  while (t < 3000) {
    runMs(s, 5); t += 5;
    if (t === 1300) s.buttons.press(1, 0);
    if (hit === Infinity && s.bus.latch[1] === 0x7F) hit = t;
  }
  return hit;
}
test('4-7-1 同等級：INT1 得等 LEFT 跑完（約 1.1 秒）才開始右移', () => {
  const t = firstRightAfterLeft('CH4-7-1 外部中斷LED左右移.asm');
  assert.ok(t >= 1400 && t < 2000, `7FH 應在 LEFT 結束後(≥1.4s)才出現，實際 ${t}ms`);
});
test('4-7-1 思考：SETB PX1 後 INT1 能插斷 LEFT，右移馬上開始', () => {
  const t = firstRightAfterLeft('CH4-7-1T INT1設為高優先.asm');
  assert.ok(t < 1100, `7FH 應在 LEFT 結束前(<1.1s)就出現，實際 ${t}ms`);
});

test('4-7-2 計時器：右邊兩位每秒加 1，0 → 59 後歸零並嗶兩聲', () => {
  const s = simOf('CH4-7-2 計時器0到59秒.asm');
  runMs(s, 100);
  assert.equal(readDisplay(s, 40), '      00');
  runMs(s, 1950);
  assert.equal(readDisplay(s, 40), '      02', '2 秒後應顯示 02');
  runMs(s, 8000);
  assert.equal(readDisplay(s, 40), '      10', '10 秒後應顯示 10');
  runMs(s, 48950);                      // 到 59.1 秒
  assert.equal(readDisplay(s, 40), '      59');
  s.buzzer.events.length = 0;
  runMs(s, 1000);                       // 跨過 60 秒
  assert.ok(s.buzzer.events.length > 100, '歸零時應該嗶');
  runMs(s, 500);
  assert.equal(readDisplay(s, 40), '      00', '60 秒後應歸零');
});

test('4-7-2 思考：59 到 0 倒數，數到 0 之後嗶兩聲回到 59', () => {
  const s = simOf('CH4-7-2T 59到0倒數.asm');
  runMs(s, 100);
  assert.equal(readDisplay(s, 40), '      59');
  runMs(s, 1950);
  assert.equal(readDisplay(s, 40), '      57');
  runMs(s, 57000);                      // 59.1 秒
  assert.equal(readDisplay(s, 40), '      00');
  s.buzzer.events.length = 0;
  runMs(s, 1000);
  assert.ok(s.buzzer.events.length > 100, '倒數到底應該嗶');
  runMs(s, 500);
  assert.equal(readDisplay(s, 40), '      59');
});

test('4-7-3 時鐘：八位顯示 時-分-秒，從 00-00-00 開始走', () => {
  const s = simOf('CH4-7-3 時鐘24小時制.asm');
  runMs(s, 100);
  assert.equal(readDisplay(s, 40), '00-00-00');
  runMs(s, 2950);
  assert.equal(readDisplay(s, 40), '00-00-03');
});

test('4-7-3 思考：12 小時制，從 12-00-00 開始走', () => {
  const s = simOf('CH4-7-3T 時鐘12小時制.asm');
  runMs(s, 100);
  assert.equal(readDisplay(s, 40), '12-00-00');
  runMs(s, 1950);
  assert.equal(readDisplay(s, 40), '12-00-02');
  // 直接把時間撥到 12:59:58，兩秒後要變 1:00:00 而不是 13:00:00
  s.cpu.iram[0x60] = 8; s.cpu.iram[0x61] = 5; s.cpu.iram[0x63] = 9; s.cpu.iram[0x64] = 5; s.cpu.iram[0x66] = 2; s.cpu.iram[0x67] = 1;
  runMs(s, 2200);
  assert.equal(readDisplay(s, 40), '01-00-00');
});
