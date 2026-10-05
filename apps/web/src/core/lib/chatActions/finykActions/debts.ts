/* eslint-disable @typescript-eslint/no-non-null-assertion --
   The non-null assertion is pre-existing. Стан читається з SQLite warm
   cache (`warmFinykCache`), а не з kv (data-08). */
import { finykChatWrite } from "./dualWriteBridge";
import { FINYK_COLD_CACHE_MESSAGE, warmFinykCache } from "./warmCache";
import { validatePositiveAmount } from "./amountValidation";
import { formatNumberUk, generatePrefixedId } from "@sergeant/shared";
import { triggerManualExpenseDeleteSqliteMirror } from "../../../../modules/finyk/lib/sqliteWriter";
import type {
  CreateDebtAction,
  CreateReceivableAction,
  MarkDebtPaidAction,
  Debt,
  Receivable,
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

export function createDebt(action: CreateDebtAction): ChatActionResult {
  const { name, amount, due_date, emoji } = action.input;
  const amountCheck = validatePositiveAmount(amount, "amount");
  if (!amountCheck.ok) return amountCheck.message;
  const amountN = amountCheck.value;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const debts = [...(cache.manualDebts as Debt[])];
  const newDebt: Debt = {
    id: generatePrefixedId("d"),
    name,
    totalAmount: amountN,
    dueDate: due_date || "",
    emoji: emoji || "",
    linkedTxIds: [],
  };
  debts.push(newDebt);
  finykChatWrite("finyk_debts", debts);
  const debtId = newDebt.id;
  return {
    result: `Борг "${name}" на ${formatNumberUk(amountN)} грн створено (id:${debtId})`,
    undo: () => {
      const cur = warmFinykCache()?.manualDebts ?? [];
      const next = cur.filter((d) => d.id !== debtId);
      if (next.length !== cur.length) finykChatWrite("finyk_debts", next);
    },
  };
}

export function createReceivable(
  action: CreateReceivableAction,
): ChatActionResult {
  const { name, amount } = action.input;
  const amountCheck = validatePositiveAmount(amount, "amount");
  if (!amountCheck.ok) return amountCheck.message;
  const amountN = amountCheck.value;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const recv = [...(cache.receivables as Receivable[])];
  const newRecv: Receivable = {
    id: generatePrefixedId("r"),
    name,
    amount: amountN,
    linkedTxIds: [],
  };
  recv.push(newRecv);
  finykChatWrite("finyk_recv", recv);
  const recvId = newRecv.id;
  return {
    result: `Дебіторку "${name}" на ${formatNumberUk(amountN)} грн додано (id:${recvId})`,
    undo: () => {
      const cur = warmFinykCache()?.receivables ?? [];
      const next = cur.filter((r) => r.id !== recvId);
      if (next.length !== cur.length) finykChatWrite("finyk_recv", next);
    },
  };
}

export function markDebtPaid(action: MarkDebtPaidAction): ChatActionResult {
  const { debt_id, amount, note } = action.input;
  const id = String(debt_id || "").trim();
  if (!id) return "Потрібен debt_id.";
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const debts = [...(cache.manualDebts as Debt[])];
  const idx = debts.findIndex((d) => d.id === id);
  if (idx < 0) return `Борг ${id} не знайдено.`;

  const debt = { ...debts[idx]! };
  const payAmount =
    amount != null && Number.isFinite(Number(amount))
      ? Math.abs(Number(amount))
      : Number(debt.totalAmount) || 0;
  if (payAmount <= 0) return "Сума погашення має бути додатною.";
  const txId = `m_${crypto.randomUUID()}`;
  const debtId = debt.id;
  const manualExpenses: ManualExpenseRow[] = [...cache.manualExpenses];
  const payEntry = {
    id: txId,
    date: new Date().toISOString(),
    description: (note && String(note).trim()) || `Погашення: ${debt.name}`,
    amount: payAmount,
    category: "",
    type: "expense",
  };
  manualExpenses.unshift(payEntry);
  finykChatWrite("finyk_manual_expenses_v1", manualExpenses);
  debt.linkedTxIds = [...(debt.linkedTxIds || []), txId];
  const prevPaid = debt.linkedTxIds
    .filter((lid) => lid !== txId)
    .reduce((sum, lid) => {
      const linked = manualExpenses.find((e: { id: string }) => e.id === lid);
      return sum + (linked ? Math.abs(Number(linked.amount) || 0) : 0);
    }, 0);
  const totalPaid = prevPaid + payAmount;
  const closed = totalPaid >= Number(debt.totalAmount);
  // Борг НЕ видаляється навіть при повному погашенні: в UI погашений борг
  // рахується за залишком і лишається в списку з історією платежів
  // (logic-03). Видалення було незворотним і без підтвердження.
  debts[idx] = debt;
  finykChatWrite("finyk_debts", debts);
  return {
    result: `Погашено ${formatNumberUk(payAmount)} грн з "${debt.name}"${closed ? ", борг закрито" : ""} (tx:${txId})`,
    // Undo знімає лише цей платіж: читає свіжий кеш (як undo createDebt),
    // тож чужі зміни між дією й відкатом не затираються. Ідемпотентний.
    undo: () => {
      const fresh = warmFinykCache();
      if (!fresh) return;
      const curExpenses = fresh.manualExpenses as ManualExpenseRow[];
      const nextExpenses = curExpenses.filter((e) => e.id !== txId);
      if (nextExpenses.length !== curExpenses.length) {
        finykChatWrite("finyk_manual_expenses_v1", nextExpenses);
      }
      triggerManualExpenseDeleteSqliteMirror(txId);
      const curDebts = fresh.manualDebts as Debt[];
      let debtsChanged = false;
      const nextDebts = curDebts.map((d) => {
        if (d.id !== debtId || !(d.linkedTxIds || []).includes(txId)) return d;
        debtsChanged = true;
        return {
          ...d,
          linkedTxIds: (d.linkedTxIds || []).filter((lid) => lid !== txId),
        };
      });
      if (debtsChanged) finykChatWrite("finyk_debts", nextDebts);
    },
  };
}
