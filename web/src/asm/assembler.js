// Keil A51 相容的 8051 組譯器（純 JS，不需本機服務）
//
// 支援：標記、EQU/SET/BIT/DATA/IDATA/XDATA/CODE、ORG、DB/DW/DS、END、USING
//       數值 0FFH / 0x1F / 11110000B / 77Q / 123 / 'A'
//       運算式 + - * / MOD SHL SHR AND OR XOR NOT ( ) HIGH LOW，$ 表示本行位址
//       位元位址 P1.0、ACC.7、20H.3，以及 /bit 反相
//       通用 JMP / CALL（一律組成 LJMP / LCALL，行為相同，僅長度比 Keil 最佳化後多 1 byte）
//
// 輸出：{ ok, hex, lines:[[addr,lineNo]], symbols, listing, diagnostics }

import { SFR, BIT_NAMES } from '../cpu/sfr.js';

// ---------- 預定義符號 ----------
function predefined() {
  const s = new Map();
  for (const [name, addr] of Object.entries(SFR)) s.set(name, { value: addr, kind: 'data' });
  s.set('DPTR', { value: 0x8382, kind: 'reserved' });
  // 位元名稱（TCON/IE/PSW/SCON/IP/P3 的功能名）
  for (const [addr, name] of Object.entries(BIT_NAMES)) {
    if (/^(P[0-3]|ACC|B)\./.test(name)) continue; // P1.0 這類用點記法處理
    if (!s.has(name)) s.set(name, { value: +addr, kind: 'bit' });
  }
  return s;
}

// ---------- 運算式 ----------
const NUM = /^(?:0[xX][0-9a-fA-F]+|[0-9][0-9a-fA-F]*[hH]|[01]+[bB]|[0-7]+[qQoO]|[0-9]+[dD]?)$/;

function parseNumber(t) {
  if (/^0[xX]/.test(t)) return parseInt(t.slice(2), 16);
  if (/[hH]$/.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/[bB]$/.test(t) && /^[01]+[bB]$/.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/[qQoO]$/.test(t)) return parseInt(t.slice(0, -1), 8);
  if (/[dD]$/.test(t)) return parseInt(t.slice(0, -1), 10);
  return parseInt(t, 10);
}

class ExprParser {
  constructor(src, ctx) { this.s = src; this.i = 0; this.ctx = ctx; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  peekWord() {
    this.ws();
    const m = /^[A-Za-z_?][A-Za-z0-9_?]*/.exec(this.s.slice(this.i));
    return m ? m[0] : null;
  }
  eat(str) {
    this.ws();
    if (this.s.slice(this.i, this.i + str.length).toUpperCase() === str.toUpperCase()) {
      // 文字運算子後面必須是非識別字元
      if (/[A-Z]/i.test(str[0])) {
        const after = this.s[this.i + str.length];
        if (after && /[A-Za-z0-9_?]/.test(after)) return false;
      }
      this.i += str.length; return true;
    }
    return false;
  }
  parse() { const v = this.orExpr(); this.ws(); return v; }
  orExpr() {
    let v = this.xorExpr();
    for (;;) { if (this.eat('OR')) v = (v | this.xorExpr()) >>> 0; else return v; }
  }
  xorExpr() {
    let v = this.andExpr();
    for (;;) { if (this.eat('XOR')) v = (v ^ this.andExpr()) >>> 0; else return v; }
  }
  andExpr() {
    let v = this.shiftExpr();
    for (;;) { if (this.eat('AND')) v = (v & this.shiftExpr()) >>> 0; else return v; }
  }
  shiftExpr() {
    let v = this.addExpr();
    for (;;) {
      if (this.eat('SHL')) v = (v << this.addExpr()) >>> 0;
      else if (this.eat('SHR')) v = (v >>> this.addExpr()) >>> 0;
      else return v;
    }
  }
  addExpr() {
    let v = this.mulExpr();
    for (;;) {
      this.ws();
      if (this.s[this.i] === '+') { this.i++; v = v + this.mulExpr(); }
      else if (this.s[this.i] === '-') { this.i++; v = v - this.mulExpr(); }
      else return v;
    }
  }
  mulExpr() {
    let v = this.unary();
    for (;;) {
      this.ws();
      if (this.s[this.i] === '*') { this.i++; v = v * this.unary(); }
      else if (this.s[this.i] === '/') { this.i++; const d = this.unary(); v = d === 0 ? 0 : Math.trunc(v / d); }
      else if (this.eat('MOD')) { const d = this.unary(); v = d === 0 ? 0 : v % d; }
      else return v;
    }
  }
  unary() {
    this.ws();
    if (this.s[this.i] === '-') { this.i++; return -this.unary(); }
    if (this.s[this.i] === '+') { this.i++; return this.unary(); }
    if (this.eat('NOT')) return (~this.unary()) >>> 0;
    if (this.eat('HIGH')) return (this.unary() >> 8) & 0xFF;
    if (this.eat('LOW')) return this.unary() & 0xFF;
    return this.primary();
  }
  primary() {
    this.ws();
    if (this.s[this.i] === '(') { this.i++; const v = this.orExpr(); this.ws(); if (this.s[this.i] === ')') this.i++; else throw new Error('少了右括號'); return v; }
    if (this.s[this.i] === '$') { this.i++; return this.ctx.pc; }
    // 字元常數
    if (this.s[this.i] === "'" || this.s[this.i] === '"') {
      const q = this.s[this.i]; let j = this.i + 1, out = '';
      while (j < this.s.length && this.s[j] !== q) out += this.s[j++];
      this.i = j + 1;
      if (out.length === 1) return out.charCodeAt(0);
      if (out.length === 2) return (out.charCodeAt(0) << 8) | out.charCodeAt(1);
      throw new Error('字元常數長度須為 1 或 2');
    }
    const word = /^[A-Za-z_?][A-Za-z0-9_?]*/.exec(this.s.slice(this.i));
    if (word) {
      const w = word[0];
      // 可能是 0FFH 這種以數字開頭？不會，數字開頭走下面
      this.i += w.length;
      const up = w.toUpperCase();
      const sym = this.ctx.symbols.get(up);
      if (!sym) throw new Error(`未定義的符號 ${w}`);
      return sym.value;
    }
    const num = /^(?:0[xX][0-9a-fA-F]+|[0-9][0-9a-fA-F]*[hHbBqQoOdD]?)/.exec(this.s.slice(this.i));
    if (num) {
      const t = num[0];
      if (!NUM.test(t)) throw new Error(`無法辨識的數值 ${t}`);
      this.i += t.length;
      return parseNumber(t);
    }
    throw new Error(`無法解析的運算式：${this.s.slice(this.i).trim() || '(空白)'}`);
  }
}

function evalExpr(src, ctx) {
  const p = new ExprParser(src, ctx);
  const v = p.parse();
  if (p.i < p.s.length && p.s.slice(p.i).trim()) throw new Error(`運算式多餘的內容：${p.s.slice(p.i).trim()}`);
  return v;
}

// 位元位址：expr.bit
function evalBit(src, ctx) {
  const m = /^(.*)\.\s*([0-7])\s*$/.exec(src.trim());
  if (m) {
    const base = evalExpr(m[1], ctx), bit = +m[2];
    if (base >= 0x80) {
      if (base % 8 !== 0) throw new Error(`${m[1].trim()} (${base.toString(16).toUpperCase()}H) 不是可位元定址的 SFR`);
      return base + bit;
    }
    if (base >= 0x20 && base <= 0x2F) return (base - 0x20) * 8 + bit;
    throw new Error(`${m[1].trim()} 不在可位元定址範圍（20H–2FH 或 SFR 中位址為 8 倍數者）`);
  }
  return evalExpr(src, ctx);
}

// ---------- 指令表 ----------
// ops：運算元種類；op：基礎 opcode；extra：額外位元組來源（依序）
const R = 'Rn', IR = 'IR';
const T = {
  NOP:   [[[], 0x00, []]],
  RET:   [[[], 0x22, []]],
  RETI:  [[[], 0x32, []]],
  'RL':  [[['A'], 0x23, []]],
  'RLC': [[['A'], 0x33, []]],
  'RR':  [[['A'], 0x03, []]],
  'RRC': [[['A'], 0x13, []]],
  'SWAP':[[['A'], 0xC4, []]],
  'DA':  [[['A'], 0xD4, []]],
  'MUL': [[['AB'], 0xA4, []]],
  'DIV': [[['AB'], 0x84, []]],
  ADD:  [[['A', 'imm'], 0x24, ['imm']], [['A', R], 0x28, []], [['A', IR], 0x26, []], [['A', 'dir'], 0x25, ['dir1']]],
  ADDC: [[['A', 'imm'], 0x34, ['imm']], [['A', R], 0x38, []], [['A', IR], 0x36, []], [['A', 'dir'], 0x35, ['dir1']]],
  SUBB: [[['A', 'imm'], 0x94, ['imm']], [['A', R], 0x98, []], [['A', IR], 0x96, []], [['A', 'dir'], 0x95, ['dir1']]],
  ANL:  [[['A', 'imm'], 0x54, ['imm']], [['A', R], 0x58, []], [['A', IR], 0x56, []], [['A', 'dir'], 0x55, ['dir1']],
         [['C', 'nbit'], 0xB0, ['bit1']], [['C', 'bit'], 0x82, ['bit1']],
         [['dir', 'A'], 0x52, ['dir0']], [['dir', 'imm'], 0x53, ['dir0', 'imm']]],
  ORL:  [[['A', 'imm'], 0x44, ['imm']], [['A', R], 0x48, []], [['A', IR], 0x46, []], [['A', 'dir'], 0x45, ['dir1']],
         [['C', 'nbit'], 0xA0, ['bit1']], [['C', 'bit'], 0x72, ['bit1']],
         [['dir', 'A'], 0x42, ['dir0']], [['dir', 'imm'], 0x43, ['dir0', 'imm']]],
  XRL:  [[['A', 'imm'], 0x64, ['imm']], [['A', R], 0x68, []], [['A', IR], 0x66, []], [['A', 'dir'], 0x65, ['dir1']],
         [['dir', 'A'], 0x62, ['dir0']], [['dir', 'imm'], 0x63, ['dir0', 'imm']]],
  INC:  [[['A'], 0x04, []], [['DPTR'], 0xA3, []], [[R], 0x08, []], [[IR], 0x06, []], [['dir'], 0x05, ['dir0']]],
  DEC:  [[['A'], 0x14, []], [[R], 0x18, []], [[IR], 0x16, []], [['dir'], 0x15, ['dir0']]],
  CLR:  [[['A'], 0xE4, []], [['C'], 0xC3, []], [['bit'], 0xC2, ['bit0']]],
  SETB: [[['C'], 0xD3, []], [['bit'], 0xD2, ['bit0']]],
  CPL:  [[['A'], 0xF4, []], [['C'], 0xB3, []], [['bit'], 0xB2, ['bit0']]],
  PUSH: [[['dir'], 0xC0, ['dir0']]],
  POP:  [[['dir'], 0xD0, ['dir0']]],
  XCH:  [[['A', R], 0xC8, []], [['A', IR], 0xC6, []], [['A', 'dir'], 0xC5, ['dir1']]],
  XCHD: [[['A', IR], 0xD6, []]],
  MOVC: [[['A', 'AADPTR'], 0x93, []], [['A', 'AAPC'], 0x83, []]],
  MOVX: [[['A', 'IDPTR'], 0xE0, []], [['A', IR], 0xE2, []], [['IDPTR', 'A'], 0xF0, []], [[IR, 'A'], 0xF2, []]],
  MOV:  [[['DPTR', 'imm16'], 0x90, ['imm16']],
         [['A', 'imm'], 0x74, ['imm']], [['A', R], 0xE8, []], [['A', IR], 0xE6, []],
         [['C', 'bit'], 0xA2, ['bit1']], [['bit', 'C'], 0x92, ['bit0']],
         [[R, 'imm'], 0x78, ['imm']], [[R, 'A'], 0xF8, []], [[R, 'dir'], 0xA8, ['dir1']],
         [[IR, 'imm'], 0x76, ['imm']], [[IR, 'A'], 0xF6, []], [[IR, 'dir'], 0xA6, ['dir1']],
         [['dir', 'A'], 0xF5, ['dir0']], [['dir', R], 0x88, ['dir0']], [['dir', IR], 0x86, ['dir0']],
         [['dir', 'imm'], 0x75, ['dir0', 'imm']],
         [['A', 'dir'], 0xE5, ['dir1']],
         [['dir', 'dir'], 0x85, ['dir1', 'dir0']]],   // MOV dst,src → 85 src dst
  JB:   [[['bit', 'rel'], 0x20, ['bit0', 'rel1']]],
  JNB:  [[['bit', 'rel'], 0x30, ['bit0', 'rel1']]],
  JBC:  [[['bit', 'rel'], 0x10, ['bit0', 'rel1']]],
  JC:   [[['rel'], 0x40, ['rel0']]],
  JNC:  [[['rel'], 0x50, ['rel0']]],
  JZ:   [[['rel'], 0x60, ['rel0']]],
  JNZ:  [[['rel'], 0x70, ['rel0']]],
  SJMP: [[['rel'], 0x80, ['rel0']]],
  LJMP: [[['addr16'], 0x02, ['addr16']]],
  LCALL:[[['addr16'], 0x12, ['addr16']]],
  AJMP: [[['addr11'], 0x01, ['addr11']]],
  ACALL:[[['addr11'], 0x11, ['addr11']]],
  DJNZ: [[[R, 'rel'], 0xD8, ['rel1']], [['dir', 'rel'], 0xD5, ['dir0', 'rel1']]],
  CJNE: [[['A', 'imm', 'rel'], 0xB4, ['imm', 'rel2']],
         [['A', 'dir', 'rel'], 0xB5, ['dir1', 'rel2']],
         [[R, 'imm', 'rel'], 0xB8, ['imm', 'rel2']],
         [[IR, 'imm', 'rel'], 0xB6, ['imm', 'rel2']]],
};
// 通用 JMP/CALL → 一律 LJMP/LCALL（3 bytes，永遠可達）
T.JMP = [[['AADPTR'], 0x73, []], [['addr16'], 0x02, ['addr16']]];
T.CALL = [[['addr16'], 0x12, ['addr16']]];

const DIRECTIVES = new Set(['ORG', 'EQU', 'SET', 'DB', 'DW', 'DS', 'END', 'BIT', 'DATA', 'IDATA', 'XDATA', 'CODE', 'USING', 'DBIT']);

// ---------- 運算元切分（逗號分隔，字串內不切） ----------
function splitOperands(s) {
  const out = []; let cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out.filter((x, i, a) => !(x === '' && i === a.length - 1 && a.length === 1));
}

// ---------- 行解析 ----------
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === ';') return line.slice(0, i);
  }
  return line;
}

function parseLine(raw) {
  const text = stripComment(raw).replace(/\s+$/, '');
  if (!text.trim()) return null;
  let rest = text, label = null;
  // 標記：行首非空白的識別字，後面接 : 或（若後面是指令/指示字）
  const m = /^([A-Za-z_?][A-Za-z0-9_?]*)\s*:/.exec(rest);
  if (m) { label = m[1]; rest = rest.slice(m[0].length); }
  else if (/^[A-Za-z_?]/.test(rest)) {
    // 無冒號：可能是 "NAME EQU x" 或 "NAME: 省略冒號"；先看第二個字是不是指示字
    const m2 = /^([A-Za-z_?][A-Za-z0-9_?]*)\s+([A-Za-z_?][A-Za-z0-9_?]*)/.exec(rest);
    if (m2 && DIRECTIVES.has(m2[2].toUpperCase()) && !DIRECTIVES.has(m2[1].toUpperCase())) {
      label = m2[1]; rest = rest.slice(m2[1].length);
    }
  }
  rest = rest.trim();
  if (!rest) return { label, mnemonic: null, operands: [] };
  const mm = /^([A-Za-z_?][A-Za-z0-9_?]*)/.exec(rest);
  if (!mm) return { label, mnemonic: null, operands: [], bad: rest };
  const mnemonic = mm[1].toUpperCase();
  const operands = splitOperands(rest.slice(mm[1].length).trim());
  return { label, mnemonic, operands };
}

// ---------- 運算元分類 ----------
function classify(text, ctx) {
  const t = text.trim();
  const up = t.toUpperCase();
  if (up === 'A') return { kind: 'A' };
  if (up === 'AB') return { kind: 'AB' };
  if (up === 'C') return { kind: 'C' };
  if (up === 'DPTR') return { kind: 'DPTR' };
  if (/^@\s*A\s*\+\s*DPTR$/i.test(t)) return { kind: 'AADPTR' };
  if (/^@\s*A\s*\+\s*PC$/i.test(t)) return { kind: 'AAPC' };
  if (/^@\s*DPTR$/i.test(t)) return { kind: 'IDPTR' };
  const ir = /^@\s*R([01])$/i.exec(t);
  if (ir) return { kind: 'IR', n: +ir[1] };
  const rn = /^R([0-7])$/i.exec(t);
  if (rn) return { kind: 'Rn', n: +rn[1] };
  if (t.startsWith('#')) return { kind: 'imm', expr: t.slice(1) };
  if (t.startsWith('/')) return { kind: 'nbit', expr: t.slice(1) };
  return { kind: 'expr', expr: t };
}

function matchOps(pattern, ops) {
  if (pattern.length !== ops.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i], o = ops[i];
    if (p === o.kind) continue;
    if ((p === 'dir' || p === 'bit' || p === 'rel' || p === 'addr16' || p === 'addr11') && o.kind === 'expr') continue;
    if (p === 'imm16' && o.kind === 'imm') continue;
    if (p === 'nbit' && o.kind === 'nbit') continue;
    return false;
  }
  // imm 對 imm16 的區隔：MOV DPTR 專用
  return true;
}

function sizeOf(mnemonic, ops, ctx) {
  const forms = T[mnemonic];
  if (!forms) return null;
  for (const [pat, , extra] of forms) {
    if (!matchOps(pat, ops)) continue;
    let n = 1;
    for (const e of extra) n += (e === 'imm16' || e === 'addr16') ? 2 : 1;
    return n;
  }
  return null;
}

// ---------- 主組譯 ----------
export function assemble(source, opts = {}) {
  const codeLimit = opts.codeSize || 4096;
  const lines = source.split(/\r?\n/);
  const diagnostics = [];
  const symbols = predefined();
  const err = (lineNo, msg) => diagnostics.push({ line: lineNo, severity: 'error', msg });
  const warn = (lineNo, msg) => diagnostics.push({ line: lineNo, severity: 'warning', msg });

  const parsed = lines.map((raw, i) => { try { return parseLine(raw); } catch (e) { err(i + 1, e.message); return null; } });

  // ===== Pass 1：決定每行位址與符號值 =====
  const ctx = { pc: 0, symbols };
  const layout = [];       // { lineNo, addr, size, p }
  let pc = 0, ended = false;
  for (let i = 0; i < parsed.length && !ended; i++) {
    const p = parsed[i]; if (!p) continue;
    const lineNo = i + 1;
    ctx.pc = pc;
    const d = p.mnemonic;
    const isDirective = d && DIRECTIVES.has(d);
    // 標記
    if (p.label && !(isDirective && ['EQU', 'SET', 'BIT', 'DATA', 'IDATA', 'XDATA', 'CODE', 'DBIT'].includes(d))) {
      const key = p.label.toUpperCase();
      if (symbols.has(key) && symbols.get(key).kind !== 'label') err(lineNo, `符號 ${p.label} 重複定義`);
      symbols.set(key, { value: pc, kind: 'label', line: lineNo });
    }
    if (!d) continue;
    if (isDirective) {
      try {
        switch (d) {
          case 'ORG': pc = evalExpr(p.operands[0] ?? '', ctx) & 0xFFFF; break;
          case 'EQU': case 'SET': case 'DATA': case 'IDATA': case 'XDATA': case 'CODE': {
            if (!p.label) { err(lineNo, `${d} 前面必須有符號名稱`); break; }
            const v = (d === 'EQU' || d === 'SET') ? evalBit(p.operands[0] ?? '', ctx) : evalExpr(p.operands[0] ?? '', ctx);
            symbols.set(p.label.toUpperCase(), { value: v, kind: d.toLowerCase(), line: lineNo });
            break;
          }
          case 'BIT': case 'DBIT': {
            if (!p.label) { err(lineNo, 'BIT 前面必須有符號名稱'); break; }
            symbols.set(p.label.toUpperCase(), { value: evalBit(p.operands[0] ?? '', ctx), kind: 'bit', line: lineNo });
            break;
          }
          case 'DB': { let n = 0; for (const o of p.operands) n += /^\s*['"]/.test(o) ? Math.max(1, o.trim().length - 2) : 1; layout.push({ lineNo, addr: pc, size: n, p }); pc += n; break; }
          case 'DW': { const n = p.operands.length * 2; layout.push({ lineNo, addr: pc, size: n, p }); pc += n; break; }
          case 'DS': { const n = evalExpr(p.operands[0] ?? '0', ctx); layout.push({ lineNo, addr: pc, size: n, p, fill: true }); pc += n; break; }
          case 'END': ended = true; break;
          case 'USING': break;
        }
      } catch (e) { err(lineNo, e.message); }
      continue;
    }
    // 指令
    if (!T[d]) { err(lineNo, `未知的指令 ${p.mnemonic}`); continue; }
    let ops;
    try { ops = p.operands.map(o => classify(o, ctx)); } catch (e) { err(lineNo, e.message); continue; }
    const size = sizeOf(d, ops, ctx);
    if (size == null) { err(lineNo, `${d} 不支援這種運算元組合：${p.operands.join(', ')}`); continue; }
    layout.push({ lineNo, addr: pc, size, p, ops });
    pc += size;
  }
  const endAddr = pc;

  // ===== Pass 2：產生機器碼 =====
  const mem = new Uint8Array(0x10000);
  const used = new Uint8Array(0x10000);
  const lineMap = [];
  const listing = [];
  for (const item of layout) {
    const { lineNo, addr, p } = item;
    ctx.pc = addr;
    const emit = (bytes) => { for (let k = 0; k < bytes.length; k++) { mem[(addr + k) & 0xFFFF] = bytes[k] & 0xFF; used[(addr + k) & 0xFFFF] = 1; } listing.push({ addr, bytes, lineNo }); };
    try {
      const d = p.mnemonic;
      if (d === 'DB') {
        const bytes = [];
        for (const o of p.operands) {
          const s = o.trim();
          if (/^['"]/.test(s) && s.length > 3) { const inner = s.slice(1, -1); for (const ch of inner) bytes.push(ch.charCodeAt(0) & 0xFF); }
          else bytes.push(evalExpr(s, ctx) & 0xFF);
        }
        emit(bytes);
      } else if (d === 'DW') {
        const bytes = [];
        for (const o of p.operands) { const v = evalExpr(o, ctx) & 0xFFFF; bytes.push(v >> 8, v & 0xFF); }
        emit(bytes);
      } else if (d === 'DS') {
        emit(new Array(item.size).fill(0));
      } else {
        const forms = T[d];
        const ops = item.ops;
        let form = null;
        for (const f of forms) if (matchOps(f[0], ops)) { form = f; break; }
        if (!form) { err(lineNo, `${d} 運算元不符`); continue; }
        const [pat, base, extra] = form;
        let opcode = base;
        // Rn / @Ri 併入 opcode
        for (let i = 0; i < pat.length; i++) {
          if (pat[i] === 'Rn') opcode = base + ops[i].n;
          else if (pat[i] === 'IR') opcode = base + ops[i].n;
        }
        const bytes = [opcode];
        const size = item.size;
        const nextPc = addr + size;
        for (const e of extra) {
          if (e === 'imm') { const idx = pat.indexOf('imm'); const v = evalExpr(ops[idx].expr, ctx); rangeCheck(v, 8, lineNo, warn); bytes.push(v & 0xFF); }
          else if (e === 'imm16') { const idx = pat.indexOf('imm16'); const v = evalExpr(ops[idx].expr, ctx) & 0xFFFF; bytes.push((v >> 8) & 0xFF, v & 0xFF); }
          else if (e === 'dir0' || e === 'dir1') {
            const idx = e === 'dir0' ? pat.indexOf('dir') : pat.lastIndexOf('dir');
            const v = evalExpr(ops[idx].expr, ctx);
            if (v < 0 || v > 0xFF) err(lineNo, `直接位址 ${v} 超出 00H–FFH`);
            else if (v < 0x80 && v >= 0x80) {}
            bytes.push(v & 0xFF);
          }
          else if (e === 'bit0' || e === 'bit1') {
            const idx = e === 'bit0' ? 0 : pat.findIndex((x, i2) => (x === 'bit' || x === 'nbit') && i2 > 0);
            const o = ops[e === 'bit0' ? pat.findIndex(x => x === 'bit' || x === 'nbit') : idx];
            const v = evalBit(o.expr, ctx);
            if (v < 0 || v > 0xFF) err(lineNo, `位元位址超出範圍`);
            bytes.push(v & 0xFF);
          }
          else if (e.startsWith('rel')) {
            const idx = pat.indexOf('rel');
            const target = evalExpr(ops[idx].expr, ctx) & 0xFFFF;
            const off = target - nextPc;
            if (off < -128 || off > 127) err(lineNo, `相對跳躍超出範圍（需 -128~127，實際 ${off}）— 請改用 LJMP/JMP`);
            bytes.push(off & 0xFF);
          }
          else if (e === 'addr16') {
            const idx = pat.indexOf('addr16');
            const v = evalExpr(ops[idx].expr, ctx) & 0xFFFF;
            bytes.push((v >> 8) & 0xFF, v & 0xFF);
          }
          else if (e === 'addr11') {
            const idx = pat.indexOf('addr11');
            const v = evalExpr(ops[idx].expr, ctx) & 0xFFFF;
            if ((v & 0xF800) !== (nextPc & 0xF800)) err(lineNo, `AJMP/ACALL 目標不在同一個 2K 分頁內`);
            bytes[0] = (opcode & 0x1F) | ((v & 0x700) >> 3);
            bytes.push(v & 0xFF);
          }
        }
        if (bytes.length !== size) err(lineNo, `內部錯誤：長度不符 (${bytes.length} vs ${size})`);
        emit(bytes);
      }
      lineMap.push([addr, lineNo]);
    } catch (e) { err(lineNo, e.message); }
  }

  if (endAddr > codeLimit) err(0, `程式碼 ${endAddr} 位元組超過晶片上限 ${codeLimit} 位元組`);
  if (!parsed.some(p => p && p.mnemonic === 'END')) warn(0, '程式結尾沒有 END 指示字');

  const ok = !diagnostics.some(d => d.severity === 'error');
  const symOut = {};
  for (const [k, v] of symbols) if (v.line) symOut[k] = { addr: v.value, space: v.kind === 'label' ? 'C' : (v.kind === 'bit' ? 'H' : 'E'), size: 1 };
  return {
    ok,
    hex: ok ? toIntelHex(mem, used) : '',
    lines: lineMap.sort((a, b) => a[0] - b[0]),
    symbols: symOut,
    listing,
    codeBytes: endAddr,
    diagnostics,
  };
}

function rangeCheck(v, bits, lineNo, warn) {
  const max = (1 << bits) - 1;
  if (v > max || v < -(max + 1) / 2) warn(lineNo, `立即值 ${v} 超出 ${bits} 位元範圍，將被截斷`);
}

export function toIntelHex(mem, used) {
  const out = [];
  let i = 0;
  while (i < 0x10000) {
    if (!used[i]) { i++; continue; }
    let n = 0;
    while (n < 16 && used[i + n]) n++;
    const bytes = [n, (i >> 8) & 0xFF, i & 0xFF, 0x00];
    for (let k = 0; k < n; k++) bytes.push(mem[i + k]);
    let sum = 0; for (const b of bytes) sum += b;
    bytes.push((-sum) & 0xFF);
    out.push(':' + bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(''));
    i += n;
  }
  out.push(':00000001FF');
  return out.join('\n') + '\n';
}
