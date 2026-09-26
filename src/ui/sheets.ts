import { AppStore } from '../app/store.js';
import {
  addOneOffLesson,
  addPayment,
  addSeries,
  addStudent,
  buildSeries,
  cancelLesson,
  markDone,
  moveLesson,
  saveLessonNotes,
  setSeriesActive,
  setStudentActive,
  updateStudent,
  type OneOffLessonInput,
  type SeriesInput,
} from '../domain/commands.js';
import { computeBalance, lessonsOfStudent } from '../domain/balance.js';
import { formatFullDate, isAfter, weekdayOf, WEEKDAYS_SHORT } from '../domain/dates.js';
import { formatInterval, isClockTime, isValidDuration } from '../domain/time.js';
import {
  LESSON_STATUSES,
  STATUS_LABELS,
  STUDENT_COLORS,
  type Lesson,
  type StudentColor,
} from '../domain/types.js';
import { moveHistory } from '../domain/commands.js';
import { button, closeSheet, errorBox, field, openSheet, selectField, setError, textareaField } from './controls.js';
import { el } from './dom.js';

const COLOR_LABELS: Record<StudentColor, string> = {
  blue: 'Синий',
  green: 'Зелёный',
  orange: 'Оранжевый',
  purple: 'Фиолетовый',
  teal: 'Бирюзовый',
  rose: 'Розовый',
  amber: 'Янтарный',
  slate: 'Серый',
};

/* -------------------------------------------------- карточка занятия */

export function openLessonSheet(store: AppStore, lessonId: string): void {
  const lesson = store.getState().lessons.find((l) => l.id === lessonId);
  if (!lesson) return;
  const student = store.getState().students.find((s) => s.id === lesson.studentId);
  if (!student) {
    openSheet({ title: 'Занятие', testId: 'lesson-sheet' }, (body) => {
      body.appendChild(
        el('p', { class: 'empty', text: 'Занятие ссылается на ученика, которого больше нет в справочнике.' }),
      );
      body.appendChild(button('Закрыть', closeSheet));
    });
    return;
  }

  openSheet({ title: 'Карточка занятия', testId: 'lesson-sheet' }, (body, close) => {
    body.appendChild(
      el('div', { class: 'sheet__meta' }, [
        el('strong', { text: student.name }),
        el('span', { text: ` · ${student.subject}` }),
        el('div', { class: 'sheet__meta-line', text: formatFullDate(lesson.date) }),
        el('div', { class: 'sheet__meta-line', text: formatInterval(lesson.startTime, lesson.durationMin) }),
        el('div', { class: `status status--${lesson.status}`, text: STATUS_LABELS[lesson.status] }),
      ]),
    );

    const error = errorBox();
    body.appendChild(error);

    const topic = textareaField('Что прошли', 'topicNote', lesson.topicNote);
    const homework = textareaField('Домашнее задание', 'homework', lesson.homework);
    body.appendChild(topic);
    body.appendChild(homework);

    body.appendChild(
      button(
        'Сохранить заметку и ДЗ',
        () => {
          const topicValue = (topic.querySelector('textarea') as HTMLTextAreaElement).value;
          const homeworkValue = (homework.querySelector('textarea') as HTMLTextAreaElement).value;
          const result = store.dispatch((ctx, state) => saveLessonNotes(ctx, state, lessonId, {
            topicNote: topicValue,
            homework: homeworkValue,
          }));
          if (result.ok) {
            close();
            reopenLesson(store, lessonId);
          } else {
            setError(error, result.error ?? 'Не удалось сохранить.');
          }
        },
        'primary',
      ),
    );

    if (lesson.status === 'planned') {
      body.appendChild(
        el('div', { class: 'sheet__actions' }, [
          button('Проведено', () => {
            store.dispatch((ctx, state) => markDone(ctx, state, lessonId));
            close();
          }, 'primary'),
          button('Перенести', () => openMoveSheet(store, lesson)),
          button('Отменить', () => {
            store.dispatch((ctx, state) => cancelLesson(ctx, state, lessonId));
            close();
          }, 'danger'),
        ]),
      );
    } else {
      body.appendChild(
        el('p', { class: 'hint', text: `Статус «${STATUS_LABELS[lesson.status]}» конечный: вернуть занятие в работу нельзя, создайте новое.` }),
      );
    }

    const history = moveHistory(store.getState(), lesson);
    if (history.length > 0) {
      body.appendChild(el('h3', { class: 'sheet__subtitle', text: 'История переносов' }));
      const list = el('ul', { class: 'history' });
      for (const related of history) {
        list.appendChild(
          el('li', {}, [
            el('span', {
              text: `${related.id === lesson.movedFromLessonId ? 'Перенесено из' : 'Перенесено в'} ${formatFullDate(
                related.date,
              )}, ${formatInterval(related.startTime, related.durationMin)} · ${
                STATUS_LABELS[related.status]
              }`,
            }),
          ]),
        );
      }
      body.appendChild(list);
    }
  });
}

function reopenLesson(store: AppStore, lessonId: string): void {
  if (store.getState().lessons.some((l) => l.id === lessonId)) {
    openLessonSheet(store, lessonId);
  }
}

/* ------------------------------------------------------- перенос занятия */

export function openMoveSheet(store: AppStore, lesson: Lesson): void {
  openSheet({ title: 'Перенос занятия', testId: 'move-sheet' }, (body, close) => {
    const error = errorBox();
    const date = field({
      label: 'Новая дата',
      name: 'moveDate',
      type: 'date',
      value: lesson.date > store.today() ? lesson.date : store.today(),
      min: store.today(),
      required: true,
    });
    const time = field({
      label: 'Новое время',
      name: 'moveTime',
      type: 'time',
      value: lesson.startTime,
      required: true,
    });
    const duration = field({
      label: 'Длительность, мин',
      name: 'moveDuration',
      type: 'number',
      value: String(lesson.durationMin),
      min: '1',
      max: '1440',
      step: '5',
      inputMode: 'numeric',
      required: true,
    });

    body.appendChild(error);
    body.appendChild(date);
    body.appendChild(time);
    body.appendChild(duration);
    body.appendChild(
      el('p', { class: 'hint', text: 'Исходное занятие останется на своём месте со статусом «Перенесено». Перенос в прошлое запрещён, баланс не меняется.' }),
    );
    body.appendChild(
      button(
        'Перенести',
        () => {
          const dateInput = date.querySelector('input') as HTMLInputElement;
          const timeInput = time.querySelector('input') as HTMLInputElement;
          const durationInput = duration.querySelector('input') as HTMLInputElement;

          const result = store.dispatch((ctx, state) =>
            moveLesson(ctx, state, lesson.id, {
              date: dateInput.value,
              startTime: timeInput.value,
              durationMin: Number(durationInput.value),
            }),
          );
          if (result.ok) close();
          else setError(error, result.error ?? 'Не удалось перенести.');
        },
        'primary',
      ),
    );
    body.appendChild(button('Отмена', close));
  });
}

/* --------------------------------------------------- создание занятия */

export function openNewLessonSheet(store: AppStore, defaultDate: string): void {
  const state = store.getState();
  if (state.students.length === 0) {
    openSheet({ title: 'Новое занятие', testId: 'new-lesson-sheet' }, (body) => {
      body.appendChild(el('p', { class: 'empty', text: 'Сначала добавьте хотя бы одного ученика.' }));
      body.appendChild(button('Закрыть', closeSheet));
    });
    return;
  }

  openSheet({ title: 'Новое занятие', testId: 'new-lesson-sheet' }, (body, close) => {
    const error = errorBox();
    const mode = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Тип занятия' });

    const oneOff = el('div', { class: 'segmented__item' });
    const seriesBox = el('div', { class: 'segmented__item' });
    const oneOffInput = el('input', { type: 'radio', name: 'mode', id: 'mode-one', value: 'one', checked: true });
    const seriesInput = el('input', { type: 'radio', name: 'mode', id: 'mode-series', value: 'series' });
    oneOff.appendChild(oneOffInput);
    oneOff.appendChild(el('label', { text: 'Разовое', htmlFor: 'mode-one' }));
    seriesBox.appendChild(seriesInput);
    seriesBox.appendChild(el('label', { text: 'Серия', htmlFor: 'mode-series' }));
    mode.appendChild(oneOff);
    mode.appendChild(seriesBox);

    const students = state.students.map((s) => ({ value: s.id, label: `${s.name} — ${s.subject}` }));
    const student = selectField('Ученик', 'student', students, students[0]?.value);
    const oneDate = field({ label: 'Дата', name: 'date', type: 'date', value: defaultDate, required: true });
    const oneTime = field({ label: 'Время', name: 'startTime', type: 'time', value: '18:00', required: true });
    const oneDuration = field({
      label: 'Длительность, мин',
      name: 'duration',
      type: 'number',
      value: '60',
      min: '1',
      max: '1440',
      step: '5',
      inputMode: 'numeric',
      required: true,
    });

    const weekday = selectField(
      'День недели',
      'weekday',
      WEEKDAYS_SHORT.map((label, i) => ({ value: String(i + 1), label })),
      String(weekdayOf(defaultDate)),
    );
    const seriesTime = field({ label: 'Время', name: 'seriesTime', type: 'time', value: '18:00', required: true });
    const seriesDuration = field({
      label: 'Длительность, мин',
      name: 'seriesDuration',
      type: 'number',
      value: '60',
      min: '1',
      max: '1440',
      step: '5',
      inputMode: 'numeric',
      required: true,
    });
    const startsOn = field({ label: 'Начало серии', name: 'startsOn', type: 'date', value: defaultDate, required: true });
    const endsOn = field({ label: 'Окончание серии', name: 'endsOn', type: 'date', value: '', hint: 'Необязательно' });

    const oneBlock = el('div', { class: 'form__block' }, [oneDate, oneTime, oneDuration]);
    const seriesBlock = el('div', { class: 'form__block form__block--hidden' }, [
      weekday,
      seriesTime,
      seriesDuration,
      startsOn,
      endsOn,
      el('p', { class: 'hint', text: 'Серия создаёт занятия на 4 недели вперёд. Дни до даты начала не создаются.' }),
    ]);

    const sync = (): void => {
      const isSeries = seriesInput.checked;
      oneBlock.classList.toggle('form__block--hidden', isSeries);
      seriesBlock.classList.toggle('form__block--hidden', !isSeries);
    };
    oneOffInput.addEventListener('change', sync);
    seriesInput.addEventListener('change', sync);
    sync();

    body.appendChild(error);
    body.appendChild(mode);
    body.appendChild(student);
    body.appendChild(oneBlock);
    body.appendChild(seriesBlock);

    body.appendChild(
      button(
        'Создать',
        () => {
          const studentId = (student.querySelector('select') as HTMLSelectElement).value;
          const result = seriesInput.checked
            ? store.dispatch((ctx, s) =>
                addSeries(ctx, s, {
                  studentId,
                  weekday: Number((weekday.querySelector('select') as HTMLSelectElement).value),
                  startTime: (seriesTime.querySelector('input') as HTMLInputElement).value,
                  durationMin: Number((seriesDuration.querySelector('input') as HTMLInputElement).value),
                  startsOn: (startsOn.querySelector('input') as HTMLInputElement).value,
                  endsOn: (endsOn.querySelector('input') as HTMLInputElement).value || undefined,
                }),
              )
            : store.dispatch((ctx, s) =>
                addOneOffLesson(ctx, s, {
                  studentId,
                  date: (oneDate.querySelector('input') as HTMLInputElement).value,
                  startTime: (oneTime.querySelector('input') as HTMLInputElement).value,
                  durationMin: Number((oneDuration.querySelector('input') as HTMLInputElement).value),
                }),
              );
          if (result.ok) close();
          else setError(error, result.error ?? 'Не удалось создать занятие.');
        },
        'primary',
      ),
    );
    body.appendChild(button('Отмена', close));
  });
}

/* ---------------------------------------------------------- карточка ученика */

export function openStudentSheet(store: AppStore, studentId?: string): void {
  const existing = studentId ? store.getState().students.find((s) => s.id === studentId) : undefined;
  const title = existing ? 'Ученик' : 'Новый ученик';

  openSheet({ title, testId: 'student-sheet' }, (body, close) => {
    const error = errorBox();
    const name = field({ label: 'Имя', name: 'name', value: existing?.name ?? '', required: true });
    const subject = field({ label: 'Предмет', name: 'subject', value: existing?.subject ?? '', required: true });
    const contact = field({ label: 'Контакт', name: 'contact', value: existing?.contact ?? '', placeholder: 'Телефон, Telegram или почта' });
    const rate = field({
      label: 'Ставка за занятие',
      name: 'rate',
      type: 'number',
      value: existing ? String(existing.rate) : '',
      min: '1',
      step: '1',
      inputMode: 'numeric',
      required: true,
    });
    const color = selectField(
      'Цвет',
      'color',
      STUDENT_COLORS.map((c) => ({ value: c, label: COLOR_LABELS[c] })),
      existing?.color ?? STUDENT_COLORS[0],
    );

    body.appendChild(error);
    body.appendChild(name);
    body.appendChild(subject);
    body.appendChild(contact);
    body.appendChild(rate);
    body.appendChild(color);

    body.appendChild(
      button(
        existing ? 'Сохранить' : 'Добавить ученика',
        () => {
          const input = {
            name: (name.querySelector('input') as HTMLInputElement).value,
            subject: (subject.querySelector('input') as HTMLInputElement).value,
            contact: (contact.querySelector('input') as HTMLInputElement).value,
            rate: Number((rate.querySelector('input') as HTMLInputElement).value),
            color: (color.querySelector('select') as HTMLSelectElement).value as StudentColor,
          };
          const result = store.dispatch((ctx, state) =>
            existing ? updateStudent(ctx, state, existing.id, input) : addStudent(ctx, state, input),
          );
          if (result.ok) close();
          else setError(error, result.error ?? 'Не удалось сохранить ученика.');
        },
        'primary',
      ),
    );
    body.appendChild(button('Отмена', close));
  });
}

/* ------------------------------------------------- карточка ученика (просмотр) */

export function openStudentCard(store: AppStore, studentId: string): void {
  openSheet({ title: 'Ученик', testId: 'student-card' }, (body, close) => {
    const render = (): void => {
      body.replaceChildren();
      const state = store.getState();
      const student = state.students.find((s) => s.id === studentId);
      if (!student) {
        body.appendChild(el('p', { class: 'empty', text: 'Ученик не найден.' }));
        body.appendChild(button('Закрыть', close));
        return;
      }

      const balance = computeBalance(state, student.id);
      body.appendChild(
        el('div', { class: 'sheet__meta' }, [
          el('strong', { text: student.name }),
          el('div', { class: 'sheet__meta-line', text: student.subject }),
          student.contact ? el('div', { class: 'sheet__meta-line', text: student.contact }) : el('span'),
          el('div', { class: 'sheet__meta-line', text: `Ставка: ${student.rate}` }),
        ]),
      );

      const tone = balance.remaining < 0 ? 'danger' : balance.remaining === 0 ? 'warn' : 'ok';
      body.appendChild(
        el('div', { class: `balance balance--${tone}`, 'data-testid': 'balance' }, [
          el('span', { text: `Оплачено ${balance.paid}` }),
          el('span', { text: '−' }),
          el('span', { text: `проведено ${balance.done}` }),
          el('span', { text: '=' }),
          el('strong', {
            text:
              balance.remaining < 0
                ? `долг ${Math.abs(balance.remaining)}`
                : `осталось ${balance.remaining}`,
          }),
        ]),
      );

      body.appendChild(
        el('div', { class: 'sheet__actions' }, [
          button('Изменить', () => openStudentSheet(store, student.id)),
          button('Записать оплату', () => openPaymentSheet(store, student.id)),
          student.active
            ? button('Убрать из расписания', () => {
                store.dispatch((_, s) => setStudentActive(s, student.id, false));
                render();
              })
            : button('Вернуть в расписание', () => {
                store.dispatch((_, s) => setStudentActive(s, student.id, true));
                render();
              }),
        ]),
      );

      /* серии */
      const seriesList = state.series.filter((s) => s.studentId === student.id);
      body.appendChild(el('h3', { class: 'sheet__subtitle', text: 'Серии' }));
      if (seriesList.length === 0) {
        body.appendChild(el('p', { class: 'hint', text: 'Регулярных занятий нет. Создайте серию из «Новое занятие».' }));
      } else {
        for (const series of seriesList) {
          const count = state.lessons.filter((l) => l.seriesId === series.id).length;
          body.appendChild(
            el('div', { class: 'row' }, [
              el('div', { class: 'row__main' }, [
                el('strong', { text: `${WEEKDAYS_SHORT[series.weekday - 1]}, ${formatInterval(series.startTime, series.durationMin)}` }),
                el('span', { class: 'row__sub', text: `с ${series.startsOn} · занятий: ${count}${series.active ? '' : ' · закрыта'}` }),
              ]),
              series.active
                ? button('Достроить', () => {
                    store.dispatch((ctx, s) => buildSeries(ctx, s, series.id));
                    render();
                  })
                : null,
              series.active
                ? button('Закрыть', () => {
                    store.dispatch((_, s) => setSeriesActive(s, series.id, false));
                    render();
                  })
                : null,
            ]),
          );
        }
      }

      /* оплаты */
      body.appendChild(el('h3', { class: 'sheet__subtitle', text: 'Оплаты' }));
      const payments = state.payments
        .filter((p) => p.studentId === student.id)
        .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
      if (payments.length === 0) {
        body.appendChild(el('p', { class: 'hint', text: 'Оплат не записано.' }));
      } else {
        for (const payment of payments) {
          body.appendChild(
            el('div', { class: 'row' }, [
              el('div', { class: 'row__main' }, [
                el('strong', { text: `${payment.lessonsCount} занятий` }),
                el('span', { class: 'row__sub', text: formatFullDate(payment.paidAt) }),
              ]),
              payment.comment ? el('span', { class: 'row__sub', text: payment.comment }) : null,
            ]),
          );
        }
      }

      /* занятия */
      body.appendChild(el('h3', { class: 'sheet__subtitle', text: 'Занятия' }));
      const lessons = lessonsOfStudent(state, student.id).slice(-12).reverse();
      if (lessons.length === 0) {
        body.appendChild(el('p', { class: 'hint', text: 'Занятий пока нет.' }));
      } else {
        for (const lesson of lessons) {
          body.appendChild(
            el('button', { type: 'button', class: 'row row--link' }, [
              el('div', { class: 'row__main' }, [
                el('strong', { text: `${formatFullDate(lesson.date)}, ${formatInterval(lesson.startTime, lesson.durationMin)}` }),
                el('span', { class: 'row__sub', text: STATUS_LABELS[lesson.status] }),
              ]),
            ]),
          );
          const last = body.lastElementChild as HTMLElement;
          last.addEventListener('click', () => {
            close();
            openLessonSheet(store, lesson.id);
          });
        }
      }

      body.appendChild(button('Закрыть', close));
    };

    render();
  });
}

/* ---------------------------------------------------------------- оплата */

export function openPaymentSheet(store: AppStore, studentId: string): void {
  openSheet({ title: 'Записать оплату', testId: 'payment-sheet' }, (body, close) => {
    const error = errorBox();
    const count = field({
      label: 'Количество занятий',
      name: 'lessonsCount',
      type: 'number',
      value: '4',
      min: '1',
      step: '1',
      inputMode: 'numeric',
      required: true,
    });
    const paidAt = field({
      label: 'Дата оплаты',
      name: 'paidAt',
      type: 'date',
      value: store.today(),
      max: store.today(),
      required: true,
    });
    const comment = field({ label: 'Комментарий', name: 'comment', placeholder: 'Необязательно' });

    body.appendChild(error);
    body.appendChild(count);
    body.appendChild(paidAt);
    body.appendChild(comment);
    body.appendChild(
      button(
        'Записать',
        () => {
          const result = store.dispatch((ctx, state) =>
            addPayment(ctx, state, {
              studentId,
              lessonsCount: Number((count.querySelector('input') as HTMLInputElement).value),
              paidAt: (paidAt.querySelector('input') as HTMLInputElement).value,
              comment: (comment.querySelector('input') as HTMLInputElement).value,
            }),
          );
          if (result.ok) close();
          else setError(error, result.error ?? 'Не удалось записать оплату.');
        },
        'primary',
      ),
    );
    body.appendChild(button('Отмена', close));
  });
}

export { COLOR_LABELS, LESSON_STATUSES, isAfter, isClockTime, isValidDuration, type OneOffLessonInput, type SeriesInput };
