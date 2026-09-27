import {
  canTransition,
  computeBalance,
  findConflict,
  validateLessonInput,
  validatePaymentInput,
  validateStudentInput,
} from './balance.js';
import { compareIso, formatDayMonth, isBefore, todayIso, type IsoDate } from './dates.js';
import { buildSeriesLessons, isSeriesInputValid } from './series.js';
import { DEFAULT_DURATION_MIN, formatInterval, intervalsOverlap, isClockTime, isValidDuration } from './time.js';
import {
  isStudentColor,
  isTimezone,
  SCHEMA_VERSION,
  SERIES_HORIZON_WEEKS as HORIZON,
  type AppState,
  type Lesson,
  type LessonSeries,
  type LessonStatus,
  type Payment,
  type Student,
  type StudentColor,
  type StudentTimezone,
} from './types.js';

export interface CommandContext {
  /** Метка времени изменения, например `2026-09-26T18:00:00.000Z`. */
  now: string;
  /** Сегодняшняя календарная дата в локальном часовом поясе. */
  today: IsoDate;
  createId: () => string;
}

export type CommandResult<T = undefined> =
  | { ok: true; state: AppState; value: T; message?: string }
  | { ok: false; error: string; state: AppState };

export function createContext(now = new Date()): CommandContext {
  return { now: now.toISOString(), today: todayIso(now), createId: createIdFallback };
}

let counter = 0;
function createIdFallback(): string {
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function emptyState(version: number = SCHEMA_VERSION): AppState {
  return { version, students: [], series: [], lessons: [], payments: [] };
}

const fail = <T,>(error: string, state: AppState): CommandResult<T> => ({ ok: false, error, state });
const ok = <T,>(state: AppState, value: T, message?: string): CommandResult<T> => ({
  ok: true,
  state,
  value,
  ...(message ? { message } : {}),
});

/* ------------------------------------------------------------------ ученики */

export interface StudentInput {
  name: string;
  subject: string;
  contact: string;
  rate: number;
  /** Часовой пояс ученика; пустая строка или отсутствие — не задан (BR-17). */
  timezone?: StudentTimezone | '';
  /** Цель занятий; отсутствие — не заполнена (BR-17). */
  goal?: string;
  color: StudentColor;
}

/** Часовой пояс из формы: пустое значение означает «не указан». */
function inputTimezone(input: StudentInput): StudentTimezone | '' {
  return input.timezone ?? '';
}

function invalidTimezone(input: StudentInput): boolean {
  const value = input.timezone ?? '';
  return value !== '' && !isTimezone(value);
}

export function addStudent(
  ctx: CommandContext,
  state: AppState,
  input: StudentInput,
): CommandResult<Student> {
  const error = validateStudentInput(input);
  if (error) return fail(error, state);
  if (!isStudentColor(input.color)) return fail('Выберите цвет из палитры.', state);
  if (invalidTimezone(input)) return fail('Выберите часовой пояс из списка.', state);

  const student: Student = {
    id: ctx.createId(),
    name: input.name.trim(),
    subject: input.subject.trim(),
    contact: input.contact.trim(),
    rate: input.rate,
    timezone: inputTimezone(input),
    goal: (input.goal ?? '').trim(),
    color: input.color,
    active: true,
    createdAt: ctx.now,
  };
  return ok({ ...state, students: [...state.students, student] }, student, 'Ученик добавлен.');
}

export function updateStudent(
  _ctx: CommandContext,
  state: AppState,
  studentId: string,
  input: StudentInput,
): CommandResult<Student> {
  const error = validateStudentInput(input);
  if (error) return fail(error, state);
  const current = state.students.find((s) => s.id === studentId);
  if (!current) return fail('Ученик не найден.', state);
  if (!isStudentColor(input.color)) return fail('Выберите цвет из палитры.', state);
  if (invalidTimezone(input)) return fail('Выберите часовой пояс из списка.', state);

  const updated: Student = {
    ...current,
    name: input.name.trim(),
    subject: input.subject.trim(),
    contact: input.contact.trim(),
    rate: input.rate,
    timezone: inputTimezone(input),
    goal: (input.goal ?? '').trim(),
    color: input.color,
  };
  return ok(
    { ...state, students: state.students.map((s) => (s.id === studentId ? updated : s)) },
    updated,
    'Ученик сохранён.',
  );
}

/** Отключение ученика не удаляет занятия, заметки и оплаты (BR-14). */
export function setStudentActive(
  state: AppState,
  studentId: string,
  active: boolean,
): CommandResult<Student> {
  const current = state.students.find((s) => s.id === studentId);
  if (!current) return fail('Ученик не найден.', state);
  const updated: Student = { ...current, active };
  return ok(
    { ...state, students: state.students.map((s) => (s.id === studentId ? updated : s)) },
    updated,
    active ? 'Ученик снова в расписании.' : 'Ученик убран из расписания, история сохранена.',
  );
}

/* ------------------------------------------------------------------ занятия */

export interface OneOffLessonInput {
  studentId: string;
  date: string;
  startTime: string;
  durationMin: number;
  /** Пробное занятие: не приносит денег и не списывает баланс (BR-16). Отсутствие — обычное. */
  isTrial?: boolean;
}

export function addOneOffLesson(
  ctx: CommandContext,
  state: AppState,
  input: OneOffLessonInput,
): CommandResult<Lesson> {
  const error = validateLessonInput(input, state);
  if (error) return fail(error, state);

  const lesson: Lesson = {
    id: ctx.createId(),
    studentId: input.studentId,
    date: input.date,
    startTime: input.startTime,
    durationMin: input.durationMin,
    status: 'planned',
    isTrial: input.isTrial === true,
    topicNote: '',
    homework: '',
    seriesId: null,
    movedToLessonId: null,
    movedFromLessonId: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return ok(
    { ...state, lessons: [...state.lessons, lesson] },
    lesson,
    `Занятие создано: ${formatDayMonth(input.date)}, ${input.startTime}.`,
  );
}

/* -------------------------------------------------------------------- серии */

export interface SeriesInput {
  studentId: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  startsOn: string;
  endsOn?: string;
}

/**
 * Объяснение отказа серии: не «занято», а кто и когда занимает слот.
 * Без этого репетитор не понимает, что менять, и считает, что время
 * второму ученику записать нельзя.
 */
function seriesConflictReason(state: AppState, input: SeriesInput, conflicts: IsoDate[]): string {
  if (conflicts.length === 0) return 'В выбранном диапазоне нет подходящих дат.';
  const first = conflicts[0] as IsoDate;
  const clash = state.lessons
    .filter((l) => l.date === first && l.status !== 'cancelled' && l.status !== 'moved')
    .find((l) => intervalsOverlap(l.startTime, l.durationMin, input.startTime, input.durationMin));
  const who = clash
    ? state.students.find((s) => s.id === clash.studentId)?.name ?? 'другой ученик'
    : 'другое занятие';
  const time = clash ? formatInterval(clash.startTime, clash.durationMin) : formatInterval(input.startTime, input.durationMin);
  const tail = conflicts.length > 1 ? ` Занятых дат: ${conflicts.length}.` : '';
  return `Занято: ${formatDayMonth(first)}, ${time} у ученика ${who}.${tail} Выберите другое время или день недели.`;
}

export function addSeries(
  ctx: CommandContext,
  state: AppState,
  input: SeriesInput,
  horizonWeeks: number = HORIZON,
): CommandResult<{ series: LessonSeries; created: number; conflicts: string[] }> {
  const error = isSeriesInputValid(input);
  if (error) return fail(error, state);
  if (!isClockTime(input.startTime)) return fail('Укажите время занятия.', state);
  if (!state.students.some((s) => s.id === input.studentId)) return fail('Ученик не найден.', state);

  const series: LessonSeries = {
    id: ctx.createId(),
    studentId: input.studentId,
    weekday: input.weekday,
    startTime: input.startTime,
    durationMin: input.durationMin,
    startsOn: input.startsOn,
    ...(input.endsOn ? { endsOn: input.endsOn } : {}),
    active: true,
    createdAt: ctx.now,
  };

  const built = buildSeriesLessons(series, state.lessons, {
    now: ctx.now,
    createId: ctx.createId,
    horizonWeeks,
    seriesId: series.id,
    studentId: input.studentId,
    startTime: input.startTime,
    durationMin: input.durationMin,
  });

  if (built.lessons.length === 0) {
    return fail(seriesConflictReason(state, input, built.conflicts), state);
  }

  const message = built.conflicts.length
    ? `Создано занятий: ${built.lessons.length}. Пропущено из-за занятых слотов: ${built.conflicts.length}.`
    : `Создано занятий: ${built.lessons.length}.`;

  return ok(
    { ...state, series: [...state.series, series], lessons: [...state.lessons, ...built.lessons] },
    { series, created: built.lessons.length, conflicts: built.conflicts },
    message,
  );
}

/** Продление горизонта серии без дублей (FR-2.7). */
export function buildSeries(
  ctx: CommandContext,
  state: AppState,
  seriesId: string,
  horizonWeeks: number = HORIZON,
): CommandResult<{ created: number; conflicts: string[] }> {
  const series = state.series.find((s) => s.id === seriesId);
  if (!series) return fail('Серия не найдена.', state);
  if (!series.active) return fail('Серия закрыта. Откройте её, чтобы достроить занятия.', state);

  const built = buildSeriesLessons(series, state.lessons, {
    now: ctx.now,
    createId: ctx.createId,
    horizonWeeks,
    seriesId: series.id,
    studentId: series.studentId,
    startTime: series.startTime,
    durationMin: series.durationMin,
  });

  if (built.lessons.length === 0) {
    return fail(
      built.conflicts.length
        ? 'Новые даты серии уже заняты другими занятиями.'
        : 'В горизонте серии не осталось незанятых дат.',
      state,
    );
  }

  return ok(
    { ...state, lessons: [...state.lessons, ...built.lessons] },
    { created: built.lessons.length, conflicts: built.conflicts },
    `Добавлено занятий: ${built.lessons.length}.`,
  );
}

/** Закрытие серии останавливает генерацию, но не удаляет занятия (BR-13). */
export function setSeriesActive(
  state: AppState,
  seriesId: string,
  active: boolean,
): CommandResult<LessonSeries> {
  const series = state.series.find((s) => s.id === seriesId);
  if (!series) return fail('Серия не найдена.', state);
  const updated: LessonSeries = { ...series, active };
  return ok(
    { ...state, series: state.series.map((s) => (s.id === seriesId ? updated : s)) },
    updated,
    active ? 'Серия открыта.' : 'Серия закрыта, новые занятия не создаются.',
  );
}

/* ------------------------------------------------------- статусы и переносы */

function setStatus(
  ctx: CommandContext,
  state: AppState,
  lessonId: string,
  status: LessonStatus,
): CommandResult<Lesson> {
  const lesson = state.lessons.find((l) => l.id === lessonId);
  if (!lesson) return fail('Занятие не найдено.', state);
  if (lesson.status === status) return fail('Занятие уже в этом статусе.', state);
  if (!canTransition(lesson.status, status)) {
    return fail(
      `Нельзя перевести занятие из статуса «${lesson.status}» в «${status}».`,
      state,
    );
  }

  const updated: Lesson = { ...lesson, status, updatedAt: ctx.now };
  return ok(
    { ...state, lessons: state.lessons.map((l) => (l.id === lessonId ? updated : l)) },
    updated,
  );
}

/** Перевод в `done` списывает ровно одно занятие и только один раз (BR-10). */
export function markDone(ctx: CommandContext, state: AppState, lessonId: string): CommandResult<Lesson> {
  const result = setStatus(ctx, state, lessonId, 'done');
  if (!result.ok) return result;
  const balance = computeBalance(result.state, result.value.studentId);
  const warning = balance.remaining < 0 ? ' Ученик ушёл в долг.' : '';
  return { ...result, message: `Отмечено проведённым.${warning}` };
}

/** Отмена необратима и не меняет баланс (BR-8, BR-9). */
export function cancelLesson(
  ctx: CommandContext,
  state: AppState,
  lessonId: string,
): CommandResult<Lesson> {
  const result = setStatus(ctx, state, lessonId, 'cancelled');
  if (!result.ok) return result;
  return { ...result, message: 'Занятие отменено, баланс не изменился.' };
}

export interface MoveInput {
  date: string;
  startTime: string;
  durationMin: number;
}

/**
 * Перенос перемещает занятие: исходное получает статус `moved` и остаётся
 * в своей ячейке недели, новое создаётся в целевой дате (BR-4).
 */
export function moveLesson(
  ctx: CommandContext,
  state: AppState,
  lessonId: string,
  input: MoveInput,
): CommandResult<{ from: Lesson; to: Lesson }> {
  const source = state.lessons.find((l) => l.id === lessonId);
  if (!source) return fail('Занятие не найдено.', state);
  if (source.status !== 'planned') {
    return fail('Перенести можно только запланированное занятие.', state);
  }
  if (!input.date) return fail('Укажите новую дату.', state);
  if (isBefore(input.date, ctx.today)) {
    return fail('Перенос в прошлое запрещён.', state);
  }
  if (!isClockTime(input.startTime)) return fail('Укажите время занятия.', state);
  if (!isValidDuration(input.durationMin)) {
    return fail('Укажите длительность от 1 до 1440 минут.', state);
  }

  const conflict = findConflict(state, input, lessonId);
  if (conflict) {
    return fail(`Слот занят: ${conflict.startTime} на эту дату уже есть.`, state);
  }

  if (source.date === input.date && source.startTime === input.startTime) {
    return fail('Новое время совпадает с текущим.', state);
  }

  const moved: Lesson = {
    ...source,
    status: 'moved',
    movedToLessonId: null,
    updatedAt: ctx.now,
  };

  const created: Lesson = {
    ...source,
    id: ctx.createId(),
    date: input.date,
    startTime: input.startTime,
    durationMin: input.durationMin,
    status: 'planned',
    movedFromLessonId: source.id,
    movedToLessonId: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  moved.movedToLessonId = created.id;

  const lessons = state.lessons.map((l) => (l.id === source.id ? moved : l));
  return ok(
    { ...state, lessons: [...lessons, created] },
    { from: moved, to: created },
    'Занятие перенесено, баланс не изменился.',
  );
}

/** История переносов: куда ушло исходное занятие и откуда пришло это (FR-4.7). */
export function moveHistory(state: AppState, lesson: Lesson): Lesson[] {
  const related: Lesson[] = [];
  if (lesson.movedToLessonId) {
    const target = state.lessons.find((l) => l.id === lesson.movedToLessonId);
    if (target) related.push(target);
  }
  if (lesson.movedFromLessonId) {
    const source = state.lessons.find((l) => l.id === lesson.movedFromLessonId);
    if (source) related.push(source);
  }
  return related;
}

/* -------------------------------------------------------- заметки и ДЗ */

export function saveLessonNotes(
  ctx: CommandContext,
  state: AppState,
  lessonId: string,
  notes: { topicNote: string; homework: string },
): CommandResult<Lesson> {
  const lesson = state.lessons.find((l) => l.id === lessonId);
  if (!lesson) return fail('Занятие не найдено.', state);

  // Заметка и ДЗ — независимые поля (FR-4.2).
  const updated: Lesson = {
    ...lesson,
    topicNote: notes.topicNote,
    homework: notes.homework,
    updatedAt: ctx.now,
  };
  return ok(
    { ...state, lessons: state.lessons.map((l) => (l.id === lessonId ? updated : l)) },
    updated,
    'Заметка и домашнее задание сохранены.',
  );
}

/* ------------------------------------------------------------- предоплата */

export interface PaymentInput {
  studentId: string;
  lessonsCount: number;
  paidAt: string;
  comment: string;
}

export function addPayment(
  ctx: CommandContext,
  state: AppState,
  input: PaymentInput,
): CommandResult<Payment> {
  const error = validatePaymentInput(input, ctx.today);
  if (error) return fail(error, state);
  if (!state.students.some((s) => s.id === input.studentId)) return fail('Ученик не найден.', state);

  const payment: Payment = {
    id: ctx.createId(),
    studentId: input.studentId,
    lessonsCount: input.lessonsCount,
    paidAt: input.paidAt,
    comment: input.comment.trim(),
    createdAt: ctx.now,
  };
  return ok(
    { ...state, payments: [...state.payments, payment] },
    payment,
    `Записана оплата: ${input.lessonsCount}.`,
  );
}

/* ----------------------------------------------------------------- сортировка */

/** Занятия недели, отсортированные по времени начала (FR-3.9). */
export function sortLessons(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => {
    const byDate = compareIso(a.date, b.date);
    if (byDate !== 0) return byDate;
    return a.startTime.localeCompare(b.startTime);
  });
}

export { DEFAULT_DURATION_MIN, HORIZON as SERIES_HORIZON_WEEKS };
