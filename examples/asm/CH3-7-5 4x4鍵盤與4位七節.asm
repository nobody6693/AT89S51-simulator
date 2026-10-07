;==== 3-7-5 4x4 鍵盤組與 4 位七節顯示器：按什麼鍵就顯示什麼 ===========
;
; 電路：4 位七節顯示器 + 4x4 鍵盤，共用 P2
;   P0.7~P0.0 → 七節 a~dp
;   P2.7~P2.4 → 輸出：同時是七節的 com3~com0 和鍵盤的掃描線 X3~X0
;   P2.3~P2.0 → 輸入：鍵盤的讀回線 Y3~Y0（KT89S51 板上已有 10K 提升電阻）
;   鍵值 = 4×X + Y：X0 那一行是 0 1 2 3，X1 是 4 5 6 7，X2 是 8 9 A B，X3 是 C D E F
;
; 原理：一組掃描碼同時掃七節和鍵盤。
;   把第 COL 位的掃描碼送出去（只有一條 X 是 0），這時：
;     - 七節：第 COL 位亮，顯示緩衝區 DIG0~DIG3 裡對應的數字
;     - 鍵盤：如果這一行有鍵被按下，對應的 Y 線會被拉成 0
;   讀 P2 低四位元、反相、濾掉高四位元 → 0 表示沒按，0001/0010/0100/1000 表示第幾列被按
;   鍵值 = COL×4 + ROW（×4 用兩次 RL A 左移兩位）
;   按下後要等放開（CHECK 迴圈）才繼續，不然按一下會被當成按了很多次
;
; 顯示緩衝區：53H(DIG3 最左) 52H 51H 50H(DIG0 最右)
;   新按的鍵從右邊推進來，舊的往左擠，最左邊的掉出去（像計算機）
;   開機時左三位放 BLANK（全暗碼），最右位顯示 0
;
SEGP	EQU	P0		;七節顯示資料輸出埠
KEYP	EQU	P2		;掃描碼輸出埠（七節 com + 鍵盤 X），低四位元讀鍵盤 Y
DIGITS	EQU	4		;顯示位數 = 掃描行數
SCAN_TIME	EQU	1		;每位數停 0.5ms
BLANK	EQU	16		;CA_CODE 第 16 筆 = 全暗
KEYCODE	EQU	56H		;鍵值
COL	EQU	55H		;掃描指標（第幾行 X / 第幾位數）
ROW	EQU	54H		;列鍵值（第幾列 Y）
DIG3	EQU	53H		;顯示緩衝區最左位
DIG2	EQU	52H
DIG1	EQU	51H
DIG0	EQU	50H		;顯示緩衝區最右位
START:	MOV	DIG3,#BLANK	;左三位全暗
	MOV	DIG2,#BLANK
	MOV	DIG1,#BLANK
	MOV	DIG0,#0		;最右位先顯示 0
LOOP1:	MOV	KEYCODE,#0	;每掃一圈：鍵值、列鍵值、掃描指標都歸零
	MOV	ROW,#0
	MOV	COL,#0
LOOP0:	MOV	SEGP,#0FFH	;先把七節全關（防殘影）
	MOV	DPTR,#SCAN_CODE
	MOV	A,COL
	MOVC	A,@A+DPTR	;A = 第 COL 行的掃描碼（只有一條 X 是 0，Y 全部是 1）
	MOV	KEYP,A		;送到 P2：選位 + 掃鍵盤，低四位元寫 1 當輸入用
	MOV	A,#DIG0		;算這一位對應的顯示緩衝區位址
	ADD	A,COL		;DIG0 + COL（COL=0 → 50H 最右位，COL=3 → 53H 最左位）
	MOV	R0,A
	MOV	A,@R0		;取出要顯示的數字
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR	;查七節顯示碼
	MOV	SEGP,A		;送到 P0，這一位亮
	MOV	A,KEYP		;讀鍵盤：P2 低四位元是 Y3~Y0
	CPL	A		;反相：被按的那一列變成 1
	ANL	A,#0FH		;濾掉高四位元（掃描碼），只留 Y
	CJNE	A,#00000000B,ROW0	;不是 0 → 有鍵被按，去判斷哪一列
	JMP	NEXT		;沒有鍵：直接換下一位
ROW0:	CJNE	A,#00000001B,ROW1	;Y0 被拉低？
	MOV	ROW,#0		;第 0 列
	JMP	OK
ROW1:	CJNE	A,#00000010B,ROW2	;Y1？
	MOV	ROW,#1		;第 1 列
	JMP	OK
ROW2:	CJNE	A,#00000100B,ROW3	;Y2？
	MOV	ROW,#2		;第 2 列
	JMP	OK
ROW3:	CJNE	A,#00001000B,OK	;Y3？（兩鍵同時按就會不符，當作沒按）
	MOV	ROW,#3		;第 3 列
OK:	MOV	A,COL		;鍵值 = COL×4 + ROW
	RL	A		;×2
	RL	A		;×4
	ADD	A,ROW		;+ROW
	MOV	KEYCODE,A	;存鍵值
	MOV	DIG3,DIG2	;顯示緩衝區整體左移一位（最左的掉出去）
	MOV	DIG2,DIG1
	MOV	DIG1,DIG0
	MOV	DIG0,KEYCODE	;新鍵值放最右邊
CHECK:	MOV	A,KEYP		;等放開：再讀一次鍵盤
	CPL	A
	ANL	A,#0FH
	JNZ	CHECK		;還按著就繼續等（這段時間七節會暫停掃描）
NEXT:	MOV	R7,#SCAN_TIME
	CALL	DELAYx500us	;這一位停 0.5ms
	INC	COL		;下一行 / 下一位
	MOV	A,COL
	CJNE	A,#DIGITS,AGAIN	;四行還沒掃完
	JMP	LOOP1		;掃完一圈，從頭來
AGAIN:	JMP	LOOP0		;（CJNE 的相對跳躍跳不到 LOOP0，所以中繼一下）
;==== 延時副程式：R7 × 0.5ms ============================
; 12MHz 時鐘，一個機械週期 1us。DJNZ 佔 2 個週期，
; 內迴圈 250 次 × 2us = 500us，外迴圈 R7 次 → 總共 R7 × 0.5ms
DELAYx500us:
D1:	MOV	R6,#250		;內迴圈次數
	DJNZ	R6,$		;原地數 250 次 = 0.5ms
	DJNZ	R7,D1		;外迴圈數 R7 次
	RET
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
	DB	00000101B	;A(10)：a b c d e g
	DB	11000001B	;B(11)：c d e f g（小寫 b）
	DB	01100011B	;C(12)：a d e f
	DB	10000101B	;D(13)：b c d e g（小寫 d）
	DB	01100001B	;E(14)：a d e f g
	DB	01110001B	;F(15)：a e f g
	DB	11111111B	;BLANK(16)：全暗
;==== 鍵盤/七節共用的掃描碼：COL=0 → P2.4 (X0, com0 最右) … COL=3 → P2.7 ====
SCAN_CODE:
	DB	11101111B	;COL 0：X0 / 最右位
	DB	11011111B	;COL 1：X1
	DB	10111111B	;COL 2：X2
	DB	01111111B	;COL 3：X3 / 最左位
	END
