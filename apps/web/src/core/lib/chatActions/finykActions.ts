import { ls, lsSet } from "../hubChatUtils";
import {
  resolveExpenseCategoryMeta,
  getTxStatAmount,
} from "../../../modules/finyk/utils";
import { safeRemoveLS } from "@shared/lib/storage";
import type {
  BatchCategorizeAction,
  ChangeCategoryAction,
  CreateDebtAction,
  CreateReceivableAction,
  FindTransactionAction,
  HideTransactionAction,
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  CreateTransactionAction,
  DeleteTransactionAction,
  UpdateBudgetAction,
  MarkDebtPaidAction,
  AddAssetAction,
  ImportMonobankRangeAction,
  SplitTransactionAction,
  RecurringExpenseAction,
  ExportReportAction,
  Debt,
  Receivable,
  Budget,
  BudgetLimit,
  BudgetGoal,
  MonthlyPlan,
  ChatAction,
  ChatActionResult,
} from "./types";

type FinykSearchTx = {
  id: string;
  date: string;
  amount: number;
  description: string;
  category?: string;
  type?: string;
};

function toIsoDay(value: unknown): string {
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

function toDisplayAmount(tx: FinykSearchTx, source: "manual" | "bank"): number {
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

export function handleFinykAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "change_category": {
      const { tx_id, category_id } = (action as ChangeCategoryAction).input;
      const cats = ls<Record<string, string>>("finyk_tx_cats", {});
      cats[tx_id] = category_id;
      lsSet("finyk_tx_cats", cats);
      const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
      const cat = resolveExpenseCategoryMeta(category_id, customC);
      return `Категорію транзакції ${tx_id} змінено на ${cat?.label || category_id}`;
    }
    case "find_transaction": {
      const input = (action as FindTransactionAction).input;
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
      if (
        !query &&
        amount === undefined &&
        !input.date_from &&
        !input.date_to
      ) {
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
      if (matches.length === 0)
        return "Транзакцій за цими фільтрами не знайдено.";
      return `Знайдено ${matches.length} транзакц.: ${formatTxList(matches)}`;
    }
    case "batch_categorize": {
      const input = (action as BatchCategorizeAction).input;
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
    case "create_debt": {
      const { name, amount, due_date, emoji } = (action as CreateDebtAction)
        .input;
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
      lsSet("finyk_debts", debts);
      const debtId = newDebt.id;
      return {
        result: `Борг "${name}" на ${amount} грн створено (id:${debtId})`,
        undo: () => {
          const cur = ls<Debt[]>("finyk_debts", []);
          const next = cur.filter((d) => d.id !== debtId);
          if (next.length !== cur.length) lsSet("finyk_debts", next);
        },
      };
    }
    case "create_receivable": {
      const { name, amount } = (action as CreateReceivableAction).input;
      const recv = ls<Receivable[]>("finyk_recv", []);
      const newRecv: Receivable = {
        id: `r_${Date.now()}`,
        name,
        amount: Number(amount),
        linkedTxIds: [],
      };
      recv.push(newRecv);
      lsSet("finyk_recv", recv);
      const recvId = newRecv.id;
      return {
        result: `Дебіторку "${name}" на ${amount} грн додано (id:${recvId})`,
        undo: () => {
          const cur = ls<Receivable[]>("finyk_recv", []);
          const next = cur.filter((r) => r.id !== recvId);
          if (next.length !== cur.length) lsSet("finyk_recv", next);
        },
      };
    }
    case "hide_transaction": {
      const { tx_id } = (action as HideTransactionAction).input;
      const hidden = ls<string[]>("finyk_hidden_txs", []);
      if (!hidden.includes(tx_id)) {
        hidden.push(tx_id);
        lsSet("finyk_hidden_txs", hidden);
      }
      return `Транзакцію ${tx_id} приховано зі статистики`;
    }
    case "set_budget_limit": {
      const { category_id, limit } = (action as SetBudgetLimitAction).input;
      const budgets = ls<Budget[]>("finyk_budgets", []);
      const idx = budgets.findIndex(
        (b) => b.type === "limit" && b.categoryId === category_id,
      );
      if (idx >= 0) {
        (budgets[idx] as BudgetLimit).limit = Number(limit);
      } else {
        budgets.push({
          id: `b_${Date.now()}`,
          type: "limit",
          categoryId: category_id,
          limit: Number(limit),
        });
      }
      lsSet("finyk_budgets", budgets);
      const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
      const cat = resolveExpenseCategoryMeta(category_id, customC);
      return `Ліміт ${cat?.label || category_id} встановлено: ${limit} грн`;
    }
    case "set_monthly_plan": {
      const { income, expense, savings } = (action as SetMonthlyPlanAction)
        .input;
      const cur = ls<MonthlyPlan>("finyk_monthly_plan", {});
      const next: MonthlyPlan = { ...cur };
      if (income != null && income !== "") next.income = String(income);
      if (expense != null && expense !== "") next.expense = String(expense);
      if (savings != null && savings !== "") next.savings = String(savings);
      lsSet("finyk_monthly_plan", next);
      return `Фінплан місяця оновлено: дохід ${next.income ?? "—"} / витрати ${next.expense ?? "—"} / заощадження ${next.savings ?? "—"} грн/міс`;
    }
    case "create_transaction": {
      const { type, amount, category, description, date } = (
        action as CreateTransactionAction
      ).input;
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
          const current = ls<Array<{ id: string }>>(
            "finyk_manual_expenses_v1",
            [],
          );
          const next = current.filter((tx) => tx.id !== manualId);
          if (next.length !== current.length) {
            lsSet("finyk_manual_expenses_v1", next);
          }
        },
      };
    }
    case "delete_transaction": {
      const { tx_id } = (action as DeleteTransactionAction).input;
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
    case "update_budget": {
      const input = (action as UpdateBudgetAction).input;
      const scope = input.scope;
      const budgets = ls<Budget[]>("finyk_budgets", []);
      if (scope === "limit") {
        const categoryId = String(input.category_id || "").trim();
        const limitN = Number(input.limit);
        if (!categoryId) return "Для scope='limit' потрібен category_id.";
        if (!Number.isFinite(limitN) || limitN <= 0)
          return "Для scope='limit' потрібен додатний limit.";
        const idx = budgets.findIndex(
          (b) => b.type === "limit" && b.categoryId === categoryId,
        );
        if (idx >= 0) {
          (budgets[idx] as BudgetLimit).limit = limitN;
        } else {
          budgets.push({
            id: `b_${Date.now()}`,
            type: "limit",
            categoryId,
            limit: limitN,
          });
        }
        lsSet("finyk_budgets", budgets);
        const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
        const cat = resolveExpenseCategoryMeta(categoryId, customC);
        return `Ліміт ${cat?.label || categoryId} оновлено: ${limitN} грн`;
      }
      if (scope === "goal") {
        const goalName = String(input.name || "").trim();
        const target = Number(input.target_amount);
        if (!goalName) return "Для scope='goal' потрібне name.";
        if (!Number.isFinite(target) || target <= 0)
          return "Для scope='goal' потрібен додатний target_amount.";
        const saved =
          input.saved_amount != null &&
          Number.isFinite(Number(input.saved_amount))
            ? Number(input.saved_amount)
            : 0;
        const idx = budgets.findIndex(
          (b) =>
            b.type === "goal" &&
            (b as BudgetGoal).name.trim().toLowerCase() ===
              goalName.toLowerCase(),
        );
        if (idx >= 0) {
          const g = budgets[idx] as BudgetGoal;
          g.targetAmount = target;
          g.savedAmount = saved;
          g.name = goalName;
        } else {
          budgets.push({
            id: `b_${Date.now()}`,
            type: "goal",
            name: goalName,
            targetAmount: target,
            savedAmount: saved,
          });
        }
        lsSet("finyk_budgets", budgets);
        return `Ціль "${goalName}" оновлено: ${saved}/${target} грн`;
      }
      return "Невідомий scope для update_budget (очікую 'limit' або 'goal').";
    }
    case "mark_debt_paid": {
      const { debt_id, amount, note } = (action as MarkDebtPaidAction).input;
      const id = String(debt_id || "").trim();
      if (!id) return "Потрібен debt_id.";
      const debts = ls<Debt[]>("finyk_debts", []);
      const idx = debts.findIndex((d) => d.id === id);
      if (idx < 0) return `Борг ${id} не знайдено.`;
      const debt = { ...debts[idx] };
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
      manualExpenses.unshift({
        id: txId,
        date: new Date().toISOString(),
        description: (note && String(note).trim()) || `Погашення: ${debt.name}`,
        amount: payAmount,
        category: "",
        type: "expense",
      });
      lsSet("finyk_manual_expenses_v1", manualExpenses);
      debt.linkedTxIds = [...(debt.linkedTxIds || []), txId];
      const prevPaid = debt.linkedTxIds
        .filter((lid) => lid !== txId)
        .reduce((sum, lid) => {
          const linked = manualExpenses.find(
            (e: { id: string }) => e.id === lid,
          );
          return sum + (linked ? Math.abs(Number(linked.amount) || 0) : 0);
        }, 0);
      const totalPaid = prevPaid + payAmount;
      const closed = totalPaid >= Number(debt.totalAmount);
      if (closed) {
        debts.splice(idx, 1);
      } else {
        debts[idx] = debt;
      }
      lsSet("finyk_debts", debts);
      return `Погашено ${payAmount} грн з "${debt.name}"${closed ? " — борг закрито" : ""} (tx:${txId})`;
    }
    case "add_asset": {
      const { name, amount, currency } = (action as AddAssetAction).input;
      const trimmed = (name || "").trim();
      const amt = Number(amount);
      if (!trimmed) return "Потрібна назва активу.";
      if (!Number.isFinite(amt) || amt <= 0)
        return "Сума активу має бути додатною.";
      const cur =
        (currency && String(currency).trim().slice(0, 3).toUpperCase()) ||
        "UAH";
      type AssetEntry = {
        name: string;
        amount: number | string;
        currency?: string;
      };
      const prevAssets = ls<AssetEntry[]>("finyk_assets", []);
      const newEntry: AssetEntry = {
        name: trimmed,
        amount: amt,
        currency: cur,
      };
      lsSet("finyk_assets", [...prevAssets, newEntry]);
      // У `finyk_assets` немає id-поля; тримаємо посилання на щойно
      // додану entry (referential equality в pure-JS після lsSet не
      // тримається, тож порівнюємо за повним shape). Undo прибирає
      // _одну_ перший попавшийся matching item з кінця — досить для
      // human-rate-у undo (5 c вікно), без переписання снапшоту.
      return {
        result: `Актив "${trimmed}" додано: ${amt} ${cur}`,
        undo: () => {
          const list = ls<AssetEntry[]>("finyk_assets", []);
          for (let i = list.length - 1; i >= 0; i--) {
            const e = list[i];
            if (
              e.name === newEntry.name &&
              Number(e.amount) === Number(newEntry.amount) &&
              (e.currency || "UAH") === (newEntry.currency || "UAH")
            ) {
              const next = list.slice();
              next.splice(i, 1);
              lsSet("finyk_assets", next);
              return;
            }
          }
        },
      };
    }
    case "import_monobank_range": {
      const { from, to } = (action as ImportMonobankRangeAction).input;
      const fromStr = String(from || "").trim();
      const toStr = String(to || "").trim();
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(fromStr) || !dateRe.test(toStr))
        return "Дати мають бути у форматі YYYY-MM-DD.";
      const fromD = new Date(`${fromStr}T00:00:00`);
      const toD = new Date(`${toStr}T00:00:00`);
      if (
        !Number.isFinite(fromD.getTime()) ||
        !Number.isFinite(toD.getTime()) ||
        fromD > toD
      ) {
        return "Некоректний діапазон дат.";
      }
      const clearedMonths: string[] = [];
      const cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
      const end = new Date(toD.getFullYear(), toD.getMonth(), 1);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m0 = cur.getMonth();
        try {
          safeRemoveLS(`finyk_tx_cache_${y}_${m0}`);
        } catch {}
        clearedMonths.push(`${y}-${String(m0 + 1).padStart(2, "0")}`);
        cur.setMonth(cur.getMonth() + 1);
      }
      try {
        if (
          typeof window !== "undefined" &&
          typeof CustomEvent === "function"
        ) {
          window.dispatchEvent(
            new CustomEvent("hub:finyk-mono-import-range", {
              detail: { from: fromStr, to: toStr },
            }),
          );
        }
      } catch {}
      return `Запит на оновлення Монобанку з ${fromStr} до ${toStr} прийнято. Очищено кеш за ${clearedMonths.length} міс. (${clearedMonths.join(", ")}). Оновиться при відкритті Фініка.`;
    }
    case "split_transaction": {
      const { tx_id, parts: splitParts } = (action as SplitTransactionAction)
        .input;
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
    case "recurring_expense": {
      const { name, amount, day_of_month, category } = (
        action as RecurringExpenseAction
      ).input;
      const trimmed = (name || "").trim();
      if (!trimmed) return "Потрібна назва платежу.";
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return "Сума має бути додатною.";
      const day = Number(day_of_month);
      const dayN = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
      const subs = ls<
        Array<{
          id: string;
          name: string;
          amount?: number;
          dayOfMonth?: number;
          category?: string;
        }>
      >("finyk_subs", []);
      const newSub = {
        id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed,
        amount: amt,
        dayOfMonth: dayN,
        category: category?.trim() || "",
      };
      subs.push(newSub);
      lsSet("finyk_subs", subs);
      return `Підписку "${trimmed}" створено: ${amt} грн, ${dayN}-го числа (id:${newSub.id})`;
    }
    case "export_report": {
      const { period, from, to } = (action as ExportReportAction).input || {};
      const now = new Date();
      let fromDate: Date;
      let toDate = now;
      if (period === "week") {
        fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - 7);
      } else if (period === "custom" && from && to) {
        fromDate = new Date(`${from}T00:00:00`);
        toDate = new Date(`${to}T23:59:59`);
      } else {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      const fromTs = fromDate.getTime();
      const toTs = toDate.getTime();
      const txCache = ls<{
        txs?: Array<{
          id: string;
          amount: number;
          description?: string;
          mcc?: number;
          time?: number;
        }>;
      } | null>("finyk_tx_cache", null);
      const reportSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
      const txs = (txCache?.txs || []).filter((t) => {
        const ts = (t.time || 0) * 1000;
        return ts >= fromTs && ts <= toTs;
      });
      const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
      const filtered = txs.filter((t) => !hiddenTxIds.includes(t.id));
      const expenses = filtered.filter((t) => t.amount < 0);
      const income = filtered.filter((t) => t.amount > 0);
      const totalExpense = expenses.reduce(
        (s, t) => s + getTxStatAmount(t, reportSplits),
        0,
      );
      const totalIncome = income.reduce((s, t) => s + t.amount / 100, 0);
      const fromStr = fromDate.toLocaleDateString("uk-UA");
      const toStr = toDate.toLocaleDateString("uk-UA");
      return [
        `Звіт за ${fromStr} — ${toStr}:`,
        `Дохід: ${Math.round(totalIncome)} грн`,
        `Витрати: ${Math.round(totalExpense)} грн`,
        `Баланс: ${Math.round(totalIncome - totalExpense)} грн`,
        `Транзакцій: ${filtered.length} (витрат: ${expenses.length}, доходів: ${income.length})`,
      ].join("\n");
    }
    // ── Рутина v2 ──────────────────────────────────────────────
    default:
      return undefined;
  }
}
