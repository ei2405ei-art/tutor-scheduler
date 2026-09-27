import { isAfter, isIsoDate, todayIso, type IsoDate } from './dates.js';
import { roundMoney } from './money.js';
import { intervalsOverlap, isClockTime, isValidDuration, toMinutes, type ClockTime } from './time.js';
import { FINAL_STATUSES, GOAL_MAX_LENGTH, isTimezone, type AppState, type Lesson, type LessonStatus, type Student } from './types.js';
import { startOfWeek, endOfWeek } from './week.js';

export interface Balance {
  studentId: string;
  paid: number;
  done: number;
  /** `paid - done`. Может быть отрицательным — это долг ученика (FR-5.7). */
  remaining: number;
}

/** Баланс — вычисляемое значение, а не сохранённое поле (BR-15). */
export function computeBalance(state: AppState, studentId: string): Balance {
  const paid = state.payments
    .filter((p) => p.studentId === studentId)
    .reduce((sum, p) => sum + p.lessonsCount, 0);
  // Пробное занятие не списывает баланс (BR-16).
  const done = state.lessons.filter(
    (l) => l.studentId === studentId && l.status === 'done' && !l.isTrial,
  ).length;
  return { studentId, paid, done, remaining: paid - done };
}

export function computeAllBalances(state: AppState): Map<string, Balance> {
  const map = new Map<string, Balance>();
  for (const student of state.students) {
    map.set(student.id, computeBalance(state, student.id));
  }
  return map;
}

export interface WeekSummary {
  weekStart: IsoDate;
  weekEnd: IsoDate;
  planned: number;
  done: number;
  cancelled: number;
  moved: number;
  total: number;
  /** Суммарный остаток предоплаты по ученикам, у которых есть занятия недели. */
  remainingPrepaid: number;
  /**
   * Сумма к оплате за неделю в рублях: `Σ rate` по занятиям недели в статусе
   * `planned` и `done`, кроме пробных. `cancelled` и `moved` не учитываются,
   * поэтому перенос попадает в сумму ровно один раз — в неделе своей новой
   * даты. Пробные занятия в сумму не входят, но остаются в счётчиках
   * количеств (ТЗ §6.5, BR-16).
   */
  payableTotal: number;
  /**
   * Долг в рублях: `Σ |balance| × rate` по ученикам недели с отрицательным
   * остатком предоплаты (ТЗ §6.5).
   */
  debtTotal: number;
}

function rateOf(state: AppState, studentId: string): number {
  return state.students.find((s) => s.id === studentId)?.rate ?? 0;
}

/**
 * Приносит ли занятие деньги: `planned` и `done`, кроме пробных (BR-16).
 * `cancelled` и `moved` не приносят, поэтому перенос попадает в сумму
 * ровно один раз — в неделе своей новой даты.
 */
export function isPayable(lesson: Lesson): boolean {
  return (lesson.status === 'planned' || lesson.status === 'done') && !lesson.isTrial;
}

export interface DaySummary {
  date: IsoDate;
  /** Всего занятий дня, включая пробные и отменённые. */
  total: number;
  planned: number;
  done: number;
  cancelled: number;
  moved: number;
  /** Сумма к оплате за день в рублях, без пробных занятий (FR-3A.6). */
  payableTotal: number;
}

/** Итог одного дня для дневного вида. Пробные видны в количествах, но не в сумме. */
/**
 * Активные ученики. Занятия закрытого ученика не попадают ни в сетку дня,
 * ни в сетку недели (BR-14), поэтому их не должно быть и в итогах.
 */
function activeStudentIds(state: AppState): Set<string> {
  return new Set(state.students.filter((s) => s.active).map((s) => s.id));
}

export function summarizeDay(state: AppState, date: IsoDate): DaySummary {
  const active = activeStudentIds(state);
  const lessons = state.lessons.filter((l) => l.date === date && active.has(l.studentId));
  const summary: DaySummary = {
    date,
    total: lessons.length,
    planned: 0,
    done: 0,
    cancelled: 0,
    moved: 0,
    payableTotal: 0,
  };
  for (const lesson of lessons) {
    if (lesson.status === 'planned') summary.planned += 1;
    if (lesson.status === 'done') summary.done += 1;
    if (lesson.status === 'cancelled') summary.cancelled += 1;
    if (lesson.status === 'moved') summary.moved += 1;
    if (isPayable(lesson)) summary.payableTotal += rateOf(state, lesson.studentId);
  }
  return { ...summary, payableTotal: roundMoney(summary.payableTotal) };
}

/**
 * Первое ещё не начавшееся запланированное занятие дня (FR-3A.8).
 * Отменённые и перенесённые не считаются кандидатами.
 */
export function findNextLesson(lessons: Lesson[], clock: ClockTime): Lesson | null {
  if (!isClockTime(clock)) return null;
  const from = toMinutes(clock);
  return (
    lessons.find(
      (l) =>
        l.status === 'planned' && isClockTime(l.startTime) && toMinutes(l.startTime) >= from,
    ) ?? null
  );
}

export function summarizeWeek(state: AppState, date: IsoDate): WeekSummary {
  const from = startOfWeek(date);
  const to = endOfWeek(date);
  const active = activeStudentIds(state);
  const inWeek = state.lessons.filter(
    (l) => l.date >= from && l.date <= to && active.has(l.studentId),
  );

  const summary: WeekSummary = {
    weekStart: from,
    weekEnd: to,
    planned: 0,
    done: 0,
    cancelled: 0,
    moved: 0,
    total: inWeek.length,
    remainingPrepaid: 0,
    payableTotal: 0,
    debtTotal: 0,
  };

  const studentIds = new Set<string>();
  for (const lesson of inWeek) {
    studentIds.add(lesson.studentId);
    if (lesson.status === 'planned') summary.planned += 1;
    if (lesson.status === 'done') summary.done += 1;
    if (lesson.status === 'cancelled') summary.cancelled += 1;
    if (lesson.status === 'moved') summary.moved += 1;
    if (isPayable(lesson)) {
      summary.payableTotal += rateOf(state, lesson.studentId);
    }
  }

  for (const id of studentIds) {
    const balance = computeBalance(state, id);
    summary.remainingPrepaid += balance.remaining;
    if (balance.remaining < 0) {
      summary.debtTotal += Math.abs(balance.remaining) * rateOf(state, id);
    }
  }

  return {
    ...summary,
    payableTotal: roundMoney(summary.payableTotal),
    debtTotal: roundMoney(summary.debtTotal),
  };
}

/** Конечный статус: из него нельзя перейти в `done` (BR-12). */
export function isFinalStatus(status: LessonStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

const ALLOWED: Record<LessonStatus, LessonStatus[]> = {
  planned: ['done', 'cancelled', 'moved'],
  done: [],
  cancelled: [],
  moved: [],
};

export function canTransition(from: LessonStatus, to: LessonStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function canMarkDone(lesson: Lesson): boolean {
  return canTransition(lesson.status, 'done');
}

export interface LessonInput {
  studentId: string;
  date: string;
  startTime: string;
  durationMin: number;
}

export function validateLessonInput(input: LessonInput, state: AppState): string | null {
  if (!input.studentId) return 'Выберите ученика.';
  if (!isIsoDate(input.date)) return 'Укажите дату занятия.';
  if (!isClockTime(input.startTime)) return 'Укажите время занятия.';
  if (!isValidDuration(input.durationMin)) return 'Укажите длительность от 1 до 1440 минут.';
  if (!state.students.some((s) => s.id === input.studentId)) return 'Ученик не найден.';

  const conflict = findConflict(state, input);
  if (conflict) {
    return `Слот занят: занятие ${conflict.startTime}–${addMinutesLabel(
      conflict.startTime,
      conflict.durationMin,
    )} уже есть.`;
  }
  return null;
}

function addMinutesLabel(start: string, duration: number): string {
  const h = Math.floor((Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + duration) / 60);
  const m = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + duration) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Занятие, пересекающееся с вводимым. Само занятие исключается по `excludeId`. */
export function findConflict(
  state: AppState,
  input: { date: string; startTime: string; durationMin: number },
  excludeId?: string,
): Lesson | null {
  return (
    state.lessons.find(
      (l) =>
        l.id !== excludeId &&
        l.date === input.date &&
        l.status !== 'cancelled' &&
        intervalsOverlap(input.startTime, input.durationMin, l.startTime, l.durationMin),
    ) ?? null
  );
}

export function validateStudentInput(input: {
  name: string;
  subject: string;
  contact: string;
  rate: number;
  timezone?: string;
  goal?: string;
}): string | null {
  if (!input.name.trim()) return 'Укажите имя ученика.';
  if (input.name.trim().length > 80) return 'Имя слишком длинное.';
  if (!input.subject.trim()) return 'Укажите предмет.';
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return 'Укажите ставку больше нуля.';
  }
  const timezone = input.timezone ?? '';
  if (timezone !== '' && !isTimezone(timezone)) {
    return 'Выберите часовой пояс из списка.';
  }
  if ((input.goal ?? '').trim().length > GOAL_MAX_LENGTH) {
    return `Цель не длиннее ${GOAL_MAX_LENGTH} символов.`;
  }
  return null;
}

export function validatePaymentInput(
  input: { lessonsCount: number; paidAt: string },
  today: IsoDate = todayIso(),
): string | null {
  if (!Number.isInteger(input.lessonsCount) || input.lessonsCount <= 0) {
    return 'Количество занятий должно быть целым числом больше нуля.';
  }
  if (!isIsoDate(input.paidAt)) return 'Укажите дату оплаты.';
  if (isAfter(input.paidAt, today)) return 'Дата оплаты не может быть в будущем.';
  return null;
}

export function findStudent(state: AppState, studentId: string): Student | undefined {
  return state.students.find((s) => s.id === studentId);
}

export function lessonsOfStudent(state: AppState, studentId: string): Lesson[] {
  return state.lessons
    .filter((l) => l.studentId === studentId)
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1));
}
