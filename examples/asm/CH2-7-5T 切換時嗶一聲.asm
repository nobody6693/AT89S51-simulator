PB     EQU  P2.0       ;設定 PB 開關位址
LED    EQU  P1         ;設定 LED 位址
Buzzer EQU  P3.7       ;設定蜂鳴器位址
;==== 主程式 =========================================
       ORG  0          ;程式從 0 位址開始
START: SETB PB         ;規劃 PB 為輸入埠
       SETB Buzzer     ;蜂鳴器先關閉
       MOV  LED,#0FFH  ;關閉 LED
       MOV  A,#0FFH    ;設定 A 之初值
LOOP:  JNB  PB,TOGGLE  ;判斷 PB 開關
       JMP  LOOP       ;重新判斷開關
TOGGLE: CALL DELAY50ms ;延時 0.05 秒
       JNB  PB,TOGGLE  ;判斷 PB 開關放開沒？
       CPL  A          ;改變 A 之狀態
       MOV  LED,A      ;驅動 LED
       CALL BEEP       ;切換時嗶一聲
       JMP  LOOP       ;重新判斷開關
;==== 嗶一聲（約 0.05 秒 1KHz） ==========================
BEEP:  MOV  R0,#50     ;R0 決定嗶聲長度
BEEP1: CLR  Buzzer     ;蜂鳴器導通
       MOV  R7,#250    ;半週期延時
       DJNZ R7,$       ;
       SETB Buzzer     ;蜂鳴器截止
       MOV  R7,#250    ;半週期延時
       DJNZ R7,$       ;
       DJNZ R0,BEEP1   ;R0 次數未到就繼續嗶
       RET             ;返回主程式
;==== 延時副程式(0.05 秒) ==============================
DELAY50ms:
       MOV  R7, #100   ;R7 暫存器載入 100 次數
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       RET             ;返回主程式
       END             ;結束程式
