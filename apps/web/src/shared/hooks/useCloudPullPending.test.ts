// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCloudPullPending } from "./useCloudPullPending";
import {
  requestCloudPull,
  emitCloudPullComplete,
  __resetCloudPullPendingForTests,
  PULL_COMPLETE_EVENT,
} from "@shared/lib/modules/cloudPullRequest";

afterEach(() => {
  __resetCloudPullPendingForTests();
});

describe("useCloudPullPending", () => {
  it("starts as false when no pull is in flight", () => {
    const { result } = renderHook(() => useCloudPullPending());
    expect(result.current).toBe(false);
  });

  it("flips to true while a requestCloudPull() is in flight, then back to false on completion", async () => {
    const { result } = renderHook(() => useCloudPullPending());

    let pullPromise!: Promise<void>;
    act(() => {
      pullPromise = requestCloudPull(5000);
    });
    await waitFor(() => expect(result.current).toBe(true));

    act(() => {
      emitCloudPullComplete();
    });
    await pullPromise;
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("stays true while at least one of two overlapping pulls is pending", async () => {
    const { result } = renderHook(() => useCloudPullPending());

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = requestCloudPull(5000);
      second = requestCloudPull(5000);
    });
    await waitFor(() => expect(result.current).toBe(true));

    // First completion event resolves the single listener via `once`, but
    // both promises listen once each — dispatch twice to settle both.
    act(() => {
      window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
      window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
    });
    await Promise.all([first, second]);
    await waitFor(() => expect(result.current).toBe(false));
  });
});
