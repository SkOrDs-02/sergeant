/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { createElement, type ComponentType } from "react";

import { lazyImport } from "./lazyImport";

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
  Lazy: ReturnType<typeof lazyImport>,
): Promise<unknown> {
  const payload = (Lazy as unknown as { _payload: { _result: unknown } })
    ._payload;
  // React.lazy stores either the thenable (status === uninitialized) or
  // a settled value. The thenable triggers the underlying loader on first
  // read; calling it manually is enough.
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
  it("returns the named export wrapped as a default-export module", async () => {
    const Lazy = lazyImport(async () => ({ Hello }), "Hello");
    const resolved = (await getLoaderPromise(Lazy)) as {
      default: ComponentType<unknown>;
    };
    expect(resolved.default).toBe(Hello);
  });

  it("hangs forever when the module resolves to undefined (vite preload-error suppression)", async () => {
    // Reproduces the real failure mode: `chunkReload.ts` preventDefault'd
    // the `vite:preloadError`, so Vite's preload helper resolves the
    // dynamic import with `undefined`. A naive `m.X` would throw with
    // `TypeError: undefined is not an object (evaluating 'm.X')` and
    // pollute Sentry while `window.location.reload()` is in flight.
    const Lazy = lazyImport(
      async () => undefined as unknown as { Hello: typeof Hello },
      "Hello",
    );
    const loader = getLoaderPromise(Lazy);

    const settled = await Promise.race([
      loader.then(
        (v) => ["resolved", v] as const,
        (e) => ["rejected", e] as const,
      ),
      new Promise<["timeout"]>((resolve) =>
        setTimeout(() => resolve(["timeout"]), 50),
      ),
    ]);
    expect(settled[0]).toBe("timeout");
  });

  it("propagates loader rejections to React.lazy", async () => {
    const boom = new Error("real chunk load failure");
    const Lazy = lazyImport<{ Hello: typeof Hello }, "Hello">(
      () => Promise.reject(boom),
      "Hello",
    );

    await expect(getLoaderPromise(Lazy)).rejects.toBe(boom);
  });
});
