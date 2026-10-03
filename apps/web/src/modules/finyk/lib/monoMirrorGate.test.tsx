// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetFinykMonoMirrorGateForTests,
  notifyFinykMonoMirrorRefresh,
  useFinykMonoMirrorTick,
} from "./monoMirrorGate";

afterEach(() => {
  __resetFinykMonoMirrorGateForTests();
});

describe("monoMirrorGate", () => {
  it("increments subscribed React snapshots when the mirror refreshes", () => {
    const { result, unmount } = renderHook(() => useFinykMonoMirrorTick());

    expect(result.current).toBe(0);

    act(() => {
      notifyFinykMonoMirrorRefresh();
      notifyFinykMonoMirrorRefresh();
    });
    expect(result.current).toBe(2);

    unmount();
    act(() => {
      notifyFinykMonoMirrorRefresh();
    });
    expect(result.current).toBe(2);
  });

  it("resets tick state for isolated specs", () => {
    notifyFinykMonoMirrorRefresh();
    __resetFinykMonoMirrorGateForTests();

    const { result } = renderHook(() => useFinykMonoMirrorTick());

    expect(result.current).toBe(0);
  });
});
