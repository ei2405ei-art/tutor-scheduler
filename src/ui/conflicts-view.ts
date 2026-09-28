import { AppStore } from '../app/store.js';
import { conflictDays, type ScheduleConflict } from '../domain/conflicts.js';
import { formatDayMonth, weekdayFullName, weekdayOf } from '../domain/dates.js';
import { formatInterval } from '../domain/time.js';
import { STATUS_LABELS } from '../domain/types.js';
import { openSheet } from './controls.js';
import { el } from './dom.js';
import { openLessonSheet } from './sheets.js';

/**
 * Пересечения, которые уже лежат в данных (BR-2A, FR-3.1J).
 *
 * Приложение ничего не меняет само: баннер и список нужны, чтобы репетитор увидел
 * занятия на одно время и перенёс или отменил лишнее. Баннер показывается на всех
 * трёх вкладках — пересечение может быть на любой дате, а не только на текущей.
 */
export function conflictBanner(store: AppStore, conflicts: readonly ScheduleConflict[]): HTMLElement {
  return el('section', { class: 'banner banner--danger', role: 'alert', 'data-testid': 'conflicts-banner' }, [
    el('strong', { text: 'В расписании пересечения' }),
    el('span', {
      text: `Занятий на одно время: ${conflicts.length}. Перенесите или отмените лишнее — сейчас новое пересечение создать нельзя.`,
    }),
    openListButton(store, conflicts),
  ]);
}

function openListButton(store: AppStore, conflicts: readonly ScheduleConflict[]): HTMLElement {
  const node = el('button', {
    type: 'button',
    class: 'btn btn--secondary',
    'data-testid': 'conflicts-open',
    text: 'Показать список',
  });
  node.addEventListener('click', () => openConflictsSheet(store, conflicts));
  return node;
}

/** Список по дням: в каком день и в какое время занятия занимают одно время. */
export function openConflictsSheet(store: AppStore, conflicts: readonly ScheduleConflict[]): void {
  const state = store.getState();
  const days = conflictDays(conflicts);

  openSheet({ title: 'Пересечения в расписании', testId: 'conflicts-sheet' }, (body) => {
    body.appendChild(
      el('p', {
        class: 'hint',
        text: 'Нажмите на занятие, чтобы перенести или отменить его. Приложение ничего не меняет само.',
      }),
    );

    if (days.length === 0) {
      body.appendChild(el('p', { class: 'conflict-empty', text: 'Пересечений нет.' }));
      return;
    }

    for (const day of days) {
      const block = el('section', { class: 'conflict-day', 'data-testid': 'conflict-day', 'data-date': day.date }, [
        el('h3', {
          class: 'conflict-day__head',
          text: `${weekdayFullName(weekdayOf(day.date))}, ${formatDayMonth(day.date)}`,
        }),
      ]);
      for (const lesson of day.lessons) {
        const student = state.students.find((s) => s.id === lesson.studentId);
        const row = el(
          'button',
          {
            type: 'button',
            class: 'conflict-row',
            'data-testid': 'conflict-row',
            'data-id': lesson.id,
          },
          [
            el('span', { class: 'conflict-row__time', text: formatInterval(lesson.startTime, lesson.durationMin) }),
            el('span', { class: 'conflict-row__who', text: student?.name ?? 'Занятие без ученика' }),
            el('span', { class: 'conflict-row__status', text: STATUS_LABELS[lesson.status] }),
          ],
        );
        row.addEventListener('click', () => openLessonSheet(store, lesson.id));
        block.appendChild(row);
      }
      body.appendChild(block);
    }
  });
}
