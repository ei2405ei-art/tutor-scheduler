import { describe, expect, it } from 'vitest';
import {
  addOneOffLesson,
  addPayment,
  addStudent,
  cancelLesson,
  createContext,
  emptyState,
  markDone,
  moveHistory,
  moveLesson,
  saveLessonNotes,
  setSeriesActive,
  setStudentActive,
  sortLessons,
  updateStudent,
} from '../src/domain/commands.js';
import {
  canTransition,
  computeBalance,
  findNextLesson,
  summarizeDay,
  summarizeWeek,
} from '../src/domain/balance.js';
import {
  GOAL_MAX_LENGTH,
  type AppState,
  type Lesson,
  type Student,
  type StudentTimezone,
} from '../src/domain/types.js';

const TODAY = new Date(2026, 8, 24, 10, 0); // четверг 24 сентября 2026
const ctx = createContext(TODAY);

function stateWith(): AppState {
  return {
    ...emptyState(),
    students: [
      {
        id: 's1',
        name: 'Иван',
        subject: 'Математика',
        contact: '',
        rate: 1200,
        timezone: '',
        goal: '',
        color: 'blue',
        active: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 's2',
        name: 'Анна',
        subject: 'Английский',
        contact: '',
        rate: 1000,
        timezone: '',
        goal: '',
        color: 'green',
        active: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };
}

function makeLesson(patch: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    studentId: 's1',
    date: '2026-09-24',
    startTime: '18:00',
    durationMin: 60,
    status: 'planned',
    isTrial: false,
    topicNote: '',
    homework: '',
    seriesId: null,
    movedToLessonId: null,
    movedFromLessonId: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...patch,
  };
}

function withLessons(...lessons: Lesson[]): AppState {
  return { ...stateWith(), lessons };
}

/** Фикстура ученика по идентификатору — без `undefined` под строгими индексами. */
function studentById(id: string): Student {
  const found = stateWith().students.find((s) => s.id === id);
  if (!found) throw new Error(`Нет фикстуры ученика ${id}`);
  return found;
}

describe('создание занятия', () => {
  it('нельзя создать занятие без ученика, даты и времени (BR-1)', () => {
    const state = stateWith();
    expect(addOneOffLesson(ctx, state, { studentId: '', date: '2026-09-24', startTime: '18:00', durationMin: 60 }).ok).toBe(false);
    expect(addOneOffLesson(ctx, state, { studentId: 's1', date: '', startTime: '18:00', durationMin: 60 }).ok).toBe(false);
    expect(addOneOffLesson(ctx, state, { studentId: 's1', date: '2026-09-24', startTime: '', durationMin: 60 }).ok).toBe(false);
    expect(addOneOffLesson(ctx, state, { studentId: 's1', date: '2026-09-24', startTime: '18:00', durationMin: 0 }).ok).toBe(false);
  });

  it('успешное создание возвращает planned с пустыми заметками', () => {
    const result = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('planned');
    expect(result.value.topicNote).toBe('');
    expect(result.value.homework).toBe('');
  });

  it('два занятия с пересекающимися интервалами создать нельзя (BR-2)', () => {
    const first = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const clash = addOneOffLesson(ctx, first.state, {
      studentId: 's2',
      date: '2026-09-24',
      startTime: '18:30',
      durationMin: 60,
    });
    expect(clash.ok).toBe(false);
    if (clash.ok) return;
    expect(clash.error).toContain('Слот занят');
  });

  it('касание границ интервалов пересечением не считается (BR-2)', () => {
    const first = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const touching = addOneOffLesson(ctx, first.state, {
      studentId: 's2',
      date: '2026-09-24',
      startTime: '19:00',
      durationMin: 60,
    });
    expect(touching.ok).toBe(true);
  });
});

describe('статусы занятия', () => {
  it('cancelled и moved конечные (BR-12)', () => {
    expect(canTransition('cancelled', 'done')).toBe(false);
    expect(canTransition('moved', 'done')).toBe(false);
    expect(canTransition('done', 'planned')).toBe(false);
    expect(canTransition('planned', 'done')).toBe(true);
  });

  it('перевод в done списывает ровно одно занятие и только один раз (BR-10)', () => {
    const state = withLessons(makeLesson());
    const first = markDone(ctx, state, 'l1');
    expect(first.ok).toBe(true);

    const second = markDone(ctx, first.state, 'l1');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(computeBalance(first.state, 's1').done).toBe(1);
  });

  it('отменённое занятие нельзя перевести в done', () => {
    const state = withLessons(makeLesson());
    const cancelled = cancelLesson(ctx, state, 'l1');
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    const done = markDone(ctx, cancelled.state, 'l1');
    expect(done.ok).toBe(false);
  });

  it('отмена не меняет баланс (BR-9)', () => {
    const state = withLessons(makeLesson(), makeLesson({ id: 'l2', startTime: '19:00' }));
    const cancelled = cancelLesson(ctx, state, 'l1');
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(computeBalance(cancelled.state, 's1').done).toBe(0);
  });
});

describe('перенос занятия', () => {
  it('исходное получает moved и остаётся в своей дате, новое создаётся в целевой (BR-4)', () => {
    const state = withLessons(makeLesson());
    const result = moveLesson(ctx, state, 'l1', {
      date: '2026-09-25',
      startTime: '16:00',
      durationMin: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const source = result.state.lessons.find((l) => l.id === 'l1');
    const target = result.state.lessons.find((l) => l.id === result.value.to.id);

    expect(source?.status).toBe('moved');
    expect(source?.date).toBe('2026-09-24');
    expect(target?.status).toBe('planned');
    expect(target?.date).toBe('2026-09-25');
    expect(target?.startTime).toBe('16:00');
    expect(target?.durationMin).toBe(90);
    expect(result.state.lessons).toHaveLength(2);
  });

  it('связи переноса взаимны', () => {
    const state = withLessons(makeLesson());
    const result = moveLesson(ctx, state, 'l1', { date: '2026-09-25', startTime: '16:00', durationMin: 60 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.from.movedToLessonId).toBe(result.value.to.id);
    expect(result.value.to.movedFromLessonId).toBe('l1');
  });

  it('перенос не меняет баланс (BR-6)', () => {
    const state = withLessons(makeLesson());
    const result = moveLesson(ctx, state, 'l1', { date: '2026-09-25', startTime: '16:00', durationMin: 60 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeBalance(result.state, 's1').done).toBe(0);
    expect(computeBalance(result.state, 's1').remaining).toBe(0);
  });

  it('перенос в прошлое запрещён (BR-5)', () => {
    const state = withLessons(makeLesson());
    const result = moveLesson(ctx, state, 'l1', {
      date: '2026-09-23',
      startTime: '16:00',
      durationMin: 60,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('прошлое');
  });

  it('перенос на занятый слот запрещён', () => {
    const state = withLessons(
      makeLesson(),
      makeLesson({ id: 'l2', date: '2026-09-25', startTime: '16:00', durationMin: 60 }),
    );
    const result = moveLesson(ctx, state, 'l1', {
      date: '2026-09-25',
      startTime: '16:00',
      durationMin: 60,
    });
    expect(result.ok).toBe(false);
  });

  it('переносить можно только запланированное занятие', () => {
    const state = withLessons(makeLesson({ status: 'done' }));
    expect(moveLesson(ctx, state, 'l1', { date: '2026-09-25', startTime: '16:00', durationMin: 60 }).ok).toBe(false);
  });

  it('история переноса доступна с обеих сторон', () => {
    const state = withLessons(makeLesson());
    const result = moveLesson(ctx, state, 'l1', { date: '2026-09-25', startTime: '16:00', durationMin: 60 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fromHistory = moveHistory(result.state, result.value.from);
    const toHistory = moveHistory(result.state, result.value.to);
    expect(fromHistory.map((l) => l.id)).toEqual([result.value.to.id]);
    expect(toHistory.map((l) => l.id)).toEqual(['l1']);
  });
});

describe('заметки и домашнее задание', () => {
  it('заметка и ДЗ сохраняются независимо (FR-4.2)', () => {
    const state = withLessons(makeLesson());
    const result = saveLessonNotes(ctx, state, 'l1', { topicNote: 'Квадратные уравнения', homework: '№1–8' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topicNote).toBe('Квадратные уравнения');
    expect(result.value.homework).toBe('№1–8');
  });

  it('ДЗ можно записать без заметки', () => {
    const state = withLessons(makeLesson());
    const result = saveLessonNotes(ctx, state, 'l1', { topicNote: '', homework: '№10' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topicNote).toBe('');
    expect(result.value.homework).toBe('№10');
  });
});

describe('предоплата и баланс', () => {
  it('баланс вычисляется, а не хранится (BR-15)', () => {
    const state: AppState = withLessons(makeLesson({ status: 'done' }));
    const paid = addPayment(ctx, state, {
      studentId: 's1',
      lessonsCount: 10,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    const balance = computeBalance(paid.state, 's1');
    expect(balance.paid).toBe(10);
    expect(balance.done).toBe(1);
    expect(balance.remaining).toBe(9);
    expect(paid.state.lessons[0]).not.toHaveProperty('remaining');
  });

  it('только done списывает баланс', () => {
    const state = withLessons(
      makeLesson({ id: 'l1', status: 'done' }),
      makeLesson({ id: 'l2', startTime: '19:00', status: 'planned' }),
      makeLesson({ id: 'l3', startTime: '20:00', status: 'cancelled' }),
      makeLesson({ id: 'l4', startTime: '21:00', status: 'moved' }),
    );
    const paid = addPayment(ctx, state, {
      studentId: 's1',
      lessonsCount: 4,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(computeBalance(paid.state, 's1').remaining).toBe(3);
  });

  it('баланс может стать отрицательным — это долг (FR-5.7)', () => {
    const state = withLessons(makeLesson({ status: 'done' }));
    expect(computeBalance(state, 's1').remaining).toBe(-1);
  });

  it('дата оплаты не может быть в будущем', () => {
    const result = addPayment(ctx, stateWith(), {
      studentId: 's1',
      lessonsCount: 5,
      paidAt: '2026-09-30',
      comment: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('будущем');
  });

  it('количество оплаченных занятий — положительное целое', () => {
    for (const lessonsCount of [0, -3, 2.5, Number.NaN]) {
      const result = addPayment(ctx, stateWith(), {
        studentId: 's1',
        lessonsCount,
        paidAt: '2026-09-20',
        comment: '',
      });
      expect(result.ok).toBe(false);
    }
  });

  it('оплата неизвестному ученику отклоняется', () => {
    const result = addPayment(ctx, stateWith(), {
      studentId: 'nope',
      lessonsCount: 5,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(result.ok).toBe(false);
  });
});

describe('итог недели', () => {
  it('считает занятия по статусам и суммирует балансы учеников недели', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-21', status: 'done' }),
      makeLesson({ id: 'l2', date: '2026-09-22', startTime: '19:00' }),
      makeLesson({ id: 'l3', date: '2026-09-27', startTime: '20:00', status: 'cancelled' }),
      makeLesson({ id: 'l4', date: '2026-09-25', startTime: '20:00', status: 'moved' }),
      makeLesson({ id: 'l5', date: '2026-10-05', studentId: 's2', startTime: '10:00' }),
    );
    const paid = addPayment(ctx, state, {
      studentId: 's1',
      lessonsCount: 4,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const summary = summarizeWeek(paid.state, '2026-09-23');
    expect(summary.weekStart).toBe('2026-09-21');
    expect(summary.weekEnd).toBe('2026-09-27');
    expect(summary.total).toBe(4);
    expect(summary.done).toBe(1);
    expect(summary.planned).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.moved).toBe(1);
    expect(summary.remainingPrepaid).toBe(3);
  });

  it('сумма к оплате считает planned и done по ставке, cancelled и moved не входят', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-21', status: 'done' }),
      makeLesson({ id: 'l2', date: '2026-09-22', startTime: '19:00' }),
      makeLesson({ id: 'l3', date: '2026-09-23', startTime: '20:00', status: 'cancelled' }),
      makeLesson({ id: 'l4', date: '2026-09-24', startTime: '20:00', status: 'moved' }),
    );
    /* 2 × 1200 (Иван: done + planned); отменённое и перенесённое не считаются. */
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(2400);
  });

  it('сумма к оплате считает ставку каждого ученика', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-21', studentId: 's1' }),
      makeLesson({ id: 'l2', date: '2026-09-22', studentId: 's2', startTime: '19:00' }),
      makeLesson({ id: 'l3', date: '2026-09-23', studentId: 's2', startTime: '20:00' }),
    );
    /* 1200 (Иван) + 1000 + 1000 (Анна). */
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(3200);
  });

  it('занятие другой недели не попадает в сумму', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-21' }),
      makeLesson({ id: 'l2', date: '2026-09-28', startTime: '19:00' }),
    );
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(1200);
  });

  it('перенос учитывается в неделе новой даты ровно один раз', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-22', status: 'moved', movedToLessonId: 'l2' }),
      makeLesson({ id: 'l2', date: '2026-09-29', startTime: '19:00' }),
    );
    /* Неделя переноса: только moved, денег нет. Неделя новой даты: одно planned. */
    expect(summarizeWeek(state, '2026-09-22').payableTotal).toBe(0);
    expect(summarizeWeek(state, '2026-09-29').payableTotal).toBe(1200);
  });

  it('долг считается в рублях по отрицательному балансу учеников недели', () => {
    const state: AppState = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-21' }),
      makeLesson({ id: 'l2', date: '2026-09-22', startTime: '19:00', status: 'done' }),
      makeLesson({ id: 'l3', date: '2026-09-23', studentId: 's2', startTime: '20:00', status: 'done' }),
    );
    const paid = addPayment(ctx, state, { studentId: 's1', lessonsCount: 1, paidAt: '2026-09-20', comment: '' });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const summary = summarizeWeek(paid.state, '2026-09-23');
    /* Иван: оплачено 1, проведено 1 → остаток 0. Анна: оплачено 0, проведено 1 → долг 1000. */
    expect(summary.remainingPrepaid).toBe(-1);
    expect(summary.debtTotal).toBe(1000);
    /* 1200 (planned) + 1200 (done) + 1000 (done) — все три неотменённых. */
    expect(summary.payableTotal).toBe(3400);
  });

  it('долг нулевой, когда предоплата не исчерпана', () => {
    const state: AppState = withLessons(makeLesson({ id: 'l1', date: '2026-09-21', status: 'done' }));
    const paid = addPayment(ctx, state, { studentId: 's1', lessonsCount: 4, paidAt: '2026-09-20', comment: '' });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(summarizeWeek(paid.state, '2026-09-23').debtTotal).toBe(0);
  });

  it('суммы округляются до целых рублей', () => {
    const state: AppState = {
      ...withLessons(makeLesson({ id: 'l1', date: '2026-09-21' })),
      students: [{ ...studentById('s1'), rate: 1000.4 }, studentById('s2')],
    };
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(1000);
  });

  it('некорректная ставка не ломает расчёт', () => {
    const state: AppState = {
      ...withLessons(makeLesson({ id: 'l1', date: '2026-09-21' })),
      students: [{ ...studentById('s1'), rate: Number.NaN }],
    };
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(0);
  });

  it('пустая неделя даёт нулевые суммы', () => {
    const summary = summarizeWeek(withLessons(), '2026-09-23');
    expect(summary.payableTotal).toBe(0);
    expect(summary.debtTotal).toBe(0);
    expect(summary.total).toBe(0);
  });
});

describe('пробное занятие (BR-16)', () => {
  it('создаётся с признаком isTrial и статусом planned', () => {
    const result = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
      isTrial: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('planned');
    expect(result.value.isTrial).toBe(true);
  });

  it('без признака создаётся обычное занятие', () => {
    const result = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isTrial).toBe(false);
  });

  it('не входит в сумму к оплате, но остаётся в количествах', () => {
    const state = withLessons(
      makeLesson({ id: 'l1', status: 'planned', isTrial: true }),
      makeLesson({ id: 'l2', startTime: '19:00', status: 'planned', isTrial: false }),
    );
    const summary = summarizeWeek(state, '2026-09-23');
    expect(summary.total).toBe(2);
    expect(summary.planned).toBe(2);
    expect(summary.payableTotal).toBe(1200);
  });

  it('проведённое пробное не списывает предоплату', () => {
    const paid = addPayment(ctx, withLessons(), {
      studentId: 's1',
      lessonsCount: 1,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const created = addOneOffLesson(ctx, paid.state, {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
      isTrial: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const done = markDone(ctx, created.state, created.value.id);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(computeBalance(done.state, 's1').remaining).toBe(1);
  });

  it('перенос сохраняет признак пробного в новом занятии', () => {
    const created = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
      isTrial: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const moved = moveLesson(ctx, created.state, created.value.id, {
      date: '2026-09-25',
      startTime: '16:00',
      durationMin: 60,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const target = moved.state.lessons.find((l) => l.status === 'planned');
    expect(target?.isTrial).toBe(true);
    expect(summarizeWeek(moved.state, '2026-09-23').payableTotal).toBe(0);
  });

  it('отмена пробного не меняет суммы', () => {
    const created = addOneOffLesson(ctx, stateWith(), {
      studentId: 's1',
      date: '2026-09-24',
      startTime: '18:00',
      durationMin: 60,
      isTrial: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const cancelled = cancelLesson(ctx, created.state, created.value.id);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(summarizeWeek(cancelled.state, '2026-09-23').payableTotal).toBe(0);
  });

  it('день и неделя считают одинаково', () => {
    const state = withLessons(
      makeLesson({ id: 'l1', date: '2026-09-24', status: 'planned', isTrial: true }),
      makeLesson({ id: 'l2', date: '2026-09-24', startTime: '19:00', status: 'done', isTrial: false }),
    );
    const day = summarizeDay(state, '2026-09-24');
    expect(day.total).toBe(2);
    expect(day.done).toBe(1);
    expect(day.planned).toBe(1);
    expect(day.payableTotal).toBe(1200);
    expect(summarizeWeek(state, '2026-09-23').payableTotal).toBe(day.payableTotal);
  });

  it('занятия закрытого ученика не попадают в итоги дня и недели (BR-14)', () => {
    const state = withLessons(makeLesson({ id: 'l1', date: '2026-09-24', status: 'planned' }));
    const closed: AppState = {
      ...state,
      students: state.students.map((s) => (s.id === 's1' ? { ...s, active: false } : s)),
    };
    expect(summarizeWeek(state, '2026-09-23').total).toBe(1);
    expect(summarizeDay(closed, '2026-09-24').total).toBe(0);
    expect(summarizeDay(closed, '2026-09-24').payableTotal).toBe(0);
    const week = summarizeWeek(closed, '2026-09-23');
    expect(week.total).toBe(0);
    expect(week.planned).toBe(0);
    expect(week.payableTotal).toBe(0);
    expect(week.remainingPrepaid).toBe(0);
    expect(week.debtTotal).toBe(0);
  });

  it('ближайшим считается первое ещё не начавшееся запланированное', () => {
    const lessons = sortLessons([
      makeLesson({ id: 'l1', startTime: '09:00', status: 'planned' }),
      makeLesson({ id: 'l2', startTime: '18:00', status: 'planned' }),
      makeLesson({ id: 'l3', startTime: '20:00', status: 'cancelled' }),
      makeLesson({ id: 'l4', startTime: '21:00', status: 'done' }),
    ]);
    expect(findNextLesson(lessons, '10:00')?.id).toBe('l2');
    expect(findNextLesson(lessons, '18:00')?.id).toBe('l2');
    expect(findNextLesson(lessons, '22:00')).toBeNull();
    expect(findNextLesson([], '10:00')).toBeNull();
  });
});

describe('цель и часовой пояс ученика (BR-17)', () => {
  it('сохраняются при добавлении и обновлении', () => {
    const added = addStudent(ctx, stateWith(), {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1000,
      color: 'green',
      goal: 'Подготовка к ЕГЭ',
      timezone: 'Asia/Vladivostok',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.goal).toBe('Подготовка к ЕГЭ');
    expect(added.value.timezone).toBe('Asia/Vladivostok');

    const updated = updateStudent(ctx, added.state, added.value.id, {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1200,
      color: 'green',
      goal: '',
      timezone: '',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.goal).toBe('');
    expect(updated.value.timezone).toBe('');
  });

  it('слишком длинная цель отклоняется', () => {
    const result = addStudent(ctx, stateWith(), {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1000,
      color: 'green',
      goal: 'я'.repeat(GOAL_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
  });

  it('неизвестный часовой пояс отклоняется', () => {
    const result = addStudent(ctx, stateWith(), {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1000,
      color: 'green',
      timezone: 'Марс/Фобос' as StudentTimezone,
    });
    expect(result.ok).toBe(false);
  });

  it('цель обрезается пробелами при сохранении', () => {
    const result = addStudent(ctx, stateWith(), {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1000,
      color: 'green',
      goal: '  ЕГЭ  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.goal).toBe('ЕГЭ');
  });
});

describe('ученики и серии', () => {
  it('отключение ученика не удаляет его занятия и оплаты (BR-14)', () => {
    const state: AppState = withLessons(makeLesson({ status: 'done' }));
    const paid = addPayment(ctx, state, {
      studentId: 's1',
      lessonsCount: 2,
      paidAt: '2026-09-20',
      comment: '',
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const off = setStudentActive(paid.state, 's1', false);
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.state.students[0]?.active).toBe(false);
    expect(off.state.lessons).toHaveLength(1);
    expect(off.state.payments).toHaveLength(1);
  });

  it('закрытие серии не удаляет её занятия (BR-13)', () => {
    const state: AppState = {
      ...stateWith(),
      series: [
        {
          id: 'ser-1',
          studentId: 's1',
          slots: [{ weekday: 4, startTime: '18:00', durationMin: 60 }],
          startsOn: '2026-09-24',
          active: true,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
      lessons: [makeLesson({ id: 'l1', seriesId: 'ser-1' })],
    };
    const closed = setSeriesActive(state, 'ser-1', false);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.state.series[0]?.active).toBe(false);
    expect(closed.state.lessons).toHaveLength(1);
  });
});

describe('сортировка занятий недели', () => {
  it('сортирует по времени начала внутри дня (FR-3.9)', () => {
    const sorted = sortLessons([
      makeLesson({ id: 'b', startTime: '19:00' }),
      makeLesson({ id: 'a', startTime: '10:00' }),
      makeLesson({ id: 'c', startTime: '12:00' }),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });
});
