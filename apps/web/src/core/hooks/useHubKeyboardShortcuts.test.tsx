/** @vitest-environment jsdom */
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHubKeyboardShortcuts } from "./useHubKeyboardShortcuts";

describe("useHubKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("opens Hub Search on Ctrl+K", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  it("opens keyboard shortcuts on ?", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(window, { key: "?", shiftKey: true });

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  it("does not steal shortcuts from editable fields", () => {
    const onOpenSearch = vi.fn();
    const onOpenShortcuts = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    renderHook(() =>
      useHubKeyboardShortcuts({ onOpenSearch, onOpenShortcuts }),
    );

    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    fireEvent.keyDown(input, { key: "?", shiftKey: true });

    expect(onOpenSearch).not.toHaveBeenCalled();
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });
});
