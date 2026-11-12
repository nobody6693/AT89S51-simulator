// 快學 8051 第 6 章（音樂播放器）的課本實驗與思考題，在模擬器上跑起來要跟課本說的一樣。
// 聲音看的是蜂鳴器腳 P3.7 的翻轉：兩次翻轉的間隔就是半週期，課本的計時量（-956 …）就是半週期 us。
// TONE 中斷進出要多花約 6us，所以量到的半週期 = 計時量 + 6。
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
  s.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name });
  s.asm = r;
  return s;
}
const runMs = (s, ms) => s.cpu.run(Math.round(ms * 1000));
// 杜邦線把 P2.x 碰 GND = 電源軌跳線；傳 [] 就是全部拿開
const touch = (s, pins) => s.wiring.set({ ...s.wiring.cfg, ties: Object.fromEntries(pins.map(p => [p, 'gnd'])) });
const buzzerOff = (s) => ((s.bus.latch[3] >> 7) & 1) === 1;

// 錄下 ms 毫秒內 P3.7 的每一次翻轉（cycle = us）
function record(s, ms) {
  const ev = [];
  const fn = (p, now, old) => { if (p === 3 && ((now ^ old) & 0x80)) ev.push(s.cpu.cycles); };
  s.bus.onPinChange(fn);
  runMs(s, ms);
  s.bus.pinListeners = s.bus.pinListeners.filter(f => f !== fn);
  return ev;
}
// 把翻轉切成一個一個音：半週期差不到 4% 算同一個音，停超過 4ms 就是下一個音
function notesOf(ev) {
  const out = []; let cur = null;
  for (let i = 1; i < ev.length; i++) {
    const hp = ev[i] - ev[i - 1];
    if (cur && hp < 4000 && Math.abs(hp - cur.hp) / cur.hp < 0.04) { cur.n++; cur.sum += hp; cur.hp = cur.sum / cur.n; cur.t1 = ev[i]; }
    else {
      if (cur && cur.n >= 3) out.push(cur);
      cur = hp < 4000 ? { t0: ev[i - 1], t1: ev[i], n: 1, sum: hp, hp } : null;
    }
  }
  if (cur && cur.n >= 3) out.push(cur);
  return out.map(r => ({ t0: r.t0 / 1000, ms: (r.t1 - r.t0) / 1000, hp: Math.round(r.hp) }));
}
// 課本表 5 的半週期（音碼 → us）
const HALF = {
  1: 956, 2: 852, 3: 759, 4: 716, 5: 638, 6: 568, 7: 506,
  11: 1908, 12: 1701, 13: 1515, 14: 1433, 15: 1276, 16: 1136, 17: 1012,
  21: 478, 22: 426, 23: 379, 24: 358, 25: 319, 26: 284, 27: 253,
  31: 903, 32: 804, 34: 676, 35: 602, 36: 526,
};
const near = (hp, half, msg) => assert.ok(Math.abs(hp - (half + 6)) <= 2, `${msg}：半週期應約 ${half + 6}us，量到 ${hp}us`);

// ---------- 6-5-1 簡易電子琴 ----------
test('6-5-1 沒碰鍵不出聲、P3.7 保持 1（防燙）；P2.0~P2.7 各是 Do~高音 Do', () => {
  const s = simOf('CH6-5-1 簡易電子琴.asm');
  assert.equal(record(s, 50).length, 0, '沒碰鍵不該有聲音');
  assert.ok(buzzerOff(s), '沒在發聲時 P3.7 要是 1');
  const want = [956, 852, 759, 716, 638, 568, 506, 478];
  for (let k = 0; k < 8; k++) {
    touch(s, ['P2.' + k]);
    const n = notesOf(record(s, 150));
    assert.equal(n.length, 1, `P2.${k} 應該只發一個音`);
    near(n[0].hp, want[k], `P2.${k}`);
    touch(s, []); runMs(s, 250);
    assert.equal(record(s, 30).length, 0, `放開 P2.${k} 後要停`);
    assert.ok(buzzerOff(s), '停了以後 P3.7 要回到 1');
  }
});

function tapLength(name) {
  const s = simOf(name);
  runMs(s, 5);
  touch(s, ['P2.2']);
  const ev = [];
  const fn = (p, now, old) => { if (p === 3 && ((now ^ old) & 0x80)) ev.push(s.cpu.cycles); };
  s.bus.onPinChange(fn);
  runMs(s, 5); touch(s, []);                       // 碰一下 5ms 就放開
  runMs(s, 400);
  return (ev[ev.length - 1] - ev[0]) / 1000;
}
test('6-5-1 碰一下至少響 0.2 秒；按住不放是連續的長音', () => {
  const len = tapLength('CH6-5-1 簡易電子琴.asm');
  assert.ok(len > 190 && len < 210, `碰一下應響約 200ms，實際 ${len}ms`);
  const s = simOf('CH6-5-1 簡易電子琴.asm');
  touch(s, ['P2.4']);
  const ev = record(s, 1000);
  let maxGap = 0; for (let i = 1; i < ev.length; i++) maxGap = Math.max(maxGap, ev[i] - ev[i - 1]);
  assert.ok(maxGap < 700, `按住 1 秒中間不能斷（最長間隔 ${maxGap}us）`);
});

test('6-5-1 思考 1：碰一下改成響 0.1 秒', () => {
  const len = tapLength('CH6-5-1T 發音改0.1秒.asm');
  assert.ok(len > 90 && len < 110, `碰一下應響約 100ms，實際 ${len}ms`);
});

test('6-5-1 思考 2：P1 的 LED 跟著 P2 的鍵亮', () => {
  const s = simOf('CH6-5-1T LED反應按鍵.asm');
  runMs(s, 5);
  assert.equal(s.bus.latch[1], 0xFF, '沒碰鍵 LED 全滅');
  touch(s, ['P2.0']); runMs(s, 5);
  assert.equal(s.bus.latch[1], 0xFE, 'Do（P2.0）→ P1.0 亮');
  near(notesOf(record(s, 100))[0].hp, 956, '一邊亮一邊彈 Do');
  touch(s, []); runMs(s, 300);
  assert.equal(s.bus.latch[1], 0xFF, '放開後 LED 熄');
  touch(s, ['P2.3', 'P2.7']); runMs(s, 5);
  assert.equal(s.bus.latch[1], 0x77, 'Fa、高音 Do 一起碰 → P1.3、P1.7 一起亮');
  touch(s, []); runMs(s, 300);
  assert.equal(s.bus.latch[1], 0xFF);
});

test('6-5-1 思考 3：P2 原本 8 音不變，P0（指撥開關）再多 8 個高音', () => {
  const s = simOf('CH6-5-1T P2加P0擴充16音.asm');
  assert.equal(record(s, 50).length, 0, '開關全 OFF、沒碰鍵不出聲');
  touch(s, ['P2.0']); near(notesOf(record(s, 150))[0].hp, 956, 'P2.0 還是中音 Do');
  touch(s, []); runMs(s, 250);
  const want = [426, 379, 358, 319, 284, 253, 239, 213];
  for (let k = 0; k < 8; k++) {
    s.dip.set(k, 1);                                 // 指撥開關撥 ON = P0.k 讀 0 = 按住
    const n = notesOf(record(s, 150));
    assert.equal(n.length, 1, `P0.${k} 應該只發一個音`);
    near(n[0].hp, want[k], `P0.${k}`);
    s.dip.set(k, 0); runMs(s, 250);
    assert.equal(record(s, 30).length, 0, `P0.${k} 撥回 OFF 要停`);
  }
});

// ---------- 6-5-2 單曲播放器 ----------
const BIRTHDAY = [1, 1, 2, 1, 4, 3, 1, 1, 2, 1, 5, 4, 1, 1, 21, 6, 4, 3, 2, 7, 7, 6, 4, 5, 4];
const BIRTHDAY_BEAT = [4, 4, 8, 8, 8, 16, 4, 4, 8, 8, 8, 16, 4, 4, 8, 8, 8, 8, 8, 4, 4, 8, 8, 8, 16];
function checkBirthday(n, msg) {
  assert.equal(n.length, BIRTHDAY.length, `${msg}：應該聽到 25 個音，實際 ${n.length}`);
  n.forEach((x, i) => {
    near(x.hp, HALF[BIRTHDAY[i]], `${msg} 第 ${i + 1} 個音`);
    const want = BIRTHDAY_BEAT[i] * 62.5;
    assert.ok(Math.abs(x.ms - want) < want * 0.03 + 3, `${msg} 第 ${i + 1} 個音應長 ${want}ms，實際 ${x.ms}ms`);
  });
}
test('6-5-2 開機唱生日快樂歌（25 個音、12 秒），唱完靜音 30 秒再唱', () => {
  const s = simOf('CH6-5-2 單曲播放器.asm');
  const n = notesOf(record(s, 12300));
  checkBirthday(n, '第一次');
  const end = n[n.length - 1].t0 + n[n.length - 1].ms;
  assert.ok(Math.abs(end - 12000) < 250, `唱完約在 12 秒，實際 ${end}ms`);
  assert.ok(buzzerOff(s), '唱完 P3.7 要是 1');
  assert.equal(record(s, 29500).length, 0, '唱完後 30 秒內不出聲');
  const again = notesOf(record(s, 1000));
  assert.ok(again.length >= 2, '30 秒後應該重唱');
  const restart = again[0].t0 - end;
  assert.ok(Math.abs(restart - 30000) < 300, `間隔應約 30 秒，實際 ${restart}ms`);
  near(again[0].hp, 956, '重唱從 Do 開始');
});

test('6-5-2 思考：唱完一直等，碰 P2.0（PB3）才重唱', () => {
  const s = simOf('CH6-5-2T P20碰地重唱.asm');
  checkBirthday(notesOf(record(s, 12300)), '開機自動唱');
  assert.equal(record(s, 3000).length, 0, '唱完沒碰 P2.0 就不出聲');
  assert.ok(buzzerOff(s), '等待時 P3.7 要是 1');
  s.buttons.press(2, 1); runMs(s, 30); s.buttons.press(2, 0);   // PB3 = P2.0
  const n = notesOf(record(s, 1600));
  assert.ok(n.length >= 4, '碰 P2.0 後應重唱');
  [1, 1, 2, 1].forEach((c, i) => near(n[i].hp, HALF[c], `重唱第 ${i + 1} 個音`));
});

// ---------- 6-5-3 選曲播放器 ----------
const romBytes = (s, from, to) => Array.from(s.cpu.code.slice(from, to));
const addr = (s, label) => s.asm.symbols[label].addr;
test('6-5-3 八首歌的音調表與節拍表：個數一樣、每個音碼都查得到（抓課本的漏印）', () => {
  for (const name of ['CH6-5-3 選曲播放器.asm', 'CH6-5-3T 指撥開關點播可換歌.asm']) {
    const s = simOf(name);
    for (let i = 1; i <= 8; i++) {
      const song = romBytes(s, addr(s, 'SONG' + i), addr(s, 'BEAT' + i));
      const endOfBeat = i < 8 ? addr(s, 'SONG' + (i + 1)) : s.asm.codeBytes;
      const beat = romBytes(s, addr(s, 'BEAT' + i), endOfBeat);
      assert.equal(song[song.length - 1], 100, `SONG${i} 最後要是結束符號 100`);
      assert.equal(song.indexOf(100), song.length - 1);
      assert.equal(beat.length, song.length - 1, `SONG${i} 有 ${song.length - 1} 個音，BEAT${i} 卻有 ${beat.length} 拍`);
      for (const c of song.slice(0, -1)) assert.ok(c === 0 || HALF[c], `SONG${i} 有不在音階表裡的音碼 ${c}`);
      assert.ok(beat.every(b => b > 0), `BEAT${i} 不能有 0 拍`);
    }
  }
});

function songOf(s, i) {
  return romBytes(s, addr(s, 'SONG' + i), addr(s, 'BEAT' + i)).slice(0, -1);
}
test('6-5-3 P2.0~P2.7 各點播一首，前幾個音對', () => {
  for (let k = 0; k < 8; k++) {
    const s = simOf('CH6-5-3 選曲播放器.asm');
    assert.equal(record(s, 20).length, 0, '沒點歌不出聲');
    touch(s, ['P2.' + k]); runMs(s, 10); touch(s, []);
    const want = songOf(s, k + 1).filter(c => c !== 0).slice(0, 4);
    const n = notesOf(record(s, 2100)).slice(0, 4);
    assert.equal(n.length, 4, `第 ${k + 1} 首前 2 秒應該至少 4 個音`);
    n.forEach((x, i) => near(x.hp, HALF[want[i]], `第 ${k + 1} 首第 ${i + 1} 個音`));
  }
});

test('6-5-3 休止符真的安靜，長度跟節拍表一樣（課本的 -10 會拖成 4 倍）', () => {
  // 寄語白雲：低音 So ×3（8,4,4）、休止 4、Do 4 → 休止符在 1.0~1.25 秒
  const s = simOf('CH6-5-3 選曲播放器.asm');
  touch(s, ['P2.6']); runMs(s, 10); touch(s, []);
  const ev = record(s, 1600);
  const n = notesOf(ev);
  near(n[2].hp, HALF[15], '第 3 個音是低音 So');
  near(n[3].hp, HALF[1], '休止符後是 Do');
  const gap = n[3].t0 - (n[2].t0 + n[2].ms);
  assert.ok(Math.abs(gap - 250) < 8, `休止符應長 250ms，實際 ${gap}ms`);
  const inRest = ev.filter(t => t / 1000 > n[2].t0 + n[2].ms + 2 && t / 1000 < n[3].t0 - 2);
  assert.equal(inRest.length, 0, '休止符期間蜂鳴器不能翻轉（課本的 -10 會以 3 萬 Hz 狂翻、拖慢主程式）');
});

test('6-5-3 播完一首回到選歌：P3.7 關閉，再碰一次又從頭播', () => {
  const s = simOf('CH6-5-3 選曲播放器.asm');
  touch(s, ['P2.3']); runMs(s, 10); touch(s, []);   // 點仔膠，約 7.4 秒
  const n = notesOf(record(s, 8000));
  assert.equal(n.length, songOf(s, 4).length, '點仔膠每個音都要播到');
  assert.ok(buzzerOff(s), '播完 P3.7 要是 1');
  assert.equal(record(s, 500).length, 0, '播完不再出聲');
  touch(s, ['P2.3']); runMs(s, 10); touch(s, []);
  near(notesOf(record(s, 300))[0].hp, HALF[6], '再碰一次從第一個音 La 開始');
});

test('6-5-3 範例播放中不看按鍵：中途碰別的鍵沒用', () => {
  const s = simOf('CH6-5-3 選曲播放器.asm');
  touch(s, ['P2.0']); runMs(s, 10); touch(s, []);   // 平安夜
  runMs(s, 500);
  touch(s, ['P2.2']); runMs(s, 300); touch(s, []);
  const n = notesOf(record(s, 600));
  assert.ok(n.every(x => x.hp !== HALF[15] + 6), '不能切到 You are my Sunshine（低音 So 開頭）');
});

// ---------- 6-5-3 思考題 ----------
test('6-5-3 思考：指撥開關點播，播到一半可以換歌、可以停', () => {
  const s = simOf('CH6-5-3T 指撥開關點播可換歌.asm');
  assert.equal(record(s, 50).length, 0, '開關全 OFF 不出聲');
  s.dip.set(0, 1);                                   // SW1-1 ON：平安夜
  let n = notesOf(record(s, 1000));
  assert.ok(Math.abs(n[0].ms - 375) < 12, `平安夜第一個音 6/8 拍 = 375ms，實際 ${n[0].ms}ms（太短就是剛點播就被當成換歌重播）`);
  [5, 6, 5].forEach((c, i) => near(n[i].hp, HALF[c], `平安夜第 ${i + 1} 個音`));
  s.dip.set(0, 0); s.dip.set(2, 1);                  // 改撥 SW1-3：You are my Sunshine
  const ev = record(s, 600);
  const t0 = ev[0] / 1000;
  n = notesOf(ev);
  const first = n.find(x => x.hp === HALF[15] + 6 || Math.abs(x.hp - HALF[15] - 6) <= 2);
  assert.ok(first, '應該改播 You are my Sunshine（低音 So 開頭）');
  assert.ok(first.t0 - t0 < 80, `換歌要在 1/8 拍內反應，實際 ${(first.t0 - t0).toFixed(1)}ms`);
  s.dip.set(2, 0);                                   // 全部 OFF：停播
  runMs(s, 70);
  assert.ok(buzzerOff(s), '停播後 P3.7 要是 1（防燙）');
  assert.equal(record(s, 1000).length, 0, '全部撥 OFF 就停');
  s.dip.set(7, 1);                                   // 再點茉莉花
  n = notesOf(record(s, 1200));
  assert.ok(Math.abs(n[0].ms - 500) < 12, `茉莉花第一個音 1 拍 = 500ms，實際 ${n[0].ms}ms`);
  [3, 3, 5].forEach((c, i) => near(n[i].hp, HALF[c], `茉莉花第 ${i + 1} 個音`));
});

// 撥 OFF 的時機掃過半個週期，停下來時蜂鳴器腳可能正好是 0 或 1，STOP 都要把它設回 1。
// （實體 8051 進中斷會晚一條指令，STOP 裡的 CLR TF0 就是為這個；模擬器每條指令後就處理中斷，這裡測不到那一點。）
test('6-5-3 思考：停播後 P3.7 一定回到 1（每個時間點撥 OFF 都試）', () => {
  for (let k = 0; k < 40; k++) {
    const s = simOf('CH6-5-3T 指撥開關點播可換歌.asm');
    s.dip.set(3, 1);                                 // 點仔膠，第一個音 La 半週期 574us
    runMs(s, 200 + k * 0.037);                       // 撥 OFF 的時機掃過半個週期的各個位置
    s.dip.set(3, 0);
    runMs(s, 100);
    assert.ok(buzzerOff(s), `第 ${k} 次：停播後 P3.7 要是 1`);
  }
});
