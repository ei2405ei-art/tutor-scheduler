import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  MAX_IMPORT_BYTES,
  parseImport,
  rawFileName,
  serializeExport,
  summarizeState,
} from '../src/storage/backup.js';
import { SCHEMA_VERSION } from '../src/storage/schema.js';
import type { AppState } from '../src/domain/types.js';

function sampleState(): AppState {
  return {
    version: SCHEMA_VERSION,
    students: [
      {
        id: 's1',
        name: 'Иван',
        subject: 'Математика',
        contact: '',
        rate: 1000,
        timezone: 'Europe/Moscow',
        goal: '',
        color: 'blue',
        active: true,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    series: [],
    lessons: [
      {
        id: 'l1',
        studentId: 's1',
        date: '2026-09-28',
        startTime: '18:00',
        durationMin: 60,
        status: 'planned',
        isTrial: false,
        topicNote: '',
        homework: '',
        seriesId: null,
        movedToLessonId: null,
        movedFromLessonId: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    payments: [],
  };
}

describe('экспорт данных в файл (FR-6.7)', () => {
  it('выгружает JSON того же вида, что и хранилище', () => {
    const state = sampleState();
    const text = serializeExport(state);

    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(text) as Record<string, unknown>)).toEqual([
      'version',
      'students',
      'series',
      'lessons',
      'payments',
    ]);
  });

  it('повторный экспорт одного состояния даёт одинаковый файл', () => {
    expect(serializeExport(sampleState())).toBe(serializeExport(sampleState()));
  });

  it('выгруженный файл разбирается обратно без потерь (FR-6.8)', () => {
    const outcome = parseImport(serializeExport(sampleState()));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.students[0]).toMatchObject({ id: 's1', name: 'Иван', subject: 'Математика', rate: 1000 });
    expect(outcome.state.lessons[0]).toMatchObject({ id: 'l1', studentId: 's1', date: '2026-09-28', startTime: '18:00' });
    expect(outcome.preview).toEqual({
      version: SCHEMA_VERSION,
      counts: { students: 1, series: 0, lessons: 1, payments: 0 },
      corrupted: false,
      issues: [],
      migratedFrom: null,
    });
  });

  it('в файле нет ничего лишнего: только четыре сущности и версия', () => {
    const text = serializeExport({ ...sampleState(), extra: 'лишнее' } as unknown as AppState);
    expect(text.includes('extra')).toBe(false);
  });

  it('имя файла содержит локальную дату и время без Intl', () => {
    expect(exportFileName(new Date(2026, 8, 28, 17, 36))).toBe('tutor-scheduler-2026-09-28-1736.json');
    expect(exportFileName(new Date(2026, 11, 1, 7, 5))).toBe('tutor-scheduler-2026-12-01-0705.json');
  });

  it('имя файла для исходного JSON отличается от обычного', () => {
    expect(rawFileName(new Date(2026, 8, 28, 17, 36))).toBe('tutor-scheduler-2026-09-28-1736-raw.json');
  });

  it('сводка считает все четыре сущности', () => {
    expect(summarizeState(sampleState())).toEqual({ students: 1, series: 0, lessons: 1, payments: 0 });
  });
});

describe('разбор файла восстановления (FR-6.8)', () => {
  it('битый JSON отклоняется с объяснением', () => {
    const outcome = parseImport('{это не json');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('не является JSON');
  });

  it('пустой файл отклоняется', () => {
    const outcome = parseImport('   \n');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('пустой');
  });

  it('файл без версии отклоняется как повреждённый', () => {
    const outcome = parseImport('{"students": []}');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('повреждён');
  });

  it('файл из более новой версии отклоняется и называет версию', () => {
    const outcome = parseImport(
      JSON.stringify({ version: SCHEMA_VERSION + 1, students: [], series: [], lessons: [], payments: [] }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain(`более новой версией`);
    expect(outcome.error).toContain(String(SCHEMA_VERSION + 1));
  });

  it('файл больше лимита отклоняется до разбора', () => {
    const outcome = parseImport('{}', MAX_IMPORT_BYTES + 1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('слишком большой');
  });

  it('файл версии 2 мигрируется, предпросмотр показывает исходную версию', () => {
    const outcome = parseImport(
      JSON.stringify({
        version: 2,
        students: [{ id: 's1', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue', goal: '' }],
        series: [{ id: 'se1', studentId: 's1', weekday: 1, startTime: '18:00', durationMin: 60, startsOn: '2026-09-28', endsOn: '2026-10-19', closed: false }],
        lessons: [],
        payments: [],
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.version).toBe(SCHEMA_VERSION);
    expect(outcome.state.series[0]?.slots).toEqual([{ weekday: 1, startTime: '18:00', durationMin: 60 }]);
    expect(outcome.preview.migratedFrom).toBe(2);
  });

  it('испорченные записи в файле поправляются, а не отклоняются, и видны в предпросмотре', () => {
    const outcome = parseImport(
      JSON.stringify({
        version: SCHEMA_VERSION,
        students: [
          { id: 'ok', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue' },
          { id: 'bad', name: '', subject: 'Математика', rate: 1000, color: 'blue' },
        ],
        series: [],
        lessons: [],
        payments: [],
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.students).toHaveLength(1);
    expect(outcome.preview.corrupted).toBe(true);
    expect(outcome.preview.issues.length).toBeGreaterThan(0);
    expect(outcome.preview.counts.students).toBe(1);
  });
});