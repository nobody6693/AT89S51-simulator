// 板子畫面 / 排針 / 接線互動的測試（用極簡 DOM 假件，不需瀏覽器）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, isPort } from '../web/src/ui/headers.js';

// ---------- 極簡 DOM ----------
function fakeEl(tag) {
  const e = {
    tag, children: [], attrs: {}, style: {}, _events: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); },
    removeEventListener() {},
    click() { for (const fn of this._events.click || []) fn({ stopPropagation() {}, target: this }); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    getContext: () => ({ fillRect() {}, set fillStyle(v) {}, get fillStyle() { return ''; } }),
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text || ''; },
    set hidden(v) { this._hidden = v; },
    get hidden() { return this._hidden; },
    get offsetWidth() { return 100; },
  };
  return e;
}
globalThis.document = {
  createElementNS: (ns, tag) => fakeEl(tag),
  createElement: (tag) => fakeEl(tag),
  addEventListener() {}, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
};
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = (fn) => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { Sim } = await import('../web/src/sim.js');
const { BoardView } = await import('../web/src/ui/board.js');

function mount() {
  const sim = new Sim();
  const container = fakeEl('div');
  const view = new BoardView(container, sim, { reset() {} });
  return { sim, view };
}

// ---------- 排針資料 ----------
test('JP3 是 20×2、40 支腳，四個埠的 32 支腳各出現一次', () => {
  const jp3 = HEADERS.find(h => h.id === 'JP3');
  assert.equal(jp3.cols, 2);
  assert.equal(jp3.pins.length, 40, '20 列 × 2 欄');
  const names = jp3.pins.map(p => p[0]);
  for (let p = 0; p < 4; p++) for (let b = 0; b < 8; b++) {
    const n = `P${p}.${b}`;
    assert.equal(names.filter(x => x === n).length, 1, `${n} 應恰好出現一次`);
  }
  // 非 I/O 腳也要在（真板子有的都要有）
  for (const n of ['VCC', 'GND', 'RST', 'X1', 'X2', 'EA', 'ALE', 'PSEN']) {
    assert.ok(names.includes(n), `JP3 應該有 ${n} 腳`);
  }
  // 左欄由上到下：P1.0–P1.7、RST、P3.0–P3.7、X2、X1、GND
  const left = jp3.pins.filter((_, i) => i % 2 === 0).map(p => p[0]);
  assert.deepEqual(left, ['P1.0','P1.1','P1.2','P1.3','P1.4','P1.5','P1.6','P1.7','RST',
    'P3.0','P3.1','P3.2','P3.3','P3.4','P3.5','P3.6','P3.7','X2','X1','GND']);
  // 右欄由上到下：VCC、P0.0–P0.7、EA、ALE、PSEN、P2.7–P2.0
  const right = jp3.pins.filter((_, i) => i % 2 === 1).map(p => p[0]);
  assert.deepEqual(right, ['VCC','P0.0','P0.1','P0.2','P0.3','P0.4','P0.5','P0.6','P0.7',
    'EA','ALE','PSEN','P2.7','P2.6','P2.5','P2.4','P2.3','P2.2','P2.1','P2.0']);
});

test('JP2 LCM 是 14 支腳，順序照板子絲印', () => {
  // 電路圖圖4 畫 14 腳，照片上也量到 14 個焊點（y 131→257，間距 9.69），沒有背光的 15/16 腳。
  const jp2 = HEADERS.find(h => h.id === 'JP2');
  assert.equal(jp2.pins.length, 14);
  assert.deepEqual(jp2.pins.map(p => p[0]),
    ['VSS', 'VDD', 'VO', 'RS', 'R/W', 'EN', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
});

test('板上焊死的腳照樣帶著自己的埠訊號（焊接 ≠ 不能接）', () => {
  const g = (id) => HEADERS.find(h => h.id === id);
  const jp2 = g('JP2');
  const sig = Object.fromEntries(jp2.pins);
  // LCM 的控制腳與資料腳在板子上就焊到這些埠腳位，所以它們在電氣上「就是」那些腳
  assert.equal(sig['RS'], 'P3.2');
  assert.equal(sig['R/W'], 'P3.1');
  assert.equal(sig['EN'], 'P3.0');
  for (let i = 0; i < 8; i++) assert.equal(sig['D' + i], 'P0.' + i, `JP2 的 D${i} 就是 P0.${i}`);
  // BT04 的 RXD / TXD 也一樣焊到 P3.0 / P3.1
  const jp5 = Object.fromEntries(g('JP5').pins);
  assert.equal(jp5['RXD'], 'P3.0');
  assert.equal(jp5['TXD'], 'P3.1');
  // 這些腳因此都是可點、可拉線的（board.js 用 isPort() 判斷）
  const wirable = HEADERS.flatMap(h => h.pins).filter(p => p[1] && isPort(p[1])).length;
  assert.equal(wirable, 32 + 11 + 2, '可拉線的埠腳位 = JP3 的 32 支 + JP2 的 11 支 + JP5 的 2 支');
});

test('每個排針的位置都有量過（座標落在照片範圍內、間距合理）', () => {
  for (const h of HEADERS) {
    assert.ok(h.x >= 0 && h.x <= 890, `${h.id} 的 x 超出照片範圍`);
    assert.ok(h.y >= 0 && h.y <= 449, `${h.id} 的 y 超出照片範圍`);
    // 2.54mm 排針在這張照片上量到的間距都落在 8.4–9.7 之間
    assert.ok(h.pitch >= 8 && h.pitch <= 10, `${h.id} 的間距 ${h.pitch} 不像 2.54mm 排針`);
    assert.ok(h.side === 'main' ? h.x < 440 : h.x > 440, `${h.id} 畫錯板子`);
  }
});

test('各排針的針數與絲印順序都照板子', () => {
  const g = (id) => HEADERS.find(h => h.id === id);
  assert.deepEqual(g('JP10').pins.map(r => r[0]), ['GND', 'VCC', 'LD', 'DAC', 'ADC', 'SDO', 'SDI', 'SCK']);
  assert.deepEqual(g('JP1').pins.map(r => r[0]), ['GND', 'WP', 'SDA', 'SCL']);
  assert.deepEqual(g('KJP3').pins.map(r => r[0]), ['dp', 'g', 'f', 'e', 'd', 'c', 'b', 'a'], '七段段選絲印是 dp→a');
  assert.deepEqual(g('KJP4').pins.map(r => r[0]), ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], '掃描信號絲印是 D7→D0');
  assert.deepEqual(g('KJP6').pins.map(r => r[0]), ['Y7', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'Y0'], '陣列列線絲印是 Y7→Y0');
  assert.deepEqual(g('KJP5').pins.map(r => r[0]), ['EN', 'A2', 'A1', 'A0']);
  // JP7 依電路圖：腳 1–4 = S0 S1 S2 S3 → ULN2803A → B2 B1 A2 A1
  assert.deepEqual(g('KJP7').pins.map(r => r[0]), ['B2', 'B1', 'A2', 'A1'], '馬達控制腳依電路圖是 B2 B1 A2 A1');
  assert.deepEqual(g('KJP7').pins.map(r => r[1]),
    ['dev:stepper.0', 'dev:stepper.1', 'dev:stepper.2', 'dev:stepper.3'], 'JP7 腳 1–4 對應 S0–S3');
  assert.equal(g('KJP8').pins.length, 16, '鍵盤排針 8 列×2 欄 = 16 支腳');
  assert.equal(g('CN3').pins.length, 6, '馬達本體插座六條線');
  assert.equal(g('KJP1a').pins.length + g('KJP1b').pins.length, 16, 'JP1 電源排針共 16 支腳');
  assert.equal(g('JP5').pins.length, 4, '主板藍牙 JP5 四支腳');
  assert.deepEqual(g('JP12').pins.map(r => r[0]), ['CHA', 'GND', 'CHB', 'GND '], 'JP12 是 MCP4822 的兩路輸出');
  assert.equal(g('JP11').pins.length, 4, 'JP11 是四腳（Vo CH1 CH1 GND），不是三腳');
  assert.equal(g('JP6').pins.length, 3, 'JP6 RGB 三支腳');
  assert.equal(g('JP5母座').pins.length, 4, 'RESET 旁邊那個沒印編號的 BT04 母座');
});

// ---------- 出廠狀態 ----------
test('出廠沒有任何接線，週邊全部未啟用', () => {
  const { sim } = mount();
  const c = sim.wiring.cfg;
  for (const k of ['seg', 'digit', 'dec138', 'matrixRow', 'keyOut', 'keyIn', 'stepper']) {
    assert.ok((c[k] || []).every(v => !v), `${k} 應該全空`);
  }
  for (const k of ['spiSck', 'spiSdi', 'spiSdo', 'adcCs', 'dacCs', 'dacLd', 'sda', 'scl']) {
    assert.equal(c[k], null, `${k} 應該沒接`);
  }
  assert.deepEqual(c.enabled, { seg7: false, matrix: false, keypad: false, stepper: false, spi: false, i2c: false });
});

// ---------- 接線互動 ----------
test('每支週邊訊號腳與每支埠腳都畫得出來且可點', () => {
  const { view } = mount();
  for (let p = 0; p < 4; p++) for (let b = 0; b < 8; b++) {
    const n = `P${p}.${b}`;
    assert.ok(view.portPins[n] && view.portPins[n].length, `${n} 應該有實體針腳`);
  }
  // 這塊板子的埠腳位只從 JP3 拉出來，所以每支腳只有一個位置
  assert.equal(view.portPins['P1.0'].length, 1);
  assert.equal(view.portPins['P2.0'].length, 1);
  for (const id of ['seg.0', 'digit.7', 'matrixRow.3', 'keyOut.0', 'keyIn.3', 'stepper.2', 'dec138.1', 'spiSck', 'sda'])
    assert.ok(view.devEls[id] && view.devEls[id].length, `${id} 應該有實體針腳`);
  assert.equal(view.devEls['keyOut.0'].length, 2, '鍵盤同訊號兩支腳');
});

test('點週邊腳再點埠腳就接上；再點一次拆掉', () => {
  const { sim, view } = mount();
  view._devClicked('seg.0');
  assert.deepEqual(view.sel, { kind: 'dev', id: 'seg.0' });
  view._portClicked('P3.7');
  assert.equal(sim.wiring.cfg.seg[0], 'P3.7', '想接哪就接哪，不會被程式改掉');
  assert.equal(sim.wiring.cfg.enabled.seg7, true, '有線就自動視為裝上了');
  view._devClicked('seg.0');
  assert.equal(sim.wiring.cfg.seg[0], null);
  assert.equal(sim.wiring.cfg.enabled.seg7, false);
});

test('先點埠腳再點週邊腳也可以', () => {
  const { sim, view } = mount();
  view._portClicked('P2.5');
  view._devClicked('stepper.1');
  assert.equal(sim.wiring.cfg.stepper[1], 'P2.5');
});

test('同一支埠腳接兩條線不會被擋，但要報衝突', () => {
  const { sim, view } = mount();
  view._devClicked('seg.0'); view._portClicked('P1.0');
  view._devClicked('matrixRow.0'); view._portClicked('P1.0');
  assert.equal(sim.wiring.cfg.seg[0], 'P1.0');
  assert.equal(sim.wiring.cfg.matrixRow[0], 'P1.0');
  const conf = sim.wiring.conflicts();
  assert.ok(conf.some(c => c.level === 'error' && c.pin === 'P1.0'), '應報 P1.0 衝突');
});

test('點已接線的埠腳會把它上面的線全部拆掉', () => {
  const { sim, view } = mount();
  view._devClicked('seg.1'); view._portClicked('P2.2');
  view._devClicked('digit.1'); view._portClicked('P2.2');
  view._portClicked('P2.2');
  assert.equal(sim.wiring.cfg.seg[1], null);
  assert.equal(sim.wiring.cfg.digit[1], null);
});

test('接 JP5 會自動切成 74LS138 位選模式', () => {
  const { sim, view } = mount();
  assert.equal(sim.wiring.cfg.digitMode, 'direct');
  view._devClicked('dec138.0'); view._portClicked('P2.0');
  assert.equal(sim.wiring.cfg.digitMode, '138');
  view._devClicked('dec138.0');
  assert.equal(sim.wiring.cfg.digitMode, 'direct');
});

test('全部拆線', () => {
  const { sim, view } = mount();
  view._devClicked('seg.0'); view._portClicked('P0.0');
  view._devClicked('stepper.0'); view._portClicked('P1.1');
  view.disconnectAll();
  assert.equal(sim.wiring.cfg.seg[0], null);
  assert.equal(sim.wiring.cfg.stepper[0], null);
  assert.deepEqual(sim.wiring.cfg.enabled, { seg7: false, matrix: false, keypad: false, stepper: false, spi: false, i2c: false });
});

test('接好線之後，模擬器真的會依照那個接法動作', () => {
  const { sim, view } = mount();
  // 把七段段選接到 P0、位選接到 P2（自己一支一支接）
  for (let i = 0; i < 8; i++) { view._devClicked(`seg.${i}`); view._portClicked(`P0.${i}`); }
  for (let i = 0; i < 8; i++) { view._devClicked(`digit.${i}`); view._portClicked(`P2.${i}`); }
  assert.equal(sim.wiring.cfg.enabled.seg7, true);
  // 位選 X0 拉低、段線 a,b 拉低 → 第 0 位的 a、b 段亮
  sim.bus.write(2, 0xFE);
  sim.bus.write(0, 0xFC);
  sim.display.frame();
  sim.cpu.cycles += 1000;
  const seg = sim.display.frame().seg;
  assert.ok(seg[0] > 0.9 && seg[1] > 0.9, 'X0 的 a、b 段應該全亮');
  assert.ok(seg[2] < 0.05, 'c 段不該亮');
  assert.ok(seg[8] < 0.05, 'X1 不該亮');
});

test('版面沒有互相遮蔽（字壓字／字壓針腳）', () => {
  // 完整檢查在 tools/check-layout.mjs（要先 render）。這裡擋住最容易再犯的兩件事：
  // 1) 字級不能再縮小到看不清楚，2) 橫向排針的腳位字不能比腳距寬。
  const charW = (ch) => (/[⺀-鿿＀-｠]/.test(ch) ? 1.0 : 0.55);
  for (const h of HEADERS) {
    if (h.bare) continue;
    const fs = h.labelSize || 11;
    assert.ok(fs >= 10, `${h.id} 的腳位字級 ${fs} 太小`);
    if (!h.horiz) continue;
    for (const [name] of h.pins) {
      const w = [...String(name)].reduce((a, c) => a + charW(c), 0) * fs;
      assert.ok(w <= h.pitch * 2, `${h.id} 的「${name}」寬 ${w.toFixed(1)} 超過腳距 ${(h.pitch * 2).toFixed(1)}`);
    }
  }
});
