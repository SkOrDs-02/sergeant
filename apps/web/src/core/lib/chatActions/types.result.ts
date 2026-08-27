/**
 * Result-shape для HubChat tool handler-ів.
 *
 * Виокремлено з `types.ts` (initiative 0001 Phase 2) — ці два типи не
 * змінюються між доменами і потрібні усім handler-ам незалежно від
 * модуля, тому живуть окремо від action-payload-ів.
 */

/**
 * Виконані mutator-handler-и можуть опційно повернути обʼєкт з полем
 * `undo`, яке HubChat сам пропустить через `showUndoToast`. Read-only
 * tools (`find_transaction`, `weekly_summary`, …) залишаються
 * `string` — там нема що реверсити. Це навмисно дискриміноване
 * обʼєднання, а не загальне `unknown`-розширення: тип дозволяє
 * перевіряти `typeof out === "string"` як «не було undo» без додаткових
 * runtime-перевірок.
 */
export interface ChatActionUndoableResult {
  /** Текст для `tool_result` (та чату). Identical до того, що раніше було сам по собі `string`. */
  result: string;
  /**
   * Реверсує мутацію handler-а. Викликається з обробника `showUndoToast`
   * у HubChat, тож має бути ідемпотентним і не кидати на повторний клік
   * (показ undo-toast гарантує максимум одне натискання, але safer is safer).
   *
   * Опційний: дія, яка нічого не змінила (звичка вже була відмічена),
   * повертає підтвердження без reverse-snapshot-у.
   */
  undo?: () => void;
  /**
   * Підтвердження ДОВГОВІЧНОСТІ запису: `true`, лише коли мутація реально
   * лягла в локальну SQLite (а отже потрапить у sync-outbox).
   *
   * AI-DANGER: без цього поля tool-шлях рапортує успіх на факті «передав у
   * dual-write», а не «зберіг». Коли boot-кластер модуля ще не змонтувався,
   * dual-write — гарантований no-op, і асистент повідомляє про дію, якої не
   * сталося (QA F-12). `executeActions` дочікується цього промиса і
   * переписує `result` на чесну відмову, якщо запис не застосовано.
   */
  confirm?: Promise<boolean>;
}

/**
 * Уніфікований результат handler-а. Старі handler-и далі повертають
 * `string` без жодних змін; нові mutator-и повертають
 * `ChatActionUndoableResult` коли мають reverse-snapshot.
 */
export type ChatActionResult = string | ChatActionUndoableResult;
