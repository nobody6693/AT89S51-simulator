// 「原本灰色、現在補上」的那些腳：電源軌跳線、RST/EA、I²C WP、JP11 跳線帽
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../web/src/sim.js';
import { HEADERS, isPort } from '../web/src/ui/headers.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };

const tie = (s, map) => s.wiring.set({ ...s.wiring.cfg, ties: map });

test('接 GND：不管程式寫什麼，那支腳都讀到 0', () => {
  const s = new Sim();
  s.bus.write(1, 0xFF);                       // P1 全部寫 1
  assert.equal(s.bus.pins[1], 0xFF, '沒跳線時 P1 應該全是 1');
  tie(s, { 'P1.3': 'gnd' });
  assert.equal((s.bus.pins[1] >> 3) & 1, 0, 'P1.3 被拉到 GND 應該讀 0');
  assert.equal((s.bus.pins[1] >> 2) & 1, 1, '旁邊的 P1.2 不該受影響');
  assert.equal(s.bus.latch[1], 0xFF, 'latch 不會被外部拉低改變（讀 latch 仍是 1）');
});

test('接 VCC：CPU 寫 0 會造成電氣衝突並警告', () => {
  const s = new Sim();
  tie(s, { 'P1.0': 'vcc' });
  s.bus.write(1, 0xFE);                       // P1.0 寫 0 = 強拉低，同時被跳線拉高
  assert.ok(s.bus.contention[1] & 1, 'P1.0 應該被記成 CPU 拉低 vs 外部推高的衝突');
  const w = s.frame(1000);
  assert.ok(s.warnings.some(x => x.includes('P1') && x.includes('衝突')), '應該要有電氣衝突警告');
  assert.ok(w);
});

test('RST 接 VCC 會被判定成「按住重置」，接 GND 不會', () => {
  const s = new Sim();
  assert.equal(s.rails.heldInReset, false);
  tie(s, { RST: 'vcc' });
  assert.equal(s.rails.heldInReset, true);
  assert.ok(s.rails.warnings().some(x => x.includes('一直處在重置')));
  tie(s, { RST: 'gnd' });
  assert.equal(s.rails.heldInReset, false);
  // 接 GND / VCC 的效果畫面上看得到，不再另外跳警告
  assert.deepEqual(s.rails.warnings(), [], '只有 RST→VCC 與 EA→GND 才值得警告');
});

test('EA 接 GND 會警告「這塊板子沒有外接 ROM」', () => {
  const s = new Sim();
  tie(s, { EA: 'gnd' });
  assert.ok(s.rails.warnings().some(x => x.includes('外部 ROM') && x.includes('沒有外接 ROM')));
});

test('JP11 跳線帽決定 ADC CH1 吃不吃得到 LM35', () => {
  const s = new Sim();
  s.spi.tempC = 30;
  assert.equal(s.wiring.cfg.jp11, true, '預設跳線帽是裝上的');
  assert.ok(Math.abs(s.spi.channelVolts(1) - 0.30) < 1e-9, '30°C → 0.30V');
  s.wiring.set({ ...s.wiring.cfg, jp11: false });
  assert.equal(s.spi.channelVolts(1), 0, '拔掉跳線帽 → CH1 浮接讀 0V');
  assert.ok(Math.abs(s.spi.channelVolts(0) - s.spi.potVolts) < 1e-9, 'CH0（VR1）不受影響');
});

test('I²C 的 WP 腳：拉高就擋掉 EEPROM 寫入', () => {
  const s = new Sim();
  // WP 沒拉線 → 板上下拉 → 可寫
  assert.equal(s.i2c.writeProtected(), false);
  // 把 WP 接到 P2.5，該腳為 1 時應該進入寫入保護
  s.wiring.set({ ...s.wiring.cfg, i2cWp: 'P2.5', enabled: { ...s.wiring.cfg.enabled, i2c: true } });
  s.bus.write(2, 0xFF);
  assert.equal(s.i2c.writeProtected(), true, 'P2.5 = 1 → 寫入保護');
  s.bus.write(2, 0xFF & ~(1 << 5));
  assert.equal(s.i2c.writeProtected(), false, 'P2.5 = 0 → 可寫');
});

test('每一支腳都有明確的角色，沒有「不知道是什麼」的漏網之魚', () => {
  const KINDS = ['dev', 'rail', 'ctrl', 'jumper', 'out', 'fixed', 'na'];
  const unclassified = [];
  for (const h of HEADERS) h.pins.forEach(([name, sig], i) => {
    if (sig && (isPort(sig) || KINDS.includes(sig.split(':')[0]))) return;
    if (name === '') return;                   // KDM+ JP2 中間那支沒有絲印
    unclassified.push(`${h.id} 第 ${i + 1} 腳 (${name})`);
  });
  assert.deepEqual(unclassified, [], '這些腳還沒分類：' + unclassified.join('、'));
});

test('可拉線／可操作的腳位數量符合預期', () => {
  const n = {};
  for (const h of HEADERS) for (const [, sig] of h.pins) {
    const k = !sig ? 'none' : isPort(sig) ? 'port' : sig.split(':')[0];
    n[k] = (n[k] || 0) + 1;
  }
  assert.equal(n.rail, 30, '電源軌腳（GND/VCC/+5V/VSS/VDD）共 30 支');
  assert.equal(n.ctrl, 2, 'RST 與 EA');
  assert.equal(n.jumper, 2, 'JP11 的跳線帽兩支腳');
  assert.equal(n.fixed, 6, 'CN3 馬達本體六條線');
  assert.equal(n.out, 3, 'DAC CHA/CHB 與 ADC CH1');
  // 真的模擬不了的只剩下：ALE PSEN X1 X2 / LCM VO / JP6 RGB ×3 / JP4 中 / KDM+ JP2 ×2 / JPX ×4
  assert.equal(n.na, 15, '真的無法模擬的腳剩 15 支');
});
