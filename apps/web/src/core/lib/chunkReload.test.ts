/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  ChunkPersistentError,
  MAX_RELOADS,
  RESET_AFTER_MS,
  isChunkLoadError,
  reloadOnceForChunkError,
  installChunkLoadRecover,
  __resetChunkReloadInstalledForTests,
} from "./chunkReload";

describe("isChunkLoadError", () => {
  it("matches Vite dynamic import error message", () => {
    const err = new TypeError(
      "Failed to fetch dynamically imported module: https://x/assets/Page-a.js",
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("matches Webpack-style ChunkLoadError name", () => {
    const err = Object.assign(new Error("boom"), { name: "ChunkLoadError" });
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("matches Safari 'module script failed' wording", () => {
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
  });

  it("matches MIME-type rejection from SPA-fallback HTML", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Refused to apply style: 'text/html' is not a valid JavaScript MIME type.",
        ),
      ),
    ).toBe(true);
  });

  it("matches Loading chunk N failed", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isChunkLoadError(new Error("network down"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError("just a string")).toBe(false);
  });

  it("treats raw string with chunk pattern as match", () => {
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module: x.js"),
    ).toBe(true);
  });
});

describe("reloadOnceForChunkError", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    sessionStorage.clear();
    originalLocation = window.location;
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("reloads once and stamps sessionStorage", () => {
    expect(reloadOnceForChunkError(1_000)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("__sergeant_chunk_reload_at")).toBe("1000");
  });

  it("blocks reload within cooldown window (10s)", () => {
    expect(reloadOnceForChunkError(1_000)).toBe(true);
    expect(reloadOnceForChunkError(5_000)).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("allows reload after cooldown window passes", () => {
    expect(reloadOnceForChunkError(1_000)).toBe(true);
    expect(reloadOnceForChunkError(11_001)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  describe("MAX_RELOADS counter-window guard (PR-36 / L9)", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let persistentEventSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      persistentEventSpy = vi.fn();
      window.addEventListener(
        "sergeant:chunk-persistent-error",
        persistentEventSpy as EventListener,
      );
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      window.removeEventListener(
        "sergeant:chunk-persistent-error",
        persistentEventSpy as EventListener,
      );
    });

    it(`refuses reload after MAX_RELOADS (${MAX_RELOADS}) within window`, () => {
      // 4 reload-events spaced 11s apart so each clears the 10s cooldown.
      // First MAX_RELOADS succeed (counter incremented each time); the
      // (MAX_RELOADS+1)-th must be blocked.
      const base = 100_000;
      for (let i = 0; i < MAX_RELOADS; i++) {
        expect(reloadOnceForChunkError(base + i * 11_000)).toBe(true);
      }
      expect(reloadSpy).toHaveBeenCalledTimes(MAX_RELOADS);

      // (MAX_RELOADS + 1)-th attempt — refused.
      expect(reloadOnceForChunkError(base + MAX_RELOADS * 11_000)).toBe(false);
      expect(reloadSpy).toHaveBeenCalledTimes(MAX_RELOADS);

      // Side-channels: console.error + custom event for the UI/Sentry.
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(persistentEventSpy).toHaveBeenCalledTimes(1);
      const dispatchedEvent = persistentEventSpy.mock
        .calls[0]![0] as CustomEvent<{
        reloadCount: number;
        error: ChunkPersistentError;
      }>;
      expect(dispatchedEvent.detail.reloadCount).toBe(MAX_RELOADS);
      expect(dispatchedEvent.detail.error).toBeInstanceOf(ChunkPersistentError);
      expect(dispatchedEvent.detail.error.name).toBe("ChunkPersistentError");
    });

    it(`resets counter after RESET_AFTER_MS (${RESET_AFTER_MS / 60_000}min) of quiet`, () => {
      // Burn through MAX_RELOADS.
      const base = 100_000;
      for (let i = 0; i < MAX_RELOADS; i++) {
        expect(reloadOnceForChunkError(base + i * 11_000)).toBe(true);
      }
      // Refused immediately after — verifies the limit is in force.
      expect(reloadOnceForChunkError(base + MAX_RELOADS * 11_000)).toBe(false);

      // Silence > RESET_AFTER_MS — counter must reset on next attempt.
      const afterReset = base + RESET_AFTER_MS + 60_000;
      expect(reloadOnceForChunkError(afterReset)).toBe(true);
      // Still allowed for further (MAX_RELOADS - 1) attempts in new window.
      for (let i = 1; i < MAX_RELOADS; i++) {
        expect(reloadOnceForChunkError(afterReset + i * 11_000)).toBe(true);
      }
      expect(reloadSpy).toHaveBeenCalledTimes(MAX_RELOADS * 2);
    });

    it("counter and time-cooldown coexist — cooldown blocks first, counter caps later", () => {
      // First reload succeeds.
      expect(reloadOnceForChunkError(1_000)).toBe(true);
      // Within 10s cooldown — blocked by Layer 1, counter NOT bumped.
      expect(reloadOnceForChunkError(5_000)).toBe(false);
      expect(reloadOnceForChunkError(9_000)).toBe(false);
      // After cooldown — second reload bumps counter.
      expect(reloadOnceForChunkError(12_000)).toBe(true);
      expect(reloadSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("installChunkLoadRecover", () => {
  let originalLocation: Location;
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetChunkReloadInstalledForTests();
    sessionStorage.clear();
    originalLocation = window.location;
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("reloads on vite:preloadError and prevents default", () => {
    installChunkLoadRecover();
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reloads on unhandledrejection with chunk-load reason", () => {
    installChunkLoadRecover();
    const reason = new TypeError(
      "Failed to fetch dynamically imported module: x.js",
    );
    // Build event manually — happy-dom doesn't ship PromiseRejectionEvent.
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as Event & { reason: unknown };
    Object.defineProperty(event, "reason", { value: reason });
    window.dispatchEvent(event);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores unrelated unhandledrejection", () => {
    installChunkLoadRecover();
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as Event & { reason: unknown };
    Object.defineProperty(event, "reason", { value: new Error("network") });
    window.dispatchEvent(event);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("is idempotent across multiple installs", () => {
    installChunkLoadRecover();
    installChunkLoadRecover();
    installChunkLoadRecover();
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    // Якби listeners додались тричі — reload позвався б тричі (один з них
    // зашпорить cooldown, але вже після першого виклику; зараз — рівно 1).
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
