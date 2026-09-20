#!/usr/bin/env node
// scripts/check-dead-doc-links.mjs
//
// Бюджетний гейт на МЕРТВІ ПОСИЛАННЯ НА ДОКИ В КОДІ.
//
// **Проблема, якої не бачив ніхто.** `pnpm docs:check-links` за задумом ходить
// по `*.md` — посилання з коментарів коду не покриті жодною перевіркою. Тому
// при кожному переїзді теки вони ротяться мовчки: реорганізація доків
// (`docs/product/…` → `docs/product/…`, `docs/work/…` → `docs/work/…`
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
// **Де шлях у коді — це ДАНІ, а не покажчик.** Сканер шукає текст, тож він
// не бачить різниці між «прочитай ось цей док» і «ось таблиця, за якою
// старі шляхи переїхали в нові». Другого в репо два роди, і обидва тут
// пропускаються (`SKIP_FILES` нижче):
//
//   • фікстури тестів — вигадані `docs/a.md`, `docs/foo.md`, `docs/bad.md`;
//     покажчиком вони не були ніколи, а без пропуску кожен новий тест
//     доксового тулінгу червонив би гейт на порожньому місці;
//   • таблиці переїздів у самих скриптах міграції доків — там ЛІВА колонка
//     мусить лишатись історичною назвою, інакше пара стає тотожною і
//     скрипт перестає працювати.
//
// Це не теоретичне застереження: перший захід T9 переписав саме ці ліві
// колонки і фікстури, бо перевірка дифу дивилась лише на `apps/**` і
// `packages/**`. Тест валив збірку, тобто пощастило.
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
import { join, relative, resolve, sep } from "node:path";

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

/**
 * Префікси build-директорій, які треба пропускати НЕ за точним іменем.
 *
 * `dist` у `SKIP_DIRS` не ловив `apps/server/dist-server/` — а там лежить
 * зібраний бандл із вкомпільованими коментарями, тобто з покажчиками на
 * доки, які вже давно переїхали. Наслідок: варто комусь локально прогнати
 * `pnpm build`, і `pnpm lint` червонів трьома «новими мертвими
 * посиланнями», яких у джерелах немає. Гейт звинувачував автора у зміні,
 * якої той не робив — рівно той клас дефекту, який цей скрипт має ловити.
 *
 * Префікс, а не ще одне точне ім'я: наступний `dist-ssr` чи `dist-worker`
 * не має повертати ту саму проблему.
 */
const SKIP_DIR_PREFIXES = ["dist-"];
const CODE_EXT = /\.(?:tsx?|jsx?|mjs|cjs)$/;

/**
 * Файли, де `docs/…md` — дані, а не покажчик (розбір — у шапці).
 *
 * Рядок сюди додають РАЗОМ із причиною: без неї список стає тихим способом
 * сховати мертвий покажчик замість того, щоб його полагодити.
 */
const SKIP_FILES = new Map([
  [
    "scripts/docs/generate-documentation-inventory.mjs",
    "`finalPathFor()` резолвить історичні шляхи в чинні — ті самі пари",
  ],
]);

/** Фікстури тестів вигадують шляхи (`docs/a.md`), покажчиками вони не є. */
const FIXTURE_DIR = `${sep}__tests__${sep}`;
// Межа `{0,200}` тут не косметична, а НЕОБХІДНА. Клас символів містить
// крапку, тобто перетинається з наступним `\.` — на вході з довгого рядка
// крапок рушій зʼїдає їх зірочкою, а тоді відкочується по одній, шукаючи
// `.md`. Без межі це поліноміальний backtracking (CodeQL
// `js/polynomial-redos`, severity high) на КОЖНІЙ стартовій позиції; із
// межею робота на позицію стала константною. 200 символів із запасом
// перекривають найдовший реальний шлях у репо.
const DOC_REF = /docs\/[A-Za-z0-9._/-]{0,200}\.md/g;

/**
 * Закріплений GitHub-URL (`blob/<40-hex sha>/…`) — не мертвий шлях за
 * визначенням, і сканер його не бачить.
 *
 * Hard Rule #23 забороняє локальні архівні дерева, тож заархівований док
 * лишається доступним лише так: URL на конкретний коміт попереднього репо.
 * Саме цією формою доки вже цитують, скажімо, `storage-roadmap.md`
 * (13-етапну карту сховища, повністю виконану й заархівовану). Без цього
 * пропуску `DOC_REF` витягав би `docs/work/…/storage-roadmap.md` ЗСЕРЕДИНИ
 * URL, `existsSync` казав би «немає» — і покажчик, який людина реально може
 * відкрити, рахувався б мертвим нарівні з тим, що веде в нікуди.
 *
 * Рівно 40 hex — навмисно: sha незмінний, тож посилання резолвиться за
 * побудовою. `blob/main/…` чи `blob/<гілка>/…` сюди НЕ потрапляють — вони
 * ротяться разом із гілкою і мають лишатися під наглядом.
 */
const PINNED_BLOB_URL =
  /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/blob\/[0-9a-f]{40}\/\S+/g;

/**
 * Чи лишається шлях усередині репо.
 *
 * Клас символів у `DOC_REF` пропускає `..`, тож збіг на кшталт
 * `docs/../../../etc/passwd.md` валідний за формою і виводить `existsSync`
 * за межі дерева. Практичної шкоди тут мало (скрипт лише питає «чи існує»),
 * але перевіряти існування довільного шляху зі вмісту файла — не те, що цей
 * гейт має робити, і статичний аналіз читає це так само.
 */
function insideRepo(rel) {
  const abs = resolve(ROOT, rel);
  return abs === ROOT || abs.startsWith(ROOT + sep);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    if (SKIP_DIR_PREFIXES.some((p) => entry.startsWith(p))) continue;
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
    if (!CODE_EXT.test(entry)) continue;
    if (full.includes(FIXTURE_DIR)) continue;
    if (SKIP_FILES.has(relative(ROOT, full))) continue;
    out.push(full);
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
  // Спершу прибираємо закріплені URL, і лише потім шукаємо шляхи — інакше
  // `DOC_REF` збігається з хвостом URL і резолвний покажчик стає «мертвим».
  const scannable = src.replace(PINNED_BLOB_URL, "");
  for (const ref of new Set(scannable.match(DOC_REF) ?? [])) {
    if (!byPath.has(ref)) byPath.set(ref, new Set());
    byPath.get(ref).add(relative(ROOT, file));
  }
}

const dead = [...byPath.keys()]
  .filter((p) => insideRepo(p) && !existsSync(join(ROOT, p)))
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
