# 測試裡會一直用到的小工具

完整版在 `tests/ch34.test.js` 開頭，新的章節直接抄過去。

## 建模擬器並套接線

```js
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { wiringForExample, DEFAULT_WIRING } from '../web/src/board/wiring.js';
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function simOf(name) {
  const src = readFileSync(path.join(ROOT, 'examples', 'asm', name), 'utf-8');
  const r = assemble(src, { codeSize: 4096 });
  assert.ok(r.ok, name + ' 組譯失敗：' + JSON.stringify(r.diagnostics));
  const s = new Sim();
  const w = wiringForExample(name);
  assert.ok(w, name + ' 沒有登記接線');          // 忘了登記會在這裡被抓到
  s.wiring.set(w);                                // set() 會自己跟 DEFAULT_WIRING 合併
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name });
  return s;
}
const runMs = (s, ms) => s.cpu.run(Math.round(ms * 1000));   // 12MHz：1 週期 = 1us
```

## 把七段讀成 8 個字

```js
// 段 0~6 = a~g 組成 bitmask → 字元；共陽極 7 段的標準編碼
const GLYPH = {
  0x3F: '0', 0x06: '1', 0x5B: '2', 0x4F: '3', 0x66: '4', 0x6D: '5', 0x7D: '6', 0x07: '7', 0x7F: '8', 0x6F: '9',
  0x5F: 'A', 0x7C: 'b', 0x39: 'C', 0x5E: 'd', 0x79: 'E', 0x71: 'F', 0x40: '-', 0x00: ' ',
};
function readDisplay(s, ms, thr = 0.03) {
  s.display.frame();                 // 清掉上一段的工作週期
  runMs(s, ms);                      // 看 ms 毫秒（要蓋過好幾圈掃描）
  const f = s.display.frame().seg;
  let out = '';
  for (let d = 0; d < 8; d++) {
    let m = 0;
    for (let g = 0; g < 7; g++) if (f[d * 8 + g] > thr) m |= 1 << g;
    out += GLYPH[m] ?? '?';          // 出現 ? 就是段的組合不在表裡，多半接線反了
  }
  return out;
}
```

課本的 A 是 a b c d e g（0x5F），不是標準的 0x77，表裡要用課本的。

## 鍵盤與按鈕

```js
function tapKey(s, n, holdMs = 30) {          // 按一下 4x4 鍵盤的 PBn
  s.keypad.press(n, 1); runMs(s, holdMs);
  s.keypad.press(n, 0); runMs(s, 30);         // 放開後再等一下，程式在等放開時不掃七段
}
// 主板按鈕：s.buttons.press(0, 1) 是 PB1/INT0；低態觸發的中斷要按著等它處理完
```

## 看 P1 的變化序列（LED 跑馬燈、中斷副程式）

```js
function watchP1(s, totalMs, stepMs = 5) {
  const seq = [];
  for (let t = 0; t < totalMs; t += stepMs) {
    runMs(s, stepMs);
    const v = s.bus.latch[1];
    if (seq.length === 0 || seq[seq.length - 1].v !== v) seq.push({ t: t + stepMs, v });
  }
  return seq;
}
// 驗「依序出現」：let j = 0; for (const v of seq) if (v === want[j]) j++; assert.equal(j, want.length)
```

## 閃爍、跑馬燈這種會變的畫面

連續取幾個短窗（40~60ms）收進 Set，斷言「看得到完整的字」且「看得到全暗」；
跑馬燈則按畫面週期取樣，找到第一個完整畫面後往後比對序列，不要假設 t=0 剛好對齊。

## 直接改記憶體把時間撥快

`s.cpu.iram[0x66] = 2` 這類寫法可以把時鐘撥到 12:59:58，兩秒就能測進位，不用真的跑一小時。
