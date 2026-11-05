;==== 5-4-3 單機自傳：TxD 接回自己的 RxD，P0 開關繞一圈到 P1 的 LED ====
;
; 電路：89S51 第 10 腳 RxD (P3.0) 與第 11 腳 TxD (P3.1) 短路（模擬器載入範例時會自動短路）
;   P0 = 主板指撥開關（ON 讀 0）、P1 = 主板 LED（低態亮）
;
; 原理：Mode 1 是 10 位元的非同步格式：起始位元 0 + 8 位資料（D0 先送）+ 停止位元 1。
;   SBUF 其實是兩個暫存器：寫入的是傳出緩衝、讀出的是接收緩衝，傳與收可以同時進行。
;   開關的值送出去，又從自己的 RxD 收回來，放到 LED，所以開關 ON 的那顆 LED 會亮。
;
; 鮑率：12MHz 時 Timer 1 每 1us 加 1，mode 2 自動重載。
;   TH1 = 0F3H → 每 256-243 = 13us 溢位一次；SMOD=1 時溢位 16 次送一位 → 一位 208us → 4808bps（課本表 3 的 4800）
;   一筆 10 位元約 2.08ms，所以撥開關約 2~4ms 後 LED 反應。
;
; 流程：讀開關 → 寫 SBUF 開始傳 → 等 RI（收回來了）→ 清 RI → SBUF 送 LED → 清 TI → 再來
;
DIPSW	EQU	P0		;指撥開關輸入埠
LED	EQU	P1		;LED 輸出埠
;========================================
	ORG	0		;程式從 0 位址開始
START:	MOV	SCON,#01010000B	;設定為 mode 1、REN=1、RI=0
;====b7===b6===b5===b4===b3===b2===b1===b0===
;===SM0==SM1==SM2==REN==TB8==RB8===TI===RI===
;=====0====1====0====1====0====0====0====0===
	; 產生鮑率
	MOV	TMOD,#20H	;將 Timer 1 設定 Mode 2（8 位元自動重載）
	ORL	PCON,#80H	;將 SMOD 設定為 1
	MOV	TH1,#0F3H	;鮑率設定為 4800bps
	SETB	TR1		;啟動 Timer 1
	MOV	DIPSW,#0FFH	;將 P0 設定為輸入功能
LOOP:	MOV	A,DIPSW		;讀取指撥開關狀態
	MOV	SBUF,A		;啟動串列埠
	JNB	RI,$		;檢查是否完成接收？完成接收，則 RI 串列輸入中斷
	CLR	RI		;清除 RI 旗標
	MOV	LED,SBUF	;將所接收的資料輸出到 LED
	CLR	TI		;清除 TI 旗標
	JMP	LOOP		;跳至 LOOP 形成一個迴圈
	END
