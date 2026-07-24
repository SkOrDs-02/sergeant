/**
 * Routine — full sign-in → habit toggle → streak +1 → sign-out flow.
 *
 * One of the four "full" Detox suites that close the Exit dashboard
 * (`docs/architecture/platforms.md`). Runs end-to-end through the real
 * Better Auth client against the mock fetch interceptor enabled by
 * `EXPO_PUBLIC_E2E_REAL_AUTH=1` (see
 * `apps/mobile/src/auth/e2eAuthMock.ts`).
 *
 * Steps:
 *   1. `disableAutoSignIn()` so the global `setup.ts` hook leaves the
 *      app on `(auth)/sign-in` instead of auto-filling credentials.
 *   2. Explicit sign-in through the form → land on tabs.
 *   3. Open Routine → Settings, create a daily habit (defaults seed
 *      every weekday in `emptyHabitDraft()`).
 *   4. Switch back to the Calendar sub-tab and record the streak value
 *      via Detox `getAttributes()`.
 *   5. Toggle the habit complete from its row — the `*-check` glyph
 *      appears.
 *   6. Re-read the streak value: the toggled habit shifts it from
 *      "0 дн." to "1 дн." (deterministic for a fresh user). We assert
 *      the text changed rather than equals "1 дн." because the streak
 *      label is locale-dependent.
 *   7. Sign out — assert the redirect lands on `/(auth)/sign-in`.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";
import { disableAutoSignIn, signIn, signOut } from "./_helpers/auth";
import { goToRoutineTab } from "./_helpers/nav";

disableAutoSignIn();

const HABIT_NAME = `Detox full ${Date.now()}`;

async function readStreakText(): Promise<string> {
  const attrs = (await element(
    by.id("routine-calendar-streak-value"),
  ).getAttributes()) as
    | { text?: string }
    | { elements: Array<{ text?: string }> };
  if ("text" in attrs && typeof attrs.text === "string") return attrs.text;
  if ("elements" in attrs && attrs.elements[0]?.text) {
    return attrs.elements[0].text;
  }
  return "";
}

describe("Рутина — full sign-in → habit → streak → sign-out", () => {
  it("signs in, completes a habit, sees the streak update, signs out", async () => {
    // 1. Sign in. Even if `setup.ts` left auto-sign-in disabled,
    //    `signIn()` is idempotent — it returns early when the tabs are
    //    already up.
    await signIn();

    // 2. Land on the Routine tab.
    await goToRoutineTab();

    // 3. Create a daily habit via Settings → "+ Додати". The form's
    //    default draft (`emptyHabitDraft()` from `@sergeant/routine-domain`)
    //    is `recurrence: "daily"` with every weekday selected, so the
    //    new habit is scheduled for today.
    await tapWhenVisible("routine-bottom-nav-settings");
    await waitForVisibleById("routine-habits");
    await tapWhenVisible("routine-habits-add");
    await waitForVisibleById("routine-habits-form");
    await byId("routine-habits-form-name").typeText(HABIT_NAME);
    await tapWhenVisible("routine-habits-form-submit");

    // 4. Back to Calendar — read the streak chip's value pre-toggle.
    await tapWhenVisible("routine-bottom-nav-calendar");
    await waitForVisibleById("routine-calendar-scroll");
    await waitForVisibleById("routine-calendar-streak-value");
    const streakBefore = await readStreakText();

    // 5. Toggle the habit. We match by the `routine-calendar-events-habit-`
    //    prefix because the habit id is generated at create time.
    const habitRow = element(by.id(/^routine-calendar-events-habit-/)).atIndex(
      0,
    );
    await waitFor(habitRow).toBeVisible().withTimeout(DEFAULT_WAIT_MS);
    await habitRow.tap();

    // 6. The `-check` glyph appears for the completed habit.
    await waitFor(element(by.id(/^routine-calendar-events-habit-.*-check$/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^routine-calendar-events-habit-.*-check$/)).atIndex(0),
    ).toBeVisible();

    // 7. Streak chip re-renders with the bumped value. Compare text
    //    rather than parse the integer — the chip is locale-dependent
    //    ("1 дн." in UA), so "the text changed" is the strongest
    //    locale-independent signal we have.
    const streakAfter = await readStreakText();
    if (streakAfter === streakBefore) {
      throw new Error(
        `Streak chip did not update after toggle: before=${JSON.stringify(streakBefore)} after=${JSON.stringify(streakAfter)}`,
      );
    }

    // 8. Sign out and confirm the redirect.
    await signOut();
  });
});
