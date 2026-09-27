import { WEEKDAYS_SHORT } from '../domain/dates.js';
import { describeSlot, lessonsPerWeekText, sortSlots } from '../domain/series.js';
import { type SeriesSlot } from '../domain/types.js';
import { button } from './controls.js';
import { el } from './dom.js';

export interface SlotEditor {
  /** Контейнер со списком слотов и кнопкой добавления. */
  node: HTMLElement;
  /** Текущие значения слотов в том порядке, в котором их видит репетитор. */
  slots: () => SeriesSlot[];
  /** Слот, на который стоит поставить фокус после добавления. */
  focusLast: () => void;
}

interface SlotRow {
  weekday: number;
  startTime: string;
  durationMin: number;
  node: HTMLElement;
  daySelect: HTMLSelectElement;
  timeInput: HTMLInputElement;
  durationInput: HTMLInputElement;
}

/** Первый день недели, ещё не занятый другим слотами. */
function nextFreeWeekday(rows: readonly SlotRow[]): number {
  const used = new Set(rows.map((r) => r.weekday));
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    if (!used.has(weekday)) return weekday;
  }
  return 1;
}

/**
 * Редактор недельного рисунка серии: список слотов, у каждого свои день,
 * время и длительность (FR-2.4A). День, уже занятый другим слотом, в списке
 * недоступен — два занятия в один день создаются двумя сериями (BR-3A).
 */
export function createSlotEditor(initial: readonly SeriesSlot[] = []): SlotEditor {
  const list = el('div', { class: 'slots' });
  const summary = el('p', { class: 'slots__summary' });
  const rows: SlotRow[] = [];

  function readRow(row: SlotRow): SeriesSlot {
    return {
      weekday: Number(row.daySelect.value),
      startTime: row.timeInput.value,
      durationMin: Number(row.durationInput.value),
    };
  }

  /** Дни, занятые другими слотами, в выпадающих списках недоступны. */
  function syncOptions(): void {
    for (const row of rows) {
      const own = Number(row.daySelect.value);
      for (const option of Array.from(row.daySelect.options)) {
        const weekday = Number(option.value);
        const takenElsewhere = rows.some(
          (other) => other !== row && other.weekday === weekday,
        );
        option.disabled = takenElsewhere && weekday !== own;
      }
    }
  }

  function syncSummary(): void {
    const current = sortSlots(rows.map(readRow));
    const details = current
      .filter((slot) => slot.startTime)
      .map((slot) => describeSlot(slot))
      .join(', ');
    summary.textContent = details
      ? `${lessonsPerWeekText(current)}: ${details}`
      : lessonsPerWeekText(current);
  }

  function removeRow(row: SlotRow): void {
    const index = rows.indexOf(row);
    if (index === -1) return;
    rows.splice(index, 1);
    row.node.remove();
    if (rows.length === 0) addRow();
    syncOptions();
    syncRemoveButtons();
    syncSummary();
  }

  function syncRemoveButtons(): void {
    for (const row of rows) {
      const remove = row.node.querySelector<HTMLButtonElement>('.slots__remove');
      if (remove) remove.disabled = rows.length === 1;
    }
  }

  function addRow(prefilled?: Partial<SeriesSlot>): void {
    const weekday = prefilled?.weekday ?? nextFreeWeekday(rows);
    const daySelect = el('select', {
      class: 'slots__input slots__input--day',
      'aria-label': 'День недели',
      'data-slot': 'day',
    });
    for (const [index, label] of WEEKDAYS_SHORT.entries()) {
      const value = String(index + 1);
      const option = el('option', { value, text: label });
      if (value === String(weekday)) option.selected = true;
      daySelect.appendChild(option);
    }
    const timeInput = el('input', {
      class: 'slots__input',
      type: 'time',
      value: prefilled?.startTime ?? '18:00',
      'aria-label': 'Время начала',
      'data-slot': 'time',
      required: true,
    });
    const durationInput = el('input', {
      class: 'slots__input slots__input--duration',
      type: 'number',
      value: String(prefilled?.durationMin ?? 60),
      min: '1',
      max: '1440',
      step: '5',
      inputMode: 'numeric',
      'aria-label': 'Длительность, мин',
      'data-slot': 'duration',
      required: true,
    });

    const row: SlotRow = {
      weekday,
      startTime: prefilled?.startTime ?? '18:00',
      durationMin: prefilled?.durationMin ?? 60,
      node: el('div', { class: 'slots__row', 'data-slot-row': '' }),
      daySelect,
      timeInput,
      durationInput,
    };

    const remove = el('button', {
      class: 'slots__remove',
      type: 'button',
      text: '✕',
      title: 'Убрать день',
      'aria-label': 'Убрать день из серии',
    });
    remove.addEventListener('click', () => removeRow(row));

    daySelect.addEventListener('change', () => {
      row.weekday = Number(daySelect.value);
      syncOptions();
      syncSummary();
    });
    for (const input of [timeInput, durationInput]) {
      input.addEventListener('input', () => {
        row.startTime = timeInput.value;
        row.durationMin = Number(durationInput.value);
        syncSummary();
      });
    }

    row.node.append(
      daySelect,
      timeInput,
      el('span', { class: 'slots__unit', text: 'мин' }),
      durationInput,
      remove,
    );
    list.appendChild(row.node);
    rows.push(row);
    syncOptions();
    syncRemoveButtons();
    syncSummary();
  }

  for (const slot of sortSlots(initial)) addRow(slot);
  if (rows.length === 0) addRow();

  const add = button('+ Добавить день', () => addRow(), 'ghost');
  add.classList.add('slots__add');
  add.dataset.slotAdd = '';

  const node = el('div', { class: 'slots__box' }, [
    el('p', { class: 'slots__title', text: 'Занятия в неделю' }),
    list,
    add,
    summary,
  ]);

  return {
    node,
    slots: () => rows.map(readRow),
    focusLast: () => {
      const last = rows[rows.length - 1];
      last?.daySelect.focus();
    },
  };
}
