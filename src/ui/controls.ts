import { el, clear } from './dom.js';

export interface FieldOptions {
  label: string;
  name: string;
  value?: string;
  type?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  inputMode?: string;
  required?: boolean;
  hint?: string;
}

export function field(options: FieldOptions): HTMLLabelElement {
  const id = `f-${options.name}`;
  const input = el('input', {
    id,
    name: options.name,
    type: options.type ?? 'text',
    value: options.value ?? '',
    placeholder: options.placeholder,
    min: options.min,
    max: options.max,
    step: options.step,
    inputMode: options.inputMode,
    required: options.required,
  });

  const children: HTMLElement[] = [el('span', { class: 'field__label', text: options.label }), input];
  if (options.hint) children.push(el('span', { class: 'field__hint', text: options.hint }));

  return el('label', { class: 'field', htmlFor: id }, children);
}

export interface SelectOption {
  value: string;
  label: string;
}

export function selectField(
  label: string,
  name: string,
  options: SelectOption[],
  value?: string,
): HTMLLabelElement {
  const id = `f-${name}`;
  const select = el('select', { id, name });
  for (const option of options) {
    const node = el('option', { value: option.value, text: option.label });
    if (option.value === value) node.selected = true;
    select.appendChild(node);
  }
  return el('label', { class: 'field', htmlFor: id }, [
    el('span', { class: 'field__label', text: label }),
    select,
  ]);
}

export function textareaField(
  label: string,
  name: string,
  value = '',
  hint?: string,
): HTMLLabelElement {
  const id = `f-${name}`;
  const area = el('textarea', { id, name, rows: 3 });
  area.value = value;
  const children: HTMLElement[] = [el('span', { class: 'field__label', text: label }), area];
  if (hint) children.push(el('span', { class: 'field__hint', text: hint }));
  return el('label', { class: 'field', htmlFor: id }, children);
}

export function button(
  text: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary',
): HTMLButtonElement {
  const node = el('button', { type: 'button', class: `btn btn--${variant}` }, [text]);
  node.addEventListener('click', onClick);
  return node;
}

export function errorBox(): HTMLDivElement {
  return el('div', { class: 'form__error', role: 'alert', 'aria-live': 'polite' });
}

export function setError(box: HTMLElement, message: string | null): void {
  clear(box);
  if (message) box.appendChild(el('span', { text: message }));
  box.classList.toggle('form__error--active', Boolean(message));
}

/* ------------------------------------------------------------------ диалог */

let activeSheet: HTMLElement | null = null;

export function closeSheet(): void {
  if (!activeSheet) return;
  activeSheet.remove();
  activeSheet = null;
  document.body.classList.remove('has-sheet');
}

export function isSheetOpen(): boolean {
  return activeSheet !== null;
}

export interface SheetOptions {
  title: string;
  /** Идентификатор для тестов и автотестов. */
  testId?: string;
}

export function openSheet(options: SheetOptions, build: (body: HTMLElement, close: () => void) => void): void {
  closeSheet();

  const body = el('div', { class: 'sheet__body' });
  const closeBtn = el('button', {
    type: 'button',
    class: 'sheet__close',
    'aria-label': 'Закрыть',
    text: '✕',
  });
  closeBtn.addEventListener('click', () => closeSheet());

  const panel = el(
    'div',
    {
      class: 'sheet__panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': options.title,
      'data-testid': options.testId ?? 'sheet',
    },
    [
      el('header', { class: 'sheet__head' }, [
        el('h2', { class: 'sheet__title', text: options.title }),
        closeBtn,
      ]),
      body,
    ],
  );

  const overlay = el('div', { class: 'sheet', onmousedown: (e: Event) => {
    if (e.target === overlay) closeSheet();
  } }, [panel]);

  activeSheet = overlay;
  document.body.appendChild(overlay);
  document.body.classList.add('has-sheet');
  build(body, closeSheet);

  const focusable = panel.querySelector<HTMLElement>('input, select, textarea, button');
  focusable?.focus();
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeSheet();
});
