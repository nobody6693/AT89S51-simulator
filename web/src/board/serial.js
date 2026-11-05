// 串列埠外接的東西（課本第 5 章）。都不在 KDM+ 上，是另外接到 P3.0(RxD)、P3.1(TxD) 的電路。
//
//   loopback  P3.0 與 P3.1 短路（JP3 上套短路環），單機自傳
//   shift165  74165 並入串出：out→P3.0、clock→P3.1、shift/load→P3.2，A~H 接指撥開關
//   shift164  74164 串入並出：A、B→P3.0、clock→P3.1，QA~QH 接 8 顆 LED（低態亮）
//   board2    第二塊 KT89S51：RxD、TxD 交叉對接，地線共接
//   pc        經 MAX232 接個人電腦（虛擬的 PC_RS232 視窗）
//
// 這裡只看腳位電位，不跟 CPU 的 UART 直接講話：程式把 P3.1 拉低，74164 一樣會看到脈波。
import { DutyTracker } from './util.js';

export const SERIAL_KINDS = [
  ['none', '不接'],
  ['loopback', 'P3.0、P3.1 短路（單機自傳）'],
  ['shift165', '74165 並入串出'],
  ['shift164', '74164 串入並出'],
  ['board2', '第二塊 KT89S51（雙機互傳）'],
  ['pc', 'MAX232 接個人電腦'],
];

const RXD = 1, TXD = 2, LOAD = 4;       // P3.0、P3.1、P3.2 的遮罩
const LEDS164 = (q) => (i) => !((q >> (7 - i)) & 1);   // DS1~DS8 = QH~QA，低態亮

export class SerialExt {
  constructor(sim) {
    this.sim = sim;
    this.kind = 'none';
    this.sw165 = new Uint8Array(8);      // index 0~7 = A~H，1 = 撥 ON（接地讀 0）；電阻排上拉，OFF 讀 1
    this.reg165 = 0xFF;                  // bit i = 第 i 級（A 級 … H 級），bit7 就是 out(QH)
    this.q164 = 0xFF;                    // bit i = QA … QH
    this.peer = null;                    // 第二塊板子（另一個 Sim）
    this.other = null;                   // 對接的那塊板子（兩邊互指）
    this.duty164 = new DutyTracker(8);   // 74164 沒有栓鎖，移位時輸出也在變，LED 要算亮的時間比例
    this.duty164.reset(0);
    this._r = { low: [0, 0, 0, 0] };
    this.wiredP3 = false;
    sim.bus.addDriver(this);
    sim.bus.fastDriver = this;
    sim.bus.onPinChange((port, now, old) => { if (port === 3) this._p3(now, old); });
    sim.wiring.onChange(() => this.sync());
  }

  update(pins) {
    let low = 0;
    switch (this.kind) {
      case 'loopback': if ((pins[3] & (RXD | TXD)) !== (RXD | TXD)) low = RXD | TXD; break;   // 短路：一邊低兩邊都低
      case 'shift165': if (!(this.reg165 & 0x80)) low = RXD; break;
      case 'board2': if (this.other && !(this.other.bus.pins[3] & TXD)) low = RXD; break;     // 跳接：對方的 TxD 接我的 RxD
      default: break;
    }
    this._r.low[3] = low;                // 共用一個物件：Mode 0 每微秒都要算，不要一直配置記憶體
    return this._r;
  }
  // P3.0~P3.2 有別的東西在看（插著 LCM、KDM+ 接到這幾支腳）就不能走 PortBus 的快速路徑
  fastOK() { return !this.wiredP3 && !this.sim.lcd.attached; }

  _p3(now, old) {
    if (this.kind === 'board2') {
      if ((now ^ old) & TXD && this.other) this.other.bus.refresh(3);
    } else if (this.kind === 'shift165') {
      if (!(now & LOAD)) this._load165();                                    // shift/load 低態：非同步載入
      else if (!(old & TXD) && (now & TXD)) this.reg165 = ((this.reg165 << 1) | 1) & 0xFF;   // 升緣移位；SER 腳空接視為 1
      this.sim.bus.refresh(3);           // out(QH) 可能變了
    } else if (this.kind === 'shift164') {
      if (!(old & TXD) && (now & TXD)) {                       // A、B 接在一起都是 RxD
        this.q164 = ((this.q164 << 1) | (now & RXD)) & 0xFF;
        this.duty164.update(this.sim.cpu.cycles, LEDS164(this.q164));
      }
    }
  }
  _load165() {
    let v = 0;
    for (let i = 0; i < 8; i++) if (!this.sw165[i]) v |= 1 << i;
    this.reg165 = v;
  }

  // 74165 的指撥開關：i = 0~7 對應 A~H。mode 0 先進來的是 H（D0），最後才是 A（D7）
  set165(i, on) {
    this.sw165[i] = on ? 1 : 0;
    if (this.kind === 'shift165' && !(this.sim.bus.pins[3] & LOAD)) { this._load165(); this.sim.bus.refresh(3); }
  }

  // PC 傳一個位元組給 8051
  pcSend(byte) {
    const q = this.sim.cpu.uartRxQueue;
    if (this.kind === 'pc' && q.length < 64) this.sim.cpu.uartReceive(byte & 0xFF);   // 程式都不收的話別一直堆
  }

  // 接線改了：換上對應的電路
  sync() {
    const k = (this.sim.wiring.cfg && this.sim.wiring.cfg.serial) || 'none';
    if (k !== this.kind) {
      this.kind = k;
      this._dropPeer();
      if (k === 'board2') this._makePeer();
    }
    const p = this.sim.wiring.pins || {};
    this.wiredP3 = Object.values(p).flat().some((r) => r && r.port === 3 && r.bit < 3);
    this.sim.bus.invalidate();
  }
  _makePeer() {
    const peer = new this.sim.constructor();
    this.peer = peer;
    this.other = peer;
    peer.serial.other = this.sim;
    peer.serial.kind = 'board2';
    peer.isSecondBoard = true;
    this.sim.cpu.peer = peer.cpu;
    if (this.sim.program) this.onLoad(this.sim.program);
  }
  _dropPeer() {
    if (!this.peer) return;
    this.sim.cpu.peer = null;
    this.peer.serial.other = null;
    this.peer = null;
    this.other = null;
  }
  // 程式載入：第二塊板子跑 peerHex；沒指定就跟第一塊一樣（課本 5-4-4「兩塊燒同一支」）
  onLoad(program) {
    if (!this.peer) return;
    this.peer.load({ hex: program.peerHex || program.hex || '', lines: [], symbols: {}, name: program.peerName || program.name });
    this.peer.cpu.cycles = this.sim.cpu.cycles;
  }
  // 每幀取樣：led164[i] = DS(i+1) 亮的時間比例
  frame() { return { led164: this.duty164.sample(this.sim.cpu.cycles) }; }
  reset() {
    this.reg165 = 0xFF;
    this.q164 = 0xFF;
    this.duty164.reset(this.sim.cpu.cycles);
    if (this.peer) this.peer.reset();
    this.sim.bus.invalidate();
  }
}
