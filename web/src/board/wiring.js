// 接線設定：KDM+ 擴充板各接頭 → 8051 腳位

import { parsePin, pinName } from './util.js';

// 每個接頭的描述（UI 與衝突偵測用）
export const CONNECTORS = [
  { key: 'seg',       label: '七段 段選 a–dp (JP3 SEG)', width: 8, group: '七段顯示器' },
  { key: 'digit',     label: '位選 X0–X7 (JP4 com)',       width: 8, group: '七段顯示器' },
  { key: 'dec138',    label: '74LS138 A/B/C (JP5)',        width: 3, group: '七段顯示器' },
  { key: 'matrixRow', label: 'LED 陣列 列 R1–R8 (JP6)',    width: 8, group: 'LED 陣列' },
  { key: 'keyOut',    label: '鍵盤 KO0–KO3 掃描輸出 (JP8)', width: 4, group: '4×4 鍵盤' },
  { key: 'keyIn',     label: '鍵盤 KI0–KI3 讀回 (JP8)',    width: 4, group: '4×4 鍵盤' },
  { key: 'stepper',   label: '步進馬達 S0–S3 (JP7)',       width: 4, group: '步進馬達' },
  { key: 'spiSck',    label: 'SPI SCK (JP10)',             width: 1, group: 'ADC / DAC' },
  { key: 'spiSdi',    label: 'SPI SDI → 晶片 (JP10)',      width: 1, group: 'ADC / DAC' },
  { key: 'spiSdo',    label: 'SPI SDO ← ADC (JP10)',       width: 1, group: 'ADC / DAC' },
  { key: 'adcCs',     label: 'ADC_CS (JP10)',              width: 1, group: 'ADC / DAC' },
  { key: 'dacCs',     label: 'DAC_CS (JP10)',              width: 1, group: 'ADC / DAC' },
  { key: 'dacLd',     label: 'LDAC (JP10)',                width: 1, group: 'ADC / DAC' },
  { key: 'sda',       label: 'I²C SDA (JP1)',              width: 1, group: 'I²C' },
  { key: 'scl',       label: 'I²C SCL (JP1)',              width: 1, group: 'I²C' },
  { key: 'i2cWp',     label: 'I²C WP 寫入保護 (JP1)',      width: 1, group: 'I²C' },
];

// 主板固定接腳（供衝突提示）
export const MAINBOARD_PINS = {
  'P1.0': 'LED DS1', 'P1.1': 'LED DS2', 'P1.2': 'LED DS3', 'P1.3': 'LED DS4',
  'P1.4': 'LED DS5', 'P1.5': 'LED DS6', 'P1.6': 'LED DS7', 'P1.7': 'LED DS8',
  'P0.0': 'SW1-1 / LCD D0', 'P0.1': 'SW1-2 / LCD D1', 'P0.2': 'SW1-3 / LCD D2', 'P0.3': 'SW1-4 / LCD D3',
  'P0.4': 'SW1-5 / LCD D4', 'P0.5': 'SW1-6 / LCD D5', 'P0.6': 'SW1-7 / LCD D6', 'P0.7': 'SW1-8 / LCD D7',
  'P3.0': 'LCD E / RXD', 'P3.1': 'LCD R/W / TXD', 'P3.2': 'LCD RS / PB1 / INT0', 'P3.3': 'PB2 / INT1',
  'P3.7': '蜂鳴器', 'P2.0': 'PB3', 'P2.1': 'PB4',
};

// 出廠狀態：KDM+ 一條線都沒接（跟真板子一樣，排線要自己插）
const N8 = () => [null, null, null, null, null, null, null, null];
const N4 = () => [null, null, null, null];
export const DEFAULT_WIRING = {
  digitMode: 'direct',           // 'direct' | '138'
  seg: N8(), digit: N8(), dec138: [null, null, null], matrixRow: N8(),
  keyOut: N4(), keyIn: N4(), stepper: N4(),
  spiSck: null, spiSdi: null, spiSdo: null, adcCs: null, dacCs: null, dacLd: null,
  sda: null, scl: null, i2cWp: null,
  ties: {},
  jp11: true,
  enabled: { seg7: false, matrix: false, keypad: false, stepper: false, spi: false, i2c: false },
};

// 各範例的建議接線（載入範例時自動套用）
const P8 = (p) => Array.from({ length: 8 }, (_, i) => `P${p}.${i}`);
const P4 = (p, o) => Array.from({ length: 4 }, (_, i) => `P${p}.${o + i}`);
export const EXAMPLE_WIRING = {
  '01': { enabled: {} },
  '02': { enabled: { keypad: true }, keyOut: P4(2, 0), keyIn: P4(2, 4), lcm: true },
  '03': { enabled: { seg7: true }, seg: P8(0), digit: P8(2), digitMode: 'direct' },
  '04': { enabled: { matrix: true }, matrixRow: P8(1), digit: P8(2), digitMode: 'direct' },
  '05': { enabled: { stepper: true }, stepper: P4(1, 0) },
  '06': { enabled: { spi: true }, spiSck: 'P1.0', spiSdi: 'P1.1', spiSdo: 'P1.2', adcCs: 'P1.3', dacCs: 'P1.4', dacLd: null },
  '07': { enabled: { i2c: true }, sda: 'P1.6', scl: 'P1.7' },
  '08': { enabled: {} },
};
export function wiringForExample(name) {
  const m = /^(\d\d)/.exec(name || '');
  return m ? EXAMPLE_WIRING[m[1]] || null : null;
}

export class Wiring {
  constructor(cfg) { this.set(cfg || DEFAULT_WIRING); this.listeners = []; }
  onChange(fn) { this.listeners.push(fn); }
  set(cfg) {
    this.cfg = JSON.parse(JSON.stringify({
      ...DEFAULT_WIRING, ...cfg,
      enabled: { ...DEFAULT_WIRING.enabled, ...(cfg.enabled || {}) },
      ties: { ...(cfg.ties || {}) },
      jp11: cfg.jp11 === undefined ? true : !!cfg.jp11,
    }));
    this._parse();
    if (this.listeners) for (const fn of this.listeners) fn(this);
  }
  _parse() {
    const c = this.cfg;
    const arr = (a, n) => { const out = []; for (let i = 0; i < n; i++) out.push(parsePin(a && a[i])); return out; };
    this.pins = {
      seg: arr(c.seg, 8), digit: arr(c.digit, 8), dec138: arr(c.dec138, 3), matrixRow: arr(c.matrixRow, 8),
      keyOut: arr(c.keyOut, 4), keyIn: arr(c.keyIn, 4), stepper: arr(c.stepper, 4),
      spiSck: parsePin(c.spiSck), spiSdi: parsePin(c.spiSdi), spiSdo: parsePin(c.spiSdo),
      adcCs: parsePin(c.adcCs), dacCs: parsePin(c.dacCs), dacLd: parsePin(c.dacLd),
      sda: parsePin(c.sda), scl: parsePin(c.scl), i2cWp: parsePin(c.i2cWp),
    };
  }
  isEnabled(k) { return !!this.cfg.enabled[k]; }

  // 衝突偵測：同一腳位被多個「啟用中」的 KDM+ 接頭使用，或與主板週邊重疊
  conflicts() {
    const use = {}; // pinName → [labels]
    const c = this.cfg;
    const add = (label, ref) => { if (!ref) return; const n = pinName(ref); (use[n] = use[n] || []).push(label); };
    const en = c.enabled;
    if (en.seg7) {
      this.pins.seg.forEach((p, i) => add(`七段 seg${'abcdefg.'[i]}`, p));
      if (c.digitMode === '138') this.pins.dec138.forEach((p, i) => add(`74LS138 ${'ABC'[i]}`, p));
      else this.pins.digit.forEach((p, i) => add(`位選 X${i}`, p));
    }
    if (en.matrix) {
      this.pins.matrixRow.forEach((p, i) => add(`陣列 R${i + 1}`, p));
      if (!en.seg7) {
        if (c.digitMode === '138') this.pins.dec138.forEach((p, i) => add(`74LS138 ${'ABC'[i]}`, p));
        else this.pins.digit.forEach((p, i) => add(`行選 X${i}`, p));
      }
    }
    if (en.keypad) { this.pins.keyOut.forEach((p, i) => add(`鍵盤 KO${i}`, p)); this.pins.keyIn.forEach((p, i) => add(`鍵盤 KI${i}`, p)); }
    if (en.stepper) this.pins.stepper.forEach((p, i) => add(`馬達 S${i}`, p));
    if (en.spi) { add('SPI SCK', this.pins.spiSck); add('SPI SDI', this.pins.spiSdi); add('SPI SDO', this.pins.spiSdo); add('ADC_CS', this.pins.adcCs); add('DAC_CS', this.pins.dacCs); add('LDAC', this.pins.dacLd); }
    if (en.i2c) { add('SDA', this.pins.sda); add('SCL', this.pins.scl); add('WP 寫入保護', this.pins.i2cWp); }
    for (const [pin, rail] of Object.entries(c.ties || {}))
      if (/^P[0-3]\.[0-7]$/.test(pin)) (use[pin] = use[pin] || []).push(rail === 'gnd' ? '跳線接 GND' : '跳線接 VCC');
    const out = [];
    for (const [pin, labels] of Object.entries(use)) {
      const main = MAINBOARD_PINS[pin];
      if (labels.length > 1) out.push({ pin, level: 'error', msg: `${pin} 同時接了 ${labels.join('、')}` });
      else if (main) out.push({ pin, level: 'warn', msg: `${pin} 接了 ${labels[0]}，但主板上也是 ${main}` });
    }
    return out;
  }
  toJSON() { return this.cfg; }
}
