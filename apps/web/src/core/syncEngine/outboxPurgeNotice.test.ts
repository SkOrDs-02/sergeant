/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetOutboxPurgeNoticeForTests,
  dismissOutboxPurgeNotice,
  OUTBOX_PURGE_NOTICE_KEY,
  readOutboxPurgeNotice,
  recordOutboxPurgeNotice,
} from "./outboxPurgeNotice";

describe("outboxPurgeNotice", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetOutboxPurgeNoticeForTests();
  });
  afterEach(() => {
    window.localStorage.clear();
    __resetOutboxPurgeNoticeForTests();
  });

  it("returns null when nothing has been purged", () => {
    expect(readOutboxPurgeNotice()).toBeNull();
  });

  it("ignores non-positive or non-finite counts", () => {
    recordOutboxPurgeNotice(0);
    recordOutboxPurgeNotice(-3);
    recordOutboxPurgeNotice(Number.NaN);
    expect(readOutboxPurgeNotice()).toBeNull();
  });

  it("records a purge with the count and a timestamp", () => {
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    recordOutboxPurgeNotice(5);
    const notice = readOutboxPurgeNotice();
    expect(notice).not.toBeNull();
    expect(notice?.purged).toBe(5);
    expect(notice?.purgedAtIso).toBe("2026-09-13T10:00:00.000Z");
    vi.useRealTimers();
  });

  it("accumulates across multiple sweeps in the same session", () => {
    recordOutboxPurgeNotice(2);
    recordOutboxPurgeNotice(3);
    expect(readOutboxPurgeNotice()?.purged).toBe(5);
  });

  it("survives a fresh module read from storage (simulated reload)", () => {
    recordOutboxPurgeNotice(7);
    // Simulate a fresh page load: drop the in-memory cache, keep storage.
    __resetOutboxPurgeNoticeForTests();
    expect(readOutboxPurgeNotice()?.purged).toBe(7);
  });

  it("clears the notice on dismiss", () => {
    recordOutboxPurgeNotice(4);
    dismissOutboxPurgeNotice();
    expect(readOutboxPurgeNotice()).toBeNull();
    expect(window.localStorage.getItem(OUTBOX_PURGE_NOTICE_KEY)).toBeNull();
  });
});
