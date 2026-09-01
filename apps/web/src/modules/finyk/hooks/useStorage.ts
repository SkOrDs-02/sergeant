import { buildFinykExcludedTxIds } from "@sergeant/finyk-domain";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { writeJSON } from "../lib/finykStorage";
import { toLocalISODate } from "@sergeant/shared";
import { useFinykStorageSlots } from "./useFinykStorageSlots";
import { useFinykStorageMutations } from "./useFinykStorageMutations";
import { useFinykBackupSync } from "./useFinykBackupSync";
import { useFinykDualWriteBoot } from "./useFinykDualWriteBoot";
import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import { useFinykSqliteReadBoot } from "./useFinykSqliteReadBoot";
import { useFinykMonoMirrorBoot } from "./useFinykMonoMirrorBoot";

// Public type re-exports — стабільний import path для зовнішніх consumer-ів
// (`AssetsForm.tsx`, `Overview.tsx`, тощо). Декомпозиція внутрішнього коду
// initiative-0001 не повинна ламати модулі поза `hooks/`.
export type {
  Subscription,
  ManualAsset,
  Budget,
  CustomCategory,
  ManualExpense,
  MonthlyPlan,
  NetworthEntry,
  RecurringCandidate,
} from "./useStorage.types";

/**
 * Finyk-storage hook — composition root.
 *
 * Внутрішньо складається з трьох незалежних шарів:
 *   - `useFinykStorageSlots`  — реєструє всі persisted slot-и (`usePersist`)
 *     і повертає bundle із значеннями + setter-ами.
 *   - `useFinykStorageMutations` — мутаційні методи (toggle/add/remove/
 *     update). Чисті по відношенню до React state — лише setters з slots.
 *   - `useFinykBackupSync` — експорт/імпорт JSON, sync-URL.
 *
 * Публічний контракт повертає обʼєкт із плоскою формою — як до
 * декомпозиції — щоб `FinykApp.tsx` і `core/settings/FinykSection.tsx`
 * не змінювалися (initiative 0001 — module decomposition).
 */
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
  const slots = useFinykStorageSlots();
  const mutations = useFinykStorageMutations(slots);
  const backupSync = useFinykBackupSync(slots, toast);

  // Mirror every slot mutation into SQLite (best-effort). `FinykBootGate`
  // in `RootLayout` installs the same context app-wide so the hub AI
  // assistant can mirror chat-action writes even when the Finyk screen
  // isn't mounted — but that gate is `user || isDemoActive()`, so for an
  // anonymous visitor it renders nothing and `useFinykDualWriteSync`
  // stays a permanent no-op (`triggerFinykDualWrite` short-circuits on
  // an unregistered context). Booting here too is what Routine
  // (`useRoutineAppState`), Fizruk (`FizrukApp`) and Nutrition
  // (`NutritionApp`) already do; without it every expense an anonymous
  // visitor adds lives in the warm cache only and dies on reload —
  // measured 2026-08-06, see
  // `docs/90-work/planning/specs/anonymous-local-first-persistence.md`.
  // Re-registration is idempotent: both call sites build an equivalent
  // context and teardown only clears its own.
  useFinykDualWriteBoot();
  useFinykDualWriteSync(slots);

  // Stage 4 PR #037 — boot the SQLite read overlay (idempotent, only
  // when `feature.finyk.sqlite_v2.read_sqlite` is on). The overlay
  // itself lives inside `useFinykStorageSlots` above so the slot
  // values returned to consumers reflect the SQLite cache once it
  // warms; LS reads stay as a synchronous first-paint fallback.
  useFinykSqliteReadBoot();
  // PR #038 — boot the Mono cache mirror so `useMonobankWebhook` can
  // overlay reads from the local `finyk_mono_*` tables before the
  // first network fetch lands.
  useFinykMonoMirrorBoot();

  const {
    hiddenAccounts,
    setHiddenAccounts,
    budgets,
    setBudgets,
    subscriptions,
    setSubscriptions,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    hiddenTxIds,
    monthlyPlan,
    setMonthlyPlan,
    txCategories,
    txNotes,
    txSplits,
    monoDebtLinkedTxIds,
    networthHistory,
    setNetworthHistory,
    customCategories,
    excludedStatTxIds,
    manualExpenses,
    setManualExpenses,
    dismissedRecurring,
    showBalance,
    setShowBalance,
    networthSnapshotRef,
  } = slots;

  // ID транзакцій привʼязаних до пасивів — для відстеження погашення в Assets
  // НЕ виключаємо зі статистики, щоб вони відображались у категорії "Борги та кредити"
  const debtLinkedTxIds = new Set<string>([
    ...manualDebts.flatMap((d) => d.linkedTxIds || []),
    ...Object.values(monoDebtLinkedTxIds).flat(),
  ]);

  // Зі статистики виключаємо: приховані, внутрішні перекази, дебіторку (щоб
  // повернення боргу не рахувалось як дохід) та явно виключені.
  //
  // AI-CONTEXT: `transactions` тут — ручні/імпортовані записи, бо тільки вони
  // несуть мітку переказу в самому записі (`category: "internal_transfer"`);
  // банківські транзакції позначаються через мапу `txCategories`. Без цього
  // аргументу ручний переказ рахувався витратою скрізь, крім дайджесту й коуча.
  const excludedTxIds = buildFinykExcludedTxIds({
    hiddenTxIds,
    txCategories,
    receivables,
    excludedStatTxIds,
    transactions: manualExpenses.map(manualExpenseToTransaction),
  });

  const saveNetworthSnapshot = (networth: number) => {
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
    // §1.9: `today` above is already the Kyiv day key ("YYYY-MM-DD") — slice
    // it instead of re-deriving the month from the host clock, which drifted
    // a month at the Kyiv midnight boundary on non-Kyiv devices.
    const key = today.slice(0, 7);
    setNetworthHistory((prev) => {
      const filtered = prev.filter((s) => s.month !== key);
      return [...filtered, { month: key, networth: rounded }]
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12);
    });
  };

  return {
    hiddenAccounts,
    setHiddenAccounts,
    toggleHideAccount: mutations.toggleHideAccount,
    budgets,
    setBudgets,
    subscriptions,
    setSubscriptions,
    updateSubscription: mutations.updateSubscription,
    addSubscriptionFromRecurring: mutations.addSubscriptionFromRecurring,
    dismissedRecurring,
    dismissRecurring: mutations.dismissRecurring,
    restoreDismissedRecurring: mutations.restoreDismissedRecurring,
    manualAssets,
    setManualAssets,
    manualDebts,
    setManualDebts,
    receivables,
    setReceivables,
    monthlyPlan,
    setMonthlyPlan,
    setLinkedTxRole: mutations.setLinkedTxRole,
    hiddenTxIds,
    hideTx: mutations.hideTx,
    exportData: backupSync.exportData,
    importData: backupSync.importData,
    generateSyncLink: backupSync.generateSyncLink,
    loadFromUrl: backupSync.loadFromUrl,
    excludedTxIds,
    debtTxIds: debtLinkedTxIds, // зворотна сумісність
    txCategories,
    customCategories,
    addCustomCategory: mutations.addCustomCategory,
    editCustomCategory: mutations.editCustomCategory,
    removeCustomCategory: mutations.removeCustomCategory,
    overrideCategory: mutations.overrideCategory,
    txNotes,
    setTxNote: mutations.setTxNote,
    txSplits,
    setSplitTx: mutations.setSplitTx,
    monoDebtLinkedTxIds,
    toggleMonoDebtTx: mutations.toggleMonoDebtTx,
    debtLinkedTxIds,
    networthHistory,
    saveNetworthSnapshot,
    excludedStatTxIds,
    toggleExcludeFromStats: mutations.toggleExcludeFromStats,
    manualExpenses,
    setManualExpenses,
    addManualExpense: mutations.addManualExpense,
    restoreManualExpense: mutations.restoreManualExpense,
    editManualExpense: mutations.editManualExpense,
    removeManualExpense: mutations.removeManualExpense,
    showBalance,
    setShowBalance,
  };
}
