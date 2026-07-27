// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useListSelection } from "./useListSelection";

describe("useListSelection (R2-UX-12)", () => {
  it("starts empty and not in select mode", () => {
    const { result } = renderHook(() => useListSelection<string>());
    expect(result.current.selectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectedCount).toBe(0);
  });

  it("toggles an id in and out of the selection", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => result.current.toggleSelect("a"));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    act(() => result.current.toggleSelect("a"));
    expect(result.current.selectedIds.has("a")).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it("supports multiple selected ids", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => {
      result.current.toggleSelect("a");
      result.current.toggleSelect("b");
      result.current.toggleSelect("c");
    });
    expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("selectAll adds every id to the current selection", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.selectAll(["b", "c"]));
    expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("isSelected reflects membership", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => result.current.toggleSelect("x"));
    expect(result.current.isSelected("x")).toBe(true);
    expect(result.current.isSelected("y")).toBe(false);
  });

  it("clearSelection empties the set but stays in select mode", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => {
      result.current.setSelectMode(true);
      result.current.toggleSelect("a");
    });
    act(() => result.current.clearSelection());
    expect(result.current.selectMode).toBe(true);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("exitSelectMode resets both selectMode and the set", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => {
      result.current.setSelectMode(true);
      result.current.toggleSelect("a");
    });
    expect(result.current.selectMode).toBe(true);
    expect(result.current.selectedIds.size).toBe(1);
    act(() => result.current.exitSelectMode());
    expect(result.current.selectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("turning select mode OFF via setSelectMode also clears the set", () => {
    const { result } = renderHook(() => useListSelection<string>());
    act(() => {
      result.current.setSelectMode(true);
      result.current.toggleSelect("a");
    });
    act(() => result.current.setSelectMode(false));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("keeps stable identities for toggleSelect/exitSelectMode across renders", () => {
    const { result, rerender } = renderHook(() => useListSelection<string>());
    const toggle1 = result.current.toggleSelect;
    const exit1 = result.current.exitSelectMode;
    act(() => result.current.toggleSelect("a"));
    rerender();
    expect(result.current.toggleSelect).toBe(toggle1);
    expect(result.current.exitSelectMode).toBe(exit1);
  });

  it("works with numeric ids too", () => {
    const { result } = renderHook(() => useListSelection<number>());
    act(() => result.current.toggleSelect(42));
    expect(result.current.isSelected(42)).toBe(true);
  });
});
