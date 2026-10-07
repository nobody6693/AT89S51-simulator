;==== 3-7-3 思考題：8 位閃爍顯示「12345678」========================
;
; 電路同 3-7-2。
;
; 原理：「閃爍」= 顯示一陣子、全暗一陣子，反覆。
;   掃描一圈只要 8 × 1ms ≈ 8ms，掃一次眼睛根本來不及看，
;   所以用 R5 連續掃 SCAN_COUNT=100 圈（約 0.8 秒）讓字停住，
;   然後關掉掃描線延時 0.1 秒（全暗），再從頭開始 → 看起來就在閃。
; 思考題：改成 8 位，用課本圖 38 的 8 位電路（P2.7~P2.0 全接）。
;   程式只動 DIGITS 和資料表，掃描碼右旋 8 次剛好繞完一圈。
;
; 流程：R5 = 剩幾圈，R4 = 資料指標，R3 = 掃描碼
SEGP	EQU	P0		;顯示資料輸出埠
SCANP	EQU	P2		;掃描碼輸出埠
DIGITS	EQU	8		;顯示位數
SCAN_TIME	EQU	2		;每位數停 2×0.5ms = 1ms（縮短，讓一圈很快）
SCAN_CODE	EQU	01111111B	;掃描碼初值：最左位
SCAN_COUNT	EQU	100		;亮的時候連續掃幾圈
START:	MOV	R5,#SCAN_COUNT	;載入圈數
LOOP1:	MOV	R3,#SCAN_CODE	;每一圈開始：掃描碼回最左位
	MOV	R4,#0		;資料指標歸零
LOOP0:	MOV	SCANP,#0FFH	;關掉所有位數，防殘影
	MOV	DPTR,#DISP_DATA
	MOV	A,R4
	MOVC	A,@A+DPTR	;A = 第 R4 位要顯示的數字
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR	;A = 顯示碼
	MOV	SEGP,A		;送到 P0
	MOV	SCANP,R3	;送出掃描碼，這一位亮
	MOV	R7,#SCAN_TIME
	CALL	DELAYx500us	;停 1ms
	MOV	A,R3
	RR	A		;掃描碼右旋 → 下一位
	MOV	R3,A
	INC	R4
	CJNE	R4,#DIGITS,LOOP0	;這一圈還沒掃完
	DJNZ	R5,LOOP1	;圈數還沒到 100 就再掃一圈（亮的階段）
	MOV	SCANP,#0FFH	;100 圈掃完：關掉掃描線，全暗
	MOV	R7,#200		;200×0.5ms = 0.1 秒
	CALL	DELAYx500us	;暗 0.1 秒
	JMP	START		;再亮 100 圈……週而復始
;==== 延時副程式：R7 × 0.5ms ============================
; 12MHz 時鐘，一個機械週期 1us。DJNZ 佔 2 個週期，
; 內迴圈 250 次 × 2us = 500us，外迴圈 R7 次 → 總共 R7 × 0.5ms
DELAYx500us:
D1:	MOV	R6,#250		;內迴圈次數
	DJNZ	R6,$		;原地數 250 次 = 0.5ms
	DJNZ	R7,D1		;外迴圈數 R7 次
	RET
;==== 要顯示的數字（由左到右）==========================
DISP_DATA:
	DB	1,2,3,4,5,6,7,8
;==== 共陽極七節顯示碼表 =============================
; 位元順序（bit7 → bit0）= a b c d e f g dp，共陽極 0 = 亮、1 = 暗
; 每個碼最右邊都是 1：小數點 dp 不亮
; 接線：P0.7=a P0.6=b P0.5=c P0.4=d P0.3=e P0.2=f P0.1=g P0.0=dp
CA_CODE:
	DB	00000011B	;0：a b c d e f 亮，g dp 暗
	DB	10011111B	;1：只有 b c 亮
	DB	00100101B	;2：a b d e g
	DB	00001101B	;3：a b c d g
	DB	10011001B	;4：b c f g
	DB	01001001B	;5：a c d f g
	DB	01000001B	;6：a c d e f g
	DB	00011111B	;7：a b c
	DB	00000001B	;8：全亮
	DB	00001001B	;9：a b c d f g
	END
