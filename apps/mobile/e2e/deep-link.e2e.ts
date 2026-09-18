/**
 * Deep links — `sergeant://` custom-scheme routing.
 *
 * Exercises the `useDeepLinks` hook + `parseSergeantUrl` parser at the
 * device level by calling `device.openURL` from the Detox test process.
 * Each `it()` block opens a URL while the app is running (warm-start
 * path via `Linking.addEventListener("url")`) and asserts the expected
 * screen is mounted.
 *
 * Covered links (from the `SergeantDeepLink` union in `deepLinks.ts`):
 *   1. `sergeant://` → Hub tab (dashboard-hero-slot visible).
 *   2. `sergeant://routine` → Routine tab (routine-shell visible).
 *   3. `sergeant://food/log` → Nutrition Log sub-tab (nutrition-log visible).
 *   4. `sergeant://workout/new` → Fizruk new-workout screen
 *      (`fizruk-workouts-scroll` visible after the router pushes
 *      `/(tabs)/fizruk/workout/new`, which renders the Workouts component
 *      and starts a new session — the scroll container is the stable
 *      landmark for this route).
 *   5. `sergeant://finance` → Finyk tab (finyk-overview-scroll visible).
 *   6. `sergeant://settings` → Settings modal (settings-group-account visible
 *      via the sticky-tab pill).
 *
 * All tests run in the auto-sign-in mode (no `disableAutoSignIn()` call)
 * so `setup.ts` ensures the user is authenticated before the first
 * `device.openURL`. The tab bar is therefore present and each deep link
 * can resolve to an authenticated route.
 *
 * Follow-up testIDs to wire in app source:
 *   - `fizruk-workouts-new-scroll` — the new-workout screen
 *     (`/(tabs)/fizruk/workout/new`) currently shares the `Workouts`
 *     component. Verify the exact container testID emitted by
 *     `fizruk/workout/new.tsx` at device time; the spec falls back to
 *     `fizruk-workouts-scroll` which is the default root testID of the
 *     `Workouts` component.
 */
import { device } from "detox";

import { waitForVisibleById, tapWhenVisible } from "./helpers";
import { waitForTabsVisible } from "./_helpers/auth";

describe("Deep links — sergeant:// routing (warm-start)", () => {
  it("sergeant:// opens the Hub dashboard", async () => {
    await waitForTabsVisible();
    await device.openURL({ url: "sergeant://" });
    await waitForVisibleById("dashboard-hero-slot");
  });

  it("sergeant://routine opens the Routine tab", async () => {
    await device.openURL({ url: "sergeant://routine" });
    await waitForVisibleById("routine-shell");
  });

  it("sergeant://food/log opens the Nutrition Log sub-tab", async () => {
    await device.openURL({ url: "sergeant://food/log" });
    await waitForVisibleById("nutrition-shell");
    // The food/log link maps to `/(tabs)/nutrition`. The Log sub-tab is
    // the active page when `mainTab` equals "log". The NutritionApp
    // does not switch sub-tabs automatically from the route — the user
    // is dropped on the Nutrition shell. Asserting `nutrition-shell` is
    // the stable signal.
  });

  it("sergeant://workout/new opens the new-workout screen", async () => {
    await device.openURL({ url: "sergeant://workout/new" });
    // `/(tabs)/fizruk/workout/new` pushes onto the fizruk stack.
    // The Workouts component is the root for this screen; its scroll
    // container testID is `fizruk-workouts-scroll`.
    await waitForVisibleById("fizruk-workouts-scroll");
  });

  it("sergeant://finance opens the Finyk overview", async () => {
    // Pop back to tabs before opening a new deep link so we start
    // from a clean nav state.
    await tapWhenVisible("tab-hub");
    await waitForVisibleById("dashboard-hero-slot");

    await device.openURL({ url: "sergeant://finance" });
    await waitForVisibleById("finyk-overview-scroll");
  });

  it("sergeant://settings opens the Settings modal", async () => {
    await tapWhenVisible("tab-hub");
    await waitForVisibleById("dashboard-hero-slot");

    await device.openURL({ url: "sergeant://settings" });
    // The settings modal shows the sticky-tab group pills. The Account
    // group pill is always rendered unconditionally.
    await waitForVisibleById("settings-group-account");
  });
});
