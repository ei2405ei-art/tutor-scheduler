import { describe, expect, it } from 'vitest';
import { RECOVERY_KEY, repairState, SCHEMA_VERSION, STORAGE_KEY, emptyAppState } from '../src/storage/schema.js';
import { SchedulerStorage, type StorageLike } from '../src/storage/repository.js';
import { parseImport } from '../src/storage/backup.js';
import { AppStore } from '../src/app/store.js';
import { addPayment, addSeries, addStudent, buildSeries, createContext } from '../src/domain/commands.js';
import type { AppState } from '../src/domain/types.js';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  failOnWrite = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new Error('quota exceeded');
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('валидация и починка загруженных данных', () => {
  it('пустое хранилище даёт готовое пустое состояние', () => {
    const storage = new SchedulerStorage(new MemoryStorage());
    const outcome = storage.load();
    expect(outcome.kind).toBe('ready');
    if (outcome.kind !== 'ready') return;
    expect(outcome.state).toEqual(emptyAppState());
    expect(outcome.report).toBeNull();
  });

  it('некорректный JSON сохраняется в резервный слот и не удаляется (FR-6.4)', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '{это не json');
    const storage = new SchedulerStorage(mem);

    const outcome = storage.load();
    expect(outcome.kind).toBe('broken');
    if (outcome.kind !== 'broken') return;
    expect(mem.getItem(RECOVERY_KEY)).toBe('{это не json');
    expect(mem.getItem(STORAGE_KEY)).toBe('{это не json');
  });

  it('более новая версия схемы не трогается', () => {
    const mem = new MemoryStorage();
    const raw = JSON.stringify({ version: SCHEMA_VERSION + 1, students: [], series: [], lessons: [], payments: [] });
    mem.setItem(STORAGE_KEY, raw);

    const outcome = new SchedulerStorage(mem).load();
    expect(outcome.kind).toBe('unsupported-version');
    expect(mem.getItem(STORAGE_KEY)).toBe(raw);
    expect(mem.getItem(RECOVERY_KEY)).toBe(raw);
  });

  it('битые записи отбрасываются, корректные сохраняются', () => {
    const outcome = repairState({
      version: 1,
      students: [
        { id: 'ok', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue' },
        { id: 'bad', name: '', subject: 'Математика', rate: 1000, color: 'blue' },
      ],
      series: [],
      lessons: [],
      payments: [],
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.students).toHaveLength(1);
    expect(outcome.report.corrupted).toBe(true);
    expect(outcome.report.dropped.students).toBe(1);
    expect(outcome.report.issues.length).toBeGreaterThan(0);
  });

  it('занятие без ученика отбрасывается', () => {
    const outcome = repairState({
      version: 1,
      students: [],
      lessons: [
        {
          id: 'l1',
          studentId: 'missing',
          date: '2026-09-24',
          startTime: '18:00',
          durationMin: 60,
          status: 'planned',
        },
      ],
      series: [],
      payments: [],
    });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.lessons).toHaveLength(0);
    expect(outcome.report.dropped.lessons).toBe(1);
  });

  it('дубль пары (серия, дата) отбрасывается', () => {
    const base = {
      version: 1,
      students: [{ id: 's1', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue' }],
      series: [
        { id: 'ser1', studentId: 's1', weekday: 4, startTime: '18:00', durationMin: 60, startsOn: '2026-09-24' },
      ],
      lessons: [
        { id: 'a', studentId: 's1', seriesId: 'ser1', date: '2026-09-24', startTime: '18:00', durationMin: 60, status: 'planned' },
        { id: 'b', studentId: 's1', seriesId: 'ser1', date: '2026-09-24', startTime: '18:00', durationMin: 60, status: 'planned' },
      ],
      payments: [],
    };
    const outcome = repairState(base);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.lessons).toHaveLength(1);
    expect(outcome.report.dropped.lessons).toBe(1);
  });

  it('оборванная связь переноса обнуляется, а не показывается пустотой', () => {
    const outcome = repairState({
      version: 1,
      students: [{ id: 's1', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue' }],
      series: [],
      lessons: [
        {
          id: 'a',
          studentId: 's1',
          date: '2026-09-24',
          startTime: '18:00',
          durationMin: 60,
          status: 'moved',
          movedToLessonId: 'vanished',
        },
      ],
      payments: [],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.lessons[0]?.movedToLessonId).toBeNull();
  });

  it('некорректные даты и времена в занятии отбрасываются', () => {
    const outcome = repairState({
      version: 1,
      students: [{ id: 's1', name: 'Иван', subject: 'Математика', rate: 1000, color: 'blue' }],
      series: [],
      lessons: [
        { id: 'a', studentId: 's1', date: '24.09.2026', startTime: '18:00', durationMin: 60, status: 'planned' },
        { id: 'b', studentId: 's1', date: '2026-09-24', startTime: '25:00', durationMin: 60, status: 'planned' },
        { id: 'c', studentId: 's1', date: '2026-09-24', startTime: '18:00', durationMin: 0, status: 'planned' },
        { id: 'd', studentId: 's1', date: '2026-09-24', startTime: '18:00', durationMin: 60, status: 'выполнено' },
      ],
      payments: [],
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.lessons).toHaveLength(0);
    expect(outcome.report.dropped.lessons).toBe(4);
  });

  it('отсутствие версии считается повреждением', () => {
    const outcome = repairState({ students: [] });
    expect(outcome.kind).toBe('broken');
  });
});

describe('недоступность хранилища', () => {
  it('при недоступном localStorage загрузка сообщает причину (FR-6.5)', () => {
    const storage = new SchedulerStorage(null);
    expect(storage.available).toBe(false);
    const outcome = storage.load();
    expect(outcome.kind).toBe('unavailable');
  });

  it('недоступное хранилище блокирует изменяющие действия', () => {
    const store = new AppStore(new SchedulerStorage(null));
    expect(store.canWrite()).toBe(false);

    const result = store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Иван',
      subject: 'Математика',
      contact: '',
      rate: 1000,
      color: 'blue',
    }));

    expect(result.ok).toBe(false);
    expect(store.getState().students).toHaveLength(0);
    expect(store.getToast()?.kind).toBe('error');
  });

  it('ошибка записи не применяет изменённое состояние', () => {
    const mem = new MemoryStorage();
    const store = new AppStore(new SchedulerStorage(mem));
    mem.failOnWrite = true;

    const result = store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Иван',
      subject: 'Математика',
      contact: '',
      rate: 1000,
      color: 'blue',
    }));

    expect(result.ok).toBe(false);
    expect(store.getState().students).toHaveLength(0);
  });
});

describe('сохранение между перезапусками', () => {
  it('данные переживают перезапуск приложения', () => {
    const mem = new MemoryStorage();
    const first = new AppStore(new SchedulerStorage(mem));
    first.setNow(new Date(2026, 8, 24, 10, 0));

    const added = first.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Иван',
      subject: 'Математика',
      contact: 'телефон не указан',
      rate: 1200,
      color: 'blue',
    }));
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const paid = first.dispatch((ctx, state) => addPayment(ctx, state, {
      studentId: added.value!.id,
      lessonsCount: 10,
      paidAt: '2026-09-20',
      comment: 'аванс',
    }));
    expect(paid.ok).toBe(true);

    const second = new AppStore(new SchedulerStorage(mem));
    expect(second.getState().students).toHaveLength(1);
    expect(second.getState().students[0]?.name).toBe('Иван');
    expect(second.getState().payments).toHaveLength(1);
    expect(second.getStatus().kind).toBe('ready');
  });

  it('частично повреждённые данные чинятся, исходный JSON уходит в резервный слот (FR-6.4)', () => {
    const mem = new MemoryStorage();
    const raw = JSON.stringify({ version: 1, students: [{ id: 'x' }] });
    mem.setItem(STORAGE_KEY, raw);

    const store = new AppStore(new SchedulerStorage(mem));
    expect(store.getStatus().kind).toBe('ready');
    expect(store.getRepairIssues().length).toBeGreaterThan(0);
    expect(store.getState().students).toHaveLength(0);
    expect(mem.getItem(RECOVERY_KEY)).toBe(raw);
    expect(mem.getItem(STORAGE_KEY)).toBe(raw);
  });
});

describe('уведомления', () => {
  it('успешная команда сообщает результат, ошибка — причину', () => {
    const store = new AppStore(new SchedulerStorage(new MemoryStorage()));
    store.setNow(new Date(2026, 8, 24, 10, 0));

    store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Иван',
      subject: 'Математика',
      contact: '',
      rate: 1200,
      color: 'blue',
    }));
    expect(store.getToast()?.kind).toBe('info');

    store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: '',
      subject: 'Математика',
      contact: '',
      rate: 1200,
      color: 'blue',
    }));
    expect(store.getToast()?.kind).toBe('error');
  });

  it('подписчики вызываются при изменении состояния', () => {
    const store = new AppStore(new SchedulerStorage(new MemoryStorage()));
    store.setNow(new Date(2026, 8, 24, 10, 0));
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Иван',
      subject: 'Математика',
      contact: '',
      rate: 1200,
      color: 'blue',
    }));
    expect(calls).toBe(1);

    unsubscribe();
    store.dispatch((ctx, state) => addStudent(ctx, state, {
      name: 'Анна',
      subject: 'Английский',
      contact: '',
      rate: 1000,
      color: 'green',
    }));
    expect(calls).toBe(1);
  });
});

describe('схема хранилища', () => {
  it('ключи и версия стабильны', () => {
    expect(STORAGE_KEY).toBe('tutor-scheduler:state');
    expect(RECOVERY_KEY).toBe('tutor-scheduler:state:recovery');
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('состояние версионировано', () => {
    const state: AppState = emptyAppState();
    expect(state.version).toBe(SCHEMA_VERSION);
  });

  it('данные версии 1 мигрируют: ученик получает пустые поля, занятие — isTrial', () => {
    const legacy = {
      version: 1,
      students: [
        {
          id: 's1',
          name: 'Иван',
          subject: 'Математика',
          contact: '',
          rate: 1200,
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
          date: '2026-09-24',
          startTime: '18:00',
          durationMin: 60,
          status: 'planned',
          topicNote: '',
          homework: '',
          seriesId: null,
          movedToLessonId: null,
          movedFromLessonId: null,
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        },
      ],
      payments: [],
    };

    const outcome = repairState(legacy);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;

    expect(outcome.state.version).toBe(SCHEMA_VERSION);
    expect(outcome.state.students[0]?.goal).toBe('');
    expect(outcome.state.students[0]?.timezone).toBe('');
    expect(outcome.state.lessons[0]?.isTrial).toBe(false);
    // Данные не теряются и не требуют ручной правки.
    expect(outcome.state.students[0]?.name).toBe('Иван');
    expect(outcome.state.lessons).toHaveLength(1);
  });

  it('некорректные новые поля в данных версии 2 заменяются безопасными значениями', () => {
    const raw = {
      version: 2,
      students: [
        {
          id: 's1',
          name: 'Иван',
          subject: 'Математика',
          contact: '',
          rate: 1200,
          color: 'blue',
          active: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          timezone: 'Марс/Фобос',
          goal: { unexpected: true },
        },
      ],
      series: [],
      lessons: [],
      payments: [],
    };

    const outcome = repairState(raw);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.students[0]?.timezone).toBe('');
    expect(outcome.state.students[0]?.goal).toBe('');
  });

  it('данные версии 2 мигрируют: серия получает слот из старых полей (FR-6.3)', () => {
    const raw = {
      version: 2,
      students: [
        {
          id: 's1',
          name: 'Иван',
          subject: 'Математика',
          contact: '',
          rate: 1200,
          color: 'blue',
          active: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          timezone: '',
          goal: '',
        },
      ],
      series: [
        {
          id: 'ser1',
          studentId: 's1',
          weekday: 4,
          startTime: '18:00',
          durationMin: 90,
          startsOn: '2026-09-24',
          active: true,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
      lessons: [],
      payments: [],
    };

    const outcome = repairState(raw);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.state.version).toBe(SCHEMA_VERSION);
    const series = outcome.state.series[0];
    expect(series?.slots).toEqual([{ weekday: 4, startTime: '18:00', durationMin: 90 }]);
    // Старое расписание продолжает работать без ручной правки.
    expect(series?.startsOn).toBe('2026-09-24');
    expect(series).not.toHaveProperty('weekday');
    expect(series).not.toHaveProperty('startTime');
    expect(series).not.toHaveProperty('durationMin');
  });

  it('после миграции 2 → 3 серия достраивается по слоту (FR-2.6)', () => {
    const raw = {
      version: 2,
      students: [
        {
          id: 's1',
          name: 'Иван',
          subject: 'Математика',
          contact: '',
          rate: 1200,
          color: 'blue',
          active: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          timezone: '',
          goal: '',
        },
      ],
      series: [
        {
          id: 'ser1',
          studentId: 's1',
          weekday: 4,
          startTime: '18:00',
          durationMin: 60,
          startsOn: '2026-09-24',
          active: true,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
      lessons: [
        {
          id: 'l1',
          studentId: 's1',
          seriesId: 'ser1',
          date: '2026-09-24',
          startTime: '18:00',
          durationMin: 60,
          status: 'planned',
          isTrial: false,
          topicNote: '',
          homework: '',
          movedToLessonId: null,
          movedFromLessonId: null,
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        },
      ],
      payments: [],
    };

    const outcome = repairState(raw);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;

    const ctx = createContext(new Date(2026, 8, 24, 10, 0));
    const built = buildSeries(ctx, outcome.state, 'ser1');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Уже созданное 24.09 не дублируется, горизонт достраивается.
    const dates = built.state.lessons.map((l) => l.date);
    expect(dates.filter((d) => d === '2026-09-24')).toHaveLength(1);
    expect(dates).toContain('2026-10-01');
    expect(dates).toHaveLength(4);
  });

  it('слоты серии переживают цикл сохранения и загрузки (FR-6.3)', () => {
    const mem = new MemoryStorage();
    const storage = new SchedulerStorage(mem);
    const store = new AppStore(storage);
    store.setNow(new Date(2026, 8, 21, 12, 0));

    store.dispatch((ctx, state) =>
      addStudent(ctx, state, {
        name: 'Анна',
        subject: 'Английский',
        contact: '',
        rate: 1000,
        color: 'green',
        goal: '',
        timezone: '',
      }),
    );
    const studentId = store.getState().students[0]?.id ?? '';
    store.dispatch((ctx, state) =>
      addSeries(ctx, state, {
        studentId,
        slots: [
          { weekday: 1, startTime: '18:00', durationMin: 60 },
          { weekday: 6, startTime: '12:00', durationMin: 90 },
        ],
        startsOn: '2026-09-21',
      }),
    );

    const reloaded = new AppStore(new SchedulerStorage(mem));
    expect(reloaded.getState().series[0]?.slots).toEqual([
      { weekday: 1, startTime: '18:00', durationMin: 60 },
      { weekday: 6, startTime: '12:00', durationMin: 90 },
    ]);
    expect(reloaded.getState().lessons).toHaveLength(8);
  });

  it('новые поля переживают цикл сохранения и загрузки', () => {
    const mem = new MemoryStorage();
    const storage = new SchedulerStorage(mem);
    const store = new AppStore(storage);
    store.setNow(new Date(2026, 8, 24, 10, 0));

    store.dispatch((ctx, state) =>
      addStudent(ctx, state, {
        name: 'Анна',
        subject: 'Английский',
        contact: '',
        rate: 1000,
        color: 'green',
        goal: 'ЕГЭ',
        timezone: 'Europe/Kaliningrad',
      }),
    );

    const reloaded = new AppStore(new SchedulerStorage(mem));
    expect(reloaded.getState().students[0]?.goal).toBe('ЕГЭ');
    expect(reloaded.getState().students[0]?.timezone).toBe('Europe/Kaliningrad');
  });
});

describe('экспорт и восстановление из файла (FR-6.7, FR-6.8)', () => {
  function addStudentTo(store: AppStore): void {
    store.setNow(new Date(2026, 8, 21, 12, 0));
    store.dispatch((ctx, state) =>
      addStudent(ctx, state, {
        name: 'Анна',
        subject: 'Английский',
        contact: '',
        rate: 1000,
        color: 'green',
        goal: '',
        timezone: '',
      }),
    );
  }

  function filledState(): AppState {
    const store = new AppStore(new SchedulerStorage(new MemoryStorage()));
    addStudentTo(store);
    return store.getState();
  }

  it('экспорт работает всегда и даёт файл с датой в имени', () => {
    const mem = new MemoryStorage();
    const store = new AppStore(new SchedulerStorage(mem));
    store.setNow(new Date(2026, 8, 28, 17, 36));

    const payload = store.exportPayload();
    expect(payload?.fileName).toBe('tutor-scheduler-2026-09-28-1736.json');
    expect(parseImport(payload?.json ?? '').ok).toBe(true);
  });

  it('при сломанном хранилище экспорт отдаёт исходный JSON как есть (FR-6.7)', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '{это не json');
    const store = new AppStore(new SchedulerStorage(mem));
    store.setNow(new Date(2026, 8, 28, 17, 36));

    expect(store.getStatus().kind).toBe('broken');
    const payload = store.exportPayload();
    expect(payload?.json).toBe('{это не json');
    expect(payload?.fileName).toBe('tutor-scheduler-2026-09-28-1736-raw.json');
  });

  it('при недоступном хранилище выгружать нечего', () => {
    const store = new AppStore(new SchedulerStorage(null));
    expect(store.getStatus().kind).toBe('unavailable');
    expect(store.exportPayload()).toBeNull();
  });

  it('восстановление заменяет данные целиком, прежние уходят в резервный слот', () => {
    const mem = new MemoryStorage();
    const store = new AppStore(new SchedulerStorage(mem));
    addStudentTo(store);
    const before = store.getState();
    const next = parseImport(
      JSON.stringify({
        version: SCHEMA_VERSION,
        students: [
          {
            id: 'other',
            name: 'Пётр',
            subject: 'Физика',
            contact: '',
            rate: 1500,
            timezone: '',
            goal: '',
            color: 'orange',
            active: true,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        series: [],
        lessons: [],
        payments: [],
      }),
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    const result = store.importState(next.state, next.report);
    expect(result.ok).toBe(true);
    expect(store.getState().students.map((s) => s.name)).toEqual(['Пётр']);

    const recovery = parseImport(mem.getItem(RECOVERY_KEY) ?? '');
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;
    expect(recovery.state.students.map((s) => s.id)).toEqual(before.students.map((s) => s.id));
    expect(store.hasRecovery()).toBe(true);
    expect(store.recoveryPayload()?.json).toBe(mem.getItem(RECOVERY_KEY));
  });

  it('восстановление чинит сломанные данные и приложение продолжает работать', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '{это не json');
    const store = new AppStore(new SchedulerStorage(mem));
    expect(store.canWrite()).toBe(false);

    const next = parseImport(JSON.stringify({ ...filledState(), version: SCHEMA_VERSION }));
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    expect(store.importState(next.state, next.report).ok).toBe(true);
    expect(store.getStatus().kind).toBe('ready');
    expect(store.canWrite()).toBe(true);
    expect(store.getState().students).toHaveLength(1);
    // Исходный повреждённый JSON не перетирается пустым состоянием (FR-6.4).
    expect(mem.getItem(RECOVERY_KEY)).toBe('{это не json');
  });

  it('ошибка записи при восстановлении оставляет прежние данные', () => {
    const mem = new MemoryStorage();
    const store = new AppStore(new SchedulerStorage(mem));
    addStudentTo(store);
    const before = store.getState();
    mem.failOnWrite = true;

    const next = parseImport(JSON.stringify({ ...emptyAppState(), version: SCHEMA_VERSION }));
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    expect(store.importState(next.state, next.report).ok).toBe(false);
    expect(store.getState().students.map((s) => s.name)).toEqual(before.students.map((s) => s.name));
    expect(store.getToast()?.kind).toBe('error');
  });

  it('пустое хранилище не занимает резервный слот', () => {
    const mem = new MemoryStorage();
    const store = new AppStore(new SchedulerStorage(mem));
    const next = parseImport(JSON.stringify({ ...filledState(), version: SCHEMA_VERSION }));
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    store.importState(next.state, next.report);
    expect(mem.getItem(RECOVERY_KEY)).toBeNull();
    expect(store.hasRecovery()).toBe(false);
  });
});

describe('контекст команд', () => {
  it('today берётся из переданной даты, а не из системной', () => {
    const ctx = createContext(new Date(2026, 8, 24, 23, 59));
    expect(ctx.today).toBe('2026-09-24');
  });
});
