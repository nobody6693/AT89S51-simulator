;==== 2-7-6 思考題：指撥開關選全滅、單燈左移、單燈右移、霹靂燈 ====
;
; 思考題要求：
; 指撥開關選到的四種狀態，改成：0 全滅、1 單燈左移、2 單燈右移、3 霹靂燈（左右來回）。
;
; 怎麼從範例（CH2-7-6 選擇式控制電路）改成這一題：
; 1. 判斷開關的部分（LOOP 那一大段）完全不動，仍是跳到 S0~S3。
; 2. 會動的燈每輪迴圈都要重讀開關（才能隨時切換），燈的位置不能留在 A 裡，要存到記憶體：
;    原本 30H 的暫存區，改名 PAT 當「目前燈號」，再多一個 DIR（31H）當霹靂燈的方向旗標。
; 3. S0 全滅：多把 PAT、DIR 重設，切回來時才會從頭開始。
; 4. S1：原本輸出固定的 0F0H，改成輸出 PAT → 延時 0.1 秒 → RL A 左旋 → 存回 PAT。
; 5. S2：同 S1，但用 RR A 右旋。
; 6. S3：原本是 30H 反相閃爍，改成往一邊走（RL 或 RR，看 DIR），走到 07FH 或 0FEH 就把 DIR 反過來。
; LOOP 的開關判斷、延時副程式都沒動。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
SW     EQU  P0          ;設定 SW 開關位址
LED    EQU  P1          ;設定 LED 位址
PAT    EQU  30H         ;【加】目前燈號（原本 30H 當閃爍暫存，現在改名）
DIR    EQU  31H         ;【加】霹靂燈方向旗標，0=左移，非0=右移
;==== 主程式 =========================================
       ORG  0           ;程式從 0 位址開始
START: MOV  SW, #0FFh   ;規劃 SW 為輸入埠
       MOV  LED,#0FFH   ;關閉 LED
       MOV  PAT,#0FEH   ;【改】單燈初始位置：最右邊那顆亮（原本 30H 設 0）
       MOV  DIR,#0      ;【加】霹靂燈初始方向：左移
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
       MOV  PAT,#0FEH   ;【加】重置單燈位置
       MOV  DIR,#0      ;【加】重置霹靂燈方向
       JMP  LOOP        ;重新判斷開關
S1:    MOV  A,PAT       ;【改】原本輸出固定的 0F0H；現在取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       RL   A           ;【加】燈號左移一位
       MOV  PAT,A       ;【加】存回目前燈號
       JMP  LOOP        ;重新判斷開關
S2:    MOV  A,PAT       ;【改】原本輸出固定的 0FH；現在取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       RR   A           ;【加】燈號右移一位（跟 S1 只差 RL / RR）
       MOV  PAT,A       ;【加】存回目前燈號
       JMP  LOOP        ;重新判斷開關
S3:    MOV  A,PAT       ;【改】原本是 30H 反相閃爍；改成霹靂燈：取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       MOV  A,DIR       ;【加】判斷目前方向
       JNZ  S3_GOR      ;非 0 表示右移
S3_GOL: MOV  A,PAT      ;【加】向左移一位（做法同 S1）
       RL   A           ;
       MOV  PAT,A       ;存回目前燈號
       CJNE A,#07FH,S3_END ;是否已到最左邊？
       MOV  DIR,#1      ;到了，改成右移
       JMP  S3_END      ;
S3_GOR: MOV  A,PAT      ;【加】向右移一位（做法同 S2）
       RR   A           ;
       MOV  PAT,A       ;存回目前燈號
       CJNE A,#0FEH,S3_END ;是否已到最右邊？
       MOV  DIR,#0      ;到了，改成左移
S3_END: JMP  LOOP       ;重新判斷開關
;==== 延時副程式(0.1 秒) ================================
DELAY100ms:
       MOV  R7, #200    ;R7 暫存器載入 200 次數
D1:    MOV  R6, #250    ;R6 暫存器載入 250 次數
       DJNZ R6, $       ;本列執行 R6 次
       DJNZ R7, D1      ;D1 迴圈執行 R7 次
       RET              ;返回主程式
       END              ;結束程式
