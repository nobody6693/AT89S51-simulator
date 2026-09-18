// 除錯面板：暫存器、原始碼、反組譯、記憶體、波形、週邊監視、接線設定、輸出
import { SFR, SFR_NAMES } from '../cpu/sfr.js';
import { disasm } from '../cpu/disasm.js';
import { hex2, hex4, pinName } from '../board/util.js';
import { CONNECTORS, DEFAULT_WIRING } from '../board/wiring.js';

const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const LH = 24;                      // CSS .editor 的 line-height
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 暫存器 ----------
// 埠不再印成 "P0 FF/FF latch/pin" —— 那一行看不出差在哪，還會斷行。
// 改成八格位元：格子是 latch（程式寫進去的），腳位被外面拉走的位元鑲琥珀底線。
const PORT_NOTE = ['SW1 指撥 / LCM D0–D7', 'LED DS1–DS8', '按鍵 PB3 PB4', '蜂鳴器 / LCM / PB1 PB2'];

export class RegistersPanel {
  constructor(root, sim) { this.root = root; this.sim = sim; this.prev = {}; }
  _cell(k, v, hot) {
    const ch = this.prev[k] !== undefined && this.prev[k] !== v;
    this.prev[k] = v;
    return `<div class="rg${ch ? ' changed' : ''}${hot ? ' hot' : ''}"><b>${k}</b><span>${v}</span></div>`;
  }
  update() {
    const c = this.sim.cpu, s = c.sfr;
    const psw = c.readDirect(SFR.PSW);
    let html = '';

    html += '<div class="rg-grid rg-core">'
      + this._cell('PC', hex4(c.pc), true) + this._cell('A', hex2(c.acc))
      + this._cell('B', hex2(c.b)) + this._cell('SP', hex2(c.sp))
      + this._cell('DPTR', hex4(c.dptr)) + this._cell('PSW', hex2(psw))
      + '</div>';

    html += '<div class="rg-grid rg-bank">';
    for (let i = 0; i < 8; i++) html += this._cell('R' + i, hex2(c.getR(i)));
    html += '</div>';

    const flags = ['CY', 'AC', 'F0', 'RS1', 'RS0', 'OV', 'F1', 'P'];
    html += '<div class="rg-flags"><b>PSW</b>'
      + flags.map((f, i) => `<i class="${(psw >> (7 - i)) & 1 ? 'on' : ''}">${f}</i>`).join('')
      + `<em>bank ${(psw >> 3) & 3}${c.intHighActive ? ' · ISR(高)' : c.intLowActive ? ' · ISR(低)' : ''}</em></div>`;

    for (let p = 0; p < 4; p++) {
      const latch = c.bus.latch[p], pin = c.bus.pins[p];
      let bits = '';
      for (let i = 7; i >= 0; i--) {
        const l = (latch >> i) & 1, q = (pin >> i) & 1;
        bits += `<i class="${l ? '' : 'lo'}${l !== q ? ' diff' : ''}">${l}</i>`;
      }
      html += `<div class="rg-port"><b>P${p}</b><span class="bits">${bits}</span>`
        + `<span class="hex${latch !== pin ? ' split' : ''}">${hex2(latch)}<em>/</em><u>${hex2(pin)}</u></span>`
        + `<span class="note">${PORT_NOTE[p]}</span></div>`;
    }
    html += '<div class="rg-grid rg-sfr">'
      + this._cell('TMOD', hex2(s[SFR.TMOD - 0x80])) + this._cell('TCON', hex2(s[SFR.TCON - 0x80]))
      + this._cell('TH0:TL0', hex2(s[SFR.TH0 - 0x80]) + hex2(s[SFR.TL0 - 0x80]))
      + this._cell('TH1:TL1', hex2(s[SFR.TH1 - 0x80]) + hex2(s[SFR.TL1 - 0x80]))
      + this._cell('IE', hex2(s[SFR.IE - 0x80])) + this._cell('IP', hex2(s[SFR.IP - 0x80]))
      + this._cell('SCON', hex2(s[SFR.SCON - 0x80])) + this._cell('SBUF', hex2(s[SFR.SBUF - 0x80]))
      + '</div>';

    this.root.innerHTML = html;
  }
}

// ---------- 原始碼 ----------
const KW = /\b(if|else|while|for|do|return|break|continue|switch|case|default|void|char|int|unsigned|signed|long|short|float|double|const|static|volatile|struct|union|typedef|enum|sizeof|sbit|sfr|sfr16|bit|code|data|idata|xdata|pdata|bdata|interrupt|using|reentrant|__sbit|__sfr|__at|__interrupt|__code|__data|__xdata|__idata)\b/g;
function highlight(line) {
  if (/^\s*#/.test(line)) return `<span class="tok-pp">${esc(line)}</span>`;
  let out = '', i = 0;
  const cm = line.indexOf('//');
  let main = line, tail = '';
  if (cm >= 0) { main = line.slice(0, cm); tail = `<span class="tok-cm">${esc(line.slice(cm))}</span>`; }
  // 字串
  const parts = main.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  for (const p of parts) {
    if (/^["']/.test(p)) out += `<span class="tok-str">${esc(p)}</span>`;
    else out += esc(p).replace(KW, '<span class="tok-kw">$1</span>').replace(/\b(0[xX][0-9a-fA-F]+|\d+)\b/g, '<span class="tok-num">$1</span>');
  }
  return out + tail;
}
const ASM_MNEMONIC = /\b(ACALL|ADDC|ADD|AJMP|ANL|CJNE|CLR|CPL|DA|DEC|DIV|DJNZ|INC|JBC|JB|JC|JMP|JNB|JNC|JNZ|JZ|LCALL|LJMP|MOVC|MOVX|MOV|MUL|NOP|ORL|POP|PUSH|RETI|RET|RLC|RL|RRC|RR|SETB|SJMP|SUBB|SWAP|XCHD|XCH|XRL|CALL)\b/gi;
const ASM_DIRECTIVE = /\b(ORG|EQU|SET|DB|DW|DS|END|BIT|DATA|IDATA|XDATA|CODE|USING)\b/gi;
const ASM_REG = /\b(A|AB|C|R[0-7]|DPTR|PC|P[0-3]|ACC|PSW|SP|IE|IP|TCON|TMOD|SCON|SBUF|TH[01]|TL[01]|B)\b/g;
function highlightAsm(line) {
  const c = line.indexOf(';');
  let main = line, tail = '';
  if (c >= 0) { main = line.slice(0, c); tail = `<span class="tok-cm">${esc(line.slice(c))}</span>`; }
  let out = esc(main);
  out = out.replace(/(^|\s)([A-Za-z_?][A-Za-z0-9_?]*)(\s*:)/g, '$1<span class="tok-lbl">$2</span>$3');
  out = out.replace(ASM_DIRECTIVE, '<span class="tok-pp">$1</span>');
  out = out.replace(ASM_MNEMONIC, '<span class="tok-kw">$1</span>');
  out = out.replace(ASM_REG, '<span class="tok-reg">$1</span>');
  out = out.replace(/#?(\b[0-9][0-9A-Fa-f]*[HhBbQqOoDd]?\b|0[xX][0-9A-Fa-f]+)/g, '<span class="tok-num">$&</span>');
  return out + tail;
}

export class SourcePanel {
  constructor(root, sim, onToggleBp) { this.root = root; this.sim = sim; this.onToggleBp = onToggleBp; this.lines = []; this.curLine = -1; this.inBlockComment = false; this.asm = false; }
  setSource(src, diags = []) {
    this.root.innerHTML = '';
    this.lines = [];
    const errs = {}; for (const d of diags) if (d.line) errs[d.line] = d.severity;
    const text = (src || '').split('\n');
    let inCm = false;
    text.forEach((ln, i) => {
      const n = i + 1;
      const row = h('div', 'line');
      const g = h('div', 'gutter', String(n));
      g.title = '按一下設定/清除中斷點';
      g.addEventListener('click', () => this.onToggleBp(n));
      const t = h('div', 'txt');
      // 區塊註解處理（簡化）
      let html;
      if (this.asm) { html = highlightAsm(ln); }
      else if (inCm) { const e = ln.indexOf('*/'); if (e >= 0) { html = `<span class="tok-cm">${esc(ln.slice(0, e + 2))}</span>` + highlight(ln.slice(e + 2)); inCm = false; } else html = `<span class="tok-cm">${esc(ln)}</span>`; }
      else { const s = ln.indexOf('/*'); if (s >= 0) { const e = ln.indexOf('*/', s + 2); if (e >= 0) html = highlight(ln.slice(0, s)) + `<span class="tok-cm">${esc(ln.slice(s, e + 2))}</span>` + highlight(ln.slice(e + 2)); else { html = highlight(ln.slice(0, s)) + `<span class="tok-cm">${esc(ln.slice(s))}</span>`; inCm = true; } } else html = highlight(ln); }
      t.innerHTML = html || ' ';
      row.appendChild(g); row.appendChild(t);
      if (errs[n] === 'error') row.classList.add('err'); else if (errs[n] === 'warning') row.classList.add('warnl');
      if (!this.sim.addrByLine.has(n)) row.classList.add('nocode');
      this.root.appendChild(row);
      this.lines.push(row);
    });
  }
  setBreakpoints(lineSet) { this.lines.forEach((row, i) => row.classList.toggle('bp', lineSet.has(i + 1))); }
  setCurrent(line, scroll = true) {
    if (this.curLine >= 1 && this.lines[this.curLine - 1]) this.lines[this.curLine - 1].classList.remove('cur');
    this.curLine = line || -1;
    if (line >= 1 && this.lines[line - 1]) {
      const row = this.lines[line - 1];
      row.classList.add('cur');
      if (scroll) { const r = row.getBoundingClientRect(), p = this.root.parentElement.getBoundingClientRect(); if (r.top < p.top + 20 || r.bottom > p.bottom - 20) row.scrollIntoView({ block: 'center' }); }
    }
  }
  scrollTo(line) { const row = this.lines[line - 1]; if (row) row.scrollIntoView({ block: 'center' }); }
}

// ---------- 可編輯的原始碼（A51） ----------
// textarea 疊在語法上色的 <pre> 上面：文字透明、只看得到游標，所以編輯是真的 textarea 行為
// （選取、復原、輸入法都正常），顏色由底下的 <pre> 提供。
export class EditorPanel {
  constructor(root, sim, onToggleBp) {
    this.root = root; this.sim = sim; this.onToggleBp = onToggleBp;
    this.asm = true; this.curLine = -1; this.bp = new Set(); this.diags = {};
    this.onEdit = null; this.readOnly = false;

    root.innerHTML = '';
    const ed = h('div', 'editor');
    this.gut = h('div', 'gut');
    const col = h('div', 'codecol');
    this.marks = h('div', 'marks');
    this.pre = document.createElement('pre'); this.pre.className = 'hl';
    this.ta = document.createElement('textarea');
    this.ta.spellcheck = false; this.ta.autocapitalize = 'off'; this.ta.autocomplete = 'off';
    this.ta.setAttribute('wrap', 'off');
    col.appendChild(this.marks); col.appendChild(this.pre); col.appendChild(this.ta);
    ed.appendChild(this.gut); ed.appendChild(col);
    root.appendChild(ed);

    this.ta.addEventListener('input', () => { this._render(); if (this.onEdit) this.onEdit(this.ta.value); });
    this.ta.addEventListener('keydown', (e) => this._key(e));
    this.ta.addEventListener('scroll', () => { this.root.parentElement.scrollLeft = this.ta.scrollLeft; });
  }

  // Tab 縮排；A51 慣用 Tab 分欄，不要讓它跳出編輯框
  _key(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    const t = this.ta, s = t.selectionStart, en = t.selectionEnd;
    if (s === en && !e.shiftKey) {
      t.setRangeText('\t', s, en, 'end');
    } else {
      const a = t.value.lastIndexOf('\n', s - 1) + 1;
      const block = t.value.slice(a, en);
      const next = e.shiftKey ? block.replace(/^[\t ]/gm, '') : block.replace(/^/gm, '\t');
      t.setRangeText(next, a, en, 'select');
    }
    this._render(); if (this.onEdit) this.onEdit(this.ta.value);
  }

  getSource() { return this.ta.value; }

  setSource(src, diags = []) {
    if (this.ta.value !== (src || '')) this.ta.value = src || '';
    this.setDiagnostics(diags);
  }
  setDiagnostics(diags = []) {
    this.diags = {};
    for (const d of diags) if (d.line) this.diags[d.line] = d.severity;
    this._render();
  }
  setReadOnly(v) { this.readOnly = !!v; this.ta.readOnly = !!v; this.root.classList.toggle('ro', !!v); }

  _render() {
    const lines = this.ta.value.split('\n');
    this.nLines = lines.length;
    this.pre.innerHTML = lines.map(l => (this.asm ? highlightAsm(l) : highlight(l)) || ' ').join('\n');
    // textarea 要跟 pre 一樣高，讓外層容器捲動而不是 textarea 自己捲
    this.ta.style.height = this.pre.scrollHeight + 'px';
    if (this.gut.childElementCount !== lines.length) {
      this.gut.innerHTML = '';
      lines.forEach((_, i) => {
        const g = h('div', null, String(i + 1));
        g.title = '按一下設定/清除中斷點';
        g.addEventListener('mousedown', (e) => { e.preventDefault(); this.onToggleBp(i + 1); });
        this.gut.appendChild(g);
      });
    }
    const has = this.sim.addrByLine;
    [...this.gut.children].forEach((g, i) => {
      g.className = '';
      if (this.bp.has(i + 1)) g.classList.add('bp');
      if (i + 1 === this.curLine) g.classList.add('cur');
      if (!has.has(i + 1)) g.classList.add('nocode');
    });
    this._marks(lines.length);
  }
  _marks(n) {
    this.marks.innerHTML = '';
    const add = (line, cls) => {
      if (line < 1 || line > n) return;
      const d = h('div', cls); d.style.top = ((line - 1) * LH) + 'px';
      this.marks.appendChild(d);
    };
    for (const [ln, sev] of Object.entries(this.diags)) add(+ln, sev === 'error' ? 'm-err' : 'm-warn');
    if (this.curLine >= 1) add(this.curLine, 'm-cur');
  }

  setBreakpoints(lineSet) { this.bp = lineSet; this._render(); }
  setCurrent(line, scroll = true) {
    if (this.curLine === (line || -1)) return;
    const prev = this.curLine;
    this.curLine = line || -1;
    // 只動行號與標記，不要整份重新上色。執行中每秒會換十幾次目前行，
    // 檔案一大(像幾百列樂譜資料)整份上色一次要幾十毫秒，整台機器都會被拖慢。
    const g = this.gut.children;
    if (prev >= 1 && g[prev - 1]) g[prev - 1].classList.remove('cur');
    if (this.curLine >= 1 && g[this.curLine - 1]) g[this.curLine - 1].classList.add('cur');
    this._marks(this.nLines || 0);
    if (scroll && this.curLine >= 1) this.scrollTo(this.curLine);
  }
  scrollTo(line) {
    const box = this.root.parentElement;
    if (!box) return;
    const y = (line - 1) * LH;
    if (y < box.scrollTop + 20 || y > box.scrollTop + box.clientHeight - 40) box.scrollTop = y - box.clientHeight / 2;
  }
}

// ---------- 反組譯 ----------
export class DisasmPanel {
  constructor(root, sim, onToggleBp) { this.root = root; this.sim = sim; this.onToggleBp = onToggleBp; this.follow = true; }
  update() {
    const c = this.sim.cpu;
    // 從 PC 往前找 12 條指令的起點（以反組譯長度往前推估）
    let start = Math.max(0, c.pc - 40);
    // 對齊：從 start 反組譯直到 >= pc，取最後一個 <= pc 的位址序列
    const addrs = [];
    let a = start;
    while (a < c.pc) { addrs.push(a); a += disasm(c.code, a).len; }
    if (a !== c.pc) { addrs.length = 0; a = c.pc; } // 對不齊時直接從 PC 開始
    const before = addrs.slice(-12);
    let html = '';
    const emit = (addr) => {
      const d = disasm(c.code, addr);
      let bytes = ''; for (let i = 0; i < d.len; i++) bytes += hex2(c.code[(addr + i) & 0xFFFF]) + ' ';
      const line = this.sim.lineByAddr.get(addr);
      const cls = (addr === c.pc ? ' cur' : '') + (c.breakpoints.has(addr) ? ' bp' : '');
      html += `<div class="line${cls}" data-addr="${addr}"><div class="gutter"></div><div class="addr">${hex4(addr)}</div><div class="bytes">${bytes}</div><div class="cline">${line != null ? 'L' + line : ''}</div><div class="txt">${esc(d.text)}</div></div>`;
      return d.len;
    };
    for (const addr of before) emit(addr);
    a = c.pc;
    for (let i = 0; i < 28 && a < 0x10000; i++) a += emit(a);
    this.root.innerHTML = html;
    for (const row of this.root.querySelectorAll('.line')) row.querySelector('.gutter').addEventListener('click', () => this.onToggleBp(+row.dataset.addr));
    const cur = this.root.querySelector('.line.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
  }
}

// ---------- 記憶體 ----------
export class MemoryPanel {
  constructor(root, sim) { this.root = root; this.sim = sim; this.prevIram = new Uint8Array(256); this.prevX = new Uint8Array(256); this.symbols = {}; }
  setSymbols(sym) { this.symbols = sym || {}; }
  update() {
    const c = this.sim.cpu;
    let html = '';
    const dump = (arr, base, n, prev, label) => {
      html += `<h4>${label}</h4>`;
      for (let r = 0; r < n; r += 16) {
        let row = `<span class="a">${hex2(base + r)}:</span> `;
        for (let i = 0; i < 16; i++) {
          const v = arr[r + i];
          const ch = prev && prev[r + i] !== v;
          const isSp = label.startsWith('IRAM') && (r + i) === c.sp;
          row += `<span class="b${ch ? ' ch' : ''}${isSp ? ' pc' : ''}" title="${hex2(base + r + i)}">${hex2(v)}</span> `;
          if (i === 7) row += ' ';
        }
        html += `<div class="hexrow">${row}</div>`;
      }
    };
    const iramN = this.sim.chip === 'AT89S52' ? 256 : 128;
    dump(c.iram, 0, iramN, this.prevIram, 'IRAM（00–1F 暫存器組、20–2F 位元定址、SP 反白）');
    html += '<h4>SFR</h4><div class="sfrgrid">';
    for (const [addr, name] of Object.entries(SFR_NAMES).sort((a, b) => a[0] - b[0])) {
      const v = c.readDirect(+addr, true);
      html += `<div><b style="color:#9aa3b2">${name}</b> ${hex2(v)}</div>`;
    }
    html += '</div>';
    const syms = Object.entries(this.symbols).filter(([n, s]) => s.addr != null && s.space && !SFR_NAMES[s.addr] && !/^P[0-3]_[0-7]$/.test(n));
    if (syms.length) {
      html += '<h4>C 全域變數</h4><div class="sym">';
      for (const [n, s] of syms.sort()) {
        let v = '';
        const sz = Math.min(s.size || 1, 4);
        if (s.space === 'E' || s.space === 'I') { for (let i = 0; i < sz; i++) v += hex2(c.iram[(s.addr + i) & 0xFF]) + ' '; }
        else if (s.space === 'F' || s.space === 'X') { for (let i = 0; i < sz; i++) v += hex2(c.xram[(s.addr + i) & 0xFFFF]) + ' '; }
        else if (s.space === 'C') { for (let i = 0; i < sz; i++) v += hex2(c.code[(s.addr + i) & 0xFFFF]) + ' '; }
        else if (s.space === 'H') { v = ((c.readDirect((s.addr >> 3) < 0x10 ? 0x20 + ((s.addr >> 3) - 0) : s.addr & 0xF8, true) >> (s.addr & 7)) & 1) ? '1' : '0'; }
        else continue;
        html += `<div><b style="color:#9aa3b2">${esc(n)}</b> <span style="color:#7c8aa0">${{ E: 'data', I: 'idata', F: 'xdata', X: 'xdata', C: 'code', H: 'bit' }[s.space] || s.space}@${hex4(s.addr)}</span> ${v}${(s.size || 1) > 4 ? '…' : ''}</div>`;
      }
      html += '</div>';
    }
    this.root.innerHTML = html;
    this.prevIram.set(c.iram);
  }
}

// ---------- 波形（邏輯分析儀） ----------
export class WavePanel {
  constructor(root, sim) {
    this.root = root; this.sim = sim;
    this.selected = ['P1.0', 'P1.1', 'P3.7', 'P3.2', 'P3.0', 'P0.0'];
    this.windowUs = 10000;
    this.paused = false;
    root.innerHTML = '';
    const ctl = h('div', 'ctl');
    const wsel = document.createElement('select');
    for (const [v, l] of [[200, '200 µs'], [1000, '1 ms'], [5000, '5 ms'], [10000, '10 ms'], [50000, '50 ms'], [200000, '200 ms'], [1000000, '1 s'], [5000000, '5 s']]) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === this.windowUs) o.selected = true; wsel.appendChild(o); }
    wsel.addEventListener('change', () => { this.windowUs = +wsel.value; this.draw(); });
    ctl.appendChild(h('span', null, '時間視窗 ')); ctl.appendChild(wsel);
    const pause = h('button', null, '⏸ 凍結'); pause.addEventListener('click', () => { this.paused = !this.paused; pause.textContent = this.paused ? '▶ 跟隨' : '⏸ 凍結'; }); ctl.appendChild(pause);
    const pins = h('div', 'pins');
    for (let p = 0; p < 4; p++) for (let b = 0; b < 8; b++) {
      const name = `P${p}.${b}`;
      const lab = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = this.selected.includes(name);
      cb.addEventListener('change', () => { if (cb.checked) this.selected.push(name); else this.selected = this.selected.filter(x => x !== name); this.selected.sort(); this.draw(); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(name)); pins.appendChild(lab);
    }
    ctl.appendChild(pins);
    root.appendChild(ctl);
    this.canvas = document.createElement('canvas'); root.appendChild(this.canvas);
    this.info = h('div', null, ''); this.info.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--muted)'; root.appendChild(this.info);
    this.canvas.addEventListener('mousemove', (e) => this._hover(e));
  }
  draw() {
    if (this.paused) return;
    const cv = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = Math.max(120, cv.clientHeight);
    if (!W) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101216'; ctx.fillRect(0, 0, W, H);
    const chans = this.selected.map(n => { const m = /^P(\d)\.(\d)$/.exec(n); return { name: n, port: +m[1], bit: +m[2] }; });
    if (!chans.length) return;
    const la = this.sim.la;
    const tEnd = this.sim.cpu.cycles, tStart = tEnd - this.windowUs;
    const left = 44, rowH = Math.min(36, (H - 18) / chans.length);
    const xOf = (t) => left + (t - tStart) / this.windowUs * (W - left - 4);
    // 格線
    ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 1; ctx.font = '10px monospace'; ctx.fillStyle = '#7c8aa0';
    const div = 10;
    for (let i = 0; i <= div; i++) { const x = left + (W - left - 4) * i / div; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 14); ctx.stroke(); const us = this.windowUs * (i - div) / div; ctx.fillText(us === 0 ? 'now' : (Math.abs(us) >= 1000 ? (us / 1000).toFixed(us % 1000 ? 1 : 0) + 'ms' : us + 'µs'), x - 12, H - 3); }
    // 各通道：從最新往回走
    chans.forEach((ch, i) => {
      const y0 = i * rowH + 6, y1 = y0 + rowH - 10;
      ctx.fillStyle = '#c9d1d9'; ctx.fillText(ch.name, 2, y0 + rowH / 2);
      ctx.strokeStyle = ['#4da3ff', '#4ade80', '#f5b942', '#ff7ab3', '#b39ddb', '#7fdbff', '#ffd166', '#ff8c42'][i % 8]; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let prevT = tEnd, prevV = (this.sim.bus.pins[ch.port] >> ch.bit) & 1;
      ctx.moveTo(xOf(tEnd), prevV ? y0 : y1);
      let done = false;
      la.eachBackward((t, pins) => {
        const v = (pins[ch.port] >> ch.bit) & 1;
        if (t < tStart) { ctx.lineTo(xOf(tStart), prevV ? y0 : y1); done = true; return false; }
        if (v !== prevV) { ctx.lineTo(xOf(t), prevV ? y0 : y1); ctx.lineTo(xOf(t), v ? y0 : y1); prevV = v; }
        prevT = t;
      });
      if (!done) ctx.lineTo(xOf(Math.max(tStart, 0)), prevV ? y0 : y1);
      ctx.stroke();
    });
    this._geom = { left, W, rowH, chans, tStart };
  }
  _hover(e) {
    if (!this._geom) return;
    const { left, W, tStart } = this._geom;
    const x = e.offsetX;
    const t = tStart + (x - left) / (W - left - 4) * this.windowUs;
    this.info.textContent = `游標：t = ${(t / 1000).toFixed(3)} ms（距現在 ${((this.sim.cpu.cycles - t) / 1000).toFixed(3)} ms）`;
  }
}

// ---------- 週邊監視 ----------
export class PeriphPanel {
  constructor(root, sim) { this.root = root; this.sim = sim; root.innerHTML = ''; this.boxes = {}; for (const k of ['lcd', 'uart', 'spi', 'i2c', 'stepper', 'keypad']) { const b = h('div', 'box'); b.appendChild(h('h4', null, { lcd: 'LCD 命令記錄', uart: 'UART 送出 (TXD)', spi: 'SPI ADC/DAC', i2c: 'I²C 匯流排', stepper: '步進馬達', keypad: '鍵盤 / 開關' }[k])); const pre = h('pre'); b.appendChild(pre); root.appendChild(b); this.boxes[k] = pre; } }
  update() {
    const s = this.sim;
    const lcd = s.lcd;
    this.boxes.lcd.textContent = `模式 ${lcd.dl8 ? '8-bit' : '4-bit'}  ${lcd.lines2 ? '2行' : '1行'}  顯示${lcd.displayOn ? 'ON' : 'OFF'}  AC=${hex2(lcd.ac)}${lcd.cgMode ? '(CG)' : ''}  忙碌:${lcd.busy ? '是' : '否'}\n` + lcd.log.slice(-40).join(' ');
    const uart = s.uartOut.map(b => b === 10 ? '\n' : b === 13 ? '' : (b >= 32 && b < 127 ? String.fromCharCode(b) : `<${hex2(b)}>`)).join('');
    this.boxes.uart.textContent = uart.slice(-2000) || '（尚無輸出；SCON/TMOD/TH1 設定後寫 SBUF）';
    this.boxes.spi.textContent = `ADC CH0=${s.spi.channelCode(0)} (${s.spi.potVolts.toFixed(2)}V)  CH1=${s.spi.channelCode(1)} (${(s.spi.tempC * 0.01).toFixed(3)}V)\nDAC A=${s.spi.dac.latchA} → ${s.spi.voutA.toFixed(3)}V  B=${s.spi.dac.latchB} → ${s.spi.voutB.toFixed(3)}V\n` + s.spi.log.slice(-12).join('\n');
    this.boxes.i2c.textContent = `狀態 ${s.i2c.state}  從屬 ${s.i2c.slave || '-'}  TC74=${Math.round(s.i2c.tempC)}°C\n` + s.i2c.log.slice(-16).join('\n') + `\nEEPROM[0..15]: ` + Array.from(s.i2c.eeprom.subarray(0, 16)).map(hex2).join(' ');
    const st = s.stepper;
    this.boxes.stepper.textContent = `線圈 A1=${(st.coils >> 0) & 1} B1=${(st.coils >> 1) & 1} A2=${(st.coils >> 2) & 1} B2=${(st.coils >> 3) & 1}\n角度 ${(((st.angle % 360) + 360) % 360).toFixed(1)}°  淨半步 ${st.halfSteps}  方向 ${st.direction > 0 ? '正' : st.direction < 0 ? '反' : '-'}\n步距 ${st.stepIntervalUs} µs  ${st.rpm.toFixed(1)} rpm  失步 ${st.missed}`;
    const pressed = []; for (let i = 0; i < 16; i++) if (s.keypad.pressed[i]) pressed.push('PB' + i);
    this.boxes.keypad.textContent = `鍵盤按下：${pressed.join(' ') || '無'}\nSW1：${Array.from(s.dip.on).map((v, i) => `P0.${i}=${v ? 'ON' : 'off'}`).join(' ')}\n按鍵：${Array.from(s.buttons.pressed).map((v, i) => `PB${i + 1}=${v ? '按' : '-'}`).join(' ')}`;
  }
}

// ---------- 接線設定（只顯示狀態；實際接線在板子上點針腳）----------
export class WiringPanel {
  constructor(root, sim, api) { this.root = root; this.sim = sim; this.api = api; this.build(); }
  build() {
    const root = this.root; root.innerHTML = '';
    const tools = h('div', 'wtools');
    tools.appendChild(h('span', null, '接線方式：在板子上點一支針腳，再點另一支針腳。再點一次已接的腳就拆線。'));
    root.appendChild(tools);

    const pr = h('div', 'wtools');
    pr.appendChild(h('span', null, 'Preset：'));
    const sel = document.createElement('select'); pr.appendChild(sel);
    const load = h('button', null, '載入'); const save = h('button', null, '另存…'); const clr = h('button', null, '全部拆線');
    pr.appendChild(load); pr.appendChild(save); pr.appendChild(clr);
    root.appendChild(pr);
    this.api.listPresets().then(list => { sel.innerHTML = '<option value="">（選擇）</option>' + list.map(n => `<option>${esc(n)}</option>`).join(''); });
    load.addEventListener('click', async () => { if (!sel.value) return; const c = await this.api.loadPreset(sel.value); if (c) { this.sim.wiring.set(c); this.build(); this.api.onWiringChanged(); } });
    save.addEventListener('click', async () => { const n = prompt('Preset 名稱：'); if (!n) return; await this.api.savePreset(n, this.sim.wiring.cfg); this.build(); });
    clr.addEventListener('click', () => { if (this.api.disconnectAll) this.api.disconnectAll(); this.build(); });

    const cfg = this.sim.wiring.cfg;
    const groups = [
      ['七段顯示器', [['段 a–dp (JP3)', cfg.seg, ['a','b','c','d','e','f','g','dp']], ['位選 X0–X7 (JP4)', cfg.digit, ['X0','X1','X2','X3','X4','X5','X6','X7']], ['74LS138 (JP5)', cfg.dec138, ['A','B','C']]]],
      ['LED 陣列', [['列 R1–R8 (JP6)', cfg.matrixRow, ['R1','R2','R3','R4','R5','R6','R7','R8']]]],
      ['4×4 鍵盤', [['掃描輸出 (JP8)', cfg.keyOut, ['KO0','KO1','KO2','KO3']], ['讀回 (JP8)', cfg.keyIn, ['KI0','KI1','KI2','KI3']]]],
      ['步進馬達', [['S0–S3 (JP7)', cfg.stepper, ['S0','S1','S2','S3']]]],
      ['ADC / DAC', [['JP10', [cfg.spiSck, cfg.spiSdi, cfg.spiSdo, cfg.adcCs, cfg.dacCs, cfg.dacLd], ['SCK','SDI','SDO','ADC_CS','DAC_CS','LDAC']]]],
      ['I²C', [['JP1', [cfg.sda, cfg.scl], ['SDA','SCL']]]],
    ];
    for (const [gname, rows] of groups) {
      const any = rows.some(r => (r[1] || []).some(Boolean));
      const gh = h('div', 'grp'); gh.appendChild(h('span', null, gname + (any ? '  ●' : '  ○ 未接線')));
      root.appendChild(gh);
      for (const [title, arr, names] of rows) {
        const row = h('div', 'conn');
        row.appendChild(h('div', null, title));
        const list = h('div', 'wlist');
        names.forEach((n, i) => {
          const v = (arr || [])[i];
          const d = h('div', v ? null : 'none', `${n} → ${v || '未接'}`);
          list.appendChild(d);
        });
        row.appendChild(list);
        root.appendChild(row);
      }
    }
    this.conf = h('div', 'conf'); root.appendChild(this.conf);
    const cs = this.sim.wiring.conflicts();
    this.conf.innerHTML = cs.length ? cs.map(c => `<div class="${c.level}">${c.level === 'error' ? '✖' : '⚠'} ${esc(c.msg)}</div>`).join('') : '<div style="color:var(--ok)">✔ 沒有接線衝突</div>';
  }
}

// ---------- 輸出 ----------
export class OutputPanel {
  constructor(root, onJump) { this.root = root; this.onJump = onJump; this.diags = []; this.notes = []; this.mem = ''; this.warnings = []; this.status = ''; }
  setCompile(res) { this.diags = res.diagnostics || []; this.notes = res.notes || []; this.mem = res.mem || ''; this.status = res.ok ? `✔ 編譯成功（${res.chip}）` : '✖ 編譯失敗'; this.render(); }
  setWarnings(w) { const s = w.join('\n'); if (s !== this._lastW) { this._lastW = s; this.warnings = w; this.render(); } }
  render() {
    let html = `<div style="color:${this.status.startsWith('✔') ? 'var(--ok)' : 'var(--err)'}">${esc(this.status)}</div>`;
    if (this.diags.length) { html += '<h4>編譯訊息（點擊跳到該行）</h4>'; for (const d of this.diags) html += `<div class="diag ${d.severity}" data-line="${d.line}">${d.line ? `第 ${d.line} 行：` : ''}${esc(d.msg)}</div>`; }
    if (this.notes.length) html += '<h4>相容層備註</h4>' + this.notes.map(n => `<div>${esc(n)}</div>`).join('');
    if (this.warnings.length) html += '<h4 style="color:var(--warn)">模擬器警告</h4>' + this.warnings.map(n => `<div style="color:var(--warn)">⚠ ${esc(n)}</div>`).join('');
    if (this.mem) html += `<h4>記憶體用量</h4><pre>${esc(this.mem.trim())}</pre>`;
    this.root.innerHTML = html;
    for (const d of this.root.querySelectorAll('.diag')) d.addEventListener('click', () => this.onJump(+d.dataset.line));
  }
}
