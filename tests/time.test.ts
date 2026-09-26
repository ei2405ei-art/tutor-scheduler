import { describe, expect, it } from 'vitest';
import {
  formatInterval,
  fromMinutes,
  intervalsOverlap,
  isClockTime,
  isValidDuration,
  toMinutes,
} from '../src/domain/time.js';

describe('время суток', () => {
  it('проверяет формат HH:MM', () => {
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('18:30')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('9:00')).toBe(false);
    expect(isClockTime('18:60')).toBe(false);
    expect(isClockTime('')).toBe(false);
  });

  it('переводит время в минуты и обратно', () => {
    expect(toMinutes('18:30')).toBe(1110);
    expect(fromMinutes(1110)).toBe('18:30');
    expect(fromMinutes(0)).toBe('00:00');
  });

  it('длительность — положительное целое число минут до суток', () => {
    expect(isValidDuration(60)).toBe(true);
    expect(isValidDuration(1)).toBe(true);
    expect(isValidDuration(1440)).toBe(true);
    expect(isValidDuration(0)).toBe(false);
    expect(isValidDuration(-30)).toBe(false);
    expect(isValidDuration(60.5)).toBe(false);
    expect(isValidDuration(1441)).toBe(false);
  });
});

describe('интервалы занятий', () => {
  it('пересекающиеся интервалы конфликтуют', () => {
    expect(intervalsOverlap('18:00', 60, '18:30', 60)).toBe(true);
    expect(intervalsOverlap('18:00', 60, '17:30', 60)).toBe(true);
    expect(intervalsOverlap('18:00', 90, '19:00', 30)).toBe(true);
  });

  it('касание границы пересечением не считается (BR-2)', () => {
    expect(intervalsOverlap('18:00', 60, '19:00', 60)).toBe(false);
    expect(intervalsOverlap('19:00', 60, '18:00', 60)).toBe(false);
  });

  it('непересекающиеся интервалы не конфликтуют', () => {
    expect(intervalsOverlap('10:00', 60, '14:00', 60)).toBe(false);
    expect(intervalsOverlap('14:00', 60, '10:00', 60)).toBe(false);
  });

  it('форматирует интервал', () => {
    expect(formatInterval('18:00', 60)).toBe('18:00 – 19:00');
    expect(formatInterval('18:00', 90)).toBe('18:00 – 19:30');
  });
});
