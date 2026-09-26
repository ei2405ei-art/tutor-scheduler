import { addDays, formatDayMonth, isIsoDate, type IsoDate, weekdayOf, WEEKDAYS_SHORT } from './dates.js';

export const WEEK_LENGTH_DAYS = 7;

/** Неделя Пн–Вс (A7). */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -(weekdayOf(date) - 1));
}

export function endOfWeek(date: IsoDate): IsoDate {
  return addDays(startOfWeek(date), WEEK_LENGTH_DAYS - 1);
}

/** Семь дат недели, начиная с понедельника. */
export function weekDates(date: IsoDate): IsoDate[] {
  const start = startOfWeek(date);
  return Array.from({ length: WEEK_LENGTH_DAYS }, (_, i) => addDays(start, i));
}

export function shiftWeek(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * WEEK_LENGTH_DAYS);
}

export function isSameWeek(a: IsoDate, b: IsoDate): boolean {
  return startOfWeek(a) === startOfWeek(b);
}

/** Заголовок недели: «1 – 7 сентября» либо «29 сентября – 5 октября». */
export function formatWeekRange(date: IsoDate): string {
  const from = startOfWeek(date);
  const to = endOfWeek(date);
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const left = formatDayMonth(from);
    const right = formatDayMonth(to);
    return `${Number(left.split(' ')[0])} – ${right}`;
  }
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

export function weekDayLabels(): string[] {
  return [...WEEKDAYS_SHORT];
}

export function isWeekDate(date: unknown): date is IsoDate {
  return isIsoDate(date);
}
