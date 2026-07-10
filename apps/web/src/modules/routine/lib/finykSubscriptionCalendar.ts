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
import { getCachedFinykMonoMirrorStateWithLastGood } from "../../finyk/lib/monoMirrorReader";

export { FINYK_SUB_GROUP_LABEL };

const SUBS_KEY = STORAGE_KEYS.FINYK_SUBS;

// Fresh installs (or users who removed every subscription) get no
// calendar events — mirrors the empty `finyk_subs` default in
// `useFinykStorageSlots`. The old `DEFAULT_SUBSCRIPTIONS` fallback
// injected the owner's preset catalog into new visitors' calendars
// (live-deploy audit 2026-06-11).
export function loadFinykSubscriptionsFromStorage() {
  const arr = safeReadLS<unknown[] | null>(SUBS_KEY, null);
  return Array.isArray(arr) ? arr : [];
}

/**
 * Транзакції з Mono mirror cache (для сум і прив'язок).
 *
 * Uses the last-non-empty snapshot fallback so subscription-calendar
 * date data is preserved during cold-start / transitional empty refreshes
 * (replaces the old `finyk_tx_cache` + `finyk_tx_cache_last_good` LS reads).
 */
export function loadFinykTransactionsFromStorage(): unknown[] {
  return getCachedFinykMonoMirrorStateWithLastGood().transactions;
}

/**
 * Події календаря для підписок Фініка (планове списання раз на місяць).
 * Тонкий адаптер над `buildFinykSubscriptionEvents` з
 * `@sergeant/routine-domain`: тягне підписки + транзакції з mirror cache
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
