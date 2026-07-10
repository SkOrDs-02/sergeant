#!/usr/bin/env node
// Dependency Sweeper — L1 report engine (read-only).
//
// Aggregates `pnpm outdated`, `pnpm audit`, and `pnpm licenses:check` into one
// Markdown digest, triages every outdated package into safe / risky, and marks
// CVEs already covered by docs/04-governance/security/audit-exceptions.md so the
// report never re-nags about a waived advisory.
//
// AI-CONTEXT: This script MUST stay side-effect-free. It only reads the tree and
// prints Markdown to stdout — it never installs, writes lockfiles, commits, or
// mutates package.json. The phased rollout (L1 report-only → L2 auto-patch) in
// docs/00-start/playbooks/dependency-sweeper.md depends on this invariant: L1 is
// safe to schedule unattended precisely because this engine cannot change state.
//
// Exit code is ALWAYS 0 on a successful scan (pnpm outdated/audit exit non-zero
// when findings exist — that is data, not failure). A non-zero exit means the
// scan itself broke.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a command, capturing stdout even when the tool exits non-zero. */
function capture(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }) };
  } catch (err) {
    // pnpm outdated/audit exit 1 when they find something — stdout still holds the payload.
    return { ok: false, out: (err.stdout ?? "") + "", err: (err.stderr ?? "") + "" };
  }
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GHSA/CVE ids that already have a live waiver in the audit-exceptions ledger. */
function waivedAdvisoryIds() {
  const ids = new Set();
  try {
    const ledger = readFileSync(join(repoRoot, "docs/04-governance/security/audit-exceptions.md"), "utf8");
    for (const m of ledger.matchAll(/(GHSA-[0-9a-z-]+|CVE-\d{4}-\d+)/gi)) ids.add(m[1].toUpperCase());
  } catch {
    /* ledger missing — treat nothing as waived */
  }
  return ids;
}

function classifyBump(current, latest) {
  const clean = (v) => String(v).replace(/[^\d.].*$/, "");
  const cRaw = clean(current);
  const lRaw = clean(latest);
  if (!cRaw || !lRaw) return "unknown"; // non-semver (e.g. "workspace:*") → treat as risky
  const c = cRaw.split(".").map(Number);
  const l = lRaw.split(".").map(Number);
  if (Number.isNaN(c[0]) || Number.isNaN(l[0])) return "unknown";
  if (l[0] > c[0]) return "major";
  if (l[0] === c[0] && (l[1] ?? 0) > (c[1] ?? 0)) return "minor";
  return "patch";
}

// ponytail: one runnable check on the classifier — the safe/risky gate hinges on it.
if (process.argv.includes("--selftest")) {
  const eq = (a, b, m) => {
    if (a !== b) throw new Error(`selftest: ${m} — got ${a}, want ${b}`);
  };
  eq(classifyBump("7.6.7", "8.4.1"), "major", "major bump");
  eq(classifyBump("5.100.9", "5.101.0"), "minor", "minor bump");
  eq(classifyBump("3.8.3", "3.8.4"), "patch", "patch bump");
  eq(classifyBump("workspace:*", "1.0.0"), "unknown", "non-semver");
  console.log("selftest OK");
  process.exit(0);
}

// --- scan -----------------------------------------------------------------
const outdated = capture("pnpm -r outdated --format json");
const audit = capture("pnpm audit --json");
const licenses = capture("pnpm licenses:check");
const waived = waivedAdvisoryIds();

// --- parse outdated -------------------------------------------------------
// pnpm's recursive JSON omits `current` (workspace-specific), so classify by
// the wanted→latest semver delta: how far past the declared range latest sits.
// safe = patch/minor (in-range refresh or small out-of-range bump); risky =
// major (breaking) or an unparseable range.
const outdatedMap = tryJson(outdated.out) ?? {};
const rows = Object.entries(outdatedMap).map(([name, info]) => {
  const wanted = info.wanted ?? "";
  const latest = info.latest ?? "";
  const isDev = info.dependencyType === "devDependencies";
  const isTypes = name.startsWith("@types/");
  const kind = wanted && latest && wanted === latest ? "in-range" : classifyBump(wanted, latest);
  const safe = kind === "in-range" || kind === "patch" || kind === "minor";
  return { name, wanted, latest, kind, isDev, isTypes, safe };
});
const safeRows = rows.filter((r) => r.safe);
const riskyRows = rows.filter((r) => !r.safe);

// --- parse audit ----------------------------------------------------------
const auditJson = tryJson(audit.out);
const advisories = [];
if (auditJson?.advisories) {
  for (const a of Object.values(auditJson.advisories)) {
    const id = (a.github_advisory_id ?? a.cves?.[0] ?? a.url ?? "").toUpperCase();
    advisories.push({
      id,
      title: a.title ?? "",
      module: a.module_name ?? "",
      severity: a.severity ?? "unknown",
      waived: id && waived.has(id),
    });
  }
}
const sevRank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
advisories.sort((x, y) => (sevRank[x.severity] ?? 9) - (sevRank[y.severity] ?? 9));
const actionableAdvisories = advisories.filter((a) => !a.waived);
const highSev = actionableAdvisories.filter((a) => a.severity === "critical" || a.severity === "high");

// --- classify license result ---------------------------------------------
// Distinguish a real policy breach from "couldn't run" (worktree/env), so an
// environment hiccup never triggers a false human-gate every cycle.
const licText = (licenses.out || "") + (licenses.err || "");
const licenseState = licenses.ok || /License policy check OK/.test(licText)
  ? "ok"
  : /License policy check failed/.test(licText)
    ? "violation"
    : "error";

// --- render ---------------------------------------------------------------
const nl = "\n";
const out = [];
out.push("# 🧹 Dependency Sweeper — L1 report (read-only)");
out.push("");
out.push("> Режим **L1: report-only**. Цей звіт нічого не комітить і не бампить — лише читає дерево залежностей. Рішення про апдейт ухвалює власник.");
out.push("");
out.push("## TL;DR");
out.push("");
out.push(`- 📦 Застарілих пакетів: **${rows.length}** (safe: ${safeRows.length}, risky/major: ${riskyRows.length})`);
out.push(`- 🔐 Активних CVE (не waived): **${actionableAdvisories.length}**${highSev.length ? ` — з них high/critical: **${highSev.length}** ⚠️` : ""}`);
out.push(`- 🪪 Ліцензійна політика: ${{ ok: "✅ OK", violation: "❌ порушення політики (див. нижче)", error: "⚠️ не вдалося перевірити (env/worktree)" }[licenseState]}`);
out.push(`- 🕓 Waived CVE у ledger (пропущено навмисно): ${advisories.length - actionableAdvisories.length}`);
out.push("");

// Human-gate summary
const gates = [];
if (highSev.length) gates.push(`**${highSev.length} high/critical CVE** — ескалювати чіпом, НЕ автофіксити`);
if (riskyRows.length) gates.push(`**${riskyRows.length} major bump** — ескалювати, НЕ автобампити`);
if (licenseState === "violation") gates.push("**license-порушення політики** — ескалювати до owner");
out.push("## 🚦 Human-gates (ескалація, ніколи не автофікс)");
out.push("");
out.push(gates.length ? gates.map((g) => `- ${g}`).join(nl) : "- (немає) — цього циклу все в межах safe-зони");
out.push("");

// Safe candidates
out.push("## ✅ Safe-кандидати (patch/minor) — придатні для L2 auto-patch");
out.push("");
if (safeRows.length) {
  out.push("| Пакет | Ціль (latest) | Δ | Тип |");
  out.push("| --- | --- | --- | --- |");
  for (const r of safeRows.slice(0, 60)) {
    out.push(`| \`${r.name}\` | ${r.latest} | ${r.kind} | ${r.isDev ? "dev" : "prod"}${r.isTypes ? " · @types" : ""} |`);
  }
  if (safeRows.length > 60) out.push(`| … | | | +${safeRows.length - 60} ще |`);
} else {
  out.push("_немає — усе актуальне або лишились тільки major._");
}
out.push("");

// Risky
out.push("## ⚠️ Risky (major / unknown) — human-gate, ескалація");
out.push("");
if (riskyRows.length) {
  out.push("| Пакет | В межах range (wanted) | Остання (latest) | Δ | Тип |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const r of riskyRows.slice(0, 60)) {
    out.push(`| \`${r.name}\` | ${r.wanted} | ${r.latest} | ${r.kind} | ${r.isDev ? "dev" : "prod"} |`);
  }
  if (riskyRows.length > 60) out.push(`| … | | | | +${riskyRows.length - 60} ще |`);
} else {
  out.push("_немає major-бампів цього циклу._");
}
out.push("");

// CVE
out.push("## 🔐 Вразливості (`pnpm audit`)");
out.push("");
if (actionableAdvisories.length) {
  out.push("| Severity | Advisory | Пакет | Заголовок |");
  out.push("| --- | --- | --- | --- |");
  for (const a of actionableAdvisories.slice(0, 40)) {
    out.push(`| ${a.severity} | \`${a.id}\` | \`${a.module}\` | ${a.title.slice(0, 80)} |`);
  }
  out.push("");
  out.push("> high/critical → ескалювати. Якщо патчу нема — запис у [`audit-exceptions.md`](../../04-governance/security/audit-exceptions.md), не тут.");
} else {
  out.push("_немає активних вразливостей поза ledger-ом._");
}
out.push("");

// Licenses
if (licenseState !== "ok") {
  out.push(licenseState === "violation" ? "## 🪪 License-порушення політики" : "## 🪪 License-перевірка не виконалась");
  out.push("");
  if (licenseState === "error") out.push("> `pnpm licenses:check` не зміг відпрацювати (типово — env/worktree, напр. `pnpm licenses list failed`). Це **не** порушення політики й **не** human-gate — перевір локально повним `pnpm licenses:check`.");
  out.push("```");
  out.push((licText || "").trim().slice(0, 1200));
  out.push("```");
  out.push("");
}

out.push("---");
out.push("");
out.push("_Згенеровано `scripts/dependency-sweeper-report.mjs` — read-only движок L1. Мапінг фаз і L1→L2→L3: [`dependency-sweeper.md`](../../00-start/playbooks/dependency-sweeper.md)._");

process.stdout.write(out.join(nl) + nl);
