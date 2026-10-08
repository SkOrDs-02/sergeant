// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLatestRef } from "./useLatestRef";

describe("useLatestRef", () => {
  it("віддає значення поточного рендера і стабільну ідентичність ref", () => {
    const { result, rerender } = renderHook(({ v }) => useLatestRef(v), {
      initialProps: { v: 1 },
    });
    const first = result.current;
    expect(first.current).toBe(1);
    rerender({ v: 2 });
    expect(result.current).toBe(first);
    expect(result.current.current).toBe(2);
  });
});
