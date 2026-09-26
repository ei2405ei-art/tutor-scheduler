const NBSP = '\u00a0';

/** Суммы в интерфейсе — целые рубли (см. ТЗ_MVP.md §6.5). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Формат суммы для показа: `1 200 ₽`.
 * Не использует `Intl`, чтобы результат не зависел от локали окружения
 * и был предсказуем в тестах.
 */
export function formatMoney(value: number): string {
  const rounded = roundMoney(value);
  const sign = rounded < 0 ? '−' : '';
  const digits = String(Math.abs(rounded));
  let grouped = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += NBSP;
    grouped += digits[i];
  }
  return `${sign}${grouped}${NBSP}₽`;
}
