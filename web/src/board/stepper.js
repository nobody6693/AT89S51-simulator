// 步進馬達（KDM+ JP7 → ULN2803A → 四相單極馬達）
// S=1 → ULN 輸入高 → 輸出拉低 → 該線圈通電（+12V 經線圈流入）
// 接線：S0→B2  S1→B1  S2→A2  S3→A1（依電路圖 U4 OUT1–4 標示）
// 相位順序 A1 → B1 → A2 → B2 為正轉；線圈通電組合決定轉子停留角度。

import { readPin } from './util.js';

const STEP_DEG = 1.8;           // 全步角
const COIL_OF_S = [3, 1, 2, 0]; // S0→B2(3) S1→B1(1) S2→A2(2) S3→A1(0)

// 通電線圈組合 → 半步位置 (0..7)，每半步 = STEP_DEG/2
const PATTERN_POS = {
  0b0001: 0, // A1
  0b0011: 1, // A1+B1
  0b0010: 2, // B1
  0b0110: 3, // B1+A2
  0b0100: 4, // A2
  0b1100: 5, // A2+B2
  0b1000: 6, // B2
  0b1001: 7, // B2+A1
};

export class Stepper {
  constructor(sim) {
    this.sim = sim;
    this.angle = 0;        // 度，累積
    this.halfSteps = 0;    // 淨半步數（正 = 正轉）
    this.coils = 0;        // 目前通電線圈 bitmask (A1,B1,A2,B2)
    this.lastPos = null;
    this.missed = 0;       // 失步次數（跳躍不相鄰位置）
    this.lastStepCycle = 0;
    this.stepIntervalUs = 0;
    this.direction = 0;
    this.history = [];     // 最近 64 步的間隔（µs）
    sim.bus.onPinChange(() => this._update());
    sim.wiring.onChange(() => this._update());
  }
  get w() { return this.sim.wiring; }
  _update() {
    if (!this.w.isEnabled('stepper')) return;
    const pins = this.sim.bus.pins, refs = this.w.pins.stepper;
    let coils = 0;
    for (let i = 0; i < 4; i++) if (refs[i] && readPin(pins, refs[i])) coils |= (1 << COIL_OF_S[i]);
    if (coils === this.coils) return;
    this.coils = coils;
    const pos = PATTERN_POS[coils];
    if (pos === undefined) return; // 全斷電或無效組合：轉子停留
    if (this.lastPos !== null) {
      let d = (pos - this.lastPos + 8) % 8;
      if (d > 4) d -= 8;               // -3..4
      if (Math.abs(d) > 2) { this.missed++; d = 0; } // 跳太遠 = 失步（無法確定方向）
      this.halfSteps += d;
      this.angle += d * (STEP_DEG / 2);
      if (d !== 0) {
        const cyc = this.sim.cpu.cycles;
        this.stepIntervalUs = cyc - this.lastStepCycle;
        this.lastStepCycle = cyc;
        this.direction = Math.sign(d);
        this.history.push(this.stepIntervalUs); if (this.history.length > 64) this.history.shift();
      }
    } else this.lastStepCycle = this.sim.cpu.cycles;
    this.lastPos = pos;
  }
  get rpm() {
    if (!this.history.length) return 0;
    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length; // µs / 半步
    if (this.sim.cpu.cycles - this.lastStepCycle > 500000) return 0; // 0.5s 沒動 = 停
    const halfStepsPerRev = 360 / (STEP_DEG / 2);
    return 60 / (avg * 1e-6 * halfStepsPerRev) * this.direction;
  }
  reset() { this.angle = 0; this.halfSteps = 0; this.coils = 0; this.lastPos = null; this.missed = 0; this.history = []; this.direction = 0; }
}
