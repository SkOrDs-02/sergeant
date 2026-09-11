// AI-CONTEXT (2026-08-07): тут була константа `THEME_HEX` із трьома
// сирими хексами — четверта копія семантичних кольорів у репо. Прибрана
// не через дубль, а через те, що ЖОДЕН із трьох не проходив WCAG AA:
// у світлій темі всі три, у темній — два з трьох. Замір на матеріалі
// `mockups/product/debt-role-colors.html`.
//
// Причина була структурна, не в доборі відтінків. Підпис ролі стоїть і
// на бежевому фоні сторінки, і на чорнильному — а хекс один. Значення,
// яке читається на одному ґрунті, тоне на іншому; хекса, що пройшов би
// обидва, не існує. Розвʼязує це лише ПАРА (світлий тир + темний), тобто
// те, чого домен не може знати й не має знати.
//
// Тому домен більше не віддає колір. Він віддає РОЛЬ; колір обирає
// вигляд — `ROLE_TONE` у `AssetsDebtTxPicker.tsx`.

/**
 * Роль однієї привʼязаної транзакції всередині запису боргу.
 *
 * AI-CONTEXT: до 2026-08 роль **виводилася зі знаку суми** — будь-яка
 * origin-транзакція (додатна для пасиву, відʼємна для активу) мовчки
 * додавалася поверх уже введеної вручну суми боргу. Через це привʼязка
 * тієї самої транзакції, якою борг виник, роздувала пасив удвічі. Тепер
 * роль зберігається явно на кожній привʼязці:
 *
 *  - `source`   — транзакція, якою борг **виник**; підтверджує ручну базу
 *                 без додавання поверх неї, але є її нижньою межею. Дефолт
 *                 для нових привʼязок
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
  /** Привʼязка створена авто-правилом (§ Level 2, `debtAutoLink.ts`), а не
   * рукою користувача — позначка для UI, не бере участі в математиці. */
  auto?: boolean;
}

/**
 * Спільна сигнатура мутатора привʼязки — той самий контракт, яким володіє
 * `useFinykStorageMutations.setLinkedTxRole` і який приймають усі UI, що
 * привʼязують/відвʼязують транзакцію до боргу чи дебіторки
 * (`DebtTxLinkSection`, `AssetsDebtTxPicker`, `ManualExpenseSheet`…).
 * Винесено в один тип, щоб сигнатура не розповзалась inline-копіями по
 * кожному файлу (Hard Rule #18 — кожна копія важить у ліміт 600 рядків).
 */
export type SetLinkedTxRole = (
  id: string,
  txId: string,
  type: "debt" | "receivable",
  role: LinkedTxRole | null,
  amountUAH?: number,
  /** `auto: true` — привʼязку пише авто-правило (§ Level 2), не людина. */
  meta?: { auto?: boolean },
) => void;

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
  /**
   * Ключове слово авто-привʼязки (§ Level 2, `debtAutoLink.ts`, канон
   * `docs/product/modules/finyk.md` § Журнал рішень 2026-09-11) —
   * той самий контракт, що `Subscription.keyword`
   * (`subscriptionUtils.getLastTxForSubscription`): регістронезалежний
   * підрядок `description`. Optional — старі записи без поля просто не
   * матчать нічого (backward compatible, персистується як JSON).
   */
  autoLinkKeyword?: string;
  /**
   * Id транзакцій, які людина ВІДВʼЯЗАЛА від авто-створеної привʼязки.
   * Без цього списку матчер того самого правила прив'язав би їх назад
   * на наступному проході — той самий клас бага, що tombstone-
   * resurrection у звичках routine.
   */
  autoLinkDismissedTxIds?: string[];
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

function roundHryvnia(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getDebtTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount > 0
    ? { kind: "origin", label: "Виникнення боргу" }
    : { kind: "payment", label: "Сплата боргу" };
}

export function getReceivableTxRole(tx: Pick<Tx, "amount">): TxRole {
  return tx.amount < 0
    ? { kind: "origin", label: "Виникнення боргу" }
    : { kind: "payment", label: "Погашення боргу" };
}

/**
 * Людські підписи ролей для пікера й карток. `debt` і `receivable`
 * різняться лише формулюванням payment-ролі: пасив сплачують, актив
 * погашають.
 *
 * До 2026-08-21 гілка `origin` теж була парною — «📥 Виникнення боргу»
 * проти «📤 Виникнення боргу». Різнились рівно емодзі: текст в обох був
 * однаковий, а напрямок руху грошей ніс гліф, тобто інформація жила в
 * символі, який на різних ОС малювався по-різному й не мав ані кольору,
 * ані теми. Разом з емодзі зникла і різниця, тож розгалуження прибрано.
 * Напрямок читається зі знаку суми поруч.
 */
export function describeLinkedTxRole(
  role: LinkedTxRole,
  kind: "debt" | "receivable",
): TxRole {
  if (role === "payment") {
    return {
      kind: "payment",
      label: kind === "debt" ? "Сплата боргу" : "Погашення боргу",
    };
  }
  if (role === "increase") {
    return { kind: "origin", label: "Збільшення боргу" };
  }
  return { kind: "origin", label: "Виникнення боргу" };
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

/**
 * Сума операцій, якими борг виник. Вона не додається поверх ручної бази:
 * якщо користувач уже ввів повну суму, це був би подвійний облік. Водночас
 * підтверджені джерела не можуть бути більшими за базу, яку показує картка —
 * у такому разі саме їхня сума стає нижньою межею базового боргу.
 */
export function getDebtSourced(
  debt: Debt,
  transactions: readonly Tx[] = [],
): number {
  const links = resolveLinks(
    debt?.linkedTxIds || [],
    debt?.txLinks,
    transactions,
    defaultDebtTxRole,
  );
  return sumByRole(links, "source");
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
  const base = Math.max(
    Number(debt?.totalAmount || 0),
    getDebtSourced(debt, transactions),
  );
  return roundHryvnia(base + getDebtOriginated(debt, transactions));
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
    roundHryvnia(
      getDebtEffectiveTotal(debt, transactions) -
        getDebtPaid(debt, transactions),
    ),
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
