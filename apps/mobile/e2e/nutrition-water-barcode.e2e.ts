/**
 * Nutrition — Water tracker + barcode-scan entry path.
 *
 * Extends E2E coverage beyond the existing `nutrition-full.e2e.ts`
 * (manual-entry path) to the two flows that previously had no Detox
 * coverage:
 *
 *   A. Water tracker:
 *      1. Sign in → Їжа tab → switch to "Вода" sub-tab.
 *      2. Tap one of the quick-add buttons (`nutrition-water-card-add-250`).
 *      3. Assert the `nutrition-water-card` is still visible (tracker
 *         did not crash / re-render to an error state).
 *      4. Tap the reset button (`nutrition-water-card-reset`) and assert
 *         the card remains visible.
 *
 *   B. Barcode-scan entry modal:
 *      1. Navigate to the Log sub-tab and open AddMealSheet.
 *      2. Tap the barcode-scan source button (`add-meal-open-barcode-scan`).
 *      3. The app navigates to `/(tabs)/nutrition/scan`; assert
 *         `nutrition-barcode-scan` container is visible.
 *      4. (No camera interaction — Detox cannot simulate a real camera
 *         frame; we verify only that the screen mounted without crashing.)
 *
 * Steps A and B are separate `it()` blocks so CI can isolate failures.
 * Both reuse `disableAutoSignIn()` so the app lands on sign-in.
 *
 * Follow-up testIDs to wire in app source:
 *   - `nutrition-water-card-add-250` / `nutrition-water-card-add-500` /
 *     `nutrition-water-card-add-750` — the quick-add `Pressable` rows in
 *     `WaterTrackerCard.tsx`. Currently templated as
 *     `${testID}-add-${ml}` (testID "nutrition-water-card") so these
 *     should already resolve — verify at device time.
 *   - `nutrition-water-card-reset` — reset button in `WaterTrackerCard.tsx`;
 *     templated as `${testID}-reset` — should resolve.
 */
import { waitFor, element, by } from "detox";

import {
  DEFAULT_WAIT_MS,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";
import { disableAutoSignIn, signIn, signOut } from "./_helpers/auth";

disableAutoSignIn();

describe("Їжа — Water tracker + barcode scan", () => {
  it("adds water via quick-add buttons and resets the tracker", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Navigate to the Nutrition tab.
    await tapWhenVisible("tab-nutrition");
    await waitForVisibleById("nutrition-shell");

    // 3. Switch to the Вода sub-tab.
    await tapWhenVisible("nutrition-bottom-nav-water");

    // 4. The water card renders.
    await waitForVisibleById("nutrition-water-card");

    // 5. Tap the 250 ml quick-add button. The testID pattern from
    //    WaterTrackerCard.tsx is `${testID}-add-${ml}` where the root
    //    testID is "nutrition-water-card".
    await tapWhenVisible("nutrition-water-card-add-250");

    // 6. Card is still visible after adding water.
    await waitForVisibleById("nutrition-water-card");

    // 7. Reset the tracker.
    await tapWhenVisible("nutrition-water-card-reset");

    // 8. Card still on screen after reset.
    await waitForVisibleById("nutrition-water-card");

    // 9. Sign out.
    await signOut();
  });

  it("opens the barcode scan screen from AddMealSheet without crashing", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Navigate to the Nutrition tab.
    await tapWhenVisible("tab-nutrition");
    await waitForVisibleById("nutrition-shell");

    // 3. Navigate to the Log sub-tab.
    await tapWhenVisible("nutrition-bottom-nav-log");
    await waitForVisibleById("nutrition-log");

    // 4. Open AddMealSheet.
    await tapWhenVisible("nutrition-log-add-meal-btn");

    // 5. The source-picker step renders. Tap the barcode-scan button.
    //    This navigates to `/(tabs)/nutrition/scan` and closes the sheet.
    await tapWhenVisible("add-meal-open-barcode-scan");

    // 6. The barcode-scan screen mounts. We only verify it rendered —
    //    Detox cannot feed a real camera frame to the scanner.
    await waitFor(element(by.id("nutrition-barcode-scan")))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 7. Sign out. `signOut` navigates Hub → Settings → Account first,
    //    which pops back to the tabs. This is intentional — the
    //    barcode screen is a tabs leaf, so the tab bar is accessible.
    await signOut();
  });
});
