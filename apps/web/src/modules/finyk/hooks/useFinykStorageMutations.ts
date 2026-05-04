import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import {
  safeReadStringLS,
  safeWriteLS,
} from "../../../shared/lib/storage/storage";
import type {
  Subscription,
  RecurringCandidate,
  CustomCategory,
  ManualExpense,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
} from "./useStorage.types";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

/**
 * Усі мутаційні методи Finyk-storage. Чисті по відношенню до React-стану:
 * приймають bundle сетерів зі `useFinykStorageSlots` і повертають closures,
 * які роблять мутацію.
 *
 * Окремий файл, бо `useStorage()` сам по собі складається з трьох
 * незалежних шарів — slots / mutations / backup-sync — і кожен з них
 * можна тестувати, перейменовувати чи декомпонувати самостійно
 * (initiative 0001 — module decomposition).
 */
export function useFinykStorageMutations(slots: FinykStorageSlots) {
  const {
    setBudgets,
    setSubscriptions,
    setManualDebts,
    setReceivables,
    setHiddenAccounts,
    setHiddenTxIds,
    setTxCategories,
    setTxSplits,
    setMonoDebtLinkedTxIds,
    setCustomCategories,
    setManualExpenses,
    setExcludedStatTxIds,
    setDismissedRecurring,
  } = slots;

  const addManualExpense = (
    expense: Partial<ManualExpense> & { id?: unknown },
  ) => {
    const entry: ManualExpense = {
      id: expense?.id != null ? String(expense.id) : Date.now().toString(),
      date: expense.date || new Date().toISOString(),
      description: expense.description || "",
      amount: Number(expense.amount) || 0,
      category: expense.category || "інше",
    };
    setManualExpenses((prev) => [entry, ...prev]);
    // Product analytics: payload intentionally minimal (category + flag
    // whether a custom description was provided) — no amounts, no text.
    trackEvent(ANALYTICS_EVENTS.EXPENSE_ADDED, {
      category: entry.category,
      hasDescription: Boolean(entry.description),
      source: "manual",
    });
    // Activation funnel: fire once for the user's first-ever manual
    // expense, keyed by a localStorage flag so seeded demo data doesn't
    // count and so re-adds don't re-fire. `safeReadStringLS`/`safeWriteLS`
    // swallow storage errors (locked-down private modes, quota), so we
    // do not need a wrapping try/catch.
    if (!safeReadStringLS("finyk_first_expense_seen_v1")) {
      safeWriteLS("finyk_first_expense_seen_v1", "1");
      trackEvent(ANALYTICS_EVENTS.FIRST_EXPENSE_ADDED, {
        category: entry.category,
      });
    }
    return entry;
  };

  const removeManualExpense = (id: string) => {
    setManualExpenses((prev) => prev.filter((e) => e.id !== id));
    trackEvent(ANALYTICS_EVENTS.EXPENSE_DELETED, { source: "manual" });
  };

  const editManualExpense = (
    id: string,
    patch: Partial<ManualExpense> | null | undefined,
  ) => {
    const pid = String(id);
    setManualExpenses((prev) =>
      (prev || []).map((e) => {
        if (String(e.id) !== pid) return e;
        const next = { ...e };
        if (patch?.date) next.date = String(patch.date);
        if (patch?.description != null)
          next.description = String(patch.description || "");
        if (patch?.category != null)
          next.category = String(patch.category || "інше");
        if (patch?.amount != null) next.amount = Number(patch.amount) || 0;
        return next;
      }),
    );
  };

  const toggleHideAccount = (id: string) =>
    setHiddenAccounts((h) =>
      h.includes(id) ? h.filter((x) => x !== id) : [...h, id],
    );

  const toggleMonoDebtTx = (accountId: string, txId: string) => {
    setMonoDebtLinkedTxIds((prev) => {
      const linked = prev[accountId] || [];
      return {
        ...prev,
        [accountId]: linked.includes(txId)
          ? linked.filter((x) => x !== txId)
          : [...linked, txId],
      };
    });
  };

  const toggleLinkedTx = (
    id: string,
    txId: string,
    type: "debt" | "receivable",
  ) => {
    if (type === "debt") {
      setManualDebts((items) =>
        items.map((d) => {
          if (d.id !== id) return d;
          const linked = d.linkedTxIds || [];
          return {
            ...d,
            linkedTxIds: linked.includes(txId)
              ? linked.filter((x) => x !== txId)
              : [...linked, txId],
          };
        }),
      );
    } else {
      setReceivables((items) =>
        items.map((r) => {
          if (r.id !== id) return r;
          const linked = r.linkedTxIds || [];
          return {
            ...r,
            linkedTxIds: linked.includes(txId)
              ? linked.filter((x) => x !== txId)
              : [...linked, txId],
          };
        }),
      );
    }
  };

  const hideTx = (id: string) =>
    setHiddenTxIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );

  const toggleExcludeFromStats = (id: string) =>
    setExcludedStatTxIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );

  const setSplitTx = (txId: string, splits: TxSplit[] | null | undefined) => {
    setTxSplits((prev: TxSplitsMap) =>
      splits && splits.length >= 2
        ? { ...prev, [txId]: splits }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== txId)),
    );
  };

  const dismissRecurring = (key: string) => {
    const trimmed = String(key || "").trim();
    if (!trimmed) return;
    setDismissedRecurring((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed],
    );
  };

  const restoreDismissedRecurring = (key: string | null | undefined) => {
    if (!key) {
      setDismissedRecurring([]);
      return;
    }
    setDismissedRecurring((prev) => prev.filter((k) => k !== key));
  };

  /**
   * Створити підписку з кандидата автодетекції. Повертає новий sub.
   * @param {object} candidate — елемент з detectRecurring(...)
   */
  const addSubscriptionFromRecurring = (
    candidate: RecurringCandidate | null | undefined,
  ) => {
    if (!candidate || !candidate.key) return null;
    const id = `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const sub: {
      id: string;
      name: string;
      emoji: string;
      keyword: string;
      billingDay: number;
      currency: string;
      linkedTxId?: string;
    } = {
      id,
      name: candidate.displayName || candidate.key,
      emoji: "🔄",
      keyword: candidate.key,
      billingDay: candidate.billingDay || 1,
      currency: candidate.currency === "USD" ? "USD" : "UAH",
    };
    if (candidate.sampleTxIds && candidate.sampleTxIds[0]) {
      sub.linkedTxId = candidate.sampleTxIds[0];
    }
    setSubscriptions((prev) => [...prev, sub]);
    // Автоматично прибираємо з пропозицій — sub з таким keyword уже його покриває,
    // але ключ лишиться в localStorage як запасна страховка.
    dismissRecurring(candidate.key);
    notifyFinykRoutineCalendarSync();
    return sub;
  };

  const updateSubscription = (
    subId: string,
    patch: Record<string, unknown>,
  ) => {
    setSubscriptions((subs) =>
      subs.map((s) => {
        if (s.id !== subId) return s;
        const next: Subscription = { ...s };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined) delete next[k];
          else next[k] = v;
        }
        return next;
      }),
    );
    notifyFinykRoutineCalendarSync();
  };

  const overrideCategory = (txId: string, catId: string | null | undefined) => {
    setTxCategories((prev: TxCategoriesMap) =>
      catId
        ? { ...prev, [txId]: catId }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== txId)),
    );
  };

  const addCustomCategory = (
    label: string,
    {
      color,
      icon,
      parentId,
    }: { color?: string; icon?: string; parentId?: string } = {},
  ) => {
    const trimmed = String(label || "").trim();
    if (!trimmed || trimmed.length > 80) return;
    setCustomCategories((prev) => {
      if (prev.length >= 80) return prev;
      if (prev.some((c) => c.label.toLowerCase() === trimmed.toLowerCase()))
        return prev;
      const id = `cus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      const entry: {
        id: string;
        label: string;
        color?: string;
        icon?: string;
        parentId?: string;
      } = { id, label: trimmed };
      if (color) entry.color = color;
      if (icon) entry.icon = icon;
      if (parentId) entry.parentId = parentId;
      return [...prev, entry];
    });
  };

  const editCustomCategory = (id: string, patch: Partial<CustomCategory>) => {
    setCustomCategories((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c };
        if (patch.label != null)
          next.label = String(patch.label).trim() || c.label;
        if (patch.color !== undefined) next.color = patch.color || undefined;
        if (patch.icon !== undefined) next.icon = patch.icon || undefined;
        if (patch.parentId !== undefined)
          next.parentId = patch.parentId || undefined;
        return next;
      }),
    );
  };

  const removeCustomCategory = (id: string) => {
    setCustomCategories((prev) => prev.filter((c) => c.id !== id));
    setTxCategories((prev: TxCategoriesMap) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === id) delete next[k];
      }
      return next;
    });
    setTxSplits((prev: TxSplitsMap) => {
      const out: TxSplitsMap = { ...prev };
      for (const txId of Object.keys(out)) {
        const splits = out[txId];
        if (!Array.isArray(splits)) continue;
        const nextSplits: TxSplit[] = splits.map((s) =>
          s.categoryId === id ? { ...s, categoryId: "other" } : s,
        );
        const multi = nextSplits.filter(
          (s) => s.categoryId && (Number(s.amount) || 0) > 0,
        );
        if (multi.length >= 2) out[txId] = nextSplits;
        else delete out[txId];
      }
      return out;
    });
    setBudgets((bs) =>
      bs.filter((b) => b.type !== "limit" || b.categoryId !== id),
    );
  };

  return {
    addManualExpense,
    removeManualExpense,
    editManualExpense,
    toggleHideAccount,
    toggleMonoDebtTx,
    toggleLinkedTx,
    hideTx,
    toggleExcludeFromStats,
    setSplitTx,
    dismissRecurring,
    restoreDismissedRecurring,
    addSubscriptionFromRecurring,
    updateSubscription,
    overrideCategory,
    addCustomCategory,
    editCustomCategory,
    removeCustomCategory,
  };
}
