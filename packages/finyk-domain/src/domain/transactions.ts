/**
 * Уніфікована модель транзакції Фініка.
 *
 * Нормалізована форма ОДНА для всіх джерел: manual, monobank, ai, import.
 * Включає канонічні поля (date/categoryId/type/merchant/note) та legacy-поля
 * (time/description/mcc/_source/_accountId…), щоб не ламати існуючий UI
 * та сумісність зі старими даними в localStorage.
 *
 * amount — у signed minor units (копійках), як і раніше. UI-код навколо
 * очікує саме такий формат, тож одиниці зберігаємо, а нові поля лише додаємо.
 */

import { INTERNAL_TRANSFER_ID } from "../constants";
import type { Transaction, TransactionSource, TransactionType } from "./types";

interface NormalizeDefaults {
  source?: TransactionSource | string;
  accountId?: string | null;
  categoryId?: string;
}

// Довільний "сирий" інпут — використовуємо індексний тип, щоб не плодити any.
// Поля опційні та неточно типізовані, бо приходять з різних джерел.
type RawTxInput = {
  id?: string | number;
  amount?: number | string;
  time?: number | string;
  date?: string | number | Date;
  createdAt?: string | number | Date;
  description?: string;
  mcc?: number | string;
  categoryId?: string;
  category?: string;
  merchant?: string;
  merchantName?: string;
  note?: string;
  comment?: string;
  type?: string;
  source?: string;
  _source?: string;
  manual?: boolean;
  _manual?: boolean;
  manualId?: string | number;
  _manualId?: string | number;
  accountId?: string | null;
  _accountId?: string | null;
  raw?: unknown;
} & Record<string, unknown>;

// Внутрішні category ids, які трактуються як переказ між власними рахунками.
const TRANSFER_CATEGORY_IDS = new Set([INTERNAL_TRANSFER_ID, "transfer"]);

// Назви джерел у "сирому" вигляді → канонічні TransactionSource.
const SOURCE_ALIASES: Record<string, TransactionSource> = {
  manual: "manual",
  mono: "mono",
  monobank: "mono",
  ai: "ai",
  "ai-analysis": "ai",
  import: "import",
  privat: "import",
  privatbank: "import",
};

/**
 * Приводить довільне значення дати/часу до unix timestamp (секунди).
 * Підтримує: number (мс або сек), Date, ISO-рядок, YYYY-MM-DD тощо.
 */
function toSafeTimestampSeconds(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    // Якщо це мілісекунди (10^10 межа для секунд — приблизно 2286 рік).
    return input > 10_000_000_000
      ? Math.floor(input / 1000)
      : Math.floor(input);
  }
  if (input instanceof Date) return Math.floor(input.getTime() / 1000);
  const parsed = new Date((input as string | number) || Date.now()).getTime();
  return Number.isFinite(parsed)
    ? Math.floor(parsed / 1000)
    : Math.floor(Date.now() / 1000);
}

// Мінімум до копійок; число → round; інше → 0. Уникаємо -0.
function toSafeAmountMinorUnits(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded === 0 ? 0 : rounded;
}

// Канонічне джерело з будь-якого alias, з фолбеком на defaults/manual-детект.
function resolveSource(
  input: RawTxInput,
  defaults: NormalizeDefaults,
): TransactionSource {
  const raw =
    input?.source ??
    input?._source ??
    defaults?.source ??
    (input?._manual || input?.manual ? "manual" : null);
  if (!raw) return "import";
  const key = String(raw).toLowerCase();
  return SOURCE_ALIASES[key] || "import";
}

// Тип транзакції: якщо категорія — внутрішній переказ → 'transfer';
// інакше за знаком суми.
function resolveType(
  categoryId: string,
  amount: number,
  explicitType: string | undefined,
): TransactionType {
  if (
    explicitType === "expense" ||
    explicitType === "income" ||
    explicitType === "transfer"
  ) {
    return explicitType;
  }
  if (categoryId && TRANSFER_CATEGORY_IDS.has(categoryId)) return "transfer";
  return amount > 0 ? "income" : "expense";
}

// Витягує categoryId з різних форм сирого input.
function resolveCategoryId(input: RawTxInput | null | undefined): string {
  if (!input) return "";
  if (typeof input.categoryId === "string" && input.categoryId) {
    return input.categoryId;
  }
  // manual-транзакції зберігають id категорії у raw.category або в полі category.
  const raw =
    input.raw && typeof input.raw === "object"
      ? (input.raw as Record<string, unknown>)
      : null;
  const fromRaw =
    raw && typeof raw["category"] === "string" ? raw["category"] : "";
  const fromInput = typeof input.category === "string" ? input.category : "";
  return fromRaw || fromInput || "";
}

// merchant: явне поле > merchantName/vendor > опис для банківських джерел.
function resolveMerchant(
  input: RawTxInput | null | undefined,
  source: TransactionSource,
): string | undefined {
  if (!input) return undefined;
  if (typeof input.merchant === "string" && input.merchant.trim()) {
    return input.merchant.trim();
  }
  if (typeof input.merchantName === "string" && input.merchantName.trim()) {
    return input.merchantName.trim();
  }
  // Для mono/import description ≈ merchant; для manual краще не дублювати.
  if (
    (source === "mono" || source === "import") &&
    typeof input.description === "string"
  ) {
    const d = input.description.trim();
    return d || undefined;
  }
  return undefined;
}

// note: явне поле > comment > для manual — description.
function resolveNote(
  input: RawTxInput | null | undefined,
  source: TransactionSource,
): string | undefined {
  if (!input) return undefined;
  if (typeof input.note === "string" && input.note.trim()) {
    return input.note.trim();
  }
  if (typeof input.comment === "string" && input.comment.trim()) {
    return input.comment.trim();
  }
  if (source === "manual" && typeof input.description === "string") {
    const d = input.description.trim();
    return d || undefined;
  }
  return undefined;
}

/**
 * Нормалізує довільну "сиру" транзакцію у єдину модель Transaction.
 *
 * Генерує id, приводить date до ISO, гарантує що amount — number,
 * заповнює дефолти відсутніх полів та зберігає legacy-поля для сумісності.
 */
export function normalizeTransaction(
  input: RawTxInput | null | undefined,
  defaults: NormalizeDefaults = {},
): Transaction {
  const tx: RawTxInput = input || {};
  const source = resolveSource(tx, defaults);

  const manual = Boolean(tx.manual ?? tx._manual ?? source === "manual");
  const manualId = tx.manualId ?? tx._manualId;
  const accountId = tx.accountId ?? tx._accountId ?? defaults.accountId ?? null;
  const normalizedAmount = toSafeAmountMinorUnits(tx.amount);
  const time = toSafeTimestampSeconds(tx.time ?? tx.date ?? tx.createdAt);
  const date = new Date(time * 1000).toISOString();

  const categoryId =
    resolveCategoryId(tx) ||
    (defaults.categoryId ? String(defaults.categoryId) : "");
  const type = resolveType(categoryId, normalizedAmount, tx.type);
  const merchant = resolveMerchant(tx, source);
  const note = resolveNote(tx, source);

  // Стабільний id: або власний, або детермінований від source/time/amount + рандомний хвіст.
  const fallbackId = `${source}_${time}_${normalizedAmount}_${Math.random().toString(36).slice(2, 8)}`;

  // legacy _source: якщо на вхід приходив оригінальний label (monobank/privatbank/unknown)
  // — зберігаємо його для існуючих перевірок у UI (TxRow і т.п.).
  const legacySource =
    typeof tx._source === "string" && tx._source
      ? tx._source
      : typeof tx.source === "string" && tx.source
        ? tx.source
        : typeof defaults.source === "string" && defaults.source
          ? defaults.source
          : source;

  return {
    // Канонічні поля — єдиний формат для всіх споживачів логіки.
    id: String(tx.id || fallbackId),
    amount: normalizedAmount,
    date,
    categoryId,
    type,
    merchant,
    note,
    source,

    // Legacy-поля для сумісності з існуючим UI та старими даними.
    time,
    description: String(tx.description || ""),
    mcc: Number.isFinite(Number(tx.mcc)) ? Number(tx.mcc) : 0,
    accountId: accountId == null ? null : String(accountId),
    manual,
    manualId: manualId == null ? undefined : String(manualId),
    raw: tx.raw || undefined,

    _source: legacySource,
    _accountId: accountId == null ? null : String(accountId),
    _manual: manual,
    _manualId: manualId == null ? undefined : String(manualId),
  };
}

export function normalizeTransactions(
  items: readonly RawTxInput[] | null | undefined,
  defaults: NormalizeDefaults = {},
): Transaction[] {
  const list = Array.isArray(items) ? items : [];
  return list.map((tx) => normalizeTransaction(tx, defaults));
}

// Відфільтровує транзакції, які не беруть участь у ФІНІК-статистиці
// (приховані користувачем, внутрішні перекази, погашення боргів…).
// Використовується сторінками Overview/Budgets замість inline-фільтра.
export function filterStatTransactions(
  transactions: readonly Transaction[] | null | undefined,
  excludedTxIds: Set<string> | Iterable<string> | null | undefined,
): Transaction[] {
  if (!Array.isArray(transactions)) return [];
  const excluded =
    excludedTxIds instanceof Set
      ? excludedTxIds
      : new Set<string>(
          excludedTxIds ? (excludedTxIds as Iterable<string>) : [],
        );
  return transactions.filter((t) => t && !excluded.has(t.id));
}

// Захищаємось від "сирих" входів з неправильною формою: нормалізуємо
// лише валідні об'єкти, пропускаємо пусті/null/недійсні записи та гарантуємо
// унікальність за стабільним id. Остання транзакція з тим же id виграє —
// це важливо для merge між cache + network, коли сервер повернув свіжу копію.
export function dedupeAndSortTransactions(
  items:
    | readonly RawTxInput[]
    | readonly Transaction[]
    | readonly (RawTxInput | Transaction)[]
    | null
    | undefined,
): Transaction[] {
  if (!Array.isArray(items)) return [];
  const safe = items.filter(
    (tx): tx is RawTxInput => tx != null && typeof tx === "object",
  );
  const map = new Map<string, Transaction>();
  for (const tx of normalizeTransactions(safe)) {
    if (tx.id) map.set(tx.id, tx);
  }
  return Array.from(map.values()).sort((a, b) => (b.time || 0) - (a.time || 0));
}

/**
 * Перетворює збережену manual-витрату (`addManualExpense`-entry) у
 * нормалізовану Transaction. Зберігає amount у копійках зі знаком "витрата"
 * та проставляє categoryId з поля `category`.
 */
export interface ManualExpenseEntry {
  id: string | number;
  date?: string;
  description?: string;
  amount?: number | string;
  category?: string;
}

export function manualExpenseToTransaction(
  entry: ManualExpenseEntry | null | undefined,
): Transaction {
  const e: ManualExpenseEntry = entry || { id: "" };
  const time = e.date ? Math.floor(new Date(e.date).getTime() / 1000) : 0;
  return normalizeTransaction(
    {
      id: `manual_${e.id}`,
      manual: true,
      manualId: e.id,
      time,
      // UI зберігає amount як додатнє число у гривнях → конвертуємо у мінус-копійки.
      amount: -Math.abs(Math.round(Number(e.amount || 0) * 100)),
      description: e.description || "",
      mcc: 0,
      raw: { category: e.category },
    },
    { source: "manual", accountId: null, categoryId: e.category || "" },
  );
}
