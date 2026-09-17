// 週邊的端到端測試：載入固定樣本 → 執行 → 檢查七段 / 點矩陣 / 鍵盤 / 馬達 / SPI / I²C
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../web/src/sim.js';
import { LEGACY_PROGRAMS } from './fixtures/legacy-programs.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };

// 這 8 支程式的機器碼是固定樣本（tests/fixtures/legacy-programs.js），
// 不再叫 SDCC 現編 —— 測的是模擬器的週邊行為，不是編譯器。
const byName = new Map(LEGACY_PROGRAMS.map(p => [p.name, p]));
function compile(name) {
  const p = byName.get(name);
  assert.ok(p, `找不到樣本 ${name}`);
  return { hex: p.hex, lines: p.lines, symbols: p.symbols };
}
function fresh(name, wiring) {
  const sim = new Sim();
  if (wiring) sim.wiring.set(wiring);
  sim.load(compile(name));
  return sim;
}
const runMs = (sim, ms) => sim.cpu.run(ms * 1000);

test('01 流水燈：LED 一次亮一顆並移動；指撥 ON 反映到 LED；PB1 觸發蜂鳴器', () => {
  const sim = fresh('01_流水燈.c');
  runMs(sim, 400); // 跨過開機 beep
  const seen = new Set();
  for (let i = 0; i < 12; i++) { runMs(sim, 100); seen.add(sim.bus.latch[1]); }
  for (const v of seen) { const zeros = 8 - (v.toString(2).match(/1/g) || []).length; assert.equal(zeros, 1, `P1=${v.toString(16)} 應恰好一顆亮`); }
  assert.ok(seen.size >= 4, '應該看到 LED 移動');
  sim.dip.set(0, 1); sim.dip.set(3, 1); // P0.0, P0.3 ON → 讀 0
  runMs(sim, 300);
  assert.equal(sim.bus.latch[1], 0xF6, 'LED 應直接反映開關 (P1 = P0 = F6)');
  sim.dip.setAll(0);
  const before = sim.buzzer.events.length;
  sim.buttons.press(0, 1); runMs(sim, 300); sim.buttons.press(0, 0);
  assert.ok(sim.buzzer.events.length > before + 50, '按 PB1 應該有蜂鳴器翻轉');
});

test('08 望春風：Timer0 中斷產生 ~262Hz 方波', () => {
  const sim = fresh('08_望春風.c');
  runMs(sim, 40);
  sim.buzzer.frame(0);
  runMs(sim, 100);
  const ev = sim.buzzer.frame(100000);
  assert.ok(ev.length > 40, '應有翻轉事件');
  const deltas = []; for (let i = 1; i < 20; i++) deltas.push(ev[i][0] - ev[i - 1][0]);
  const half = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const freq = 1e6 / (2 * half);
  assert.ok(Math.abs(freq - 262) < 4, `Do 應約 262Hz，量到 ${freq.toFixed(1)}`);
});

test('02 LCD 與鍵盤：顯示字串、按鍵計數', () => {
  const w = { enabled: { keypad: true }, keyOut: ['P2.0', 'P2.1', 'P2.2', 'P2.3'], keyIn: ['P2.4', 'P2.5', 'P2.6', 'P2.7'] };
  const sim = fresh('02_LCD與鍵盤.c', w);
  sim.lcd.setAttached(true);
  runMs(sim, 150);
  const txt = (row) => String.fromCharCode(...sim.lcd.render().rows[row]);
  assert.equal(txt(0), 'KT89S51 KeyTest ');
  assert.equal(txt(1), 'Count:0000  K:- ');
  assert.equal(sim.lcd.displayOn, true);
  sim.keypad.press(9, 1); runMs(sim, 80); sim.keypad.press(9, 0); runMs(sim, 80);
  assert.equal(txt(1), 'Count:0001  K:9 ');
  sim.keypad.press(15, 1); runMs(sim, 80); sim.keypad.press(15, 0); runMs(sim, 80);
  assert.equal(txt(1), 'Count:0002  K:F ');
  // 指撥開關撥 ON 干擾 P0 → 應產生警告
  sim.dip.set(4, 1); runMs(sim, 100);
  sim.keypad.press(1, 1); runMs(sim, 80); sim.keypad.press(1, 0); runMs(sim, 80);
  assert.ok(sim.lcd.takeWarnings().some(s => s.includes('指撥開關')), '應警告 P0 被指撥開關拉低');
});

test('03 七段秒表：Timer0 掃描，8 位數各自穩定顯示', () => {
  const w = { enabled: { seg7: true }, seg: ['P0.0','P0.1','P0.2','P0.3','P0.4','P0.5','P0.6','P0.7'], digit: ['P2.0','P2.1','P2.2','P2.3','P2.4','P2.5','P2.6','P2.7'], digitMode: 'direct' };
  const sim = fresh('03_七段顯示器.c', w);
  runMs(sim, 1250); // 1.25 s
  sim.display.frame();
  runMs(sim, 64);
  const d = sim.display.frame().seg;
  // 位 4 (秒個位) 應顯示 '1'：段 b、c 亮 (index 1,2)，其餘暗
  const digit = (n) => Array.from(d.slice(n * 8, n * 8 + 8)).map(v => v > 0.06 ? 1 : 0).join('');
  assert.equal(digit(4), '01100000', `秒個位應為 1，實際段狀態 ${digit(4)}`);
  assert.equal(digit(5), '11111101', `秒十位應為 0 且有小數點(dp_mask bit5)，實際 ${digit(5)}`);
  assert.equal(digit(2).slice(7), '1', '位 2 應有小數點');
  // 每位 duty 約 1/8
  const dutyB = d[4 * 8 + 1];
  assert.ok(dutyB > 0.09 && dutyB < 0.16, `掃描 duty 應約 1/8，量到 ${dutyB}`);
});

test('04 LED 陣列：顯示愛心圖案', () => {
  const w = { enabled: { matrix: true }, matrixRow: ['P1.0','P1.1','P1.2','P1.3','P1.4','P1.5','P1.6','P1.7'], digit: ['P2.0','P2.1','P2.2','P2.3','P2.4','P2.5','P2.6','P2.7'], digitMode: 'direct' };
  const sim = fresh('04_LED陣列.c', w);
  runMs(sim, 100); sim.display.frame(); runMs(sim, 40);
  const m = sim.display.frame().matrix;
  const col = (c) => { let v = 0; for (let r = 0; r < 8; r++) if (m[c * 8 + r] > 0.06) v |= (1 << r); return v; };
  assert.equal(col(0), 0x66); assert.equal(col(1), 0xFF); assert.equal(col(6), 0x18); assert.equal(col(7), 0x00);
});

test('05 步進馬達：全步正轉，PB1 換向，SW1-1 半步', () => {
  const w = { enabled: { stepper: true }, stepper: ['P1.0', 'P1.1', 'P1.2', 'P1.3'] };
  const sim = fresh('05_步進馬達.c', w);
  runMs(sim, 200);
  const h1 = sim.stepper.halfSteps;
  assert.ok(Math.abs(h1) > 20, '應該有轉動');
  assert.equal(sim.stepper.missed, 0, '不應失步');
  const dir1 = Math.sign(h1);
  sim.buttons.press(0, 1); runMs(sim, 20); sim.buttons.press(0, 0);
  const h2 = sim.stepper.halfSteps; runMs(sim, 200);
  assert.equal(Math.sign(sim.stepper.halfSteps - h2), -dir1, '按 PB1 後應反轉');
  sim.dip.set(0, 1); runMs(sim, 50);
  const before = sim.stepper.halfSteps; runMs(sim, 100);
  assert.ok(Math.abs(sim.stepper.halfSteps - before) > 10);
  assert.equal(sim.stepper.missed, 0);
});

test('06 ADC/DAC：讀到可變電阻與溫度，DAC 有輸出，UART 送出文字', () => {
  const w = { enabled: { spi: true }, spiSck: 'P1.0', spiSdi: 'P1.1', spiSdo: 'P1.2', adcCs: 'P1.3', dacCs: 'P1.4', dacLd: null };
  const sim = fresh('06_ADC與DAC.c', w);
  sim.spi.potVolts = 3.3; sim.spi.tempC = 37;
  runMs(sim, 400);
  const txt = String.fromCharCode(...sim.uartOut);
  const m = /POT=(\d+) TEMP=(\d+)C/.exec(txt);
  assert.ok(m, 'UART 應輸出 POT=/TEMP=：' + txt.slice(0, 80));
  assert.ok(Math.abs(+m[1] - Math.round(3.3 / 5 * 4096)) <= 1, `POT 讀值 ${m[1]}`);
  assert.ok(Math.abs(+m[2] - 37) <= 1, `TEMP 讀值 ${m[2]}`);
  assert.ok(sim.spi.voutA > 0, 'DAC A 應有輸出');
});

test('07 I²C：EEPROM 寫入讀回、TC74 溫度', () => {
  const w = { enabled: { i2c: true }, sda: 'P1.6', scl: 'P1.7' };
  const sim = fresh('07_I2C溫度與EEPROM.c', w);
  sim.i2c.tempC = 31;
  runMs(sim, 300);
  for (let i = 0; i < 8; i++) assert.equal(sim.i2c.eeprom[i], 0xA0 + i, `EEPROM[${i}]`);
  const txt = String.fromCharCode(...sim.uartOut);
  assert.ok(txt.includes('EEPROM read: A0 A1 A2 A3 A4 A5 A6 A7'), txt.slice(0, 120));
  assert.ok(/TC74 = 1Fh/.test(txt), 'TC74 應讀到 31 (1Fh)：' + txt.slice(-40));
});
