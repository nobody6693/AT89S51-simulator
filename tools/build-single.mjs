// 把整個模擬器打包成「一個 .html 檔」，雙擊就能開，離線可用、不必安裝任何東西。
//
//   node tools/build-single.mjs
//   → dist/KT89S51 實驗板模擬器.html
//
// 為什麼要自己打包：瀏覽器從 file:// 開啟時會擋掉 ES module 的載入（CORS），
// 所以不能直接把資料夾丟給別人。這裡把每個模組包成一個函式、用一個極小的
// 模組表把 import/export 接起來，全部塞進單一個 <script>。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const ENTRY = 'src/ui/app.js';

const seen = new Map();       // 模組路徑(相對 web/) → 轉換後的程式碼
const order = [];             // 相依在前的載入順序

function collect(relPath) {
  if (seen.has(relPath)) return;
  seen.set(relPath, null);                       // 先佔位，避免循環相依無限遞迴
  const src = readFileSync(join(WEB, relPath), 'utf-8');
  const dir = dirname(relPath);

  const deps = [];
  let code = src;

  // import { a, b } from './x.js';  /  import './x.js';
  code = code.replace(/^import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}\s*)?(?:from\s*)?['"]([^'"]+)['"];?\s*$/gm,
    (m, def, named, spec) => {
      if (!spec.startsWith('.')) return m;        // 沒有外部相依，保險起見原樣保留
      const dep = relative(WEB, resolve(join(WEB, dir), spec)).replace(/\\/g, '/');
      deps.push(dep);
      if (!named && !def) return `__mod(${JSON.stringify(dep)});`;
      const parts = [];
      if (named) parts.push(`const {${named}} = __mod(${JSON.stringify(dep)});`);
      if (def) parts.push(`const ${def} = __mod(${JSON.stringify(dep)}).default;`);
      return parts.join(' ');
    });

  // export const/class/function/let → 去掉 export，最後再掛到 __e
  const names = [];
  code = code.replace(/^export\s+(const|let|var|class|function|async function)\s+([\w$]+)/gm, (m, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  if (/^export\s/m.test(code)) throw new Error(`${relPath} 有還沒處理的 export 形式`);
  code += '\n' + names.map(n => `__e.${n} = ${n};`).join('\n') + '\n';

  for (const d of deps) collect(d);              // 相依先進 order
  seen.set(relPath, code);
  order.push(relPath);
}

collect(ENTRY);

const modules = order.map(p =>
  `${JSON.stringify(p)}: function (__e) {\n${seen.get(p)}\n}`).join(',\n');

// 錯誤回報放在「另一個、更早的 <script>」裡：
// 如果主程式那一段有語法錯誤，它會連解析都失敗、裡面的攔截器根本不會執行，
// 只有更早的 script 註冊的 window.onerror 抓得到。手機上沒有 console，這是唯一的線索來源。
const reporter = [
'(function () {',
'  function R(what, err) {',
'    try {',
'      var b = document.getElementById("fatal") || document.createElement("div");',
'      b.id = "fatal";',
'      b.textContent = String.fromCharCode(9888) + " " + what + ": " + ((err && err.message) ? err.message : err) +',
'        ((err && err.stack) ? " | " + String(err.stack).split(String.fromCharCode(10)).slice(0,3).join(" | ") : "");',
'      if (!b.parentNode && document.body) document.body.insertBefore(b, document.body.firstChild);',
'    } catch (e) {}',
'  }',
'  window.__report = R;',
'  function mark() { try { var s = document.getElementById("st-build"); if (s) s.textContent += " " + String.fromCharCode(10003) + "JS"; } catch (e) {} }',
'  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mark); else mark();',
'  window.addEventListener("error", function (e) { R("載入失敗", e.error || e.message); });',
'  window.addEventListener("unhandledrejection", function (e) { R("未處理的錯誤", e.reason); });',
'})();',
].join(String.fromCharCode(10));

const runtime = [
'(function () {',
'  var R = window.__report || function () {};',
'  try {',
'  var __defs = {',
modules,
'  };',
'  var __cache = {};',
'  function __mod(p) {',
'    if (__cache[p]) return __cache[p];',
'    var e = __cache[p] = {};',
'    try { __defs[p](e); } catch (err) { R("模組 " + p + " 失敗", err); throw err; }',
'    return e;',
'  }',
'  __mod(' + JSON.stringify(ENTRY) + ');',
'  } catch (err) { R("啟動失敗", err); }',
'})();',
].join(String.fromCharCode(10));

const STAMP = new Date().toLocaleString('zh-TW', { hour12: false });
const css = readFileSync(join(WEB, 'style.css'), 'utf-8');
const html = readFileSync(join(WEB, 'artifact.html'), 'utf-8')
// 用函式形式取代：替換字串裡的 $& / $` 這些序列會被當成特殊語法而把內容弄壞
  .replace('<span id="st-build"></span>', () => `<span id="st-build">版本 ${STAMP}</span>`)
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="[^"]*"><\/script>/,
    () => `<script>
${reporter}
</script>
<script>
${runtime}
</script>`);

const page = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KT89S51 實驗板模擬器</title>
</head>
<body>
${html}
</body>
</html>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', 'KT89S51 實驗板模擬器.html');
writeFileSync(out, page, 'utf-8');

// 同一份內容再輸出一個「片段」版本給 Artifact 用（它會自己包 html/head/body）。
// Artifact 也走單檔，手機上才不會因為某一個模組檔載不到就整個空白。
writeFileSync(join(WEB, 'bundled.html'),
  html + String.fromCharCode(10), 'utf-8');   // artifact.html 開頭已經有 <title>

// 再存一份 index.html：丟到任何靜態空間（GitHub Pages / Netlify…）就直接是首頁。
// 手機（尤其 iPhone）只能用網址開，不能用檔案開 —— 檔案 App 的預覽不執行 script。
writeFileSync(join(ROOT, 'dist', 'index.html'), page, 'utf-8');

console.log(`寫出 ${out}`);
console.log('    也存了一份 dist/index.html —— 要給手機用的話，把它上傳到免費靜態空間拿一個網址');
console.log('也更新了 web/bundled.html（Artifact 用的單檔版）');
console.log(`模組 ${order.length} 個，共 ${(page.length / 1024).toFixed(0)} KB`);
console.log('用法：把這一個檔案傳給別人，雙擊用瀏覽器開啟即可，不需要網路也不需要安裝。');
