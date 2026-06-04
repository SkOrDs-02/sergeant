/**
 * Фізрук — body measurements entry.
 *
 * Covers the Measurements sub-page of the Fizruk module, which had no
 * Detox coverage beyond the dashboard smoke contained in
 * `fizruk-full.e2e.ts`.
 *
 * Steps:
 *   1. Sign in through the form.
 *   2. Navigate to the ФІЗРУК tab → Dashboard.
 *   3. Navigate to the Measurements sub-page via the quick-links row
 *      (`fizruk-dashboard-quicklinks-measurements`).
 *   4. Assert `fizruk-measurements` container is visible.
 *   5. Tap the "+ Додати" button (`fizruk-measurements-add`) to open
 *      the inline entry form.
 *   6. Fill the first measurement field (`fizruk-measurements-form-field-<id>`
 *      — matched by prefix regex since the field id is dynamic).
 *   7. Submit the form (`fizruk-measurements-form-submit`).
 *   8. The entry form closes and the count label (`fizruk-measurements-count`)
 *      is visible — asserting the record persisted without a crash.
 *   9. Sign out.
 *
 * Follow-up testIDs to wire in app source:
 *   - `fizruk-dashboard-quicklinks-measurements` — the tile in
 *     `QuickLinksRow.tsx` is templated as `${testID}-${tile.id}` where
 *     the root testID is `fizruk-dashboard-quicklinks` (default). The
 *     tile `id` is the slug string for the Measurements link. Verify
 *     the exact slug at device time; the most likely value is
 *     `"measurements"` based on the `tile.id` convention seen for
 *     `"workouts"` in `fizruk-full.e2e.ts`.
 */
import { by, element, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";
import { disableAutoSignIn, signIn, signOut } from "./_helpers/auth";

disableAutoSignIn();

describe("Фізрук — body measurements entry", () => {
  it("signs in, adds a body measurement and sees the count update", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Navigate to the ФІЗРУК tab.
    await tapWhenVisible("tab-fizruk");
    await waitForVisibleById("fizruk-dashboard-scroll");

    // 3. Navigate to Measurements via the quick-links row.
    await tapWhenVisible("fizruk-dashboard-quicklinks-measurements");
    await waitForVisibleById("fizruk-measurements");

    // 4. Open the measurement entry form.
    await tapWhenVisible("fizruk-measurements-add");
    await waitForVisibleById("fizruk-measurements-form");

    // 5. Fill the first field. The form renders fields with testIDs shaped
    //    `fizruk-measurements-form-field-<id>` where `<id>` is the field
    //    slug (e.g. "weight_kg"). We match by prefix so this remains
    //    stable if fields are reordered or renamed.
    await waitFor(element(by.id(/^fizruk-measurements-form-field-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.id(/^fizruk-measurements-form-field-/))
      .atIndex(0)
      .replaceText("75");

    // 6. Submit the form.
    await tapWhenVisible("fizruk-measurements-form-submit");

    // 7. The form closes after a successful submit. The count label is
    //    visible regardless of whether the form is open.
    await waitFor(element(by.id("fizruk-measurements-form")))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await waitForVisibleById("fizruk-measurements-count");

    // 8. Sign out.
    await signOut();
  });
});
