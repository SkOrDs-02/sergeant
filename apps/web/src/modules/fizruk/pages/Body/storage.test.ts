// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  JOURNAL_OPEN_STORAGE_KEY,
  TREND_STORAGE_PREFIX,
  readPersistedOpen,
  readTrendOpen,
  writePersistedOpen,
} from "./storage";

describe("Body/storage helpers", () => {
  beforeEach(() => localStorage.clear());

  describe("readTrendOpen", () => {
    it("returns true only when the stored value is '1'", () => {
      localStorage.setItem(`${TREND_STORAGE_PREFIX}weight`, "1");
      expect(readTrendOpen("weight")).toBe(true);
    });
    it("returns false for any other / missing value", () => {
      expect(readTrendOpen("weight")).toBe(false);
      localStorage.setItem(`${TREND_STORAGE_PREFIX}weight`, "0");
      expect(readTrendOpen("weight")).toBe(false);
    });
  });

  describe("readPersistedOpen", () => {
    it("returns true / false for explicit '1' / '0'", () => {
      writePersistedOpen(JOURNAL_OPEN_STORAGE_KEY, true);
      expect(readPersistedOpen(JOURNAL_OPEN_STORAGE_KEY, false)).toBe(true);
      writePersistedOpen(JOURNAL_OPEN_STORAGE_KEY, false);
      expect(readPersistedOpen(JOURNAL_OPEN_STORAGE_KEY, true)).toBe(false);
    });

    it("falls back when no value is stored", () => {
      expect(readPersistedOpen("missing-key", true)).toBe(true);
      expect(readPersistedOpen("missing-key", false)).toBe(false);
    });
  });

  describe("writePersistedOpen", () => {
    it("persists '1' / '0' round-tripping with readPersistedOpen", () => {
      writePersistedOpen("k", true);
      expect(localStorage.getItem("k")).toBe("1");
      writePersistedOpen("k", false);
      expect(localStorage.getItem("k")).toBe("0");
    });
  });
});
