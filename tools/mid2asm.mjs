// 把標準 MIDI 檔轉成這個模擬器用的 A51 樂譜（單音、方波蜂鳴器）。
//
// 用法：node tools/mid2asm.mjs <輸入.mid> [輸出.asm] [--oct=N] [--max=秒] [--speed=倍率]
//   --oct=N      整體移調 N 個八度（蜂鳴器在 2~4kHz 最有效率，低音會很小聲）
//   --max=秒     只取前面幾秒（以原速計）
//   --speed=倍率 整體加速，例如 --speed=1.25 是快 1.25 倍
//   --arp=N      和弦用「快速分解」模擬：同時按著的音每 N 個 10ms 輪流放一個
//                （只取最高音往下兩個八度以內的音，太低的伴奏不算）；沒給就只留最高音
//   --voices=N   分解時最多取幾個聲部（1~3，預設 3）
//   --lead=N     旋律(最高音)那一片放 N 倍長（預設 1），讓旋律壓過伴奏、聽起來不那麼雜
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

  // 每一段 = 從這個事件到下一個事件之間「按著哪些音」，所以要先套用事件再記狀態。
  // 曾經反過來(先記再套用)，結果單獨的音整個變成休止符、同一拍的和弦挑到先寫的低音。
  const segs = [];
  for (const e of events) {
    advance(e.tick);
    if (e.type === 'tempo') { usPerQuarter = e.usPerQuarter; continue; }
    if (e.type === 'on') held.set(e.note, ms); else held.delete(e.note);
    segs.push({ ms, notes: [...held.keys()] });
  }

  // 每一段記下整組按著的音（由高到低）；相鄰且同一組就併起來
  for (let i = 0; i < segs.length - 1; i++) {
    const { ms: t0, notes } = segs[i];
    const t1 = segs[i + 1].ms;
    if (t1 - t0 < 1) continue;                       // 1ms 以下的碎片丟掉
    const chord = [...notes].sort((a, b) => b - a);
    const prev = out[out.length - 1];
    if (prev && prev.chord.join() === chord.join() && Math.abs(prev.endMs - t0) < 1) { prev.endMs = t1; continue; }
    out.push({ chord, startMs: t0, endMs: t1 });
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
const speed = +((rest.find((a) => a.startsWith('--speed=')) || '--speed=1').slice(8));
if (!(speed > 0)) { console.error('--speed 要是正數'); process.exit(1); }
if (speed !== 1) for (const n of mel) { n.startMs /= speed; n.endMs /= speed; }
const arpArg = rest.find((a) => a === '--arp' || a.startsWith('--arp='));
const arp = arpArg ? (arpArg === '--arp' ? 1 : +arpArg.slice(6)) : 0;   // 每個分解音幾個 10ms；0 = 不分解
if (arpArg && !(arp >= 1 && arp <= 25)) { console.error('--arp 要是 1~25 的整數'); process.exit(1); }
const ARP_VOICES = +((rest.find((a) => a.startsWith('--voices=')) || '--voices=3').slice(9));
const lead = +((rest.find((a) => a.startsWith('--lead=')) || '--lead=1').slice(7));
if (!(ARP_VOICES >= 1 && ARP_VOICES <= 3)) { console.error('--voices 要是 1~3'); process.exit(1); }
if (!(lead >= 1 && lead * arp <= 25)) { console.error('--lead 要是 1 以上，而且 lead×arp 不能超過 25'); process.exit(1); }
const ARP_SPAN = 24;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const freqOf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 每段先換成 10ms 單位，再決定放哪些音：
//   不分解 → 只留最高音
//   分解   → 最高音往下兩個八度內取最多 3 個，播放時每 arp 個單位輪流放一個
// 相鄰且同一組音、時間又接得上的段併成一個，不然伴奏一換就會把長音切成兩段。
const notes = [];                                    // {voices:[MIDI 音高...], startMs, endMs, gap}；voices 空 = 休止符
let prevEnd = -1;
for (const n of mel) {
  const top = n.chord[0];
  const voices = top === undefined ? [] : arp ? n.chord.filter((m) => top - m < ARP_SPAN).slice(0, ARP_VOICES) : [top];
  const gap = n.startMs - prevEnd;                   // 跟上一段之間有沒有縫
  const prev = notes[notes.length - 1];
  if (prev && gap < 1 && prev.voices.join() === voices.join()) { prev.endMs = n.endMs; prevEnd = n.endMs; continue; }
  if (n.endMs - n.startMs < 5) {
    // 5ms 以下的碎片：旋律音沒換(只是伴奏在換手)就當成接著的，不然多半是兩個音之間的小縫，丟掉
    if (prev && gap < 1 && voices[0] !== undefined && voices[0] === prev.voices[0]) prevEnd = n.endMs;
    continue;
  }
  notes.push({ voices, startMs: n.startMs, endMs: n.endMs, gap });
  prevEnd = n.endMs;
}
// 樂譜列：
//   單音   [代號, 長度]              代號 1 起算查 TONES 表，0 = 休止符
//   和弦   [80H+聲部數, 代號..., 長度]  播放時每 ARP 個單位輪流放一個聲部
// 長度一列最多 127 個單位，bit 7 = 圓滑：尾巴不留 6ms 靜音，直接接下一列。
// 長音被拆成多列時前面那幾列都圓滑，聽起來才是一個音。
const used = [...new Set(notes.flatMap((n) => n.voices).map((m) => m + 12 * octShift))].sort((a, b) => a - b);
const codeOf = new Map(used.map((m, i) => [m, i + 1]));
// 和弦底下的伴奏換了、旋律音沒換(而且中間沒縫)，也圓滑接過去，旋律才不會被伴奏切成一段一段。
const rows = [];
let chords = 0;
notes.forEach((n, i) => {
  const codes = n.voices.map((m) => codeOf.get(m + 12 * octShift));
  const head = codes.length === 0 ? [0] : codes.length === 1 ? codes : [0x80 | codes.length, ...codes];
  if (codes.length > 1) chords++;
  const next = notes[i + 1];
  const carryOn = !!next && next.gap < 1 && n.voices.length > 0 && next.voices[0] === n.voices[0];
  let units = Math.round((n.endMs - n.startMs) / 10);
  while (units > 0) {
    const u = Math.min(units, 127); units -= u;
    const legato = codes.length > 0 && (units > 0 || carryOn);
    rows.push([...head, u | (legato ? 0x80 : 0)]);
  }
});

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
put(`; 由 MIDI 轉出來的：node tools/mid2asm.mjs "${title}.mid"`
  + (octShift ? ` --oct=${octShift}` : '') + (speed !== 1 ? ` --speed=${speed}` : '') + (arp ? ` --arp=${arp}` : '') + (ARP_VOICES !== 3 ? ` --voices=${ARP_VOICES}` : '') + (lead !== 1 ? ` --lead=${lead}` : ''));
put(`; ${rows.length} 個音、共 ${totalSec} 秒，音域 ${nameOf(used[0])} ~ ${nameOf(used[used.length - 1])}`
  + (octShift ? `（已整體升 ${octShift} 個八度）` : '') + (speed !== 1 ? `（已加速 ${speed} 倍）` : '')
  + (arp ? `（和弦分解：每片 ${arp * 10}ms、最多 ${ARP_VOICES} 個聲部、旋律片 ${lead} 倍長）` : ''));
put(';');
put('; 蜂鳴器只有一支腳，只有高低兩種狀態，所以原曲的和弦一律只留最高音，');
put('; 力度與音色全部丟掉 —— 剩下的就是一條單音旋律線。');
put(';');
put('; 音高：Timer0 中斷翻轉 P3.7 產生方波');
put('; 節拍：Timer1 輪詢計時，樂譜長度以 10ms 為單位');
put('; 燈光：主板 P1 那 8 顆 LED 當音高條，音愈高亮愈多顆（不需要接任何線）');
put('; 每個音尾巴留 6ms 靜音，連續的同音才分得開；長度 bit 7 = 圓滑，不留靜音直接接下一個音。');
if (arp) put(`; 和弦：同時按著的音輪流放（快速分解），旋律一片 ${arp * lead * 10}ms、伴奏一片 ${arp * 10}ms，最多 ${ARP_VOICES} 個聲部。`);
put('Buzzer\tEQU\tP3.7\t\t;蜂鳴器');
put('RELD_H\tEQU\t30H\t\t;目前這個音的 Timer0 重載值(高位元組)');
put('RELD_L\tEQU\t31H\t\t;                          (低位元組)');
put('TMP\tEQU\t32H\t\t;TONE 的暫存');
if (arp) {
  put(`ARP\tEQU\t${arp}\t\t;分解和弦：伴奏聲部一片放幾個 10ms`);
  put(`ARPL\tEQU\t${arp * lead}\t\t;             旋律聲部一片放幾個 10ms`);
  put('VOICE\tEQU\t33H\t\t;和弦的聲部代號(最多 3 個：33H~35H)');
  put('SLICE\tEQU\t36H\t\t;這一片還剩幾個單位');
}
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
if (arp) put('\tJB\tACC.7,CHORD\t;bit 7 = 和弦，低 7 位是聲部數');
put('\tMOV\tR0,A');
put('\tMOV\tA,#1');
put('\tMOVC\tA,@A+DPTR\t;長度(10ms 為單位)');
put('\tMOV\tR1,A');
put('\tJZ\tREPLAY\t\t;長度 0 = 曲終，從頭再來');
put('\tMOV\tA,#2\t\t;樂譜指標前進兩個位元組');
put('\tCALL\tADV');
put('\tCALL\tPLAY');
put('\tJMP\tNEXT');
if (arp) {
  put(';==== 和弦列：[80H+聲部數, 代號..., 長度] ===========');
  put('CHORD:\tANL\tA,#7FH');
  put('\tMOV\tR3,A\t\t;聲部數');
  put('\tMOV\tR2,#0');
  put('CH1:\tMOV\tA,R2\t\t;把各聲部的代號抄到 VOICE');
  put('\tINC\tA');
  put('\tMOVC\tA,@A+DPTR');
  put('\tMOV\tR1,A');
  put('\tMOV\tA,#VOICE');
  put('\tADD\tA,R2');
  put('\tMOV\tR0,A');
  put('\tMOV\tA,R1');
  put('\tMOV\t@R0,A');
  put('\tINC\tR2');
  put('\tMOV\tA,R2');
  put('\tXRL\tA,R3');
  put('\tJNZ\tCH1');
  put('\tMOV\tA,R3\t\t;長度接在聲部代號後面');
  put('\tINC\tA');
  put('\tMOVC\tA,@A+DPTR');
  put('\tMOV\tR1,A');
  put('\tMOV\tA,R3\t\t;樂譜指標前進 聲部數+2');
  put('\tADD\tA,#2');
  put('\tCALL\tADV');
  put('\tCALL\tPLAYC');
  put('\tJMP\tNEXT');
}
put(';==== 樂譜指標 R4:R5 前進 A 個位元組 =================');
put('ADV:\tADD\tA,R5');
put('\tMOV\tR5,A');
put('\tCLR\tA');
put('\tADDC\tA,R4');
put('\tMOV\tR4,A');
put('\tRET');
put(';==== 換音高：R0 = 代號 → 裝填 Timer0、燈條、開始發聲 ====');
put('TONE:\tMOV\tA,R0');
put('\tDEC\tA');
put('\tMOV\tTMP,A\t\t;代號-1，要用三次');
put('\tRL\tA\t\t;音高表每個音兩個位元組');
put('\tMOV\tDPTR,#TONES');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tRELD_H,A');
put('\tMOV\tA,TMP');
put('\tRL\tA');
put('\tINC\tA');
put('\tMOV\tDPTR,#TONES');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tRELD_L,A');
put('\tMOV\tA,TMP\t\t;燈條：音愈高亮愈多顆');
put('\tMOV\tDPTR,#BARS');
put('\tMOVC\tA,@A+DPTR');
put('\tMOV\tP1,A');
put('\tMOV\tTH0,RELD_H');
put('\tMOV\tTL0,RELD_L');
put('\tSETB\tTR0\t\t;開始發聲');
put('\tRET');
put(';==== 奏一個音：R0 = 音高代號，R1 = 長度 =============');
put('PLAY:\tMOV\tA,R0');
put('\tJZ\tPREST\t\t;代號 0 = 休止符');
put('\tCALL\tTONE');
put('\tSJMP\tPBODY');
put('PREST:\tCLR\tTR0\t\t;休止符：收聲(前一個音若是圓滑的就還在響)、燈全滅');
put('\tSETB\tBuzzer');
put('\tMOV\tP1,#0FFH');
put('PBODY:\tMOV\tA,R1');
put('\tJB\tACC.7,PLEG\t;bit 7 = 圓滑：整段有聲，尾巴不留靜音');
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
put('PLEG:\tANL\tA,#7FH\t\t;圓滑：每個單位 10ms 都有聲，放完直接回去接下一個音');
put('\tMOV\tR6,A');
put('PL10:\tMOV\tR7,#10');
put('\tCALL\tDELAY');
put('\tDJNZ\tR6,PL10');
put('\tRET');
if (arp) {
  put(';==== 奏一個和弦：VOICE = 聲部代號，R3 = 聲部數，R1 = 長度 ==');
  put('; 各聲部輪流放：旋律 ARPL 個單位、伴奏 ARP 個單位(快速分解)，最後一片交給 PBODY 收尾');
  put('PLAYC:\tMOV\tA,R1');
  put('\tANL\tA,#7FH');
  put('\tMOV\tR6,A\t\t;還剩幾個單位');
  put('\tMOV\tR2,#0\t\t;輪到第幾個聲部');
  put('PC1:\tMOV\tA,#VOICE');
  put('\tADD\tA,R2');
  put('\tMOV\tR0,A');
  put('\tMOV\tA,@R0');
  put('\tMOV\tR0,A');
  put('\tCALL\tTONE\t\t;換到這個聲部');
  put('\tMOV\tA,R2\t\t;第一個聲部是旋律，那一片比較長');
  put('\tJNZ\tPCACC');
  put('\tMOV\tA,#ARPL');
  put('\tSJMP\tPCLEN');
  put('PCACC:\tMOV\tA,#ARP');
  put('PCLEN:\tMOV\tSLICE,A');
  put('\tMOV\tA,R6');
  put('\tCLR\tC');
  put('\tSUBB\tA,SLICE');
  put('\tJC\tPCLAST\t\t;剩不到一片');
  put('\tJZ\tPCLAST\t\t;剛好剩一片');
  put('\tMOV\tR6,A');
  put('PCD:\tMOV\tR7,#10\t\t;放這一片');
  put('\tCALL\tDELAY');
  put('\tDJNZ\tSLICE,PCD');
  put('\tINC\tR2\t\t;下一個聲部，放完一輪就回到第一個');
  put('\tMOV\tA,R2');
  put('\tXRL\tA,R3');
  put('\tJNZ\tPC1');
  put('\tMOV\tR2,#0');
  put('\tSJMP\tPC1');
  put('PCLAST:\tMOV\tA,R1\t\t;最後一片：剩下的單位交給 PBODY，圓滑旗標照舊');
  put('\tANL\tA,#80H');
  put('\tORL\tA,R6');
  put('\tMOV\tR1,A');
  put('\tJMP\tPBODY');
}

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
put(';==== 樂譜：[代號, 長度] 或 [80H+聲部數, 代號..., 長度]；長度 10ms 為單位，bit 7 = 圓滑 ==');
put('; 代號 0 = 休止符；最後補 0,0 當結束記號');
put('SONG:');
for (let i = 0; i < rows.length; i += 8) {
  put('\tDB\t' + rows.slice(i, i + 8).map((r) => r.join(',')).join(', '));
}
put('\tDB\t0,0\t\t\t;曲終 → 從頭再來');
put('\tEND');
writeFileSync(outPath, asm);

console.log(`讀到 ${mid.events.length} 個 MIDI 事件 → 壓成 ${mel.length} 段 → ${rows.length} 個音` + (arp ? `（其中 ${chords} 個和弦）` : ''));
console.log(`音域 ${nameOf(used[0])}(${freqOf(used[0]).toFixed(1)}Hz) ~ `
  + `${nameOf(used[used.length - 1])}(${freqOf(used[used.length - 1]).toFixed(1)}Hz)，${used.length} 個不同的音`);
if (freqOf(used[0]) < 150) console.log('⚠ 最低的音低於 150Hz，壓電蜂鳴器會很小聲，考慮加 --oct=1 或 --oct=2');
console.log(`總長 ${totalSec} 秒`);
console.log('寫出 ' + outPath);
