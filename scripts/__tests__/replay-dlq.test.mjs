// scripts/__tests__/replay-dlq.test.mjs
//
// Unit tests для CLI у `scripts/replay-dlq.mjs`.
//
// Import-mode (без spawn-у Node-процеса) — тестуємо argument parsing,
// request-body builder, output-formatter. HTTP-частина має route-test
// на server-боці (`apps/server/src/routes/internal/ai-memory-dlq.test.ts`).
//
// Run with:  node --test scripts/__tests__/replay-dlq.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCliArgs,
  buildRequestBody,
  formatListReport,
  formatExecuteReport,
} from "../replay-dlq.mjs";

test("parseCliArgs: --help → help: true", () => {
  const r = parseCliArgs(["--help"]);
  assert.equal(r.help, true);
});

test("parseCliArgs: no filters → error", () => {
  const r = parseCliArgs([]);
  assert.match(r.error, /Принаймні один фільтр/);
});

test("parseCliArgs: --source only → dry-run defaults", () => {
  const r = parseCliArgs(["--source=finyk"]);
  assert.equal(r.source, "finyk");
  assert.equal(r.execute, false);
  assert.equal(r.since, undefined);
  assert.equal(r.ids, undefined);
});

test("parseCliArgs: --ids parses comma list", () => {
  const r = parseCliArgs(["--ids=1,2,3"]);
  assert.deepEqual(r.ids, [1, 2, 3]);
});

test("parseCliArgs: --ids invalid (non-int) → error", () => {
  const r = parseCliArgs(["--ids=1,abc,3"]);
  assert.match(r.error, /--ids повинно бути списком позитивних цілих/);
});

test("parseCliArgs: --since ISO → ISO string", () => {
  const r = parseCliArgs([
    "--source=finyk",
    "--since=2026-05-13T12:00:00.000Z",
  ]);
  assert.equal(r.since, "2026-05-13T12:00:00.000Z");
});

test("parseCliArgs: --since invalid → error", () => {
  const r = parseCliArgs(["--source=finyk", "--since=not-a-date"]);
  assert.match(r.error, /--since не валідний/);
});

test("parseCliArgs: --limit > 1000 → error", () => {
  const r = parseCliArgs(["--source=finyk", "--limit=5000"]);
  assert.match(r.error, /--limit має бути цілим у \[1\.\.1000\]/);
});

test("parseCliArgs: --execute --source → execute=true", () => {
  const r = parseCliArgs(["--source=finyk", "--execute"]);
  assert.equal(r.execute, true);
});

test("parseCliArgs: --list-only", () => {
  const r = parseCliArgs(["--source=finyk", "--list-only"]);
  assert.equal(r.listOnly, true);
});

test("buildRequestBody: dryRun default true коли --execute не передано", () => {
  const parsed = { source: "finyk", since: "2026-05-13T00:00:00Z" };
  const body = buildRequestBody(parsed);
  assert.equal(body.dryRun, true);
  assert.equal(body.source, "finyk");
  assert.equal(body.since, "2026-05-13T00:00:00Z");
});

test("buildRequestBody: dryRun=false коли execute=true", () => {
  const parsed = { source: "finyk", execute: true };
  const body = buildRequestBody(parsed);
  assert.equal(body.dryRun, false);
});

test("buildRequestBody: ids → eventIds field", () => {
  const parsed = { ids: [1, 2], execute: true };
  const body = buildRequestBody(parsed);
  assert.deepEqual(body.eventIds, [1, 2]);
});

test("formatListReport: 0 rows → '(none — adjust filters)'", () => {
  const r = formatListReport({ rows: [] });
  assert.match(r, /Found 0 DLQ row\(s\):/);
  assert.match(r, /\(none/);
});

test("formatListReport: includes id, source, attempts, error", () => {
  const r = formatListReport({
    rows: [
      {
        id: 42,
        source: "finyk",
        attempts: 5,
        lastAttemptAt: "2026-05-15T12:00:00.000Z",
        errorMsg: "Voyage 503",
      },
    ],
  });
  assert.match(r, /Found 1 DLQ row/);
  assert.match(r, /42/);
  assert.match(r, /finyk/);
  assert.match(r, /Voyage 503/);
});

test("formatExecuteReport: includes counts", () => {
  const r = formatExecuteReport({
    attempted: 5,
    replayed: 4,
    errors: [{ id: 7, error: "boom" }],
  });
  assert.match(r, /attempted 5/);
  assert.match(r, /replayed 4/);
  assert.match(r, /errors 1/);
  assert.match(r, /id=7: boom/);
});
