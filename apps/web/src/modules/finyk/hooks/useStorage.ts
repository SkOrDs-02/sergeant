import { INTERNAL_TRANSFER_ID } from "../constants";
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
 * Публічний контракт повертає об'єкт із плоскою формою — як до
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

  // Stage 4 PR #036 — install dual-write context once auth + flag are
  // available, then mirror every slot mutation into SQLite (best-effort,
  // gated by `feature.finyk.sqlite_v2.dual_write`).
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
    txSplits,
    monoDebtLinkedTxIds,
    networthHistory,
    setNetworthHistory,
    customCategories,
    excludedStatTxIds,
    manualExpenses,
    setManualExpenses,
    dismissedRecurring,
    networthSnapshotRef,
  } = slots;

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
    const key = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
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
    toggleLinkedTx: mutations.toggleLinkedTx,
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
    editManualExpense: mutations.editManualExpense,
    removeManualExpense: mutations.removeManualExpense,
  };
}
