import type { AppStore, ExportPayload } from '../app/store.js';
import { MAX_IMPORT_BYTES, parseImport, type ImportPreview } from '../storage/backup.js';
import type { RepairReport } from '../storage/schema.js';
import { button, errorBox, openSheet, setError } from './controls.js';
import { el } from './dom.js';

/**
 * Блок «Данные» в подвале вкладки «Ученики» (FR-6.7, FR-6.8).
 * Доступен и при пустом списке учеников: выгружать данные нужно и тогда,
 * когда расписание ещё не заведено.
 */
export function renderDataBlock(store: AppStore): HTMLElement {
  const canExport = store.exportPayload() !== null;

  const exportBtn = button('Сохранить копию', () => exportData(store), 'secondary');
  exportBtn.setAttribute('data-testid', 'data-export');
  exportBtn.disabled = !canExport;

  const restoreBtn = button('Восстановить из файла', () => openRestoreSheet(store), 'ghost');
  restoreBtn.setAttribute('data-testid', 'data-restore');

  const children: HTMLElement[] = [
    el('h2', { class: 'data-block__title', text: 'Данные' }),
    el('p', {
      class: 'data-block__note',
      text: 'Копия сохраняется в файл на этом устройстве. В файле имена, контакты и заметки учеников.',
    }),
    el('div', { class: 'data-block__actions' }, [exportBtn, restoreBtn]),
  ];

  if (store.hasRecovery()) {
    const recoveryBtn = button('Скачать резервную копию', () => exportRecovery(store), 'ghost');
    recoveryBtn.setAttribute('data-testid', 'data-export-recovery');
    children.push(el('div', { class: 'data-block__actions' }, [recoveryBtn]));
  }

  if (!canExport) {
    children.push(el('p', { class: 'data-block__note', text: 'Хранилище недоступно, выгружать нечего.' }));
  }

  return el('section', { class: 'data-block', 'data-testid': 'data-block' }, children);
}

/** Кнопка в баннере: выгрузить данные, когда хранилище сломанно (FR-6.7). */
export function dataExportButton(store: AppStore): HTMLButtonElement {
  const node = button('Сохранить данные в файл', () => exportData(store), 'secondary');
  node.setAttribute('data-testid', 'banner-export');
  return node;
}

/**
 * Выгрузка состояния в файл. Если браузер не смог создать файл, репетитор
 * видит об этом, а не думает, что копия есть.
 */
export function exportData(store: AppStore): void {
  const payload = store.exportPayload();
  if (!payload) {
    store.notify('error', 'Хранилище недоступно, выгружать нечего.');
    return;
  }
  save(store, payload);
}

/** Исходный JSON резервного слота: последняя возможность забрать данные (FR-6.4). */
export function exportRecovery(store: AppStore): void {
  const payload = store.recoveryPayload();
  if (!payload) {
    store.notify('error', 'Резервной копии нет.');
    return;
  }
  save(store, payload);
}

function save(store: AppStore, payload: ExportPayload): void {
  try {
    downloadPayload(payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'неизвестная ошибка';
    store.notify('error', `Не удалось создать файл ${payload.fileName}: ${reason}`);
    return;
  }
  store.notify('info', `Файл ${payload.fileName} сохранён.`);
}

export function downloadPayload(payload: ExportPayload): void {
  const blob = new Blob([payload.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: payload.fileName });
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

/** Чтение файла через FileReader: `Blob.text()` есть не во всех мобильных браузерах. */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsText(file);
  });
}

/** Шторка восстановления: файл, предпросмотр и подтверждение замены (FR-6.8). */
export function openRestoreSheet(store: AppStore): void {
  openSheet({ title: 'Восстановление данных', testId: 'sheet-restore' }, (body, close) => {
    const errors = errorBox();
    const input = el('input', {
      type: 'file',
      id: 'restore-file',
      accept: 'application/json,.json',
      class: 'file-input',
      'data-testid': 'data-import-input',
    });
    const preview = el('div', { class: 'import-preview', 'data-testid': 'import-preview' });

    body.appendChild(
      el('label', { class: 'field', htmlFor: 'restore-file' }, [
        el('span', { class: 'field__label', text: 'Файл резервной копии' }),
        input,
        el('span', {
          class: 'field__hint',
          text: `Повреждённый файл, файл из более новой версии приложения и файл больше ${Math.round(
            MAX_IMPORT_BYTES / 1_000_000,
          )} МБ не применяются.`,
        }),
      ]),
    );
    body.appendChild(errors);
    body.appendChild(preview);
    body.appendChild(
      el('p', {
        class: 'data-block__note',
        text: 'Текущие данные будут заменены целиком. Перед заменой они попадут в резервную копию, её можно будет скачать.',
      }),
    );

    let pending: { state: Parameters<AppStore['importState']>[0]; report: RepairReport } | null = null;
    let confirmBtn: HTMLButtonElement | null = null;

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        pending = null;
        setError(errors, null);
        preview.replaceChildren();
        confirmBtn?.remove();
        confirmBtn = null;
        return;
      }

      void readFileText(file)
        .then((text) => {
          const outcome = parseImport(text, file.size);
          setError(errors, null);
          preview.replaceChildren();
          confirmBtn?.remove();
          confirmBtn = null;

          if (!outcome.ok) {
            pending = null;
            setError(errors, outcome.error);
            return;
          }

          pending = { state: outcome.state, report: outcome.report };
          preview.appendChild(previewNode(outcome.preview));

          confirmBtn = button('Заменить данные', () => {
            if (!pending) return;
            const result = store.importState(pending.state, pending.report);
            if (!result.ok) {
              setError(errors, result.error);
              return;
            }
            close();
          }, 'danger');
          confirmBtn.setAttribute('data-testid', 'data-import-confirm');
          preview.appendChild(confirmBtn);
        })
        .catch(() => {
          pending = null;
          setError(errors, 'Не удалось прочитать файл.');
        });
    });
  });
}

function previewNode(preview: ImportPreview): HTMLElement {
  const rows: HTMLElement[] = [
    el('p', { class: 'import-preview__title', text: 'В файле:' }),
    el('ul', { class: 'import-preview__list' }, [
      el('li', { text: `учеников: ${preview.counts.students}` }),
      el('li', { text: `расписаний: ${preview.counts.series}` }),
      el('li', { text: `занятий: ${preview.counts.lessons}` }),
      el('li', { text: `оплат: ${preview.counts.payments}` }),
    ]),
  ];

  if (preview.migratedFrom !== null) {
    rows.push(
      el('p', {
        class: 'import-preview__note',
        text: `Файл версии ${preview.migratedFrom} будет приведён к версии ${preview.version}.`,
      }),
    );
  }

  if (preview.corrupted) {
    rows.push(
      el('p', { class: 'import-preview__note', text: 'В файле есть некорректные записи, они будут исправлены или отброшены.' }),
    );
    for (const issue of preview.issues.slice(0, 5)) {
      rows.push(el('p', { class: 'import-preview__note', text: issue }));
    }
  }

  rows.push(el('p', { class: 'import-preview__warning', text: 'После замены прежние данные останутся в резервной копии.' }));

  return el('div', {}, rows);
}