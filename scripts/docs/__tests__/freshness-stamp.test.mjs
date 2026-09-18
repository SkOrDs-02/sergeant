// scripts/docs/__tests__/freshness-stamp.test.mjs
//
// Unit tests for the shared `--check` date-stamp normalizer. The regression
// being guarded: generators stamp `new Date()` into their output, so an
// exact-string `--check` against the committed file went red the day AFTER
// every regeneration even though no real content changed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  LAST_VALIDATED_LINE,
  TRUST_BADGE_DATE,
  RELATIVE_OVERDUE_COUNTER,
  normalizeDateStamps,
  isStaleIgnoringDateStamp,
} from "../freshness-stamp.mjs";

const doc = (date, body = "content line") =>
  [
    "# Some generated doc",
    "",
    `> **Last validated:** ${date} by docs:gen-x. **Next review:** 2026-09-07.`,
    "> **Status:** Active",
    "",
    body,
    "",
  ].join("\n");

// ── normalizeDateStamps ──────────────────────────────────────────────────────

test("normalizeDateStamps: masks the whole Last validated line (incl. Next review)", () => {
  const out = normalizeDateStamps(doc("2026-06-09"));
  assert.doesNotMatch(out, /2026-06-09/);
  assert.doesNotMatch(out, /2026-09-07/);
  assert.match(out, /<volatile-date-stamp>/);
  // Non-stamp lines survive untouched.
  assert.match(out, /\*\*Status:\*\* Active/);
  assert.match(out, /content line/);
});

test("normalizeDateStamps: trust-badge pattern masks only the date token", () => {
  const line =
    "> 🟢 **Docs trust: OK** — _оновлено 2026-06-11 via `pnpm docs:gen-trust-badge`_";
  const out = normalizeDateStamps(line, [TRUST_BADGE_DATE]);
  assert.doesNotMatch(out, /2026-06-11/);
  // Badge status is meaningful state and must stay comparable.
  assert.match(out, /\*\*Docs trust: OK\*\*/);
});

test("normalizeDateStamps: LAST_VALIDATED_LINE handles multiple stamp lines", () => {
  const two = `${doc("2026-06-09")}\n> **Last validated:** 2026-01-01 by other. **Next review:** 2026-04-01.\n`;
  const out = normalizeDateStamps(two, [LAST_VALIDATED_LINE]);
  assert.doesNotMatch(out, /Last validated/);
});

// ── isStaleIgnoringDateStamp ─────────────────────────────────────────────────

test("isStaleIgnoringDateStamp: date-only drift is NOT stale (day-after-regen)", () => {
  assert.equal(
    isStaleIgnoringDateStamp(doc("2026-06-09"), doc("2026-06-11")),
    false,
  );
});

test("isStaleIgnoringDateStamp: real content change IS stale", () => {
  assert.equal(
    isStaleIgnoringDateStamp(
      doc("2026-06-09"),
      doc("2026-06-11", "changed body"),
    ),
    true,
  );
});

test("isStaleIgnoringDateStamp: missing committed file IS stale", () => {
  assert.equal(isStaleIgnoringDateStamp("", doc("2026-06-11")), true);
});

test("isStaleIgnoringDateStamp: overdue day-count tick is NOT stale, due-date change IS", () => {
  const patterns = [LAST_VALIDATED_LINE, RELATIVE_OVERDUE_COUNTER];
  const row = (days, due = "2026-06-09") =>
    doc(
      "2026-06-10",
      `- [\`x.md\`](./x.md) — X _(due ${due}, **${days}d overdue**)_`,
    );
  assert.equal(isStaleIgnoringDateStamp(row(1), row(2), patterns), false);
  assert.equal(
    isStaleIgnoringDateStamp(row(1), row(1, "2026-06-10"), patterns),
    true,
  );
});

test("isStaleIgnoringDateStamp: trust-badge status flip IS stale despite same-day date", () => {
  const ok =
    "> 🟢 **Docs trust: OK** — _оновлено 2026-06-10 via `pnpm docs:gen-trust-badge`_";
  const warn =
    "> 🟡 **Docs trust: WARN** — _оновлено 2026-06-11 via `pnpm docs:gen-trust-badge`_";
  const okNextDay =
    "> 🟢 **Docs trust: OK** — _оновлено 2026-06-11 via `pnpm docs:gen-trust-badge`_";
  assert.equal(isStaleIgnoringDateStamp(ok, warn, [TRUST_BADGE_DATE]), true);
  assert.equal(
    isStaleIgnoringDateStamp(ok, okNextDay, [TRUST_BADGE_DATE]),
    false,
  );
});
