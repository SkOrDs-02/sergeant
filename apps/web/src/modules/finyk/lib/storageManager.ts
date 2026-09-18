import { storageManager as baseStorageManager } from "@shared/lib/storage/storageManager";
import {
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";

baseStorageManager.register({
  id: "finyk_002_rename_finto_user_data",
  description:
    'Rename localStorage keys from "finto_*" to "finyk_*" for user data.',
  up() {
    for (const [oldKey, newKey] of [
      ["finto_hidden", "finyk_hidden"],
      ["finto_budgets", "finyk_budgets"],
      ["finto_subs", "finyk_subs"],
      ["finto_assets", "finyk_assets"],
      ["finto_debts", "finyk_debts"],
      ["finto_recv", "finyk_recv"],
      ["finto_hidden_txs", "finyk_hidden_txs"],
      ["finto_monthly_plan", "finyk_monthly_plan"],
      ["finto_tx_cats", "finyk_tx_cats"],
      ["finto_mono_debt_linked", "finyk_mono_debt_linked"],
      ["finto_networth_history", "finyk_networth_history"],
      ["finto_tx_splits", "finyk_tx_splits"],
    ] as const) {
      const old = safeReadStringLS(oldKey);
      if (old === null) continue;
      if (safeReadStringLS(newKey) === null) {
        safeWriteLS(newKey, old);
      }
      safeRemoveLS(oldKey);
    }
  },
});

export const finykStorageManager = baseStorageManager;
