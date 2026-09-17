// 應用程式膠水：載入/編譯/執行/面板更新/快捷鍵

// 手機上看不到 console：真的出錯時把訊息貼在畫面最上面，至少知道發生什麼事
window.addEventListener('error', (e) => showFatal(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => showFatal(String(e.reason)));
function showFatal(msg) {
  let box = document.getElementById('fatal');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fatal';
    document.body.insertBefore(box, document.body.firstChild);
  }
  box.textContent = '⚠ 程式出錯：' + msg;
}
import { Sim } from '../sim.js';
import { Runner } from '../runner.js';
import { BoardView } from './board.js';
import { BuzzerAudio } from './audio.js';
import { RegistersPanel, EditorPanel, DisasmPanel, MemoryPanel, WavePanel, PeriphPanel, WiringPanel, OutputPanel } from './panels.js';
import { hex2, hex4 } from '../board/util.js';
import { PROGRAMS } from '../programs.js';
import { DEFAULT_WIRING } from '../board/wiring.js';
import { assemble } from '../asm/assembler.js';

const byName = new Map(PROGRAMS.map(p => [p.name, p]));

const $ = (s) => document.querySelector(s);

const sim = new Sim();
window.sim = sim; // 方便在 console 裡玩
const audio = new BuzzerAudio();
let frameStartCycle = 0;
let activeTab = 'source';
let uiTick = 0;

const runner = new Runner(sim, {
  onFrame(sample, info) {
    board.update(sample);
    audio.push(sample.buzzer, frameStartCycle, info.frameCycles, info.speed, info.running);
    audio.tone(sim.buzzer.freqEstimate, sim.buzzer.activeDuty, info.running);
    frameStartCycle = sim.cpu.cycles;
    updateStatus();
    // 面板：執行中每 3 幀更新一次重的面板，停止時立即更新
    const heavy = !info.running || (uiTick++ % 3 === 0);
    if (heavy) {
      if (activeTab === 'periph') periph.update();
      if (activeTab === 'regs') regs.update();
      const line = sim.lineOfAddr(sim.cpu.pc);
      source.setCurrent(line, !info.running);
      if (activeTab === 'disasm') disasmP.update();
      if (activeTab === 'memory') memory.update();
      output.setWarnings(sim.warnings);
      showWarnings();
    }
    if (activeTab === 'wave') wave.draw();
    updateAnalog();
  },
  onStop(reason) { $('#st-reason').textContent = reason; setRunButton(); regs.update(); disasmP.update(); memory.update(); periph.update(); source.setCurrent(sim.lineOfAddr(sim.cpu.pc), true); },
});
window.runner = runner;

const board = new BoardView($('#board-wrap'), sim, { reset: () => { runner.reset(); afterLoad(); } });
try { sim.lcd.setAttached(localStorage.getItem('kt89s51.lcm') === '1'); } catch {}
board.onLcmToggle = (v) => { try { localStorage.setItem('kt89s51.lcm', v ? '1' : '0'); } catch {} board.update({}); };
board.onWiringChange = () => { wiringApi.onWiringChanged(); if (typeof wiring !== 'undefined') wiring.build(); showWarnings(); };
const regs = new RegistersPanel($('#regs'), sim);
const source = new EditorPanel($('#source'), sim, (line) => toggleBpLine(line));
const disasmP = new DisasmPanel($('#disasm'), sim, (addr) => toggleBpAddr(addr));
const memory = new MemoryPanel($('#memory'), sim);
const wave = new WavePanel($('#wave'), sim);
const periph = new PeriphPanel($('#periph'), sim);
const output = new OutputPanel($('#output'), (line) => { switchTab('source'); source.scrollTo(line); });
const localPresets = () => { try { return JSON.parse(localStorage.getItem('kt89s51.presets') || '{}'); } catch { return {}; } };
const wiringApi = {
  listPresets: async () => Object.keys(localPresets()),
  loadPreset: async (n) => localPresets()[n] || null,
  savePreset: async (n, cfg) => {
    const local = localPresets(); local[n] = JSON.parse(JSON.stringify(cfg));
    try { localStorage.setItem('kt89s51.presets', JSON.stringify(local)); } catch {}
  },
  onWiringChanged: () => { try { localStorage.setItem('kt89s51.wiring.v2', JSON.stringify(sim.wiring.cfg)); } catch {} },
  disconnectAll: () => board.disconnectAll(),
};
try { const saved = localStorage.getItem('kt89s51.wiring.v2'); if (saved) sim.wiring.set(JSON.parse(saved)); } catch {}
const wiring = new WiringPanel($('#wiring'), sim, wiringApi);

// ---------- 狀態列 ----------
function updateStatus() {
  $('#st-pc').textContent = 'PC ' + hex4(sim.cpu.pc);
  $('#st-r0').textContent = 'R0 ' + hex2(sim.cpu.getR(0));
  const us = sim.cpu.cycles;
  $('#st-cycles').textContent = us < 1e4 ? `${us} µs` : us < 1e7 ? `${(us / 1e3).toFixed(2)} ms` : `${(us / 1e6).toFixed(3)} s`;
}
function setRunButton() {
  const b = $('#btn-run');
  b.textContent = runner.running ? '‖ 暫停' : '▶ 執行';
  b.classList.toggle('running', runner.running);
}
function showWarnings() {
  const box = $('#warnings');
  const cs = sim.wiring.conflicts().filter(c => c.level === 'error').map(c => '接線衝突：' + c.msg);
  const all = [...cs, ...sim.warnings];
  const needWire = !!pendingWiring;
  box.hidden = all.length === 0 && !needWire;
  let html = all.map(w => `<div>⚠ ${w.replace(/</g, '&lt;')}</div>`).join('');
  if (needWire) html = `<div class="suggest">🔌 這個範例要用到 KDM+ 的週邊，需要自己接線。<button id="btn-apply-wire">套用課本建議接法</button> 或直接在板子上點針腳自己接。</div>` + html;
  box.innerHTML = html;
  const b = document.getElementById('btn-apply-wire');
  if (b) b.addEventListener('click', applyPendingWiring);
}
function updateAnalog() {
  $('#dac-a').style.width = (sim.spi.voutA / 4.096 * 100).toFixed(1) + '%';
  $('#dac-b').style.width = (sim.spi.voutB / 4.096 * 100).toFixed(1) + '%';
  $('#val-dac-a').textContent = sim.spi.voutA.toFixed(3) + ' V';
  $('#val-dac-b').textContent = sim.spi.voutB.toFixed(3) + ' V';
}

// ---------- 中斷點 ----------
const bpLines = new Set();
function toggleBpLine(line) {
  const addr = sim.addrByLine.get(line);
  if (addr == null) return;
  if (bpLines.has(line)) { bpLines.delete(line); sim.cpu.breakpoints.delete(addr); }
  else { bpLines.add(line); sim.cpu.breakpoints.add(addr); }
  source.setBreakpoints(bpLines); disasmP.update();
}
function toggleBpAddr(addr) {
  if (sim.cpu.breakpoints.has(addr)) { sim.cpu.breakpoints.delete(addr); const l = sim.lineByAddr.get(addr); if (l != null) bpLines.delete(l); }
  else { sim.cpu.breakpoints.add(addr); const l = sim.lineByAddr.get(addr); if (l != null) bpLines.add(l); }
  source.setBreakpoints(bpLines); disasmP.update();
}

// ---------- 載入 / 編譯 ----------
let current = { name: '', source: '', isHex: false };
const isAsm = (name) => /\.(asm|a51|s)$/i.test(name || '');

async function compileAndLoad(src, name) {
  current = { name, source: src, isHex: false };
  const chip = CHIP;
  const r = assemble(src, { codeSize: 4096 });
  const res = { ok: r.ok, hex: r.hex, lines: r.lines, symbols: r.symbols, diagnostics: r.diagnostics, notes: [], chip,
                mem: r.ok ? `程式碼 ${r.codeBytes} 位元組` : '' };
  output.setCompile(res);
  source.asm = true;
  if (res.ok) {
    sim.chip = res.chip;
    sim.load({ hex: res.hex, lines: res.lines, symbols: res.symbols, name });
    memory.setSymbols(res.symbols);
    bpLines.clear(); sim.cpu.breakpoints.clear();
    source.setSource(src, res.diagnostics);
    $('#st-name').textContent = `${name}  ✔ ${r.codeBytes} 位元組`;
    $('#st-reason').textContent = '';
    afterLoad();
    if (autoRunAfterCompile) runner.start(); setRunButton();
  } else {
    source.setSource(src, res.diagnostics);
    $('#st-name').textContent = `${name}  ✖ 組譯失敗`;
    switchTab('output');
  }
}
function loadHexText(text, name) {
  current = { name, source: text, isHex: true };
  sim.load({ hex: text, lines: [], symbols: {}, name });
  memory.setSymbols({});
  bpLines.clear(); sim.cpu.breakpoints.clear();
  source.asm = false;
  source.setSource(`// 直接載入 HEX：${name}\n// 沒有 C 原始碼對應，請用「反組譯」分頁除錯。\n\n` + text, []);
  output.setCompile({ ok: true, chip: 'HEX', diagnostics: [], notes: [] });
  $('#st-name').textContent = `${name}  (HEX ${sim.cpu.codeSize} bytes)`;
  afterLoad();
}
let autoRunAfterCompile = true;
function afterLoad() {
  frameStartCycle = 0;
  runner.reset();
  regs.update(); disasmP.update(); memory.update(); periph.update();
  source.setCurrent(sim.lineOfAddr(sim.cpu.pc), true);
  setRunButton(); updateStatus();
}
async function openFile(file) {
  const text = await file.text();
  if (/\.(hex|ihx)$/i.test(file.name) || /^:[0-9A-Fa-f]{8}/.test(text.trim())) loadHexText(text, file.name);
  else await openProjectText(text, file.name);
}

// ---------- 分頁 ----------
function switchTab(name) {
  activeTab = name;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.id === 'tab-' + name);
  if (name === 'regs') regs.update();
  if (name === 'disasm') disasmP.update();
  if (name === 'memory') memory.update();
  if (name === 'wave') requestAnimationFrame(() => wave.draw());
}
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => switchTab(b.dataset.tab));

// ---------- 編輯即時重跑 ----------
let editTimer = 0;
const CHIP = 'AT89S51';
const autoRerun = () => true;      // 改完就重跑，跟真的燒錄上去一樣
function markDirty(src) {
  current.source = src;
  source.setCurrent(-1, false);
  clearTimeout(editTimer);
  editTimer = setTimeout(() => { recompileFromEditor(autoRerun()); saveDraft(); }, 500);
  $('#st-reason').textContent = '已修改…';
}
function recompileFromEditor(alsoLoad) {
  const src = source.getSource();
  current.source = src;
  if (current.isHex || !isAsm(current.name)) return;
  const chip = CHIP;
  const r = assemble(src, { codeSize: 4096 });
  source.setDiagnostics(r.diagnostics);
  output.setCompile({ ...r, chip, notes: [], mem: r.ok ? `程式碼 ${r.codeBytes} 位元組` : '' });
  if (!r.ok) {
    const e = r.diagnostics.find(d => d.severity === 'error');
    $('#st-reason').textContent = e ? `第 ${e.line} 行：${e.msg}` : '組譯失敗';
    $('#st-name').textContent = `${current.name}  ✖ 組譯失敗`;
    return false;
  }
  $('#st-reason').textContent = alsoLoad ? '' : '已組譯，按 F7 重新執行';
  $('#st-name').textContent = `${current.name}  ✔ ${r.codeBytes} 位元組`;
  if (!alsoLoad) return true;
  // 保留接線與執行狀態，只換程式
  const wasRunning = runner.running;
  sim.chip = chip;
  sim.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: current.name });
  memory.setSymbols(r.symbols);
  sim.cpu.breakpoints.clear();
  for (const ln of bpLines) { const a = sim.addrByLine.get(ln); if (a !== undefined) sim.cpu.breakpoints.add(a); }
  afterLoad();
  if (wasRunning) runner.start();
  setRunButton();
  return true;
}
source.onEdit = markDirty;

// ---------- 事件 ----------
const BLANK_ASM = [
  ';==== 新程式 =========================================',
  '; LED = P1（寫 0 亮）、蜂鳴器 = P3.7（寫 0 響）、指撥開關 = P0（ON 讀 0）',
  'LED\tEQU\tP1',
  '\tORG\t0',
  'START:\tMOV\tLED,#11111110B\t;最左邊那顆亮',
  '\tCALL\tDELAY',
  '\tJMP\tSTART',
  ';==== 延時 0.3 秒 ====================================',
  'DELAY:\tMOV\tR5,#3',
  'D0:\tMOV\tR7,#200',
  'D1:\tMOV\tR6,#250',
  '\tDJNZ\tR6,$',
  '\tDJNZ\tR7,D1',
  '\tDJNZ\tR5,D0',
  '\tRET',
  '\tEND',
  '',
].join('\n');
$('#btn-new').addEventListener('click', () => { switchTab('source'); compileAndLoad(BLANK_ASM, '未命名.asm'); });
$('#btn-open').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
$('#btn-run').addEventListener('click', () => { runner.toggle(); setRunButton(); });
runner.speed = 1;      // 永遠即時，跟真的板子一樣
// 音效預設開著，但瀏覽器規定要有使用者動作才准出聲 —— 等第一次點擊／按鍵再真正啟動
{
  const kick = async () => {
    if (!$('#chk-audio').checked) return;
    await audio.enable(true);
    if (audio.ctx && audio.mode === 'osc') $('#st-reason').textContent = '這個環境擋掉了 AudioWorklet，音效改用方波振盪器';
  };
  // 每一次手勢都先同步解鎖（iOS 切到背景回來會把 AudioContext 掛起），再補跑一次 enable。
  // 解鎖一定要在同一個 tick 裡完成，所以 unlock() 直接呼叫、不能等 kick() 的 await。
  const onGesture = () => { if (!$('#chk-audio').checked) return; audio.unlock(); kick(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, onGesture);
}
$('#chk-audio').addEventListener('change', async (e) => {
  await audio.enable(e.target.checked);
  if (!e.target.checked) { $('#st-reason').textContent = ''; return; }
  if (!audio.ctx) { $('#st-reason').textContent = '這個瀏覽器不支援 Web Audio，沒有聲音'; e.target.checked = false; return; }
  $('#st-reason').textContent = audio.mode === 'osc'
    ? '音效已開（這個環境擋掉了 AudioWorklet，改用方波振盪器，音高一樣但波形細節較粗）'
    : '音效已開';
});
$('#rng-pot').addEventListener('input', (e) => { sim.spi.potVolts = +e.target.value; $('#val-pot').textContent = (+e.target.value).toFixed(2) + ' V'; });
$('#rng-temp').addEventListener('input', (e) => { sim.spi.tempC = +e.target.value; sim.i2c.tempC = +e.target.value; $('#val-temp').textContent = (+e.target.value).toFixed(1) + ' °C'; });
// 載入範例：不自動接線，只提示建議接法，要不要套用由你決定
let pendingWiring = null;
function applyPendingWiring() {
  const w = pendingWiring; if (!w) return;
  const cfg = JSON.parse(JSON.stringify(sim.wiring.cfg));
  for (const [k, v] of Object.entries(w)) {
    if (k === 'enabled') Object.assign(cfg.enabled, { seg7: false, matrix: false, keypad: false, stepper: false, spi: false, i2c: false }, v);
    else if (k !== 'lcm') cfg[k] = v;
  }
  sim.wiring.set(cfg); wiring.build();
  sim.lcd.setAttached(!!w.lcm); board.onLcmToggle(!!w.lcm);
  pendingWiring = null; wiringApi.onWiringChanged(); showWarnings();
}
async function loadExample(n) {
  pendingWiring = null;      // 課本組語範例只用主板，不需要 KDM+ 接線
  const p = byName.get(n);
  if (!p) return;
  const src = p.source;
  if (/\.(hex|ihx)$/i.test(n)) loadHexText(src, n); else await compileAndLoad(src, n);
}
$('#sel-example').addEventListener('change', (e) => {
  const v = e.target.value; e.target.value = '';
  if (v) loadExample(v);
});
// ---------- 檔案：一種格式 .kt89（純文字）----------
// 內容就是組合語言原始碼；有接線的話，第一行放一句註解把接線也帶著走。
// ';' 在 A51 裡就是註解，所以這個檔案本身仍然是可以直接組譯的組合語言。
const TAG = ';!KT89 ';
function serializeProject() {
  const src = source.getSource();
  const keep = { ...sim.wiring.cfg }; delete keep.enabled;
  const base = { ...DEFAULT_WIRING }; delete base.enabled;
  if (JSON.stringify(keep) === JSON.stringify(base)) return src;   // 沒接線就只存程式碼
  return TAG + JSON.stringify(keep) + '\n' + src;
}
function parseProject(text) {
  const t = String(text).replace(/^\uFEFF/, '');
  if (!t.startsWith(TAG)) return { src: t, cfg: null };
  const nl = t.indexOf('\n');
  let cfg = null;
  try { cfg = JSON.parse(t.slice(TAG.length, nl < 0 ? undefined : nl)); } catch {}
  return { src: nl < 0 ? '' : t.slice(nl + 1), cfg };
}

function rebuildFileList() {
  const sel = $('#sel-example');
  sel.innerHTML = '<option value="">範例…</option>';
  for (const p of PROGRAMS) { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o); }
}

function openProjectText(text, name) {
  setFileName(name);
  const parsed = parseProject(text);
  if (parsed.cfg) { sim.wiring.set(parsed.cfg); wiringApi.onWiringChanged(); wiring.build(); showWarnings(); }
  return compileAndLoad(parsed.src, name);
}

const baseName = (n) => String(n || '未命名').replace(/\.(txt|kt89|asm|a51|s)$/i, '');
const setFileName = (n) => { $('#file-name').value = baseName(n); };
const getFileName = () => ($('#file-name').value.trim() || '未命名').replace(/[\\/:*?"<>|]/g, '_');

// 線上版（Artifact）不准網頁自己發動下載，要透過平台的 downloads 能力；
// 單檔版沒有那個東西，就用一般的 <a download>。兩條路都留著。
async function exportCurrent() {
  const text = serializeProject();
  const fname = getFileName() + '.txt';
  const say = (m) => { $('#st-reason').textContent = m; };

  const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: fname, data: text }); say('已下載 ' + fname); }
    catch (err) {
      const code = err && err.code;
      if (code === 'declined') say('已取消下載');
      else { await copyFallback(text, fname, say); }
    }
    return;
  }

  if (window.self !== window.top) return copyFallback(text, fname, say);

  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('已下載 ' + fname);
}
async function copyFallback(text, fname, say) {
  try { await navigator.clipboard.writeText(text); say('這個環境不能直接下載，已複製到剪貼簿，貼到記事本存成 ' + fname + ' 即可'); }
  catch { say('無法下載也無法複製，請直接從編輯器全選複製'); }
}

const BZ_KEY = 'kt89s51.boardzoom';
function setZoom(z) {
  z = Math.min(5, Math.max(1, z));
  $('#board-wrap').style.setProperty('--bz', z.toFixed(2));
  try { localStorage.setItem(BZ_KEY, String(z)); } catch {}
  return z;
}
let boardZoom = 1;
{
  let saved = NaN;
  try { saved = parseFloat(localStorage.getItem(BZ_KEY)); } catch {}
  // 窄螢幕：預設放大到板子大約 900px 寬，針腳才點得到（外框會橫向捲動）
  const fit = Math.min(3.2, Math.max(1, 900 / Math.max(320, window.innerWidth)));
  boardZoom = setZoom(Number.isFinite(saved) ? saved : fit);
}
$('#btn-zoom-in').addEventListener('click', () => { boardZoom = setZoom(boardZoom * 1.25); });
$('#btn-zoom-out').addEventListener('click', () => { boardZoom = setZoom(boardZoom / 1.25); });
$('#btn-zoom-fit').addEventListener('click', () => { boardZoom = setZoom(1); });

$('#btn-export').addEventListener('click', exportCurrent);
rebuildFileList();

// 打字時順手把草稿存起來，重新整理／關掉分頁都不會白做工
const DRAFT_KEY = 'kt89s51.draft';
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: current.name, text: serializeProject() })); } catch {}
}

// 啟動：有草稿就接回去，沒有就載第一個課本範例 —— 不要讓畫面一開始是空的
(function boot() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {}
  if (d && d.text && d.text.trim()) {
    current.name = d.name || '未命名.asm';
    setFileName(current.name);
    openProjectText(d.text, current.name);
    $('#st-reason').textContent = '已接回上次編輯的內容';
    return;
  }
  if (PROGRAMS.length) loadExample(PROGRAMS[0].name);
})();

// 拖放
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop-hint').hidden = false; });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-hint').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('#drop-hint').hidden = true; const f = e.dataTransfer.files[0]; if (f) openFile(f); });

// 快捷鍵
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'F5') { e.preventDefault(); runner.toggle(); setRunButton(); }
  else if (e.key === 'F7') { e.preventDefault(); clearTimeout(editTimer); recompileFromEditor(true); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); runner.reset(); afterLoad(); }
});

// 初始畫面
regs.update(); updateStatus(); board.update({});
