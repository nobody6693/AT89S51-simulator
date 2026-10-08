;==== 4-7-3 思考題：改成 12 小時制 ====
;
; 思考題要求：
; 把時鐘改成 12 小時制：從 12-00-00 開始，12 點 59 分 59 秒之後變 01-00-00（沒有 00 時，也沒有 13 時）。
;
; 怎麼從範例（CH4-7-3 時鐘24小時制）改成這一題：
; 原本 24 小時制是「時個位加到 4、而且十位是 2（= 24 時）就歸零」，12 小時制只是換掉判斷的數字：
; 1. 初值：時個位 H0 = 0 → 2、時十位 H1 = 0 → 1（從 12 時開始）。
; 2. 加 1 之後判斷「是不是 13 時」：個位 CJNE A,#4 → #3；十位 CJNE A,#2 → #1。
; 3. 13 時要回到 1 時，不是 0 時：MOV H0,#0 → MOV H0,#1（時十位仍是 0）。
;    其餘進位（09 → 10）照原本的 T0_1 處理，一行都不用改。
; TIMER 的秒、分進位，SCAN 掃描、七節顯示碼都沒動。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
SEGP	EQU	P0		;七節顯示信號
SCANP	EQU	P2		;七節掃描信號
SEC_COUNT	EQU	20		;TIMER0 中斷 20 次 = 1 秒
T0X	EQU	50000		;TIMER0 計量 50ms
T1X	EQU	1500		;TIMER1 計量 1.5ms（8 位一圈 12ms）
M1TH0	EQU	50H		;TIMER0 重載值暫存
M1TL0	EQU	51H
M1TH1	EQU	52H		;TIMER1 重載值暫存
M1TL1	EQU	53H
COUNTS	EQU	54H		;TIMER0 中斷次數
S0	EQU	60H		;秒個位（最右位）
S1	EQU	61H		;秒十位
D0	EQU	62H		;分隔號 -
M0	EQU	63H		;分個位
M1	EQU	64H		;分十位
D1	EQU	65H		;分隔號 -
H0	EQU	66H		;時個位
H1	EQU	67H		;時十位（最左位）
SCANCODE	EQU	68H		;掃描指標 0~7（0 = 最右位）
	ORG	0
	JMP	START
	ORG	0BH		;TIMER0 中斷向量
	JMP	TIMER
	ORG	1BH		;TIMER1 中斷向量
	JMP	SCAN
START:	MOV	SP,#30H		;堆疊搬離暫存器庫
	MOV	IE,#10001010B	;EA + ET1 + ET0
	MOV	TMOD,#00010001B	;T1、T0 都是 mode 1
	MOV	COUNTS,#0
	MOV	S0,#0		;秒 00
	MOV	S1,#0
	MOV	D0,#10		;分隔號（CA_CODE 第 10 筆 = -）
	MOV	M0,#0		;分 00
	MOV	M1,#0
	MOV	D1,#10		;分隔號
	MOV	H0,#2		;【改】時個位初值 0 → 2
	MOV	H1,#1		;【改】時十位初值 0 → 1：從 12 時開始
	MOV	SCANCODE,#0	;從最右位開始掃
	MOV	M1TH0,#HIGH(-T0X)	;TIMER0 重載值
	MOV	TH0,M1TH0
	MOV	M1TL0,#LOW(-T0X)
	MOV	TL0,M1TL0
	MOV	M1TH1,#HIGH(-T1X)	;TIMER1 重載值
	MOV	TH1,M1TH1
	MOV	M1TL1,#LOW(-T1X)
	MOV	TL1,M1TL1
	SETB	TR0		;啟動兩個計時器
	SETB	TR1
	JMP	$		;主程式停滯，全靠中斷
;==== TIMER0 中斷副程式：每 50ms，累積 20 次走 1 秒 ===========
TIMER:	MOV	TH0,M1TH0	;重新裝填
	MOV	TL0,M1TL0
	INC	COUNTS
	MOV	A,COUNTS
	CJNE	A,#SEC_COUNT,T0_0	;還沒滿 1 秒
	MOV	COUNTS,#0
	INC	S0		;秒個位 +1
	MOV	A,S0
	CJNE	A,#10,T0_0	;沒到 10 就返回
	MOV	S0,#0		;秒個位進位
	INC	S1		;秒十位 +1
	MOV	A,S1
	CJNE	A,#6,T0_0	;沒到 60 秒就返回
	MOV	S1,#0		;60 秒 → 分 +1
	INC	M0		;分個位 +1
	MOV	A,M0
	CJNE	A,#10,T0_0
	MOV	M0,#0		;分個位進位
	INC	M1		;分十位 +1
	MOV	A,M1
	CJNE	A,#6,T0_0	;沒到 60 分就返回
	MOV	M1,#0		;60 分 → 時 +1
	INC	H0		;時個位 +1
	MOV	A,H0
	CJNE	A,#3,T0_1	;【改】4 → 3：個位不是 3 → 去看要不要進位
	MOV	A,H1		;個位是 3：十位是 1 嗎？（13 時）
	CJNE	A,#1,T0_0	;【改】2 → 1：不是 13 就返回
	MOV	H0,#1		;【改】13:00 → 01:00（原本 24:00 → 00:00，歸零改成 1）
	MOV	H1,#0
	JMP	T0_0
T0_1:	CJNE	A,#10,T0_0	;個位沒到 10 就返回
	MOV	H0,#0		;時個位進位
	INC	H1		;時十位 +1
T0_0:	RETI
;==== TIMER1 中斷副程式：每 1.5ms 掃一位 ====================
SCAN:	MOV	TH1,M1TH1	;重新裝填
	MOV	TL1,M1TL1
	MOV	SCANP,#0FFH	;關掉掃描線，防殘影
	MOV	A,SCANCODE	;0~7
	ADD	A,#60H		;顯示緩衝區位址 = 60H + 掃描指標
	MOV	R0,A
	MOV	A,@R0		;取出這一位要顯示的數（0~9 或 10 = -）
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR	;查七節顯示碼
	MOV	SEGP,A		;送到 P0
	MOV	DPTR,#SCAN_CODE
	MOV	A,SCANCODE
	MOVC	A,@A+DPTR	;查掃描碼
	MOV	SCANP,A		;這一位亮
	INC	SCANCODE	;下一位
	MOV	A,SCANCODE
	CJNE	A,#8,T1_0	;還沒掃完 8 位
	MOV	SCANCODE,#0	;掃完一圈，回到最右位
T1_0:	RETI
;==== 掃描碼：由最右位開始 ================================
SCAN_CODE:
	DB	11111110B	;0：P2.0 最右位（秒個位）
	DB	11111101B	;1：P2.1
	DB	11111011B	;2：P2.2
	DB	11110111B	;3：P2.3
	DB	11101111B	;4：P2.4
	DB	11011111B	;5：P2.5
	DB	10111111B	;6：P2.6
	DB	01111111B	;7：P2.7 最左位（時十位）
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
	DB	11111101B	;10 = 分隔號「-」：只亮 g
	END
