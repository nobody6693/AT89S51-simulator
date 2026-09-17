// 電源軌跳線：把某支埠腳用杜邦線接到 GND 或 VCC（課本 2-7-2 的「用杜邦線碰 GND」）。
//   接 GND → 硬拉低，程式寫 1 也讀回 0
//   接 VCC → 硬拉高；CPU 同時寫 0 就是短路，PortBus 記成 contention
//   RST 接 VCC → 晶片被按住重置；EA 接 GND → 改抓外部 ROM，但本板沒有

export const RAIL_TARGETS = { RST: 'RST 重置腳', EA: 'EA 程式記憶體來源' };

export class RailTies {
  constructor(sim) {
    this.sim = sim;
    sim.bus.addDriver(this);
    // 接線一改（含電源軌跳線）就要重算腳位電位，否則畫面與程式看到的還是舊值
    sim.wiring.onChange(() => sim.bus.invalidate());
  }
  ties() { return (this.sim.wiring.cfg && this.sim.wiring.cfg.ties) || {}; }

  get heldInReset() { return this.ties().RST === 'vcc'; }

  update() {
    const low = [0, 0, 0, 0], high = [0, 0, 0, 0];
    for (const [pin, rail] of Object.entries(this.ties())) {
      const m = /^P([0-3])\.([0-7])$/.exec(pin);
      if (!m) continue;                       // RST / EA 不是埠腳，另外處理
      const p = +m[1], bit = 1 << +m[2];
      if (rail === 'gnd') low[p] |= bit; else high[p] |= bit;
    }
    return { low, high };
  }

  // 只警告「做了之後看不出來會怎樣」的：接 GND / VCC 的效果畫面上就看得到，不用再囉嗦
  warnings() {
    const out = [], t = this.ties();
    if (t.RST === 'vcc') out.push('RST 被跳線接到 VCC：晶片一直處在重置狀態，程式不會執行。');
    if (t.EA === 'gnd') out.push('EA 被跳線接到 GND：89S51 會改從外部 ROM 取碼，但這塊板子沒有外接 ROM，實機上會抓到空指令。模擬器仍照內部 4K ROM 執行。');
    return out;
  }
}
