import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppStore } from '../src/app/store.js';
import { SchedulerStorage, type StorageLike } from '../src/storage/repository.js';
import { mountApp } from '../src/ui/app.js';
import { closeSheet } from '../src/ui/controls.js';
import { formatMoney } from '../src/domain/money.js';
import { formatFullDate } from '../src/domain/dates.js';
import { STATUS_LABELS } from '../src/domain/types.js';

/* Приёмочный сценарий из ТЗ_MVP.md §11 в jsdom. */

const NOW = new Date(2026, 8, 24, 10, 0); // четверг 24 сентября 2026
const MONDAY = '2026-09-21';
const THURSDAY = '2026-09-24';
const SUNDAY = '2026-09-27';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let root: HTMLElement;
let memory: MemoryStorage;
let store: AppStore;

function mount(mem: MemoryStorage = memory): AppStore {
  const s = new AppStore(new SchedulerStorage(mem));
  s.setNow(NOW);
  mountApp(root, s, NOW);
  return s;
}

function text(): string {
  return root.textContent ?? '';
}

function testId(id: string): HTMLElement {
  const node = root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!node) throw new Error(`Не найден элемент ${id}. Разметка: ${text().slice(0, 400)}`);
  return node;
}

function allTestId(id: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
}

function clickByText(scope: ParentNode, label: string): void {
  const nodes = [...scope.querySelectorAll<HTMLElement>('button, label, [role="button"]')];
  const found = nodes.find((n) => (n.textContent ?? '').trim() === label);
  if (!found) {
    const available = nodes.map((n) => (n.textContent ?? '').trim()).filter(Boolean);
    throw new Error(`Не найдена кнопка «${label}». Доступно: ${available.join(' | ')}`);
  }
  found.click();
}

function setInput(scope: ParentNode, name: string, value: string): void {
  const input = scope.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Не найдено поле ${name}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

interface SlotEdit {
  weekday: string;
  startTime: string;
  durationMin: string;
}

function slotRows(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-slot-row]'));
}

/** Заполняет слот серии по порядку строк редактора (FR-2.4A). */
function setSlots(scope: ParentNode, slots: readonly SlotEdit[]): void {
  const rows = slotRows(scope);
  if (rows.length < slots.length) throw new Error('В форме меньше слотов, чем задано');
  slots.forEach((slot, index) => {
    const row = rows[index];
    if (!row) throw new Error(`Нет строки слота ${index}`);
    const day = row.querySelector<HTMLSelectElement>('[data-slot="day"]');
    const time = row.querySelector<HTMLInputElement>('[data-slot="time"]');
    const duration = row.querySelector<HTMLInputElement>('[data-slot="duration"]');
    if (!day || !time || !duration) throw new Error('Слот собран не полностью');
    day.value = slot.weekday;
    day.dispatchEvent(new Event('change', { bubbles: true }));
    time.value = slot.startTime;
    time.dispatchEvent(new Event('input', { bubbles: true }));
    duration.value = slot.durationMin;
    duration.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function sheet(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('.sheet__panel');
  if (!panel) throw new Error('Форма не открыта');
  return panel;
}

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  root.id = 'app';
  document.body.appendChild(root);
  memory = new MemoryStorage();
  store = mount();
});

describe('приёмочный сценарий', () => {
  it('шаг 1: приложение открывается на вкладке «День» с пустым расписанием', () => {
    expect(text()).toContain('Планировщик занятий');
    expect(allTestId('day-view')).toHaveLength(1);
    expect(allTestId('day-navigation')).toHaveLength(1);
    expect(allTestId('day-empty-firstrun')).toHaveLength(1);
    expect(text()).toContain('Пока нечего показывать');
    expect(allTestId('tab-day')).toHaveLength(1);
    expect(allTestId('tab-week')).toHaveLength(1);
    expect(allTestId('tab-students')).toHaveLength(1);
    expect(allTestId('week-summary')).toHaveLength(0);
    expect(allTestId('fab')).toHaveLength(1);
  });

  it('пустое состояние дня объясняет ввод данных и открывает форму ученика', () => {
    // Регрессия: на стартовой странице был пустой экран без объяснения,
    // где вводить данные.
    expect(allTestId('day-summary')).toHaveLength(0);

    clickByText(testId('day-empty-firstrun'), 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Иван');
    setInput(form, 'subject', 'Математика');
    setInput(form, 'rate', '1200');
    clickByText(form, 'Добавить ученика');

    expect(store.getState().students).toHaveLength(1);
    // Ученик есть, занятий нет: день показывает итог и предложение создать занятие.
    expect(allTestId('day-summary')).toHaveLength(1);
    expect(allTestId('day-empty')).toHaveLength(1);
    expect(text()).toContain('В этот день занятий нет');
  });

  it('шаг 2: добавляем ученика', () => {
    clickByText(root, 'Ученики');
    expect(text()).toContain('Учеников пока нет');

    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Иван');
    setInput(form, 'subject', 'Математика');
    setInput(form, 'rate', '1200');
    clickByText(form, 'Добавить ученика');

    expect(store.getState().students).toHaveLength(1);
    expect(store.getState().students[0]?.name).toBe('Иван');
    expect(allTestId('student-card')).toHaveLength(1);
    expect(text()).toContain('Иван');
  });

  it('шаг 3: пустое имя отклоняется с понятным сообщением', () => {
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'subject', 'Математика');
    setInput(form, 'rate', '1200');
    clickByText(form, 'Добавить ученика');

    expect(store.getState().students).toHaveLength(0);
    expect(form.querySelector('.form__error')?.textContent).toContain('имя ученика');
  });

  it('шаг 4: создаём занятие на неделю', () => {
    addStudent();

    testId('fab').click();
    const form = sheet();
    setInput(form, 'date', THURSDAY);
    setInput(form, 'startTime', '18:00');
    setInput(form, 'duration', '60');
    clickByText(form, 'Создать');

    expect(store.getState().lessons).toHaveLength(1);
    expect(allTestId('lesson-card')).toHaveLength(1);
    expect(text()).toContain('Иван');
  });

  it('шаг 5: конфликт слота показывается в форме, занятие не создаётся', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    testId('fab').click();
    const form = sheet();
    setInput(form, 'date', THURSDAY);
    setInput(form, 'startTime', '18:30');
    setInput(form, 'duration', '60');
    clickByText(form, 'Создать');

    expect(store.getState().lessons).toHaveLength(1);
    expect(form.querySelector('.form__error')?.textContent).toContain('Слот занят');
  });

  it('шаг 6: отмечаем занятие проведённым и пишем заметку с ДЗ', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    allTestId('lesson-card')[0]?.click();
    const form = sheet();
    setInput(form, 'topicNote', 'Квадратные уравнения');
    setInput(form, 'homework', '№1–8');
    clickByText(form, 'Сохранить заметку и ДЗ');
    expect(store.getState().lessons[0]?.homework).toBe('№1–8');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Проведено');

    const lesson = store.getState().lessons[0];
    expect(lesson?.status).toBe('done');
    expect(allTestId('lesson-card')[0]?.dataset.status).toBe('done');
  });

  it('шаг 7: статус различим не только цветом (NFR-6)', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Проведено');

    const card = allTestId('lesson-card')[0];
    expect(card?.textContent).toContain('Проведено');
  });

  it('шаг 8: перенос оставляет исходное занятие в своей ячейке недели', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Перенести');
    const moveForm = sheet();
    setInput(moveForm, 'moveDate', '2026-09-25');
    setInput(moveForm, 'moveTime', '16:00');
    setInput(moveForm, 'moveDuration', '60');
    clickByText(moveForm, 'Перенести');

    const lessons = store.getState().lessons;
    expect(lessons).toHaveLength(2);
    const source = lessons.find((l) => l.id === lessons.find((x) => x.status === 'moved')?.id);
    expect(source?.date).toBe(THURSDAY);
    expect(lessons.filter((l) => l.status === 'planned')[0]?.date).toBe('2026-09-25');

    // Исходная ячейка недели остаётся на месте.
    clickByText(root, 'Неделя');
    const thursday = root.querySelector<HTMLElement>(`[data-date="${THURSDAY}"]`);
    expect(thursday?.textContent).toContain('Перенесено');
  });

  it('шаг 9: перенос в прошлое отклоняется', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Перенести');
    const moveForm = sheet();
    setInput(moveForm, 'moveDate', '2026-09-20');
    setInput(moveForm, 'moveTime', '16:00');
    setInput(moveForm, 'moveDuration', '60');
    clickByText(moveForm, 'Перенести');

    expect(store.getState().lessons).toHaveLength(1);
    expect(moveForm.querySelector('.form__error')?.textContent).toContain('прошлое');
  });

  it('шаг 10: отменённое занятие освобождает слот', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Отменить');
    expect(store.getState().lessons[0]?.status).toBe('cancelled');

    createLesson(THURSDAY, '18:00', '60');
    expect(store.getState().lessons).toHaveLength(2);
  });

  it('шаг 11: баланс считается из оплат и проведённых занятий', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    clickByText(root, 'Ученики');
    allTestId('student-card')[0]?.click();
    clickByText(sheet(), 'Записать оплату');
    const payForm = sheet();
    setInput(payForm, 'lessonsCount', '10');
    setInput(payForm, 'paidAt', '2026-09-20');
    clickByText(payForm, 'Записать');

    expect(store.getState().payments).toHaveLength(1);
    allTestId('student-card')[0]?.click();
    expect(sheet().querySelector('[data-testid="balance"]')?.textContent).toContain('10');
  });

  it('шаг 12: серия создаёт занятия на четыре недели', () => {
    addStudent();

    testId('fab').click();
    const form = sheet();
    const seriesRadio = form.querySelector<HTMLInputElement>('#mode-series');
    if (!seriesRadio) throw new Error('Нет переключателя серии');
    seriesRadio.checked = true;
    seriesRadio.dispatchEvent(new Event('change', { bubbles: true }));

    setSlots(form, [{ weekday: '4', startTime: '18:00', durationMin: '60' }]);
    setInput(form, 'startsOn', THURSDAY);
    clickByText(form, 'Создать');

    expect(store.getState().series).toHaveLength(1);
    expect(store.getState().lessons).toHaveLength(4);
  });

  it('шаг 12A: серия создаёт по нескольку занятий в неделю, у каждого дня своё время', () => {
    // Требование FR-2.4A: одна серия — от 1 до 7 занятий в неделю,
    // у каждого дня недели своё время и своя длительность.
    addStudent();

    testId('fab').click();
    const form = sheet();
    const seriesRadio = form.querySelector<HTMLInputElement>('#mode-series');
    if (!seriesRadio) throw new Error('Нет переключателя серии');
    seriesRadio.checked = true;
    seriesRadio.dispatchEvent(new Event('change', { bubbles: true }));

    // В форме есть одна строка слота и кнопка добавления.
    expect(slotRows(form)).toHaveLength(1);
    const addSlot = form.querySelector<HTMLButtonElement>('[data-slot-add]');
    if (!addSlot) throw new Error('Нет кнопки добавления слота');

    addSlot.click();
    addSlot.click();
    expect(slotRows(form)).toHaveLength(3);

    // Пн 18:00–19:00, Ср 18:00–19:00, Сб 12:00–13:00.
    setSlots(form, [
      { weekday: '1', startTime: '18:00', durationMin: '60' },
      { weekday: '3', startTime: '18:00', durationMin: '60' },
      { weekday: '6', startTime: '12:00', durationMin: '60' },
    ]);
    setInput(form, 'startsOn', THURSDAY);
    expect(form.textContent).toContain('3 занятия в неделю');
    clickByText(form, 'Создать');

    const state = store.getState();
    expect(state.series).toHaveLength(1);
    expect(state.series[0]?.slots.map((s) => s.weekday)).toEqual([1, 3, 6]);
    // Три занятия в неделю на четыре недели горизонта = 12 занятий.
    expect(state.lessons).toHaveLength(12);
    // На каждый день недели не больше одного занятия (BR-3A).
    for (const lesson of state.lessons) {
      const sameDay = state.lessons.filter((l) => l.date === lesson.date);
      expect(sameDay).toHaveLength(1);
    }
    // Первые занятия — с первого дня горизонта, не раньше startsOn.
    expect(state.lessons.map((l) => l.date).sort()[0]).toBe(THURSDAY.replace('24', '26'));
    const saturday = state.lessons.find((l) => l.date === '2026-09-26');
    expect(saturday?.startTime).toBe('12:00');
    const monday = state.lessons.find((l) => l.date === '2026-09-28');
    expect(monday?.startTime).toBe('18:00');
    expect(state.lessons.some((l) => l.date < THURSDAY)).toBe(false);

    // Карточка ученика показывает всё расписание, а не один день.
    clickByText(root, 'Ученики');
    const schedule = allTestId('student-schedule')[0]?.textContent ?? '';
    expect(schedule).toContain('Пн 18:00');
    expect(schedule).toContain('Ср 18:00');
    expect(schedule).toContain('Сб 12:00');
  });

  it('шаг 12Б: день недели в серии нельзя выбрать дважды', () => {
    addStudent();

    testId('fab').click();
    const form = sheet();
    const seriesRadio = form.querySelector<HTMLInputElement>('#mode-series');
    if (!seriesRadio) throw new Error('Нет переключателя серии');
    seriesRadio.checked = true;
    seriesRadio.dispatchEvent(new Event('change', { bubbles: true }));

    form.querySelector<HTMLButtonElement>('[data-slot-add]')?.click();
    const rows = slotRows(form);
    setSlots(form, [
      { weekday: '1', startTime: '18:00', durationMin: '60' },
      { weekday: '3', startTime: '18:00', durationMin: '60' },
    ]);

    // Занятый другим слотом день в списке недоступен.
    expect(rows[1]?.querySelector<HTMLOptionElement>('option[value="1"]')?.disabled).toBe(true);
    expect(rows[0]?.querySelector<HTMLOptionElement>('option[value="3"]')?.disabled).toBe(true);
    expect(rows[1]?.querySelector<HTMLOptionElement>('option[value="3"]')?.disabled).toBe(false);

    // Даже если день продублирован, форма обязана отказать, а не создать серию.
    const firstDay = rows[0]?.querySelector<HTMLSelectElement>('[data-slot="day"]');
    const secondDay = rows[1]?.querySelector<HTMLSelectElement>('[data-slot="day"]');
    if (!firstDay || !secondDay) throw new Error('Слот собран не полностью');
    secondDay.value = '1';
    secondDay.dispatchEvent(new Event('change', { bubbles: true }));

    setInput(form, 'startsOn', THURSDAY);
    clickByText(form, 'Создать');

    expect(store.getState().series).toHaveLength(0);
    expect(form.querySelector<HTMLElement>('.form__error--active')?.textContent).toContain('День недели уже занят');
  });

  it('шаг 13: без учеников занятие создать нельзя', () => {
    testId('fab').click();
    expect(sheet().textContent).toContain('Сначала добавьте хотя бы одного ученика');
    closeSheet();
  });

  it('шаг 14: данные сохраняются после перезапуска', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    closeSheet();
    root.replaceChildren();
    const restarted = mount(memory);

    expect(restarted.getState().students).toHaveLength(1);
    expect(restarted.getState().lessons).toHaveLength(1);
    expect(allTestId('lesson-card')).toHaveLength(1);
  });

  it('шаг 15: переключение недель меняет видимые занятия', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    expect(allTestId('lesson-card')).toHaveLength(1);

    clickByText(root, 'Неделя');
    expect(allTestId('lesson-card')).toHaveLength(1);

    clickByText(root, '▶');
    expect(allTestId('lesson-card')).toHaveLength(0);

    clickByText(root, '◀');
    expect(allTestId('lesson-card')).toHaveLength(1);
  });

  it('шаг 15a: навигация по дням показывает занятия выбранного дня', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    expect(testId('day-label').textContent).toContain('24 сентября 2026');
    expect(allTestId('lesson-card')).toHaveLength(1);

    clickByText(root, '▶');
    expect(testId('day-label').textContent).toContain('25 сентября 2026');
    expect(allTestId('day-empty')).toHaveLength(1);
    expect(allTestId('lesson-card')).toHaveLength(0);

    clickByText(root, '◀');
    expect(allTestId('lesson-card')).toHaveLength(1);
  });

  it('шаг 15b: выбранная дата не сбрасывается при переключении вкладок (FR-1.10)', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, '▶');

    clickByText(root, 'Неделя');
    clickByText(root, 'Ученики');
    clickByText(root, 'День');

    expect(testId('day-label').textContent).toContain('25 сентября 2026');
  });

  it('шаг 15c: «Сегодня» возвращает выбранный день на сегодняшний', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, '▶');
    expect(testId('day-label').textContent).not.toContain('24 сентября 2026');

    clickByText(testId('day-navigation'), 'Сегодня');
    expect(testId('day-label').textContent).toContain('24 сентября 2026');
    expect(allTestId('lesson-card')).toHaveLength(1);
  });

  it('шаг 15d: ближайшее занятие дня помечено подписью', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createLesson(THURSDAY, '21:00', '60');

    const cards = allTestId('lesson-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('следующее');
    expect(cards[1]?.textContent).not.toContain('следующее');
  });

  it('шаг 15e: занятия дня отсортированы по времени', () => {
    addStudent();
    createLesson(THURSDAY, '21:00', '60');
    createLesson(THURSDAY, '18:00', '60');

    const times = allTestId('lesson-card').map((c) => c.querySelector('.lesson__time')?.textContent ?? '');
    expect(times[0]).toContain('18:00');
    expect(times[1]).toContain('21:00');
  });

  it('шаг 15f: дневной итог считает количество и сумму к оплате', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createLesson(THURSDAY, '19:30', '60');

    const payable = testId('day-payable');
    expect(payable.textContent).toContain('К оплате за день');
    expect(payable.textContent).toContain('2 400 ₽');
  });

  it('шаг 15g: счётчик дня показывает число занятий, включая пробное', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createTrialLesson(THURSDAY, '16:00', '60');

    expect(testId('day-summary').textContent).toContain('Всего');
    expect(allTestId('lesson-card')).toHaveLength(2);
    // Пробное в количествах остаётся, но денег не приносит.
    expect(testId('day-payable').textContent).toContain('1 200 ₽');
  });

  it('шаг 15h: пробное занятие подписано и не списывает баланс (BR-16)', () => {
    addStudent();
    createTrialLesson(THURSDAY, '18:00', '60');

    const card = allTestId('lesson-card')[0];
    expect(card?.textContent).toContain('пробное');
    expect(card?.dataset.trial).toBe('true');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Проведено');
    expect(store.getState().lessons[0]?.status).toBe('done');
    expect(testId('day-payable').textContent).toContain('0');

    clickByText(root, 'Ученики');
    allTestId('student-card')[0]?.click();
    expect(sheet().querySelector('[data-testid="balance"]')?.textContent).toContain('осталось 0');
  });

  it('шаг 15i: цель и часовой пояс сохраняются и показываются в карточке', () => {
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Анна');
    setInput(form, 'subject', 'Английский');
    setInput(form, 'rate', '1000');
    setTextarea(form, 'goal', 'Подготовка к ЕГЭ по английскому');
    setSelect(form, 'timezone', 'Europe/Kaliningrad');
    clickByText(form, 'Добавить ученика');

    const student = store.getState().students[0];
    expect(student?.goal).toBe('Подготовка к ЕГЭ по английскому');
    expect(student?.timezone).toBe('Europe/Kaliningrad');

    const listCard = allTestId('student-card')[0];
    expect(listCard?.textContent).toContain('Цель: Подготовка к ЕГЭ по английскому');
    expect(listCard?.textContent).toContain('Калининград');

    allTestId('student-card')[0]?.click();
    const card = sheet();
    expect(card.textContent).toContain('Подготовка к ЕГЭ по английскому');
    expect(card.textContent).toContain('Калининград');
  });

  it('шаг 15j: часовой пояс не сдвигает дату и время занятия (BR-17)', () => {
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Анна');
    setInput(form, 'subject', 'Английский');
    setInput(form, 'rate', '1000');
    setSelect(form, 'timezone', 'Asia/Kamchatka');
    clickByText(form, 'Добавить ученика');
    clickByText(root, 'День');

    testId('fab').click();
    const lessonForm = sheet();
    setInput(lessonForm, 'date', THURSDAY);
    setInput(lessonForm, 'startTime', '18:00');
    setInput(lessonForm, 'duration', '60');
    clickByText(lessonForm, 'Создать');

    const lesson = store.getState().lessons[0];
    expect(lesson?.date).toBe(THURSDAY);
    expect(lesson?.startTime).toBe('18:00');
    expect(allTestId('lesson-card')[0]?.textContent).toContain('18:00');
  });

  it('шаг 15k: серия не создаёт пробных занятий', () => {
    addStudent();

    testId('fab').click();
    const form = sheet();
    const seriesRadio = form.querySelector<HTMLInputElement>('#mode-series');
    if (!seriesRadio) throw new Error('Нет переключателя серии');
    seriesRadio.checked = true;
    seriesRadio.dispatchEvent(new Event('change', { bubbles: true }));

    setSlots(form, [{ weekday: '4', startTime: '18:00', durationMin: '60' }]);
    setInput(form, 'startsOn', THURSDAY);
    clickByText(form, 'Создать');

    expect(store.getState().lessons.every((l) => l.isTrial === false)).toBe(true);
  });

  it('расписание создаётся из карточки ученика отдельно для каждого', () => {
    addStudent();
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const second = sheet();
    setInput(second, 'name', 'Пётр');
    setInput(second, 'subject', 'Физика');
    setInput(second, 'rate', '1500');
    clickByText(second, 'Добавить ученика');

    const makeSeries = (cardIndex: number, weekday: string, time: string): void => {
      clickByText(root, 'Ученики');
      allTestId('student-card')[cardIndex]?.click();
      clickByText(sheet(), 'Создать серию');
      const form = sheet();
      expect(form.textContent).toContain('Серия занятий');
      setSlots(form, [{ weekday, startTime: time, durationMin: '60' }]);
      setInput(form, 'startsOn', THURSDAY);
      clickByText(form, 'Создать');
    };

    // Регресс: раньше серию можно было создать только из «Новое занятие»,
    // и путь к второму ученику был неочевиден.
    expect(allTestId('student-schedule')[0]?.textContent).toContain('Расписание не задано');

    makeSeries(0, '4', '18:00');
    makeSeries(1, '6', '10:00');

    const state = store.getState();
    expect(state.series).toHaveLength(2);
    const anna = state.students[0];
    const petr = state.students[1];
    if (!anna || !petr) throw new Error('Ожидались два ученика');
    expect(state.series.filter((s) => s.studentId === anna.id)).toHaveLength(1);
    expect(state.series.filter((s) => s.studentId === petr.id)).toHaveLength(1);
    expect(state.series.find((s) => s.studentId === petr.id)?.slots[0]?.weekday).toBe(6);
    expect(state.series.find((s) => s.studentId === petr.id)?.slots[0]?.startTime).toBe('10:00');

    clickByText(root, 'Ученики');
    const schedules = allTestId('student-schedule').map((n) => n.textContent ?? '');
    expect(schedules[0]).toContain('Чт 18:00');
    expect(schedules[1]).toContain('Сб 10:00');

    // Занятия серии второго ученика не смешиваются с первым.
    const petrLessons = state.lessons.filter((l) => l.studentId === petr.id);
    expect(petrLessons.length).toBeGreaterThan(0);
    expect(petrLessons.every((l) => state.series.some((s) => s.id === l.seriesId))).toBe(true);
  });

  it('занятый слот не закрывает форму, а объясняет, что занять', () => {
    addStudent();
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const second = sheet();
    setInput(second, 'name', 'Пётр');
    setInput(second, 'subject', 'Физика');
    setInput(second, 'rate', '1000');
    clickByText(second, 'Добавить ученика');

    // Регресс: render() закрывал шторку при любой перерисовке, поэтому при
    // отказе форма исчезала вместе с введёнными данными, а текст ошибки
    // оставался только в исчезающем тосте. Пользователь считал, что время
    // второму ученику записать нельзя.
    const openSeries = (index: number): void => {
      clickByText(root, 'Ученики');
      allTestId('student-card')[index]?.click();
      clickByText(sheet(), 'Создать серию');
    };

    openSeries(0);
    setSlots(sheet(), [{ weekday: '4', startTime: '18:00', durationMin: '60' }]);
    setInput(sheet(), 'startsOn', THURSDAY);
    clickByText(sheet(), 'Создать');
    expect(store.getState().series).toHaveLength(1);

    openSeries(1);
    setSlots(sheet(), [{ weekday: '4', startTime: '18:00', durationMin: '60' }]);
    setInput(sheet(), 'startsOn', THURSDAY);
    clickByText(sheet(), 'Создать');

    // Форма осталась открытой, введённые значения на месте, причина понятна.
    const form = sheet();
    expect(form.textContent).toContain('Серия занятий');
    expect(slotRows(form)[0]?.querySelector<HTMLSelectElement>('[data-slot="day"]')?.value).toBe('4');
    expect(slotRows(form)[0]?.querySelector<HTMLInputElement>('[data-slot="time"]')?.value).toBe('18:00');
    const error = form.querySelector<HTMLElement>('.form__error--active');
    expect(error?.textContent).toContain('Занято');
    expect(error?.textContent).toContain('Иван');
    expect(error?.textContent).toContain('другое время');
    expect(store.getState().series).toHaveLength(1);

    // После правки времени та же форма сохраняет серию второму ученику.
    const timeField = form.querySelector<HTMLInputElement>('[data-slot="time"]');
    if (!timeField) throw new Error('Нет поля времени слота');
    timeField.value = '19:30';
    timeField.dispatchEvent(new Event('input', { bubbles: true }));
    clickByText(form, 'Создать');
    expect(store.getState().series).toHaveLength(2);
    expect(store.getState().series[1]?.slots[0]?.startTime).toBe('19:30');
  });

  it('незаполненная форма ученика не закрывается молча, а объясняет, чего не хватает', () => {
    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Второй');

    clickByText(form, 'Добавить ученика');

    // Регресс: форма закрывалась, ученик не добавлялся, причина терялась.
    // Пользователь делал вывод, что приложение поддерживает только одного.
    const same = sheet();
    expect(same.textContent).toContain('Новый ученик');
    expect(same.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('Второй');
    const error = same.querySelector<HTMLElement>('.form__error--active');
    expect(error?.textContent).toContain('предмет');
    expect(store.getState().students).toHaveLength(0);

    setInput(same, 'subject', 'Математика');
    setInput(same, 'rate', '800');
    clickByText(same, 'Добавить ученика');

    expect(store.getState().students).toHaveLength(1);
    expect(store.getState().students[0]?.name).toBe('Второй');
  });

  it('шаг 16: отключённый ученик исчезает из расписания, но история остаётся', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    clickByText(root, 'Ученики');
    allTestId('student-card')[0]?.click();
    clickByText(sheet(), 'Убрать из расписания');

    expect(store.getState().students[0]?.active).toBe(false);
    expect(store.getState().lessons).toHaveLength(1);

    clickByText(root, 'Неделя');
    expect(allTestId('lesson-card')).toHaveLength(0);
  });

  it('шаг 17: недельный итог показывает число занятий и сумму к оплате', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createLesson(THURSDAY, '19:30', '60');

    clickByText(root, 'Неделя');
    const payable = testId('week-payable');
    expect(payable.textContent).toContain('К оплате за неделю');
    expect(payable.textContent).toContain('2 400 ₽');
  });

  it('шаг 18: отменённое и перенесённое занятия не входят в сумму к оплате', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Отменить');
    clickByText(root, 'Неделя');

    expect(testId('week-payable').textContent).toContain('0 ₽');
  });

  it('шаг 19: при исчерпанной предоплате показан долг в рублях', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    allTestId('lesson-card')[0]?.click();
    clickByText(sheet(), 'Проведено');
    clickByText(root, 'Неделя');

    const debt = testId('week-debt');
    expect(debt.textContent).toContain('Долг');
    expect(debt.textContent).toContain('1\u00a0200\u00a0₽');
  });

  it('шаг 20: без долга строка долга не показывается', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, 'Неделя');

    expect(allTestId('week-debt')).toHaveLength(0);
  });
});

describe('рабочая неделя репетитора Пн–Суб', () => {
  it('шаг 21: неделя содержит шесть рабочих дней, воскресенья в списке нет', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, 'Неделя');

    const columns = [...testId('week-grid').querySelectorAll<HTMLElement>('[data-date]')];
    expect(columns.map((c) => c.dataset.date)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    expect(columns.map((c) => c.querySelector('.day__name')?.textContent)).toEqual([
      'Понедельник',
      'Вторник',
      'Среда',
      'Четверг',
      'Пятница',
      'Суббота',
    ]);

    // Воскресенье показано отдельным блоком, а не колонкой сетки.
    const dayOff = testId('week-dayoff');
    expect(dayOff.dataset.date).toBe('2026-09-27');
    expect(dayOff.textContent).toContain('Воскресенье');
    expect(dayOff.textContent).toContain('В воскресенье занятий нет');
  });

  it('шаг 22: в блоке дня видны время, ученик и предмет', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, 'Неделя');

    const card = testId('week-grid').querySelector<HTMLElement>('[data-testid="lesson-card"]');
    expect(card?.textContent).toContain('18:00');
    expect(card?.textContent).toContain('Иван');
    expect(card?.textContent).toContain('Математика');
    expect(card?.dataset.compact).toBe('true');
  });

  it('неделя: в понедельнике занятия идут по времени под своим заголовком (FR-3.1)', () => {
    addStudent('Свелана', 'Английский');
    createLesson(MONDAY, '18:00', '60');
    addStudent('Анжела', 'Английский');
    createLesson(MONDAY, '19:00', '60', 'Анжела');
    clickByText(root, 'Неделя');

    const monday = testId('week-grid').querySelector<HTMLElement>('[data-date="2026-09-21"]');
    expect(monday?.querySelector('.day__name')?.textContent).toBe('Понедельник');

    const rows = [...(monday?.querySelectorAll<HTMLElement>('[data-testid="lesson-card"]') ?? [])].map(
      (r) => r.textContent ?? '',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('18:00');
    expect(rows[0]).toContain('Свелана');
    expect(rows[0]).toContain('Английский');
    expect(rows[1]).toContain('19:00');
    expect(rows[1]).toContain('Анжела');
  });

  it('день: список занятий идёт раньше итога дня (FR-3.1I)', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    clickByText(root, 'День');

    const view = testId('day-view');
    const summary = testId('day-summary');
    const card = view.querySelector<HTMLElement>('[data-testid="lesson-card"]');
    expect(card).not.toBeNull();
    const order = [...view.children];
    expect(order.indexOf(card!)).toBeLessThan(order.indexOf(summary));
    expect(order.indexOf(summary)).toBe(order.length - 1);
  });

  it('шаг 23: занятия воскресенья показаны отдельным блоком и входят в итог недели', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createLesson(SUNDAY, '12:00', '60');
    createLesson(SUNDAY, '16:00', '90');
    clickByText(root, 'Неделя');

    const dayOff = testId('week-dayoff');
    expect(dayOff.querySelectorAll('[data-testid="lesson-card"]')).toHaveLength(2);
    expect(dayOff.textContent).toContain('12:00');
    expect(dayOff.textContent).toContain('16:00');
    expect(dayOff.textContent).not.toContain('В воскресенье занятий нет');

    // Итог недели считает Пн–Вс, поэтому воскресенье в сумме.
    expect(testId('week-summary').textContent).toContain('3');
    expect(testId('week-payable').textContent).toContain('3 600 ₽');
  });

  it('шаг 24: перенос из воскресенья оставляет исходное занятие в блоке выходного дня', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');
    createLesson(SUNDAY, '12:00', '60');
    clickByText(root, 'Неделя');

    testId('week-dayoff').querySelector<HTMLElement>('[data-testid="lesson-card"]')?.click();
    clickByText(sheet(), 'Перенести');
    const moveForm = sheet();
    setInput(moveForm, 'moveDate', '2026-09-25');
    setInput(moveForm, 'moveTime', '15:00');
    setInput(moveForm, 'moveDuration', '60');
    clickByText(moveForm, 'Перенести');
    clickByText(root, 'Неделя');

    // Исходное занятие осталось в воскресенье со статусом «перенесено».
    const dayOff = testId('week-dayoff');
    expect(dayOff.textContent).toContain('12:00');
    expect(dayOff.textContent).toContain('Перенесено');

    // Новое занятие появилось в пятнице, старые 12:00 там нет.
    const friday = root.querySelector<HTMLElement>('[data-date="2026-09-25"]');
    expect(friday?.textContent).toContain('15:00');
    expect(friday?.textContent).not.toContain('12:00');

    // В сумму к оплате перенесённое не входит: четверг и пятница.
    expect(testId('week-payable').textContent).toContain('2 400 ₽');
  });

  it('пустая неделя объясняет, что занятия закрытого ученика не показываются', () => {
    addStudent();
    createLesson(THURSDAY, '18:00', '60');

    clickByText(root, 'Ученики');
    allTestId('student-card')[0]?.click();
    clickByText(sheet(), 'Убрать из расписания');
    closeSheet();

    clickByText(root, 'Неделя');
    expect(allTestId('lesson-card')).toHaveLength(0);
    expect(testId('week-hint').textContent).toContain('Занятия закрытого ученика в неделю не попадают');
    // Итог недели соответствует тому, что показано в сетке.
    expect(testId('week-payable').textContent).toContain(formatMoney(0));
  });

  it('пустая неделя без закрытых учеников предлагает перейти к ближайшему занятию', () => {
    addStudent();
    createLesson('2026-10-05', '18:00', '60');
    clickByText(root, 'Неделя');

    expect(testId('week-grid').querySelectorAll('[data-testid="lesson-card"]')).toHaveLength(0);
    const hint = testId('week-hint');
    expect(hint.textContent).toContain('Ближайшее занятие');
    clickByText(hint, `Перейти к занятию ${formatFullDate('2026-10-05')}`);

    expect(testId('week-grid').querySelectorAll('[data-testid="lesson-card"]')).toHaveLength(1);
  });
});

describe('состояния интерфейса', () => {
  it('недоступное хранилище показывает предупреждение и не даёт создать ученика', () => {
    const blocked = new AppStore(new SchedulerStorage(null));
    blocked.setNow(NOW);
    mountApp(root, blocked, NOW);

    expect(text()).toContain('Локальное хранилище недоступно');

    clickByText(root, 'Ученики');
    clickByText(root, 'Добавить ученика');
    const form = sheet();
    setInput(form, 'name', 'Иван');
    setInput(form, 'subject', 'Математика');
    setInput(form, 'rate', '1200');
    clickByText(form, 'Добавить ученика');

    expect(blocked.getState().students).toHaveLength(0);
    expect(root.textContent).toContain('Локальное хранилище недоступно');
  });

  it('нижняя панель вкладок умещается в одну строку и не накрывает содержимое', () => {
    const tabbar = root.querySelector<HTMLElement>('.tabbar');
    expect(tabbar).not.toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    const columns = css.match(/grid-template-columns:\s*repeat\((\d+),\s*1fr\)/);
    expect(Number(columns?.[1] ?? 0)).toBeGreaterThanOrEqual(allTestId('tab-day').length + 1);
    // Резерв под панель берётся из той же переменной, что и её высота.
    expect(css).toMatch(/\.app\s*\{[^}]*padding-bottom:\s*var\(--tabbar-h\)/);
  });

  it('карточка ученика показывает ближайшее занятие, а не последнее по дате', () => {
    addStudent();
    createLesson('2026-10-05', '18:00', '60');
    createLesson('2026-10-19', '18:00', '60');
    clickByText(root, 'Ученики');

    const card = allTestId('student-card')[0];
    expect(card?.textContent).toContain('Ближайшее занятие');
    expect(card?.textContent).toContain('5 октября 2026');
    expect(card?.textContent).not.toContain('19 октября');
  });

  it('после всех занятий подпись меняется на «Последнее занятие»', () => {
    addStudent();
    createLesson('2026-09-10', '18:00', '60');
    clickByText(root, 'Ученики');

    const card = allTestId('student-card')[0];
    expect(card?.textContent).toContain('Последнее занятие: 10 сентября 2026');
    expect(card?.textContent).not.toContain('Ближайшее занятие');
  });

  it('список занятий ученика начинается с ближайших и показывает всех (FR-3.1H)', () => {
    addStudent();
    createLesson('2026-09-10', '18:00', '60');
    for (const date of ['2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19']) {
      createLesson(date, '18:00', '60');
    }
    clickByText(root, 'Ученики');
    allTestId('student-card')[0]?.click();

    const body = sheet();
    expect(body.textContent).toContain('Ближайшие');
    expect(body.textContent).toContain('Прошедшие');
    expect(body.textContent).toContain('Всего занятий: 8');

    // До «Показать все» видны пять ближайших и прошедшие, дальние не подменяют их.
    const rows = () =>
      [...sheet().querySelectorAll<HTMLElement>('[data-testid="student-lesson"]')].map(
        (r) => r.textContent ?? '',
      );
    expect(rows()).toHaveLength(6);
    expect(rows()[0]).toContain('28 сентября 2026');
    expect(rows()[4]).toContain('12 октября 2026');
    expect(rows().at(-1)).toContain('10 сентября 2026');
    expect(rows().join(' ')).not.toContain('15 октября');
    expect(rows().join(' ')).not.toContain('19 октября');

    clickByText(sheet(), 'Показать все (8)');
    expect(rows()).toHaveLength(8);
    expect(rows().at(-1)).toContain('10 сентября 2026');
  });

  it('повреждённые данные не удаляются молча, а резервный слот используется', () => {
    memory.setItem('tutor-scheduler:state', '{сломанный json');
    const recovered = new AppStore(new SchedulerStorage(memory));
    recovered.setNow(NOW);
    mountApp(root, recovered, NOW);

    expect(text()).toContain('Данные повреждены');
    expect(memory.getItem('tutor-scheduler:state:recovery')).toBe('{сломанный json');
  });
});

describe('пересечения в данных (BR-2A, FR-3.1J)', () => {
  const SEED_ISO = '2026-09-24T10:00:00.000Z';

  function seededState(): string {
    return JSON.stringify({
      version: 3,
      students: [
        { id: 's1', name: 'Свелана', subject: 'Английский', contact: '', rate: 1000, color: 'blue', active: true, createdAt: SEED_ISO },
        { id: 's2', name: 'Анжела', subject: 'Английский', contact: '', rate: 1200, color: 'green', active: true, createdAt: SEED_ISO },
      ],
      series: [],
      lessons: [
        seededLesson('l1', 's1', '18:00'),
        seededLesson('l2', 's2', '18:00'),
      ],
      payments: [],
    });
  }

  function seededLesson(id: string, studentId: string, startTime: string): Record<string, unknown> {
    return {
      id,
      studentId,
      date: THURSDAY,
      startTime,
      durationMin: 60,
      status: 'planned',
      isTrial: false,
      topicNote: '',
      homework: '',
      seriesId: null,
      movedToLessonId: null,
      movedFromLessonId: null,
      createdAt: SEED_ISO,
      updatedAt: SEED_ISO,
    };
  }

  /** Пересечение, которого приложение само не создаёт: занятия пришли извне. */
  function mountWithConflict(): AppStore {
    memory.setItem('tutor-scheduler:state', seededState());
    return mount();
  }

  /** Шторка открыта в body, а не внутри корня приложения. */
  function sheetRows(id: string): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  }

  function openConflictList(): void {
    clickByText(root, 'Показать список');
  }

  it('баннер о пересечении виден на всех трёх вкладках и данные не меняются', () => {
    const seeded = mountWithConflict();

    expect(allTestId('conflicts-banner')).toHaveLength(1);
    expect(text()).toContain('В расписании пересечения');
    expect(text()).toContain('Занятий на одно время: 1');

    for (const tab of ['Неделя', 'Ученики', 'День']) {
      clickByText(root, tab);
      expect(allTestId('conflicts-banner')).toHaveLength(1);
    }
    expect(seeded.getState().lessons).toHaveLength(2);
  });

  it('список пересечений показывает день, время, ученика и статус', () => {
    mountWithConflict();
    openConflictList();

    expect(document.querySelector('[data-testid="conflicts-sheet"]')).not.toBeNull();
    expect(sheetRows('conflict-day')).toHaveLength(1);
    expect(sheetRows('conflict-day')[0]?.textContent).toContain('24 сентября');
    expect(sheetRows('conflict-row')).toHaveLength(2);
    expect(sheetRows('conflict-row')[0]?.textContent).toContain('18:00');
    expect(sheetRows('conflict-row')[0]?.textContent).toContain('Свелана');
    expect(sheetRows('conflict-row')[0]?.textContent).toContain(STATUS_LABELS.planned);
    expect(sheetRows('conflict-row')[1]?.textContent).toContain('Анжела');
  });

  it('нажатие на занятие в списке открывает его карточку', () => {
    mountWithConflict();
    openConflictList();
    sheetRows('conflict-row')[1]?.click();

    expect(document.querySelector('[data-testid="lesson-sheet"]')).not.toBeNull();
    expect(sheet().textContent).toContain('Анжела');
  });

  it('после отмены лишнего занятия баннер исчезает', () => {
    const seeded = mountWithConflict();
    openConflictList();
    sheetRows('conflict-row')[0]?.click();
    clickByText(sheet(), 'Отменить');

    expect(seeded.getState().lessons).toHaveLength(2);
    expect(seeded.getState().lessons.some((l) => l.status === 'cancelled')).toBe(true);
    expect(allTestId('conflicts-banner')).toHaveLength(0);
    expect(sheetRows('conflict-row')).toHaveLength(0);
  });

  it('занятия без пересечений баннер не показывают', () => {
    addStudent('Свелана', 'Английский');
    createLesson(THURSDAY, '18:00', '60');
    createLesson(THURSDAY, '19:00', '60');

    expect(allTestId('conflicts-banner')).toHaveLength(0);
  });
});

describe('мобильные требования', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

  it('задана широкая адаптивная сетка для телефонов', () => {
    expect(css).toContain('@media (min-width: 760px)');
    expect(css).toContain('100dvh');
  });

  it('интерактивные элементы имеют увеличенную зону нажатия', () => {
    expect(css).toContain('--tap: 44px');
  });

  it('нет фиксированной ширины, которая ломала бы вёрстку с 320 px', () => {
    expect(css).not.toMatch(/^\s*width:\s*\d{3,}px/m);
  });

  it('итоги недели не выходят за границы на 320 px', () => {
    // Регрессия: сетка из четырёх счётчиков распирала экран на 10 px,
    // потому что колонки не могли сжиматься уже содержимого подписи.
    expect(css).toMatch(/\.chip\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.chip__label\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/@media \(max-width: 359px\)[\s\S]*?\.summary__row\s*\{\s*grid-template-columns:\s*repeat\(2, 1fr\)/);
  });

  it('денежные итоги недели ужимаются на 320 px', () => {
    expect(css).toMatch(/\.summary__row--money\s*\{[^}]*minmax\(\d+px, 1fr\)/);
    expect(css).toMatch(/\.summary__money\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.summary__money-value\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('состояние занятия передаётся не только цветом', () => {
    expect(css).toContain('.lesson--cancelled');
    expect(css).toContain('text-decoration: line-through');
  });

  it('неделя: блоки дней в две колонки на широком экране и строкой на узком', () => {
    expect(css).toMatch(/@media \(min-width: 760px\)[\s\S]*?\.week__grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).not.toMatch(/repeat\(7, minmax\(0, 1fr\)\)/);
    expect(css).not.toMatch(/repeat\(6, minmax\(0, 1fr\)\)/);
  });

  it('блок воскресенья не ломает вёрстку на 320 px', () => {
    expect(css).toMatch(/\.dayoff\s*\{[^}]*border: 1px dashed/);
    expect(css).toMatch(/\.dayoff__list\s*\{[^}]*display: grid/);
    expect(css).toMatch(/\.dayoff__name\s*\{[^}]*min-width:\s*0|overflow-wrap/);
  });
});

function setTextarea(scope: ParentNode, name: string, value: string): void {
  const area = scope.querySelector<HTMLTextAreaElement>(`[name="${name}"]`);
  if (!area) throw new Error(`Не найдено поле ${name}`);
  area.value = value;
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(scope: ParentNode, name: string, value: string): void {
  const select = scope.querySelector<HTMLSelectElement>(`[name="${name}"]`);
  if (!select) throw new Error(`Не найден список ${name}`);
  if (![...select.options].some((o) => o.value === value)) {
    throw new Error(`В списке ${name} нет значения ${value}`);
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function setTrial(scope: ParentNode, checked: boolean): void {
  const box = scope.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error('Не найден флажок пробного занятия');
  box.checked = checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ------------------------------------------------------------- помощники */

function addStudent(name = 'Иван', subject = 'Математика'): void {
  clickByText(root, 'Ученики');
  clickByText(root, 'Добавить ученика');
  const form = sheet();
  setInput(form, 'name', name);
  setInput(form, 'subject', subject);
  setInput(form, 'rate', '1200');
  clickByText(form, 'Добавить ученика');
  clickByText(root, 'День');
}

function createLesson(date: string, time: string, duration: string, studentName?: string): void {
  testId('fab').click();
  const form = sheet();
  if (studentName) {
    const select = form.querySelector<HTMLSelectElement>('[name="student"]');
    if (!select) throw new Error('В форме занятия нет выбора ученика');
    const option = [...select.options].find((o) => o.textContent?.includes(studentName));
    if (!option) throw new Error(`Нет ученика ${studentName}`);
    setSelect(form, 'student', option.value);
  }
  setInput(form, 'date', date);
  setInput(form, 'startTime', time);
  setInput(form, 'duration', duration);
  clickByText(form, 'Создать');
}

function createTrialLesson(date: string, time: string, duration: string): void {
  testId('fab').click();
  const form = sheet();
  setInput(form, 'date', date);
  setInput(form, 'startTime', time);
  setInput(form, 'duration', duration);
  setTrial(form, true);
  clickByText(form, 'Создать');
}
