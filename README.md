# KT89S51 實驗板模擬器

堃喬 KT89S51 V4.2 + KDM+ 擴充板的模擬器，寫 8051 組合語言（Keil µVision A51）。
整個模擬器跑在瀏覽器裡，不必安裝任何東西。

**線上使用：** https://nobody6693.github.io/AT89S51-simulator/

在左邊的板子上點兩支針腳就接一條線，右邊編輯程式，停下打字就自動重新組譯並接著跑。

## 模擬了什麼

主板：89S51、8 顆 LED、8 路指撥開關、蜂鳴器、四顆按鍵、16×2 LCM、
可變電阻與 LM35（ADC）、MCP4822（DAC）、TC74 與 24LC16B（I²C）。

KDM+：八位數七段顯示器、8×8 點矩陣、4×4 鍵盤、步進馬達、74LS138。

針腳位置與腳序量自實體板照片，並與原廠電路圖逐一對照 → [`docs/元件對照表.md`](docs/元件對照表.md)

## 開發

```bash
npm test                        # 82 項
node tools/build-single.mjs     # 打包成單一 HTML（dist/ 與 index.html）
```

改過 `examples/asm/` 之後一定要跑 `node tools/build-programs.mjs`，
網頁載入的是它產生的副本。

Windows 可以直接雙擊 `打包成單一檔案.bat`。
