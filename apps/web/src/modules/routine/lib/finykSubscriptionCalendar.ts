import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import {
  buildFinykSubscriptionEvents as buildFinykSubscriptionEventsPure,
  FINYK_SUB_GROUP_LABEL,
  type CalendarRange,
  type FinykSubscriptionLike,
  type HubCalendarEvent,
} from "@sergeant/routine-domain";
import { getCachedFinykSqliteState } from "@finyk/lib/sqliteReader";
import { getVisibleFinykMonoMirrorStateWithLastGood } from "../../finyk/lib/monoMirrorReader";

export { FINYK_SUB_GROUP_LABEL };

// Fresh installs (or users who removed every subscription) get no
// calendar events. The old `DEFAULT_SUBSCRIPTIONS` fallback injected the
// owner's preset catalog into new visitors' calendars (live-deploy audit
// 2026-06-11). Підписки пишуться лише в SQLite (LS-ключ `finyk_subs` —
// tombstone, у нього ніхто не пише), тож читаємо SQLite-кеш Фініка.
export function loadFinykSubscriptionsFromStorage(): unknown[] {
  const subs = getCachedFinykSqliteState().subscriptions;
  return Array.isArray(subs) ? subs : [];
}

/**
 * Транзакції з Mono mirror cache (для сум і привʼязок).
 *
 * Uses the last-non-empty snapshot fallback so subscription-calendar
 * date data is preserved during cold-start / transitional empty refreshes
 * (replaces the old `finyk_tx_cache` + `finyk_tx_cache_last_good` LS reads).
 */
export function loadFinykTransactionsFromStorage(): unknown[] {
  return getVisibleFinykMonoMirrorStateWithLastGood().transactions;
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
