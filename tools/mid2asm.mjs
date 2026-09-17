// 把標準 MIDI 檔轉成這個模擬器用的 A51 樂譜（單音、方波蜂鳴器）。
//
// 用法：node tools/mid2asm.mjs <輸入.mid> [輸出.asm] [--oct=N] [--max=秒]
//   --oct=N   整體移調 N 個八度（蜂鳴器在 2~4kHz 最有效率，低音會很小聲）
//   --max=秒  只取前面幾秒
//
// 蜂鳴器只有一支腳、只有高低兩種狀態，所以：
//   * 和弦一律只留最高音（旋律線）
//   * 力度、音色、圓滑線全部丟掉
//   * 同時發聲的音會被壓成一條單音線
import { readFileSync, writeFileSync } from 'node:fs';

// ---------- 讀 MIDI ----------
function parseMidi(buf) {
  let p = 0;
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  if (buf.toString('latin1', 0, 4) !== 'MThd') throw new Error('不是 MIDI 檔');
  p = 4;
  const hdrLen = u32(); const format = u16(); const nTrk = u16(); const div = u16();
  p = 8 + hdrLen;
  if (div & 0x8000) throw new Error('SMPTE 時碼的 MIDI 還沒支援');

  const events = [];           // {tick, type, ...}
  for (let t = 0; t < nTrk; t++) {
    if (buf.toString('latin1', p, p + 4) !== 'MTrk') break;
    p += 4;
    const len = u32();
    const end = p + len;
    let tick = 0, running = 0;
    while (p < end) {
      let v = 0, b;                                  // 可變長度的 delta time
      do { b = buf[p++]; v = (v << 7) | (b & 0x7F); } while (b & 0x80);
      tick += v;
      let st = buf[p];
      if (st & 0x80) p++; else st = running;
      running = st < 0xF0 ? st : running;
      const hi = st & 0xF0;
      if (hi === 0x90 || hi === 0x80) {
        const note = buf[p++], vel = buf[p++];
        events.push({ tick, type: (hi === 0x90 && vel > 0) ? 'on' : 'off', note });
      } else if (hi === 0xA0 || hi === 0xB0 || hi === 0xE0) { p += 2; }
      else if (hi === 0xC0 || hi === 0xD0) { p += 1; }
      else if (st === 0xFF) {
        const meta = buf[p++];
        let n = 0; do { b = buf[p++]; n = (n << 7) | (b & 0x7F); } while (b & 0x80);
        if (meta === 0x51) events.push({ tick, type: 'tempo', usPerQuarter: (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2] });
        p += n;
      } else if (st === 0xF0 || st === 0xF7) {
        let n = 0; do { b = buf[p++]; n = (n << 7) | (b & 0x7F); } while (b & 0x80);
        p += n;
      } else { throw new Error('看不懂的狀態位元組 0x' + st.toString(16)); }
    }
    p = end;
  }
  events.sort((a, b) => a.tick - b.tick);
  return { format, div, events };
}

// ---------- 把和弦壓成單音，換算成毫秒 ----------
function melodyOf({ div, events }) {
  let usPerQuarter = 500000;                         // 沒指定就是 120 BPM
  const held = new Map();                            // note → 起始 tick
  const out = [];                                    // {note, startMs, endMs}
  let lastTick = 0, ms = 0;
  const advance = (tick) => { ms += (tick - lastTick) * usPerQuarter / div / 1000; lastTick = tick; };

  const segs = [];                                   // 每一段「目前按著哪些音」
  for (const e of events) {
    advance(e.tick);
    if (e.type === 'tempo') { usPerQuarter = e.usPerQuarter; continue; }
    segs.push({ ms, notes: [...held.keys()] });
    if (e.type === 'on') held.set(e.note, ms); else held.delete(e.note);
  }
  segs.push({ ms, notes: [...held.keys()] });

  // 每一段只留最高音；相鄰同音就併起來
  for (let i = 0; i < segs.length - 1; i++) {
    const { ms: t0, notes } = segs[i];
    const t1 = segs[i + 1].ms;
    if (t1 - t0 < 1) continue;                       // 1ms 以下的碎片丟掉
    const top = notes.length ? Math.max(...notes) : null;
    const prev = out[out.length - 1];
    if (prev && prev.note === top && Math.abs(prev.endMs - t0) < 1) { prev.endMs = t1; continue; }
    out.push({ note: top, startMs: t0, endMs: t1 });
  }
  return out;
}

// ---------- 主程式 ----------
const [, , inPath, outPath = 'out.asm', ...rest] = process.argv;
if (!inPath) { console.error('用法：node tools/mid2asm.mjs <輸入.mid> [輸出.asm] [--oct=N] [--max=秒]'); process.exit(1); }
const octShift = +((rest.find((a) => a.startsWith('--oct=')) || '--oct=0').slice(6));
const maxSec = +((rest.find((a) => a.startsWith('--max=')) || '--max=0').slice(6));

const mid = parseMidi(readFileSync(inPath));
let mel = melodyOf(mid);
if (maxSec > 0) mel = mel.filter((n) => n.startMs < maxSec * 1000);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const freqOf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 每個音一列：音高代號、長度（以 10ms 為單位）
// 音高代號查 TONES 表；0 = 休止符
const used = [...new Set(mel.filter((n) => n.note !== null).map((n) => n.note + 12 * octShift))].sort((a, b) => a - b);
const codeOf = new Map(used.map((m, i) => [m, i + 1]));

const rows = [];
for (const n of mel) {
  const durMs = n.endMs - n.startMs;
  let units = Math.round(durMs / 10);
  if (units < 1) continue;
  const code = n.note === null ? 0 : codeOf.get(n.note + 12 * octShift);
  while (units > 0) { const u = Math.min(units, 255); rows.push([code, u]); units -= u; }
}

// A51 的十六進位常數若以字母開頭要補一個 0，不然會被當成符號名稱
const hex2 = (v) => {
  const s = v.toString(16).toUpperCase().padStart(2, '0');
  return (/^[A-F]/.test(s) ? '0' : '') + s + 'H';
};
const ISRLAG = 9;
const tones = used.map((m) => {
  const f = freqOf(m);
  const half = Math.round(500000 / f);
  const reload = (65536 - half + ISRLAG) & 0xFFFF;
  return { m, f, half, reload };
});


// 燈條：音愈高亮愈多顆（低態亮）
const barOf = (rank) => {
  const h = Math.max(1, Math.min(8, 1 + Math.floor(rank * 8 / used.length)));
  return (0xFF << h) & 0xFF;
};

const title = inPath.split(/[\\/]/).pop().replace(/\.mid$/i, '');
const totalSec = (mel[mel.length - 1].endMs / 1000).toFixed(1);
let asm = '';
const put = (s) => { asm += s + '\n'; };

put(`;==== ${title} —— 蜂鳴器單音演奏 ====================`);
put(';');
put(`; 由 MIDI 轉出來的：node tools/mid2asm.mjs "${title}.mid"`);
put(`; ${rows.length} 個音、共 ${totalSec} 秒，音域 ${nameOf(used[0])} ~ ${nameOf(used[used.length - 1])}`
  + (octShift ? `（已整體升 ${octShift} 個八度）` : ''));
put(';');
put('; 蜂鳴器只有一支腳，只有高低兩種狀態，所以原曲的和弦一律只留最高音，');
put('; 力度與音色全部丟掉 —— 剩下的就是一條單音旋律線。');
put(';');
put('; 音高：Timer0 中斷翻轉 P3.7 產生方波');
put('; 節拍：Timer1 輪詢計時，樂譜長度以 10ms 為單位');
put('; 燈光：主板 P1 那 8 顆 LED 當音高條，音愈高亮愈多顆（不需要接任何線）');
put('; 每個音尾巴留 6ms 靜音，連續的同音才分得開。');
put('Buzzer\tEQU\tP3.7\t\t;蜂鳴器');
put('RELD_H\tEQU\t30H\t\t;目前這個音的 Timer0 重載值(高位元組)');
put('RELD_L\tEQU\t31H\t\t;                          (低位元組)');
put(';==== 中斷向量 =======================================');
put('\tORG\t0');
put('\tJMP\tSTART');
put('\tORG\t0BH\t\t;Timer0 溢位');
put('\tJMP\tT0ISR');
put(';==== 主程式 =========================================');
put('\tORG\t30H');
put('START:\tMOV\tSP,#5FH');
put('\tSETB\tBuzzer\t\t;蜂鳴器初始狀態(不響)');
put('\tMOV\tP1,#0FFH\t;LED 全滅');
put('\tMOV\tTMOD,#11H\t;T0、T1 都用模式 1(16 位元)');
put('\tSETB\tET0\t\t;開 Timer0 中斷(負責音高)');
put('\tSETB\tEA');
put('REPLAY:\tMOV\tR4,#HIGH(SONG)\t;樂譜指標放 R4:R5，DPTR 要留給查表');
put('\tMOV\tR5,#LOW(SONG)');
put('NEXT:\tMOV\tDPH,R4');
put('\tMOV\tDPL,R5');
put('\tCLR\tA');
put('\tMOVC\tA,@A+DPTR\t;音高代號(0 = 休止符)');
put('\tMOV\tR0,A');
put('\tMOV\tA,#1');
put('\tMOVC\tA,@A+DPTR\t;長度(10ms 為單位)');
put('\tMOV\tR1,A');
put('\tJZ\tREPLAY\t\t;長度 0 = 曲終，從頭再來');
put('\tMOV\tA,R5\t\t;樂譜指標前進兩個位元組');
put('\tADD\tA,#2');
put('\tMOV\tR5,A');
put('\tCLR\tA');
put('\tADDC\tA,R4');
put('\tMOV\tR4,A');
put('\tCALL\tPLAY');
put('\tJMP\tNEXT');
put(';==== 奏一個音：R0 = 音高代號，R1 = 長度 =============');
put('PLAY:\tMOV\tA,R0');
put('\tJZ\tPREST\t\t;代號 0 = 休止符');
put('\tDEC\tA');
put('\tMOV\tR2,A\t\t;R2 = 代號-1，要用三次');
put('\tRL\tA\t\t;音高表每個音兩個位元組');
put('\tMOV\tDPTR,#TONES');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tRELD_H,A');
put('\tMOV\tA,R2');
put('\tRL\tA');
put('\tINC\tA');
put('\tMOV\tDPTR,#TONES');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tRELD_L,A');
put('\tMOV\tA,R2\t\t;燈條：音愈高亮愈多顆');
put('\tMOV\tDPTR,#BARS');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tP1,A');
put('\tMOV\tTH0,RELD_H');
put('\tMOV\tTL0,RELD_L');
put('\tSETB\tTR0\t\t;開始發聲');
put('\tSJMP\tPBODY');
put('PREST:\tMOV\tP1,#0FFH\t;休止符：不發聲、燈全滅');
put('PBODY:\tMOV\tA,R1');
put('\tDEC\tA');
put('\tJZ\tPTAIL\t\t;只有一個單位就直接走尾巴');
put('\tMOV\tR6,A');
put('P10:\tMOV\tR7,#10\t\t;一個單位 = 10ms');
put('\tCALL\tDELAY');
put('\tDJNZ\tR6,P10');
put('PTAIL:\tMOV\tR7,#4\t\t;最後一個單位：4ms 有聲');
put('\tCALL\tDELAY');
put('\tCLR\tTR0\t\t;收聲');
put('\tCLR\tTF0');
put('\tSETB\tBuzzer');
put('\tMOV\tP1,#0FFH');
put('\tMOV\tR7,#6\t\t;          6ms 靜音，連續同音才分得開');
put('\tCALL\tDELAY');
put('\tRET');
put(';==== 延遲 R7 毫秒(Timer1 輪詢) ======================');
put('; 不能用 DJNZ 數迴圈 —— 蜂鳴器的中斷很密集會把迴圈拖慢，硬體計時器才準。');
put('DELAY:\tMOV\tTH1,#HIGH(65536-1000)');
put('\tMOV\tTL1,#LOW(65536-1000)');
put('\tCLR\tTF1');
put('\tSETB\tTR1');
put('DLY1:\tJNB\tTF1,$\t\t;等這 1ms 走完');
put('\tCLR\tTF1');
put('\tMOV\tTH1,#HIGH(65536-1000)\t;模式 1 不會自動重載');
put('\tMOV\tTL1,#LOW(65536-1000)');
put('\tDJNZ\tR7,DLY1');
put('\tCLR\tTR1');
put('\tRET');
put(';==== Timer0 中斷：翻轉蜂鳴器腳位 ====================');
put('; 沒有動到 A 和 PSW，所以不必 PUSH。');
put('T0ISR:\tMOV\tTH0,RELD_H\t;模式 1 不會自動重載');
put('\tMOV\tTL0,RELD_L');
put('\tCPL\tBuzzer');
put('\tRETI');
put(';==== 音高表：Timer0 的重載值 ========================');
put('; 12MHz → 1 個計數 = 1us，每次中斷翻轉一次，所以數的是半週期：');
put(';   重載值 = 65536 - 500000/頻率 + 9   (+9 補中斷反應吃掉的機械週期)');
put('TONES:');
for (const t of tones) {
  put(`\tDB\t${hex2(t.reload >> 8)},${hex2(t.reload & 0xFF)}\t;${String(codeOf.get(t.m)).padStart(2)} = `
    + `${nameOf(t.m).padEnd(4)} ${t.f.toFixed(1).padStart(6)}Hz  半週期 ${t.half}us`);
}
put(';==== 燈條圖樣：音愈高亮愈多顆(低態亮) ==============');
put('BARS:');
for (let i = 0; i < used.length; i += 8) {
  put('\tDB\t' + used.slice(i, i + 8).map((m, j) => hex2(barOf(i + j))).join(','));
}
put(';==== 樂譜：音高代號、長度(10ms 為單位) ==============');
put('; 代號 0 = 休止符；最後補 0,0 當結束記號');
put('SONG:');
for (let i = 0; i < rows.length; i += 8) {
  put('\tDB\t' + rows.slice(i, i + 8).map(([c, u]) => `${c},${u}`).join(', '));
}
put('\tDB\t0,0\t\t\t;曲終 → 從頭再來');
put('\tEND');
writeFileSync(outPath, asm);

console.log(`讀到 ${mid.events.length} 個 MIDI 事件 → 壓成 ${mel.length} 段 → ${rows.length} 個音`);
console.log(`音域 ${nameOf(used[0])}(${freqOf(used[0]).toFixed(1)}Hz) ~ `
  + `${nameOf(used[used.length - 1])}(${freqOf(used[used.length - 1]).toFixed(1)}Hz)，${used.length} 個不同的音`);
if (freqOf(used[0]) < 150) console.log('⚠ 最低的音低於 150Hz，壓電蜂鳴器會很小聲，考慮加 --oct=1 或 --oct=2');
console.log(`總長 ${totalSec} 秒`);
console.log('寫出 ' + outPath);
