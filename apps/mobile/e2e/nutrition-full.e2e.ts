/**
 * Nutrition — full sign-in → add meal via AddMealSheet → verify in log → sign-out.
 *
 * One of the four "full" Detox suites. Exercises the nutrition module's
 * manual-meal-entry path (source picker → "Ввести вручну" → fill name +
 * save) under the mock auth layer.
 *
 * Steps:
 *   1. Sign in through the form.
 *   2. Tap the Їжа tab → NutritionShell renders.
 *   3. Navigate to the Log sub-tab via `NutritionBottomNav`.
 *   4. Tap "+ Додати прийом" → AddMealSheet opens.
 *   5. Pick the "Ввести вручну" source → form step renders.
 *   6. Fill the meal name → tap "Зберегти".
 *   7. Verify a `nutrition-log-meal-*` row appears in the list.
 *   8. Sign out.
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

const MEAL_NAME = `Detox meal ${Date.now()}`;

describe("Їжа — full sign-in → add meal → verify → sign-out", () => {
  it("signs in, adds a manual meal entry, sees it in the log, then signs out", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Tap the Nutrition tab.
    await tapWhenVisible("tab-nutrition");
    await waitForVisibleById("nutrition-shell");

    // 3. Navigate to the Log sub-tab.
    await tapWhenVisible("nutrition-bottom-nav-log");
    await waitForVisibleById("nutrition-log");

    // 4. Tap the add-meal button.
    await tapWhenVisible("nutrition-log-add-meal-btn");

    // 5. The AddMealSheet opens with a "source picker" step. Tap
    //    "Ввести вручну" to enter the fill form directly.
    await tapWhenVisible("add-meal-source-manual");

    // 6. Fill the meal name and submit.
    await waitForVisibleById("add-meal-name");
    await byId("add-meal-name").replaceText(MEAL_NAME);
    await tapWhenVisible("add-meal-save");

    // 7. Verify the meal row appears in the log list.
    await waitFor(element(by.id(/^nutrition-log-meal-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 8. Sign out.
    await signOut();
  });
});
