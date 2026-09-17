# KT89S51 實驗板模擬器

堃喬 **KT89S51 線上燒錄實驗板 V4.2** + **KDM+ 實驗擴充板** 的軟體模擬器。
把 `.c`（Keil C51 語法）拖進視窗 → 自動編譯 → 虛擬板子跑起來；可撥開關、按鍵、聽蜂鳴器、看 LCD / 七段 / LED 陣列 / 步進馬達，並能單步、下中斷點、看暫存器與波形。

## 啟動

1. 雙擊 `啟動模擬器.bat`（需要 Python 3；SDCC 已內含在 `tools/sdcc`）
2. 瀏覽器會開 http://127.0.0.1:8051/
3. 左上「範例…」選一個，或把自己的 `.c` / `.hex` 拖進視窗

手動啟動：`python server/app.py`

## 接腳（主板，焊死）

| 週邊 | 接腳 | 邏輯 |
|---|---|---|
| LED DS1–DS8 | P1.0–P1.7 | 寫 0 亮 |
| 指撥開關 SW1 | P0.0–P0.7 | ON 讀 0（10K 上拉） |
| 蜂鳴器 | P3.7 | 寫 0 響（PNP） |
| LCM 16×2 | RS=P3.2 R/W=P3.1 E=P3.0 D0–D7=P0 | 與 SW1 共用 P0 |
| PB1 / PB2 | P3.2 (INT0) / P3.3 (INT1) | 按下 0 |
| PB3 / PB4 | P2.0 / P2.1 | 按下 0 |

KDM+（七段、LED 陣列、鍵盤、步進馬達）與 SPI/I²C 週邊靠排線接，在「接線設定」分頁指定接哪個 Port，並勾選啟用。設定會記在瀏覽器裡，也可存成 preset（`presets/*.json`）。

**LCM 預設未插上**（跟實體出廠一樣）。點板子上 LCM 的標題列可插上/拔除。插上後若 E(P3.0) 與 R/W(P3.1) 同時為 1，LCM 會驅動 P0，其他用 P0 的程式會受影響 — 這是真實硬體行為，模擬器會警告。

## 寫程式

Keil C51 語法直接可用（`#include <reg51.h>`、`sbit X = P1^0;`、`void f() interrupt 1`），相容層會自動轉成 SDCC 語法。也可直接寫 SDCC 語法。支援 `<intrins.h>` 的 `_nop_()`、`_crol_()` 等。

不支援：Keil 特有的 `_at_`、`#pragma` 指令、`using` 以外的暫存器組操作。

## 快捷鍵

| 鍵 | 功能 |
|---|---|
| F5 | 執行 / 暫停 |
| F10 | 單步一行 C |
| Shift+F10 | 跳過函式 |
| F11 | 單步一條指令 |
| F7 | 重新編譯 |
| Ctrl+R | 重置 |

原始碼分頁點行號可設中斷點；反組譯分頁點左側亦可。

## 目錄

```
server/         Python 本機服務：編譯 (SDCC)、Keil→SDCC 相容層、靜態檔案
  compat/       reg51.h / intrins.h 相容 header
tools/sdcc/     精簡版 SDCC 4.5.0（僅 mcs51）
web/            瀏覽器端：8051 核心 (src/cpu)、週邊模型 (src/board)、UI (src/ui)
examples/       八個範例，對應各階段實驗
tests/          node --test tests/cpu.test.js tests/integration.test.js
presets/        接線 preset
docs/           原廠手冊、電路圖截圖
```

## 測試

```
node --test tests/cpu.test.js tests/integration.test.js
```

`cpu.test.js` 驗證指令旗標、計時器、中斷、埠語意；`integration.test.js` 把八個範例真的編譯、載入、執行，檢查 LED / LCD / 七段 / 馬達 / UART / EEPROM 結果。
