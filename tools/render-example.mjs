// 把 BoardView 畫出來的 SVG 轉成 PNG，方便肉眼檢查版面
// 用法：node tools/render-board.mjs [輸出檔.png] [寬度]
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fakeEl(tag, ns) {
  const e = {
    tag, ns, children: [], attrs: {}, style: {}, _events: {}, _text: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    getContext: () => ({ fillRect() {}, set fillStyle(v) {}, get fillStyle() { return ''; } }),
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    set hidden(v) { this._hidden = v; },
    get hidden() { return this._hidden; },
    get offsetWidth() { return 100; },
    serialize() {
      if (this.tag === 'foreignObject') return '';           // 光柵化時跳過
      const a = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
      const inner = (this._text ? esc(this._text) : '') + this.children.map(c => c.serialize ? c.serialize() : '').join('');
      return `<${this.tag}${a}>${inner}</${this.tag}>`;
    },
  };
  return e;
}
globalThis.document = {
  createElementNS: (ns, tag) => fakeEl(tag, ns),
  createElement: (tag) => fakeEl(tag),
  addEventListener() {}, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
};
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const { Sim } = await import('../web/src/sim.js');
const { BoardView } = await import('../web/src/ui/board.js');
const { assemble } = await import('../web/src/asm/assembler.js');
const { wiringForExample } = await import('../web/src/board/wiring.js');
const { readFileSync } = await import('node:fs');

// 用法：node _render-example.mjs <範例檔名> <先跑幾 ms> <按鍵序列 k:n,...> <輸出.png>
//   按鍵：k=PBn 鍵盤(0~15)、b=主板按鈕(0~3)，例如 "k1,k2,k3,b0"
const [, , name, msArg = '100', keysArg = '', out = 'tools/example-preview.png'] = process.argv;
const src = readFileSync('examples/asm/' + name, 'utf-8');
const r = assemble(src, { codeSize: 4096 });
if (!r.ok) { console.error(r.diagnostics); process.exit(1); }
const sim = new Sim();
const w = wiringForExample(name); if (w) sim.wiring.set(w);
sim.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name });
const container = fakeEl('div');
const view = new BoardView(container, sim, { reset() {} });
sim.cpu.run(+msArg * 1000);
for (const k of keysArg.split(',').filter(Boolean)) {
  const n = +k.slice(1);
  if (k[0] === 'k') { sim.keypad.press(n, 1); sim.cpu.run(30000); sim.keypad.press(n, 0); sim.cpu.run(30000); }
  else { sim.buttons.press(n, 1); sim.cpu.run(20000); sim.buttons.press(n, 0); sim.cpu.run(+msArg * 1000); }
}
sim.frame(0);
sim.cpu.run(60000);
const sample = sim.frame(60000);
view.update(sample);
view.update(sample);

const svgEl = container.children.find(c => c.tag === 'svg');
const vb = svgEl.attrs.viewBox;
let svg = svgEl.serialize();
svg = svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}"`);
svg = svg.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}" fill="#1b1d22"/>`);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1600 }, font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(out, png);
console.log('wrote', out, 'P1=' + sim.bus.latch[1].toString(16));
