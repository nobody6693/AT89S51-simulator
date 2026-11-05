;==== 5-4-4 思考題（第一塊）：P2.0 切換對方 LED，收到命令就跑一輪單燈 ====
;
; 思考題要求（課本 5-36 頁）：
;   第一塊的 P2.0 是 on/off 切換開關：第二塊 LED 不亮時按一下 → 第二塊 LED 全亮；再按一下 → 全滅。
;   第二塊的 P2.0、P2.1 是開關：按第二塊的 P2.0 → 第一塊 LED 單燈左移；按第二塊的 P2.1 → 第一塊 LED 單燈右移。
;   （課本第二點後半印成「第二塊的 LED 呈現單燈右移」，但題目前面寫第二塊的開關控制第一塊的 LED，這裡照第一塊做。）
;
; 兩塊要燒不同的程式，所以有兩個檔；載入哪一個，另一個就自動燒到第二塊板子上：
;   CH5-4-4T 第一塊P20控制對方LED.asm、CH5-4-4T 第二塊P20P21控制對方移位.asm
; P2.0、P2.1 就是主板的按鈕 PB3、PB4（按下讀 0）。
; 「左移、右移」以板子上看到的方向為準：P1.0 在最左邊，所以往左是 RR A、往右是 RL A，跟指令名稱相反。
;
; 跟範例的關係：串列埠設定一樣（Mode 2、SMOD=1、375000bps），主迴圈一樣是輪流看旗標。
;   其他是重寫的，不是小改：範例一直傳開關，這一題只在該傳的時候傳，而且要多算時間。
;   時間用 Timer 0 mode 1：計量 10000us，重載值 65536-10000 = 55536 = D8F0H，不開中斷，主迴圈看 TF0。
;
; 這一塊做兩件事，都掛在主迴圈上，互不卡住：
; 1. 每 10ms 看一次 P2.0。上次放開、這次按下才算按一下（順便防彈跳），切換 ALLON，
;    傳 00H（全亮）或 0FFH（全滅）給第二塊，第二塊直接放到 P1。
; 2. 收到命令：1 = 左移，從 P1.7（7FH）開始 RR A；2 = 右移，從 P1.0（FEH）開始 RL A。
;    每格 200ms（10ms × 20），8 個位置走完就熄滅。還在跑的時候再收到命令就忽略，
;    所以第二塊按著不放會每 10ms 傳一次命令，但要等這一輪跑完才會開始下一輪：
;    點一下跑一輪，按住才重複。
; R2 = 目前樣板、R3 = 200ms 倒數（單位 10ms）、R4 = 方向、R5 = 這一輪還剩幾個位置（0 = 沒在跑）。
;
LED	EQU	P1		;LED 輸出埠
BTN	EQU	P2.0		;切換開關，就是主板的 PB3
LASTBTN	BIT	00H		;開關上一次的狀態（1 = 放開）
ALLON	BIT	01H		;第二塊現在是不是全亮
;========================================
	ORG	0		;程式從 0 位址開始
START:	MOV	SCON,#10010000B	;設定為 Mode 2、REN=1、RI=0
;====b7===b6===b5===b4===b3===b2===b1===b0===
;===SM0==SM1==SM2==REN==TB8==RB8===TI===RI===
;=====1====0====0====1====0====0====0====0===
	ORL	PCON,#80H	;將 SMOD 設定為 1，鮑率 = OSC/32 = 375000bps
	MOV	TMOD,#01H	;Timer 0 設為 mode 1（16 位元）
	MOV	TH0,#0D8H	;計量 10000us：重載值 D8F0H 的高 8 位元
	MOV	TL0,#0F0H	;低 8 位元
	SETB	TR0		;啟動 Timer 0
	MOV	LED,#0FFH	;LED 全滅
	MOV	R3,#20		;200ms 倒數：20 × 10ms
	MOV	R4,#0		;還沒有方向
	MOV	R5,#0		;0 = 現在沒在跑
	SETB	LASTBTN		;開機當作開關是放開的
	CLR	ALLON		;第二塊一開始不亮，第一次按要送全亮
LOOP:	JBC	RI,RECEIVED	;第二塊傳命令來了？JBC 順便把 RI 清掉
	JBC	TF0,TICK	;10ms 到了？JBC 順便把 TF0 清掉
	JMP	LOOP		;都沒有就繼續看
;=== 收到第二塊的命令 ==================================
RECEIVED:
	MOV	A,SBUF		;讀命令
	CJNE	R5,#0,LOOP	;還在跑：跑到一半的命令忽略
	CJNE	A,#1,NOTLEFT	;不是 1，看看是不是 2
	MOV	R4,#1		;方向 = 左移
	MOV	R2,#7FH		;從最右邊的 P1.7 開始（01111111）
	JMP	RUN		;開始這一輪
NOTLEFT:
	CJNE	A,#2,LOOP	;也不是 2：不認識的命令不理它
	MOV	R4,#2		;方向 = 右移
	MOV	R2,#0FEH	;從最左邊的 P1.0 開始（11111110）
RUN:	MOV	R5,#8		;這一輪要走 8 個位置
	MOV	R3,#20		;第一格也停滿 200ms
	MOV	LED,R2		;馬上亮第一顆
	JMP	LOOP		;回主迴圈
;=== 每 10ms 一次：看開關、算時間 ======================
TICK:	MOV	TH0,#0D8H	;mode 1 不會自動重載，填回計量
	MOV	TL0,#0F0H	;
	MOV	C,BTN		;讀開關（C = 1 是放開）
	JC	SAVE		;放開：記下來就好
	JNB	LASTBTN,SAVE	;上次就按著了：不重複送
	CPL	ALLON		;這次才是剛按下去：切換
	MOV	A,#0FFH		;先當作要全滅
	JNB	ALLON,SEND	;切換後不是全亮，就送 0FFH
	MOV	A,#00H		;切換後是全亮，改送 00H
SEND:	CLR	TI		;這題不看 TI，傳之前清掉
	MOV	SBUF,A		;傳給第二塊，它會直接放到 P1
	CLR	C		;CJNE、SBUF 都沒動到 C，這裡明確記成「按著」
SAVE:	MOV	LASTBTN,C	;記下這次的開關狀態
	CJNE	R5,#0,RUNNING	;這一輪還在跑就去算時間
	JMP	LOOP		;沒在跑：回主迴圈
RUNNING:
	DJNZ	R3,LOOP		;還不到 200ms
	MOV	R3,#20		;重新倒數
	DJNZ	R5,SHIFT	;還有下一個位置就移一格
	MOV	LED,#0FFH	;8 個位置走完：熄滅
	JMP	LOOP		;回主迴圈，可以接下一個命令了
SHIFT:	MOV	A,R2		;取出目前樣板
	CJNE	R4,#1,GORIGHT	;不是左移就是右移
	RR	A		;往低位元走 = 板子上左移一格
	JMP	STORE		;
GORIGHT:
	RL	A		;往高位元走 = 板子上右移一格
STORE:	MOV	R2,A		;記下新樣板
	MOV	LED,A		;輸出
	JMP	LOOP		;回主迴圈
	END
