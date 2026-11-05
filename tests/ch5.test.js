// 快學 8051 第 5 章（串列埠）的課本實驗與思考題，在模擬器上跑起來要跟課本說的一樣。
// 串列埠是位元級的：74164、74165、短路、第二塊板子都是靠 P3.0/P3.1 的電位在動。
// 「左移、右移」以板子上看到的方向為準：P1.0(DS1) 在最左邊，所以左移 = RR A（見 tests/direction.test.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { wiringForExample } from '../web/src/board/wiring.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const asmOf = (name) => {
  const r = assemble(readFileSync(path.join(ROOT, 'examples', 'asm', name), 'utf-8'), { codeSize: 4096 });
  assert.ok(r.ok, name + ' 組譯失敗：' + JSON.stringify(r.diagnostics));
  return r;
};
function simOf(name) {
  const r = asmOf(name);
  const s = new Sim();
  const w = wiringForExample(name);
  assert.ok(w, name + ' 沒有登記接線');
  s.wiring.set(w);
  const peerHex = w.peerProgram ? asmOf(w.peerProgram).hex : null;
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name, peerHex });
  return s;
}
const runMs = (s, ms) => s.cpu.run(Math.round(ms * 1000));
const P1 = (s) => s.bus.latch[1];
function watchP1(s, totalMs, stepMs = 5) {
  const seq = [];
  for (let t = 0; t < totalMs; t += stepMs) {
    runMs(s, stepMs);
    const v = s.bus.latch[1];
    if (seq[seq.length - 1] !== v) seq.push(v);
  }
  return seq;
}
const inOrder = (seq, want) => { let j = 0; for (const v of seq) if (v === want[j]) j++; return j === want.length; };
const setDip = (s, v) => { for (let i = 0; i < 8; i++) s.dip.set(i, !((v >> i) & 1)); };   // 寫成「P0 讀到的值」

test('code size 跟課本對得上（確認程式沒打漏）', () => {
  // 課本印 19、59、33、28。Keil 的 JMP 會挑 2 位元組的短跳躍，這個組譯器一律 LJMP（3 位元組），
  // 所以每個 JMP 多 1；中斷向量前的空洞不算，5-4-2 開頭的 JMP START 也多的那 1 不影響總長。
  assert.equal(asmOf('CH5-4-1 74165並列輸入.asm').codeBytes, 19 + 1);
  assert.equal(asmOf('CH5-4-2 74164並列輸出.asm').codeBytes, 59 + 2);
  assert.equal(asmOf('CH5-4-3 單機自傳.asm').codeBytes, 33 + 1);
  assert.equal(asmOf('CH5-4-4 雙機互傳.asm').codeBytes, 28 + 2);
});

// ---------- 5-4-1 ----------
test('5-4-1 74165：開關 ON 的 LED 亮，A 對 P1.7、H 對 P1.0', () => {
  const s = simOf('CH5-4-1 74165並列輸入.asm');
  runMs(s, 1);
  assert.equal(P1(s), 0xFF, '開關都 OFF，LED 全滅');
  s.serial.set165(7, 1); runMs(s, 1);                // H ON
  assert.equal(P1(s), 0xFE, 'H → D0 → P1.0');
  s.serial.set165(0, 1); runMs(s, 1);                // A ON
  assert.equal(P1(s), 0x7E, 'A → D7 → P1.7');
  s.serial.set165(7, 0); runMs(s, 1);
  assert.equal(P1(s), 0x7F, '撥回去 LED 就滅');
});

test('5-4-1T 計時器每 5ms 載入一次，主程式閒置，資料不會被收成全 1', () => {
  const s = simOf('CH5-4-1T 計時5ms中斷讀74165.asm');
  s.serial.set165(2, 1);                             // C ON → D5
  let loads = 0;
  s.bus.onPinChange((p, now, old) => { if (p === 3 && (old & 4) && !(now & 4)) loads++; });
  runMs(s, 12);
  assert.equal(P1(s), 0xDF, 'C → D5');
  for (let i = 0; i < 20; i++) { runMs(s, 1.3); assert.equal(P1(s), 0xDF, '不能閃成全滅'); }
  const n0 = loads; runMs(s, 100);
  assert.ok(Math.abs(loads - n0 - 20) <= 1, `100ms 應該載入約 20 次，實際 ${loads - n0}`);
});

// ---------- 5-4-2 ----------
test('5-4-2 74164：Q 輸出跟開關一樣，D0 在 QH、D7 在 QA', () => {
  const s = simOf('CH5-4-2 74164並列輸出.asm');
  setDip(s, 0xFE);                                   // P0.0 ON
  runMs(s, 1); s.serial.frame(); runMs(s, 5);
  const d = s.serial.frame().led164;
  // led164[i] = DS(i+1)，就是 D0~D7
  assert.ok(d[0] > 0.4, `DS1 應該亮，亮度 ${d[0]}`);
  for (let i = 1; i < 8; i++) assert.ok(d[i] < d[0] / 3, `DS${i + 1} 只能微亮（移位時的殘影），亮度 ${d[i]}`);
});

test('5-4-2T 74164 單燈左移：DS8 → DS7 → … 每 0.1 秒往左一格', () => {
  const s = simOf('CH5-4-2T 74164單燈左移.asm');
  const seq = [];
  for (let t = 0; t < 900; t += 10) {
    runMs(s, 10);
    const q = s.serial.q164;                         // bit0 = QA … bit7 = QH；DS1 = QH
    if (seq[seq.length - 1] !== q) seq.push(q);
  }
  // 依序亮 QA(DS8，最右)、QB、…、QH(DS1，最左)，再回到 QA
  const want = [0xFE, 0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F, 0xFE];
  assert.ok(inOrder(seq, want), '順序不對：' + seq.map(v => v.toString(16)).join(' '));
});

// ---------- 5-4-3 ----------
for (const [name, mode] of [['CH5-4-3 單機自傳.asm', 1], ['CH5-4-3T Mode2單機自傳.asm', 2], ['CH5-4-3T Mode3單機自傳.asm', 3]]) {
  test(`5-4-3 單機自傳 Mode ${mode}：開關繞一圈到 LED，每個值都對`, () => {
    const s = simOf(name);
    runMs(s, 10);
    assert.equal(s.cpu.sfr[0x98 - 0x80] >> 6, mode);
    assert.equal(P1(s), 0xFF);
    for (const v of [0x00, 0x55, 0xAA, 0xFE, 0x7F, 0x80, 0x01, 0xFF, 0x3C]) {
      setDip(s, v);
      runMs(s, 10);                                  // 前一筆送完 + 這一筆，Mode 1/3 約 5ms
      assert.equal(P1(s), v, `開關 ${v.toString(16)} → LED ${P1(s).toString(16)}`);
    }
  });
}

test('5-4-3 拆掉短路就收不到（證明真的是走腳位繞回來的）', () => {
  const s = simOf('CH5-4-3 單機自傳.asm');
  s.wiring.set({ ...s.wiring.cfg, serial: 'none' });
  setDip(s, 0x00);
  runMs(s, 20);
  assert.equal(P1(s), 0xFF, 'P3.0 沒接到 P3.1，RI 不會起來');
});

test('Mode 1 鮑率：TH1=F3H、SMOD=1 時一位 208us，P3.1 上量得到', () => {
  const s = simOf('CH5-4-3 單機自傳.asm');
  setDip(s, 0x55);
  const edges = [];
  s.bus.onPinChange((p, now, old) => { if (p === 3 && ((now ^ old) & 2)) edges.push(s.cpu.cycles); });
  runMs(s, 12);
  const gaps = edges.slice(1).map((t, i) => t - edges[i]);
  assert.ok(gaps.length > 8);
  assert.ok(gaps.includes(208), '0x55 每位都翻轉，間隔要有 208us，實際 ' + [...new Set(gaps)].join(','));
  assert.equal(Math.round(s.cpu.uartBaud()), 4808);
});

test('Mode 2 鮑率：SMOD=1 是 375000bps', () => {
  const s = simOf('CH5-4-3T Mode2單機自傳.asm');
  runMs(s, 1);
  assert.equal(s.cpu.uartBaud(), 375000);
});

// ---------- 5-4-4 ----------
test('5-4-4 雙機互傳：兩塊同時改開關，各自顯示對方的值', () => {
  const s = simOf('CH5-4-4 雙機互傳.asm');
  const b = s.serial.peer;
  assert.ok(b, '第二塊板子要存在');
  runMs(s, 1);
  for (const [va, vb] of [[0x00, 0xFF], [0x55, 0xAA], [0xF0, 0x0F], [0xFE, 0x7F], [0x81, 0x42]]) {
    setDip(s, va); setDip(b, vb);
    runMs(s, 1);                                     // 375000bps，一筆才 29us
    assert.equal(P1(s), vb, `第一塊的 LED 要是第二塊的開關 ${vb.toString(16)}，實際 ${P1(s).toString(16)}`);
    assert.equal(P1(b), va, `第二塊的 LED 要是第一塊的開關 ${va.toString(16)}，實際 ${P1(b).toString(16)}`);
  }
});

test('5-4-4T 第一塊的 P2.0 切換第二塊 LED；第二塊的 P2.0/P2.1 叫第一塊左移/右移', () => {
  const a = simOf('CH5-4-4T 第一塊P20控制對方LED.asm');
  const b = a.serial.peer;
  const tap = (who, i) => { who.buttons.press(i, 1); runMs(a, 30); who.buttons.press(i, 0); runMs(a, 30); };
  runMs(a, 30);
  assert.equal(P1(b), 0xFF, '第二塊一開始不亮');
  assert.equal(P1(a), 0xFF, '第一塊一開始不亮');
  tap(a, 2);                                         // 第一塊 PB3 = P2.0
  assert.equal(P1(b), 0x00, '按一下：第二塊全亮');
  tap(a, 2);
  assert.equal(P1(b), 0xFF, '再按一下：第二塊全滅');
  tap(a, 2);
  assert.equal(P1(b), 0x00, '再按又全亮');
  // 第二塊 P2.0：第一塊單燈左移，板子上由 DS8(右) 往 DS1(左)
  tap(b, 2);
  assert.ok(inOrder(watchP1(a, 900), [0xBF, 0xDF, 0xEF, 0xF7, 0xFB, 0xFD, 0xFE, 0x7F]), '第一塊要往左跑');
  // 第二塊 P2.1：第一塊單燈右移，板子上由 DS1(左) 往 DS8(右)
  tap(b, 3);
  assert.ok(inOrder(watchP1(a, 900), [0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F, 0xFE]), '第一塊要往右跑');
  assert.equal(P1(b), 0x00, '第二塊的 LED 不受影響');
});

test('5-4-4T 換載入第二塊的檔案，等於兩塊板子對調', () => {
  const a = simOf('CH5-4-4T 第二塊P20P21控制對方移位.asm');
  const b = a.serial.peer;
  runMs(a, 30);
  b.buttons.press(2, 1); runMs(a, 30); b.buttons.press(2, 0); runMs(a, 30);
  assert.equal(P1(a), 0x00, '這時第一塊跑的是「收值放 LED」，要被第二塊的 P2.0 切成全亮');
});

// ---------- 5-4-5 ----------
test('5-4-5 PC 連線：PC 傳的值顯示在 LED，開關的值傳到 PC', () => {
  const s = simOf('CH5-4-5 PC與8051連線.asm');
  setDip(s, 0x5A);
  runMs(s, 5);
  assert.equal(s.uartOut[s.uartOut.length - 1], 0x5A, '開機先送一次開關');
  s.serial.pcSend(0xA5);
  runMs(s, 5);
  assert.equal(P1(s), 0xA5, 'PC 傳出的值要顯示在 LED');
  setDip(s, 0x3C);
  s.serial.pcSend(0x0F);
  runMs(s, 10);
  assert.equal(P1(s), 0x0F);
  assert.equal(s.uartOut[s.uartOut.length - 1], 0x3C, '收到一筆就回傳現在的開關');
  assert.equal(Math.round(s.cpu.uartBaud()), 4808, '面板要顯示 4808bps');
});

test('5-4-5T PC 下命令：1 閃爍、2 左移、3 右移、0 全滅，字元也通', () => {
  const s = simOf('CH5-4-5T PC指揮LED.asm');
  runMs(s, 300);
  assert.equal(P1(s), 0xFF, '還沒下命令：全滅');
  s.serial.pcSend(1);
  assert.ok(inOrder(watchP1(s, 500), [0x00, 0xFF, 0x00, 0xFF]), '命令 1：8 燈閃爍');
  s.serial.pcSend(0x32);                             // 字元 '2'
  assert.ok(inOrder(watchP1(s, 500), [0x7F, 0xBF, 0xDF, 0xEF]), "字元 '2'：單燈往左跑");
  s.serial.pcSend(3);
  assert.ok(inOrder(watchP1(s, 500), [0xFE, 0xFD, 0xFB, 0xF7]), '命令 3：單燈往右跑');
  s.serial.pcSend(0);
  runMs(s, 300);
  assert.equal(P1(s), 0xFF, '命令 0：全滅');
});

// ---------- UART 本身 ----------
test('SBUF 寫入的不會蓋掉讀出的：傳送中讀到的還是上一筆收到的', () => {
  const r = assemble('MOV SCON,#50H\nMOV TMOD,#20H\nMOV TH1,#0F3H\nSETB TR1\nMOV SBUF,#12H\nJMP $\nEND\n', { codeSize: 4096 });
  assert.ok(r.ok);
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 't' });
  runMs(s, 1);
  assert.equal(s.cpu.readDirect(0x99), 0, '還沒收過東西，SBUF 讀到 0');
});

test('Timer 1 沒開，Mode 1 就傳不出去（跟真的晶片一樣）', () => {
  const r = assemble('MOV SCON,#40H\nMOV SBUF,#55H\nJMP $\nEND\n', { codeSize: 4096 });
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 't' });
  runMs(s, 10);
  assert.equal(s.cpu.sfr[0x98 - 0x80] & 2, 0, 'TI 不會起來');
  assert.equal(s.bus.pins[3] & 2, 2, 'TxD 保持高態');
});

test('SM2=1 時第 9 位是 0 的資料不會產生 RI（多處理器通訊）', () => {
  const r = assemble('MOV SCON,#0B0H\nORL PCON,#80H\nMOV SBUF,#33H\nJMP $\nEND\n', { codeSize: 4096 });
  const s = new Sim();
  s.wiring.set({ ...s.wiring.cfg, serial: 'loopback' });
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: 't' });
  runMs(s, 1);
  assert.equal(s.cpu.sfr[0x98 - 0x80] & 1, 0, 'TB8=0 + SM2=1：RI 不起來');
  assert.equal(s.cpu.sfr[0x98 - 0x80] & 2, 2, 'TI 還是要起來');
});
