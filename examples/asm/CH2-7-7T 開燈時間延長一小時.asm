PB     EQU  P2.0       ;設定 PB 開關位址
LED    EQU  P1         ;設定 LED 位址
T_1    EQU  10         ;設定第一段延時時間(秒)
T_MIN  EQU  60         ;一分鐘 = 60 秒
N_MIN  EQU  60         ;點亮時間 = 60 分鐘 = 1 小時
;==== 主程式 =========================================
;R4 一次最多只能倒數 255 秒，裝不下 3600 秒，
;所以外層再用 R3 倒數 60 次「1 分鐘」，60 分鐘剛好是 1 小時。
       ORG  0          ;程式從 0 位址開始
START: SETB PB         ;規劃 PB 為輸入埠
       MOV  LED,#0FFH  ;關閉 LED
LOOP:  JNB  PB,ON      ;判斷 PB 開關
       JMP  LOOP       ;重新判斷開關
ON:    MOV  R4,#T_1    ;設定開啟延時時間
       CALL DELAY      ;呼叫延時副程式
       MOV  LED,#0     ;開啟 LED
       MOV  R3,#N_MIN  ;點亮時間設為 60 分鐘
HOLD:  MOV  R4,#T_MIN  ;每次延時 1 分鐘
       CALL DELAY      ;呼叫延時副程式
       DJNZ R3,HOLD    ;R3 次數未到就繼續點亮
       MOV  LED,#0FFH  ;關閉 LED
       JMP  LOOP       ;重新判斷開關
;==== 延時副程式(R4 傳入延時秒數) ==========================
DELAY: MOV  R5, #10    ;R5 暫存器載入 10 次數/1 秒
D0:    MOV  R7, #200   ;R7 暫存器載入 200 次數 0.1 秒
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       DJNZ R5, D0     ;D0 迴圈執行 R5 次
       DJNZ R4, DELAY  ;DELAY 迴圈執行 R4 次
       RET             ;返回主程式
       END             ;結束程式
