import { AppStore } from '../app/store.js';
import { computeAllBalances } from '../domain/balance.js';
import { formatDayShort, todayIso, WEEKDAYS_SHORT, weekdayOf } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { sortLessons } from '../domain/commands.js';
import { dayOffDate, shiftWeek, startOfWeek, workWeekDates } from '../domain/week.js';
import { summarizeWeek } from '../domain/balance.js';
import { openStudentSheet } from './sheets.js';
import { lessonCard } from './lesson-card.js';
import { button, openSheet } from './controls.js';
import { el } from './dom.js';

export interface WeekViewOptions {
  date: string;
  onDateChange: (next: string) => void;
}

/** Выходной день репетитора: воскресенье (FR-3.1A). */
const DAY_OFF_TITLE = 'Воскресенье';

export function renderWeekView(store: AppStore, options: WeekViewOptions): HTMLElement {
  const state = store.getState();
  const dates = workWeekDates(options.date);
  const balances = computeAllBalances(state);
  const summary = summarizeWeek(state, options.date);
  const activeStudents = new Set(state.students.filter((s) => s.active).map((s) => s.id));

  const view = el('div', { class: 'week' });

  /* панель итога недели */
  const tone = summary.remainingPrepaid < 0 ? 'danger' : 'ok';
  const moneyRow = el('div', { class: 'summary__row summary__row--money' }, [
    el('div', { class: 'summary__money', 'data-testid': 'week-payable' }, [
      el('span', { class: 'summary__money-label', text: 'К оплате за неделю' }),
      el('strong', { class: 'summary__money-value', text: formatMoney(summary.payableTotal) }),
    ]),
  ]);
  if (summary.debtTotal > 0) {
    moneyRow.appendChild(
      el('div', { class: 'summary__money summary__money--debt', 'data-testid': 'week-debt' }, [
        el('span', { class: 'summary__money-label', text: 'Долг' }),
        el('strong', { class: 'summary__money-value', text: formatMoney(summary.debtTotal) }),
      ]),
    );
  }
  view.appendChild(
    el('section', { class: 'summary', 'data-testid': 'week-summary' }, [
      el('div', { class: 'summary__row' }, [
        summaryChip('Запланировано', summary.planned, 'planned'),
        summaryChip('Проведено', summary.done, 'done'),
        summaryChip('Отменено', summary.cancelled, 'cancelled'),
        summaryChip('Перенесено', summary.moved, 'moved'),
      ]),
      moneyRow,
      el('div', { class: `summary__balance summary__balance--${tone}`, text:
        summary.remainingPrepaid < 0
          ? `Остаток предоплаты по неделе: долг ${Math.abs(summary.remainingPrepaid)}`
          : `Остаток предоплаты по неделе: ${summary.remainingPrepaid}`,
      }),
    ]),
  );

  /* Первый запуск: вместо семи пустых дней объяснение и действие. */
  if (state.students.length === 0) {
    view.appendChild(
      el('section', { class: 'empty-panel', 'data-testid': 'week-empty' }, [
        el('h2', { text: 'Расписание пока пустое' }),
        el('p', {
          text: 'Добавьте первого ученика, а затем создайте занятие или серию занятий — здесь они появятся по дням недели.',
        }),
        button('Добавить ученика', () => openStudentSheet(store), 'primary'),
      ]),
    );
    return view;
  }

  /* рабочая неделя: понедельник — суббота */
  const grid = el('div', { class: 'week__grid', 'data-testid': 'week-grid' });
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
        column.appendChild(lessonCard(store, lesson, balances.get(lesson.studentId)?.remaining ?? 0, { compact: true }));
      }
    }

    grid.appendChild(column);
  }
  view.appendChild(grid);

  /* воскресенье — отдельным блоком под рабочей неделей (FR-3.1A) */
  view.appendChild(dayOffBlock(store, options.date, balances, activeStudents));
  return view;
}

/**
 * Воскресенье вне сетки рабочей недели, но в итогах недели (FR-3.1A, FR-3.1B).
 */
function dayOffBlock(
  store: AppStore,
  date: string,
  balances: ReturnType<typeof computeAllBalances>,
  activeStudents: Set<string>,
): HTMLElement {
  const state = store.getState();
  const sunday = dayOffDate(date);
  const visible = sortLessons(state.lessons.filter((l) => l.date === sunday && activeStudents.has(l.studentId)));

  const block = el('section', { class: 'dayoff', 'data-testid': 'week-dayoff', 'data-date': sunday }, [
    el('header', { class: 'dayoff__head' }, [
      el('span', { class: 'dayoff__name', text: `${DAY_OFF_TITLE} · выходной` }),
      el('span', { class: 'dayoff__num', text: formatDayShort(sunday) }),
    ]),
  ]);

  if (visible.length === 0) {
    block.appendChild(el('p', { class: 'dayoff__empty', text: 'В воскресенье занятий нет' }));
    return block;
  }

  const list = el('div', { class: 'dayoff__list' });
  for (const lesson of visible) {
    list.appendChild(lessonCard(store, lesson, balances.get(lesson.studentId)?.remaining ?? 0, { compact: true }));
  }
  block.appendChild(list);
  return block;
}

function summaryChip(label: string, value: number, status: string): HTMLElement {
  return el('div', { class: `chip chip--${status}` }, [
    el('span', { class: 'chip__value', text: String(value) }),
    el('span', { class: 'chip__label', text: label }),
  ]);
}

export function weekNavigation(date: string, onChange: (next: string) => void): HTMLElement {
  return el('div', { class: 'weeknav' }, [
    button('◀', () => onChange(shiftWeek(date, -1))),
    el('span', { class: 'weeknav__label', 'data-testid': 'week-range', text: formatRangeLabel(date) }),
    button('▶', () => onChange(shiftWeek(date, 1))),
    button('Эта неделя', () => onChange(startOfWeek(todayIso()))),
  ]);
}

/** Заголовок показывает видимый диапазон рабочей недели: Пн–Суб. */
function formatRangeLabel(date: string): string {
  const dates = workWeekDates(date);
  return `${formatDayShort(dates[0]!)} — ${formatDayShort(dates[dates.length - 1]!)}`;
}

export { openSheet };
