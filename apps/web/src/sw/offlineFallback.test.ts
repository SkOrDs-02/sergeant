import { describe, it, expect, vi } from "vitest";

import {
  isNavigationRequest,
  resolveOfflineShell,
  OFFLINE_SHELL_CANDIDATES,
} from "./offlineFallback";

/**
 * page-audit-10 F1. Pure logic for the SW offline navigation fallback, kept
 * workbox-free so it runs under jsdom (workbox crashes at module-init).
 */

describe("sw offlineFallback", () => {
  it("treats only document navigations as navigation requests", () => {
    expect(isNavigationRequest("navigate")).toBe(true);
    expect(isNavigationRequest("cors")).toBe(false);
    expect(isNavigationRequest("no-cors")).toBe(false);
    expect(isNavigationRequest(undefined)).toBe(false);
  });

  it("returns the first precached shell candidate that resolves", async () => {
    const match = vi.fn(async (url: string) =>
      url === "index.html" ? "SHELL" : undefined,
    );
    const shell = await resolveOfflineShell(match);
    expect(shell).toBe("SHELL");
    // Stops probing once a candidate hits — "/index.html" missed, "index.html" hit.
    expect(match).toHaveBeenCalledTimes(2);
  });

  it("returns undefined when no candidate is precached (→ caller keeps default error)", async () => {
    const match = vi.fn(async () => undefined);
    expect(await resolveOfflineShell(match)).toBeUndefined();
    expect(match).toHaveBeenCalledTimes(OFFLINE_SHELL_CANDIDATES.length);
  });

  it("probes the documented candidate list in order", async () => {
    const seen: string[] = [];
    await resolveOfflineShell(async (u) => {
      seen.push(u);
      return undefined;
    });
    expect(seen).toEqual([...OFFLINE_SHELL_CANDIDATES]);
  });
});
