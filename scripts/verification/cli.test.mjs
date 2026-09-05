// Status: Active — ізольовані fixtures, жодних живих акаунтів або ключів.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const catalogPath = "docs/02-engineering/testing/verification/catalog.json";
const registryPath = "docs/90-work/audits/verification/findings.json";
const runPath = (id) => `docs/90-work/audits/verification/runs/${id}/run.json`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "verification-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, data) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof data === "string" ? data : JSON.stringify(data),
    );
  };
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const scenario = {
    id: "one",
    revision: 1,
    title: "One",
    suite: "journeys",
    modules: ["web"],
    modes: ["pilot"],
    profiles: ["empty"],
    source: "source.md#anchor",
    preconditions: "ready",
    steps: ["do"],
    expected: ["ok"],
    evidence: ["log"],
    cleanup: "none",
    pitfalls: "none",
  };
  write("source.md", "# Source\n");
  write("proof.txt", "proof");
  write(catalogPath, {
    schemaVersion: 1,
    suites: [{ id: "journeys", title: "Journeys" }],
    scenarios: [scenario],
  });
  write(registryPath, {
    schemaVersion: 1,
    findings: [
      {
        id: "F-1",
        legacyId: "F1",
        title: "Bug",
        severity: "major",
        source: "source.md",
        status: "open",
        history: [{ at: "2026-09-05", event: "imported", note: "Legacy" }],
      },
    ],
  });
  const meta = {
    executor: "test",
    commit: "abc123",
    dirty: false,
    deployment: "local-build",
    environment: "local",
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    viewport: { width: 1280, height: 800 },
    timezone: "Europe/Kyiv",
    flags: {},
    seedRevision: "v1",
    accounts: ["disposable-a"],
    ai: { mode: "mock", model: "fixture", configuration: {}, budgetUsd: 0 },
    baseline: null,
  };
  write("metadata.json", meta);
  const call = (...args) =>
    spawnSync(process.execPath, [cli, ...args, "--root", root], {
      encoding: "utf8",
    });
  const ok = (...args) => {
    const r = call(...args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const bad = (pattern, ...args) => {
    const r = call(...args);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, pattern);
  };
  const init = (id = "a") =>
    ok("init", "--id", id, "--metadata", "metadata.json");
  const record = (data = {}, run = "a") => {
    write("attempt.json", {
      scenarioId: "one",
      status: "pass",
      actual: "created",
      evidence: [{ path: "proof.txt", type: "text" }],
      ...data,
    });
    return ok("record", "--run", run, "--input", "attempt.json");
  };
  return { root, write, read, call, ok, bad, init, record, meta, scenario };
}
test("round trip commands, full mode, snapshot, append-only repeats and closed immutability", (t) => {
  const f = fixture(t);
  assert.match(f.ok("list", "--mode", "full"), /one/);
  f.init();
  assert.match(
    readFileSync(
      join(f.root, "docs/90-work/audits/verification/runs/a/handoff.md"),
      "utf8",
    ),
    /^# Передача/,
  );
  f.record({ id: "first", status: "fail", findingIds: ["F-1"] });
  f.record({ id: "second", findingIds: ["F-1"] });
  const run = f.read(runPath("a"));
  assert.equal(run.attempts.length, 2);
  assert.equal(run.attempts[0].status, "fail");
  assert.match(run.attempts[0].evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(f.ok("validate", "--run", "a"), /valid/);
  const report = f.ok("report", "--run", "a");
  assert.match(report, /first/);
  assert.match(report, /second/);
  assert.match(report, /F-1/);
  assert.match(report, /AUTO-GENERATED/);
  assert.equal(f.ok("close", "--run", "a").trim(), "passed");
  const closed = f.read(runPath("a"));
  f.bad(/closed/, "record", "--run", "a", "--input", "attempt.json");
  assert.deepEqual(f.read(runPath("a")), closed);
  f.init("b");
  assert.match(f.ok("compare", "--before", "a", "--after", "b"), /not-run/);
  f.bad(/exist|EEXIST/, "init", "--id", "a", "--metadata", "metadata.json");
});
test("rejects malformed catalogs, duplicate IDs, invalid source and filters", (t) => {
  const f = fixture(t);
  f.bad(/Unknown mode/, "list", "--mode", "blah");
  f.bad(/Unknown module/, "list", "--module", "blah");
  f.bad(/Unknown option/, "list", "--wat");
  const c = f.read(catalogPath);
  c.scenarios.push({ ...c.scenarios[0] });
  f.write(catalogPath, c);
  f.bad(/Duplicate/, "validate", "--catalog-only");
  c.scenarios.pop();
  c.scenarios[0].steps = [" "];
  f.write(catalogPath, c);
  f.bad(/nonempty text/, "validate");
  c.scenarios[0].steps = ["do"];
  c.scenarios[0].source = "missing.md#anchor";
  f.write(catalogPath, c);
  f.bad(/Source missing/, "validate");
  c.scenarios[0].source = "../outside";
  f.write(catalogPath, c);
  f.bad(/escapes root/, "validate");
});
test("metadata strictness and traversal protection", (t) => {
  const f = fixture(t);
  f.bad(/Unsafe/, "init", "--id", "../escape", "--metadata", "metadata.json");
  f.bad(/Unsafe/, "init", "--id", "CON", "--metadata", "metadata.json");
  for (const [key, value] of [
    ["deployment", ""],
    ["dirty", "yes"],
    ["accounts", [{ password: "no" }]],
    ["baseline", undefined],
  ]) {
    f.write("metadata.json", { ...f.meta, [key]: value });
    f.bad(
      /Metadata|accounts|nonempty text/,
      "init",
      "--id",
      "a",
      "--metadata",
      "metadata.json",
    );
  }
  f.write("metadata.json", {
    ...f.meta,
    ai: { mode: "mock", model: "test", configuration: {}, budgetUsd: -1 },
  });
  f.bad(/budgetUsd/, "init", "--id", "a", "--metadata", "metadata.json");
});
test("rejects unknown scenario/finding, duplicate attempt and missing evidence/reason", (t) => {
  const f = fixture(t);
  f.init();
  for (const [data, pattern] of [
    [{ scenarioId: "unknown" }, /Unknown scenario/],
    [{ findingIds: ["unknown"] }, /Unknown finding/],
    [{ evidence: [] }, /evidence/],
    [{ status: "blocked", reason: "" }, /reason/],
  ]) {
    f.write("attempt.json", {
      scenarioId: "one",
      status: "pass",
      actual: "created",
      evidence: [{ path: "proof.txt", type: "text" }],
      ...data,
    });
    f.bad(pattern, "record", "--run", "a", "--input", "attempt.json");
    assert.equal(f.read(runPath("a")).attempts.length, 0);
  }
  f.record({ id: "first" });
  f.bad(/Duplicate/, "record", "--run", "a", "--input", "attempt.json");
  assert.equal(f.read(runPath("a")).attempts.length, 1);
});
test("lost or altered evidence fails validation and close but is visible in report/compare", (t) => {
  const f = fixture(t);
  f.init();
  f.record();
  f.init("b");
  f.record({}, "b");
  f.write("proof.txt", "tampered");
  f.bad(/Evidence/, "validate");
  f.bad(/Evidence/, "close", "--run", "a");
  assert.match(f.ok("report", "--run", "a"), /Evidence unavailable or changed/);
  assert.match(
    f.ok("compare", "--before", "a", "--after", "b"),
    /checksum mismatch/,
  );
  assert.match(f.ok("validate", "--catalog-only"), /artifacts skipped/);
});
test("close preserves incomplete outcome when any case missing even alongside failure", (t) => {
  const f = fixture(t);
  const c = f.read(catalogPath);
  c.scenarios.push({ ...f.scenario, id: "two" });
  f.write(catalogPath, c);
  f.init();
  f.record({ status: "fail" });
  assert.equal(f.ok("close", "--run", "a").trim(), "incomplete");
  const r = f.read(runPath("a"));
  r.outcome = "passed";
  f.write(runPath("a"), r);
  f.bad(/outcome/, "validate");
});
test("blocked and justified not-applicable outcomes remain explicit", (t) => {
  const f = fixture(t);
  f.init();
  f.record({ status: "blocked", reason: "No server", evidence: [] });
  assert.equal(f.ok("close", "--run", "a").trim(), "incomplete");
  f.init("b");
  f.record(
    {
      status: "not-applicable",
      reason: "Not supported on this profile",
      evidence: [],
    },
    "b",
  );
  assert.equal(f.ok("close", "--run", "b").trim(), "passed");
});
test("verified findings require real live latest linked pass; catalog-only still requires structure", (t) => {
  const f = fixture(t);
  f.init();
  const reg = f.read(registryPath);
  reg.findings[0].status = "verified";
  reg.findings[0].verification = { runId: "a", attemptId: "pass" };
  f.write(registryPath, reg);
  f.bad(/Invalid verified/, "validate");
  assert.match(f.ok("validate", "--catalog-only"), /valid/);
  f.record({ id: "pass", findingIds: ["F-1"] });
  assert.match(f.ok("validate"), /valid/);
  f.record({ id: "regressed", status: "fail", findingIds: ["F-1"] });
  f.bad(/latest live pass/, "validate");
  reg.findings[0].verification.attemptId = "regressed";
  f.write(registryPath, reg);
  f.bad(/latest live pass/, "validate");
  delete reg.findings[0].verification;
  f.write(registryPath, reg);
  f.bad(/verification/, "validate", "--catalog-only");
});
test("demo pass cannot verify a finding", (t) => {
  const f = fixture(t);
  f.write("metadata.json", { ...f.meta, kind: "demo" });
  f.init();
  f.record({ id: "pass", findingIds: ["F-1"] });
  const reg = f.read(registryPath);
  reg.findings[0].status = "verified";
  reg.findings[0].verification = { runId: "a", attemptId: "pass" };
  f.write(registryPath, reg);
  f.bad(/live pass/, "validate");
});
test("compare distinguishes revision, removed/new, context and metric deltas", (t) => {
  const f = fixture(t);
  f.init();
  f.record({ status: "fail", metrics: { latency: 100 } });
  f.write("metadata.json", {
    ...f.meta,
    flags: { feature: true },
    ai: { ...f.meta.ai, model: "new" },
  });
  f.init("b");
  f.record({ metrics: { latency: 80 } }, "b");
  const output = f.ok("compare", "--before", "a", "--after", "b");
  assert.match(output, /metadata.flags.feature/);
  assert.match(output, /metadata.ai.model/);
  assert.match(output, /delta -20/);
  assert.match(output, /кандидат/);
  const r = f.read(runPath("b"));
  r.scenarios[0].revision = 2;
  f.write(runPath("b"), r);
  assert.match(
    f.ok("compare", "--before", "a", "--after", "b"),
    /незіставний snapshot/,
  );
});
test("compare explicitly prevents live/demo improvement and reports reopened findings", (t) => {
  const f = fixture(t);
  f.init();
  f.record({ findingIds: ["F-1"] });
  f.init("b");
  f.record({ status: "fail", findingIds: ["F-1"] }, "b");
  assert.match(
    f.ok("compare", "--before", "a", "--after", "b"),
    /повторно відкрито/,
  );
  const r = f.read(runPath("b"));
  r.kind = "demo";
  f.write(runPath("b"), r);
  assert.match(
    f.ok("compare", "--before", "a", "--after", "b"),
    /незіставні live\/demo/,
  );
});
test("lock rejects concurrent writer without altering run", (t) => {
  const f = fixture(t);
  f.init();
  f.write(`${runPath("a")}.lock`, "another writer");
  f.bad(/locked/, "close", "--run", "a");
  assert.equal(f.read(runPath("a")).status, "open");
});
test("invalid snapshot and mismatched directory ID fail", (t) => {
  const f = fixture(t);
  f.init();
  const run = f.read(runPath("a"));
  run.scenarios[0].revision = 0;
  f.write(runPath("a"), run);
  f.bad(/revision/, "validate");
  run.scenarios[0].revision = 1;
  run.id = "b";
  f.write(runPath("a"), run);
  f.bad(/directory/, "validate");
});
test("run symlink cannot redirect writes out of storage", (t) => {
  const f = fixture(t);
  f.init();
  const dir = join(f.root, "elsewhere");
  mkdirSync(dir);
  symlinkSync(
    dir,
    join(f.root, "docs/90-work/audits/verification/runs/escape"),
    "junction",
  );
  f.bad(/Symlink/, "init", "--id", "escape", "--metadata", "metadata.json");
});
