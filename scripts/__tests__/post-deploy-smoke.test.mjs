// AI-NOTE: Unit tests for the pure logic in scripts/post-deploy-smoke.mjs:
// shape-matcher, verdict reducer, test filtering. The HTTP runner itself is
// covered by the live cron — locking it down with mocks would lock down
// implementation details (AbortSignal.timeout, hrtime, etc.) without adding
// regression coverage. The script's CI value comes from running against
// deployed staging/prod.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchShape,
  decideVerdict,
  normaliseTests,
  filterTests,
  renderMarkdown,
} from "../post-deploy-smoke.mjs";

// ---------- matchShape ----------

test("matchShape — primitive types match exactly", () => {
  assert.deepEqual(matchShape("string", "hello"), []);
  assert.deepEqual(matchShape("number", 42), []);
  assert.deepEqual(matchShape("boolean", true), []);
  assert.deepEqual(matchShape("object", { a: 1 }), []);
  assert.deepEqual(matchShape("array", [1, 2]), []);
});

test("matchShape — primitive type mismatch is reported", () => {
  const diff = matchShape("number", "42");
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "type_mismatch");
  assert.equal(diff[0].expected, "number");
  assert.equal(diff[0].actual, "string");
});

test("matchShape — null is reported as missing_or_null for required field", () => {
  const diff = matchShape("string", null);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "missing_or_null");
});

test("matchShape — undefined satisfies optional field", () => {
  assert.deepEqual(matchShape("string?", undefined), []);
  assert.deepEqual(matchShape("string?", null), []);
});

test("matchShape — optional field still type-checks when present", () => {
  const diff = matchShape("string?", 42);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "type_mismatch");
});

test("matchShape — nested object: missing field is reported", () => {
  const diff = matchShape(
    { user: { id: "string", email: "string" } },
    { user: { id: "u1" } },
  );
  assert.equal(diff.length, 1);
  assert.equal(diff[0].path, "$.user.email");
  assert.equal(diff[0].kind, "missing_or_null");
});

test("matchShape — nested object: present + correct shape passes", () => {
  const diff = matchShape(
    { user: { id: "string", email: "string" } },
    { user: { id: "u1", email: "a@b.c" } },
  );
  assert.deepEqual(diff, []);
});

test("matchShape — array element shape divergence is reported per index", () => {
  const diff = matchShape(
    [{ id: "string", n: "number" }],
    [
      { id: "a", n: 1 },
      { id: "b", n: "not-a-number" },
    ],
  );
  assert.equal(diff.length, 1);
  assert.equal(diff[0].path, "$[1].n");
  assert.equal(diff[0].kind, "type_mismatch");
});

test("matchShape — array expected but object received is type_mismatch", () => {
  const diff = matchShape(["string"], { 0: "a" });
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "type_mismatch");
  assert.equal(diff[0].expected, "array");
  assert.equal(diff[0].actual, "object");
});

test("matchShape — object expected but null received", () => {
  const diff = matchShape({ a: "string" }, null);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "type_mismatch");
  assert.equal(diff[0].actual, "null");
});

test("matchShape — object expected but array received is type_mismatch", () => {
  const diff = matchShape({ a: "string" }, [1, 2, 3]);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].kind, "type_mismatch");
  assert.equal(diff[0].expected, "object");
  assert.equal(diff[0].actual, "array");
});

test("matchShape — empty expected array does not enforce element shape", () => {
  assert.deepEqual(matchShape([], [{ id: 1 }, "anything"]), []);
});

// ---------- decideVerdict ----------

test("decideVerdict — fetch error is fail", () => {
  const v = decideVerdict({
    statusOK: false,
    latencyMs: 0,
    latencyBudgetMs: 1000,
    fetchError: "ECONNREFUSED",
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "fetch_error");
});

test("decideVerdict — status mismatch is fail", () => {
  const v = decideVerdict({
    statusOK: false,
    latencyMs: 50,
    latencyBudgetMs: 1000,
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "status_mismatch");
});

test("decideVerdict — body-contains miss is fail", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 50,
    latencyBudgetMs: 1000,
    bodyContainsOK: false,
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "body_contains_mismatch");
});

test("decideVerdict — shape diff non-empty is fail", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 50,
    latencyBudgetMs: 1000,
    shapeDiff: [{ path: "$.a", kind: "type_mismatch" }],
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "shape_mismatch");
});

test("decideVerdict — latency above budget but below 2x is warn (non-strict)", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 1500,
    latencyBudgetMs: 1000,
  });
  assert.equal(v.verdict, "warn");
  assert.equal(v.reason, "latency_over_budget");
});

test("decideVerdict — latency above budget under strict mode is fail", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 1500,
    latencyBudgetMs: 1000,
    strict: true,
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "latency_over_budget");
});

test("decideVerdict — latency above 2x budget is fail even in non-strict", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 5000,
    latencyBudgetMs: 1000,
  });
  assert.equal(v.verdict, "fail");
  assert.equal(v.reason, "latency_severe_overrun");
});

test("decideVerdict — all clean returns pass", () => {
  const v = decideVerdict({
    statusOK: true,
    latencyMs: 100,
    latencyBudgetMs: 1000,
  });
  assert.equal(v.verdict, "pass");
  assert.equal(v.reason, "ok");
});

// ---------- normaliseTests ----------

test("normaliseTests — applies defaults", () => {
  const ts = normaliseTests({
    defaults: { timeoutMs: 5000, latencyBudgetMs: 1000 },
    tests: [{ name: "a", path: "/x" }],
  });
  assert.equal(ts.length, 1);
  assert.equal(ts[0].method, "GET");
  assert.equal(ts[0].expectedStatus, 200);
  assert.equal(ts[0].timeoutMs, 5000);
  assert.equal(ts[0].latencyBudgetMs, 1000);
  assert.equal(ts[0].tier, "extended");
});

test("normaliseTests — explicit fields override defaults", () => {
  const ts = normaliseTests({
    defaults: { latencyBudgetMs: 1000 },
    tests: [
      {
        name: "a",
        path: "/x",
        method: "post",
        expectedStatus: 201,
        latencyBudgetMs: 500,
        tier: "critical",
      },
    ],
  });
  assert.equal(ts[0].method, "POST");
  assert.equal(ts[0].expectedStatus, 201);
  assert.equal(ts[0].latencyBudgetMs, 500);
  assert.equal(ts[0].tier, "critical");
});

test("normaliseTests — rejects config without tests array", () => {
  assert.throws(
    () => normaliseTests({ defaults: {} }),
    /missing "tests" array/,
  );
});

test("normaliseTests — rejects test without name", () => {
  assert.throws(
    () => normaliseTests({ tests: [{ path: "/x" }] }),
    /missing or invalid "name"/,
  );
});

test("normaliseTests — rejects test without path", () => {
  assert.throws(
    () => normaliseTests({ tests: [{ name: "a" }] }),
    /missing or invalid "path"/,
  );
});

// ---------- filterTests ----------

test("filterTests — tier=critical drops extended", () => {
  const ts = [
    { name: "a", tier: "critical" },
    { name: "b", tier: "extended" },
  ];
  assert.deepEqual(
    filterTests(ts, { tier: "critical" }).map((t) => t.name),
    ["a"],
  );
});

test("filterTests — tier=all returns everything", () => {
  const ts = [
    { name: "a", tier: "critical" },
    { name: "b", tier: "extended" },
  ];
  assert.equal(filterTests(ts, { tier: "all" }).length, 2);
});

test("filterTests — only-list keeps only named tests", () => {
  const ts = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(
    filterTests(ts, { only: ["a", "c"] }).map((t) => t.name),
    ["a", "c"],
  );
});

test("filterTests — skip-list drops named tests", () => {
  const ts = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(
    filterTests(ts, { skip: ["b"] }).map((t) => t.name),
    ["a", "c"],
  );
});

// ---------- renderMarkdown ----------

test("renderMarkdown — header includes counts and base URL", () => {
  const md = renderMarkdown(
    [
      {
        name: "ok",
        verdict: "pass",
        reason: "ok",
        url: "http://x.test/livez",
        method: "GET",
        actualStatus: 200,
        expectedStatus: 200,
        latencyMs: 50,
        latencyBudgetMs: 800,
      },
      {
        name: "broken",
        verdict: "fail",
        reason: "status_mismatch",
        url: "http://x.test/api/me",
        method: "GET",
        actualStatus: 500,
        expectedStatus: 200,
        latencyMs: 80,
        latencyBudgetMs: 2500,
      },
    ],
    { baseUrl: "http://x.test", generatedAt: "2026-05-13T19:30:00Z" },
  );
  assert.match(md, /Post-deploy smoke report/);
  assert.match(md, /1 pass \/ 0 warn \/ 1 fail/);
  assert.match(md, /❌ `fail` \| `broken`/);
  assert.match(md, /Failures \(1\)/);
});
