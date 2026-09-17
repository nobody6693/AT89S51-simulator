// 實體板排針：位置與腳序量自照片（890×449，原圖逆時針轉 90°），座標 = 照片像素。
// 電路圖的腳位編號方向與實體絲印相反，這裡一律照絲印順序排（詳見 docs/元件對照表.md）。
//
// pins[i] = [絲印, 訊號]
//   'Px.y'           埠腳位（板上焊死的也算，例如 JP2 的 D0 就是 P0.0）
//   'dev:<id>'       KDM+ 訊號腳，要拉線到埠才會動
//   'rail:gnd|vcc'   電源軌，可拉到任一支埠腳
//   'ctrl:RST|EA'    不是埠腳，但可以接電源軌
//   'jumper:<id>'    跳線帽，點一下開關
//   'out:<id>'       輸出腳，數值在面板上看
//   'fixed:<id>'     出廠就接好
//   'na:<原因>'      無法模擬

export const HEADERS = [
  // ================= 主板 KT89S51 V4.2 =================
  {
    id: 'JP3', side: 'main', title: 'JP3', cols: 2, x: 260, colGap: 10, y: 176, pitch: 9.47,
    labelSide: 'split',          // 左欄字在左、右欄字在右
    note: '四個埠全部拉到這裡，KDM+ 的排線也插這裡。',
    pins: [
      ['P1.0', 'P1.0'], ['VCC', 'rail:vcc'],
      ['P1.1', 'P1.1'], ['P0.0', 'P0.0'],
      ['P1.2', 'P1.2'], ['P0.1', 'P0.1'],
      ['P1.3', 'P1.3'], ['P0.2', 'P0.2'],
      ['P1.4', 'P1.4'], ['P0.3', 'P0.3'],
      ['P1.5', 'P1.5'], ['P0.4', 'P0.4'],
      ['P1.6', 'P1.6'], ['P0.5', 'P0.5'],
      ['P1.7', 'P1.7'], ['P0.6', 'P0.6'],
      ['RST', 'ctrl:RST'], ['P0.7', 'P0.7'],
      ['P3.0', 'P3.0'], ['EA', 'ctrl:EA'],
      ['P3.1', 'P3.1'], ['ALE', 'na:沒有外部匯流排'],
      ['P3.2', 'P3.2'], ['PSEN', 'na:沒有外部匯流排'],
      ['P3.3', 'P3.3'], ['P2.7', 'P2.7'],
      ['P3.4', 'P3.4'], ['P2.6', 'P2.6'],
      ['P3.5', 'P3.5'], ['P2.5', 'P2.5'],
      ['P3.6', 'P3.6'], ['P2.4', 'P2.4'],
      ['P3.7', 'P3.7'], ['P2.3', 'P2.3'],
      ['X2', 'na:時脈固定 12MHz'], ['P2.2', 'P2.2'],
      ['X1', 'na:時脈固定 12MHz'], ['P2.1', 'P2.1'],
      ['GND', 'rail:gnd'], ['P2.0', 'P2.0'],
    ],
  },
  {
    id: 'JP2', side: 'main', title: 'JP2  LCM', titleAt: [296, 270], cols: 1, x: 303.5, y: 131, pitch: 9.69, labelSide: 'left',
    note: 'LCM 插座。接法焊死：RS=P3.2、R/W=P3.1、EN=P3.0、D0–D7=P0。',
    pins: [['VSS', 'rail:gnd'], ['VDD', 'rail:vcc'], ['VO', 'na:對比電壓，畫面一律清楚'],
           ['RS', 'P3.2'], ['R/W', 'P3.1'], ['EN', 'P3.0'],
           ['D0', 'P0.0'], ['D1', 'P0.1'], ['D2', 'P0.2'], ['D3', 'P0.3'],
           ['D4', 'P0.4'], ['D5', 'P0.5'], ['D6', 'P0.6'], ['D7', 'P0.7']],
  },
  {
    id: 'JP6', side: 'main', title: 'JP6', bare: true, cols: 1, x: 304.5, y: 117, pitch: 9.4, horiz: true, labelSide: 'above',
    note: 'RGB LED 接頭。原廠電路圖沒畫，接到哪個埠不明。',
    pins: [['R', 'na:原廠電路圖沒畫，接到哪個埠不明'],
           ['G', 'na:原廠電路圖沒畫，接到哪個埠不明'],
           ['B', 'na:原廠電路圖沒畫，接到哪個埠不明']],
  },
  {
    id: 'JP4', side: 'main', title: 'JP4', bare: true, cols: 1, x: 320.5, y: 133, pitch: 9.5, labelSide: 'right',
    note: '接 GND = 英文 16×2，接 VCC = 中文 14432。',
    pins: [['GND', 'rail:gnd'], ['', 'na:模擬器只做 16×2 英文'], ['VCC', 'rail:vcc']],
  },
  {
    id: 'JP11', side: 'main', title: 'JP11', titleAt: [402, 302], cols: 1, x: 409, y: 258.5, pitch: 9.5, labelSide: 'right',
    note: '短接 = LM35 的輸出送進 ADC 的 CH1。',
    pins: [['Vo', 'jumper:jp11'], ['CH1', 'jumper:jp11'], ['CH1 ', 'out:adcCh1'], ['GND', 'rail:gnd']],
  },
  {
    id: 'JP1', side: 'main', title: 'JP1  I²C', labelSize: 10, cols: 1, x: 354, y: 200.5, pitch: 9.2, horiz: true, labelSide: 'below',
    note: 'TC74 與 24LC16B 的 I²C 匯流排，板上已有 4.7K 上拉。',
    pins: [['GND', 'rail:gnd'], ['WP', 'dev:i2cWp'], ['SDA', 'dev:sda'], ['SCL', 'dev:scl']],
  },
  {
    id: 'JP10', side: 'main', title: 'JP10', cols: 1, x: 308.5, y: 287.5, pitch: 9.3, labelSide: 'right',
    note: 'ADC 與 DAC 的 SPI，六支要拉線到埠。',
    pins: [['GND', 'rail:gnd'], ['VCC', 'rail:vcc'], ['LD', 'dev:dacLd'], ['DAC', 'dev:dacCs'], ['ADC', 'dev:adcCs'],
           ['SDO', 'dev:spiSdo'], ['SDI', 'dev:spiSdi'], ['SCK', 'dev:spiSck']],
  },
  {
    id: 'JP12', side: 'main', title: 'JP12', cols: 1, x: 410, y: 362.5, pitch: 9.3, labelSide: 'right',
    note: 'DAC 的兩路類比輸出，電壓看「類比與環境」面板。',
    pins: [['CHA', 'out:dacA'], ['GND', 'rail:gnd'], ['CHB', 'out:dacB'], ['GND ', 'rail:gnd']],
  },
  {
    id: 'JP5', side: 'main', title: 'JP5  BT04', cols: 1, x: 126.5, y: 231.5, pitch: 9.5, labelSide: 'right',
    note: '藍牙模組：RXD = P3.0、TXD = P3.1，與 USB 共用。',
    pins: [['VCC', 'rail:vcc'], ['RXD', 'P3.0'], ['TXD', 'P3.1'], ['GND', 'rail:gnd']],
  },
  {
    // RESET 右邊有兩個並排的四腳座：右邊是 JP5 排針（絲印 VCC RxD TxD GND），
    // 左邊是沒印編號的母座，BT04 模組就插在這裡（對照原廠 1280px 產品照確認）。
    id: 'JP5母座', side: 'main', title: '', bare: true, cols: 1, x: 108, y: 231.5, pitch: 9.5, labelSide: 'left',
    note: '藍牙模組座，訊號同旁邊的 JP5。',
    pins: [['VCC', 'na:BT04 模組座'], ['RXD', 'na:BT04 模組座'],
           ['TXD', 'na:BT04 模組座'], ['GND', 'na:BT04 模組座']],
  },

  // ================= KDM+ 擴充板 =================
  {
    id: 'KJP3', side: 'kdm', title: 'JP3  顯示信號', titleAt: [482, 160], cols: 1, x: 486, y: 188, pitch: 9.0, horiz: true, labelSide: 'above',
    note: '段線 dp g f e d c b a，寫 0 該段亮。',
    pins: [['dp', 'dev:seg.7'], ['g', 'dev:seg.6'], ['f', 'dev:seg.5'], ['e', 'dev:seg.4'],
           ['d', 'dev:seg.3'], ['c', 'dev:seg.2'], ['b', 'dev:seg.1'], ['a', 'dev:seg.0']],
  },
  {
    id: 'KJP5', side: 'kdm', title: 'JP5', cols: 1, x: 510, y: 209.5, pitch: 9.2, horiz: true, labelSide: 'below',
    note: '接了這三支腳，就不必接 JP4 的八條位選線。',
    pins: [['EN', 'dev:dec138En'], ['A2', 'dev:dec138.2'], ['A1', 'dev:dec138.1'], ['A0', 'dev:dec138.0']],
  },
  {
    id: 'KJP4', side: 'kdm', title: 'JP4  共用掃瞄信號', cols: 1, x: 553, y: 213.5, pitch: 9.6, horiz: true, labelSide: 'above',
    note: '位選線 D7…D0，拉低 = 選中該位。七段與點矩陣共用。',
    pins: [['D7', 'dev:digit.7'], ['D6', 'dev:digit.6'], ['D5', 'dev:digit.5'], ['D4', 'dev:digit.4'],
           ['D3', 'dev:digit.3'], ['D2', 'dev:digit.2'], ['D1', 'dev:digit.1'], ['D0', 'dev:digit.0']],
  },
  {
    id: 'KJP6', side: 'kdm', title: 'JP6  LED 陣列', titleAt: [658, 186], cols: 1, x: 661.5, y: 207.5, pitch: 9.5, horiz: true, labelSide: 'above',
    note: '點矩陣的列線 Y7…Y0。',
    pins: [['Y7', 'dev:matrixRow.7'], ['Y6', 'dev:matrixRow.6'], ['Y5', 'dev:matrixRow.5'], ['Y4', 'dev:matrixRow.4'],
           ['Y3', 'dev:matrixRow.3'], ['Y2', 'dev:matrixRow.2'], ['Y1', 'dev:matrixRow.1'], ['Y0', 'dev:matrixRow.0']],
  },
  {
    id: 'KJP8', side: 'kdm', title: 'JP8', cols: 2, x: 652, colGap: 9.5, y: 324, pitch: 9.4, labelSide: 'right',
    note: 'R0–R3 掃描輸出、C0–C3 讀回（板上 10K 上拉）。',
    pins: [
      ['R0', 'dev:keyOut.0'], ['R0', 'dev:keyOut.0'],
      ['R1', 'dev:keyOut.1'], ['R1', 'dev:keyOut.1'],
      ['R2', 'dev:keyOut.2'], ['R2', 'dev:keyOut.2'],
      ['R3', 'dev:keyOut.3'], ['R3', 'dev:keyOut.3'],
      ['C0', 'dev:keyIn.0'], ['C0', 'dev:keyIn.0'],
      ['C1', 'dev:keyIn.1'], ['C1', 'dev:keyIn.1'],
      ['C2', 'dev:keyIn.2'], ['C2', 'dev:keyIn.2'],
      ['C3', 'dev:keyIn.3'], ['C3', 'dev:keyIn.3'],
    ],
  },
  {
    // 電路圖 JP7（Step Motor）腳 1–4 = S0 S1 S2 S3，各經 RP1 10K 上拉後進 ULN2803A（U4）的
    // IN1 / IN3 / IN5 / IN7，輸出 OUT1 / OUT3 / OUT5 / OUT7 分別是 B2 / B1 / A2 / A1。
    // 板子絲印把四個字印成一串「B2A2B1A1」，順序與電路圖不一致 —— 以電路圖為準。
    id: 'KJP7', side: 'kdm', title: '', cols: 1, x: 589, y: 370, pitch: 9.7, horiz: true, labelSide: 'above',
    note: '寫 1 該線圈通電。',
    pins: [['B2', 'dev:stepper.0'], ['B1', 'dev:stepper.1'], ['A2', 'dev:stepper.2'], ['A1', 'dev:stepper.3']],
  },
  {
    id: 'CN3', side: 'kdm', title: '', bare: true, cols: 1, x: 569, y: 281, pitch: 8.4, horiz: true, labelSide: 'above',
    note: '馬達出廠就插在這裡，不用也不能拉線。',
    pins: [['棕', 'fixed:motor'], ['棕', 'fixed:motor'], ['紅', 'fixed:motor'],
           ['黃', 'fixed:motor'], ['白', 'fixed:motor'], ['藍', 'fixed:motor']],
  },
  {
    id: 'KJP2', side: 'kdm', title: '', cols: 1, x: 543.5, y: 332.5, pitch: 9.5, labelSide: 'left',
    note: '上面兩腳短接 = 12V，下面兩腳 = 5V。',
    pins: [['12V', 'na:不模擬供電電壓與扭力'], [''],
           ['5V', 'na:不模擬供電電壓與扭力']],
  },
  {
    id: 'KJP1a', side: 'kdm', title: '', bare: true, cols: 1, x: 542.5, y: 381.5, pitch: 9.5, horiz: true, labelSide: 'above',
    note: '電源排針的 +5V 那一排。',
    pins: [['+5V', 'rail:vcc'], ['+5V', 'rail:vcc'], ['+5V', 'rail:vcc'], ['+5V', 'rail:vcc'],
           ['+5V', 'rail:vcc'], ['+5V', 'rail:vcc'], ['+5V', 'rail:vcc'], ['+5V', 'rail:vcc']],
  },
  {
    id: 'KJP1b', side: 'kdm', title: '', bare: true, cols: 1, x: 542.5, y: 391, pitch: 9.5, horiz: true, labelSide: 'below',
    note: '電源排針的 GND 那一排。',
    pins: [['GND', 'rail:gnd'], ['GND', 'rail:gnd'], ['GND', 'rail:gnd'], ['GND', 'rail:gnd'],
           ['GND', 'rail:gnd'], ['GND', 'rail:gnd'], ['GND', 'rail:gnd'], ['GND', 'rail:gnd']],
  },
];

export const isPort = (n) => /^P[0-3]\.[0-7]$/.test(n);
