#!/usr/bin/env node
// scripts/ci/check-vi-mock-cap.mjs
//
// vi.mock cap-ratchet («не гірше ніж зараз») проти over-mocking у тестах.
//
// ЧОМУ ЦЕЙ ГЕЙТ ІСНУЄ
//   Аудит покриття `docs/90-work/audits/2026-08-04-test-coverage-depth-audit.md`
//   знайшов системну слабкість: 574 файли з `vi.mock` (1830 викликів), з них
//   десятки — page-тести, де ВСІ хуки й діти застаблені у `<div data-testid>`,
//   а асерт зводиться до «монтується без краху». Такий тест не захищає
//   контракт props сторінка↔дитина: можна перейменувати проп, зламати
//   продакшн і лишитись зеленим. Число моків у файлі — груба, але чесна
//   проксі-метрика цієї деградації: коли тест мокає 20+ модулів, він більше
//   не тестує інтеграцію, він тестує власні стаби.
//
//   Гейт НЕ вимагає масового рефакторингу наявних тестів. Він ставить
//   ХРАПОВИК проти погіршення: наявні порушники записані у baseline і мають
//   рівно стільки моків, скільки мали на момент фіксації — і ні на один
//   більше. Новий файл понад cap — червоно одразу.
//
// ЧОМУ ОКРЕМИЙ СКРИПТ, А НЕ ПРАВИЛО В eslint-plugin-sergeant-design
//   Зміна design-правил тягне bump harness-версії + governance-синхронізацію
//   (AGENTS.md ↔ hard-rules.json ↔ per-rule files). Тут потрібен простий
//   baseline-храповик без governance-церемонії, тому це standalone-гейт у
//   ланцюжку `pnpm lint` — так само, як `lint:localstorage-allowlist` чи
//   `lint:archive-move-depth`.
//
// СКОУП СКАНУВАННЯ: `apps/**` + `packages/**`, файли `*.test.{ts,tsx,js,jsx,mjs,cjs}`.
//   Основний борг живе в `apps/web/src` (61 файл понад cap), `apps/server/src`
//   додає 8; `packages/**` і `apps/mobile-shell` природньо чисті, а
//   `apps/mobile` працює на jest (`jest.mock`) і тому дає нуль збігів.
//   Скоуп навмисно ширший за web: cap однаковий для всіх — новий
//   over-mocked серверний тест це той самий смел, і звужувати гейт до
//   однієї поверхні означало б лишити двері відчиненими збоку. Ціна
//   ширшого скоупу нульова: baseline фіксує факт, а не вигадану ціль.
//
// ЯК РАХУЄМО (і де межі точності)
//   Рахуємо збіги `vi.mock(` у джерелі, з якого попередньо ВИРІЗАНО
//   коментарі та вміст рядкових літералів (', ", `) — сканером символів з
//   евристикою на regex-літерали. Це НЕ AST-парсер, і це свідомо:
//     - `vi.mocked(` не рахується (інший API, не встановлює мок модуля);
//     - `vi.doMock(` теж не рахується — це runtime-API з іншою семантикою;
//     - `vi.mock(` всередині `${...}` у template-літералі буде пропущено
//       (вміст літерала вирізається цілком);
//     - екзотичний regex-літерал може збити евристику межі рядка.
//   Усі три випадки дають НЕДОрахунок, тобто в найгіршому разі гейт трохи
//   лояльніший — ніколи не фейлить чесний файл на порожньому місці.
//
// ПОВЕДІНКА (5 сценаріїв)
//   1. файл у baseline, лічильник = записаному          → PASS
//   2. файл у baseline, лічильник МЕНШИЙ                → PASS + підказка
//      знизити baseline (`--bump` перепише вниз / прибере запис, якщо файл
//      вже вклався в cap). Ратчет ходить ЛИШЕ вниз.
//   3. файл у baseline, лічильник БІЛЬШИЙ               → FAIL
//   4. файл поза baseline, лічильник > CAP              → FAIL
//   5. файл поза baseline, лічильник ≤ CAP              → PASS
//   Окремо: запис у baseline без файлу на диску (перейменований/видалений
//   тест) — це протухлий baseline. Він НЕ фейлить CI (інакше кожен рефактор
//   із перейменуванням тесту червонив би гейт замість того, щоб його
//   тішити), але друкується як ⚠️ і прибирається `--bump`. Мовчки такий
//   запис не зникає — інакше baseline тихо накопичував би сміття.
//
// Usage:
//   node scripts/ci/check-vi-mock-cap.mjs              # check-only (дефолт, CI)
//   node scripts/ci/check-vi-mock-cap.mjs --check-only # те саме, явно
//   node scripts/ci/check-vi-mock-cap.mjs --bump       # переписати baseline вниз
//
// Exit 0 = не гірше baseline; exit 1 = перевищення baseline або новий файл
// понад cap.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolve } from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
export const BASELINE_PATH = path.join(REPO_ROOT, "vi-mock-baseline.json");

/** Понад стільки моків у файлі — порушення (тобто > CAP, рівно CAP ще ок). */
export const CAP = 5;

/** Корені сканування (відносно REPO_ROOT). */
export const SCAN_ROOTS = ["apps", "packages"];

/** Директорії, у які не заходимо взагалі. */
export const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-server",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".expo",
  ".git",
  "android",
  "ios",
]);

const TEST_FILE_RE = /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Вирізає з JS/TS-джерела коментарі та вміст рядкових літералів, лишаючи
 * довжину рядків приблизно тією ж (замінюємо на пробіли лише там, де це
 * дешево). Евристика на regex-літерали: `/` починає regex, якщо попередній
 * значущий символ — один із `(,=:[!&|?{};` або початок файлу.
 *
 * Це НЕ парсер — свідомий компроміс (див. шапку файлу). Усі відомі
 * неточності дають недорахунок, не хибний FAIL.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripCommentsAndStrings(source) {
  let out = "";
  let i = 0;
  let lastSignificant = "";
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    // Рядковий коментар
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    // Блоковий коментар
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Рядкові літерали ' " ` — вміст викидаємо, лапки лишаємо як маркер
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      out += quote;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) break;
        // Переноси рядків усередині літерала зберігаємо, щоб не злипались
        // номери рядків у потенційній діагностиці.
        if (source[i] === "\n") out += "\n";
        i++;
      }
      out += quote;
      i++;
      lastSignificant = quote;
      continue;
    }

    // Regex-літерал (евристика)
    if (ch === "/" && "(,=:[!&|?{};\n".includes(lastSignificant || "\n")) {
      i++;
      let inClass = false;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "[") inClass = true;
        else if (source[i] === "]") inClass = false;
        else if (source[i] === "/" && !inClass) break;
        else if (source[i] === "\n") break; // незакрита — не regex, рятуємось
        i++;
      }
      i++;
      out += " ";
      lastSignificant = "/";
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i++;
  }

  return out;
}

/**
 * Рахує виклики `vi.mock(` у джерелі тесту.
 * `vi.mocked(` і `vi.doMock(` навмисно НЕ рахуються (див. шапку).
 *
 * @param {string} source
 * @returns {number}
 */
export function countViMocks(source) {
  const cleaned = stripCommentsAndStrings(source);
  // `\bvi` щоб не ловити `devi.mock`; `mock\s*\(` без `ed` — щоб `vi.mocked(`
  // не збігався (після `mock` іде `e`, а не `(`).
  const matches = cleaned.match(/\bvi\s*\.\s*mock\s*\(/g);
  return matches ? matches.length : 0;
}

/**
 * Порівнює виміряні лічильники з baseline-ом. Чиста функція — уся файлова
 * робота живе в main(), щоб node --test не потребував фікстур на диску.
 *
 * @param {{cap?: number, files: Record<string, number>}} baseline
 * @param {Record<string, number>} counts — file → кількість vi.mock
 *   (лише файли, знайдені на диску; включно з нулями або без них — байдуже)
 * @param {number} cap
 * @returns {{failures: string[], improvements: Record<string, number>,
 *            stale: string[], report: string[], nextFiles: Record<string, number>}}
 */
export function evaluateCap(baseline, counts, cap = CAP) {
  const failures = [];
  const improvements = {};
  const stale = [];
  const report = [];
  const allowed = baseline.files ?? {};

  // 1–3: файли, що є в baseline.
  for (const [file, budget] of Object.entries(allowed)) {
    if (!(file in counts)) {
      stale.push(file);
      continue;
    }
    const actual = counts[file];

    if (actual > budget) {
      failures.push(
        `${file}: ${actual} vi.mock (baseline ${budget}) — храповик ходить лише вниз. ` +
          `Не додавай мок у вже перемокований тест: винеси сценарій в окремий ` +
          `MSW-інтеграційний тест або зніми стаб із дитини й перевір реальний контракт props.`,
      );
    } else if (actual < budget) {
      improvements[file] = actual;
      report.push(
        `⬇️  ${file}: ${actual} vi.mock (було ${budget}) — baseline можна знизити.`,
      );
    }
  }

  // 4–5: файли поза baseline.
  for (const [file, actual] of Object.entries(counts)) {
    if (file in allowed) continue;
    if (actual > cap) {
      failures.push(
        `${file}: ${actual} vi.mock — понад cap ${cap} і файлу немає в baseline. ` +
          `Такий тест перевіряє власні стаби, а не продукт: замість моків підніми ` +
          `MSW-інтеграційний тест (мокається мережа, не хуки й діти). Якщо моки тут ` +
          `справді неминучі — додай файл у vi-mock-baseline.json (\`--bump\`) і ` +
          `обґрунтуй виняток у описі PR.`,
      );
    }
  }

  // Наступний стан baseline: наявні записи зі зниженням, без протухлих,
  // без тих, хто вже вклався в cap (їм виняток більше не потрібен).
  const nextFiles = {};
  for (const [file, budget] of Object.entries(allowed)) {
    if (!(file in counts)) continue; // протухлий — прибираємо
    const actual = counts[file];
    const value = Math.min(actual, budget);
    if (value <= cap) continue; // вклався в cap — виняток більше не потрібен
    nextFiles[file] = value;
  }

  return { failures, improvements, stale, report, nextFiles };
}

/**
 * Будує baseline «з нуля» за виміряними лічильниками: усі файли понад cap.
 * Використовується при першій генерації (`--bump` на порожньому baseline).
 *
 * @param {Record<string, number>} counts
 * @param {number} cap
 * @returns {Record<string, number>}
 */
export function buildBaselineFiles(counts, cap = CAP) {
  const files = {};
  for (const file of Object.keys(counts).sort()) {
    if (counts[file] > cap) files[file] = counts[file];
  }
  return files;
}

// ── File-system layer ────────────────────────────────────────────────────────

/** Рекурсивно збирає тестові файли під `roots` (posix-шляхи від repoRoot). */
export function collectTestFiles(repoRoot, roots = SCAN_ROOTS) {
  const found = [];

  const walk = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (TEST_FILE_RE.test(entry.name)) {
        found.push(path.relative(repoRoot, abs).split(path.sep).join("/"));
      }
    }
  };

  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    if (existsSync(abs)) walk(abs);
  }

  return found.sort();
}

/** file → кількість vi.mock для всіх тестових файлів у скоупі. */
export function measureRepo(repoRoot, roots = SCAN_ROOTS) {
  const counts = {};
  for (const file of collectTestFiles(repoRoot, roots)) {
    counts[file] = countViMocks(
      readFileSync(path.join(repoRoot, file), "utf8"),
    );
  }
  return counts;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return { schemaVersion: 1, cap: CAP, files: {} };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(baseline, files) {
  const ordered = {};
  for (const file of Object.keys(files).sort()) ordered[file] = files[file];
  const payload = {
    schemaVersion: baseline.schemaVersion ?? 1,
    description: baseline.description ?? DEFAULT_DESCRIPTION,
    cap: CAP,
    files: ordered,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
  return Object.keys(ordered).length;
}

const DEFAULT_DESCRIPTION =
  "Known test files exceeding the vi.mock cap (see scripts/ci/check-vi-mock-cap.mjs). " +
  "Each entry is a debt allowance, not a target: a file may go DOWN (run with --bump to " +
  "record the improvement) but never up. New files above the cap must not appear here " +
  "without an explicit justification in the PR description.";

// ── CLI entrypoint ───────────────────────────────────────────────────────────

function main() {
  const bump = process.argv.includes("--bump");
  const baseline = readBaseline();
  const counts = measureRepo(REPO_ROOT);

  const firstRun = Object.keys(baseline.files ?? {}).length === 0;
  if (firstRun && bump) {
    const written = writeBaseline(baseline, buildBaselineFiles(counts, CAP));
    console.log(
      `vi-mock-baseline.json згенеровано з нуля: ${written} файлів понад cap ${CAP}.`,
    );
    return;
  }

  const { failures, improvements, stale, report, nextFiles } = evaluateCap(
    baseline,
    counts,
    CAP,
  );

  for (const line of report) console.log(line);

  for (const file of stale) {
    console.warn(
      `⚠️  ${file}: є в baseline, але файлу немає на диску — baseline протух ` +
        `(перейменований чи видалений тест). Прибери запис: \`node scripts/ci/check-vi-mock-cap.mjs --bump\`.`,
    );
  }

  const scanned = Object.keys(counts).length;
  const overCap = Object.values(counts).filter((n) => n > CAP).length;
  console.log(
    `\nvi.mock cap ${CAP}: просканував ${scanned} тестових файлів, ` +
      `${overCap} понад cap, ${Object.keys(baseline.files ?? {}).length} у baseline.`,
  );

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(`❌ ${failure}`);
    console.error(
      `\nvi.mock cap gate failed: over-mocking погіршився. ` +
        `Контекст: docs/90-work/audits/2026-08-04-test-coverage-depth-audit.md.`,
    );
    process.exit(1);
  }

  const improvedCount = Object.keys(improvements).length;
  if (bump) {
    const written = writeBaseline(baseline, nextFiles);
    console.log(
      `vi-mock-baseline.json оновлено: ${written} записів ` +
        `(знижено ${improvedCount}, прибрано протухлих ${stale.length}).`,
    );
    return;
  }

  if (improvedCount > 0 || stale.length > 0) {
    console.log(
      `\nПідказка: \`node scripts/ci/check-vi-mock-cap.mjs --bump\` зафіксує ` +
        `покращення (${improvedCount}) і прибере протухлі записи (${stale.length}).`,
    );
  }

  console.log("✅ vi.mock cap: не гірше baseline.");
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
