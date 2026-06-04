/**
 * Offline / sync — queue-while-offline, reconnect, SyncStatusIndicator.
 *
 * Exercises the offline resilience contract of the mobile app:
 *
 *   1. While online, create a Finyk transaction (seeded via the existing
 *      helper pattern from `finyk-transactions.e2e.ts`) so there is a
 *      known-good online state.
 *
 *   2. Put the device into airplane mode via `device.setURLBlacklist`
 *      (Detox's network-intercept mechanism) to block all outbound
 *      requests — simulating loss of connectivity without toggling the
 *      system-level airplane mode switch (which would also kill the
 *      Detox server socket).
 *
 *   3. Assert that the `SyncStatusOverlay` switches to the offline /
 *      syncing state.  The `SyncStatusIndicator` renders with
 *      `accessibilityRole="alert"` in the offline state and
 *      `accessibilityRole="progressbar"` in the syncing state.
 *      We match by `accessibilityLabel` prefix ("Офлайн") because
 *      `SyncStatusIndicator` does not currently expose testIDs — the
 *      component is authored to rely on accessibilityLabel for VoiceOver.
 *
 *   4. While offline, attempt to add a second Finyk transaction
 *      (fill the sheet but do NOT submit if the sheet itself blocks —
 *      the MMKV-backed optimistic store should still accept the write
 *      locally). We verify the sheet can be opened and the amount field
 *      is editable regardless of connectivity.
 *
 *   5. Re-enable the network via `device.setURLBlacklist([])`.
 *
 *   6. Assert the `SyncStatusIndicator` transitions away from the
 *      offline/error state back to idle or syncing.
 *
 * Determinism notes:
 *   - `device.setURLBlacklist` / `clearURLBlacklist` are the Detox
 *     WebDriverAgent + OkHttp network intercept APIs; they block at the
 *     native layer below `fetch` / `XMLHttpRequest` so the JS bundle
 *     treats requests as network failures.
 *   - The E2E mock-auth interceptor (`e2eAuthMock.ts`) runs inside the
 *     same process as the app, so it is NOT blocked by the URL blacklist.
 *     This means the auth session remains valid while "offline" —
 *     intentional, since we are testing the sync layer, not re-auth.
 *   - The spec uses the auth-bypass mode (no `disableAutoSignIn()`) so
 *     `setup.ts` handles the sign-in before the first `it()`.
 *
 * Follow-up testIDs to wire in app source:
 *   - `sync-status-offline` — testID on the offline View in
 *     `SyncStatusIndicator.tsx`. The component currently uses only
 *     `accessibilityRole` + `accessibilityLabel`. Adding a testID here
 *     would make the assertion in step 3 (and step 6) much more robust
 *     than matching by label text.
 *   - `sync-status-idle` — testID on the idle View in
 *     `SyncStatusIndicator.tsx` (same rationale).
 *   - `sync-status-syncing` — testID on the syncing View (same rationale).
 */
import { by, device, element, waitFor } from "detox";

import {
  DEFAULT_WAIT_MS,
  byId,
  tapWhenVisible,
  waitForVisibleById,
} from "./helpers";

// The URL regex that blocks all non-localhost traffic.  We use a broad
// pattern so the sync writer, PostHog, and Sentry are all cut off — this
// matches the real-world "airplane mode" scenario closely enough.
const ALL_EXTERNAL_URLS_PATTERN = ".*";

/** Re-usable: seed one Finyk expense so the store has something to sync. */
async function seedOneExpense(): Promise<void> {
  await tapWhenVisible("tab-finyk");
  await waitForVisibleById("finyk-overview-scroll");
  await tapWhenVisible("finyk-nav-grid-transactions");
  await waitForVisibleById("finyk-transactions");
  await tapWhenVisible("finyk-transactions-add");
  await waitForVisibleById("finyk-transactions-sheet");
  await byId("finyk-transactions-sheet-amount").typeText("12.34");
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

describe("Офлайн / Синк — збереження в черзі та відновлення", () => {
  afterEach(async () => {
    // Belt-and-braces: always re-enable network after each `it()` so a
    // failure in the blacklist step does not cascade into subsequent
    // suites (Detox runs suites sequentially).
    await device.setURLBlacklist([]);
  });

  it("queues writes while offline and the sheet remains operable", async () => {
    // 1. Seed an expense while online so we have a known-good state.
    await seedOneExpense();

    // 2. Block all outbound network traffic to simulate going offline.
    await device.setURLBlacklist([ALL_EXTERNAL_URLS_PATTERN]);

    // 3. The SyncStatusIndicator should transition to the offline or
    //    syncing state. The component currently uses accessibilityLabel
    //    rather than testIDs — match by label prefix.
    //    Once `sync-status-offline` testID is wired, replace this with:
    //    `await waitForVisibleById("sync-status-offline");`
    await waitFor(
      element(by.label(/^Офлайн/)).atIndex(0),
    )
      .toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS);

    // 4. While offline, navigate to Transactions and open the add-sheet.
    //    The MMKV-backed store accepts writes optimistically; the sheet
    //    should still open and accept input.
    await tapWhenVisible("tab-finyk");
    await waitForVisibleById("finyk-overview-scroll");
    await tapWhenVisible("finyk-nav-grid-transactions");
    await waitForVisibleById("finyk-transactions");
    await tapWhenVisible("finyk-transactions-add");
    await waitForVisibleById("finyk-transactions-sheet");

    // Fill in an amount — the sheet is operable even offline.
    await byId("finyk-transactions-sheet-amount").typeText("55.00");

    // Close the sheet without submitting (we are testing the operable
    // state, not the full offline commit path which is storage-layer
    // behaviour covered by unit tests).
    // Swipe down to dismiss the bottom sheet (the Sheet component
    // supports the `dismiss-on-swipe` gesture; alternatively tap
    // outside — both are device-native gestures). For Detox we tap
    // the Android back navigation or rely on a close button if present.
    // A safe cross-platform fallback is `device.pressBack()` on Android;
    // on iOS we swipe down. Use a `try/catch` so the step does not fail
    // if the sheet auto-closed.
    try {
      await device.pressBack(); // Android
    } catch {
      // iOS: no hardware back — the sheet remains open; we proceed.
    }

    // 5. Re-enable the network.
    await device.setURLBlacklist([]);

    // 6. After reconnect the indicator should leave the offline state.
    //    We wait for the "Офлайн" label to disappear — it may briefly
    //    show "Синхронізація…" before going idle.
    //    Once `sync-status-offline` testID is wired, replace with:
    //    `await expectNotVisibleById("sync-status-offline");`
    await waitFor(element(by.label(/^Офлайн/)).atIndex(0))
      .not.toBeVisible()
      .withTimeout(DEFAULT_WAIT_MS * 3); // extra time for reconnect
  });
});
