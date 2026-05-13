/**
 * `OpenClaw` GitHub repo allowlist (T2 audit finding #3).
 *
 * Before this hardening, every GitHub-touching OpenClaw tool
 * (`read_github`, `get_github_releases`, the four `github_*`
 * code-understanding tools, `commit_to_strategy_doc`,
 * `create_github_issue`) accepted an LLM-supplied `repo` string with
 * NO validation — only a `?? env.OPENCLAW_GITHUB_REPO` fallback. A
 * prompt-injection chain (or a bug in the cheap-router classifier)
 * could therefore steer the tool at an arbitrary repo the OpenClaw
 * GitHub App / fallback PAT had install scope on.
 *
 * The allowlist is sourced from `OPENCLAW_GITHUB_REPO_ALLOWLIST`
 * (CSV) and falls back to `[OPENCLAW_GITHUB_REPO]` so the default
 * config keeps the single-repo behaviour. `assertOpenClawRepoAllowed`
 * is the single choke-point — both the HTTP route layer (early 400)
 * and the underlying tool layer (defense in depth) invoke it.
 *
 * We intentionally read `process.env` directly (instead of the parsed
 * `env` object) so that operators flipping the env var at runtime,
 * and tests using `vi.stubEnv`, both see the new value immediately —
 * mirrors the `OPENCLAW_REPO_ROOT` pattern in `tools.ts`.
 */

import { env } from "../../env.js";
import { OpenClawAllowlistError } from "./tools.js";

function readDefaultRepo(): string {
  // `env.OPENCLAW_GITHUB_REPO` is the source of truth used by every
  // other GitHub-touching path; keeping it as the fallback matches
  // legacy semantics and the existing `patchEnv` test pattern.
  return env.OPENCLAW_GITHUB_REPO;
}

function readAllowlist(): Set<string> {
  const fallback = readDefaultRepo();
  // The allowlist itself is read from `process.env` (not the parsed
  // `env` object) so `vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", …)`
  // in tests, and operator-set runtime overrides, take effect without
  // requiring a module re-import. Mirrors the `OPENCLAW_REPO_ROOT`
  // pattern in `tools.ts`.
  const explicit = process.env["OPENCLAW_GITHUB_REPO_ALLOWLIST"];
  if (!explicit) return new Set([fallback]);
  const entries = explicit
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) return new Set([fallback]);
  return new Set(entries);
}

/**
 * Return the (canonical, validated) `owner/repo` string the caller is
 * permitted to target. `input` is the optional LLM-supplied repo; we
 * fall back to `OPENCLAW_GITHUB_REPO` when it's undefined. Either way
 * the resolved value MUST be in the allowlist, otherwise we throw
 * `OpenClawAllowlistError` — which the route layer surfaces as 400
 * `allowlist_fail` via the existing `asAllowlistFailure` helper.
 */
export function assertOpenClawRepoAllowed(input: string | undefined): string {
  const requested = input ?? readDefaultRepo();
  const allowed = readAllowlist();
  if (!allowed.has(requested)) {
    throw new OpenClawAllowlistError(
      `repo '${requested}' is not in OPENCLAW_GITHUB_REPO_ALLOWLIST`,
    );
  }
  return requested;
}

/** Test-only: no-op kept for API compatibility (env is read live). */
export function __resetOpenClawRepoAllowlistForTests(): void {
  // intentionally empty — `readAllowlist` re-reads `process.env` each call.
}

/** Test-only: snapshot of the current allowlist. */
export function __getOpenClawRepoAllowlistForTests(): Set<string> {
  return new Set(readAllowlist());
}
