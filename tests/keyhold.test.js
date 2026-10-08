// 按鍵「按得太快」的問題：按下和放開只隔十幾毫秒，兩個事件都發生在同一次模擬更新之間，
// 程式根本讀不到。UI 的做法是放開要等模擬時間走滿 30ms，這裡驗那個機制。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../tools/fake-dom.mjs';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { wiringForExample } from '../web/src/board/wiring.js';
const { BoardView } = await import('../web/src/ui/board.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.performance = globalThis.performance || { now: () => Date.now() };

test('Sim.at：到了模擬時間才執行，重設時沒到期的也會執行（不丟掉）', () => {
  const s = new Sim();
  const log = [];
  s.at(1000, () => log.push('a'));
  s.at(5000, () => log.push('b'));
  s.cpu.cycles = 1200; s.frame(0);
  assert.deepEqual(log, ['a'], '只有到期的那個會跑');
  s.reset();
  assert.deepEqual(log, ['a', 'b'], '重設時還沒到期的要立刻執行，不然按鍵會卡在按下');
});

function boardSim() {
  const src = readFileSync(path.join(ROOT, 'examples', 'asm', 'CH3-7-5 4x4鍵盤與4位七節.asm'), 'utf-8');
  const r = assemble(src, { codeSize: 4096 });
  const s = new Sim();
  s.wiring.set(wiringForExample('CH3-7-5 4x4鍵盤與4位七節.asm'));
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 'k' });
  const container = { children: [], appendChild(c) { this.children.push(c); return c; }, style: {}, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }) };
  const view = new BoardView(container, s, { reset() {} });
  return { s, view };
}

test('板子上的按鍵：極短的點擊（按下後馬上放開）也要讓程式看到', () => {
  const { s, view } = boardSim();
  s.running = true;                         // 模擬正在跑（Runner.start 會設）
  s.cpu.run(30000);
  const [down, up] = view.keyPress[1];
  down(); up();                             // 同一個 JS 工作裡按下又放開 = 0ms 的點擊
  assert.equal(s.keypad.pressed[1], 1, '放開時模擬還沒跑，按鍵要先維持按下');
  s.cpu.run(35000); s.frame(35000);         // 模擬走過 35ms，每幀會檢查計時
  assert.equal(s.keypad.pressed[1], 0, '模擬跑滿 30ms 之後才放開');
  s.cpu.run(30000);
  assert.equal(s.cpu.iram[0x50], 1, '程式應該已經讀到按鍵 1，緩衝區最右位 = 1');
});

test('按得很快又再按：第二次按下不會被第一次排定的放開提早放掉', () => {
  const { s, view } = boardSim();
  s.running = true;
  const [down, up] = view.keyPress[2];
  down(); up(); down();                     // 按、放、再按（還按著）
  s.cpu.run(40000); s.frame(40000);
  assert.equal(s.keypad.pressed[2], 1, '還按著就不能被放開');
  up(); s.cpu.run(40000); s.frame(40000);
  assert.equal(s.keypad.pressed[2], 0);
});

test('暫停中按鍵放開不用等（模擬不會往前跑）', () => {
  const { s, view } = boardSim();
  s.running = false;
  const [down, up] = view.keyPress[3];
  down(); up();
  assert.equal(s.keypad.pressed[3], 0);
});
