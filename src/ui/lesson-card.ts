import { AppStore } from '../app/store.js';
import { formatInterval } from '../domain/time.js';
import { STATUS_LABELS, type Lesson } from '../domain/types.js';
import { openLessonSheet, openMoveSheet } from './sheets.js';
import { el } from './dom.js';

export interface LessonCardOptions {
  /** Пометить занятие как ближайшее ещё не начавшееся (FR-3A.8). */
  next?: boolean;
  /**
   * Короткая строка занятия для недели: время, ученик, предмет, статус.
   * Заметка и ДЗ остаются в шторке занятия (FR-3.1C).
   */
  compact?: boolean;
}

/**
 * Карточка занятия, общая для дневного и недельного видов.
 * Пробное занятие помечено текстом, а не только цветом (NFR-6, FR-3A.7).
 */
export function lessonCard(
  store: AppStore,
  lesson: Lesson,
  remaining: number,
  options: LessonCardOptions = {},
): HTMLElement {
  const state = store.getState();
  const student = state.students.find((s) => s.id === lesson.studentId);
  const color = student?.color ?? 'slate';
  const compact = options.compact === true;

  const card = el(
    'article',
    {
      class: `lesson lesson--${lesson.status} lesson--color-${color}${lesson.isTrial ? ' lesson--trial' : ''}${compact ? ' lesson--compact' : ''}`,
      'data-testid': 'lesson-card',
      'data-status': lesson.status,
      'data-trial': lesson.isTrial ? 'true' : undefined,
      'data-compact': compact ? 'true' : undefined,
      tabIndex: 0,
      role: 'button',
    },
    [
      el('span', { class: 'lesson__time', text: formatInterval(lesson.startTime, lesson.durationMin) }),
      el('strong', { class: 'lesson__student', text: student?.name ?? 'Ученик не найден' }),
      el('span', { class: 'lesson__subject', text: student?.subject ?? '' }),
      el('span', { class: `lesson__status lesson__status--${lesson.status}`, text: STATUS_LABELS[lesson.status] }),
      options.next ? el('span', { class: 'lesson__next', text: 'следующее' }) : null,
      lesson.isTrial ? el('span', { class: 'lesson__trial-flag', text: 'пробное' }) : null,
      remaining <= 0 ? el('span', { class: 'lesson__flag', text: remaining < 0 ? 'долг' : 'предоплата исчерпана' }) : null,
      compact ? null : lesson.topicNote ? el('span', { class: 'lesson__note', text: lesson.topicNote }) : null,
      compact ? null : lesson.homework ? el('span', { class: 'lesson__hw', text: `ДЗ: ${lesson.homework}` }) : null,
    ],
  );

  const open = (): void => openLessonSheet(store, lesson.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  if (lesson.status === 'planned' && !compact) {
    const move = el('button', { type: 'button', class: 'lesson__quick', text: 'Перенести' });
    move.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      openMoveSheet(store, lesson);
    });
    card.appendChild(move);
  }

  return card;
}
