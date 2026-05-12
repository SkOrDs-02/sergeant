#!/usr/bin/env node
/**
 * Validate `ops/openclaw/openclaw.example.json` against the real openclaw
 * runtime config schema by invoking `openclaw config validate --json`.
 *
 * Catches the class of bug where the JSON looks plausible by reading the
 * TypeScript types in `openclaw/dist/plugin-sdk/.../*.d.ts` but the real
 * zod-backed runtime schema rejects keys we hand-rolled. Concretely: in
 * May 2026 Stage 5a shipped per-persona allowlists under `agents.<id>.tools`
 * + `agents.defaults.tools`, which both crashed the gateway boot loop with
 * "Unrecognized key" errors. CI didn't catch it because the plugin-level
 * `config-gate.test.ts` only validated the allowlist mapping, not the
 * openclaw schema itself.
 *
 * Runs `openclaw config validate --json` (the canonical CLI surface) against
 * a temporary `OPENCLAW_HOME` populated with `openclaw.example.json` plus
 * the patched plugin runtime block (so the validation includes everything
 * the gateway will see on boot).
 *
 * Usage:
 *   node scripts/validate-openclaw-config.mjs
 *
 * Environment overrides:
 *   - OPENCLAW_VERSION (default: read from Dockerfile.openclaw-gateway).
 *
 * Exit codes:
 *   - 0 — config is valid
 *   - 1 — schema validation failed; stdout contains the issue list
 *   - 2 — script setup error (openclaw install failed, etc.)
 */

import { execSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const EXAMPLE_CONFIG = join(
  REPO_ROOT,
  "ops",
  "openclaw",
  "openclaw.example.json",
);
const PATCH_SCRIPT = join(
  REPO_ROOT,
  "ops",
  "openclaw",
  "patch-sergeant-config.mjs",
);
const DOCKERFILE = join(REPO_ROOT, "Dockerfile.openclaw-gateway");

function detectOpenClawVersion() {
  if (process.env.OPENCLAW_VERSION) return process.env.OPENCLAW_VERSION;
  const dockerfile = readFileSync(DOCKERFILE, "utf8");
  const m = dockerfile.match(/^ARG OPENCLAW_VERSION=([\w.-]+)/m);
  if (!m) {
    console.error(
      "[validate-openclaw-config] Could not detect OPENCLAW_VERSION from Dockerfile.openclaw-gateway. " +
        "Set OPENCLAW_VERSION env override.",
    );
    process.exit(2);
  }
  return m[1];
}

function ensureNodeVersion() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 14)) {
    console.error(
      `[validate-openclaw-config] openclaw requires Node >=22.14. Detected ${process.versions.node}. ` +
        "Re-run under a newer node (e.g. via `nvm use 22`).",
    );
    process.exit(2);
  }
}

function installOpenClaw(version, scratch) {
  const installDir = join(scratch, "install");
  execSync(`mkdir -p "${installDir}"`);
  writeFileSync(join(installDir, "package.json"), '{"private":true}\n', "utf8");
  console.error(
    `[validate-openclaw-config] Installing openclaw@${version} into ${installDir} …`,
  );
  const result = spawnSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      `openclaw@${version}`,
    ],
    { cwd: installDir, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.status !== 0) {
    console.error("[validate-openclaw-config] npm install openclaw failed");
    process.exit(2);
  }
  return join(installDir, "node_modules", ".bin", "openclaw");
}

function preparePatchedConfig(scratch) {
  const home = join(scratch, "home");
  const stateDir = join(home, ".openclaw");
  execSync(`mkdir -p "${stateDir}"`);
  const targetConfig = join(stateDir, "openclaw.json");
  copyFileSync(EXAMPLE_CONFIG, targetConfig);

  // Apply the entrypoint patch so the validated config matches what the
  // gateway actually sees at boot (plugins.entries.sergeant.config block).
  // The patch script reads $HOME/.openclaw/openclaw.json, so we set HOME.
  const patch = spawnSync("node", [PATCH_SCRIPT], {
    cwd: scratch,
    env: { ...process.env, HOME: home },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (patch.status !== 0) {
    console.error(
      "[validate-openclaw-config] patch-sergeant-config.mjs failed",
    );
    process.exit(2);
  }
  return { home, stateDir, targetConfig };
}

function main() {
  ensureNodeVersion();
  const version = detectOpenClawVersion();
  const scratch = mkdtempSync(join(tmpdir(), "openclaw-validate-"));

  const cliBin = installOpenClaw(version, scratch);
  const { home, stateDir, targetConfig } = preparePatchedConfig(scratch);

  console.error(
    `[validate-openclaw-config] Validating ${EXAMPLE_CONFIG} ` +
      `(via ${targetConfig}) against openclaw@${version} runtime schema …`,
  );

  const result = spawnSync(cliBin, ["config", "validate", "--json"], {
    env: {
      ...process.env,
      HOME: home,
      OPENCLAW_HOME: home,
      OPENCLAW_STATE_DIR: stateDir,
    },
    encoding: "utf8",
  });

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.error(
      "[validate-openclaw-config] Could not parse `openclaw config validate --json` output as JSON.",
    );
    process.exit(2);
  }

  if (parsed?.valid === true) {
    console.error(
      `[validate-openclaw-config] OK — ${EXAMPLE_CONFIG} is valid against openclaw@${version}.`,
    );
    process.exit(0);
  }

  console.error(
    `[validate-openclaw-config] FAIL — config invalid:\n${JSON.stringify(parsed, null, 2)}`,
  );
  process.exit(1);
}

main();
