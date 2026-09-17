// 整組模擬器：CPU + 主板週邊 + KDM+ 週邊 + 邏輯分析儀紀錄
import { CPU8051 } from './cpu/cpu.js';
import { Wiring } from './board/wiring.js';
import { Leds, DipSwitch, Buttons, Buzzer } from './board/mainboard.js';
import { Lcd1602 } from './board/lcd1602.js';
import { Keypad } from './board/keypad.js';
import { ScanDisplay } from './board/display.js';
import { Stepper } from './board/stepper.js';
import { Spi } from './board/spi.js';
import { I2c } from './board/i2c.js';
import { RailTies } from './board/rails.js';

// 邏輯分析儀：記錄所有埠腳位的每次變化
class LogicAnalyzer {
  constructor(sim, capacity = 1 << 18) {
    this.sim = sim;
    this.cap = capacity;
    this.t = new Float64Array(capacity);
    this.p = new Uint8Array(capacity * 4);
    this.head = 0; this.count = 0;
    sim.bus.onPinChange(() => this.record());
    this.record();
  }
  record() {
    const i = this.head;
    this.t[i] = this.sim.cpu.cycles;
    const pins = this.sim.bus.pins;
    this.p[i * 4] = pins[0]; this.p[i * 4 + 1] = pins[1]; this.p[i * 4 + 2] = pins[2]; this.p[i * 4 + 3] = pins[3];
    this.head = (i + 1) % this.cap;
    if (this.count < this.cap) this.count++;
  }
  clear() { this.head = 0; this.count = 0; this.record(); }
  // 依時間倒序走訪：fn(cycle, pinsArray4) 回傳 false 停止
  eachBackward(fn) {
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - 1 - k + this.cap) % this.cap;
      if (fn(this.t[i], this.p.subarray(i * 4, i * 4 + 4)) === false) break;
    }
  }
}

export class Sim {
  constructor() {
    this.cpu = new CPU8051();
    this.bus = this.cpu.bus;
    this.wiring = new Wiring();
    this.leds = new Leds(this);
    this.dip = new DipSwitch(this);
    this.buttons = new Buttons(this);
    this.buzzer = new Buzzer(this);
    this.lcd = new Lcd1602(this);
    this.keypad = new Keypad(this);
    this.display = new ScanDisplay(this);
    this.stepper = new Stepper(this);
    this.spi = new Spi(this);
    this.i2c = new I2c(this);
    this.rails = new RailTies(this);
    this.la = new LogicAnalyzer(this);
    this.uartOut = [];
    this.cpu.onUartTx = (b) => { this.uartOut.push(b); if (this.uartOut.length > 4000) this.uartOut.shift(); };
    this.program = null; // { hex, lines:[[addr,line]], symbols, source, name }
    this.lineByAddr = new Map();
    this.addrByLine = new Map();
    this.sortedAddrs = [];
    this.warnings = [];
  }

  load(program) {
    this.program = program;
    this.cpu.loadHex(program.hex || '');
    this.lineByAddr.clear(); this.addrByLine.clear();
    for (const [addr, line] of (program.lines || [])) {
      this.lineByAddr.set(addr, line);
      if (!this.addrByLine.has(line)) this.addrByLine.set(line, addr);
    }
    this.sortedAddrs = [...this.lineByAddr.keys()].sort((a, b) => a - b);
    this.reset();
  }
  reset() {
    this.cpu.reset();
    this.lcd.reset(); this.spi.reset(); this.i2c.reset(); this.stepper.reset();
    this.leds.reset(); this.buzzer.reset(); this.display.reset();
    this.keypad.releaseAll();
    this.la.clear();
    this.bus.invalidate();
    this.uartOut = [];
    this.warnings = [];
    this.bus.invalidate();
  }
  // 目前 PC 對應的 C 行號（往前找最近的對應點）
  lineOfAddr(addr) {
    if (this.lineByAddr.has(addr)) return this.lineByAddr.get(addr);
    // 往前找最近的對應點（同一行的後續指令）；距離超過 64 bytes 視為不在 C 程式碼內
    const a = this.sortedAddrs;
    let lo = 0, hi = a.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= addr) { best = m; lo = m + 1; } else hi = m - 1; }
    if (best < 0 || addr - a[best] > 64) return null;
    return this.lineByAddr.get(a[best]);
  }
  // 每幀由 runner 呼叫；回傳 UI 需要的取樣
  frame(frameCycles) {
    const out = {
      leds: this.leds.frame(),
      buzzer: this.buzzer.frame(frameCycles),
      display: this.display.frame(),
    };
    if (this.lcd.drivingBus && this.bus.latch[0] !== this.bus.pins[0]) {
      const w = 'LCM 正在驅動 P0（E=P3.0 與 R/W=P3.1 都是 1）：P0 讀寫會被 LCM 覆蓋。若程式不用 LCM，請拔除它或在程式開頭把 P3.0 拉低';
      if (!this.warnings.includes(w)) this.warnings.push(w);
    }
    const lw = this.lcd.takeWarnings();
    for (const w of lw) if (!this.warnings.includes(w)) this.warnings.push(w);
    for (let p = 0; p < 4; p++) if (this.bus.contention[p]) {
      const w = `P${p} 發生電氣衝突：CPU 拉低但外部裝置推高（bit mask ${this.bus.contention[p].toString(2).padStart(8, '0')}）`;
      if (!this.warnings.includes(w)) this.warnings.push(w);
    }
    for (const w of this.rails.warnings()) if (!this.warnings.includes(w)) this.warnings.push(w);
    if (this.warnings.length > 8) this.warnings.splice(0, this.warnings.length - 8);
    return out;
  }
}
