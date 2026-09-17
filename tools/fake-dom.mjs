// 給煙霧測試用的假 DOM。夠真實到能把整個 app.js 跑起來，
// 但不是瀏覽器 —— 它只負責抓「模組載不起來 / 建構就炸」這類會讓畫面整個空白的錯。
function fakeEl(tag, ns) {
  const e = {
    tag, ns, children: [], attrs: {}, dataset: {}, _events: {}, _text: '', value: '', checked: false,
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k] || ''; }, removeProperty(k) { delete this._p[k]; } },
    className: '',
    get classList() {
      const self = this;
      const list = () => (self.className || '').split(/\s+/).filter(Boolean);
      const set = (a) => { self.className = a.join(' '); };
      return {
        add(...c) { const a = list(); for (const x of c) if (!a.includes(x)) a.push(x); set(a); },
        remove(...c) { set(list().filter(x => !c.includes(x))); },
        toggle(c, force) { const a = list(), has = a.includes(c);
          if (force === undefined ? has : !force) set(a.filter(x => x !== c)); else if (!has) { a.push(c); set(a); } },
        contains(c) { return list().includes(c); },
      };
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); if (c && typeof c === 'object') c.parentElement = this; return c; },
    append(...cs) { for (const c of cs) this.children.push(c); },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (this._events[t] = this._events[t] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    getContext: () => new Proxy({}, { get: () => () => {} }),
    scrollIntoView() {}, focus() {}, click() {}, remove() {},
    walk(fn) { fn(this); for (const c of this.children) if (c && c.walk) c.walk(fn); },
    fire(type, ev) { for (const fn of this._events[type] || []) fn({ stopPropagation() {}, preventDefault() {}, ...ev }); },
    querySelector: () => null, querySelectorAll: () => [],
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    set hidden(v) { this._hidden = v; }, get hidden() { return this._hidden; },
    get offsetWidth() { return 100; }, get children2() { return this.children; },
  };
  return e;
}
const reg = new Map();
const get = (sel) => { if (!reg.has(sel)) { const e = fakeEl('div'); e.id = String(sel).replace(/^#/, ''); reg.set(sel, e); } return reg.get(sel); };
globalThis.document = {
  createElementNS: (ns, tag) => fakeEl(tag, ns),
  createElement: (tag) => fakeEl(tag),
  createTextNode: (t) => ({ nodeType: 3, textContent: t, walk(){} }),
  createDocumentFragment: () => fakeEl('#fragment'),
  addEventListener() {}, removeEventListener() {},
  getElementById: (id) => get('#' + id),
  querySelector: (s) => get(s),
  querySelectorAll: () => [],
  body: fakeEl('body'),
  documentElement: fakeEl('html'),
};
globalThis.window = { addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false, addEventListener(){} }) };
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}), text: async () => '' });
globalThis.AudioContext = class { constructor(){ this.destination={}; this.audioWorklet={ addModule: async()=>{} }; } createGain(){return {connect(){},gain:{value:0}};} };
globalThis.Blob = globalThis.Blob || class {};
// 保留 Node 原本的 URL 建構子，只補上 Blob URL 這兩個方法
globalThis.URL.createObjectURL = globalThis.URL.createObjectURL || (() => 'blob:x');
globalThis.URL.revokeObjectURL = globalThis.URL.revokeObjectURL || (() => {});

// buzzer-worklet.js 跑在 AudioWorklet 環境裡，補上它需要的全域，語法才檢查得到
globalThis.AudioWorkletProcessor = globalThis.AudioWorkletProcessor || class { constructor(){ this.port = { onmessage: null, postMessage(){} }; } };
globalThis.registerProcessor = globalThis.registerProcessor || function () {};
globalThis.sampleRate = globalThis.sampleRate || 48000;

export { fakeEl };
