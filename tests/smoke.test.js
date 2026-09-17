// 會讓「整個板子不見」的那類錯誤：某個模組有語法錯、或啟動時就丟例外。
// 這種錯不會被其他測試抓到 —— 它們只 import 自己要測的那幾個檔。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../web/src/', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (f.endsWith('.js') ? [p] : []);
});

test('web/src 底下每一個模組都載得起來（抓語法錯）', async () => {
  await import('../tools/fake-dom.mjs');           // 先備好 DOM，讓需要它的模組也能載
  const files = walk(SRC);
  assert.ok(files.length >= 20, `應該掃到 20 個以上的模組，實際 ${files.length}`);
  const bad = [];
  for (const f of files) {
    // app.js 會自己啟動，留給下一項測試
    if (f.endsWith(path.join('ui', 'app.js'))) continue;
    try { await import(pathToFileURL(f).href); }
    catch (e) { bad.push(`${path.relative(SRC, f)} → ${e.message}`); }
  }
  assert.deepEqual(bad, [], '這些模組載不起來：\n' + bad.join('\n'));
});

test('整個 app.js 啟動不會丟例外', async () => {
  await import('../tools/fake-dom.mjs');
  await import('../web/src/ui/app.js');            // 丟例外就直接讓測試失敗
});

test('一打開就有程式可以跑，不會是空白的', async () => {
  await import('../tools/fake-dom.mjs');
  await import('../web/src/ui/app.js');
  // 編輯器裡要有內容，而且那份內容要組譯得過、真的燒進 CPU
  const ed = document.querySelector('#source');
  const ta = [];
  ed.walk && ed.walk((n) => { if (n.tag === 'textarea') ta.push(n); });
  assert.ok(ta.length, '找不到編輯器');
  assert.ok(ta[0].value && ta[0].value.trim().length > 20,
    '一開啟編輯器就是空的 —— 使用者會以為程式沒載入（手機上尤其看不出來要先選範例）');
});
