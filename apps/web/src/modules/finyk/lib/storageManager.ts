import { storageManager as baseStorageManager } from "@shared/lib/storage/storageManager";

const STORAGE_PREFIX = "finyk_";

function key(name: string): string {
  const normalized = String(name || "").trim();
  return normalized.startsWith(STORAGE_PREFIX)
    ? normalized
    : `${STORAGE_PREFIX}${normalized}`;
}

function getJSON<T>(storageKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON(storageKey: string, value: unknown): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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
    ]) {
      try {
        const old = localStorage.getItem(oldKey);
        if (old !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, old);
        }
        if (old !== null) localStorage.removeItem(oldKey);
      } catch {
        /* ignore migration item errors */
      }
    }
  },
});

export const finykStorageManager = {
  ...baseStorageManager,
  key,
  getJSON,
  setJSON,
};
