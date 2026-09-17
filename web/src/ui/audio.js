import { WORKLET_SRC } from './buzzer-worklet-src.js';
// 蜂鳴器音訊。兩種實作：
//   worklet  把模擬時間軸（µs）的翻轉事件對應到音訊取樣點，最忠實
//   osc      退路：直接用方波振盪器跟著量到的頻率走
// 需要退路是因為 AudioWorklet 得從一個網址載入程式碼，而單檔版只能用 blob:／data:，
// 有些環境的 CSP 會擋掉 —— 擋掉就完全沒聲音，寧可退化也不要靜音。
export class BuzzerAudio {
  constructor() {
    this.ctx = null; this.node = null;
    this.mode = null;      // 'worklet' | 'osc'
    this.enabled = false;
    this.writeT = 0;
    this.cursor = 0;
    this.latency = 0;
    this.volume = 0.12;
    this.lastErr = '';
  }

  // iOS 規定 AudioContext 必須在使用者手勢「當下那個 tick」裡建立並 resume。
  // 只要中間插了一個 await，手勢資格就沒了，resume 會被忽略、然後一直靜音。
  // 所以這一段全部同步，worklet 之類的非同步工作留到後面。
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.lastErr = '這個瀏覽器沒有 Web Audio'; return false; }
      this.ctx = new AC();
      // iOS 16.4+：不設這個的話，手機側邊的靜音開關會把 WebAudio 一起靜音
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    }
    if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
    return true;
  }

  async init() {
    if (!this.unlock()) return;
    if (this.mode) return;
    try {
      await this._initWorklet();
      this.mode = 'worklet';
    } catch (e) {
      this.lastErr = String(e && e.message || e);
      this._initOsc();
      this.mode = 'osc';
    }
  }

  async _initWorklet() {
    if (!this.ctx.audioWorklet) throw new Error('沒有 AudioWorklet');
    // blob: 被 CSP 擋掉時再試 data:，兩個都不行就丟出去改用退路
    let last;
    for (const make of [
      () => URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' })),
      () => 'data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(WORKLET_SRC))),
    ]) {
      let url = null;
      try {
        url = make();
        await this.ctx.audioWorklet.addModule(url);
        this.node = new AudioWorkletNode(this.ctx, 'buzzer-processor');
        this.node.port.onmessage = (e) => { if (e.data.type === 'cursor') { this.cursor = e.data.cursor; this.queued = e.data.queued; } };
        this.node.connect(this.ctx.destination);
        this.latency = Math.round(this.ctx.sampleRate * 0.08);
        this.writeT = this.cursor + this.latency;
        this.node.port.postMessage({ type: 'amp', value: this.volume });
        return;
      } catch (e) { last = e; }
      finally { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); }
    }
    throw last || new Error('worklet 載入失敗');
  }

  _initOsc() {
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = 'square';
    this.osc.frequency.value = 1000;
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
  }

  async enable(on) {
    if (on) {
      if (!this.unlock()) return;          // 同步：先在手勢裡把音訊解鎖
      await this.init();                   // 之後才做非同步的 worklet 載入
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) {} }
      this.enabled = true;
      this.writeT = this.cursor + this.latency;
    } else {
      this.enabled = false;
      if (this.node) this.node.port.postMessage({ type: 'clear' });
      if (this.gain) this.gain.gain.value = 0;
    }
  }
  setVolume(v) { this.volume = v; if (this.node) this.node.port.postMessage({ type: 'amp', value: v }); }

  // 退路模式：跟著模擬器量到的頻率與工作週期開關聲音
  tone(freq, duty, running) {
    if (this.mode !== 'osc' || !this.enabled || !this.osc) return;
    const on = !!running && duty > 0.02 && duty < 0.98 && freq > 20 && freq < 20000;
    const t = this.ctx.currentTime;
    if (on) this.osc.frequency.setTargetAtTime(Math.min(12000, freq), t, 0.01);
    this.gain.gain.setTargetAtTime(on ? this.volume : 0, t, 0.008);
  }

  // events: [[cycle,on],...]；frameStartCycle 為本幀起點；frameCycles 為本幀模擬 µs；speed 倍率
  push(events, frameStartCycle, frameCycles, speed, running) {
    if (!this.enabled || this.mode !== 'worklet' || !this.node) return;
    if (!running || !isFinite(speed) || speed <= 0) { if (events.length) this.node.port.postMessage({ type: 'clear' }); return; }
    const sr = this.ctx.sampleRate;
    const k = sr / 1e6 / speed;   // 每模擬 µs 對應的取樣數
    // 同步：若落後（緩衝乾了）或超前太多，重新對齊
    const ahead = this.writeT - this.cursor;
    if (ahead < 0 || ahead > sr * 0.4) this.writeT = this.cursor + this.latency;
    const out = [];
    for (const [cyc, on] of events) out.push({ t: Math.round(this.writeT + (cyc - frameStartCycle) * k), v: on });
    if (out.length) this.node.port.postMessage({ type: 'events', events: out });
    this.writeT += frameCycles * k;
  }
}
