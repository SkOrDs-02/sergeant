import { useQueryClient } from "@tanstack/react-query";
import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { stripCategoryEmoji } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { readSignalContext } from "../../../core/observability/valueSignalAttribution";
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
  TxNotesMap,
  TxSplit,
  TxSplitsMap,
} from "./useStorage.types";
import type { FinykStorageSlots } from "./useFinykStorageSlots";
import type {
  LinkedTxMeta,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";

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
  const queryClient = useQueryClient();
  const {
    setBudgets,
    setSubscriptions,
    setManualDebts,
    setReceivables,
    setHiddenAccounts,
    setHiddenTxIds,
    setTxCategories,
    setTxNotes,
    setTxSplits,
    setMonoDebtLinkedTxIds,
    setCustomCategories,
    manualExpenses,
    setManualExpenses,
    setExcludedStatTxIds,
    setDismissedRecurring,
  } = slots;

  // Manual expenses feed the Hub finyk preview (overview/networth/month
  // aggregates). The mono webhook hook only invalidates this key on bank-tx
  // changes, so a manual add/edit/delete must fan out the same invalidation
  // or the Hub card stays stale until the next bank sync.
  const invalidateFinykPreview = () => {
    void queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
  };

  const addManualExpense = (
    expense: Partial<ManualExpense> & { id?: unknown },
  ) => {
    const isIncome = expense.kind === "income";
    const entry: ManualExpense = {
      id: expense?.id != null ? String(expense.id) : Date.now().toString(),
      // eslint-disable-next-line no-restricted-syntax -- UTC wall-clock fallback for a missing entry date, not a Kyiv day-boundary computation.
      date: expense.date || new Date().toISOString(),
      description: expense.description || "",
      amount: Number(expense.amount) || 0,
      category: expense.category || (isIncome ? "other-income" : "other"),
      kind: isIncome ? "income" : "expense",
    };
    setManualExpenses((prev) => [entry, ...prev]);
    invalidateFinykPreview();
    // Product analytics: payload intentionally minimal (category + flag
    // whether a custom description was provided) — no amounts, no text.
    //
    // Хвиля 2: подія НЕ перейменовується і не дублюється новою — до неї лише
    // дописані поля атрибуції петлі (`after_signal` / `ms_since_signal` /
    // `signal`). Ренейм зламав би наявні дашборди й обірвав історію
    // (`.telemetry/tracking-plan.yaml` § naming_convention).
    trackEvent(
      isIncome ? ANALYTICS_EVENTS.INCOME_ADDED : ANALYTICS_EVENTS.EXPENSE_ADDED,
      {
        category: entry.category,
        hasDescription: Boolean(entry.description),
        source: "manual",
        ...readSignalContext("finyk"),
      },
    );
    // Activation funnel: fire once for the user's first-ever manual
    // EXPENSE (income intentionally excluded — it's a distinct activation
    // hypothesis with no funnel defined yet), keyed by a localStorage flag
    // so seeded demo data doesn't count and re-adds don't re-fire.
    // `safeReadStringLS`/`safeWriteLS` swallow storage errors (locked-down
    // private modes, quota), so we do not need a wrapping try/catch.
    if (!isIncome && !safeReadStringLS("finyk_first_expense_seen_v1")) {
      safeWriteLS("finyk_first_expense_seen_v1", "1");
      trackEvent(ANALYTICS_EVENTS.FIRST_EXPENSE_ADDED, {
        category: entry.category,
      });
    }
    return entry;
  };

  /**
   * Повернути щойно видалену витрату після «Скасувати» в тості.
   *
   * Свідомо НЕ `addManualExpense(snapshot)`: знімок несе старий `id`, і
   * `addManualExpense` без нього згенерує новий. Так undo доїжджає на
   * сервер як звичайний новий запис. У Sentry — `SERGEANT-WEB-Q`.
   *
   * AI-CONTEXT: історично це був обхід серверного правила «видалення
   * остаточне» — операція з тим самим id відхилялась із
   * `reason: "tombstoned"`, тож запис повертався локально й НЕ повертався
   * на сервері. Правило знято (див. `guardUuidPkApply` в
   * `apps/server/src/modules/sync/applySync-helpers.ts`): тепер новіший
   * запис воскрешає рядок за звичайним LWW, і старий id теж доїхав би.
   *
   * Новий id лишаємо навмисно — міняти його назад немає причини: для
   * користувача нічого не змінюється (та сама сума, назва, дата й місце в
   * списку), а поведінка не залежить від того, який сервер за проксі —
   * web і server деплояться окремо, тож старий сервер із чинним правилом
   * ще може відповідати цьому клієнту.
   */
  const restoreManualExpense = (snapshot: Partial<ManualExpense>) => {
    const { id: _discardedId, ...withoutId } = snapshot;
    void _discardedId;
    addManualExpense(withoutId);
  };

  const removeManualExpense = (id: string) => {
    const removed = manualExpenses.find((e) => e.id === id);
    setManualExpenses((prev) => prev.filter((e) => e.id !== id));
    invalidateFinykPreview();
    trackEvent(
      removed?.kind === "income"
        ? ANALYTICS_EVENTS.INCOME_DELETED
        : ANALYTICS_EVENTS.EXPENSE_DELETED,
      { source: "manual" },
    );
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
          next.category = String(patch.category || "other");
        if (patch?.amount != null) next.amount = Number(patch.amount) || 0;
        if (patch?.kind === "income" || patch?.kind === "expense")
          next.kind = patch.kind;
        return next;
      }),
    );
    invalidateFinykPreview();
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

  /**
   * Привʼязати транзакцію з **явною роллю** або зняти привʼязку
   * (`role: null`).
   *
   * AI-CONTEXT: роль і сума зберігаються знімком у `txLinks`, бо (а) роль
   * більше не виводиться зі знаку — це рішення користувача, і (б) сума не
   * має залежати від того, чи потрапила транзакція у поточне вікно
   * завантаження. Деталі семантики — `debtEngine.LinkedTxRole`.
   */
  const setLinkedTxRole = (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH = 0,
  ) => {
    const apply = <T extends { id: string } & Record<string, unknown>>(
      item: T,
    ): T => {
      if (item.id !== id) return item;
      const linked = (item["linkedTxIds"] as string[] | undefined) || [];
      const txLinks = {
        ...((item["txLinks"] as Record<string, LinkedTxMeta> | undefined) ??
          {}),
      };
      if (role === null) {
        delete txLinks[txId];
        return {
          ...item,
          linkedTxIds: linked.filter((x) => x !== txId),
          txLinks,
        };
      }
      txLinks[txId] = { role, amount: Math.abs(amountUAH) };
      return {
        ...item,
        linkedTxIds: linked.includes(txId) ? linked : [...linked, txId],
        txLinks,
      };
    };

    if (type === "debt") {
      setManualDebts((items) => items.map(apply));
    } else {
      setReceivables((items) => items.map(apply));
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
    const id = `auto_${Date.now().toString(36)}_${crypto.randomUUID()}`;
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
      emoji: "",
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

  /** Порожня нотатка = відсутність нотатки — видаляє запис, не зберігає "". */
  const setTxNote = (txId: string, note: string | null | undefined) => {
    const trimmed = String(note ?? "").trim();
    setTxNotes((prev: TxNotesMap) =>
      trimmed
        ? { ...prev, [txId]: trimmed }
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
    // AI-CONTEXT (2026-08-21): підпис нормалізується на ЗАПИСІ, а не на
    // кожному рендері. Вбудовані категорії втратили емодзі-префікси того
    // ж дня, тож власна категорія лишалась єдиним джерелом гліфа в
    // списку — і поверхні розходились: пікер зрізав префікс
    // (`stripLeadingEmoji`), картка ліміту показувала як є. Зріз на
    // вході робить це неможливим для НОВИХ записів; уже збережені
    // нормалізуються на рендері.
    const trimmed = stripCategoryEmoji(String(label || "").trim());
    if (!trimmed || trimmed.length > 80) return;
    setCustomCategories((prev) => {
      if (prev.length >= 80) return prev;
      if (prev.some((c) => c.label.toLowerCase() === trimmed.toLowerCase()))
        return prev;
      const id = `cus_${Date.now().toString(36)}_${crypto.randomUUID()}`;
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
          next.label =
            stripCategoryEmoji(String(patch.label).trim()) || c.label;
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
    restoreManualExpense,
    removeManualExpense,
    editManualExpense,
    toggleHideAccount,
    toggleMonoDebtTx,
    setLinkedTxRole,
    hideTx,
    toggleExcludeFromStats,
    setSplitTx,
    setTxNote,
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
