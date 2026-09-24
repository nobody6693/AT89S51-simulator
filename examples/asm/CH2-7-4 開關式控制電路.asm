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
