// 執行排程：即時速度校準、慢動作、單步、中斷點、跳過函式、執行到游標
import { insnLength } from './cpu/disasm.js';

const MAX_SIM_PER_FRAME_US = 50000;   // 每幀最多模擬 50ms（避免分頁切回時追趕爆衝）
const MAX_REAL_MS_PER_FRAME = 12;     // 全速模式每幀最多佔用的實際時間

export class Runner {
  constructor(sim, hooks) {
    this.sim = sim;
    this.hooks = hooks || {};   // onFrame(sample, info), onStop(reason)
    this.speed = 1;             // 倍率；Infinity = 全速
    this.running = false;
    this.lastT = 0;
    this.carryUs = 0;
    this._raf = null;
    this.stopReason = '';
  }
  get cpu() { return this.sim.cpu; }

  start() {
    if (this.running) return;
    this.running = true;
    this.stopReason = '';
    this.lastT = performance.now();
    this.carryUs = 0;
    // 若停在中斷點上，先跨過一條
    if (this.cpu.breakpoints.has(this.cpu.pc)) this.cpu.step();
    this._loop();
  }
  stop(reason = '手動暫停') {
    if (!this.running) return;
    this.running = false;
    this.stopReason = reason;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._emitFrame(0);
    if (this.hooks.onStop) this.hooks.onStop(reason);
  }
  toggle() { this.running ? this.stop() : this.start(); }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(now - this.lastT, 100);
    this.lastT = now;
    const start = this.cpu.cycles;
    // RST 被杜邦線接到 VCC → 晶片一直被按住重置，這一幀不執行任何指令
    const held = !!(this.sim.rails && this.sim.rails.heldInReset);
    if (held) {
      this.cpu.reset();
      this.carryUs = 0;
    } else if (this.speed === Infinity) {
      const deadline = now + MAX_REAL_MS_PER_FRAME;
      while (performance.now() < deadline) {
        this.cpu.run(20000);
        if (this.cpu.hitBreakpoint) break;
      }
    } else {
      this.carryUs += dt * 1000 * this.speed;
      let budget = Math.min(this.carryUs, MAX_SIM_PER_FRAME_US);
      if (budget >= 1) {
        const ran = this.cpu.run(Math.floor(budget));
        this.carryUs -= ran;
        if (this.carryUs > MAX_SIM_PER_FRAME_US) this.carryUs = 0;
      }
    }
    const frameCycles = this.cpu.cycles - start;
    this._emitFrame(frameCycles);
    if (this.cpu.hitBreakpoint) { this.stop(`中斷點 @ ${this.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}H`); return; }
    this._raf = requestAnimationFrame(() => this._loop());
  }
  _emitFrame(frameCycles) {
    const sample = this.sim.frame(frameCycles);
    if (this.hooks.onFrame) this.hooks.onFrame(sample, { frameCycles, speed: this.speed, running: this.running });
  }

  // 單步一條指令
  step() {
    if (this.running) this.stop();
    const s = this.cpu.cycles;
    this.cpu.step();
    this._emitFrame(this.cpu.cycles - s);
  }
  // 跳過函式（LCALL/ACALL 視為一步）
  stepOver() {
    if (this.running) this.stop();
    const op = this.cpu.code[this.cpu.pc];
    const isCall = op === 0x12 || (op & 0x1F) === 0x11;
    if (!isCall) return this.step();
    const target = (this.cpu.pc + insnLength(this.cpu.code, this.cpu.pc)) & 0xFFFF;
    this._runUntil((c) => c.pc === target, 5e6);
  }
  // 單步一行 C（執行到對應行號改變）
  stepLine() {
    if (this.running) this.stop();
    const cur = this.sim.lineOfAddr(this.cpu.pc);
    let lastLine = cur;
    this._runUntil((c) => {
      const l = this.sim.lineOfAddr(c.pc);
      if (l != null && l !== lastLine) return true;
      return false;
    }, 2e6, true);
  }
  // 執行到指定位址
  runTo(addr) {
    if (this.running) this.stop();
    this._runUntil((c) => c.pc === addr, 20e6);
  }
  // 執行直到跳出目前函式（追蹤 SP）
  stepOut() {
    if (this.running) this.stop();
    const sp0 = this.cpu.sp;
    this._runUntil((c) => c.sp < sp0 - 1, 20e6);
  }
  _runUntil(pred, maxCycles, skipFirst = false) {
    const s = this.cpu.cycles;
    let first = true;
    while (this.cpu.cycles - s < maxCycles) {
      if (!first || !skipFirst) { if (pred(this.cpu)) break; }
      first = false;
      this.cpu.step();
      if (this.cpu.breakpoints.has(this.cpu.pc)) break;
    }
    this._emitFrame(this.cpu.cycles - s);
  }
  reset() {
    const wasRunning = this.running;
    if (wasRunning) this.stop('重置');
    this.sim.reset();
    this._emitFrame(0);
  }
}
