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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

test("закріплений blob/<sha> URL не рахується мертвим шляхом", () => {
  // Дзеркало попереднього тесту: та сама приманка, але всередині
  // закріпленого GitHub-URL. Це форма, якою Hard Rule #23 велить цитувати
  // заархівовані доки (локальних архівних дерев у репо немає), тож гейт
  // мусить лишитись зеленим. Sha — 40 hex, інакше пропуск не спрацює.
  const victim = join(ROOT, "scripts/check-dead-doc-links.mjs");
  const orig = readFileSync(victim, "utf8");
  const sha = "d068c73a2f21881d5c1305544fe99f3ea8be81f4";
  try {
    writeFileSync(
      victim,
      orig +
        `\n// https://github.com/x/y/blob/${sha}/docs/definitely-not-here/pinned-${Date.now()}.md\n`,
    );
    const { code, out } = run(["--json"]);
    assert.equal(code, 0, "закріплений URL помилково визнано мертвим");
    assert.deepEqual(JSON.parse(out).appeared, []);
  } finally {
    writeFileSync(victim, orig);
  }
  // А от `blob/main/…` ротиться разом із гілкою — його пропускати не можна.
  try {
    writeFileSync(
      victim,
      orig +
        `\n// https://github.com/x/y/blob/main/docs/definitely-not-here/branch-${Date.now()}.md\n`,
    );
    assert.equal(run().code, 1, "URL на гілку мав лишитись під наглядом");
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

test("SKIP_FILES — кожен запис із причиною, і саме той один", () => {
  // Виняток можна додати, але свідомо: без причини список стає тихим
  // способом сховати мертвий покажчик замість того, щоб його полагодити.
  //
  // Записів було два, доки жив `scripts/docs/rewrite-documentation-paths.mjs`
  // — другий скрипт із таблицею переїзду доків. Його прибрано 2026-09-19
  // разом із виключенням: пропуск на неіснуючий файл нічого не пропускає,
  // але читається як діючий виняток.
  const src = readFileSync(SCRIPT, "utf8");
  const block = src.slice(
    src.indexOf("const SKIP_FILES"),
    src.indexOf("const FIXTURE_DIR"),
  );
  const entries = [...block.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",?\s*\]/g)];
  assert.equal(entries.length, 1, "склад винятків змінився — перечитай шапку");
  for (const [, file, reason] of entries) {
    assert.ok(existsSync(join(ROOT, file)), `виняток на неіснуючий ${file}`);
    assert.ok(reason.length > 20, `${file}: причина надто коротка`);
  }
});

test("виключені таблиці справді ламаються від переписування шляхів", () => {
  // Пін не на «файл у списку», а на ПРИЧИНУ, з якої він там. Скрипт тримає
  // пари «історична назва → чинна»; переписавши ліву колонку, пару робиш
  // тотожною, і резолв старого шляху перестає працювати. Саме це зробив
  // перший захід T9, і саме тому файл тут.
  for (const file of ["scripts/docs/generate-documentation-inventory.mjs"]) {
    const src = readFileSync(join(ROOT, file), "utf8");
    const pairs = [...src.matchAll(/\[\s*"(docs\/[^"]+)",\s*"(docs\/[^"]+)"/g)];
    assert.ok(pairs.length > 0, `${file}: таблиці переїзду не знайдено`);
    for (const [, from, to] of pairs) {
      assert.notEqual(
        from,
        to,
        `${file}: тотожна пара ${from} — таблиця мертва`,
      );
    }
  }
});

test("шлях, що виводить за межі репо, не рахується мертвим", () => {
  // Клас символів у `DOC_REF` пропускає `..`, тож така форма — валідний
  // збіг. Без гарду сканер питав би `existsSync` про довільний шлях за
  // межами дерева і рахував його мертвим покажчиком. Приманка лежить у
  // самому сканері (див. попередній тест — дописуємо В КІНЕЦЬ).
  const victim = join(ROOT, "scripts/check-dead-doc-links.mjs");
  const orig = readFileSync(victim, "utf8");
  const before = JSON.parse(run(["--json"]).out);
  try {
    writeFileSync(
      victim,
      orig + `\n// docs/../../../nowhere-${Date.now()}/probe.md\n`,
    );
    const after = JSON.parse(run(["--json"]).out);
    assert.deepEqual(after.appeared, [], "гард не спрацював: шлях повз ROOT");
    assert.equal(after.paths, before.paths);
    assert.equal(after.mentions, before.mentions);
  } finally {
    writeFileSync(victim, orig);
  }
  assert.equal(run().code, 0, "стан не відновлено");
});

test("межа довжини в DOC_REF на місці — інакше повертається backtracking", () => {
  // Пін ПОВЕДІНКОВИЙ, не структурний: беремо патерн із джерела і перевіряємо,
  // що він справді обмежений. Перша версія цього тесту міряла час повного
  // прогону сканера і НЕ ловила зняття межі — 8/8 зелених і з нею, і без неї.
  //
  // Чому не час: поліном тут росте лише коли префіксів `docs/` багато (одна
  // стартова позиція дає лінійність). Замір на такому вході, 2026-09-13:
  //
  //   довжина │ без межі │ з межею
  //    10 000 │   0.8 мс │  0.1 мс
  //    20 000 │   3.0 мс │  0.1 мс
  //    40 000 │  12.0 мс │  0.2 мс
  //
  // Квадрат видно чітко (×4 на кожне подвоєння), але 12 мс усередині прогону
  // на секунди не відрізнити від шуму. Тож міряємо не час, а саму межу.
  const src = readFileSync(SCRIPT, "utf8");
  const literal = /const DOC_REF = (\/.+\/[gimsuy]*);/.exec(src);
  assert.ok(literal, "DOC_REF більше не оголошений літералом");
  const rx = new RegExp(literal[1].slice(1, literal[1].lastIndexOf("/")), "g");

  // Рівно на межі — збіг є.
  assert.ok(rx.test(`docs/${"a".repeat(195)}.md`));
  rx.lastIndex = 0;
  // Понад межу — збігу немає. Без `{0,200}` він БУВ БИ, і саме це відрізняє
  // обмежений патерн від зірочки.
  assert.equal(rx.test(`docs/${"a".repeat(300)}.md`), false, "межу знято");

  // Ціна межі названа: шляхи довші за 200 символів гейт не побачить.
  // Найдовший реальний у репо — 88 символів, тож запас понад двократний.
  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  assert.ok(Math.max(...budget.paths.map((x) => x.length)) < 200);
});
