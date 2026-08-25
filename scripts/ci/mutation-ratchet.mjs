#!/usr/bin/env node
// scripts/ci/mutation-ratchet.mjs
//
// Mutation-ratchet gate («не гірше ніж минулого разу») для Stryker-таргетів.
// Дзеркалить coverage-ratchet.mjs: baseline тримається на рівні останнього
// виміряного score, а не на статичному floor-і.
//
// ЧОМУ ЦЕ ПОТРІБНО ДОДАТКОВО ДО `thresholds.break: 70` У STRYKER-КОНФІГАХ:
// `break` — це статична підлога. Таргет, що реально тримає 95%, може
// просісти до 71% (десятки нових вижилих мутантів = неперевірена поведінка
// у грошовій / часовій / normalizer-логіці) і жодна джоба не почервоніє.
// Плюс звіти живуть 30 днів артефактами, історії score немає — деградацію
// нема з чим порівняти. Ratchet дає шару памʼять: baseline у
// mutation-ratchet.json + порівняння кожного weekly-прогону з ним.
//
//   - actual < baseline − epsilonPp  → FAIL (score деградував);
//   - actual > baseline + epsilonPp  → bump-кандидат (записується у файл
//     лише під `--bump`, локально/вручну — у CI baseline НЕ комітиться);
//   - «сіра зона» (baseline − epsilonPp ≤ actual ≤ baseline + epsilonPp) —
//     PASS без змін: epsilon поглинає шум Stryker-таймаутів і дрібні
//     рефакторинги, що зсувають набір мутантів на кілька штук;
//   - baseline === null → «ще не виміряно»: score друкується, гейт ПРОХОДИТЬ
//     (exit 0). Перший зелений weekly-прогін дає числа, які власник вносить
//     руками або через `--bump`.
//
// Fail-closed там, де це безпечно: якщо шлях до звіту відомий, а файла нема
// чи він не парситься — exit 1. Падіння самого Stryker не має тихо ставати
// «зеленим гейтом» (той самий урок, що й у --floors аудиті coverage-гейта).
//
// Формула score — канонічна Stryker-івська:
//
//   (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) * 100
//
// `Ignored` і `CompileError` у знаменник НЕ входять (мутант не був
// «під тестом» — його не можна ні зарахувати, ні поставити у провину).
//
// Usage:
//   node scripts/ci/mutation-ratchet.mjs                 # перевірка, без запису
//   node scripts/ci/mutation-ratchet.mjs --check-only    # те саме, явно (CI)
//   node scripts/ci/mutation-ratchet.mjs --bump          # переписати baseline вгору
//   node scripts/ci/mutation-ratchet.mjs --report utils=/шлях/до/mutation-report.json
//
// `--report <target>=<path>` перекриває дефолтний шлях із mutation-ratchet.json
// (у CI звіти приїжджають артефактами в окремі теки, не in-place). Якщо
// <path> — тека, у ній рекурсивно шукається mutation-report.json.
//
// Exit 0 = не гірше baseline (або baseline ще не виміряний);
// exit 1 = деградація понад epsilonPp, відсутній/побитий звіт, або
//          невідомий таргет у --report.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  appendFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolve } from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
export const BASELINE_PATH = path.join(REPO_ROOT, "mutation-ratchet.json");

export const REPORT_FILENAME = "mutation-report.json";

/** Статуси мутантів, що потрапляють у ЧИСЕЛЬНИК (мутант виявлено тестами). */
export const DETECTED_STATUSES = ["Killed", "Timeout"];

/**
 * Статуси мутантів, що потрапляють у ЗНАМЕННИК. `Ignored` і `CompileError`
 * свідомо відсутні: перший виключений конфігом, другий взагалі не дійшов до
 * тестів — обидва не характеризують якість тестів.
 */
export const DENOMINATOR_STATUSES = [
  "Killed",
  "Timeout",
  "Survived",
  "NoCoverage",
];

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Рахує мутантів за статусами по всіх файлах Stryker-звіту.
 * Чиста функція — жодної файлової роботи.
 *
 * @param {Record<string, {mutants?: Array<{status?: string}>}>} files
 *   — поле `files` звіту у форматі mutation-testing-elements
 * @returns {Record<string, number>} статус → кількість
 */
export function tallyMutants(files) {
  const counts = {};
  for (const entry of Object.values(files ?? {})) {
    for (const mutant of entry?.mutants ?? []) {
      const status = mutant?.status ?? "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Канонічний Stryker mutation score з тальки статусів.
 *
 * @param {Record<string, number>} counts
 * @returns {number|null} відсоток (2 знаки) або null, якщо знаменник 0
 *   (порожній звіт / усі мутанти Ignored чи CompileError — score невизначений)
 */
export function mutationScoreFromCounts(counts) {
  const sum = (statuses) =>
    statuses.reduce((acc, status) => acc + (counts[status] ?? 0), 0);

  const denominator = sum(DENOMINATOR_STATUSES);
  if (denominator === 0) return null;

  const detected = sum(DETECTED_STATUSES);
  return Math.round((detected / denominator) * 10000) / 100;
}

/**
 * Обчислює score з розпарсеного Stryker-звіту.
 *
 * @param {{files?: object}} report
 * @returns {{score: number|null, counts: Record<string, number>, total: number}}
 */
export function computeReportScore(report) {
  const counts = tallyMutants(report?.files);
  const total = Object.values(counts).reduce((acc, n) => acc + n, 0);
  return { score: mutationScoreFromCounts(counts), counts, total };
}

/**
 * Порівнює виміряні score з baseline-ом. Чиста функція — вся файлова робота
 * живе у main(), щоб node --test не потребував фікстур на диску.
 *
 * @param {{epsilonPp: number, targets: Record<string, {score: number|null}>}} baseline
 * @param {Record<string, number|null>} actuals — target → score
 *   (null = знаменник 0, score невизначений)
 * @returns {{failures: string[], bumps: Record<string, number>, report: string[],
 *            rows: Array<{target: string, actual: number|null,
 *                         baseline: number|null, verdict: string}>}}
 */
export function evaluateRatchet(baseline, actuals) {
  const failures = [];
  const bumps = {};
  const report = [];
  const rows = [];
  const epsilon = baseline.epsilonPp;

  for (const [target, entry] of Object.entries(baseline.targets)) {
    const floor = entry?.score ?? null;
    const actual = actuals[target] ?? null;

    // Baseline ще не виміряний: друкуємо факт і пропускаємо. Так виглядає
    // стан «щойно додали ratchet, Stryker ще не ходив» — гейт не має падати
    // лише через те, що йому нема з чим порівнювати.
    if (floor === null) {
      if (actual === null) {
        report.push(
          `ℹ️  ${target}: score не обчислено (знаменник 0 — порожній звіт або всі мутанти Ignored/CompileError); baseline теж null — пропускаю.`,
        );
        rows.push({ target, actual, baseline: floor, verdict: "не виміряно" });
      } else {
        bumps[target] = actual;
        report.push(
          `ℹ️  ${target}: ${actual}% — baseline ще не виміряний (null). Внеси число у mutation-ratchet.json руками або прожени --bump.`,
        );
        rows.push({
          target,
          actual,
          baseline: floor,
          verdict: "baseline не встановлено",
        });
      }
      continue;
    }

    // Baseline є, а score порахувати не вдалось — fail-closed: раніше таргет
    // мав мутантів у знаменнику, тепер їх нуль (mutate-глоб перестав щось
    // ловити / усе поїхало в Ignored). Це регресія конфігу, не «зелено».
    if (actual === null) {
      failures.push(
        `${target}: score не обчислено (знаменник 0), хоча baseline ${floor}% існує — ` +
          `перевір mutate-глоб у stryker-конфізі та статуси мутантів у звіті.`,
      );
      rows.push({ target, actual, baseline: floor, verdict: "❌ немає score" });
      continue;
    }

    if (actual < floor - epsilon) {
      failures.push(
        `${target}: mutation score ${actual}% < baseline ${floor}% − ${epsilon}пп. ` +
          `Убий вижилих мутантів тестами або (свідомо, з обґрунтуванням у PR) знизь baseline у mutation-ratchet.json.`,
      );
      rows.push({ target, actual, baseline: floor, verdict: "❌ просідання" });
    } else if (actual > floor + epsilon) {
      // Симетрично до fail-порогу (floor − epsilon): бампимо лише за
      // осмислений приріст понад epsilon, інакше дрібні коливання набору
      // мутантів шумували б baseline.
      bumps[target] = actual;
      report.push(
        `⬆️  ${target}: ${actual}% > baseline ${floor}% + ${epsilon}пп — bump-кандидат.`,
      );
      rows.push({ target, actual, baseline: floor, verdict: "⬆️ зростання" });
    } else {
      report.push(
        `✅ ${target}: ${actual}% (baseline ${floor}%, epsilon ${epsilon}пп).`,
      );
      rows.push({ target, actual, baseline: floor, verdict: "✅ ок" });
    }
  }

  return { failures, bumps, report, rows };
}

/**
 * Повертає оновлений baseline-обʼєкт із застосованими bump-ами
 * (не мутує вхідний обʼєкт; порядок ключів зберігається).
 */
export function applyBumps(baseline, bumps) {
  const targets = {};
  for (const [target, entry] of Object.entries(baseline.targets)) {
    targets[target] =
      target in bumps ? { ...entry, score: bumps[target] } : entry;
  }
  return { ...baseline, targets };
}

/**
 * Markdown-таблиця для GitHub step summary. Чиста функція — запис у
 * $GITHUB_STEP_SUMMARY живе у main().
 *
 * @param {Array<{target: string, actual: number|null, baseline: number|null,
 *                verdict: string}>} rows
 */
export function renderSummaryMarkdown(rows) {
  const fmt = (value) => (value === null ? "—" : `${value}%`);
  return [
    "## Mutation ratchet",
    "",
    "| Таргет | Score | Baseline | Вердикт |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| \`${r.target}\` | ${fmt(r.actual)} | ${fmt(r.baseline)} | ${r.verdict} |`,
    ),
    "",
    "Baseline `—` означає «ще не виміряно»: внеси число у `mutation-ratchet.json`",
    "руками або локальним `node scripts/ci/mutation-ratchet.mjs --bump`.",
    "",
  ].join("\n");
}

/**
 * Розбирає CLI-прапорці. Чиста функція.
 *
 * @param {string[]} argv — аргументи ПІСЛЯ `node script.mjs`
 * @returns {{checkOnly: boolean, bump: boolean, overrides: Record<string, string>}}
 */
export function parseArgs(argv) {
  const overrides = {};
  let checkOnly = false;
  let bump = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check-only") {
      checkOnly = true;
    } else if (arg === "--bump") {
      bump = true;
    } else if (arg.startsWith("--report=")) {
      const [target, ...rest] = arg.slice("--report=".length).split("=");
      overrides[target] = rest.join("=");
    } else if (arg === "--report") {
      const next = argv[i + 1] ?? "";
      const [target, ...rest] = next.split("=");
      overrides[target] = rest.join("=");
      i += 1;
    } else {
      throw new Error(`Невідомий аргумент: ${arg}`);
    }
  }

  if (checkOnly && bump) {
    throw new Error(
      "--check-only і --bump взаємовиключні: перший нічого не пише, другий саме для запису.",
    );
  }

  return { checkOnly, bump, overrides };
}

// ── File-facing helpers ──────────────────────────────────────────────────────

/**
 * Резолвить шлях до звіту: якщо переданий шлях — тека, рекурсивно шукає в ній
 * mutation-report.json. Потрібно, бо download-artifact розпаковує артефакт у
 * теку, а не у файл, і рівень вкладеності залежить від least-common-ancestor
 * шляхів на upload-і.
 *
 * @returns {string|null} шлях до файла або null, якщо не знайдено
 */
export function resolveReportPath(candidate) {
  if (!existsSync(candidate)) return null;
  if (statSync(candidate).isFile()) return candidate;

  const queue = [candidate];
  while (queue.length > 0) {
    const dir = queue.shift();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.name === REPORT_FILENAME) return full;
    }
  }
  return null;
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const targets = Object.keys(baseline.targets);

  const unknown = Object.keys(args.overrides).filter(
    (target) => !targets.includes(target),
  );
  if (unknown.length > 0) {
    console.error(
      `❌ --report посилається на невідомі таргети: ${unknown.join(", ")}. ` +
        `Відомі: ${targets.join(", ")}.`,
    );
    process.exit(1);
  }

  // Читання звітів. Fail-closed: шлях відомий для кожного таргета, тож
  // відсутній/побитий файл = помилка, а не «пропустили таргет».
  const actuals = {};
  const readErrors = [];
  for (const target of targets) {
    const configured =
      args.overrides[target] ?? baseline.targets[target]?.report;
    if (!configured) {
      readErrors.push(
        `${target}: не задано шлях до звіту (поле "report" у mutation-ratchet.json або --report ${target}=<path>).`,
      );
      continue;
    }

    const candidate = path.isAbsolute(configured)
      ? configured
      : path.join(REPO_ROOT, configured);
    const reportPath = resolveReportPath(candidate);
    if (reportPath === null) {
      readErrors.push(
        `${target}: не знайдено ${REPORT_FILENAME} за шляхом ${configured} — ` +
          `Stryker не відпрацював або артефакт не завантажився (fail-closed).`,
      );
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch (error) {
      readErrors.push(
        `${target}: ${reportPath} не парситься як JSON (${error.message}) — побитий звіт (fail-closed).`,
      );
      continue;
    }

    if (typeof parsed?.files !== "object" || parsed.files === null) {
      readErrors.push(
        `${target}: ${reportPath} без обʼєкта "files" — це не Stryker-звіт формату mutation-testing-elements (fail-closed).`,
      );
      continue;
    }

    const { score, counts, total } = computeReportScore(parsed);
    actuals[target] = score;
    console.log(
      `📄 ${target}: ${total} мутантів — ` +
        Object.entries(counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, n]) => `${status}=${n}`)
          .join(", "),
    );
  }

  if (readErrors.length > 0) {
    console.error("");
    for (const failure of readErrors) console.error(`❌ ${failure}`);
    console.error(
      "\nMutation ratchet failed: звіт(и) недоступні — гейт не може підтвердити score.",
    );
    process.exit(1);
  }

  const { failures, bumps, report, rows } = evaluateRatchet(baseline, actuals);

  console.log("");
  for (const line of report) console.log(line);

  // Step summary пишемо ЗАВЖДИ (і на червоному теж) — саме заради видимості
  // чисел цей гейт і додано.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      renderSummaryMarkdown(rows) + "\n",
    );
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(`❌ ${failure}`);
    console.error("\nMutation ratchet failed: score нижче baseline − epsilon.");
    process.exit(1);
  }

  const bumped = Object.keys(bumps);
  if (bumped.length > 0) {
    if (args.bump) {
      const updated = applyBumps(baseline, bumps);
      writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 2) + "\n");
      console.log(`\nmutation-ratchet.json оновлено (${bumped.join(", ")}).`);
    } else {
      console.log(
        `\nℹ️  Bump-кандидати (${bumped.join(", ")}) — у CI baseline свідомо НЕ комітиться. ` +
          `Онови локально: node scripts/ci/mutation-ratchet.mjs --bump`,
      );
    }
  }

  console.log("\n✅ Mutation ratchet: не гірше baseline.");
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
