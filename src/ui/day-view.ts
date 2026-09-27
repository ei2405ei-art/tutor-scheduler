import { AppStore } from '../app/store.js';
import { computeAllBalances, findNextLesson, summarizeDay } from '../domain/balance.js';
import { sortLessons } from '../domain/commands.js';
import { addDays, formatFullDate, isIsoDate } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { button } from './controls.js';
import { el } from './dom.js';
import { lessonCard } from './lesson-card.js';
import { openNewLessonSheet, openStudentSheet } from './sheets.js';

export interface DayViewOptions {
  date: string;
  onDateChange: (next: string) => void;
}

/**
 * Дневной вид (FR-3A). Одна дата, занятия по времени, итог за день
 * и ближайшее ещё не начавшееся занятие.
 */
export function renderDayView(store: AppStore, options: DayViewOptions): HTMLElement {
  const state = store.getState();
  const date = options.date;
  const summary = summarizeDay(state, date);
  const balances = computeAllBalances(state);
  const activeStudents = new Set(state.students.filter((s) => s.active).map((s) => s.id));
  const lessons = sortLessons(state.lessons.filter((l) => l.date === date && activeStudents.has(l.studentId)));
  const next = findNextLesson(lessons, store.clock());

  const view = el('div', { class: 'day-view', 'data-testid': 'day-view' });

  /* Первый запуск: вместо пустого дня объяснение и действие. */
  if (state.students.length === 0) {
    view.appendChild(
      el('section', { class: 'empty-panel', 'data-testid': 'day-empty-firstrun' }, [
        el('h2', { text: 'Пока нечего показывать' }),
        el('p', {
          text: 'Добавьте первого ученика, а затем создайте занятие или серию занятий — они появятся в выбранном дне.',
        }),
        button('Добавить ученика', () => openStudentSheet(store), 'primary'),
      ]),
    );
    return view;
  }

  view.appendChild(daySummary(summary.total, summary.planned, summary.done, summary.payableTotal));

  if (lessons.length === 0) {
    view.appendChild(
      el('section', { class: 'empty-panel', 'data-testid': 'day-empty' }, [
        el('p', { text: 'В этот день занятий нет.' }),
        button('Создать занятие', () => openNewLessonSheet(store, date), 'primary'),
      ]),
    );
    return view;
  }

  const list = el('div', { class: 'day-view__list' });
  for (const lesson of lessons) {
    list.appendChild(
      lessonCard(store, lesson, balances.get(lesson.studentId)?.remaining ?? 0, {
        next: next ? lesson.id === next.id : false,
      }),
    );
  }
  view.appendChild(list);
  return view;
}

/** Навигация по дням и переход к сегодняшнему дню (FR-3A.1). */
export function dayNavigation(store: AppStore, options: DayViewOptions): HTMLElement {
  const jump = el('input', {
    class: 'daynav__input',
    type: 'date',
    value: options.date,
    'aria-label': 'Выбрать дату',
    'data-testid': 'day-input',
  });
  jump.addEventListener('change', () => {
    const picked = jump.value;
    if (isIsoDate(picked)) options.onDateChange(picked);
  });

  const isToday = options.date === store.today();
  const label = el('span', { class: 'daynav__label', 'data-testid': 'day-label' }, [
    el('span', { text: formatFullDate(options.date) }),
    isToday ? el('span', { class: 'daynav__today', text: 'сегодня' }) : null,
  ]);

  return el('nav', { class: 'daynav', 'data-testid': 'day-navigation' }, [
    button('◀', () => options.onDateChange(addDays(options.date, -1)), 'ghost'),
    label,
    button('▶', () => options.onDateChange(addDays(options.date, 1)), 'ghost'),
    button('Сегодня', () => options.onDateChange(store.today())),
    jump,
  ]);
}

/** Итог дня: количество занятий и сумма к оплате (FR-3A.3, FR-3A.6). */
function daySummary(total: number, planned: number, done: number, payableTotal: number): HTMLElement {
  return el('section', { class: 'summary summary--day', 'data-testid': 'day-summary' }, [
    el('div', { class: 'summary__row' }, [
      chip('Всего', total, 'total'),
      chip('Запланировано', planned, 'planned'),
      chip('Проведено', done, 'done'),
    ]),
    el('div', { class: 'summary__row summary__row--money' }, [
      el('div', { class: 'summary__money', 'data-testid': 'day-payable' }, [
        el('span', { class: 'summary__money-label', text: 'К оплате за день' }),
        el('strong', { class: 'summary__money-value', text: formatMoney(payableTotal) }),
      ]),
    ]),
  ]);
}

function chip(label: string, value: number, status: string): HTMLElement {
  return el('div', { class: `chip chip--${status}` }, [
    el('span', { class: 'chip__value', text: String(value) }),
    el('span', { class: 'chip__label', text: label }),
  ]);
}
