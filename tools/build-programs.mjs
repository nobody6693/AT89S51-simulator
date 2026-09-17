// 從 examples/ 重新產生 web/src/programs.js（瀏覽器版的內建範例）。
// 改過 examples/ 一定要跑這支 —— 網頁載入的是產生出來的副本，不是原始 .asm。
// tests/asm.test.js 有一項會擋住兩邊不同步。

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/src/programs.js');


const asmDir = join(ROOT, 'examples/asm');
const asm = readdirSync(asmDir).filter(f => f.endsWith('.asm')).sort().map(name => ({
  name,
  source: readFileSync(join(asmDir, name), 'utf-8'),
  hex: '', lines: [], symbols: {}, mem: '', asm: true,
}));

const body = '// 自動產生：內建範例（.asm，在瀏覽器內組譯）\n'
  + '// 不要手改這個檔 —— 改 examples/asm 底下的原始檔，再跑 node tools/build-programs.mjs\n'
  + 'export const PROGRAMS = ' + JSON.stringify(asm, null, 0) + ';\n';
writeFileSync(OUT, body, 'utf-8');
console.log(`programs.js 重建完成：${asm.length} 個 .asm，共 ${body.length} bytes`);
for (const p of asm) console.log('  ' + p.name);
