// 主板 KT89S51 V4.2 固定週邊：LED、指撥開關、按鍵、蜂鳴器
import { DutyTracker } from './util.js';

// 8 顆 LED：P1.0–P1.7，低態亮
export class Leds {
  constructor(sim) {
    this.sim = sim;
    this.duty = new DutyTracker(8);
    sim.bus.onPinChange((port) => { if (port === 1) this._update(); });
    this._update();
  }
  _update() {
    const p1 = this.sim.bus.pins[1];
    this.duty.update(this.sim.cpu.cycles, (i) => !((p1 >> i) & 1));
  }
  frame() { this._update(); return this.duty.sample(this.sim.cpu.cycles); }
  reset() { this.duty.reset(this.sim.cpu.cycles); }
}

// SW1 指撥開關 ×8：P0.0–P0.7，撥 ON → 接地讀 0
export class DipSwitch {
  constructor(sim) {
    this.sim = sim;
    this.on = new Uint8Array(8); // 1 = ON
    sim.bus.addDriver(this);
  }
  update() {
    let low = 0;
    for (let i = 0; i < 8; i++) if (this.on[i]) low |= (1 << i);
    return { low: [low, 0, 0, 0] };
  }
  toggle(i) { this.on[i] ^= 1; this.sim.bus.invalidate(); }
  set(i, v) { this.on[i] = v ? 1 : 0; this.sim.bus.invalidate(); }
  setAll(v) { this.on.fill(v ? 1 : 0); this.sim.bus.invalidate(); }
}

// 四顆按鍵：PB1=P3.2(INT0) PB2=P3.3(INT1) PB3=P2.0 PB4=P2.1，按下接地
export const BUTTONS = [
  { name: 'PB1', sub: 'INT0', port: 3, bit: 2 },
  { name: 'PB2', sub: 'INT1', port: 3, bit: 3 },
  { name: 'PB3', sub: 'P2.0', port: 2, bit: 0 },
  { name: 'PB4', sub: 'P2.1', port: 2, bit: 1 },
];
export class Buttons {
  constructor(sim) {
    this.sim = sim;
    this.pressed = new Uint8Array(4);
    this.resetPressed = false;
    sim.bus.addDriver(this);
  }
  update() {
    const low = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) if (this.pressed[i]) low[BUTTONS[i].port] |= (1 << BUTTONS[i].bit);
    return { low };
  }
  press(i, v) { this.pressed[i] = v ? 1 : 0; this.sim.bus.invalidate(); }
}

// 蜂鳴器：P3.7 經 PNP 驅動，低態導通。記錄每次翻轉的時間點供音訊與波形使用。
export class Buzzer {
  constructor(sim) {
    this.sim = sim;
    this.events = [];          // [cycle, on] 本幀累積
    this.on = 0;
    this.duty = new DutyTracker(1);
    this.freqEstimate = 0;     // Hz（由本幀翻轉次數估算）
    this._edges = 0;
    sim.bus.onPinChange((port, now, old) => {
      if (port !== 3) return;
      const v = (now >> 7) & 1, o = (old >> 7) & 1;
      if (v !== o) {
        this.on = v ? 0 : 1;
        this.events.push([sim.cpu.cycles, this.on]);
        this.duty.update(sim.cpu.cycles, [this.on]);
        this._edges++;
      }
    });
  }
  // 每幀由 runner 呼叫：回傳並清空事件
  frame(frameCycles) {
    const ev = this.events; this.events = [];
    const d = this.duty.sample(this.sim.cpu.cycles)[0];
    // 翻轉次數 / 2 = 週期數；frameCycles µs
    this.freqEstimate = frameCycles > 0 ? (this._edges / 2) / (frameCycles / 1e6) : 0;
    this._edges = 0;
    this.activeDuty = d;
    return ev;
  }
  reset() { this.events = []; this.on = 0; this.duty.reset(this.sim.cpu.cycles); }
}
