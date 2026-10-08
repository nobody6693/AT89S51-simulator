;==== 2-7-4 開關式控制電路：ON 鍵開燈、OFF 鍵關燈 =========================
;
; 電路：主板就夠用，不用接線
;   P2.0 → 按鈕 PB3（ON）、P2.1 → 按鈕 PB4（OFF），按下接地讀 0
;   P1.7~P1.0 → 8 顆 LED（低態亮）
;
; 原理：像電燈的兩鍵開關，一顆負責開、一顆負責關，放開之後狀態保持。
;   讀到某鍵是 0 → 先延時 0.05 秒再確認（消除按鍵彈跳），然後等它放開才動作，
;   這樣按一下只會動作一次。OFF 寫在 ON 前面，兩鍵同時按時 OFF 優先。
;
; 時序：DELAY50ms = 250 × 2us × 100 = 50ms
;
; 流程：P2.0、P2.1 寫 1 當輸入 → LED 全暗 → 迴圈輪流看 OFF、ON →
;   OFF 按下且放開 → LED 全暗；ON 按下且放開 → LED 全亮
ON     EQU  P2.0       ;設定 ON 開關位址
OFF    EQU  P2.1       ;設定 OFF 開關位址
LED    EQU  P1         ;設定 LED 位址
;==== 主程式 =========================================
       ORG  0          ;程式從 0 位址開始
START: SETB ON         ;規劃 ON 為輸入埠
       SETB OFF        ;規劃 OFF 為輸入埠
       MOV  LED,#0FFH  ;關閉 LED
LOOP:  JNB  OFF,LED_OFF ;判斷 OFF 開關
       JNB  ON,LED_ON  ;判斷 ON 開關
       JMP  LOOP       ;重新判斷開關
LED_OFF: CALL DELAY50ms ;延時 0.05 秒
       JNB  OFF,LED_OFF ;判斷 OFF 開關放開沒？
       MOV  LED,#0FFH  ;關閉 LED
       JMP  LOOP       ;重新判斷開關
LED_ON: CALL DELAY50ms  ;延時 0.05 秒
       JNB  ON,LED_ON  ;判斷 ON 開關放開沒？
       MOV  LED,#0     ;開啟 LED
       JMP  LOOP       ;重新判斷開關
;==== 延時副程式(0.05 秒) ==============================
DELAY50ms:
       MOV  R7, #100   ;R7 暫存器載入 100 次數
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       RET             ;返回主程式
       END             ;結束程式
