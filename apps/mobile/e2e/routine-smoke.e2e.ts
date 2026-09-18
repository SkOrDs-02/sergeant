/**
 * Routine — today toggle smoke test.
 *
 * Third Detox E2E suite for the mobile app (see
 * `apps/mobile/e2e/README.md` + migration plan §8, §13 Q8). Covers the
 * shortest vertical slice that touches the Routine module:
 *
 *   1. Tap the **Рутина** tab → Calendar (default sub-tab).
 *   2. Switch to the **Налаштування** sub-tab via `RoutineBottomNav`.
 *   3. Open the «+ Додати» sheet (`HabitForm`), fill a name and submit.
 *      The draft defaults to `recurrence: "daily"` + every weekday
 *      (`emptyHabitDraft()` in `@sergeant/routine-domain`), so the new
 *      habit is scheduled for today.
 *   4. Switch back to the **Календар** sub-tab.
 *   5. Find the habit's EventRow by its `routine-calendar-events-habit-*`
 *      testID prefix and tap it → `applyToggleHabitCompletion` flips
 *      the completion flag via `useRoutineStore`.
 *   6. Assert the inner `-check` node becomes visible, which is the
 *      child `✓` indicator that only renders when the event is in the
 *      completed state. This is a stable DOM-level signal that doesn't
 *      rely on text (locale-independent).
 *
 * Matches the testID scheme documented in `apps/mobile/e2e/README.md`:
 * we match by `testID` / `accessibilityLabel` only. The `completed`
 * indicator is guarded with a testID (`*-check`) so the assertion
 * survives copy changes to the habit name.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";

const HABIT_NAME = `Detox smoke ${Date.now()}`;

describe("Рутина — today toggle smoke", () => {
  it("creates a daily habit and toggles it complete from Calendar", async () => {
    // 1. Enter the Routine tab. Calendar is the default sub-screen.
    await tapWhenVisible("tab-routine");
    await waitForVisibleById("routine-shell");

    // 2. Switch to the Settings sub-tab via RoutineBottomNav.
    await tapWhenVisible("routine-bottom-nav-settings");
    await waitForVisibleById("routine-habits");

    // 3. Open the habit form and submit a new daily habit.
    await tapWhenVisible("routine-habits-add");
    await waitForVisibleById("routine-habits-form");
    await byId("routine-habits-form-name").typeText(HABIT_NAME);
    await tapWhenVisible("routine-habits-form-submit");

    // 4. Back to Calendar — the event list now has one habit row for
    //    today. We match by the stable `routine-calendar-events-habit-*`
    //    prefix because the habit id is generated at create time.
    await tapWhenVisible("routine-bottom-nav-calendar");
    await waitForVisibleById("routine-calendar-scroll");

    const habitRow = element(by.id(/^routine-calendar-events-habit-/)).atIndex(
      0,
    );
    await waitFor(habitRow).toBeVisible().withTimeout(DEFAULT_WAIT_MS);

    // 5. Before the tap, the `-check` node does not exist because the
    //    habit is uncompleted. Tap toggles the completion flag.
    await habitRow.tap();

    // 6. The inner `-check` glyph ("✓") is only rendered when the
    //    event is in the completed state — its presence is the UI
    //    confirmation that `applyToggleHabitCompletion` has fired.
    await waitFor(element(by.id(/^routine-calendar-events-habit-.*-check$/)))
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);
    await detoxExpect(
      element(by.id(/^routine-calendar-events-habit-.*-check$/)).atIndex(0),
    ).toBeVisible();
  });
});
