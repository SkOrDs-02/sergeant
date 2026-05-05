#!/usr/bin/env node
/**
 * Sergeant — one-shot dev bootstrap.
 *
 * Verifies Node / pnpm / Docker, installs deps if missing, seeds .env,
 * brings the local Postgres up and runs migrations. Then prints a
 * friendly "next steps" block (start `pnpm dev:server` and `pnpm dev:web`
 * in separate terminals).
 *
 * Idempotent: safe to re-run. Never overwrites an existing `.env`.
 *
 * Usage:
 *   pnpm bootstrap          # full bootstrap
 *   pnpm bootstrap --check  # verify environment only (no install / docker)
 *   pnpm bootstrap --skip-db
 *   pnpm bootstrap --skip-install
 *
 * Exit codes:
 *   0 — bootstrap succeeded
 *   1 — recoverable failure (missing tool, bad version, ...). Prints fix hint.
 *   2 — unrecoverable (pnpm install / migrate failed). Re-run after fixing.
 *
 * Counts toward Hard Rule #15 — strings here are mixed UA / EN intentionally:
 * UA for human-facing prompts, EN for tool names + commands.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const SKIP_DB = args.has("--skip-db");
const SKIP_INSTALL = args.has("--skip-install");

const COLORS = process.stdout.isTTY
  ? {
      reset: "\x1b[0m",
      dim: "\x1b[2m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      cyan: "\x1b[36m",
      bold: "\x1b[1m",
    }
  : {
      reset: "",
      dim: "",
      red: "",
      green: "",
      yellow: "",
      cyan: "",
      bold: "",
    };

function step(label) {
  process.stdout.write(`${COLORS.cyan}→${COLORS.reset} ${label}\n`);
}
function ok(label) {
  process.stdout.write(`${COLORS.green}✔${COLORS.reset} ${label}\n`);
}
function warn(label) {
  process.stdout.write(`${COLORS.yellow}⚠${COLORS.reset} ${label}\n`);
}
function fail(label, hint) {
  process.stderr.write(`${COLORS.red}✖${COLORS.reset} ${label}\n`);
  if (hint) {
    process.stderr.write(`  ${COLORS.dim}${hint}${COLORS.reset}\n`);
  }
}

function tryExec(cmd, args = []) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
    error: r.error,
  };
}

function readNvmrc() {
  const p = join(ROOT, ".nvmrc");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8").trim();
}

function readPackageManager() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const pm = pkg.packageManager || "";
  // expected format: "pnpm@9.15.1"
  const m = /^pnpm@(\S+)$/.exec(pm);
  return m ? m[1] : null;
}

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function checkNode() {
  const expected = readNvmrc(); // e.g. "20.20.2"
  const actual = process.versions.node;
  if (!expected) {
    warn(`Node ${actual} (no .nvmrc — пропускаю version-check)`);
    return true;
  }
  const expectedMajor = expected.split(".")[0];
  const actualMajor = actual.split(".")[0];
  if (expectedMajor !== actualMajor) {
    fail(
      `Node ${actual} ≠ очікувано ${expected} (.nvmrc)`,
      `Встанови через Volta або nvm: \`volta install node@${expected}\` або \`nvm use\``,
    );
    return false;
  }
  ok(`Node ${actual} (≥ ${expectedMajor}.x)`);
  return true;
}

function checkPnpm() {
  const expected = readPackageManager(); // e.g. "9.15.1"
  const r = tryExec("pnpm", ["--version"]);
  if (!r.ok) {
    fail(
      "pnpm не знайдено",
      `Встанови: \`npm install -g pnpm@${expected || "9.15.1"}\``,
    );
    return false;
  }
  const actual = r.stdout;
  if (expected && actual !== expected) {
    if (compareSemver(actual, expected) < 0) {
      fail(
        `pnpm ${actual} < очікувано ${expected} (package.json#packageManager)`,
        `Onovi: \`npm install -g pnpm@${expected}\``,
      );
      return false;
    }
    warn(
      `pnpm ${actual} (очікувалось ${expected}; вище — допустимо, але lockfile може зміщуватись)`,
    );
    return true;
  }
  ok(`pnpm ${actual}`);
  return true;
}

function checkDocker() {
  if (SKIP_DB) {
    warn("Docker check пропущено (--skip-db)");
    return true;
  }
  const r = tryExec("docker", ["--version"]);
  if (!r.ok) {
    fail(
      "Docker не знайдено",
      "Встанови Docker Desktop / Docker Engine. Або запусти `pnpm bootstrap --skip-db` і підніми Postgres вручну (див. docs/integrations/env-vars.md).",
    );
    return false;
  }
  // Try `docker info` to verify daemon is running.
  const info = tryExec("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (!info.ok) {
    fail(
      "Docker daemon не відповідає",
      "Запусти Docker Desktop / `sudo systemctl start docker` і повтори.",
    );
    return false;
  }
  ok(
    `Docker ${r.stdout.replace(/^Docker version\s+/, "")} (daemon up: ${info.stdout})`,
  );
  return true;
}

function ensureEnv() {
  const envPath = join(ROOT, ".env");
  const examplePath = join(ROOT, ".env.example");
  if (existsSync(envPath)) {
    ok(".env існує — не чіпаю");
    return true;
  }
  if (!existsSync(examplePath)) {
    fail(
      ".env.example відсутній — нічого скопіювати",
      "Перевір, що clone — повний (не shallow без файлів).",
    );
    return false;
  }
  copyFileSync(examplePath, envPath);
  ok(".env створено з .env.example");
  warn(
    "  Перевір .env вручну — `BETTER_AUTH_SECRET` і `API_SECRET` мають бути замінені перед деплоєм. Для local dev defaults достатньо.",
  );
  return true;
}

function nodeModulesFresh() {
  const nm = join(ROOT, "node_modules");
  if (!existsSync(nm)) return false;
  const lockfile = join(ROOT, "pnpm-lock.yaml");
  if (!existsSync(lockfile)) return false;
  try {
    const lockMtime = statSync(lockfile).mtimeMs;
    const nmMtime = statSync(nm).mtimeMs;
    return nmMtime >= lockMtime;
  } catch {
    return false;
  }
}

function runStream(cmd, args, label) {
  step(`${label} (${cmd} ${args.join(" ")})`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  return r.status === 0;
}

function runInstall() {
  if (SKIP_INSTALL) {
    warn("pnpm install пропущено (--skip-install)");
    return true;
  }
  if (nodeModulesFresh()) {
    ok("node_modules — fresh (mtime ≥ pnpm-lock.yaml). Skip install.");
    return true;
  }
  return runStream("pnpm", ["install", "--frozen-lockfile"], "pnpm install");
}

function runDb() {
  if (SKIP_DB) {
    warn("pnpm dev:db пропущено (--skip-db)");
    return true;
  }
  return runStream(
    "pnpm",
    ["dev:db"],
    "pnpm dev:db (docker compose + migrate)",
  );
}

function printNextSteps() {
  const lines = [
    "",
    `${COLORS.bold}Готово.${COLORS.reset} Тепер у двох окремих терміналах:`,
    "",
    `  ${COLORS.cyan}1)${COLORS.reset} pnpm dev:server     ${COLORS.dim}# API на :3000${COLORS.reset}`,
    `  ${COLORS.cyan}2)${COLORS.reset} pnpm dev:web        ${COLORS.dim}# Vite на :5173${COLORS.reset}`,
    "",
    `  Або одразу обидва (parallel, mixed log):`,
    `  ${COLORS.cyan}*${COLORS.reset} pnpm dev`,
    "",
    `Демо-режим без реєстрації: ${COLORS.cyan}http://localhost:5173/welcome?demo=1${COLORS.reset}`,
    `Документи й тести: ${COLORS.cyan}README.md → § Quickstart${COLORS.reset}`,
    "",
    `Якщо щось зламалось — \`pnpm bootstrap --check\` пройдеться по prerequisites без install/docker.`,
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

async function main() {
  process.stdout.write(
    `${COLORS.bold}Sergeant bootstrap${COLORS.reset}${COLORS.dim} — verify env, install deps, bring up DB.${COLORS.reset}\n`,
  );
  if (CHECK_ONLY) {
    process.stdout.write(
      `${COLORS.dim}Mode: --check (no install / no docker)${COLORS.reset}\n`,
    );
  }
  process.stdout.write("\n");

  const checks = [checkNode(), checkPnpm(), checkDocker()];
  if (!checks.every(Boolean)) {
    process.exit(1);
  }

  if (CHECK_ONLY) {
    ok("Усі prerequisites на місці.");
    process.exit(0);
  }

  if (!ensureEnv()) {
    process.exit(2);
  }
  if (!runInstall()) {
    fail("pnpm install failed");
    process.exit(2);
  }
  if (!runDb()) {
    fail(
      "pnpm dev:db failed",
      "Стандартні причини: 1) Docker не запущений, 2) port 5432 зайнятий (`docker ps`), 3) попередній сервер ще тримає коннект (kill та повтори).",
    );
    process.exit(2);
  }

  printNextSteps();
}

main().catch((e) => {
  fail(`bootstrap aborted: ${e?.message || e}`);
  process.exit(2);
});
