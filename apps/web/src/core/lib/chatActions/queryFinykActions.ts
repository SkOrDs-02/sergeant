import { getWeekKey } from "@sergeant/shared";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/utils";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { getCachedFinykSqliteState } from "../../../modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "../../../modules/finyk/lib/monoMirrorReader";
import {
  toDisplayAmount,
  toIsoDay,
  txSourceOf,
  type FinykSearchTx,
} from "./finykActions/search";
import type { ChatAction, ChatActionResult } from "./types";

/**
 * Read-only "talk to your data" виконавці для Фініка (PR1 talk-to-your-data).
 * Дзеркало серверних `QUERY_FINYK_TOOLS` (`toolDefs/queryFinyk.ts`). Жоден з
 * них НЕ пише у localStorage — лише читають (manual + bank, з урахуванням
 * прихованих) і повертають числові відповіді / агрегації.
 *
 * Реєструється у `hubChatActions.ts` dispatch-chain окремою гілкою, не
 * чіпаючи мутаційний `handleFinykAction`.
 *
 * AI-NOTE: `readQueryTransactions` навмисно дублює приватний
 * `readSearchTransactions` з `finykActions/search.ts` — той не експортовано, а
 * експорт re-stage-ив би файл під `no-raw-storage-key` burndown. Тримаємо
 * читання тут із локальним disable; чисті трансформери (`toIsoDay`,
 * `toDisplayAmount`) переюзаємо з search.ts.
 */

interface QueryTransactionsAction {
  name: "query_transactions";
  input: {
    query?: string;
    category?: string;
    type?: string;
    amount?: number | string;
    amount_tolerance?: number | string;
    date_from?: string;
    date_to?: string;
    limit?: number | string;
  };
}

interface AggregateSpendingAction {
  name: "aggregate_spending";
  input: {
    group_by?: string;
    type?: string;
    date_from?: string;
    date_to?: string;
    top?: number | string;
  };
}

interface ComparePeriodsAction {
  name: "compare_periods";
  input: {
    period_a_from?: string;
    period_a_to?: string;
    period_b_from?: string;
    period_b_to?: string;
    metric?: string;
  };
}

type TxDirection = "income" | "expense";
type GroupBy = "category" | "day" | "week" | "month" | "merchant";
type CompareMetric = "spending" | "income" | "count";

type RawTx = {
  id?: string;
  time?: number | string;
  date?: string;
  description?: string;
  merchant?: string;
  amount?: number | string;
  category?: string;
  type?: string;
};

// ─── data source ─────────────────────────────────────────────────────────────

/**
 * Unified read of Finyk transactions (manual грн + bank kopiykas), hidden
 * filtered, category overrides applied. Mirror of the private
 * `readSearchTransactions` in `finykActions/search.ts`.
 */
function readQueryTransactions(): FinykSearchTx[] {
  const sqlite = getCachedFinykSqliteState();
  const manual = sqlite.manualExpenses as RawTx[];
  const bankTxs = getCachedFinykMonoMirrorState().transactions as RawTx[];
  const txCategories = sqlite.txCategories;
  const hidden = new Set(sqlite.hiddenTransactions);

  const map =
    (source: "manual" | "bank", dateField: (tx: RawTx) => unknown) =>
    (tx: RawTx): FinykSearchTx | null => {
      const id = String(tx.id || "").trim();
      if (!id || hidden.has(id)) return null;
      const amount = Number(tx.amount);
      return {
        id,
        date: toIsoDay(dateField(tx)),
        amount: Number.isFinite(amount) ? amount : 0,
        description: String(tx.description || tx.merchant || ""),
        category: txCategories[id] || tx.category || "",
        type: tx.type,
        source,
      };
    };

  return [
    ...manual.map(map("manual", (tx) => tx.date)),
    ...bankTxs.map(map("bank", (tx) => tx.date || tx.time)),
  ].filter((tx): tx is FinykSearchTx => tx !== null);
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseNum(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isoOrUndef(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function normalizeType(value: unknown): TxDirection | undefined {
  const s = normalizeText(value);
  if (s === "expense" || s === "витрати" || s === "витрата") return "expense";
  if (s === "income" || s === "дохід" || s === "доходи") return "income";
  return undefined;
}

function normalizeGroupBy(value: unknown): GroupBy {
  const s = normalizeText(value);
  if (s === "day" || s === "день") return "day";
  if (s === "week" || s === "тиждень") return "week";
  if (s === "month" || s === "місяць") return "month";
  if (s === "merchant" || s === "мерчант") return "merchant";
  return "category";
}

function normalizeMetric(value: unknown): CompareMetric {
  const s = normalizeText(value);
  if (s === "income" || s === "дохід") return "income";
  if (s === "count" || s === "кількість") return "count";
  return "spending";
}

function txSource(tx: FinykSearchTx): "manual" | "bank" {
  // Classify by the read-time `source` tag / `type` field — NOT the
  // `m_` id prefix. AI/server-created manual expenses use a server UUID
  // (no `m_`), so the old prefix check misread them as bank rows and
  // `txDirection` then used amount-sign instead of `type`, counting an
  // AI expense (positive amount + type:"expense") as income.
  return txSourceOf(tx);
}

/** Напрям транзакції: manual — за полем `type`, bank — за знаком суми. */
function txDirection(tx: FinykSearchTx): TxDirection {
  if (txSource(tx) === "manual") {
    return tx.type === "income" ? "income" : "expense";
  }
  return tx.amount < 0 ? "expense" : "income";
}

/** Абсолютна сума у грн (kopiyka-нормалізація для bank — у `toDisplayAmount`). */
function txAmountGrn(tx: FinykSearchTx): number {
  return toDisplayAmount(tx, txSource(tx));
}

function readCustomCats(): unknown[] {
  return getCachedFinykSqliteState().customCategories;
}

function categoryLabel(
  categoryId: string | undefined,
  customCats: unknown[],
): string {
  if (!categoryId) return "Без категорії";
  const meta = resolveExpenseCategoryMeta(categoryId, customCats);
  return meta?.label || categoryId;
}

function withinRange(
  tx: FinykSearchTx,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from && (!tx.date || tx.date < from)) return false;
  if (to && (!tx.date || tx.date > to)) return false;
  return true;
}

function roundGrn(n: number): number {
  return Math.round(n);
}

function groupKeyFor(
  tx: FinykSearchTx,
  groupBy: GroupBy,
  customCats: unknown[],
): string {
  switch (groupBy) {
    case "day":
      return tx.date || "без дати";
    case "week":
      return tx.date ? getWeekKey(new Date(`${tx.date}T12:00:00`)) : "без дати";
    case "month":
      return tx.date ? tx.date.slice(0, 7) : "без дати";
    case "merchant":
      return tx.description.trim() || "Без опису";
    case "category":
      return categoryLabel(tx.category, customCats);
  }
}

// ─── executors ──────────────────────────────────────────────────────────────

export function queryTransactions(
  action: QueryTransactionsAction,
): ChatActionResult {
  const input = action.input;
  const query = normalizeText(input.query);
  const category = normalizeText(input.category);
  const typeFilter = normalizeType(input.type);
  const amount = parseNum(input.amount);
  const tolerance = Math.abs(parseNum(input.amount_tolerance) ?? 0.01);
  const from = isoOrUndef(input.date_from);
  const to = isoOrUndef(input.date_to);
  const limit = clamp(input.limit, 20, 100);

  if (
    !query &&
    !category &&
    !typeFilter &&
    amount === undefined &&
    !from &&
    !to
  ) {
    return "Вкажи хоча б один фільтр: query, category, type, amount або діапазон дат.";
  }

  const customCats = readCustomCats();
  const matched = readQueryTransactions().filter((tx) => {
    if (query) {
      const haystack = normalizeText(
        [tx.id, tx.description, tx.category, tx.type].filter(Boolean).join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    if (category) {
      const catText = normalizeText(
        `${tx.category ?? ""} ${categoryLabel(tx.category, customCats)}`,
      );
      if (!catText.includes(category)) return false;
    }
    if (typeFilter && txDirection(tx) !== typeFilter) return false;
    if (
      amount !== undefined &&
      Math.abs(txAmountGrn(tx) - amount) > tolerance
    ) {
      return false;
    }
    return withinRange(tx, from, to);
  });

  if (matched.length === 0) return "Транзакцій за цими фільтрами не знайдено.";

  const total = matched.reduce((sum, tx) => sum + txAmountGrn(tx), 0);
  const shown = matched.slice(0, limit);
  const list = shown
    .map((tx) => {
      const cat = tx.category
        ? ` · ${categoryLabel(tx.category, customCats)}`
        : "";
      const desc = tx.description ? ` · ${tx.description}` : "";
      return `${tx.id}: ${tx.date || "без дати"} · ${roundGrn(txAmountGrn(tx))} грн${desc}${cat}`;
    })
    .join("; ");
  const more =
    matched.length > shown.length
      ? ` (показано ${shown.length} з ${matched.length})`
      : "";
  return `Знайдено ${matched.length} транзакц. на суму ${roundGrn(total)} грн${more}: ${list}`;
}

export function aggregateSpending(
  action: AggregateSpendingAction,
): ChatActionResult {
  const input = action.input;
  const groupBy = normalizeGroupBy(input.group_by);
  const direction = normalizeType(input.type) ?? "expense";
  const now = new Date();
  const { year, month } = getKyivDateParts(now);
  const from =
    isoOrUndef(input.date_from) ??
    `${year}-${String(month).padStart(2, "0")}-01`;
  const to = isoOrUndef(input.date_to) ?? getKyivDayKey(now);
  const top = clamp(input.top, 10, 30);

  const customCats = readCustomCats();
  const rows = readQueryTransactions().filter(
    (tx) => txDirection(tx) === direction && tx.date >= from && tx.date <= to,
  );

  const dirWord = direction === "income" ? "доходів" : "витрат";
  if (rows.length === 0) {
    return `Немає ${dirWord} за період ${from} — ${to}.`;
  }

  const groups = new Map<string, { sum: number; count: number }>();
  let total = 0;
  for (const tx of rows) {
    const amount = txAmountGrn(tx);
    total += amount;
    const key = groupKeyFor(tx, groupBy, customCats);
    const acc = groups.get(key) ?? { sum: 0, count: 0 };
    acc.sum += amount;
    acc.count += 1;
    groups.set(key, acc);
  }

  const groupLabel: Record<GroupBy, string> = {
    category: "категоріями",
    day: "днями",
    week: "тижнями",
    month: "місяцями",
    merchant: "мерчантами",
  };
  const sorted = [...groups.entries()]
    .sort((a, b) => b[1].sum - a[1].sum)
    .slice(0, top)
    .map(([key, v]) => `${key}: ${roundGrn(v.sum)} грн (${v.count})`);

  const dirTitle = direction === "income" ? "Дохід" : "Витрати";
  const more = groups.size > sorted.length ? ` з ${groups.size} груп` : "";
  return `${dirTitle} за ${from} — ${to}: ${roundGrn(total)} грн усього (${rows.length} транзакц.). Розбивка за ${groupLabel[groupBy]}${more}: ${sorted.join("; ")}`;
}

export function comparePeriods(action: ComparePeriodsAction): ChatActionResult {
  const input = action.input;
  const aFrom = isoOrUndef(input.period_a_from);
  const aTo = isoOrUndef(input.period_a_to);
  const bFrom = isoOrUndef(input.period_b_from);
  const bTo = isoOrUndef(input.period_b_to);
  if (!aFrom || !aTo || !bFrom || !bTo) {
    return "Потрібні обидва періоди у форматі YYYY-MM-DD: period_a_from/to і period_b_from/to.";
  }
  const metric = normalizeMetric(input.metric);
  const all = readQueryTransactions();

  const measure = (from: string, to: string): number => {
    const inRange = all.filter((tx) => tx.date >= from && tx.date <= to);
    if (metric === "count") return inRange.length;
    const direction: TxDirection = metric === "income" ? "income" : "expense";
    return inRange
      .filter((tx) => txDirection(tx) === direction)
      .reduce((sum, tx) => sum + txAmountGrn(tx), 0);
  };

  const a = roundGrn(measure(aFrom, aTo));
  const b = roundGrn(measure(bFrom, bTo));
  const delta = a - b;
  const pct = b !== 0 ? (delta / b) * 100 : a !== 0 ? 100 : 0;
  const unit = metric === "count" ? "транзакц." : "грн";
  const metricTitle =
    metric === "count"
      ? "Кількість"
      : metric === "income"
        ? "Дохід"
        : "Витрати";
  const sign = (n: number): string => (n >= 0 ? "+" : "");
  return `${metricTitle}: A (${aFrom} — ${aTo}) = ${a} ${unit}; B (${bFrom} — ${bTo}) = ${b} ${unit}. Різниця (A − B): ${sign(delta)}${delta} ${unit} (${sign(pct)}${pct.toFixed(1)}%).`;
}

/**
 * Доменний router для read-only query-tools. Повертає `undefined` для
 * нерелевантних дій, щоб `hubChatActions.dispatch` пішов далі по ланцюгу.
 */
export function handleQueryFinykAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "query_transactions":
      return queryTransactions(action as QueryTransactionsAction);
    case "aggregate_spending":
      return aggregateSpending(action as AggregateSpendingAction);
    case "compare_periods":
      return comparePeriods(action as ComparePeriodsAction);
    default:
      return undefined;
  }
}
