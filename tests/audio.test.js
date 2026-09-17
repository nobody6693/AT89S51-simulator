// 音效：worklet 載不起來時一定要有退路，不能默默變成靜音
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../tools/fake-dom.mjs';
import { BuzzerAudio } from '../web/src/ui/audio.js';

function fakeAudio({ workletOk }) {
  const events = [];
  class Node { connect(x) { return x; } }
  globalThis.AudioWorkletNode = class { constructor() { this.port = { postMessage(){}, onmessage: null }; } connect(){} };
  globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
  globalThis.Blob = class { constructor(p) { this.parts = p; } };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.AudioContext = class {
    constructor() {
      this.state = 'running'; this.sampleRate = 48000; this.destination = {}; this.currentTime = 0;
      this.audioWorklet = { addModule: async (url) => { events.push(url.slice(0, 5)); if (!workletOk) throw new Error('CSP 擋掉了'); } };
    }
    async resume() { this.state = 'running'; }
    createOscillator() { return Object.assign(new Node(), { type: '', frequency: { value: 0, setTargetAtTime() {} }, start() {} }); }
    createGain() { return Object.assign(new Node(), { gain: { value: 0, setTargetAtTime(v) { this.value = v; } } }); }
  };
  globalThis.window.AudioContext = globalThis.AudioContext;   // 真瀏覽器裡 window === globalThis
  return events;
}

test('worklet 可用時走 worklet', async () => {
  fakeAudio({ workletOk: true });
  const a = new BuzzerAudio();
  await a.enable(true);
  assert.equal(a.mode, 'worklet');
  assert.equal(a.enabled, true);
});

test('worklet 被擋掉時自動退回振盪器，仍然有聲音', async () => {
  const tried = fakeAudio({ workletOk: false });
  const a = new BuzzerAudio();
  await a.enable(true);
  assert.equal(a.mode, 'osc', '應該退回 osc 而不是整個壞掉');
  assert.equal(a.enabled, true);
  assert.deepEqual(tried, ['blob:', 'data:'], 'blob: 被擋要再試 data:');
  assert.ok(a.lastErr.includes('CSP'), '要記下失敗原因，方便回報');

  // 有在跑而且是方波 → gain 要被打開
  a.tone(1000, 0.5, true);
  assert.ok(a.gain.gain.value > 0, '應該出聲');
  a.tone(1000, 0.5, false);
  assert.equal(a.gain.gain.value, 0, '停止執行就靜音');
  a.tone(0, 1, true);
  assert.equal(a.gain.gain.value, 0, '持續導通（沒在翻轉）不該發出聲音');
});

test('關掉音效兩種模式都會靜音', async () => {
  fakeAudio({ workletOk: false });
  const a = new BuzzerAudio();
  await a.enable(true);
  a.tone(1000, 0.5, true);
  await a.enable(false);
  assert.equal(a.enabled, false);
  assert.equal(a.gain.gain.value, 0);
});
