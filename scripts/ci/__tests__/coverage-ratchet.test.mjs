// scripts/ci/__tests__/coverage-ratchet.test.mjs
//
// Unit-тести чистих helper-ів coverage-ratchet гейта (node --test, без
// фікстур на диску — файлова робота живе лише в main()). Запускається
// pre-flight кроком у job `coverage` (.github/workflows/ci.yml), щоб
// зламаний helper падав до того, як гейт почне вирішувати долю PR-а.

import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateRatchet, applyBumps } from "../coverage-ratchet.mjs";

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
