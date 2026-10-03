import type { AppState } from '../domain/types.js';
import { RECOVERY_KEY, repairState, SCHEMA_VERSION, STORAGE_KEY, type RepairReport } from './schema.js';

export type LoadOutcome =
  | { kind: 'ready'; state: AppState; report: RepairReport | null }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'unsupported-version'; found: unknown }
  | { kind: 'broken'; reason: string; recoveryKey: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `localStorage` недоступен в некоторых режимах приватности и при запрете cookies. */
function defaultStorage(): StorageLike | null {
  try {
    const probe = '__tutor_scheduler_probe__';
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class SchedulerStorage {
  private readonly storage: StorageLike | null;

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.storage = storage;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  /** Исходный JSON сохраняется в резервный слот и не удаляется молча (FR-6.4). */
  private backup(raw: string): void {
    try {
      this.storage?.setItem(RECOVERY_KEY, raw);
    } catch {
      /* резервный слот недоступен — исходная строка уже в памяти вызывающего */
    }
  }

  /**
   * Действующий JSON сохраняется как резервная копия перед заменой из файла (FR-6.8).
   * Пустое хранилище резервировать нечего, поэтому слот не трогается.
   */
  keepAsRecovery(): void {
    const raw = this.readRaw();
    if (raw !== null && raw.length > 0) this.backup(raw);
  }

  /** Текущий JSON хранилища как есть: для экспорта и для резервирования. */
  readRaw(): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  load(): LoadOutcome {
    if (!this.storage) {
      return { kind: 'unavailable', reason: 'Локальное хранилище недоступно в этом браузере.' };
    }

    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch (error) {
      return { kind: 'unavailable', reason: describeError(error) };
    }

    if (raw === null || raw === '') {
      return {
        kind: 'ready',
        state: { version: SCHEMA_VERSION, students: [], series: [], lessons: [], payments: [] },
        report: null,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.backup(raw);
      return {
        kind: 'broken',
        reason: `Данные повреждены и не читаются: ${describeError(error)}`,
        recoveryKey: RECOVERY_KEY,
      };
    }

    const outcome = repairState(parsed);

    if (outcome.kind === 'broken') {
      this.backup(raw);
      return {
        kind: 'broken',
        reason: `Данные повреждены: ${outcome.reason}`,
        recoveryKey: RECOVERY_KEY,
      };
    }

    if (outcome.kind === 'unsupported-version') {
      this.backup(raw);
      return {
        kind: 'unsupported-version',
        found: outcome.found,
      };
    }

    if (outcome.report.corrupted) {
      this.backup(raw);
    }

    return { kind: 'ready', state: outcome.state, report: outcome.report };
  }

  save(state: AppState): { ok: true } | { ok: false; error: string } {
    if (!this.storage) {
      return { ok: false, error: 'Локальное хранилище недоступно, изменения не сохранены.' };
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `Не удалось сохранить данные: ${describeError(error)}. Введённое не потеряно — попробуйте ещё раз.`,
      };
    }
  }

  recovery(): string | null {
    try {
      return this.storage?.getItem(RECOVERY_KEY) ?? null;
    } catch {
      return null;
    }
  }

  hasRecovery(): boolean {
    return this.recovery() !== null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'неизвестная ошибка';
}
