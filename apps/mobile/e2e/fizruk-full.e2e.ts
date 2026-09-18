/**
 * Fizruk — full sign-in → start workout → log set → finish → history → sign-out.
 *
 * One of the four "full" Detox suites that close the Exit dashboard.
 * Exercises the Fizruk workout pipeline end-to-end against the mock
 * auth layer (`EXPO_PUBLIC_E2E_REAL_AUTH=1`).
 *
 * Steps:
 *   1. Sign in through the form.
 *   2. Tap the ФІЗРУК tab → Dashboard → Workouts (quick-link).
 *   3. Start a workout → Detox creates an active session.
 *   4. Open the exercise catalog and pick the first exercise.
 *   5. Add a set (weight + reps) via `ActiveSetEditor` → save.
 *   6. Finish the workout.
 *   7. Verify a completed workout row appears in the "recent" list.
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

describe("Фізрук — full sign-in → workout → sign-out", () => {
  it("signs in, runs a workout session with one logged set, then signs out", async () => {
    // 1. Sign in.
    await signIn();

    // 2. Navigate: Hub → ФІЗРУК tab → Dashboard.
    await tapWhenVisible("tab-fizruk");
    await waitForVisibleById("fizruk-dashboard-scroll");

    // 3. Open the Workouts sub-page.
    await tapWhenVisible("fizruk-dashboard-quicklinks-workouts");
    await waitForVisibleById("fizruk-workouts-scroll");

    // 4. Start a workout.
    await tapWhenVisible("fizruk-workouts-active-start");

    // 5. Open the exercise catalog and pick the first available exercise.
    await tapWhenVisible("fizruk-workouts-open-catalog");
    await waitFor(element(by.id(/^fizruk-workouts-catalog-row-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.id(/^fizruk-workouts-catalog-row-/))
      .atIndex(0)
      .tap();

    // 6. The view switches back to "home" with the active item rendered.
    //    Tap the "add set" button on the first active item.
    await waitFor(element(by.id(/^fizruk-workouts-item-.*-add-set$/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await element(by.id(/^fizruk-workouts-item-.*-add-set$/))
      .atIndex(0)
      .tap();

    // 7. The ActiveSetEditor sheet opens. Fill weight + reps.
    await waitForVisibleById("fizruk-workouts-set-editor");
    await byId("fizruk-workouts-set-editor-weight-input").replaceText("60");
    await byId("fizruk-workouts-set-editor-reps-input").replaceText("10");

    // 8. Save the set.
    await tapWhenVisible("fizruk-workouts-set-editor-save");

    // 9. Finish the workout.
    await tapWhenVisible("fizruk-workouts-active-finish");

    // 10. Verify a completed workout appears in the "recent" list. After
    //     finish, the view goes back to "home" with the recent section
    //     populated. We match by a stable prefix.
    await waitFor(element(by.id(/^fizruk-workouts-recent-/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 11. Sign out.
    await signOut();
  });
});
