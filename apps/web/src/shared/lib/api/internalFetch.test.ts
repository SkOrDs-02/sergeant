// @vitest-environment jsdom
/**
 * Tests for the browser-side `/api/internal/*` wrapper.
 *
 * `internalFetch` reads `VITE_INTERNAL_API_KEY` at call time and either:
 *   - short-circuits to a synthetic 403 when the key is absent (Hard Rule
 *     #20 — never ship a PAT to prod, never call `/api/internal/*`
 *     unauthenticated from the browser); or
 *   - attaches `Authorization: Bearer <key>` plus a default JSON
 *     `Content-Type` and delegates to the real `fetch`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { internalFetch } from "./internalFetch";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("internalFetch — missing key (Hard Rule #20)", () => {
  it("returns a synthetic 403 without ever calling fetch", async () => {
    vi.stubEnv("VITE_INTERNAL_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await internalFetch("/api/internal/strategic/goals/list");

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(fetchSpy).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      message: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal_api_key_missing");
    expect(body.message).toContain("VITE_INTERNAL_API_KEY");
  });
});

describe("internalFetch — key present", () => {
  it("attaches a Bearer auth header and a default JSON Content-Type", async () => {
    vi.stubEnv("VITE_INTERNAL_API_KEY", "dev-pat-123");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await internalFetch("/api/internal/strategic/goals/list", {
      method: "POST",
      body: JSON.stringify({ weekStart: "2026-06-22" }),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/internal/strategic/goals/list");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer dev-pat-123");
    expect(headers.get("Content-Type")).toBe("application/json");
    // Caller-owned init survives the merge.
    expect((init as RequestInit).method).toBe("POST");
  });

  it("does not override a caller-supplied Content-Type", async () => {
    vi.stubEnv("VITE_INTERNAL_API_KEY", "dev-pat-123");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await internalFetch("/api/internal/upload", {
      headers: { "Content-Type": "text/csv" },
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("text/csv");
    // Auth is still injected regardless of caller headers.
    expect(headers.get("Authorization")).toBe("Bearer dev-pat-123");
  });

  it("returns the underlying fetch response verbatim", async () => {
    vi.stubEnv("VITE_INTERNAL_API_KEY", "dev-pat-123");
    const expected = new Response(JSON.stringify({ items: [] }), {
      status: 200,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(expected);

    const res = await internalFetch("/api/internal/strategic/goals/list");
    expect(res).toBe(expected);
  });
});
