;==== 2-7-1 思考題：1kHz、2kHz 交替嗶 ==============================
;
; 電路同 2-7-1：P0.0 指撥開關、P3.7 蜂鳴器。
;
; 思考題：原本固定 1kHz，改成 1kHz 嗶一聲、2kHz 嗶一聲輪流。
;   把「嗶一段」抽成共用副程式 BEEP_N，用兩個參數控制：
;     R1 = 半週期的延時次數：250 → 500us（1kHz）、125 → 250us（2kHz）
;     R0 = 翻轉幾個週期：兩者都要響 0.1 秒，2kHz 的週期只有一半長，次數要加倍（100 / 200）
;   DJNZ R7,$ 的次數放在 R1 裡傳進去，所以半週期不用寫死，一個副程式兩種音高都能用。
;
; 流程：開關撥 ON → 1kHz 嗶 0.1 秒 → 靜音 0.1 秒 → 2kHz 嗶 0.1 秒 → 靜音 0.1 秒 → 重來
Switch	EQU	P0.0		;指撥開關
Buzzer	EQU	P3.7		;蜂鳴器
	ORG	0
START:	SETB	Switch		;P0.0 規劃成輸入
	SETB	Buzzer		;蜂鳴器先關掉
	JNB	Switch,BOTH	;撥 ON → 去交替嗶
	JMP	START		;沒撥就等
;==== 交替嗶：先 1kHz 再 2kHz ===============================
BOTH:	MOV	R0,#100		;1kHz：100 個週期 = 0.1 秒
	MOV	R1,#250		;半週期延時 250 × 2us = 500us
	CALL	BEEP_N
	CALL	DELAY100ms	;靜音 0.1 秒
	MOV	R0,#200		;2kHz：週期只有 0.5ms，要 200 個才夠 0.1 秒
	MOV	R1,#125		;半週期延時 125 × 2us = 250us
	CALL	BEEP_N
	CALL	DELAY100ms	;靜音 0.1 秒
	JMP	START		;回去看開關
;==== 嗶 R0 個週期，半週期 = R1 × 2us =========================
BEEP_N:	CLR	Buzzer		;蜂鳴器通電
	MOV	A,R1		;半週期次數抄到 R7（DJNZ 只能用 R0~R7 或直接位址）
	MOV	R7,A
	DJNZ	R7,$		;延時半週期
	SETB	Buzzer		;蜂鳴器斷電
	MOV	A,R1
	MOV	R7,A
	DJNZ	R7,$		;再延時半週期
	DJNZ	R0,BEEP_N	;還沒嗶夠週期數就繼續
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
