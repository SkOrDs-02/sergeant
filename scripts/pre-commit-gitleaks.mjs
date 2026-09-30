#!/usr/bin/env node
// scripts/pre-commit-gitleaks.mjs
//
// Pre-commit guard for secret leaks (closes I5 hardening item).
//
// CI (`ci.yml` job `secret-scan`, gitleaks) scans every PR since
// 2026-09-30 (ADR-0102), but only after the push. This hook keeps the
// secret out of the pushed history in the first place.
//
// Behaviour:
//   - If `gitleaks` is installed: run `gitleaks protect --staged` on the
//     staged changes. A finding fails the commit. `.gitleaksignore` at
//     repo root is honoured automatically by gitleaks itself.
//   - If `gitleaks` is NOT installed: fail closed (exit 1) with an
//     install hint. Skipping the only scan that exists is not a safe
//     default.
//
// Hard Rule #7 still applies: do NOT pass `--no-verify`. Use the
// `SERGEANT_SKIP_GITLEAKS=1` env var only for documented break-glass
// scenarios (e.g. committing a vetted false-positive that must enter
// `.gitleaksignore` in the same commit) - it prints a loud warning
// because nothing downstream will catch what it skips.

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
      [
        "",
        `⚠️  [pre-commit-gitleaks] ${SKIP_ENV}=1 - secret scan SKIPPED.`,
        "  Only CI will scan it, after the secret is already pushed.",
        "  Use this",
        "  only for a documented break-glass case, never as a habit.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  if (!isGitleaksAvailable()) {
    console.error(
      [
        "",
        "🔴 [pre-commit-gitleaks] gitleaks is not installed - commit blocked.",
        "  There is no CI on this repo to catch what this hook skips (no",
        "  bitbucket-pipelines.yml; GitHub Actions do not run - see AGENTS.md",
        '  § "Де живе код"), so this is the only secret scan that exists.',
        "  Install gitleaks:",
        INSTALL_HINT,
        "  Or, for a documented one-off exception, set SERGEANT_SKIP_GITLEAKS=1.",
        "",
      ].join("\n"),
    );
    return 1;
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
