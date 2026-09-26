/** Время суток в формате `HH:MM` и интервалы занятий. */
export type ClockTime = string;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_DURATION_MIN = 60;

export function isClockTime(value: unknown): value is ClockTime {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function toMinutes(time: ClockTime): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Некорректное время: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(total: number): ClockTime {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function isValidDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 24 * 60;
}

/** `18:00 – 19:00`. */
export function formatInterval(start: ClockTime, durationMin: number): string {
  const from = toMinutes(start);
  return `${formatMinutes(from)} – ${formatMinutes(from + durationMin)}`;
}

function formatMinutes(total: number): string {
  const day = Math.floor(total / (24 * 60));
  const rest = total - day * 24 * 60;
  const prefix = day > 0 ? `+${day} д ` : '';
  return prefix + fromMinutes(rest);
}

/**
 * Пересечение двух интервалов. Касание границы пересечением не считается:
 * 18:00–19:00 и 19:00–20:00 не конфликтуют (BR-2).
 */
export function intervalsOverlap(
  aStart: ClockTime,
  aDuration: number,
  bStart: ClockTime,
  bDuration: number,
): boolean {
  const aFrom = toMinutes(aStart);
  const aTo = aFrom + aDuration;
  const bFrom = toMinutes(bStart);
  const bTo = bFrom + bDuration;
  return aFrom < bTo && bFrom < aTo;
}

export function describeTime(time: ClockTime): string {
  return time;
}
