;==== 5-4-3 思考題：單機自傳改用 Mode 2 ====
;
; 思考題要求：
; 範例採 Mode 1 傳輸，請試著改用 Mode 2、Mode 3 的工作模式。（Mode 3 是另一個檔）
;
; Mode 2 是 11 位元格式：起始 + 8 位資料 + 第 9 位（傳出取自 TB8、收到放進 RB8）+ 停止。
; 鮑率固定：SMOD=1 時 OSC/32 = 375000bps，一位約 2.67us，一筆 11 位元約 29us。不用 Timer 1。
;
; 怎麼從範例（CH5-4-3 單機自傳）改成這一題：
; 1. SCON 改 10010000B（SM0=1、SM1=0 是 Mode 2）。
; 2. 拿掉 TMOD、TH1、SETB TR1 三行，鮑率不靠 Timer 1。ORL PCON 留著（SMOD=1 才是 OSC/32）。
; 其他都不用動。RI 在第 9 位的中央就起來了，這時傳方還有半個第 9 位和一個停止位元沒送完（約 4us），
; 而程式從 RI 到下一次 MOV SBUF 要 9us，等它繞回來已經送完了，所以不必等 TI（Mode 3 就要，見那一題）。
; 電路、接線與原理都跟範例相同，請先看範例檔頭的說明；改過的地方在程式裡用【改】【加】標出來。
;
DIPSW	EQU	P0		;指撥開關輸入埠
LED	EQU	P1		;LED 輸出埠
;========================================
	ORG	0		;程式從 0 位址開始
START:	MOV	SCON,#10010000B	;【改】設定為 mode 2、REN=1、RI=0
;====b7===b6===b5===b4===b3===b2===b1===b0===
;===SM0==SM1==SM2==REN==TB8==RB8===TI===RI===
;=====1====0====0====1====0====0====0====0===
	; 【改】Mode 2 不用 Timer 1，只留 SMOD
	ORL	PCON,#80H	;將 SMOD 設定為 1，鮑率 = OSC/32 = 375000bps
	MOV	DIPSW,#0FFH	;將 P0 設定為輸入功能
LOOP:	MOV	A,DIPSW		;讀取指撥開關狀態
	MOV	SBUF,A		;啟動串列埠
	JNB	RI,$		;檢查是否完成接收？完成接收，則 RI 串列輸入中斷
	CLR	RI		;清除 RI 旗標
	MOV	LED,SBUF	;將所接收的資料輸出到 LED
	CLR	TI		;清除 TI 旗標
	JMP	LOOP		;跳至 LOOP 形成一個迴圈
	END
