// scripts/__tests__/check-dead-doc-links.test.mjs
//
// Тести бюджетного гейта мертвих посилань на доки.
//
// Найважливіше, що вони стережуть, — не «скрипт запускається», а те, що
// бюджет НЕ можна тихо підняти. Гейт цінний рівно доти, доки число в
// baseline рухається лише вниз: піднявши його, борг легалізують одним
// рядком у JSON, і перевірка знову стає зеленою назавжди.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const SCRIPT = join(ROOT, "scripts/check-dead-doc-links.mjs");
const BUDGET = join(ROOT, ".tech-debt/dead-doc-links-budget.json");

function run(args = []) {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

test("на поточному дереві гейт зелений", () => {
  const { code, out } = run(["--json"]);
  const d = JSON.parse(out);
  assert.equal(code, 0);
  assert.deepEqual(d.appeared, []);
  assert.ok(d.mentions <= d.budget);
});

test("baseline описує саме той набір, який бачить сканер", () => {
  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const d = JSON.parse(run(["--json"]).out);
  assert.equal(
    budget.paths.length,
    d.paths,
    "кількість шляхів у baseline розійшлась із фактом",
  );
  assert.equal(budget.mentions, d.mentions);
  // Порожній `paths` зробив би гейт сліпим до НОВИХ шляхів (лишилась би
  // тільки перевірка на кількість), тож він мусить бути непорожній.
  assert.ok(budget.paths.length > 0);
});

test("новий мертвий шлях валить гейт", () => {
  // Найдешевший спосіб довести, що сканер справді щось ловить: додати
  // покажчик на неіснуючий док у справжній файл і прибрати назад.
  const victim = join(ROOT, "scripts/check-dead-doc-links.mjs");
  const orig = readFileSync(victim, "utf8");
  try {
    // Два підводні камені, на обох я вже спіткнувся:
    //  • дописуємо В КІНЕЦЬ, не на початок — рядок перед `#!/usr/bin/env node`
    //    робить шебанг синтаксичною помилкою, і тест «ловить» не те;
    //  • шлях-приманка мусить бути ASCII — клас символів у сканері саме
    //    такий, тож кирилична назва просто не збігається з патерном.
    writeFileSync(
      victim,
      orig + `\n// docs/definitely-not-here/probe-${Date.now()}.md\n`,
    );
    const { code, out } = run();
    assert.equal(code, 1, "гейт не помітив нового мертвого посилання");
    assert.match(out, /Нові мертві посилання/);
  } finally {
    writeFileSync(victim, orig);
  }
  assert.equal(run().code, 0, "стан не відновлено");
});

test("--update відмовляється піднімати бюджет", () => {
  // Ключовий інваріант: baseline рухається лише вниз. Тимчасово занижуємо
  // число і переконуємось, що `--update` НЕ погоджується його підняти назад.
  const orig = readFileSync(BUDGET, "utf8");
  try {
    const b = JSON.parse(orig);
    writeFileSync(
      BUDGET,
      JSON.stringify({ ...b, mentions: b.mentions - 1 }, null, 2) + "\n",
    );
    const { code, out } = run(["--update"]);
    assert.equal(code, 1);
    assert.match(out, /лише коли борг зменшився/);
    // І файл лишився недоторканим.
    assert.equal(
      JSON.parse(readFileSync(BUDGET, "utf8")).mentions,
      b.mentions - 1,
    );
  } finally {
    writeFileSync(BUDGET, orig);
  }
});
