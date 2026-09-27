import { addDays, formatDayMonth, isIsoDate, type IsoDate, weekdayOf, WEEKDAYS_SHORT } from './dates.js';

export const WEEK_LENGTH_DAYS = 7;

/** Рабочая неделя репетитора: Пн–Суб (FR-3.1). */
export const WORK_WEEK_LENGTH_DAYS = 6;

/** Неделя Пн–Вс (A7). Границы недели и расчёт денег не меняются. */
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

/**
 * Рабочие дни недели: понедельник — суббота.
 * Воскресенье в сетку рабочей недели не входит (FR-3.1).
 */
export function workWeekDates(date: IsoDate): IsoDate[] {
  const start = startOfWeek(date);
  return Array.from({ length: WORK_WEEK_LENGTH_DAYS }, (_, i) => addDays(start, i));
}

/** Воскресенье той же недели — выходной день, отдельный блок (FR-3.1A). */
export function dayOffDate(date: IsoDate): IsoDate {
  return endOfWeek(date);
}

/** День входит в рабочую неделю Пн–Суб. */
export function isWorkWeekDay(date: IsoDate): boolean {
  return weekdayOf(date) <= WORK_WEEK_LENGTH_DAYS;
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
