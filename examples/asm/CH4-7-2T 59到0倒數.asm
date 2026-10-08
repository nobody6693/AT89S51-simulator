;==== 4-7-2 思考題：59 → 0 倒數 ====
;
; 思考題要求：
; 課本是 0 到 59 正數，改成 59 到 0 倒數，數到 0 之後嗶兩聲再回到 59。
;
; 怎麼從範例（CH4-7-2 計時器0到59秒）改成這一題：
; 倒數只是把正數「反過來做」，改的地方一一對應：
; 1. 初值：個位 0 → 9、十位 0 → 5（從 59 開始）。
; 2. 加 1 改減 1：INC DIG0 → DEC DIG0，INC DIG1 → DEC DIG1。
; 3. 進位改借位：正數是「加到 10 就進位」，倒數是「減到 0 再減 1，變成 0FFH 就借位」，
;    所以 CJNE A,#10 → CJNE A,#0FFH；借位後個位回到 9（原本歸零），
;    十位同理 CJNE A,#6 → CJNE A,#0FFH，借位後回到 5（原本歸零）。
; 4. 十位借位也發生，就是 00 倒數完了，回到 59 並嗶兩聲（嗶聲那兩行不用動）。
; TIMER0/TIMER1 的設定、掃描、嗶聲、七節顯示碼都沒動。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
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
	MOV	DIG0,#9		;【改】個位初值 0 → 9
	MOV	DIG1,#5		;【改】十位初值 0 → 5：從 59 開始
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
	DEC	DIG0		;【改】INC → DEC：個位 -1
	MOV	A,DIG0
	CJNE	A,#0FFH,T0_0	;【改】原本比 10：0 再減 1 會變成 0FFH（借位），不是就返回
	MOV	DIG0,#9		;【改】原本歸零：借位後個位回到 9
	DEC	DIG1		;【改】INC → DEC：十位 -1
	MOV	A,DIG1
	CJNE	A,#0FFH,T0_0	;【改】原本比 6：十位借不到位就返回
	MOV	DIG1,#5		;【改】原本歸零：00 之後回到 59
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
