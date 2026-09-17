;==== 照樂譜演奏，燈光與馬達跟著節奏一起律動，放完自動重來 ====
; 原譜是法國號(Horn in F)分譜，4/4、♩=162、全部斷奏(staccato)、ff。
; 法國號是移調樂器，記譜比實音高一個完全五度，這裡放的是**實音**，
; 也就是在譜軟體上按播放會聽到的音高。
;
; 八個小節的音(左邊記譜、右邊實音)：
;   第1小節  C6   C#5  C5   Db4                     四分音符 ×4
;            F5   F#4  F4   Gb3
;   第2小節  C4  C5  Db4 C4 | Db4  Bb4              八分×4 + 四分×2
;            F3  F4  Gb3 F3 | Gb3  Eb4
;   第3、5小節同第1；第4、6小節同第2
;   第7小節  C6 C6 C#5 C#5 C5 C5 Db4 Db4            八分音符 ×8
;   第8小節  C4 C5 Db4 C4 | Db4 | Bb4 Bb4           八分×4 + 四分 + 八分×2
;
; 音高只有 C / C# / Db / Bb 四種音名，靠八度亂跳製造效果。
; 節拍：♩=162 → 四分音符 370ms、八分音符 185ms。
; 斷奏 = 前半有聲、後半靜音，所以每個音都拆成「響一半、靜一半」。
; 燈和馬達也跟著這個「一半一半」走 —— 有聲就亮就轉，靜音就暗就停，
; 所以整塊板子會跟著節拍一頓一頓地閃。
;
; 三件事同時在跑：
;   音高   Timer0 中斷翻轉 P3.7 產生方波
;   節拍   Timer1 輪詢計時(不能用 DJNZ 數迴圈，會被密集的中斷拖慢)
;   燈光   每 1ms 掃描一位，8ms 掃完一輪 → 更新率 125Hz，看不出閃爍
;
; 要接的線(載入這個範例時模擬器會自動接好)：
;   P0     七段 段選 a~dp (JP3)      低態亮
;   P1     LED 陣列 列線 R1~R8 (JP6)  低態亮 —— 同時就是主板那 8 顆 LED
;   P2     位選 X0~X7 (JP4)           低態選中，七段與陣列共用
;   P3.3~P3.6  步進馬達 S0~S3 (JP7)   高態通電(經 ULN2803A)
;   P3.7   蜂鳴器
; 注意：段線接在 P0，指撥開關 SW1 也在 P0。SW1 要全部撥 OFF，
;       不然被撥下去的那一位會把段線拉低，八位數上都會多亮一段。
Buzzer	EQU	P3.7		;設定蜂鳴器位址
RELD_H	EQU	30H		;目前這個音的 Timer0 重載值(高位元組)
RELD_L	EQU	31H		;                          (低位元組)
BARPAT	EQU	32H		;燈條圖樣(低態亮)：陣列列線＋主板 8 顆 LED
SEGPAT	EQU	33H		;七段轉圈動畫目前亮哪一段
DIGSEL	EQU	34H		;位選圖樣：八個位元只有一個 0，每 1ms 轉一格
STEPIX	EQU	35H		;馬達相位 0~3
DARK	EQU	36H		;非 0 = 斷奏的靜音段：燈全暗、馬達停
MDIR	EQU	37H		;馬達方向：0 = 正轉，非 0 = 反轉
;==== 中斷向量 =======================================
	ORG	0
	JMP	START
	ORG	0BH		;Timer0 溢位
	JMP	T0ISR
;==== 主程式 =========================================
	ORG	30H
START:	MOV	SP,#5FH
	SETB	Buzzer		;蜂鳴器初始狀態(不響)
	MOV	P0,#0FFH	;段線全滅
	MOV	P1,#0FFH	;LED 全滅
	MOV	P2,#0FFH	;位選全部不選
	MOV	TMOD,#11H	;T0、T1 都用模式 1(16 位元)
	MOV	DIGSEL,#0FEH	;從第 0 位開始掃
	MOV	SEGPAT,#0FEH	;轉圈動畫從 a 段開始
	MOV	BARPAT,#0FFH
	MOV	STEPIX,#0
	MOV	MDIR,#0
	MOV	DARK,#1
	SETB	ET0		;開 Timer0 中斷(負責音高)
	SETB	EA
REPLAY:	MOV	R4,#HIGH(SONG)	;樂譜指標放 R4:R5，DPTR 要留給各種查表
	MOV	R5,#LOW(SONG)
NEXT:	MOV	DPH,R4
	MOV	DPL,R5
	CLR	A
	MOVC	A,@A+DPTR	;取音高代號
	JZ	REPLAY		;0 = 曲終，從頭再來
	MOV	R0,A
	MOV	A,#1
	MOVC	A,@A+DPTR	;取音長(1 = 八分音符, 2 = 四分音符)
	MOV	R1,A
	MOV	A,R5		;樂譜指標前進兩個位元組
	ADD	A,#2
	MOV	R5,A
	CLR	A
	ADDC	A,R4
	MOV	R4,A
	CALL	PLAY
	JMP	NEXT
;==== 奏一個音：R0 = 音高代號(1~6)，R1 = 音長 ========
PLAY:	MOV	A,R0
	DEC	A
	MOV	R2,A		;R2 = 代號-1，等一下要用兩次
	RL	A		;音高表每個音兩個位元組
	MOV	DPTR,#TONES
	MOVC	A,@A+DPTR
	MOV	RELD_H,A
	MOV	A,R2
	RL	A
	INC	A
	MOV	DPTR,#TONES
	MOVC	A,@A+DPTR
	MOV	RELD_L,A
	MOV	A,R2		;燈條長度：音愈高條愈長
	MOV	DPTR,#BARS
	MOVC	A,@A+DPTR
	MOV	BARPAT,A
	MOV	MDIR,#1		;馬達方向：低音(代號 4~6)反轉
	MOV	A,R0
	CJNE	A,#4,PL1	;比大小，C=1 表示代號 < 4
PL1:	JNC	PL2
	MOV	MDIR,#0		;高音(代號 1~3)正轉
PL2:	MOV	TH0,RELD_H
	MOV	TL0,RELD_L
	MOV	DARK,#0		;開始：有聲、燈亮、馬達轉
	SETB	TR0
	MOV	A,R1
	DEC	A
	JNZ	PLAYQ
	MOV	R7,#92		;八分音符：響 92ms
	CALL	DELAY
	CALL	HUSH
	MOV	R7,#93		;          靜 93ms
	CALL	DELAY
	RET
PLAYQ:	MOV	R7,#185		;四分音符：響 185ms
	CALL	DELAY
	CALL	HUSH
	MOV	R7,#185		;          靜 185ms
	CALL	DELAY
	RET
;==== 收聲：燈也一起暗下來 ==========================
HUSH:	CLR	TR0		;停掉計時器，腳位就不再翻轉
	CLR	TF0		;丟掉可能還掛著的溢位旗標
	SETB	Buzzer		;停在高態(不響)
	MOV	DARK,#1		;燈全暗、馬達停
	RET
;==== 延遲 R7 毫秒，順便每 1ms 掃描一次顯示 =========
DELAY:	MOV	TH1,#HIGH(65536-1000)
	MOV	TL1,#LOW(65536-1000)
	CLR	TF1
	SETB	TR1
DLY1:	JNB	TF1,$		;等這 1ms 走完
	CLR	TF1
	MOV	TH1,#HIGH(65536-1000)	;模式 1 不會自動重載
	MOV	TL1,#LOW(65536-1000)
	CALL	SCAN
	DJNZ	R7,DLY1
	CLR	TR1
	RET
;==== 每 1ms：點亮下一位 ============================
; 七段與 LED 陣列共用位選線，一次只能點一位，
; 靠 125Hz 的更新率讓眼睛看成一整排都亮著。
SCAN:	MOV	P2,#0FFH	;先全部不選，避免上一位的殘影
	MOV	A,DARK
	JZ	SCLIT
	MOV	P1,#0FFH	;靜音段：主板 LED 也要真的滅掉
	MOV	P0,#0FFH
	RET			;位選維持全不選 → 七段與陣列都不亮
SCLIT:	MOV	P1,BARPAT	;陣列列線，同時就是主板那 8 顆 LED
	MOV	P0,SEGPAT	;七段段選
	MOV	A,DIGSEL
	RL	A
	MOV	DIGSEL,A
	MOV	P2,A		;選中這一位
	CJNE	A,#0FEH,SC9	;轉回第 0 位 = 剛掃完一輪(8ms)
	CALL	FRAME
SC9:	RET
;==== 掃完一輪(8ms)：七段轉一格、馬達走一步 =========
FRAME:	MOV	A,SEGPAT	;a→b→c→d→e→f 繞著外圈跑
	RL	A
	CJNE	A,#0BFH,FR1	;轉到中間的 g 段就跳回 a 段
	MOV	A,#0FEH
FR1:	MOV	SEGPAT,A
	MOV	A,STEPIX	;馬達走一個全步(1.8 度)
	MOV	DPTR,#STEPS
	MOVC	A,@A+DPTR
	ANL	P3,#10000111B	;只清 P3.3~P3.6，蜂鳴器與 LCM 那幾腳不動
	ORL	P3,A
	MOV	A,MDIR
	JNZ	FR2
	INC	STEPIX		;正轉
	SJMP	FR3
FR2:	DEC	STEPIX		;反轉
FR3:	MOV	A,STEPIX
	ANL	A,#3		;相位只有 0~3
	MOV	STEPIX,A
	RET
;==== Timer0 中斷：翻轉蜂鳴器腳位 ====================
; 沒有動到 A 和 PSW，所以不必 PUSH。
T0ISR:	MOV	TH0,RELD_H	;模式 1 不會自動重載
	MOV	TL0,RELD_L
	CPL	Buzzer
	RETI
;==== 音高表：Timer0 的重載值 ========================
; 12MHz → 1 個計數 = 1us。每次中斷翻轉一次，所以要數的是**半週期**：
;   半週期us = 500000 / 頻率
;   重載值   = 65536 - 半週期us + 9
; 那個 +9 是中斷反應到重新裝填之間會被吃掉的機械週期，補回來音才準。
TONES:	DB	0FDH,03DH	;1 = F5   698.5Hz  半週期 716us   (記譜 C6)
	DB	0FAH,0C2H	;2 = F#4  370.0Hz  半週期 1351us  (記譜 C#5)
	DB	0FAH,071H	;3 = F4   349.2Hz  半週期 1432us  (記譜 C5)
	DB	0F5H,07AH	;4 = Gb3  185.0Hz  半週期 2703us  (記譜 Db4)
	DB	0F4H,0D9H	;5 = F3   174.6Hz  半週期 2864us  (記譜 C4)
	DB	0F9H,0C2H	;6 = Eb4  311.1Hz  半週期 1607us  (記譜 Bb4)
;==== 燈條圖樣：音愈高條愈長(低態亮) ================
; 八行都用同一個圖樣，所以 LED 陣列上是一條橫帶，
; 而主板 P1 那 8 顆 LED 因為整輪掃描都維持同一個值，會是清楚的一條不閃。
BARS:	DB	000H		;1 = F5   八格全亮
	DB	0C0H		;2 = F#4  六格
	DB	0E0H		;3 = F4   五格
	DB	0FCH		;4 = Gb3  兩格
	DB	0FEH		;5 = F3   一格
	DB	0F8H		;6 = Eb4  三格
;==== 馬達全步相位(S0~S3 在 P3.3~P3.6，高態通電) ====
STEPS:	DB	050H		;A1+B1
	DB	030H		;B1+A2
	DB	028H		;A2+B2
	DB	048H		;B2+A1
;==== 樂譜 ===========================================
; 每個音兩個位元組：音高代號、音長(1 = 八分音符, 2 = 四分音符)
SONG:	DB	1,2, 2,2, 3,2, 4,2			;第 1 小節
	DB	5,1, 3,1, 4,1, 5,1, 4,2, 6,2		;第 2 小節
	DB	1,2, 2,2, 3,2, 4,2			;第 3 小節(同第 1)
	DB	5,1, 3,1, 4,1, 5,1, 4,2, 6,2		;第 4 小節(同第 2)
	DB	1,2, 2,2, 3,2, 4,2			;第 5 小節(同第 1)
	DB	5,1, 3,1, 4,1, 5,1, 4,2, 6,2		;第 6 小節(同第 2)
	DB	1,1, 1,1, 2,1, 2,1, 3,1, 3,1, 4,1, 4,1	;第 7 小節
	DB	5,1, 3,1, 4,1, 5,1, 4,2, 6,1, 6,1	;第 8 小節
	DB	0					;曲終 → 從頭再來
	END
