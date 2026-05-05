// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATION_DONE_KEY } from "../config";
import { isMigrationDone, markMigrationDone } from "./migration";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("isMigrationDone / markMigrationDone", () => {
  it("reports not done when no record exists", () => {
    expect(isMigrationDone("u1")).toBe(false);
  });

  it("flags done after markMigrationDone", () => {
    markMigrationDone("u1");
    expect(isMigrationDone("u1")).toBe(true);
  });

  it("ignores empty / nullish userId on read", () => {
    markMigrationDone("u1");
    expect(isMigrationDone(null)).toBe(false);
    expect(isMigrationDone(undefined)).toBe(false);
    expect(isMigrationDone("")).toBe(false);
  });

  it("ignores empty / nullish userId on write", () => {
    markMigrationDone(null);
    markMigrationDone(undefined);
    markMigrationDone("");
    expect(localStorage.getItem(MIGRATION_DONE_KEY)).toBeNull();
  });

  it("isolates state per user", () => {
    markMigrationDone("u1");
    expect(isMigrationDone("u1")).toBe(true);
    expect(isMigrationDone("u2")).toBe(false);
  });

  it("stores an ISO timestamp per user", () => {
    const before = Date.now();
    markMigrationDone("u1");
    const after = Date.now();
    const raw = localStorage.getItem(MIGRATION_DONE_KEY);
    expect(raw).not.toBeNull();
    const map = JSON.parse(raw as string) as Record<string, string>;
    const ts = Date.parse(map.u1!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("tolerates corrupted MIGRATION_DONE_KEY on read and write", () => {
    localStorage.setItem(MIGRATION_DONE_KEY, "{broken");
    expect(isMigrationDone("u1")).toBe(false);
    markMigrationDone("u1");
    expect(isMigrationDone("u1")).toBe(true);
  });
});
