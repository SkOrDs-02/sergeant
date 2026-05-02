/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
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
