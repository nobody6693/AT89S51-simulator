// SPI 週邊（主板 JP10 位元敲擊）：MCP3202 12-bit ADC、MCP4822 12-bit DAC
// 共用 SCK / SDI；ADC 有 SDO（DOUT）；各自 CS。
// MCP3202：CS 低後，SDI 於 SCK 上升緣取樣：Start(1)、SGL/DIFF、ODD/SIGN、MSBF；
//          之後 SDO 於 SCK 下降緣輸出：null bit(0) 再 B11..B0。
// MCP4822：CS 低後 16 bit 於上升緣取樣：[A/B][x][GA][SHDN][D11..D0]，CS 上升緣寫入；
//          LDAC 低（或接地）→ 輸出更新。

import { readPin } from './util.js';

const VREF_ADC = 5.0;    // MCP3202 VDD/VREF = +5V
const VREF_DAC = 2.048;  // MCP4822 內建參考

export class Spi {
  constructor(sim) {
    this.sim = sim;
    // 類比輸入：CH0 = VR1 可變電阻 (0–5V)、CH1 = LM35 (10mV/°C)
    this.potVolts = 2.5;
    this.tempC = 25.0;
    this.reset();
    sim.bus.addDriver(this);
    sim.bus.onPinChange((port) => this._edge());
  }
  get w() { return this.sim.wiring; }
  reset() {
    this.adc = { active: false, bitIn: 0, shiftIn: 0, phase: 'cmd', outBits: [], outIdx: 0, result: 0, lastCh: 0 };
    this.dac = { active: false, shift: 0, nbits: 0, latchA: 0, latchB: 0, regA: 0, regB: 0, gainA: 1, gainB: 1, shdnA: false, shdnB: false };
    this.sdo = 1;
    this.lastSck = 1; this.lastAdcCs = 1; this.lastDacCs = 1;
    this.log = [];
  }
  channelVolts(ch) {
    if (ch === 0) return this.potVolts;
    return this.sim.wiring.cfg.jp11 === false ? 0 : this.tempC * 0.01;
  }
  channelCode(ch) { return Math.max(0, Math.min(4095, Math.round(this.channelVolts(ch) / VREF_ADC * 4096))); }

  update(pins) {
    const low = [0, 0, 0, 0], high = [0, 0, 0, 0];
    if (!this.w.isEnabled('spi')) return { low, high };
    const sdo = this.w.pins.spiSdo;
    if (sdo && this.adc.active) {
      if (this.sdo) high[sdo.port] |= (1 << sdo.bit); else low[sdo.port] |= (1 << sdo.bit);
    }
    return { low, high };
  }

  _edge() {
    if (!this.w.isEnabled('spi')) return;
    const pins = this.sim.bus.pins, p = this.w.pins;
    const sck = readPin(pins, p.spiSck), sdi = readPin(pins, p.spiSdi);
    const adcCs = p.adcCs ? readPin(pins, p.adcCs) : 1;
    const dacCs = p.dacCs ? readPin(pins, p.dacCs) : 1;
    const ld = p.dacLd ? readPin(pins, p.dacLd) : 0;
    const rising = this.lastSck === 0 && sck === 1, falling = this.lastSck === 1 && sck === 0;

    // ---- MCP3202 ----
    if (this.lastAdcCs === 1 && adcCs === 0) { this.adc.active = true; this.adc.phase = 'cmd'; this.adc.bitIn = 0; this.adc.shiftIn = 0; this.adc.outBits = []; this.adc.outIdx = 0; this.sdo = 1; }
    if (adcCs === 1) this.adc.active = false;
    if (this.adc.active) {
      const a = this.adc;
      if (rising && a.phase === 'cmd') {
        if (a.bitIn === 0) { if (sdi) a.bitIn = 1; } // 等 start bit
        else {
          a.shiftIn = (a.shiftIn << 1) | sdi; a.bitIn++;
          if (a.bitIn === 4) { // 已收 SGL/DIFF, ODD/SIGN, MSBF
            const sgl = (a.shiftIn >> 2) & 1, odd = (a.shiftIn >> 1) & 1, msbf = a.shiftIn & 1;
            let code;
            if (sgl) code = this.channelCode(odd);
            else { code = this.channelCode(odd) - this.channelCode(odd ^ 1); code = Math.max(0, Math.min(4095, code)); }
            a.lastCh = odd; a.result = code;
            const bits = [0]; // null bit
            for (let i = 11; i >= 0; i--) bits.push((code >> i) & 1);
            if (!msbf) for (let i = 1; i < 12; i++) bits.push((code >> i) & 1); // LSB-first 補送
            a.outBits = bits; a.outIdx = 0; a.phase = 'data';
            this.log.push(`ADC CH${odd} → ${code} (${this.channelVolts(odd).toFixed(3)} V)`); if (this.log.length > 32) this.log.shift();
          }
        }
      } else if (falling && a.phase === 'data') {
        this.sdo = a.outIdx < a.outBits.length ? a.outBits[a.outIdx++] : 0;
        this.sim.bus.invalidate();
      }
    }

    // ---- MCP4822 ----
    if (this.lastDacCs === 1 && dacCs === 0) { this.dac.active = true; this.dac.shift = 0; this.dac.nbits = 0; }
    if (this.dac.active && rising) { this.dac.shift = ((this.dac.shift << 1) | sdi) & 0xFFFF; this.dac.nbits++; }
    if (this.lastDacCs === 0 && dacCs === 1 && this.dac.active) {
      this.dac.active = false;
      if (this.dac.nbits >= 16) {
        const w = this.dac.shift;
        const ab = (w >> 15) & 1, ga = (w >> 13) & 1, shdn = (w >> 12) & 1, d = w & 0xFFF;
        if (ab) { this.dac.regB = d; this.dac.gainB = ga ? 1 : 2; this.dac.shdnB = !shdn; }
        else { this.dac.regA = d; this.dac.gainA = ga ? 1 : 2; this.dac.shdnA = !shdn; }
        this.log.push(`DAC ${ab ? 'B' : 'A'} ← ${d} ×${ga ? 1 : 2}${shdn ? '' : ' (關閉)'}`); if (this.log.length > 32) this.log.shift();
        if (ld === 0) this._latch();
      }
    }
    if (p.dacLd && ld === 0 && this.lastLd === 1) this._latch();
    this.lastLd = ld;
    this.lastSck = sck; this.lastAdcCs = adcCs; this.lastDacCs = dacCs;
  }
  _latch() { this.dac.latchA = this.dac.regA; this.dac.latchB = this.dac.regB; }
  get voutA() { return this.dac.shdnA ? 0 : this.dac.latchA / 4096 * VREF_DAC * this.dac.gainA; }
  get voutB() { return this.dac.shdnB ? 0 : this.dac.latchB / 4096 * VREF_DAC * this.dac.gainB; }
}
