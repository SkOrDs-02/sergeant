/**
 * Hub UX smoke test.
 *
 * Covers the critical non-module UI loop:
 *   1. Hub tab renders and opens Settings from the dashboard affordance.
 *   2. Settings grouping is reachable through stable testIDs.
 *   3. Theme segmented control is operable and exposes all modes.
 *   4. Bottom tab testIDs exist for every top-level module.
 */
import { expect as detoxExpect } from "detox";

import { byId, tapWhenVisible, waitForVisibleById } from "./helpers";

describe("Hub — UX smoke", () => {
  it("opens Settings, toggles theme modes, and exposes stable top-level navigation", async () => {
    await tapWhenVisible("tab-hub");
    await waitForVisibleById("dashboard-settings-button");

    await detoxExpect(byId("tab-finyk")).toBeVisible();
    await detoxExpect(byId("tab-fizruk")).toBeVisible();
    await detoxExpect(byId("tab-routine")).toBeVisible();
    await detoxExpect(byId("tab-nutrition")).toBeVisible();

    await tapWhenVisible("dashboard-settings-button");
    await waitForVisibleById("settings-group-system");
    await tapWhenVisible("settings-general-group");

    await waitForVisibleById("theme-toggle-light");
    await waitForVisibleById("theme-toggle-dark");
    await waitForVisibleById("theme-toggle-system");

    await tapWhenVisible("theme-toggle-dark");
    await tapWhenVisible("theme-toggle-system");
  });
});
