import { describe, expect, it } from 'vitest';
import { RECOVERY_KEY, repairState, SCHEMA_VERSION, STORAGE_KEY, emptyAppState } from '../src/storage/schema.js';
import { SchedulerStorage, type StorageLike } from '../src/storage/repository.js';
import { AppStore } from '../src/app/store.js';
import { addPayment, addStudent, createContext } from '../src/domain/commands.js';
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
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('состояние версионировано', () => {
    const state: AppState = emptyAppState();
    expect(state.version).toBe(SCHEMA_VERSION);
  });
});

describe('контекст команд', () => {
  it('today берётся из переданной даты, а не из системной', () => {
    const ctx = createContext(new Date(2026, 8, 24, 23, 59));
    expect(ctx.today).toBe('2026-09-24');
  });
});
