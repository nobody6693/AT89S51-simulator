// 8051 四個埠的電氣模型
//
// 每隻腳同時被 CPU latch 與外部裝置驅動，解算規則：
//   強拉低（CPU latch=0，或外部裝置拉低）        → 腳位 = 0
//   否則若外部裝置強推高（LCD 回讀、ADC DOUT）  → 腳位 = 1
//   否則弱上拉（latch=1）                       → 腳位 = 1
//
// P0 為開汲極：latch=1 時為高阻抗。本板 P0 有 RP1 10K 外部上拉，
// 因此 pullupP0=true 時視為有上拉；若拔掉上拉則讀回 0（浮接視為低）。
//
// 週邊以 driver 形式掛上：driver.update(pins) 回傳 { low:[4], high:[4] }
// 依賴腳位狀態的週邊（鍵盤矩陣）會在迭代中收斂。

export class PortBus {
  constructor() {
    this.latch = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    this.pins = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    this.extLow = new Uint8Array(4);
    this.extHigh = new Uint8Array(4);
    this.contention = new Uint8Array(4); // CPU 拉低 vs 外部推高
    this.drivers = [];
    this.writeListeners = [];   // (port, newLatch, oldLatch)
    this.pinListeners = [];     // (port, newPins, oldPins)
    this.pullupP0 = true;
    this._dirty = true;
  }

  addDriver(d) {
    this.drivers.push(d);
    d._low = [0, 0, 0, 0];
    d._high = [0, 0, 0, 0];
    this.recompute();
    return d;
  }
  removeDriver(d) {
    const i = this.drivers.indexOf(d);
    if (i >= 0) this.drivers.splice(i, 1);
    this.recompute();
  }
  onWrite(fn) { this.writeListeners.push(fn); }
  onPinChange(fn) { this.pinListeners.push(fn); }

  // CPU 寫 latch
  write(port, value) {
    const old = this.latch[port];
    this.latch[port] = value & 0xFF;
    if (old !== this.latch[port]) {
      for (const fn of this.writeListeners) fn(port, this.latch[port], old);
      this.recompute();
    }
  }

  // 週邊狀態改變時呼叫（撥開關、按鍵…）
  invalidate() { this.recompute(); }

  recompute() {
    // 監聽器內再呼叫 invalidate()/write() 時延後處理，避免重入造成邊緣被重複偵測
    if (this._busy) { this._pending = true; return; }
    this._busy = true;
    try {
      for (let guard = 0; guard < 8; guard++) {
        this._pending = false;
        this._recomputeOnce();
        if (!this._pending) break;
      }
    } finally { this._busy = false; }
  }

  _recomputeOnce() {
    const oldPins = [this.pins[0], this.pins[1], this.pins[2], this.pins[3]];
    // 從乾淨狀態開始收斂（driver 的貢獻只由目前 latch 與裝置狀態決定）
    for (const d of this.drivers) { d._low = [0, 0, 0, 0]; d._high = [0, 0, 0, 0]; }
    for (let p = 0; p < 4; p++) { this.extLow[p] = 0; this.extHigh[p] = 0; }
    for (let iter = 0; iter < 6; iter++) {
      // 依目前腳位重算每個 driver 的貢獻
      let changed = false;
      const pinsNow = this._solve();
      for (const d of this.drivers) {
        const r = d.update(pinsNow, this.latch);
        for (let p = 0; p < 4; p++) {
          const lo = r.low ? (r.low[p] | 0) : 0;
          const hi = r.high ? (r.high[p] | 0) : 0;
          if (lo !== d._low[p] || hi !== d._high[p]) changed = true;
          d._low[p] = lo; d._high[p] = hi;
        }
      }
      if (!changed && iter > 0) break;
      // 彙總
      for (let p = 0; p < 4; p++) { this.extLow[p] = 0; this.extHigh[p] = 0; }
      for (const d of this.drivers) for (let p = 0; p < 4; p++) {
        this.extLow[p] |= d._low[p]; this.extHigh[p] |= d._high[p];
      }
      if (!changed) break;
    }
    const solved = this._solve();
    for (let p = 0; p < 4; p++) {
      this.pins[p] = solved[p];
      this.contention[p] = (~this.latch[p]) & this.extHigh[p] & 0xFF;
    }
    for (let p = 0; p < 4; p++) if (oldPins[p] !== this.pins[p]) {
      for (const fn of this.pinListeners) fn(p, this.pins[p], oldPins[p]);
    }
  }

  _solve() {
    const out = [0, 0, 0, 0];
    for (let p = 0; p < 4; p++) {
      let weakHigh = this.latch[p];
      if (p === 0 && !this.pullupP0) weakHigh = 0; // P0 無上拉 → 浮接讀 0
      out[p] = ((weakHigh | this.extHigh[p]) & ~this.extLow[p]) & 0xFF;
    }
    return out;
  }

  pin(port) { return this.pins[port]; }
  pinBit(port, bit) { return (this.pins[port] >> bit) & 1; }
  latchBit(port, bit) { return (this.latch[port] >> bit) & 1; }

  reset() {
    this.latch.fill(0xFF);
    this.recompute();
  }
}
