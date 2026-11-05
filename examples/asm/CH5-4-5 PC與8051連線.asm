;==== 5-4-5 PC 與 8051 連線：開關傳給 PC，PC 傳的資料顯示在 LED ====
;
; 電路：P3.0、P3.1 經 MAX232A 轉成 RS-232 電位，接到個人電腦的 COM 埠。
;   模擬器沒有真的 COM 埠：載入範例後，板子下方「串列埠外接」就是課本的 PC_RS232 視窗，
;   可以看 PC 收到什麼、也可以從 PC 傳資料給 8051。PC 端鮑率要設 4800（課本 Step 4）。
;
; 程式：課本說跟 5-4-3 單機自傳一樣（CH5-4-3.HEX 直接燒），一個位元組都沒改。
;   差別只在 TxD、RxD 不再短路，而是接到 PC：
;     傳出：開關的值 → SBUF → PC 接收欄位
;     接收：PC 傳出欄位 → RxD → RI → SBUF → LED
;
; 鮑率：Mode 1，TH1 = 0F3H、SMOD=1 → 4808bps，跟 PC 的 4800 只差 0.16%，收得到。
;
; 注意流程：程式送完一筆就停在 JNB RI,$ 等 PC 傳東西來，所以開機只會先送一次開關，
;   之後 PC 每傳一筆才會再回傳一次。要看開關即時反應，就讓 PC 連續傳（視窗裡有「連續傳送」）。
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
