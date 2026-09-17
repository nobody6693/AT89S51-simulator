// 打包出來的單一 .html 要真的能跑（不是「檔案有產生」而已）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import '../tools/fake-dom.mjs';
import { assemble } from '../web/src/asm/assembler.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'dist', 'KT89S51 實驗板模擬器.html');

test('每一個模組的具名匯出，在單檔版裡都要接得上', async () => {
  // 打包器是自己用正則把 export 轉成 __e.名字 = 名字 的，漏掉一個不會有任何錯誤訊息，
  // 只會在執行時變成 undefined。`x & undefined` 是 0、`x |= undefined` 是沒動作，
  // 所以症狀會是「某個功能靜悄悄地不動」，非常難查。這一項就是擋這個。
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-single.mjs')], { cwd: ROOT });
  const html = readFileSync(OUT, 'utf-8');
  const SRC = path.join(ROOT, 'web', 'src');
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : (f.endsWith('.js') ? [p] : []);
  });
  const missing = [];
  for (const f of walk(SRC)) {
    if (f.endsWith(path.join('ui', 'app.js'))) continue;      // app.js 是進入點，自己會啟動
    const mod = await import(pathToFileURL(f).href);
    for (const name of Object.keys(mod)) {
      if (name === 'default') continue;
      if (!html.includes(`__e.${name} = `)) missing.push(`${path.relative(SRC, f)} → ${name}`);
    }
  }
  assert.deepEqual(missing, [], '這些匯出在單檔版裡會是 undefined：\n' + missing.join('\n'));
});

test('build-single 產生的單檔可以載入並啟動', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-single.mjs')], { cwd: ROOT });
  assert.ok(existsSync(OUT), '沒有產生輸出檔');
  const html = readFileSync(OUT, 'utf-8');

  assert.ok(!/<script[^>]*\ssrc=/.test(html), '不可以有外部 script（別人拿到只會有這一個檔）');
  assert.ok(!/<link[^>]*stylesheet/.test(html), 'CSS 要內嵌');
  assert.ok(html.includes('id="board-wrap"'), '缺少板子容器');
  assert.ok(html.length > 150000, `檔案只有 ${html.length} 位元組，內容顯然不完整`);

  // 曾經出的包：#drop-hint 有 display:flex，會蓋掉 hidden 屬性預設的 display:none，
  // 結果單檔版一打開整片藍色蓋住畫面。Artifact 看不出來是因為平台外層有注入這條規則。
  assert.match(html, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
    '缺少 [hidden]{display:none!important}，用 hidden 屬性藏起來的元素會蓋住畫面');
  for (const id of [...html.matchAll(/id="([\w-]+)"[^>]*\shidden/g)].map(m => m[1]))
    assert.ok(html.includes('[hidden]'), `#${id} 用了 hidden 屬性，CSS 必須有對應的規則`);

  // Artifact 用的片段版：同樣必須是單檔（手機上模組載不到就整個空白）
  const frag = readFileSync(path.join(ROOT, 'web', 'bundled.html'), 'utf-8');
  assert.ok(!/<script[^>]*\ssrc=/.test(frag), 'bundled.html 不可以有外部 script');
  assert.ok(!/<link[^>]*stylesheet/.test(frag), 'bundled.html 的 CSS 要內嵌');
  assert.ok(!/<(html|head|body)[\s>]/i.test(frag), 'Artifact 會自己包 html/head/body，片段不能再包一層');
  assert.equal((frag.match(/<title>/g) || []).length, 1, '只能有一個 <title>');

  // 錯誤回報必須是「第一個」script：主程式若有語法錯，只有更早註冊的 onerror 抓得到
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  assert.equal(scripts.length, 2, '應該是「回報器 + 主程式」兩段 script');
  assert.ok(scripts[0].includes('window.__report'), '第一段必須是錯誤回報器');
  assert.ok(scripts[0].length < 3000, '回報器要夠小，不要自己也出錯');
  assert.ok(scripts[1].includes('__mod('), '第二段才是主程式');

  // 兩段都真的跑起來
  for (const code of scripts) new Function(code)();   // 丟例外就代表打包壞了

  // 「沒丟例外」不等於「有畫出來」—— 使用者回報過整片空白但沒有任何錯誤訊息。
  // 這裡直接檢查畫面上真的長出東西：板子、編輯器、範例清單。
  const count = (sel, tag) => {
    let n = 0;
    document.querySelector(sel).walk((x) => { if (x.tag === tag) n++; });
    return n;
  };
  assert.equal(count('#board-wrap', 'svg'), 1, '板子沒有畫出來');
  assert.ok(count('#board-wrap', 'rect') > 100, '板子畫出來了但幾乎是空的');
  assert.equal(count('#source', 'textarea'), 1, '編輯器沒有出現');
  assert.ok(count('#sel-example', 'option') >= 6, '範例清單沒有填進去');
  // 假 DOM 的 getElementById 會現造元素，所以看內容而不是看存不存在
  assert.equal(document.getElementById('fatal').textContent || '', '', '啟動時就有錯誤被回報出來');

  // 版本戳記：這樣才分得出手上拿到的是哪一次打包的
  assert.match(html, /id="st-build">版本 \d{4}/, '缺少版本戳記');

  // 計時器與中斷在「打包後的那一份」也必須真的會動。
  // 曾經出的包：打包器只認一行裡的第一個 export，於是 TCON_TR1 / IE_EA 這些
  // 常數在單檔版變成 undefined。`x & undefined` 是 0、`x |= undefined` 沒動作，
  // 結果 Timer1 不計數、中斷永遠不觸發 —— 模組版全對、單檔版靜悄悄壞掉，
  // 而使用者跑的正是單檔版（GitHub Pages 上那份就是）。
  const r = assemble([
    '\tORG\t0', '\tJMP\tSTART', '\tORG\t0BH', '\tJMP\tISR',
    'START:\tMOV\tTMOD,#01H', '\tMOV\tTH0,#3CH', '\tMOV\tTL0,#0B0H',
    '\tSETB\tTR0', '\tSETB\tET0', '\tSETB\tEA', '\tJMP\t$',
    'ISR:\tMOV\tTH0,#3CH', '\tMOV\tTL0,#0B0H', '\tCPL\tP1.0', '\tRETI', '\tEND',
  ].join('\n'));
  assert.ok(r.ok, '測試用的小程式組譯失敗：' + JSON.stringify(r.diagnostics));
  const bsim = (globalThis.window || globalThis).sim;
  assert.ok(bsim, '單檔版沒有把 sim 掛到 window 上');
  bsim.load({ hex: r.hex, lines: r.lines, symbols: r.symbols, name: '計時器測試' });
  const seen = new Set();
  for (let i = 0; i < 40; i++) { bsim.cpu.run(20000); seen.add(bsim.bus.latch[1] & 1); }
  assert.deepEqual([...seen].sort(), [0, 1],
    'Timer0 中斷在單檔版裡沒有翻轉 P1.0 —— 計時器或中斷失效了');
});
