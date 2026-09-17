// 版面自動檢查：算出每段文字與每支針腳的外框，報告「字壓字」與「字壓針腳」。
//   node tools/render-board.mjs && node tools/check-layout.mjs
// 座標是 SVG 單位（= 照片像素 × 2）。

import { readFileSync } from 'node:fs';
import { HEADERS } from '../web/src/ui/headers.js';

const SVG = readFileSync(new URL('./board-preview.svg', import.meta.url), 'utf-8');
const S = 2;                       // board.js 的 SCALE

// 全形／CJK 約一個字寬，半形約 0.55 個字寬
const charW = (ch) => (/[⺀-鿿＀-｠　-〿]/.test(ch) ? 1.0 : 0.55);
const textW = (t, fs) => [...t].reduce((a, c) => a + charW(c), 0) * fs;

const texts = [];
const re = /<text\s([^>]*)>([^<]*)<\/text>/g;
let m;
while ((m = re.exec(SVG))) {
  const at = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
  const s = m[2].trim();
  if (!s) continue;
  const fs = parseFloat(at['font-size'] || 12);
  const w = textW(s, fs), x = parseFloat(at.x), y = parseFloat(at.y);
  const anchor = at['text-anchor'] || 'start';
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  texts.push({ s, fs, x0, x1: x0 + w, y0: y - fs * 0.80, y1: y + fs * 0.25 });
}

// 針腳焊點（從 headers.js 直接算，跟 board.js 的 _header 同一套公式）
const pins = [];
for (const h of HEADERS) {
  const cols = h.cols || 1, pitch = h.pitch, gap = h.colGap || 9;
  h.pins.forEach((p, i) => {
    const r = cols === 2 ? Math.floor(i / 2) : i, c = cols === 2 ? i % 2 : 0;
    const px = (h.horiz ? h.x + r * pitch : h.x + c * gap) * S;
    const py = (h.horiz ? h.y : h.y + r * pitch) * S;
    pins.push({ id: `${h.id}#${i + 1}`, name: p[0], x0: px - 3.4, x1: px + 3.4, y0: py - 3.4, y1: py + 3.4 });
  });
}

const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
                       Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

const tt = [], tp = [];
for (let i = 0; i < texts.length; i++) {
  for (let j = i + 1; j < texts.length; j++)
    if (hit(texts[i], texts[j])) tt.push([texts[i], texts[j], area(texts[i], texts[j])]);
  for (const p of pins)
    if (hit(texts[i], p)) tp.push([texts[i], p, area(texts[i], p)]);
}

const px = (v) => (v / S).toFixed(0);            // 印成照片像素比較好對照片
const small = texts.filter(t => t.fs < 10).length;

console.log(`文字 ${texts.length} 段（其中 ${small} 段字級 < 10 SVG 單位 = 5 照片像素）、針腳 ${pins.length} 支`);
console.log(`\n字壓字：${tt.length}`);
for (const [a, b, s] of tt.sort((x, y) => y[2] - x[2]).slice(0, 40))
  console.log(`  「${a.s}」×「${b.s}」  在 (${px(a.x0)}, ${px(a.y0)})  重疊 ${s.toFixed(0)}`);
console.log(`\n字壓針腳：${tp.length}`);
for (const [a, p, s] of tp.sort((x, y) => y[2] - x[2]).slice(0, 40))
  console.log(`  「${a.s}」壓到 ${p.id} (${p.name})  在 (${px(a.x0)}, ${px(a.y0)})  重疊 ${s.toFixed(0)}`);

const fsList = [...new Set(texts.map(t => t.fs))].sort((a, b) => a - b);
console.log(`\n用到的字級（SVG 單位）：${fsList.join(', ')}`);
if (tt.length + tp.length) process.exitCode = 1;
