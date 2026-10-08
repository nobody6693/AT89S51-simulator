;==== 2-7-4 思考題：馬達正反轉控制（用兩顆 LED 當正轉、反轉指示燈）=============
;
; 電路：主板就夠用，不用接線
;   P2.0 → PB3（FORWARD 正轉）、P2.1 → PB4（REVERSE 反轉）、P3.2 → PB1（OFF 停止）
;   P1.0 → DS1 正轉指示燈、P1.1 → DS2 反轉指示燈（低態亮）
;
; 思考題：把開關式控制延伸成馬達正反轉。重點是「互鎖」：
;   正轉中按反轉不能直接反轉（真馬達會燒），要先按 OFF 停下來才能換方向。
;   程式用指示燈的狀態當互鎖條件：REV_LED 亮著就不理 FWD 鍵，FWD_LED 亮著就不理 REV 鍵。
;   OFF 永遠優先，放在迴圈最前面判斷。
;
; 流程：三支腳寫 1 當輸入 → LED 全暗 → 迴圈：OFF → 全暗；FWD → 反轉燈沒亮才亮正轉燈；
;   REV → 正轉燈沒亮才亮反轉燈。每個鍵都先延時 0.05 秒消彈跳、等放開再動作
FWD    EQU  P2.0       ;設定 FORWARD 開關位址（KT89S51 板上 PB3）
REV    EQU  P2.1       ;設定 REVERSE 開關位址（KT89S51 板上 PB4）
OFF    EQU  P3.2       ;設定 OFF 開關位址（KT89S51 板上 PB1）
LED    EQU  P1         ;設定 LED 位址（正反轉指示燈）
FWD_LED EQU P1.0       ;正轉指示燈
REV_LED EQU P1.1       ;反轉指示燈
;==== 主程式 =========================================
       ORG  0          ;程式從 0 位址開始
START: SETB FWD        ;規劃 FORWARD 為輸入埠
       SETB REV        ;規劃 REVERSE 為輸入埠
       SETB OFF        ;規劃 OFF 為輸入埠
       MOV  LED,#0FFH  ;關閉所有 LED
LOOP:  JNB  OFF,DO_OFF ;OFF 優先：先判斷 OFF 開關
       JNB  FWD,DO_FWD ;判斷 FORWARD 開關
       JNB  REV,DO_REV ;判斷 REVERSE 開關
       JMP  LOOP       ;重新判斷開關
;==== OFF：全部 LED 關閉 =================================
DO_OFF: CALL DELAY50ms ;延時 0.05 秒
       JNB  OFF,DO_OFF ;判斷 OFF 開關放開沒？
       MOV  LED,#0FFH  ;全部 LED 關閉
       JMP  LOOP       ;重新判斷開關
;==== FORWARD：REV_LED 關閉時才點亮 FWD_LED =====================
DO_FWD: CALL DELAY50ms ;延時 0.05 秒
       JNB  FWD,DO_FWD ;判斷 FORWARD 開關放開沒？
       JNB  REV_LED,LOOP ;REV_LED 亮著（反轉中）就不動作
       CLR  FWD_LED    ;點亮 FWD_LED（正轉）
       JMP  LOOP       ;重新判斷開關
;==== REVERSE：FWD_LED 關閉時才點亮 REV_LED ======================
DO_REV: CALL DELAY50ms ;延時 0.05 秒
       JNB  REV,DO_REV ;判斷 REVERSE 開關放開沒？
       JNB  FWD_LED,LOOP ;FWD_LED 亮著（正轉中）就不動作
       CLR  REV_LED    ;點亮 REV_LED（反轉）
       JMP  LOOP       ;重新判斷開關
;==== 延時副程式(0.05 秒) ==============================
DELAY50ms:
       MOV  R7, #100   ;R7 暫存器載入 100 次數
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       RET             ;返回主程式
       END             ;結束程式
