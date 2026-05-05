// scripts/__tests__/bootstrap.test.mjs
//
// Integration tests for `pnpm bootstrap`. We run the real script in --check
// mode against fixture repos so the CLI surface is what's actually verified.
//
// Run with:  node --test scripts/__tests__/bootstrap.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "bootstrap.mjs");
const SCRIPT_SRC = readFileSync(SCRIPT_PATH, "utf-8");

// Minimal fixture: a repo root with the script under scripts/ and a
// minimal package.json + .nvmrc that mirror real values closely enough.
function buildFixture({
  nvmrc = "20.20.2",
  packageManager = "pnpm@9.15.1",
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bootstrap-test-"));
  const root = join(dir, "repo");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "bootstrap.mjs"), SCRIPT_SRC);
  writeFileSync(join(root, ".nvmrc"), `${nvmrc}\n`);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager }, null, 2),
  );
  writeFileSync(
    join(root, ".env.example"),
    "DATABASE_URL=postgresql://hub:hub@localhost:5432/hub\n",
  );
  return { dir, root };
}

function runCheck(root) {
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts", "bootstrap.mjs"), "--check"],
    {
      encoding: "utf-8",
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("--check exits 0 when prerequisites are satisfied", () => {
  // We rely on the host having the right Node major (20) and pnpm. CI does.
  // If pnpm or docker is missing on a contributor box, this test would fail —
  // which is also fine: that's what the script protects against.
  const { dir, root } = buildFixture();
  try {
    const r = runCheck(root);
    if (r.code !== 0) {
      // Surface stdout/stderr so the failure mode is debuggable.
      assert.fail(
        `bootstrap --check exited ${r.code}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      );
    }
    assert.ok(r.stdout.includes("Усі prerequisites на місці."));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--check fails with hint when .nvmrc demands wrong major", () => {
  const { dir, root } = buildFixture({ nvmrc: "99.0.0" });
  try {
    const r = runCheck(root);
    assert.equal(r.code, 1, `expected exit 1, got ${r.code}`);
    assert.ok(
      r.stderr.includes("Node ") || r.stdout.includes("Node "),
      `expected Node-version error, got:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes("volta") || r.stderr.includes("nvm"),
      "expected fix hint mentioning volta or nvm",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureEnv: creates .env from .env.example only when missing", () => {
  // We can't easily call internal helpers without imports, so we re-run the
  // full script (without --check) but stub out `pnpm` and `docker` calls by
  // pre-creating node_modules + setting --skip-db + --skip-install.
  const { dir, root } = buildFixture();
  const envPath = join(root, ".env");

  try {
    // Pre-create node_modules so `nodeModulesFresh()` returns true and skip
    // is unnecessary for install — but we still pass --skip-install just in
    // case the host has a slow npm prefix.
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");

    assert.equal(
      existsSync(envPath),
      false,
      "precondition: .env should not exist",
    );

    const r1 = spawnSync(
      process.execPath,
      [join(root, "scripts", "bootstrap.mjs"), "--skip-db", "--skip-install"],
      {
        encoding: "utf-8",
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );
    assert.equal(r1.status, 0, `first run failed:\n${r1.stdout}\n${r1.stderr}`);
    assert.equal(existsSync(envPath), true, ".env should be created");
    const seeded = readFileSync(envPath, "utf-8");
    assert.match(seeded, /DATABASE_URL=/);

    // Second run: must NOT overwrite existing .env even if .env.example differs.
    writeFileSync(envPath, "CUSTOM_VALUE=preserved\n");
    const r2 = spawnSync(
      process.execPath,
      [join(root, "scripts", "bootstrap.mjs"), "--skip-db", "--skip-install"],
      {
        encoding: "utf-8",
        cwd: root,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );
    assert.equal(
      r2.status,
      0,
      `second run failed:\n${r2.stdout}\n${r2.stderr}`,
    );
    assert.equal(
      readFileSync(envPath, "utf-8"),
      "CUSTOM_VALUE=preserved\n",
      ".env must be left untouched on re-run",
    );
    assert.ok(
      r2.stdout.includes(".env існує"),
      "second run should announce .env was preserved",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
