import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import {
  assertOpenClawRepoAllowed,
  __getOpenClawRepoAllowlistForTests,
  __resetOpenClawRepoAllowlistForTests,
} from "./repoAllowlist.js";
import { OpenClawAllowlistError } from "./tools.js";

const ORIGINAL_DEFAULT_REPO = env.OPENCLAW_GITHUB_REPO;

function setDefaultRepo(value: string): void {
  Object.defineProperty(env, "OPENCLAW_GITHUB_REPO", {
    value,
    writable: false,
    configurable: true,
    enumerable: true,
  });
}

function restoreDefaultRepo(): void {
  setDefaultRepo(ORIGINAL_DEFAULT_REPO);
}

describe("assertOpenClawRepoAllowed (T2 audit #3)", () => {
  beforeEach(() => {
    __resetOpenClawRepoAllowlistForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    restoreDefaultRepo();
    __resetOpenClawRepoAllowlistForTests();
  });

  it("falls back to OPENCLAW_GITHUB_REPO when the allowlist env var is empty", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "");
    const allowed = __getOpenClawRepoAllowlistForTests();
    expect(allowed.size).toBe(1);
    expect(allowed.has("Skords-01/Sergeant")).toBe(true);
  });

  it("returns the canonical repo string when input matches the fallback", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "");
    expect(assertOpenClawRepoAllowed(undefined)).toBe("Skords-01/Sergeant");
    expect(assertOpenClawRepoAllowed("Skords-01/Sergeant")).toBe(
      "Skords-01/Sergeant",
    );
  });

  it("throws OpenClawAllowlistError when an LLM-supplied repo diverges from the default", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "");
    expect(() => assertOpenClawRepoAllowed("evil-org/owned-repo")).toThrow(
      OpenClawAllowlistError,
    );
  });

  it("accepts multiple explicit repos when allowlist env var is CSV", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv(
      "OPENCLAW_GITHUB_REPO_ALLOWLIST",
      "Skords-01/Sergeant, Skords-01/sergeant-ops",
    );
    expect(assertOpenClawRepoAllowed("Skords-01/Sergeant")).toBe(
      "Skords-01/Sergeant",
    );
    expect(assertOpenClawRepoAllowed("Skords-01/sergeant-ops")).toBe(
      "Skords-01/sergeant-ops",
    );
  });

  it("explicit allowlist supersedes the OPENCLAW_GITHUB_REPO fallback (defense against misconfig)", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "Skords-01/sergeant-ops");
    // The fallback default repo is NOT in the explicit allowlist, so even
    // `undefined` input is rejected — this is the strict-mode operators
    // want when they enumerate the allowlist explicitly.
    expect(() => assertOpenClawRepoAllowed(undefined)).toThrow(
      OpenClawAllowlistError,
    );
    expect(() => assertOpenClawRepoAllowed("Skords-01/Sergeant")).toThrow(
      OpenClawAllowlistError,
    );
    expect(assertOpenClawRepoAllowed("Skords-01/sergeant-ops")).toBe(
      "Skords-01/sergeant-ops",
    );
  });

  it("trims whitespace and ignores empty CSV slots", () => {
    setDefaultRepo("fallback/repo");
    vi.stubEnv(
      "OPENCLAW_GITHUB_REPO_ALLOWLIST",
      "  one/repo  , ,, two/repo,  ",
    );
    const allowed = __getOpenClawRepoAllowlistForTests();
    expect(allowed.size).toBe(2);
    expect(allowed.has("one/repo")).toBe(true);
    expect(allowed.has("two/repo")).toBe(true);
  });

  it("error message includes the requested repo (so audit logs surface the divergent value)", () => {
    setDefaultRepo("Skords-01/Sergeant");
    vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "");
    try {
      assertOpenClawRepoAllowed("attacker/repo");
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenClawAllowlistError);
      expect((err as Error).message).toContain("attacker/repo");
    }
  });
});
