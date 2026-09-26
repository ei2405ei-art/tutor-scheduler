import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatDayShort,
  isAfter,
  isBefore,
  isIsoDate,
  parseRuDate,
  todayIso,
  weekdayOf,
} from '../src/domain/dates.js';
import { endOfWeek, formatWeekRange, isSameWeek, startOfWeek, weekDates } from '../src/domain/week.js';

describe('календарные даты', () => {
  it('принимает только корректный формат YYYY-MM-DD', () => {
    expect(isIsoDate('2026-09-26')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-9-1')).toBe(false);
    expect(isIsoDate('26-09-2026')).toBe(false);
    expect(isIsoDate(20260926)).toBe(false);
  });

  it('високосный год обрабатывается верно', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
  });

  it('смещение по дням не зависит от часового пояса', () => {
    expect(addDays('2026-03-01', 1)).toBe('2026-03-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('разница в днях симметрична', () => {
    expect(diffDays('2026-09-26', '2026-09-20')).toBe(6);
    expect(diffDays('2026-09-20', '2026-09-26')).toBe(-6);
    expect(diffDays('2026-09-20', '2026-09-20')).toBe(0);
  });

  it('день недели по ISO: понедельник 1, воскресенье 7', () => {
    expect(weekdayOf('2026-09-21')).toBe(1);
    expect(weekdayOf('2026-09-26')).toBe(6);
    expect(weekdayOf('2026-09-27')).toBe(7);
  });

  it('сравнение дат', () => {
    expect(isBefore('2026-09-26', '2026-09-27')).toBe(true);
    expect(isAfter('2026-09-27', '2026-09-26')).toBe(true);
  });

  it('разбирает дату ввода ДД.ММ.ГГГГ', () => {
    expect(parseRuDate('26.09.2026')).toBe('2026-09-26');
    expect(parseRuDate('2.9.2026')).toBe('2026-09-02');
    expect(parseRuDate('31.02.2026')).toBeNull();
    expect(parseRuDate('')).toBeNull();
  });

  it('сегодняшняя дата берётся в локальном часовом поясе', () => {
    expect(todayIso(new Date(2026, 8, 26, 23, 30))).toBe('2026-09-26');
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('неделя Пн–Вс', () => {
  it('неделя начинается с понедельника', () => {
    expect(startOfWeek('2026-09-26')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
  });

  it('неделя заканчивается воскресеньем', () => {
    expect(endOfWeek('2026-09-21')).toBe('2026-09-27');
    expect(endOfWeek('2026-09-27')).toBe('2026-09-27');
  });

  it('семь дат недели по порядку', () => {
    expect(weekDates('2026-09-23')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
  });

  it('две даты в одной неделе относятся к одной неделе', () => {
    expect(isSameWeek('2026-09-21', '2026-09-27')).toBe(true);
    expect(isSameWeek('2026-09-20', '2026-09-27')).toBe(false);
  });

  it('заголовок недели читаем', () => {
    expect(formatWeekRange('2026-09-23')).toBe('21 – 27 сентября');
    expect(formatWeekRange('2026-10-01')).toBe('28 сентября – 4 октября');
  });

  it('короткая подпись дня', () => {
    expect(formatDayShort('2026-09-26')).toBe('26 сб');
  });
});
