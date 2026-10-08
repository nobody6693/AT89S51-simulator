;==== 2-7-1 思考題：1kHz、2kHz 交替嗶聲 ====
;
; 思考題要求：
; 原本嗶聲固定 1kHz，改成 1kHz 嗶一聲、2kHz 嗶一聲，輪流。
;
; 怎麼從範例（CH2-7-1 嗶嗶電路）改成這一題：
; 1. 把「嗶一段」的迴圈（CLR→延時→SETB→延時→DJNZ）從 Beep 搬進新副程式 TONE，Beep 就可以呼叫兩次。
; 2. 半週期延時 DELAY500us 的次數寫死是 250。要變音高就得讓次數可調：改名 DELAYHALF，
;    次數由 R1 帶進來（250 → 0.5ms → 1kHz；125 → 0.25ms → 2kHz）。
; 3. 2kHz 的週期只有 0.5ms，要響滿 0.1 秒需要 200 個週期，所以 R0 要從 100 改成 200。
; 4. Beep 裡依序：設 R0、R1 → 呼叫 TONE（1kHz）→ 靜音 → 再設 R0、R1 → 呼叫 TONE（2kHz）→ 靜音。
; 其餘一行都沒動，跟範例一樣。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
Switch	EQU	P0.0		;指撥開關
Buzzer	EQU	P3.7		;蜂鳴器
	ORG	0
START:	SETB	Switch		;P0.0 寫 1，規劃成輸入
	SETB	Buzzer		;蜂鳴器先關掉（1 = 不響）
	JNB	Switch,Beep	;開關撥 ON（讀到 0）→ 去嗶
	JMP	START		;沒撥就一直等
;==== 嗶一聲：1kHz 響 0.1 秒，靜音 0.1 秒 =====================
Beep:	MOV	R0,#100		;1kHz：100 個週期 × 1ms = 0.1 秒
	MOV	R1,#250		;【加】半週期延時次數 250 → 0.5ms
	CALL	TONE		;【改】原本的迴圈搬進 TONE 副程式（見下方）
	CALL	DELAY100ms	;靜音 0.1 秒，聲音才會一聲一聲分開
	MOV	R0,#200		;【加】2kHz：週期減半，要 200 個週期才夠 0.1 秒
	MOV	R1,#125		;【加】半週期延時次數 125 → 0.25ms
	CALL	TONE		;【加】再嗶一聲，這次是 2kHz
	CALL	DELAY100ms	;【加】靜音 0.1 秒
	JMP	START		;回去重新看開關
;==== 【改】嗶 R0 個週期，半週期由 R1 決定 ===================
TONE:	CLR	Buzzer		;蜂鳴器通電（低態）
	CALL	DELAYHALF	;【改】DELAY500us 換成次數可調的 DELAYHALF
	SETB	Buzzer		;蜂鳴器斷電
	CALL	DELAYHALF	;半週期延時
	DJNZ	R0,TONE		;R0 個週期
	RET
;==== 延時副程式：0.5ms =================================
; 一個機械週期 1us，DJNZ 佔 2 個週期，250 × 2us = 500us
DELAYHALF:			;【改】原名 DELAY500us
	MOV	A,R1		;【改】次數不再寫死 250，由 R1 帶進來
	MOV	R7,A		;（DJNZ R7,$ 的 R7 要先裝好次數）
	DJNZ	R7,$		;原地數 R1 次
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
