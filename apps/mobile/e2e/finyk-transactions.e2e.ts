/**
 * Finyk — Transactions period filter.
 *
 * Detox E2E coverage for every period-filter affordance on the Finyk
 * Transactions screen (testID scheme documented in
 * `apps/mobile/e2e/README.md`, see the migration plan §5.2 + §13 Q8):
 *
 *   1. Month chevrons (`finyk-transactions-prev-month` /
 *      `finyk-transactions-next-month`) — built into
 *      `TransactionsHeader`. Tested via the seeded current-month
 *      expense which collapses to an empty feed in the previous month
 *      and reappears in the current month.
 *   2. Custom date-range sheet (`finyk-transactions-filter-range`
 *      chip → `DateRangeFilterSheet`) — narrows the feed to an
 *      arbitrary [start, end] window via `useFinykTxFilters.setRange`.
 *      Tested by setting a far-past range (so today's seeded row
 *      drops out) and then clearing the range so the row reappears.
 *
 * Together these two `it()` blocks cover every period-scoping
 * mechanism the screen exposes; week / quarter / year windows fall
 * out of the date-range sheet for free because the filter store
 * persists raw `startMs` / `endMs` millis with no segmenting.
 *
 * Matches the testID scheme documented in
 * `apps/mobile/e2e/README.md`: we match by `testID` only — never by
 * formatted date / amount text, because locale affects both.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";

const EXPENSE_AMOUNT = "42.10";

/**
 * Шортка для повторюваного flow: tab → Overview → Transactions →
 * Add → submit one current-month expense. Кожен `it()` нижче починає
 * з `device.reloadReactNative()` (див. `setup.ts`), але MMKV
 * залишається перемикач-стійким — тож сід відновлюємо щоразу.
 */
async function seedCurrentMonthExpense(): Promise<void> {
  await tapWhenVisible("tab-finyk");
  await waitForVisibleById("finyk-overview-scroll");
  await tapWhenVisible("finyk-nav-grid-transactions");
  await waitForVisibleById("finyk-transactions");

  await tapWhenVisible("finyk-transactions-add");
  await waitForVisibleById("finyk-transactions-sheet");
  await byId("finyk-transactions-sheet-amount").typeText(EXPENSE_AMOUNT);
  await waitFor(element(by.id(/^finyk-transactions-sheet-category-/)))
    .toBeVisible()
    .withTimeout(DEFAULT_WAIT_MS);
  await element(by.id(/^finyk-transactions-sheet-category-/))
    .atIndex(0)
    .tap();
  await tapWhenVisible("finyk-transactions-sheet-submit");
  await waitFor(element(by.id("finyk-transactions-sheet")))
    .not.toBeVisible()
    .withTimeout(DEFAULT_WAIT_MS);
}

describe("Фінік — Transactions period filter", () => {
  it("filters the feed to the active month when using prev/next chevrons", async () => {
    await seedCurrentMonthExpense();

    // Presence — the newly-seeded row should be in the feed.
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^finyk-tx-row-/)).atIndex(0),
    ).toBeVisible();

    // Tap prev-month chevron. No prior step seeds *previous*-month data,
    // so the feed collapses to the empty state and every
    // `finyk-tx-row-*` disappears from the screen. We pin this with
    // `toNotExist()` against the regex matcher so the assertion fails
    // if any stale row is still mounted.
    await tapWhenVisible("finyk-transactions-prev-month");
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toNotExist()
      .withTimeout(DEFAULT_WAIT_MS);

    // Next-month returns us to the current month and the seeded row
    // must be back on screen. `reloadReactNative()` runs between
    // `it()` blocks, but not between assertions inside a single
    // `it()` — so the MMKV-backed row is still there.
    await tapWhenVisible("finyk-transactions-next-month");
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^finyk-tx-row-/)).atIndex(0),
    ).toBeVisible();
  });

  it("narrows the feed via the date-range sheet apply/clear flow", async () => {
    // `beforeEach` reloads RN but MMKV persists — seed defensively so
    // the `it()` is robust to a stale store and to being run in
    // isolation (`detox test -t "narrows the feed"`).
    await seedCurrentMonthExpense();

    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // Open the date-range sheet via the chip on the filter strip.
    await tapWhenVisible("finyk-transactions-filter-range");
    await waitForVisibleById("finyk-transactions-range-sheet");

    // Apply a far-past window so today's seeded row drops out of the
    // filtered feed. The start/end inputs accept `YYYY-MM-DD`; the
    // page coerces them to epoch-ms inside `useFinykTxFilters.setRange`.
    await byId("finyk-transactions-range-start").typeText("2020-01-01");
    await byId("finyk-transactions-range-end").typeText("2020-12-31");
    await tapWhenVisible("finyk-transactions-range-apply");
    await waitFor(element(by.id("finyk-transactions-range-sheet")))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // No row should remain — the applied range excludes today.
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toNotExist()
      .withTimeout(DEFAULT_WAIT_MS);

    // Re-open the sheet and clear the range. The page wires
    // `clearDateRange` to `setRange({ startMs: null, endMs: null })`,
    // which closes the sheet and restores the unfiltered feed.
    await tapWhenVisible("finyk-transactions-filter-range");
    await waitForVisibleById("finyk-transactions-range-sheet");
    await tapWhenVisible("finyk-transactions-range-clear");
    await waitFor(element(by.id("finyk-transactions-range-sheet")))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // The seeded row is back on screen.
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^finyk-tx-row-/)).atIndex(0),
    ).toBeVisible();
  });
});
