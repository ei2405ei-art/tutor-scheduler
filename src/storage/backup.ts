import type { AppState } from '../domain/types.js';
import { repairState, SCHEMA_VERSION, type RepairReport } from './schema.js';

/** Файл больше лимита не читается: телефон не должен зависать на восстановлении. */
export const MAX_IMPORT_BYTES = 5_000_000;

export interface BackupCounts {
  students: number;
  series: number;
  lessons: number;
  payments: number;
}

export interface ImportPreview {
  /** Версия схемы в файле: мигрированная, если файл был старше. */
  version: number;
  counts: BackupCounts;
  /** Файл отличался от нормализованного состояния и будет поправлен при замене. */
  corrupted: boolean;
  issues: string[];
  /** Версия в файле отличалась от текущей и данные были мигрированы. */
  migratedFrom: number | null;
}

export type ImportOutcome =
  | { ok: true; state: AppState; report: RepairReport; preview: ImportPreview }
  | { ok: false; error: string };

/**
 * Копия данных — тот же JSON, который лежит в хранилище: порядок ключей фиксирован,
 * поэтому два экспорта одного состояния дают одинаковый файл.
 */
export function serializeExport(state: AppState): string {
  return `${JSON.stringify(
    {
      version: state.version,
      students: state.students,
      series: state.series,
      lessons: state.lessons,
      payments: state.payments,
    },
    null,
    2,
  )}\n`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Имя файла без локального времени и `Intl`: `tutor-scheduler-2026-09-28-1736.json`. */
export function exportFileName(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `tutor-scheduler-${date}-${time}.json`;
}

/** Имя файла для исходного JSON, который не проходит проверку (FR-6.4, FR-6.7). */
export function rawFileName(now: Date): string {
  return exportFileName(now).replace(/\.json$/, '-raw.json');
}

export function summarizeState(state: AppState): BackupCounts {
  return {
    students: state.students.length,
    series: state.series.length,
    lessons: state.lessons.length,
    payments: state.payments.length,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'неизвестная ошибка';
}

/**
 * Разбор файла восстановления: тот же `repairState`, что и при загрузке приложения,
 * поэтому файл из более старой версии мигрируется, а битый отклоняется (FR-6.8).
 */
export function parseImport(text: string, bytes: number = text.length): ImportOutcome {
  if (bytes > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Файл слишком большой: ${Math.round(bytes / 1_000_000)} МБ при лимите ${Math.round(
        MAX_IMPORT_BYTES / 1_000_000,
      )} МБ. Выгружается архив расписания за несколько лет, а не состояние хранилища.`,
    };
  }

  if (text.trim().length === 0) {
    return { ok: false, error: 'Файл пустой: в нём нет данных.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Файл не является JSON: ${describeError(error)}` };
  }

  const outcome = repairState(parsed);

  if (outcome.kind === 'broken') {
    return { ok: false, error: `Файл повреждён: ${outcome.reason}` };
  }

  if (outcome.kind === 'unsupported-version') {
    return {
      ok: false,
      error: `Файл сохранён более новой версией приложения (версия ${String(
        outcome.found,
      )}, поддерживается ${SCHEMA_VERSION}). Обновите приложение и повторите попытку.`,
    };
  }

  const found = typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : null;
  return {
    ok: true,
    state: outcome.state,
    report: outcome.report,
    preview: {
      version: outcome.state.version,
      counts: summarizeState(outcome.state),
      corrupted: outcome.report.corrupted,
      issues: outcome.report.issues,
      migratedFrom: typeof found === 'number' && found !== outcome.state.version ? found : null,
    },
  };
}