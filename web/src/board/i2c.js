// I²C 匯流排（主板 JP1，4.7K 上拉）：24LC16B EEPROM + TC74A0 溫度感測器
// 由 CPU 位元敲擊 SDA/SCL。從屬裝置在 ACK 位元與讀取資料的 0 位元時拉低 SDA。
// 從屬於 SCL 下降緣後更新 SDA 驅動；主控於 SCL 上升緣取樣。

import { readPin } from './util.js';

const EEPROM_ADDR = 0b1010;   // 24LC16B：1010 + 3 bit block（A2..A0 為 block 位址）
const TC74_ADDR = 0x48;       // TC74A0 = 1001 000

export class I2c {
  constructor(sim) {
    this.sim = sim;
    this.eeprom = new Uint8Array(2048); this.eeprom.fill(0xFF);
    this.tempC = 25;           // TC74 溫度（可由 UI 調整，與 LM35 共用同一環境溫度）
    this.reset();
    sim.bus.addDriver(this);
    sim.bus.onPinChange(() => this._edge());
  }
  get w() { return this.sim.wiring; }
  reset() {
    this.state = 'idle';       // idle | addr | ack | data
    this.bitCount = 0; this.shift = 0;
    this.slave = null;         // 'eeprom' | 'tc74' | null
    this.rw = 0;               // 0 = 主控寫, 1 = 主控讀
    this.sdaDrive = 1;         // 從屬驅動 SDA（1 = 釋放）
    this.eeAddr = 0; this.eeBlock = 0; this.eeState = 'addr'; // addr | data
    this.tcReg = 0; this.tcState = 'reg';
    this.masterAck = 1;
    this.lastSda = 1; this.lastScl = 1; this.lastSdaPin = 1; this.lastSdaMaster = 1;
    this._afterAck = false; this._pendingRead = false; this.ackBy = null; this.sdaDriveChanged = false; this.readByte = 0xFF;
    this.log = [];
  }
  _log(s) { this.log.push(s); if (this.log.length > 48) this.log.shift(); }

  update() {
    const low = [0, 0, 0, 0];
    if (!this.w.isEnabled('i2c')) return { low };
    const sda = this.w.pins.sda;
    if (sda && !this.sdaDrive) low[sda.port] |= (1 << sda.bit);
    return { low };
  }

  _edge() {
    if (!this.w.isEnabled('i2c')) return;
    const pins = this.sim.bus.pins, latch = this.sim.bus.latch, p = this.w.pins;
    if (!p.sda || !p.scl) return;
    const scl = readPin(pins, p.scl);
    const sdaMaster = (latch[p.sda.port] >> p.sda.bit) & 1; // 主控意圖（latch）
    const sdaPin = readPin(pins, p.sda);

    // START / STOP：SCL 高時由主控改變 SDA
    if (scl && this.lastScl && sdaMaster !== this.lastSdaMaster) {
      if (sdaMaster === 0) { this.state = 'addr'; this.bitCount = 0; this.shift = 0; this.ackBy = null; this._afterAck = false; this._setDrive(1); this._log('START'); }
      else if (this.sdaDrive) this._stop();
    }
    const rising = !this.lastScl && scl, falling = this.lastScl && !scl;
    if (rising && this.state !== 'idle') this._sample(sdaPin);
    if (falling && this.state !== 'idle') this._drive();

    this.lastScl = scl; this.lastSdaPin = sdaPin; this.lastSdaMaster = sdaMaster;
    if (this.sdaDriveChanged) { this.sdaDriveChanged = false; this.sim.bus.invalidate(); }
  }
  writeProtected() {
    const ref = this.sim.wiring.pins && this.sim.wiring.pins.i2cWp;
    if (!ref) return false;
    return ((this.sim.bus.pins[ref.port] >> ref.bit) & 1) === 1;
  }
  _stop() { if (this.state !== 'idle') this._log('STOP'); this.state = 'idle'; this.slave = null; this._setDrive(1); this.eeState = 'addr'; this.tcState = 'reg'; this.ackBy = null; this._afterAck = false; }
  _setDrive(v) { if (this.sdaDrive !== v) { this.sdaDrive = v; this.sdaDriveChanged = true; } }

  // SCL 上升緣：主控在此取樣（讀方向），或我們取樣主控送出的位元（寫方向）
  _sample(sda) {
    if (this.state === 'addr' || (this.state === 'data' && this.rw === 0)) {
      this.shift = ((this.shift << 1) | sda) & 0xFF; this.bitCount++;
      if (this.bitCount === 8) {
        if (this.state === 'addr') this._gotAddress(this.shift); else this._gotData(this.shift);
        this.state = 'ack'; this.ackBy = 'slave'; this.bitCount = 0;
      }
    } else if (this.state === 'data' && this.rw === 1) {
      this.bitCount++;                       // 主控讀走一位元
      if (this.bitCount === 8) { this.state = 'ack'; this.ackBy = 'master'; this.bitCount = 0; }
    } else if (this.state === 'ack' && this.ackBy === 'master') {
      this.masterAck = sda;                  // 主控回 ACK(0) 繼續 / NACK(1) 結束
      if (sda === 0) this._pendingRead = true; else { this._log('主控 NACK，結束讀取'); this.state = 'idle'; }
    }
  }
  // SCL 下降緣：從屬只在此改變 SDA
  _drive() {
    if (this._afterAck) {
      // 從屬 ACK 位元結束：釋放，進入資料階段
      this._afterAck = false;
      if (!this.slave) { this.state = 'idle'; this._setDrive(1); return; }
      this.state = 'data'; this.bitCount = 0; this.shift = 0;
      if (this.rw) this._prepareRead(); else this._setDrive(1);
    } else if (this.state === 'ack' && this.ackBy === 'slave') {
      this._setDrive(this.slave ? 0 : 1);   // 我們拉低 ACK
      this._afterAck = true;
    } else if (this.state === 'ack' && this.ackBy === 'master') {
      this._setDrive(1);                     // 釋放給主控回 ACK
    } else if (this._pendingRead) {
      this._pendingRead = false; this.state = 'data'; this._prepareRead();
    } else if (this.state === 'data' && this.rw === 1) {
      this._setDrive((this.readByte >> (7 - this.bitCount)) & 1);
    } else this._setDrive(1);
  }
  _gotAddress(b) {
    const a7 = b >> 1; this.rw = b & 1;
    if ((a7 >> 3) === EEPROM_ADDR) { this.slave = 'eeprom'; this.eeBlock = a7 & 7; this._log(`位址 ${(b).toString(16).toUpperCase()}h → 24LC16B block ${this.eeBlock} ${this.rw ? '讀' : '寫'}`); if (this.rw) this.eeState = 'data'; }
    else if (a7 === TC74_ADDR) { this.slave = 'tc74'; this._log(`位址 ${(b).toString(16).toUpperCase()}h → TC74 ${this.rw ? '讀' : '寫'}`); }
    else { this.slave = null; this._log(`位址 ${(b).toString(16).toUpperCase()}h → 無裝置回應 (NACK)`); }
    if (this.rw && this.slave) { /* 讀取：ACK 後直接送資料 */ }
  }
  _gotData(b) {
    if (this.slave === 'eeprom') {
      if (this.eeState === 'addr') { this.eeAddr = b; this.eeState = 'data'; this._log(`EEPROM 位址 ← ${b.toString(16).toUpperCase()}h`); }
      else {
        const full = (this.eeBlock << 8) | this.eeAddr;
        if (this.writeProtected()) this._log(`EEPROM[${full.toString(16).toUpperCase()}h] 寫入被 WP 擋下`);
        else { this.eeprom[full] = b; this._log(`EEPROM[${full.toString(16).toUpperCase()}h] ← ${b.toString(16).toUpperCase()}h`); }
        this.eeAddr = (this.eeAddr & 0xF0) | ((this.eeAddr + 1) & 0x0F);
      }
    } else if (this.slave === 'tc74') {
      if (this.tcState === 'reg') { this.tcReg = b; this.tcState = 'data'; this._log(`TC74 暫存器指標 ← ${b}`); }
      else this._log(`TC74 config ← ${b.toString(16).toUpperCase()}h`);
    }
  }
  _prepareRead() {
    if (this.slave === 'eeprom') { const full = (this.eeBlock << 8) | this.eeAddr; this.readByte = this.eeprom[full]; this._log(`EEPROM[${full.toString(16).toUpperCase()}h] → ${this.readByte.toString(16).toUpperCase()}h`); this.eeAddr = (this.eeAddr + 1) & 0xFF; }
    else if (this.slave === 'tc74') { this.readByte = this.tcReg === 0 ? (Math.round(this.tempC) & 0xFF) : 0x40; this._log(`TC74 → ${this.readByte} (${this.tcReg === 0 ? '溫度' : 'config'})`); }
    else this.readByte = 0xFF;
    this.bitCount = 0;
    this._setDrive((this.readByte >> 7) & 1);
  }
}
