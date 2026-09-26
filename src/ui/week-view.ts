import { AppStore } from '../app/store.js';
import { computeAllBalances } from '../domain/balance.js';
import { formatDayShort, todayIso, WEEKDAYS_SHORT, weekdayOf } from '../domain/dates.js';
import { formatInterval } from '../domain/time.js';
import { sortLessons } from '../domain/commands.js';
import { STATUS_LABELS, type Lesson } from '../domain/types.js';
import { startOfWeek, weekDates } from '../domain/week.js';
import { summarizeWeek } from '../domain/balance.js';
import { openLessonSheet, openMoveSheet } from './sheets.js';
import { button, openSheet } from './controls.js';
import { el } from './dom.js';
import { shiftWeek } from '../domain/week.js';

export interface WeekViewOptions {
  date: string;
  onDateChange: (next: string) => void;
}

export function renderWeekView(store: AppStore, options: WeekViewOptions): HTMLElement {
  const state = store.getState();
  const dates = weekDates(options.date);
  const balances = computeAllBalances(state);
  const summary = summarizeWeek(state, options.date);
  const activeStudents = new Set(state.students.filter((s) => s.active).map((s) => s.id));

  const view = el('div', { class: 'week' });

  /* панель итога недели */
  const tone = summary.remainingPrepaid < 0 ? 'danger' : 'ok';
  view.appendChild(
    el('section', { class: 'summary', 'data-testid': 'week-summary' }, [
      el('div', { class: 'summary__row' }, [
        summaryChip('Запланировано', summary.planned, 'planned'),
        summaryChip('Проведено', summary.done, 'done'),
        summaryChip('Отменено', summary.cancelled, 'cancelled'),
        summaryChip('Перенесено', summary.moved, 'moved'),
      ]),
      el('div', { class: `summary__balance summary__balance--${tone}`, text:
        summary.remainingPrepaid < 0
          ? `Остаток предоплаты по неделе: долг ${Math.abs(summary.remainingPrepaid)}`
          : `Остаток предоплаты по неделе: ${summary.remainingPrepaid}`,
      }),
    ]),
  );

  /* семь дней */
  const grid = el('div', { class: 'week__grid' });
  for (const date of dates) {
    const weekday = weekdayOf(date);
    const lessons = sortLessons(state.lessons.filter((l) => l.date === date));
    const visible = lessons.filter((l) => activeStudents.has(l.studentId));
    const isToday = date === todayIso();

    const column = el('section', { class: `day${isToday ? ' day--today' : ''}`, 'data-date': date }, [
      el('header', { class: 'day__head' }, [
        el('span', { class: 'day__name', text: WEEKDAYS_SHORT[weekday - 1] }),
        el('span', { class: 'day__num', text: formatDayShort(date) }),
      ]),
    ]);

    if (visible.length === 0) {
      column.appendChild(el('p', { class: 'day__empty', text: 'Нет занятий' }));
    } else {
      for (const lesson of visible) {
        column.appendChild(lessonCard(store, lesson, balances.get(lesson.studentId)?.remaining ?? 0));
      }
    }

    grid.appendChild(column);
  }
  view.appendChild(grid);
  return view;
}

function summaryChip(label: string, value: number, status: string): HTMLElement {
  return el('div', { class: `chip chip--${status}` }, [
    el('span', { class: 'chip__value', text: String(value) }),
    el('span', { class: 'chip__label', text: label }),
  ]);
}

function lessonCard(store: AppStore, lesson: Lesson, remaining: number): HTMLElement {
  const state = store.getState();
  const student = state.students.find((s) => s.id === lesson.studentId);
  const color = student?.color ?? 'slate';

  const card = el(
    'article',
    {
      class: `lesson lesson--${lesson.status} lesson--color-${color}`,
      'data-testid': 'lesson-card',
      'data-status': lesson.status,
      tabIndex: 0,
      role: 'button',
    },
    [
      el('span', { class: 'lesson__time', text: formatInterval(lesson.startTime, lesson.durationMin) }),
      el('strong', { class: 'lesson__student', text: student?.name ?? 'Ученик не найден' }),
      el('span', { class: 'lesson__subject', text: student?.subject ?? '' }),
      el('span', { class: `lesson__status lesson__status--${lesson.status}`, text: STATUS_LABELS[lesson.status] }),
      remaining <= 0 ? el('span', { class: 'lesson__flag', text: remaining < 0 ? 'долг' : 'предоплата исчерпана' }) : null,
      lesson.topicNote ? el('span', { class: 'lesson__note', text: lesson.topicNote }) : null,
      lesson.homework ? el('span', { class: 'lesson__hw', text: `ДЗ: ${lesson.homework}` }) : null,
    ],
  );

  const open = (): void => openLessonSheet(store, lesson.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  if (lesson.status === 'planned') {
    const move = el('button', { type: 'button', class: 'lesson__quick', text: 'Перенести' });
    move.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      openMoveSheet(store, lesson);
    });
    card.appendChild(move);
  }

  return card;
}

export function weekNavigation(date: string, onChange: (next: string) => void): HTMLElement {
  return el('div', { class: 'weeknav' }, [
    button('◀', () => onChange(shiftWeek(date, -1))),
    el('span', { class: 'weeknav__label', 'data-testid': 'week-range', text: formatRangeLabel(date) }),
    button('▶', () => onChange(shiftWeek(date, 1))),
    button('Эта неделя', () => onChange(startOfWeek(todayIso()))),
  ]);
}

function formatRangeLabel(date: string): string {
  const dates = weekDates(date);
  return `${formatDayShort(dates[0]!)} — ${formatDayShort(dates[6]!)}`;
}

export { openSheet };
