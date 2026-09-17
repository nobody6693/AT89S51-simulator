"""Keil C51 → SDCC 語法相容轉換（逐行處理，保留行號）

處理項目：
  sbit X = P1^0;            → __sbit __at(0x90) X;
  sbit X = 0x90;            → __sbit __at(0x90) X;
  sfr  X = 0x90;            → __sfr  __at(0x90) X;
  sfr16 X = 0x8382;         → __sfr16 __at(0x8382) X;
  void f() interrupt 1 using 2  → void f(void) __interrupt(1) __using(2)
  #include <REG51.H> 等     → #include <reg51.h>
其餘 Keil 關鍵字 (code/xdata/bit/…) 由 reg51.h 的巨集處理。
"""
import re

SFR_ADDR = {
    'P0': 0x80, 'SP': 0x81, 'DPL': 0x82, 'DPH': 0x83, 'PCON': 0x87,
    'TCON': 0x88, 'TMOD': 0x89, 'TL0': 0x8A, 'TL1': 0x8B, 'TH0': 0x8C, 'TH1': 0x8D,
    'P1': 0x90, 'SCON': 0x98, 'SBUF': 0x99, 'P2': 0xA0, 'IE': 0xA8, 'P3': 0xB0,
    'IP': 0xB8, 'T2CON': 0xC8, 'PSW': 0xD0, 'ACC': 0xE0, 'B': 0xF0,
}

HEADER_ALIASES = {
    'reg51.h', 'reg52.h', 'at89x51.h', 'at89x52.h', 'at89s51.h', 'at89s52.h',
    '8051.h', '8052.h', 'regx51.h', 'regx52.h', 'stc89c5xrc.h',
}

RE_SBIT = re.compile(r'\bsbit\s+(\w+)\s*=\s*(\w+)\s*\^\s*(\d)\s*;')
RE_SBIT_ADDR = re.compile(r'\bsbit\s+(\w+)\s*=\s*(0[xX][0-9A-Fa-f]+|\d+)\s*;')
RE_SFR = re.compile(r'\bsfr\s+(\w+)\s*=\s*(0[xX][0-9A-Fa-f]+|\d+)\s*;')
RE_SFR16 = re.compile(r'\bsfr16\s+(\w+)\s*=\s*(0[xX][0-9A-Fa-f]+|\d+)\s*;')
RE_INT = re.compile(r'\)\s*interrupt\s+(\d+)(?:\s+using\s+(\d+))?')
RE_INT_PAREN_EMPTY = re.compile(r'(\b\w+)\s*\(\s*\)\s*(__interrupt)')
RE_INCLUDE = re.compile(r'#\s*include\s*[<"]([^>"]+)[>"]')
RE_INTRINS = re.compile(r'#\s*include\s*[<"]intrins\.h[>"]', re.I)

# 在 Keil 中這些符號可能被當成 sbit 用於 SFR 位元運算，SDCC 同樣支援

def convert(src: str):
    """回傳 (converted_source, notes:list[str])"""
    out_lines = []
    notes = []
    user_sfr = dict(SFR_ADDR)
    for lineno, line in enumerate(src.split('\n'), 1):
        orig = line

        # include 別名
        m = RE_INCLUDE.search(line)
        if m:
            name = m.group(1).strip().lower()
            base = name.split('/')[-1]
            if base in HEADER_ALIASES:
                line = line[:m.start()] + '#include <reg51.h>' + line[m.end():]
            elif base == 'intrins.h':
                line = line[:m.start()] + '#include <intrins.h>' + line[m.end():]
            elif base in ('stdio.h', 'string.h', 'stdlib.h', 'math.h', 'ctype.h', 'stdint.h', 'stdbool.h', 'stdarg.h', 'absacc.h'):
                if base == 'absacc.h':
                    line = line[:m.start()] + '#include <absacc.h>' + line[m.end():]
            # 其他自訂 header 保持原樣

        # sfr16 先於 sfr
        def sfr16_sub(mm):
            user_sfr[mm.group(1)] = int(mm.group(2), 0)
            return f'__sfr16 __at({mm.group(2)}) {mm.group(1)};'
        line = RE_SFR16.sub(sfr16_sub, line)

        def sfr_sub(mm):
            user_sfr[mm.group(1)] = int(mm.group(2), 0)
            return f'__sfr __at({mm.group(2)}) {mm.group(1)};'
        line = RE_SFR.sub(sfr_sub, line)

        def sbit_sub(mm):
            name, base, bitn = mm.group(1), mm.group(2), int(mm.group(3))
            if base in user_sfr:
                addr = user_sfr[base] + bitn
                return f'__sbit __at(0x{addr:02X}) {name};'
            notes.append(f'第 {lineno} 行：sbit 基底 {base} 不是已知 SFR，改用 SDCC 語法 {base}^{bitn}')
            return f'__sbit __at({base}+{bitn}) {name};'
        line = RE_SBIT.sub(sbit_sub, line)
        line = RE_SBIT_ADDR.sub(lambda mm: f'__sbit __at({mm.group(2)}) {mm.group(1)};', line)

        # interrupt N using M
        def int_sub(mm):
            s = f') __interrupt({mm.group(1)})'
            if mm.group(2):
                s += f' __using({mm.group(2)})'
            return s
        line = RE_INT.sub(int_sub, line)
        # void f() __interrupt → void f(void) __interrupt（SDCC 要求原型）
        line = RE_INT_PAREN_EMPTY.sub(r'\1(void) \2', line)

        out_lines.append(line)
    return '\n'.join(out_lines), notes


if __name__ == '__main__':
    import sys
    src = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    conv, notes = convert(src)
    print(conv)
    for n in notes:
        print('//', n, file=sys.stderr)
