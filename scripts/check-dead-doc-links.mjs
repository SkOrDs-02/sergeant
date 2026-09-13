#!/usr/bin/env node
// scripts/check-dead-doc-links.mjs
//
// Бюджетний гейт на МЕРТВІ ПОСИЛАННЯ НА ДОКИ В КОДІ.
//
// **Проблема, якої не бачив ніхто.** `pnpm docs:check-links` за задумом ходить
// по `*.md` — посилання з коментарів коду не покриті жодною перевіркою. Тому
// при кожному переїзді теки вони ротяться мовчки: реорганізація доків
// (`docs/01-product/…` → `docs/product/…`, `docs/90-work/…` → `docs/work/…`
// тощо) залишила по собі 294 мертві шляхи у ~920 згадках. Знахідка PR-T9,
// аудит 2026-09-13.
//
// Ціна саме в коментарях висока: покажчик там стоїть у форматі «перед
// правкою прочитай канон», тобто людина йде за ним у момент, коли її
// свідомо зупинили — і впирається в «файл не знайдено».
//
// **Чому бюджет, а не нуль.** 112 шляхів мали однозначного наступника
// (той самий basename, рівно один живий док) і переписані механічно. Решта
// 182 указують на доки, ВИДАЛЕНІ назовсім: архіви травневих аудитів,
// закриті ініціативи, старі плани. Для них заміни не існує, а правильна дія
// різна залежно від місця:
//
//   • покажчик у тексті ПОМИЛКИ лінтера чи в повідомленні користувачу мусить
//     піти — мертве посилання там гірше за його відсутність;
//   • покажчик у коментарі — це провенанс рішення, і краще позначити його
//     історичним, ніж стерти разом із відповіддю на «чому так зроблено».
//
// Це кураторська робота, не заміна рядків, тож вона окремою чергою. Гейт
// тримає межу: борг не росте, а кожен PR, що його зменшує, опускає бюджет.
//
// Запуск: `node scripts/check-dead-doc-links.mjs`
//         `--json`   — машинний вивід
//         `--update` — переписати baseline (лише коли борг ЗМЕНШИВСЯ)

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BUDGET_FILE = join(ROOT, ".tech-debt/dead-doc-links-budget.json");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".vite",
  ".next",
]);
const CODE_EXT = /\.(?:tsx?|jsx?|mjs|cjs)$/;
const DOC_REF = /docs\/[A-Za-z0-9._/-]*\.md/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (CODE_EXT.test(entry)) out.push(full);
  }
  return out;
}

const byPath = new Map(); // docPath -> Set<codeFile>
for (const file of walk(ROOT)) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const ref of new Set(src.match(DOC_REF) ?? [])) {
    if (!byPath.has(ref)) byPath.set(ref, new Set());
    byPath.get(ref).add(relative(ROOT, file));
  }
}

const dead = [...byPath.keys()]
  .filter((p) => !existsSync(join(ROOT, p)))
  .sort();
const mentions = dead.reduce((n, p) => n + byPath.get(p).size, 0);

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
const known = new Set(budget.paths ?? []);
const appeared = dead.filter((p) => !known.has(p));
const cleared = [...known].filter((p) => !dead.includes(p)).sort();

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        paths: dead.length,
        mentions,
        appeared,
        cleared,
        budget: budget.mentions,
      },
      null,
      2,
    ),
  );
  process.exit(appeared.length === 0 && mentions <= budget.mentions ? 0 : 1);
}

if (process.argv.includes("--update")) {
  if (mentions > budget.mentions) {
    console.error(
      `❌ --update лише коли борг зменшився: зараз ${mentions} згадок, у baseline ${budget.mentions}.`,
    );
    process.exit(1);
  }
  writeFileSync(
    BUDGET_FILE,
    JSON.stringify({ ...budget, mentions, paths: dead }, null, 2) + "\n",
  );
  console.log(
    `✅ baseline оновлено: ${dead.length} шляхів, ${mentions} згадок.`,
  );
  process.exit(0);
}

console.log(
  `🔍 Посилання на доки з коду: ${byPath.size} унікальних, мертвих ${dead.length} у ${mentions} згадках (бюджет ${budget.mentions}).`,
);

let failed = false;
if (appeared.length > 0) {
  failed = true;
  console.error(`\n❌ Нові мертві посилання: ${appeared.length}\n`);
  for (const p of appeared) {
    console.error(`  ${p}`);
    for (const f of [...byPath.get(p)].sort()) console.error(`      ${f}`);
  }
  console.error(
    "\nШлях існує під іншою назвою — виправ його. Док видалено назовсім —\n" +
      "прибери покажчик (якщо він у тексті помилки) або познач історичним\n" +
      "(якщо це провенанс рішення у коментарі).\n",
  );
} else if (mentions > budget.mentions) {
  failed = true;
  console.error(
    `\n❌ Кількість згадок зросла: ${mentions} > ${budget.mentions}. Ті самі мертві шляхи додані у нові файли.\n`,
  );
} else {
  console.log("\n✅ Нових мертвих посилань немає.");
  if (mentions < budget.mentions) {
    console.log(
      `   Борг зменшився (${mentions} < ${budget.mentions}) — опусти baseline: ` +
        `node scripts/check-dead-doc-links.mjs --update\n`,
    );
  } else {
    console.log("");
  }
}

if (cleared.length > 0 && !failed) {
  console.log(`   Полагоджено з часу baseline: ${cleared.length} шлях(ів).`);
}

process.exit(failed ? 1 : 0);
