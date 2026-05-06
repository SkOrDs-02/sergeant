/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  WHATS_NEW_LAST_SEEN_KEY,
  readLastSeenId,
  writeLastSeenId,
} from "./storage";

describe("whatsNew/storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing has been seen yet", () => {
    expect(readLastSeenId()).toBeNull();
  });

  it("round-trips a release id without JSON quoting", () => {
    const ok = writeLastSeenId("2026-05-06-cold-start");
    expect(ok).toBe(true);
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBe(
      "2026-05-06-cold-start",
    );
    expect(readLastSeenId()).toBe("2026-05-06-cold-start");
  });

  it("rejects empty id (corrupt callsite, never persists)", () => {
    expect(writeLastSeenId("")).toBe(false);
    expect(readLastSeenId()).toBeNull();
  });

  it("overwrites previous id when newer release lands", () => {
    writeLastSeenId("2026-05-06-cold-start");
    writeLastSeenId("2026-06-01-mobile-parity");
    expect(readLastSeenId()).toBe("2026-06-01-mobile-parity");
  });
});
