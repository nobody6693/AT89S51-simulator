// 8051 核心單元測試：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPU8051 } from '../web/src/cpu/cpu.js';
import { SFR, PSW_CY, PSW_AC, PSW_OV } from '../web/src/cpu/sfr.js';

function cpuWith(bytes) {
  const c = new CPU8051();
  c.code.set(bytes, 0);
  return c;
}
function runN(c, n) { for (let i = 0; i < n; i++) c.step(); return c; }

test('MOV A,#imm / MOV Rn,A / MOV direct,A', () => {
  const c = cpuWith([0x74, 0x5A, 0xF8, 0xF5, 0x30]);
  runN(c, 3);
  assert.equal(c.acc, 0x5A);
  assert.equal(c.getR(0), 0x5A);
  assert.equal(c.iram[0x30], 0x5A);
});

test('ADD 旗標：CY AC OV', () => {
  let c = cpuWith([0x74, 0xFF, 0x24, 0x01]); runN(c, 2);
  assert.equal(c.acc, 0x00); assert.ok(c.psw & PSW_CY); assert.ok(c.psw & PSW_AC); assert.ok(!(c.psw & PSW_OV));
  c = cpuWith([0x74, 0x7F, 0x24, 0x01]); runN(c, 2);
  assert.equal(c.acc, 0x80); assert.ok(!(c.psw & PSW_CY)); assert.ok(c.psw & PSW_OV);
  c = cpuWith([0x74, 0x80, 0x24, 0x80]); runN(c, 2);
  assert.equal(c.acc, 0x00); assert.ok(c.psw & PSW_CY); assert.ok(c.psw & PSW_OV);
});

test('SUBB 旗標', () => {
  let c = cpuWith([0xC3, 0x74, 0x00, 0x94, 0x01]); runN(c, 3);
  assert.equal(c.acc, 0xFF); assert.ok(c.psw & PSW_CY); assert.ok(c.psw & PSW_AC);
  c = cpuWith([0xC3, 0x74, 0x80, 0x94, 0x01]); runN(c, 3);
  assert.equal(c.acc, 0x7F); assert.ok(c.psw & PSW_OV); assert.ok(!(c.psw & PSW_CY));
});

test('MUL / DIV', () => {
  let c = cpuWith([0x74, 0x50, 0x75, 0xF0, 0xA0, 0xA4]); runN(c, 3);
  assert.equal(c.acc, 0x00); assert.equal(c.b, 0x32); assert.ok(c.psw & PSW_OV);
  c = cpuWith([0x74, 0xFB, 0x75, 0xF0, 0x12, 0x84]); runN(c, 3);
  assert.equal(c.acc, 13); assert.equal(c.b, 17); assert.ok(!(c.psw & PSW_OV));
  c = cpuWith([0x74, 0x10, 0x75, 0xF0, 0x00, 0x84]); runN(c, 3);
  assert.ok(c.psw & PSW_OV);
});

test('DA A', () => {
  const c = cpuWith([0x74, 0x29, 0x24, 0x18, 0xD4]); runN(c, 3);
  assert.equal(c.acc, 0x47);
});

test('DJNZ 迴圈與週期數', () => {
  const c = cpuWith([0x78, 0x03, 0xD8, 0xFE, 0x00]); // MOV R0,#3 ; DJNZ R0,$ ; NOP
  c.step(); assert.equal(c.cycles, 1);
  c.step(); assert.equal(c.pc, 2); c.step(); c.step();
  assert.equal(c.pc, 4); assert.equal(c.getR(0), 0);
  assert.equal(c.cycles, 1 + 3 * 2);
});

test('CJNE 設定 CY', () => {
  let c = cpuWith([0x74, 0x05, 0xB4, 0x10, 0x00]); runN(c, 2); assert.equal(c.cy, 1);
  c = cpuWith([0x74, 0x20, 0xB4, 0x10, 0x00]); runN(c, 2); assert.equal(c.cy, 0);
});

test('LCALL / RET 與堆疊', () => {
  const c = cpuWith([0x12, 0x00, 0x10, 0x00, ...new Array(12).fill(0), 0x22]);
  c.step(); assert.equal(c.pc, 0x10); assert.equal(c.sp, 0x09);
  assert.equal(c.iram[8], 0x03); assert.equal(c.iram[9], 0x00);
  c.step(); assert.equal(c.pc, 0x03); assert.equal(c.sp, 0x07);
});

test('位元操作：SETB/CLR/CPL/JB/JNB', () => {
  const c = cpuWith([0xD2, 0x90, 0xC2, 0x91, 0xB2, 0x92, 0x20, 0x90, 0x02, 0x00, 0x00, 0x00]);
  runN(c, 3);
  assert.equal(c.bus.latch[1] & 0x07, 0b001);
  c.step(); assert.equal(c.pc, 11); // JB P1.0 → 跳 (9+2)
});

test('埠讀腳位 vs 讀 latch', () => {
  const c = cpuWith([0x75, 0x90, 0xF0, 0xE5, 0x90, 0x43, 0x90, 0x0F]);
  // 外部裝置把 P1.4 拉低
  c.bus.addDriver({ update: () => ({ low: [0, 0x10, 0, 0] }) });
  c.step(); // MOV P1,#F0
  assert.equal(c.bus.pins[1], 0xE0);
  c.step(); // MOV A,P1 → 讀腳位
  assert.equal(c.acc, 0xE0);
  c.step(); // ORL P1,#0F → 讀改寫：讀 latch (F0) | 0F = FF
  assert.equal(c.bus.latch[1], 0xFF);
  assert.equal(c.bus.pins[1], 0xEF);
});

test('Timer0 mode 1 溢位與中斷', () => {
  // TMOD=01, TH0=FF, TL0=FE, ET0, EA, TR0；主程式 SJMP $；ISR 在 000B: INC 30H; RETI
  const prog = new Array(0x30).fill(0);
  let p = 0;
  const emit = (...b) => { for (const x of b) prog[p++] = x; };
  emit(0x02, 0x00, 0x20);           // LJMP 0020
  p = 0x0B; emit(0x05, 0x30, 0x32); // INC 30H; RETI
  p = 0x20;
  emit(0x75, 0x89, 0x01);           // MOV TMOD,#01
  emit(0x75, 0x8C, 0xFF);           // MOV TH0,#FF
  emit(0x75, 0x8A, 0xFE);           // MOV TL0,#FE
  emit(0x75, 0xA8, 0x82);           // MOV IE,#82
  emit(0xD2, 0x8C);                 // SETB TR0
  emit(0x80, 0xFE);                 // SJMP $
  const c = cpuWith(prog);
  runN(c, 30);
  assert.equal(c.iram[0x30], 1);
  assert.equal(c.sfr[SFR.TCON - 0x80] & 0x20, 0); // TF0 已清除
});

test('外部中斷 INT0 邊緣觸發', () => {
  const prog = new Array(0x30).fill(0);
  let p = 0;
  const emit = (...b) => { for (const x of b) prog[p++] = x; };
  emit(0x02, 0x00, 0x20);
  p = 0x03; emit(0x05, 0x31, 0x32);
  p = 0x20;
  emit(0xD2, 0x88);                 // SETB IT0
  emit(0x75, 0xA8, 0x81);           // MOV IE,#81
  emit(0x80, 0xFE);
  const c = cpuWith(prog);
  runN(c, 5);
  let pressed = false;
  c.bus.addDriver({ update: () => ({ low: [0, 0, 0, pressed ? 0x04 : 0] }) });
  runN(c, 3); assert.equal(c.iram[0x31], 0);
  pressed = true; c.bus.invalidate();
  runN(c, 6); assert.equal(c.iram[0x31], 1);
  runN(c, 10); assert.equal(c.iram[0x31], 1); // 持續低態不重複觸發
});

test('載入 Intel HEX', () => {
  const c = new CPU8051();
  const n = c.loadHex(':03000000020006F5\n:0100060080 79\n:00000001FF\n');
  assert.equal(c.code[0], 0x02); assert.equal(c.code[2], 0x06); assert.equal(c.code[6], 0x80);
});
