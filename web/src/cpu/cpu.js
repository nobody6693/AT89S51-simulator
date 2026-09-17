// 8051 (AT89S51) CPU 核心
// 12MHz / 12 = 1 機械週期 = 1µs。所有時序以機械週期為單位。

import { SFR, PSW_CY, PSW_AC, PSW_OV, PSW_P, bitAddrToByte, bitAddrToMask,
         TCON_IE0, TCON_IE1, TCON_IT0, TCON_IT1, TCON_TF0, TCON_TF1, TCON_TR0, TCON_TR1,
         IE_EA, IE_EX0, IE_ET0, IE_EX1, IE_ET1, IE_ES,
         SCON_RI, SCON_TI, SCON_REN } from './sfr.js';
import { PortBus } from './ports.js';

const PORT_ADDR = { 0x80: 0, 0x90: 1, 0xA0: 2, 0xB0: 3 };

export class CPU8051 {
  constructor() {
    this.code = new Uint8Array(0x10000);
    this.iram = new Uint8Array(256);
    this.sfr = new Uint8Array(128);   // index = addr - 0x80
    this.xram = new Uint8Array(0x10000);
    this.bus = new PortBus();
    this.pc = 0;
    this.cycles = 0;          // 累計機械週期
    this.halted = false;
    this.codeSize = 0;

    // 中斷狀態
    this.intHighActive = false;
    this.intLowActive = false;
    this.prevINT0 = 1; this.prevINT1 = 1;
    this.prevT0 = 1; this.prevT1 = 1;

    // UART
    this.uartTxCountdown = 0;   // 剩餘週期
    this.uartTxByte = 0;
    this.uartRxQueue = [];
    this.uartRxCountdown = 0;
    this.uartRxShift = 0;
    this.onUartTx = null;       // callback(byte)
    this.t1OverflowsForBaud = 0;

    // 追蹤（除錯用）
    this.onSfrWrite = null;     // (addr, val)
    this.trace = null;          // callback(pc) 每指令
    this.breakpoints = new Set();
    this.hitBreakpoint = false;

    this.reset();
  }

  // ---------- 重置 ----------
  reset() {
    this.iram.fill(0);
    this.sfr.fill(0);
    this.sfr[SFR.SP - 0x80] = 0x07;
    this.sfr[SFR.P0 - 0x80] = 0xFF; this.sfr[SFR.P1 - 0x80] = 0xFF;
    this.sfr[SFR.P2 - 0x80] = 0xFF; this.sfr[SFR.P3 - 0x80] = 0xFF;
    this.bus.reset();
    this.pc = 0;
    this.cycles = 0;
    this.halted = false;
    this.intHighActive = this.intLowActive = false;
    this.prevINT0 = this.prevINT1 = this.prevT0 = this.prevT1 = 1;
    this.uartTxCountdown = 0; this.uartRxCountdown = 0;
    this.uartRxQueue = [];
    this.hitBreakpoint = false;
  }

  loadHex(text) {
    this.code.fill(0);
    let max = 0;
    let segBase = 0;
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line.startsWith(':')) continue;
      const len = parseInt(line.substr(1, 2), 16);
      const addr = parseInt(line.substr(3, 4), 16);
      const type = parseInt(line.substr(7, 2), 16);
      if (type === 0) {
        for (let i = 0; i < len; i++) {
          const a = segBase + addr + i;
          if (a < 0x10000) { this.code[a] = parseInt(line.substr(9 + i * 2, 2), 16); if (a + 1 > max) max = a + 1; }
        }
      } else if (type === 2) segBase = parseInt(line.substr(9, 4), 16) << 4;
      else if (type === 4) segBase = parseInt(line.substr(9, 4), 16) << 16;
      else if (type === 1) break;
    }
    this.codeSize = max;
    return max;
  }

  // ---------- 記憶體存取 ----------
  get acc() { return this.sfr[SFR.ACC - 0x80]; }
  set acc(v) { this.sfr[SFR.ACC - 0x80] = v & 0xFF; }
  get psw() { return this.sfr[SFR.PSW - 0x80]; }
  set psw(v) { this.sfr[SFR.PSW - 0x80] = v & 0xFF; }
  get sp() { return this.sfr[SFR.SP - 0x80]; }
  set sp(v) { this.sfr[SFR.SP - 0x80] = v & 0xFF; }
  get dptr() { return (this.sfr[SFR.DPH - 0x80] << 8) | this.sfr[SFR.DPL - 0x80]; }
  set dptr(v) { this.sfr[SFR.DPH - 0x80] = (v >> 8) & 0xFF; this.sfr[SFR.DPL - 0x80] = v & 0xFF; }
  get b() { return this.sfr[SFR.B - 0x80]; }
  set b(v) { this.sfr[SFR.B - 0x80] = v & 0xFF; }

  regBase() { return this.psw & 0x18; }
  getR(n) { return this.iram[this.regBase() + n]; }
  setR(n, v) { this.iram[this.regBase() + n] = v & 0xFF; }

  parityOfAcc() {
    let a = this.acc, p = 0;
    while (a) { p ^= 1; a &= a - 1; }
    return p;
  }

  // 直接定址讀取。rmw=true 表示讀改寫指令（埠讀 latch），否則埠讀腳位
  readDirect(addr, rmw = false) {
    if (addr < 0x80) return this.iram[addr];
    const p = PORT_ADDR[addr];
    if (p !== undefined) return rmw ? this.bus.latch[p] : this.bus.pins[p];
    if (addr === SFR.PSW) {
      const v = (this.sfr[addr - 0x80] & ~PSW_P) | this.parityOfAcc();
      return v;
    }
    if (addr === SFR.SBUF) return this.sfr[addr - 0x80];
    return this.sfr[addr - 0x80];
  }

  writeDirect(addr, val) {
    val &= 0xFF;
    if (addr < 0x80) { this.iram[addr] = val; return; }
    const p = PORT_ADDR[addr];
    if (p !== undefined) { this.sfr[addr - 0x80] = val; this.bus.write(p, val); return; }
    if (addr === SFR.SBUF) { this.uartTransmit(val); return; }
    this.sfr[addr - 0x80] = val;
    if (this.onSfrWrite) this.onSfrWrite(addr, val);
  }

  readBit(bit) {
    const byte = bitAddrToByte(bit), mask = bitAddrToMask(bit);
    return (this.readDirect(byte, false) & mask) ? 1 : 0;
  }
  writeBit(bit, v) {
    const byte = bitAddrToByte(bit), mask = bitAddrToMask(bit);
    const cur = this.readDirect(byte, true);
    this.writeDirect(byte, v ? (cur | mask) : (cur & ~mask));
  }

  push(v) { this.sp = this.sp + 1; this.iram[this.sp] = v & 0xFF; }
  pop() { const v = this.iram[this.sp]; this.sp = this.sp - 1; return v; }

  fetch() { return this.code[this.pc++ & 0xFFFF]; }

  // ---------- 旗標運算 ----------
  add(a, b, c) {
    const r = a + b + c;
    const ac = ((a & 0x0F) + (b & 0x0F) + c) > 0x0F;
    const cy = r > 0xFF;
    const r7 = ((a & 0x7F) + (b & 0x7F) + c) > 0x7F;
    const ov = (cy !== r7);
    let psw = this.psw & ~(PSW_CY | PSW_AC | PSW_OV);
    if (cy) psw |= PSW_CY;
    if (ac) psw |= PSW_AC;
    if (ov) psw |= PSW_OV;
    this.psw = psw;
    return r & 0xFF;
  }
  sub(a, b, c) {
    const r = a - b - c;
    const cy = r < 0;
    const ac = ((a & 0x0F) - (b & 0x0F) - c) < 0;
    const r7 = ((a & 0x7F) - (b & 0x7F) - c) < 0;
    const ov = (cy !== r7);
    let psw = this.psw & ~(PSW_CY | PSW_AC | PSW_OV);
    if (cy) psw |= PSW_CY;
    if (ac) psw |= PSW_AC;
    if (ov) psw |= PSW_OV;
    this.psw = psw;
    return r & 0xFF;
  }
  get cy() { return (this.psw & PSW_CY) ? 1 : 0; }
  set cy(v) { this.psw = v ? (this.psw | PSW_CY) : (this.psw & ~PSW_CY); }

  // ---------- 執行 ----------
  // 執行一條指令，回傳消耗的機械週期
  step() {
    if (this.trace) this.trace(this.pc);
    const pcStart = this.pc;
    const op = this.fetch();
    let cyc = 1;
    const hi = op >> 4, lo = op & 0x0F;

    // 規則區（lo >= 4）：算術/邏輯/搬移類
    // 運算元取得
    const operandRead = (rmw) => {
      // 回傳 [value, writeback(v)]
      if (lo === 5) { const a = this.fetch(); return [this.readDirect(a, rmw), (v) => this.writeDirect(a, v), a]; }
      if (lo === 6 || lo === 7) { const a = this.getR(lo - 6); return [this.iram[a], (v) => { this.iram[a] = v & 0xFF; }, a]; }
      if (lo >= 8) { const n = lo - 8; return [this.getR(n), (v) => this.setR(n, v), n]; }
      return null;
    };

    switch (op) {
      case 0x00: break; // NOP
      case 0x01: case 0x21: case 0x41: case 0x61: case 0x81: case 0xA1: case 0xC1: case 0xE1: { // AJMP
        const a = this.fetch();
        this.pc = (this.pc & 0xF800) | ((op & 0xE0) << 3) | a; cyc = 2; break;
      }
      case 0x11: case 0x31: case 0x51: case 0x71: case 0x91: case 0xB1: case 0xD1: case 0xF1: { // ACALL
        const a = this.fetch();
        this.push(this.pc & 0xFF); this.push(this.pc >> 8);
        this.pc = (this.pc & 0xF800) | ((op & 0xE0) << 3) | a; cyc = 2; break;
      }
      case 0x02: { const h = this.fetch(), l = this.fetch(); this.pc = (h << 8) | l; cyc = 2; break; } // LJMP
      case 0x12: { const h = this.fetch(), l = this.fetch(); this.push(this.pc & 0xFF); this.push(this.pc >> 8); this.pc = (h << 8) | l; cyc = 2; break; } // LCALL
      case 0x22: { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; cyc = 2; break; } // RET
      case 0x32: { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; cyc = 2; this.retiFromInterrupt(); break; } // RETI
      case 0x03: this.acc = ((this.acc >> 1) | (this.acc << 7)) & 0xFF; break; // RR A
      case 0x13: { const c = this.cy; this.cy = this.acc & 1; this.acc = (this.acc >> 1) | (c << 7); break; } // RRC A
      case 0x23: this.acc = ((this.acc << 1) | (this.acc >> 7)) & 0xFF; break; // RL A
      case 0x33: { const c = this.cy; this.cy = this.acc >> 7; this.acc = ((this.acc << 1) | c) & 0xFF; break; } // RLC A
      case 0x04: this.acc = this.acc + 1; break; // INC A
      case 0x14: this.acc = this.acc - 1; break; // DEC A
      case 0x05: case 0x06: case 0x07: case 0x08: case 0x09: case 0x0A: case 0x0B: case 0x0C: case 0x0D: case 0x0E: case 0x0F: { // INC
        const [v, wb] = operandRead(true); wb(v + 1); break;
      }
      case 0x15: case 0x16: case 0x17: case 0x18: case 0x19: case 0x1A: case 0x1B: case 0x1C: case 0x1D: case 0x1E: case 0x1F: { // DEC
        const [v, wb] = operandRead(true); wb(v - 1); break;
      }
      case 0x10: { // JBC bit,rel
        const bit = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2;
        const byte = bitAddrToByte(bit), mask = bitAddrToMask(bit);
        const cur = this.readDirect(byte, true);
        if (cur & mask) { this.writeDirect(byte, cur & ~mask); this.pc = (this.pc + rel) & 0xFFFF; }
        break;
      }
      case 0x20: { const bit = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; if (this.readBit(bit)) this.pc = (this.pc + rel) & 0xFFFF; break; } // JB
      case 0x30: { const bit = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; if (!this.readBit(bit)) this.pc = (this.pc + rel) & 0xFFFF; break; } // JNB
      case 0x40: { const rel = (this.fetch() << 24) >> 24; cyc = 2; if (this.cy) this.pc = (this.pc + rel) & 0xFFFF; break; } // JC
      case 0x50: { const rel = (this.fetch() << 24) >> 24; cyc = 2; if (!this.cy) this.pc = (this.pc + rel) & 0xFFFF; break; } // JNC
      case 0x60: { const rel = (this.fetch() << 24) >> 24; cyc = 2; if (this.acc === 0) this.pc = (this.pc + rel) & 0xFFFF; break; } // JZ
      case 0x70: { const rel = (this.fetch() << 24) >> 24; cyc = 2; if (this.acc !== 0) this.pc = (this.pc + rel) & 0xFFFF; break; } // JNZ
      case 0x80: { const rel = (this.fetch() << 24) >> 24; cyc = 2; this.pc = (this.pc + rel) & 0xFFFF; break; } // SJMP
      case 0x24: { this.acc = this.add(this.acc, this.fetch(), 0); break; } // ADD A,#imm
      case 0x25: case 0x26: case 0x27: case 0x28: case 0x29: case 0x2A: case 0x2B: case 0x2C: case 0x2D: case 0x2E: case 0x2F: {
        const [v] = operandRead(false); this.acc = this.add(this.acc, v, 0); break;
      }
      case 0x34: { this.acc = this.add(this.acc, this.fetch(), this.cy); break; } // ADDC
      case 0x35: case 0x36: case 0x37: case 0x38: case 0x39: case 0x3A: case 0x3B: case 0x3C: case 0x3D: case 0x3E: case 0x3F: {
        const [v] = operandRead(false); this.acc = this.add(this.acc, v, this.cy); break;
      }
      case 0x42: { const a = this.fetch(); this.writeDirect(a, this.readDirect(a, true) | this.acc); break; } // ORL direct,A
      case 0x43: { const a = this.fetch(), i = this.fetch(); cyc = 2; this.writeDirect(a, this.readDirect(a, true) | i); break; } // ORL direct,#imm
      case 0x44: { this.acc |= this.fetch(); break; }
      case 0x45: case 0x46: case 0x47: case 0x48: case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F: {
        const [v] = operandRead(false); this.acc |= v; break;
      }
      case 0x52: { const a = this.fetch(); this.writeDirect(a, this.readDirect(a, true) & this.acc); break; } // ANL direct,A
      case 0x53: { const a = this.fetch(), i = this.fetch(); cyc = 2; this.writeDirect(a, this.readDirect(a, true) & i); break; }
      case 0x54: { this.acc &= this.fetch(); break; }
      case 0x55: case 0x56: case 0x57: case 0x58: case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5E: case 0x5F: {
        const [v] = operandRead(false); this.acc &= v; break;
      }
      case 0x62: { const a = this.fetch(); this.writeDirect(a, this.readDirect(a, true) ^ this.acc); break; } // XRL direct,A
      case 0x63: { const a = this.fetch(), i = this.fetch(); cyc = 2; this.writeDirect(a, this.readDirect(a, true) ^ i); break; }
      case 0x64: { this.acc ^= this.fetch(); break; }
      case 0x65: case 0x66: case 0x67: case 0x68: case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6E: case 0x6F: {
        const [v] = operandRead(false); this.acc ^= v; break;
      }
      case 0x72: { const bit = this.fetch(); cyc = 2; this.cy = this.cy | this.readBit(bit); break; } // ORL C,bit
      case 0x73: { this.pc = (this.acc + this.dptr) & 0xFFFF; cyc = 2; break; } // JMP @A+DPTR
      case 0x74: { this.acc = this.fetch(); break; } // MOV A,#imm
      case 0x75: { const a = this.fetch(), i = this.fetch(); cyc = 2; this.writeDirect(a, i); break; } // MOV direct,#imm
      case 0x76: case 0x77: { const i = this.fetch(); this.iram[this.getR(op - 0x76)] = i; break; } // MOV @Ri,#imm
      case 0x78: case 0x79: case 0x7A: case 0x7B: case 0x7C: case 0x7D: case 0x7E: case 0x7F: { this.setR(op - 0x78, this.fetch()); break; } // MOV Rn,#imm
      case 0x82: { const bit = this.fetch(); cyc = 2; this.cy = this.cy & this.readBit(bit); break; } // ANL C,bit
      case 0x83: { this.acc = this.code[(this.acc + this.pc) & 0xFFFF]; cyc = 2; break; } // MOVC A,@A+PC
      case 0x84: { // DIV AB
        cyc = 4;
        const b = this.b;
        let psw = this.psw & ~(PSW_CY | PSW_OV);
        if (b === 0) { psw |= PSW_OV; }
        else { const q = Math.floor(this.acc / b), r = this.acc % b; this.acc = q; this.b = r; }
        this.psw = psw; break;
      }
      case 0x85: { const src = this.fetch(), dst = this.fetch(); cyc = 2; this.writeDirect(dst, this.readDirect(src, false)); break; } // MOV direct,direct
      case 0x86: case 0x87: { const dst = this.fetch(); cyc = 2; this.writeDirect(dst, this.iram[this.getR(op - 0x86)]); break; } // MOV direct,@Ri
      case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F: { const dst = this.fetch(); cyc = 2; this.writeDirect(dst, this.getR(op - 0x88)); break; } // MOV direct,Rn
      case 0x90: { const h = this.fetch(), l = this.fetch(); cyc = 2; this.dptr = (h << 8) | l; break; } // MOV DPTR,#imm16
      case 0x92: { const bit = this.fetch(); cyc = 2; this.writeBit(bit, this.cy); break; } // MOV bit,C
      case 0x93: { this.acc = this.code[(this.acc + this.dptr) & 0xFFFF]; cyc = 2; break; } // MOVC A,@A+DPTR
      case 0x94: { this.acc = this.sub(this.acc, this.fetch(), this.cy); break; } // SUBB A,#imm
      case 0x95: case 0x96: case 0x97: case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F: {
        const [v] = operandRead(false); this.acc = this.sub(this.acc, v, this.cy); break;
      }
      case 0xA0: { const bit = this.fetch(); cyc = 2; this.cy = this.cy | (this.readBit(bit) ^ 1); break; } // ORL C,/bit
      case 0xA2: { const bit = this.fetch(); this.cy = this.readBit(bit); break; } // MOV C,bit
      case 0xA3: { this.dptr = (this.dptr + 1) & 0xFFFF; cyc = 2; break; } // INC DPTR
      case 0xA4: { // MUL AB
        cyc = 4;
        const r = this.acc * this.b;
        this.acc = r & 0xFF; this.b = r >> 8;
        let psw = this.psw & ~(PSW_CY | PSW_OV);
        if (r > 0xFF) psw |= PSW_OV;
        this.psw = psw; break;
      }
      case 0xA5: break; // 未定義
      case 0xA6: case 0xA7: { const src = this.fetch(); cyc = 2; this.iram[this.getR(op - 0xA6)] = this.readDirect(src, false); break; } // MOV @Ri,direct
      case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF: { const src = this.fetch(); cyc = 2; this.setR(op - 0xA8, this.readDirect(src, false)); break; } // MOV Rn,direct
      case 0xB0: { const bit = this.fetch(); cyc = 2; this.cy = this.cy & (this.readBit(bit) ^ 1); break; } // ANL C,/bit
      case 0xB2: { const bit = this.fetch(); this.writeBit(bit, this.readBitLatch(bit) ^ 1); break; } // CPL bit
      case 0xB3: { this.cy = this.cy ^ 1; break; } // CPL C
      case 0xB4: { const i = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; this.cy = this.acc < i ? 1 : 0; if (this.acc !== i) this.pc = (this.pc + rel) & 0xFFFF; break; } // CJNE A,#imm,rel
      case 0xB5: { const a = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; const v = this.readDirect(a, false); this.cy = this.acc < v ? 1 : 0; if (this.acc !== v) this.pc = (this.pc + rel) & 0xFFFF; break; } // CJNE A,direct,rel
      case 0xB6: case 0xB7: { const i = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; const v = this.iram[this.getR(op - 0xB6)]; this.cy = v < i ? 1 : 0; if (v !== i) this.pc = (this.pc + rel) & 0xFFFF; break; } // CJNE @Ri,#imm,rel
      case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF: { const i = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; const v = this.getR(op - 0xB8); this.cy = v < i ? 1 : 0; if (v !== i) this.pc = (this.pc + rel) & 0xFFFF; break; } // CJNE Rn,#imm,rel
      case 0xC0: { const a = this.fetch(); cyc = 2; this.push(this.readDirect(a, false)); break; } // PUSH
      case 0xC2: { const bit = this.fetch(); this.writeBit(bit, 0); break; } // CLR bit
      case 0xC3: { this.cy = 0; break; } // CLR C
      case 0xC4: { this.acc = ((this.acc << 4) | (this.acc >> 4)) & 0xFF; break; } // SWAP A
      case 0xC5: { const a = this.fetch(); const v = this.readDirect(a, false); this.writeDirect(a, this.acc); this.acc = v; break; } // XCH A,direct
      case 0xC6: case 0xC7: { const a = this.getR(op - 0xC6); const v = this.iram[a]; this.iram[a] = this.acc; this.acc = v; break; } // XCH A,@Ri
      case 0xC8: case 0xC9: case 0xCA: case 0xCB: case 0xCC: case 0xCD: case 0xCE: case 0xCF: { const n = op - 0xC8; const v = this.getR(n); this.setR(n, this.acc); this.acc = v; break; } // XCH A,Rn
      case 0xD0: { const a = this.fetch(); cyc = 2; this.writeDirect(a, this.pop()); break; } // POP
      case 0xD2: { const bit = this.fetch(); this.writeBit(bit, 1); break; } // SETB bit
      case 0xD3: { this.cy = 1; break; } // SETB C
      case 0xD4: { // DA A
        let a = this.acc, cy = this.cy;
        if ((a & 0x0F) > 9 || (this.psw & PSW_AC)) { a += 6; if (a > 0xFF) cy = 1; a &= 0xFF; }
        if ((a & 0xF0) > 0x90 || cy) { a += 0x60; if (a > 0xFF) cy = 1; a &= 0xFF; }
        this.acc = a; this.cy = cy; break;
      }
      case 0xD5: { const a = this.fetch(), rel = (this.fetch() << 24) >> 24; cyc = 2; const v = (this.readDirect(a, true) - 1) & 0xFF; this.writeDirect(a, v); if (v !== 0) this.pc = (this.pc + rel) & 0xFFFF; break; } // DJNZ direct,rel
      case 0xD6: case 0xD7: { // XCHD A,@Ri
        const a = this.getR(op - 0xD6); const v = this.iram[a];
        this.iram[a] = (v & 0xF0) | (this.acc & 0x0F); this.acc = (this.acc & 0xF0) | (v & 0x0F); break;
      }
      case 0xD8: case 0xD9: case 0xDA: case 0xDB: case 0xDC: case 0xDD: case 0xDE: case 0xDF: { const rel = (this.fetch() << 24) >> 24; cyc = 2; const n = op - 0xD8; const v = (this.getR(n) - 1) & 0xFF; this.setR(n, v); if (v !== 0) this.pc = (this.pc + rel) & 0xFFFF; break; } // DJNZ Rn,rel
      case 0xE0: { this.acc = this.xram[this.dptr]; cyc = 2; break; } // MOVX A,@DPTR
      case 0xE2: case 0xE3: { this.acc = this.xram[(this.bus.latch[2] << 8) | this.getR(op - 0xE2)]; cyc = 2; break; } // MOVX A,@Ri
      case 0xE4: { this.acc = 0; break; } // CLR A
      case 0xE5: { const a = this.fetch(); this.acc = this.readDirect(a, false); break; } // MOV A,direct
      case 0xE6: case 0xE7: { this.acc = this.iram[this.getR(op - 0xE6)]; break; } // MOV A,@Ri
      case 0xE8: case 0xE9: case 0xEA: case 0xEB: case 0xEC: case 0xED: case 0xEE: case 0xEF: { this.acc = this.getR(op - 0xE8); break; } // MOV A,Rn
      case 0xF0: { this.xram[this.dptr] = this.acc; cyc = 2; break; } // MOVX @DPTR,A
      case 0xF2: case 0xF3: { this.xram[(this.bus.latch[2] << 8) | this.getR(op - 0xF2)] = this.acc; cyc = 2; break; } // MOVX @Ri,A
      case 0xF4: { this.acc = ~this.acc; break; } // CPL A
      case 0xF5: { const a = this.fetch(); this.writeDirect(a, this.acc); break; } // MOV direct,A
      case 0xF6: case 0xF7: { this.iram[this.getR(op - 0xF6)] = this.acc; break; } // MOV @Ri,A
      case 0xF8: case 0xF9: case 0xFA: case 0xFB: case 0xFC: case 0xFD: case 0xFE: case 0xFF: { this.setR(op - 0xF8, this.acc); break; } // MOV Rn,A
      default:
        break;
    }

    this.tick(cyc);
    this.checkInterrupts();
    return cyc;
  }

  readBitLatch(bit) {
    const byte = bitAddrToByte(bit), mask = bitAddrToMask(bit);
    return (this.readDirect(byte, true) & mask) ? 1 : 0;
  }

  // ---------- 週期推進：計時器、UART、外部中斷取樣 ----------
  tick(n) {
    for (let i = 0; i < n; i++) {
      this.cycles++;
      this.tickTimers();
      this.tickUart();
      this.sampleExternalInts();
    }
  }

  tickTimers() {
    const tcon = this.sfr[SFR.TCON - 0x80];
    const tmod = this.sfr[SFR.TMOD - 0x80];
    const p3 = this.bus.pins[3];
    // Timer 0
    if (tcon & TCON_TR0) {
      const gate = tmod & 0x08, ct = tmod & 0x04, mode = tmod & 0x03;
      const run = !gate || ((p3 >> 2) & 1);
      let inc = false;
      if (ct) { const t0 = (p3 >> 4) & 1; if (this.prevT0 === 1 && t0 === 0) inc = true; }
      else inc = true;
      if (run && inc) this.incTimer(0, mode);
    }
    this.prevT0 = (p3 >> 4) & 1;
    // Timer 1
    if (tcon & TCON_TR1) {
      const gate = tmod & 0x80, ct = tmod & 0x40, mode = (tmod >> 4) & 0x03;
      const run = !gate || ((p3 >> 3) & 1);
      let inc = false;
      if (ct) { const t1 = (p3 >> 5) & 1; if (this.prevT1 === 1 && t1 === 0) inc = true; }
      else inc = true;
      if (run && inc && mode !== 3) this.incTimer(1, mode);
    }
    this.prevT1 = (p3 >> 5) & 1;
  }

  incTimer(t, mode) {
    const TL = (t === 0 ? SFR.TL0 : SFR.TL1) - 0x80, TH = (t === 0 ? SFR.TH0 : SFR.TH1) - 0x80;
    const TF = t === 0 ? TCON_TF0 : TCON_TF1;
    const s = this.sfr;
    switch (mode) {
      case 0: { // 13-bit
        let v = ((s[TH] << 5) | (s[TL] & 0x1F)) + 1;
        if (v > 0x1FFF) { v = 0; s[SFR.TCON - 0x80] |= TF; if (t === 1) this.t1Overflow(); }
        s[TH] = (v >> 5) & 0xFF; s[TL] = v & 0x1F; break;
      }
      case 1: { // 16-bit
        let v = ((s[TH] << 8) | s[TL]) + 1;
        if (v > 0xFFFF) { v = 0; s[SFR.TCON - 0x80] |= TF; if (t === 1) this.t1Overflow(); }
        s[TH] = v >> 8; s[TL] = v & 0xFF; break;
      }
      case 2: { // 8-bit auto reload
        let v = s[TL] + 1;
        if (v > 0xFF) { v = s[TH]; s[SFR.TCON - 0x80] |= TF; if (t === 1) this.t1Overflow(); }
        s[TL] = v; break;
      }
      case 3: { // Timer0 split: TL0 為 timer0, TH0 為 timer1 (使用 TR1/TF1)
        if (t === 0) {
          let v = s[TL] + 1;
          if (v > 0xFF) { v = 0; s[SFR.TCON - 0x80] |= TCON_TF0; }
          s[TL] = v;
          if (s[SFR.TCON - 0x80] & TCON_TR1) {
            let h = s[TH] + 1;
            if (h > 0xFF) { h = 0; s[SFR.TCON - 0x80] |= TCON_TF1; }
            s[TH] = h;
          }
        }
        break;
      }
    }
  }

  t1Overflow() { this.t1OverflowsForBaud++; }

  sampleExternalInts() {
    const p3 = this.bus.pins[3];
    const int0 = (p3 >> 2) & 1, int1 = (p3 >> 3) & 1;
    let tcon = this.sfr[SFR.TCON - 0x80];
    if (tcon & TCON_IT0) { if (this.prevINT0 === 1 && int0 === 0) tcon |= TCON_IE0; }
    else { if (int0 === 0) tcon |= TCON_IE0; else tcon &= ~TCON_IE0; }
    if (tcon & TCON_IT1) { if (this.prevINT1 === 1 && int1 === 0) tcon |= TCON_IE1; }
    else { if (int1 === 0) tcon |= TCON_IE1; else tcon &= ~TCON_IE1; }
    this.sfr[SFR.TCON - 0x80] = tcon;
    this.prevINT0 = int0; this.prevINT1 = int1;
  }

  // ---------- 中斷 ----------
  checkInterrupts() {
    const ie = this.sfr[SFR.IE - 0x80];
    if (!(ie & IE_EA)) return;
    const tcon = this.sfr[SFR.TCON - 0x80];
    const scon = this.sfr[SFR.SCON - 0x80];
    const ip = this.sfr[SFR.IP - 0x80];
    // 來源順序（同優先權下的輪詢順序）：INT0, T0, INT1, T1, UART
    const srcs = [
      { en: ie & IE_EX0, flag: tcon & TCON_IE0, vec: 0x03, prio: ip & 0x01, clear: () => { if (this.sfr[SFR.TCON - 0x80] & TCON_IT0) this.sfr[SFR.TCON - 0x80] &= ~TCON_IE0; } },
      { en: ie & IE_ET0, flag: tcon & TCON_TF0, vec: 0x0B, prio: ip & 0x02, clear: () => { this.sfr[SFR.TCON - 0x80] &= ~TCON_TF0; } },
      { en: ie & IE_EX1, flag: tcon & TCON_IE1, vec: 0x13, prio: ip & 0x04, clear: () => { if (this.sfr[SFR.TCON - 0x80] & TCON_IT1) this.sfr[SFR.TCON - 0x80] &= ~TCON_IE1; } },
      { en: ie & IE_ET1, flag: tcon & TCON_TF1, vec: 0x1B, prio: ip & 0x08, clear: () => { this.sfr[SFR.TCON - 0x80] &= ~TCON_TF1; } },
      { en: ie & IE_ES, flag: scon & (SCON_RI | SCON_TI), vec: 0x23, prio: ip & 0x10, clear: () => {} },
    ];
    // 先找高優先權
    for (const pass of [1, 0]) {
      if (pass === 1 && this.intHighActive) return;
      if (pass === 0 && (this.intHighActive || this.intLowActive)) return;
      for (const s of srcs) {
        if (!s.en || !s.flag) continue;
        if ((s.prio ? 1 : 0) !== pass) continue;
        // 觸發
        s.clear();
        this.push(this.pc & 0xFF); this.push(this.pc >> 8);
        this.pc = s.vec;
        if (pass === 1) this.intHighActive = true; else this.intLowActive = true;
        this.tick(2);
        return;
      }
    }
  }

  retiFromInterrupt() {
    if (this.intHighActive) this.intHighActive = false;
    else this.intLowActive = false;
  }

  // ---------- UART ----------
  uartBitCycles() {
    // 回傳每 bit 的機械週期數
    const scon = this.sfr[SFR.SCON - 0x80];
    const mode = scon >> 6;
    const smod = (this.sfr[SFR.PCON - 0x80] & 0x80) ? 2 : 1;
    if (mode === 0) return 1;
    if (mode === 2) return 64 / smod;
    // mode 1/3：Timer1 mode 2 溢位率 / (32/smod)
    const th1 = this.sfr[SFR.TH1 - 0x80];
    const overflowCycles = 256 - th1;
    return Math.max(1, Math.round(overflowCycles * 32 / smod));
  }

  uartTransmit(byte) {
    this.sfr[SFR.SBUF - 0x80] = byte;
    this.uartTxByte = byte;
    const mode = this.sfr[SFR.SCON - 0x80] >> 6;
    const bits = mode === 0 ? 8 : (mode === 1 ? 10 : 11);
    this.uartTxCountdown = this.uartBitCycles() * bits;
  }

  uartReceive(byte) { this.uartRxQueue.push(byte); }

  tickUart() {
    if (this.uartTxCountdown > 0) {
      if (--this.uartTxCountdown === 0) {
        this.sfr[SFR.SCON - 0x80] |= SCON_TI;
        if (this.onUartTx) this.onUartTx(this.uartTxByte);
      }
    }
    const scon = this.sfr[SFR.SCON - 0x80];
    if (scon & SCON_REN) {
      if (this.uartRxCountdown > 0) {
        if (--this.uartRxCountdown === 0) {
          this.sfr[SFR.SBUF - 0x80] = this.uartRxShift;
          this.sfr[SFR.SCON - 0x80] |= SCON_RI;
        }
      } else if (this.uartRxQueue.length && !(scon & SCON_RI)) {
        this.uartRxShift = this.uartRxQueue.shift();
        const mode = scon >> 6;
        const bits = mode === 0 ? 8 : (mode === 1 ? 10 : 11);
        this.uartRxCountdown = this.uartBitCycles() * bits;
      }
    }
  }

  // ---------- 批次執行 ----------
  // 執行直到累積 cycles 個機械週期或碰到中斷點。回傳實際執行週期。
  run(targetCycles) {
    const start = this.cycles;
    this.hitBreakpoint = false;
    while (this.cycles - start < targetCycles) {
      if (this.breakpoints.size && this.breakpoints.has(this.pc)) {
        this.hitBreakpoint = true; break;
      }
      this.step();
    }
    return this.cycles - start;
  }
}
