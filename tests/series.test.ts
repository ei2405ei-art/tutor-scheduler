import { describe, expect, it } from 'vitest';
import {
  buildSeriesLessons,
  firstOccurrence,
  horizonEnd,
  isSeriesInputValid,
  seriesDates,
} from '../src/domain/series.js';
import { addSeries, buildSeries, createContext, emptyState } from '../src/domain/commands.js';
import type { AppState, Lesson, LessonSeries } from '../src/domain/types.js';
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

function seriesOf(patch: Partial<LessonSeries> = {}): LessonSeries {
  return {
    id: 'ser-1',
    studentId: 's1',
    weekday: 3,
    startTime: '18:00',
    durationMin: 60,
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
      weekday: 3,
      startTime: '18:00',
      durationMin: 60,
      startsOn: MONDAY,
    };
    expect(isSeriesInputValid(good)).toBeNull();
    expect(isSeriesInputValid({ ...good, weekday: 0 })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, weekday: 8 })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, durationMin: 0 })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, startsOn: '21.09.2026' })).toBeTruthy();
    expect(isSeriesInputValid({ ...good, endsOn: '2026-09-01' })).toBeTruthy();
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
      startTime: series.startTime,
      durationMin: series.durationMin,
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

  it('отменённое занятие не считается конфликтом слота', () => {
    const result = build([
      lessonOf({ id: 'off', seriesId: null, date: '2026-10-07', status: 'cancelled' }),
    ]);
    expect(result.lessons.map((l) => l.date)).toContain('2026-10-07');
  });
});

describe('команда buildSeries', () => {
  it('второй вызов на той же горизонтной неделе не создаёт дублей', () => {
    const state = base();
    const created = addSeries(ctx, state, {
      studentId: 's1',
      weekday: 3,
      startTime: '18:00',
      durationMin: 60,
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
      weekday: 3,
      startTime: '18:00',
      durationMin: 60,
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
});
