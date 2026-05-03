// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";

/**
 * Initialisation path: with a JSDOM-mocked OPFS we expect
 * `getSqliteDb()` to:
 *
 * 1. Probe `crossOriginIsolated` and emit a `console.warn` + Sentry
 *    breadcrumb when COOP/COEP headers are missing (jsdom default).
 * 2. Lazy-load `@sqlite.org/sqlite-wasm` via dynamic `import()` and
 *    install the OPFS-SAH Pool VFS once support is detected.
 * 3. Dedupe concurrent initialisation calls — three parallel
 *    `getSqliteDb()` invocations must resolve to the **same** handle.
 *
 * Real OPFS isn't available under jsdom, so we mock the `sqlite-wasm`
 * module to a deterministic fake that records what we hand it. The
 * fake exposes the same `oo1` / `installOpfsSAHPoolVfs` shape the
 * production module does — see `tests/sqlite-wasm-fake.ts`.
 */

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
}));

describe("getSqliteDb — init", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    // Pretend the host browser supports OPFS-SAH so the primary code
    // path is exercised. The mocked `installOpfsSAHPoolVfs` resolves
    // synchronously below.
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { getDirectory: () => Promise.resolve({}) },
      configurable: true,
    });
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: function FileSystemFileHandle() {},
      configurable: true,
    });
  });

  afterEach(() => {
    __resetSqliteDbForTests();
    vi.restoreAllMocks();
  });

  it("warns when the page is not crossOriginIsolated and still resolves", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: false,
      configurable: true,
    });

    const handle = await getSqliteDb();

    expect(handle.crossOriginIsolated).toBe(false);
    expect(handle.vfs).toBe("opfs-sahpool");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("crossOriginIsolated"),
    );
    const { addSentryBreadcrumb } = await import("../../observability/sentry");
    expect(addSentryBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "storage",
        message: expect.stringContaining("crossOriginIsolated"),
      }),
    );
  });

  it("does NOT warn when crossOriginIsolated is true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true,
    });

    const handle = await getSqliteDb();

    expect(handle.crossOriginIsolated).toBe(true);
    expect(handle.vfs).toBe("opfs-sahpool");
    const coopWarnings = warnSpy.mock.calls
      .flatMap((args) => args)
      .filter(
        (msg) => typeof msg === "string" && msg.includes("crossOriginIsolated"),
      );
    expect(coopWarnings).toHaveLength(0);
  });

  it("dedupes concurrent calls into a single initialisation", async () => {
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true,
    });

    const [a, b, c] = await Promise.all([
      getSqliteDb(),
      getSqliteDb(),
      getSqliteDb(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
