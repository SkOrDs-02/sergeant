import { describe, expect, it } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import {
  canShowHint,
  clearAllHintsState,
  clearHintState,
  getHintState,
  getRetentionHintId,
  HINT_DEFINITIONS,
  pickNextHint,
  readHintsState,
  recordHintCompleted,
  recordHintDismissed,
  recordHintShown,
  setHintState,
  snoozeHint,
  writeHintsState,
  type HintContext,
  type HintId,
} from "./hints";

const HUB_WEB: HintContext = {
  platform: "web",
  surface: "hub",
  inFtuxSession: true,
};

describe("hints shared core", () => {
  it("reads, writes, normalizes and clears hint state", () => {
    const store = createMemoryKVStore();

    expect(readHintsState(store)).toEqual({});
    writeHintsState(store, {
      ftux_open_search: {
        shownCount: 1,
        lastShownAt: 100,
        dismissedAt: 200,
        completedAt: 300,
        snoozedUntil: 400,
      },
    });
    expect(getHintState(store, "ftux_open_search")).toEqual({
      shownCount: 1,
      lastShownAt: 100,
      dismissedAt: 200,
      completedAt: 300,
      snoozedUntil: 400,
    });

    store.setString(
      "hub_hints_v1",
      JSON.stringify({ ftux_open_chat: { shownCount: "bad" } }),
    );
    expect(getHintState(store, "ftux_open_chat")).toEqual({ shownCount: 0 });

    store.setString("hub_hints_v1", "not-json");
    expect(readHintsState(store)).toEqual({});

    setHintState(store, "module_first_open", { shownCount: 2 });
    expect(getHintState(store, "module_first_open")).toEqual({
      shownCount: 2,
    });
    clearHintState(store, "module_first_open");
    expect(getHintState(store, "module_first_open")).toEqual({
      shownCount: 0,
    });
    clearAllHintsState(store);
    expect(store.getString("hub_hints_v1")).toBeNull();
  });

  it("returns precise canShowHint reasons", () => {
    const store = createMemoryKVStore();
    const now = () => 1_000_000;

    expect(canShowHint(store, "unknown" as HintId, HUB_WEB, now)).toEqual({
      ok: false,
      reason: "unknown_hint",
    });
    expect(canShowHint(store, "settings_hints_toggle", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "wrong_surface",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: HINT_DEFINITIONS.ftux_open_search.maxShowsTotal,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "max_shows_reached",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: 1,
      lastShownAt: now() - 60_000,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "cooldown_active",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: 1,
      lastShownAt: now() - 25 * 60 * 60 * 1000,
      dismissedAt: now() - 60_000,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "dismiss_cooldown_active",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: 1,
      completedAt: now() - 1,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "completed",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: 1,
      snoozedUntil: now() + 1,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: false,
      reason: "snoozed",
    });

    setHintState(store, "ftux_open_search", {
      shownCount: 1,
      lastShownAt: now() - 25 * 60 * 60 * 1000,
      dismissedAt: now() - 15 * 24 * 60 * 60 * 1000,
      snoozedUntil: now() - 1,
    });
    expect(canShowHint(store, "ftux_open_search", HUB_WEB, now)).toEqual({
      ok: true,
    });
  });

  it("records shown, dismissed, completed and snoozed states", () => {
    const store = createMemoryKVStore();
    const now = () => 1234;

    expect(recordHintShown(store, "ftux_open_chat", now)).toEqual({
      shownCount: 1,
      lastShownAt: 1234,
    });
    expect(recordHintShown(store, "ftux_open_chat", now)).toEqual({
      shownCount: 2,
      lastShownAt: 1234,
    });
    expect(recordHintDismissed(store, "ftux_open_chat", now)).toMatchObject({
      shownCount: 2,
      dismissedAt: 1234,
    });
    expect(recordHintCompleted(store, "ftux_open_chat", now)).toMatchObject({
      shownCount: 2,
      completedAt: 1234,
    });
    expect(snoozeHint(store, "ftux_open_chat", 5000)).toMatchObject({
      snoozedUntil: 5000,
    });
    expect(snoozeHint(store, "ftux_open_chat", Number.NaN)).toMatchObject({
      snoozedUntil: 5000,
    });
  });

  it("maps retention day hooks exactly", () => {
    const firstEntryAt = Date.UTC(2026, 5, 20);

    expect(getRetentionHintId(firstEntryAt, firstEntryAt)).toBe(
      "retention_day_1",
    );
    expect(
      getRetentionHintId(firstEntryAt, firstEntryAt + 3 * 86_400_000),
    ).toBe("retention_day_3");
    expect(
      getRetentionHintId(firstEntryAt, firstEntryAt + 7 * 86_400_000),
    ).toBe("retention_day_7");
    expect(
      getRetentionHintId(firstEntryAt, firstEntryAt + 2 * 86_400_000),
    ).toBe(null);
  });

  it("picks the first eligible hint from caller priority", () => {
    const store = createMemoryKVStore();
    const now = () => 1_000_000;

    setHintState(store, "ftux_open_search", {
      shownCount: HINT_DEFINITIONS.ftux_open_search.maxShowsTotal,
    });

    expect(
      pickNextHint(
        store,
        ["settings_hints_toggle", "ftux_open_search", "ftux_open_chat"],
        HUB_WEB,
        now,
      ),
    ).toBe("ftux_open_chat");

    setHintState(store, "ftux_open_chat", {
      shownCount: HINT_DEFINITIONS.ftux_open_chat.maxShowsTotal,
    });
    expect(
      pickNextHint(store, ["ftux_open_search", "ftux_open_chat"], HUB_WEB, now),
    ).toBeNull();
  });

  it("falls back to Date.now when injected now throws", () => {
    const store = createMemoryKVStore();
    const before = Date.now();
    const shown = recordHintShown(store, "ftux_open_search", () => {
      throw new Error("clock down");
    });
    const after = Date.now();

    expect(shown.lastShownAt).toBeGreaterThanOrEqual(before);
    expect(shown.lastShownAt).toBeLessThanOrEqual(after);
  });
});
