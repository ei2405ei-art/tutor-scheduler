import { AppStore } from '../app/store.js';
import { todayIso } from '../domain/dates.js';
import { el } from './dom.js';
import { dayNavigation, renderDayView } from './day-view.js';
import { openNewLessonSheet, openStudentSheet } from './sheets.js';
import { renderStudentsView } from './students-view.js';
import { renderWeekView, weekNavigation } from './week-view.js';

type Tab = 'day' | 'week' | 'students';

export interface UiState {
  tab: Tab;
  /** Выбранная дата не сбрасывается при переключении вкладок (FR-1.10). */
  date: string;
}

export function mountApp(root: HTMLElement, store: AppStore, now: Date = new Date()): void {
  store.setNow(now);
  const ui: UiState = { tab: 'day', date: todayIso(now) };

  const render = (): void => {
    root.replaceChildren();
    root.className = 'app';

    root.appendChild(renderHeader(ui, store, render));

    const statusBanner = renderStatus(store);
    if (statusBanner) root.appendChild(statusBanner);

    const main = el('main', { class: 'app__main' });
    if (ui.tab === 'day') {
      main.appendChild(renderDayView(store, viewOptions(ui, render)));
    } else if (ui.tab === 'week') {
      main.appendChild(renderWeekView(store, viewOptions(ui, render)));
    } else {
      main.appendChild(renderStudentsView(store));
    }
    root.appendChild(main);

    const toast = store.getToast();
    if (toast) {
      const node = el('div', { class: `toast toast--${toast.kind}`, role: 'status', 'data-testid': 'toast' }, [
        toast.text,
      ]);
      root.appendChild(node);
      store.clearToast();
    }

    root.appendChild(renderTabbar(ui, render));
    if (ui.tab !== 'students') {
      const fab = el('button', {
        type: 'button',
        class: 'fab',
        'aria-label': 'Новое занятие',
        'data-testid': 'fab',
        text: '+',
      });
      fab.addEventListener('click', () => openNewLessonSheet(store, ui.date));
      root.appendChild(fab);
    }
  };

  store.subscribe(render);
  render();
}

function viewOptions(ui: UiState, render: () => void): { date: string; onDateChange: (next: string) => void } {
  return {
    date: ui.date,
    onDateChange: (next) => {
      ui.date = next;
      render();
    },
  };
}

function renderHeader(ui: UiState, store: AppStore, render: () => void): HTMLElement {
  const header = el('header', { class: 'app__head' }, [
    el('h1', { class: 'app__title', text: 'Планировщик занятий' }),
  ]);

  if (ui.tab === 'day') {
    header.appendChild(dayNavigation(store, viewOptions(ui, render)));
  }
  if (ui.tab === 'week') {
    header.appendChild(weekNavigation(ui.date, (next) => {
      ui.date = next;
      render();
    }));
  }

  return header;
}

function renderStatus(store: AppStore): HTMLElement | null {
  const status = store.getStatus();
  if (status.kind === 'unavailable') {
    return banner('warn', 'Локальное хранилище недоступно', `${status.reason} Изменения сохранить нельзя, поэтому действия создания отключены.`);
  }
  if (status.kind === 'broken') {
    return banner(
      'danger',
      'Данные повреждены',
      `${status.reason} Исходный JSON сохранён в резервном слоте «${status.recoveryKey}» и не удалён.`,
    );
  }
  if (status.kind === 'unsupported') {
    return banner(
      'danger',
      'Неизвестная версия данных',
      `В хранилище версия ${String(status.found)}, а приложение понимает меньшую. Данные оставлены нетронутыми.`,
    );
  }

  const issues = store.getRepairIssues();
  if (issues.length > 0) {
    return banner(
      'warn',
      'Часть записей восстановлена',
      `Некорректные записи отброшены (${issues.length}). Исходный JSON сохранён в резервном слоте.`,
    );
  }
  return null;
}

function banner(tone: 'warn' | 'danger', title: string, text: string): HTMLElement {
  return el('section', { class: `banner banner--${tone}`, role: 'alert' }, [
    el('strong', { text: title }),
    el('span', { text }),
  ]);
}

function renderTabbar(ui: UiState, render: () => void): HTMLElement {
  const tab = (id: Tab, label: string): HTMLElement => {
    const node = el('button', {
      type: 'button',
      class: `tabbar__item${ui.tab === id ? ' tabbar__item--active' : ''}`,
      'aria-current': ui.tab === id ? 'page' : undefined,
      'data-testid': `tab-${id}`,
      text: label,
    });
    node.addEventListener('click', () => {
      if (ui.tab === id) return;
      ui.tab = id;
      render();
    });
    return node;
  };

  return el('nav', { class: 'tabbar' }, [
    tab('day', 'День'),
    tab('week', 'Неделя'),
    tab('students', 'Ученики'),
  ]);
}

export { openStudentSheet };
