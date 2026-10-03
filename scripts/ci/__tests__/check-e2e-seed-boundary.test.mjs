import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { spawnSync } from "node:child_process";

import {
  countScannedScripts,
  findScenarioBridgeLeaks,
} from "../check-e2e-seed-boundary.mjs";

function withFixture(contents, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-seed-boundary-"));
  const assets = path.join(dir, "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, "app.js"), contents, "utf8");
  try {
    return fn(assets);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("fails when production assets contain the scenario bridge marker", () => {
  withFixture("window.__sergeantScenario = {}", (assets) => {
    assert.deepEqual(findScenarioBridgeLeaks(assets), [
      path.join(assets, "app.js"),
    ]);
  });
});

test("passes when production assets do not contain the marker", () => {
  withFixture("console.log('clean')", (assets) => {
    assert.deepEqual(findScenarioBridgeLeaks(assets), []);
  });
});

test("empty or missing assets dir is not a pass", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-seed-boundary-"));
  try {
    assert.equal(countScannedScripts(path.join(dir, "missing")), 0);
    assert.equal(countScannedScripts(dir), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 1 on an empty assets dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-seed-boundary-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "..", "check-e2e-seed-boundary.mjs"),
        dir,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
