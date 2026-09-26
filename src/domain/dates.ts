/** Календарные даты в формате `YYYY-MM-DD`. Timestamp'ы не хранятся (BR-15). */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

interface Parts {
  year: number;
  month: number;
  day: number;
}

export function parts(date: IsoDate): Parts {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Некорректная дата: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatDate(date: IsoDate): string {
  const { year, month, day } = parts(date);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Дата в UTC-полночь. Смещение всегда в календарных днях, без эффекта часового пояса. */
export function toUtc(date: IsoDate): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function fromUtc(dt: Date): IsoDate {
  return formatDate(
    [
      String(dt.getUTCFullYear()).padStart(4, '0'),
      String(dt.getUTCMonth() + 1).padStart(2, '0'),
      String(dt.getUTCDate()).padStart(2, '0'),
    ].join('-'),
  );
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const dt = toUtc(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

export function addMinutes(date: IsoDate, minutes: number): IsoDate {
  const dt = toUtc(date);
  dt.setUTCMinutes(dt.getUTCMinutes() + minutes);
  return fromUtc(dt);
}

/** День недели по ISO: 1 = понедельник … 7 = воскресенье. */
export function weekdayOf(date: IsoDate): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const day = toUtc(date).getUTCDay();
  return (day === 0 ? 7 : day) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Разница в календарных днях: положительное значение означает, что `a` позже `b`. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / MS_PER_DAY);
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareIso(a, b) < 0;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIso(a, b) > 0;
}

/** Сегодняшняя календарная дата в локальном часовом поясе пользователя. */
export function todayIso(now: Date = new Date()): IsoDate {
  return formatDate(
    [
      String(now.getFullYear()).padStart(4, '0'),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-'),
  );
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAYS_SHORT[(weekday - 1) % 7] ?? '';
}

export function formatDayMonth(date: IsoDate): string {
  const { day, month } = parts(date);
  return `${day} ${MONTHS_GEN[month - 1]}`;
}

export function formatMonthYear(date: IsoDate): string {
  const { year, month } = parts(date);
  return `${MONTHS_NOM[month - 1]} ${year}`;
}

/** Короткая подпись дня для мобильной сетки: «4 сб». */
export function formatDayShort(date: IsoDate): string {
  const { day } = parts(date);
  return `${day} ${weekdayName(weekdayOf(date)).toLowerCase()}`;
}

export function formatFullDate(date: IsoDate): string {
  const { year } = parts(date);
  return `${formatDayMonth(date)} ${year}`;
}

/** Разбор пользовательской даты `ДД.ММ.ГГГГ` в `YYYY-MM-DD`. */
export function parseRuDate(input: string): IsoDate | null {
  const m = /^(\d{1,2})[.](\d{1,2})[.](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const candidate = formatDate(
    [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'),
  );
  return isIsoDate(candidate) ? candidate : null;
}

/** Дата ввода типа `date` → `YYYY-MM-DD`. */
export function fromInputDate(input: string): IsoDate | null {
  return isIsoDate(input) ? input : null;
}
