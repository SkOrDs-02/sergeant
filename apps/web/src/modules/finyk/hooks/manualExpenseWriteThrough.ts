/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Спільний storage-slice contract для client-side write-through у
 * `finyk_manual_expenses` — обидва шляхи чек-скану/масового ведення, що
 * створюють server-side manual-expense рядки В ОБХІД `sync_op_log`
 * (`useReceiptSave.ts` — saveReceipt-fallback; `useBulkImport.ts` —
 * commitImport, лише коли skipped=0), пишуть через ОДИН і той самий
 * `storage.addManualExpense` — dual-write шлях, яким і так іде звичайне
 * ручне додавання. Див. докстрінг `useReceiptSave.ts` для повного
 * обґрунтування "чому взагалі писати локально".
 */
export interface ManualExpenseWriteThroughStorage {
  manualExpenses: ReadonlyArray<{ id: string }> | undefined;
  addManualExpense: (expense: {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string;
    kind: "expense" | "income";
  }) => unknown;
  /** Дзеркало server-side undo (`useImportBatchUndo`): коли `commitImport`
   * записав рядки локально (write-through), а користувач одразу натиснув
   * «Скасувати імпорт», сервер видаляє їх, але БЕЗ цього виклику вони
   * лишаються фантомом у місцевому списку операцій — сервер про них уже
   * не знає, а локальний стан ще не отримав жодного сигналу про це (той
   * самий bypass `sync_op_log`, що зробив write-through потрібним
   * НАСАМПЕРЕД, § докстрінг `useReceiptSave.ts`). */
  removeManualExpense: (id: string) => unknown;
}

/** Guard проти локального дубля: `addManualExpense` сам не дедуплікує за
 * id (`[entry, ...prev]`) — виклик з ID, який УЖЕ є в масиві, додав би
 * другий видимий рядок з тим самим id, подвоюючи суму в UI. */
export function hasLocalManualExpense(
  storage: Pick<ManualExpenseWriteThroughStorage, "manualExpenses">,
  id: string,
): boolean {
  return (storage.manualExpenses ?? []).some((e) => e.id === id);
}
