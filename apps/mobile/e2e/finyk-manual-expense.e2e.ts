/**
 * Finyk — manual-expense happy path.
 *
 * First Detox E2E suite for the mobile app (see
 * `docs/engineering/mobile/react-native-migration.md` §8 and §13 Q8). Covers the shortest
 * vertical slice that touches all core Фінік surfaces:
 *
 *   1. App launches with `EXPO_PUBLIC_E2E=1` so the tabs layout skips
 *      the Better Auth gate (`app/(tabs)/_layout.tsx`).
 *   2. User taps the **Фінік** tab → Overview.
 *   3. Navigates to **Transactions** via the `FinykNavGrid` shortcut.
 *   4. Opens the **+** add-expense button → `ManualExpenseSheet`.
 *   5. Fills amount + picks the first canonical category + saves.
 *   6. Confirms the newly-created transaction row is visible in the
 *      day-grouped feed (by `finyk-tx-row-*` testID prefix).
 *
 * Matches the testID scheme documented in the migration plan's
 * "Acceptance" section — all hooks are namespaced so later suites can
 * reuse them without stepping on each other.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";

const EXPENSE_AMOUNT = "123.45";

describe("Фінік — manual expense", () => {
  it("creates a manual expense from Transactions and shows it in the feed", async () => {
    // 1. Overview is reachable after the E2E-bypass launch.
    await tapWhenVisible("tab-finyk");
    await waitForVisibleById("finyk-overview-scroll");

    // 2. Drill into Transactions through the in-module FinykNavGrid card.
    await tapWhenVisible("finyk-nav-grid-transactions");
    await waitForVisibleById("finyk-transactions");

    // 3. Open the add-expense sheet. The root sheet testID comes from
    //    TransactionsPage (`${testID}-sheet`); ManualExpenseSheet
    //    propagates the prefix to its amount / submit inputs.
    await tapWhenVisible("finyk-transactions-add");
    await waitForVisibleById("finyk-transactions-sheet");

    // 4. Fill amount.
    await byId("finyk-transactions-sheet-amount").typeText(EXPENSE_AMOUNT);

    // 5. Pick the first category chip. We match by a stable prefix so
    //    translation tweaks to category labels don't break the suite —
    //    the sheet renders category chips with testIDs shaped like
    //    `finyk-transactions-sheet-category-<slug>`.
    await waitFor(element(by.id(/^finyk-transactions-sheet-category-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.id(/^finyk-transactions-sheet-category-/))
      .atIndex(0)
      .tap();

    // 6. Submit and expect the sheet to close.
    await tapWhenVisible("finyk-transactions-sheet-submit");
    await waitFor(element(by.id("finyk-transactions-sheet")))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 7. Assert the transaction appears in the day-grouped list. We
    //    don't rely on the amount text because localisation may format
    //    it differently across devices — `finyk-tx-row-*` is an
    //    internal-only testID prefix emitted from TransactionsPage.
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^finyk-tx-row-/)).atIndex(0),
    ).toBeVisible();
  });
});
