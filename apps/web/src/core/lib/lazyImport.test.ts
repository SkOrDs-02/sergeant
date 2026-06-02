/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ComponentType } from "react";

import { lazyImport, lazyDefault } from "./lazyImport";
import { isChunkLoadError } from "./chunkReload";

function Hello() {
  return createElement("span", null, "hello");
}

/**
 * `React.lazy` exposes its loader thenable via the internal `_payload` field.
 * Vendoring that detail in the test (rather than spinning up a renderer)
 * keeps the unit test fast and platform-independent — we only need to
 * assert the loader's eventual settlement, not React's render pipeline.
 */
function getLoaderPromise(
  Lazy: ReturnType<typeof lazyImport> | ReturnType<typeof lazyDefault>,
): Promise<unknown> {
  const payload = (Lazy as unknown as { _payload: { _result: unknown } })
    ._payload;
  const result = payload._result;
  if (typeof result === "function") {
    return Promise.resolve((result as () => Promise<unknown>)());
  }
  if (result && typeof (result as { then?: unknown }).then === "function") {
    return result as Promise<unknown>;
  }
  return Promise.resolve(result);
}

describe("lazyImport", () => {
  // `recoverFromStaleChunk` calls `window.location.reload()` through
  // `reloadOnceForChunkError`. JSDOM throws "Not implemented" on real
  // reloads, so we stub the whole `location` to a no-op double for the
  // undefined-module cases. Other tests don't need this — they never
  // hit the recovery path.
  let originalLocation: Location;
  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
    // Reset chunkReload session-storage counters between tests so the
    // cooldown / MAX_RELOADS guards don't carry over and prevent reload
    // (which would change the observable side-effect under test).
    window.sessionStorage.clear();
  });
  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("returns the named export wrapped as a default-export module", async () => {
    const Lazy = lazyImport(async () => ({ Hello }), "Hello");
    const resolved = (await getLoaderPromise(Lazy)) as {
      default: ComponentType<unknown>;
    };
    expect(resolved.default).toBe(Hello);
  });

  it("throws ChunkLoadError when module resolves to undefined (vite preload-error suppression)", async () => {
    // Reproduces the real failure mode: `chunkReload.ts` preventDefault'd
    // the `vite:preloadError`, so Vite's preload helper resolves the
    // dynamic import with `undefined`. The previous strategy was to
    // hang Suspense forever; that left the user permanently stuck when
    // the chunkReload reload-guard suppressed the recovery reload (real
    // incident 2026-05-16). The new contract: throw a ChunkLoadError so
    // ErrorBoundary surfaces a visible fallback and the global
    // unhandledrejection handler counts it toward Sentry telemetry.
    const Lazy = lazyImport(
      async () => undefined as unknown as { Hello: typeof Hello },
      "Hello",
    );

    await expect(getLoaderPromise(Lazy)).rejects.toSatisfy((err: unknown) =>
      isChunkLoadError(err),
    );
  });

  it("triggers a single location.reload() when the module resolves to undefined", async () => {
    const reload = window.location.reload as ReturnType<typeof vi.fn>;
    const Lazy = lazyImport(
      async () => undefined as unknown as { Hello: typeof Hello },
      "Hello",
    );
    await getLoaderPromise(Lazy).catch(() => {
      /* expected — see assertion below */
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("propagates real loader rejections to React.lazy unchanged", async () => {
    const boom = new Error("real chunk load failure");
    const Lazy = lazyImport<{ Hello: typeof Hello }, "Hello">(
      () => Promise.reject(boom),
      "Hello",
    );

    await expect(getLoaderPromise(Lazy)).rejects.toBe(boom);
  });
});

describe("lazyDefault", () => {
  let originalLocation: Location;
  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });
    window.sessionStorage.clear();
  });
  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("passes through a real { default: Component } payload", async () => {
    const Lazy = lazyDefault(async () => ({ default: Hello }));
    const resolved = (await getLoaderPromise(Lazy)) as {
      default: ComponentType<unknown>;
    };
    expect(resolved.default).toBe(Hello);
  });

  it("throws ChunkLoadError when the module resolves to undefined", async () => {
    const Lazy = lazyDefault(
      async () => undefined as unknown as { default: typeof Hello },
    );

    await expect(getLoaderPromise(Lazy)).rejects.toSatisfy((err: unknown) =>
      isChunkLoadError(err),
    );
  });

  it("propagates real loader rejections unchanged", async () => {
    const boom = new Error("real chunk load failure");
    const Lazy = lazyDefault<typeof Hello>(() => Promise.reject(boom));
    await expect(getLoaderPromise(Lazy)).rejects.toBe(boom);
  });
});
