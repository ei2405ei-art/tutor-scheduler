import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppStore } from '../src/app/store.js';
import { SchedulerStorage, type StorageLike } from '../src/storage/repository.js';
import { mountApp } from '../src/ui/app.js';
import { closeSheet } from '../src/ui/controls.js';

/* Приёмочный сценарий из ТЗ_MVP.md §11 в jsdom. */

const NOW = new Date(2026, 8, 24, 10, 0); // четверг 24 сентября 2026
const THURSDAY = '2026-09-24';

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
  it('шаг 1: приложение открывается с пустым расписанием', () => {
    expect(text()).toContain('Планировщик занятий');
    expect(allTestId('week-summary')).toHaveLength(1);
    expect(text()).toContain('Нет занятий');
    expect(allTestId('fab')).toHaveLength(1);
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

    setInput(form, 'weekday', '4');
    setInput(form, 'seriesTime', '18:00');
    setInput(form, 'seriesDuration', '60');
    setInput(form, 'startsOn', THURSDAY);
    clickByText(form, 'Создать');

    expect(store.getState().series).toHaveLength(1);
    expect(store.getState().lessons).toHaveLength(4);
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

    clickByText(root, '▶');
    expect(allTestId('lesson-card')).toHaveLength(0);

    clickByText(root, '◀');
    expect(allTestId('lesson-card')).toHaveLength(1);
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

  it('повреждённые данные не удаляются молча, а резервный слот используется', () => {
    memory.setItem('tutor-scheduler:state', '{сломанный json');
    const recovered = new AppStore(new SchedulerStorage(memory));
    recovered.setNow(NOW);
    mountApp(root, recovered, NOW);

    expect(text()).toContain('Данные повреждены');
    expect(memory.getItem('tutor-scheduler:state:recovery')).toBe('{сломанный json');
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

  it('состояние занятия передаётся не только цветом', () => {
    expect(css).toContain('.lesson--cancelled');
    expect(css).toContain('text-decoration: line-through');
  });
});

/* ------------------------------------------------------------- помощники */

function addStudent(): void {
  clickByText(root, 'Ученики');
  clickByText(root, 'Добавить ученика');
  const form = sheet();
  setInput(form, 'name', 'Иван');
  setInput(form, 'subject', 'Математика');
  setInput(form, 'rate', '1200');
  clickByText(form, 'Добавить ученика');
  clickByText(root, 'Неделя');
}

function createLesson(date: string, time: string, duration: string): void {
  testId('fab').click();
  const form = sheet();
  setInput(form, 'date', date);
  setInput(form, 'startTime', time);
  setInput(form, 'duration', duration);
  clickByText(form, 'Создать');
}
