// 建 BoardView、畫一幀、把每個可點節點都點一遍。假 DOM 比 render 工具嚴格：
// setAttribute 收到 undefined / NaN / 不合法屬性名就丟錯。

function fakeEl(tag, ns) {
  const e = {
    tag, ns, children: [], attrs: {}, style: {}, _events: {}, _text: '',
    setAttribute(k, v) {
      if (!/^[A-Za-z_:][-A-Za-z0-9_:.]*$/.test(k)) throw new Error(`InvalidCharacterError: 屬性名稱 "${k}" 不合法`);
      if (v === undefined || v === null) throw new Error(`setAttribute("${k}", ${v}) —— 瀏覽器會寫成字串 "${v}"，多半是 bug`);
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`setAttribute("${k}", ${v}) —— 非有限數值`);
      this.attrs[k] = String(v);
    },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); if (c && typeof c === 'object') c.parentElement = this; return c; },
    addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    getContext: () => new Proxy({}, { get: () => () => {} }),
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; },
    set hidden(v) { this._hidden = v; },
    get hidden() { return this._hidden; },
    get offsetWidth() { return 100; },
    fire(type, ev) { for (const fn of this._events[type] || []) fn({ stopPropagation() {}, preventDefault() {}, ...ev }); },
    walk(fn) { fn(this); for (const c of this.children) c.walk && c.walk(fn); },
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
const { HEADERS, isPort } = await import('../web/src/ui/headers.js');

const step = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); process.exitCode = 1; }
};

const sim = new Sim();
const container = fakeEl('div');
let view = null;
step('建立 BoardView', () => { view = new BoardView(container, sim, { reset() {} }); });
if (!view) process.exit(1);
step('第一次 update()（瀏覽器每幀都會呼叫）', () => view.update({}));
step('載入空程式後 reset + update', () => { sim.reset(); view.update({}); });

// 把 SVG 裡所有掛了 click 的節點點一遍（模擬使用者亂點）
const clickables = [];
container.walk((n) => { if (n._events && n._events.click) clickables.push(n); });
step(`點擊全部 ${clickables.length} 個可點節點各一次`, () => {
  for (const n of clickables) n.fire('click');
});
step('點完之後再 update()', () => view.update({}));

// 針對新加的角色：抓 GND → 點一支埠腳 → 應該產生 tie
step('GND → P1.3 跳線', () => {
  view.sel = { kind: 'rail', id: 'gnd' };
  view._portClicked('P1.3');
  if (sim.wiring.cfg.ties['P1.3'] !== 'gnd') throw new Error('沒有建立跳線');
  if (((sim.bus.pins[1] >> 3) & 1) !== 0) throw new Error('P1.3 沒有被拉低');
  view.update({});
});
step('VCC → RST 跳線（按住重置）', () => {
  view.sel = { kind: 'rail', id: 'vcc' };
  view._ctrlClicked('RST');
  if (!sim.rails.heldInReset) throw new Error('RST 沒有被判定成按住重置');
  view.update({});
});
step('JP11 跳線帽開關', () => { view._jumperClicked('jp11'); view.update({}); view._jumperClicked('jp11'); });
step('全部拆線', () => { view.disconnectAll(); view.update({}); });

// 每一種 signal 前綴都至少被畫過一次
const kinds = new Set();
for (const h of HEADERS) for (const [, s] of h.pins) kinds.add(!s ? 'none' : isPort(s) ? 'port' : s.split(':')[0]);
console.log('  --   針腳角色：' + [...kinds].sort().join(', '));
console.log(process.exitCode ? '\n有步驟失敗' : '\n全部通過');
