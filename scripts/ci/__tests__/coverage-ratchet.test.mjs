// scripts/ci/__tests__/coverage-ratchet.test.mjs
//
// Unit-тести чистих helper-ів coverage-ratchet гейта (node --test, без
// фікстур на диску — файлова робота живе лише в main()). Запускається
// pre-flight кроком у job `coverage` (.github/workflows/ci.yml), щоб
// зламаний helper падав до того, як гейт почне вирішувати долю PR-а.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRatchet,
  applyBumps,
  evaluateFloors,
} from "../coverage-ratchet.mjs";

const baseline = {
  epsilonPp: 0.5,
  workspaces: {
    "apps/web": { lines: 77.5 },
    "apps/server": { lines: 61.2 },
  },
};

test("pass: actual у сірій зоні (baseline − epsilon ≤ actual ≤ baseline)", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    "apps/web": 77.2,
    "apps/server": 61.2,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, {});
});

test("fail: деградація понад epsilon", () => {
  const { failures } = evaluateRatchet(baseline, {
    "apps/web": 76.99,
    "apps/server": 61.2,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /apps\/web/);
});

test("межа: рівно baseline − epsilon ще проходить", () => {
  const { failures } = evaluateRatchet(baseline, {
    "apps/web": 77.0,
    "apps/server": 60.7,
  });
  assert.deepEqual(failures, []);
});

test("no-bump: приріст у межах epsilon над baseline не бампить (без шуму)", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    "apps/web": 77.9, // +0.4 над 77.5 — менше за epsilon 0.5
    "apps/server": 61.2,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, {});
});

test("bump: зростання переписує baseline тільки для workspace-у, що виріс", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    "apps/web": 79.13,
    "apps/server": 61.2,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, { "apps/web": 79.13 });

  const updated = applyBumps(baseline, bumps);
  assert.equal(updated.workspaces["apps/web"].lines, 79.13);
  assert.equal(updated.workspaces["apps/server"].lines, 61.2);
  // Вхідний обʼєкт не мутується.
  assert.equal(baseline.workspaces["apps/web"].lines, 77.5);
});

test("fail-closed: відсутній coverage-summary.json — це failure, не skip", () => {
  const { failures } = evaluateRatchet(baseline, {
    "apps/web": null,
    "apps/server": 61.2,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /coverage-summary\.json/);
});

test("одночасно fail і bump у різних workspace-ах", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    "apps/web": 50,
    "apps/server": 70,
  });
  assert.equal(failures.length, 1);
  assert.deepEqual(bumps, { "apps/server": 70 });
});

// ── evaluateFloors (статичний floor-гейт, --floors) ─────────────────────────

const thresholds = {
  default: 75,
  workspaces: {
    "apps/web": 89,
    "apps/mobile": 30,
    "packages/api-client": 94,
  },
};

test("floors pass: усі workspace-и над своїми floor-ами", () => {
  const { failures, report } = evaluateFloors(thresholds, {
    "apps/web": 93.7,
    "apps/mobile": null,
    "packages/api-client": 99.4,
  });
  assert.deepEqual(failures, []);
  assert.equal(report.filter((l) => l.startsWith("✅")).length, 2);
});

test("floors fail: workspace нижче floor-у", () => {
  const { failures } = evaluateFloors(thresholds, {
    "apps/web": 88.9,
    "packages/api-client": 99.4,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /apps\/web/);
  assert.match(failures[0], /89%/);
});

test("floors fail-closed: очікуваний workspace без summary — failure, не skip", () => {
  // Раніше (shell-loop у ci.yml) відсутній coverage-summary.json означав
  // `continue` — workspace тихо випадав з гейта. Тепер це червоний CI.
  const { failures } = evaluateFloors(thresholds, {
    "apps/web": 93.7,
    "packages/api-client": null,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /packages\/api-client/);
  assert.match(failures[0], /fail-closed/);
});

test("floors fail-closed: workspace зі списку, взагалі відсутній в actuals", () => {
  // union(thresholds, actuals): navіть якщо discovery не знайшов директорію
  // coverage — перелічений workspace усе одно потрапляє під fail-closed.
  const { failures } = evaluateFloors(thresholds, {
    "apps/web": 93.7,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /packages\/api-client/);
});

test("floors skip: apps/mobile поза CI-скоупом навіть без summary", () => {
  const { failures, report } = evaluateFloors(thresholds, {
    "apps/web": 93.7,
    "apps/mobile": null,
    "packages/api-client": 99.4,
  });
  assert.deepEqual(failures, []);
  assert.equal(report.filter((l) => l.includes("skipped")).length, 1);
});

test("floors default: незалистований workspace із summary гейтиться за default", () => {
  const { failures, report } = evaluateFloors(thresholds, {
    "apps/web": 93.7,
    "packages/api-client": 99.4,
    "apps/mobile-shell": 74.2, // < default 75
    "packages/insights": 98.9, // ≥ default 75
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /apps\/mobile-shell/);
  assert.match(failures[0], /75%/);
  assert.ok(report.some((l) => l.includes("packages/insights")));
});
