/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  REQUEST_PULL_EVENT,
  PULL_COMPLETE_EVENT,
  requestCloudPull,
  emitCloudPullComplete,
  getCloudPullPending,
  subscribeCloudPullPending,
  __resetCloudPullPendingForTests,
  CloudPullError,
} from "./cloudPullRequest";

beforeEach(() => {
  __resetCloudPullPendingForTests();
});

describe("cloudPullRequest", () => {
  it("dispatches REQUEST_PULL_EVENT on the window when requestCloudPull() is called", async () => {
    const seen: string[] = [];
    const handler = () => seen.push(REQUEST_PULL_EVENT);
    window.addEventListener(REQUEST_PULL_EVENT, handler);
    try {
      const pending = requestCloudPull(50);
      // Synchronously the request event should already have been fired.
      expect(seen).toContain(REQUEST_PULL_EVENT);
      // After timeout the promise still resolves.
      await pending;
    } finally {
      window.removeEventListener(REQUEST_PULL_EVENT, handler);
    }
  });

  it("resolves immediately when emitCloudPullComplete() is called", async () => {
    const pending = requestCloudPull(5000);

    // Simulate the App-level compatibility listener settling the request.
    setTimeout(() => emitCloudPullComplete(), 10);

    const start = Date.now();
    await pending;
    const elapsed = Date.now() - start;
    // Should resolve well under the 5s timeout.
    expect(elapsed).toBeLessThan(2000);
  });

  it("falls back to timeout if no listener responds", async () => {
    vi.useFakeTimers();
    try {
      const pending = requestCloudPull(150);
      vi.advanceTimersByTime(200);
      await pending; // should resolve, not hang.
    } finally {
      vi.useRealTimers();
    }
  });

  it("emitCloudPullComplete dispatches PULL_COMPLETE_EVENT", () => {
    let seen = false;
    const handler = () => {
      seen = true;
    };
    window.addEventListener(PULL_COMPLETE_EVENT, handler);
    try {
      emitCloudPullComplete();
      expect(seen).toBe(true);
    } finally {
      window.removeEventListener(PULL_COMPLETE_EVENT, handler);
    }
  });
});

// PR-H3 tail (2026-11-17): a failed tick must reach `PullToRefresh`
// `onError` instead of looking like a successful refresh.
describe("cloudPullRequest — outcome", () => {
  it("rejects with CloudPullError when the completion reports ok:false", async () => {
    const pending = requestCloudPull(5000);
    emitCloudPullComplete({ ok: false });
    await expect(pending).rejects.toBeInstanceOf(CloudPullError);
    expect(getCloudPullPending()).toBe(false);
  });

  it("resolves when the completion reports ok:true", async () => {
    const pending = requestCloudPull(5000);
    emitCloudPullComplete({ ok: true });
    await expect(pending).resolves.toBeUndefined();
  });

  it("resolves on a bare legacy completion event without detail", async () => {
    const pending = requestCloudPull(5000);
    window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects every overlapping requester from one failed completion", async () => {
    const first = requestCloudPull(5000);
    const second = requestCloudPull(5000);
    emitCloudPullComplete({ ok: false });
    await expect(first).rejects.toBeInstanceOf(CloudPullError);
    await expect(second).rejects.toBeInstanceOf(CloudPullError);
    expect(getCloudPullPending()).toBe(false);
  });

  it("resolves (not rejects) on timeout and ignores a later failure", async () => {
    vi.useFakeTimers();
    try {
      const pending = requestCloudPull(150);
      vi.advanceTimersByTime(200);
      await expect(pending).resolves.toBeUndefined();
      expect(getCloudPullPending()).toBe(false);
      // A failure that lands after the timeout must not flip the
      // already-settled promise or the pending counter.
      emitCloudPullComplete({ ok: false });
      expect(getCloudPullPending()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cloudPullRequest — pending subscription", () => {
  it("flips getCloudPullPending() to true on requestCloudPull and back to false on complete", async () => {
    expect(getCloudPullPending()).toBe(false);

    const pending = requestCloudPull(5000);
    expect(getCloudPullPending()).toBe(true);

    emitCloudPullComplete();
    await pending;
    expect(getCloudPullPending()).toBe(false);
  });

  it("notifies subscribers whenever the pending count transitions to/from zero", async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeCloudPullPending(notify);

    const pending = requestCloudPull(5000);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(getCloudPullPending()).toBe(true);

    emitCloudPullComplete();
    await pending;
    expect(notify).toHaveBeenCalledTimes(2);
    expect(getCloudPullPending()).toBe(false);

    unsubscribe();
  });

  it("never lets the pending counter drop below zero on overlapping settles", async () => {
    const first = requestCloudPull(5000);
    const second = requestCloudPull(5000);
    expect(getCloudPullPending()).toBe(true);

    // A single complete-event settles every listener at once — both
    // requests resolve from one emit; pending counter must hit exactly 0.
    emitCloudPullComplete();
    await Promise.all([first, second]);
    expect(getCloudPullPending()).toBe(false);

    // A spurious extra emit after the queue is drained must not push
    // the counter negative (would otherwise underflow Math.max guard).
    emitCloudPullComplete();
    expect(getCloudPullPending()).toBe(false);
  });
});
