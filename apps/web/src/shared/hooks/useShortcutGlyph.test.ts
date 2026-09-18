/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useShortcutGlyph } from "./useShortcutGlyph";

afterEach(cleanup);

const ORIGINAL_PLATFORM = navigator.platform;
const ORIGINAL_USER_AGENT = navigator.userAgent;

function spoofPlatform(platform: string, userAgent = ORIGINAL_USER_AGENT) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

function restorePlatform() {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: ORIGINAL_PLATFORM,
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ORIGINAL_USER_AGENT,
  });
}

afterEach(restorePlatform);

describe("useShortcutGlyph", () => {
  it("returns Ctrl on Linux", () => {
    spoofPlatform("Linux x86_64");
    const { result } = renderHook(() => useShortcutGlyph());
    expect(result.current.mod).toBe("Ctrl");
    expect(result.current.modK).toBe("Ctrl+K");
    expect(result.current.isApple).toBe(false);
  });

  it("returns ⌘ on macOS", () => {
    spoofPlatform("MacIntel");
    const { result } = renderHook(() => useShortcutGlyph());
    expect(result.current.mod).toBe("⌘");
    expect(result.current.modK).toBe("⌘K");
    expect(result.current.isApple).toBe(true);
  });

  it("returns ⌘ on iPadOS via userAgent", () => {
    spoofPlatform("iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)");
    const { result } = renderHook(() => useShortcutGlyph());
    expect(result.current.mod).toBe("⌘");
    expect(result.current.modK).toBe("⌘K");
    expect(result.current.isApple).toBe(true);
  });

  it("returns Ctrl on Windows", () => {
    spoofPlatform("Win32");
    const { result } = renderHook(() => useShortcutGlyph());
    expect(result.current.mod).toBe("Ctrl");
    expect(result.current.modK).toBe("Ctrl+K");
    expect(result.current.isApple).toBe(false);
  });
});
