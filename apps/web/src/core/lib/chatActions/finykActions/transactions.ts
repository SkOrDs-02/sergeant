import { ls, lsSet } from "../../hubChatUtils";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import type {
  CreateTransactionAction,
  DeleteTransactionAction,
  HideTransactionAction,
  SplitTransactionAction,
  ChatActionResult,
} from "../types";

export function createTransaction(
  action: CreateTransactionAction,
): ChatActionResult {
  const { type, amount, category, description, date } = action.input;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return "Некоректна сума транзакції.";
  }
  const txType = type === "income" ? "income" : "expense";
  const nowIso = new Date().toISOString();
  const isoDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00`).toISOString()
      : nowIso;
  const customC = ls<Array<{ id: string; label?: string }>>(
    "finyk_custom_cats_v1",
    [],
  );
  let categoryLabel = "";
  if (category && category.trim()) {
    const meta = resolveExpenseCategoryMeta(category.trim(), customC);
    categoryLabel = meta?.label || category.trim();
  }
  const manualId = `m_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const manualExpenses = ls<
    Array<{
      id: string;
      date: string;
      description?: string;
      amount: number;
      category?: string;
      type?: string;
    }>
  >("finyk_manual_expenses_v1", []);
  const entry = {
    id: manualId,
    date: isoDate,
    description: description?.trim() || "",
    amount: Math.abs(amt),
    category: category?.trim() || "",
    type: txType,
  };
  manualExpenses.unshift(entry);
  lsSet("finyk_manual_expenses_v1", manualExpenses);
  const label = categoryLabel ? ` (${categoryLabel})` : "";
  const human = txType === "income" ? "Дохід" : "Витрату";
  const result = `${human} ${amt} грн${description ? ` "${description.trim()}"` : ""}${label} записано (id:${manualId})`;
  // Undo видаляє щойно додану транзакцію за `manualId`. Якщо юзер
  // паралельно встиг видалити її іншим шляхом — ідемпотентно
  // нічого не робимо (а не throw): двічі натиснений undo не має
  // дати "не вдалось повернути".
  return {
    result,
    undo: () => {
      const current = ls<Array<{ id: string }>>("finyk_manual_expenses_v1", []);
      const next = current.filter((tx) => tx.id !== manualId);
      if (next.length !== current.length) {
        lsSet("finyk_manual_expenses_v1", next);
      }
    },
  };
}

export function hideTransaction(
  action: HideTransactionAction,
): ChatActionResult {
  const { tx_id } = action.input;
  const hidden = ls<string[]>("finyk_hidden_txs", []);
  if (!hidden.includes(tx_id)) {
    hidden.push(tx_id);
    lsSet("finyk_hidden_txs", hidden);
  }
  return `Транзакцію ${tx_id} приховано зі статистики`;
}

export function deleteTransaction(
  action: DeleteTransactionAction,
): ChatActionResult {
  const { tx_id } = action.input;
  const id = String(tx_id || "").trim();
  if (!id) return "Потрібен tx_id для видалення.";
  if (!id.startsWith("m_")) {
    return `Транзакцію ${id} не видалено: можна видаляти лише ручні (m_…). Для монобанк-транзакцій використайте hide_transaction.`;
  }
  const list = ls<Array<{ id: string }>>("finyk_manual_expenses_v1", []);
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return `Транзакцію ${id} не знайдено (вже видалена).`;
  const next = list.slice();
  next.splice(idx, 1);
  lsSet("finyk_manual_expenses_v1", next);
  return `Транзакцію ${id} видалено`;
}

export function splitTransaction(
  action: SplitTransactionAction,
): ChatActionResult {
  const { tx_id, parts: splitParts } = action.input;
  const id = String(tx_id || "").trim();
  if (!id) return "Потрібен tx_id.";
  if (!Array.isArray(splitParts) || splitParts.length < 2)
    return "Потрібно мінімум 2 частини для розділення.";
  const splits = ls<
    Record<string, Array<{ categoryId: string; amount: number }>>
  >("finyk_tx_splits", {});
  const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
  const newSplits = splitParts.map((p) => ({
    categoryId: String(p.category_id || "").trim(),
    amount: Math.abs(Number(p.amount) || 0),
  }));
  splits[id] = newSplits;
  lsSet("finyk_tx_splits", splits);
  const desc = newSplits
    .map((s) => {
      const cat = resolveExpenseCategoryMeta(s.categoryId, customC);
      return `${cat?.label || s.categoryId}: ${s.amount} грн`;
    })
    .join(", ");
  return `Транзакцію ${id} розділено на ${newSplits.length} частин: ${desc}`;
}
