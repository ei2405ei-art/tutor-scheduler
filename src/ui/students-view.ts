import { AppStore } from '../app/store.js';
import { computeAllBalances, lessonsOfStudent } from '../domain/balance.js';
import { formatFullDate, WEEKDAYS_SHORT } from '../domain/dates.js';
import { formatInterval } from '../domain/time.js';
import { STATUS_LABELS, TIMEZONE_LABELS } from '../domain/types.js';
import { button } from './controls.js';
import { el } from './dom.js';
import { openStudentCard, openStudentSheet } from './sheets.js';

export function renderStudentsView(store: AppStore): HTMLElement {
  const state = store.getState();
  const balances = computeAllBalances(state);
  const view = el('div', { class: 'students' });

  if (state.students.length === 0) {
    view.appendChild(
      el('section', { class: 'empty-panel' }, [
        el('h2', { text: 'Учеников пока нет' }),
        el('p', { text: 'Добавьте первого ученика, чтобы создавать занятия и вести учёт предоплаты.' }),
        button('Добавить ученика', () => openStudentSheet(store), 'primary'),
      ]),
    );
    return view;
  }

  const list = el('div', { class: 'students__list' });

  for (const student of state.students) {
    const balance = balances.get(student.id);
    const lessons = lessonsOfStudent(state, student.id);
    const last = lessons.at(-1);
    const series = state.series.filter((s) => s.studentId === student.id && s.active);
    const tone = (balance?.remaining ?? 0) < 0 ? 'danger' : (balance?.remaining ?? 0) === 0 ? 'warn' : 'ok';

    const card = el('article', { class: `student student--color-${student.color}`, 'data-testid': 'student-card' }, [
      el('div', { class: 'student__head' }, [
        el('strong', { class: 'student__name', text: student.name }),
        el('span', { class: 'student__subject', text: student.subject }),
        student.active ? null : el('span', { class: 'student__flag', text: 'не в расписании' }),
      ]),
      el('div', { class: 'student__meta' }, [
        student.contact ? el('span', { text: student.contact }) : null,
        el('span', { text: `${student.rate} за занятие` }),
        student.timezone
          ? el('span', { class: 'student__tz', text: `Пояс: ${TIMEZONE_LABELS[student.timezone]}` })
          : null,
      ]),
      student.goal
        ? el('p', { class: 'student__goal', 'data-testid': 'student-goal', text: `Цель: ${student.goal}` })
        : null,
      el('p', {
        class: 'student__schedule',
        'data-testid': 'student-schedule',
        text:
          series.length === 0
            ? 'Расписание не задано'
            : `Расписание: ${series
                .map((s) => `${WEEKDAYS_SHORT[s.weekday - 1]} ${formatInterval(s.startTime, s.durationMin)}`)
                .join(', ')}`,
      }),
      el('div', { class: `balance balance--${tone}` }, [
        el('span', { text: `оплачено ${balance?.paid ?? 0}` }),
        el('span', { text: '−' }),
        el('span', { text: `проведено ${balance?.done ?? 0}` }),
        el('span', { text: '=' }),
        el('strong', {
          text:
            (balance?.remaining ?? 0) < 0
              ? `долг ${Math.abs(balance?.remaining ?? 0)}`
              : `осталось ${balance?.remaining ?? 0}`,
        }),
      ]),
      last
        ? el('p', {
            class: 'student__last',
            text: `Ближайшее занятие: ${formatFullDate(last.date)}, ${formatInterval(last.startTime, last.durationMin)} · ${STATUS_LABELS[last.status]}`,
          })
        : el('p', { class: 'student__last', text: 'Занятий пока нет.' }),
    ]);

    const open = (): void => openStudentCard(store, student.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    list.appendChild(card);
  }

  view.appendChild(list);
  view.appendChild(button('Добавить ученика', () => openStudentSheet(store), 'primary'));
  return view;
}
