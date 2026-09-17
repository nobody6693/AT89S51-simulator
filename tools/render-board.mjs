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

const sim = new Sim();
const container = fakeEl('div');
const view = new BoardView(container, sim, { reset() {} });
view.update();

const svgEl = container.children.find(c => c.tag === 'svg');
const vb = svgEl.attrs.viewBox;
let svg = svgEl.serialize();
svg = svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}"`);
// 底色，方便看清楚
svg = svg.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}" fill="#1b1d22"/>`);

const out = process.argv[2] || 'tools/board-preview.png';
const width = +(process.argv[3] || 2200);
writeFileSync(out.replace(/\.png$/, '.svg'), svg);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(out, png);
console.log('wrote', out, 'viewBox', vb, 'px width', width);
