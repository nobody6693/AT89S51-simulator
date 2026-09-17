// 左右方向。這件事已經來回錯過好幾次，所以把「眼睛看到的方向」直接鎖成測試。
//
// 關鍵事實（照片上量過三次，絲印清清楚楚）：
//   P1.0 = DS1 = 板子最左邊       P1.7 = DS8 = 板子最右邊
// 所以：
//   RL A（暫存器左移，往高位元）= 燈在畫面上往「右」跑
//   RR A（暫存器右移，往低位元）= 燈在畫面上往「左」跑
// 課本把 RL 叫「左移」，講的是暫存器不是板子，兩者在這塊板上相反。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };

// 回傳亮著的最左邊那顆的位置（0 = DS1 最左，7 = DS8 最右）
const leftmostLit = (latch) => {
  for (let i = 0; i < 8; i++) if (!((latch >> i) & 1)) return i;
  return null;
};

function positions(file, { press = false, steps = 7 } = {}) {
  const src = readFileSync(new URL('../examples/asm/' + file, import.meta.url), 'utf-8');
  const r = assemble(src, { codeSize: 4096 });
  assert.ok(r.ok, file + ' 組譯失敗：' + JSON.stringify(r.diagnostics));
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols });
  if (press) { s.buttons.press(2, 1); s.cpu.run(20000); s.buttons.press(2, 0); }
  const out = [];
  let last = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 5e6 && out.length < steps) {
    s.cpu.run(200);
    const v = s.bus.latch[1];
    if (v !== last) { last = v; const p = leftmostLit(v); if (p !== null) out.push(p); }
  }
  assert.ok(out.length >= 3, file + ' 沒有觀察到足夠的移動');
  return out;
}

const goesRight = (p) => p.every((v, i) => i === 0 || v > p[i - 1]);
const goesLeft = (p) => p.every((v, i) => i === 0 || v < p[i - 1]);

test('2-7-2 LED移動電路：課本原程式用 RL，燈在畫面上往右跑', () => {
  const p = positions('CH2-7-2 LED移動電路.asm', { press: true });
  assert.ok(goesRight(p), `應該往右（DS1→DS8），實際位置序列 ${p.join('→')}`);
  assert.equal(p[p.length - 1], 7, `要一路走到最右邊的 DS8，實際 ${p.join('→')}`);
});

test('2-7-2 思考題 雙燈左移：檔名寫左移，燈就要往畫面左邊跑', () => {
  const p = positions('CH2-7-2T 雙燈左移.asm', { press: true });
  assert.ok(goesLeft(p), `應該往左（DS8→DS1），實際位置序列 ${p.join('→')}`);
  assert.equal(p[p.length - 1], 0, `要一路走到最左邊的 DS1，實際 ${p.join('→')}`);
});

test('2-7-3 霹靂燈：先往右到底，再折返往左', () => {
  const p = positions('CH2-7-3 霹靂燈電路.asm', { steps: 12 });
  assert.equal(p[0], 0, '從最左邊的 DS1 起跑');
  const top = p.indexOf(7);
  assert.ok(top > 0, `應該先走到最右邊的 DS8，實際位置序列 ${p.join('→')}`);
  assert.ok(goesRight(p.slice(0, top + 1)), '折返前要一路往右');
  assert.ok(p[top + 1] < 7, '到底之後要折返往左');
});

test('2-7-3 思考題：兩聲在最右邊、一聲在最左邊', () => {
  const src = readFileSync(new URL('../examples/asm/CH2-7-3T 霹靂燈加嗶聲.asm', import.meta.url), 'utf-8');
  const r = assemble(src, { codeSize: 4096 });
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols });
  // 記錄每一組嗶聲響起時，燈停在哪一顆
  const groups = [];
  let lastBuz = 1, tBeep = -1e9, lastP1 = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 6e6 && groups.length < 4) {
    s.cpu.run(100);
    const p1 = s.bus.latch[1], buz = (s.bus.latch[3] >> 7) & 1;
    if (p1 !== lastP1) lastP1 = p1;
    if (buz === 0 && lastBuz === 1) {
      if (s.cpu.cycles - tBeep > 150000) groups.push({ at: leftmostLit(lastP1), t: s.cpu.cycles });
      tBeep = s.cpu.cycles;
    }
    lastBuz = buz;
  }
  assert.ok(groups.length >= 2, '沒有觀察到兩組嗶聲');
  assert.equal(groups[0].at, 7, '第一組嗶聲時燈應該在最右邊的 DS8');
  assert.equal(groups[1].at, 0, '第二組嗶聲時燈應該在最左邊的 DS1');
  // 最右邊那組是兩聲（比較長），最左邊那組是一聲
  assert.ok(groups[1].t - groups[0].t > 1.2e6, '兩組之間要隔著整段 LED 移動');
});
