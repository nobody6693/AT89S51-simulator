;==== 4-7-2 計時器：七節顯示 00 → 59 每秒加 1，滿 60 歸零嗶兩聲 ===========
;
; 電路：4 位七節顯示器模組只用右邊兩位（課本圖「只用到 2 位」）
;   P0.7~P0.0 → a~dp；P2.0 → com0（最右位，個位）；P2.1 → com1（十位）
;   P3.7 → 蜂鳴器（主板）
;
; 原理：兩個計時器各管一件事，主程式什麼都不做（JMP $ 停滯）。
;   TIMER0（mode 1，16 位元）：計量 50000 → 每 50ms 溢位中斷一次，
;     中斷 20 次 = 1 秒 → 秒數 +1。重載值 = 65536-50000 = -50000（直接寫 -T0X）。
;   TIMER1（mode 1）：計量 5000 → 每 5ms 中斷一次，負責掃描七節：
;     SCANCODE=1 時顯示個位（送 ~1 = 11111110B 到 P2，P2.0 低），
;     SCANCODE=2 時顯示十位（送 ~2 = 11111101B，P2.1 低），兩位輪流。
;   模式 1 不會自動重載，所以每次中斷一進來要先把 TH/TL 填回去。
;   IE = 10001010B：EA + ET1 + ET0。TMOD = 00010001B：T1、T0 都是 mode 1。
;
; 秒數處理：個位 +1，到 10 進位；十位 +1，到 6 歸零並嗶兩聲（0~59 循環）
;;
SEGP	EQU	P0		;七節顯示信號
SCANP	EQU	P2		;七節掃描信號
BUZZER	EQU	P3.7		;蜂鳴器
SEC_COUNT	EQU	20		;TIMER0 中斷幾次算 1 秒
T0X	EQU	50000		;TIMER0 計量：50000us = 50ms
T1X	EQU	5000		;TIMER1 計量：5000us = 5ms
M1TH0	EQU	50H		;TIMER0 重載值暫存（高 8 位元）
M1TL0	EQU	51H		;（低 8 位元）
M1TH1	EQU	52H		;TIMER1 重載值暫存（高 8 位元）
M1TL1	EQU	53H		;（低 8 位元）
COUNTS	EQU	54H		;TIMER0 中斷次數
DIG0	EQU	55H		;個位數
DIG1	EQU	56H		;十位數
SCANCODE	EQU	57H		;現在掃到哪一位（1 = 個位、2 = 十位）
	ORG	0
	JMP	START
	ORG	0BH		;TIMER0 中斷向量
	JMP	TIMER
	ORG	1BH		;TIMER1 中斷向量
	JMP	SCAN
START:	MOV	SP,#30H		;堆疊搬離暫存器庫
	MOV	IE,#10001010B	;EA + ET1 + ET0
	MOV	TMOD,#00010001B	;T1 mode 1、T0 mode 1
	MOV	COUNTS,#0
	MOV	DIG0,#0		;個位初值
	MOV	DIG1,#0		;十位初值
	MOV	SCANCODE,#1	;先掃個位
	MOV	M1TH0,#HIGH(-T0X)	;算好 TIMER0 的重載值存起來（中斷裡要重複用）
	MOV	TH0,M1TH0
	MOV	M1TL0,#LOW(-T0X)
	MOV	TL0,M1TL0
	MOV	M1TH1,#HIGH(-T1X)	;TIMER1 同樣處理
	MOV	TH1,M1TH1
	MOV	M1TL1,#LOW(-T1X)
	MOV	TL1,M1TL1
	SETB	TR0		;啟動 TIMER0
	SETB	TR1		;啟動 TIMER1
	JMP	$		;主程式停在這裡，剩下的全靠中斷
;==== TIMER0 中斷副程式：每 50ms 一次 ======================
TIMER:	MOV	TH0,M1TH0	;重新裝填計量（mode 1 不會自動載入）
	MOV	TL0,M1TL0
	INC	COUNTS		;中斷次數 +1
	MOV	A,COUNTS
	CJNE	A,#SEC_COUNT,T0_0	;還不到 20 次（1 秒）就直接返回
	MOV	COUNTS,#0	;滿 1 秒：次數歸零
	INC	DIG0		;個位 +1
	MOV	A,DIG0
	CJNE	A,#10,T0_0	;沒到 10 就返回
	MOV	DIG0,#0		;個位進位：歸零
	INC	DIG1		;十位 +1
	MOV	A,DIG1
	CJNE	A,#6,T0_0	;沒到 6 就返回（最大 59）
	MOV	DIG1,#0		;60 秒：歸零
	MOV	R4,#2		;嗶兩聲（在中斷裡嗶，這 0.4 秒七節會暫停掃描）
	CALL	BEEP
T0_0:	RETI
;==== TIMER1 中斷副程式：每 5ms 掃一位 =====================
SCAN:	MOV	TH1,M1TH1	;重新裝填計量
	MOV	TL1,M1TL1
	MOV	SCANP,#0FFH	;先關掉掃描線（防殘影）
	MOV	A,SCANCODE
	CJNE	A,#1,SCAN_1	;不是 1 就去掃十位
	MOV	A,DIG0		;掃個位：取個位數
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR	;查七節顯示碼
	MOV	SEGP,A		;送到 P0
	MOV	A,SCANCODE	;掃描碼 = SCANCODE 反相：1 → 11111110B，P2.0 低
	CPL	A
	MOV	SCANP,A		;個位亮
	INC	SCANCODE	;下次掃十位
	JMP	T1_0
SCAN_1:	MOV	A,DIG1		;掃十位：取十位數
	MOV	DPTR,#CA_CODE
	MOVC	A,@A+DPTR
	MOV	SEGP,A
	MOV	A,SCANCODE	;2 → 11111101B，P2.1 低
	CPL	A
	MOV	SCANP,A		;十位亮
	MOV	SCANCODE,#1	;下次回到個位
T1_0:	RETI
;==== 延時副程式：R5 × 0.5ms ============================
DELAY500us:
D0:	MOV	R7,#250		;內迴圈 250 × 2us = 0.5ms
	DJNZ	R7,$
	DJNZ	R5,D0		;外迴圈 R5 次
	RET
;==== 嗶嗶聲副程式：R4 = 幾聲 ===========================
; 一聲 = 蜂鳴器 0/1 各 0.5ms 反覆 100 次（1kHz，響 0.1 秒），再靜音 0.1 秒
BEEP:	MOV	A,R4		;（課本原樣，A 其實沒用到）
BP1:	MOV	R3,#100		;一聲裡翻轉 100 次
BP0:	CLR	BUZZER		;蜂鳴器通電（PNP 低態導通）
	MOV	R5,#1
	CALL	DELAY500us	;0.5ms
	SETB	BUZZER		;斷電
	MOV	R5,#1
	CALL	DELAY500us	;0.5ms → 一個週期 1ms = 1kHz
	DJNZ	R3,BP0		;100 個週期 = 0.1 秒
	MOV	R5,#200		;靜音 200×0.5ms = 0.1 秒
	CALL	DELAY500us
	DJNZ	R4,BP1		;還沒嗶夠就再來一聲
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
	END
