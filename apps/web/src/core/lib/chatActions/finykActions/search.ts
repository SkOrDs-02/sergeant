import { ls, lsSet } from "../../hubChatUtils";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import type {
  BatchCategorizeAction,
  ChangeCategoryAction,
  FindTransactionAction,
  ChatActionResult,
} from "../types";

export type FinykSearchTx = {
  id: string;
  date: string;
  amount: number;
  description: string;
  category?: string;
  type?: string;
};

export function toIsoDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return "";
}

export function toDisplayAmount(
  tx: FinykSearchTx,
  source: "manual" | "bank",
): number {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount)) return 0;
  return source === "manual" ? Math.abs(amount) : Math.abs(amount) / 100;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function readSearchTransactions(): FinykSearchTx[] {
  const manual = ls<
    Array<{
      id?: string;
      date?: string;
      description?: string;
      amount?: number | string;
      category?: string;
      type?: string;
    }>
  >("finyk_manual_expenses_v1", []);
  const cached = ls<
    | Array<{
        id?: string;
        time?: number | string;
        date?: string;
        description?: string;
        merchant?: string;
        amount?: number | string;
        category?: string;
        type?: string;
      }>
    | {
        txs?: Array<{
          id?: string;
          time?: number | string;
          date?: string;
          description?: string;
          merchant?: string;
          amount?: number | string;
          category?: string;
          type?: string;
        }>;
      }
  >("finyk_tx_cache", []);
  const bankTxs = Array.isArray(cached)
    ? cached
    : Array.isArray(cached.txs)
      ? cached.txs
      : [];
  const txCategories = ls<Record<string, string>>("finyk_tx_cats", {});
  const hidden = new Set(ls<string[]>("finyk_hidden_txs", []));

  const manualTxs = manual.map((tx): FinykSearchTx | null => {
    const id = String(tx.id || "").trim();
    if (!id || hidden.has(id)) return null;
    const amount = Number(tx.amount);
    return {
      id,
      date: toIsoDay(tx.date),
      amount: Number.isFinite(amount) ? amount : 0,
      description: String(tx.description || ""),
      category: txCategories[id] || tx.category || "",
      type: tx.type,
    };
  });
  const cachedTxs = bankTxs.map((tx): FinykSearchTx | null => {
    const id = String(tx.id || "").trim();
    if (!id || hidden.has(id)) return null;
    const amount = Number(tx.amount);
    return {
      id,
      date: toIsoDay(tx.date || tx.time),
      amount: Number.isFinite(amount) ? amount : 0,
      description: String(tx.description || tx.merchant || ""),
      category: txCategories[id] || tx.category || "",
      type: tx.type,
    };
  });

  return [...manualTxs, ...cachedTxs].filter(
    (tx): tx is FinykSearchTx => tx !== null,
  );
}

function matchesFinykSearch(
  tx: FinykSearchTx,
  filters: {
    query?: string;
    amount?: number;
    amountTolerance: number;
    dateFrom?: string;
    dateTo?: string;
  },
): boolean {
  const query = normalizeText(filters.query);
  if (query) {
    const haystack = normalizeText(
      [tx.id, tx.description, tx.category, tx.type].filter(Boolean).join(" "),
    );
    if (!haystack.includes(query)) return false;
  }
  if (filters.amount !== undefined) {
    const source = tx.id.startsWith("m_") ? "manual" : "bank";
    const diff = Math.abs(toDisplayAmount(tx, source) - filters.amount);
    if (diff > filters.amountTolerance) return false;
  }
  if (filters.dateFrom && tx.date && tx.date < filters.dateFrom) return false;
  if (filters.dateTo && tx.date && tx.date > filters.dateTo) return false;
  return true;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function formatTxList(items: FinykSearchTx[]): string {
  return items
    .map((tx) => {
      const category = tx.category ? ` · ${tx.category}` : "";
      const desc = tx.description ? ` · ${tx.description}` : "";
      const source = tx.id.startsWith("m_") ? "manual" : "bank";
      return `${tx.id}: ${tx.date || "без дати"} · ${toDisplayAmount(tx, source)} грн${desc}${category}`;
    })
    .join("; ");
}

export function changeCategory(action: ChangeCategoryAction): ChatActionResult {
  const { tx_id, category_id } = action.input;
  const cats = ls<Record<string, string>>("finyk_tx_cats", {});
  cats[tx_id] = category_id;
  lsSet("finyk_tx_cats", cats);
  const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
  const cat = resolveExpenseCategoryMeta(category_id, customC);
  return `Категорію транзакції ${tx_id} змінено на ${cat?.label || category_id}`;
}

export function findTransaction(
  action: FindTransactionAction,
): ChatActionResult {
  const input = action.input;
  const amount =
    input.amount != null && Number.isFinite(Number(input.amount))
      ? Number(input.amount)
      : undefined;
  const amountTolerance =
    input.amount_tolerance != null &&
    Number.isFinite(Number(input.amount_tolerance))
      ? Math.abs(Number(input.amount_tolerance))
      : 0.01;
  const query = String(input.query || "").trim();
  if (!query && amount === undefined && !input.date_from && !input.date_to) {
    return "Потрібен query, amount або date-фільтр для пошуку транзакції.";
  }
  const limit = clampLimit(input.limit, 5, 10);
  const matches = readSearchTransactions()
    .filter((tx) =>
      matchesFinykSearch(tx, {
        query,
        amount,
        amountTolerance,
        dateFrom: input.date_from,
        dateTo: input.date_to,
      }),
    )
    .slice(0, limit);
  if (matches.length === 0) return "Транзакцій за цими фільтрами не знайдено.";
  return `Знайдено ${matches.length} транзакц.: ${formatTxList(matches)}`;
}

export function batchCategorize(
  action: BatchCategorizeAction,
): ChatActionResult {
  const input = action.input;
  const pattern = String(input.pattern || "").trim();
  const categoryId = String(input.category_id || "").trim();
  if (!pattern) return "Для batch_categorize потрібен pattern.";
  if (!categoryId) return "Для batch_categorize потрібен category_id.";
  const amount =
    input.amount != null && Number.isFinite(Number(input.amount))
      ? Number(input.amount)
      : undefined;
  const amountTolerance =
    input.amount_tolerance != null &&
    Number.isFinite(Number(input.amount_tolerance))
      ? Math.abs(Number(input.amount_tolerance))
      : 0.01;
  const limit = clampLimit(input.limit, 20, 50);
  const matches = readSearchTransactions()
    .filter((tx) =>
      matchesFinykSearch(tx, {
        query: pattern,
        amount,
        amountTolerance,
        dateFrom: input.date_from,
        dateTo: input.date_to,
      }),
    )
    .slice(0, limit);
  if (matches.length === 0) {
    return `Не знайшов транзакцій за pattern "${pattern}".`;
  }
  const preview = formatTxList(matches);
  if (input.dry_run !== false) {
    return `Dry-run: ${matches.length} транзакц. буде перенесено в ${categoryId}: ${preview}`;
  }
  const cats = ls<Record<string, string>>("finyk_tx_cats", {});
  for (const tx of matches) cats[tx.id] = categoryId;
  lsSet("finyk_tx_cats", cats);
  return `Категорію ${matches.length} транзакц. змінено на ${categoryId}: ${preview}`;
}
