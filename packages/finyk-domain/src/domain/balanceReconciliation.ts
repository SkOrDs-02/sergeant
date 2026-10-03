/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Звірка «сума транзакцій ↔ баланс» — контракт `finyk` §6.1 «до копійки».
 *
 * AI-CONTEXT: канон казав, що reconciliation «неможливий навіть у принципі,
 * бо невідомо, які дві цифри порівнювати». Рішення founder-а 2026-07-25
 * зняло це питання (варіант Б: канонічний баланс — той, що бачить
 * користувач, тобто після оверлеїв), але сама звірка при цьому **не
 * порівнює відображений баланс із банківським**. І це не обхід рішення —
 * ось чому:
 *
 * Відображений баланс відрізняється від банківського рівно на те, що
 * користувач сам сховав. Порівнювати їх означало б щоразу знаходити
 * «розходження», яке насправді є навмисним вибором людини — тобто банер
 * кричав би вовк на кожному прихованому рахунку. Оверлеї впливають на
 * ПОКАЗ, а не на потік транзакцій.
 *
 * Тому звірка йде по потоку, і вона точна: Monobank повертає `balance`
 * **у кожній транзакції** — залишок після неї. Отже:
 *
 *   баланс рахунку (знімок від банку)  ==  balance найсвіжішої транзакції
 *
 * Різниця означає рівно одне: між останньою відомою нам транзакцією і
 * поточним знімком є операції, яких ми не отримали (провал webhook-а).
 * Стартовий баланс вгадувати не треба — його ніколи й не було потрібно.
 *
 * AI-DANGER: `status: "unknown"` — не помилка й не привід для банера.
 * Свіжий рахунок без транзакцій, рахунок, де в усіх транзакцій `balance:
 * null`, і рахунок, де ми просто ще не синкнулись, виглядають однаково. У
 * всіх трьох випадках сказати «дані розходяться» було б вигадкою. Банер
 * має показуватись ЛИШЕ на `"mismatch"`.
 */

/** Транзакція в обсязі, потрібному для звірки. */
export interface ReconcileTransaction {
  /** Стабільний id — потрапляє у звіт, щоб було з чого почати розбір. */
  id: string;
  /** ISO-час операції. */
  time: string;
  /** Залишок на рахунку ПІСЛЯ операції; `null` — банк не віддав. */
  balance: number | null;
  /**
   * `true` — операція ще в холді. Її `balance` не остаточний: сума може
   * змінитись при фінальному списанні. Такі транзакції як якір не беремо.
   */
  hold?: boolean | null;
}

export interface ReconcileAccountInput {
  /** Поточний знімок балансу від банку (мінорні одиниці). */
  accountBalance: number | null;
  /** Транзакції ЦЬОГО рахунку. Порядок довільний. */
  transactions: readonly ReconcileTransaction[];
}

export type ReconcileStatus = "ok" | "mismatch" | "unknown";

export interface ReconcileAccountResult {
  status: ReconcileStatus;
  /**
   * `accountBalance − balanceЯкоря` у мінорних одиницях. `0` при `ok`,
   * `null` при `unknown`. Знак значущий: додатне — банк показує більше,
   * ніж пояснює наш потік (не доїхали надходження), відʼємне — навпаки.
   */
  diffMinor: number | null;
  /** Транзакція, взята за якір. `null` при `unknown`. */
  anchorTxId: string | null;
  /** Час якоря — щоб UI міг сказати «звірено станом на …». */
  anchorTime: string | null;
}

/**
 * Обирає якір: найсвіжіша НЕ-hold транзакція з непорожнім `balance`.
 *
 * Свідомо не беремо hold-операції навіть якщо вони найсвіжіші: їхня сума
 * ще може змінитись, і звірка по них дала б «розходження», яке зникне
 * саме за пару днів. Хибне спрацювання тут дорожче за пропущене: контракт
 * §6.1 каже, що розходження — це БАГ, і банер, який half the time
 * помиляється, знецінює саме те твердження.
 */
function pickAnchor(
  transactions: readonly ReconcileTransaction[],
): ReconcileTransaction | null {
  let best: ReconcileTransaction | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const tx of transactions) {
    if (tx.balance === null || tx.hold === true) continue;
    const t = Date.parse(tx.time);
    if (!Number.isFinite(t)) continue;
    if (t > bestTime) {
      bestTime = t;
      best = tx;
    }
  }
  return best;
}

export function reconcileAccount(
  input: ReconcileAccountInput,
): ReconcileAccountResult {
  const unknown: ReconcileAccountResult = {
    status: "unknown",
    diffMinor: null,
    anchorTxId: null,
    anchorTime: null,
  };
  if (input.accountBalance === null) return unknown;

  const anchor = pickAnchor(input.transactions);
  if (!anchor || anchor.balance === null) return unknown;

  const diff = input.accountBalance - anchor.balance;
  return {
    status: diff === 0 ? "ok" : "mismatch",
    diffMinor: diff,
    anchorTxId: anchor.id,
    anchorTime: anchor.time,
  };
}

export interface ReconcileSummaryAccount {
  accountId: string;
  result: ReconcileAccountResult;
}

export interface ReconcileSummary {
  /** Рахунки, де знайдено розходження. Порожній — все зійшлось. */
  mismatched: readonly ReconcileSummaryAccount[];
  /** Рахунки, які нічим звірити. Не привід для тривоги. */
  unknownCount: number;
  /** Сумарне розходження по всіх проблемних рахунках, мінорні одиниці. */
  totalDiffMinor: number;
}

/**
 * Звіряє набір рахунків.
 *
 * AI-DANGER: результат — **список рахунків**, а не одна цифра. Сумарне
 * розходження наведене для заголовка, але воно вміє зануляти саме себе:
 * +500 на одному рахунку і −500 на іншому дадуть 0, і агрегат сказав би
 * «все гаразд» на двох зламаних рахунках. Тому рішення «показувати банер
 * чи ні» приймається по `mismatched.length`, а НЕ по `totalDiffMinor`.
 */
export function reconcileAccounts(
  accounts: readonly (ReconcileAccountInput & { accountId: string })[],
): ReconcileSummary {
  const mismatched: ReconcileSummaryAccount[] = [];
  let unknownCount = 0;
  let totalDiffMinor = 0;

  for (const acc of accounts) {
    const result = reconcileAccount(acc);
    if (result.status === "unknown") {
      unknownCount += 1;
      continue;
    }
    if (result.status === "mismatch") {
      mismatched.push({ accountId: acc.accountId, result });
      totalDiffMinor += result.diffMinor ?? 0;
    }
  }

  return { mismatched, unknownCount, totalDiffMinor };
}
