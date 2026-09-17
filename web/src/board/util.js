// 週邊共用工具

// 視覺暫留積分器：追蹤 N 個通道的導通時間比例
// update(cycle, onFlags) 在狀態改變時呼叫；sample(cycle) 每幀取樣一次並歸零
export class DutyTracker {
  constructor(n) {
    this.n = n;
    this.on = new Uint8Array(n);
    this.acc = new Float64Array(n);
    this.lastCycle = 0;
    this.duty = new Float32Array(n);
    // 顯示用平滑值（模擬 LED 餘暉 + 人眼暫留）
    this.smooth = new Float32Array(n);
  }
  _flush(cycle) {
    const dt = cycle - this.lastCycle;
    if (dt > 0) {
      for (let i = 0; i < this.n; i++) if (this.on[i]) this.acc[i] += dt;
      this.lastCycle = cycle;
    }
  }
  // onFlags: Uint8Array/array of 0/1 或函式 (i)=>bool
  update(cycle, onFlags) {
    this._flush(cycle);
    if (typeof onFlags === 'function') for (let i = 0; i < this.n; i++) this.on[i] = onFlags(i) ? 1 : 0;
    else for (let i = 0; i < this.n; i++) this.on[i] = onFlags[i] ? 1 : 0;
  }
  sample(cycle) {
    this._flush(cycle);
    const total = cycle - this.frameStart;
    for (let i = 0; i < this.n; i++) {
      this.duty[i] = total > 0 ? Math.min(1, this.acc[i] / total) : this.on[i];
      this.acc[i] = 0;
      // 快亮慢暗，接近真實 LED 觀感
      const d = this.duty[i];
      this.smooth[i] = d > this.smooth[i] ? d : this.smooth[i] * 0.55 + d * 0.45;
    }
    this.frameStart = cycle;
    return this.duty;
  }
  reset(cycle) { this.on.fill(0); this.acc.fill(0); this.duty.fill(0); this.smooth.fill(0); this.lastCycle = cycle; this.frameStart = cycle; }
}

// 解析 "P1.3" → {port:1, bit:3}；null/"" → null
export function parsePin(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  const m = /^P([0-3])\.([0-7])$/i.exec(String(s).trim());
  return m ? { port: +m[1], bit: +m[2] } : null;
}
export function pinName(p) { return p ? `P${p.port}.${p.bit}` : '—'; }

export function readPin(pins, ref) { return ref ? (pins[ref.port] >> ref.bit) & 1 : 1; }
export function pullLow(mask, ref) { if (ref) mask[ref.port] |= (1 << ref.bit); }
export function driveHigh(mask, ref) { if (ref) mask[ref.port] |= (1 << ref.bit); }

// 讀 8 條線成一個 byte（refs[i] 對應 bit i）
export function readByte(pins, refs) {
  let v = 0;
  for (let i = 0; i < refs.length; i++) if (readPin(pins, refs[i])) v |= (1 << i);
  return v;
}

export const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
export const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0');
