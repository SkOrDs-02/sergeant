/**
 * Unit tests for apiUrl() and getApiPrefix().
 *
 * These functions handle API URL versioning via VITE_API_VERSION and
 * VITE_API_BASE_URL env vars. We use vi.stubEnv to control the env
 * and vi.resetModules + dynamic import to get a fresh module per scenario
 * (because getApiVersion() reads import.meta.env at call time — no module
 * re-execution needed, but we verify the live-env behaviour here).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("apiUrl — default version (v1)", () => {
  it("prefixes /api/* paths with /api/v1", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/foo")).toBe("/api/v1/foo");
  });

  it("prefixes nested /api/* paths correctly", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/users/me")).toBe("/api/v1/users/me");
  });

  it("does NOT version /api/auth/* paths (Better Auth hard-coded basePath)", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/auth/sign-in")).toBe("/api/auth/sign-in");
    expect(apiUrl("/api/auth")).toBe("/api/auth");
  });

  it("does not double-version an already-versioned path", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/v1/foo")).toBe("/api/v1/foo");
  });

  it("prepends a leading slash for paths that omit it", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("api/foo")).toBe("/api/v1/foo");
  });

  it("passes through non-/api paths unchanged", async () => {
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/health")).toBe("/health");
    expect(apiUrl("/static/img.png")).toBe("/static/img.png");
  });

  it("handles /api/ root path by appending the version", async () => {
    // /api/ starts with /api/ so applyVersion processes it
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/")).toBe("/api/v1");
  });

  it("passes /api (bare, no trailing slash) through unchanged (does not start with /api/)", async () => {
    // /api does not match `startsWith("/api/")` so it exits the version
    // rewrite early and returns as-is. This is intentional — the only
    // version-aware prefix is "/api/<segment>/...".
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api")).toBe("/api");
  });
});

describe("apiUrl — VITE_API_BASE_URL set (absolute URL mode)", () => {
  it("prepends the base URL to a versioned path", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/foo")).toBe("https://api.example.com/api/v1/foo");
  });

  it("strips a trailing slash from the base URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/foo")).toBe("https://api.example.com/api/v1/foo");
  });

  it("does not version /api/auth/* even with a base URL set", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/auth/session")).toBe(
      "https://api.example.com/api/auth/session",
    );
  });
});

describe("apiUrl — VITE_API_VERSION=none (legacy mode)", () => {
  it("returns paths without a version segment", async () => {
    vi.stubEnv("VITE_API_VERSION", "none");
    vi.resetModules();
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/foo")).toBe("/api/foo");
  });

  it("getApiPrefix returns /api in legacy mode", async () => {
    vi.stubEnv("VITE_API_VERSION", "none");
    vi.resetModules();
    const { getApiPrefix } = await import("./apiUrl");
    expect(getApiPrefix()).toBe("/api");
  });
});

describe("getApiPrefix — default (v1)", () => {
  it("returns /api/v1 when no override is set", async () => {
    const { getApiPrefix } = await import("./apiUrl");
    expect(getApiPrefix()).toBe("/api/v1");
  });
});

describe("apiUrl — custom VITE_API_VERSION", () => {
  it("uses the custom version string", async () => {
    vi.stubEnv("VITE_API_VERSION", "v2");
    vi.resetModules();
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/foo")).toBe("/api/v2/foo");
  });

  it("strips leading/trailing slashes from the custom version", async () => {
    vi.stubEnv("VITE_API_VERSION", "/v3/");
    vi.resetModules();
    const { apiUrl } = await import("./apiUrl");
    expect(apiUrl("/api/bar")).toBe("/api/v3/bar");
  });
});
