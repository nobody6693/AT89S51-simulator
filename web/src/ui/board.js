// 板子畫面：KT89S51 V4.2 主板（左）+ KDM+ 擴充板（右）
// 所有元件位置量自實體照片；座標單位 = 照片像素，畫的時候乘 S。
// 接線：點一支針腳，再點另一支針腳就接上。
import { BUTTONS } from '../board/mainboard.js';
import { glyphRows } from '../board/lcd1602.js';
import { HEADERS, isPort } from './headers.js';

const NS = 'http://www.w3.org/2000/svg';
const S = 2;                       // 照片像素 → SVG 單位
const P = (v) => v * S;
const isWide = (ch) => { const c = ch.codePointAt(0); return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xFF01 && c <= 0xFF60); };
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const txt = (parent, x, y, s, attrs = {}) => {
  const t = el('text', { x, y, fill: SILK, 'font-size': 15, 'font-family': 'Segoe UI, Microsoft JhengHei, sans-serif', ...attrs }, parent);
  t.textContent = s; return t;
};
const gamma = (d) => Math.pow(Math.max(0, Math.min(1, d)), 0.45);
// 顏色取自 docs/board-photo.png 的實物取樣（見 README 的「元件對照表」）
const SILK = '#EDE8DC', GOLD = '#F2CA5C';
const C = {
  edge: '#B8845C',                                  // 裁板邊露出的玻纖
  socketDark: '#00440A',                            // IC 座陰影側
  black: '#0B0B0B',                                 // 排針、DIP 封裝
  segOff: '#C29470',                                // 七段未亮時的米色導光
  matrixBody: '#6A6A64', matrixOff: '#D6D2C6',      // 點矩陣是淺灰模組
  keyBody: '#C3C3C3', keyEdge: '#9A9A9A', keyCap: '#50505A', keyDown: '#8FC0E8',
  buzzerRim: '#191E33', buzzerFace: '#272D47',
};

const COLORS = { seg7: '#e8e8e8', matrix: '#4da3ff', keypad: '#ffe066', stepper: '#ff7ab3', spi: '#b39ddb', i2c: '#7fdbff' };
const GROUP_OF = (id) =>
  id.startsWith('seg') || id.startsWith('digit') || id.startsWith('dec138') ? 'seg7'
    : id.startsWith('matrixRow') ? 'matrix'
      : id.startsWith('key') ? 'keypad'
        : id.startsWith('stepper') ? 'stepper'
          : (id === 'sda' || id === 'scl') ? 'i2c' : 'spi';

const pathOf = (id) => { const i = id.indexOf('.'); return i < 0 ? [id] : [id.slice(0, i), +id.slice(i + 1)]; };
const getPin = (cfg, id) => { const p = pathOf(id); return p.length > 1 ? (cfg[p[0]] || [])[p[1]] : cfg[p[0]]; };
const setPin = (cfg, id, v) => { const p = pathOf(id); if (p.length > 1) { cfg[p[0]] = cfg[p[0]] || []; cfg[p[0]][p[1]] = v; } else cfg[p[0]] = v; };

// 可接線的週邊訊號，直接從排針定義掃出來，避免兩邊不同步
export const DEV_IDS = [...new Set(HEADERS.flatMap(h => h.pins.map(p => p[1])).filter(v => v && v.startsWith('dev:')).map(v => v.slice(4)))];

function recomputeEnabled(cfg) {
  const any = (...pres) => DEV_IDS.some(id => pres.some(p => id.startsWith(p)) && getPin(cfg, id));
  cfg.enabled = {
    seg7: any('seg', 'digit', 'dec138'),
    matrix: any('matrixRow'),
    keypad: any('keyOut', 'keyIn'),
    stepper: any('stepper'),
    spi: any('spi', 'adcCs', 'dacCs', 'dacLd'),
    i2c: any('sda', 'scl'),
  };
  cfg.digitMode = (cfg.dec138 || []).some(Boolean) ? '138' : 'direct';
  return cfg;
}

const MAIN_FIXED = {
  'P1.0': 'LED DS1', 'P1.1': 'LED DS2', 'P1.2': 'LED DS3', 'P1.3': 'LED DS4',
  'P1.4': 'LED DS5', 'P1.5': 'LED DS6', 'P1.6': 'LED DS7', 'P1.7': 'LED DS8',
  'P0.0': 'SW1-1 / LCM D0', 'P0.1': 'SW1-2 / LCM D1', 'P0.2': 'SW1-3 / LCM D2', 'P0.3': 'SW1-4 / LCM D3',
  'P0.4': 'SW1-5 / LCM D4', 'P0.5': 'SW1-6 / LCM D5', 'P0.6': 'SW1-7 / LCM D6', 'P0.7': 'SW1-8 / LCM D7',
  'P2.0': '按鍵 PB3', 'P2.1': '按鍵 PB4',
  'P3.0': 'LCM EN / RXD', 'P3.1': 'LCM R/W / TXD', 'P3.2': 'LCM RS / PB1 / INT0', 'P3.3': 'PB2 / INT1',
  'P3.4': 'T0', 'P3.5': 'T1', 'P3.7': '蜂鳴器',
};
const NON_IO = {
  VCC: '電源 +5V。', GND: '接地。', 'GND ': '接地。', '+5V': '電源 +5V。', '12V': '馬達電源 12V。', '5V': '馬達電源 5V。',
  RST: '重置腳。', X1: '石英振盪腳。', X2: '石英振盪腳。',
  EA: '接 VCC = 用晶片內部的程式記憶體。', ALE: '接外部記憶體才用得到。',
  PSEN: '接外部記憶體才用得到。', WP: 'EEPROM 防寫。', VSS: '接地。', VDD: '電源。', VO: 'LCM 對比。',
  RS: 'LCM 暫存器選擇，板上焊到 P3.2。', 'R/W': 'LCM 讀寫選擇，板上焊到 P3.1。', EN: 'LCM 致能，板上焊到 P3.0。',
  D0: 'LCM 資料線，板上焊到 P0.0。', D1: 'LCM 資料線，板上焊到 P0.1。', D2: 'LCM 資料線，板上焊到 P0.2。',
  D3: 'LCM 資料線，板上焊到 P0.3。', D4: 'LCM 資料線，板上焊到 P0.4。', D5: 'LCM 資料線，板上焊到 P0.5。',
  D6: 'LCM 資料線，板上焊到 P0.6。', D7: 'LCM 資料線，板上焊到 P0.7。',
  A: 'LCM 背光 +。', K: 'LCM 背光 −。', G: 'RGB LED 綠。', B: 'RGB LED 藍。', '中': 'LCM 型式選擇腳。',
  CH0: 'MCP4822 A 通道類比輸出。', CH1: 'LM35 輸出 / MCP4822 B 通道。',
  '棕': '馬達線圈共同端。', '紅': '馬達 A 相。', '黃': '馬達 B 相。', '白': '馬達 Ā 相。', '藍': '馬達 B̄ 相。',
};

export class BoardView {
  constructor(container, sim, runner) {
    this.sim = sim; this.runner = runner;
    container.style.position = 'relative';
    this.container = container;
    this.svg = el('svg', { viewBox: `0 0 ${P(892)} ${P(424)}`, xmlns: NS });
    container.appendChild(this.svg);
    this.tip = document.createElement('div');
    this.tip.className = 'board-tip'; this.tip.hidden = true;
    container.appendChild(this.tip);

    this.portPins = {};   // 'P1.3' → [{x,y,dot}]
    this.devEls = {};     // 'seg.0' → [{x,y,dot}]
    this.railEls = {};    // 'gnd' | 'vcc' → [{dot}]
    this.ctrlEls = {};    // 'RST' | 'EA'  → [{dot}]
    this.jmpEls = {};     // 'jp11'        → [{dot}]
    this.sel = null;

    this._defs();
    this._buildMain();
    this._buildKdm();
    this._buildMotor();
    for (const spec of HEADERS) this._header(spec);
    this.wireLayer = el('g', { 'pointer-events': 'none' }, this.svg);
    this.hintTxt = txt(this.svg, P(560), P(412), '', { 'font-size': 18, fill: '#9ad', 'text-anchor': 'middle' });

    this.sim.wiring.onChange(() => this._applyWiring());
    this._applyWiring();
    this.svg.addEventListener('click', (e) => { if (e.target === this.svg) this._cancel(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._cancel(); });
  }

  _defs() {
    const defs = el('defs', {}, this.svg);
    const grad = (id, from, to) => {
      const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': from }, g);
      el('stop', { offset: '100%', 'stop-color': to }, g);
      return g;
    };
    grad('pcb', '#9E1E28', '#82101A');        // 主板鋪銅紅
    grad('pcbKdm', '#981420', '#7C0912');     // KDM+ 稍深一點
    grad('socket', '#00A80C', '#005E08');     // IC 座綠
    grad('ic', '#5A5A5A', '#3C3C3C');         // 塑封 IC
    grad('metal', '#DCDCDC', '#8E8E8E');      // 螺絲、馬達外殼
    grad('brass', '#E0BE55', '#8A6B18');      // 馬達轉子
    const sh = el('filter', { id: 'comp', x: '-30%', y: '-30%', width: '170%', height: '180%' }, defs);
    el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2, 'flood-color': '#2A0308', 'flood-opacity': .55 }, sh);
    const bsh = el('filter', { id: 'boardsh', x: '-8%', y: '-8%', width: '118%', height: '122%' }, defs);
    el('feDropShadow', { dx: 0, dy: 5, stdDeviation: 7, 'flood-color': '#000', 'flood-opacity': .5 }, bsh);
    const g2 = el('radialGradient', { id: 'ledglow' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': .95 }, g2);
    el('stop', { offset: '100%', 'stop-color': '#fff', 'stop-opacity': 0 }, g2);
  }
  _tip(node, title, body) {
    node.addEventListener('mouseenter', () => { this.tip.innerHTML = `<b>${title}</b>${body ? '<br>' + body : ''}`; this.tip.hidden = false; });
    node.addEventListener('mousemove', (e) => {
      const r = this.container.getBoundingClientRect();
      this.tip.style.left = Math.min(e.clientX - r.left + 14, r.width - this.tip.offsetWidth - 8) + 'px';
      this.tip.style.top = (e.clientY - r.top + 18) + 'px';
    });
    node.addEventListener('mouseleave', () => { this.tip.hidden = true; });
  }
  // 絲印外框（白色細線），位置沿用元件本身量好的座標
  _silk(g, x, y, w, h, r = 2) {
    el('rect', { x: P(x), y: P(y), width: P(w), height: P(h), rx: r,
      fill: 'none', stroke: SILK, 'stroke-width': 1, opacity: .34 }, g);
  }
  _screw(g, x, y) {
    el('circle', { cx: P(x), cy: P(y), r: P(8.5), fill: 'url(#metal)', stroke: '#6E6E6E', 'stroke-width': 1.5 }, g);
    el('circle', { cx: P(x), cy: P(y), r: P(4.5), fill: '#6A6A6A' }, g);
    el('circle', { cx: P(x) - P(2), cy: P(y) - P(2), r: P(1.6), fill: '#F2F2F2', opacity: .55 }, g);
  }
  _chip(g, x, y, w, h, label, help, vertical) {
    const c = el('g', {}, g);
    el('rect', { x: P(x), y: P(y), width: P(w), height: P(h), rx: 2, fill: 'url(#ic)', stroke: '#0A0A0A', filter: 'url(#comp)' }, c);
    const n = Math.max(2, Math.round((vertical ? h : w) / 9));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      if (vertical) {
        el('rect', { x: P(x) - 4, y: P(y + 3 + t * (h - 6)), width: 4, height: 3, fill: '#CFCFCF' }, c);
        el('rect', { x: P(x + w), y: P(y + 3 + t * (h - 6)), width: 4, height: 3, fill: '#CFCFCF' }, c);
      } else {
        el('rect', { x: P(x + 3 + t * (w - 6)), y: P(y) - 4, width: 3, height: 4, fill: '#CFCFCF' }, c);
        el('rect', { x: P(x + 3 + t * (w - 6)), y: P(y + h), width: 3, height: 4, fill: '#CFCFCF' }, c);
      }
    }
    if (label) txt(c, P(x + w / 2), P(y + h / 2 + 1.8), label, { 'font-size': 12, fill: '#D2D2D2', 'text-anchor': 'middle' });
    if (help) this._tip(c, label, help);
    return c;
  }

  // ---------------- 通用排針 ----------------
  _header(spec) {
    const g = el('g', {}, this.svg);
    const { cols = 1, pitch, horiz, colGap = 9, labelSide = 'below' } = spec;
    const rows = cols === 2 ? spec.pins.length / 2 : spec.pins.length;
    const w = horiz ? (rows - 1) * pitch + 7 : (cols - 1) * colGap + 7;
    const h = horiz ? 7 : (rows - 1) * pitch + 7;
    el('rect', { x: P(spec.x - 3.5), y: P(spec.y - 3.5), width: P(w), height: P(h), rx: 2, fill: C.black, stroke: '#000', filter: 'url(#comp)' }, g);
    const tAt = spec.titleAt ||
      [spec.x - 3.5, horiz ? (labelSide === 'above' ? spec.y - 15 : spec.y + 21) : spec.y - 9];
    txt(g, P(tAt[0]), P(tAt[1]), spec.title, { 'font-size': 13, opacity: .95 });

    spec.pins.forEach((pin, i) => {
      const [name, sig] = pin;
      const r = cols === 2 ? Math.floor(i / 2) : i, c = cols === 2 ? i % 2 : 0;
      const px = P(horiz ? spec.x + r * pitch : spec.x + c * colGap);
      const py = P(horiz ? spec.y : spec.y + r * pitch);
      const kind = sig && sig.includes(':') ? sig.slice(0, sig.indexOf(':')) : (sig && isPort(sig) ? 'port' : 'none');
      const val = sig && sig.includes(':') ? sig.slice(sig.indexOf(':') + 1) : sig;
      const dev = kind === 'dev' ? val : null;
      const port = kind === 'port' ? sig : null;
      const rail = kind === 'rail' ? val : null;       // 'gnd' | 'vcc'
      const ctrl = kind === 'ctrl' ? val : null;       // 'RST' | 'EA'
      const jmp = kind === 'jumper' ? val : null;
      const on = !!(dev || port);
      const clickable = on || rail || ctrl || jmp;
      const base = clickable ? GOLD : '#A6A6A6';
      const grp = el('g', clickable ? { class: 'clickable' } : {}, g);
      el('rect', { x: px - P(4), y: py - P(4), width: P(8), height: P(8), fill: 'transparent' }, grp);
      const dot = el('rect', { x: px - 3.4, y: py - 3.4, width: 6.8, height: 6.8, rx: 1.2, fill: base, stroke: on ? '#8A6412' : '#606060' }, grp);
      dot._base = base;
      let lx = px, ly = py, anchor = 'middle';
      if (horiz) ly = labelSide === 'above' ? py - P(5.5) : py + P(9);
      else if (labelSide === 'left') { lx = px - P(5.5); ly = py + 3; anchor = 'end'; }
      else if (labelSide === 'split') { if (c === 0) { lx = px - P(5.5); anchor = 'end'; } else { lx = px + P(5.5); anchor = 'start'; } ly = py + 3; }
      else { lx = px + P(5.5); ly = py + 3; anchor = 'start'; }
      const dupCol = cols === 2 && ((labelSide === 'right' && c === 0) || (labelSide === 'left' && c === 1));
      if (name && !spec.bare && !dupCol) txt(grp, lx, ly, name, { 'font-size': spec.labelSize || 11, 'text-anchor': anchor, fill: on || clickable ? SILK : '#8d8d93' });
      if (dev) {
        grp.addEventListener('click', (e) => { e.stopPropagation(); this._devClicked(dev); });
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`, spec.note || '');
        (this.devEls[dev] = this.devEls[dev] || []).push({ x: px, y: py, dot });
      } else if (port) {
        grp.addEventListener('click', (e) => { e.stopPropagation(); this._portClicked(port); });
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          MAIN_FIXED[port] ? `板上已焊：<b>${MAIN_FIXED[port]}</b>` : '');
        (this.portPins[port] = this.portPins[port] || []).push({ x: px, y: py, dot });
      } else if (rail) {
        grp.addEventListener('click', (e) => { e.stopPropagation(); this._railClicked(rail); });
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          rail === 'gnd' ? '點它再點任一支埠腳，那支腳就被<b>拉到 0</b>。'
                         : '點它再點任一支埠腳，那支腳就被<b>拉到 1</b>。<br>⚠ 程式對它寫 0 = 短路。');
        (this.railEls[rail] = this.railEls[rail] || []).push({ dot });
      } else if (ctrl) {
        grp.addEventListener('click', (e) => { e.stopPropagation(); this._ctrlClicked(ctrl); });
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          ctrl === 'RST' ? '接 <b>VCC</b> = 一直被按住重置，程式不會跑。'
                         : '接 <b>GND</b> = 改讀外部 ROM，這塊板子沒有。');
        (this.ctrlEls[ctrl] = this.ctrlEls[ctrl] || []).push({ dot });
      } else if (jmp) {
        grp.addEventListener('click', (e) => { e.stopPropagation(); this._jumperClicked(jmp); });
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          '短接 = LM35 送進 ADC 的 <b>CH1</b>，拔掉 CH1 讀到 0V。點一下切換。');
        (this.jmpEls[jmp] = this.jmpEls[jmp] || []).push({ x: px, y: py, dot });
      } else if (kind === 'out') {
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          val === 'adcCh1' ? 'ADC 的 CH1 輸入，電壓看「類比與環境」面板。'
            : `DAC 的 ${val === 'dacA' ? 'CHA' : 'CHB'} 輸出，電壓看「類比與環境」面板。`);
      } else if (kind === 'fixed') {
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          '馬達出廠就插好，不用接。要接的是 JP7 的 B2 B1 A2 A1。');
      } else {
        this._tip(grp, `${spec.id} 第 ${i + 1} 腳 — ${name}`,
          kind === 'na' ? `模擬不了：${val}` : (NON_IO[name] || ''));
      }
    });
    return g;
  }

  // ==================== 主板 ====================
  _buildMain() {
    const g = el('g', {}, this.svg);
    el('path', {
      d: `M ${P(28)} ${P(58)} L ${P(322)} ${P(58)} L ${P(322)} ${P(102)} L ${P(345)} ${P(102)}
          L ${P(345)} ${P(130)} L ${P(402)} ${P(152)} L ${P(428)} ${P(163)} L ${P(430)} ${P(175)}
          L ${P(430)} ${P(385)} Q ${P(430)} ${P(393)} ${P(422)} ${P(393)}
          L ${P(28)} ${P(393)} Q ${P(20)} ${P(393)} ${P(20)} ${P(385)}
          L ${P(20)} ${P(66)} Q ${P(20)} ${P(58)} ${P(28)} ${P(58)} Z`, fill: 'url(#pcb)',
      stroke: C.edge, 'stroke-width': 1.2, filter: 'url(#boardsh)',
    }, g);
    this._screw(g, 33, 70); this._screw(g, 297, 70); this._screw(g, 33, 372); this._screw(g, 297, 372);
    this._silk(g, 143, 107, 92, 258, 3);      // U2 IC 座
    this._silk(g, 200, 59, 88, 46);            // SW1 指撥
    this._silk(g, 44, 272, 56, 56, 28);        // B1 蜂鳴器
    this._silk(g, 45, 345, 108, 42, 2);        // RP2 + DS1–DS8
    this._silk(g, 74, 224, 30, 30, 2);         // RESET
    txt(g, P(25), P(96), 'KT89S51', { 'font-size': 18, 'font-weight': 'bold' });
    txt(g, P(25), P(108), 'V4.2', { 'font-size': 15 });

    el('ellipse', { cx: P(136), cy: P(325), rx: P(7), ry: P(19), fill: '#c0c0c0', stroke: '#888' }, g);
    txt(g, P(146), P(312), '12MHz', { 'font-size': 11 });

    const rst = el('g', { class: 'clickable' }, g);
    el('rect', { x: P(78), y: P(228), width: P(22), height: P(22), rx: 3, fill: '#1d1d1d', stroke: '#444' }, rst);
    el('circle', { cx: P(89), cy: P(239), r: P(7), fill: '#c0392b', stroke: '#7b241c', 'stroke-width': 1.5 }, rst);
    txt(g, P(72), P(260), 'RESET', { 'font-size': 12 });
    rst.addEventListener('click', () => this.runner.reset());
    this._tip(rst, 'RESET 鈕', '按下 = 從位址 0 重新執行。');

    const bz = el('g', {}, g);
    el('circle', { cx: P(72), cy: P(300), r: P(25), fill: C.buzzerRim, stroke: '#0A0D18', 'stroke-width': 2, filter: 'url(#comp)' }, bz);
    el('circle', { cx: P(72), cy: P(300), r: P(18), fill: C.buzzerFace }, bz);
    el('circle', { cx: P(72), cy: P(300), r: P(4.5), fill: '#0a0c16' }, bz);
    this.buzzRing = el('circle', { cx: P(72), cy: P(300), r: P(29), fill: 'none', stroke: '#ffd166', 'stroke-width': 2.5, opacity: 0 }, bz);
    txt(g, P(96), P(276), 'B1 蜂鳴器 P3.7', { 'font-size': 12 });
    this.buzzFreq = txt(g, P(96), P(286), '', { 'font-size': 12, fill: '#ffd166' });
    this._tip(bz, '蜂鳴器 B1 — P3.7', '寫 <b>0</b> 響。要有聲音就得讓 P3.7 反覆翻轉。');

    const zif = el('g', {}, g);
    el('rect', { x: P(146), y: P(110), width: P(86), height: P(252), rx: 4, fill: 'url(#socket)', stroke: C.socketDark, 'stroke-width': 2, filter: 'url(#comp)' }, zif);
    el('rect', { x: P(164), y: P(126), width: P(58), height: P(224), rx: 2, fill: 'url(#ic)', stroke: '#2A2A2A' }, zif);
    for (let i = 0; i < 20; i++) {
      el('rect', { x: P(157), y: P(131 + i * 11.2), width: P(8), height: P(5), rx: 1, fill: '#D8D8D8' }, zif);
      el('rect', { x: P(221), y: P(131 + i * 11.2), width: P(8), height: P(5), rx: 1, fill: '#D8D8D8' }, zif);
    }
    txt(zif, P(172), P(121), 'LTC', { 'font-size': 15, fill: '#CFF7D8', 'font-style': 'italic' });
    el('circle', { cx: P(206), cy: P(118), r: P(4), fill: '#cfcfcf' }, zif);
    el('circle', { cx: P(189), cy: P(356), r: P(4), fill: '#cfcfcf' }, zif);
    txt(zif, P(193), P(232), 'Atmel', { 'font-size': 15, fill: '#D8D8D8', 'text-anchor': 'middle' });
    txt(zif, P(193), P(246), '89S51', { 'font-size': 18, fill: '#eee', 'text-anchor': 'middle', 'font-weight': 'bold' });
    this._tip(zif, 'AT89S51', '12MHz → 1 個機械週期 = 1 µs。<br>程式 4K、RAM 128 位元組。');

    // SW1 指撥開關
    this.dip = [];
    el('rect', { x: P(203), y: P(62), width: P(82), height: P(40), rx: 2, fill: '#1e5fbf', stroke: '#123a78', 'stroke-width': 1.5 }, g);
    txt(g, P(206), P(72), 'ON', { 'font-size': 12, fill: '#e8eeff' });
    for (let i = 0; i < 8; i++) {
      const x = 209 + i * 9.4;
      el('rect', { x: P(x), y: P(73), width: P(7), height: P(21), rx: 1, fill: '#123a78' }, g);
      const knob = el('rect', { x: P(x + 0.8), y: P(84), width: P(5.4), height: P(9), rx: 1, fill: '#f4f4f4' }, g);
      txt(g, P(x + 3.5), P(101), `${i + 1}`, { 'font-size': 11, fill: '#dbe4ff', 'text-anchor': 'middle' });
      const hit = el('rect', { x: P(x), y: P(73), width: P(7), height: P(21), fill: 'transparent', class: 'clickable' }, g);
      hit.addEventListener('click', () => this.sim.dip.toggle(i));
      this._tip(hit, `指撥開關 SW1-${i + 1} — P0.${i}`, 'ON 讀到 <b>0</b>，OFF 讀到 <b>1</b>。<br>⚠ 插著 LCM 時要全部撥 OFF。');
      this.dip.push({ knob, on: P(74), off: P(84) });
    }
    txt(g, P(290), P(96), 'SW1', { 'font-size': 12 });
    txt(g, P(184), P(69), 'PORT0', { 'font-size': 12 });
    txt(g, P(184), P(78), 'P0.0', { 'font-size': 12 });
    el('rect', { x: P(203), y: P(104), width: P(84), height: P(9), rx: 1.5, fill: '#141414' }, g);
    txt(g, P(245), P(122), '10K  RP1', { 'font-size': 12, 'text-anchor': 'middle' });

    // 類比區
    this._chip(g, 340, 262, 46, 34, 'MCP3202', 'A/D：CH0 讀 VR1、CH1 讀 LM35。');
    this._chip(g, 344, 306, 42, 34, 'MCP4822', 'D/A：兩路類比輸出。');
    this._chip(g, 348, 161, 37, 24, '24LC16B', 'I²C EEPROM。');
    const tc74 = el('g', {}, g);
    el('rect', { x: P(407), y: P(172), width: P(25), height: P(43), rx: 2, fill: '#4a4a52', stroke: '#2a2a30' }, tc74);
    txt(g, P(396), P(166), 'U3 TC74', { 'font-size': 12 });
    this._tip(tc74, 'U3 TC74 數位溫度計', 'I²C 位址 1001000。要先把 JP1 的 SDA / SCL 拉到埠。');

    const vr1 = el('g', { class: 'clickable' }, g);
    el('rect', { x: P(376), y: P(258), width: P(27), height: P(38), rx: 2, fill: '#2ec4c4', stroke: '#1a8a8a', 'stroke-width': 1.5 }, vr1);
    el('circle', { cx: P(389.5), cy: P(269), r: P(8), fill: '#d9b23a', stroke: '#8a6a20' }, vr1);
    this.vrKnob = el('rect', { x: P(388.9), y: P(262), width: P(1.2), height: P(7), fill: '#5a4510' }, vr1);
    txt(g, P(376), P(304), 'VR1 20K', { 'font-size': 11 });
    this._tip(vr1, 'VR1 20K 可變電阻', '接到 ADC 的 <b>CH0</b>，用「類比與環境」的滑桿調。');

    const lm35 = el('g', {}, g);
    el('circle', { cx: P(412), cy: P(236), r: P(9), fill: '#141414', stroke: '#000' }, lm35);
    txt(g, P(374), P(234), 'U6 LM35', { 'font-size': 12 });
    this._tip(lm35, 'U6 LM35 溫度感測器', '10mV/°C，經 JP11 送進 ADC 的 CH1。');

    // LCM 模組（插在 JP2 上）
    this.lcmGroup = el('g', {}, g);
    el('rect', { x: P(20), y: P(2), width: P(112), height: P(56), rx: 3, fill: '#0d3b1e', stroke: '#052a12', 'stroke-width': 1.5 }, this.lcmGroup);
    const fo = el('foreignObject', { x: P(24), y: P(6), width: P(104), height: P(48) }, this.lcmGroup);
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 588; this.lcdCanvas.height = 276;
    this.lcdCanvas.style.width = P(104) + 'px'; this.lcdCanvas.style.height = P(48) + 'px';
    fo.appendChild(this.lcdCanvas);
    this.lcmHit = el('rect', { x: P(20), y: P(2), width: P(112), height: P(56), rx: 3, fill: 'transparent', class: 'clickable' }, g);
    const toggleLcm = () => { this.sim.lcd.setAttached(!this.sim.lcd.attached); if (this.onLcmToggle) this.onLcmToggle(this.sim.lcd.attached); this.update(); };
    this.lcmHit.addEventListener('click', toggleLcm);
    this._tip(this.lcmHit, 'LCM 16×2 字元液晶', '接法焊死：RS=P3.2、R/W=P3.1、EN=P3.0、D0–D7=P0。<br>點一下拔除。');

    // 沒插 LCM 時，在它該在的位置畫一個空插槽，點一下就插上
    this.lcmSlot = el('g', { class: 'clickable' }, g);
    el('rect', { x: P(20), y: P(2), width: P(112), height: P(56), rx: 3, fill: 'rgba(255,255,255,.04)',
      stroke: '#6E7783', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, this.lcmSlot);
    txt(this.lcmSlot, P(76), P(30), 'LCM 16×2', { 'font-size': 13, fill: '#8B95A2', 'text-anchor': 'middle' });
    txt(this.lcmSlot, P(76), P(44), '點一下插到 JP2', { 'font-size': 11, fill: '#6E7783', 'text-anchor': 'middle' });
    this.lcmSlot.addEventListener('click', toggleLcm);
    this._tip(this.lcmSlot, 'LCM 16×2 字元液晶（未插上）',
      '點一下插到 JP2。<br>⚠ 插上後 P0 被佔用，SW1 要全部撥 OFF。');

    // 八顆 LED
    this.leds = [];
    el('rect', { x: P(48), y: P(348), width: P(102), height: P(11), rx: 1.5, fill: '#141414' }, g);
    txt(g, P(25), P(353), 'RP2', { 'font-size': 11 });
    txt(g, P(25), P(361), '33', { 'font-size': 11 });
    for (let i = 0; i < 8; i++) {
      const cx = P(57 + i * 16.5), cy = P(368);
      const grp = el('g', {}, g);
      el('circle', { cx, cy, r: P(7), fill: '#5A5410' }, grp);
      const halo = el('circle', { cx, cy, r: P(13), fill: 'url(#ledglow)', opacity: 0 }, grp);
      const led = el('circle', { cx, cy, r: P(5.4), fill: '#C6C42A', stroke: '#7E7C18' }, grp);
      txt(g, cx, P(383), `DS${i + 1}`, { 'font-size': 12, 'text-anchor': 'middle' });
      this._tip(grp, `LED DS${i + 1} — P1.${i}`, '寫 <b>0</b> 才亮。');
      this.leds.push({ led, halo });
    }
    txt(g, P(48), P(393), 'P1.0', { 'font-size': 12 });
    txt(g, P(158), P(393), 'P1.7', { 'font-size': 12 });
    txt(g, P(96), P(344), 'PORT 1', { 'font-size': 12 });

    // 四顆按鍵
    this.buttons = [];
    const bx = [188, 238, 278, 318];
    const bhelp = ['⚠ 與 LCM 的 RS 共用 P3.2。', '', '', ''];
    for (let i = 0; i < 4; i++) {
      const x = bx[i], y = 366;
      const b = el('g', { class: 'clickable' }, g);
      el('rect', { x: P(x), y: P(y), width: P(24), height: P(24), rx: 3, fill: '#1d1d1d', stroke: '#444' }, b);
      const cap = el('circle', { cx: P(x + 12), cy: P(y + 12), r: P(7.5), fill: '#5e5e5e', stroke: '#2b2b2b', 'stroke-width': 1.5 }, b);
      txt(g, P(x + 12), P(397), `${BUTTONS[i].name} ${BUTTONS[i].sub}`,
        { 'font-size': 12, fill: '#ffd0d4', 'text-anchor': 'middle' });
      const press = (v) => this.sim.buttons.press(i, v);
      b.addEventListener('mousedown', () => press(1)); b.addEventListener('mouseup', () => press(0)); b.addEventListener('mouseleave', () => press(0));
      b.addEventListener('touchstart', (e) => { e.preventDefault(); press(1); }, { passive: false });
      b.addEventListener('touchend', () => press(0));
      this._tip(b, `按鍵 ${BUTTONS[i].name} — ${BUTTONS[i].sub}`, `按住讀 <b>0</b>，放開讀 <b>1</b>。${bhelp[i] ? '<br>' + bhelp[i] : ''}`);
      this.buttons.push(cap);
    }
  }

  // ==================== KDM+ ====================
  _buildKdm() {
    const g = el('g', {}, this.svg);
    el('rect', { x: P(466), y: P(53), width: P(421), height: P(341), rx: 8, fill: 'url(#pcbKdm)', stroke: C.edge, 'stroke-width': 1.2, filter: 'url(#boardsh)' }, g);
    this._screw(g, 477, 64); this._screw(g, 868, 63); this._screw(g, 479, 382); this._screw(g, 866, 380);
    txt(g, P(615), P(146), '七節顯示器', { 'font-size': 15, opacity: .9 });
    this.kdmHint = txt(g, P(470), P(57), '', { 'font-size': 15, fill: '#ffd166' });
    txt(g, P(760), P(60), 'KDM+ 擴充板', { 'font-size': 15 });

    this._silk(g, 482, 60, 193, 76, 3);        // DS2
    this._silk(g, 671, 60, 194, 76, 3);        // DS1
    this._silk(g, 760, 138, 128, 125, 3);      // DS3 點矩陣
    this._silk(g, 676, 258, 172, 139, 3);      // 鍵盤組
    this._silk(g, 541, 232, 84, 38, 2);        // U2 74LS138
    this._silk(g, 553, 307, 76, 33, 2);        // U4 ULN2803A

    // 七段兩組共八位
    this.segs = [];
    for (const [x0, w] of [[485, 187], [674, 188]]) el('rect', { x: P(x0), y: P(63), width: P(w), height: P(70), rx: 3, fill: '#121210', stroke: '#35342E', filter: 'url(#comp)' }, g);
    txt(g, P(472), P(137), 'DS2', { 'font-size': 12 });
    txt(g, P(674), P(140), 'DS1', { 'font-size': 12 });
    for (let d = 0; d < 8; d++) {
      const ox = P(d < 4 ? 492 + d * 45 : 681 + (d - 4) * 45), oy = P(70);
      const s = [];
      const H = (x, y) => el('rect', { x: ox + P(x), y: oy + P(y), width: P(22), height: P(4.5), rx: 2 }, g);
      const V = (x, y) => el('rect', { x: ox + P(x), y: oy + P(y), width: P(4.5), height: P(22), rx: 2 }, g);
      s.push(H(5, 1), V(26, 4), V(26, 28), H(5, 51), V(1, 28), V(1, 4), H(5, 26),
        el('circle', { cx: ox + P(35), cy: oy + P(53), r: P(2.4) }, g));
      for (const e of s) e.setAttribute('fill', C.segOff);
      this.segs.push(s);
    }
    const segHit = el('rect', { x: P(485), y: P(63), width: P(377), height: P(70), fill: 'transparent' }, g);
    this._tip(segHit, '八位數七段顯示器（共陽極）', '位選拉低選中該位，段線寫 <b>0</b> 該段亮。<br>八位要輪流掃描，掃太慢會閃。');

    // 電晶體、排阻
    for (let i = 0; i < 8; i++)
      el('ellipse', { cx: P(570 + i * 25.4), cy: P(160), rx: P(9), ry: P(11), fill: '#232323', stroke: '#0C0C0C', filter: 'url(#comp)' }, g);
    txt(g, P(560), P(180), '位選電晶體 ×8', { 'font-size': 12 });

    this._chip(g, 545, 236, 76, 30, 'SN74LS138N', '三支腳解出八條位選線。');
    this._chip(g, 557, 311, 68, 25, 'ULN2803A', '把埠腳的電流放大到推得動馬達。');
    el('rect', { x: P(578), y: P(346), width: P(47), height: P(9), rx: 1.5, fill: '#141414' }, g);

    // 電源區

    txt(g, P(628), P(364), 'JP7', { 'font-size': 13 });
    txt(g, P(470), P(300), '步進馬達', { 'font-size': 15 });
    txt(g, P(466), P(364), 'JP1 POWER 電源排針', { 'font-size': 12 });
    txt(g, P(573), P(272), 'CN3', { 'font-size': 12 });
    txt(g, P(521), P(324), 'JP2', { 'font-size': 12 });

    // 8×8 點矩陣
    this.dots = [];
    el('rect', { x: P(763), y: P(141), width: P(122), height: P(119), rx: 3, fill: C.matrixBody, stroke: '#4A4A46', filter: 'url(#comp)' }, g);
    for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++)
      this.dots.push(el('circle', { cx: P(771 + c * 15.4), cy: P(149 + r * 15.4), r: P(5.6), fill: C.matrixOff }, g));
    txt(g, P(846), P(138), 'DS3', { 'font-size': 12 });
    const mHit = el('rect', { x: P(763), y: P(141), width: P(122), height: P(119), fill: 'transparent' }, g);
    this._tip(mHit, '8×8 LED 點矩陣 DS3', '行選線與七段的位選線 <b>共用</b>，一樣要輪流掃描。');

    // 4×4 鍵盤
    this.keys = [];
    const kx = [682, 724, 765, 806], ky = [262, 297, 332, 367];
    const face = ['0', '4', '8', 'C', '1', '5', '9', 'D', '2', '6', 'A', 'E', '3', '7', 'B', 'F'];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const n = col * 4 + row, x = kx[col], y = ky[row];
      const k = el('g', { class: 'clickable' }, g);
      el('rect', { x: P(x), y: P(y), width: P(30), height: P(24), rx: 3, fill: C.keyBody, stroke: C.keyEdge, filter: 'url(#comp)' }, k);
      const cap = el('ellipse', { cx: P(x + 15), cy: P(y + 12), rx: P(8), ry: P(6.5), fill: C.keyCap }, k);
      txt(g, P(x - 1), P(y - 3), `PB${n}`, { 'font-size': 12 });
      txt(g, P(x + 34), P(y + 16), face[row * 4 + col], { 'font-size': 18, 'font-weight': 'bold' });
      const press = (v) => this.sim.keypad.press(n, v);
      k.addEventListener('mousedown', () => press(1)); k.addEventListener('mouseup', () => press(0)); k.addEventListener('mouseleave', () => press(0));
      k.addEventListener('touchstart', (e) => { e.preventDefault(); press(1); }, { passive: false });
      k.addEventListener('touchend', () => press(0));
      this._tip(k, `按鍵 PB${n}（面板印 ${face[row * 4 + col]}）`, `按下 → R${row} 與 C${col} 短路。`);
      this.keys.push(cap);
    }
    txt(g, P(840), P(364), '鍵盤組', { 'font-size': 15 });
    el('rect', { x: P(657), y: P(257), width: P(9), height: P(48), rx: 1.5, fill: '#141414' }, g);
  }

  // 步進馬達
  _buildMotor() {
    const g = el('g', {}, this.svg);
    const mx = P(403), my = P(74);
    el('circle', { cx: mx, cy: my, r: P(62), fill: 'url(#metal)', stroke: '#5E5E5E', 'stroke-width': 2, filter: 'url(#boardsh)' }, g);
    el('circle', { cx: mx, cy: my, r: P(50), fill: '#A6A6A6', stroke: '#8A8A8A' }, g);
    el('circle', { cx: mx, cy: my, r: P(56), fill: 'none', stroke: '#F0F0F0', 'stroke-width': 1.5, opacity: .5 }, g);
    this.rotor = el('g', {}, g);
    for (let i = 0; i < 16; i++) el('rect', { x: mx - P(3), y: my - P(30), width: P(6), height: P(11), rx: 1, fill: 'url(#brass)', transform: `rotate(${i * 22.5} ${mx} ${my})` }, this.rotor);
    el('circle', { cx: mx, cy: my, r: P(17), fill: 'url(#brass)', stroke: '#6D5A1C', 'stroke-width': 2 }, this.rotor);
    el('circle', { cx: mx, cy: my, r: P(7), fill: '#DADADA', stroke: '#9A9A9A' }, this.rotor);
    el('rect', { x: mx - P(2), y: my - P(29), width: P(4), height: P(13), rx: 1.5, fill: '#e74c3c' }, this.rotor);
    this._tip(g, '步進馬達', '全步 1.8°，一圈 200 步。<br>要接的是 JP7 的 B2 B1 A2 A1，依序通電就轉。');
    this.coilDots = [];
    for (let i = 0; i < 4; i++) {
      const d = el('circle', { cx: P(352 + i * 26), cy: P(146), r: P(4.5), fill: '#333', stroke: '#555' }, g);
      txt(g, P(346 + i * 26), P(159), ['A1', 'B1', 'A2', 'B2'][i], { 'font-size': 12 });
      this.coilDots.push(d);
    }
    const plate = el('g', {}, this.svg);
    el('rect', { x: P(146), y: P(26), width: P(158), height: P(20), rx: 2,
      fill: 'rgba(0,0,0,.32)', stroke: '#454A52', 'stroke-width': 1 }, plate);
    txt(plate, P(152), P(39), '步進馬達', { 'font-size': 11, fill: '#7E8894' });
    this.motorText = txt(plate, P(192), P(39), '', { 'font-size': 12, fill: '#D9C48A' });

  }

  // ==================== 接線 ====================
  _devClicked(id) {
    const cfg = JSON.parse(JSON.stringify(this.sim.wiring.cfg));
    if (this.sel && this.sel.kind === 'dev' && this.sel.id === id) return this._cancel();
    if (this.sel && this.sel.kind === 'port') { setPin(cfg, id, this.sel.id); this._commit(cfg); this.sel = null; this._hint(''); return; }
    if (getPin(cfg, id)) { setPin(cfg, id, null); this._commit(cfg); this.sel = null; this._hint(`已拆除 ${id} 的線`); return; }
    this.sel = { kind: 'dev', id };
    this._hint(`已抓住「${id}」— 再點主板 JP3 上的任一支腳接上（Esc 取消）`);
    this._applyWiring();
  }
  _railClicked(rail) {
    if (this.sel && this.sel.kind === 'rail' && this.sel.id === rail) return this._cancel();
    this.sel = { kind: 'rail', id: rail };
    this._hint(`已抓住「${rail === 'gnd' ? 'GND' : 'VCC'}」— 再點任何一支埠腳（或 RST / EA）就跳一條線過去（Esc 取消）`);
    this._applyWiring();
  }
  _ctrlClicked(name) {
    const cfg = JSON.parse(JSON.stringify(this.sim.wiring.cfg));
    cfg.ties = { ...(cfg.ties || {}) };
    if (this.sel && this.sel.kind === 'rail') {
      const r = this.sel.id;
      cfg.ties[name] = r; this._commit(cfg); this.sel = null;
      this._hint(`${name} 已用跳線接到 ${r === 'gnd' ? 'GND' : 'VCC'}`); return;
    }
    if (cfg.ties[name]) { delete cfg.ties[name]; this._commit(cfg); this._hint(`已拆掉 ${name} 上的跳線`); return; }
    this._hint(`${name} 不是埠腳，只能接電源軌 — 先點一支 VCC 或 GND 腳`);
  }
  _jumperClicked(id) {
    const cfg = JSON.parse(JSON.stringify(this.sim.wiring.cfg));
    cfg[id] = !cfg[id];
    this._commit(cfg);
    this._hint(cfg[id] ? 'JP11 跳線帽已裝上：LM35 → ADC CH1' : 'JP11 跳線帽已拔掉：ADC CH1 浮接（讀 0V）');
  }
  _portClicked(name) {
    const cfg = JSON.parse(JSON.stringify(this.sim.wiring.cfg));
    cfg.ties = { ...(cfg.ties || {}) };
    if (this.sel && this.sel.kind === 'rail') {
      cfg.ties[name] = this.sel.id;
      const r = this.sel.id; this._commit(cfg); this.sel = null;
      this._hint(`${name} 已用跳線接到 ${r === 'gnd' ? 'GND（固定讀 0）' : 'VCC（固定讀 1）'}`); return;
    }
    if (this.sel && this.sel.kind === 'port' && this.sel.id === name) return this._cancel();
    if (this.sel && this.sel.kind === 'dev') { setPin(cfg, this.sel.id, name); this._commit(cfg); this.sel = null; this._hint(''); return; }
    if (cfg.ties[name]) { delete cfg.ties[name]; this._commit(cfg); this.sel = null; this._hint(`已拆掉 ${name} 上的電源跳線`); return; }
    const attached = DEV_IDS.filter(d => getPin(cfg, d) === name);
    if (attached.length) { for (const d of attached) setPin(cfg, d, null); this._commit(cfg); this.sel = null; this._hint(`已拆除 ${name} 上的 ${attached.length} 條線`); return; }
    this.sel = { kind: 'port', id: name };
    this._hint(`已抓住「${name}」— 再點 KDM+ 上的任一支腳接上（Esc 取消）`);
    this._applyWiring();
  }
  _cancel() { if (this.sel) { this.sel = null; this._hint(''); this._applyWiring(); } }
  _hint(s) { this.hintTxt.textContent = s; }
  _commit(cfg) { recomputeEnabled(cfg); this.sim.wiring.set(cfg); if (this.onWiringChange) this.onWiringChange(); }
  disconnectAll() {
    const cfg = JSON.parse(JSON.stringify(this.sim.wiring.cfg));
    for (const d of DEV_IDS) setPin(cfg, d, null);
    cfg.ties = {};
    this._commit(cfg); this.sel = null; this._hint('已全部拆線');
  }

  _applyWiring() {
    const cfg = this.sim.wiring.cfg;
    const used = {};
    for (const d of DEV_IDS) { const v = getPin(cfg, d); if (v) (used[v] = used[v] || []).push(d); }
    for (const d of DEV_IDS) {
      const list = this.devEls[d]; if (!list) continue;
      const v = getPin(cfg, d), sel = this.sel && this.sel.kind === 'dev' && this.sel.id === d;
      for (const e of list) {
        e.dot.setAttribute('fill', sel ? '#4da3ff' : (v ? COLORS[GROUP_OF(d)] : GOLD));
        e.dot.setAttribute('stroke', sel ? '#fff' : '#6d4a12');
        e.dot.setAttribute('stroke-width', sel ? 2 : 1);
      }
    }
    const ties = cfg.ties || {};
    const RAIL = { gnd: '#4a4a52', vcc: '#c0392b' };
    for (const [name, list] of Object.entries(this.portPins)) {
      const n = (used[name] || []).length, sel = this.sel && this.sel.kind === 'port' && this.sel.id === name;
      const tie = ties[name];
      const clash = tie && n >= 1;
      for (const e of list) {
        e.dot.setAttribute('fill', sel ? '#4da3ff'
          : clash || n > 1 ? '#ff5c5c'
          : tie ? RAIL[tie]
          : n === 1 ? COLORS[GROUP_OF(used[name][0])] : GOLD);
        e.dot.setAttribute('stroke', sel ? '#fff' : tie ? '#fff' : '#6d4a12');
        e.dot.setAttribute('stroke-width', sel || tie ? 2 : 1);
      }
    }
    for (const [rail, list] of Object.entries(this.railEls)) {
      const sel = this.sel && this.sel.kind === 'rail' && this.sel.id === rail;
      for (const e of list) {
        e.dot.setAttribute('fill', sel ? '#4da3ff' : e.dot._base);
        e.dot.setAttribute('stroke', sel ? '#fff' : '#5a5a5a');
        e.dot.setAttribute('stroke-width', sel ? 2 : 1);
      }
    }
    for (const [name, list] of Object.entries(this.ctrlEls)) {
      const tie = ties[name];
      for (const e of list) {
        e.dot.setAttribute('fill', tie ? RAIL[tie] : e.dot._base);
        e.dot.setAttribute('stroke', tie ? '#fff' : '#5a5a5a');
        e.dot.setAttribute('stroke-width', tie ? 2 : 1);
      }
    }
    for (const [id, list] of Object.entries(this.jmpEls)) {
      const capOn = cfg[id] !== false;
      for (const e of list) {
        e.dot.setAttribute('fill', GOLD);
        e.dot.setAttribute('stroke', capOn ? '#fff' : '#6d4a12');
        e.dot.setAttribute('stroke-width', capOn ? 2 : 1);
      }
    }
    this.wireLayer.innerHTML = '';
    for (const d of DEV_IDS) {
      const v = getPin(cfg, d); if (!v) continue;
      const al = this.devEls[d], bl = this.portPins[v];
      if (!al || !bl) continue;
      let a = al[0], b = bl[0], best = Infinity;
      for (const p of al) for (const q of bl) { const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (dd < best) { best = dd; a = p; b = q; } }
      const dx = Math.max(40, Math.abs(a.x - b.x) * 0.35);
      const path = `M ${a.x} ${a.y} C ${a.x - dx} ${a.y}, ${b.x + dx} ${b.y}, ${b.x} ${b.y}`;
      el('path', { d: path, fill: 'none', stroke: '#0b0b10', 'stroke-width': 4.5, 'stroke-linecap': 'round', opacity: .55 }, this.wireLayer);
      el('path', { d: path, fill: 'none', stroke: COLORS[GROUP_OF(d)], 'stroke-width': 2, 'stroke-linecap': 'round' }, this.wireLayer);
    }
    for (const [name, rail] of Object.entries(ties)) {
      const bl = this.portPins[name] || (this.ctrlEls[name] || []).map(e => ({ x: +e.dot.getAttribute('x') + 3.4, y: +e.dot.getAttribute('y') + 3.4 }));
      const al = (this.railEls[rail] || []).map(e => ({ x: +e.dot.getAttribute('x') + 3.4, y: +e.dot.getAttribute('y') + 3.4 }));
      if (!bl || !bl.length || !al.length) continue;
      let a = al[0], b = bl[0], best = Infinity;
      for (const p of al) for (const q of bl) { const dd = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (dd < best) { best = dd; a = p; b = q; } }
      const dx = Math.max(30, Math.abs(a.x - b.x) * 0.3);
      const path = `M ${a.x} ${a.y} C ${a.x - dx} ${a.y}, ${b.x + dx} ${b.y}, ${b.x} ${b.y}`;
      el('path', { d: path, fill: 'none', stroke: '#0b0b10', 'stroke-width': 4.5, 'stroke-linecap': 'round', opacity: .55 }, this.wireLayer);
      el('path', { d: path, fill: 'none', stroke: RAIL[rail], 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '6 3' }, this.wireLayer);
    }
    for (const [id, list] of Object.entries(this.jmpEls)) {
      if (cfg[id] === false || list.length < 2) continue;
      const [a, b] = list;
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#1b1b20', 'stroke-width': 9, 'stroke-linecap': 'round' }, this.wireLayer);
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#6f6f78', 'stroke-width': 5, 'stroke-linecap': 'round' }, this.wireLayer);
    }
    const conf = this.sim.wiring.conflicts().filter(x => x.level === 'error');
    this.kdmHint.textContent = conf.length ? `⚠ ${conf[0].msg}` : '';
  }

  // ==================== 每幀更新 ====================
  update() {
    const sim = this.sim;
    for (let i = 0; i < 8; i++) {
      const b = gamma(sim.leds.duty.smooth[i]), { led, halo } = this.leds[i];
      led.setAttribute('fill', b > 0.02 ? `rgb(${Math.round(198 + 57 * b)},${Math.round(196 + 54 * b)},${Math.round(42 + 128 * b)})` : '#C6C42A');
      halo.setAttribute('opacity', (b * 0.75).toFixed(3));
    }
    for (let i = 0; i < 8; i++) this.dip[i].knob.setAttribute('y', sim.dip.on[i] ? this.dip[i].on : this.dip[i].off);
    for (let i = 0; i < 4; i++) this.buttons[i].setAttribute('fill', sim.buttons.pressed[i] ? '#b9b9b9' : '#5e5e5e');
    const bd = sim.buzzer.activeDuty || 0, f = sim.buzzer.freqEstimate;
    this.buzzRing.setAttribute('opacity', bd > 0.01 && bd < 0.99 ? 0.9 : 0);
    this.buzzFreq.textContent = f > 20 ? `${Math.round(f)} Hz` : (bd > 0.95 ? '持續導通' : '');
    this.vrKnob.setAttribute('transform', `rotate(${(sim.spi.potVolts / 5 * 270 - 135).toFixed(0)} ${P(389.5)} ${P(269)})`);

    const att = sim.lcd.attached;
    this.lcmGroup.setAttribute('display', att ? 'inline' : 'none');
    this.lcmHit.setAttribute('display', att ? 'inline' : 'none');
    this.lcmSlot.setAttribute('display', att ? 'none' : 'inline');
    if (att) this._drawLcd();

    const sd = sim.display;
    for (let d = 0; d < 8; d++) for (let s = 0; s < 8; s++) {
      const b = gamma(sd.seg.smooth[d * 8 + s]);
      this.segs[d][s].setAttribute('fill', b > 0.02 ? `rgb(${Math.round(194 + 61 * b)},${Math.round(148 - 86 * b)},${Math.round(112 - 84 * b)})` : C.segOff);
    }
    for (let i = 0; i < 64; i++) {
      const b = gamma(sd.matrix.smooth[i]);
      this.dots[i].setAttribute('fill', b > 0.02 ? `rgb(${Math.round(214 + 41 * b)},${Math.round(210 - 148 * b)},${Math.round(198 - 170 * b)})` : C.matrixOff);
    }
    for (let n = 0; n < 16; n++) this.keys[n].setAttribute('fill', sim.keypad.pressed[n] ? C.keyDown : C.keyCap);

    const st = sim.stepper;
    this.rotor.setAttribute('transform', `rotate(${(st.angle % 360).toFixed(1)} ${P(403)} ${P(74)})`);
    for (let i = 0; i < 4; i++) this.coilDots[i].setAttribute('fill', (st.coils >> i) & 1 ? '#ffd166' : '#333');
    const rpm = st.rpm;
    this.motorText.textContent = `馬達 ${(((st.angle % 360) + 360) % 360).toFixed(1)}°  ${st.halfSteps} 半步  ${Math.abs(rpm) > 0.1 ? rpm.toFixed(1) + ' rpm' : '停止'}${st.missed ? `  失步×${st.missed}` : ''}`;
  }

  _drawLcd() {
    const lcd = this.sim.lcd, r = lcd.render();
    const ctx = this.lcdCanvas.getContext('2d');
    const W = this.lcdCanvas.width, H = this.lcdCanvas.height;
    ctx.fillStyle = lcd.attached ? '#7ba33a' : '#4a5a32';
    ctx.fillRect(0, 0, W, H);
    const px = 6, gap = 3;
    const cellW = 5 * px + gap * 2, cellH = 8 * px + gap * 2;
    const x0 = (W - 16 * (cellW + 3)) / 2, y0 = (H - 2 * (cellH + 8)) / 2;
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const rows = glyphRows(r.rows[row][col], r.cgram);
      const cx = x0 + col * (cellW + 3), cy = y0 + row * (cellH + 8);
      const isCur = r.cursor && r.cursor.row === row && r.cursor.col === col;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) {
        let on = r.on && ((rows[y] >> (4 - x)) & 1);
        if (isCur && r.on) { if (r.blink && blink) on = 1; else if (r.underline && y === 7) on = 1; }
        ctx.fillStyle = on ? '#0e2008' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(cx + gap + x * px, cy + gap + y * px, px - 1, px - 1);
      }
    }
  }
}
