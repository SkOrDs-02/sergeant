#!/usr/bin/env node
// scripts/docs/lint-spec-shape.mjs
//
// CI gate: кожна спека в `docs/90-work/planning/specs/` мусить нести
// чотири несучі секції шаблону (`TEMPLATE.md`), бо саме на них стоїть
// контракт виконавця — агента `spec-executor`:
//
//   • «Проблема» / «Мета» — навіщо це робимо; без них виконавець
//     добудовує мотивацію сам і робить не те;
//   • «Поза скоупом» — те, що агент зобовʼязаний НЕ робити
//     (`spec-executor`: «Anything the spec marks "Поза скоупом" stays
//     out of scope»); без межі побічні квести стають дозволеними;
//   • «Верифікація» — доказ, що фіча працює (`spec-executor`:
//     «§ Верифікація is mandatory»); без неї «зроблено» = «я так думаю».
//
// До цього гейта шаблон був домовленістю без механічного enforcement:
// 29 активних спек трималися на тому, що автор не забуде. Скіли й
// agent-graph лінтуються, ADR-граф лінтується, а спеки — ні.
//
// ЧОМУ BASELINE, А НЕ ПРОСТО «ВСІ МУСЯТЬ». Частина наявних документів
// у `specs/` писалась до шаблону або взагалі не є фічевими спеками.
// Вимагати від них повний набір означало б зробити гейт червоним від
// народження, а «червоний завжди» інформаційно дорівнює «вимкнений» —
// репо вже двічі це проходило на бандл-бюджетах (AGENTS.md
// § Performance budgets, ратчети 2026-08-02 і 2026-08-05). Тому діє
// той самий храповик, що й у `check-vi-mock-cap.mjs`: успадковані
// пропуски зафіксовані в `spec-shape-baseline.json`, НОВИЙ пропуск
// валить збірку, а запис у baseline можна лише прибрати, не додати.
//
// Документ у цій теці, який свідомо не є фічевою спекою (тексти бети,
// заморожений меморандум), оголошує це САМ, рядком у своїй шапці:
//
//   > **Spec-lint:** skip — <причина одним рядком>
//
// Оголошення видиме і greppable, на відміну від списку-виключень
// усередині скрипта, а звіт друкує кількість пропущених, щоб винятки
// не розповзалися тихо.
//
// Exit codes:
//   0 — нових пропусків немає (baseline може лишатись непорожнім)
//   1 — є новий пропуск, або baseline протух (запис на файл/секцію,
//       де пропуску вже немає — тобто храповик треба підкрутити вниз)
//
// Usage:
//   node scripts/docs/lint-spec-shape.mjs             # звіт
//   node scripts/docs/lint-spec-shape.mjs --json      # JSON
//   node scripts/docs/lint-spec-shape.mjs --update    # перезаписати baseline

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const SPECS_DIR = resolve(REPO_ROOT, "docs/90-work/planning/specs");
const BASELINE_PATH = resolve(__dirname, "spec-shape-baseline.json");
const SPECS_REL = "docs/90-work/planning/specs";

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has("--json");
const UPDATE_MODE = args.has("--update");

/**
 * Несучі секції та їхні прийнятні написання.
 *
 * Синоніми тут — не поблажливість, а зафіксована реальність: у 29
 * наявних спеках та сама секція зустрічається як «Поза скоупом»,
 * «Поза скоупом v1» і «Out of scope». Нормалізація нижче знімає
 * хвіст-уточнення в дужках («Верифікація (обовʼязково)») і три різні
 * апострофи (U+02BC / U+2019 / U+0027), якими репо користується
 * упереміш — без цього гейт ловив би друкарську варіативність замість
 * відсутньої секції.
 */
export const REQUIRED_SECTIONS = [
  { key: "Проблема", accepts: ["проблема"] },
  { key: "Мета", accepts: ["мета"] },
  { key: "Поза скоупом", accepts: ["поза скоупом", "out of scope"] },
  { key: "Верифікація", accepts: ["верифікація"] },
];

/** Рядок-оголошення «це не фічева спека» у шапці документа. */
const RE_SKIP_DECLARATION = /^>\s*\*\*Spec-lint:\*\*\s*skip\s*—\s*(\S.*)$/mu;

/** Заголовок другого рівня. */
const RE_H2 = /^##\s+(.+?)\s*$/gmu;

/**
 * Зводить заголовок до порівнюваної форми: без апострофів-варіантів,
 * без хвоста в дужках, без версійного суфікса «v1», у нижньому регістрі.
 */
export function normalizeHeading(raw) {
  return raw
    .replace(/[ʼ’']/gu, "")
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/\s+v\d+$/u, "")
    .trim()
    .toLowerCase();
}

/**
 * Секції, яких бракує у тексті спеки. Порівняння по префіксу, бо автори
 * дописують уточнення після назви («Поза скоупом v1», «Верифікація
 * (обовʼязково)» вже зняті нормалізацією, але трапляється й
 * «Поза скоупом — чому саме так»).
 */
export function missingSections(source) {
  const headings = [...source.matchAll(RE_H2)].map((m) =>
    normalizeHeading(m[1]),
  );
  return REQUIRED_SECTIONS.filter(
    (section) =>
      !headings.some((heading) =>
        section.accepts.some((accepted) => heading.startsWith(accepted)),
      ),
  ).map((section) => section.key);
}

/** Причина, з якої документ оголосив себе не-спекою, або `null`. */
export function skipReason(source) {
  const match = RE_SKIP_DECLARATION.exec(source);
  return match ? match[1].trim() : null;
}

/** Список файлів спек (без шаблона, без вкладених тек). */
export function listSpecFiles(dir = SPECS_DIR) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .filter((name) => name !== "TEMPLATE.md")
    .sort();
}

/**
 * Читає мапу успадкованих пропусків із baseline-файла.
 *
 * Відсутній або битий файл дає порожню мапу, а не помилку: тоді ЖОДЕН
 * пропуск не вважається успадкованим і гейт валить усі. Це навмисно
 * безпечний бік відмови — загублений baseline має проявитись як робота,
 * а не як тиша, що пропускає регресії.
 */
export function readBaseline(path = BASELINE_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed.entries === "object" ? parsed.entries : {};
  } catch {
    return {};
  }
}

/**
 * Порівнює фактичні пропуски з baseline.
 *
 * `added` — новий пропуск (валить збірку). `stale` — запис у baseline на
 * секцію, якої вже не бракує: храповик прокрутився вниз і baseline треба
 * оновити, інакше він тихо дозволить регресію назад.
 */
export function diffAgainstBaseline(actual, baseline) {
  const added = [];
  const stale = [];
  for (const [file, sections] of Object.entries(actual)) {
    const allowed = new Set(baseline[file] ?? []);
    for (const section of sections) {
      if (!allowed.has(section)) added.push({ file, section });
    }
  }
  for (const [file, sections] of Object.entries(baseline)) {
    const current = new Set(actual[file] ?? []);
    for (const section of sections) {
      if (!current.has(section)) stale.push({ file, section });
    }
  }
  return { added, stale };
}

/**
 * Обходить теку спек і розкладає результат на три частини: усі файли,
 * мапу фактичних пропусків і список тих, хто оголосив себе не-спекою
 * (разом із причиною — вона друкується у звіті, щоб винятки лишались
 * видимими).
 */
function collect() {
  const files = listSpecFiles();
  const actual = {};
  const skipped = [];
  for (const file of files) {
    const source = readFileSync(resolve(SPECS_DIR, file), "utf8");
    const reason = skipReason(source);
    if (reason) {
      skipped.push({ file, reason });
      continue;
    }
    const missing = missingSections(source);
    if (missing.length > 0) actual[file] = missing;
  }
  return { files, actual, skipped };
}

/**
 * Перезаписує baseline поточними пропусками (`--update`).
 *
 * Ключі й секції сортуються, щоб діф файла показував зміну змісту, а не
 * перестановку — інакше ревʼюер не бачить, храповик крутнувся вниз чи
 * хтось тихо додав новий дозволений пропуск.
 */
function writeBaseline(actual) {
  const sorted = Object.fromEntries(
    Object.keys(actual)
      .sort()
      .map((file) => [file, [...actual[file]].sort()]),
  );
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        $comment:
          "Успадковані пропуски секцій у специфікаціях. Храповик: записи можна лише прибирати. Регенерація — node scripts/docs/lint-spec-shape.mjs --update (лише коли пропуск ЗАКРИТО, не щоб додати новий).",
        entries: sorted,
      },
      null,
      2,
    ) + "\n",
  );
}

/**
 * CLI-точка входу: `--update` перезаписує baseline, `--json` друкує
 * машинний звіт, дефолт — людський звіт із кодом виходу.
 */
function main() {
  const { files, actual, skipped } = collect();

  if (UPDATE_MODE) {
    writeBaseline(actual);
    process.stdout.write(
      `Baseline оновлено: ${Object.keys(actual).length} файл(ів) із пропусками.\n`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  const { added, stale } = diffAgainstBaseline(actual, baseline);
  const checked = files.length - skipped.length;

  if (JSON_MODE) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: added.length === 0 && stale.length === 0,
          checked,
          skipped,
          actual,
          added,
          stale,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(added.length === 0 && stale.length === 0 ? 0 : 1);
  }

  const lines = [];
  lines.push(
    `Spec shape lint — перевірено ${checked} спек, пропущено ${skipped.length} за власним оголошенням, у baseline ${Object.keys(baseline).length} файл(ів).`,
  );

  if (added.length > 0) {
    lines.push("");
    lines.push(
      `🔴 FAIL — ${added.length} нов${added.length === 1 ? "ий пропуск" : "их пропуск(ів)"} секції:`,
    );
    for (const row of added) {
      lines.push(`   • ${SPECS_REL}/${row.file} — бракує «${row.section}»`);
    }
    lines.push(
      `   Шаблон: ${SPECS_REL}/TEMPLATE.md. Якщо документ свідомо не є фічевою спекою, додай у його шапку рядок`,
    );
    lines.push("   > **Spec-lint:** skip — <причина>");
  }

  if (stale.length > 0) {
    lines.push("");
    lines.push(
      `🔴 FAIL — ${stale.length} протухл(ий/их) запис(ів) у baseline: пропуск уже закрито, храповик треба підкрутити.`,
    );
    for (const row of stale) {
      lines.push(`   • ${row.file} — «${row.section}»`);
    }
    lines.push("   Прибери їх: node scripts/docs/lint-spec-shape.mjs --update");
  }

  if (added.length > 0 || stale.length > 0) {
    process.stderr.write(lines.join("\n") + "\n");
    process.exit(1);
  }

  lines.push("🟢 OK — нових пропусків немає.");
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

// Виконуємо лише при прямому запуску, не при імпорті з тестів.
const isMain = process.argv[1] === __filename;
if (isMain) main();
