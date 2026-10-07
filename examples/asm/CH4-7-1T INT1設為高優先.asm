;==== 4-7-1 思考題：INT1 設為高優先等級，右移可以插斷左移 ===============
;
; 電路：主板就夠用，不用接線
;   P1.7~P1.0 → 8 顆 LED（低態亮）
;   P3.2(INT0) → PB1、P3.3(INT1) → PB2（按下接地 = 低態）
;   P3.7 → 蜂鳴器
;
; 原理：外部中斷。主程式只管讓 LED 樣板 0FH/F0H 每 0.1 秒反相；
;   按 PB1 → INT0 中斷 → 跳到 03H → LEFT 副程式：嗶兩聲，LED 單燈左移 7 步
;   按 PB2 → INT1 中斷 → 跳到 13H → RIGHT 副程式：嗶兩聲，LED 單燈右移 7 步
;   做完 RETI 回到主程式，繼續反相。
;   IE = 10000101B：EA=1 總開關、EX1=1、EX0=1。IT0/IT1 沒設 → 低態觸發，
;   所以按著不放的話，副程式一結束又會再進一次。
;
; 中斷副程式的保護：進去先 PUSH ACC、PSW（主程式的 A 要保住），
;   再切到別的暫存器庫（LEFT 用 RB1、RIGHT 用 RB2），副程式裡用 R0~R7 就不會
;   動到主程式的 R0~R7。離開前 POP 回來，PSW 一還原暫存器庫也跟著還原。
;   SP 搬到 30H：預設 SP=07H 的話 PUSH 會壓在 08H 起，正好是 RB1 的位置，
;   LEFT 切到 RB1 用 R0 就會把壓進去的 ACC 蓋掉（課本沒寫這行，這裡補上）。
; 思考題：課本預留了 SETB PX0 / SETB PX1 兩行，要你分別打開再試。
;   兩個中斷同等級時，LEFT 跑到一半按 PB2，INT1 得等 LEFT 做完（約 1.1 秒）才輪到；
;   SETB PX1 之後 INT1 變高優先，LEFT 跑到一半就會被 RIGHT 插斷，
;   RIGHT 做完再回去把 LEFT 做完。這一版打開的是 PX1；也可以自己改成 PX0 或兩個都開。
;   注意 INT1 是低態觸發，PB2 要按著直到它反應，放開的瞬間請求就消失了。
;
LED	EQU	P1		;LED 輸出埠
BUZZER	EQU	P3.7		;蜂鳴器
PATTERN	EQU	0FH		;主程式的樣板：高四顆亮、低四顆暗
	ORG	0
	JMP	START
	ORG	03H		;INT0 中斷向量
	JMP	LEFT
	ORG	13H		;INT1 中斷向量
	JMP	RIGHT
START:	MOV	SP,#30H		;堆疊搬離暫存器庫
	MOV	IE,#10000101B	;EA + EX1 + EX0
	SETB	PX1		;INT1 設為高優先等級
	MOV	A,#PATTERN	;載入樣板
LOOP0:	MOV	LED,A		;輸出
	MOV	R5,#200		;200×0.5ms = 0.1 秒
	CALL	DELAY500us
	CPL	A		;反相：0FH ↔ F0H
	JMP	LOOP0		;主程式就這樣一直反相，等中斷來
;==== 延時副程式：R5 × 0.5ms ============================
DELAY500us:
D0:	MOV	R7,#250		;內迴圈 250 × 2us = 0.5ms
	DJNZ	R7,$
	DJNZ	R5,D0		;外迴圈 R5 次
	RET
;==== 嗶嗶聲副程式：R4 = 幾聲 ===========================
; 一聲 = 蜂鳴器 0/1 各 0.5ms 反覆 100 次（1kHz，響 0.1 秒），再靜音 0.1 秒
BEEP:	MOV	A,R4		;（課本原樣，A 其實沒用到）
BP1:	MOV	R3,#100		;一聲裡翻轉 100 次
BP0:	CLR	BUZZER		;蜂鳴器通電（PNP 低態導通）
	MOV	R5,#1
	CALL	DELAY500us	;0.5ms
	SETB	BUZZER		;斷電
	MOV	R5,#1
	CALL	DELAY500us	;0.5ms → 一個週期 1ms = 1kHz
	DJNZ	R3,BP0		;100 個週期 = 0.1 秒
	MOV	R5,#200		;靜音 200×0.5ms = 0.1 秒
	CALL	DELAY500us
	DJNZ	R4,BP1		;還沒嗶夠就再來一聲
	RET
;==== LEFT：INT0 中斷副程式 ============================
LEFT:	PUSH	ACC		;保住主程式的 A
	PUSH	PSW		;保住旗標與暫存器庫選擇
	CLR	RS1		;RS1=0、RS0=1 → 切到暫存器庫 1
	SETB	RS0
	MOV	R4,#2		;嗶兩聲
	CALL	BEEP
	MOV	A,#0FEH		;左移樣板 11111110：最右邊那顆亮
	MOV	R0,#7		;移 7 步
L_OUT:	MOV	LED,A		;輸出
	MOV	R5,#200
	CALL	DELAY500us	;停 0.1 秒
	RL	A		;左旋：亮的那顆往左跑
	DJNZ	R0,L_OUT	;7 步走完
	POP	PSW		;還原（暫存器庫跟著回到 RB0）
	POP	ACC
	RETI			;回主程式
;==== RIGHT：INT1 中斷副程式 ===========================
RIGHT:	PUSH	ACC
	PUSH	PSW
	CLR	RS0		;RS1=1、RS0=0 → 切到暫存器庫 2
	SETB	RS1
	MOV	R4,#2		;嗶兩聲
	CALL	BEEP
	MOV	A,#07FH		;右移樣板 01111111：最左邊那顆亮
	MOV	R0,#7		;移 7 步
R_OUT:	MOV	LED,A
	MOV	R5,#200
	CALL	DELAY500us	;停 0.1 秒
	RR	A		;右旋：亮的那顆往右跑
	DJNZ	R0,R_OUT
	POP	PSW
	POP	ACC
	RETI
	END
