// KDM+ 掃描式顯示：8 位數七段顯示器 + 8×8 LED 陣列
// 兩者共用位選線 X0–X7（經 2N3906 PNP：X=0 → 該位/該行被選中）
// 七段：共陽極，段線經 33Ω 到 JP3，段線 = 0 → 該段亮
// 陣列：列線 R1–R8 經 33Ω 到 JP6，列線 = 0 且行被選 → 該點亮
// 位選來源：JP4 直接 8 線，或 74LS138 由 JP5 的 A/B/C 解碼（輸出低態有效，恆有一路被選）

import { DutyTracker, readPin } from './util.js';

export class ScanDisplay {
  constructor(sim) {
    this.sim = sim;
    this.seg = new DutyTracker(64);     // [digit*8 + seg]
    this.matrix = new DutyTracker(64);  // [col*8 + row]
    this.selectedMask = 0;
    sim.bus.onPinChange(() => this._update());
    sim.wiring.onChange(() => this._update());
    this._update();
  }
  get w() { return this.sim.wiring; }

  // 回傳被選中的位/行 bitmask（bit i = X_i 為低）
  selected(pins) {
    const c = this.w.cfg;
    if (c.digitMode === '138') {
      const d = this.w.pins.dec138;
      if (!d[0] || !d[1] || !d[2]) return 0;
      const n = readPin(pins, d[0]) | (readPin(pins, d[1]) << 1) | (readPin(pins, d[2]) << 2);
      return 1 << n;
    }
    let m = 0;
    const refs = this.w.pins.digit;
    for (let i = 0; i < 8; i++) if (refs[i] && !readPin(pins, refs[i])) m |= (1 << i);
    return m;
  }

  _update() {
    const pins = this.sim.bus.pins;
    const cyc = this.sim.cpu.cycles;
    const sel = this.selected(pins);
    this.selectedMask = sel;
    const en7 = this.w.isEnabled('seg7'), enM = this.w.isEnabled('matrix');
    if (en7) {
      const segRefs = this.w.pins.seg;
      let segLow = 0;
      for (let s = 0; s < 8; s++) if (segRefs[s] && !readPin(pins, segRefs[s])) segLow |= (1 << s);
      this.seg.update(cyc, (i) => ((sel >> (i >> 3)) & 1) && ((segLow >> (i & 7)) & 1));
    } else this.seg.update(cyc, () => 0);
    if (enM) {
      const rowRefs = this.w.pins.matrixRow;
      let rowLow = 0;
      for (let r = 0; r < 8; r++) if (rowRefs[r] && !readPin(pins, rowRefs[r])) rowLow |= (1 << r);
      this.matrix.update(cyc, (i) => ((sel >> (i >> 3)) & 1) && ((rowLow >> (i & 7)) & 1));
    } else this.matrix.update(cyc, () => 0);
  }

  frame() {
    this._update();
    const cyc = this.sim.cpu.cycles;
    return { seg: this.seg.sample(cyc), matrix: this.matrix.sample(cyc) };
  }
  reset() { this.seg.reset(this.sim.cpu.cycles); this.matrix.reset(this.sim.cpu.cycles); }
}
