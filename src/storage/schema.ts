import { isIsoDate } from '../domain/dates.js';
import { isClockTime, isValidDuration } from '../domain/time.js';
import {
  isStudentColor,
  LESSON_STATUSES,
  type AppState,
  type Lesson,
  type LessonSeries,
  type Payment,
  type Student,
} from '../domain/types.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'tutor-scheduler:state';
export const RECOVERY_KEY = 'tutor-scheduler:state:recovery';

export interface RepairReport {
  /** Были ли обнаружены повреждения или несогласованности. */
  corrupted: boolean;
  /** Человекочитаемые описания того, что было исправлено. */
  issues: string[];
  /** Сколько записей каждого вида было отброшено. */
  dropped: { students: number; series: number; lessons: number; payments: number };
}

export type RepairOutcome =
  | { kind: 'ok'; state: AppState; report: RepairReport }
  | { kind: 'unsupported-version'; found: unknown }
  | { kind: 'broken'; reason: string; raw: string | null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function isValidStudent(raw: unknown): raw is Student {
  if (!isObject(raw)) return false;
  return (
    str(raw.id).length > 0 &&
    str(raw.name).trim().length > 0 &&
    str(raw.subject).trim().length > 0 &&
    num(raw.rate) > 0 &&
    isStudentColor(raw.color)
  );
}

function isValidSeries(raw: unknown): raw is LessonSeries {
  if (!isObject(raw)) return false;
  if (str(raw.id).length === 0) return false;
  if (!Number.isInteger(raw.weekday) || (raw.weekday as number) < 1 || (raw.weekday as number) > 7) {
    return false;
  }
  if (!isClockTime(raw.startTime)) return false;
  if (!isValidDuration(raw.durationMin)) return false;
  if (!isIsoDate(raw.startsOn)) return false;
  if (raw.endsOn != null && raw.endsOn !== '' && !isIsoDate(raw.endsOn)) return false;
  return true;
}

function isValidLesson(raw: unknown): raw is Lesson {
  if (!isObject(raw)) return false;
  if (str(raw.id).length === 0) return false;
  if (!isIsoDate(raw.date)) return false;
  if (!isClockTime(raw.startTime)) return false;
  if (!isValidDuration(raw.durationMin)) return false;
  return LESSON_STATUSES.includes(raw.status as Lesson['status']);
}

function isValidPayment(raw: unknown): raw is Payment {
  if (!isObject(raw)) return false;
  if (str(raw.id).length === 0) return false;
  if (!Number.isInteger(raw.lessonsCount) || (raw.lessonsCount as number) <= 0) return false;
  return isIsoDate(raw.paidAt);
}

function normalizeStudent(raw: Student): Student {
  return {
    id: raw.id,
    name: raw.name,
    subject: raw.subject,
    contact: str(raw.contact),
    rate: raw.rate,
    color: raw.color,
    active: typeof raw.active === 'boolean' ? raw.active : true,
    createdAt: str(raw.createdAt) || new Date(0).toISOString(),
  };
}

function normalizeSeries(raw: LessonSeries): LessonSeries {
  return {
    id: raw.id,
    studentId: raw.studentId,
    weekday: raw.weekday,
    startTime: raw.startTime,
    durationMin: raw.durationMin,
    startsOn: raw.startsOn,
    ...(raw.endsOn ? { endsOn: raw.endsOn } : {}),
    active: typeof raw.active === 'boolean' ? raw.active : true,
    createdAt: str(raw.createdAt) || new Date(0).toISOString(),
  };
}

function normalizeLesson(raw: Lesson): Lesson {
  return {
    id: raw.id,
    studentId: raw.studentId,
    date: raw.date,
    startTime: raw.startTime,
    durationMin: raw.durationMin,
    status: raw.status,
    topicNote: str(raw.topicNote),
    homework: str(raw.homework),
    seriesId: typeof raw.seriesId === 'string' && raw.seriesId ? raw.seriesId : null,
    movedToLessonId:
      typeof raw.movedToLessonId === 'string' && raw.movedToLessonId ? raw.movedToLessonId : null,
    movedFromLessonId:
      typeof raw.movedFromLessonId === 'string' && raw.movedFromLessonId
        ? raw.movedFromLessonId
        : null,
    createdAt: str(raw.createdAt) || new Date(0).toISOString(),
    updatedAt: str(raw.updatedAt) || str(raw.createdAt) || new Date(0).toISOString(),
  };
}

function normalizePayment(raw: Payment): Payment {
  return {
    id: raw.id,
    studentId: raw.studentId,
    lessonsCount: raw.lessonsCount,
    paidAt: raw.paidAt,
    comment: str(raw.comment),
    createdAt: str(raw.createdAt) || new Date(0).toISOString(),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Проверяет и чинит загруженное состояние.
 * Битые записи отбрасываются из рабочего состояния, а исходный JSON
 * сохраняется в резервный слот — данные не удаляются молча (FR-6.4).
 */
export function repairState(parsed: unknown): RepairOutcome {
  if (!isObject(parsed)) {
    return { kind: 'broken', reason: 'Корень данных не является объектом.', raw: null };
  }

  const version = num(parsed.version);
  if (!Number.isInteger(version)) {
    return { kind: 'broken', reason: 'Отсутствует версия схемы.', raw: JSON.stringify(parsed) };
  }
  if (version > SCHEMA_VERSION) {
    return { kind: 'unsupported-version', found: version };
  }

  const issues: string[] = [];
  const dropped = { students: 0, series: 0, lessons: 0, payments: 0 };

  const rawStudents = asArray(parsed.students);
  const students: Student[] = [];
  for (const raw of rawStudents) {
    if (isValidStudent(raw)) {
      const student = normalizeStudent(raw as Student);
      if (students.some((s) => s.id === student.id)) {
        issues.push(`Дубликат ученика ${student.id} отброшен.`);
        dropped.students += 1;
        continue;
      }
      students.push(student);
    } else {
      issues.push('Некорректная запись ученика отброшена.');
      dropped.students += 1;
    }
  }
  const studentIds = new Set(students.map((s) => s.id));

  const rawSeries = asArray(parsed.series);
  const series: LessonSeries[] = [];
  for (const raw of rawSeries) {
    if (!isValidSeries(raw)) {
      issues.push('Некорректная запись серии отброшена.');
      dropped.series += 1;
      continue;
    }
    const item = normalizeSeries(raw as LessonSeries);
    if (!studentIds.has(item.studentId)) {
      issues.push(`Серия ${item.id} без ученика отброшена.`);
      dropped.series += 1;
      continue;
    }
    if (series.some((s) => s.id === item.id)) {
      issues.push(`Дубликат серии ${item.id} отброшен.`);
      dropped.series += 1;
      continue;
    }
    series.push(item);
  }
  const seriesIds = new Set(series.map((s) => s.id));

  const rawLessons = asArray(parsed.lessons);
  const lessons: Lesson[] = [];
  const seenIds = new Set<string>();
  const seenSeriesDates = new Set<string>();
  for (const raw of rawLessons) {
    if (!isValidLesson(raw)) {
      issues.push('Некорректная запись занятия отброшена.');
      dropped.lessons += 1;
      continue;
    }
    const item = normalizeLesson(raw as Lesson);
    if (seenIds.has(item.id)) {
      issues.push(`Дубликат занятия ${item.id} отброшен.`);
      dropped.lessons += 1;
      continue;
    }
    if (!studentIds.has(item.studentId)) {
      issues.push(`Занятие ${item.id} без ученика отброшено.`);
      dropped.lessons += 1;
      continue;
    }
    if (item.seriesId && !seriesIds.has(item.seriesId)) {
      issues.push(`Занятие ${item.id} потеряло серию и осталось разовым.`);
      item.seriesId = null;
    }
    if (item.seriesId) {
      const key = `${item.seriesId}|${item.date}`;
      if (seenSeriesDates.has(key)) {
        issues.push(`Дубль пары (серия, дата) для занятия ${item.id} отброшен.`);
        dropped.lessons += 1;
        continue;
      }
      seenSeriesDates.add(key);
    }
    seenIds.add(item.id);
    lessons.push(item);
  }

  // Оборванные связи переносов обнуляются, чтобы интерфейс не показывал пустоту.
  for (const lesson of lessons) {
    if (lesson.movedToLessonId && !seenIds.has(lesson.movedToLessonId)) {
      issues.push(`Связь переноса занятия ${lesson.id} не найдена.`);
      lesson.movedToLessonId = null;
    }
    if (lesson.movedFromLessonId && !seenIds.has(lesson.movedFromLessonId)) {
      issues.push(`Обратная связь переноса занятия ${lesson.id} не найдена.`);
      lesson.movedFromLessonId = null;
    }
  }

  const rawPayments = asArray(parsed.payments);
  const payments: Payment[] = [];
  for (const raw of rawPayments) {
    if (!isValidPayment(raw)) {
      issues.push('Некорректная запись оплаты отброшена.');
      dropped.payments += 1;
      continue;
    }
    const item = normalizePayment(raw as Payment);
    if (!studentIds.has(item.studentId)) {
      issues.push(`Оплата ${item.id} без ученика отброшена.`);
      dropped.payments += 1;
      continue;
    }
    if (payments.some((p) => p.id === item.id)) {
      issues.push(`Дубликат оплаты ${item.id} отброшен.`);
      dropped.payments += 1;
      continue;
    }
    payments.push(item);
  }

  const state: AppState = {
    version: SCHEMA_VERSION,
    students,
    series,
    lessons,
    payments,
  };

  return {
    kind: 'ok',
    state,
    report: {
      corrupted: issues.length > 0,
      issues,
      dropped,
    },
  };
}

export function emptyAppState(): AppState {
  return { version: SCHEMA_VERSION, students: [], series: [], lessons: [], payments: [] };
}
