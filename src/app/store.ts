import type { CommandContext, CommandResult } from '../domain/commands.js';
import { createContext } from '../domain/commands.js';
import { todayIso } from '../domain/dates.js';
import type { AppState } from '../domain/types.js';
import { SchedulerStorage, type LoadOutcome } from '../storage/repository.js';
import { emptyAppState } from '../storage/schema.js';

export type StoreStatus =
  | { kind: 'ready' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'broken'; reason: string; recoveryKey: string }
  | { kind: 'unsupported'; found: unknown };

export type ToastKind = 'info' | 'error';

export interface Toast {
  kind: ToastKind;
  text: string;
}

/** Связывает доменные команды с локальным хранилищем и уведомлениями вида. */
export class AppStore {
  private state: AppState;
  private readonly storage: SchedulerStorage;
  private readonly listeners = new Set<() => void>();
  private status: StoreStatus;
  private repairIssues: string[] = [];
  private toast: Toast | null = null;
  private now = new Date();

  constructor(storage: SchedulerStorage = new SchedulerStorage()) {
    this.storage = storage;
    this.state = emptyAppState();
    this.status = { kind: 'ready' };

    const outcome: LoadOutcome = storage.load();
    switch (outcome.kind) {
      case 'ready':
        this.state = outcome.state;
        if (outcome.report?.corrupted) this.repairIssues = outcome.report.issues;
        break;
      case 'unavailable':
        this.status = { kind: 'unavailable', reason: outcome.reason };
        this.state = emptyAppState();
        break;
      case 'broken':
        this.status = { kind: 'broken', reason: outcome.reason, recoveryKey: outcome.recoveryKey };
        this.state = emptyAppState();
        break;
      case 'unsupported-version':
        this.status = { kind: 'unsupported', found: outcome.found };
        this.state = emptyAppState();
        break;
    }
  }

  getState(): AppState {
    return this.state;
  }

  getStatus(): StoreStatus {
    return this.status;
  }

  getRepairIssues(): string[] {
    return this.repairIssues;
  }

  getToast(): Toast | null {
    return this.toast;
  }

  clearToast(): void {
    this.toast = null;
  }

  /** Доступно ли сохранение. Недоступное хранилище блокирует изменяющие действия (FR-6.5). */
  canWrite(): boolean {
    return this.status.kind === 'ready';
  }

  context(): CommandContext {
    return createContext(this.now);
  }

  today(): string {
    return todayIso(this.now);
  }

  setNow(now: Date): void {
    this.now = now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Выполняет доменную команду и сохраняет результат.
   * При ошибке сохранения состояние не применяется, введённые данные не теряются.
   */
  dispatch<T>(command: (ctx: CommandContext, state: AppState) => CommandResult<T>): {
    ok: boolean;
    error?: string;
    value?: T;
  } {
    if (!this.canWrite()) {
      // Сообщение читается до emit(): подписчик рендера заберёт и очистит toast.
      const blocked = this.writeBlockedReason();
      this.toast = { kind: 'error', text: blocked };
      this.emit();
      return { ok: false, error: blocked };
    }

    const result = command(this.context(), this.state);
    if (!result.ok) {
      this.toast = { kind: 'error', text: result.error };
      this.emit();
      return { ok: false, error: result.error };
    }

    const saved = this.storage.save(result.state);
    if (!saved.ok) {
      this.toast = { kind: 'error', text: saved.error };
      this.emit();
      return { ok: false, error: saved.error };
    }

    this.state = result.state;
    this.toast = result.message ? { kind: 'info', text: result.message } : null;
    this.emit();
    return { ok: true, value: result.value };
  }

  private writeBlockedReason(): string {
    if (this.status.kind === 'unavailable') return this.status.reason;
    if (this.status.kind === 'broken') return this.status.reason;
    if (this.status.kind === 'unsupported') {
      return 'Данные сохранены в более новой версии приложения. Обновите приложение, чтобы продолжить.';
    }
    return 'Сохранение недоступно.';
  }
}
