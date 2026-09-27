import { describe, expect, it } from 'vitest';
import {
  buildSeriesLessons,
  describeSlots,
  firstOccurrence,
  horizonEnd,
  isSeriesInputValid,
  lessonsPerWeekText,
  seriesDates,
  seriesSlotsError,
  sortSlots,
} from '../src/domain/series.js';
import { addSeries, buildSeries, createContext, emptyState } from '../src/domain/commands.js';
import type { AppState, Lesson, LessonSeries, SeriesSlot } from '../src/domain/types.js';
import { SERIES_HORIZON_WEEKS } from '../src/domain/types.js';

/* 2026-09-21 — понедельник */
const MONDAY = '2026-09-21';
const ctx = createContext(new Date(2026, 8, 21, 12, 0));

function base(): AppState {
  return {
    ...emptyState(1),
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
    ],
  };
}

function slotOf(patch: Partial<SeriesSlot> = {}): SeriesSlot {
  return { weekday: 3, startTime: '18:00', durationMin: 60, ...patch };
}

function seriesOf(patch: Partial<LessonSeries> = {}): LessonSeries {
  return {
    id: 'ser-1',
    studentId: 's1',
    slots: [slotOf()],
    startsOn: MONDAY,
    active: true,
    createdAt: '2026-09-21T00:00:00.000Z',
    ...patch,
  };
}

function lessonOf(patch: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l-1',
    studentId: 's1',
    date: '2026-09-23',
    startTime: '18:00',
    durationMin: 60,
    status: 'planned',
    isTrial: false,
    topicNote: '',
    homework: '',
    seriesId: null,
    movedToLessonId: null,
    movedFromLessonId: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    ...patch,
  };
}

describe('даты серии', () => {
  it('горизонт — 4 недели от startsOn (BR-3)', () => {
    expect(horizonEnd(MONDAY)).toBe('2026-10-18');
    expect(SERIES_HORIZON_WEEKS).toBe(4);
  });

  it('первое вхождение — ближайший нужный день недели начиная со startsOn', () => {
    expect(firstOccurrence(3, MONDAY)).toBe('2026-09-23');
    expect(firstOccurrence(1, MONDAY)).toBe('2026-09-21');
    expect(firstOccurrence(7, MONDAY)).toBe('2026-09-27');
  });

  it('создаёт 4 даты в горизонте', () => {
    expect(seriesDates(seriesOf())).toEqual([
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
      '2026-10-14',
    ]);
  });

  it('дни до startsOn не создаются', () => {
    // Старт в среду, серия по средам — первая дата это сам startsOn.
    expect(seriesDates(seriesOf({ startsOn: '2026-09-23' }))[0]).toBe('2026-09-23');
  });

  it('дни после endsOn не создаются', () => {
    expect(seriesDates(seriesOf({ endsOn: '2026-10-01' }))).toEqual(['2026-09-23', '2026-09-30']);
  });

  it('endsOn раньше первого вхождения даёт пустой набор', () => {
    expect(seriesDates(seriesOf({ startsOn: '2026-09-21', endsOn: '2026-09-21' }))).toEqual([]);
  });

  it('валидирует входные данные серии', () => {
    const good = {
      studentId: 's1',
      slots: [slotOf()],
      startsOn: MONDAY,
    };
    expect(isSeriesInputValid(good)).toBeNull();
    expect(isSeriesInputValid({ ...good, slots: [] })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, slots: [slotOf({ weekday: 0 })] })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, slots: [slotOf({ weekday: 8 })] })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, slots: [slotOf({ durationMin: 0 })] })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, slots: [slotOf({ startTime: '25:00' })] })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, startsOn: '21.09.2026' })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, endsOn: '2026-09-01' })).toBeTruthy();
  });
});

describe('слоты серии: любое число занятий в неделю (FR-2.4A)', () => {
  it('три слота дают по три занятия в неделю, 12 за горизонт', () => {
    const series = seriesOf({
      slots: [
        slotOf({ weekday: 1, startTime: '18:00' }),
        slotOf({ weekday: 3, startTime: '18:00' }),
        slotOf({ weekday: 6, startTime: '12:00' }),
      ],
    });
    const dates = seriesDates(series);
    expect(dates).toHaveLength(12);
    // Даты уникальны и идут по возрастанию.
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.slice(0, 4)).toEqual(['2026-09-21', '2026-09-23', '2026-09-26', '2026-09-28']);
  });

  it('у каждого дня своё время и своя длительность', () => {
    const built = buildSeriesLessons(
      seriesOf({
        slots: [
          slotOf({ weekday: 1, startTime: '09:00', durationMin: 90 }),
          slotOf({ weekday: 6, startTime: '12:00', durationMin: 60 }),
        ],
      }),
      [],
      {
        now: '2026-09-21T00:00:00.000Z',
        createId: (() => {
          let i = 0;
          return () => `gen-${++i}`;
        })(),
        seriesId: 'ser-1',
        studentId: 's1',
      },
    );
    const monday = built.lessons.find((l) => l.date === '2026-09-21');
    const saturday = built.lessons.find((l) => l.date === '2026-09-26');
    expect(monday).toMatchObject({ startTime: '09:00', durationMin: 90 });
    expect(saturday).toMatchObject({ startTime: '12:00', durationMin: 60 });
    expect(built.lessons).toHaveLength(8);
  });

  it('семь слотов дают по одному занятию каждый день', () => {
    const slots = [1, 2, 3, 4, 5, 6, 7].map((weekday) => slotOf({ weekday, startTime: '10:00' }));
    const dates = seriesDates(seriesOf({ slots }));
    expect(dates).toHaveLength(28);
    expect(new Set(dates).size).toBe(28);
  });

  it('повторный запуск с несколькими слотами не создаёт дублей (FR-2.6)', () => {
    const series = seriesOf({
      slots: [slotOf({ weekday: 1 }), slotOf({ weekday: 3 }), slotOf({ weekday: 6 })],
    });
    const options = {
      now: '2026-09-21T00:00:00.000Z',
      createId: (() => {
        let i = 0;
        return () => `gen-${++i}`;
      })(),
      seriesId: series.id,
      studentId: series.studentId,
    };
    const first = buildSeriesLessons(series, [], options);
    const second = buildSeriesLessons(series, first.lessons, options);
    expect(first.lessons).toHaveLength(12);
    expect(second.lessons).toEqual([]);
  });

  it('не больше одного слота на день недели (BR-3A)', () => {
    const slots = [slotOf({ weekday: 1 }), slotOf({ weekday: 1, startTime: '19:00' })];
    expect(seriesSlotsError(slots)).toBe('День недели уже занят в этой серии.');
    expect(isSeriesInputValid({ studentId: 's1', slots, startsOn: MONDAY })).toBeTruthy();
  });

  it('слоты сортируются по дню недели', () => {
    const sorted = sortSlots([slotOf({ weekday: 6 }), slotOf({ weekday: 1 }), slotOf({ weekday: 3 })]);
    expect(sorted.map((s) => s.weekday)).toEqual([1, 3, 6]);
  });

  it('тексты расписания читаются на телефоне (FR-2.4B)', () => {
    const slots = [slotOf({ weekday: 1 }), slotOf({ weekday: 6, startTime: '12:00', durationMin: 90 })];
    expect(describeSlots(slots)).toBe('Пн 18:00 – 19:00, Сб 12:00 – 13:30');
    expect(lessonsPerWeekText(slots)).toBe('2 занятия в неделю');
    expect(lessonsPerWeekText([slotOf()])).toBe('1 занятие в неделю');
    expect(lessonsPerWeekText(slots.slice(0, 1))).toBe('1 занятие в неделю');
    expect(lessonsPerWeekText([slotOf(), slotOf({ weekday: 2 }), slotOf({ weekday: 3 }), slotOf({ weekday: 4 }), slotOf({ weekday: 5 })])).toBe(
      '5 занятий в неделю',
    );
    expect(lessonsPerWeekText([])).toBe('Дней нет');
  });
});

describe('генерация занятий серии', () => {
  const build = (existing: Lesson[] = [], series = seriesOf()) =>
    buildSeriesLessons(series, existing, {
      now: '2026-09-21T00:00:00.000Z',
      createId: (() => {
        let i = 0;
        return () => `gen-${++i}`;
      })(),
      seriesId: series.id,
      studentId: series.studentId,
    });

  it('создаёт 4 занятия в статусе planned', () => {
    const result = build();
    expect(result.lessons).toHaveLength(4);
    expect(result.conflicts).toEqual([]);
    expect(result.lessons.every((l) => l.status === 'planned')).toBe(true);
    expect(result.lessons.every((l) => l.seriesId === 'ser-1')).toBe(true);
  });

  it('для пары (seriesId, date) существует не более одного занятия (BR-2)', () => {
    const result = build([lessonOf({ id: 'old', seriesId: 'ser-1', date: '2026-09-30' })]);
    const dates = result.lessons.map((l) => l.date);
    expect(dates).not.toContain('2026-09-30');
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('повторный запуск генерации не создаёт дублей (FR-2.6)', () => {
    const first = build();
    const second = build(first.lessons);
    expect(second.lessons).toEqual([]);
  });

  it('занятый слот пропускается и попадает в conflicts', () => {
    const result = build([lessonOf({ id: 'busy', seriesId: null, date: '2026-10-07' })]);
    expect(result.lessons.map((l) => l.date)).not.toContain('2026-10-07');
    expect(result.conflicts).toEqual(['2026-10-07']);
  });

  it('занятый слот одного дня не мешает слоту другого дня', () => {
    const series = seriesOf({
      slots: [slotOf({ weekday: 1, startTime: '18:00' }), slotOf({ weekday: 3, startTime: '18:00' })],
    });
    // Понедельник 18:00 занято другим учеником — среда должна создаться.
    const result = build([lessonOf({ id: 'busy', seriesId: null, date: '2026-09-21' })], series);
    expect(result.conflicts).toEqual(['2026-09-21']);
    expect(result.lessons).toHaveLength(7);
    expect(result.lessons[0]?.date).toBe('2026-09-23');
  });

  it('отменённое занятие не считается конфликтом слота', () => {
    const result = build([
      lessonOf({ id: 'off', seriesId: null, date: '2026-10-07', status: 'cancelled' }),
    ]);
    expect(result.lessons.map((l) => l.date)).toContain('2026-10-07');
  });
});

describe('команда addSeries со слотами', () => {
  it('создаёт столько занятий, сколько слотов в неделю', () => {
    const state = base();
    const created = addSeries(ctx, state, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 }), slotOf({ weekday: 3 }), slotOf({ weekday: 6, startTime: '12:00' })],
      startsOn: MONDAY,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.created).toBe(12);
    expect(created.value.series.slots.map((s) => s.weekday)).toEqual([1, 3, 6]);
    expect(created.message).toContain('3 занятия в неделю');
  });

  it('второй вызов на той же горизонтной неделе не создаёт дублей', () => {
    const state = base();
    const created = addSeries(ctx, state, {
      studentId: 's1',
      slots: [slotOf()],
      startsOn: MONDAY,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.created).toBe(4);

    const again = buildSeries(ctx, created.state, created.value.series.id);
    expect(again.ok).toBe(false);
  });

  it('закрытая серия не достраивается', () => {
    const state = base();
    const created = addSeries(ctx, state, {
      studentId: 's1',
      slots: [slotOf()],
      startsOn: MONDAY,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const closed = { ...created.state, series: created.state.series.map((s) => ({ ...s, active: false })) };
    const result = buildSeries(ctx, closed, created.value.series.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('закрыта');
  });

  it('занятый слот пропускается, а свободные слоты той же серии создаются', () => {
    const state = base();
    const first = addSeries(ctx, state, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 })],
      startsOn: MONDAY,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Понедельник уже занят первой серией, среда в 12:00 свободна.
    const second = addSeries(ctx, first.state, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 }), slotOf({ weekday: 3, startTime: '12:00' })],
      startsOn: MONDAY,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.conflicts).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    expect(second.value.created).toBe(4);
    expect(second.value.series.slots).toHaveLength(2);
    expect(second.message).toContain('Пропущено из-за занятых слотов: 4');
  });

  it('отказ называет ученика, который занимает слот (FR-2.9)', () => {
    const state = base();
    const busy = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((date, i) =>
      lessonOf({ id: `busy-${i}`, seriesId: null, date, startTime: '18:00' }),
    );
    const blocked = addSeries(ctx, { ...state, lessons: busy }, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 })],
      startsOn: MONDAY,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain('21 сентября');
    expect(blocked.error).toContain('18:00 – 19:00');
    expect(blocked.error).toContain('у ученика Иван');
  });

  it('объяснение отказа совпадает с правилом занятого слота при переносе', () => {
    // Перенесённое занятие остаётся в своей ячейке недели и держит слот.
    // Если занят весь недельный рисунок, отказ должен называть ученика, а не
    // молчать «о другое занятие».
    const state = base();
    const moved = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'].map((date, i) =>
      lessonOf({ id: `moved-${i}`, seriesId: null, date, status: 'moved' }),
    );
    const blocked = addSeries(ctx, { ...state, lessons: moved }, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 })],
      startsOn: MONDAY,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain('у ученика Иван');
  });

  it('отменённое занятие слот серии не занимает', () => {
    const state = base();
    const cancelled = lessonOf({ id: 'off', seriesId: null, date: '2026-09-21', status: 'cancelled' });
    const created = addSeries(ctx, { ...state, lessons: [cancelled] }, {
      studentId: 's1',
      slots: [slotOf({ weekday: 1 })],
      startsOn: MONDAY,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.created).toBe(4);
  });
});
