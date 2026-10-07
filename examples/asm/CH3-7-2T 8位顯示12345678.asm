;==== 3-7-2 思考題：改成 8 位七節顯示器，顯示「12345678」===========
;
; 電路同 3-7-1：P0 接 a~dp，P2 接各位數的 com（8 位用到 P2.7~P2.0）
;
; 跟 3-7-1 的差別：掃描碼不查表，而是用「移位」產生。
;   R3 放掃描碼，初值 01111111B（只有 P2.7 是 0 → 最左位亮），
;   每掃完一位就 RR A（右旋一位），0 往右跑一格，剛好就是下一位的掃描碼。
;   8 位掃完後 R3 在 START 重新載入初值，所以不用判斷有沒有超出範圍。
; 思考題：課本問「改成 8 位，電路需不需要改？」
;   程式只改 DIGITS=8 和資料表；掃描碼 01111111B 右旋 8 次剛好繞完 P2.7~P2.0。
;   電路要把 P2.3~P2.0 也接到另一組四位模組的電晶體（課本圖 38），
;   模擬器載入這個範例時會自動把 8 條位選線都接上。
;
; 流程：R4 = 顯示資料指標，R3 = 目前的掃描碼
SEGP	EQU	P0		;顯示資料輸出埠
SCANP	EQU	P2		;掃描碼輸出埠
DIGITS	EQU	8		;顯示位數
SCAN_TIME	EQU	8		;每位數停 8×0.5ms = 4ms
SCAN_CODE	EQU	01111111B	;掃描碼初值：最左位
START:	MOV	R4,#0		;資料指標歸零
	MOV	R3,#SCAN_CODE	;掃描碼回到最左位
LOOP0:	MOV	SCANP,#0FFH	;先關掉所有位數，防殘影
	MOV	DPTR,#DISP_DATA	;指向要顯示的數字表
	MOV	A,R4
	MOVC	A,@A+DPTR	;A = 第 R4 位要顯示的數字
	MOV	DPTR,#CA_CODE	;指向七節顯示碼表
	MOVC	A,@A+DPTR	;A = 該數字的顯示碼
	MOV	SEGP,A		;送到 P0
	MOV	SCANP,R3	;送出掃描碼，這一位亮
	MOV	R7,#SCAN_TIME
	CALL	DELAYx500us	;停 4ms
	MOV	A,R3		;取出掃描碼
	RR	A		;右旋一位：0 移到下一位數
	MOV	R3,A		;存回去
	INC	R4		;下一個數字
	CJNE	R4,#DIGITS,LOOP0	;還沒掃完就繼續
	JMP	START		;掃完一圈，指標與掃描碼都重來
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
