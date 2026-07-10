/* eslint-disable sergeant-design/no-raw-storage-key --
   Chat-action executors run outside React; storage key strings are used
   directly here for the write-path (finyk_tx_cats). Manual expenses and
   per-tx category overrides come from the canonical SQLite warm cache;
   bank transactions now come from the Mono mirror reader. */
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
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
  category?: string | undefined;
  type?: string | undefined;
  /**
   * Origin of the row, tagged at read time. Manual expenses (грн) come
   * from the SQLite `manualExpenses` slice; bank rows (kopiykas) from
   * the `finyk_tx_cache` LS bundle. Drives kopiyka normalisation and
   * income/expense direction — never re-derive it from the `m_` id
   * prefix (AI/server manual expenses use a server UUID).
   */
  source?: "manual" | "bank" | undefined;
};

/**
 * Resolve a row's source. Prefers the read-time `source` tag; falls
 * back to the `type` field (manual rows carry income/expense), NOT the
 * `m_` id prefix — AI/server-created manual expenses use a server UUID.
 */
export function txSourceOf(tx: FinykSearchTx): "manual" | "bank" {
  if (tx.source) return tx.source;
  return tx.type === "income" || tx.type === "expense" ? "manual" : "bank";
}

export function toIsoDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    // Bucket the transaction instant by its Europe/Kyiv calendar day so
    // date filters compare against the user's civil day, not the host's.
    return getKyivDayKey(new Date(ms));
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

/**
 * Unified read of Finyk transactions for the search/categorize tools.
 *
 * Manual expenses come from the canonical SQLite `manualExpenses` slice
 * (the finyk module reads the same overlay; the legacy
 * `finyk_manual_expenses_v1` LS key is drained + tombstoned on boot, so
 * an AI/server-created expense would otherwise be invisible here). Bank
 * rows stay on the `finyk_tx_cache` LS bundle — it has no SQLite canon.
 * Per-tx category overrides and hidden-tx ids also come from SQLite.
 */
function readSearchTransactions(): FinykSearchTx[] {
  const sqlite = getCachedFinykSqliteState();
  const manual = sqlite.manualExpenses as ReadonlyArray<{
    id?: string;
    date?: string;
    description?: string;
    amount?: number | string;
    category?: string;
    type?: string;
  }>;
  const txCategories = sqlite.txCategories;
  const hidden = new Set(sqlite.hiddenTransactions);
  const bankTxs = getCachedFinykMonoMirrorState().transactions as Array<{
    id?: string;
    time?: number | string;
    date?: string;
    description?: string;
    merchant?: string;
    amount?: number | string;
    category?: string;
    type?: string;
  }>;

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
      source: "manual",
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
      source: "bank",
    };
  });

  return [...manualTxs, ...cachedTxs].filter(
    (tx): tx is FinykSearchTx => tx !== null,
  );
}

function matchesFinykSearch(
  tx: FinykSearchTx,
  filters: {
    query?: string | undefined;
    amount?: number | undefined;
    amountTolerance: number;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
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
    const source = txSourceOf(tx);
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
      const source = txSourceOf(tx);
      return `${tx.id}: ${tx.date || "без дати"} · ${toDisplayAmount(tx, source)} грн${desc}${category}`;
    })
    .join("; ");
}

export function changeCategory(action: ChangeCategoryAction): ChatActionResult {
  const { tx_id, category_id } = action.input;
  const cats = ls<Record<string, string>>("finyk_tx_cats", {});
  cats[tx_id] = category_id;
  finykChatWrite("finyk_tx_cats", cats);
  const customC = getCachedFinykSqliteState().customCategories;
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
  finykChatWrite("finyk_tx_cats", cats);
  return `Категорію ${matches.length} транзакц. змінено на ${categoryId}: ${preview}`;
}
