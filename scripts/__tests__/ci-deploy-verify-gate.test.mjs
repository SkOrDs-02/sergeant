// scripts/__tests__/ci-deploy-verify-gate.test.mjs
//
// Shape-regression tests для автодеплою бекенду: джоба `deploy-api` у
// `.github/workflows/ci.yml` викликає `.github/workflows/deploy-api.yml`.
//
// Що тут стережеться і чому (ADR-0101):
//
//   1. Деплой стоїть ПІСЛЯ обовʼязкових джоб і лише на push у main.
//      Міграції БД їдуть в ENTRYPOINT образу, тож деплой без гейта
//      застосовував би неперевірену схему на живій базі.
//   2. `deploy-api.yml` не має власного `on: push` - інакше він обійшов би
//      гейт так само, як старий ghcr-воркфлоу, що деплоїв паралельно з CI.
//   3. Крок перевірки читає статус деплою по uuid і звіряє КОМІТ. Coolify
//      відповідає 2xx на «прийнято», а потім може тихо відкотитись
//      (2026-09-14) або зібрати вже задеплоєний коміт.
//   4. fail-closed і без `continue-on-error` - саме він колись зробив
//      пʼятиденний простій невидимим.
//
// Парсер навмисно рядковий і без залежностей - той самий компроміс, що й
// у ci-bundle-budget-gates.test.mjs поруч.
//
// Run with:  node --test scripts/__tests__/ci-deploy-verify-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(__dirname, "..", "..", ".github", "workflows");
const DEPLOY = readFileSync(resolve(WORKFLOWS, "deploy-api.yml"), "utf-8");
const CI = readFileSync(resolve(WORKFLOWS, "ci.yml"), "utf-8");

/** @see ci-bundle-budget-gates.test.mjs - той самий 2-space канон. */
function extractSteps(workflow) {
  const steps = [];
  let current = null;
  for (const line of workflow.split("\n")) {
    if (/^ {6}- (name|uses):/.test(line)) {
      if (current !== null) steps.push(current);
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) steps.push(current);
  return steps;
}

/** Блок джоби верхнього рівня (`  <id>:`) до наступної джоби. */
function extractJob(workflow, id) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((l) => l === `  ${id}:`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const STEPS = extractSteps(DEPLOY);
const triggerIndex = STEPS.findIndex((s) => /- name: Trigger Coolify/.test(s));
const verifyIndex = STEPS.findIndex((s) =>
  /- name: Verify Coolify actually deployed/.test(s),
);

test("ci.yml: деплой після обовʼязкових джоб і лише на push у main", () => {
  const job = extractJob(CI, "deploy-api");
  assert.ok(job, "джоба `deploy-api` зникла з ci.yml - автодеплою немає");
  assert.match(job, /uses: \.\/\.github\/workflows\/deploy-api\.yml/);
  for (const need of [
    "check",
    "critical-flow",
    "migration-lint",
    "migration-down-drill",
  ]) {
    assert.match(
      job,
      new RegExp(`needs:[^\\n]*\\b${need}\\b`),
      `деплой мусить чекати на \`${need}\``,
    );
  }
  assert.match(job, /github\.event_name == 'push'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
});

test("deploy-api.yml не тригериться сам на push", () => {
  const on = DEPLOY.split("\njobs:")[0];
  assert.doesNotMatch(
    on,
    /^\s+push:/m,
    "власний `on: push` обходить гейт CI - саме так старий воркфлоу деплоїв паралельно з тестами",
  );
  assert.match(on, /workflow_call:/);
});

test("без секретів джоба пропускається, а не падає", () => {
  const gate = STEPS.find((s) => /- name: Секрети на місці/.test(s));
  assert.ok(gate, "крок перевірки секретів зник");
  assert.match(gate, /ready=false/);
  assert.doesNotMatch(gate, /exit 1/);
});

test("happy path: крок перевірки існує і стоїть після тригера", () => {
  assert.notEqual(triggerIndex, -1, "крок «Trigger Coolify deploy» зник");
  assert.notEqual(verifyIndex, -1, "крок перевірки результату деплою зник");
  assert.ok(
    verifyIndex > triggerIndex,
    "перевірка мусить стояти після тригера",
  );
});

test("тригер зберігає deployment_uuid - інакше перевіряти нічим", () => {
  const trigger = STEPS[triggerIndex];
  assert.match(trigger, /deployment_uuid/);
  assert.match(trigger, /coolify-deployment-uuid/);
  assert.match(trigger, /-X POST/, "ендпоінт deploy приймає лише POST");
});

test("перевірка звіряє статус і КОМІТ, а не код відповіді", () => {
  const verify = STEPS[verifyIndex];
  assert.match(verify, /api\/v1\/deployments\/applications\//);
  assert.match(verify, /\.status/);
  assert.match(verify, /\.commit/);
  assert.match(verify, /TARGET_SHA/);
  assert.match(verify, /HEALTH_URL/);
});

test("edge case: fail-closed - і поганий статус, і чужий коміт валять джобу", () => {
  const verify = STEPS[verifyIndex];
  const exits = verify.match(/exit 1/g) ?? [];
  assert.ok(
    exits.length >= 3,
    `очікувалось >= 3 fail-closed виходи, є ${exits.length}`,
  );
  assert.match(verify, /::error::/);
});

test("edge case: continue-on-error у кроках деплою заборонений", () => {
  const settingRe = /^\s*continue-on-error\s*:/;
  for (const idx of [triggerIndex, verifyIndex]) {
    const offending = STEPS[idx]
      .split("\n")
      .filter((line) => !/^\s*#/.test(line) && settingRe.test(line));
    assert.deepEqual(offending, []);
  }
});

test("jq-вираз перевірки справді знаходить свій деплой серед історії", () => {
  const verify = STEPS[verifyIndex];
  const m = verify.match(/jq -r --arg u "\$UUID" '([^']*\.commit[^']*)'/);
  assert.ok(m?.[1], "не знайдено jq-вираз коміту - тест втратив предмет");
  const history = JSON.stringify({
    deployments: [
      { deployment_uuid: "new", status: "finished", commit: "aaa" },
      { deployment_uuid: "old", status: "finished", commit: "bbb" },
    ],
  });
  const out = spawnSync("jq", ["-r", "--arg", "u", "old", m[1]], {
    input: history,
    encoding: "utf-8",
  });
  assert.equal(
    out.error,
    undefined,
    "потрібен `jq` - ним розбирає відповідь і сам крок деплою",
  );
  assert.equal(out.stdout.trim(), "bbb");
});
