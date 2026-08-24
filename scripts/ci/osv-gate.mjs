#!/usr/bin/env node
// scripts/ci/osv-gate.mjs
//
// Ledger-backed OSV-Scanner gate for `nightly-audit.yml`.
//
// Навіщо цей файл існує. У nightly-audit дві незалежні лінії:
//
//   1. `pnpm audit` → `scripts/ci/audit-exceptions.mjs` — **ledger-aware**:
//      advisory проходить лише якщо його GHSA/CVE записаний у
//      `docs/04-governance/security/audit-exceptions.md` і `Due date` не
//      минув; `critical` не waive-иться ніколи.
//   2. `osv-scanner` — до цього гейта був **не** ledger-aware: валив джобу
//      за будь-якої ненульової кількості findings, будь-якої severity.
//
// Через (2) джоба падала щоночі на тих самих сімох давно задокументованих
// advisory, `notify-failure` щоночі оновлював issue «Nightly audit failure»,
// і сигнал перестав нести інформацію — рівно той стан «червоний завжди =
// вимкнений», який AGENTS.md § Performance budgets описує на прикладі
// size-limit. Гейт, який світиться червоним незалежно від змін, не ловить
// НОВУ вразливість — вона тоне серед старих.
//
// Цей скрипт зводить (2) до тих самих правил, що й (1): waive лише те, що
// названо в ledger-і поіменно і ще не прострочене. Нова вразливість у
// ledger-і відсутня → джоба падає, як і має.
//
// AI-CONTEXT: severity в SARIF від osv-scanner недостовірна — сканер емітить
// усі results рівнем `warning` (див. коментар у nightly-audit.yml), а
// CVSS-таблиця в тексті правила не гарантована. Тому severity беремо з
// `pnpm audit --json` через `--audit-json` і застосовуємо ТУ САМУ політику,
// що й pnpm-лінія: блокують лише `critical`/`high`, `moderate`/`low`
// трекаються, але збірку не валять (див. audit-exceptions.md § Поточні
// винятки). Без цього фільтра гейт валив би джобу на `body-parser` (low),
// тобто лишався б вічно червоним — рівно те, що цей PR і лікує.
//
// Finding, id якого немає в `pnpm audit`, вважається БЛОКУЮЧИМ: це або нова
// вразливість, або інша екосистема (Go/Python/actions), про severity якої ми
// нічого не знаємо. Невідоме ≠ безпечне.
//
// «critical ніколи не waive-иться» лишається на `audit-exceptions.mjs` —
// саме він має надійну severity з `pnpm audit --json` і крутиться в тому ж
// workflow (job `pnpm-audit-full`) та в `ci.yml`.
//
// Usage:
//   node scripts/ci/osv-gate.mjs <path/to/osv-scanner.sarif> [--audit-json <path>]
//
// Exit 0 = чисто або повністю waived; exit 1 = є не-waived finding, або
// SARIF відсутній / не парситься (невідомо ≠ чисто).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseAuditExceptions, parseAuditJson } from "./audit-exceptions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(
  __dirname,
  "../../docs/04-governance/security/audit-exceptions.md",
);
const DEFAULT_SARIF = "osv-scanner.sarif";

const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/gi;
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;

// Та сама політика, що в scripts/ci/audit-exceptions.mjs: нижче за `high`
// не блокує збірку. Тримати два списки синхронно — свідомий трейд-оф проти
// імпорту приватної константи з сусіднього модуля.
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

/**
 * Витягнути findings із SARIF-звіту osv-scanner.
 *
 * Кожен `result` посилається на правило через `ruleId`; сам ідентифікатор
 * вразливості (GHSA-… або OSV-…) сидить у `ruleId`, а його аліаси (CVE-…)
 * — у тексті правила (`shortDescription` / `fullDescription` / `help`).
 * Ledger може називати вразливість будь-яким із цих id, тож збираємо всі.
 *
 * @param {string} json raw SARIF
 * @returns {{ ruleId: string, ids: string[], where: string }[]}
 */
export function parseSarifFindings(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.runs)) return null;

  /** @type {{ ruleId: string, ids: string[], where: string }[]} */
  const out = [];
  for (const run of parsed.runs) {
    const ruleText = new Map();
    for (const rule of run?.tool?.driver?.rules ?? []) {
      if (!rule?.id) continue;
      ruleText.set(
        String(rule.id),
        [
          rule.id,
          rule.name,
          rule.shortDescription?.text,
          rule.fullDescription?.text,
          rule.help?.text,
          rule.help?.markdown,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    for (const result of run?.results ?? []) {
      const ruleId = String(result?.ruleId ?? "");
      const blob = [
        ruleId,
        ruleText.get(ruleId) ?? "",
        result?.message?.text ?? "",
      ].join("\n");
      out.push({
        ruleId,
        ids: extractIds(blob),
        where: String(
          result?.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "",
        ),
      });
    }
  }
  return out;
}

/**
 * Побудувати мапу `advisory id → severity` з `pnpm audit --json`.
 *
 * @param {string} json raw stdout of `pnpm audit --json`
 * @returns {Map<string, string>} ключі у верхньому регістрі (GHSA + CVE)
 */
export function buildSeverityMap(json) {
  const map = new Map();
  for (const adv of parseAuditJson(json)) {
    for (const id of [adv.ghsa, ...adv.cves].filter(Boolean)) {
      map.set(String(id).toUpperCase(), adv.severity);
    }
  }
  return map;
}

/**
 * Розвести findings на waived / blocked / ignored.
 *
 * Порядок рішень навмисно такий:
 *   1. severity нижче за `high` (за даними `pnpm audit`) → ignored, не шум;
 *   2. є чинний запис у ledger-і → waived;
 *   3. усе інше (зокрема id, невідомий `pnpm audit`) → blocked.
 *
 * @param {object} args
 * @param {ReturnType<typeof parseSarifFindings>} args.findings
 * @param {ReturnType<typeof parseAuditExceptions>} args.exceptions
 * @param {string} args.today ISO-дата (YYYY-MM-DD) для перевірки Due date
 * @param {Map<string, string>} [args.severityById] мапа з buildSeverityMap
 * @returns {{ blocked: object[], waived: object[], ignored: object[] }}
 */
export function evaluateSarifFindings({
  findings,
  exceptions,
  today,
  severityById = new Map(),
}) {
  const blocked = [];
  const waived = [];
  const ignored = [];

  for (const finding of findings ?? []) {
    const ids = new Set(finding.ids);

    // Severity беремо з pnpm audit. Невідомий id → блокуюча гілка нижче:
    // це або нова вразливість, або чужа екосистема, і мовчки її ковтати не можна.
    const severity =
      finding.ids.map((id) => severityById.get(id)).find(Boolean) ?? null;
    if (severity && !BLOCKING_SEVERITIES.has(severity)) {
      ignored.push({ ...finding, severity });
      continue;
    }

    const match =
      exceptions.find((exc) => exc.ids.some((id) => ids.has(id))) ?? null;

    if (!match) {
      blocked.push({
        ...finding,
        severity,
        reason: severity ? "no ledger entry" : "unknown to pnpm audit",
      });
      continue;
    }
    if (match.dueDate && match.dueDate < today) {
      blocked.push({
        ...finding,
        severity,
        reason: `ledger exception expired ${match.dueDate}`,
      });
      continue;
    }
    waived.push({
      ...finding,
      severity,
      waiver: match.title,
      dueDate: match.dueDate,
    });
  }

  return { blocked, waived, ignored };
}

function extractIds(blob) {
  return [
    ...new Set(
      [...(blob.match(GHSA_RE) ?? []), ...(blob.match(CVE_RE) ?? [])].map((s) =>
        s.toUpperCase(),
      ),
    ),
  ];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const argv = process.argv.slice(2);
  const auditFlag = argv.indexOf("--audit-json");
  const auditJsonPath = auditFlag === -1 ? null : argv[auditFlag + 1];
  const sarifPath =
    argv.find((a, i) => !a.startsWith("--") && i !== auditFlag + 1) ??
    DEFAULT_SARIF;

  let raw;
  try {
    raw = readFileSync(sarifPath, "utf8");
  } catch (err) {
    // Немає звіту — гейт нічого не перевірив. Це «невідомо», не «чисто».
    console.error(
      `❌ osv gate: cannot read SARIF at ${sarifPath} — ${err.message}`,
    );
    process.exit(1);
  }

  const findings = parseSarifFindings(raw);
  if (findings === null) {
    console.error(
      `❌ osv gate: ${sarifPath} is not a parseable SARIF report — cannot verify vulnerabilities.`,
    );
    process.exit(1);
  }

  let severityById = new Map();
  if (auditJsonPath) {
    try {
      severityById = buildSeverityMap(readFileSync(auditJsonPath, "utf8"));
    } catch (err) {
      // Без severity-даних гейт стає суворішим (усе невідоме блокує), а не
      // м'якшим — тож це попередження, не фатальна помилка.
      console.warn(
        `⚠️  osv gate: cannot read ${auditJsonPath} (${err.message}); ` +
          "усі findings трактуються як блокуючі.",
      );
    }
  }

  const exceptions = parseAuditExceptions(readFileSync(LEDGER_PATH, "utf8"));
  const { blocked, waived, ignored } = evaluateSarifFindings({
    findings,
    exceptions,
    today: todayIso(),
    severityById,
  });

  for (const i of ignored) {
    console.log(`· below gate (${i.severity}): ${i.ruleId}`);
  }
  for (const w of waived) {
    console.log(
      `· waived: ${w.ruleId}${w.where ? ` (${w.where})` : ""} — "${w.waiver}"${
        w.dueDate ? ` (due ${w.dueDate})` : ""
      }`,
    );
  }

  if (blocked.length === 0) {
    console.log(
      `✅ osv gate: ${findings.length} finding(s) — ${waived.length} waived by the ledger, ` +
        `${ignored.length} below the critical/high gate.`,
    );
    return;
  }

  console.error(`❌ osv gate: ${blocked.length} un-waived finding(s):`);
  for (const b of blocked) {
    console.error(
      `   ${b.ruleId}${b.severity ? ` [${b.severity}]` : ""}${
        b.where ? ` (${b.where})` : ""
      } — ${b.reason}`,
    );
  }
  console.error(
    "\nПідніми версію залежності, або додай датований виняток у " +
      "docs/04-governance/security/audit-exceptions.md § Поточні винятки.",
  );
  process.exit(1);
}

// Run only as a CLI, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
