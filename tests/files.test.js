// 下載格式：純文字 .txt，一種格式，可以把接線一起帶走
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemble } from '../web/src/asm/assembler.js';

const APP = readFileSync(new URL('../web/src/ui/app.js', import.meta.url), 'utf-8');

// 從 app.js 取出這兩個純函式來測（它們不碰 DOM）
const TAG = ';!KT89 ';
const parseProject = (text) => {
  const t = String(text).replace(/^\uFEFF/, '');
  if (!t.startsWith(TAG)) return { src: t, cfg: null };
  const nl = t.indexOf('\n');
  let cfg = null;
  try { cfg = JSON.parse(t.slice(TAG.length, nl < 0 ? undefined : nl)); } catch {}
  return { src: nl < 0 ? '' : t.slice(nl + 1), cfg };
};

const SRC = 'LED\tEQU\tP1\n\tORG\t0\n\tMOV\tLED,#0FEH\n\tJMP\t$\n\tEND\n';

test('app.js 裡的格式定義與測試用的一致', () => {
  assert.ok(APP.includes("const TAG = ';!KT89 ';"), 'TAG 改了就要同步改這個測試');
  assert.ok(APP.includes("getFileName() + '.txt'"), '下載副檔名應該是 .txt');
  assert.ok(!APP.includes('btn-save'), '「儲存到瀏覽器」已經拿掉了');
});

test('沒接線時，存出來就是純粹的組合語言原始碼', () => {
  const { src, cfg } = parseProject(SRC);
  assert.equal(src, SRC);
  assert.equal(cfg, null);
  assert.ok(assemble(src, { codeSize: 4096 }).ok, '存出來的東西本身要能組譯');
});

test('有接線時接線跟著走，而且檔案仍然是合法的組合語言', () => {
  const cfg = { seg: ['P0.0', null, null, null, null, null, null, null], ties: { 'P1.3': 'gnd' }, jp11: false };
  const file = TAG + JSON.stringify(cfg) + '\n' + SRC;
  const got = parseProject(file);
  assert.deepEqual(got.cfg, cfg, '接線要原封不動讀回來');
  assert.equal(got.src, SRC, '原始碼不能被吃掉');
  // 關鍵：整個檔案（含開頭那行）直接丟進組譯器也要過 —— 因為 ';' 是 A51 的註解
  assert.ok(assemble(file, { codeSize: 4096 }).ok, '帶接線的檔案本身也要能組譯');
});

test('讀得進沒有標頭的舊檔與帶 BOM 的檔', () => {
  assert.equal(parseProject('\uFEFF' + SRC).src, SRC, 'BOM 要被吃掉');
  assert.equal(parseProject(SRC).cfg, null);
  assert.equal(parseProject(TAG + '這不是JSON\n' + SRC).src, SRC, '標頭壞掉時原始碼仍要讀得出來');
});
