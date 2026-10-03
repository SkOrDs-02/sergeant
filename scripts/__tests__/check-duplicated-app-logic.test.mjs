// scripts/__tests__/check-duplicated-app-logic.test.mjs
//
// Тести храповика на продубльовану web↔mobile логіку.
//
// Стережуть три рішення, кожне з яких легко відкотити необачним рефактором:
// бюджет не можна тихо підняти; `.tsx` навмисно поза скоупом (там розбіжність
// очікувана); і платформозалежні `.ts` теж поза ним, інакше гейт вимагав би
// зводити те, що звести не можна.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const SCRIPT = join(ROOT, "scripts/check-duplicated-app-logic.mjs");
const BUDGET = join(ROOT, ".tech-debt/duplicated-app-logic-budget.json");

function run(args = []) {
  try {
    return {
      code: 0,
      out: execFileSync("node", [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

test("на поточному дереві гейт зелений", () => {
  const { code, out } = run(["--json"]);
  const d = JSON.parse(out);
  assert.equal(code, 0);
  assert.deepEqual(d.appeared, []);
  assert.ok(d.count > 0, "сканер не знайшов жодної пари — зламано?");
});

test("baseline описує саме той набір, який бачить сканер", () => {
  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const d = JSON.parse(run(["--json"]).out);
  assert.equal(budget.count, d.count);
  assert.equal(budget.pairs.length, d.count);
});

test("жодна пара не збігається байт-у-байт — інакше це вже не «розкол»", () => {
  // Якщо копії стали ідентичними, знахідка змінює зміст: тоді це чисте
  // дублювання без дрейфу, і винесення в пакет ще дешевше. Пін зробить цю
  // зміну видимою замість того, щоб вона проїхала непоміченою.
  const d = JSON.parse(run(["--json"]).out);
  assert.equal(
    d.identical,
    0,
    "зʼявилась пара-близнюк: перечитай шапку скрипта, висновок змінився",
  );
});

test("новий дублікат чистої логіки валить гейт", () => {
  // Кладемо однойменний `.ts` без UI-залежності в обидва застосунки.
  const name = `__probe_dup_${Date.now()}.ts`;
  const a = join(ROOT, "apps/web/src", name);
  const b = join(ROOT, "apps/mobile/src", name);
  try {
    writeFileSync(a, "export const probe = 1;\n");
    writeFileSync(b, "export const probe = 2;\n");
    const { code, out } = run();
    assert.equal(code, 1, "гейт не помітив нового дубліката");
    assert.match(out, /Нові дублікати/);
    assert.match(out, new RegExp(name));
  } finally {
    if (existsSync(a)) unlinkSync(a);
    if (existsSync(b)) unlinkSync(b);
  }
  assert.equal(run().code, 0, "стан не відновлено");
});

test("платформозалежний файл у скоуп НЕ потрапляє", () => {
  // Дзеркало попереднього тесту, і воно не косметичне: без цього винятку
  // гейт вимагав би зводити те, що звести не можна — модуль, який імпортує
  // `react-native`, у вебі не запуститься.
  const name = `__probe_platform_${Date.now()}.ts`;
  const a = join(ROOT, "apps/web/src", name);
  const b = join(ROOT, "apps/mobile/src", name);
  try {
    writeFileSync(
      a,
      'import { View } from "react";\nexport const probe = View;\n',
    );
    writeFileSync(
      b,
      'import { View } from "react-native";\nexport const probe = View;\n',
    );
    assert.equal(run().code, 0, "платформозалежну пару порахували як борг");
  } finally {
    if (existsSync(a)) unlinkSync(a);
    if (existsSync(b)) unlinkSync(b);
  }
});

test("--update відмовляється піднімати бюджет", () => {
  const orig = readFileSync(BUDGET, "utf8");
  try {
    const b = JSON.parse(orig);
    writeFileSync(
      BUDGET,
      JSON.stringify({ ...b, count: b.count - 1 }, null, 2) + "\n",
    );
    const { code, out } = run(["--update"]);
    assert.equal(code, 1);
    assert.match(out, /лише коли борг зменшився/);
    assert.equal(JSON.parse(readFileSync(BUDGET, "utf8")).count, b.count - 1);
  } finally {
    writeFileSync(BUDGET, orig);
  }
});
