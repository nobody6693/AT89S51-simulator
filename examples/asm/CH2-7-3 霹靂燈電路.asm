;==== 2-7-3 霹靂燈電路 ===============================
; 單燈左右來回移動，每 0.1 秒移一位，持續不斷
; 接線：LED = P1（寫 0 亮）
LED	EQU	P1		;設定 LED 位址
;==== 主程式 =========================================
	ORG	0		;程式從 0 位址開始
START:	MOV	A,#0FEH		;設定 LED 之左移初值
;==== 左移 ===========================================
LEFT:	MOV	R0,#7		;計數量填入 R0
	MOV	LED,A		;驅動 LED
LOOPL:	CALL	DELAY100ms	;呼叫延時副程式(0.1s)
	RL	A		;ACC 左移(右邊補 0)
	ORL	A,#1		;ACC 最右邊設定為 1
	MOV	LED,A		;設定驅動 LED
	DJNZ	R0,LOOPL	;若未達 7 次, 則再左移 LED
	CALL	DELAY100ms	;呼叫延時副程式(0.1s)
;==== 右移 ===========================================
RIGHT:	MOV	R0,#7		;計數量填入 R0
	MOV	LED,A		;驅動 LED
LOOPR:	CALL	DELAY100ms	;呼叫延時副程式(0.1s)
	RR	A		;ACC 右移(左邊補 0)
	ORL	A,#10000000B	;ACC 最左邊設定為 1
	MOV	LED,A		;驅動 LED
	DJNZ	R0,LOOPR	;若未達 7 次, 則再右移 LED
	CALL	DELAY100ms	;呼叫延時副程式(0.1s)
	JMP	START		;重新開始執行
;==== 延時副程式(0.1 秒) =============================
DELAY100ms:
	MOV	R7,#200		;R7 暫存器載入 200 次數
D1:	MOV	R6,#250		;R6 暫存器載入 250 次數
	DJNZ	R6,$		;本列執行 R6 次
	DJNZ	R7,D1		;D1 迴圈執行 R7 次
	RET			;返回主程式
	END			;結束程式
