// @vitest-environment jsdom
/**
 * Tests for `picksStorage` — the v2 picks-only onboarding persistence.
 *
 * Focus is the branchy `loadPersistedPicks` empty-state resolver (the
 * `"none"` vs `"all"` variant fork across missing / malformed / empty /
 * valid payloads), plus the round-trip persist/clear helpers. Runs against
 * the real `@shared/storage` wrapper on jsdom localStorage.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ONBOARDING_PICKS_STATE_KEY,
  clearPersistedPicks,
  loadPersistedPicks,
  persistPicks,
} from "./picksStorage";
import { ALL_MODULES } from "./vibePicks";

describe("picksStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadPersistedPicks empty-state resolver", () => {
    it("missing payload → [] for the 'none' variant", () => {
      expect(loadPersistedPicks("none")).toEqual([]);
    });

    it("missing payload → all modules for the 'all' variant", () => {
      expect(loadPersistedPicks("all")).toEqual([...ALL_MODULES]);
    });

    it("empty picks array falls back to the variant default", () => {
      localStorage.setItem(
        ONBOARDING_PICKS_STATE_KEY,
        JSON.stringify({ picks: [] }),
      );
      expect(loadPersistedPicks("none")).toEqual([]);
      expect(loadPersistedPicks("all")).toEqual([...ALL_MODULES]);
    });

    it("malformed JSON falls back to the variant default", () => {
      localStorage.setItem(ONBOARDING_PICKS_STATE_KEY, "{not json");
      expect(loadPersistedPicks("none")).toEqual([]);
      expect(loadPersistedPicks("all")).toEqual([...ALL_MODULES]);
    });

    it("non-object / non-array picks falls back to the variant default", () => {
      localStorage.setItem(
        ONBOARDING_PICKS_STATE_KEY,
        JSON.stringify({ picks: "finyk" }),
      );
      expect(loadPersistedPicks("none")).toEqual([]);
    });

    it("filters valid picks against the known module list", () => {
      const valid = ALL_MODULES[0]!;
      localStorage.setItem(
        ONBOARDING_PICKS_STATE_KEY,
        JSON.stringify({ picks: [valid, "bogus_module", 42, null] }),
      );
      expect(loadPersistedPicks("none")).toEqual([valid]);
    });
  });

  it("persistPicks → loadPersistedPicks round-trips a valid selection", () => {
    const selection = [...ALL_MODULES].slice(0, 2);
    persistPicks(selection);
    expect(loadPersistedPicks("none")).toEqual(selection);
  });

  it("clearPersistedPicks removes the blob so the resolver returns the default", () => {
    persistPicks([...ALL_MODULES].slice(0, 1));
    clearPersistedPicks();
    expect(loadPersistedPicks("none")).toEqual([]);
    expect(localStorage.getItem(ONBOARDING_PICKS_STATE_KEY)).toBeNull();
  });
});
