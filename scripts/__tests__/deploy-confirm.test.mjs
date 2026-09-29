// Тести підтвердження деплою (аудит DG-32): без --yes скрипти нічого не викликають.
//
// Run with:  node --test scripts/__tests__/deploy-confirm.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDeployArgs, printPreview } from "../lib/deploy-confirm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("parseDeployArgs", () => {
  it("без прапорців: yes=false", () => {
    assert.deepEqual(parseDeployArgs([]), {
      yes: false,
      syncOnly: false,
      positional: [],
    });
  });

  it("розпізнає --yes і позиційний аргумент, ігнорує голе --", () => {
    assert.deepEqual(parseDeployArgs(["web", "--", "--yes"]), {
      yes: true,
      syncOnly: false,
      positional: ["web"],
    });
  });

  it("розпізнає --sync-only", () => {
    assert.equal(parseDeployArgs(["--sync-only"]).syncOnly, true);
  });
});

describe("printPreview", () => {
  it("друкує підказку з --yes", () => {
    const out = [];
    printPreview("t", ["a"], "pnpm x -- --yes", (s) => out.push(s));
    assert.match(out.join("\n"), /--yes/);
  });
});

// Preload підміняє fetch: будь-який виклик пише файл-маркер і кидає.
function runWithFetchMock(script, args) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-confirm-"));
  const marker = join(dir, "fetch-called");
  const preload = join(dir, "mock-fetch.mjs");
  writeFileSync(
    preload,
    `import { writeFileSync } from "node:fs";
globalThis.fetch = async (u) => {
  writeFileSync(${JSON.stringify(marker)}, String(u));
  throw new Error("fetch заборонено");
};
`,
  );
  const r = spawnSync(
    process.execPath,
    ["--import", preload, script, ...args],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  return { r, fetched: existsSync(marker) };
}

describe("без --yes нічого не викликається", () => {
  it("deploy-api: код 0, підказка --yes, fetch не викликано", () => {
    const { r, fetched } = runWithFetchMock("scripts/deploy-api.mjs", []);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /--yes/);
    assert.match(r.stdout, /sergeant-api-v2/);
    assert.equal(fetched, false);
  });

  it("deploy-vercel: код 0, підказка --yes, fetch не викликано", () => {
    const { r, fetched } = runWithFetchMock("scripts/deploy-vercel.mjs", [
      "web",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /--yes/);
    assert.equal(fetched, false);
  });

  it("deploy-vercel з невідомою ціллю досі падає з кодом 1", () => {
    const { r } = runWithFetchMock("scripts/deploy-vercel.mjs", ["nope"]);
    assert.equal(r.status, 1);
  });
});
