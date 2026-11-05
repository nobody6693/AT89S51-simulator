// 板子下方的「串列埠外接」：課本第 5 章接在 P3.0~P3.2 的電路（74165、74164、第二塊板子、PC）。
// 接線選「不接」時整塊藏起來，不佔版面。
import { SERIAL_KINDS } from '../board/serial.js';
import { hex2 } from '../board/util.js';

const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const MIN_HOLD_US = 30000;      // 輕點也要讓程式掃得到，跟主板按鈕同一個門檻
const PC_REPEAT_US = 100000;    // 「連續傳送」每 0.1 秒一筆

export class SerialPanel {
  constructor(root, sim) {
    this.root = root; this.sim = sim;
    this.kind = null; this.leds = null; this.ledSrc = null;
    sim.wiring.onChange(() => this.build());
    this.build();
  }

  build() {
    const s = this.sim, cfg = s.wiring.cfg, kind = s.serial.kind;
    const key = kind + '|' + (cfg.peerProgram || '');
    if (key === this.kind) return;
    this.kind = key;
    const root = this.root;
    root.innerHTML = '';
    root.hidden = kind === 'none';
    this.leds = null; this.ledSrc = null; this.pc = null;
    if (kind === 'none') return;
    const name = (SERIAL_KINDS.find((k) => k[0] === kind) || [])[1];
    root.appendChild(h('h3', null, '串列埠外接：' + name));
    if (kind === 'loopback') root.appendChild(h('div', 'sx-note', 'P3.0 (RxD) 與 P3.1 (TxD) 已經短路（JP3 套短路環）：傳出去的資料由自己收回來，直接撥主板的 SW1、看主板的 LED。'));
    if (kind === 'shift165') this._build165();
    if (kind === 'shift164') this._build164();
    if (kind === 'board2') this._buildBoard2(cfg);
    if (kind === 'pc') this._buildPc();
  }

  _row(label, parent = this.root) {
    const r = h('div', 'sx-row');
    r.appendChild(h('span', 'sx-label', label));
    parent.appendChild(r);
    return r;
  }
  // 指撥開關列。get/set 用 index，names 是每個開關底下的字
  _switches(row, names, get, set) {
    names.forEach((n, i) => {
      const b = h('button', 'sx-sw');
      b.title = n + '：點一下切換 ON / OFF';
      const paint = () => {
        const on = get(i);
        b.textContent = on ? 'ON' : 'off';
        b.classList.toggle('on', !!on);
      };
      b.addEventListener('click', () => { set(i, !get(i)); paint(); });
      paint();
      const cell = h('div', 'sx-cell');
      cell.appendChild(b);
      cell.appendChild(h('span', 'sx-pin', n));
      row.appendChild(cell);
    });
  }
  _ledRow(row, names) {
    this.leds = names.map((n) => {
      const cell = h('div', 'sx-cell');
      const dot = h('span', 'sx-led');
      cell.appendChild(dot);
      cell.appendChild(h('span', 'sx-pin', n));
      row.appendChild(cell);
      return dot;
    });
  }

  _build165() {
    const se = this.sim.serial;
    this.root.appendChild(h('div', 'sx-note', 'out→P3.0、clock→P3.1、shift/load→P3.2。撥 ON 讀到 0；移位時 H 最先出來，所以 H 對到 D0（P1.0），A 對到 D7（P1.7）。'));
    // 由左到右排 H~A，才會跟主板的 LED（左邊是 P1.0）上下對齊
    const order = [7, 6, 5, 4, 3, 2, 1, 0], letters = 'ABCDEFGH';
    this._switches(this._row('開關'), order.map((i) => `${letters[i]}→P1.${7 - i}`),
      (k) => se.sw165[order[k]], (k, v) => se.set165(order[k], v));
  }
  _build164() {
    this.root.appendChild(h('div', 'sx-note', 'A、B→P3.0、clock→P3.1。先送的 D0 最後停在 QH，電路板上 DS1~DS8（左到右）就是 QH~QA。'));
    this._ledRow(this._row('LED'), ['DS1 QH', 'DS2 QG', 'DS3 QF', 'DS4 QE', 'DS5 QD', 'DS6 QC', 'DS7 QB', 'DS8 QA']);
    this.ledSrc = () => this.sim.serial.duty164.smooth;
  }
  _buildBoard2(cfg) {
    const peer = this.sim.serial.peer;
    this.root.appendChild(h('div', 'sx-note', 'RxD、TxD 交叉對接，地線共接。第二塊跑：' + (cfg.peerProgram || '跟第一塊同一支程式') + (cfg.peerProgram ? '（不會跟著編輯器改）' : '')));
    this._ledRow(this._row('LED'), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 'P1.' + i));
    this.ledSrc = () => this.sim.serial.peer.leds.duty.smooth;
    this._switches(this._row('SW1'), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 'P0.' + i),
      (i) => peer.dip.on[i], (i, v) => peer.dip.set(i, v));
    const r = this._row('按鈕');
    this._hold(r, 'PB3', 'P2.0', (v) => this.sim.serial.peer && this.sim.serial.peer.buttons.press(2, v));
    this._hold(r, 'PB4', 'P2.1', (v) => this.sim.serial.peer && this.sim.serial.peer.buttons.press(3, v));
  }
  // 按住才算按著；放開要等模擬時間走滿 30ms，跟主板按鈕同一套（見 board.js 的 _pressable）
  _hold(row, label, pin, set) {
    const sim = this.sim, b = h('button', 'sx-btn', label);
    let t0 = 0, held = false, gen = 0;
    const down = (e) => { if (e.preventDefault) e.preventDefault(); if (held) return; held = true; gen++; t0 = sim.cpu.cycles; b.classList.add('on'); set(1); };
    const up = () => {
      if (!held) return;
      held = false; b.classList.remove('on');
      const due = t0 + MIN_HOLD_US, g = gen;
      if (due <= sim.cpu.cycles || !sim.running) set(0);
      else sim.at(due, () => { if (g === gen && !held) set(0); });
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    const cell = h('div', 'sx-cell');
    cell.appendChild(b);
    cell.appendChild(h('span', 'sx-pin', pin));
    row.appendChild(cell);
  }

  _buildPc() {
    const se = this.sim.serial;
    this.root.appendChild(h('div', 'sx-note', '課本的 PC_RS232 視窗：PC 端鮑率設 4800。CH5-4-5 每收到一筆才回傳一次開關，要看開關即時反應就勾「連續傳送」。'));
    const baud = h('span', 'sx-val');
    this._row('8051 鮑率').appendChild(baud);
    const rx = h('span', 'sx-val');
    this._row('PC 接收').appendChild(rx);
    const r = this._row('PC 傳出');
    const input = h('input', 'sx-input');
    input.type = 'text'; input.size = 4; input.maxLength = 2; input.value = '01'; input.title = '要傳給 8051 的資料（十六進位 00~FF）';
    r.appendChild(input);
    r.appendChild(h('span', 'sx-pin', 'H'));
    const send = h('button', 'sx-btn', '傳出');
    r.appendChild(send);
    const lab = h('label', 'chk');
    const rep = h('input');
    rep.type = 'checkbox';
    lab.appendChild(rep);
    lab.appendChild(document.createTextNode(' 連續傳送'));
    r.appendChild(lab);
    const value = () => { const v = parseInt(input.value, 16); return Number.isNaN(v) ? null : v & 0xFF; };
    const fire = () => { const v = value(); if (v != null) se.pcSend(v); };
    send.addEventListener('click', fire);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); e.stopPropagation(); });
    this.pc = { baud, rx, rep, fire, last: -1e12, shown: '' };
  }

  // 每幀更新
  update() {
    const s = this.sim;
    if (s.serial.kind === 'none') return;
    if (s.serial.kind === 'shift164') s.serial.frame();
    if (this.leds && this.ledSrc) {
      const d = this.ledSrc();
      this.leds.forEach((dot, i) => { dot.style.opacity = (0.12 + 0.88 * Math.pow(Math.min(1, d[i]), 0.45)).toFixed(2); });
    }
    if (this.pc) {
      const pc = this.pc, baud = s.cpu.uartBaud();
      const txt = s.cpu.sfr[0x18] >> 6 === 0 ? '尚未設定串列埠' : baud ? `${Math.round(baud)} bps` : 'Timer 1 還沒啟動';
      if (pc.baud.textContent !== txt) pc.baud.textContent = txt;
      const out = s.uartOut.slice(-12).map(hex2).join(' ') || '（還沒收到）';
      if (out !== pc.shown) { pc.rx.textContent = out; pc.shown = out; }
      if (pc.rep.checked && s.running && s.cpu.cycles - pc.last >= PC_REPEAT_US) { pc.last = s.cpu.cycles; pc.fire(); }
      if (s.cpu.cycles < pc.last) pc.last = -1e12;   // 重設後週期數歸零
    }
  }
}
