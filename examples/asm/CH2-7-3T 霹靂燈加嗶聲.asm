;==== 2-7-3 思考題：霹靂燈 + 兩端嗶聲 ================
; 原題：單燈到最左邊時嗶一聲、到最右邊時嗶兩聲。
;
; 板子上 P1.0 = DS1 = 最左邊（課本 2-7-1 也說「指撥開關最左邊的位元(P0.0)」），
; P1.7 = DS8 = 最右邊。A 的初值 0FEH 是 P1.0 亮，所以：
;   RL A 這一段  → 燈由左往右跑，走完停在 P1.7 = 最右邊 → 嗶 2 聲
;   RR A 這一段  → 燈由右往左跑，走完停在 P1.0 = 最左邊 → 嗶 1 聲
; （課本 2-7-3 本文寫「單一個 LED 由左而右移動，到達最右邊後…」，
;   以位置為準，不要被「左移／右移」這兩個講的是暫存器方向的字誤導。）
LED	EQU	P1		;設定 LED 位址
Buzzer	EQU	P3.7		;設定蜂鳴器位址
;==== 主程式 =========================================
	ORG	0
	SETB	Buzzer		;蜂鳴器初始狀態(不響)
START:	MOV	A,#0FEH		;設定 LED 之左移初值
;==== 左移 ===========================================
LEFT:	MOV	R0,#7
	MOV	LED,A
LOOPL:	CALL	DELAY100ms
	RL	A		;ACC 左移(右邊補 0)
	ORL	A,#1		;ACC 最右邊設定為 1
	MOV	LED,A
	DJNZ	R0,LOOPL
	CALL	DELAY100ms
	MOV	R1,#2		;走到最右邊(P1.7) → 嗶 2 聲
	CALL	BEEP_N
;==== 右移 ===========================================
RIGHT:	MOV	R0,#7
	MOV	LED,A
LOOPR:	CALL	DELAY100ms
	RR	A		;ACC 右移(左邊補 0)
	ORL	A,#10000000B	;ACC 最左邊設定為 1
	MOV	LED,A
	DJNZ	R0,LOOPR
	CALL	DELAY100ms
	MOV	R1,#1		;走回最左邊(P1.0) → 嗶 1 聲
	CALL	BEEP_N
	JMP	START
;==== 嗶 R1 聲，每聲 1KHz 持續 0.1 秒 ================
BEEP_N:	MOV	R0,#100		;100 個週期 = 0.1 秒
BEEP1:	CLR	Buzzer
	MOV	R7,#250
	DJNZ	R7,$		;半週期 500us
	SETB	Buzzer
	MOV	R7,#250
	DJNZ	R7,$		;半週期 500us
	DJNZ	R0,BEEP1
	CALL	DELAY100ms	;聲與聲之間的間隔
	DJNZ	R1,BEEP_N	;還沒嗶完則再嗶一聲
	RET
;==== 延時副程式(0.1 秒) =============================
DELAY100ms:
	MOV	R7,#200
D1:	MOV	R6,#250
	DJNZ	R6,$
	DJNZ	R7,D1
	RET
	END
