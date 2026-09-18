#!/usr/bin/env node
// scripts/pre-commit-gitleaks.mjs
//
// Pre-commit guard for secret leaks (closes I5 hardening item).
//
// Defense-in-depth on top of the `Secret scan (gitleaks)` CI job
// (`.github/workflows/ci.yml`): catching secrets locally — *before* the
// commit lands in the developer's reflog — is materially cheaper than
// catching them at the pull-request boundary, because the attacker
// timeline starts the moment a secret is committed.
//
// Behaviour:
//   - If `gitleaks` is installed: run `gitleaks protect --staged` on the
//     staged changes. A finding fails the commit. The shared CI config
//     (`.gitleaksignore` at repo root) is honoured automatically by
//     gitleaks itself.
//   - If `gitleaks` is NOT installed: print an actionable install hint
//     and exit 0. We do not block the commit — the CI gate still
//     catches anything that bypasses the local hook, so the worst case
//     is the same as today. Forcing every developer to install gitleaks
//     before they can `git commit` would create unnecessary onboarding
//     friction without a security improvement (the CI gate is the
//     authoritative check; this hook is the early-warning one).
//
// Hard Rule #7 still applies: do NOT pass `--no-verify`. Use the
// `SERGEANT_SKIP_GITLEAKS=1` env var only for documented break-glass
// scenarios (e.g. committing a vetted false-positive that must enter
// `.gitleaksignore` in the same commit).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const SKIP_ENV = "SERGEANT_SKIP_GITLEAKS";

const INSTALL_HINT = [
  "  • macOS:        brew install gitleaks",
  "  • Linux (apt):  see https://github.com/gitleaks/gitleaks/releases",
  "  • Go install:   go install github.com/gitleaks/gitleaks/v8@latest",
].join("\n");

function isGitleaksAvailable() {
  const probe = spawnSync("gitleaks", ["version"], {
    stdio: "ignore",
  });
  // `spawnSync` returns `error` (ENOENT) when the binary is missing.
  return !probe.error && probe.status === 0;
}

function runGitleaks() {
  const args = ["protect", "--staged", "--redact", "--no-banner", "--verbose"];

  // `.gitleaks.toml` is optional. If a project-specific config exists in the
  // repo root we forward it explicitly; otherwise gitleaks falls back to its
  // built-in default ruleset (matches CI behaviour).
  const projectConfig = path.join(REPO_ROOT, ".gitleaks.toml");
  if (existsSync(projectConfig)) {
    args.push("--config", projectConfig);
  }

  const result = spawnSync("gitleaks", args, {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });

  if (result.error) {
    // Unexpected: we already confirmed availability. Treat as a
    // soft-fail so we don't block commits on an environment glitch.
    console.error(
      `[pre-commit-gitleaks] failed to spawn gitleaks: ${result.error.message}`,
    );
    return 0;
  }

  return result.status ?? 0;
}

function main() {
  if (process.env[SKIP_ENV] === "1") {
    console.warn(
      `[pre-commit-gitleaks] ${SKIP_ENV}=1 — skipping. CI will still scan this commit.`,
    );
    return 0;
  }

  if (!isGitleaksAvailable()) {
    console.warn(
      [
        "[pre-commit-gitleaks] gitleaks is not installed — skipping local secret scan.",
        "  CI runs the same scanner on every PR (.github/workflows/ci.yml :: secret-scan),",
        "  so anything that slips through this hook is still caught at PR time.",
        "  To enable the local pre-commit gate (recommended), install gitleaks:",
        INSTALL_HINT,
      ].join("\n"),
    );
    return 0;
  }

  const status = runGitleaks();
  if (status !== 0) {
    console.error(
      [
        "",
        "[pre-commit-gitleaks] secrets detected in staged changes.",
        "  Remove or rotate the secret, then re-stage and re-commit.",
        "  If this is a documented false-positive, add an entry to",
        "  `.gitleaksignore` in the SAME commit (Hard Rule #7: do NOT use --no-verify).",
      ].join("\n"),
    );
  }
  return status;
}

process.exit(main());
