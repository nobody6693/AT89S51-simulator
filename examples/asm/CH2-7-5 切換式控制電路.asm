PB     EQU  P2.0       ;設定 PB 開關位址
LED    EQU  P1         ;設定 LED 位址
;==== 主程式 =========================================
       ORG  0          ;程式從 0 位址開始
START: SETB PB         ;規劃 PB 為輸入埠
       MOV  LED,#0FFH  ;關閉 LED
       MOV  A,#0FFH    ;設定 A 之初值
LOOP:  JNB  PB,TOGGLE  ;判斷 PB 開關
       JMP  LOOP       ;重新判斷開關
TOGGLE: CALL DELAY50ms ;延時 0.05 秒
       JNB  PB,TOGGLE  ;判斷 PB 開關放開沒？
       CPL  A          ;改變 A 之狀態
       MOV  LED,A      ;驅動 LED
       JMP  LOOP       ;重新判斷開關
;==== 延時副程式(0.05 秒) ==============================
DELAY50ms:
       MOV  R7, #100   ;R7 暫存器載入 100 次數
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       RET             ;返回主程式
       END             ;結束程式
