import { safeReadLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import {
  buildFinykSubscriptionEvents as buildFinykSubscriptionEventsPure,
  FINYK_SUB_GROUP_LABEL,
  type CalendarRange,
  type FinykSubscriptionLike,
  type HubCalendarEvent,
} from "@sergeant/routine-domain";

export { FINYK_SUB_GROUP_LABEL };

const SUBS_KEY = STORAGE_KEYS.FINYK_SUBS;
const TX_CACHE_KEY = STORAGE_KEYS.FINYK_TX_CACHE;
const TX_LAST_GOOD_KEY = STORAGE_KEYS.FINYK_TX_CACHE_LAST_GOOD;

// Fresh installs (or users who removed every subscription) get no
// calendar events — mirrors the empty `finyk_subs` default in
// `useFinykStorageSlots`. The old `DEFAULT_SUBSCRIPTIONS` fallback
// injected the owner's preset catalog into new visitors' calendars
// (live-deploy audit 2026-06-11).
export function loadFinykSubscriptionsFromStorage() {
  const arr = safeReadLS<unknown[] | null>(SUBS_KEY, null);
  return Array.isArray(arr) ? arr : [];
}

/** Транзакції з кешу Monobank (для сум і прив’язок). */
export function loadFinykTransactionsFromStorage() {
  const primary = safeReadLS<{ txs?: unknown[] } | null>(TX_CACHE_KEY, null);
  if (primary?.txs?.length) return primary.txs;
  const fallback = safeReadLS<{ txs?: unknown[] } | null>(
    TX_LAST_GOOD_KEY,
    null,
  );
  if (fallback?.txs?.length) return fallback.txs;
  return [];
}

/**
 * Події календаря для підписок Фініка (планове списання раз на місяць).
 * Тонкий адаптер над `buildFinykSubscriptionEvents` з
 * `@sergeant/routine-domain`: тягне підписки + транзакції з localStorage
 * і передає lookup-функцію у pure-builder.
 */
export function buildFinykSubscriptionEvents(
  range: CalendarRange,
): HubCalendarEvent[] {
  const subs = loadFinykSubscriptionsFromStorage();
  const txs = loadFinykTransactionsFromStorage();
  return buildFinykSubscriptionEventsPure(
    range,
    subs as FinykSubscriptionLike[],
    (sub) =>
      getSubscriptionAmountMeta(
        sub,
        txs as Parameters<typeof getSubscriptionAmountMeta>[1],
      ),
  );
}
