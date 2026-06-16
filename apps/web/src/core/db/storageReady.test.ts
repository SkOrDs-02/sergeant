// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetStorageReadyForTests,
  getStorageReadySnapshot,
  markStorageBooting,
  markStorageReady,
  useStorageReady,
} from "./storageReady";

describe("storageReady latch", () => {
  beforeEach(() => {
    __resetStorageReadyForTests();
  });
  afterEach(() => {
    __resetStorageReadyForTests();
  });

  it("defaults to ready (optimistic) so non-boot mounts never block on a bootstrap that will never fire", () => {
    expect(getStorageReadySnapshot()).toBe(true);
  });

  it("markStorageBooting() arms the gate; markStorageReady() releases it", () => {
    markStorageBooting();
    expect(getStorageReadySnapshot()).toBe(false);

    markStorageReady();
    expect(getStorageReadySnapshot()).toBe(true);
  });

  it("useStorageReady() re-renders subscribers across the boot → ready transition", () => {
    markStorageBooting();
    const { result } = renderHook(() => useStorageReady());
    expect(result.current).toBe(false);

    act(() => {
      markStorageReady();
    });
    expect(result.current).toBe(true);
  });

  it("is idempotent — repeat calls do not thrash the snapshot", () => {
    markStorageBooting();
    markStorageBooting();
    expect(getStorageReadySnapshot()).toBe(false);

    markStorageReady();
    markStorageReady();
    expect(getStorageReadySnapshot()).toBe(true);
  });
});
