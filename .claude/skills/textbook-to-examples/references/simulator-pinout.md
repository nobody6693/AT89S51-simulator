# 模擬器的接線模型與課本電路的對照

模擬的是 KT89S51 主板 + KDM+ 擴充板。主板的東西是固定接的，擴充板的東西要在
`web/src/board/wiring.js` 的 `EXAMPLE_WIRING` 登記，載入範例時自動套用。

## 主板（不用接線）

| 東西 | 腳位 | 極性 | 測試裡怎麼操作 |
|---|---|---|---|
| LED DS1~DS8 | P1.0~P1.7 | 低態亮 | 讀 `s.bus.latch[1]` |
| 指撥開關 SW1 | P0.0~P0.7 | 撥 ON 讀 0 | `s.dip.set(bit, 1)` |
| 按鈕 PB1 | P3.2 = INT0 | 按下為 0 | `s.buttons.press(0, 1)` |
| 按鈕 PB2 | P3.3 = INT1 | 按下為 0 | `s.buttons.press(1, 1)` |
| 按鈕 PB3、PB4 | P2.0、P2.1 | 按下為 0 | `s.buttons.press(2 或 3, 1)` |
| 蜂鳴器 | P3.7 | 低態響 | `s.buzzer.events`（每次翻轉一筆） |

課本第 4 章把 PB0 接 INT0、PB1 接 INT1；這塊板子是 PB1、PB2，程式不用改。

## KDM+ 擴充板：七段顯示器

`EXAMPLE_WIRING` 的欄位：

- `seg`：8 條段線，index 0 = a、1 = b … 6 = g、7 = dp。段線 0 = 亮（共陽極）。
- `digit`：8 條位選線，index 0 = 畫面最左位 … 7 = 最右位。位選 0 = 該位被選中（PNP）。
- `digitMode: 'direct'`（直接 8 線）或 `'138'`（用 dec138 三條線解碼）。
- `enabled: { seg7: true }`。

課本（快學 8051）的接法：

| 課本 | 腳位 | 寫法 |
|---|---|---|
| a b c d e f g dp | P0.7 P0.6 … P0.0（編碼表 bit7 = a） | `seg: P8R(0)`（反序） |
| 4 位模組 com3~com0（左→右） | P2.7 P2.6 P2.5 P2.4 | `digit: [...P8R(2).slice(0, 4), null, null, null, null]` |
| 8 位模組 最左→最右 | P2.7 … P2.0 | `digit: P8R(2)` |

`P8R(p)` = `['P?.7', …, 'P?.0']`，wiring.js 裡已定義 `BOOK_SEG4`、`BOOK_SEG8`、`BOOK_SEG_KEY`。

為什麼 4 位要留 null：鍵盤的讀回線 Y0~Y3 接在 P2.0~P2.3，按鍵時會被拉低，
如果 P2.0~P2.3 也接著位選，右邊四位會跟著亮出殘影。課本的 4 位模組本來就沒接那四條。

七段讀回來的樣子：`s.display.frame().seg` 是 64 個工作週期（0~1），index = 位數×8 + 段。

## KDM+ 擴充板：4x4 鍵盤

模型：按下 PBn（n = 0~15）會把 `keyOut[n & 3]` 和 `keyIn[n >> 2]` 短路，任一端為 0 另一端跟著 0。

課本：鍵值 = 4×X + Y，X0~X3 是掃描線（輸出，接 P2.4~P2.7），Y0~Y3 是讀回線（輸入，接 P2.0~P2.3）。
對起來：`keyIn = P4(2, 4)`（X）、`keyOut = P4(2, 0)`（Y），`enabled.keypad = true`。
板子上 PB0~PB15 印的 0~9 A~F 剛好就是鍵值。

測試裡按鍵：`s.keypad.press(n, 1)` 按、`press(n, 0)` 放。

## 其他

- LED 陣列：`matrixRow` 8 條列線，與七段共用位選。
- 步進馬達：`stepper` 4 條。
- 衝突提示：同一支腳接兩樣東西，板子上會出現黃字提示（例如 P2.7 同時是位選 X0 與鍵盤 KI3），
  課本本來就共用的話不用理它。
