import { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_SUBSCRIPTIONS, INTERNAL_TRANSFER_ID } from "../constants";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import {
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
  FINYK_BACKUP_VERSION,
  type FinykBackup,
} from "../lib/finykBackup";
import type {
  Debt,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { downloadJson, toLocalISODate } from "@sergeant/shared";
import {
  readJSON,
  writeJSON,
  writeJSONDebounced,
  finykStorageManager,
} from "../lib/finykStorage";

export type Subscription = {
  id: string;
  name: string;
  emoji: string;
  keyword: string;
  billingDay: number;
  currency: string;
  linkedTxId?: string;
  [extra: string]: unknown;
};
type RecurringCandidate = {
  key: string;
  displayName?: string;
  billingDay?: number;
  currency?: string;
  sampleTxIds?: string[];
};
type Budget = {
  id: string;
  type?: "limit" | "goal";
  categoryId?: string;
  [extra: string]: unknown;
};
export type ManualAsset = {
  id: string;
  amount: number;
  emoji?: string;
  name?: string;
  currency?: string;
  linkedTxIds?: string[];
  [extra: string]: unknown;
};
type ManualExpense = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
};
type CustomCategory = {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  parentId?: string;
};
type TxCategoriesMap = Record<string, string | undefined>;
type MonoDebtLinkedMap = Record<string, string[]>;
type MonthlyPlan = {
  income: string | number;
  expense: string | number;
  savings: string | number;
};
type NetworthEntry = { month: string; networth: number };

function reportSilentError(scope: string, error: unknown) {
  console.warn(`[finyk] ${scope}`, error);
}

try {
  finykStorageManager.runAll();
} catch (error) {
  reportSilentError("storage migrations", error);
}
// Визначаємо "очікувану форму" за дефолтом: array / plain-object / скаляр.
// Це дозволяє тихо відкинути пошкоджений JSON у localStorage (наприклад,
// коли ключ випадково був перезаписаний іншим модулем або ручною правкою)
// і ввімкнути модуль з дефолтом, замість того щоб падати на мапах/фільтрах.
function matchesShape(value: unknown, defaultVal: unknown): boolean {
  if (Array.isArray(defaultVal)) return Array.isArray(value);
  if (defaultVal && typeof defaultVal === "object") {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
  return true;
}

function usePersist<T>(
  key: string,
  defaultVal: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    const stored = readJSON(key, defaultVal);
    if (!matchesShape(stored, defaultVal)) {
      reportSilentError(`usePersist shape mismatch ("${key}")`, stored);
      return defaultVal;
    }
    return stored as T;
  });
  useEffect(() => {
    writeJSONDebounced(key, val);
  }, [key, val]);
  return [val, setVal];
}

export function useStorage({
  toast,
}: {
  /**
   * Shared toast API used for import feedback. Using the full API (not a
   * `(msg, type) => void` adapter) keeps `warning`/`info`/`action` variants
   * available — Finyk's storage flow only needs `success`/`error` today,
   * but other callers can adopt the same hook without a new signature.
   */
  toast?: {
    success: (msg: string) => number;
    error: (msg: string) => number;
  };
} = {}) {
  const defaultMonthlyPlan: MonthlyPlan = {
    income: "",
    expense: "",
    savings: "",
  };
  const [hiddenAccounts, setHiddenAccounts] = usePersist<string[]>(
    "finyk_hidden",
    [],
  );
  const [budgets, setBudgets] = usePersist<Budget[]>("finyk_budgets", []);
  const [subscriptions, setSubscriptions] = usePersist<Subscription[]>(
    "finyk_subs",
    DEFAULT_SUBSCRIPTIONS as Subscription[],
  );
  const [manualAssets, setManualAssets] = usePersist<ManualAsset[]>(
    "finyk_assets",
    [],
  );
  const [manualDebts, setManualDebts] = usePersist<Debt[]>("finyk_debts", []);
  const [receivables, setReceivables] = usePersist<Receivable[]>(
    "finyk_recv",
    [],
  );
  const [hiddenTxIds, setHiddenTxIds] = usePersist<string[]>(
    "finyk_hidden_txs",
    [],
  );
  const [monthlyPlan, setMonthlyPlan] = usePersist<MonthlyPlan>(
    "finyk_monthly_plan",
    defaultMonthlyPlan,
  );
  const [txCategories, setTxCategories] = usePersist<TxCategoriesMap>(
    "finyk_tx_cats",
    {},
  );
  const [monoDebtLinkedTxIds, setMonoDebtLinkedTxIds] =
    usePersist<MonoDebtLinkedMap>("finyk_mono_debt_linked", {});
  const [networthHistory, setNetworthHistory] = usePersist<NetworthEntry[]>(
    "finyk_networth_history",
    [],
  );
  const [txSplits, setTxSplits] = usePersist<TxSplitsMap>(
    "finyk_tx_splits",
    {},
  );
  const [customCategories, setCustomCategories] = usePersist<CustomCategory[]>(
    "finyk_custom_cats_v1",
    [],
  );
  const [manualExpenses, setManualExpenses] = usePersist<ManualExpense[]>(
    "finyk_manual_expenses_v1",
    [],
  );
  const [excludedStatTxIds, setExcludedStatTxIds] = usePersist<string[]>(
    "finyk_excluded_stat_txs",
    [],
  );
  const [dismissedRecurring, setDismissedRecurring] = usePersist<string[]>(
    "finyk_rec_dismissed",
    [],
  );
  type NetworthSnap = { date: string | null; value: number | null };
  const networthSnapshotRef = useRef<NetworthSnap>(
    readJSON<NetworthSnap>("finyk_networth_last_snap", {
      date: null,
      value: null,
    }) ?? { date: null, value: null },
  );

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
    // count and so re-adds don't re-fire. Wrapped in try/catch because
    // storage can throw in locked-down private modes.
    try {
      if (!localStorage.getItem("finyk_first_expense_seen_v1")) {
        localStorage.setItem("finyk_first_expense_seen_v1", "1");
        trackEvent(ANALYTICS_EVENTS.FIRST_EXPENSE_ADDED, {
          category: entry.category,
        });
      }
    } catch {
      /* noop */
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
    setTxSplits((prev) =>
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
    setTxCategories((prev) =>
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
    setTxCategories((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === id) delete next[k];
      }
      return next;
    });
    setTxSplits((prev) => {
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

  const applyData = (data: FinykBackup) => {
    if (data.budgets) setBudgets(data.budgets as Budget[]);
    if (data.subscriptions)
      setSubscriptions(data.subscriptions as Subscription[]);
    if (data.manualAssets) setManualAssets(data.manualAssets as ManualAsset[]);
    if (data.manualDebts) setManualDebts(data.manualDebts as Debt[]);
    if (data.receivables) setReceivables(data.receivables as Receivable[]);
    if (data.hiddenAccounts) setHiddenAccounts(data.hiddenAccounts as string[]);
    if (data.hiddenTxIds) setHiddenTxIds(data.hiddenTxIds as string[]);
    if (data.monthlyPlan) setMonthlyPlan(data.monthlyPlan as MonthlyPlan);
    if (data.txCategories)
      setTxCategories(data.txCategories as TxCategoriesMap);
    if (data.txSplits) setTxSplits(data.txSplits as TxSplitsMap);
    if (data.monoDebtLinkedTxIds)
      setMonoDebtLinkedTxIds(data.monoDebtLinkedTxIds as MonoDebtLinkedMap);
    if (data.networthHistory)
      setNetworthHistory(data.networthHistory as NetworthEntry[]);
    if (data.customCategories)
      setCustomCategories(data.customCategories as CustomCategory[]);
    if (data.dismissedRecurring)
      setDismissedRecurring(data.dismissedRecurring as string[]);
    notifyFinykRoutineCalendarSync();
  };

  const exportData = async () => {
    const data = {
      version: FINYK_BACKUP_VERSION,
      budgets,
      subscriptions,
      manualAssets,
      manualDebts,
      receivables,
      hiddenAccounts,
      hiddenTxIds,
      monthlyPlan,
      txCategories,
      txSplits,
      monoDebtLinkedTxIds,
      networthHistory,
      customCategories,
      dismissedRecurring,
    };
    await downloadJson(`finyk-backup-${toLocalISODate()}.json`, data);
  };

  /** @returns {Promise<boolean>} */
  const importData = (file: Blob): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target!.result as string);
          const normalized = normalizeFinykBackup(parsed);
          applyData(normalized);
          toast?.success("Дані імпортовано.");
          resolve(true);
        } catch (err) {
          reportSilentError("import data", err);
          const raw =
            err instanceof Error ? err.message : "невірний формат файлу";
          const msg = raw.startsWith("Помилка:") ? raw : `Помилка: ${raw}`;
          toast?.error(msg);
          resolve(false);
        }
      };
      reader.onerror = () => {
        toast?.error("Помилка: не вдалось прочитати файл");
        resolve(false);
      };
      reader.readAsText(file);
    });

  // Sync: без прихованих рахунків/транзакцій (device-specific). v3 — категорії, спліти, борги mono, нетворс.
  const generateSyncLink = () => {
    const data = {
      v: 3,
      b: budgets,
      s: subscriptions,
      a: manualAssets,
      d: manualDebts,
      r: receivables,
      mp: monthlyPlan,
      tc: txCategories,
      ts: txSplits,
      md: monoDebtLinkedTxIds,
      nh: networthHistory,
      cc: customCategories,
      dr: dismissedRecurring,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    return `${window.location.origin}${window.location.pathname}?sync=${encoded}`;
  };

  const loadFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("sync");
      if (!encoded) return false;
      const raw = JSON.parse(decodeURIComponent(atob(encoded)));
      const normalized = normalizeFinykSyncPayload(raw);
      applyData(normalized);
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    } catch (err) {
      reportSilentError("load sync from url", err);
      return false;
    }
  };

  // Транзакції позначені як внутрішній переказ — виключаємо зі статистики
  const transferTxIds = Object.entries(txCategories)
    .filter(([, catId]) => catId === INTERNAL_TRANSFER_ID)
    .map(([txId]) => txId);

  // ID транзакцій прив'язаних до пасивів — для відстеження погашення в Assets
  // НЕ виключаємо зі статистики, щоб вони відображались у категорії "Борги та кредити"
  const debtLinkedTxIds = new Set<string>([
    ...manualDebts.flatMap((d) => d.linkedTxIds || []),
    ...Object.values(monoDebtLinkedTxIds).flat(),
  ]);

  // Зі статистики виключаємо: приховані, внутрішні перекази, дебіторку (щоб повернення боргу не рахувалось як дохід)
  const excludedTxIds = new Set<string>([
    ...hiddenTxIds,
    ...transferTxIds,
    ...receivables.flatMap((r) => r.linkedTxIds || []),
    ...excludedStatTxIds,
  ]);

  return {
    hiddenAccounts,
    setHiddenAccounts,
    toggleHideAccount,
    budgets,
    setBudgets,
    subscriptions,
    setSubscriptions,
    updateSubscription,
    addSubscriptionFromRecurring,
    dismissedRecurring,
    dismissRecurring,
    restoreDismissedRecurring,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    monthlyPlan,
    setMonthlyPlan,
    toggleLinkedTx,
    hiddenTxIds,
    hideTx,
    exportData,
    importData,
    generateSyncLink,
    loadFromUrl,
    excludedTxIds,
    debtTxIds: debtLinkedTxIds, // зворотна сумісність
    txCategories,
    customCategories,
    addCustomCategory,
    editCustomCategory,
    removeCustomCategory,
    overrideCategory,
    txSplits,
    setSplitTx,
    monoDebtLinkedTxIds,
    toggleMonoDebtTx,
    debtLinkedTxIds,
    networthHistory,
    saveNetworthSnapshot: (networth: number) => {
      const today = toLocalISODate();
      const rounded = Math.round(networth);
      const snap = networthSnapshotRef.current;
      if (snap.date === today && snap.value !== null) {
        const changePct =
          snap.value !== 0 ? Math.abs((rounded - snap.value) / snap.value) : 1;
        if (changePct < 0.01) return;
      }
      networthSnapshotRef.current = { date: today, value: rounded };
      writeJSON("finyk_networth_last_snap", { date: today, value: rounded });
      const key = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      setNetworthHistory((prev) => {
        const filtered = prev.filter((s) => s.month !== key);
        return [...filtered, { month: key, networth: rounded }]
          .sort((a, b) => a.month.localeCompare(b.month))
          .slice(-12);
      });
    },
    excludedStatTxIds,
    toggleExcludeFromStats,
    manualExpenses,
    setManualExpenses,
    addManualExpense,
    editManualExpense,
    removeManualExpense,
  };
}
