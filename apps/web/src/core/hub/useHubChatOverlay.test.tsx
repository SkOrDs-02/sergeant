/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  HubChatOverlayProvider,
  useHubChatOverlay,
  useHubChatOverlayState,
} from "./useHubChatOverlay";

describe("useHubChatOverlayState", () => {
  it("opens with optional initial message and resets on close", () => {
    const { result } = renderHook(() => useHubChatOverlayState());

    expect(result.current.open).toBe(false);
    act(() => {
      result.current.openChat({
        initialMessage: "Порахуй витрати",
        autoSend: true,
      });
    });

    expect(result.current.open).toBe(true);
    expect(result.current.initialMessage).toBe("Порахуй витрати");
    expect(result.current.autoSendInitial).toBe(true);

    act(() => {
      result.current.closeChat();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.initialMessage).toBe("");
    expect(result.current.autoSendInitial).toBe(false);
  });

  it("opens with empty defaults when no options are provided", () => {
    const { result } = renderHook(() => useHubChatOverlayState());

    act(() => {
      result.current.openChat();
    });

    expect(result.current.open).toBe(true);
    expect(result.current.initialMessage).toBe("");
    expect(result.current.autoSendInitial).toBe(false);
  });
});

describe("useHubChatOverlay", () => {
  it("returns the provider value when mounted under HubChatOverlayProvider", () => {
    const api = {
      open: true,
      initialMessage: "Привіт",
      autoSendInitial: false,
      openChat: vi.fn(),
      closeChat: vi.fn(),
    };

    const { result } = renderHook(() => useHubChatOverlay(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <HubChatOverlayProvider value={api}>{children}</HubChatOverlayProvider>
      ),
    });

    expect(result.current).toBe(api);
  });

  it("returns a noop fallback outside the provider", () => {
    const { result } = renderHook(() => useHubChatOverlay());

    expect(result.current.open).toBe(false);
    expect(() =>
      result.current.openChat({ initialMessage: "x" }),
    ).not.toThrow();
    expect(() => result.current.closeChat()).not.toThrow();
  });
});
