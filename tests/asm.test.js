// 組譯器測試 + 課本 2-7-1/2/3 範例在模擬器上的行為驗證
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assemble } from '../web/src/asm/assembler.js';
import { Sim } from '../web/src/sim.js';
import { wiringForExample } from '../web/src/board/wiring.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const asmOf = (name) => readFileSync(path.join(ROOT, 'examples', 'asm', name), 'utf-8');
function build(src) {
  const r = assemble(src);
  assert.ok(r.ok, '組譯失敗：' + JSON.stringify(r.diagnostics));
  return r;
}
function simOf(name) {
  const r = build(asmOf(name));
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name });
  return s;
}
const runMs = (s, ms) => s.cpu.run(Math.round(ms * 1000));
const bytesAt = (r, addr, n) => {
  const mem = [];
  for (const l of r.listing) for (let k = 0; k < l.bytes.length; k++) if (l.addr + k >= addr && l.addr + k < addr + n) mem[l.addr + k - addr] = l.bytes[k];
  return mem;
};

// ---------- 組譯器單元測試 ----------
test('數值格式與運算式', () => {
  const r = build(`
	ORG 0
	MOV A,#0FFH
	MOV A,#11110000B
	MOV A,#0x1F
	MOV A,#100
	MOV A,#'A'
	MOV A,#LOW(1234H)
	MOV A,#HIGH(1234H)
	MOV A,#(2+3)*4
	END`);
  assert.deepEqual(bytesAt(r, 0, 16), [0x74, 0xFF, 0x74, 0xF0, 0x74, 0x1F, 0x74, 100, 0x74, 0x41, 0x74, 0x34, 0x74, 0x12, 0x74, 20]);
});

test('EQU 位元位址與 SETB/JNB 編碼', () => {
  const r = build(`
Switch	EQU	P0.0
Buzzer	EQU	P3.7
	ORG	0
	SETB	Switch
	CLR	Buzzer
	JNB	Switch,$
	END`);
  // P0.0 = 80H, P3.7 = B7H
  assert.deepEqual(bytesAt(r, 0, 7), [0xD2, 0x80, 0xC2, 0xB7, 0x30, 0x80, 0xFD]);
});

test('$ 為本行位址：DJNZ R7,$ 編成 DF FE', () => {
  const r = build(`	ORG 0\n	MOV R7,#250\n	DJNZ R7,$\n	END`);
  assert.deepEqual(bytesAt(r, 0, 4), [0x7F, 250, 0xDF, 0xFE]);
});

test('通用 JMP/CALL 組成 LJMP/LCALL', () => {
  const r = build(`	ORG 0\nSTART:	JMP START\n	CALL SUB\nSUB:	RET\n	END`);
  assert.deepEqual(bytesAt(r, 0, 7), [0x02, 0x00, 0x00, 0x12, 0x00, 0x06, 0x22]);
});

test('MOV dir,dir 的來源/目的順序 (85 src dst)', () => {
  const r = build(`	ORG 0\n	MOV 30H,40H\n	END`);
  assert.deepEqual(bytesAt(r, 0, 3), [0x85, 0x40, 0x30]);
});

test('DB / DW / 字串', () => {
  const r = build(`	ORG 0\n	DB 1,2,'AB',0\n	DW 1234H\n	END`);
  assert.deepEqual(bytesAt(r, 0, 7), [1, 2, 0x41, 0x42, 0, 0x12, 0x34]);
});

test('錯誤回報：未定義符號、超出相對跳躍範圍、未知指令', () => {
  let r = assemble(`	ORG 0\n	MOV A,FOO\n	END`);
  assert.ok(!r.ok); assert.match(r.diagnostics[0].msg, /未定義的符號 FOO/); assert.equal(r.diagnostics[0].line, 2);
  r = assemble(`	ORG 0\n	SJMP FAR\n	DS 200\nFAR:	NOP\n	END`);
  assert.ok(!r.ok); assert.match(r.diagnostics[0].msg, /相對跳躍超出範圍/);
  r = assemble(`	ORG 0\n	FOO A\n	END`);
  assert.ok(!r.ok); assert.match(r.diagnostics[0].msg, /未知的指令 FOO/);
});

test('Intel HEX 輸出可被模擬器載回，且行號對應正確', () => {
  const r = build(`	ORG 0\n	MOV A,#55H\n	MOV P1,A\n	END`);
  const s = new Sim();
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols });
  assert.equal(s.cpu.code[0], 0x74); assert.equal(s.cpu.code[1], 0x55);
  assert.equal(s.lineOfAddr(0), 2);
  assert.equal(s.lineOfAddr(2), 3);
  s.cpu.step(); s.cpu.step();
  assert.equal(s.bus.latch[1], 0x55);
});

// ---------- 課本範例行為驗證 ----------
test('2-7-1 嗶嗶電路：P0.0 撥 ON 才嗶，頻率 1KHz，靜音 0.1 秒', () => {
  const s = simOf('CH2-7-1 嗶嗶電路.asm');
  runMs(s, 50);
  assert.equal(s.buzzer.events.length, 0, '開關 OFF 時不應發聲');
  assert.equal((s.bus.pins[3] >> 7) & 1, 1, '蜂鳴器腳位應為高（不響）');

  s.dip.set(0, 1);                     // P0.0 撥 ON → 讀 0
  s.buzzer.events.length = 0;
  runMs(s, 450);                       // 夠長才涵蓋「嗶 0.1s + 靜音 0.1s」數個循環
  const ev = s.buzzer.events;
  assert.ok(ev.length > 100, `撥 ON 應持續發聲，實際 ${ev.length} 次翻轉`);
  // 半週期 = 500µs → 1KHz
  const d = []; for (let i = 1; i < 40; i++) d.push(ev[i][0] - ev[i - 1][0]);
  const half = d.reduce((a, b) => a + b, 0) / d.length;
  assert.ok(Math.abs(half - 500) < 12, `半週期應約 500µs，實際 ${half.toFixed(1)}µs`);
  // 100 次翻轉後靜音 0.1s：找出最大間隔
  const all = []; for (let i = 1; i < ev.length; i++) all.push(ev[i][0] - ev[i - 1][0]);
  const gap = Math.max(...all);
  assert.ok(gap > 90000 && gap < 115000, `靜音應約 0.1 秒，實際 ${gap}µs`);

  s.dip.set(0, 0);                     // 撥回 OFF
  runMs(s, 300); s.buzzer.events.length = 0; runMs(s, 50);
  assert.equal(s.buzzer.events.length, 0, '撥 OFF 後應停止發聲');
});

test('2-7-2 LED 移動電路：按 P2.0 後單燈左移 8 位、每 0.3 秒，結束回全滅', () => {
  const s = simOf('CH2-7-2 LED移動電路.asm');
  runMs(s, 10);
  assert.equal(s.bus.latch[1], 0xFF, '未按鍵時 LED 全滅');

  s.buttons.press(2, 1);               // PB3 = P2.0
  runMs(s, 5);
  s.buttons.press(2, 0);
  assert.equal(s.bus.latch[1], 0xFE, '按下後應先只亮 P1.0');
  const seen = [];
  let last = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 3e6) {
    s.cpu.run(200);
    const v = s.bus.latch[1];
    if (v !== last) { last = v; seen.push(v); }
  }
  assert.deepEqual(seen, [0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F, 0xFF],
    '應逐位左移到 P1.7 後回到全滅，且按一下只跑一輪');
});

test('2-7-2 每一步間隔確實是 0.3 秒', () => {
  const s = simOf('CH2-7-2 LED移動電路.asm');
  runMs(s, 5); s.buttons.press(2, 1); runMs(s, 5); s.buttons.press(2, 0);
  const marks = [];
  let last = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 2.4e6 && marks.length < 8) {
    s.cpu.run(200);
    if (s.bus.latch[1] !== last) { last = s.bus.latch[1]; marks.push(s.cpu.cycles); }
  }
  const gaps = []; for (let i = 1; i < marks.length; i++) gaps.push(marks[i] - marks[i - 1]);
  for (const g of gaps) assert.ok(Math.abs(g - 300000) < 6000, `間隔應約 0.3 秒，實際 ${(g / 1000).toFixed(1)}ms`);
});

test('2-7-3 霹靂燈：左右來回、每 0.1 秒一位、兩端不停頓重複', () => {
  const s = simOf('CH2-7-3 霹靂燈電路.asm');
  runMs(s, 5);
  const seq = [];
  let last = null;
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 1.8e6) {
    s.cpu.run(200);
    const v = s.bus.latch[1];
    if (v !== last) { last = v; seq.push(v); }
  }
  // 一輪：FE FD FB F7 EF DF BF 7F 然後右移 BF DF EF F7 FB FD FE 再回 FE…
  const expectLeft = [0xFE, 0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F];
  assert.deepEqual(seq.slice(0, 8), expectLeft, '前 8 步應為左移');
  assert.deepEqual(seq.slice(8, 15), [0xBF, 0xDF, 0xEF, 0xF7, 0xFB, 0xFD, 0xFE], '接著應右移回來');
  // 每格只有一顆亮
  for (const v of seq.slice(0, 15)) {
    const off = (v.toString(2).padStart(8, '0').match(/0/g) || []).length;
    assert.equal(off, 1, `${v.toString(16)} 應只有一顆 LED 亮`);
  }
});

test('2-7-3 每一步間隔確實是 0.1 秒', () => {
  const s = simOf('CH2-7-3 霹靂燈電路.asm');
  runMs(s, 5);
  const marks = []; let last = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 8e5 && marks.length < 7) {
    s.cpu.run(200);
    if (s.bus.latch[1] !== last) { last = s.bus.latch[1]; marks.push(s.cpu.cycles); }
  }
  const gaps = []; for (let i = 1; i < marks.length; i++) gaps.push(marks[i] - marks[i - 1]);
  for (const g of gaps) assert.ok(Math.abs(g - 100000) < 3000, `間隔應約 0.1 秒，實際 ${(g / 1000).toFixed(1)}ms`);
});

// ---------- 思考題 ----------
test('思考題 2-7-1：1KHz 與 2KHz 交替，各持續 0.1 秒', () => {
  const s = simOf('CH2-7-1T 1K2K交替嗶聲.asm');
  runMs(s, 20);
  assert.equal(s.buzzer.events.length, 0, '開關 OFF 不應發聲');
  s.dip.set(0, 1);
  s.buzzer.events.length = 0;
  runMs(s, 1200);
  // 依 >50ms 的靜音把翻轉切成一「聲」一「聲」
  const ev = s.buzzer.events;
  const groups = [];
  let cur = [ev[0][0]];
  for (let i = 1; i < ev.length; i++) {
    const d = ev[i][0] - ev[i - 1][0];
    if (d > 50000) { groups.push(cur); cur = []; }
    cur.push(ev[i][0]);
  }
  // 最後一組可能被截斷，只看中間完整的組
  const full = groups.slice(1, 5);
  assert.ok(full.length >= 4, `應擷取到至少 4 段完整嗶聲，實際 ${full.length}`);
  const avgHalf = (g) => { let n = 0; for (let i = 1; i < g.length; i++) n += g[i] - g[i - 1]; return n / (g.length - 1); };
  full.forEach((g, i) => {
    const isLow = i % 2 === 0 ? (avgHalf(full[0]) > 400) : (avgHalf(full[0]) <= 400);
    const half = avgHalf(g), toggles = g.length;
    if (half > 400) {
      assert.ok(Math.abs(half - 500) < 12, `1KHz 段半週期應約 500µs，實際 ${half.toFixed(1)}`);
      assert.ok(Math.abs(toggles - 200) <= 2, `1KHz 段應 100 個週期(200 次翻轉) = 0.1 秒，實際 ${toggles}`);
    } else {
      assert.ok(Math.abs(half - 250) < 12, `2KHz 段半週期應約 250µs，實際 ${half.toFixed(1)}`);
      assert.ok(Math.abs(toggles - 400) <= 2, `2KHz 段應 200 個週期(400 次翻轉) = 0.1 秒，實際 ${toggles}`);
    }
  });
  // 1KHz 與 2KHz 必須交替出現
  const kinds = full.map(g => avgHalf(g) > 400 ? '1K' : '2K');
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1], `兩段應交替，實際順序 ${kinds.join(',')}`);
  // 段與段之間靜音約 0.1 秒
  for (let i = 1; i < full.length; i++) {
    const gap = full[i][0] - full[i - 1][full[i - 1].length - 1];
    assert.ok(gap > 95000 && gap < 112000, `段間靜音應約 0.1 秒，實際 ${gap}µs`);
  }
});

test('思考題 2-7-2：雙燈左移', () => {
  const s = simOf('CH2-7-2T 雙燈左移.asm');
  runMs(s, 10);
  assert.equal(s.bus.latch[1], 0xFF, '未按鍵時全滅');
  s.buttons.press(2, 1); runMs(s, 5); s.buttons.press(2, 0);
  assert.equal(s.bus.latch[1], 0x3F, '按下後應先亮最右邊的 P1.6、P1.7（DS7、DS8）');
  const seen = []; let last = s.bus.latch[1];
  const t0 = s.cpu.cycles;
  while (s.cpu.cycles - t0 < 2.7e6) {
    s.cpu.run(200);
    const v = s.bus.latch[1];
    if (v !== last) { last = v; seen.push(v); }
  }
  // 往低位元走 = 燈在畫面上由右往左（P1.0 是最左邊的 DS1）
  assert.deepEqual(seen, [0x9F, 0xCF, 0xE7, 0xF3, 0xF9, 0xFC, 0xFF],
    '兩顆一組往畫面左邊移到 P1.0/P1.1 後回全滅');
  // 每一格都恰好兩顆亮，且相鄰
  for (const v of seen.slice(0, 6)) {
    const b = v.toString(2).padStart(8, '0');
    assert.equal((b.match(/0/g) || []).length, 2, `${v.toString(16)} 應有兩顆亮`);
    assert.match(b, /00/, `${v.toString(16)} 兩顆應相鄰`);
  }
});

test('思考題 2-7-3：走到最右邊(P1.7)嗶 2 聲、回到最左邊(P1.0)嗶 1 聲', () => {
  const s = simOf('CH2-7-3T 霹靂燈加嗶聲.asm');
  // 收集 LED 轉態與蜂鳴器「嗶聲群組」的時間
  const beeps = [];         // 每個嗶聲群的起始時間
  const ledMarks = [];
  let last = s.bus.latch[1], lastEvT = -1e9;
  const t0 = s.cpu.cycles;
  s.buzzer.events.length = 0;
  while (s.cpu.cycles - t0 < 5.5e6 && beeps.length < 6) {
    s.cpu.run(200);
    const v = s.bus.latch[1];
    if (v !== last) { last = v; ledMarks.push([v, s.cpu.cycles - t0]); }
    for (const [t] of s.buzzer.events) { if (t - lastEvT > 50000) beeps.push(t - t0); lastEvT = t; }
    s.buzzer.events.length = 0;
  }
  // 節奏：RL 跑到最右邊 →「2 聲」→ RR 跑回最左邊 →「1 聲」→ 重來
  assert.equal(beeps.length, 6, `兩個完整週期應有 6 個嗶聲群，實際 ${beeps.length}`);
  const rightEnd = ledMarks.find(([v]) => v === 0x7F);
  assert.ok(rightEnd, 'LED 應走到 7FH（P1.7＝最右邊的 DS8 亮）');
  assert.ok(beeps[0] > rightEnd[1], '第一組嗶聲應在燈走到最右邊之後');
  const gaps = []; for (let i = 1; i < beeps.length; i++) gaps.push(beeps[i] - beeps[i - 1]);
  // 成對的那兩聲在最右邊 → 短間隔出現在索引 0 與 3；單獨一聲在最左邊
  gaps.forEach((g, i) => {
    if (i === 0 || i === 3) assert.ok(g < 300000, `最右邊那組應是連著的兩聲，實際間隔 ${(g / 1000).toFixed(0)}ms`);
    else assert.ok(g > 700000, `第 ${i + 2} 聲前應隔著整段 LED 移動，實際 ${(g / 1000).toFixed(0)}ms`);
  });
});

const SONG = 'CH2-7-4 演奏樂曲與燈光律動.asm';
// 樂譜（實音）：第 1~6 小節是兩小節一組重複三次，第 7~8 小節是加密版
const M1 = ['F5', 'F#4', 'F4', 'Gb3'];
const M2 = ['F3', 'F4', 'Gb3', 'F3', 'Gb3', 'Eb4'];
const SCORE = [...M1, ...M2, ...M1, ...M2, ...M1, ...M2,
  'F5', 'F5', 'F#4', 'F#4', 'F4', 'F4', 'Gb3', 'Gb3',
  'F3', 'F4', 'Gb3', 'F3', 'Gb3', 'Eb4', 'Eb4'];
const HZ = { F5: 698.5, 'F#4': 370.0, F4: 349.2, Gb3: 185.0, F3: 174.6, Eb4: 311.1 };
// 音高代號 → 燈條圖樣（低態亮），要跟 .asm 裡的 BARS 表一致
const BAR = { F5: 0x00, 'F#4': 0xC0, F4: 0xE0, Gb3: 0xFC, F3: 0xFE, Eb4: 0xF8 };

function songSim() {
  const r = build(asmOf(SONG));
  const s = new Sim();
  s.wiring.set(wiringForExample(SONG));
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: SONG });
  return s;
}
// 把蜂鳴器腳位的翻轉事件切成一個個「音」：靜音超過 30ms 就算換音
function playNotes(s, us) {
  const evs = [];
  s.buzzer.events.length = 0;
  while (s.cpu.cycles < us) { s.cpu.run(20000); for (const e of s.buzzer.frame(s.cpu.cycles)) evs.push(e); }
  const notes = [];
  let cur = null;
  for (let i = 1; i < evs.length; i++) {
    const gap = evs[i][0] - evs[i - 1][0];
    if (gap > 30000 || !cur) { if (cur && cur.n > 3) notes.push(cur); cur = { t0: evs[i][0], n: 0, sum: 0 }; }
    if (gap <= 30000) { cur.n++; cur.sum += gap; }
  }
  if (cur && cur.n > 3) notes.push(cur);
  return notes.map((n) => ({ t0: n.t0, hz: 5e5 / (n.sum / n.n) }));
}

test('2-7-4 演奏樂曲：音高與節拍對得上樂譜，而且會自動循環', () => {
  const notes = playNotes(songSim(), 26e6);
  assert.ok(notes.length > SCORE.length,
    `26 秒內應放完一輪(${SCORE.length} 個音)並開始重來，實際 ${notes.length}`);
  SCORE.forEach((name, i) => {
    const cents = 1200 * Math.log2(notes[i].hz / HZ[name]);
    assert.ok(Math.abs(cents) < 20,
      `第 ${i + 1} 個音應是 ${name}(${HZ[name]}Hz)，實際 ${notes[i].hz.toFixed(1)}Hz，差 ${cents.toFixed(0)} 音分`);
  });
  const loop = 1200 * Math.log2(notes[SCORE.length].hz / HZ.F5);
  assert.ok(Math.abs(loop) < 20, '放完應該無縫從頭再來');
  // ♩=162 → 四分音符 370ms、八分音符 185ms
  const q = (notes[1].t0 - notes[0].t0) / 1000;      // 第 1 小節都是四分音符
  assert.ok(Math.abs(q - 370.4) < 11, `四分音符應約 370ms，實際 ${q.toFixed(0)}ms`);
  const e = (notes[5].t0 - notes[4].t0) / 1000;      // 第 2 小節開頭是八分音符
  assert.ok(Math.abs(e - 185.2) < 6, `八分音符應約 185ms，實際 ${e.toFixed(0)}ms`);
});

test('2-7-4 燈光：燈條高度跟著音高走，斷奏的靜音段整排熄掉', () => {
  const s = songSim();
  const seen = new Map();
  let segLit = 0, matrixMax = 0;
  while (s.cpu.cycles < 6e6) {
    s.cpu.run(20000);
    const v = s.bus.latch[1];
    seen.set(v, (seen.get(v) || 0) + 1);
    const f = s.display.frame();
    segLit = Math.max(segLit, f.seg.filter((d) => d > 0.02).length);
    matrixMax = Math.max(matrixMax, f.matrix.filter((d) => d > 0.02).length);
  }
  // 主板 8 顆 LED 只會出現「六種燈條 + 全暗」這七個值，不會有別的
  const ok = new Set([...Object.values(BAR), 0xFF]);
  for (const v of seen.keys()) {
    assert.ok(ok.has(v), `P1 出現了不該有的值 ${v.toString(16).toUpperCase()}H`);
  }
  assert.ok(seen.get(0xFF) > 0, '斷奏的靜音段主板 LED 應該真的滅掉');
  for (const name of M1) {
    assert.ok(seen.has(BAR[name]), `第 1 小節的 ${name} 應該把燈條設成 ${BAR[name].toString(16).toUpperCase()}H`);
  }
  assert.ok(segLit >= 8, `七段應該有在掃(八位數各亮一段)，實際最多只亮 ${segLit} 段`);
  assert.ok(matrixMax >= 32, `LED 陣列應該顯示整條橫帶，實際最多只亮 ${matrixMax} 點`);
});

test('2-7-4 馬達：跟著節奏一步一步走，高音正轉、低音反轉，不失步', () => {
  const s = songSim();
  let fwd = 0, rev = 0, last = 0;
  const seenAngles = [];
  while (s.cpu.cycles < 6e6) {
    s.cpu.run(5000);
    const a = s.stepper.angle;
    if (a > last) fwd++; else if (a < last) rev++;
    seenAngles.push(a);
    last = a;
  }
  assert.equal(s.stepper.missed, 0, '相位順序若對，就不該有失步');
  assert.ok(fwd > 20 && rev > 20, `高音正轉、低音反轉都要看得到，實際 正 ${fwd} / 反 ${rev}`);
  const swing = Math.max(...seenAngles) - Math.min(...seenAngles);
  assert.ok(swing > 60, `馬達應該明顯地來回擺動，實際只有 ${swing.toFixed(0)} 度`);
});

test('web/src/programs.js 與 examples/asm 完全同步', async () => {
  // 測試讀的是 examples/asm/*.asm，瀏覽器跑的卻是 programs.js 裡的副本。
  // 曾經發生「改了 .asm、測試全過、網頁上還是舊行為」——這一項就是擋這個。
  // 不同步時：node tools/build-programs.mjs
  const { PROGRAMS } = await import('../web/src/programs.js');
  const dir = new URL('../examples/asm/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.asm')).sort();
  const inJs = PROGRAMS.filter(p => p.asm).map(p => p.name).sort();
  assert.deepEqual(inJs, files, 'programs.js 的 .asm 範例清單與 examples/asm 不一致');
  for (const f of files) {
    const disk = readFileSync(new URL(f, dir), 'utf-8');
    const js = PROGRAMS.find(p => p.name === f).source;
    assert.equal(js, disk, `${f} 的內容與 programs.js 不同 —— 請跑 node tools/build-programs.mjs`);
  }
});
