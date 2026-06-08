#!/usr/bin/env node
// scripts/docs/generate-status.mjs
//
// Single control-panel generator → `docs/STATUS.md`.
//
// STATUS.md is the one human-facing page that answers, at a glance:
//   - 🎯 що в фокусі зараз          (manual FOCUS block, preserved across regen)
//   - 🟢 що вже зроблено            (from docs/pr-ledger/index.json — shipped PRs)
//   - 🔵 що в роботі                (open-work rollup: per-tracker counts + freshest)
//   - ⏭️ що далі / заблоковано      (priority markers — reuse generate-today logic)
//   - 🧱 який стек                   (links into the architecture deep-dives)
//   - 🗺️ карта доків (8 доменів)    (genre-grouped navigation map)
//
// It is a HYBRID document. Everything is regenerated deterministically EXCEPT
// the FOCUS block between `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`, whose
// content is read from the existing file and re-inserted verbatim. This mirrors
// the trust-badge pattern in docs/README.md, but inverted: there the generated
// region is small and the doc is hand-maintained; here the doc is generated and
// the hand-maintained region is small.
//
// Usage:
//   node scripts/docs/generate-status.mjs            # write docs/STATUS.md
//   node scripts/docs/generate-status.mjs --check    # CI gate (fail on diff)
//
// Exit codes:
//   0  — write succeeded OR --check confirms no diff
//   1  — --check diff detected OR I/O error
//
// The output is deterministic given the same inputs (pr-ledger + tracker Status
// headers + FOCUS block), so it is safe to run from cron and produces idempotent
// commits.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { collectOpenWork, TRACKERS } from "./generate-open-work.mjs";
import { pickPriorityItems } from "./generate-today.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/STATUS.md");
const PR_LEDGER_PATH = resolve(REPO_ROOT, "docs/pr-ledger/index.json");

const REPO_SLUG = "Skords-01/Sergeant";

const args = new Set(process.argv.slice(2));
const CHECK_MODE = args.has("--check");

const TODAY = new Date().toISOString().slice(0, 10);

// How many shipped PRs / in-flight items to surface. Past ~10 the page stops
// being a glance and becomes a report — that is what open-work.md is for.
const SHIPPED_N = 10;
const INFLIGHT_N = 8;

const FOCUS_START = "<!-- FOCUS:START -->";
const FOCUS_END = "<!-- FOCUS:END -->";

// Default FOCUS content used when STATUS.md does not yet exist (or its FOCUS
// region is empty). The maintainer overwrites this between the markers.
const DEFAULT_FOCUS = [
  "_Цей блок — єдине, що ти редагуєш вручну. Напиши 3-5 рядків: над чим зараз працюємо, що головний пріоритет тижня, що свідомо відкладено. Решта сторінки генерується автоматично з трекерів + pr-ledger._",
].join("\n");

// ── FOCUS block preservation ────────────────────────────────────────────────

/**
 * Extract the current FOCUS block content (text between the markers) from an
 * existing STATUS.md. Returns `DEFAULT_FOCUS` when the file or markers are
 * absent, or when the region is whitespace-only. Pure for testability.
 */
export function extractFocus(existing) {
  if (!existing) return DEFAULT_FOCUS;
  const i = existing.indexOf(FOCUS_START);
  const j = existing.indexOf(FOCUS_END);
  if (i === -1 || j === -1 || j < i) return DEFAULT_FOCUS;
  const inner = existing.slice(i + FOCUS_START.length, j).trim();
  return inner.length > 0 ? inner : DEFAULT_FOCUS;
}

// ── Shipped ledger (🟢 done) ─────────────────────────────────────────────────

/**
 * Read docs/pr-ledger/index.json and return the most-recently-merged PRs,
 * newest first. Tolerates a missing/empty ledger (returns []).
 */
export function loadShipped(ledgerPath = PR_LEDGER_PATH, limit = SHIPPED_N) {
  let raw;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const prs = Array.isArray(parsed?.prs) ? parsed.prs : [];
  return [...prs]
    .filter((p) => p && typeof p.number === "number")
    .sort((a, b) => String(b.merged_at).localeCompare(String(a.merged_at)))
    .slice(0, limit);
}

function fmtShipped(pr) {
  const date = String(pr.merged_at ?? "").slice(0, 10);
  const url = `https://github.com/${REPO_SLUG}/pull/${pr.number}`;
  const title = pr.title ?? `PR #${pr.number}`;
  return `- [#${pr.number}](${url}) — ${title}${date ? ` _(${date})_` : ""}`;
}

// ── In-flight rollup (🔵 doing) ──────────────────────────────────────────────

/** Highest PR number referenced in an entry (0 if none). Recency proxy. */
function maxPr(entry) {
  const prs = Array.isArray(entry.prs) ? entry.prs : [];
  return prs.length ? Math.max(...prs) : 0;
}

/**
 * Flatten the open-work report into a single list of in-flight entries,
 * decorated with their tracker title. Returns
 * `{ perTracker: [{title, count}], total, recent: [entries] }`.
 *
 * `recent` is ranked by the highest PR number the doc references — a
 * deterministic recency proxy. We deliberately avoid file mtime: `git
 * checkout` does not preserve mtimes, so an mtime sort would order
 * differently on a fresh CI clone than on the author's machine and make
 * the `--check` gate flaky. Ties break on `linkPath` (asc) for stability.
 */
export function summariseInFlight(report) {
  const perTracker = [];
  let total = 0;
  const all = [];
  for (const { tracker, entries } of report) {
    perTracker.push({ title: tracker.title, count: entries.length });
    total += entries.length;
    for (const e of entries) all.push({ tracker, ...e });
  }
  all.sort((a, b) => {
    const d = maxPr(b) - maxPr(a);
    return d !== 0 ? d : a.linkPath.localeCompare(b.linkPath);
  });
  return { perTracker, total, recent: all.slice(0, INFLIGHT_N) };
}

function fmtInFlight(item) {
  // First sentence of the status, trimmed — enough to know what's happening
  // without the full open-work prose.
  const status = String(item.rawStatus ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `- [\`${item.linkPath}\`](./${item.linkPath}) — ${item.title} — ${status} _(${item.tracker.title})_`;
}

// ── Markdown rendering ───────────────────────────────────────────────────────

function render({ focus, shipped, inflight, priority }) {
  const lines = [];
  lines.push("# Sergeant — Панель керування");
  lines.push("");
  lines.push(
    `> **Last validated:** ${TODAY} by docs:gen-status. **Next review:** ${TODAY}.`,
  );
  lines.push(`> **Status:** Reference`);
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->",
  );
  lines.push("");
  lines.push(
    "Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).",
  );
  lines.push("");

  // ── 🎯 Focus (manual) ─────────────────────────────────────────────────────
  lines.push("## 🎯 Фокус зараз");
  lines.push("");
  lines.push(FOCUS_START);
  lines.push("");
  lines.push(focus);
  lines.push("");
  lines.push(FOCUS_END);
  lines.push("");

  // ── 🟢 Done ───────────────────────────────────────────────────────────────
  lines.push(`## 🟢 Зроблено нещодавно`);
  lines.push("");
  if (shipped.length === 0) {
    lines.push(
      "_pr-ledger порожній. Записи з'являються автоматично, коли merged-PR торкається canonical-доку (ADR / ініціатива / playbook / hard-rule) — див. [`pr-ledger/`](./pr-ledger/README.md)._",
    );
  } else {
    lines.push(
      `Останні ${shipped.length} PR, що торкнулися canonical-доків. Повна історія → [\`pr-ledger/index.json\`](./pr-ledger/index.json).`,
    );
    lines.push("");
    for (const pr of shipped) lines.push(fmtShipped(pr));
  }
  lines.push("");

  // ── 🔵 Doing ──────────────────────────────────────────────────────────────
  lines.push(`## 🔵 В роботі — ${inflight.total} відкритих`);
  lines.push("");
  lines.push("| Трекер | Відкрито |");
  lines.push("| --- | --- |");
  for (const t of inflight.perTracker) {
    lines.push(`| ${t.title} | ${t.count} |`);
  }
  lines.push("");
  if (inflight.recent.length > 0) {
    lines.push(
      `**Найактивніше (${inflight.recent.length}, за останніми PR):**`,
    );
    lines.push("");
    for (const item of inflight.recent) lines.push(fmtInFlight(item));
    lines.push("");
  }

  // ── ⏭️ Next / blocked ─────────────────────────────────────────────────────
  lines.push("## ⏭️ Наступний крок / заблоковано");
  lines.push("");
  if (priority.length === 0) {
    lines.push(
      "_Жодного `Phase X next` / `Stage X blocked` маркера. Деталі по фазах — у самих трекерах._",
    );
  } else {
    lines.push(
      "Items із явним `Phase/Stage X next|blocked|pending` маркером — `blocked` першими.",
    );
    lines.push("");
    for (const item of priority) {
      const tag =
        item.priorityKind === "blocked"
          ? `Phase ${item.priorityPhase} blocked 🚧`
          : `Phase ${item.priorityPhase} — ${item.priorityKind}`;
      lines.push(
        `- [\`${item.linkPath}\`](./${item.linkPath}) — ${item.title} → **${tag}** _(${item.tracker.title})_`,
      );
    }
  }
  lines.push("");

  // ── 🧱 Stack ──────────────────────────────────────────────────────────────
  lines.push("## 🧱 Стек");
  lines.push("");
  lines.push(
    "pnpm 9 + Turborepo monorepo, Node 22, TypeScript. 4 застосунки + `tools/openclaw` + 12 пакетів. Канонічні джерела:",
  );
  lines.push("");
  lines.push(
    "- [`architecture/repo-map.md`](./02-engineering/architecture/repo-map.md) — per-app стек, per-package призначення, build/deploy виходи (auto-derived).",
  );
  lines.push(
    "- [`architecture/service-catalog.md`](./02-engineering/architecture/service-catalog.md) — runtime-поверхні та сервіси.",
  );
  lines.push(
    "- [`architecture/README.md`](./02-engineering/architecture/README.md) — repo map, C4-діаграми, domain invariants.",
  );
  lines.push(
    "- [`../AGENTS.md`](../AGENTS.md) — repo overview, hard rules, performance budgets, scope enum.",
  );
  lines.push("");

  // ── 🗺️ Doc map ────────────────────────────────────────────────────────────
  lines.push("## 🗺️ Карта доків");
  lines.push("");
  lines.push(
    "Повний жанровий індекс → [`README.md`](./README.md). Коротка карта верхнього рівня:",
  );
  lines.push("");
  lines.push("| Домен | Що там | Коли читати |");
  lines.push("| --- | --- | --- |");
  lines.push(
    "| **Старт** | [`agents/`](./agents/README.md), [`playbooks/`](./playbooks/README.md) | онбординг, routing, рецепти |",
  );
  lines.push(
    "| **Продукт** | [`launch/`](./01-product/launch/README.md), [`marketing/`](./01-product/marketing/README.md), [`copy/`](./01-product/copy/README.md) | GTM, монетизація, FTUX |",
  );
  lines.push(
    "| **Інженерія** | [`architecture/`](./02-engineering/architecture/README.md), [`api/`](./02-engineering/api/README.md), [`web/`](./02-engineering/web/README.md), [`mobile/`](./02-engineering/mobile/README.md), [`testing/`](./02-engineering/testing/README.md), [`integrations/`](./02-engineering/integrations/README.md) | як влаштовано і як білдити |",
  );
  lines.push(
    "| **Операції** | [`deploy/`](./03-operations/deploy/README.md), [`observability/`](./03-operations/observability/README.md), [`runbooks/`](./03-operations/runbooks/README.md), [`postmortems/`](./03-operations/postmortems/README.md), [`ops/`](./03-operations/ops/README.md) | деплой, алерти, інциденти |",
  );
  lines.push(
    "| **Governance** | [`governance/`](./governance/README.md), [`security/`](./security/README.md), [`adr/`](./adr/README.md) | hard rules, рішення, безпека |",
  );
  lines.push(
    "| **Дизайн** | [`design/`](./05-design/design/README.md), [`ui/`](./05-design/ui/README.md), [`i18n/`](./05-design/i18n/README.md) | дизайн-система, патерни |",
  );
  lines.push(
    "| **Робота** | [`initiatives/`](./initiatives/README.md), [`planning/`](./planning/README.md), [`audits/`](./audits/README.md), [`tech-debt/`](./tech-debt/README.md) | трекери: що оновлювати, коли шипиш |",
  );
  lines.push("");

  // ── Quick links ───────────────────────────────────────────────────────────
  lines.push("## Quick links");
  lines.push("");
  lines.push(
    "- [`open-work.md`](./open-work.md) — повний rollup усіх трекерів",
  );
  lines.push("- [`today.md`](./today.md) — денний бриф (топ-7 на сьогодні)");
  lines.push(
    "- [`governance/freshness-dashboard.html`](./governance/freshness-dashboard.html) — freshness огляд",
  );
  lines.push(
    "- [`../AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing",
  );
  lines.push("");

  return lines.join("\n") + "\n";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let existing = "";
  try {
    existing = readFileSync(OUTPUT_PATH, "utf8");
  } catch {
    // first run — no existing file
  }
  const focus = extractFocus(existing);

  const report = collectOpenWork(REPO_ROOT, TRACKERS);
  const shipped = loadShipped();
  const inflight = summariseInFlight(report);
  const priority = pickPriorityItems(report);

  // Lazy import keeps prettier out of the module graph for unit tests, which
  // run in an install-free CI job (docs-scripts-tests) — mirrors the dynamic
  // import in generate-open-work.mjs.
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(OUTPUT_PATH)) ?? {};
  const next = await prettier.format(
    render({ focus, shipped, inflight, priority }),
    { ...opts, parser: "markdown" },
  );

  if (CHECK_MODE) {
    if (existing !== next) {
      process.stderr.write(
        `docs:gen-status --check: docs/STATUS.md is stale. Run \`pnpm docs:gen-status\`.\n`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  writeFileSync(OUTPUT_PATH, next, "utf8");
  process.stdout.write(
    `wrote docs/STATUS.md — ${shipped.length} shipped, ${inflight.total} in-flight, ${priority.length} priority\n`,
  );
}

const isMain = process.argv[1] === __filename;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}
