;==== 3-7-4 思考題：8 位跑馬燈「12345678」 ====
;
; 思考題要求：
; 改成 8 位七節顯示器，跑馬燈顯示 12345678（電路同 3-7-3 的圖 38）。
;
; 怎麼從範例（CH3-7-4 4位右移跑馬燈）改成這一題：
; 1. 位數：DIGITS EQU 4 → 8。程式靠 DIGITS 決定一圈掃幾位，其他地方不用改。
; 2. 要顯示的數字表 DISP_DATA：改成 8 個數字 1,2,3,4,5,6,7,8。
; 3. 「位置超出範圍就減 DIGITS」的判斷要跟著改：位置範圍從 0~3 變成 0~7（3 個位元），
;    所以 ANL A,#0FCH（濾掉低 2 位元）改成 ANL A,#0F8H（濾掉低 3 位元），結果非 0 就是 ≥ 8。
;    減法 SUBB A,#DIGITS 用的是 DIGITS，自動變成減 8。
; 其餘程式一行都沒動。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
SEGP	EQU	P0		;顯示資料輸出埠
SCANP	EQU	P2		;掃描碼輸出埠
DIGITS	EQU	8		;【改】4 → 8：顯示位數
SCAN_TIME	EQU	2		;每位數停 1ms
SCAN_COUNT	EQU	100		;每個畫面掃 100 圈再移位
START:	MOV	R2,#0		;移位量歸零
LOOP2:	MOV	R5,#SCAN_COUNT	;這個畫面要掃的圈數
LOOP1:	MOV	R4,#0		;資料指標歸零（每圈從第一個字開始）
LOOP0:	MOV	SCANP,#0FFH	;關掉所有位數，防殘影
	MOV	DPTR,#DISP_DATA
	MOV	A,R4
	MOVC	A,@A+DPTR	;A = 第 R4 個字
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR	;A = 顯示碼
	MOV	SEGP,A		;送到 P0
	MOV	A,R4		;算這個字要顯示在哪一位
	ADD	A,R2		;位置 = 資料指標 + 移位量
	MOV	R3,A		;先存起來
	ANL	A,#0F8H		;【改】0FCH → 0F8H：只留高 5 位元，位置在 0~7 以內結果才會是 0
	JZ	OK		;沒超出範圍
	MOV	A,R3		;超出了：取回位置
	SUBB	A,#DIGITS	;減 DIGITS（現在是 8）繞回去（CY 此時為 0，SUBB 等於 SUB）
	MOV	R3,A
OK:	MOV	DPTR,#SCAN_CODE
	MOV	A,R3
	MOVC	A,@A+DPTR	;查這個位置的掃描碼
	MOV	SCANP,A		;那一位亮
	MOV	R7,#SCAN_TIME
	CALL	DELAYx500us	;停 1ms
	INC	R4		;下一個字
	CJNE	R4,#DIGITS,LOOP0	;這一圈還沒掃完
	DJNZ	R5,LOOP1	;這個畫面還沒掃滿 100 圈
	INC	R2		;移位量 +1：整個畫面往右移一格
	CJNE	R2,#DIGITS,LOOP2	;還沒轉完一整圈
	JMP	START		;轉完一圈，從原樣重新開始
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
	DB	1,2,3,4,5,6,7,8	;【改】原本 8,0,5,4
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
;==== 低態掃描碼表：哪一位元是 0，哪一位數的 PNP 電晶體就導通 ====
; P2.7=最左位 … P2.0=最右位；4 位模組只用到前四個（P2.7~P2.4）
SCAN_CODE:
	DB	01111111B	;第 0 位（最左）
	DB	10111111B	;第 1 位
	DB	11011111B	;第 2 位
	DB	11101111B	;第 3 位
	DB	11110111B	;第 4 位
	DB	11111011B	;第 5 位
	DB	11111101B	;第 6 位
	DB	11111110B	;第 7 位（最右）
	END
