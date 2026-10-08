;==== 2-7-3 思考題：霹靂燈到一端嗶兩聲、到另一端嗶一聲 =====================
;
; 電路：主板就夠用，不用接線
;   P1.7~P1.0 → 8 顆 LED（低態亮）；P3.7 → 蜂鳴器（低態響）
;
; 思考題：單燈到最左邊時嗶一聲、到最右邊時嗶兩聲。
;   板子上 P1.0 = DS1 是最左邊，P1.7 = DS8 是最右邊。A 初值 0FEH 是 P1.0 亮，所以：
;     RL 那段 → 燈由左往右跑，走完停在 P1.7（最右邊）→ 嗶 2 聲
;     RR 那段 → 燈由右往左跑，走完停在 P1.0（最左邊）→ 嗶 1 聲
;   課本本文的「左移／右移」講的是暫存器裡位元的方向，跟畫面上的左右相反，以位置為準。
;
; 嗶聲副程式 BEEP_N：R1 = 幾聲。每聲 1kHz（半週期 250 × 2us）響 100 個週期 = 0.1 秒，
;   聲與聲之間靜音 0.1 秒。它用 R0 當週期計數，跟移燈的 R0 不衝突，因為移燈早就走完了。
;
; 流程：A = 0FEH → 往右 7 步 → 嗶 2 聲 → 往左 7 步 → 嗶 1 聲 → 重來
LED	EQU	P1		;LED 輸出埠
Buzzer	EQU	P3.7		;蜂鳴器
	ORG	0
	SETB	Buzzer		;蜂鳴器先關掉（只做一次，不在 START 迴圈裡）
START:	MOV	A,#0FEH		;P1.0 亮
;==== 往高位元走（畫面往右）==================================
LEFT:	MOV	R0,#7
	MOV	LED,A
LOOPL:	CALL	DELAY100ms	;每步 0.1 秒
	RL	A		;左旋
	ORL	A,#1		;補回 bit0
	MOV	LED,A
	DJNZ	R0,LOOPL
	CALL	DELAY100ms	;端點停 0.1 秒
	MOV	R1,#2		;走到最右邊（P1.7）→ 嗶 2 聲
	CALL	BEEP_N
;==== 往低位元走（畫面往左）==================================
RIGHT:	MOV	R0,#7
	MOV	LED,A
LOOPR:	CALL	DELAY100ms
	RR	A		;右旋
	ORL	A,#10000000B	;補回 bit7
	MOV	LED,A
	DJNZ	R0,LOOPR
	CALL	DELAY100ms
	MOV	R1,#1		;走回最左邊（P1.0）→ 嗶 1 聲
	CALL	BEEP_N
	JMP	START		;再來一趟
;==== 嗶 R1 聲：每聲 1kHz 響 0.1 秒，間隔 0.1 秒 ==================
BEEP_N:	MOV	R0,#100		;100 個週期 × 1ms = 0.1 秒
BEEP1:	CLR	Buzzer		;通電
	MOV	R7,#250
	DJNZ	R7,$		;半週期 0.5ms
	SETB	Buzzer		;斷電
	MOV	R7,#250
	DJNZ	R7,$		;半週期 0.5ms
	DJNZ	R0,BEEP1	;100 個週期
	CALL	DELAY100ms	;聲與聲之間靜音 0.1 秒
	DJNZ	R1,BEEP_N	;還沒嗶夠聲數就再一聲
	RET
;==== 延時副程式：0.1 秒 ==================================
; 12MHz 時鐘，一個機械週期 1us。DJNZ 佔 2 個週期：
; 內迴圈 250 × 2us = 500us，外迴圈 200 次 → 100ms（加上迴圈本身的開銷約多 0.4%）
DELAY100ms:
	MOV	R7,#200		;外迴圈 200 次
D1:	MOV	R6,#250		;內迴圈 250 次
	DJNZ	R6,$		;原地數 250 次 = 0.5ms
	DJNZ	R7,D1		;數滿 200 次 = 0.1 秒
	RET
	END
