;==== 2-7-1 思考題：1KHz、2KHz 交替嗶聲 ==============
; 原題：嗶聲固定 1KHz，如何改成 1KHz、2KHz 交替？
; 作法：把「嗶一段」抽成共用副程式 BEEP_N，用 R1 帶入半週期延時的迴圈次數，
;       1KHz → 半週期 500us（R1=250）、2KHz → 半週期 250us（R1=125）。
;       兩者都嗶 0.1 秒，所以 2KHz 的翻轉次數要加倍（R0=100 / 200）。
Switch	EQU	P0.0		;設定指撥開關位址
Buzzer	EQU	P3.7		;設定蜂鳴器位址
;==== 主程式 =========================================
	ORG	0
START:	SETB	Switch		;規劃輸入埠
	SETB	Buzzer		;蜂鳴器初始狀態(不響)
	JNB	Switch,BOTH	;開關撥 ON 則交替嗶兩聲
	JMP	START
;==== 交替嗶聲 =======================================
BOTH:	MOV	R0,#100		;1KHz：100 個週期 = 0.1 秒
	MOV	R1,#250		;半週期延時次數 → 500us
	CALL	BEEP_N
	CALL	DELAY100ms	;兩聲之間靜音 0.1 秒
	MOV	R0,#200		;2KHz：200 個週期 = 0.1 秒
	MOV	R1,#125		;半週期延時次數 → 250us
	CALL	BEEP_N
	CALL	DELAY100ms	;靜音 0.1 秒後重來
	JMP	START
;==== 嗶 R0 個週期，半週期由 R1 決定 =================
; 註：8051 沒有「暫存器對暫存器」的 MOV，MOV R7,R1 不合法，
;     要經由 A 轉手（或寫成 MOV 07H,01H 的直接定址形式）。
BEEP_N:	CLR	Buzzer		;低態輸出到蜂鳴器
	MOV	A,R1
	MOV	R7,A
	DJNZ	R7,$		;半週期延時
	SETB	Buzzer		;高態輸出到蜂鳴器
	MOV	A,R1
	MOV	R7,A
	DJNZ	R7,$		;半週期延時
	DJNZ	R0,BEEP_N	;未達 R0 次則繼續
	RET
;==== 延時副程式(0.1 秒) =============================
DELAY100ms:
	MOV	R7,#200
D1:	MOV	R6,#250
	DJNZ	R6,$
	DJNZ	R7,D1
	RET
	END
