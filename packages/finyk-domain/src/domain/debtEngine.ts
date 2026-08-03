// Hex-кольори для inline-стилів, дубль значень з apps/web tailwind.config.js
// (theme.extend.colors.success / danger / warning). Свідомо інлайнимо
// константу тут, щоб пакет `@sergeant/finyk-domain` не тягнув web-only
// залежність на `@shared/lib/themeHex`. Якщо знадобиться більше токенів —
// винесемо в `@sergeant/shared/theme` окремим PR.
const THEME_HEX = {
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#b45309",
} as const;

/**
 * Роль однієї привʼязаної транзакції всередині запису боргу.
 *
 * AI-CONTEXT: до 2026-08 роль **виводилася зі знаку суми** — будь-яка
 * origin-транзакція (додатна для пасиву, відʼємна для активу) мовчки
 * додавалася поверх уже введеної вручну суми боргу. Через це привʼязка
 * тієї самої транзакції, якою борг виник, роздувала пасив удвічі. Тепер
 * роль зберігається явно на кожній привʼязці:
 *
 *  - `source`   — транзакція, якою борг **виник**; вона лише пояснює вже
 *                 введену суму й НЕ змінює її. Дефолт для нових привʼязок
 *                 з origin-знаком і для всіх legacy-привʼязок.
 *  - `increase` — борг **виріс** на цю суму; додається до `totalAmount`.
 *  - `payment`  — погашення; віднімається від ефективної суми.
 */
export type LinkedTxRole = "source" | "increase" | "payment";

/**
 * Знімок привʼязки. `amount` — абсолютна сума в **гривнях**, зафіксована
 * у момент привʼязки, щоб математика боргу не залежала від того, чи
 * потрапила транзакція у поточне вікно завантаження (пікер бачить не всю
 * історію — див. `useLinkableTransactions`).
 */
export interface LinkedTxMeta {
  role: LinkedTxRole;
  amount: number;
}

export interface Debt {
  id: string;
  amount: number;
  linkedTxIds?: string[];
  txLinks?: Record<string, LinkedTxMeta>;
  totalAmount?: number;
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  currency?: string;
  [extra: string]: unknown;
}

export interface Receivable {
  id: string;
  amount: number;
  linkedTxIds?: string[];
  txLinks?: Record<string, LinkedTxMeta>;
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  currency?: string;
  [extra: string]: unknown;
}

export interface Tx {
  id: string;
  amount: number;
}

export interface TxRole {
  kind: "origin" | "payment";
  label: string;
  color: string;
}

function toAmountUAH(tx: Tx): number {
  return Math.abs((tx?.amount || 0) / 100);
}

/**
 * Роль, яку пікер підставляє за замовчуванням для ще не привʼязаної
 * транзакції. Знак лишається підказкою — але тепер лише підказкою.
 */
export function defaultDebtTxRole(tx: Pick<Tx, "amount">): LinkedTxRole {
  return tx.amount > 0 ? "source" : "payment";
}

export function defaultReceivableTxRole(tx: Pick<Tx, "amount">): LinkedTxRole {
  return tx.amount < 0 ? "source" : "payment";
}

/**
 * Звести `linkedTxIds` + `txLinks` до пар (роль, сума в гривнях).
 *
 * Порядок джерел: явний `txLinks`-запис → знімок суми з нього; інакше
 * legacy-привʼязка, для якої роль виводимо зі знаку через `fallbackRole`,
 * а суму шукаємо серед переданих транзакцій (нема транзакції → 0, як і
 * раніше).
 */
function resolveLinks(
  linkedTxIds: readonly string[] = [],
  txLinks: Record<string, LinkedTxMeta> | undefined,
  transactions: readonly Tx[] = [],
  fallbackRole: (tx: Pick<Tx, "amount">) => LinkedTxRole,
): { role: LinkedTxRole; amount: number }[] {
  const index = new Map(transactions.map((tx) => [tx.id, tx]));
  return linkedTxIds.map((id) => {
    const meta = txLinks?.[id];
    if (meta) return { role: meta.role, amount: Math.abs(meta.amount || 0) };
    const tx = index.get(id);
    if (!tx) return { role: "source" as LinkedTxRole, amount: 0 };
    return { role: fallbackRole(tx), amount: toAmountUAH(tx) };
  });
}

function sumByRole(
  links: readonly { role: LinkedTxRole; amount: number }[],
  role: LinkedTxRole,
): number {
  return links
    .filter((link) => link.role === role)
    .reduce((sum, link) => sum + link.amount, 0);
}

export function getDebtTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount > 0
    ? { kind: "origin", label: "📥 Виникнення боргу", color: THEME_HEX.danger }
    : { kind: "payment", label: "✅ Сплата боргу", color: THEME_HEX.success };
}

export function getReceivableTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount < 0
    ? { kind: "origin", label: "📤 Виникнення боргу", color: THEME_HEX.danger }
    : {
        kind: "payment",
        label: "✅ Погашення боргу",
        color: THEME_HEX.success,
      };
}

/**
 * Людські підписи ролей для пікера й карток. `debt` і `receivable`
 * різняться лише формулюванням origin-ролей: пасив виникає, коли гроші
 * прийшли, актив — коли пішли.
 */
export function describeLinkedTxRole(
  role: LinkedTxRole,
  kind: "debt" | "receivable",
): TxRole {
  if (role === "payment") {
    return {
      kind: "payment",
      label: kind === "debt" ? "✅ Сплата боргу" : "✅ Погашення боргу",
      color: THEME_HEX.success,
    };
  }
  if (role === "increase") {
    return {
      kind: "origin",
      label: "➕ Збільшення боргу",
      color: THEME_HEX.danger,
    };
  }
  return {
    kind: "origin",
    label: kind === "debt" ? "📥 Виникнення боргу" : "📤 Виникнення боргу",
    color: THEME_HEX.warning,
  };
}

export function getDebtPaid(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  const links = resolveLinks(
    debt?.linkedTxIds || [],
    debt?.txLinks,
    transactions,
    defaultDebtTxRole,
  );
  return sumByRole(links, "payment");
}

export function getDebtOriginated(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  const links = resolveLinks(
    debt?.linkedTxIds || [],
    debt?.txLinks,
    transactions,
    defaultDebtTxRole,
  );
  return sumByRole(links, "increase");
}

export function getReceivablePaid(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  const links = resolveLinks(
    receivable?.linkedTxIds || [],
    receivable?.txLinks,
    transactions,
    defaultReceivableTxRole,
  );
  return sumByRole(links, "payment");
}

export function getReceivableOriginated(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  const links = resolveLinks(
    receivable?.linkedTxIds || [],
    receivable?.txLinks,
    transactions,
    defaultReceivableTxRole,
  );
  return sumByRole(links, "increase");
}

/**
 * Роль конкретної привʼязки для UI. Повертає `null`, якщо транзакція
 * узагалі не привʼязана до цього запису.
 */
export function getLinkedTxRole(
  record: Debt | Receivable,
  txId: string,
  transactions: readonly Tx[] = [],
  kind: "debt" | "receivable" = "debt",
): LinkedTxRole | null {
  if (!(record?.linkedTxIds || []).includes(txId)) return null;
  const meta = record?.txLinks?.[txId];
  if (meta) return meta.role;
  const tx = transactions.find((item) => item.id === txId);
  if (!tx) return "source";
  return kind === "debt" ? defaultDebtTxRole(tx) : defaultReceivableTxRole(tx);
}

export function getDebtEffectiveTotal(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  return Number(debt?.totalAmount || 0) + getDebtOriginated(debt, transactions);
}

export function getReceivableEffectiveTotal(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  return (
    Number(receivable?.amount || 0) +
    getReceivableOriginated(receivable, transactions)
  );
}

export function calcDebtRemaining(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  return Math.max(
    0,
    getDebtEffectiveTotal(debt, transactions) - getDebtPaid(debt, transactions),
  );
}

export function calcReceivableRemaining(
  receivable: Receivable,
  transactions: readonly Tx[] = [],
): number {
  return Math.max(
    0,
    getReceivableEffectiveTotal(receivable, transactions) -
      getReceivablePaid(receivable, transactions),
  );
}
