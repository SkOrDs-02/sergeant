/**
 * Чи має застосований батч синку перерахувати push ліміту Фініка (Ф-4 (б)).
 *
 * Спека: docs/work/specs/finyk-limit-and-recurring-push.md § Тригери:
 * «після застосування синку ручних записів, категорій і сплітів». Решта
 * таблиць витрат не додає. Видалення ручного запису витрату лише зменшує,
 * тож поріг перетнути не може.
 *
 * Виклик стоїть у `syncV2Push` ПІСЛЯ `COMMIT`, а не в `applySync.ts`:
 * apply-функції працюють усередині транзакції батчу по одному опу, а push
 * має бачити закомічені дані й іти один раз на батч, а не на кожен оп.
 */

const SPEND_TABLES: ReadonlySet<string> = new Set([
  "finyk_manual_expenses",
  "finyk_tx_categories",
  "finyk_tx_splits",
]);

export function finykLimitPushNeeded(
  applied: readonly { table: string; op: string }[],
): boolean {
  return applied.some(
    (o) =>
      SPEND_TABLES.has(o.table) &&
      !(o.table === "finyk_manual_expenses" && o.op === "delete"),
  );
}
