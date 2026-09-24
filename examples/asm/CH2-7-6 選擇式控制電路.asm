SW     EQU  P0          ;設定 SW 開關位址
LED    EQU  P1          ;設定 LED 位址
;==== 主程式 =========================================
       ORG  0           ;程式從 0 位址開始
START: MOV  SW, #0FFh   ;規劃 SW 為輸入埠
       MOV  LED,#0FFH   ;關閉 LED
       MOV  30H,#0      ;設置暫存區初值
LOOP:  MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       JZ   S0          ;判斷狀態 0
       SUBB A,#1        ;A 減 1
       JZ   S1          ;判斷狀態 1
       MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       SUBB A,#2        ;A 減 2
       JZ   S2          ;判斷狀態 2
       MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       SUBB A,#3        ;A 減 3
       JZ   S3          ;判斷狀態 3
       JMP  LOOP        ;重新判斷開關
S0:    MOV  LED,#0FFH   ;關閉 LED
       JMP  LOOP        ;重新判斷開關
S1:    MOV  LED,#0F0H   ;高 4 位元不亮，低 4 位元亮
       JMP  LOOP        ;重新判斷開關
S2:    MOV  LED,#0FH    ;高 4 位元亮，低 4 位元不亮
       JMP  LOOP        ;重新判斷開關
S3:    MOV  LED,30H     ;驅動 LED
       MOV  A,30H       ;載入暫存值
       CPL  A           ;反相
       MOV  30H,A       ;存回暫存區
       CALL DELAY100ms  ;延時 0.1 秒
       JMP  LOOP        ;重新判斷開關
;==== 延時副程式(0.1 秒) ================================
DELAY100ms:
       MOV  R7, #200    ;R7 暫存器載入 200 次數
D1:    MOV  R6, #250    ;R6 暫存器載入 250 次數
       DJNZ R6, $       ;本列執行 R6 次
       DJNZ R7, D1      ;D1 迴圈執行 R7 次
       RET              ;返回主程式
       END              ;結束程式
