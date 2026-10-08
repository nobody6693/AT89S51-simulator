---
name: textbook-to-examples
description: 把課本或投影片 PDF 裡的 8051 實驗（實例演練、思考一下）做成這個 KT89S51 模擬器的內建範例，一路做到測試、畫面檢查、打包、commit、push。只要使用者丟一份 PDF、一章課本、一張實驗電路圖，或說「把這些實驗做出來」「照課本加範例」「做成範例推上去」，就用這個 skill，即使沒提到「範例」兩個字也要用。
---

# 從課本 PDF 到推上 git

整條流程走過一次大約是：讀 PDF → 列實驗清單 → 對照模擬器的接線 → 寫 .asm →
組譯檢查 → 寫測試 → 把板子畫成圖看一眼 → 打包 → commit、push。
每一步都有踩過的坑，寫在各段的「陷阱」裡，照著做可以少走很多冤枉路。

## 1. 讀 PDF

先用 pypdf 抽文字並統計每頁字數：

```python
from pypdf import PdfReader
r = PdfReader(path)
counts = [len((p.extract_text() or '').strip()) for p in r.pages]
```

- 每頁幾百字以上 → 是文字版，整份抽到暫存檔再用 Read 讀（45k 字會被截成兩頁，記得 offset 讀完）。
- 每頁只有十幾個字 → 是掃描檔或投影片，文字在圖裡。用 PyMuPDF 整頁渲染成 1300px 寬的 JPEG，再用 Read 一張一張看：

```python
import fitz
doc = fitz.open(path)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1300 / page.rect.width, 1300 / page.rect.width))
    pix.save(f'{out}/p{i+1:02d}.jpg', jpg_quality=75)
```

陷阱：
- 這台機器沒有 pdftoppm，Read 工具的 `pages` 參數會失敗；`fitz`（PyMuPDF）有裝。
- 不要用 `page.images` 抽內嵌圖，投影片的文字不在圖裡，會把程式碼全漏掉。
- 一次 Read 十幾到三十張圖都可以，照頁碼批次讀，理論頁可以略讀，看到「實例演練」「CHx-y-z.ASM」「思考一下」就要仔細看。

## 2. 列實驗清單

每個單元記下：編號（CH3-7-1）、標題、電路（哪個 Port 接什麼）、完整程式、課本說的預期現象、
思考題的要求。思考題也要做成範例，檔名在編號後加 T（CH3-7-2T），專案裡 CH2 的範例就是這個慣例。

投影片的程式常跨好幾頁，拼起來後對一下課本印的 code size（「code=126」），差太多就是漏了一段。
投影片會有誤植，例如 `MOV TL1,M1TL0`（應為 M1TL1），照意思修掉，並在 commit 訊息裡說明修了什麼。

## 3. 對照模擬器的接線

課本的電路要翻成 `web/src/board/wiring.js` 裡 `EXAMPLE_WIRING` 的一筆，載入範例時會自動套用。
腳位對應表在 [references/simulator-pinout.md](references/simulator-pinout.md)，先讀它。
最重要的三件事：

- 七段 `seg` 陣列 index 0 = a … 7 = dp；課本編碼表 bit7 = a，所以 a 接 P0.7，要用反過來的 P8R(0)。
- 位選 `digit` 陣列 index 0 = 畫面最左位；課本 P2.7 是最左位，所以也是反過來的 P8R(2)。
  課本的 4 位模組只接 P2.7~P2.4，右邊四位要留 null，不然鍵盤讀回線會把它們點成殘影。
- 登記時用單元編號當 key（'CH3-7-5'），`wiringForExample` 會照 `^(CH\d-\d-\d)(T?)` 去查，
  思考題沒另外登記就跟本題共用。

## 4. 寫 .asm

- 放在 `examples/asm/`，檔名「CH3-7-1 查表法4位七節顯示.asm」這種格式：編號、空格、中文短名。
- 程式碼照課本打，用 Tab 分欄（標籤、助憶碼、運算元、註解）。
- 註解一律要詳細（使用者明確要求「之後全部都要」）：開頭一段說明電路接哪些腳、工作原理、
  時序怎麼算（延時迴圈的週期數、計時器重載值、掃描一圈幾毫秒）、流程；思考題寫出題目要求
  與相對本題改了哪裡；之後每一行指令都有說明。先把程式碼寫對、測試過，再加註解，
  加完用「去掉註解後逐行相同」檢查程式碼沒被動到。
- 用一支 Python 產生器寫所有檔案（同一章的程式大半重複），改一處全部重產，不會手抄出錯。
  產生器用 Write 工具寫成檔案再執行，不要用 Bash heredoc：heredoc 會把 `\\` 吃成 `\`，
  正規表示式和跳脫字元全毀。
- 思考題要「從範例改過來」，不是另寫一份：老師的教法就是叫學生拿範例小改成思考題。
  所以 T 檔 = 本題原檔 + 少數幾處修改（用 Python 對本題檔案做 str.replace，每個舊字串必須剛好出現一次），
  不要重新手寫；程式碼盡量貼近範例，能只改一個常數就別改結構（例如倒數就是 INC→DEC、10→0FFH、歸零→9）。
  修改處在程式裡標【改】【加】，檔頭列出「怎麼從範例改成這一題」的步驟並說明為什麼這樣改。
  寫完用 difflib 量程式碼差異行數，差很多的回頭想有沒有更貼近的改法。
- 課本沒寫但該補的：中斷程式有 PUSH 又切暫存器庫的，加 `MOV SP,#30H`（預設 SP=07H 會壓到 RB1）。

組譯器的脾氣（`web/src/asm/assembler.js`）：
- 支援 `HIGH(-T0X)`、`LOW(-50000)`、二進位 `00000011B`、`MOD`、`/`。
- `CJNE`/`DJNZ`/`SJMP` 相對跳躍只有 -128~127，長一點的迴圈尾巴跳不回去。
  用中繼：`CJNE A,#N,AGAIN` / `JMP LOOP1` / `AGAIN: JMP LOOP0`。
- 一次檢查全部：

```js
for (const f of readdirSync('examples/asm').filter(n => /^CH4-/.test(n)))
  console.log(f, assemble(readFileSync('examples/asm/' + f, 'utf-8'), { codeSize: 4096 }).diagnostics);
```

## 5. 寫測試

每一章一個 `tests/chNN.test.js`，每個範例至少一項，驗的是課本說的現象，不是程式有沒有組過。
共用的小工具（讀七段成字串、按鍵盤、看 P1 序列）都在
[references/test-helpers.md](references/test-helpers.md)，直接抄進測試檔。

陷阱：
- 七段讀的是工作週期，要先 `s.display.frame()` 清窗，跑 40~100ms 再 `frame()` 取樣；
  4 位掃描每位 25%、8 位 12.5%，門檻用 0.03。
- 鍵盤：按 30ms、放開再等 30ms 才讀顯示，因為程式在等放開時不掃七段。
- 外部中斷沒設 IT0/IT1 就是低態觸發，副程式沒做完前放開按鍵，請求就消失了。
  要測「同等級得排隊」就得按著 0.8 秒；真板子上也是這樣。
- 顯示緩衝區開機的 0 會留著被往左推，按 1、2 之後是「 012」不是「  12」。
- 跑 60 秒的計時器測試約 5 秒，可以接受，不要每個測試都跑那麼長。
- 先只跑新檔 `node --test tests/ch34.test.js`，全過再 `npm test`。

## 6. 把板子畫成圖看一眼

`tools/render-example.mjs` 會載入範例、跑一段、按按鍵，然後把板子畫成 PNG：

```
node tools/render-example.mjs "CH4-7-3 時鐘24小時制.asm" 3050 "" out.png
node tools/render-example.mjs "CH3-7-5 4x4鍵盤與4位七節.asm" 20 "k1,k2,k3,k4" out.png
node tools/render-example.mjs "CH4-7-1 外部中斷LED左右移.asm" 50 "b0" out.png
```

按鍵序列：`kN` = 鍵盤 PBN（0~15）、`bN` = 主板按鈕（0=PB1/INT0、1=PB2/INT1）。
用 Read 看圖，確認數字對、位置對、沒有殘影。Chrome 擴充套件有時沒連上，這個工具不依賴瀏覽器。

## 7. 打包、commit、push

```
node tools/build-programs.mjs     # 網頁載入的是它產生的副本，不跑這個網頁上看不到新範例
npm test                          # 有一項會擋 programs.js 與 examples/asm 不同步
node tools/build-single.mjs       # 產生 index.html（GitHub Pages）與 dist/
```

README 的「npm test # N 項」要改成新的數字。commit 訊息寫做了哪些實驗、修了課本的哪些誤植、
接線怎麼接，不加 Claude 署名。push 後 `curl` 一下 Pages 網址確認新範例名字已經出現（約 1 分鐘）。

## 完成時回報什麼

列出做了哪些實驗、哪些是思考題、對課本改了什麼（誤植、補 SP）、測試幾項、
看圖看到什麼、課本提到但其實沒有的實驗（例如章名寫「計頻器」但內容沒有）。
