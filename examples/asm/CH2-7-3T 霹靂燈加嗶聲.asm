;==== 2-7-3 思考題：霹靂燈到一端嗶兩聲、到另一端嗶一聲 ====
;
; 思考題要求：
; 單燈走到最左邊時嗶一聲、走到最右邊時嗶兩聲。
; （板子上 P1.0 = DS1 在最左邊，P1.7 = DS8 在最右邊；RL 那段燈往 P1.7 跑，RR 那段往 P1.0 跑。）
;
; 怎麼從範例（CH2-7-3 霹靂燈電路）改成這一題：
; 1. 加蜂鳴器：Buzzer EQU P3.7，程式開頭 SETB Buzzer 先讓它不響。
; 2. 新增嗶聲副程式 BEEP_N（R1 = 幾聲）：每聲 1kHz 響 0.1 秒，聲與聲之間靜音 0.1 秒（跟 2-7-1 的嗶法一樣）。
; 3. RL 那段走完（燈停在 P1.7 最右邊）→ R1 = 2，呼叫 BEEP_N，嗶兩聲。
; 4. RR 那段走完（燈停在 P1.0 最左邊）→ R1 = 1，呼叫 BEEP_N，嗶一聲。
;    BEEP_N 用 R0 數週期，移燈用的 R0 早就走完了，不會互相干擾。
; 其餘一行都沒動，跟範例一樣。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
LED	EQU	P1		;LED 輸出埠
Buzzer	EQU	P3.7		;【加】蜂鳴器
	ORG	0
	SETB	Buzzer		;【加】蜂鳴器先關掉（只做一次，不放在 START 迴圈裡）
START:	MOV	A,#0FEH		;11111110B：P1.0 亮
;==== 往高位元走（畫面往右）==================================
LEFT:	MOV	R0,#7		;7 步
	MOV	LED,A
LOOPL:	CALL	DELAY100ms	;停 0.1 秒
	RL	A		;左旋一位
	ORL	A,#1		;補回 bit0 = 1
	MOV	LED,A
	DJNZ	R0,LOOPL
	CALL	DELAY100ms	;到端點多停 0.1 秒
	MOV	R1,#2		;【加】走到最右邊（P1.7）→ 嗶 2 聲
	CALL	BEEP_N		;【加】
;==== 往低位元走（畫面往左）==================================
RIGHT:	MOV	R0,#7		;7 步
	MOV	LED,A		;A 現在是 01111111B：P1.7 亮
LOOPR:	CALL	DELAY100ms
	RR	A		;右旋一位
	ORL	A,#10000000B	;補回 bit7 = 1
	MOV	LED,A
	DJNZ	R0,LOOPR
	CALL	DELAY100ms	;到端點多停 0.1 秒
	MOV	R1,#1		;【加】走回最左邊（P1.0）→ 嗶 1 聲
	CALL	BEEP_N		;【加】
	JMP	START		;再來一趟
;==== 【加】嗶 R1 聲：每聲 1kHz 響 0.1 秒，間隔 0.1 秒 ============
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
