/** Типы сущностей приложения. Соответствуют `ТЗ_MVP.md` §6. */

export type LessonStatus = 'planned' | 'done' | 'cancelled' | 'moved';

export const LESSON_STATUSES: readonly LessonStatus[] = ['planned', 'done', 'cancelled', 'moved'];

/** Статусы, из которых нельзя перейти в `done` (BR-12). */
export const FINAL_STATUSES: readonly LessonStatus[] = ['cancelled', 'moved'];

export const STATUS_LABELS: Record<LessonStatus, string> = {
  planned: 'Запланировано',
  done: 'Проведено',
  cancelled: 'Отменено',
  moved: 'Перенесено',
};

/** Палитра учеников. Произвольные цвета не принимаются (FR-1.8). */
export const STUDENT_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'teal',
  'rose',
  'amber',
  'slate',
] as const;

export type StudentColor = (typeof STUDENT_COLORS)[number];

export function isStudentColor(value: unknown): value is StudentColor {
  return typeof value === 'string' && (STUDENT_COLORS as readonly string[]).includes(value);
}

export interface Student {
  id: string;
  name: string;
  subject: string;
  contact: string;
  /** Цена одного занятия. */
  rate: number;
  color: StudentColor;
  /** Показывается ли ученик в недельном виде (BR-14). */
  active: boolean;
  createdAt: string;
}

export interface LessonSeries {
  id: string;
  studentId: string;
  /** 1 = понедельник … 7 = воскресенье. */
  weekday: number;
  startTime: string;
  durationMin: number;
  startsOn: IsoDateLike;
  /** Необязательное ограничение конца серии. */
  endsOn?: string;
  /** Генерирует ли серия новые занятия (BR-13). */
  active: boolean;
  createdAt: string;
}

export interface Lesson {
  id: string;
  studentId: string;
  date: IsoDateLike;
  startTime: string;
  durationMin: number;
  status: LessonStatus;
  /** Что прошли на занятии. */
  topicNote: string;
  /** Домашнее задание. */
  homework: string;
  /** Ссылка на серию; у разового занятия пуст. */
  seriesId: string | null;
  movedToLessonId: string | null;
  movedFromLessonId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  studentId: string;
  /** Сколько занятий оплачено. */
  lessonsCount: number;
  paidAt: IsoDateLike;
  comment: string;
  createdAt: string;
}

type IsoDateLike = string;

export interface AppState {
  version: number;
  students: Student[];
  series: LessonSeries[];
  lessons: Lesson[];
  payments: Payment[];
}

export const SERIES_HORIZON_WEEKS = 4;
