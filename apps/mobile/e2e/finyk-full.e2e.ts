/**
 * Finyk — full sign-in → manual expense → verify in transactions → sign-out.
 *
 * Extends the flow documented in `finyk-manual-expense.e2e.ts` with an
 * explicit sign-in (via the form) and sign-out (via Settings → Account).
 * Does NOT duplicate the smoke suite — the core expense-creation steps
 * reuse the same testID chain, and the auth bookends are the delta that
 * promotes "smoke" to "full end-to-end".
 *
 * Steps:
 *   1. Sign in through the form.
 *   2. Tap Фінік tab → Overview → Transactions (via FinykNavGrid card).
 *   3. Open add-expense sheet → fill amount → pick first category → submit.
 *   4. Assert the transaction row appears in the day-grouped list.
 *   5. Sign out.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";
import { disableAutoSignIn, signIn, signOut } from "./_helpers/auth";

disableAutoSignIn();

const EXPENSE_AMOUNT = "99.88";

describe("Фінік — full sign-in → manual expense → sign-out", () => {
  it("signs in, adds a manual expense, verifies it appears, then signs out", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Navigate to the Finyk tab → Overview.
    await tapWhenVisible("tab-finyk");
    await waitForVisibleById("finyk-overview-scroll");

    // 3. Drill into Transactions through the nav-grid card.
    await tapWhenVisible("finyk-nav-grid-transactions");
    await waitForVisibleById("finyk-transactions");

    // 4. Open the add-expense sheet.
    await tapWhenVisible("finyk-transactions-add");
    await waitForVisibleById("finyk-transactions-sheet");

    // 5. Fill amount.
    await byId("finyk-transactions-sheet-amount").typeText(EXPENSE_AMOUNT);

    // 6. Pick the first category chip.
    await waitFor(element(by.id(/^finyk-transactions-sheet-category-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.id(/^finyk-transactions-sheet-category-/))
      .atIndex(0)
      .tap();

    // 7. Submit and expect the sheet to close.
    await tapWhenVisible("finyk-transactions-sheet-submit");
    await waitFor(element(by.id("finyk-transactions-sheet")))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 8. Assert the transaction row appears in the feed.
    await waitFor(element(by.id(/^finyk-tx-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^finyk-tx-row-/)).atIndex(0),
    ).toBeVisible();

    // 9. Sign out.
    await signOut();
  });
});
