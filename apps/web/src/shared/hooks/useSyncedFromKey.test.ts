// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSyncedFromKey } from "./useSyncedFromKey";

describe("useSyncedFromKey", () => {
  it("does not call apply on the initial render", () => {
    const apply = vi.fn();
    renderHook(({ key }) => useSyncedFromKey(key, apply), {
      initialProps: { key: "a" },
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("calls apply once when the key changes", () => {
    const apply = vi.fn();
    const { rerender } = renderHook(({ key }) => useSyncedFromKey(key, apply), {
      initialProps: { key: "a" },
    });
    rerender({ key: "b" });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("does not call apply when the key stays the same", () => {
    const apply = vi.fn();
    const { rerender } = renderHook(({ key }) => useSyncedFromKey(key, apply), {
      initialProps: { key: "a" },
    });
    rerender({ key: "a" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("calls apply on each distinct key change", () => {
    const apply = vi.fn();
    const { rerender } = renderHook(({ key }) => useSyncedFromKey(key, apply), {
      initialProps: { key: "a" },
    });
    rerender({ key: "b" });
    rerender({ key: "c" });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("uses the current render's apply closure", () => {
    const results: string[] = [];
    const { rerender } = renderHook(
      ({ key, label }) =>
        useSyncedFromKey(key, () => {
          results.push(label);
        }),
      { initialProps: { key: "a", label: "first" } },
    );
    rerender({ key: "b", label: "second" });
    expect(results).toEqual(["second"]);
  });
});
