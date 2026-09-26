import { addDays, isAfter, isBefore, isIsoDate, weekdayOf, type IsoDate } from './dates.js';
import { intervalsOverlap, isValidDuration } from './time.js';
import { SERIES_HORIZON_WEEKS, type Lesson, type LessonSeries } from './types.js';

/** Конец горизонта генерации: `startsOn` + 4 недели − 1 день (BR-3, A12). */
export function horizonEnd(startsOn: IsoDate, horizonWeeks: number = SERIES_HORIZON_WEEKS): IsoDate {
  return addDays(startsOn, horizonWeeks * 7 - 1);
}

export function firstOccurrence(weekday: number, startsOn: IsoDate): IsoDate {
  const shift = (weekday - weekdayOf(startsOn) + 7) % 7;
  return addDays(startsOn, shift);
}

/**
 * Все даты серии в пределах горизонта и `endsOn`.
 * Дни до `startsOn` и после `endsOn` не создаются (BR-3).
 */
export function seriesDates(
  series: Pick<LessonSeries, 'weekday' | 'startsOn' | 'endsOn'>,
  horizonWeeks: number = SERIES_HORIZON_WEEKS,
): IsoDate[] {
  const limit = horizonEnd(series.startsOn, horizonWeeks);
  const end = series.endsOn && isBefore(series.endsOn, limit) ? series.endsOn : limit;
  const first = firstOccurrence(series.weekday, series.startsOn);
  if (isAfter(first, end)) return [];

  const dates: IsoDate[] = [];
  let cursor = first;
  while (!isAfter(cursor, end)) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return dates;
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
  startTime: string;
  durationMin: number;
}

/**
 * Создаёт занятия серии, не создавая дублей по паре `(seriesId, date)`
 * и не пересекая уже занятые слоты (BR-2, BR-3, FR-2.6).
 */
export function buildSeriesLessons(
  series: Pick<LessonSeries, 'id' | 'studentId' | 'weekday' | 'startsOn' | 'endsOn'>,
  existing: Lesson[],
  options: BuildOptions,
): BuildResult {
  const horizonWeeks = options.horizonWeeks ?? SERIES_HORIZON_WEEKS;
  const takenDates = new Set<string>();
  for (const lesson of existing) {
    if (lesson.seriesId === series.id) takenDates.add(lesson.date);
  }

  const lessons: Lesson[] = [];
  const conflicts: IsoDate[] = [];

  for (const date of seriesDates(series, horizonWeeks)) {
    if (takenDates.has(date)) continue;

    // Отменённое занятие освобождает слот (BR-9), перенесённое — нет: оно
    // остаётся в своей ячейке недели (BR-4).
    const clash = existing.find(
      (l) =>
        l.date === date &&
        l.status !== 'cancelled' &&
        intervalsOverlap(options.startTime, options.durationMin, l.startTime, l.durationMin),
    );
    if (clash) {
      conflicts.push(date);
      continue;
    }

    takenDates.add(date);
    lessons.push({
      id: options.createId(),
      studentId: options.studentId,
      date,
      startTime: options.startTime,
      durationMin: options.durationMin,
      status: 'planned',
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
  series: Pick<LessonSeries, 'id' | 'weekday' | 'startsOn' | 'endsOn'>,
  existing: Lesson[],
  horizonWeeks: number = SERIES_HORIZON_WEEKS,
): IsoDate | null {
  const taken = new Set(existing.filter((l) => l.seriesId === series.id).map((l) => l.date));
  for (const date of seriesDates(series, horizonWeeks)) {
    if (!taken.has(date)) return date;
  }
  return null;
}

export function isSeriesInputValid(input: {
  studentId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  startsOn: string;
  endsOn?: string;
}): string | null {
  if (!input.studentId) return 'Выберите ученика.';
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    return 'Выберите день недели.';
  }
  if (!isValidDuration(input.durationMin)) return 'Укажите длительность от 1 до 1440 минут.';
  if (!isIsoDate(input.startsOn)) return 'Укажите дату начала серии.';
  if (input.endsOn) {
    if (!isIsoDate(input.endsOn)) return 'Дата окончания указана неверно.';
    if (isBefore(input.endsOn, input.startsOn)) {
      return 'Дата окончания не может быть раньше даты начала.';
    }
  }
  return null;
}
