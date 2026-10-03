#!/usr/bin/env node
// scripts/check-duplicated-app-logic.mjs
//
// Храповик на ЧИСТУ ЛОГІКУ, продубльовану між `apps/web` і `apps/mobile`.
//
// **Що знайшлось.** 204 однойменні файли в обох застосунках, і жоден із них
// не збігається байт-у-байт. Для `.tsx` це нормально й очікувано: React DOM
// і React Native — різні платформи, розмітка мусить бути різна. Але серед
// `.ts` без жодної UI-залежності таких 45: доменна логіка, sync, чат,
// бекапи. Вони не мають бути в застосунках узагалі — у репо для цього є
// цілий шар `packages/` (`nutrition-domain`, `finyk-domain`, `fizruk-domain`,
// `routine-domain`, `dualwrite-core`, `insights`, `shared`).
//
// **Чому це не косметика.** Копії розходяться мовчки, і за одну хвилю
// огляду 2026-09-13 це коштувало двох дефектів:
//
//   • привітання в чаті: веб прибрав підстановку, яка робила порожній стан
//     (`ChatEmpty`, чотири suggestion-чіпи) недосяжним, мобайл її лишив
//     (`hubChatUtils.ts`). Мобільний `ChatEmpty.tsx` і той самий `isEmpty`
//     існували й були мертві з тієї самої причини.
//
// ПОПРАВКА 2026-09-14: спершу тут стояв ще й другий приклад, «активна
// комора», і він був неправдою. Веб передає `null`, що означає «лиши
// збережене недоторканим», мобайл явно перепередає наявне значення — той
// самий результат тим самим наміром. Два фрагменти, які виглядають
// протилежними, треба звіряти за НАМІРОМ, а не за формою виклику.
//
// Обидва рази розкол стався не через недогляд у мобайлі, а тому, що веб
// ухвалив рішення або виправив дефект — і ніщо не зобовʼязало мобайл піти
// слідом. Файли однойменні, тож побачити розкол може лише той, хто відкриє
// обидва.
//
// **Чому саме храповик, а не звірка вмісту.** Вимагати, щоб копії
// збігались, — хибна вимога: мобайл навмисно реалізує менше (напр.
// `HubSettingsPage` 40 kB проти 6.5 kB). Правильна межа інша: нових
// дублікатів не додавати, наявні виносити в `packages/`. Число ходить лише
// вниз.
//
// **Цей гейт не виносить нічого сам.** Винесення 45 файлів у packages —
// архітектурна робота з власним рішенням про межі; тут лише зафіксована
// стеля, щоб борг не ріс, поки рішення не ухвалене.
//
// Запуск: `node scripts/check-duplicated-app-logic.mjs`
//         `--json`   — машинний вивід
//         `--update` — переписати baseline (лише коли борг ЗМЕНШИВСЯ)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const WEB = join(ROOT, "apps/web/src");
const MOBILE = join(ROOT, "apps/mobile/src");
const BUDGET_FILE = join(ROOT, ".tech-debt/duplicated-app-logic-budget.json");

/**
 * Ознака, що файл привʼязаний до платформи. Тоді копія виправдана: розмітка
 * React DOM і React Native не зводиться до спільного модуля.
 */
const PLATFORM_BOUND =
  /from\s+["']react(-native)?["']|require\(["']react(-native)?["']\)|from\s+["']expo|\.css["']/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    // Лише `.ts`: `.tsx` — це розмітка, і там розбіжність очікувана.
    if (!/\.ts$/.test(entry) || /\.(test|stories)\.ts$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** basename -> [шлях]. Неоднозначні імена (кілька файлів) відсіюються нижче. */
function byBasename(root) {
  const map = new Map();
  for (const f of walk(root)) {
    const b = basename(f);
    map.set(b, [...(map.get(b) ?? []), f]);
  }
  return map;
}

const web = byBasename(WEB);
const mobile = byBasename(MOBILE);

const pairs = [];
for (const [name, webPaths] of web) {
  const mobilePaths = mobile.get(name);
  if (!mobilePaths) continue;
  // Однозначна пара 1↔1: інакше невідомо, що з чим порівнювати.
  if (webPaths.length !== 1 || mobilePaths.length !== 1) continue;
  const a = readFileSync(webPaths[0], "utf8");
  const b = readFileSync(mobilePaths[0], "utf8");
  if (PLATFORM_BOUND.test(a) || PLATFORM_BOUND.test(b)) continue;
  pairs.push({
    name,
    web: relative(ROOT, webPaths[0]),
    mobile: relative(ROOT, mobilePaths[0]),
    identical: a === b,
  });
}
pairs.sort((x, y) => x.name.localeCompare(y.name));

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
const known = new Set(budget.pairs ?? []);
const appeared = pairs.filter((p) => !known.has(p.name)).map((p) => p.name);
const cleared = [...known]
  .filter((k) => !pairs.some((p) => p.name === k))
  .sort();

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        count: pairs.length,
        budget: budget.count,
        appeared,
        cleared,
        identical: pairs.filter((p) => p.identical).length,
      },
      null,
      2,
    ),
  );
  process.exit(appeared.length === 0 && pairs.length <= budget.count ? 0 : 1);
}

if (process.argv.includes("--update")) {
  if (pairs.length > budget.count) {
    console.error(
      `❌ --update лише коли борг зменшився: зараз ${pairs.length}, у baseline ${budget.count}.`,
    );
    process.exit(1);
  }
  writeFileSync(
    BUDGET_FILE,
    JSON.stringify(
      { ...budget, count: pairs.length, pairs: pairs.map((p) => p.name) },
      null,
      2,
    ) + "\n",
  );
  console.log(`✅ baseline оновлено: ${pairs.length} продубльованих модулів.`);
  process.exit(0);
}

console.log(
  `🔍 Чистої логіки, продубльованої web↔mobile: ${pairs.length} (бюджет ${budget.count}).`,
);

let failed = false;
if (appeared.length > 0) {
  failed = true;
  console.error(`\n❌ Нові дублікати: ${appeared.length}\n`);
  for (const name of appeared) {
    const p = pairs.find((x) => x.name === name);
    console.error(`  ${name}\n      ${p.web}\n      ${p.mobile}`);
  }
  console.error(
    "\nЦе логіка без UI-залежності — їй місце в `packages/`, а не в двох\n" +
      "застосунках. Копії розходяться мовчки: за одну хвилю огляду це вже\n" +
      "коштувало двох дефектів (активна комора, привітання в чаті).\n" +
      "Винеси спільну частину в існуючий пакет (`*-domain`, `dualwrite-core`,\n" +
      "`insights`, `shared`) і імпортуй з обох застосунків.\n",
  );
} else if (pairs.length > budget.count) {
  failed = true;
  console.error(`\n❌ Кількість зросла: ${pairs.length} > ${budget.count}.\n`);
} else {
  console.log("\n✅ Нових дублікатів немає.");
  if (pairs.length < budget.count) {
    console.log(
      `   Борг зменшився (${pairs.length} < ${budget.count}) — опусти baseline: ` +
        `node scripts/check-duplicated-app-logic.mjs --update\n`,
    );
  } else {
    console.log("");
  }
}

if (cleared.length > 0 && !failed) {
  console.log(`   Винесено з часу baseline: ${cleared.length} модул(ів).`);
}

process.exit(failed ? 1 : 0);
