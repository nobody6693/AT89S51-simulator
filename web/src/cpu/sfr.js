// 8051 特殊功能暫存器 (SFR) 位址常數與位元定址對照
// 依據 AT89S51 datasheet

export const SFR = {
  P0: 0x80, SP: 0x81, DPL: 0x82, DPH: 0x83,
  PCON: 0x87,
  TCON: 0x88, TMOD: 0x89, TL0: 0x8A, TL1: 0x8B, TH0: 0x8C, TH1: 0x8D,
  AUXR: 0x8E,
  P1: 0x90,
  SCON: 0x98, SBUF: 0x99,
  P2: 0xA0,
  AUXR1: 0xA2,
  WDTRST: 0xA6,
  IE: 0xA8,
  P3: 0xB0,
  IP: 0xB8,
  PSW: 0xD0,
  ACC: 0xE0,
  B: 0xF0,
};

// PSW 位元
export const PSW_P  = 0x01;
export const PSW_F1 = 0x02;
export const PSW_OV = 0x04;
export const PSW_RS0 = 0x08;
export const PSW_RS1 = 0x10;
export const PSW_F0 = 0x20;
export const PSW_AC = 0x40;
export const PSW_CY = 0x80;

// TCON 位元
export const TCON_IT0 = 0x01, TCON_IE0 = 0x02, TCON_IT1 = 0x04, TCON_IE1 = 0x08;
export const TCON_TR0 = 0x10, TCON_TF0 = 0x20, TCON_TR1 = 0x40, TCON_TF1 = 0x80;

// IE 位元
export const IE_EX0 = 0x01, IE_ET0 = 0x02, IE_EX1 = 0x04, IE_ET1 = 0x08, IE_ES = 0x10, IE_EA = 0x80;

// SCON 位元
export const SCON_RI = 0x01, SCON_TI = 0x02, SCON_RB8 = 0x04, SCON_TB8 = 0x08;
export const SCON_REN = 0x10, SCON_SM2 = 0x20, SCON_SM1 = 0x40, SCON_SM0 = 0x80;

// 名稱查表（除錯面板用）
export const SFR_NAMES = {};
for (const [k, v] of Object.entries(SFR)) SFR_NAMES[v] = k;

// 位元定址：0x00-0x7F → IRAM 0x20-0x2F；0x80-0xFF → SFR (位址 & 0xF8)
export function bitAddrToByte(bit) {
  return bit < 0x80 ? 0x20 + (bit >> 3) : (bit & 0xF8);
}
export function bitAddrToMask(bit) {
  return 1 << (bit & 7);
}

// 位元名稱（除錯用）
export const BIT_NAMES = {};
const bitNamed = (base, names) => names.forEach((n, i) => { if (n) BIT_NAMES[base + i] = n; });
bitNamed(0x80, ['P0.0','P0.1','P0.2','P0.3','P0.4','P0.5','P0.6','P0.7']);
bitNamed(0x88, ['IT0','IE0','IT1','IE1','TR0','TF0','TR1','TF1']);
bitNamed(0x90, ['P1.0','P1.1','P1.2','P1.3','P1.4','P1.5','P1.6','P1.7']);
bitNamed(0x98, ['RI','TI','RB8','TB8','REN','SM2','SM1','SM0']);
bitNamed(0xA0, ['P2.0','P2.1','P2.2','P2.3','P2.4','P2.5','P2.6','P2.7']);
bitNamed(0xA8, ['EX0','ET0','EX1','ET1','ES',null,null,'EA']);
bitNamed(0xB0, ['RXD','TXD','INT0','INT1','T0','T1','WR','RD']);
bitNamed(0xB8, ['PX0','PT0','PX1','PT1','PS']);
bitNamed(0xD0, ['P','F1','OV','RS0','RS1','F0','AC','CY']);
bitNamed(0xE0, ['ACC.0','ACC.1','ACC.2','ACC.3','ACC.4','ACC.5','ACC.6','ACC.7']);
bitNamed(0xF0, ['B.0','B.1','B.2','B.3','B.4','B.5','B.6','B.7']);
