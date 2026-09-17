// 4×4 鍵盤矩陣（KDM+ JP8）
// KO0–KO3：掃描線（通常當輸出）；KI0–KI3：讀回線（10K 上拉）
// 按下 PBn 使 KO(n%4) 與 KI(n/4) 短路。此處以雙向短路建模：
// 任一端為低 → 另一端也被拉低，交給 PortBus 迭代收斂。

import { readPin, pullLow } from './util.js';

export class Keypad {
  constructor(sim) {
    this.sim = sim;
    this.pressed = new Uint8Array(16); // index = col*4 + row（對應 PB 編號）
    sim.bus.addDriver(this);
  }
  get w() { return this.sim.wiring; }
  update(pins) {
    const low = [0, 0, 0, 0];
    if (!this.w.isEnabled('keypad')) return { low };
    const ko = this.w.pins.keyOut, ki = this.w.pins.keyIn;
    for (let n = 0; n < 16; n++) {
      if (!this.pressed[n]) continue;
      const row = n & 3, col = n >> 2;
      const koRef = ko[row], kiRef = ki[col];
      const koLow = !readPin(pins, koRef), kiLow = !readPin(pins, kiRef);
      if (koLow) pullLow(low, kiRef);
      if (kiLow) pullLow(low, koRef);
    }
    return { low };
  }
  press(n, v) { this.pressed[n] = v ? 1 : 0; this.sim.bus.invalidate(); }
  releaseAll() { this.pressed.fill(0); this.sim.bus.invalidate(); }
}
