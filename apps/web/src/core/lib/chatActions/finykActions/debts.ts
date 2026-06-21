/* eslint-disable sergeant-design/no-raw-storage-key, @typescript-eslint/no-non-null-assertion --
   Chat-action executors run outside React; storage key strings are used
   directly here. Same pattern as queryFinykActions.ts. The non-null
   assertion is pre-existing. */
import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import type {
  CreateDebtAction,
  CreateReceivableAction,
  MarkDebtPaidAction,
  Debt,
  Receivable,
  ChatActionResult,
} from "../types";

export function createDebt(action: CreateDebtAction): ChatActionResult {
  const { name, amount, due_date, emoji } = action.input;
  const debts = ls<Debt[]>("finyk_debts", []);
  const newDebt: Debt = {
    id: `d_${Date.now()}`,
    name,
    totalAmount: Number(amount),
    dueDate: due_date || "",
    emoji: emoji || "💸",
    linkedTxIds: [],
  };
  debts.push(newDebt);
  finykChatWrite("finyk_debts", debts);
  const debtId = newDebt.id;
  return {
    result: `Борг "${name}" на ${amount} грн створено (id:${debtId})`,
    undo: () => {
      const cur = ls<Debt[]>("finyk_debts", []);
      const next = cur.filter((d) => d.id !== debtId);
      if (next.length !== cur.length) finykChatWrite("finyk_debts", next);
    },
  };
}

export function createReceivable(
  action: CreateReceivableAction,
): ChatActionResult {
  const { name, amount } = action.input;
  const recv = ls<Receivable[]>("finyk_recv", []);
  const newRecv: Receivable = {
    id: `r_${Date.now()}`,
    name,
    amount: Number(amount),
    linkedTxIds: [],
  };
  recv.push(newRecv);
  finykChatWrite("finyk_recv", recv);
  const recvId = newRecv.id;
  return {
    result: `Дебіторку "${name}" на ${amount} грн додано (id:${recvId})`,
    undo: () => {
      const cur = ls<Receivable[]>("finyk_recv", []);
      const next = cur.filter((r) => r.id !== recvId);
      if (next.length !== cur.length) finykChatWrite("finyk_recv", next);
    },
  };
}

export function markDebtPaid(action: MarkDebtPaidAction): ChatActionResult {
  const { debt_id, amount, note } = action.input;
  const id = String(debt_id || "").trim();
  if (!id) return "Потрібен debt_id.";
  const debts = ls<Debt[]>("finyk_debts", []);
  const idx = debts.findIndex((d) => d.id === id);
  if (idx < 0) return `Борг ${id} не знайдено.`;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- idx ≥ 0 confirmed above; noUncheckedIndexedAccess makes [idx] T|undefined
  const debt = { ...debts[idx]! };
  const payAmount =
    amount != null && Number.isFinite(Number(amount))
      ? Math.abs(Number(amount))
      : Number(debt.totalAmount) || 0;
  if (payAmount <= 0) return "Сума погашення має бути додатною.";
  const txId = `m_${Date.now().toString(36)}_${Math.random()
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
  if (closed) {
    debts.splice(idx, 1);
  } else {
    debts[idx] = debt;
  }
  finykChatWrite("finyk_debts", debts);
  return `Погашено ${payAmount} грн з "${debt.name}"${closed ? " — борг закрито" : ""} (tx:${txId})`;
}
