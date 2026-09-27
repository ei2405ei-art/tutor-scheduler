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

/**
 * Часовые пояса ученика. Справочная величина: на даты и время занятий не влияет
 * (BR-17), поэтому список ограничен российскими поясами.
 */
export const TIMEZONES = [
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Yakutsk',
  'Asia/Vladivostok',
  'Asia/Magadan',
  'Asia/Kamchatka',
] as const;

export type StudentTimezone = (typeof TIMEZONES)[number];

export const TIMEZONE_LABELS: Record<StudentTimezone, string> = {
  'Europe/Kaliningrad': 'Калининград, UTC+2',
  'Europe/Moscow': 'Москва, UTC+3',
  'Europe/Samara': 'Самара, UTC+4',
  'Asia/Yekaterinburg': 'Екатеринбург, UTC+5',
  'Asia/Omsk': 'Омск, UTC+6',
  'Asia/Krasnoyarsk': 'Красноярск, UTC+7',
  'Asia/Irkutsk': 'Иркутск, UTC+8',
  'Asia/Yakutsk': 'Якутск, UTC+9',
  'Asia/Vladivostok': 'Владивосток, UTC+10',
  'Asia/Magadan': 'Магадан, UTC+11',
  'Asia/Kamchatka': 'Камчатка, UTC+12',
};

export function isTimezone(value: unknown): value is StudentTimezone {
  return typeof value === 'string' && (TIMEZONES as readonly string[]).includes(value);
}

/** Предельная длина цели занятий ученика. */
export const GOAL_MAX_LENGTH = 120;

export interface Student {
  id: string;
  name: string;
  subject: string;
  contact: string;
  /** Цена одного занятия. */
  rate: number;
  /** Часовой пояс ученика; пустая строка — не задан (BR-17). */
  timezone: StudentTimezone | '';
  /** Цель занятий, например «Подготовка к ОГЭ». */
  goal: string;
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
  /** Пробное занятие: не приносит денег и не списывает баланс (BR-16). */
  isTrial: boolean;
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

/**
 * Версия схемы данных. Каноническое объявление живёт в домене, чтобы команды
 * не зависели от слоя хранилища; `src/storage/schema.ts` его переэкспортирует.
 */
export const SCHEMA_VERSION = 2;
