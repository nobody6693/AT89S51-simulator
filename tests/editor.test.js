// 線上編輯 → 重新組譯 → 接著跑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../tools/fake-dom.mjs';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { EditorPanel } from '../web/src/ui/panels.js';

const runMs = (s, ms) => { const t = s.cpu.cycles; while (s.cpu.cycles - t < ms * 1000) s.cpu.run(500); };
const load = (s, src) => {
  const r = assemble(src, { codeSize: 4096 });
  assert.ok(r.ok, '組譯失敗：' + JSON.stringify(r.diagnostics));
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 't.asm' });
  return r;
};

const V1 = `LED\tEQU\tP1
\tORG\t0
\tMOV\tLED,#11111110B
\tJMP\t$
\tEND
`;
const V2 = `LED\tEQU\tP1
\tORG\t0
\tMOV\tLED,#00001111B
\tJMP\t$
\tEND
`;

test('改完重新組譯，換上去的是新程式', () => {
  const s = new Sim();
  load(s, V1); runMs(s, 5);
  assert.equal(s.bus.latch[1], 0xFE, '第一版應該只有 P1.0 是 0');
  load(s, V2); runMs(s, 5);
  assert.equal(s.bus.latch[1], 0x0F, '改完之後要立刻反映新的值');
});

test('組譯失敗時回報行號，不會把壞的程式燒進去', () => {
  const s = new Sim();
  load(s, V1); runMs(s, 5);
  const before = s.bus.latch[1];
  const bad = assemble(V2.replace('MOV\tLED,#00001111B', 'MOV\tR7,R1'), { codeSize: 4096 });
  assert.equal(bad.ok, false, 'MOV R7,R1 在 8051 上不合法，應該擋下來');
  assert.ok(bad.diagnostics.some(d => d.severity === 'error' && d.line > 0), '要指出是第幾行');
  runMs(s, 5);
  assert.equal(s.bus.latch[1], before, '組譯失敗時 CPU 上跑的還是舊程式');
});

test('EditorPanel：打字會觸發 onEdit，內容拿得回來', () => {
  const sim = new Sim();
  const root = document.createElement('div');
  root.parentElement = document.createElement('div');
  const ed = new EditorPanel(root, sim, () => {});
  let seen = null;
  ed.onEdit = (src) => { seen = src; };
  ed.setSource(V1, []);
  assert.equal(ed.getSource(), V1);
  ed.ta.value = V2;
  ed.ta._events.input.forEach(fn => fn({}));
  assert.equal(seen, V2, 'onEdit 應該收到新內容');
  assert.equal(ed.getSource(), V2);
});

test('EditorPanel：錯誤行與中斷點會標出來', () => {
  const sim = new Sim();
  const root = document.createElement('div');
  root.parentElement = document.createElement('div');
  const ed = new EditorPanel(root, sim, () => {});
  ed.setSource(V1, [{ line: 3, severity: 'error', msg: 'x' }]);
  assert.ok(ed.marks.children.some(c => c.className === 'm-err'), '錯誤行要有標記');
  ed.setBreakpoints(new Set([2]));
  assert.ok(ed.gut.children[1].className.includes('bp'), '第 2 行要有中斷點標記');
  ed.setCurrent(4);
  assert.ok(ed.gut.children[3].className.includes('cur'), '第 4 行要是目前行');
});
