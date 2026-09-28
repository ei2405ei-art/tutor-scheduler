import { describe, expect, it } from 'vitest';
import {
  addOneOffLesson,
  addSeries,
  addStudent,
  buildSeries,
  cancelLesson,
  createContext,
  emptyState,
  moveLesson,
  type CommandContext,
} from '../src/domain/commands.js';
import { conflictDays, findScheduleConflicts } from '../src/domain/conflicts.js';
import type { AppState, Lesson, LessonStatus } from '../src/domain/types.js';

const NOW = '2026-09-20T10:00:00.000Z';
const MON = '2026-09-21';
const THU = '2026-09-24';

function ctx(): CommandContext {
  return { ...createContext(new Date(2026, 8, 20, 10, 0)), now: NOW, today: MON };
}

function stateWithStudents(c: CommandContext): AppState {
  let state = emptyState(3);
  state = addStudent(c, state, {
    name: 'Свелана',
    subject: 'Английский',
    contact: '',
    rate: 1000,
    color: 'blue',
  }).state;
  state = addStudent(c, state, {
    name: 'Анжела',
    subject: 'Английский',
    contact: '',
    rate: 1000,
    color: 'green',
  }).state;
  return state;
}

function studentIds(state: AppState): [string, string] {
  return [state.students[0]!.id, state.students[1]!.id];
}

/** Занятие ручной сборки: так выглядят данные, пришедшие не из этого приложения. */
function makeLesson(input: {
  id: string;
  studentId: string;
  date: string;
  startTime: string;
  durationMin?: number;
  status?: LessonStatus;
  createdAt?: string;
}): Lesson {
  return {
    id: input.id,
    studentId: input.studentId,
    date: input.date,
    startTime: input.startTime,
    durationMin: input.durationMin ?? 60,
    status: input.status ?? 'planned',
    isTrial: false,
    topicNote: '',
    homework: '',
    seriesId: null,
    movedToLessonId: null,
    movedFromLessonId: null,
    createdAt: input.createdAt ?? NOW,
    updatedAt: input.createdAt ?? NOW,
  };
}

function lastLesson(state: AppState): Lesson {
  return state.lessons[state.lessons.length - 1]!;
}

function toMin(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Все пары занятий с пересекающимися интервалами, кроме отменённых. */
function overlaps(state: AppState): string[] {
  const active = state.lessons.filter((l) => l.status !== 'cancelled');
  const found: string[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]!;
      const b = active[j]!;
      if (a.date !== b.date) continue;
      const clash = toMin(a.startTime) < toMin(b.startTime) + b.durationMin && toMin(b.startTime) < toMin(a.startTime) + a.durationMin;
      if (clash) found.push(`${a.date} ${a.startTime}/${a.durationMin} и ${b.startTime}/${b.durationMin}`);
    }
  }
  return found;
}

describe('поиск пересечений в данных (BR-2A)', () => {
  it('находит два занятия на одно время', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00' }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:00' }),
      ],
    };

    const conflicts = findScheduleConflicts(state);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.date).toBe(MON);
    expect([conflicts[0]?.first.id, conflicts[0]?.second.id]).toEqual(['l1', 'l2']);
  });

  it('частичное пересечение тоже находится', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00', durationMin: 60 }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:30', durationMin: 60 }),
      ],
    };
    expect(findScheduleConflicts(state)).toHaveLength(1);
  });

  it('касание границы пересечением не считается', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00', durationMin: 60 }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '19:00', durationMin: 60 }),
      ],
    };
    expect(findScheduleConflicts(state)).toEqual([]);
  });

  it('отменённое занятие слот освобождает, перенесённое и проведённое — нет', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const base = (status: LessonStatus): AppState => ({
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00' }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:00', status }),
      ],
    });

    expect(findScheduleConflicts(base('cancelled'))).toEqual([]);
    expect(findScheduleConflicts(base('moved'))).toHaveLength(1);
    expect(findScheduleConflicts(base('done'))).toHaveLength(1);
  });

  it('находит пересечение в любой дате, а не только на текущей неделе', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: '2026-12-14', startTime: '10:00' }),
        makeLesson({ id: 'l2', studentId: b, date: '2026-12-14', startTime: '10:00' }),
      ],
    };
    expect(findScheduleConflicts(state).map((x) => x.date)).toEqual(['2026-12-14']);
  });

  it('находит пересечение у закрытого ученика: это проблема данных, а не вида недели', () => {
    const c = ctx();
    const base = stateWithStudents(c);
    const [a, b] = studentIds(base);
    const state: AppState = {
      ...base,
      students: base.students.map((s) => (s.id === b ? { ...s, active: false } : s)),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00' }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:00' }),
      ],
    };
    expect(findScheduleConflicts(state)).toHaveLength(1);
  });

  it('порядок пересечений — по дате и времени', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: THU, startTime: '19:00' }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:30' }),
        makeLesson({ id: 'l3', studentId: b, date: MON, startTime: '18:00' }),
        makeLesson({ id: 'l4', studentId: a, date: THU, startTime: '19:30' }),
      ],
    };
    expect(findScheduleConflicts(state).map((x) => `${x.date} ${x.first.startTime}`)).toEqual([
      `${MON} 18:00`,
      `${THU} 19:00`,
    ]);
  });

  it('три занятия на один слот дают один день с тремя строками', () => {
    const c = ctx();
    const [a, b] = studentIds(stateWithStudents(c));
    const state: AppState = {
      ...stateWithStudents(c),
      lessons: [
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:00', createdAt: '2026-09-20T10:05:00.000Z' }),
        makeLesson({ id: 'l3', studentId: b, date: MON, startTime: '18:00', createdAt: '2026-09-20T10:10:00.000Z' }),
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00', createdAt: '2026-09-20T10:00:00.000Z' }),
      ],
    };

    const days = conflictDays(findScheduleConflicts(state));
    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe(MON);
    expect(days[0]?.lessons.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('в пустом расписании пересечений нет', () => {
    expect(findScheduleConflicts(emptyState(3))).toEqual([]);
  });
});

describe('найденное пересечение согласуется с защитой при создании (BR-2)', () => {
  it('занятие на занятом пересечением времени не создаётся ни разовым, ни серией', () => {
    const c = ctx();
    const base = stateWithStudents(c);
    const [a, b] = studentIds(base);
    const withConflict: AppState = {
      ...base,
      lessons: [
        makeLesson({ id: 'l1', studentId: a, date: MON, startTime: '18:00' }),
        makeLesson({ id: 'l2', studentId: b, date: MON, startTime: '18:00' }),
      ],
    };

    const oneOff = addOneOffLesson(c, withConflict, {
      studentId: a,
      date: MON,
      startTime: '18:00',
      durationMin: 60,
    });
    expect(oneOff.ok).toBe(false);

    const series = addSeries(c, withConflict, {
      studentId: a,
      slots: [{ weekday: 1, startTime: '18:00', durationMin: 60 }],
      startsOn: MON,
    });
    // Серия создаётся частично: занятая дата пропускается, остальные — нет.
    expect(series.ok).toBe(true);
    expect(series.state.lessons.filter((l) => l.date === MON)).toHaveLength(2);
    expect(findScheduleConflicts(series.state)).toHaveLength(1);
  });
});

describe('ни один путь создания не допускает пересечения (BR-2)', () => {
  const slot = (weekday: number, startTime: string, durationMin = 60) => ({
    weekday,
    startTime,
    durationMin,
  });

  it('разовое занятие поверх разового отклоняется', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const two = addOneOffLesson(c, one.state, { studentId: b, date: MON, startTime: '18:00', durationMin: 60 });
    expect(two.ok).toBe(false);
  });

  it('пробное занятие поверх обычного отклоняется', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const two = addOneOffLesson(c, one.state, {
      studentId: b,
      date: MON,
      startTime: '18:00',
      durationMin: 60,
      isTrial: true,
    });
    expect(two.ok).toBe(false);
  });

  it('соседние интервалы не конфликтуют', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const two = addOneOffLesson(c, one.state, { studentId: b, date: MON, startTime: '19:00', durationMin: 60 });
    expect(two.ok).toBe(true);
  });

  it('разовое занятие поверх серии отклоняется', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const series = addSeries(c, state, { studentId: a, slots: [slot(1, '18:00')], startsOn: MON }, 4);
    const one = addOneOffLesson(c, series.state, { studentId: b, date: MON, startTime: '18:00', durationMin: 60 });
    expect(one.ok).toBe(false);
  });

  it('серия поверх серии на тот же слот отклоняется', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const first = addSeries(c, state, { studentId: a, slots: [slot(1, '18:00')], startsOn: MON }, 4);
    const second = addSeries(c, first.state, { studentId: b, slots: [slot(1, '18:00')], startsOn: MON }, 4);
    expect(second.ok).toBe(false);
  });

  it('серия поверх разового занятия пропускает занятую дату и не создаёт дубль', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const series = addSeries(c, one.state, { studentId: b, slots: [slot(1, '18:00')], startsOn: MON }, 4);
    expect(overlaps(series.state)).toEqual([]);
  });

  it('серия, начинающаяся позже, не создаёт дубль на датах первой серии', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const first = addSeries(c, state, { studentId: a, slots: [slot(1, '18:00')], startsOn: MON }, 4);
    const second = addSeries(c, first.state, { studentId: b, slots: [slot(1, '18:00')], startsOn: '2026-09-28' }, 4);
    expect(overlaps(second.state)).toEqual([]);
  });

  it('достройка серии не создаёт дубль', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const first = addSeries(c, state, { studentId: a, slots: [slot(1, '18:00')], startsOn: MON }, 1);
    const second = addSeries(c, first.state, { studentId: b, slots: [slot(1, '20:00')], startsOn: MON }, 1);
    const seriesId = second.state.series[1]!.id;
    const grown = buildSeries(c, second.state, seriesId, 4);
    expect(overlaps(grown.state)).toEqual([]);
  });

  it('перенос на занятый слот отклоняется', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const two = addOneOffLesson(c, one.state, { studentId: b, date: '2026-09-23', startTime: '18:00', durationMin: 60 });
    const moved = moveLesson(c, two.state, lastLesson(two.state).id, {
      date: MON,
      startTime: '18:00',
      durationMin: 60,
    });
    expect(moved.ok).toBe(false);
  });

  it('отмена освобождает слот', () => {
    const c = ctx();
    const state = stateWithStudents(c);
    const [a, b] = studentIds(state);
    const one = addOneOffLesson(c, state, { studentId: a, date: MON, startTime: '18:00', durationMin: 60 });
    const cancelled = cancelLesson(c, one.state, one.state.lessons[0]!.id);
    const two = addOneOffLesson(c, cancelled.state, { studentId: b, date: MON, startTime: '18:00', durationMin: 60 });
    expect(two.ok).toBe(true);
    expect(overlaps(two.state)).toEqual([]);
  });
});
