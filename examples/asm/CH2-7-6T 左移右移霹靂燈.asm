;==== 2-7-6 思考題：指撥開關選全滅、單燈左移、單燈右移、霹靂燈 ===================
;
; 電路：主板就夠用，不用接線
;   P0.1 P0.0 → 指撥開關 SW1 的第 2、1 位；P1 → 8 顆 LED（低態亮）
;
; 思考題：四種狀態改成會動的燈號。因為每輪迴圈都要重新讀開關（才能隨時切換），
;   燈的位置不能放在 A 裡等迴圈，要存在記憶體：PAT（30H）記目前燈號，DIR（31H）記霹靂燈方向。
;   狀態 1：PAT 每 0.1 秒 RL 一次；狀態 2：RR；狀態 3：往一邊走到底（07FH 或 0FEH）就換方向。
;   狀態 0 順便把 PAT、DIR 重設，切回來時從頭開始。
;
; 流程：讀開關算狀態 → S1/S2/S3 各做一步（輸出、延時 0.1 秒、移位）→ 回迴圈再讀開關
SW     EQU  P0          ;設定 SW 開關位址
LED    EQU  P1          ;設定 LED 位址
PAT    EQU  30H         ;目前燈號位置（單燈用）
DIR    EQU  31H         ;霹靂燈方向旗標（byte），0=左移，非0=右移
;==== 主程式 =========================================
       ORG  0           ;程式從 0 位址開始
START: MOV  SW, #0FFh   ;規劃 SW 為輸入埠
       MOV  LED,#0FFH   ;關閉 LED
       MOV  PAT,#0FEH   ;單燈初始位置
       MOV  DIR,#0      ;霹靂燈初始方向：左移
LOOP:  MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       JZ   S0          ;判斷狀態 0：全滅
       SUBB A,#1        ;A 減 1
       JZ   S1          ;判斷狀態 1：單燈左移
       MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       SUBB A,#2        ;A 減 2
       JZ   S2          ;判斷狀態 2：單燈右移
       MOV  A,SW        ;讀取指撥開關
       CPL  A           ;將 A 反相
       SUBB A,#3        ;A 減 3
       JZ   S3          ;判斷狀態 3：霹靂燈
       JMP  LOOP        ;重新判斷開關
;==== 狀態 0：LED 全滅 ===================================
S0:    MOV  LED,#0FFH   ;關閉 LED
       MOV  PAT,#0FEH   ;重置單燈位置
       MOV  DIR,#0      ;重置霹靂燈方向
       JMP  LOOP        ;重新判斷開關
;==== 狀態 1：單燈左移（每 0.1 秒移一位） ========================
S1:    MOV  A,PAT       ;取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       RL   A           ;燈號左移一位
       MOV  PAT,A       ;存回目前燈號
       JMP  LOOP        ;重新判斷開關
;==== 狀態 2：單燈右移（每 0.1 秒移一位） ========================
S2:    MOV  A,PAT       ;取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       RR   A           ;燈號右移一位
       MOV  PAT,A       ;存回目前燈號
       JMP  LOOP        ;重新判斷開關
;==== 狀態 3：霹靂燈（左右來回，每 0.1 秒移一位） ==================
S3:    MOV  A,PAT       ;取出目前燈號
       MOV  LED,A       ;驅動 LED
       CALL DELAY100ms  ;延時 0.1 秒
       MOV  A,DIR       ;判斷目前方向
       JNZ  S3_GOR       ;非 0 表示右移
S3_GOL: MOV  A,PAT       ;向左移一位
       RL   A           ;
       MOV  PAT,A       ;存回目前燈號
       CJNE A,#07FH,S3_END ;是否已到最左邊？
       MOV  DIR,#1      ;到了，改成右移
       JMP  S3_END      ;
S3_GOR: MOV  A,PAT       ;向右移一位
       RR   A           ;
       MOV  PAT,A       ;存回目前燈號
       CJNE A,#0FEH,S3_END ;是否已到最右邊？
       MOV  DIR,#0      ;到了，改成左移
S3_END: JMP  LOOP        ;重新判斷開關
;==== 延時副程式(0.1 秒) ================================
DELAY100ms:
       MOV  R7, #200    ;R7 暫存器載入 200 次數
D1:    MOV  R6, #250    ;R6 暫存器載入 250 次數
       DJNZ R6, $       ;本列執行 R6 次
       DJNZ R7, D1      ;D1 迴圈執行 R7 次
       RET              ;返回主程式
       END              ;結束程式
