;==== 3-7-5 思考題：A 鍵 LED 全亮、B 鍵全暗、C 鍵清成 0 ====
;
; 思考題要求：
; 1. 按 0~9：照常把數字推進顯示緩衝區  2. 按 A：PORT 1 的 LED 全亮（低態亮，寫 0）
; 3. 按 B：PORT 1 的 LED 全暗（寫 0FFH）  4. 按 C：DIG3~DIG1 暗、DIG0 顯示 0（回到開機畫面）
; D E F 沒指定功能，當作沒按。
;
; 怎麼從範例（CH3-7-5 4x4鍵盤與4位七節）改成這一題：
; 只在「算出鍵值之後、顯示緩衝區左移之前」插入一小段，原有的程式一行都不動：
; 1. 算出鍵值時 A 裡就是鍵值（MOV KEYCODE,A 剛執行完），拿 A 依序比對 0AH、0BH、0CH。
; 2. 是 A 鍵 → MOV P1,#0；是 B 鍵 → MOV P1,#0FFH；是 C 鍵 → 把顯示緩衝區設回開機狀態。
;    處理完都 JMP CHECK（等放開按鍵），不要往下走去推緩衝區，不然 A、B、C 也會被當數字顯示。
; 3. 比完 0CH 還沒跳走時，CJNE 會順便設 CY（A < 0CH 則 CY=1），所以用 JNC 把 D E F（鍵值 ≥ 13）也擋掉；
;    剩下的就是 0~9，繼續往下照原本的流程左移、放入緩衝區。
; 其餘一行都沒動，0~9 就走原本的流程。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
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
;---- 【加】思考題新增的部分（從這裡開始）------------------------------
	CJNE	A,#0AH,KA1	;是 A 鍵嗎？
	MOV	P1,#0		;是：LED 全亮
	JMP	CHECK		;等放開按鍵，不要往下推緩衝區
KA1:	CJNE	A,#0BH,KB1	;是 B 鍵嗎？
	MOV	P1,#0FFH	;是：LED 全暗
	JMP	CHECK
KB1:	CJNE	A,#0CH,KC1	;是 C 鍵嗎？
	MOV	DIG3,#BLANK	;是：左三位全暗、最右位 0（回到開機畫面）
	MOV	DIG2,#BLANK
	MOV	DIG1,#BLANK
	MOV	DIG0,#0
	JMP	CHECK
KC1:	JNC	CHECK		;CY=0 → 鍵值 ≥ 13（D E F）→ 不處理
;---- 【加】新增部分結束，下面是範例原本的程式 ----------------------------
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
