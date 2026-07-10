#!/usr/bin/env node
// scripts/ci/coverage-ratchet.mjs
//
// Coverage-ratchet gate («не гірше ніж зараз»). На відміну від статичних
// floor-ів у coverage-thresholds.json (які піднімаються вручну і тому
// відстають від фактичного покриття), ratchet тримає baseline на рівні
// останнього виміряного значення:
//
//   - actual < baseline − epsilonPp  → FAIL (покриття деградувало);
//   - actual > baseline              → baseline у coverage-ratchet.json
//     переписується вгору (CI-крок далі комітить bump у PR-гілку);
//   - у «сірій зоні» (baseline − epsilonPp ≤ actual ≤ baseline) — PASS без
//     змін: epsilon поглинає шум v8-інструментації та дрібні рефакторинги.
//
// Гейт живе ТІЛЬКИ в CI (.github/workflows/ci.yml :: job `coverage`) —
// локальний повний suite на Windows флакі, тому жоден локальний script
// цей файл не викликає. Джерело метрики: coverage/coverage-summary.json
// (vitest v8 + reporter json-summary), який turbo кешує як output
// test:coverage — cache-hit replay віддає той самий JSON.
//
// Usage:
//   node scripts/ci/coverage-ratchet.mjs               # check + bump file
//   node scripts/ci/coverage-ratchet.mjs --check-only  # check, не писати
//
// Exit 0 = не гірше baseline (можливо, baseline піднято); exit 1 = деградація
// понад epsilonPp або відсутній coverage-summary.json для workspace-у.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolve } from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
export const BASELINE_PATH = path.join(REPO_ROOT, "coverage-ratchet.json");

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Порівнює виміряні значення з baseline-ом. Чиста функція — вся файлова
 * робота живе у main(), щоб node --test не потребував фікстур на диску.
 *
 * @param {{epsilonPp: number, workspaces: Record<string, {lines: number}>}} baseline
 * @param {Record<string, number|null>} actuals — workspace → total.lines.pct
 *   (null = coverage-summary.json відсутній або без total.lines.pct)
 * @returns {{failures: string[], bumps: Record<string, number>, report: string[]}}
 */
export function evaluateRatchet(baseline, actuals) {
  const failures = [];
  const bumps = {};
  const report = [];
  const epsilon = baseline.epsilonPp;

  for (const [workspace, { lines: floor }] of Object.entries(
    baseline.workspaces,
  )) {
    const actual = actuals[workspace];

    if (actual === null || actual === undefined) {
      failures.push(
        `${workspace}: coverage-summary.json відсутній або без total.lines.pct — ` +
          `гейт не може підтвердити покриття (перевір, що test:coverage відпрацював).`,
      );
      continue;
    }

    if (actual < floor - epsilon) {
      failures.push(
        `${workspace}: lines ${actual}% < baseline ${floor}% − ${epsilon}пп. ` +
          `Додай тести або (свідомо, з обґрунтуванням у PR) знизь baseline у coverage-ratchet.json.`,
      );
    } else if (actual > floor) {
      bumps[workspace] = actual;
      report.push(
        `⬆️  ${workspace}: ${actual}% > baseline ${floor}% — baseline піднято.`,
      );
    } else {
      report.push(
        `✅ ${workspace}: ${actual}% (baseline ${floor}%, epsilon ${epsilon}пп).`,
      );
    }
  }

  return { failures, bumps, report };
}

/**
 * Повертає оновлений baseline-обʼєкт із застосованими bump-ами
 * (не мутує вхідний обʼєкт; порядок ключів зберігається).
 */
export function applyBumps(baseline, bumps) {
  const workspaces = {};
  for (const [workspace, entry] of Object.entries(baseline.workspaces)) {
    workspaces[workspace] =
      workspace in bumps ? { ...entry, lines: bumps[workspace] } : entry;
  }
  return { ...baseline, workspaces };
}

/** Читає total.lines.pct з coverage-summary.json workspace-у (null якщо нема). */
export function readWorkspaceLinesPct(repoRoot, workspace) {
  const summaryPath = path.join(
    repoRoot,
    workspace,
    "coverage",
    "coverage-summary.json",
  );
  if (!existsSync(summaryPath)) return null;
  try {
    const pct = JSON.parse(readFileSync(summaryPath, "utf8"))?.total?.lines
      ?.pct;
    return typeof pct === "number" ? pct : null;
  } catch {
    return null;
  }
}

// ── CLI entrypoint ───────────────────────────────────────────────────────────

function main() {
  const checkOnly = process.argv.includes("--check-only");
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

  const actuals = {};
  for (const workspace of Object.keys(baseline.workspaces)) {
    actuals[workspace] = readWorkspaceLinesPct(REPO_ROOT, workspace);
  }

  const { failures, bumps, report } = evaluateRatchet(baseline, actuals);

  for (const line of report) console.log(line);

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(`❌ ${failure}`);
    console.error(
      "\nCoverage ratchet failed: покриття нижче baseline − epsilon.",
    );
    process.exit(1);
  }

  if (Object.keys(bumps).length > 0 && !checkOnly) {
    const updated = applyBumps(baseline, bumps);
    writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 2) + "\n");
    console.log(
      `\ncoverage-ratchet.json оновлено (${Object.keys(bumps).join(", ")}).`,
    );
  }

  console.log("\n✅ Coverage ratchet: не гірше baseline.");
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
