/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import {
  REQUEST_PULL_EVENT,
  PULL_COMPLETE_EVENT,
  requestCloudPull,
  emitCloudPullComplete,
} from "./cloudPullRequest";

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
