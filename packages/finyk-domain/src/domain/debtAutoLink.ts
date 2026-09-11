/**
 * Level 2 — авто-привʼязка платежів до пасиву за ключовим словом.
 * Рішення власника 2026-09-11 (канон `docs/product/modules/finyk.md`
 * § Журнал рішень): той самий контракт, що вже тримає
 * `subscriptionUtils.getLastTxForSubscription` для підписок —
 * регістронезалежний підрядок `description`, найновіше першим для UI
 * (тут порядок не має значення, повертаємо весь набір).
 *
 * Чиста функція: жодних побічних ефектів, жодного запису. Виклик, що
 * ЗАПИСУЄ результат (`useDebtAutoLink.ts`), і anti-resurrection
 * (`autoLinkDismissedTxIds`) — окремі шари.
 */
import type { Debt } from "./debtEngine.js";

/**
 * Мінімальний вигляд транзакції, потрібний матчеру — навмисно вужчий за
 * `Transaction`, щоб приймати і банківські, і ручні (сконвертовані через
 * `manualExpenseToTransaction`) записи без додаткових приведень типів.
 */
export interface AutoLinkableTx {
  id: string;
  /** Signed копійки — як і скрізь у домені (Hard Rule money-invariant). */
  amount: number;
  description?: string | null | undefined;
}

/**
 * Id транзакцій, які варто привʼязати до пасиву за його
 * `autoLinkKeyword`. Правило:
 *  - ключове слово порожнє (після `trim`) → жодних збігів;
 *  - лише ВИТРАТИ (`amount < 0`) — надходження авто-правило не займає,
 *    воно про погашення, не про виникнення боргу (§ Level 1);
 *  - опис містить ключове слово, регістронезалежно;
 *  - виключає id, що вже в `linkedTxIds` (ідемпотентність — повторний
 *    виклик матчера на тому самому наборі не повертає нічого нового);
 *  - виключає id з `autoLinkDismissedTxIds` (anti-resurrection —
 *    людина відвʼязала цю операцію, правило її більше не пропонує).
 */
export function matchDebtAutoLinkTxIds(
  debt: Pick<
    Debt,
    "linkedTxIds" | "autoLinkKeyword" | "autoLinkDismissedTxIds"
  >,
  transactions: readonly AutoLinkableTx[],
): string[] {
  const keyword = (debt.autoLinkKeyword ?? "").trim().toLowerCase();
  if (!keyword) return [];

  const linked = new Set(debt.linkedTxIds ?? []);
  const dismissed = new Set(debt.autoLinkDismissedTxIds ?? []);

  return transactions
    .filter((tx) => {
      if (linked.has(tx.id) || dismissed.has(tx.id)) return false;
      if (!(tx.amount < 0)) return false;
      const description = (tx.description ?? "").toLowerCase();
      return description.includes(keyword);
    })
    .map((tx) => tx.id);
}
