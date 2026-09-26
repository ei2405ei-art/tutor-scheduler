/**
 * Создание DOM-элементов без небезопасной сборки HTML.
 * Пользовательские значения всегда попадают в текстовый узел.
 */

type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string | number;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  href?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  htmlFor?: string;
  min?: string;
  max?: string;
  step?: string;
  inputMode?: string;
  role?: string;
  required?: boolean;
  rows?: number;
  'aria-label'?: string;
  'aria-hidden'?: string;
  'aria-live'?: string;
  'aria-current'?: string;
  'aria-modal'?: string;
  'aria-expanded'?: string;
  'data-action'?: string;
  'data-id'?: string;
  'data-date'?: string;
  'data-status'?: string;
  'data-testid'?: string;
  tabIndex?: number;
  onchange?: (event: Event) => void;
  oninput?: (event: Event) => void;
  onmousedown?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (key === 'htmlFor') {
      (node as HTMLLabelElement).htmlFor = String(value);
    } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'required') {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else if (key.startsWith('aria-') || key.startsWith('data-')) {
      node.setAttribute(key, String(value));
    } else {
      (node as unknown as Record<string, unknown>)[key] = value;
    }
  }

  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}
