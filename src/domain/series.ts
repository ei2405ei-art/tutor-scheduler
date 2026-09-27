import {
  addDays,
  isAfter,
  isBefore,
  isIsoDate,
  weekdayName,
  weekdayOf,
  type IsoDate,
} from './dates.js';
import { formatInterval, intervalsOverlap, isClockTime, isValidDuration } from './time.js';
import {
  SERIES_HORIZON_WEEKS,
  type Lesson,
  type SeriesSlot,
} from './types.js';

/** Конец горизонта генерации: `startsOn` + 4 недели − 1 день (BR-3, A12). */
export function horizonEnd(startsOn: IsoDate, horizonWeeks: number = SERIES_HORIZON_WEEKS): IsoDate {
  return addDays(startsOn, horizonWeeks * 7 - 1);
}

export function firstOccurrence(weekday: number, startsOn: IsoDate): IsoDate {
  const shift = (weekday - weekdayOf(startsOn) + 7) % 7;
  return addDays(startsOn, shift);
}

/** Слоты по возрастанию дня недели — так расписание читается в интерфейсе. */
export function sortSlots(slots: readonly SeriesSlot[]): SeriesSlot[] {
  return [...slots].sort((a, b) => a.weekday - b.weekday);
}

/** «Пн 18:00 – 19:00» — одна строка расписания. */
export function describeSlot(slot: SeriesSlot): string {
  return `${weekdayName(slot.weekday)} ${formatInterval(slot.startTime, slot.durationMin)}`;
}

/** «Пн 18:00 – 19:00, Ср 18:00 – 19:00» — расписание серии или ученика. */
export function describeSlots(slots: readonly SeriesSlot[]): string {
  return sortSlots(slots).map(describeSlot).join(', ');
}

/** «3 занятия в неделю» — сколько занятий даёт серия (FR-2.4B). */
export function lessonsPerWeekText(slots: readonly SeriesSlot[]): string {
  const n = slots.length;
  if (n === 0) return 'Дней нет';
  if (n === 1) return '1 занятие в неделю';
  if (n < 5) return `${n} занятия в неделю`;
  return `${n} занятий в неделю`;
}

interface SeriesPattern {
  slots: readonly SeriesSlot[];
  startsOn: string;
  endsOn?: string;
}

/**
 * Все даты серии в пределах горизонта и `endsOn`.
 * Дни до `startsOn` и после `endsOn` не создаются (BR-3).
 * Каждый слот даёт свою неделю, поэтому серия даёт от одного до семи
 * занятий в неделю (FR-2.4A). Даты уникальны и идут по возрастанию.
 */
export function seriesDates(
  series: SeriesPattern,
  horizonWeeks: number = SERIES_HORIZON_WEEKS,
): IsoDate[] {
  const limit = horizonEnd(series.startsOn, horizonWeeks);
  const end = series.endsOn && isBefore(series.endsOn, limit) ? series.endsOn : limit;
  const dates = new Set<IsoDate>();

  for (const slot of series.slots) {
    const first = firstOccurrence(slot.weekday, series.startsOn);
    if (isAfter(first, end)) continue;
    for (let cursor = first; !isAfter(cursor, end); cursor = addDays(cursor, 7)) {
      dates.add(cursor);
    }
  }

  return [...dates].sort();
}

export interface BuildResult {
  lessons: Lesson[];
  /** Даты, пропущенные из-за пересечения с уже существующим занятием. */
  conflicts: IsoDate[];
}

export interface BuildOptions {
  now: string;
  createId: () => string;
  horizonWeeks?: number;
  seriesId: string;
  studentId: string;
}

/** Пересечение интервалов занятия со слотом серии. */
export function slotIsTaken(
  date: IsoDate,
  slot: Pick<SeriesSlot, 'startTime' | 'durationMin'>,
  existing: readonly Lesson[],
): Lesson | undefined {
  // Отменённое занятие освобождает слот (BR-9), перенесённое — нет: оно
  // остаётся в своей ячейке недели (BR-4).
  return existing.find(
    (l) =>
      l.date === date &&
      l.status !== 'cancelled' &&
      intervalsOverlap(slot.startTime, slot.durationMin, l.startTime, l.durationMin),
  );
}

/**
 * Создаёт занятия серии, не создавая дублей по паре `(seriesId, date)`
 * и не пересекая уже занятые слоты (BR-2, BR-3, FR-2.6).
 */
export function buildSeriesLessons(
  series: SeriesPattern & { id: string },
  existing: readonly Lesson[],
  options: BuildOptions,
): BuildResult {
  const horizonWeeks = options.horizonWeeks ?? SERIES_HORIZON_WEEKS;
  const takenDates = new Set<string>();
  for (const lesson of existing) {
    if (lesson.seriesId === series.id) takenDates.add(lesson.date);
  }

  const lessons: Lesson[] = [];
  const conflicts: IsoDate[] = [];

  // По каждому слоту — своя неделя, поэтому слоты обрабатываются по возрастанию
  // дня недели, а занятия получаются в порядке недель.
  for (const date of seriesDates(series, horizonWeeks)) {
    const slot = series.slots.find((s) => s.weekday === weekdayOf(date));
    if (!slot) continue;
    if (takenDates.has(date)) continue;

    if (slotIsTaken(date, slot, existing)) {
      conflicts.push(date);
      continue;
    }

    takenDates.add(date);
    lessons.push({
      id: options.createId(),
      studentId: options.studentId,
      date,
      startTime: slot.startTime,
      durationMin: slot.durationMin,
      status: 'planned',
      // Занятия серии не бывают пробными (FR-2.1a).
      isTrial: false,
      topicNote: '',
      homework: '',
      seriesId: series.id,
      movedToLessonId: null,
      movedFromLessonId: null,
      createdAt: options.now,
      updatedAt: options.now,
    });
  }

  return { lessons, conflicts };
}

/** Следующая дата серии за пределами уже созданных — для кнопки «достроить». */
export function nextMissingDate(
  series: SeriesPattern & { id: string },
  existing: readonly Lesson[],
  horizonWeeks: number = SERIES_HORIZON_WEEKS,
): IsoDate | null {
  const taken = new Set(existing.filter((l) => l.seriesId === series.id).map((l) => l.date));
  for (const date of seriesDates(series, horizonWeeks)) {
    if (!taken.has(date)) return date;
  }
  return null;
}

export interface SeriesInput {
  studentId: string;
  slots: readonly SeriesSlot[];
  startsOn: string;
  endsOn?: string;
}

/** Возвращает текст отказа или `null`, если слоты корректны (BR-3A). */
export function seriesSlotsError(slots: readonly SeriesSlot[]): string | null {
  if (slots.length === 0) return 'Добавьте хотя бы один день занятий.';
  if (slots.length > 7) return 'В серии не больше семи дней в неделю.';
  const seen = new Set<number>();
  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
      return 'Выберите день недели.';
    }
    if (seen.has(slot.weekday)) return 'День недели уже занят в этой серии.';
    seen.add(slot.weekday);
    if (!isClockTime(slot.startTime)) return 'Укажите время начала, например 18:00.';
    if (!isValidDuration(slot.durationMin)) return 'Укажите длительность от 1 до 1440 минут.';
  }
  return null;
}

export function isSeriesInputValid(input: SeriesInput): string | null {
  if (!input.studentId) return 'Выберите ученика.';
  const slotsError = seriesSlotsError(input.slots);
  if (slotsError) return slotsError;
  if (!isIsoDate(input.startsOn)) return 'Укажите дату начала серии.';
  if (input.endsOn) {
    if (!isIsoDate(input.endsOn)) return 'Дата окончания указана неверно.';
    if (isBefore(input.endsOn, input.startsOn)) {
      return 'Дата окончания не может быть раньше даты начала.';
    }
  }
  return null;
}
