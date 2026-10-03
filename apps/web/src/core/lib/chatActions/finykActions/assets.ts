// Chat-action executors run outside React. Стан читається з SQLite warm
// cache (`warmFinykCache`), а не з kv (data-08).
import { finykChatWrite } from "./dualWriteBridge";
import { FINYK_COLD_CACHE_MESSAGE, warmFinykCache } from "./warmCache";
import { formatNumberUk } from "@sergeant/shared";
import type { ManualAsset } from "../../../../modules/finyk/hooks/useStorage.types";
import type {
  AddAssetAction,
  RecurringExpenseAction,
  ChatActionResult,
} from "../types";

export function addAsset(action: AddAssetAction): ChatActionResult {
  const { name, amount, currency } = action.input;
  const trimmed = (name || "").trim();
  const amt = Number(amount);
  if (!trimmed) return "Потрібна назва активу.";
  if (!Number.isFinite(amt) || amt <= 0)
    return "Сума активу має бути додатною.";
  const cur =
    (currency && String(currency).trim().slice(0, 3).toUpperCase()) || "UAH";
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const prevAssets = cache.manualAssets;
  // Canonical `finyk_assets` rows are id-keyed (`ManualAsset.id`) — the
  // manual UI's AssetsForm assigns a uuid. Generate a stable id here too
  // so the dual-write upsert targets a real row (id-less rows are skipped
  // by the blob extractor) and undo can delete it by id.
  const assetId = `a_${Date.now().toString(36)}_${crypto.randomUUID()}`;
  const newEntry: ManualAsset = {
    id: assetId,
    name: trimmed,
    amount: amt,
    currency: cur,
  };
  finykChatWrite("finyk_assets", [...prevAssets, newEntry]);
  return {
    result: `Актив "${trimmed}" додано: ${formatNumberUk(amt)} ${cur}`,
    undo: () => {
      const list = warmFinykCache()?.manualAssets ?? [];
      const next = list.filter((e) => e.id !== assetId);
      if (next.length !== list.length) {
        finykChatWrite("finyk_assets", next);
      }
    },
  };
}

export function recurringExpense(
  action: RecurringExpenseAction,
): ChatActionResult {
  const { name, amount, day_of_month, category } = action.input;
  const trimmed = (name || "").trim();
  if (!trimmed) return "Потрібна назва платежу.";
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return "Сума має бути додатною.";
  const day = Number(day_of_month);
  const dayN = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const subs: Array<{
    id: string;
    name: string;
    amount?: number;
    dayOfMonth?: number;
    category?: string;
  }> = [...cache.subscriptions];
  const newSub = {
    id: `sub_${Date.now().toString(36)}_${crypto.randomUUID()}`,
    name: trimmed,
    amount: amt,
    dayOfMonth: dayN,
    category: category?.trim() || "",
  };
  subs.push(newSub);
  finykChatWrite("finyk_subs", subs);
  return `Підписку "${trimmed}" створено: ${formatNumberUk(amt)} грн, ${dayN}-го числа (id:${newSub.id})`;
}
