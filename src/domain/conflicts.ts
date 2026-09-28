/**
 * Поиск пересечений, которые уже лежат в данных (BR-2A).
 *
 * Проверка при создании занятия (`validateLessonInput`, `slotIsTaken`) работает
 * только для новых записей: она отвечает на вопрос «можно ли создать», а не
 * «есть ли уже такое в расписании». Поэтому поиск идёт по сохранённым данным
 * целиком, без правок: приложение показывает список, решение принимает репетитор.
 */

import type { IsoDate } from './dates.js';
import { intervalsOverlap } from './time.js';
import type { AppState, Lesson } from './types.js';

/** Пара занятий, которые занимают одно время в один день. */
export interface ScheduleConflict {
  date: IsoDate;
  first: Lesson;
  second: Lesson;
}

/** Один день с пересечением и все занятия этого дня, попавшие в пересечение. */
export interface ConflictDay {
  date: IsoDate;
  lessons: Lesson[];
}

/**
 * Все пересечения в расписании, по возрастанию даты и времени.
 *
 * Условия те же, что и при создании занятия (BR-2): одна дата, пересекающиеся
 * интервалы, касание границы не считается. Отменённое занятие слот освобождает
 * и пересечением не считается, перенесённое — считается (BR-4, BR-9).
 * Занятия закрытого ученика учитываются: это проблема данных, а не вида недели.
 */
export function findScheduleConflicts(state: AppState): ScheduleConflict[] {
  const byDate = new Map<IsoDate, Lesson[]>();
  for (const lesson of state.lessons) {
    if (lesson.status === 'cancelled') continue;
    const day = byDate.get(lesson.date);
    if (day) day.push(lesson);
    else byDate.set(lesson.date, [lesson]);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [date, lessons] of byDate) {
    const ordered = sortByStart(lessons);
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const first = ordered[i]!;
        const second = ordered[j]!;
        if (intervalsOverlap(first.startTime, first.durationMin, second.startTime, second.durationMin)) {
          conflicts.push({ date, first, second });
        }
      }
    }
  }
  return conflicts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.first.startTime.localeCompare(b.first.startTime),
  );
}

/**
 * Пересечения, сгруппированные по дням. Три занятия на один слот дают один день
 * с тремя строками, а не три пары: репетитору нужен список занятий, а не пар.
 */
export function conflictDays(conflicts: readonly ScheduleConflict[]): ConflictDay[] {
  const days = new Map<IsoDate, Lesson[]>();
  for (const conflict of conflicts) {
    const day = days.get(conflict.date);
    if (day) {
      day.push(conflict.first, conflict.second);
    } else {
      days.set(conflict.date, [conflict.first, conflict.second]);
    }
  }
  return [...days.entries()]
    .map(([date, lessons]) => ({ date, lessons: sortByStart(dedupe(lessons)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Занятие, попавшее в несколько пар, в списке дня показывается один раз. */
function dedupe(lessons: readonly Lesson[]): Lesson[] {
  return [...new Map(lessons.map((l) => [l.id, l])).values()];
}

function sortByStart(lessons: readonly Lesson[]): Lesson[] {
  return [...lessons].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.createdAt.localeCompare(b.createdAt),
  );
}
