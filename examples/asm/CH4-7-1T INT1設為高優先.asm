;==== 4-7-1 思考題：INT1 設為高優先等級 ====
;
; 思考題要求：
; 課本預留了兩行被註解掉的 SETB PX0 / SETB PX1，要你分別打開再試：
;   兩個中斷同等級時，LEFT 跑到一半按 PB2，INT1 得等 LEFT 做完（約 1.1 秒）才輪到；
;   SETB PX1 之後 INT1 變高優先，會馬上插斷 LEFT，RIGHT 做完再回去把 LEFT 做完。
;   （這一版打開 PX1；也可以自己改成 PX0，或兩個都開，觀察差別。）
; 注意 INT1 是低態觸發，PB2 要按著直到它反應，放開的瞬間請求就消失了。
;
; 怎麼從範例（CH4-7-1 外部中斷LED左右移）改成這一題：
; 只加一行：在 MOV IE 之後加 SETB PX1，把 INT1 設成高優先等級。
; 其餘程式一行都沒動。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
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
	SETB	PX1		;【加】INT1 設為高優先等級（IP 暫存器的 PX1 位元）
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
