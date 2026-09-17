// 8051 反組譯器（除錯面板用）
import { SFR_NAMES, BIT_NAMES } from './sfr.js';

const h2 = (v) => v.toString(16).toUpperCase().padStart(2, '0') + 'H';
const h4 = (v) => v.toString(16).toUpperCase().padStart(4, '0') + 'H';
const dir = (a) => SFR_NAMES[a] || h2(a);
const bit = (b) => BIT_NAMES[b] || (b < 0x80 ? h2(0x20 + (b >> 3)) + '.' + (b & 7) : h2(b & 0xF8) + '.' + (b & 7));
const rel = (pc, r) => h4((pc + ((r << 24) >> 24)) & 0xFFFF);

// 回傳 { text, len }
export function disasm(code, pc) {
  const op = code[pc & 0xFFFF];
  const b1 = code[(pc + 1) & 0xFFFF], b2 = code[(pc + 2) & 0xFFFF];
  const hi = op >> 4, lo = op & 0x0F;
  const regOp = (lo) => lo === 5 ? [dir(b1), 2] : lo === 6 || lo === 7 ? ['@R' + (lo - 6), 1] : ['R' + (lo - 8), 1];
  const alu = (name) => { const [o, l] = regOp(lo); return { text: `${name} A,${o}`, len: l }; };

  if ((op & 0x1F) === 0x01) return { text: `AJMP ${h4(((pc + 2) & 0xF800) | ((op & 0xE0) << 3) | b1)}`, len: 2 };
  if ((op & 0x1F) === 0x11) return { text: `ACALL ${h4(((pc + 2) & 0xF800) | ((op & 0xE0) << 3) | b1)}`, len: 2 };

  switch (op) {
    case 0x00: return { text: 'NOP', len: 1 };
    case 0x02: return { text: `LJMP ${h4((b1 << 8) | b2)}`, len: 3 };
    case 0x03: return { text: 'RR A', len: 1 };
    case 0x04: return { text: 'INC A', len: 1 };
    case 0x10: return { text: `JBC ${bit(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0x12: return { text: `LCALL ${h4((b1 << 8) | b2)}`, len: 3 };
    case 0x13: return { text: 'RRC A', len: 1 };
    case 0x14: return { text: 'DEC A', len: 1 };
    case 0x20: return { text: `JB ${bit(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0x22: return { text: 'RET', len: 1 };
    case 0x23: return { text: 'RL A', len: 1 };
    case 0x24: return { text: `ADD A,#${h2(b1)}`, len: 2 };
    case 0x30: return { text: `JNB ${bit(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0x32: return { text: 'RETI', len: 1 };
    case 0x33: return { text: 'RLC A', len: 1 };
    case 0x34: return { text: `ADDC A,#${h2(b1)}`, len: 2 };
    case 0x40: return { text: `JC ${rel(pc + 2, b1)}`, len: 2 };
    case 0x42: return { text: `ORL ${dir(b1)},A`, len: 2 };
    case 0x43: return { text: `ORL ${dir(b1)},#${h2(b2)}`, len: 3 };
    case 0x44: return { text: `ORL A,#${h2(b1)}`, len: 2 };
    case 0x50: return { text: `JNC ${rel(pc + 2, b1)}`, len: 2 };
    case 0x52: return { text: `ANL ${dir(b1)},A`, len: 2 };
    case 0x53: return { text: `ANL ${dir(b1)},#${h2(b2)}`, len: 3 };
    case 0x54: return { text: `ANL A,#${h2(b1)}`, len: 2 };
    case 0x60: return { text: `JZ ${rel(pc + 2, b1)}`, len: 2 };
    case 0x62: return { text: `XRL ${dir(b1)},A`, len: 2 };
    case 0x63: return { text: `XRL ${dir(b1)},#${h2(b2)}`, len: 3 };
    case 0x64: return { text: `XRL A,#${h2(b1)}`, len: 2 };
    case 0x70: return { text: `JNZ ${rel(pc + 2, b1)}`, len: 2 };
    case 0x72: return { text: `ORL C,${bit(b1)}`, len: 2 };
    case 0x73: return { text: 'JMP @A+DPTR', len: 1 };
    case 0x74: return { text: `MOV A,#${h2(b1)}`, len: 2 };
    case 0x75: return { text: `MOV ${dir(b1)},#${h2(b2)}`, len: 3 };
    case 0x76: case 0x77: return { text: `MOV @R${op - 0x76},#${h2(b1)}`, len: 2 };
    case 0x80: return { text: `SJMP ${rel(pc + 2, b1)}`, len: 2 };
    case 0x82: return { text: `ANL C,${bit(b1)}`, len: 2 };
    case 0x83: return { text: 'MOVC A,@A+PC', len: 1 };
    case 0x84: return { text: 'DIV AB', len: 1 };
    case 0x85: return { text: `MOV ${dir(b2)},${dir(b1)}`, len: 3 };
    case 0x86: case 0x87: return { text: `MOV ${dir(b1)},@R${op - 0x86}`, len: 2 };
    case 0x90: return { text: `MOV DPTR,#${h4((b1 << 8) | b2)}`, len: 3 };
    case 0x92: return { text: `MOV ${bit(b1)},C`, len: 2 };
    case 0x93: return { text: 'MOVC A,@A+DPTR', len: 1 };
    case 0x94: return { text: `SUBB A,#${h2(b1)}`, len: 2 };
    case 0xA0: return { text: `ORL C,/${bit(b1)}`, len: 2 };
    case 0xA2: return { text: `MOV C,${bit(b1)}`, len: 2 };
    case 0xA3: return { text: 'INC DPTR', len: 1 };
    case 0xA4: return { text: 'MUL AB', len: 1 };
    case 0xA5: return { text: 'DB 0A5H', len: 1 };
    case 0xA6: case 0xA7: return { text: `MOV @R${op - 0xA6},${dir(b1)}`, len: 2 };
    case 0xB0: return { text: `ANL C,/${bit(b1)}`, len: 2 };
    case 0xB2: return { text: `CPL ${bit(b1)}`, len: 2 };
    case 0xB3: return { text: 'CPL C', len: 1 };
    case 0xB4: return { text: `CJNE A,#${h2(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0xB5: return { text: `CJNE A,${dir(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0xB6: case 0xB7: return { text: `CJNE @R${op - 0xB6},#${h2(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0xC0: return { text: `PUSH ${dir(b1)}`, len: 2 };
    case 0xC2: return { text: `CLR ${bit(b1)}`, len: 2 };
    case 0xC3: return { text: 'CLR C', len: 1 };
    case 0xC4: return { text: 'SWAP A', len: 1 };
    case 0xC5: return { text: `XCH A,${dir(b1)}`, len: 2 };
    case 0xC6: case 0xC7: return { text: `XCH A,@R${op - 0xC6}`, len: 1 };
    case 0xD0: return { text: `POP ${dir(b1)}`, len: 2 };
    case 0xD2: return { text: `SETB ${bit(b1)}`, len: 2 };
    case 0xD3: return { text: 'SETB C', len: 1 };
    case 0xD4: return { text: 'DA A', len: 1 };
    case 0xD5: return { text: `DJNZ ${dir(b1)},${rel(pc + 3, b2)}`, len: 3 };
    case 0xD6: case 0xD7: return { text: `XCHD A,@R${op - 0xD6}`, len: 1 };
    case 0xE0: return { text: 'MOVX A,@DPTR', len: 1 };
    case 0xE2: case 0xE3: return { text: `MOVX A,@R${op - 0xE2}`, len: 1 };
    case 0xE4: return { text: 'CLR A', len: 1 };
    case 0xE5: return { text: `MOV A,${dir(b1)}`, len: 2 };
    case 0xF0: return { text: 'MOVX @DPTR,A', len: 1 };
    case 0xF2: case 0xF3: return { text: `MOVX @R${op - 0xF2},A`, len: 1 };
    case 0xF4: return { text: 'CPL A', len: 1 };
    case 0xF5: return { text: `MOV ${dir(b1)},A`, len: 2 };
  }
  // 規則群組
  if (hi === 0x0 && lo >= 5) { const [o, l] = regOp(lo); return { text: `INC ${o}`, len: l }; }
  if (hi === 0x1 && lo >= 5) { const [o, l] = regOp(lo); return { text: `DEC ${o}`, len: l }; }
  if (hi === 0x2 && lo >= 5) return alu('ADD');
  if (hi === 0x3 && lo >= 5) return alu('ADDC');
  if (hi === 0x4 && lo >= 5) return alu('ORL');
  if (hi === 0x5 && lo >= 5) return alu('ANL');
  if (hi === 0x6 && lo >= 5) return alu('XRL');
  if (hi === 0x7 && lo >= 8) return { text: `MOV R${lo - 8},#${h2(b1)}`, len: 2 };
  if (hi === 0x8 && lo >= 8) return { text: `MOV ${dir(b1)},R${lo - 8}`, len: 2 };
  if (hi === 0x9 && lo >= 5) return alu('SUBB');
  if (hi === 0xA && lo >= 8) return { text: `MOV R${lo - 8},${dir(b1)}`, len: 2 };
  if (hi === 0xB && lo >= 8) return { text: `CJNE R${lo - 8},#${h2(b1)},${rel(pc + 3, b2)}`, len: 3 };
  if (hi === 0xC && lo >= 8) return { text: `XCH A,R${lo - 8}`, len: 1 };
  if (hi === 0xD && lo >= 8) return { text: `DJNZ R${lo - 8},${rel(pc + 2, b1)}`, len: 2 };
  if (hi === 0xE && lo >= 6) return { text: lo < 8 ? `MOV A,@R${lo - 6}` : `MOV A,R${lo - 8}`, len: 1 };
  if (hi === 0xF && lo >= 6) return { text: lo < 8 ? `MOV @R${lo - 6},A` : `MOV R${lo - 8},A`, len: 1 };
  return { text: `DB ${h2(op)}`, len: 1 };
}

// 指令長度表（不需反組譯文字時用）
export function insnLength(code, pc) { return disasm(code, pc).len; }
