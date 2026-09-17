/* Keil intrins.h 相容版（SDCC） */
#ifndef __INTRINS_COMPAT_H__
#define __INTRINS_COMPAT_H__

#define _nop_() __asm__("nop")

static unsigned char _crol_(unsigned char a, unsigned char b) {
  while (b--) a = (unsigned char)((a << 1) | (a >> 7));
  return a;
}
static unsigned char _cror_(unsigned char a, unsigned char b) {
  while (b--) a = (unsigned char)((a >> 1) | (a << 7));
  return a;
}
static unsigned int _irol_(unsigned int a, unsigned char b) {
  while (b--) a = (unsigned int)((a << 1) | (a >> 15));
  return a;
}
static unsigned int _iror_(unsigned int a, unsigned char b) {
  while (b--) a = (unsigned int)((a >> 1) | (a << 15));
  return a;
}
static unsigned long _lrol_(unsigned long a, unsigned char b) {
  while (b--) a = (a << 1) | (a >> 31);
  return a;
}
static unsigned long _lror_(unsigned long a, unsigned char b) {
  while (b--) a = (a >> 1) | (a << 31);
  return a;
}
#define _testbit_(b) ((b) ? ((b) = 0, 1) : 0)
#define _chkfloat_(f) 0

#endif
