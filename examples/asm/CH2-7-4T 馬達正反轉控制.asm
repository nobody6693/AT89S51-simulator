;==== 2-7-4 思考題：馬達正反轉控制（用兩顆 LED 當正轉、反轉指示燈） ====
;
; 思考題要求：
; 把「ON 開、OFF 關」改成馬達的「正轉、反轉、停止」三個鍵。
; 互鎖：正轉中不能直接反轉（真馬達會燒），要先按 OFF 停下來才能換方向。
; 用 P1.0 當正轉指示燈、P1.1 當反轉指示燈，OFF 永遠優先。
;
; 怎麼從範例（CH2-7-4 開關式控制電路）改成這一題：
; 1. 開關重新命名：ON（P2.0）改叫 FWD 正轉；原本 OFF 的腳位 P2.1 讓給 REV 反轉；
;    OFF 改接 PB1（P3.2）。新增兩個指示燈位址 FWD_LED（P1.0）、REV_LED（P1.1）。
; 2. START 多規劃一支輸入 REV；LOOP 多判斷一個 REV 鍵，OFF 還是排第一（優先）。
; 3. LED_ON 改成 LED_FWD：原本 MOV LED,#0 讓八顆全亮，現在只用 CLR FWD_LED 亮正轉燈。
; 4. 互鎖：LED_FWD 動作前先看 REV_LED，已經亮著（反轉中）就不動作直接回 LOOP。
; 5. 照 LED_FWD 複製一份 LED_REV，把 FWD 換成 REV、判斷改看 FWD_LED。
; 其餘一行都沒動，跟範例一樣。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
FWD    EQU  P2.0       ;【改】ON 改名 FWD：正轉（KT89S51 板上 PB3）
REV    EQU  P2.1       ;【改】原 OFF 的腳位給反轉（PB4）
OFF    EQU  P3.2       ;【改】OFF 改接 PB1（INT0 那顆）
LED    EQU  P1         ;設定 LED 位址
FWD_LED EQU P1.0       ;【加】正轉指示燈
REV_LED EQU P1.1       ;【加】反轉指示燈
;==== 主程式 =========================================
       ORG  0          ;程式從 0 位址開始
START: SETB FWD        ;【改】規劃 FWD 為輸入埠
       SETB REV        ;【加】規劃 REV 為輸入埠
       SETB OFF        ;規劃 OFF 為輸入埠
       MOV  LED,#0FFH  ;關閉 LED
LOOP:  JNB  OFF,LED_OFF ;判斷 OFF 開關（OFF 優先，排第一）
       JNB  FWD,LED_FWD ;【改】判斷 FWD 開關
       JNB  REV,LED_REV ;【加】判斷 REV 開關
       JMP  LOOP       ;重新判斷開關
LED_OFF: CALL DELAY50ms ;延時 0.05 秒
       JNB  OFF,LED_OFF ;判斷 OFF 開關放開沒？
       MOV  LED,#0FFH  ;關閉 LED
       JMP  LOOP       ;重新判斷開關
LED_FWD: CALL DELAY50ms ;延時 0.05 秒
       JNB  FWD,LED_FWD ;【改】判斷 FWD 開關放開沒？
       JNB  REV_LED,LOOP ;【加】互鎖：REV_LED 亮著（反轉中）就不動作
       CLR  FWD_LED    ;【改】只點亮正轉燈（原本 MOV LED,#0 全亮）
       JMP  LOOP       ;重新判斷開關
LED_REV: CALL DELAY50ms ;【加】照 LED_FWD 複製，FWD 換成 REV
       JNB  REV,LED_REV ;判斷 REV 開關放開沒？
       JNB  FWD_LED,LOOP ;互鎖：FWD_LED 亮著（正轉中）就不動作
       CLR  REV_LED    ;點亮反轉燈
       JMP  LOOP       ;重新判斷開關
;==== 延時副程式(0.05 秒) ==============================
DELAY50ms:
       MOV  R7, #100   ;R7 暫存器載入 100 次數
D1:    MOV  R6, #250   ;R6 暫存器載入 250 次數
       DJNZ R6, $      ;本列執行 R6 次
       DJNZ R7, D1     ;D1 迴圈執行 R7 次
       RET             ;返回主程式
       END             ;結束程式
