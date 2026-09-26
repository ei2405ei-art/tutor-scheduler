import { describe, expect, it } from 'vitest';
import { formatMoney, roundMoney } from '../src/domain/money.js';

const NBSP = '\u00a0';

describe('формат суммы', () => {
  it('разряды разделяются неразрывным пробелом, валюта ₽', () => {
    expect(formatMoney(1200)).toBe(`1${NBSP}200${NBSP}₽`);
    expect(formatMoney(0)).toBe(`0${NBSP}₽`);
  });

  it('тысячи и миллионы группируются по три цифры', () => {
    expect(formatMoney(1000)).toBe(`1${NBSP}000${NBSP}₽`);
    expect(formatMoney(10000)).toBe(`10${NBSP}000${NBSP}₽`);
    expect(formatMoney(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}₽`);
  });

  it('дробные значения округляются до целых рублей', () => {
    expect(formatMoney(1200.4)).toBe(`1${NBSP}200${NBSP}₽`);
    expect(formatMoney(1200.5)).toBe(`1${NBSP}201${NBSP}₽`);
  });

  it('минус отображается знаком, а не дефисом', () => {
    expect(formatMoney(-2000)).toBe(`−2${NBSP}000${NBSP}₽`);
  });

  it('нечисловые значения не дают NaN в интерфейсе', () => {
    expect(formatMoney(Number.NaN)).toBe(`0${NBSP}₽`);
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe(`0${NBSP}₽`);
  });

  it('округление доступно отдельно от формата', () => {
    expect(roundMoney(1199.5)).toBe(1200);
    expect(roundMoney(Number.NaN)).toBe(0);
  });
});
