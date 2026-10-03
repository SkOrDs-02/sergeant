// Chat-action executors run outside React. Стан читається з SQLite warm
// cache (`warmFinykCache`), а не з kv — див. warmCache.ts (data-08).
import { finykChatWrite } from "./dualWriteBridge";
import { FINYK_COLD_CACHE_MESSAGE, warmFinykCache } from "./warmCache";
import {
  finykCategoryExists,
  finykTransactionExists,
  normalizeFinykId,
  unknownCategoryMessage,
  unknownTransactionMessage,
} from "./entityLookup";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import {
  triggerHiddenTransactionSqliteMirror,
  triggerManualExpenseDeleteSqliteMirror,
} from "../../../../modules/finyk/lib/sqliteWriter";
import { parseKyivDate } from "@shared/lib/time/kyivTime";
import { formatNumberUk } from "@sergeant/shared";
import type {
  CreateTransactionAction,
  DeleteTransactionAction,
  HideTransactionAction,
  SplitTransactionAction,
  ChatActionResult,
} from "../types";

type ManualExpenseRow = {
  id: string;
  date: string;
  description?: string;
  amount: number;
  category?: string;
  type?: string;
};

export function createTransaction(
  action: CreateTransactionAction,
): ChatActionResult {
  const { type, amount, category, description, date } = action.input;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return "Некоректна сума операції.";
  }
  const txType = type === "income" ? "income" : "expense";
  const nowIso = new Date().toISOString();
  const isoDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? (parseKyivDate(date)?.toISOString() ?? nowIso)
      : nowIso;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const customC = cache.customCategories;
  let categoryLabel = "";
  if (category && category.trim()) {
    const meta = resolveExpenseCategoryMeta(category.trim(), customC);
    categoryLabel = meta?.label || category.trim();
  }
  const manualId = `m_${crypto.randomUUID()}`;
  const manualExpenses: ManualExpenseRow[] = [...cache.manualExpenses];
  const entry = {
    id: manualId,
    date: isoDate,
    description: description?.trim() || "",
    amount: Math.abs(amt),
    category: category?.trim() || "",
    type: txType,
  };
  manualExpenses.unshift(entry);
  finykChatWrite("finyk_manual_expenses_v1", manualExpenses);
  const label = categoryLabel ? ` (${categoryLabel})` : "";
  const human = txType === "income" ? "Дохід" : "Витрату";
  const result = `${human} ${formatNumberUk(amt)} грн${description ? ` "${description.trim()}"` : ""}${label} записано (id:${manualId})`;
  // Undo видаляє щойно додану транзакцію за `manualId`. Якщо юзер
  // паралельно встиг видалити її іншим шляхом — ідемпотентно
  // нічого не робимо (а не throw): двічі натиснений undo не має
  // дати "не вдалось повернути".
  return {
    result,
    undo: () => {
      const current = warmFinykCache()?.manualExpenses ?? [];
      const next = current.filter((tx) => tx.id !== manualId);
      if (next.length !== current.length) {
        finykChatWrite("finyk_manual_expenses_v1", next);
      }
      // Keep SQLite in step with the LS undo so the row stops showing up
      // in the overlay read. Soft-delete is idempotent — safe to fire
      // even if the LS entry was already removed elsewhere.
      triggerManualExpenseDeleteSqliteMirror(manualId);
    },
  };
}

export function hideTransaction(
  action: HideTransactionAction,
): ChatActionResult {
  const txId = normalizeFinykId(action.input.tx_id);
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  if (!finykTransactionExists(txId)) return unknownTransactionMessage(txId);
  const hidden = [...cache.hiddenTransactions];
  if (!hidden.includes(txId)) {
    hidden.push(txId);
    finykChatWrite("finyk_hidden_txs", hidden);
  }
  // Mirror into `finyk_hidden_transactions` — the hidden-tx read
  // (search / analytics / report) overlays from SQLite. Idempotent.
  triggerHiddenTransactionSqliteMirror(txId);
  return `Операцію ${txId} приховано зі статистики`;
}

export function deleteTransaction(
  action: DeleteTransactionAction,
): ChatActionResult {
  const { tx_id } = action.input;
  const id = String(tx_id || "").trim();
  if (!id) return "Потрібен tx_id для видалення.";
  if (!id.startsWith("m_")) {
    return `Операцію ${id} не видалено: можна видаляти лише ручні (m_…). Для монобанк-операцій використай hide_transaction.`;
  }
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const list = cache.manualExpenses;
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return `Операцію ${id} не знайдено (вже видалена).`;
  const next = list.slice();
  next.splice(idx, 1);
  finykChatWrite("finyk_manual_expenses_v1", next);
  triggerManualExpenseDeleteSqliteMirror(id);
  return `Операцію ${id} видалено`;
}

export function splitTransaction(
  action: SplitTransactionAction,
): ChatActionResult {
  const { tx_id, parts: splitParts } = action.input;
  const id = normalizeFinykId(tx_id);
  if (!id) return "Потрібен tx_id.";
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  if (!finykTransactionExists(id)) return unknownTransactionMessage(id);
  if (!Array.isArray(splitParts) || splitParts.length < 2)
    return "Потрібно мінімум 2 частини для розділення.";
  const splits: Record<
    string,
    Array<{ categoryId: string; amount: number }>
  > = { ...(cache.txSplits as Record<string, never>) };
  const customC = cache.customCategories;
  const newSplits = splitParts.map((p) => ({
    categoryId: normalizeFinykId(p.category_id),
    amount: Math.abs(Number(p.amount) || 0),
  }));
  const unknownPart = newSplits.find((s) => !finykCategoryExists(s.categoryId));
  if (unknownPart) return unknownCategoryMessage(unknownPart.categoryId);
  splits[id] = newSplits;
  finykChatWrite("finyk_tx_splits", splits);
  const desc = newSplits
    .map((s) => {
      const cat = resolveExpenseCategoryMeta(s.categoryId, customC);
      return `${cat?.label || s.categoryId}: ${formatNumberUk(s.amount)} грн`;
    })
    .join(", ");
  return `Операцію ${id} розділено на ${newSplits.length} частин: ${desc}`;
}
