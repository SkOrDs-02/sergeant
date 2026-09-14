// scripts/__tests__/ci-deploy-verify-gate.test.mjs
//
// Shape-regression tests for the deploy-verification gate in
// `.github/workflows/deploy-api.yml`.
//
// Чому цей гейт існує. Крок «Trigger Coolify deploy» доводить рівно одне:
// Coolify ПРИЙНЯВ запит. Далі він тягне образ, піднімає новий контейнер і
// чекає healthcheck — а якщо той не проходить, ТИХО відкочується на старий
// («New container is not healthy, rolling back to the old container»).
// Джоба при цьому лишалась зеленою, бо hook відповів 2xx.
//
// Так 2026-09-14 знайшлося, що деплої відкочувались, а на VPS тижнями
// крутився старий образ: фікси мерджились, CI був зелений, у проді не
// мінялось нічого. Це той самий клас поломки, що й `401` на хук у серпні,
// лише на крок пізніше в ланцюжку.
//
// Тому тут перевіряється не «крок існує», а саме ті властивості, втрата
// яких повертає мовчазне зелене:
//
//   1. happy path — крок перевірки є і стоїть ПІСЛЯ кроку-тригера
//      (перевіряти нічого, поки деплой не замовлено);
//   2. крок читає статус деплою по uuid, а не вдовольняється кодом хука;
//   3. fail-closed — і невдалий статус, і вичерпаний таймаут дають `exit 1`;
//   4. `continue-on-error` тут заборонений — саме він колись і зробив
//      серпневу поломку невидимою;
//   5. тригер зберігає `deployment_uuid`, інакше перевіряти буде нічого.
//
// Парсер навмисно рядковий і без залежностей — той самий компроміс, що і в
// ci-bundle-budget-gates.test.mjs поруч.
//
// Run with:  node --test scripts/__tests__/ci-deploy-verify-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "deploy-api.yml",
);

/** @see ci-bundle-budget-gates.test.mjs — той самий 2-space канон. */
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

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf-8");
const STEPS = extractSteps(WORKFLOW);

const triggerIndex = STEPS.findIndex((s) => /- name: Trigger Coolify/.test(s));
const verifyIndex = STEPS.findIndex((s) =>
  /- name: Verify Coolify actually deployed/.test(s),
);

test("happy path: крок перевірки існує і стоїть після тригера", () => {
  assert.notEqual(triggerIndex, -1, "крок «Trigger Coolify deploy» зник");
  assert.notEqual(
    verifyIndex,
    -1,
    "крок перевірки результату деплою зник — джоба знову зелена на відкоті",
  );
  assert.ok(
    verifyIndex > triggerIndex,
    "перевірка мусить стояти ПІСЛЯ тригера: до замовлення деплою перевіряти нічого",
  );
});

test("тригер зберігає deployment_uuid — інакше перевіряти нічим", () => {
  const trigger = STEPS[triggerIndex];
  assert.match(
    trigger,
    /deployment_uuid/,
    "з відповіді хука має зберігатись uuid деплою",
  );
  assert.match(
    trigger,
    /coolify-deployment-uuid/,
    "uuid має лягати у файл, який читає крок перевірки",
  );
});

test("перевірка читає САМЕ статус деплою, а не код хука", () => {
  const verify = STEPS[verifyIndex];
  assert.match(
    verify,
    /api\/v1\/deployments\//,
    "статус треба брати з /api/v1/deployments/<uuid>",
  );
  assert.match(verify, /\.status/, "з відповіді читається поле status");
});

test("edge case: fail-closed — і поганий статус, і таймаут валять джобу", () => {
  const verify = STEPS[verifyIndex];
  const exits = verify.match(/exit 1/g) ?? [];
  assert.ok(
    exits.length >= 2,
    `очікувалось щонайменше два fail-closed виходи (поганий статус + вичерпаний таймаут), знайдено ${exits.length}`,
  );
  assert.match(
    verify,
    /::error::/,
    "провал має підніматись як error-анотація, а не тонути в логах",
  );
});

test("edge case: continue-on-error у цих кроках заборонений", () => {
  // Шукаємо КЛЮЧ, а не згадку: в обох кроках стоїть AI-DANGER-коментар про
  // те, що `continue-on-error` сюди повертати не можна, і наївний пошук
  // підрядком ловив саме його. Це той самий клас хиби, що й у решті сесії —
  // перевірка, яка міряє не те, що мала.
  const settingRe = /^\s*continue-on-error\s*:/;
  for (const idx of [triggerIndex, verifyIndex]) {
    const offending = STEPS[idx]
      .split("\n")
      .filter((line) => !/^\s*#/.test(line) && settingRe.test(line));
    assert.deepEqual(
      offending,
      [],
      "continue-on-error повертає мовчазне зелене — саме воно коштувало пʼяти днів простою в серпні",
    );
  }
});

test("неперевірений деплой не вдає успішний", () => {
  const verify = STEPS[verifyIndex];
  assert.match(
    verify,
    /::warning::/,
    "коли uuid недоступний, крок мусить СКАЗАТИ, що результат не перевірено",
  );
});
